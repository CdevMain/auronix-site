// Recebe e processa os webhooks da Cakto.
// Formato real: { secret, event, data: [ { id, refId, customer: {...}, offer: {...}, product: {...}, offer_type,
//                 status, amount, fees, paymentMethod, ... }, ...order bumps ] }
// Docs: https://docs.cakto.com.br  (Webhooks > Eventos disponíveis)

const crypto = require('node:crypto');
const config = require('./config');
const db = require('./db');
const mail = require('./mail');

const ACTIVATE = new Set(['purchase_approved', 'subscription_renewed']);
// Eventos que mudam o status do cliente (e bloqueiam o onboarding, exceto "atrasado")
const STATUS_BY_EVENT = {
  refund: 'reembolsado',
  chargeback: 'chargeback',
  subscription_canceled: 'cancelado',
  subscription_paused: 'pausado',
  subscription_late: 'atrasado',
};
// Eventos que devolvem o acesso, mas só a quem estava pausado ou atrasado (nunca depois de reembolso)
const RESUME = new Set(['subscription_resumed', 'subscription_late_recovered']);
// Eventos que só registramos e avisamos você por e-mail
const NOTIFY_ONLY = new Set(['subscription_renewal_refused', 'refund_requested']);
// Eventos que só registramos
const LOG_ONLY = new Set([
  'purchase_refused', 'pix_gerado', 'boleto_gerado', 'picpay_gerado', 'openfinance_nubank_gerado',
  'checkout_abandonment', 'subscription_created',
]);

const EVENT_LABEL = {
  purchase_approved: 'Compra aprovada',
  purchase_refused: 'Compra recusada',
  subscription_renewed: 'Assinatura renovada',
  subscription_created: 'Assinatura criada',
  subscription_canceled: 'Assinatura cancelada',
  subscription_paused: 'Assinatura pausada',
  subscription_resumed: 'Assinatura retomada',
  subscription_late: 'Pagamento atrasado',
  subscription_late_recovered: 'Atraso regularizado',
  subscription_renewal_refused: 'Renovação recusada',
  refund: 'Reembolso',
  refund_requested: 'Reembolso solicitado',
  chargeback: 'Chargeback',
  pix_gerado: 'Pix gerado',
  boleto_gerado: 'Boleto gerado',
  picpay_gerado: 'PicPay gerado',
  openfinance_nubank_gerado: 'Open Finance gerado',
  checkout_abandonment: 'Checkout abandonado',
};

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const newToken = () => crypto.randomBytes(24).toString('base64url');

function resolvePlan(data) {
  const offerId = data?.offer?.id != null ? String(data.offer.id) : '';
  const productIds = [data?.product?.id, data?.product?.short_id].filter(Boolean).map(String);
  for (const plan of config.plans) {
    if (offerId && (plan.caktoOfferIds || []).map(String).includes(offerId)) return plan;
  }
  for (const plan of config.plans) {
    if (productIds.some((p) => (plan.caktoProductIds || []).map(String).includes(p))) return plan;
  }
  // Último recurso: o nome da oferta (ou do produto) contém o nome do plano ("Auronix Pro", "Plano Start"...)
  const matches = (text, p) =>
    [p.name, p.shortName].filter(Boolean).some((n) =>
      new RegExp(`(^|[^a-z0-9])${n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`).test(text)
    );
  for (const text of [data?.offer?.name, data?.product?.name]) {
    const t = String(text || '').toLowerCase();
    const plan = t && config.plans.find((p) => matches(t, p));
    if (plan) return plan;
  }
  return null;
}

// A Cakto manda `data` como lista: o pedido principal e, se houver, os order bumps.
// Usamos o item de um plano Auronix; senão o principal ("main"); senão o primeiro.
function pickItem(raw) {
  const items = (Array.isArray(raw) ? raw : [raw]).filter((x) => x && typeof x === 'object');
  if (!items.length) return {};
  return items.find((x) => resolvePlan(x)) || items.find((x) => x.offer_type === 'main') || items[0];
}

