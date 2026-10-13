// Páginas do site: contato, privacidade, cookies, termos, transparência, modelo de contrato e pós-compra.
const config = require('./config');
const { esc, sitePage, icon } = require('./html');
const { company } = require('./company');

const UPDATED = '12 de outubro de 2026';
const mailLink = () => `<a class="link" href="mailto:${esc(config.contactEmail)}">${esc(config.contactEmail)}</a>`;

function renderContato({ sent = false, errors = [], values = {} } = {}) {
  const v = (k) => esc(values[k] || '');
  const err = errors.length
    ? `<div class="notice notice--solid" role="alert" tabindex="-1" id="erros"><strong>Confira os campos:</strong> ${errors.map(esc).join(', ')}.</div>`
    : '';
  const ok = sent
    ? `<div class="notice notice--ok" role="status"><strong>Mensagem enviada.</strong> Respondemos no e-mail que você informou, normalmente em até 1 dia útil.</div>`
    : '';
  const wa = config.contactWhatsapp
    ? `<li>${icon('chat')}<span><span class="label">WhatsApp</span><a class="link" href="https://wa.me/${esc(config.contactWhatsapp)}" rel="noopener">Abrir conversa</a></span></li>`
    : '';
  return sitePage({
    title: 'Contato | Auronix',
    description: 'Fale com a Auronix sobre agentes de IA para o WhatsApp do seu negócio.',
    canonicalPath: '/contato',
    active: 'contato',
    stickyCta: true,
    body: `<section class="page">
  <div class="page__head">
    <h1>Fale com a gente</h1>
    <p class="lede">Quer saber qual plano combina com o seu negócio ou como o agente funcionaria no seu atendimento? Mande uma mensagem.</p>
  </div>
  <div class="contact">
    <div class="contact__form">
      ${ok}${err}
      <form class="form" method="post" action="/contato" novalidate>
        <div class="two">
          <div class="field"><label for="c-nome">Nome <span class="req">(obrigatório)</span></label><input type="text" id="c-nome" name="nome" value="${v('nome')}" autocomplete="name" required></div>
          <div class="field"><label for="c-email">E-mail <span class="req">(obrigatório)</span></label><input type="email" id="c-email" name="email" value="${v('email')}" autocomplete="email" required></div>
        </div>
        <div class="two">
          <div class="field"><label for="c-tel">WhatsApp</label><input type="tel" id="c-tel" name="telefone" value="${v('telefone')}" autocomplete="tel" placeholder="(51) 99999-9999"></div>
          <div class="field"><label for="c-emp">Empresa</label><input type="text" id="c-emp" name="empresa" value="${v('empresa')}" autocomplete="organization"></div>
        </div>
        <div class="field"><label for="c-msg">Mensagem <span class="req">(obrigatório)</span></label><textarea id="c-msg" name="mensagem" rows="6" required>${v('mensagem')}</textarea></div>
        <div class="hp" aria-hidden="true"><label for="c-site">Não preencha</label><input type="text" id="c-site" name="site" tabindex="-1" autocomplete="off"></div>
        <p class="hint">Usamos seus dados só para responder esta mensagem. <a class="link" href="/privacidade">Privacidade</a></p>
        <div class="form__submit"><button class="btn btn--dark" type="submit">Enviar mensagem</button></div>
      </form>
    </div>
    <aside class="contact__aside" aria-label="Outros canais">
      <ul class="contact__list">
        <li>${icon('mail')}<span><span class="label">E-mail</span><a class="link" href="mailto:${esc(config.contactEmail)}">${esc(config.contactEmail)}</a></span></li>
        ${wa}
        <li>${icon('doc')}<span><span class="label">Já é cliente?</span><span>Use o link de onboarding do seu e-mail ou <a class="link" href="/obrigado#reenviar">peça um novo</a>.</span></span></li>
      </ul>
    </aside>
  </div>
</section>
${errors.length ? '<script>document.getElementById("erros").focus()</script>' : ''}`,
  });
}

