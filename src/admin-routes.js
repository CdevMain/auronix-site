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
const AG = require('./agent');
const { FIELDS, labelOf } = require('./onboarding');

const router = express.Router();
const form = express.urlencoded({ extended: true, limit: '200kb' });
const jsonBody = express.json({ limit: '600kb' });
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

// Formulários com data-ajax pedem JSON; sem JavaScript, o navegador recebe o redirecionamento de sempre
const wantsJson = (req) => String(req.get('accept') || '').includes('application/json');
function reply(req, res, data, redirectTo) {
  if (wantsJson(req)) return res.status(data.ok === false && data.status ? data.status : 200).json(data);
  res.redirect(303, redirectTo);
}

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
    const u = AG.usage(c);
    if (u.known && (u.state === 'vai_estourar' || u.state === 'estourou'))
      attention.push({ href: `/clientes/${c.id}#agente`, title: who, text: u.state === 'estourou' ? 'Respostas do plano acabaram' : `Respostas acabam em ${u.runsOutIn} ${u.runsOutIn === 1 ? 'dia' : 'dias'} no ritmo atual` });
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
  return db.query(`SELECT c.*, (SELECT extract(epoch FROM p.updated_at)::bigint FROM customer_photos p WHERE p.customer_id = c.id) AS photo_v FROM customers c ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.created_at DESC, c.id DESC LIMIT 1000`, args);
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

const photoVersion = async (id) => (await db.one(`SELECT extract(epoch FROM updated_at)::bigint AS v FROM customer_photos WHERE customer_id = ?`, [id]))?.v || null;
const answersOf = async (id) => {
  const o = await db.one(`SELECT * FROM onboardings WHERE customer_id = ?`, [id]);
  return o ? { onboarding: o, answers: JSON.parse(o.answers) } : { onboarding: null, answers: null };
};

router.get('/clientes/:id', async (req, res) => {
  const c = await getCustomer(req.params.id);
  if (c) c.photo_v = await photoVersion(c.id);
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
  const text = String(req.body.texto || '').trim().slice(0, 2000);
  if (!text) return reply(req, res, { ok: false, message: 'Escreva a nota antes de salvar.' }, `${A}/clientes/${c.id}`);
  const row = await db.one(`INSERT INTO activity (customer_id, kind, text) VALUES (?, 'nota', ?) RETURNING *`, [c.id, text]);
  reply(req, res, { ok: true, message: 'Nota salva.', prepend: '#timeline', html: V.timelineItem(row) }, `${A}/clientes/${c.id}?ok=nota`);
});


