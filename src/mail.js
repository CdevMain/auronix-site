// Envio de e-mails: Resend (API HTTPS) quando RESEND_API_KEY existe; senão SMTP; senão só log.
const nodemailer = require('nodemailer');
const config = require('./config');
const db = require('./db');
const { esc } = require('./html');

const smtpEnabled = Boolean(config.smtp.host && config.smtp.user && config.smtp.pass);
const transport = smtpEnabled
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    })
  : null;

const provider = config.resendApiKey ? 'resend' : smtpEnabled ? 'smtp' : null;
if (!provider) console.warn('[aviso] Nenhum envio de e-mail configurado (RESEND_API_KEY ou SMTP): os e-mails só vão aparecer no log.');

const logEmail = {
  run: (...a) =>
    db
      .run(`INSERT INTO emails (customer_id, to_email, subject, kind, status, provider_id, error) VALUES (?, ?, ?, ?, ?, ?, ?)`, a)
      .catch((e) => console.error('[registro de e-mail]', e.message)),
};

async function sendViaResend({ to, subject, text, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: config.mailFrom, to: [to], subject, text, html, reply_to: config.replyTo }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || `Resend respondeu ${res.status}`);
  return body.id || null;
}

async function sendViaSmtp({ to, subject, text, html }) {
  const info = await transport.sendMail({ from: config.mailFrom, to, subject, text, html, replyTo: config.replyTo });
  return info.messageId || null;
}

/** Envia e registra. Retorna { ok, id, error, skipped }. Nunca lança erro. */
async function send({ to, subject, text, html, kind = 'outro', customerId = null }) {
  if (!provider) {
    console.log(`[email desativado] Para: ${to}\nAssunto: ${subject}\n${text}\n`);
    await logEmail.run(customerId, to, subject, kind, 'nao_enviado', null, 'Envio de e-mail não configurado');
    return { ok: false, skipped: true, error: 'Envio de e-mail não configurado' };
  }
  try {
    const id = provider === 'resend' ? await sendViaResend({ to, subject, text, html }) : await sendViaSmtp({ to, subject, text, html });
    await logEmail.run(customerId, to, subject, kind, 'enviado', id, null);
    await db.log(customerId, 'email', `E-mail enviado: ${subject}`);
    return { ok: true, id };
  } catch (e) {
    console.error('[email]', e.message);
    await logEmail.run(customerId, to, subject, kind, 'falhou', null, e.message.slice(0, 500));
    await db.log(customerId, 'email', `Falha ao enviar "${subject}": ${e.message}`);
    return { ok: false, error: e.message };
  }
}

// ---------- modelo visual ----------
function layout(inner, { preheader = '' } = {}) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#ffffff;font-family:Helvetica,Arial,sans-serif;color:#000000">
<span style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="padding-bottom:32px"><img src="${config.publicUrl}/img/logo-email.png" width="160" height="40" alt="auronix" style="display:block;border:0"></td></tr>
<tr><td style="font-size:16px;line-height:1.6">${inner}</td></tr>
<tr><td style="padding-top:40px;font-size:13px;line-height:1.5;color:#000000;border-top:1px solid #000000">Dúvidas? Responda este e-mail ou escreva para <a href="mailto:${esc(config.contactEmail)}" style="color:#000000">${esc(config.contactEmail)}</a>.<br>Auronix · agentes de IA para WhatsApp</td></tr>
</table></td></tr></table></body></html>`;
}
const button = (href, label) =>
  `<a href="${esc(href)}" style="display:inline-block;background:#000000;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:999px;font-weight:bold">${esc(label)}</a>`;

// ---------- e-mails ----------
function sendOnboarding(customer, link) {
  const first = (customer.name || '').split(' ')[0];
  const plan = customer.plan_name ? ` no plano ${customer.plan_name}` : '';
  const text = `Olá${first ? ', ' + first : ''}!

Seu pagamento${plan} foi confirmado. Bem-vindo à Auronix.

O próximo passo é contar como funciona o seu negócio, para treinarmos o seu agente de WhatsApp. Leva uns 10 minutos:

${link}

Esse link é pessoal. Você pode voltar nele para corrigir as respostas quando quiser.

Equipe Auronix`;
  const html = layout(
    `<p style="margin:0 0 16px">Olá${first ? ', ' + esc(first) : ''}!</p>
<p style="margin:0 0 16px">Seu pagamento${esc(plan)} foi confirmado. Bem-vindo à Auronix.</p>
<p style="margin:0 0 24px">O próximo passo é contar como funciona o seu negócio, para treinarmos o seu agente de WhatsApp. Leva uns 10 minutos.</p>
<p style="margin:0 0 24px">${button(link, 'Preencher onboarding')}</p>
<p style="margin:0;font-size:14px">Esse link é pessoal. Você pode voltar nele para corrigir as respostas quando quiser.</p>`,
    { preheader: 'Pagamento confirmado. Falta só contar sobre o seu negócio.' }
  );
  return send({ to: customer.email, subject: 'Pagamento confirmado: vamos configurar seu agente', text, html, kind: 'onboarding', customerId: customer.id });
}

function sendOnboardingReceived(customer, link) {
  const first = (customer.name || '').split(' ')[0];
  const text = `Olá${first ? ', ' + first : ''}!

