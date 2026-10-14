// Helpers de HTML: escape, ícones, cabeçalho, menu lateral, rodapé, aviso de cookies, carregamento e páginas de erro.
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => (v == null ? '' : String(v).replace(/[&<>"']/g, (c) => ESC[c]));

const SYMBOL_PATH = 'M50 6 A40 40 0 1 1 50 86 A40 40 0 1 1 50 6 Z M20 70 L40 82 L12 92 Z M50 24 C48 39 43 44 28 46 C43 48 48 53 50 68 C52 53 57 48 72 46 C57 44 52 39 50 24 Z';
const SYMBOL = `<svg viewBox="6 5 88 88" aria-hidden="true" focusable="false"><path fill="currentColor" d="${SYMBOL_PATH}"/></svg>`;

// Ícones de traço (24x24, herdam a cor do texto)
const ICON_PATHS = {
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  chat: '<path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.2A8.5 8.5 0 1 1 21 12Z"/>',
  tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9Z"/><circle cx="8" cy="8" r="1.5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14"/><path d="M12 17.5h.01"/>',
  send: '<path d="m22 2-7 20-4-9-9-4 20-7Z"/><path d="M22 2 11 13"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/>',
  doc: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8l-5-5Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  cookie: '<path d="M21 12.5A9 9 0 1 1 11.5 3a3 3 0 0 0 4 4 3 3 0 0 0 5.5 5.5Z"/><path d="M8.5 9.5h.01M15 15h.01M9.5 15.5h.01M12 12h.01"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z"/>',
  code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  bolt: '<path d="M13 3 5 14h6l-1 7 8-11h-6l1-7Z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  hand: '<path d="M7 11V6a1.5 1.5 0 0 1 3 0v4M10 10V4.5a1.5 1.5 0 0 1 3 0V10M13 10V5.5a1.5 1.5 0 0 1 3 0V11M16 9.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-2.7L3.6 15a1.5 1.5 0 0 1 2.4-1.8L7 14.5"/>',
  x: '<path d="M7 7l10 10M17 7 7 17"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  spark: '<path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7Z"/>',
};
const icon = (name, cls = 'ico') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON_PATHS[name] || ''}</svg>`;

// config é carregado sob demanda para evitar dependência circular
const cfg = () => require('./config');
const asset = (p) => `${p}?v=${cfg().assetVersion}`;

function head({ title, description = '', canonicalPath = null, noindex = false, extra = '' }) {
  const c = cfg();
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
${description ? `<meta name="description" content="${esc(description)}">` : ''}
${noindex ? '<meta name="robots" content="noindex, nofollow">' : ''}
${canonicalPath != null ? `<link rel="canonical" href="${esc(c.publicUrl + canonicalPath)}">` : ''}
<meta name="theme-color" content="#000000">
<link rel="icon" href="${asset('/favicon.ico')}" sizes="any">
<link rel="icon" href="${asset('/img/simbolo.svg')}" type="image/svg+xml">
<link rel="apple-touch-icon" href="${asset('/img/apple-touch-icon.png')}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${asset('/css/app.css')}">
<script>document.documentElement.classList.add('js')</script>
${extra}`;
}

// ---------- tela de carregamento com a logo ----------
function loader() {
  return `<div class="loader" id="loader" aria-hidden="true">
  <div class="loader__mark">
    <svg class="loader__logo" viewBox="6 5 88 88">
      <circle class="loader__ring" cx="50" cy="46" r="38.5" />
      <path class="loader__tail" d="M20 70 L40 82 L12 92 Z" />
      <path class="loader__star" d="M50 24 C52 39 57 44 72 46 C57 48 52 53 50 68 C48 53 43 48 28 46 C43 44 48 39 50 24 Z" />
    </svg>
    <span class="loader__word">auronix</span>
  </div>
  <div class="loader__bar"><span></span></div>
</div>
<script>try{if(sessionStorage.getItem('aux_seen'))document.getElementById('loader').classList.add('is-fast');sessionStorage.setItem('aux_seen','1')}catch(e){}</script>`;
}

// ---------- cabeçalho e menu lateral ----------
const NAV = [
  ['/#como-funciona', 'Como funciona', 'como', 'spark'],
  ['/#planos', 'Planos', 'planos', 'tag'],
  ['/#duvidas', 'Dúvidas', 'duvidas', 'help'],
  ['/contato', 'Contato', 'contato', 'send'],
];

function siteHeader(active = '') {
  const c = cfg();
  const link = ([href, label, key]) =>
    `<a class="nav__link" href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<header class="nav">
  <a class="brand" href="/" aria-label="Auronix, página inicial">
    <span class="brand__symbol">${SYMBOL}</span><span>auronix</span>
  </a>
  <nav class="nav__links" aria-label="Principal">
    ${NAV.map(link).join('\n    ')}
    <a class="btn btn--dark btn--small" href="/#planos">Assinar</a>
  </nav>
  <button class="nav__toggle" type="button" aria-controls="menu" aria-expanded="false" aria-label="Abrir menu">${icon('menu')}</button>
</header>
<div class="drawer" id="menu" hidden>
  <div class="drawer__scrim" data-close-menu></div>
  <aside class="drawer__panel" role="dialog" aria-modal="true" aria-label="Menu">
    <div class="drawer__top">
      <span class="brand"><span class="brand__symbol">${SYMBOL}</span><span>auronix</span></span>
      <button class="drawer__close" type="button" data-close-menu aria-label="Fechar menu">${icon('close')}</button>
    </div>
    <nav class="drawer__nav" aria-label="Menu do celular">
      ${NAV.map(([href, label, key, ic]) => `<a href="${href}"${active === key ? ' aria-current="page"' : ''}>${icon(ic)}<span>${label}</span></a>`).join('\n      ')}
      <a href="/transparencia">${icon('shield')}<span>Transparência</span></a>
    </nav>
    <div class="drawer__cta">
      <p>Planos a partir de <strong>R$ ${esc(c.plans[0]?.price || '')}/mês</strong>. Sem fidelidade.</p>
      <a class="btn btn--accent" href="/#planos" data-close-menu>Escolher meu plano</a>
      <a class="btn btn--light-outline" href="/contato" data-close-menu>Falar com a gente</a>
    </div>
    <p class="drawer__contact">${icon('mail')}<a href="mailto:${esc(c.contactEmail)}">${esc(c.contactEmail)}</a></p>
  </aside>
</div>`;
}

// ---------- rodapé ----------
function siteFooter() {
  const c = cfg();
  const { company } = require('./company');
  const co = company();
  const year = new Date().getFullYear();
  const link = (href, ic, label, attrs = '') => `<li><a href="${href}"${attrs}>${icon(ic)}<span>${label}</span></a></li>`;
  return `<footer class="footer">
 <div class="footer__inner">
  <div class="footer__grid">
    <div class="footer__brand">
      <a class="brand brand--footer" href="/" aria-label="Auronix, página inicial"><span class="brand__symbol">${SYMBOL}</span><span>auronix</span></a>
      <p class="footer__tagline">Agentes de IA para WhatsApp, configurados com cuidado para o seu negócio.</p>
      <p class="footer__hello">Ficou alguma dúvida? Escreva pra gente, respondemos com prazer.</p>
    </div>
    <nav class="footer__col" aria-labelledby="ft-site">
      <h2 class="footer__title" id="ft-site">Auronix</h2>
      <ul>
        ${link('/#como-funciona', 'spark', 'Como funciona')}
        ${link('/#planos', 'tag', 'Planos')}
        ${link('/#sobre', 'user', 'Quem faz')}
        ${link('/#duvidas', 'help', 'Dúvidas')}
      </ul>
    </nav>
    <nav class="footer__col" aria-labelledby="ft-docs">
      <h2 class="footer__title" id="ft-docs">Transparência</h2>
      <ul>
        ${link('/transparencia', 'shield', 'Transparência')}
        ${link('/contrato', 'doc', 'Modelo de contrato')}
        ${link('/termos', 'doc', 'Termos de uso')}
        ${link('/privacidade', 'lock', 'Privacidade')}
        ${link('/cookies', 'cookie', 'Cookies')}
        <li><button type="button" class="footer__prefs" data-cookie-prefs>${icon('cookie')}<span>Preferências de cookies</span></button></li>
      </ul>
    </nav>
    <div class="footer__col">
      <h2 class="footer__title">Fale com a gente</h2>
      <ul>
        ${link(`mailto:${esc(c.contactEmail)}`, 'mail', esc(c.contactEmail))}
        ${c.contactWhatsapp ? link(`https://wa.me/${esc(c.contactWhatsapp)}`, 'chat', 'WhatsApp', ' rel="noopener"') : ''}
        ${link('/contato', 'send', 'Formulário de contato')}
        <li class="footer__note">${icon('lock')}<span>Pagamento seguro pela Cakto</span></li>
      </ul>
    </div>
  </div>
  <div class="footer__bottom">
    <p>© ${year} Auronix${co.name ? ` · ${esc(co.name)}` : ''}${co.doc ? ` · ${esc(co.doc)}` : ''}</p>
    <p>Site desenvolvido por <a class="footer__dev" href="${esc(c.developer.url)}" rel="noopener">${esc(c.developer.name)}</a></p>
  </div>
 </div>
</footer>`;
}

// ---------- aviso de cookies (Analytics e Clarity só depois do aceite) ----------
function consentUi() {
  const a = cfg().analytics;
  if (!a.gaId && !a.clarityId) return '';
  return `<script id="aux-config" type="application/json">${JSON.stringify({ ga: a.gaId || '', clarity: a.clarityId || '' })}</script>
<section class="cookies" id="cookie-banner" hidden aria-labelledby="ck-title">
  <div class="cookies__text">
    <h2 id="ck-title">${icon('cookie')}Cookies</h2>
    <p>Usamos cookies de medição (Google Analytics e Microsoft Clarity) para entender como o site é usado e melhorá-lo. Eles só são ativados se você aceitar. <a class="link" href="/cookies">Saiba mais</a></p>
  </div>
  <div class="cookies__actions">
    <button class="btn btn--small btn--outline" type="button" data-consent="reject">Recusar</button>
    <button class="btn btn--small btn--outline" type="button" data-cookie-prefs>Personalizar</button>
    <button class="btn btn--small btn--dark" type="button" data-consent="accept">Aceitar</button>
  </div>
</section>
<dialog class="cookie-dialog" id="cookie-dialog" aria-labelledby="ckd-title">
  <form method="dialog" class="cookie-dialog__body">
    <h2 id="ckd-title">Preferências de cookies</h2>
    <label class="cookie-opt">
      <span><strong>Necessários</strong><span class="hint">Guardam a sua escolha sobre cookies e mantêm o site funcionando. Sempre ativos.</span></span>
      <input type="checkbox" checked disabled>
    </label>
    <label class="cookie-opt">
      <span><strong>Medição</strong><span class="hint">Google Analytics e Microsoft Clarity: páginas visitadas, cliques e rolagem, sem identificar você pelo nome.</span></span>
      <input type="checkbox" name="analytics" id="ck-analytics">
    </label>
    <div class="cookie-dialog__actions">
      <button class="btn btn--small btn--outline" value="reject" type="submit">Recusar todos</button>
      <button class="btn btn--small btn--dark" value="save" type="submit">Salvar escolha</button>
    </div>
  </form>
</dialog>`;
}

/** Página do site com menu, rodapé, carregamento e aviso de cookies. */
function sitePage({ title, description, canonicalPath, body, active = '', noindex = false, bodyClass = '', extraHead = '', scripts = '', stickyCta = false, showLoader = true }) {
  const c = cfg();
  const sticky = stickyCta
    ? `<div class="mcta" id="mcta" hidden>
  <p><span>Planos a partir de</span><strong>R$ ${esc(c.plans[0]?.price || '')}/mês</strong></p>
  <a class="btn btn--accent btn--small" href="/#planos">Ver planos</a>
</div>`
    : '';
  return `<!doctype html>
<html lang="pt-BR">
<head>
${head({ title, description, canonicalPath, noindex, extra: extraHead })}
</head>
<body class="${esc(bodyClass)}">
${showLoader ? loader() : ''}
<a class="skip" href="#conteudo">Pular para o conteúdo</a>
${siteHeader(active)}
<main id="conteudo">
${body}
</main>
${siteFooter()}
${sticky}
${consentUi()}
<script src="${asset('/js/site.js')}" defer></script>
${scripts}
</body>
</html>`;
}

/** Página simples (onboarding, contrato): só a marca no topo, sem medição. */
function page({ title, body, bodyClass = '', showLoader = true }) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
${head({ title, noindex: true })}
</head>
<body class="${esc(bodyClass)}">
${showLoader ? loader() : ''}
<header class="topbar">
  <a class="brand" href="/" aria-label="Auronix, página inicial">
    <span class="brand__symbol">${SYMBOL}</span><span>auronix</span>
  </a>
</header>
<main class="wrap" id="conteudo">
${body}
</main>
<script src="${asset('/js/site.js')}" defer></script>
</body>
</html>`;
}

// ---------- páginas de erro ----------
const ERRORS = {
  400: ['Não entendemos o pedido', 'Algum dado chegou incompleto ou num formato que o site não reconhece. Volte e tente de novo.'],
  401: ['Entre para continuar', 'Esta área precisa de login.'],
  403: ['Acesso negado', 'Você não tem permissão para ver esta página. Se o link veio de um e-mail nosso, ele pode ter sido desativado.'],
  404: ['Página não encontrada', 'O endereço não existe ou mudou de lugar. Confira o link ou volte para o início.'],
  405: ['Ação não permitida', 'Esta página não aceita esse tipo de envio.'],
  408: ['Demorou demais', 'A conexão ficou lenta e o pedido não chegou a tempo. Tente de novo.'],
  413: ['Envio grande demais', 'O conteúdo enviado passou do limite. Encurte os textos e tente de novo.'],
  415: ['Formato não aceito', 'O conteúdo chegou num formato que o site não aceita.'],
  429: ['Muitas tentativas', 'Foram muitos pedidos em pouco tempo. Espere alguns minutos e tente de novo.'],
  500: ['Algo deu errado aqui', 'O erro foi do nosso lado, não seu. Já ficou registrado. Tente de novo em instantes.'],
  502: ['Site em atualização', 'Estamos atualizando o site. Em um ou dois minutos ele volta.'],
  503: ['Fora do ar por instantes', 'O site está em manutenção rápida. Volte em alguns minutos.'],
  504: ['O servidor demorou para responder', 'Tente de novo em instantes.'],
};

function errorPage(status, { message, action } = {}) {
  const c = cfg();
  const [title, text] = ERRORS[status] || ERRORS[500];
  const btn = action || { href: '/', label: 'Voltar para o início' };
  return sitePage({
    title: `${title} | Auronix`,
    noindex: true,
    bodyClass: 'error-page',
    showLoader: false,
    body: `<section class="error">
  <p class="error__code" aria-hidden="true">${esc(status)}</p>
  <h1>${esc(title)}</h1>
  <p class="error__text">${esc(message || text)}</p>
  <div class="error__actions">
    <a class="btn btn--dark" href="${esc(btn.href)}">${esc(btn.label)}</a>
    <a class="link" href="/contato">Falar com a gente</a>
  </div>
  <p class="error__meta">Código ${esc(status)}. Se o problema continuar, escreva para <a href="mailto:${esc(c.contactEmail)}">${esc(c.contactEmail)}</a>.</p>
</section>`,
  });
}

module.exports = { esc, SYMBOL, SYMBOL_PATH, icon, asset, head, sitePage, page, errorPage, ERRORS };