// ---------- foto do cliente ----------
const IMG_SIG = [
  ['image/jpeg', (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ['image/png', (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ['image/webp', (b) => b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP'],
];

router.get('/clientes/:id/foto', async (req, res) => {
  const row = await db.one(`SELECT mime, data FROM customer_photos WHERE customer_id = ?`, [Number(req.params.id) || 0]);
  if (!row) return res.status(404).end();
  // Painel é privado: cache só no navegador; o ?v= muda quando a foto muda
  res.set({ 'Cache-Control': 'private, max-age=31536000, immutable', 'Content-Type': row.mime, 'X-Content-Type-Options': 'nosniff' });
  res.send(row.data);
});

router.post('/clientes/:id/foto', jsonBody, async (req, res) => {
  const c = await getCustomer(req.params.id);
  if (!c) return res.status(404).json({ ok: false, message: 'Cliente não encontrado.' });
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body?.image || ''));
  if (!m) return res.status(400).json({ ok: false, message: 'Imagem inválida. Use JPG, PNG ou WebP.' });
  const buf = Buffer.from(m[2], 'base64');
  const sig = IMG_SIG.find(([, test]) => buf.length > 12 && test(buf));
  if (!sig || buf.length > 400 * 1024) return res.status(400).json({ ok: false, message: 'Imagem inválida ou grande demais.' });
  const row = await db.one(
    `INSERT INTO customer_photos (customer_id, mime, data, updated_at) VALUES (?, ?, ?, now())
     ON CONFLICT (customer_id) DO UPDATE SET mime = excluded.mime, data = excluded.data, updated_at = now()
     RETURNING extract(epoch FROM updated_at)::bigint AS v`,
    [c.id, sig[0], buf]
  );
  await db.log(c.id, 'status', 'Foto do cliente atualizada');
  res.json({ ok: true, message: 'Foto salva.', src: `${A}/clientes/${c.id}/foto?v=${row.v}` });
});

router.post('/clientes/:id/foto/apagar', async (req, res) => {
  const c = await getCustomer(req.params.id);
  if (!c) return res.status(404).type('html').send(errorPage(404));
  await db.run(`DELETE FROM customer_photos WHERE customer_id = ?`, [c.id]);
  res.redirect(303, `${A}/clientes/${c.id}?ok=salvo`);
});

// ---------- localização ----------
router.post('/clientes/:id/local', form, async (req, res) => {
  const c = await getCustomer(req.params.id);
  if (!c) return res.status(404).type('html').send(errorPage(404));
  const query = String(req.body.endereco || '').trim().slice(0, 300) || null;
  let link = String(req.body.link || '').trim().slice(0, 1000) || null;
  if (link && !AG.isUrl(link)) {
    return reply(req, res, { ok: false, message: 'O link precisa começar com https://' }, `${A}/clientes/${c.id}#local`);
  }
  const c2 = await db.one(`UPDATE customers SET maps_query = ?, maps_url = ?, updated_at = now() WHERE id = ? RETURNING *`, [query, link, c.id]);
  const { answers } = await answersOf(c.id);
  reply(req, res, { ok: true, message: 'Localização salva.', replace: '#local', html: V.mapCard(c2, answers) }, `${A}/clientes/${c.id}?ok=salvo#local`);
});

// ---------- agente no ZappMillion ----------
async function agentReply(req, res, c2, message) {
  const { answers } = await answersOf(c2.id);
  reply(req, res, { ok: true, message, replace: '#agente', html: V.agentSection(c2, answers) }, `${A}/clientes/${c2.id}?ok=salvo#agente`);
}

router.post('/clientes/:id/agente', form, async (req, res) => {
  const c = await getCustomer(req.params.id);
  if (!c) return res.status(404).type('html').send(errorPage(404));
  const perfil = AG.PROFILES[req.body.perfil] ? req.body.perfil : null;
  const c2 = await db.one(`UPDATE customers SET agent_profile = ?, updated_at = now() WHERE id = ? RETURNING *`, [perfil, c.id]);
  if (perfil !== AG.profileFor(c)) await db.log(c.id, 'status', `Perfil do agente: ${AG.PROFILES[AG.profileFor(c2)].label}`);
  agentReply(req, res, c2, `Perfil ${AG.PROFILES[AG.profileFor(c2)].label} aplicado. Atualize o prompt e o tempo de resposta no ZappMillion.`);
});

router.post('/clientes/:id/uso', form, async (req, res) => {
  const c = await getCustomer(req.params.id);
  if (!c) return res.status(404).type('html').send(errorPage(404));
  const used = Math.max(0, Math.floor(Number(String(req.body.usadas || '').replace(/\D/g, ''))));
  const start = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body.inicio || '')) ? req.body.inicio : null;
  if (!start || !Number.isFinite(used) || new Date(start) > new Date()) {
    return reply(req, res, { ok: false, message: 'Informe o número de respostas e uma data de início válida.' }, `${A}/clientes/${c.id}#agente`);
  }
  const c2 = await db.one(`UPDATE customers SET usage_used = ?, usage_cycle_start = ?::date, usage_updated_at = now(), updated_at = now() WHERE id = ? RETURNING *`, [used, start, c.id]);
  const u = AG.usage(c2);
  const msg = u.state === 'vai_estourar' || u.state === 'estourou' ? 'Uso salvo. Atenção: no ritmo atual as respostas não chegam ao fim do ciclo.' : 'Uso salvo.';
  agentReply(req, res, c2, msg);
});

const slug = (t) => String(t || 'cliente').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'cliente';

router.get('/clientes/:id/agente.json', async (req, res) => {
  const c = await getCustomer(req.params.id);
  if (!c) return res.status(404).type('html').send(errorPage(404));
  const { answers } = await answersOf(c.id);
  if (!answers) return res.redirect(303, `${A}/clientes/${c.id}#agente`);
  const g = AG.build(c, answers);
  res.set('Content-Disposition', `attachment; filename="agente-${slug(answers.empresa || c.name)}.json"`);
  res.type('application/json').send(JSON.stringify(g.json, null, 2));
});

// ---------- exportar onboarding ----------
router.get('/clientes/:id/onboarding.txt', async (req, res) => {
  const c = await getCustomer(req.params.id);
  const { answers } = c ? await answersOf(c.id) : {};
  if (!answers) return res.status(404).type('html').send(errorPage(404, { message: 'Este cliente ainda não preencheu o onboarding.' }));
  res.set('Content-Disposition', `attachment; filename="onboarding-${slug(answers.empresa || c.name)}.txt"`);
  res.type('text/plain; charset=utf-8').send('﻿' + AG.txtExport(c, answers, FIELDS, labelOf));
});

router.get('/clientes/:id/onboarding.json', async (req, res) => {
  const c = await getCustomer(req.params.id);
  const { answers, onboarding } = c ? await answersOf(c.id) : {};
  if (!answers) return res.status(404).type('html').send(errorPage(404, { message: 'Este cliente ainda não preencheu o onboarding.' }));
  const campos = FIELDS.map(([k, label]) => ({ campo: k, pergunta: label, resposta: labelOf(k, answers[k]) ?? '' }));
  const out = {
    cliente: { nome: c.name, email: c.email, telefone: c.phone, plano: c.plan_name },
    preenchido_em: onboarding.updated_at,
    autorizou_lgpd: !!answers.lgpd,
    respostas: campos,
  };
  res.set('Content-Disposition', `attachment; filename="onboarding-${slug(answers.empresa || c.name)}.json"`);
  res.type('application/json').send(JSON.stringify(out, null, 2));
});

router.get('/clientes/:id/onboarding/imprimir', async (req, res) => {
  const c = await getCustomer(req.params.id);
  const { answers, onboarding } = c ? await answersOf(c.id) : {};
  if (!answers) return res.status(404).type('html').send(errorPage(404, { message: 'Este cliente ainda não preencheu o onboarding.' }));
  res.type('html').send(V.renderOnboardingPrint({ c, answers, onboarding }));
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
