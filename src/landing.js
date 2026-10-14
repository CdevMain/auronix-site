const config = require('./config');
const { esc, SYMBOL, sitePage, icon, asset } = require('./html');

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


// Depoimentos reais (cadastrados no painel, com autorização do cliente). Sem nenhum, mostra exemplos de uso
// claramente marcados como exemplo: nunca depoimento inventado.
function testimonials() {
  try {
    const db = require('./db');
    const list = JSON.parse(db.setting('depoimentos', '[]'));
    return Array.isArray(list) ? list.filter((t) => t && t.texto && t.nome) : [];
  } catch {
    return [];
  }
}

const EXAMPLES = [
  { seg: 'Clínica de estética', icon: 'calendar', msgs: [['in', 'Quanto custa a limpeza de pele? Tem horário essa semana?'], ['out', 'A limpeza de pele sai por R$ 180 e dura 1h. Tenho quinta às 15h ou sexta às 10h. Qual prefere?'], ['in', 'Quinta 15h'], ['out', 'Reservado! Te mando um lembrete na quarta.']] },
  { seg: 'Loja de roupas', icon: 'tag', msgs: [['in', 'Tem esse vestido no M?'], ['out', 'Tem sim! O vestido Aurora no M custa R$ 139, em até 3x sem juros. Quer o link para finalizar?'], ['in', 'Quero'], ['out', 'Aqui está o link. O frete é grátis acima de R$ 200.']] },
  { seg: 'Restaurante', icon: 'clock', msgs: [['in', 'Vocês entregam no centro? Até que horas?'], ['out', 'Entregamos no centro até as 23h, taxa de R$ 6. Quer ver o cardápio de hoje?'], ['in', 'Pode mandar'], ['out', 'Aqui está o cardápio. O prato do dia é parmegiana com fritas.']] },
];

function practiceSection() {
  const real = testimonials();
  if (real.length) {
    return `<section class="practice" id="relatos" aria-labelledby="t-practice">
  <p class="eyebrow">Relatos</p>
  <h2 id="t-practice">Quem já tem um agente no ar</h2>
  <div class="quotes">${real
    .slice(0, 6)
    .map((t) => `<figure class="quote">
      <blockquote><p>${esc(t.texto)}</p></blockquote>
      <figcaption><strong>${esc(t.nome)}</strong><span>${esc([t.negocio, t.cidade].filter(Boolean).join(' · '))}</span></figcaption>
    </figure>`)
    .join('')}</div>
</section>`;
  }
  return `<section class="practice" id="relatos" aria-labelledby="t-practice">
  <p class="eyebrow">Na prática</p>
  <h2 id="t-practice">Como fica no dia a dia</h2>
  <p class="section-lede">Exemplos de conversas que um agente da Auronix resolve sozinho, em negócios diferentes.</p>
  <div class="examples">${EXAMPLES.map((e) => `<figure class="example">
      <figcaption>${icon(e.icon)}<span>${esc(e.seg)}</span><em>exemplo</em></figcaption>
      <ol class="example__log">${e.msgs.map(([dir, text]) => `<li class="emsg emsg--${dir}">${esc(text)}</li>`).join('')}</ol>
    </figure>`).join('')}</div>
</section>`;
}

