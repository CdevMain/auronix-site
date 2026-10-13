const config = require('./config');
const { esc, SYMBOL, sitePage, icon } = require('./html');

const brl = (n, digits = 0) =>
  Number(n).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

// Preço de lançamento: só aparece se regularPrice e promoUntil estiverem preenchidos e a data não tiver passado
function promo(plan) {
  if (!plan.regularPrice || !plan.promoUntil) return null;
  const until = new Date(`${plan.promoUntil}T23:59:59-03:00`);
  const regular = config.toNumber(plan.regularPrice);
  if (Number.isNaN(until.getTime()) || until < new Date() || regular <= plan.priceNumber) return null;
  return { regular, until: until.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }) };
}

// Âncora verdadeira: quanto custa cada resposta em cada plano
function perResponse(plan) {
  if (!plan.responses || !plan.priceNumber) return null;
  const value = plan.priceNumber / plan.responses;
  const base = config.plans[0];
  const baseValue = base.responses ? base.priceNumber / base.responses : null;
  const saving = baseValue && plan.id !== base.id ? Math.round((1 - value / baseValue) * 100) : 0;
  return { value, saving, baseName: base.shortName || base.name };
}

function planCard(plan, index) {
  const p = promo(plan);
  const r = perResponse(plan);
  // Hierarquia de cor: o recomendado ganha o único botão colorido da página; o de entrada fica só contornado
  const cta = plan.highlight ? 'btn--accent' : index === 0 ? 'btn--outline' : 'btn--dark';
  return `
<article class="plan${plan.highlight ? ' plan--featured' : ''}" aria-labelledby="plano-${esc(plan.id)}">
  ${plan.tag ? `<p class="plan__tag${plan.highlight ? ' plan__tag--accent' : ''}">${esc(plan.tag)}</p>` : ''}
  <h3 id="plano-${esc(plan.id)}" class="plan__name">${esc(plan.name)}</h3>
  ${p ? `<p class="plan__was"><s aria-label="Preço normal R$ ${brl(p.regular)}">R$ ${brl(p.regular)}</s><span>Preço de lançamento até ${esc(p.until)}</span></p>` : ''}
  <p class="plan__price"><span class="plan__currency">R$</span><span class="plan__amount">${esc(plan.price)}</span><span class="plan__period">${esc(plan.period)}</span></p>
  ${r ? `<p class="plan__unit">R$ ${brl(r.value, 3)} por resposta${r.saving > 0 ? ` <span class="plan__save">${r.saving}% menos que o ${esc(r.baseName)}</span>` : ''}</p>` : ''}
  <p class="plan__summary">${esc(plan.summary)}</p>
  ${plan.lead ? `<p class="plan__lead">${esc(plan.lead)}</p>` : ''}
  <ul class="plan__features">
    ${plan.features.map((f) => `<li>${esc(f)}</li>`).join('\n    ')}
  </ul>
  <a class="btn ${cta} plan__cta" href="${esc(plan.checkoutUrl)}" rel="noopener">Assinar ${esc(plan.shortName || plan.name)}</a>
</article>`;
}

function comparisonTable() {
  if (!config.comparison.length) return '';
  const featured = config.plans.findIndex((p) => p.highlight);
  const cls = (i) => (i === featured ? ' class="compare__featured"' : '');
  return `
  <div class="compare">
    <h3 class="compare__title" id="t-compare">Compare os planos</h3>
    <div class="compare__box" role="region" aria-labelledby="t-compare" tabindex="0">
      <table>
        <thead><tr><th scope="col"><span class="sr-only">Recurso</span></th>${config.plans
          .map((p, i) => `<th scope="col"${cls(i)}>${esc(p.shortName || p.name)}</th>`)
          .join('')}</tr></thead>
        <tbody>
          <tr><th scope="row">Preço por mês</th>${config.plans.map((p, i) => `<td${cls(i)}><strong>R$ ${esc(p.price)}</strong></td>`).join('')}</tr>
          ${config.comparison
            .map(
              ([label, ...vals]) =>
                `<tr><th scope="row">${esc(label)}</th>${vals
                  .map((v, i) => `<td${cls(i)}>${v === '—' ? '<span aria-label="Não incluso">—</span>' : esc(v)}</td>`)
                  .join('')}</tr>`
            )
            .join('\n          ')}
          <tr class="compare__cta"><th scope="row"><span class="sr-only">Assinar</span></th>${config.plans
            .map((p, i) => `<td${cls(i)}><a class="btn btn--small ${p.highlight ? 'btn--accent' : 'btn--dark'}" href="${esc(p.checkoutUrl)}" rel="noopener">Assinar ${esc(p.shortName || p.name)}</a></td>`)
            .join('')}</tr>
        </tbody>
      </table>
    </div>
  </div>`;
}

