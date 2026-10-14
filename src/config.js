const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const env = process.env;

const plansFile = JSON.parse(fs.readFileSync(path.join(root, 'plans.json'), 'utf8'));
const dataDir = path.resolve(root, env.DATA_DIR || './data');
fs.mkdirSync(dataDir, { recursive: true });

// Endereço secreto do painel. Se ADMIN_PATH não estiver no .env, gera um e guarda em data/admin-path.txt.
function resolveAdminPath() {
  const clean = (p) => '/' + String(p).trim().replace(/^\/+|\/+$/g, '');
  if (env.ADMIN_PATH && env.ADMIN_PATH.trim().length >= 12) return clean(env.ADMIN_PATH);
  const file = path.join(dataDir, 'admin-path.txt');
  try {
    const saved = fs.readFileSync(file, 'utf8').trim();
    if (saved) return clean(saved);
  } catch {}
  const generated = `/gestao-${crypto.randomBytes(9).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  fs.writeFileSync(file, generated + '\n');
  return generated;
}

// Versão dos arquivos estáticos (muda quando o CSS/JS muda, para o navegador não usar o antigo)
function assetVersion() {
  const h = crypto.createHash('sha1');
  for (const f of ['public/css/app.css', 'public/js/site.js', 'public/js/admin.js', 'public/img/simbolo.svg', 'public/favicon.ico']) {
    try { h.update(fs.readFileSync(path.join(root, f))); } catch {}
  }
  return h.digest('hex').slice(0, 10);
}

const toNumber = (v) => Number(String(v ?? '').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')) || 0;

const config = {
  root,
  port: Number(env.PORT || 3100),
  publicUrl: (env.PUBLIC_URL || `http://localhost:${env.PORT || 3100}`).replace(/\/$/, ''),
  dataDir,
  webhookSecret: env.CAKTO_WEBHOOK_SECRET || '',
  admin: { user: env.ADMIN_USER || 'admin', pass: env.ADMIN_PASS || '' },
  adminPath: resolveAdminPath(),
  resendApiKey: env.RESEND_API_KEY || '',
  databaseUrl: env.DATABASE_URL || '',
  // Login do painel pelo Supabase Auth (projeto CDEV Site). Só os e-mails de ADMIN_EMAILS entram.
  supabase: {
    url: (env.SUPABASE_URL || '').replace(/\/$/, ''),
    anonKey: env.SUPABASE_ANON_KEY || '',
  },
  adminEmails: String(env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  smtp: {
    host: env.SMTP_HOST || '',
    port: Number(env.SMTP_PORT || 465),
    secure: String(env.SMTP_SECURE || 'true') === 'true',
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
  },
  mailFrom: env.MAIL_FROM || 'Auronix <contato@auronix.cdev.com.br>',
  adminNotifyEmail: env.ADMIN_NOTIFY_EMAIL || '',
  contactEmail: env.CONTACT_EMAIL || 'contato@auronix.cdev.com.br',
  // Para onde vão as respostas dos clientes (se contato@ ainda não recebe e-mails, use seu Gmail)
  replyTo: env.REPLY_TO || env.CONTACT_EMAIL || 'contato@auronix.cdev.com.br',
  contactWhatsapp: (env.CONTACT_WHATSAPP || '').replace(/\D/g, ''),
  developer: { name: 'CDEV', url: 'https://cdev.com.br' },
  // Medição: só carrega depois que o visitante aceita os cookies. Deixe vazio para desligar.
  analytics: {
    gaId: env.GA_ID ?? 'G-PY424WTQV5',
    clarityId: env.CLARITY_ID ?? 'ywuyag9zls',
  },
  plans: plansFile.plans.map((p) => ({ ...p, priceNumber: toNumber(p.price), defaultCost: toNumber(p.cost), setupRetentionNumber: toNumber(p.setupRetention) })),
  comparison: plansFile.comparison || [],
  assetVersion: assetVersion(),
  secureCookies: String(env.PUBLIC_URL || '').startsWith('https://'),
  toNumber,
};

if (!config.webhookSecret || config.webhookSecret === 'troque-esta-chave') {
  console.warn('[aviso] CAKTO_WEBHOOK_SECRET não configurado: o webhook vai recusar todas as chamadas.');
}
if (config.supabase.url && !config.adminEmails.length) {
  console.warn('[aviso] ADMIN_EMAILS vazio: ninguém consegue entrar no painel.');
}

module.exports = config;
