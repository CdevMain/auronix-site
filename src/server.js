const path = require('node:path');
const express = require('express');
const config = require('./config');
const db = require('./db');
const mail = require('./mail');
const { handleWebhook, sendOnboardingEmail, safeEqual } = require('./cakto');
const { renderLanding } = require('./landing');
const onboarding = require('./onboarding');
const admin = require('./admin');
const { esc, page } = require('./html');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    // Não vaza o token do onboarding para outros sites
    'Referrer-Policy': 'no-referrer',
  });
  next();
});

app.use(express.static(path.join(config.root, 'public'), { maxAge: '7d', index: false }));

// ---------- Site ----------
let landingCache = null;
app.get('/', (req, res) => {
  landingCache ??= renderLanding();
  res.type('html').send(landingCache);
});

app.get('/health', (req, res) => res.json({ ok: true }));

// ---------- Webhook da Cakto ----------
app.post('/webhooks/cakto', express.json({ limit: '1mb' }), (req, res) => {
  try {
    const { status, result } = handleWebhook(req.body);
    console.log(`[webhook] ${req.body?.event || '?'} ${status} ${result}`);
    res.status(status).json({ ok: status === 200, result });
  } catch (err) {
    console.error('[webhook] erro', err);
    res.status(500).json({ ok: false });
  }
});

// ---------- Pós-compra ----------
const form = express.urlencoded({ extended: true, limit: '200kb' });

function obrigadoPage({ sent } = {}) {
  return page({
    title: 'Pagamento recebido | Auronix',
    body: `<h1>Obrigado por assinar a Auronix</h1>
<p class="lede">Assim que a Cakto confirmar o pagamento, enviamos para o e-mail da compra o link do onboarding. É por ele que você conta como o seu negócio funciona para treinarmos o seu agente.</p>
<p class="lede">No Pix e no cartão a confirmação costuma ser imediata. No boleto, pode levar até 3 dias úteis.</p>
<h2 class="sub" id="reenviar">Não recebeu o e-mail?</h2>
<p class="lede">Confira a caixa de spam. Se não estiver lá, digite o e-mail usado na compra e enviamos o link de novo.</p>
${sent ? '<div class="notice notice--solid" role="status">Se houver uma assinatura ativa com esse e-mail, o link chega em alguns minutos.</div>' : ''}
<form class="form inline-form" method="post" action="/reenviar">
  <label class="sr-only" for="f-email">E-mail usado na compra</label>
  <input type="email" id="f-email" name="email" required autocomplete="email" placeholder="seu@email.com" aria-label="E-mail usado na compra">
  <button class="btn btn--dark" type="submit">Reenviar link</button>
</form>
<p class="lede" style="margin-top:40px">Precisa de ajuda? Escreva para <a class="link" href="mailto:${esc(config.contactEmail)}">${esc(config.contactEmail)}</a>.</p>`,
  });
}

app.get('/obrigado', (req, res) => res.type('html').send(obrigadoPage({ sent: req.query.enviado === '1' })));

// Limite simples: 5 pedidos de reenvio por IP a cada 15 min
const resendHits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const hits = (resendHits.get(ip) || []).filter((t) => now - t < 15 * 60 * 1000);
  hits.push(now);
  resendHits.set(ip, hits);
  return hits.length > 5;
}

const findActiveByEmail = db.prepare(`SELECT * FROM customers WHERE email = ? AND status = 'ativo'`);
app.post('/reenviar', form, (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!rateLimited(req.ip) && email) {
    const c = findActiveByEmail.get(email);
    if (c) sendOnboardingEmail(c).catch((e) => console.error('[reenviar]', e.message));
  }
  // Mesma resposta sempre, para não revelar quem é cliente
  res.redirect(303, '/obrigado?enviado=1#reenviar');
});

// ---------- Onboarding ----------
const byToken = db.prepare(`SELECT * FROM customers WHERE onboarding_token = ?`);
const getOnboarding = db.prepare(`SELECT * FROM onboardings WHERE customer_id = ?`);
const saveOnboarding = db.prepare(`
INSERT INTO onboardings (customer_id, answers) VALUES (?, ?)
ON CONFLICT(customer_id) DO UPDATE SET answers = excluded.answers, updated_at = datetime('now')`);

function loadByToken(req, res) {
  const token = String(req.params.token || '');
  const c = token.length >= 20 ? byToken.get(token) : null;
  if (!c) {
    res.status(404).type('html').send(onboarding.renderInvalid('nao_encontrado'));
    return null;
  }
  if (c.status !== 'ativo') {
    res.status(403).type('html').send(onboarding.renderInvalid('inativo'));
    return null;
  }
  return c;
}