function renderLanding() {
  const c = config;
  const body = `
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
    <h2 id="t-steps">Do pagamento ao agente <span class="onair"><span class="onair__dot" aria-hidden="true"></span>no ar</span></h2>
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
  <p class="section-lede">Assinatura mensal. Todos os planos incluem a configuração do agente. Quanto maior o plano, menos você paga por resposta.</p>
  <div class="plans__grid">
    ${c.plans.map(planCard).join('\n')}
  </div>
  <ul class="assure" aria-label="Garantias">
    <li>${icon('lock')}<span><strong>Pagamento seguro</strong>pela Cakto</span></li>
    <li>${icon('check')}<span><strong>Configuração inclusa</strong>em todos os planos</span></li>
    <li>${icon('calendar')}<span><strong>Sem fidelidade</strong>cancele quando quiser</span></li>
    <li>${icon('undo')}<span><strong>7 dias para desistir</strong>com o valor devolvido</span></li>
  </ul>
  ${comparisonTable()}
</section>

<section class="faq" id="duvidas" aria-labelledby="t-faq">
  <h2 id="t-faq">Dúvidas</h2>
  <div class="faq__list">
    <details>
      <summary>Como recebo o acesso depois de pagar?</summary>
      <p>Assim que a Cakto confirma o pagamento, você recebe no e-mail da compra um link pessoal para o onboarding. É por ele que você conta como o seu negócio funciona.</p>
    </details>
    <details>
      <summary>Qual plano devo escolher?</summary>
      <p>Pense em quantas mensagens o seu negócio recebe por mês. O Start cobre até 2.000 respostas do agente, o Pro até 8.000 e o Business até 23.000. Na dúvida, <a class="link" href="/contato">fale com a gente</a> e indicamos o plano certo.</p>
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
      <p>A assinatura é mensal. Para cancelar, fale com a gente pelo e-mail ${esc(c.contactEmail)} ou pela <a class="link" href="/contato">página de contato</a>.</p>
    </details>
    <details>
      <summary>O que acontece com os dados dos meus clientes?</summary>
      <p>Eles são usados só para o funcionamento do seu agente e tratados de acordo com a LGPD. Veja a <a class="link" href="/privacidade">política de privacidade</a>.</p>
    </details>
  </div>
</section>

<section class="cta-band" aria-labelledby="t-cta">
  <div class="cta-band__inner">
    <h2 id="t-cta">Pronto para o WhatsApp responder sozinho?</h2>
    <div class="cta-band__actions">
      <a class="btn btn--accent" href="#planos">Escolher plano</a>
      <a class="btn btn--light-outline" href="/contato">Tirar dúvidas</a>
    </div>
  </div>
</section>`;

  return sitePage({
    title: 'Auronix: agentes de IA para WhatsApp',
    description: 'A Auronix cria um agente de IA treinado no seu negócio para atender, vender e agendar pelo WhatsApp, a qualquer hora.',
    canonicalPath: '/',
    bodyClass: 'landing',
    extraHead: `<meta property="og:type" content="website">
<meta property="og:title" content="Auronix: agentes de IA para WhatsApp">
<meta property="og:description" content="Um agente treinado no seu negócio que atende, vende e agenda pelo WhatsApp, a qualquer hora.">
<meta property="og:url" content="${esc(c.publicUrl)}/">
<meta property="og:image" content="${esc(c.publicUrl)}/img/og.png">`,
    body,
    stickyCta: true,
  });
}

module.exports = { renderLanding, SYMBOL };
