// Telas do painel administrativo.
const config = require('./config');
const { esc, SYMBOL, head, asset, icon } = require('./html');
const { FIELDS, labelOf } = require('./onboarding');
const AG = require('./agent');
const { customerFinance, brl, pct, planCost } = require('./finance');
const { EVENT_LABEL } = require('./cakto');

const A = () => config.adminPath;

const STATUS = {
  ativo: 'Ativo',
  pendente: 'Aguardando pagamento',
  atrasado: 'Pagamento atrasado',
  pausado: 'Pausado',
  cancelado: 'Cancelado',
  reembolsado: 'Reembolsado',
  chargeback: 'Chargeback',
};
const STAGES = {
  aguardando_onboarding: 'Aguardando onboarding',
  onboarding_recebido: 'Onboarding recebido',
  em_configuracao: 'Em configuração',
  em_teste: 'Em teste com o cliente',
  no_ar: 'Agente no ar',
};
const PAYMENT = { 1: 'Confirmado', 0: 'Não confirmado' };

// Datas do banco (Date ou texto) no horário de Brasília
function fmtDate(d, withTime = true) {
  if (!d) return '-';
  const dt = d instanceof Date ? d : new Date(String(d).includes('T') || /[+-]\d\d(:?\d\d)?$|Z$/.test(String(d)) ? d : String(d).replace(' ', 'T') + 'Z');
  if (Number.isNaN(dt.getTime())) return esc(d);
  return esc(
    dt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', ...(withTime ? { timeStyle: 'short' } : {}) })
  );
}

const pill = (text, tone = '') => `<span class="pill${tone ? ' pill--' + tone : ''}">${esc(text)}</span>`;
function statusPill(s) {
  const tone = { ativo: 'on', atrasado: 'warn', pendente: 'warn', pausado: '', cancelado: 'off', reembolsado: 'off', chargeback: 'bad' }[s] || '';
  return pill(STATUS[s] || s, tone);
}
function paymentPill(v) {
  if (v === 1) return pill('Confirmado', 'on');
  if (v === 0) return pill('Não confirmado', 'bad');
  return pill('Sem confirmação', 'warn');
}
const stagePill = (s) => pill(STAGES[s] || s, s === 'no_ar' ? 'on' : '');
const testPill = (c) => (c.is_test ? ' ' + pill('teste', 'test') : '');

const FLASH = {
  login: 'Bem-vindo de volta.',
  salvo: 'Alterações salvas.',
  criado: 'Cliente criado.',
  apagado: 'Cliente apagado.',
  apagados: 'Itens apagados.',
  testes: 'Dados de teste apagados.',
  enviado: 'E-mail enviado.',
  semenvio: 'O envio de e-mail não está configurado: copie o link e mande ao cliente.',
  falhou: 'O envio falhou. Veja o motivo na aba E-mails.',
  nota: 'Nota adicionada.',
  custos: 'Custos atualizados.',
  empresa: 'Dados da empresa salvos.',
  contrato: 'Contrato enviado ao cliente.',
  contratocriado: 'Contrato criado. O envio por e-mail não está configurado: copie o link e mande ao cliente.',
  contratofalhou: 'Contrato criado, mas o e-mail falhou. Veja o motivo na aba E-mails.',
  contratocancelado: 'Contrato cancelado.',
  semempresa: 'Preencha os dados da empresa em Configurações antes de enviar contratos.',
  config: 'Configuração salva.',
  lida: 'Mensagem marcada como lida.',
  sessoes: 'Todos os outros acessos foram encerrados.',
  marcados: 'Clientes marcados como teste.',
};

function flashBox(key, extra) {
  const text = FLASH[key] || extra;
  if (!text) return '';
  const bad = ['falhou', 'semenvio', 'contratofalhou', 'contratocriado', 'semempresa', 'fotoerro'].includes(key);
  return toast(`${text}${extra && FLASH[key] ? ' ' + extra : ''}`, bad);
}
// Aviso temporário no rodapé: some sozinho e não volta ao recarregar a página
const toast = (text, bad = false) =>
  `<div class="toast${bad ? ' toast--bad' : ''}" role="status" data-toast><p>${esc(text)}</p><button class="toast__close" type="button" aria-label="Fechar aviso" data-toast-close>${icon('close')}</button></div>`;

function shell({ title, active, body, flash = '', unread = 0 }) {
  const tab = (key, href, label, badge = 0) =>
    `<a class="atab${active === key ? ' is-active' : ''}" href="${A()}${href}"${active === key ? ' aria-current="page"' : ''}>${label}${badge ? ` <span class="atab__badge">${badge}</span>` : ''}</a>`;
  return `<!doctype html>
<html lang="pt-BR">
<head>
${head({ title: `${title} | Painel Auronix`, noindex: true })}
</head>
<body class="admin">
<a class="skip" href="#conteudo">Pular para o conteúdo</a>
<header class="abar">
  <div class="abar__inner">
    <a class="brand" href="${A()}" aria-label="Painel Auronix, visão geral"><span class="brand__symbol">${SYMBOL}</span><span>auronix</span><span class="abar__tag">painel</span></a>
    <form method="post" action="${A()}/sair"><button class="btn btn--small btn--outline" type="submit">Sair</button></form>
  </div>
  <nav class="atabs" aria-label="Seções do painel">
    ${tab('geral', '', 'Visão geral')}
    ${tab('clientes', '/clientes', 'Clientes')}
    ${tab('pedidos', '/pedidos', 'Pedidos')}
    ${tab('contratos', '/contratos', 'Contratos')}
    ${tab('mensagens', '/mensagens', 'Mensagens', unread)}
    ${tab('emails', '/emails', 'E-mails')}
    ${tab('config', '/configuracoes', 'Configurações')}
  </nav>
</header>
<main class="amain" id="conteudo">
${body}
</main>
<div class="toasts" data-toasts aria-live="polite">${flash}</div>
<script src="${asset('/js/admin.js')}" defer></script>
</body>
</html>`;
}

// ---------- login ----------
function renderLogin({ error = '', locked = false, notConfigured = false, mode = 'local' } = {}) {
  const supa = mode === 'supabase';
  return `<!doctype html>
<html lang="pt-BR">
<head>
${head({ title: 'Entrar | Painel Auronix', noindex: true })}
</head>
<body class="login-page">
<main class="login" id="conteudo">
  <span class="brand login__brand"><span class="brand__symbol">${SYMBOL}</span><span>auronix</span></span>
  <h1>Entrar no painel</h1>
  ${supa ? '<p class="hint login__hint">Use o e-mail e a senha da sua conta Supabase (CDEV Site).</p>' : ''}
  ${notConfigured ? `<div class="notice notice--solid" role="alert">${supa ? 'Coloque o seu e-mail em ADMIN_EMAILS no arquivo de configuração para entrar.' : 'Defina ADMIN_USER e ADMIN_PASS no arquivo de configuração para usar o painel.'}</div>` : ''}
  ${error ? `<div class="notice notice--solid" role="alert">${esc(error)}</div>` : ''}
  <form class="form login__form" method="post" action="${A()}/entrar">
    <div class="field"><label for="l-user">${supa ? 'E-mail' : 'Usuário'}</label><input type="${supa ? 'email' : 'text'}" id="l-user" name="usuario" autocomplete="username" required ${locked ? 'disabled' : ''}></div>
    <div class="field"><label for="l-pass">Senha</label><input type="password" id="l-pass" name="senha" autocomplete="current-password" required ${locked ? 'disabled' : ''}></div>
    <button class="btn btn--dark" type="submit" ${locked ? 'disabled' : ''}>Entrar</button>
  </form>
</main>
</body>
</html>`;
}

// ---------- visão geral ----------
function kpi(label, value, note = '', tone = '') {
  return `<div class="kpi${tone ? ' kpi--' + tone : ''}"><p class="kpi__label">${esc(label)}</p><p class="kpi__value">${value}</p>${note ? `<p class="kpi__note">${note}</p>` : ''}</div>`;
}