// Vendas de teste: botão "testar" da Cakto, simulador e e-mails de exemplo
const TEST_DOMAINS = /@(example\.(com|org|net)|teste?\.(com|local)|test)$/i;
function isTestPayload(data, email) {
  if (email && TEST_DOMAINS.test(email)) return true;
  const names = [data?.product?.name, data?.offer?.name].map((s) => String(s || '').toLowerCase());
  if (names.some((n) => n === 'produto teste' || n === 'special offer')) return true;
  if (data?.refId === 'teste01' || data?.product?.short_id === 'teste') return true;
  return false;
}

const SENSITIVE = new Set(['docNumber', 'docType', 'birthDate', 'card', 'address', 'shipping', 'pix', 'boleto', 'fbc', 'fbp']);
function sanitize(v) {
  if (Array.isArray(v)) return v.map(sanitize);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).filter(([k]) => !SENSITIVE.has(k)).map(([k, x]) => [k, sanitize(x)]));
  }
  return v;
}

const UPSERT_ACTIVE = `
INSERT INTO customers (email, name, phone, plan_id, plan_name, status, last_order_id, last_offer_id,
                       last_product_id, amount, fees, payment_method, onboarding_token, is_test, source, payment_confirmed)
VALUES (?, ?, ?, ?, ?, 'ativo', ?, ?, ?, ?, ?, ?, ?, ?, 'cakto', 1)
ON CONFLICT (email) DO UPDATE SET
  name = COALESCE(excluded.name, customers.name),
  phone = COALESCE(excluded.phone, customers.phone),
  plan_id = COALESCE(excluded.plan_id, customers.plan_id),
  plan_name = COALESCE(excluded.plan_name, customers.plan_name),
  status = 'ativo',
  last_order_id = excluded.last_order_id,
  last_offer_id = excluded.last_offer_id,
  last_product_id = excluded.last_product_id,
  amount = excluded.amount,
  fees = COALESCE(excluded.fees, customers.fees),
  payment_method = excluded.payment_method,
  onboarding_token = COALESCE(customers.onboarding_token, excluded.onboarding_token),
  is_test = excluded.is_test,
  payment_confirmed = 1,
  updated_at = now()
RETURNING *`;

const byEmail = (email) => db.one(`SELECT * FROM customers WHERE email = ?`, [email]);
const num = (v) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