// Página de texto com índice lateral
function doc({ title, path, intro, sections, active = '' }) {
  const id = (i) => `s${i + 1}`;
  return sitePage({
    title: `${title} | Auronix`,
    canonicalPath: path,
    active,
    body: `<article class="page page--doc">
  <div class="page__head">
    <h1>${esc(title)}</h1>
    <p class="lede">${intro}</p>
    <p class="hint">Atualizado em ${UPDATED}.</p>
  </div>
  <div class="doc">
    <nav class="doc__toc" aria-label="Nesta página">
      <p class="doc__toc-title">Nesta página</p>
      <ol>${sections.map(([h], i) => `<li><a href="#${id(i)}">${esc(h)}</a></li>`).join('')}</ol>
    </nav>
    <div class="doc__body">
      ${sections.map(([h, html], i) => `<section id="${id(i)}"><h2>${esc(h)}</h2>${html}</section>`).join('\n      ')}
    </div>
  </div>
</article>`,
  });
}

function renderPrivacidade() {
  const co = company();
  return doc({
    title: 'Política de privacidade',
    path: '/privacidade',
    intro: 'Como a Auronix coleta, usa e protege os seus dados, de acordo com a Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018).',
    sections: [
      ['Quem é o responsável', `<p>${esc(co.show('name'))}, nome fantasia Auronix, CPF ou CNPJ ${esc(co.show('doc'))}, endereço ${esc(co.show('address'))}. Contato para assuntos de dados pessoais (encarregado): ${mailLink()}.</p>`],
      ['Quais dados coletamos', `<ul>
<li><strong>Na compra:</strong> nome, e-mail, telefone e dados do pedido enviados pela Cakto. Não recebemos nem guardamos dados de cartão nem CPF da compra.</li>
<li><strong>No contrato:</strong> nome ou razão social, CPF ou CNPJ, e-mail, data, IP e navegador do aceite eletrônico, para provar a contratação.</li>
<li><strong>No onboarding:</strong> as informações do seu negócio que você preenche para treinarmos o agente.</li>
<li><strong>No contato:</strong> nome, e-mail, telefone, empresa e a mensagem.</li>
<li><strong>Na navegação:</strong> se você aceitar os cookies de medição, o Google Analytics e o Microsoft Clarity registram páginas visitadas, cliques, rolagem, aparelho e região aproximada. Veja a <a class="link" href="/cookies">política de cookies</a>.</li>
<li><strong>Nas conversas do agente:</strong> as mensagens entre o agente e os clientes do contratante, tratadas por nós em nome dele.</li>
</ul>`],
      ['Para que usamos e com qual base legal', `<ul>
<li><strong>Prestar o serviço e cumprir o contrato</strong> (execução de contrato): configurar e operar o agente, enviar e-mails da assinatura, dar suporte.</li>
<li><strong>Cumprir obrigações legais</strong> (obrigação legal): registros fiscais e guarda exigida por lei.</li>
<li><strong>Segurança e prevenção de fraude</strong> (legítimo interesse): registros de acesso ao site e ao painel.</li>
<li><strong>Medir e melhorar o site</strong> (consentimento): Google Analytics e Microsoft Clarity, só se você aceitar.</li>
</ul>
<p>Não vendemos dados e não usamos as conversas dos clientes do contratante para publicidade nem para treinar modelos de terceiros.</p>`],
      ['Com quem compartilhamos', `<p>Só com os fornecedores necessários, listados na página de <a class="link" href="/transparencia">transparência</a>: pagamentos (Cakto), e-mails (Resend), hospedagem do site, a plataforma que conecta o agente ao WhatsApp e, com o seu consentimento, Google e Microsoft para medição. Alguns desses serviços guardam dados fora do Brasil, com as garantias previstas na LGPD.</p>`],
      ['Por quanto tempo guardamos', `<ul>
<li>Dados da assinatura e do contrato: enquanto ela durar e por até 5 anos depois, para fins legais e de defesa.</li>
<li>Mensagens de contato: até 2 anos.</li>
<li>Dados de medição: conforme os prazos do Google Analytics e do Microsoft Clarity descritos na política de cookies.</li>
</ul>`],
      ['Seus direitos', `<p>Você pode pedir confirmação, acesso, correção, anonimização, portabilidade ou exclusão dos seus dados, saber com quem foram compartilhados e revogar consentimentos, escrevendo para ${mailLink()}. Respondemos em até 15 dias. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).</p>
<p>Para mudar a sua escolha sobre cookies a qualquer momento, use <button type="button" class="link link--button" data-cookie-prefs>preferências de cookies</button>.</p>`],
      ['Segurança', `<p>O site usa HTTPS. O painel interno fica num endereço privado, com login e bloqueio contra tentativas repetidas. Dados de cartão ficam só com a Cakto. Os links de onboarding e de contrato são pessoais e impossíveis de adivinhar.</p>`],
    ],
  });
}