function renderDashboard({ t, counts, attention, recent, unread, flash = '' }) {
  const planRows = Object.values(t.byPlan)
    .filter((b) => b.plan.id !== '_outro' || b.count)
    .map((b) => {
      const p = b.plan;
      const unitCost = p.id === '_outro' ? null : planCost(p.id);
      const unitProfit = p.priceNumber != null && unitCost != null ? p.priceNumber - unitCost : null;
      return `<tr>
  <td data-label="Plano"><strong>${esc(p.name)}</strong></td>
  <td data-label="Clientes">${b.count}</td>
  <td data-label="Preço">${p.priceNumber != null ? brl(p.priceNumber) : '-'}</td>
  <td data-label="Custo">${unitCost != null ? brl(unitCost) : '-'}</td>
  <td data-label="Lucro por cliente">${unitProfit != null ? brl(unitProfit) : '-'}</td>
  <td data-label="Margem">${unitProfit != null && p.priceNumber ? pct(unitProfit / p.priceNumber) : '-'}</td>
  <td data-label="Receita do mês">${brl(b.revenue)}</td>
  <td data-label="Lucro do mês"><strong>${brl(b.profit)}</strong></td>
</tr>`;
    })
    .join('');

  const att = attention.length
    ? `<ul class="alist">${attention
        .map((a) => `<li><a href="${A()}${a.href}"><strong>${esc(a.title)}</strong><span>${esc(a.text)}</span></a></li>`)
        .join('')}</ul>`
    : '<p class="empty">Nada pendente agora.</p>';

  const rec = recent.length
    ? `<ul class="alist">${recent
        .map(
          (c) => `<li><a href="${A()}/clientes/${c.id}"><strong>${esc(c.name || c.email)}${c.is_test ? ' (teste)' : ''}</strong><span>${esc(c.plan_name || 'plano não identificado')} · ${fmtDate(c.created_at)}</span></a></li>`
        )
        .join('')}</ul>`
    : '<p class="empty">Nenhuma venda ainda.</p>';

  return shell({
    title: 'Visão geral',
    active: 'geral',
    unread,
    flash,
    body: `<h1>Visão geral</h1>
<p class="lede">Valores mensais dos clientes ativos e com pagamento atrasado. Clientes de teste não entram na conta.</p>
<div class="kpis">
  ${kpi('Receita por mês', brl(t.mrr), `${t.billingCount} ${t.billingCount === 1 ? 'cliente pagante' : 'clientes pagantes'}`)}
  ${kpi('Custo por mês', brl(t.cost), 'soma do custo de cada cliente')}
  ${kpi('Lucro por mês', brl(t.profit), `margem de ${pct(t.margin)}`, 'strong')}
  ${kpi('Lucro após taxas da Cakto', t.feesKnown ? brl(t.profit - t.fees) : '-', t.feesKnown ? `taxas conhecidas de ${t.feesKnown} ${t.feesKnown === 1 ? 'cliente' : 'clientes'}` : 'aparece quando a Cakto enviar as taxas')}
</div>
<div class="kpis kpis--small">
  ${kpi('Clientes no total', counts.total)}
  ${kpi('Onboarding pendente', counts.pendentes)}
  ${kpi('Novos neste mês', counts.novosMes)}
  ${kpi('Mensagens não lidas', counts.naoLidas)}
</div>

<div class="agrid">
  <section class="acard">
    <h2>Precisa de atenção</h2>
    ${att}
  </section>
  <section class="acard">
    <h2>Últimas vendas</h2>
    ${rec}
  </section>
</div>

<section class="asection">
  <h2>Lucro por plano</h2>
  <p class="hint">Custos editáveis em <a class="link" href="${A()}/configuracoes">Configurações</a>.</p>
  <div class="table-box"><table class="rtable">
    <thead><tr><th>Plano</th><th>Clientes</th><th>Preço</th><th>Custo</th><th>Lucro por cliente</th><th>Margem</th><th>Receita do mês</th><th>Lucro do mês</th></tr></thead>
    <tbody>${planRows}</tbody>
    <tfoot><tr><td data-label="Total"><strong>Total</strong></td><td data-label="Clientes">${t.billingCount}</td><td></td><td></td><td></td><td data-label="Margem">${pct(t.margin)}</td><td data-label="Receita do mês">${brl(t.mrr)}</td><td data-label="Lucro do mês"><strong>${brl(t.profit)}</strong></td></tr></tfoot>
  </table></div>
</section>`,
  });
}

// ---------- clientes ----------
function filterSelect(name, label, options, current) {
  return `<div class="field"><label for="f-${name}">${esc(label)}</label><select id="f-${name}" name="${name}"><option value="">Todos</option>${Object.entries(options)
    .map(([v, l]) => `<option value="${esc(v)}"${current === v ? ' selected' : ''}>${esc(l)}</option>`)
    .join('')}</select></div>`;
}

// O que pede ação em cada cliente (usado nos cards e na visão geral)
function pendencias(c) {
  const list = [];
  if (c.status === 'atrasado') list.push('Pagamento atrasado');
  if (c.payment_confirmed !== 1 && ['ativo', 'pendente'].includes(c.status)) list.push('Pagamento sem confirmação');
  if (c.status === 'ativo' && !c.has_onb && Date.now() - new Date(c.created_at).getTime() > 2 * 86400000) list.push('Onboarding pendente há mais de 2 dias');
  if (c.stage === 'onboarding_recebido') list.push('Onboarding recebido: configurar o agente');
  const u = AG.usage(c);
  if (u.known && u.state === 'estourou') list.push('Respostas do plano acabaram');
  else if (u.known && u.state === 'vai_estourar') list.push(`Respostas acabam em ${u.runsOutIn} ${u.runsOutIn === 1 ? 'dia' : 'dias'}`);
  return list;
}
const TONE = { ativo: 'on', pendente: 'wait', atrasado: 'late', pausado: 'off', cancelado: 'off', reembolsado: 'off', chargeback: 'late' };