function renderLanding() {
  const c = config;
  const body = `
<section class="hero">
  <div class="hero__copy">
    <h1><span class="hl">Seu WhatsApp</span> atende, vende e agenda. Mesmo quando você não está.</h1>
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

<section class="why" id="por-que" aria-labelledby="t-why">
  <p class="eyebrow">Por que a Auronix</p>
  <h2 id="t-why">Um atendente que conhece o seu negócio. Não um robô genérico.</h2>
  <div class="versus">
    <div class="versus__col versus__col--before">
      <h3>Sem agente</h3>
      <ul>
        <li>${icon('x')}<span>A mensagem das 23h fica para amanhã, e o cliente compra de quem respondeu antes.</span></li>
        <li>${icon('x')}<span>Você repete a mesma resposta de preço e horário várias vezes por dia.</span></li>
        <li>${icon('x')}<span>Pedido de agendamento se perde no meio das conversas.</span></li>
      </ul>
    </div>
    <div class="versus__col versus__col--after">
      <h3>Com a Auronix</h3>
      <ul>
        <li>${icon('check')}<span>Resposta em segundos, a qualquer hora, com as informações que você aprovou.</span></li>
        <li>${icon('check')}<span>Preço, forma de pagamento e próximo passo na mesma mensagem.</span></li>
        <li>${icon('check')}<span>Horário marcado e você avisado quando a conversa precisa de uma pessoa.</span></li>
      </ul>
    </div>
  </div>
  <div class="reasons">
    <div class="reason">${icon('user')}<h3>Uma pessoa configura</h3><p>Cada agente é configurado e revisado à mão, a partir do que você conta no onboarding. Nada de modelo pronto.</p></div>
    <div class="reason">${icon('eye')}<h3>Você aprova antes</h3><p>Você testa as respostas e pede ajustes antes de o agente falar com qualquer cliente.</p></div>
    <div class="reason">${icon('hand')}<h3>Sabe a hora de parar</h3><p>Reclamação, negociação ou assunto fora do combinado vão para você, com o resumo da conversa.</p></div>
    <div class="reason">${icon('shield')}<h3>Preço claro, sem amarras</h3><p>Mensal, sem fidelidade e sem taxa de adesão. Regras de cancelamento publicadas na <a class="link" href="/transparencia">transparência</a>.</p></div>
  </div>
</section>

<section class="steps" id="como-funciona" aria-labelledby="t-steps">
  <div class="steps__inner">
    <p class="eyebrow eyebrow--inv">Começar é simples</p>
    <h2 id="t-steps">Do pagamento ao agente <span class="onair"><span class="onair__dot" aria-hidden="true"></span>no ar</span></h2>
    <p class="steps__lede">Você escolhe o plano e conta sobre o negócio. A configuração fica com a gente.</p>
    <ol class="flow">
      <li class="flow__card">
        <span class="flow__n" aria-hidden="true">01</span>
        <h3>Escolha um plano</h3>
        <p>O pagamento é feito com segurança pela Cakto.</p>
        <div class="demo" data-demo="plano" data-step="0" aria-hidden="true">
          <div class="demo__bar"><i></i><i></i><i></i><span>demonstração</span></div>
          <div class="demo__body">
            <div class="dplan" data-k="1"><span class="dradio"></span><span class="dplan__name">Start<small>2.000 respostas</small></span><b>R$ ${esc(c.plans[0]?.price || '')}</b></div>
            <div class="dplan is-on" data-k="2"><span class="dradio"></span><span class="dplan__name">Pro<small>8.000 respostas</small></span><b>R$ ${esc(c.plans[1]?.price || '')}</b></div>
            <div class="dplan" data-k="3"><span class="dradio"></span><span class="dplan__name">Business<small>23.000 respostas</small></span><b>R$ ${esc(c.plans[2]?.price || '')}</b></div>
            <span class="dbtn">Ir para o pagamento ${icon('arrowRight')}</span>
          </div>
        </div>
      </li>
      <li class="flow__card">
        <span class="flow__n" aria-hidden="true">02</span>
        <h3>Conte sobre o seu negócio</h3>
        <p>O link do onboarding chega no seu e-mail logo depois do pagamento.</p>
        <div class="demo" data-demo="onboarding" data-step="0" aria-hidden="true">
          <div class="demo__bar"><i></i><i></i><i></i><span>demonstração</span></div>
          <div class="demo__body">
            <span class="dlabel">Nome da empresa</span>
            <span class="dfield"><span data-type>Estúdio Lume</span><i class="dcaret"></i></span>
            <span class="dlabel">O que o agente deve fazer</span>
            <span class="dchips"><span class="dchip is-on" data-k="2">${icon('check')}Atender</span><span class="dchip is-on" data-k="3">${icon('check')}Agendar</span><span class="dchip is-on" data-k="4">${icon('check')}Vender</span></span>
            <span class="dprogress is-on"><span></span></span>
            <span class="dsent is-on">${icon('check')}Respostas enviadas</span>
          </div>
        </div>
      </li>
      <li class="flow__card">
        <span class="flow__n" aria-hidden="true">03</span>
        <h3>Aprove as respostas</h3>
        <p>Treinamos o agente com o que você contou. Você testa antes de ele falar com clientes.</p>
        <div class="demo" data-demo="aprovar" data-step="0" aria-hidden="true">
          <div class="demo__bar"><i></i><i></i><i></i><span>demonstração</span></div>
          <div class="demo__body">
            <span class="dmsg dmsg--in is-on">Vocês abrem sábado?</span>
            <span class="dmsg dmsg--out is-on"><span data-type>Abrimos sim, das 9h às 13h. Quer que eu reserve um horário?</span></span>
            <span class="dactions"><span class="dbtn dbtn--ghost">Ajustar</span><span class="dbtn dbtn--ok is-on">${icon('check')}Aprovar</span></span>
            <span class="dstamp is-on">${icon('check')}Resposta aprovada</span>
          </div>
        </div>
      </li>
      <li class="flow__card flow__card--live">
        <span class="flow__n" aria-hidden="true">04</span>
        <h3>Agente no ar</h3>
        <p>Conectamos ao seu WhatsApp e seguimos ajustando conforme as conversas acontecem.</p>
        <div class="demo" data-demo="noar" data-step="0" aria-hidden="true">
          <div class="demo__bar"><i></i><i></i><i></i><span>demonstração</span></div>
          <div class="demo__body">
            <span class="dlive is-on"><span class="dswitch is-on"><span></span></span><span class="dlive__label">Agente</span><span class="dlive__state"><span class="dlive__dot"></span><span class="dlive__off">desligado</span><span class="dlive__on">no ar</span></span></span>
            <span class="dstat"><span class="dstat__n" data-count="37">37</span><span class="dstat__l">respostas hoje</span></span>
            <span class="dbars is-on"><i style="--h:30%"></i><i style="--h:55%"></i><i style="--h:42%"></i><i style="--h:70%"></i><i style="--h:58%"></i><i style="--h:86%"></i><i style="--h:64%"></i></span>
            <span class="dlast is-on">${icon('clock')}Último atendimento às 23:41</span>
          </div>
        </div>
      </li>
    </ol>
    <p class="flow__note">${icon('lock')}<span>O link do onboarding é liberado assim que a Cakto confirma o pagamento.</span></p>
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

${practiceSection()}

<section class="about" id="sobre" aria-labelledby="t-about">
  <figure class="about__photo">
    <picture>
      <source srcset="${asset('/img/carlos.webp')}" type="image/webp">
      <img src="${asset('/img/carlos.jpg')}" alt="Carlos Eduardo, fundador da Auronix" width="640" height="640" loading="lazy" decoding="async">
    </picture>
    <figcaption><strong>Carlos Eduardo</strong><span>Fundador da Auronix</span></figcaption>
  </figure>
  <div class="about__text">
    <p class="eyebrow">Quem está por trás</p>
    <h2 id="t-about">Prazer, eu sou o Carlos.</h2>
    <p>Sou desenvolvedor full stack e designer. Comecei programando em Java no ecossistema do Minecraft e hoje crio produtos digitais de ponta a ponta, do wireframe ao deploy.</p>
    <p>Criei a Auronix para que pequenos e médios negócios tenham no WhatsApp um atendimento rápido e bem feito, com uma pessoa de verdade cuidando da configuração de cada agente. Quando você assina, é comigo que você fala.</p>
    <dl class="about__facts">
      <div><dt>4+ anos</dt><dd>em projetos digitais</dd></div>
      <div><dt>Full stack</dt><dd>e design de interfaces</dd></div>
      <div><dt>1 a 1</dt><dd>cada agente configurado à mão</dd></div>
    </dl>
    <p class="about__links">
      <a class="pill-link" href="https://cdev.com.br" rel="noopener">${icon('globe')}<span>Portfólio</span></a>
      <a class="pill-link" href="https://github.com/CdevMain" rel="noopener">${icon('code')}<span>GitHub</span></a>
      <a class="pill-link" href="https://www.linkedin.com/in/carlos-eduardo-058967230/" rel="noopener">${icon('user')}<span>LinkedIn</span></a>
    </p>
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
      <summary>E se eu desistir?</summary>
      <p>Contratou e mudou de ideia? Você tem 7 dias para desistir e receber o valor de volta (artigo 49 do CDC). Fora desse prazo, se o cancelamento vier depois de você enviar o onboarding e antes de o agente entrar no ar, devolvemos o valor pago menos o custo de criação do agente (${c.plans.map((p) => `${esc(p.shortName || p.name)} R$ ${brl(p.setupRetentionNumber)}`).join(', ')}). Detalhes no <a class="link" href="/contrato">contrato</a>.</p>
    </details>
    <details>
      <summary>O que acontece com os dados dos meus clientes?</summary>
      <p>Eles são usados só para o funcionamento do seu agente e tratados de acordo com a LGPD. Veja a <a class="link" href="/privacidade">política de privacidade</a>.</p>
    </details>
  </div>
  <div class="faq__ask">
    <div><h3>Não achou a sua dúvida?</h3><p>Pergunte direto pra gente. Respondemos por e-mail.</p></div>
    <a class="btn btn--dark" href="/contato#c-msg">${icon('send')}<span>Perguntar outra coisa</span></a>
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
