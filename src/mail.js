const nodemailer = require('nodemailer');
const config = require('./config');
const { esc } = require('./html');

const enabled = Boolean(config.smtp.host && config.smtp.user && config.smtp.pass);
const transport = enabled
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    })
  : null;

if (!enabled) console.warn('[aviso] SMTP não configurado: e-mails só vão aparecer no log.');

async function send({ to, subject, text, html }) {
  if (!enabled) {
    console.log(`[email desativado] Para: ${to}\nAssunto: ${subject}\n${text}\n`);
    return false;
  }
  await transport.sendMail({ from: config.mailFrom, to, subject, text, html, replyTo: config.contactEmail });
  return true;
}

function layout(inner) {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#ffffff;font-family:Helvetica,Arial,sans-serif;color:#000000">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="padding-bottom:32px"><img src="${config.publicUrl}/img/logo-email.png" width="160" height="40" alt="auronix" style="display:block;border:0"></td></tr>
<tr><td style="font-size:16px;line-height:1.6">${inner}</td></tr>
<tr><td style="padding-top:40px;font-size:13px;line-height:1.5;color:#000000">Dúvidas? Responda este e-mail ou escreva para <a href="mailto:${esc(config.contactEmail)}" style="color:#000000">${esc(config.contactEmail)}</a>.</td></tr>
</table></td></tr></table></body></html>`;
}

async function sendOnboarding(customer, link) {
  const first = (customer.name || '').split(' ')[0];
  const plan = customer.plan_name ? ` no plano ${customer.plan_name}` : '';
  const text = `Olá${first ? ', ' + first : ''}!

Seu pagamento${plan} foi confirmado. Bem-vindo à Auronix.

O próximo passo é contar como funciona o seu negócio, para treinarmos o seu agente de WhatsApp. Leva uns 10 minutos:

${link}

Esse link é pessoal. Você pode voltar nele para corrigir as respostas quando quiser.

Equipe Auronix`;
  const html = layout(`
<p style="margin:0 0 16px">Olá${first ? ', ' + esc(first) : ''}!</p>
<p style="margin:0 0 16px">Seu pagamento${esc(plan)} foi confirmado. Bem-vindo à Auronix.</p>
<p style="margin:0 0 24px">O próximo passo é contar como funciona o seu negócio, para treinarmos o seu agente de WhatsApp. Leva uns 10 minutos.</p>
<p style="margin:0 0 24px"><a href="${esc(link)}" style="display:inline-block;background:#000000;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:999px;font-weight:bold">Preencher onboarding</a></p>
<p style="margin:0;font-size:14px">Esse link é pessoal. Você pode voltar nele para corrigir as respostas quando quiser.</p>`);
  return send({ to: customer.email, subject: 'Pagamento confirmado: vamos configurar seu agente', text, html });
}

function notifyAdmin(subject, text) {
  if (!config.adminNotifyEmail) return;
  send({ to: config.adminNotifyEmail, subject: `[Auronix] ${subject}`, text }).catch((e) =>
    console.error('[email admin]', e.message)
  );
}

module.exports = { send, sendOnboarding, notifyAdmin, enabled };
