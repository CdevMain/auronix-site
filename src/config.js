const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function loadPlans() {
  const raw = JSON.parse(fs.readFileSync(path.join(root, 'plans.json'), 'utf8'));
  return raw.plans;
}

const env = process.env;

const config = {
  root,
  port: Number(env.PORT || 3100),
  publicUrl: (env.PUBLIC_URL || `http://localhost:${env.PORT || 3100}`).replace(/\/$/, ''),
  dataDir: path.resolve(root, env.DATA_DIR || './data'),
  webhookSecret: env.CAKTO_WEBHOOK_SECRET || '',
  admin: { user: env.ADMIN_USER || 'admin', pass: env.ADMIN_PASS || '' },
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
  contactWhatsapp: (env.CONTACT_WHATSAPP || '').replace(/\D/g, ''),
  plans: loadPlans(),
};

if (!config.webhookSecret || config.webhookSecret === 'troque-esta-chave') {
  console.warn('[aviso] CAKTO_WEBHOOK_SECRET não configurado: o webhook vai recusar todas as chamadas.');
}
if (!config.admin.pass || config.admin.pass === 'troque-esta-senha') {
  console.warn('[aviso] ADMIN_PASS não configurado: o painel /admin fica bloqueado.');
}

module.exports = config;
