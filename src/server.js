const path = require('node:path');
const express = require('express');
const config = require('./config');
const db = require('./db');
const mail = require('./mail');
const { handleWebhook, sendOnboardingEmail } = require('./cakto');
const { renderLanding } = require('./landing');
const pages = require('./pages');
const onboarding = require('./onboarding');
const adminRoutes = require('./admin-routes');
const { errorPage } = require('./html');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    // Não vaza o token do onboarding nem o endereço do painel para outros sites
    'Referrer-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  next();
});

// Arquivos estáticos: os links levam ?v=<versão>, então dá para guardar em cache por bastante tempo
app.use(express.static(path.join(config.root, 'public'), { maxAge: '30d', index: false }));

// ---------- site ----------
app.get('/', (req, res) => res.type('html').send(renderLanding()));
app.get('/contato', (req, res) => res.type('html').send(pages.renderContato({ sent: req.query.enviado === '1' })));
app.get('/privacidade', (req, res) => res.type('html').send(pages.renderPrivacidade()));
app.get('/termos', (req, res) => res.type('html').send(pages.renderTermos()));
app.get('/cookies', (req, res) => res.type('html').send(pages.renderCookies()));
app.get('/transparencia', (req, res) => res.type('html').send(pages.renderTransparencia()));
app.get('/contrato', (req, res) => res.type('html').send(pages.renderContratoModelo()));
app.get('/obrigado', (req, res) => res.type('html').send(pages.renderObrigado({ sent: req.query.enviado === '1' })));
app.get('/health', (req, res) => res.json({ ok: true }));
app.get('/robots.txt', (req, res) =>
  res.type('text/plain').send(`User-agent: *\nDisallow: /onboarding/\nDisallow: /contrato/\nDisallow: /obrigado\nSitemap: ${config.publicUrl}/sitemap.xml\n`)
);
app.get('/sitemap.xml', (req, res) => {
  const urls = ['/', '/contato', '/transparencia', '/contrato', '/privacidade', '/cookies', '/termos'].map((u) => `<url><loc>${config.publicUrl}${u}</loc></url>`).join('');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
});

// Limite simples por IP
function limiter(max, windowMs) {
  const hits = new Map();
  return (ip) => {
    const now = Date.now();
    const list = (hits.get(ip) || []).filter((t) => now - t < windowMs);
    list.push(now);
    hits.set(ip, list);
    return list.length > max;
  };
}
const contactLimited = limiter(5, 60 * 60 * 1000);
const resendLimited = limiter(5, 15 * 60 * 1000);
const form = express.urlencoded({ extended: true, limit: '200kb' });
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

app.post('/contato', form, async (req, res) => {
  const b = req.body;
  // Campo escondido: robôs preenchem, pessoas não
  if (b.site) return res.redirect(303, '/contato?enviado=1');
  const values = {
    nome: String(b.nome || '').trim().slice(0, 200),
    email: String(b.email || '').trim().toLowerCase().slice(0, 200),
    telefone: String(b.telefone || '').trim().slice(0, 40),
    empresa: String(b.empresa || '').trim().slice(0, 200),
    mensagem: String(b.mensagem || '').trim().slice(0, 5000),
  };
  const errors = [];
  if (!values.nome) errors.push('nome');
  if (!validEmail(values.email)) errors.push('e-mail válido');
  if (values.mensagem.length < 5) errors.push('mensagem');
  if (errors.length) return res.status(422).type('html').send(pages.renderContato({ errors, values }));
  if (contactLimited(req.ip)) return res.status(429).type('html').send(errorPage(429, { action: { href: '/contato', label: 'Voltar ao contato' } }));
  await db.run(`INSERT INTO contact_messages (name, email, phone, company, message) VALUES (?, ?, ?, ?, ?)`, [
    values.nome, values.email, values.telefone || null, values.empresa || null, values.mensagem,
  ]);
  mail.notifyAdmin(
    `Nova mensagem de ${values.nome}`,
    `${values.nome} <${values.email}>\n${values.telefone ? 'WhatsApp: ' + values.telefone + '\n' : ''}${values.empresa ? 'Empresa: ' + values.empresa + '\n' : ''}\n${values.mensagem}\n\n${config.publicUrl}${config.adminPath}/mensagens`
  );
  res.redirect(303, '/contato?enviado=1');
});

