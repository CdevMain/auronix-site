// Recebe e processa os webhooks da Cakto.
// Formato: { secret, event, data: { id, refId, customer: { name, email, phone }, offer: { id, name, price },
//            product: { id, short_id, name }, status, amount, paymentMethod, ... } }
// Docs: https://docs.cakto.com.br  (Webhooks > Eventos disponíveis)

const crypto = require('node:crypto');
const config = require('./config');
const db = require('./db');
const mail = require('./mail');

const ACTIVATE = new Set(['purchase_approved', 'subscription_renewed']);
const STATUS_BY_EVENT = {
  refund: 'reembolsado',
  chargeback: 'chargeback',
  subscription_canceled: 'cancelado',
};
// Eventos que só registramos (não mudam acesso)
const LOG_ONLY = new Set(['purchase_refused', 'pix_gerado', 'boleto_gerado', 'picpay_gerado', 'checkout_abandonment']);

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function newToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function resolvePlan(data) {
  const offerId = data?.offer?.id != null ? String(data.offer.id) : '';
  const productIds = [data?.product?.id, data?.product?.short_id].filter(Boolean).map(String);
  for (const plan of config.plans) {
    if (offerId && (plan.caktoOfferIds || []).map(String).includes(offerId)) return plan;
  }
  for (const plan of config.plans) {
    if (productIds.some((p) => (plan.caktoProductIds || []).map(String).includes(p))) return plan;
  }
  // Último recurso: nome da oferta igual ao nome do plano
  const offerName = String(data?.offer?.name || '').toLowerCase();
  return config.plans.find((p) => offerName && offerName.includes(p.name.toLowerCase())) || null;
}

const upsertActive = db.prepare(`
INSERT INTO customers (email, name, phone, plan_id, plan_name, status, last_order_id, last_offer_id,
                       last_product_id, amount, payment_method, onboarding_token)
VALUES (@email, @name, @phone, @plan_id, @plan_name, 'ativo', @order_id, @offer_id, @product_id, @amount,
        @payment_method, @token)
ON CONFLICT(email) DO UPDATE SET
  name = COALESCE(excluded.name, customers.name),
  phone = COALESCE(excluded.phone, customers.phone),
  plan_id = COALESCE(excluded.plan_id, customers.plan_id),
  plan_name = COALESCE(excluded.plan_name, customers.plan_name),
  status = 'ativo',
  last_order_id = excluded.last_order_id,
  last_offer_id = excluded.last_offer_id,
  last_product_id = excluded.last_product_id,
  amount = excluded.amount,
  payment_method = excluded.payment_method,
  onboarding_token = COALESCE(customers.onboarding_token, excluded.onboarding_token),
  updated_at = datetime('now')
`);

const setStatus = db.prepare(`UPDATE customers SET status = ?, updated_at = datetime('now') WHERE email = ?`);
const byEmail = db.prepare(`SELECT * FROM customers WHERE email = ?`);
const markSent = db.prepare(`UPDATE customers SET onboarding_sent_at = datetime('now') WHERE id = ?`);
const insertEvent = db.prepare(`
INSERT OR IGNORE INTO webhook_events (dedupe_key, event, order_id, email, payload)
VALUES (?, ?, ?, ?, ?)`);
const setEventResult = db.prepare(`UPDATE webhook_events SET result = ? WHERE id = ?`);

function handleWebhook(body) {
  if (!body || typeof body !== 'object') return { status: 400, result: 'corpo inválido' };

  if (!config.webhookSecret || config.webhookSecret === 'troque-esta-chave' || !safeEqual(body.secret || '', config.webhookSecret)) {
    return { status: 401, result: 'chave secreta inválida' };
  }

  const event = String(body.event || '');
  const data = body.data || {};
  const orderId = data.id != null ? String(data.id) : null;
  const email = String(data?.customer?.email || '').trim().toLowerCase() || null;

  // Nunca guardar o secret no banco
  const { secret, ...safeBody } = body;
  const dedupeKey = `${event}:${orderId || crypto.createHash('sha1').update(JSON.stringify(data)).digest('hex')}`;
  const ins = insertEvent.run(dedupeKey, event, orderId, email, JSON.stringify(safeBody));
  if (ins.changes === 0) return { status: 200, result: 'evento repetido, ignorado' };
  const eventRowId = ins.lastInsertRowid;

  let result;
  if (!email && !LOG_ONLY.has(event)) {
    result = 'sem e-mail do cliente';
  } else if (ACTIVATE.has(event)) {
    const plan = resolvePlan(data);
    upsertActive.run({
      email,
      name: data?.customer?.name || null,
      phone: data?.customer?.phone || null,
      plan_id: plan?.id || null,
      plan_name: plan?.name || data?.offer?.name || data?.product?.name || null,
      order_id: orderId,
      offer_id: data?.offer?.id != null ? String(data.offer.id) : null,
      product_id: data?.product?.id != null ? String(data.product.id) : null,
      amount: typeof data.amount === 'number' ? data.amount : Number(data.amount) || null,
      payment_method: data.paymentMethod || null,
      token: newToken(),
    });
    const customer = byEmail.get(email);
    if (event === 'purchase_approved' && !customer.onboarding_sent_at) {
      // Responde a Cakto na hora; o e-mail sai em segundo plano.
      setImmediate(() => sendOnboardingEmail(customer).catch((e) => console.error('[email]', e.message)));
      mail.notifyAdmin(
        `Nova venda: ${customer.plan_name || 'plano não identificado'}`,
        `${customer.name || ''} <${customer.email}>\nPlano: ${customer.plan_name || '-'}\nValor: ${customer.amount ?? '-'}\nPedido: ${orderId}\n\n${config.publicUrl}/admin/clientes/${customer.id}`
      );
    }
    result = plan ? `ativado (${plan.name})` : 'ativado (plano não identificado)';
  } else if (STATUS_BY_EVENT[event]) {
    const r = setStatus.run(STATUS_BY_EVENT[event], email);
    result = r.changes ? `status: ${STATUS_BY_EVENT[event]}` : 'cliente não encontrado';
    if (r.changes) mail.notifyAdmin(`Cliente ${STATUS_BY_EVENT[event]}: ${email}`, `Evento ${event} do pedido ${orderId}.`);
  } else if (LOG_ONLY.has(event)) {
    result = 'registrado';
  } else {
    result = 'evento desconhecido, registrado';
  }

  setEventResult.run(result, eventRowId);
  return { status: 200, result };
}

async function sendOnboardingEmail(customer) {
  const link = `${config.publicUrl}/onboarding/${customer.onboarding_token}`;
  const sent = await mail.sendOnboarding(customer, link);
  if (sent) markSent.run(customer.id);
  return sent;
}

module.exports = { handleWebhook, sendOnboardingEmail, safeEqual };