Recebemos as informações do seu negócio. Agora vamos treinar o seu agente e você vai poder testar as respostas antes de ele falar com clientes.

Se quiser corrigir alguma coisa, use o mesmo link:
${link}

Equipe Auronix`;
  const html = layout(
    `<p style="margin:0 0 16px">Olá${first ? ', ' + esc(first) : ''}!</p>
<p style="margin:0 0 16px">Recebemos as informações do seu negócio. Agora vamos treinar o seu agente e você vai poder testar as respostas antes de ele falar com clientes.</p>
<p style="margin:0 0 24px">Se quiser corrigir alguma coisa, use o mesmo link.</p>
<p style="margin:0">${button(link, 'Revisar respostas')}</p>`,
    { preheader: 'Recebemos suas respostas. Próximo passo: treinar o agente.' }
  );
  return send({ to: customer.email, subject: 'Recebemos suas respostas', text, html, kind: 'onboarding_recebido', customerId: customer.id });
}

function sendContract(customer, link) {
  const first = (customer.name || '').split(' ')[0];
  const text = `Olá${first ? ', ' + first : ''}!

Segue o contrato de prestação de serviços da Auronix${customer.plan_name ? ' para o plano ' + customer.plan_name : ''}.

Leia e aceite pelo link (leva 2 minutos, é só informar nome e CPF ou CNPJ):
${link}

Depois do aceite, o mesmo link fica disponível para consulta e impressão.

Equipe Auronix`;
  const html = layout(
    `<p style="margin:0 0 16px">Olá${first ? ', ' + esc(first) : ''}!</p>
<p style="margin:0 0 16px">Segue o contrato de prestação de serviços da Auronix${customer.plan_name ? ' para o plano <strong>' + esc(customer.plan_name) + '</strong>' : ''}.</p>
<p style="margin:0 0 24px">Leia e aceite pelo link. Leva 2 minutos: é só informar nome e CPF ou CNPJ.</p>
<p style="margin:0 0 24px">${button(link, 'Ler e aceitar o contrato')}</p>
<p style="margin:0;font-size:14px">Depois do aceite, o mesmo link fica disponível para consulta e impressão.</p>`,
    { preheader: 'Seu contrato de prestação de serviços está pronto para aceite.' }
  );
  return send({ to: customer.email, subject: 'Seu contrato de prestação de serviços Auronix', text, html, kind: 'contrato', customerId: customer.id });
}

function sendContractAccepted(customer, contract, link) {
  const text = `Contrato aceito.

Contrato: ${contract.title}
Versão: ${contract.version}
Aceito por: ${contract.accepted_name} (${contract.accepted_doc})
Código de verificação (SHA-256): ${contract.body_hash}

Consulte ou imprima quando quiser: ${link}

Equipe Auronix`;
  const html = layout(
    `<p style="margin:0 0 16px"><strong>Contrato aceito.</strong> Guarde este e-mail como comprovante.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.5;margin:0 0 24px">
<tr><td style="padding:4px 16px 4px 0;font-weight:bold">Contrato</td><td>${esc(contract.title)}</td></tr>
<tr><td style="padding:4px 16px 4px 0;font-weight:bold">Versão</td><td>${esc(contract.version)}</td></tr>
<tr><td style="padding:4px 16px 4px 0;font-weight:bold">Aceito por</td><td>${esc(contract.accepted_name)} (${esc(contract.accepted_doc)})</td></tr>
<tr><td style="padding:4px 16px 4px 0;font-weight:bold;vertical-align:top">Código</td><td style="font-family:monospace;font-size:12px;word-break:break-all">${esc(contract.body_hash)}</td></tr>
</table>
<p style="margin:0">${button(link, 'Ver contrato')}</p>`,
    { preheader: 'Comprovante do aceite do seu contrato.' }
  );
  return send({ to: contract.accepted_email || customer.email, subject: 'Contrato aceito: comprovante', text, html, kind: 'contrato_aceito', customerId: customer.id });
}

function sendTest(to, note) {
  const when = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const text = `Este é um e-mail de teste da Auronix, enviado pelo painel em ${when}.${note ? '\n\n' + note : ''}

Se chegou, o envio de e-mails está funcionando.`;
  const html = layout(
    `<p style="margin:0 0 16px"><strong>E-mail de teste</strong></p>
<p style="margin:0 0 16px">Enviado pelo painel da Auronix em ${esc(when)}.</p>
${note ? `<p style="margin:0 0 16px;white-space:pre-wrap">${esc(note)}</p>` : ''}
<p style="margin:0">Se chegou, o envio de e-mails está funcionando.</p>`
  );
  return send({ to, subject: 'Teste de envio: Auronix', text, html, kind: 'teste' });
}

function notifyAdmin(subject, text, customerId = null) {
  if (!config.adminNotifyEmail) return;
  send({ to: config.adminNotifyEmail, subject: `[Auronix] ${subject}`, text, html: layout(`<p style="margin:0;white-space:pre-wrap">${esc(text)}</p>`), kind: 'aviso', customerId });
}

module.exports = { send, sendOnboarding, sendOnboardingReceived, sendContract, sendContractAccepted, sendTest, notifyAdmin, provider };
