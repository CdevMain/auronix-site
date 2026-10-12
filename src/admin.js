const { esc, page } = require('./html');
const { FIELDS, labelOf } = require('./onboarding');
const config = require('./config');

const STATUS_PILL = (s) => `<span class="pill${s === 'ativo' ? ' pill--on' : ''}">${esc(s)}</span>`;
// O SQLite grava em UTC; mostra no horário de Brasília
const fmtDate = (d) => {
  if (!d) return '-';
  const dt = new Date(String(d).replace(' ', 'T') + 'Z');
  if (Number.isNaN(dt.getTime())) return esc(d);
  return esc(dt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }));
};
const money = (n) => (n == null ? '-' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

function adminPage(title, body) {
  return page({ title: `${title} | Admin Auronix`, body })
    .replace('<header class="topbar">', '<header class="topbar topbar--wide">')
    .replace('<main class="wrap">', '<main class="wrap wrap--wide">');
}

function renderList({ customers, counts, events }) {
  const rows = customers
    .map(
      (c) => `<tr>
  <td><a href="/admin/clientes/${c.id}">${esc(c.name || '(sem nome)')}</a><br><span class="hint">${esc(c.email)}</span></td>
  <td>${esc(c.plan_name || 'não identificado')}</td>
  <td>${STATUS_PILL(c.status)}</td>
  <td>${c.onboarding_at ? `<span class="pill pill--on">preenchido</span><br><span class="hint">${fmtDate(c.onboarding_at)}</span>` : '<span class="pill">pendente</span>'}</td>
  <td>${money(c.amount)}</td>
  <td>${fmtDate(c.created_at)}</td>
</tr>`
    )
    .join('');

  const evRows = events
    .map(
      (e) => `<tr><td>${fmtDate(e.received_at)}</td><td>${esc(e.event)}</td><td>${esc(e.email || '-')}</td><td>${esc(e.result || '-')}</td><td class="mono">${esc(e.order_id || '-')}</td></tr>`
    )
    .join('');

  return adminPage(
    'Clientes',
    `<h1>Clientes</h1>
<div class="stats">
  <span>${counts.total} no total</span><span>${counts.ativos} ativos</span><span>${counts.pendentes} com onboarding pendente</span>
</div>
<div class="table-box"><table>
<thead><tr><th>Cliente</th><th>Plano</th><th>Status</th><th>Onboarding</th><th>Valor</th><th>Desde</th></tr></thead>
<tbody>${rows || '<tr><td colspan="6">Nenhuma venda ainda. Quando a Cakto enviar o primeiro webhook, o cliente aparece aqui.</td></tr>'}</tbody>
</table></div>

<h2 class="sub">Últimos webhooks</h2>
<p class="hint" style="margin-top:12px">Endereço para cadastrar na Cakto: <span class="mono">${esc(config.publicUrl)}/webhooks/cakto</span></p>
<div class="table-box"><table>
<thead><tr><th>Recebido</th><th>Evento</th><th>E-mail</th><th>Resultado</th><th>Pedido</th></tr></thead>
<tbody>${evRows || '<tr><td colspan="5">Nenhum webhook recebido.</td></tr>'}</tbody>
</table></div>`
  );
}

function renderCustomer({ c, onboarding, events, flash }) {
  const link = c.onboarding_token ? `${config.publicUrl}/onboarding/${c.onboarding_token}` : '';
  const answers = onboarding ? JSON.parse(onboarding.answers) : null;
  const answersHtml = answers
    ? `<dl class="answers">${FIELDS.map(([k, label]) => {
        const val = labelOf(k, answers[k]);
        return `<div><dt>${esc(label)}</dt><dd>${esc(Array.isArray(val) ? val.join(', ') : val) || '-'}</dd></div>`;
      }).join('')}<div><dt>Autorizou uso dos dados</dt><dd>${answers.lgpd ? 'Sim' : 'Não'}</dd></div></dl>`
    : '<p class="lede">O cliente ainda não preencheu o onboarding.</p>';

  const evRows = events
    .map((e) => `<tr><td>${fmtDate(e.received_at)}</td><td>${esc(e.event)}</td><td>${esc(e.result || '-')}</td><td class="mono">${esc(e.order_id || '-')}</td></tr>`)
    .join('');

  return adminPage(
    c.name || c.email,
    `<p><a class="link" href="/admin">Todos os clientes</a></p>
<h1 style="margin-top:20px">${esc(c.name || c.email)}</h1>
${flash ? `<div class="notice notice--solid" role="status">${esc(flash)}</div>` : ''}
<dl class="answers">
  <div><dt>E-mail</dt><dd>${esc(c.email)}</dd></div>
  <div><dt>Telefone</dt><dd>${esc(c.phone || '-')}</dd></div>
  <div><dt>Plano</dt><dd>${esc(c.plan_name || 'não identificado')}</dd></div>
  <div><dt>Status</dt><dd>${STATUS_PILL(c.status)}</dd></div>
  <div><dt>Valor / pagamento</dt><dd>${money(c.amount)} ${c.payment_method ? '(' + esc(c.payment_method) + ')' : ''}</dd></div>
  <div><dt>IDs na Cakto</dt><dd class="mono">pedido ${esc(c.last_order_id || '-')}\noferta ${esc(c.last_offer_id || '-')}\nproduto ${esc(c.last_product_id || '-')}</dd></div>
  <div><dt>Link de onboarding</dt><dd><span class="mono">${esc(link || '-')}</span>
    <div class="copy-row"><span class="hint">E-mail enviado: ${c.onboarding_sent_at ? fmtDate(c.onboarding_sent_at) : 'ainda não'}</span></div>
    <form method="post" action="/admin/clientes/${c.id}/reenviar" style="margin-top:12px"><button class="btn btn--dark btn--small" type="submit">Enviar link por e-mail</button></form>
  </dd></div>
</dl>

<h2 class="sub">Onboarding${onboarding ? ` <span class="hint" style="font-weight:400">enviado em ${fmtDate(onboarding.updated_at)}</span>` : ''}</h2>
${answersHtml}

<h2 class="sub">Webhooks deste cliente</h2>
<div class="table-box"><table>
<thead><tr><th>Recebido</th><th>Evento</th><th>Resultado</th><th>Pedido</th></tr></thead>
<tbody>${evRows || '<tr><td colspan="4">Nenhum.</td></tr>'}</tbody>
</table></div>`
  );
}

module.exports = { renderList, renderCustomer };