function renderCookies() {
  const rows = [
    ['aux_consent', 'auronix.cdev.com.br', 'Necessário', 'Guarda a sua escolha sobre cookies', '1 ano'],
    ['aux_sess', 'auronix.cdev.com.br', 'Necessário', 'Mantém o login no painel interno (só para a equipe)', '14 dias'],
    ['_ga', 'Google Analytics', 'Medição', 'Distingue visitantes de forma anônima', 'até 2 anos'],
    ['_ga_*', 'Google Analytics', 'Medição', 'Mantém o estado da sessão de navegação', 'até 2 anos'],
    ['_clck', 'Microsoft Clarity', 'Medição', 'Identifica o mesmo visitante entre visitas', '1 ano'],
    ['_clsk', 'Microsoft Clarity', 'Medição', 'Junta as páginas de uma mesma visita', '1 dia'],
    ['CLID, MUID, ANONCHK, SM, MR', 'Microsoft Clarity / Bing', 'Medição', 'Identificação e funcionamento do Clarity', 'de minutos até 1 ano'],
  ];
  return doc({
    title: 'Política de cookies',
    path: '/cookies',
    intro: 'Quais cookies o site usa, para quê e como mudar a sua escolha.',
    sections: [
      ['O que são cookies', `<p>São pequenos arquivos que o site guarda no seu navegador. Usamos dois tipos: necessários, que fazem o site funcionar, e de medição, que mostram como o site é usado.</p>`],
      ['Medição só com o seu aceite', `<p>O Google Analytics e o Microsoft Clarity não são carregados até você clicar em <strong>Aceitar</strong> no aviso de cookies. Se recusar, o site funciona normalmente, sem nenhum deles.</p>
<p>O Microsoft Clarity registra como a página é usada (cliques, rolagem e movimentos) e, por padrão, mascara o conteúdo digitado em campos de formulário.</p>`],
      ['Lista de cookies', `<div class="table-box"><table class="rtable">
<thead><tr><th>Nome</th><th>De quem</th><th>Tipo</th><th>Para quê</th><th>Duração</th></tr></thead>
<tbody>${rows.map((r) => `<tr><td data-label="Nome" class="mono">${esc(r[0])}</td><td data-label="De quem">${esc(r[1])}</td><td data-label="Tipo">${esc(r[2])}</td><td data-label="Para quê">${esc(r[3])}</td><td data-label="Duração">${esc(r[4])}</td></tr>`).join('')}</tbody>
</table></div>
<p class="hint">Os nomes e prazos dos cookies do Google e da Microsoft são definidos por eles e podem mudar.</p>`],
      ['Como mudar a sua escolha', `<p>Abra as <button type="button" class="link link--button" data-cookie-prefs>preferências de cookies</button> a qualquer momento. Se você retirar o aceite, apagamos os cookies de medição deste site e a página recarrega sem eles. Você também pode apagar cookies nas configurações do navegador.</p>`],
      ['Mais informações', `<p>Políticas dos fornecedores: <a class="link" href="https://policies.google.com/privacy" rel="noopener">Google</a> e <a class="link" href="https://privacy.microsoft.com/pt-br/privacystatement" rel="noopener">Microsoft</a>. Dúvidas: ${mailLink()}.</p>`],
    ],
  });
}

