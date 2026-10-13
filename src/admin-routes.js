// Rotas do painel. Ficam num endereço secreto (config.adminPath) e exigem login.
const express = require('express');
const config = require('./config');
const db = require('./db');
const mail = require('./mail');
const auth = require('./auth');
const { totals, customerFinance } = require('./finance');
const { sendOnboardingEmail, newToken } = require('./cakto');
const { errorPage } = require('./html');
const V = require('./admin-views');
const C = require('./contract');
const { company, saveCompany, COMPANY_FIELDS } = require('./company');

const router = express.Router();
const form = express.urlencoded({ extended: true, limit: '200kb' });
const A = config.adminPath;
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

router.use((req, res, next) => {
  res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
  next();
});

// ---------- login ----------
router.get('/entrar', async (req, res) => {
  if (await auth.currentSession(req)) return res.redirect(303, A);
  res.type('html').send(V.renderLogin({ mode: auth.mode(), notConfigured: !auth.authConfigured(), locked: auth.tooManyAttempts(req.ip) }));
});

router.post('/entrar', form, async (req, res) => {
  if (!auth.sameOrigin(req)) return res.status(403).type('html').send(errorPage(403));
  if (auth.tooManyAttempts(req.ip)) {
    return res.status(429).type('html').send(V.renderLogin({ mode: auth.mode(), locked: true, error: 'Muitas tentativas erradas. Espere 15 minutos e tente de novo.' }));
  }
  const r = await auth.checkLogin(req.body.usuario, req.body.senha);
  if (!r.ok) {
    if (!r.error) auth.recordFail(req.ip);
    const msg = r.error || (auth.mode() === 'supabase' ? 'E-mail ou senha incorretos, ou este e-mail não tem acesso ao painel.' : 'Usuário ou senha incorretos.');
    return res.status(r.error ? 503 : 401).type('html').send(V.renderLogin({ mode: auth.mode(), error: msg, notConfigured: !auth.authConfigured() }));
  }
  await auth.createSession(req, res, r.user);
  res.redirect(303, `${A}?ok=login`);
});

router.post('/sair', async (req, res) => {
  await auth.destroySession(req, res);
  res.redirect(303, `${A}/entrar`);
});

// Tudo abaixo exige login
router.use(async (req, res, next) => {
  const s = await auth.currentSession(req);
  if (!s) return res.redirect(303, `${A}/entrar`);
  if (req.method === 'POST' && !auth.sameOrigin(req)) return res.status(403).type('html').send(errorPage(403));
  req.adminUser = s.user;
  next();
});

// ---------- consultas ----------
const getCustomer = (id) => db.one(`SELECT * FROM customers WHERE id = ?`, [Number(id) || 0]);
const customerByEmail = (email) => db.one(`SELECT * FROM customers WHERE email = ?`, [email]);
const unread = async () => (await db.one(`SELECT COUNT(*)::int AS n FROM contact_messages WHERE read_at IS NULL`)).n;
const flashOf = (req) => V.flashBox(String(req.query.ok || ''));

async function deleteCustomer(c) {
  await db.tx(async (t) => {
    await t.run(`DELETE FROM webhook_events WHERE email = ?`, [c.email]);
    await t.run(`DELETE FROM emails WHERE customer_id = ? OR to_email = ?`, [c.id, c.email]);
    await t.run(`DELETE FROM customers WHERE id = ?`, [c.id]); // onboarding, contratos e histórico saem em cascata
  });
}

