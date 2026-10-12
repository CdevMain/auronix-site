// Helpers de HTML: escape e layout base das páginas internas.
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => (v == null ? '' : String(v).replace(/[&<>"']/g, (c) => ESC[c]));

function page({ title, body, bodyClass = '', noindex = true }) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${noindex ? '<meta name="robots" content="noindex">' : ''}
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/img/simbolo.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/app.css">
</head>
<body class="${esc(bodyClass)}">
<header class="topbar">
  <a class="brand" href="/" aria-label="Auronix, página inicial">
    <img src="/img/simbolo.svg" width="28" height="28" alt=""><span>auronix</span>
  </a>
</header>
<main class="wrap">
${body}
</main>
</body>
</html>`;
}

module.exports = { esc, page };
