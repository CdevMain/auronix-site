const config = require('./config');
const { esc } = require('./html');

const SYMBOL = `<svg viewBox="6 5 88 88" aria-hidden="true" focusable="false"><path fill="currentColor" d="M50 6 A40 40 0 1 1 50 86 A40 40 0 1 1 50 6 Z M20 70 L40 82 L12 92 Z M50 24 C48 39 43 44 28 46 C43 48 48 53 50 68 C52 53 57 48 72 46 C57 44 52 39 50 24 Z"/></svg>`;

function planCard(plan) {
  return `
<article class="plan${plan.highlight ? ' plan--featured' : ''}" aria-labelledby="plano-${esc(plan.id)}">
  ${plan.highlight ? '<p class="plan__tag">Recomendado</p>' : ''}
  <h3 id="plano-${esc(plan.id)}" class="plan__name">${esc(plan.name)}</h3>
  <p class="plan__summary">${esc(plan.summary)}</p>
  <p class="plan__price"><span class="plan__currency">R$</span><span class="plan__amount">${esc(plan.price)}</span><span class="plan__period">${esc(plan.period)}</span></p>
  <ul class="plan__features">
    ${plan.features.map((f) => `<li>${esc(f)}</li>`).join('\n    ')}
  </ul>
  <a class="btn ${plan.highlight ? 'btn--light' : 'btn--dark'} plan__cta" href="${esc(plan.checkoutUrl)}" rel="noopener">Assinar ${esc(plan.name)}</a>
</article>`;
}