// ---------- visão geral ----------
router.get('/', async (req, res) => {
  const customers = await db.query(`SELECT * FROM customers`);
  const t = totals(customers);
  const real = customers.filter((c) => !c.is_test);
  const withOnb = new Set((await db.query(`SELECT customer_id FROM onboardings`)).map((r) => r.customer_id));
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const naoLidas = await unread();
  const counts = {
    total: real.length,
    pendentes: real.filter((c) => c.status === 'ativo' && !withOnb.has(c.id)).length,
    novosMes: real.filter((c) => new Date(c.created_at) >= monthStart).length,
    naoLidas,
  };

  const attention = [];
  for (const c of real) {
    const who = c.name || c.email;
    if (c.status === 'atrasado') attention.push({ href: `/clientes/${c.id}`, title: who, text: 'Pagamento atrasado' });
    if (c.status === 'ativo' && !withOnb.has(c.id) && Date.now() - new Date(c.created_at).getTime() > 2 * 86400000)
      attention.push({ href: `/clientes/${c.id}`, title: who, text: 'Pagou há mais de 2 dias e não preencheu o onboarding' });
    if (c.stage === 'onboarding_recebido') attention.push({ href: `/clientes/${c.id}`, title: who, text: 'Onboarding recebido: começar a configurar o agente' });
    if (c.payment_confirmed !== 1 && ['ativo', 'pendente'].includes(c.status)) attention.push({ href: `/clientes/${c.id}`, title: who, text: 'Pagamento sem confirmação' });
  }
  const pendingContracts = (await db.one(
    `SELECT COUNT(*)::int AS n FROM contracts k JOIN customers c ON c.id = k.customer_id WHERE k.status IN ('enviado', 'visualizado') AND c.is_test = 0 AND k.sent_at < now() - interval '3 days'`
  )).n;
  if (pendingContracts) attention.push({ href: '/contratos', title: `${pendingContracts} ${pendingContracts === 1 ? 'contrato sem aceite' : 'contratos sem aceite'}`, text: 'Enviados há mais de 3 dias' });
  const failed = (await db.one(`SELECT COUNT(*)::int AS n FROM emails WHERE status = 'falhou' AND created_at > now() - interval '7 days'`)).n;
  if (failed) attention.push({ href: '/emails', title: `${failed} ${failed === 1 ? 'e-mail falhou' : 'e-mails falharam'}`, text: 'Nos últimos 7 dias. Veja o motivo.' });
  if (naoLidas) attention.push({ href: '/mensagens', title: `${naoLidas} ${naoLidas === 1 ? 'mensagem nova' : 'mensagens novas'}`, text: 'Do formulário de contato' });

  const recent = await db.query(`SELECT * FROM customers ORDER BY created_at DESC, id DESC LIMIT 6`);
  res.type('html').send(V.renderDashboard({ t, counts, attention: attention.slice(0, 12), recent, unread: naoLidas, flash: flashOf(req) }));
});

// ---------- clientes ----------
function listCustomers(query) {
  const where = [];
  const args = [];
  const term = String(query.q || '').trim();
  if (term) {
    where.push(`(c.name ILIKE ? OR c.email ILIKE ? OR c.phone ILIKE ? OR c.last_order_id ILIKE ?)`);
    const like = `%${term.replace(/[%_\\]/g, '\\$&')}%`;
    args.push(like, like, like, like);
  }
  if (query.status) { where.push('c.status = ?'); args.push(String(query.status)); }
  if (query.plano) { where.push('c.plan_id = ?'); args.push(String(query.plano)); }
  if (query.etapa) { where.push('c.stage = ?'); args.push(String(query.etapa)); }
  if (query.pagamento === 'confirmado') where.push('c.payment_confirmed = 1');
  if (query.pagamento === 'nao') where.push('c.payment_confirmed = 0');
  if (query.pagamento === 'sem') where.push('c.payment_confirmed IS NULL');
  if (!query.testes) where.push('c.is_test = 0');
  return db.query(`SELECT c.* FROM customers c ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.created_at DESC, c.id DESC LIMIT 1000`, args);
}

router.get('/clientes', async (req, res) => {
  const filters = { status: req.query.status || '', plano: req.query.plano || '', etapa: req.query.etapa || '', pagamento: req.query.pagamento || '', testes: req.query.testes ? '1' : '' };
  const testCount = (await db.one(`SELECT COUNT(*)::int AS n FROM customers WHERE is_test = 1`)).n;
  res.type('html').send(
    V.renderCustomers({ customers: await listCustomers(req.query), q: req.query.q || '', filters, testCount, unread: await unread(), flash: flashOf(req) })
  );
});