// ---------- webhook da Cakto ----------
app.post('/webhooks/cakto', express.json({ limit: '1mb' }), async (req, res) => {
  const { status, result } = await handleWebhook(req.body);
  console.log(`[webhook] ${req.body?.event || '?'} ${status} ${result}`);
  res.status(status).json({ ok: status === 200, result });
});

// ---------- pós-compra ----------
app.post('/reenviar', form, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!resendLimited(req.ip) && email) {
    const c = await db.one(`SELECT * FROM customers WHERE email = ? AND status IN ('ativo', 'atrasado')`, [email]);
    if (c) sendOnboardingEmail(c).catch((e) => console.error('[reenviar]', e.message));
  }
  // Mesma resposta sempre, para não revelar quem é cliente
  res.redirect(303, '/obrigado?enviado=1#reenviar');
});

// ---------- onboarding ----------
const getOnboarding = (customerId) => db.one(`SELECT * FROM onboardings WHERE customer_id = ?`, [customerId]);

async function loadByToken(req, res) {
  const token = String(req.params.token || '');
  const c = token.length >= 20 ? await db.one(`SELECT * FROM customers WHERE onboarding_token = ?`, [token]) : null;
  if (!c) {
    res.status(404).type('html').send(onboarding.renderInvalid('nao_encontrado'));
    return null;
  }
  if (!['ativo', 'atrasado', 'pendente'].includes(c.status)) {
    res.status(403).type('html').send(onboarding.renderInvalid('inativo'));
    return null;
  }
  return c;
}

app.get('/onboarding/:token', async (req, res) => {
  const c = await loadByToken(req, res);
  if (!c) return;
  const row = await getOnboarding(c.id);
  res.set('X-Robots-Tag', 'noindex').type('html').send(
    onboarding.renderForm({
      token: c.onboarding_token,
      customer: c,
      answers: row ? JSON.parse(row.answers) : { responsavel: c.name || '', contato_whatsapp: c.phone || '' },
      saved: req.query.salvo === '1',
      existing: Boolean(row) && req.query.salvo !== '1',
    })
  );
});

app.post('/onboarding/:token', form, async (req, res) => {
  const c = await loadByToken(req, res);
  if (!c) return;
  const answers = onboarding.clean(req.body);
  const errors = onboarding.validate(answers);
  if (errors.length) {
    return res.status(422).type('html').send(onboarding.renderForm({ token: c.onboarding_token, customer: c, answers, errors }));
  }
  const first = !(await getOnboarding(c.id));
  await db.run(
    `INSERT INTO onboardings (customer_id, answers) VALUES (?, ?)
     ON CONFLICT (customer_id) DO UPDATE SET answers = excluded.answers, updated_at = now()`,
    [c.id, JSON.stringify(answers)]
  );
  await db.log(c.id, 'onboarding', first ? `Onboarding preenchido (${answers.empresa})` : 'Onboarding atualizado pelo cliente');
  if (first) {
    if (c.stage === 'aguardando_onboarding') await db.run(`UPDATE customers SET stage = 'onboarding_recebido' WHERE id = ?`, [c.id]);
    mail.sendOnboardingReceived(c, `${config.publicUrl}/onboarding/${c.onboarding_token}`);
  }
  if (!c.is_test) {
    mail.notifyAdmin(
      `${first ? 'Onboarding preenchido' : 'Onboarding atualizado'}: ${answers.empresa}`,
      `${c.name || ''} <${c.email}>\nPlano: ${c.plan_name || '-'}\n\n${config.publicUrl}${config.adminPath}/clientes/${c.id}`
    );
  }
  res.redirect(303, `/onboarding/${c.onboarding_token}?salvo=1`);
});