function renderTransparencia() {
  const co = company();
  const plans = config.plans
    .map((p) => `<tr><td data-label="Plano"><strong>${esc(p.name)}</strong></td><td data-label="Preço">R$ ${esc(p.price)}${esc(p.period)}</td><td data-label="Respostas por mês">${Number(p.responses || 0).toLocaleString('pt-BR')}</td><td data-label="Por resposta">R$ ${(p.priceNumber / (p.responses || 1)).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td></tr>`)
    .join('');
  const vendors = [
    ['Cakto', 'Pagamentos e assinaturas', 'Nome, e-mail, telefone, dados do pedido'],
    ['Resend', 'Envio de e-mails da assinatura', 'Nome e e-mail'],
    ['Servidor VPS da Auronix', 'Hospedagem do site e do banco de dados', 'Dados de clientes, contratos e onboarding'],
    ['Plataforma de agentes e API oficial do WhatsApp (Meta)', 'Funcionamento do agente', 'Conversas entre o agente e os clientes do contratante'],
    ['Google Analytics', 'Medição do site (só com aceite)', 'Navegação, aparelho e região aproximada'],
    ['Microsoft Clarity', 'Medição do site (só com aceite)', 'Cliques, rolagem e gravação mascarada da navegação'],
  ];
  return doc({
    title: 'Transparência',
    path: '/transparencia',
    intro: 'Quem somos, como cobramos, como o agente funciona e quais serviços usamos. Tudo num lugar só.',
    sections: [
      ['Quem somos', `<dl class="facts">
<div><dt>Empresa</dt><dd>${esc(co.show('name'))}</dd></div>
<div><dt>CPF ou CNPJ</dt><dd>${esc(co.show('doc'))}</dd></div>
<div><dt>Endereço</dt><dd>${esc(co.show('address'))}</dd></div>
<div><dt>Contato</dt><dd>${mailLink()}</dd></div>
</dl>`],
      ['Preços', `<p>Os preços são mensais, sem taxa de adesão e sem taxa escondida. A configuração do agente está incluída em todos os planos.</p>
<div class="table-box"><table class="rtable"><thead><tr><th>Plano</th><th>Preço</th><th>Respostas por mês</th><th>Por resposta</th></tr></thead><tbody>${plans}</tbody></table></div>`],
      ['Cobrança, cancelamento e reembolso', `<ul>
<li>A cobrança é feita pela Cakto e se renova todo mês.</li>
<li>Não há fidelidade: cancele quando quiser por ${mailLink()}. O cancelamento vale para as cobranças seguintes.</li>
<li>Contratou e desistiu? Você tem 7 dias para desistir e receber o valor de volta (artigo 49 do Código de Defesa do Consumidor).</li>
<li>Mudanças de preço são avisadas por e-mail com 30 dias de antecedência.</li>
</ul>`],
      ['Como o agente funciona', `<ul>
<li>O agente usa inteligência artificial para responder com base nas informações que você passou no onboarding.</li>
<li>Configuramos o agente para se apresentar como assistente virtual e para chamar uma pessoa da sua equipe quando o assunto pede.</li>
<li>Ele pode errar. Por isso você testa e aprova as respostas antes de ele falar com clientes, e pode pedir ajustes.</li>
<li>Usamos apenas a API oficial do WhatsApp e não fazemos envio em massa não solicitado.</li>
</ul>`],
      ['Serviços que usamos', `<div class="table-box"><table class="rtable"><thead><tr><th>Serviço</th><th>Para quê</th><th>Dados envolvidos</th></tr></thead><tbody>${vendors
        .map((v) => `<tr><td data-label="Serviço"><strong>${esc(v[0])}</strong></td><td data-label="Para quê">${esc(v[1])}</td><td data-label="Dados">${esc(v[2])}</td></tr>`)
        .join('')}</tbody></table></div>`],
      ['Contrato e documentos', `<ul>
<li><a class="link" href="/contrato">Modelo do contrato de prestação de serviços</a>: o mesmo texto que você recebe para aceitar, com seus dados.</li>
<li><a class="link" href="/termos">Termos de uso</a></li>
<li><a class="link" href="/privacidade">Política de privacidade</a></li>
<li><a class="link" href="/cookies">Política de cookies</a></li>
</ul>`],
    ],
  });
}