router.get('/clientes.csv', async (req, res) => {
  const rows = await listCustomers({ ...req.query, testes: '1' });
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['id', 'nome', 'email', 'telefone', 'plano', 'status', 'pagamento', 'etapa', 'receita_mes', 'custo_mes', 'lucro_mes', 'teste', 'criado_em'];
  const lines = rows.map((c) => {
    const f = customerFinance(c);
    const created = new Date(c.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    return [c.id, c.name, c.email, c.phone, c.plan_name, c.status, V.PAYMENT[c.payment_confirmed] || 'Sem confirmação', V.STAGES[c.stage] || c.stage,
      f.revenue.toFixed(2).replace('.', ','), f.cost.toFixed(2).replace('.', ','), f.profit.toFixed(2).replace('.', ','), c.is_test ? 'sim' : 'não', created].map(cell).join(';');
  });
  res.set('Content-Disposition', `attachment; filename="clientes-auronix-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.type('text/csv; charset=utf-8').send('﻿' + [header.join(';'), ...lines].join('\r\n'));
});

function readCustomerForm(body) {
  const plan = config.plans.find((p) => p.id === body.plano) || null;
  const cost = String(body.custo || '').trim();
  return {
    name: String(body.nome || '').trim().slice(0, 200) || null,
    email: String(body.email || '').trim().toLowerCase().slice(0, 200),
    phone: String(body.telefone || '').trim().slice(0, 40) || null,
    plan_id: plan?.id || null,
    plan_name: plan?.name || null,
    status: V.STATUS[body.status] ? body.status : 'ativo',
    stage: V.STAGES[body.etapa] ? body.etapa : 'aguardando_onboarding',
    payment_confirmed: body.pagamento === '1' ? 1 : body.pagamento === '0' ? 0 : null,
    cost_override: cost === '' ? null : config.toNumber(cost),
    is_test: body.teste === '1' ? 1 : 0,
  };
}

router.get('/clientes/novo', async (req, res) => res.type('html').send(V.renderNewCustomer({ unread: await unread() })));

router.post('/clientes/novo', form, async (req, res) => {
  const d = readCustomerForm(req.body);
  const errors = [];
  if (!validEmail(d.email)) errors.push('Informe um e-mail válido.');
  else if (await customerByEmail(d.email)) errors.push('Já existe um cliente com esse e-mail.');
  if (errors.length) {
    return res.status(422).type('html').send(V.renderNewCustomer({ errors, values: d, unread: await unread() }));
  }
  const created = await db.one(
    `INSERT INTO customers (email, name, phone, plan_id, plan_name, status, stage, payment_confirmed, cost_override, is_test, source, onboarding_token, amount)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?) RETURNING *`,
    [d.email, d.name, d.phone, d.plan_id, d.plan_name, d.status, d.stage, d.payment_confirmed, d.cost_override, d.is_test, newToken(),
      config.plans.find((p) => p.id === d.plan_id)?.priceNumber ?? null]
  );
  await db.log(created.id, 'status', `Cliente cadastrado à mão no painel por ${req.adminUser}`);
  let ok = 'criado';
  if (req.body.enviar === '1') {
    const s = await sendOnboardingEmail(created);
    if (!s.ok) ok = s.skipped ? 'semenvio' : 'falhou';
  }
  res.redirect(303, `${A}/clientes/${created.id}?ok=${ok}`);
});

router.post('/clientes/acoes', form, async (req, res) => {
  const ids = [].concat(req.body.ids || []).map(Number).filter(Boolean);
  if (ids.length) {
    if (req.body.acao === 'apagar') {
      for (const id of ids) {
        const c = await getCustomer(id);
        if (c) await deleteCustomer(c);
      }
      return res.redirect(303, `${A}/clientes?ok=apagados`);
    }
    if (req.body.acao === 'teste') {
      await db.run(`UPDATE customers SET is_test = 1 WHERE id = ANY(?::bigint[])`, [ids]);
      await db.run(`UPDATE webhook_events SET is_test = 1 WHERE email IN (SELECT email FROM customers WHERE id = ANY(?::bigint[]))`, [ids]);
      return res.redirect(303, `${A}/clientes?ok=marcados&testes=1`);
    }
  }
  res.redirect(303, `${A}/clientes`);
});

router.get('/clientes/:id', async (req, res) => {
  const c = await getCustomer(req.params.id);
  if (!c) return res.status(404).type('html').send(errorPage(404, { message: 'Esse cliente não existe ou foi apagado.', action: { href: `${A}/clientes`, label: 'Ver clientes' } }));
  const [onboarding, events, emails, activity, contracts, naoLidas] = await Promise.all([
    db.one(`SELECT * FROM onboardings WHERE customer_id = ?`, [c.id]),
    db.query(`SELECT * FROM webhook_events WHERE email = ? ORDER BY id DESC LIMIT 100`, [c.email]),
    db.query(`SELECT * FROM emails WHERE customer_id = ? ORDER BY id DESC LIMIT 50`, [c.id]),
    db.query(`SELECT * FROM activity WHERE customer_id = ? ORDER BY id DESC LIMIT 200`, [c.id]),
    C.allFor(c.id),
    unread(),
  ]);
  res.type('html').send(V.renderCustomer({ c, onboarding, events, emails, activity, contracts, unread: naoLidas, flash: flashOf(req) }));
});

router.post('/clientes/:id/editar', form, async (req, res) => {
  const c = await getCustomer(req.params.id);
  if (!c) return res.status(404).type('html').send(errorPage(404));
  const d = readCustomerForm(req.body);
  if (!validEmail(d.email)) return res.redirect(303, `${A}/clientes/${c.id}`);
  const other = await customerByEmail(d.email);
  if (other && other.id !== c.id) return res.status(409).type('html').send(errorPage(400, { message: 'Já existe outro cliente com esse e-mail.', action: { href: `${A}/clientes/${c.id}`, label: 'Voltar ao cliente' } }));

  const changes = [];
  if (d.status !== c.status) changes.push(`status: ${V.STATUS[c.status] || c.status} → ${V.STATUS[d.status]}`);
  if (d.stage !== c.stage) changes.push(`etapa: ${V.STAGES[c.stage] || c.stage} → ${V.STAGES[d.stage]}`);
  if (d.plan_id !== c.plan_id) changes.push(`plano: ${c.plan_name || '-'} → ${d.plan_name || '-'}`);
  if (d.payment_confirmed !== c.payment_confirmed) changes.push(`pagamento: ${V.PAYMENT[d.payment_confirmed] || 'sem confirmação'}`);
  if (d.cost_override !== c.cost_override) changes.push(`custo: ${d.cost_override == null ? 'do plano' : d.cost_override}`);
  if (d.is_test !== c.is_test) changes.push(d.is_test ? 'marcado como teste' : 'desmarcado como teste');
  if (d.email !== c.email) changes.push(`e-mail: ${c.email} → ${d.email}`);

  await db.tx(async (t) => {
    await t.run(
      `UPDATE customers SET name = ?, email = ?, phone = ?, plan_id = ?, plan_name = COALESCE(?, plan_name), status = ?, stage = ?,
       payment_confirmed = ?, cost_override = ?, is_test = ?, updated_at = now() WHERE id = ?`,
      [d.name, d.email, d.phone, d.plan_id, d.plan_name, d.status, d.stage, d.payment_confirmed, d.cost_override, d.is_test, c.id]
    );
    if (d.email !== c.email) await t.run(`UPDATE webhook_events SET email = ? WHERE email = ?`, [d.email, c.email]);
  });
  if (changes.length) await db.log(c.id, 'status', `Editado no painel: ${changes.join('; ')}`);
  res.redirect(303, `${A}/clientes/${c.id}?ok=salvo`);
});

router.post('/clientes/:id/pagamento', form, async (req, res) => {
  const c = await getCustomer(req.params.id);
  if (!c) return res.status(404).type('html').send(errorPage(404));
  const v = req.body.valor === '1' ? 1 : 0;
  await db.run(`UPDATE customers SET payment_confirmed = ?, status = CASE WHEN ?::int = 1 AND status = 'pendente' THEN 'ativo' ELSE status END, updated_at = now() WHERE id = ?`, [v, v, c.id]);
  await db.log(c.id, 'status', v ? 'Pagamento marcado como confirmado' : 'Pagamento marcado como não confirmado');
  res.redirect(303, `${A}/clientes/${c.id}?ok=salvo`);
});

router.post('/clientes/:id/nota', form, async (req, res) => {
  const c = await getCustomer(req.params.id);
  if (!c) return res.status(404).type('html').send(errorPage(404));
  const text = String(req.body.texto || '').trim();
  if (text) await db.log(c.id, 'nota', text);
  res.redirect(303, `${A}/clientes/${c.id}?ok=nota`);
});

router.post('/clientes/:id/reenviar', async (req, res) => {
  let c = await getCustomer(req.params.id);
  if (!c) return res.status(404).type('html').send(errorPage(404));
  if (!c.onboarding_token) c = await db.one(`UPDATE customers SET onboarding_token = ? WHERE id = ? RETURNING *`, [newToken(), c.id]);
  const r = await sendOnboardingEmail(c);
  res.redirect(303, `${A}/clientes/${c.id}?ok=${r.ok ? 'enviado' : r.skipped ? 'semenvio' : 'falhou'}`);
});

router.post('/clientes/:id/apagar', async (req, res) => {
  const c = await getCustomer(req.params.id);
  if (c) await deleteCustomer(c);
  res.redirect(303, `${A}/clientes?ok=apagado`);
});

// Apaga tudo marcado como teste: clientes, eventos e e-mails
router.post('/testes/apagar', async (req, res) => {
  for (const c of await db.query(`SELECT * FROM customers WHERE is_test = 1`)) await deleteCustomer(c);
  await db.run(`DELETE FROM webhook_events WHERE is_test = 1`);
  await db.run(`DELETE FROM emails WHERE kind = 'teste'`);
  const back = String(req.get('referer') || '').includes('/pedidos') ? '/pedidos' : '/clientes';
  res.redirect(303, `${A}${back}?ok=testes`);
});

// ---------- contratos ----------
async function sendAndRedirect(res, contract, customer) {
  const r = await C.send(contract, customer);
  const ok = r.ok ? 'contrato' : r.skipped ? 'contratocriado' : 'contratofalhou';
  res.redirect(303, `${A}/clientes/${customer.id}?ok=${ok}`);
}

router.post('/clientes/:id/contrato', async (req, res) => {
  const c = await getCustomer(req.params.id);
  if (!c) return res.status(404).type('html').send(errorPage(404));
  if (!company().complete) return res.redirect(303, `${A}/configuracoes?ok=semempresa#empresa`);
  if (await C.latestFor(c.id)) return res.redirect(303, `${A}/clientes/${c.id}`);
  await sendAndRedirect(res, await C.createFor(c), c);
});

router.post('/contratos/:id/enviar', async (req, res) => {
  const k = await C.byId(Number(req.params.id) || 0);
  const c = k && (await getCustomer(k.customer_id));
  if (!k || !c) return res.status(404).type('html').send(errorPage(404));
  await sendAndRedirect(res, k, c);
});

router.post('/contratos/:id/cancelar', async (req, res) => {
  const k = await C.byId(Number(req.params.id) || 0);
  if (!k) return res.status(404).type('html').send(errorPage(404));
  if (k.status !== 'cancelado') await C.cancel(k);
  res.redirect(303, `${A}/clientes/${k.customer_id}?ok=contratocancelado`);
});

router.get('/contratos', async (req, res) => {
  const contracts = await db.query(
    `SELECT k.*, c.name AS c_name, c.email AS c_email, c.plan_name AS c_plan, c.is_test FROM contracts k JOIN customers c ON c.id = k.customer_id ORDER BY k.id DESC LIMIT 500`
  );
  res.type('html').send(V.renderContracts({ contracts, unread: await unread(), flash: flashOf(req), auto: db.setting('contract.auto') === '1' }));
});

// ---------- pedidos ----------
router.get('/pedidos', async (req, res) => {
  const where = [];
  const args = [];
  const term = String(req.query.q || '').trim();
  if (term) {
    const like = `%${term.replace(/[%_\\]/g, '\\$&')}%`;
    where.push('(e.email ILIKE ? OR e.order_id ILIKE ? OR e.payload LIKE ?)');
    args.push(like, like, `%"refId":"${term.replace(/["%_\\]/g, '')}"%`);
  }
  if (req.query.tipo) { where.push('e.event = ?'); args.push(String(req.query.tipo)); }
  if (!req.query.testes) where.push('e.is_test = 0');
  const events = await db.query(
    `SELECT e.*, c.id AS customer_id FROM webhook_events e LEFT JOIN customers c ON c.email = e.email
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY e.id DESC LIMIT 300`,
    args
  );

  let check = null;
  const vterm = String(req.query.verificar || '').trim();
  if (vterm) {
    const lower = vterm.toLowerCase();
    const found = await db.query(`SELECT * FROM webhook_events WHERE email = ? OR order_id = ? OR payload LIKE ? ORDER BY id DESC`, [
      lower, vterm, `%"refId":"${vterm.replace(/["%_\\]/g, '')}"%`,
    ]);
    check = {
      term: vterm,
      found: found.length > 0,
      purchases: found.filter((e) => e.event === 'purchase_approved' || e.event === 'subscription_renewed').length,
      customer: (await customerByEmail(lower)) || (found[0]?.email ? await customerByEmail(found[0].email) : null),
    };
  }
  const testEvents = (await db.one(`SELECT COUNT(*)::int AS n FROM webhook_events WHERE is_test = 1`)).n;
  res.type('html').send(
    V.renderOrders({ events, q: term, tipo: req.query.tipo || '', testes: !!req.query.testes, check, unread: await unread(), flash: flashOf(req), testEvents })
  );
});

router.get('/pedidos/:id', async (req, res) => {
  const e = await db.one(`SELECT * FROM webhook_events WHERE id = ?`, [Number(req.params.id) || 0]);
  if (!e) return res.status(404).type('html').send(errorPage(404, { action: { href: `${A}/pedidos`, label: 'Ver pedidos' } }));
  res.type('html').send(V.renderOrder({ e, unread: await unread() }));
});

// ---------- mensagens ----------
router.get('/mensagens', async (req, res) => {
  const messages = await db.query(`SELECT * FROM contact_messages ORDER BY id DESC LIMIT 300`);
  res.type('html').send(V.renderMessages({ messages, unread: await unread(), flash: flashOf(req) }));
});
router.post('/mensagens/:id/lida', async (req, res) => {
  await db.run(`UPDATE contact_messages SET read_at = now() WHERE id = ?`, [Number(req.params.id) || 0]);
  res.redirect(303, `${A}/mensagens?ok=lida`);
});
router.post('/mensagens/:id/apagar', async (req, res) => {
  await db.run(`DELETE FROM contact_messages WHERE id = ?`, [Number(req.params.id) || 0]);
  res.redirect(303, `${A}/mensagens?ok=apagados`);
});

// ---------- e-mails ----------
async function emailsPage(req, res, lastTest = null) {
  const emails = await db.query(`SELECT * FROM emails ORDER BY id DESC LIMIT 200`);
  res.type('html').send(V.renderEmails({ emails, provider: mail.provider, unread: await unread(), flash: flashOf(req), lastTest }));
}
router.get('/emails', (req, res) => emailsPage(req, res));
router.post('/emails/teste', form, async (req, res) => {
  const to = String(req.body.para || '').trim();
  if (!validEmail(to)) return emailsPage(req, res, { ok: false, to, error: 'Informe um e-mail válido.' });
  const r = await mail.sendTest(to, String(req.body.nota || '').trim().slice(0, 1000));
  await emailsPage(req, res, { ok: r.ok, to, error: r.error });
});

// ---------- configurações ----------
router.get('/configuracoes', async (req, res) => {
  const sessions = (await db.one(`SELECT COUNT(*)::int AS n FROM sessions WHERE expires_at > now()`)).n;
  res.type('html').send(
    V.renderSettings({ unread: await unread(), flash: flashOf(req), sessions, company: company(), companyFields: COMPANY_FIELDS, auto: db.setting('contract.auto') === '1', adminUser: req.adminUser, authMode: auth.mode() })
  );
});
router.post('/configuracoes/custos', form, async (req, res) => {
  for (const p of config.plans) {
    const raw = String(req.body[`custo_${p.id}`] ?? '').trim();
    if (raw !== '') await db.setSetting(`cost.${p.id}`, config.toNumber(raw));
  }
  res.redirect(303, `${A}/configuracoes?ok=custos`);
});
router.post('/configuracoes/empresa', form, async (req, res) => {
  await saveCompany(req.body);
  res.redirect(303, `${A}/configuracoes?ok=empresa#empresa`);
});
router.post('/configuracoes/contrato', form, async (req, res) => {
  await db.setSetting('contract.auto', req.body.auto === '1' ? '1' : '0');
  res.redirect(303, `${A}/configuracoes?ok=config#contrato`);
});
router.post('/configuracoes/sessoes', async (req, res) => {
  await auth.logoutEverywhere();
  await auth.createSession(req, res, req.adminUser); // mantém este aparelho conectado
  res.redirect(303, `${A}/configuracoes?ok=sessoes`);
});

module.exports = router;