function customerCard(c) {
  const f = customerFinance(c);
  const pend = pendencias(c);
  const u = AG.usage(c);
  const meter = u.known && u.limit
    ? `<div class="ccard__usage"><div class="meter meter--thin${['vai_estourar', 'estourou', 'atencao'].includes(u.state) ? ' meter--warn' : ''}" role="img" aria-label="${Math.round(u.pct * 100)}% das respostas usadas"><span style="width:${Math.min(100, Math.round(u.pct * 100))}%"></span></div><span>${u.used.toLocaleString('pt-BR')} de ${u.limit.toLocaleString('pt-BR')} respostas</span></div>`
    : '';
  return `<article class="ccard ccard--${TONE[c.status] || 'off'}${c.is_test ? ' ccard--test' : ''}">
  ${pend.length ? `<span class="ping" title="${esc(pend.join(' · '))}"><span class="ping__dot" aria-hidden="true"></span><span class="ping__n">${pend.length}</span><span class="sr-only">${pend.length === 1 ? 'pendência' : 'pendências'}</span></span>` : ''}
  <div class="ccard__top">
    <input type="checkbox" name="ids" value="${c.id}" form="bulk" aria-label="Selecionar ${esc(c.name || c.email)}">
    ${avatar(c, 'small')}
    <div class="ccard__who">
      <h2 class="ccard__name"><a href="${A()}/clientes/${c.id}">${esc(c.name || '(sem nome)')}</a></h2>
      <p class="ccard__mail">${esc(c.email)}</p>
    </div>
  </div>
  <p class="ccard__pills">${statusPill(c.status)} ${paymentPill(c.payment_confirmed)} ${stagePill(c.stage)}${testPill(c)}</p>
  ${pend.length ? `<ul class="ccard__todo">${pend.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
  ${meter}
  <dl class="ccard__facts">
    <div><dt>Plano</dt><dd>${esc(c.plan_name ? c.plan_name.replace(/^Auronix\s+/i, '') : '-')}</dd></div>
    <div><dt>Lucro/mês</dt><dd>${brl(f.profit)}</dd></div>
    <div><dt>Desde</dt><dd>${fmtDate(c.created_at, false)}</dd></div>
  </dl>
</article>`;
}

function renderCustomers({ customers, q, filters, testCount, unread, flash, view = 'cards' }) {
  const plans = Object.fromEntries(config.plans.map((p) => [p.id, p.name]));
  const empty = q || Object.values(filters).some(Boolean)
    ? 'Nenhum cliente com esses filtros.'
    : 'Nenhum cliente ainda. Quando a Cakto enviar a primeira venda, ele aparece aqui. Você também pode cadastrar um cliente à mão em "Novo cliente".';
  const rows = customers
    .map((c) => {
      const f = customerFinance(c);
      const pend = pendencias(c);
      return `<tr>
  <td class="cell-check"><input type="checkbox" name="ids" value="${c.id}" form="bulk" aria-label="Selecionar ${esc(c.name || c.email)}"></td>
  <td data-label="Cliente"><div class="who-cell">${avatar(c, 'small')}<div><a href="${A()}/clientes/${c.id}">${esc(c.name || '(sem nome)')}</a>${testPill(c)}${pend.length ? ` <span class="ping ping--inline" title="${esc(pend.join(' · '))}"><span class="ping__dot" aria-hidden="true"></span><span class="ping__n">${pend.length}</span></span>` : ''}<br><span class="hint">${esc(c.email)}</span></div></div></td>
  <td data-label="Plano">${esc(c.plan_name || 'não identificado')}</td>
  <td data-label="Status">${statusPill(c.status)}</td>
  <td data-label="Pagamento">${paymentPill(c.payment_confirmed)}</td>
  <td data-label="Etapa">${stagePill(c.stage)}</td>
  <td data-label="Lucro por mês">${brl(f.profit)}</td>
  <td data-label="Desde">${fmtDate(c.created_at, false)}</td>
</tr>`;
    })
    .join('');
  const pendCount = customers.filter((c) => pendencias(c).length).length;
  const qs = (v) => {
    const params = new URLSearchParams(Object.entries({ ...filters, q }).filter(([, val]) => val));
    if (v === 'tabela') params.set('ver', 'tabela');
    const str = params.toString();
    return `${A()}/clientes${str ? '?' + str : ''}`;
  };
  const list = view === 'tabela'
    ? `<div class="table-box"><table class="rtable">
<thead><tr><th class="cell-check"><input type="checkbox" data-check-all aria-label="Selecionar todos"></th><th>Cliente</th><th>Plano</th><th>Status</th><th>Pagamento</th><th>Etapa</th><th>Lucro por mês</th><th>Desde</th></tr></thead>
<tbody>${rows || `<tr><td colspan="8" class="empty">${empty}</td></tr>`}</tbody>
</table></div>`
    : customers.length
    ? `<div class="cgrid">${customers.map(customerCard).join('\n')}</div>`
    : `<p class="empty map-empty">${empty}</p>`;

  return shell({
    title: 'Clientes',
    active: 'clientes',
    unread,
    flash,
    body: `<div class="ahead">
  <h1>Clientes</h1>
  <div class="ahead__actions">
    <a class="btn btn--dark btn--small" href="${A()}/clientes/novo">Novo cliente</a>
    <a class="btn btn--outline btn--small" href="${A()}/clientes.csv">Exportar CSV</a>
  </div>
</div>

<form class="form filters" method="get" action="${A()}/clientes" role="search">
  ${view === 'tabela' ? '<input type="hidden" name="ver" value="tabela">' : ''}
  <div class="field filters__q"><label for="f-q">Buscar</label><input type="search" id="f-q" name="q" value="${esc(q)}" placeholder="Nome, e-mail, telefone ou pedido"></div>
  ${filterSelect('status', 'Status', STATUS, filters.status)}
  ${filterSelect('plano', 'Plano', plans, filters.plano)}
  ${filterSelect('etapa', 'Etapa', STAGES, filters.etapa)}
  ${filterSelect('pagamento', 'Pagamento', { confirmado: 'Confirmado', nao: 'Não confirmado', sem: 'Sem confirmação' }, filters.pagamento)}
  <label class="check check--plain filters__test"><input type="checkbox" name="testes" value="1"${filters.testes ? ' checked' : ''}><span>Mostrar testes</span></label>
  <div class="filters__go"><button class="btn btn--dark btn--small" type="submit">Filtrar</button> <a class="link" href="${A()}/clientes${view === 'tabela' ? '?ver=tabela' : ''}">Limpar</a></div>
</form>

<div class="listbar">
  <form id="bulk" method="post" action="${A()}/clientes/acoes" class="bulk">
    <label class="check check--plain bulk__all"><input type="checkbox" data-check-all aria-label="Selecionar todos os clientes da lista"><span data-selected-count>Nenhum selecionado</span></label>
    <button class="btn btn--small btn--outline" type="submit" name="acao" value="teste">Marcar como teste</button>
    <button class="btn btn--small btn--danger" type="submit" name="acao" value="apagar" data-confirm="Apagar os clientes selecionados? Isso apaga também o onboarding, o histórico e os pedidos deles. Não dá para desfazer.">Apagar selecionados</button>
  </form>
  <nav class="viewswitch" aria-label="Modo de exibição">
    <a href="${qs('cards')}"${view !== 'tabela' ? ' aria-current="page"' : ''}>Cards</a>
    <a href="${qs('tabela')}"${view === 'tabela' ? ' aria-current="page"' : ''}>Tabela</a>
  </nav>
</div>
${view !== 'tabela' ? `<ul class="legend" aria-label="Legenda do contorno dos cards">
  <li><span class="legend__sw legend__sw--on"></span>Ativo</li>
  <li><span class="legend__sw legend__sw--wait"></span>Aguardando pagamento</li>
  <li><span class="legend__sw legend__sw--late"></span>Atrasado ou chargeback</li>
  <li><span class="legend__sw legend__sw--off"></span>Pausado, cancelado ou reembolsado</li>
  <li><span class="ping ping--inline"><span class="ping__dot" aria-hidden="true"></span></span>Pede ação (${pendCount})</li>
</ul>` : ''}
${testCount ? `<form method="post" action="${A()}/testes/apagar" class="testbar"><span>${testCount} ${testCount === 1 ? 'cliente de teste' : 'clientes de teste'} no banco.</span> <button class="btn btn--small btn--danger" type="submit" data-confirm="Apagar todos os clientes, pedidos e e-mails de teste? Não dá para desfazer.">Apagar todos os testes</button></form>` : ''}

${list}
<p class="hint">${customers.length} ${customers.length === 1 ? 'cliente' : 'clientes'} na lista.</p>`,
  });
}

function customerForm(c, { isNew = false } = {}) {
  const opt = (obj, cur) => Object.entries(obj).map(([v, l]) => `<option value="${esc(v)}"${cur === v ? ' selected' : ''}>${esc(l)}</option>`).join('');
  const plans = Object.fromEntries(config.plans.map((p) => [p.id, `${p.name} (R$ ${p.price})`]));
  return `<div class="two">
  <div class="field"><label for="e-nome">Nome</label><input type="text" id="e-nome" name="nome" value="${esc(c.name || '')}"></div>
  <div class="field"><label for="e-email">E-mail ${isNew ? '<span class="req">(obrigatório)</span>' : ''}</label><input type="email" id="e-email" name="email" value="${esc(c.email || '')}" required></div>
</div>
<div class="two">
  <div class="field"><label for="e-tel">Telefone</label><input type="tel" id="e-tel" name="telefone" value="${esc(c.phone || '')}"></div>
  <div class="field"><label for="e-plano">Plano</label><select id="e-plano" name="plano"><option value="">Não identificado</option>${opt(plans, c.plan_id)}</select></div>
</div>
<div class="two">
  <div class="field"><label for="e-status">Status</label><select id="e-status" name="status">${opt(STATUS, c.status || 'ativo')}</select></div>
  <div class="field"><label for="e-etapa">Etapa</label><select id="e-etapa" name="etapa">${opt(STAGES, c.stage || 'aguardando_onboarding')}</select></div>
</div>
<div class="two">
  <div class="field"><label for="e-pag">Pagamento</label><select id="e-pag" name="pagamento"><option value="">Sem confirmação</option><option value="1"${c.payment_confirmed === 1 ? ' selected' : ''}>Confirmado</option><option value="0"${c.payment_confirmed === 0 ? ' selected' : ''}>Não confirmado</option></select></div>
  <div class="field"><label for="e-custo">Custo mensal deste cliente</label><p class="hint" id="h-custo">Deixe vazio para usar o custo do plano.</p><input type="text" inputmode="decimal" id="e-custo" name="custo" value="${c.cost_override != null ? esc(String(c.cost_override).replace('.', ',')) : ''}" aria-describedby="h-custo" placeholder="Ex.: 97,00"></div>
</div>
<label class="check check--plain"><input type="checkbox" name="teste" value="1"${c.is_test ? ' checked' : ''}><span>Cliente de teste (não entra no lucro e pode ser apagado em massa)</span></label>`;
}

function renderNewCustomer({ errors = [], values = {}, unread }) {
  return shell({
    title: 'Novo cliente',
    active: 'clientes',
    unread,
    body: `<p><a class="link" href="${A()}/clientes">Voltar para clientes</a></p>
<h1>Novo cliente</h1>
<p class="lede">Para vendas feitas fora da Cakto, ou para cadastrar alguém antes do pagamento.</p>
${errors.length ? `<div class="notice notice--solid" role="alert">${errors.map(esc).join(' ')}</div>` : ''}
<form class="form" method="post" action="${A()}/clientes/novo">
  <fieldset><legend>Dados</legend>
  ${customerForm({ status: 'pendente', ...values }, { isNew: true })}
  <label class="check check--plain"><input type="checkbox" name="enviar" value="1" checked><span>Enviar o link de onboarding por e-mail agora</span></label>
  </fieldset>
  <div class="form__submit"><button class="btn btn--dark" type="submit">Criar cliente</button></div>
</form>`,
  });
}

function contractPill(status) {
  const C = require('./contract');
  const tone = { aceito: 'on', cancelado: 'off', criado: 'warn', enviado: '', visualizado: '' }[status] || '';
  return pill(C.STATUS[status] || status, tone);
}

function contractCard(c, contracts) {
  const C = require('./contract');
  const cur = contracts.find((x) => x.status !== 'cancelado');
  const old = contracts.filter((x) => x !== cur);
  const actions = cur
    ? `<div class="copy-field"><input type="text" readonly value="${esc(C.link(cur))}" aria-label="Link do contrato" id="ct-link"><button class="btn btn--small btn--outline" type="button" data-copy="#ct-link">Copiar</button></div>
<div class="inline-actions">
  <a class="btn btn--small btn--outline" href="${esc(C.link(cur))}" target="_blank" rel="noopener">Ver contrato</a>
  ${cur.status !== 'aceito' ? `<form method="post" action="${A()}/contratos/${cur.id}/enviar"><button class="btn btn--small btn--dark" type="submit">${cur.sent_at ? 'Reenviar por e-mail' : 'Enviar por e-mail'}</button></form>` : ''}
  <form method="post" action="${A()}/contratos/${cur.id}/cancelar"><button class="btn btn--small btn--danger" type="submit" data-confirm="Cancelar este contrato? O link deixa de aceitar assinaturas.">Cancelar</button></form>
</div>`
    : `<form method="post" action="${A()}/clientes/${c.id}/contrato"><button class="btn btn--small btn--dark" type="submit">Gerar e enviar contrato</button></form>
<p class="hint">Usa o plano atual do cliente e os dados da empresa em Configurações.</p>`;
  const info = cur
    ? `<p>${contractPill(cur.status)} <span class="hint">Versão ${esc(cur.version)}</span></p>
<p class="hint">Criado ${fmtDate(cur.created_at)}${cur.sent_at ? `, enviado ${fmtDate(cur.sent_at)}` : ''}${cur.viewed_at ? `, aberto ${fmtDate(cur.viewed_at)}` : ''}${cur.accepted_at ? `, aceito ${fmtDate(cur.accepted_at)}` : ''}.</p>
${cur.status === 'aceito' ? `<p class="hint">Aceito por <strong>${esc(cur.accepted_name)}</strong> (${esc(cur.accepted_doc)}), IP ${esc(cur.accepted_ip)}.</p>` : ''}`
    : '<p><strong>Nenhum contrato ainda.</strong></p>';
  return `<section class="acard">
    <h2>Contrato</h2>
    ${info}
    ${actions}
    ${old.length ? `<p class="hint">${old.length} ${old.length === 1 ? 'contrato anterior cancelado' : 'contratos anteriores cancelados'}.</p>` : ''}
  </section>`;
}

function renderContracts({ contracts, unread, flash, auto }) {
  const C = require('./contract');
  const rows = contracts
    .map(
      (k) => `<tr>
  <td data-label="Cliente"><a href="${A()}/clientes/${k.customer_id}">${esc(k.c_name || k.c_email)}</a>${k.is_test ? ' ' + pill('teste', 'test') : ''}<br><span class="hint">${esc(k.c_email)}</span></td>
  <td data-label="Plano">${esc(k.c_plan || '-')}</td>
  <td data-label="Status">${contractPill(k.status)}</td>
  <td data-label="Enviado">${fmtDate(k.sent_at)}</td>
  <td data-label="Aceito">${k.accepted_at ? `${fmtDate(k.accepted_at)}<br><span class="hint">${esc(k.accepted_doc)}</span>` : '-'}</td>
  <td data-label="Link"><a href="${esc(C.link(k))}" target="_blank" rel="noopener">Abrir</a></td>
</tr>`
    )
    .join('');
  const counts = contracts.reduce((m, k) => ((m[k.status] = (m[k.status] || 0) + 1), m), {});
  return shell({
    title: 'Contratos',
    active: 'contratos',
    unread,
    flash,
    body: `<h1>Contratos</h1>
<p class="lede">Contratos de prestação de serviço enviados aos clientes. Para enviar um novo, abra o cliente e use "Gerar e enviar contrato".</p>
<div class="kpis kpis--small">
  ${kpi('Aceitos', counts.aceito || 0)}
  ${kpi('Aguardando aceite', (counts.enviado || 0) + (counts.visualizado || 0) + (counts.criado || 0))}
  ${kpi('Abertos sem aceite', counts.visualizado || 0)}
  ${kpi('Envio automático', auto ? 'Ligado' : 'Desligado', `<a class="link" href="${A()}/configuracoes#contrato">Mudar</a>`)}
</div>
<div class="table-box"><table class="rtable">
<thead><tr><th>Cliente</th><th>Plano</th><th>Status</th><th>Enviado</th><th>Aceito</th><th>Link</th></tr></thead>
<tbody>${rows || '<tr><td colspan="6" class="empty">Nenhum contrato ainda.</td></tr>'}</tbody>
</table></div>
<p class="hint">Modelo público: <a class="link" href="/contrato" target="_blank" rel="noopener">${esc(config.publicUrl)}/contrato</a></p>`,
  });
}


// ---------- foto do cliente ----------
const initials = (c) =>
  String(c.name || c.email || '?')
    .replace(/@.*/, '')
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('') || '?';
function avatar(c, size = '') {
  const cls = `avatar${size ? ' avatar--' + size : ''}${c.photo_v ? ' has-photo' : ''}`;
  const inner = c.photo_v
    ? `<img src="${A()}/clientes/${c.id}/foto?v=${esc(String(c.photo_v))}" alt="" width="256" height="256" loading="lazy">`
    : esc(initials(c));
  return `<span class="${cls}" data-avatar aria-hidden="true">${inner}</span>`;
}

function photoCard(c) {
  return `<section class="acard">
    <h2>Foto</h2>
    <p class="hint">Logo ou foto do cliente, usada como ícone no painel. Cortamos em quadrado e reduzimos para 256 px.</p>
    <div class="photo-row">
      ${avatar(c, 'large')}
      <div class="inline-actions">
        <label class="btn btn--small btn--dark file-btn">Escolher imagem<input type="file" accept="image/png,image/jpeg,image/webp" data-photo-upload="${A()}/clientes/${c.id}/foto" aria-label="Escolher foto do cliente"></label>
        <form method="post" action="${A()}/clientes/${c.id}/foto/apagar" data-photo-remove${c.photo_v ? '' : ' hidden'}><button class="btn btn--small btn--outline" type="submit" data-confirm="Remover a foto deste cliente?">Remover</button></form>
      </div>
    </div>
  </section>`;
}

function mapCard(c, answers) {
  const loc = AG.location(c, answers);
  return `<section class="acard" id="local">
    <h2>Localização</h2>
    <div class="loc"><div class="loc__map">
    ${loc.embed
      ? `<iframe class="map-frame" src="${esc(loc.embed)}" title="Mapa de ${esc(c.name || c.email)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`
      : '<p class="map-empty">Sem endereço ainda. Preencha abaixo, ou o cliente informa no onboarding.</p>'}
    ${loc.openUrl ? `<p><a class="link" href="${esc(loc.openUrl)}" target="_blank" rel="noopener">Abrir no Google Maps</a></p>` : ''}
    </div>
    <form class="form form--compact" method="post" action="${A()}/clientes/${c.id}/local" data-ajax>
      <div class="field"><label for="m-q">Endereço</label><input type="text" id="m-q" name="endereco" value="${esc(c.maps_query || '')}" placeholder="${esc(loc.query && !c.maps_query ? loc.query : 'Rua, número, bairro, cidade')}" autocomplete="off"></div>
      <div class="field"><label for="m-u">Link do Google Maps</label><p class="hint" id="h-mu">Opcional. No Google Maps: Compartilhar › Copiar link.</p><input type="url" id="m-u" name="link" value="${esc(c.maps_url || '')}" aria-describedby="h-mu" placeholder="https://maps.app.goo.gl/..."></div>
      <div><button class="btn btn--small btn--dark" type="submit">Salvar localização</button></div>
    </form></div>
  </section>`;
}

// ---------- agente no ZappMillion ----------
const num = (n) => Number(n || 0).toLocaleString('pt-BR');
function usageBlock(c) {
  const u = AG.usage(c);
  const today = new Date().toISOString().slice(0, 10);
  const cap = u.capacity
    ? `<p class="hint">Com ${num(u.limit)} respostas e cerca de ${String(AG.PROFILES[AG.profileFor(c)].porConversa).replace('.', ',')} respostas por conversa (estimativa do perfil), dá para atender umas <strong>${num(u.capacity.conversas)} conversas por mês</strong>, perto de ${num(u.capacity.porDia)} por dia.</p>`
    : '<p class="hint">Plano sem limite de respostas cadastrado em plans.json.</p>';
  let status = '<p>Informe abaixo quantas respostas o agente já usou (aparece no ZappMillion, em "Respostas do agente").</p>';
  if (u.known) {
    const w = Math.min(100, Math.round(u.pct * 100));
    const msg = {
      ok: `No ritmo atual, fecha o mês com cerca de ${num(u.projected)} respostas. Dentro do plano.`,
      atencao: `No ritmo atual, fecha o mês com cerca de ${num(u.projected)} respostas, perto do limite.`,
      vai_estourar: `No ritmo atual, as respostas acabam em ${u.runsOutIn} ${u.runsOutIn === 1 ? 'dia' : 'dias'} (projeção de ${num(u.projected)} no mês).`,
      estourou: 'As respostas do plano acabaram. O agente para de responder até a renovação.',
      sem_limite: '',
    }[u.state];
    status = `<div class="usage__nums"><span><strong>${num(u.used)}</strong> de ${num(u.limit)} respostas</span><span>${u.days} ${u.days === 1 ? 'dia' : 'dias'} de ciclo</span><span>${num(Math.round(u.perDay))} por dia</span></div>
    <div class="meter${['vai_estourar', 'estourou', 'atencao'].includes(u.state) ? ' meter--warn' : ''}" role="img" aria-label="${w}% das respostas usadas"><span style="width:${w}%"></span></div>
    <p>${pill({ ok: 'Dentro do plano', atencao: 'Atenção', vai_estourar: 'Vai faltar', estourou: 'Acabou' }[u.state] || '-', u.state === 'ok' ? 'on' : u.state === 'atencao' ? 'warn' : 'bad')} ${esc(msg)}</p>
    ${['vai_estourar', 'estourou', 'atencao'].includes(u.state) ? `<ul class="tips">
      ${AG.profileFor(c) !== 'economico' ? '<li>Mude o perfil para <strong>Econômico</strong> e atualize o prompt e o tempo de resposta no ZappMillion.</li>' : ''}
      <li>Complete os documentos de conhecimento (preços, pagamento, perguntas frequentes): menos idas e vindas.</li>
      <li>Defina um horário de atendimento no ZappMillion, se o cliente aceitar.</li>
      ${c.plan_id !== 'business' ? `<li>Ofereça o plano ${c.plan_id === 'start' ? 'Pro (8.000 respostas)' : 'Business (23.000 respostas)'}.</li>` : ''}
    </ul>` : ''}
    ${u.updatedAt ? `<p class="hint">Atualizado em ${fmtDate(u.updatedAt)}.</p>` : ''}`;
  }
  return `<div class="agent__block usage">
    <h3>Uso das respostas</h3>
    ${status}
    ${cap}
    <form class="usage-form" method="post" action="${A()}/clientes/${c.id}/uso" data-ajax>
      <div class="field"><label for="u-used">Respostas usadas</label><input type="number" id="u-used" name="usadas" min="0" step="1" inputmode="numeric" value="${c.usage_used ?? ''}" required></div>
      <div class="field"><label for="u-start">Ciclo começou em</label><input type="date" id="u-start" name="inicio" value="${c.usage_cycle_start ? esc(new Date(c.usage_cycle_start).toISOString().slice(0, 10)) : ''}" max="${today}" required></div>
      <button class="btn btn--small btn--dark" type="submit">Atualizar uso</button>
    </form>
  </div>`;
}

function agentSection(c, answers) {
  const key = AG.profileFor(c);
  const opts = Object.entries(AG.PROFILES)
    .map(([k, p]) => `<option value="${k}"${k === key ? ' selected' : ''}>${esc(p.label)}${AG.PLAN_PROFILE[c.plan_id] === k ? ' (padrão do plano)' : ''}</option>`)
    .join('');
  const head = `<div class="agent__head">
    <div><h2>Agente no ZappMillion</h2><p class="hint">Gerado a partir do onboarding. Revise antes de colar.</p></div>
    <form class="agent__profile" method="post" action="${A()}/clientes/${c.id}/agente" data-ajax>
      <div class="field"><label for="a-perfil">Perfil de economia</label><select id="a-perfil" name="perfil" data-autosubmit>${opts}</select></div>
      <noscript><button class="btn btn--small btn--dark" type="submit">Aplicar</button></noscript>
    </form>
  </div>
  <p>${esc(AG.PROFILES[key].resumo)}</p>`;

  if (!answers) {
    return `<section class="asection agent" id="agente">${head}<p class="empty">O cliente ainda não preencheu o onboarding. O prompt aparece aqui assim que ele enviar.</p>${usageBlock(c)}</section>`;
  }
  const g = AG.build(c, answers, key);
  const docs = g.docs
    .map((d, i) => `<article class="doc-card"><h4>${esc(d.title)}</h4><pre id="doc-${i}">${esc(d.content)}</pre><div><button class="btn btn--small btn--outline" type="button" data-copy-text="${esc(d.content)}">Copiar texto</button></div></article>`)
    .join('');
  const set = (label, value, copy) =>
    `<div><dt>${esc(label)}</dt><dd>${esc(value)}${copy ? ` <button class="btn btn--small btn--outline" type="button" data-copy-text="${esc(copy)}">Copiar</button>` : ''}</dd></div>`;

  return `<section class="asection agent" id="agente">
  ${head}

  <div class="agent__block">
    <div class="agent__bar"><h3>1. Importar de uma vez</h3>
      <a class="btn btn--small btn--dark" href="${A()}/clientes/${c.id}/agente.json" download>Baixar arquivo do agente (.json)</a></div>
    <p class="hint">No ZappMillion, importe o arquivo para criar o agente com prompt, tempo de resposta, idioma e documentos de conhecimento. Se a importação recusar os documentos, use os blocos abaixo.</p>
  </div>

  <div class="agent__block">
    <div class="agent__bar"><h3>2. Prompt</h3><button class="btn btn--small btn--dark" type="button" data-copy="#a-prompt">Copiar prompt</button></div>
    <label class="sr-only" for="a-prompt">Prompt do agente</label>
    <textarea class="prompt-box" id="a-prompt" rows="18" spellcheck="false">${esc(g.prompt)}</textarea>
    <p class="hint">Pode editar aqui antes de copiar. Edições não ficam salvas: o texto é gerado de novo a partir do onboarding.</p>
  </div>

  <div class="agent__block">
    <h3>3. Conhecimento (${g.docs.length} ${g.docs.length === 1 ? 'documento' : 'documentos'})</h3>
    <p class="hint">No ZappMillion, em Conhecimento, crie um documento para cada bloco, com o mesmo título.</p>
    <div class="docs">${docs || '<p class="doc-card doc-card--empty">Nenhum conteúdo no onboarding para virar documento.</p>'}</div>
  </div>

  <div class="agent__block">
    <h3>4. Ajustes</h3>
    <dl class="settings-list">
      ${set('Nome do agente', g.ajustes.nome, g.ajustes.nome)}
      ${set('Tempo de resposta', `mínimo ${g.ajustes.min} s, máximo ${g.ajustes.max} s`)}
      ${set('Idioma das respostas', g.ajustes.idioma)}
      ${set('E-mail para transferência', g.ajustes.email || 'admin da conta', g.ajustes.email)}
      ${set('Horário de atendimento', g.ajustes.horario)}
    </dl>
    <p class="hint">O tempo de resposta é o que mais economiza: o agente espera, junta as mensagens seguidas do contato e responde uma vez só.</p>
  </div>

  ${g.integracoes.length ? `<div class="agent__block"><h3>5. Integrações para conectar</h3><ul class="tips">${g.integracoes.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
  ${g.dicas.length ? `<div class="agent__block"><h3>Para gastar menos respostas</h3><ul class="tips">${g.dicas.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}

  ${usageBlock(c)}
</section>`;
}

function renderOnboardingPrint({ c, answers, onboarding }) {
  const rows = FIELDS.map(([k, label]) => {
    const val = labelOf(k, answers[k]);
    return `<div><dt>${esc(label)}</dt><dd>${esc(Array.isArray(val) ? val.join(', ') : val) || '-'}</dd></div>`;
  }).join('');
  return `<!doctype html>
<html lang="pt-BR">
<head>
${head({ title: `Onboarding de ${answers.empresa || c.name || c.email} | Painel Auronix`, noindex: true })}
</head>
<body>
<main class="print-sheet">
  <div class="print-sheet__head">
    <span class="print-sheet__brand">${SYMBOL}<span>auronix</span></span>
    <div class="inline-actions print-actions">
      <button class="btn btn--small btn--dark" type="button" data-print>Imprimir ou salvar PDF</button>
      <a class="btn btn--small btn--outline" href="${A()}/clientes/${c.id}">Voltar</a>
    </div>
  </div>
  <h1>Onboarding: ${esc(answers.empresa || c.name || c.email)}</h1>
  <p class="hint">Cliente: ${esc(c.name || '-')} · ${esc(c.email)} · Plano ${esc(c.plan_name || '-')} · Preenchido em ${fmtDate(onboarding.updated_at)}</p>
  <dl class="answers">${rows}<div><dt>Autorizou uso dos dados (LGPD)</dt><dd>${answers.lgpd ? 'Sim' : 'Não'}</dd></div></dl>
</main>
<script src="${asset('/js/admin.js')}" defer></script>
</body>
</html>`;
}

const timelineItem = (a) =>
  `<li class="timeline__item timeline__item--${esc(a.kind)}"><time>${fmtDate(a.created_at)}</time><p>${esc(a.text)}</p></li>`;

function renderCustomer({ c, onboarding, events, emails, activity, unread, flash, contracts = [] }) {
  const f = customerFinance(c);
  const link = c.onboarding_token ? `${config.publicUrl}/onboarding/${c.onboarding_token}` : '';
  const answers = onboarding ? JSON.parse(onboarding.answers) : null;
  const purchases = events.filter((e) => e.event === 'purchase_approved' || e.event === 'subscription_renewed');

  const answersHtml = answers
    ? `<dl class="answers">${FIELDS.map(([k, label]) => {
        const val = labelOf(k, answers[k]);
        return `<div><dt>${esc(label)}</dt><dd>${esc(Array.isArray(val) ? val.join(', ') : val) || '-'}</dd></div>`;
      }).join('')}<div><dt>Autorizou uso dos dados</dt><dd>${answers.lgpd ? 'Sim' : 'Não'}</dd></div></dl>`
    : '<p class="empty">O cliente ainda não preencheu o onboarding.</p>';

  const evRows = events
    .map(
      (e) => `<tr><td data-label="Recebido">${fmtDate(e.received_at)}</td><td data-label="Evento">${esc(EVENT_LABEL[e.event] || e.event)}</td><td data-label="Resultado">${esc(e.result || '-')}</td><td data-label="Pedido"><a class="mono" href="${A()}/pedidos/${e.id}">${esc((e.order_id || '-').slice(0, 13))}</a></td></tr>`
    )
    .join('');
  const emRows = emails
    .map(
      (m) => `<tr><td data-label="Data">${fmtDate(m.created_at)}</td><td data-label="Assunto">${esc(m.subject)}</td><td data-label="Status">${pill(m.status === 'enviado' ? 'Enviado' : m.status === 'falhou' ? 'Falhou' : 'Não enviado', m.status === 'enviado' ? 'on' : 'bad')}${m.error ? `<br><span class="hint">${esc(m.error)}</span>` : ''}</td></tr>`
    )
    .join('');
  const timeline = `<ol class="timeline" id="timeline">${
    activity.length ? activity.map(timelineItem).join('') : '<li class="empty" data-empty>Sem registros ainda.</li>'
  }</ol>`;

  const payBox =
    c.payment_confirmed === 1
      ? `<p><strong>Pagamento confirmado.</strong> ${purchases.length ? `Último pedido aprovado pela Cakto em ${fmtDate(purchases[0].received_at)}.` : 'Marcado à mão.'}</p>`
      : c.payment_confirmed === 0
      ? '<p><strong>Pagamento não confirmado.</strong> Marcado à mão como não pago.</p>'
      : `<p><strong>Sem confirmação de pagamento.</strong> ${purchases.length ? '' : 'Nenhuma compra aprovada da Cakto para este e-mail.'}</p>`;

  return shell({
    title: c.name || c.email,
    active: 'clientes',
    unread,
    flash,
    body: `<p><a class="link" href="${A()}/clientes">Voltar para clientes</a></p>
<div class="ahead">
  <div class="ahead__who">
    ${avatar(c)}
    <div>
      <h1>${esc(c.name || c.email)}</h1>
      <p class="ahead__sub">${esc(c.email)}${c.phone ? ' · ' + esc(c.phone) : ''}</p>
      <p class="ahead__pills">${statusPill(c.status)} ${paymentPill(c.payment_confirmed)} ${stagePill(c.stage)}${testPill(c)}</p>
    </div>
  </div>
</div>

<div class="kpis">
  ${kpi('Plano', esc(c.plan_name || 'não identificado'), f.plan ? `R$ ${esc(f.plan.price)}${esc(f.plan.period)}` : '')}
  ${kpi('Custo por mês', brl(f.cost), c.cost_override != null ? 'personalizado' : 'custo do plano')}
  ${kpi('Lucro por mês', brl(f.profit), `margem de ${pct(f.margin)}`, 'strong')}
  ${kpi('Após taxa da Cakto', f.net != null ? brl(f.net) : '-', f.fees != null ? `taxa de ${brl(f.fees)}` : 'taxa ainda não informada')}
</div>

<div class="agrid">
  <section class="acard">
    <h2>Pagamento</h2>
    ${payBox}
    <form class="inline-actions" method="post" action="${A()}/clientes/${c.id}/pagamento">
      <button class="btn btn--small btn--dark" name="valor" value="1" type="submit">Marcar como pago</button>
      <button class="btn btn--small btn--outline" name="valor" value="0" type="submit">Marcar como não pago</button>
    </form>
    <p class="hint">Pedido: <span class="mono">${esc(c.last_order_id || '-')}</span>${c.payment_method ? ` · ${esc(c.payment_method)}` : ''}${c.amount != null ? ` · ${brl(c.amount)}` : ''}</p>
  </section>

  <section class="acard">
    <h2>Onboarding</h2>
    ${onboarding ? `<p><strong>Preenchido</strong> em ${fmtDate(onboarding.updated_at)}.</p>` : '<p><strong>Ainda não preenchido.</strong></p>'}
    <p class="hint">E-mail com o link: ${c.onboarding_sent_at ? `enviado em ${fmtDate(c.onboarding_sent_at)}` : 'ainda não enviado'}</p>
    ${link ? `<div class="copy-field"><input type="text" readonly value="${esc(link)}" aria-label="Link de onboarding" id="ob-link"><button class="btn btn--small btn--outline" type="button" data-copy="#ob-link">Copiar</button></div>` : ''}
    <form method="post" action="${A()}/clientes/${c.id}/reenviar"><button class="btn btn--small btn--dark" type="submit">Enviar link por e-mail</button></form>
    ${onboarding ? `<div class="inline-actions"><span class="hint">Exportar respostas:</span>
      <a class="btn btn--small btn--outline" href="${A()}/clientes/${c.id}/onboarding/imprimir">PDF</a>
      <a class="btn btn--small btn--outline" href="${A()}/clientes/${c.id}/onboarding.txt" download>Texto</a>
      <a class="btn btn--small btn--outline" href="${A()}/clientes/${c.id}/onboarding.json" download>JSON</a></div>` : ''}
  </section>
</div>
<div class="agrid">
  ${contractCard(c, contracts)}
  ${photoCard(c)}
</div>
<div class="agrid agrid--one">
  ${mapCard(c, answers)}
</div>

${agentSection(c, answers)}

<section class="asection">
  <h2>Editar cliente</h2>
  <form class="form form--compact" method="post" action="${A()}/clientes/${c.id}/editar">
    ${customerForm(c)}
    <div class="form__submit"><button class="btn btn--dark" type="submit">Salvar alterações</button></div>
  </form>
</section>

<section class="asection">
  <h2>Notas e histórico</h2>
  <form class="form note-form" method="post" action="${A()}/clientes/${c.id}/nota" data-ajax data-reset>
    <label class="sr-only" for="n-text">Nova nota</label>
    <textarea id="n-text" name="texto" rows="2" placeholder="Ex.: liguei, vai mandar o catálogo amanhã" required></textarea>
    <button class="btn btn--small btn--dark" type="submit">Adicionar nota</button>
  </form>
  ${timeline}
</section>

<section class="asection">
  <h2>Respostas do onboarding</h2>
  ${answersHtml}
</section>

<section class="asection">
  <h2>Pedidos na Cakto</h2>
  <div class="table-box"><table class="rtable">
  <thead><tr><th>Recebido</th><th>Evento</th><th>Resultado</th><th>Pedido</th></tr></thead>
  <tbody>${evRows || '<tr><td colspan="4" class="empty">Nenhum evento da Cakto para este e-mail.</td></tr>'}</tbody>
  </table></div>
</section>

<section class="asection">
  <h2>E-mails enviados</h2>
  <div class="table-box"><table class="rtable">
  <thead><tr><th>Data</th><th>Assunto</th><th>Status</th></tr></thead>
  <tbody>${emRows || '<tr><td colspan="3" class="empty">Nenhum e-mail enviado para este cliente.</td></tr>'}</tbody>
  </table></div>
</section>

<section class="asection danger">
  <h2>Apagar cliente</h2>
  <p>Apaga o cliente, o onboarding, as notas e os pedidos deste e-mail. Não dá para desfazer.</p>
  <form method="post" action="${A()}/clientes/${c.id}/apagar"><button class="btn btn--danger" type="submit" data-confirm="Apagar ${esc(c.name || c.email)} e todos os dados dele? Não dá para desfazer.">Apagar cliente</button></form>
</section>`,
  });
}

// ---------- pedidos (webhooks) ----------
function renderOrders({ events, q, tipo, testes, check, unread, flash, testEvents }) {
  const types = Object.fromEntries(Object.entries(EVENT_LABEL));
  const rows = events
    .map(
      (e) => `<tr>
  <td data-label="Recebido">${fmtDate(e.received_at)}</td>
  <td data-label="Evento">${esc(EVENT_LABEL[e.event] || e.event)}${e.is_test ? ' ' + pill('teste', 'test') : ''}</td>
  <td data-label="Cliente">${e.customer_id ? `<a href="${A()}/clientes/${e.customer_id}">${esc(e.email)}</a>` : esc(e.email || '-')}</td>
  <td data-label="Resultado">${esc(e.result || '-')}</td>
  <td data-label="Pedido"><a class="mono" href="${A()}/pedidos/${e.id}">${esc((e.order_id || 'ver').slice(0, 13))}</a></td>
</tr>`
    )
    .join('');

  let checkBox = '';
  if (check) {
    const { term, found, purchases, customer } = check;
    checkBox = found
      ? `<div class="notice ${purchases ? 'notice--ok' : 'notice--solid'}" role="status"><strong>${purchases ? 'Pedido confirmado.' : 'Nenhuma compra aprovada.'}</strong> ${purchases ? `${purchases} ${purchases === 1 ? 'compra aprovada' : 'compras aprovadas'} pela Cakto para "${esc(term)}".` : `Há eventos para "${esc(term)}", mas nenhum de compra aprovada.`} ${customer ? `<a class="link" href="${A()}/clientes/${customer.id}">Abrir cliente</a>` : ''}</div>`
      : `<div class="notice notice--solid" role="status"><strong>Nada encontrado.</strong> Nenhum pedido da Cakto com "${esc(term)}". Se a venda acabou de acontecer, espere alguns segundos e confira de novo.</div>`;
  }

  return shell({
    title: 'Pedidos',
    active: 'pedidos',
    unread,
    flash,
    body: `<h1>Pedidos</h1>
<p class="lede">Tudo que a Cakto enviou pelo webhook. Endereço para cadastrar na Cakto: <span class="mono">${esc(config.publicUrl)}/webhooks/cakto</span></p>

<section class="acard acard--inline">
  <h2>Confirmar se alguém comprou</h2>
  <form class="form inline-form" method="get" action="${A()}/pedidos">
    <label class="sr-only" for="v-q">E-mail ou número do pedido</label>
    <input type="search" id="v-q" name="verificar" value="${esc(check?.term || '')}" placeholder="E-mail ou número do pedido">
    <button class="btn btn--dark" type="submit">Verificar</button>
  </form>
  ${checkBox}
</section>

<form class="form filters" method="get" action="${A()}/pedidos">
  <div class="field filters__q"><label for="p-q">Buscar</label><input type="search" id="p-q" name="q" value="${esc(q)}" placeholder="E-mail ou pedido"></div>
  ${filterSelect('tipo', 'Evento', types, tipo)}
  <label class="check check--plain filters__test"><input type="checkbox" name="testes" value="1"${testes ? ' checked' : ''}><span>Mostrar testes</span></label>
  <div class="filters__go"><button class="btn btn--dark btn--small" type="submit">Filtrar</button> <a class="link" href="${A()}/pedidos">Limpar</a></div>
</form>
${testEvents ? `<form method="post" action="${A()}/testes/apagar" class="testbar"><span>${testEvents} ${testEvents === 1 ? 'evento de teste' : 'eventos de teste'}.</span> <button class="btn btn--small btn--danger" type="submit" data-confirm="Apagar todos os clientes, pedidos e e-mails de teste? Não dá para desfazer.">Apagar todos os testes</button></form>` : ''}

<div class="table-box"><table class="rtable">
<thead><tr><th>Recebido</th><th>Evento</th><th>Cliente</th><th>Resultado</th><th>Pedido</th></tr></thead>
<tbody>${rows || '<tr><td colspan="5" class="empty">Nenhum evento recebido.</td></tr>'}</tbody>
</table></div>`,
  });
}

function renderOrder({ e, unread }) {
  let pretty = e.payload;
  try { pretty = JSON.stringify(JSON.parse(e.payload), null, 2); } catch {}
  return shell({
    title: 'Pedido',
    active: 'pedidos',
    unread,
    body: `<p><a class="link" href="${A()}/pedidos">Voltar para pedidos</a></p>
<h1>${esc(EVENT_LABEL[e.event] || e.event)}</h1>
<dl class="answers">
  <div><dt>Recebido</dt><dd>${fmtDate(e.received_at)}</dd></div>
  <div><dt>E-mail</dt><dd>${esc(e.email || '-')}</dd></div>
  <div><dt>Pedido</dt><dd class="mono">${esc(e.order_id || '-')}</dd></div>
  <div><dt>Resultado</dt><dd>${esc(e.result || '-')}</dd></div>
  <div><dt>Teste</dt><dd>${e.is_test ? 'Sim' : 'Não'}</dd></div>
</dl>
<h2 class="sub">Dados recebidos</h2>
<p class="hint">CPF, cartão, endereço e a chave secreta não são guardados.</p>
<pre class="code">${esc(pretty)}</pre>`,
  });
}

// ---------- mensagens ----------
function renderMessages({ messages, unread, flash }) {
  const items = messages
    .map(
      (m) => `<article class="msgcard${m.read_at ? '' : ' msgcard--new'}">
  <header><strong>${esc(m.name)}</strong>${m.read_at ? '' : ' ' + pill('nova', 'on')}<span class="hint">${fmtDate(m.created_at)}</span></header>
  <p class="hint"><a class="link" href="mailto:${esc(m.email)}?subject=${encodeURIComponent('Re: contato Auronix')}">${esc(m.email)}</a>${m.phone ? ` · ${esc(m.phone)}` : ''}${m.company ? ` · ${esc(m.company)}` : ''}</p>
  <p class="msgcard__text">${esc(m.message)}</p>
  <div class="inline-actions">
    <a class="btn btn--small btn--dark" href="mailto:${esc(m.email)}?subject=${encodeURIComponent('Re: contato Auronix')}">Responder por e-mail</a>
    <button class="btn btn--small btn--outline" type="button" data-copy-text="${esc(m.email)}" aria-label="Copiar o e-mail ${esc(m.email)}">Copiar e-mail</button>
    ${m.phone ? `<a class="btn btn--small btn--outline" href="https://wa.me/${esc(String(m.phone).replace(/\D/g, '').replace(/^(?!55)/, '55'))}" rel="noopener">WhatsApp</a>` : ''}
    ${m.read_at ? '' : `<form method="post" action="${A()}/mensagens/${m.id}/lida"><button class="btn btn--small btn--outline" type="submit">Marcar como lida</button></form>`}
    <form method="post" action="${A()}/mensagens/${m.id}/apagar"><button class="btn btn--small btn--danger" type="submit" data-confirm="Apagar esta mensagem?">Apagar</button></form>
  </div>
</article>`
    )
    .join('');
  return shell({
    title: 'Mensagens',
    active: 'mensagens',
    unread,
    flash,
    body: `<h1>Mensagens</h1>
<p class="lede">O que chega pelo formulário da página de contato. Cada mensagem também é enviada para o seu e-mail de avisos.</p>
${items || '<p class="empty">Nenhuma mensagem ainda.</p>'}`,
  });
}

// ---------- e-mails ----------
function renderEmails({ emails, provider, unread, flash, lastTest }) {
  const providerText = provider === 'resend' ? 'Resend' : provider === 'smtp' ? `SMTP (${esc(config.smtp.host)})` : 'Nenhum: os e-mails não estão saindo';
  const rows = emails
    .map(
      (m) => `<tr>
  <td data-label="Data">${fmtDate(m.created_at)}</td>
  <td data-label="Para">${m.customer_id ? `<a href="${A()}/clientes/${m.customer_id}">${esc(m.to_email)}</a>` : esc(m.to_email)}</td>
  <td data-label="Assunto">${esc(m.subject)}</td>
  <td data-label="Tipo">${esc(m.kind || '-')}</td>
  <td data-label="Status">${pill(m.status === 'enviado' ? 'Enviado' : m.status === 'falhou' ? 'Falhou' : 'Não enviado', m.status === 'enviado' ? 'on' : 'bad')}${m.error ? `<br><span class="hint">${esc(m.error)}</span>` : ''}</td>
</tr>`
    )
    .join('');
  return shell({
    title: 'E-mails',
    active: 'emails',
    unread,
    flash,
    body: `<h1>E-mails</h1>
<div class="agrid">
  <section class="acard">
    <h2>Configuração</h2>
    <dl class="answers answers--tight">
      <div><dt>Envio por</dt><dd>${providerText}</dd></div>
      <div><dt>Remetente</dt><dd>${esc(config.mailFrom)}</dd></div>
      <div><dt>Respostas vão para</dt><dd>${esc(config.replyTo)}</dd></div>
      <div><dt>Seus avisos vão para</dt><dd>${esc(config.adminNotifyEmail || 'não configurado')}</dd></div>
    </dl>
  </section>
  <section class="acard">
    <h2>Enviar e-mail de teste</h2>
    ${lastTest ? `<div class="notice ${lastTest.ok ? 'notice--ok' : 'notice--solid'}" role="status">${lastTest.ok ? `Enviado para ${esc(lastTest.to)}. Confira a caixa de entrada e o spam.` : `Não foi enviado: ${esc(lastTest.error)}`}</div>` : ''}
    <form class="form form--compact" method="post" action="${A()}/emails/teste">
      <div class="field"><label for="t-to">Para</label><input type="email" id="t-to" name="para" required value="${esc(lastTest?.to || config.adminNotifyEmail || '')}"></div>
      <div class="field"><label for="t-note">Mensagem (opcional)</label><textarea id="t-note" name="nota" rows="2"></textarea></div>
      <button class="btn btn--dark" type="submit">Enviar teste</button>
    </form>
  </section>
</div>
<section class="asection">
  <h2>Últimos envios</h2>
  <div class="table-box"><table class="rtable">
  <thead><tr><th>Data</th><th>Para</th><th>Assunto</th><th>Tipo</th><th>Status</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="5" class="empty">Nenhum e-mail enviado ainda.</td></tr>'}</tbody>
  </table></div>
</section>`,
  });
}

// ---------- configurações ----------
function renderSettings({ unread, flash, sessions, company, companyFields, auto, adminUser = '', authMode = 'local', testimonials = [] }) {
  const costRows = config.plans
    .map((p) => {
      const cost = planCost(p.id);
      return `<div class="cost-row">
  <label for="c-${esc(p.id)}"><strong>${esc(p.name)}</strong><span class="hint">Preço R$ ${esc(p.price)}${esc(p.period)}</span></label>
  <div class="money"><span>R$</span><input type="text" inputmode="decimal" id="c-${esc(p.id)}" name="custo_${esc(p.id)}" value="${esc(String(cost).replace('.', ','))}"></div>
  <span class="hint">Lucro: ${brl(p.priceNumber - cost)} (${p.priceNumber ? pct((p.priceNumber - cost) / p.priceNumber) : '-'})</span>
</div>`;
    })
    .join('');
  return shell({
    title: 'Configurações',
    active: 'config',
    unread,
    flash,
    body: `<h1>Configurações</h1>
<section class="asection">
  <h2>Custo mensal por plano</h2>
  <p class="hint">Quanto cada cliente custa por mês para você. Usado em todos os cálculos de lucro. Um cliente pode ter custo próprio na página dele.</p>
  <form class="form form--compact" method="post" action="${A()}/configuracoes/custos">
    ${costRows}
    <div class="form__submit"><button class="btn btn--dark" type="submit">Salvar custos</button></div>
  </form>
</section>
<section class="asection" id="empresa">
  <h2>Dados da empresa</h2>
  <p class="hint">Aparecem no contrato, nos termos, na política de privacidade, na página de transparência e no rodapé.${company.complete ? '' : ' <strong>Preencha antes de enviar contratos.</strong>'}</p>
  <form class="form form--compact" method="post" action="${A()}/configuracoes/empresa">
    ${Object.entries(companyFields).map(([k, f]) => `<div class="field"><label for="co-${k}">${esc(f.label)}</label><input type="text" id="co-${k}" name="empresa_${k}" value="${esc(company[k] || '')}" placeholder="${esc(f.placeholder)}"></div>`).join('')}
    <div class="form__submit"><button class="btn btn--dark" type="submit">Salvar dados</button></div>
  </form>
</section>
<section class="asection" id="contrato">
  <h2>Contrato</h2>
  <form class="form form--compact" method="post" action="${A()}/configuracoes/contrato">
    <label class="check check--plain"><input type="checkbox" name="auto" value="1"${auto ? ' checked' : ''}><span>Enviar o contrato automaticamente depois de cada compra aprovada pela Cakto</span></label>
    <div class="form__submit"><button class="btn btn--dark" type="submit">Salvar</button> <a class="link" href="/contrato" target="_blank" rel="noopener">Ver modelo</a></div>
  </form>
</section>
<section class="asection" id="depoimentos">
  <h2>Depoimentos na página inicial</h2>
  <p class="hint">Só publique o que o cliente escreveu ou disse, com autorização dele. Enquanto não houver nenhum, a página mostra exemplos de conversa marcados como "exemplo".</p>
  ${testimonials.length
    ? `<ul class="tlist">${testimonials.map((t) => `<li><div><strong>${esc(t.nome)}</strong>${t.negocio || t.cidade ? ` <span class="hint">${esc([t.negocio, t.cidade].filter(Boolean).join(' · '))}</span>` : ''}<p>${esc(t.texto)}</p></div>
      <form method="post" action="${A()}/configuracoes/depoimentos/apagar"><input type="hidden" name="id" value="${esc(t.id)}"><button class="btn btn--small btn--outline" type="submit" data-confirm="Tirar este depoimento do site?">Remover</button></form></li>`).join('')}</ul>`
    : '<p class="empty">Nenhum depoimento publicado.</p>'}
  <form class="form form--compact" method="post" action="${A()}/configuracoes/depoimentos">
    <div class="two">
      <div class="field"><label for="d-nome">Nome <span class="req">(obrigatório)</span></label><input type="text" id="d-nome" name="nome" maxlength="80" required></div>
      <div class="field"><label for="d-neg">Negócio</label><input type="text" id="d-neg" name="negocio" maxlength="80" placeholder="Ex.: Estúdio Lume, clínica de estética"></div>
    </div>
    <div class="field"><label for="d-cid">Cidade</label><input type="text" id="d-cid" name="cidade" maxlength="60"></div>
    <div class="field"><label for="d-txt">Depoimento <span class="req">(obrigatório)</span></label><textarea id="d-txt" name="texto" rows="3" maxlength="500" required></textarea></div>
    <label class="check check--plain"><input type="checkbox" name="autorizado" value="1" required><span>O cliente autorizou publicar este depoimento com o nome dele.</span></label>
    <div class="form__submit"><button class="btn btn--dark" type="submit">Publicar depoimento</button></div>
  </form>
</section>
<section class="asection">
  <h2>Endereços</h2>
  <dl class="answers answers--tight">
    <div><dt>Painel (guarde em segredo)</dt><dd class="mono">${esc(config.publicUrl + config.adminPath)}</dd></div>
    <div><dt>Webhook da Cakto</dt><dd class="mono">${esc(config.publicUrl)}/webhooks/cakto</dd></div>
    <div><dt>Página pós-compra</dt><dd class="mono">${esc(config.publicUrl)}/obrigado</dd></div>
  </dl>
  <p class="hint">Para mudar o endereço do painel ou quem pode entrar, edite ADMIN_PATH e ADMIN_EMAILS no arquivo .env e reinicie o serviço.</p>
</section>
<section class="asection">
  <h2>Acessos</h2>
  <p>Você entrou como <strong>${esc(adminUser)}</strong>${authMode === 'supabase' ? ' pelo Supabase Auth. Para trocar a senha, use o painel do Supabase (Authentication).' : '.'}</p>
  <p>${sessions} ${sessions === 1 ? 'sessão aberta' : 'sessões abertas'} (computador, celular etc.).</p>
  <form method="post" action="${A()}/configuracoes/sessoes"><button class="btn btn--outline" type="submit" data-confirm="Sair de todos os outros aparelhos?">Sair de todos os outros aparelhos</button></form>
</section>`,
  });
}

module.exports = {
  STATUS, STAGES, PAYMENT, fmtDate, flashBox, timelineItem, pendencias, agentSection, mapCard, renderOnboardingPrint, renderLogin, renderDashboard, renderCustomers, renderNewCustomer,
  renderCustomer, renderContracts, renderOrders, renderOrder, renderMessages, renderEmails, renderSettings,
};