// ---------- contrato do cliente ----------
const contract = require('./contract');
const { renderContractPage } = require('./contract-page');
const customerById = (id) => db.one(`SELECT * FROM customers WHERE id = ?`, [id]);
async function loadContract(req, res) {
  const token = String(req.params.token || '');
  const c = token.length >= 20 ? await contract.byToken(token) : null;
  if (!c) {
    res.status(404).type('html').send(errorPage(404, { message: 'Esse link de contrato não existe. Confira o e-mail que enviamos ou fale com a gente.' }));
    return null;
  }
  return c;
}
app.get('/contrato/:token', async (req, res) => {
  const c = await loadContract(req, res);
  if (!c) return;
  if (c.status !== 'cancelado') await contract.markViewed(c);
  const customer = (await customerById(c.customer_id)) || {};
  res.set('X-Robots-Tag', 'noindex').type('html').send(renderContractPage(await contract.byToken(c.token), { values: { nome: customer.name || '', email: customer.email || '' } }));
});
app.post('/contrato/:token', form, async (req, res) => {
  const c = await loadContract(req, res);
  if (!c) return;
  if (c.status === 'aceito' || c.status === 'cancelado') return res.redirect(303, `/contrato/${c.token}`);
  const values = { nome: req.body.nome, documento: req.body.documento, email: req.body.email, aceite: req.body.aceite };
  const r = await contract.accept(c, { name: values.nome, doc: values.documento, email: values.email, agree: values.aceite }, req);
  if (!r.ok) return res.status(422).type('html').send(renderContractPage(c, { errors: r.errors, values }));
  const customer = await customerById(c.customer_id);
  if (customer) {
    mail.sendContractAccepted(customer, r.contract, contract.link(r.contract));
    if (!customer.is_test) mail.notifyAdmin(`Contrato aceito: ${customer.name || customer.email}`, `${r.contract.accepted_name} (${r.contract.accepted_doc}) aceitou o contrato.\n\n${config.publicUrl}${config.adminPath}/clientes/${customer.id}`);
  }
  res.redirect(303, `/contrato/${c.token}`);
});

// ---------- painel (endereço secreto) ----------
app.use(config.adminPath, adminRoutes);

// ---------- erros ----------
app.use((req, res) => {
  res.status(404).type('html').send(errorPage(404));
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  const known = [400, 401, 403, 404, 405, 408, 413, 415, 429].includes(status);
  if (!known) console.error('[erro]', req.method, req.originalUrl, err);
  if (req.path.startsWith('/webhooks/')) return res.status(known ? status : 500).json({ ok: false, result: known ? err.message : 'erro interno' });
  res.status(known ? status : 500).type('html').send(errorPage(known ? status : 500));
});

db.init()
  .then(() => {
    app.listen(config.port, '127.0.0.1', () => {
      const auth = require('./auth');
      console.log(`Auronix rodando em http://127.0.0.1:${config.port} (público: ${config.publicUrl})`);
      console.log(`Painel: ${config.publicUrl}${config.adminPath} (login: ${auth.mode() === 'supabase' ? 'Supabase Auth, ' + (config.adminEmails.join(', ') || 'nenhum e-mail em ADMIN_EMAILS') : 'usuário e senha do .env'})`);
      console.log(`E-mail: ${mail.provider || 'desativado'} (remetente ${config.mailFrom})`);
      console.log('Banco: conectado');
    });
  })
  .catch((e) => {
    console.error('[erro] Não foi possível conectar ao banco:', e.message);
    console.error('Confira o DATABASE_URL no .env (use a conexão "Session pooler" do Supabase).');
    process.exit(1);
  });