function renderLanding() {
  const wa = config.contactWhatsapp
    ? `<a href="https://wa.me/${esc(config.contactWhatsapp)}" rel="noopener">Falar no WhatsApp</a>`
    : '';
  const year = new Date().getFullYear();

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Auronix: agentes de IA para WhatsApp</title>
<meta name="description" content="A Auronix cria um agente de IA treinado no seu negócio para atender, vender e agendar pelo WhatsApp, a qualquer hora.">
<link rel="canonical" href="${esc(config.publicUrl)}/">
<meta property="og:type" content="website">
<meta property="og:title" content="Auronix: agentes de IA para WhatsApp">
<meta property="og:description" content="Um agente treinado no seu negócio que atende, vende e agenda pelo WhatsApp, a qualquer hora.">
<meta property="og:url" content="${esc(config.publicUrl)}/">
<meta property="og:image" content="${esc(config.publicUrl)}/img/og.png">
<meta name="theme-color" content="#000000">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/img/simbolo.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/app.css">
<script>document.documentElement.classList.add('js')</script>
</head>
<body class="landing">
<a class="skip" href="#conteudo">Pular para o conteúdo</a>

<header class="nav">
  <a class="brand" href="/" aria-label="Auronix, página inicial">
    <span class="brand__symbol">${SYMBOL}</span><span>auronix</span>
  </a>
  <nav aria-label="Principal">
    <a class="nav__link" href="#como-funciona">Como funciona</a>
    <a class="nav__link" href="#planos">Planos</a>
    <a class="nav__link" href="#duvidas">Dúvidas</a>
    <a class="btn btn--dark btn--small" href="#planos">Assinar</a>
  </nav>
</header>

<main id="conteudo">

<section class="hero">
  <div class="hero__copy">
    <h1>Seu WhatsApp atende, vende e agenda. Mesmo quando você não está.</h1>
    <p class="hero__lede">A Auronix cria um agente de IA treinado no seu negócio. Ele responde clientes na hora, apresenta produtos, marca horários e chama você quando a conversa precisa de uma pessoa.</p>
    <div class="hero__actions">
      <a class="btn btn--dark" href="#planos">Ver planos</a>
      <a class="link" href="#como-funciona">Como funciona</a>
    </div>
  </div>

  <figure class="chat" aria-label="Exemplo de conversa entre uma cliente e o agente de um estúdio, às 23h41">
    <div class="chat__head">
      <span class="chat__avatar">${SYMBOL}</span>
      <span class="chat__who"><strong>Estúdio Lume</strong><span>agente Auronix</span></span>
    </div>
    <ol class="chat__log">
      <li class="msg msg--in" style="--i:0"><p>Oi! Vocês têm horário amanhã à tarde?</p><time>23:41</time></li>
      <li class="msg msg--out" style="--i:1"><p>Oi, Marina! Amanhã temos 14h e 16h30 com a Carla. Qual fica melhor pra você?</p><time>23:41</time></li>
      <li class="msg msg--in" style="--i:2"><p>16h30</p><time>23:42</time></li>
      <li class="msg msg--out" style="--i:3"><p>Pronto, reservei amanhã às 16h30. Te mando um lembrete uma hora antes. Até lá!</p><time>23:42</time></li>
    </ol>
    <figcaption>Exemplo de atendimento às 23h41, sem ninguém da equipe acordado.</figcaption>
  </figure>
</section>

<section class="skills" aria-labelledby="t-skills">
  <h2 id="t-skills">O que o agente faz por você</h2>
  <dl class="skills__list">
    <div><dt>Responde na hora</dt><dd>Dúvidas, preços, horários e endereço, a qualquer hora, com as informações que você passou.</dd></div>
    <div><dt>Vende</dt><dd>Apresenta produtos, responde objeções e envia o link de pagamento no momento certo.</dd></div>
    <div><dt>Agenda</dt><dd>Consulta os horários livres, marca o atendimento e lembra o cliente antes.</dd></div>
    <div><dt>Chama você</dt><dd>Quando o assunto pede uma pessoa, ele avisa e passa a conversa com um resumo do que foi dito.</dd></div>
  </dl>
</section>

<section class="steps" id="como-funciona" aria-labelledby="t-steps">
  <div class="steps__inner">
    <h2 id="t-steps">Do pagamento ao agente no ar</h2>
    <ol class="steps__list">
      <li><h3>Escolha um plano</h3><p>O pagamento é feito com segurança pela Cakto.</p></li>
      <li><h3>Conte sobre o seu negócio</h3><p>Logo depois do pagamento, chega no seu e-mail o link do formulário de onboarding.</p></li>
      <li><h3>Aprove as respostas</h3><p>Treinamos o agente com o que você contou e você testa antes de ele falar com clientes.</p></li>
      <li><h3>Agente no ar</h3><p>Conectamos ao seu WhatsApp e seguimos ajustando conforme as conversas acontecem.</p></li>
    </ol>
  </div>
</section>

<section class="plans" id="planos" aria-labelledby="t-plans">
  <h2 id="t-plans">Planos</h2>
  <p class="section-lede">Assinatura mensal. Todos os planos incluem a configuração do agente.</p>
  <div class="plans__grid">
    ${config.plans.map(planCard).join('\n')}
  </div>
</section>

<section class="faq" id="duvidas" aria-labelledby="t-faq">
  <h2 id="t-faq">Dúvidas</h2>
  <div class="faq__list">
    <details>
      <summary>Como recebo o acesso depois de pagar?</summary>
      <p>Assim que a Cakto confirma o pagamento, você recebe no e-mail da compra um link pessoal para o onboarding. É por ele que você conta como o seu negócio funciona.</p>
    </details>
    <details>
      <summary>Preciso trocar de número?</summary>
      <p>Não precisa começar do zero. No onboarding você informa o número que o agente vai usar e nós orientamos a conexão.</p>
    </details>
    <details>
      <summary>E se o cliente perguntar algo que o agente não sabe?</summary>
      <p>Ele responde só com o que você ensinou. Quando não sabe, diz que vai confirmar e passa a conversa para você.</p>
    </details>
    <details>
      <summary>Posso mudar o que o agente fala?</summary>
      <p>Sim. Você pode voltar ao link do onboarding para atualizar informações, e os ajustes do seu plano cobrem mudanças no jeito de responder.</p>
    </details>
    <details>
      <summary>Como cancelo?</summary>
      <p>A assinatura é mensal. Para cancelar, fale com a gente pelo e-mail ${esc(config.contactEmail)}.</p>
    </details>
    <details>
      <summary>O que acontece com os dados dos meus clientes?</summary>
      <p>Eles são usados só para o funcionamento do seu agente e tratados de acordo com a LGPD.</p>
    </details>
  </div>
</section>

</main>

<footer class="footer">
 <div class="footer__inner">
  <div class="footer__brand">
    <span class="brand brand--footer"><span class="brand__symbol">${SYMBOL}</span><span>auronix</span></span>
    <p class="footer__tagline">Agentes de IA para WhatsApp</p>
  </div>
  <div class="footer__contact">
    <a href="mailto:${esc(config.contactEmail)}">${esc(config.contactEmail)}</a>
    ${wa}
  </div>
  <p class="footer__legal">© ${year} Auronix</p>
 </div>
</footer>

<script src="/js/landing.js" defer></script>
</body>
</html>`;
}

module.exports = { renderLanding, SYMBOL };