function renderTermos() {
  const co = company();
  return doc({
    title: 'Termos de uso',
    path: '/termos',
    intro: 'As regras para usar este site e contratar a Auronix.',
    sections: [
      ['Quem oferece', `<p>Este site é da Auronix, ${esc(co.show('name'))}, CPF ou CNPJ ${esc(co.show('doc'))}. Contato: ${mailLink()}.</p>`],
      ['O serviço', `<p>A Auronix configura e opera agentes de inteligência artificial que atendem clientes pelo WhatsApp. As condições completas da prestação de serviço estão no <a class="link" href="/contrato">contrato</a>, que cada cliente recebe e aceita eletronicamente.</p>`],
      ['Planos e pagamento', `<p>Os planos, preços e limites estão na <a class="link" href="/#planos">página de planos</a> e na página de <a class="link" href="/transparencia">transparência</a>. O pagamento é mensal, pela Cakto.</p>`],
      ['Uso do site', `<p>Não é permitido usar o site para enviar conteúdo ilegal, tentar acessar áreas restritas ou atrapalhar o funcionamento. Os textos, a marca e o visual do site pertencem à Auronix.</p>`],
      ['Uso permitido do agente', `<p>O agente não pode ser usado para spam, mensagens em massa não solicitadas, conteúdo ilegal, enganoso ou que viole as políticas do WhatsApp. O descumprimento permite a suspensão do serviço.</p>`],
      ['Cancelamento', `<p>A assinatura não tem fidelidade e pode ser cancelada a qualquer momento por ${mailLink()}. Contratações online têm 7 dias de direito de arrependimento (artigo 49 do CDC).</p>`],
      ['Alterações', `<p>Estes termos podem mudar. Clientes ativos são avisados por e-mail com antecedência.</p>`],
    ],
  });
}

function renderContratoModelo() {
  const { contractBody } = require('./contract');
  return sitePage({
    title: 'Modelo de contrato | Auronix',
    description: 'Modelo do contrato de prestação de serviços da Auronix.',
    canonicalPath: '/contrato',
    body: `<section class="page">
  <div class="page__head">
    <h1>Modelo de contrato</h1>
    <p class="lede">Este é o texto que cada cliente recebe por e-mail para aceitar, já preenchido com os dados dele e do plano contratado. Publicamos aqui para você ler antes de assinar.</p>
    <div class="page__actions"><a class="btn btn--accent" href="/#planos">Ver planos</a><button class="btn btn--outline" type="button" onclick="window.print()">Imprimir</button></div>
  </div>
  <article class="contract">${contractBody()}</article>
</section>`,
  });
}

function renderObrigado({ sent } = {}) {
  return sitePage({
    title: 'Pagamento recebido | Auronix',
    noindex: true,
    body: `<section class="page">
  <div class="page__head">
    <h1>Obrigado por assinar a Auronix</h1>
    <p class="lede">Assim que a Cakto confirmar o pagamento, enviamos para o e-mail da compra o link do onboarding. É por ele que você conta como o seu negócio funciona para treinarmos o seu agente.</p>
    <p class="lede">No Pix e no cartão a confirmação costuma ser imediata. No boleto, pode levar até 3 dias úteis.</p>
  </div>
  <ol class="next">
    <li><strong>Confirme o e-mail</strong><span>Chega em minutos, com o link do onboarding.</span></li>
    <li><strong>Preencha o onboarding</strong><span>Uns 10 minutos para contar sobre o seu negócio.</span></li>
    <li><strong>Aceite o contrato</strong><span>Você recebe o link por e-mail. Leva 2 minutos.</span></li>
  </ol>
  <div class="page__block" id="reenviar">
    <h2>Não recebeu o e-mail?</h2>
    <p class="lede">Confira a caixa de spam. Se não estiver lá, digite o e-mail usado na compra e enviamos o link de novo.</p>
    ${sent ? '<div class="notice notice--ok" role="status">Se houver uma assinatura ativa com esse e-mail, o link chega em alguns minutos.</div>' : ''}
    <form class="form inline-form" method="post" action="/reenviar">
      <label class="sr-only" for="f-email">E-mail usado na compra</label>
      <input type="email" id="f-email" name="email" required autocomplete="email" placeholder="seu@email.com">
      <button class="btn btn--dark" type="submit">Reenviar link</button>
    </form>
  </div>
</section>`,
  });
}

module.exports = { renderContato, renderPrivacidade, renderCookies, renderTransparencia, renderTermos, renderContratoModelo, renderObrigado };