async function handleWebhook(body) {
  if (!body || typeof body !== 'object') return { status: 400, result: 'corpo inválido' };

  if (!config.webhookSecret || config.webhookSecret === 'troque-esta-chave' || !safeEqual(body.secret || '', config.webhookSecret)) {
    return { status: 401, result: 'chave secreta inválida' };
  }

  const event = String(body.event || '');
  const data = pickItem(body.data);
  const orderId = data.id != null ? String(data.id) : null;
  const email = String(data?.customer?.email || '').trim().toLowerCase() || null;
  const isTest = isTestPayload(data, email) ? 1 : 0;
  const label = EVENT_LABEL[event] || event;

  // Nunca guardar o secret, CPF, cartão ou endereço no banco
  const { secret, ...rest } = body;
  const dedupeKey = `${event}:${orderId || crypto.createHash('sha1').update(JSON.stringify(body.data || {})).digest('hex')}`;
  const ins = await db.run(
    `INSERT INTO webhook_events (dedupe_key, event, order_id, email, payload, is_test) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`,
    [dedupeKey, event, orderId, email, JSON.stringify(sanitize(rest)), isTest]
  );
  if (ins.changes === 0) return { status: 200, result: 'evento repetido, ignorado' };
  const eventRowId = ins.id;
  const existing = email ? await byEmail(email) : null;
  const ref = data.refId || orderId;

  let result;
  if (!email && !LOG_ONLY.has(event)) {
    result = 'sem e-mail do cliente';
  } else if (ACTIVATE.has(event)) {
    const plan = resolvePlan(data);
    const customer = await db.one(UPSERT_ACTIVE, [
      email,
      data?.customer?.name || null,
      data?.customer?.phone || null,
      plan?.id || null,
      plan?.name || data?.offer?.name || data?.product?.name || null,
      orderId,
      data?.offer?.id != null ? String(data.offer.id) : null,
      data?.product?.id != null ? String(data.product.id) : null,
      num(data.amount),
      num(data.fees),
      data.paymentMethodName || data.paymentMethod || null,
      newToken(),
      isTest,
    ]);
    await db.log(customer.id, 'pedido', `${label} pela Cakto: ${customer.plan_name || 'plano não identificado'}, ${data.amount ?? '-'} (pedido ${ref})`);
    if (event === 'purchase_approved' && !customer.onboarding_sent_at) {
      // Responde a Cakto na hora; os e-mails saem em segundo plano.
      setImmediate(async () => {
        try {
          await sendOnboardingEmail(customer);
          // Contrato automático (ligado em Configurações no painel)
          if (db.setting('contract.auto') === '1') {
            const contract = require('./contract');
            if (!(await contract.latestFor(customer.id))) await contract.send(await contract.createFor(customer), customer);
          }
        } catch (e) {
          console.error('[pós-venda]', e.message);
        }
      });
      if (!isTest) {
        mail.notifyAdmin(
          `Nova venda: ${customer.plan_name || 'plano não identificado'}`,
          `${customer.name || ''} <${customer.email}>\nPlano: ${customer.plan_name || '-'}\nValor: ${customer.amount ?? '-'}\nPedido: ${ref}\n\n${config.publicUrl}${config.adminPath}/clientes/${customer.id}`
        );
      }
    }
    result = plan ? `ativado (${plan.name})` : 'ativado (plano não identificado)';
  } else if (STATUS_BY_EVENT[event]) {
    const r = await db.run(`UPDATE customers SET status = ?, updated_at = now() WHERE email = ?`, [STATUS_BY_EVENT[event], email]);
    result = r.changes ? `status: ${STATUS_BY_EVENT[event]}` : 'cliente não encontrado';
    if (r.changes) {
      await db.log(existing?.id, 'status', `${label} pela Cakto. Status: ${STATUS_BY_EVENT[event]}`);
      if (!isTest) mail.notifyAdmin(`${label}: ${email}`, `Evento ${event} do pedido ${ref}.`);
    }
  } else if (RESUME.has(event)) {
    const r = await db.run(`UPDATE customers SET status = 'ativo', updated_at = now() WHERE email = ? AND status IN ('pausado', 'atrasado')`, [email]);
    result = r.changes ? 'status: ativo (retomado)' : 'nada a retomar';
    if (r.changes) {
      await db.log(existing?.id, 'status', `${label} pela Cakto. Status: ativo`);
      if (!isTest) mail.notifyAdmin(`Cliente reativado: ${email}`, `Evento ${event} do pedido ${ref}.`);
    }
  } else if (NOTIFY_ONLY.has(event)) {
    result = 'registrado e avisado';
    await db.log(existing?.id, 'aviso', `${label} (pedido ${ref})`);
    if (!isTest) mail.notifyAdmin(`${label}: ${email}`, `Evento ${event} do pedido ${ref}. Veja no painel.`);
  } else if (LOG_ONLY.has(event)) {
    result = 'registrado';
    if (existing) await db.log(existing.id, 'pedido', `${label} (pedido ${ref})`);
  } else {
    result = 'evento desconhecido, registrado';
  }

  await db.run(`UPDATE webhook_events SET result = ? WHERE id = ?`, [result, eventRowId]);
  return { status: 200, result };
}

async function sendOnboardingEmail(customer) {
  const link = `${config.publicUrl}/onboarding/${customer.onboarding_token}`;
  const r = await mail.sendOnboarding(customer, link);
  if (r.ok) await db.run(`UPDATE customers SET onboarding_sent_at = now() WHERE id = ?`, [customer.id]);
  return r;
}

module.exports = { handleWebhook, sendOnboardingEmail, safeEqual, newToken, EVENT_LABEL };