app.get('/onboarding/:token', (req, res) => {
  const c = loadByToken(req, res);
  if (!c) return;
  const row = getOnboarding.get(c.id);
  res.type('html').send(
    onboarding.renderForm({
      token: c.onboarding_token,
      customer: c,
      answers: row ? JSON.parse(row.answers) : { responsavel: c.name || '', contato_whatsapp: c.phone || '' },
      saved: req.query.salvo === '1',
      existing: Boolean(row) && req.query.salvo !== '1',
    })
  );
});

app.post('/onboarding/:token', form, (req, res) => {
  const c = loadByToken(req, res);
  if (!c) return;
  const answers = onboarding.clean(req.body);
  const errors = onboarding.validate(answers);
  if (errors.length) {
    return res.status(422).type('html').send(onboarding.renderForm({ token: c.onboarding_token, customer: c, answers, errors }));
  }
  const first = !getOnboarding.get(c.id);
  saveOnboarding.run(c.id, JSON.stringify(answers));
  mail.notifyAdmin(
    `${first ? 'Onboarding preenchido' : 'Onboarding atualizado'}: ${answers.empresa}`,
    `${c.name || ''} <${c.email}>\nPlano: ${c.plan_name || '-'}\n\n${config.publicUrl}/admin/clientes/${c.id}`
  );
  res.redirect(303, `/onboarding/${c.onboarding_token}?salvo=1`);
});

// ---------- Admin ----------
function basicAuth(req, res, next) {
  const pass = config.admin.pass;
  if (!pass || pass === 'troque-esta-senha') return res.status(503).send('Defina ADMIN_PASS no .env para usar o painel.');
  const [scheme, encoded] = String(req.headers.authorization || '').split(' ');
  if (scheme === 'Basic' && encoded) {
    const [user, ...rest] = Buffer.from(encoded, 'base64').toString().split(':');
    if (safeEqual(user, config.admin.user) && safeEqual(rest.join(':'), pass)) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="Auronix admin", charset="UTF-8"').status(401).send('Login necessário.');
}

// Bloqueia POST vindo de outro site (o navegador reenviaria o login automaticamente)
function sameOrigin(req, res, next) {
  const origin = req.headers.origin || req.headers.referer || '';
  try {
    if (new URL(origin).host === req.headers.host) return next();
  } catch {}
  res.status(403).send('Origem inválida.');
}

app.use('/admin', basicAuth, (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.get('/admin', (req, res) => {
  const customers = db
    .prepare(`SELECT c.*, o.updated_at AS onboarding_at FROM customers c LEFT JOIN onboardings o ON o.customer_id = c.id ORDER BY c.created_at DESC, c.id DESC LIMIT 500`)
    .all();
  const counts = db
    .prepare(`SELECT COUNT(*) total, SUM(status='ativo') ativos,
              SUM(status='ativo' AND id NOT IN (SELECT customer_id FROM onboardings)) pendentes FROM customers`)
    .get();
  const events = db.prepare(`SELECT * FROM webhook_events ORDER BY id DESC LIMIT 30`).all();
  res.type('html').send(admin.renderList({ customers, counts: { total: counts.total || 0, ativos: counts.ativos || 0, pendentes: counts.pendentes || 0 }, events }));
});

app.get('/admin/clientes/:id', (req, res) => {
  const c = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(Number(req.params.id));
  if (!c) return res.status(404).send('Cliente não encontrado.');
  const events = db.prepare(`SELECT * FROM webhook_events WHERE email = ? ORDER BY id DESC LIMIT 50`).all(c.email);
  const flash = { enviado: 'Link enviado por e-mail.', semsmtp: 'SMTP não configurado: copie o link acima e envie ao cliente.' }[req.query.msg];
  res.type('html').send(admin.renderCustomer({ c, onboarding: getOnboarding.get(c.id), events, flash }));
});

app.post('/admin/clientes/:id/reenviar', sameOrigin, async (req, res) => {
  const c = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(Number(req.params.id));
  if (!c) return res.status(404).send('Cliente não encontrado.');
  try {
    const sent = await sendOnboardingEmail(c);
    res.redirect(303, `/admin/clientes/${c.id}?msg=${sent ? 'enviado' : 'semsmtp'}`);
  } catch (e) {
    res.status(500).send(`Falha ao enviar: ${esc(e.message)}`);
  }
});

// ---------- 404 ----------
app.use((req, res) => {
  res.status(404).type('html').send(
    page({ title: 'Página não encontrada | Auronix', body: '<h1>Página não encontrada</h1><p class="lede">O endereço não existe.</p><p style="margin-top:32px"><a class="btn btn--dark" href="/">Ir para o início</a></p>' })
  );
});

app.listen(config.port, '127.0.0.1', () => {
  console.log(`Auronix rodando em http://127.0.0.1:${config.port} (público: ${config.publicUrl})`);
});
