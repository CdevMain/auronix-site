// Formulário de onboarding: os campos que precisamos para configurar o agente.
const { esc, page } = require('./html');

const OBJETIVOS = [
  ['atendimento', 'Responder dúvidas e atender clientes'],
  ['vendas', 'Vender e enviar links de pagamento'],
  ['agendamento', 'Agendar horários'],
  ['qualificacao', 'Qualificar contatos antes de chegar na equipe'],
  ['suporte', 'Suporte pós-venda'],
  ['cobranca', 'Lembretes de pagamento e cobrança'],
];
const INTEGRACOES = [
  ['google_agenda', 'Google Agenda'],
  ['planilha', 'Planilha (Google Sheets ou Excel)'],
  ['crm', 'CRM'],
  ['catalogo', 'Catálogo do WhatsApp'],
  ['loja', 'Loja virtual'],
  ['nenhuma', 'Nenhuma por enquanto'],
];
const TONS = [
  ['proximo', 'Próximo e simpático'],
  ['profissional', 'Profissional e direto'],
  ['descontraido', 'Descontraído, com emojis'],
  ['formal', 'Formal'],
];

// Ordem e rótulos usados no formulário e no admin
const FIELDS = [
  ['empresa', 'Nome da empresa'],
  ['segmento', 'Segmento'],
  ['cidade', 'Cidade'],
  ['site', 'Site ou Instagram'],
  ['responsavel', 'Responsável'],
  ['contato_whatsapp', 'WhatsApp do responsável'],
  ['numero_agente', 'Número que o agente vai usar'],
  ['tipo_whatsapp', 'Tipo de WhatsApp'],
  ['objetivos', 'O que o agente deve fazer'],
  ['horario', 'Horário de atendimento da equipe'],
  ['fora_horario', 'Fora do horário, o agente deve'],
  ['produtos', 'Produtos, serviços e preços'],
  ['pagamento', 'Formas de pagamento e entrega'],
  ['faq', 'Perguntas frequentes'],
  ['tom', 'Tom de voz'],
  ['nome_agente', 'Nome do agente'],
  ['transferir', 'Quando passar para uma pessoa'],
  ['proibido', 'O que o agente nunca deve fazer'],
  ['integracoes', 'Integrações'],
  ['integracoes_detalhe', 'Detalhes das integrações'],
  ['observacoes', 'Observações'],
];
const MULTI = new Set(['objetivos', 'integracoes']);
const REQUIRED = ['empresa', 'segmento', 'responsavel', 'contato_whatsapp', 'numero_agente', 'produtos', 'transferir'];

function clean(body) {
  const out = {};
  for (const [key] of FIELDS) {
    let v = body[key];
    if (MULTI.has(key)) {
      v = (Array.isArray(v) ? v : v ? [v] : []).map((x) => String(x).slice(0, 60)).slice(0, 20);
    } else {
      v = typeof v === 'string' ? v.trim().slice(0, 8000) : '';
    }
    out[key] = v;
  }
  out.lgpd = body.lgpd === 'sim';
  return out;
}

function validate(answers) {
  const missing = REQUIRED.filter((k) => !answers[k]);
  if (!answers.lgpd) missing.push('lgpd');
  return missing;
}

function labelOf(key, value) {
  const lists = { objetivos: OBJETIVOS, integracoes: INTEGRACOES, tom: TONS };
  const list = lists[key];
  if (!list) return value;
  const map = Object.fromEntries(list);
  return Array.isArray(value) ? value.map((v) => map[v] || v).join(', ') : map[value] || value;
}

// ---------- renderização ----------
const v = (a, k) => esc(a?.[k] || '');
const req = '<span class="req">(obrigatório)</span>';

function text(a, key, label, { type = 'text', required, hint, autocomplete, placeholder } = {}) {
  return `<div class="field">
  <label for="f-${key}">${esc(label)} ${required ? req : ''}</label>
  ${hint ? `<p class="hint" id="h-${key}">${esc(hint)}</p>` : ''}
  <input type="${type}" id="f-${key}" name="${key}" value="${v(a, key)}"${required ? ' required' : ''}${hint ? ` aria-describedby="h-${key}"` : ''}${autocomplete ? ` autocomplete="${autocomplete}"` : ''}${placeholder ? ` placeholder="${esc(placeholder)}"` : ''}>
</div>`;
}
function area(a, key, label, { required, hint, rows = 5 } = {}) {
  return `<div class="field">
  <label for="f-${key}">${esc(label)} ${required ? req : ''}</label>
  ${hint ? `<p class="hint" id="h-${key}">${esc(hint)}</p>` : ''}
  <textarea id="f-${key}" name="${key}" rows="${rows}"${required ? ' required' : ''}${hint ? ` aria-describedby="h-${key}"` : ''}>${v(a, key)}</textarea>
</div>`;
}
function checks(a, key, label, options) {
  const sel = new Set(a?.[key] || []);
  return `<fieldset class="field" style="gap:12px">
  <legend class="label" style="font-size:15px;border:0;margin:0;padding:0">${esc(label)}</legend>
  <div class="checks">
    ${options.map(([val, text]) => `<label class="check"><input type="checkbox" name="${key}" value="${val}"${sel.has(val) ? ' checked' : ''}><span>${esc(text)}</span></label>`).join('\n    ')}
  </div>
</fieldset>`;
}
function select(a, key, label, options, { placeholder = 'Escolha uma opção' } = {}) {
  return `<div class="field">
  <label for="f-${key}">${esc(label)}</label>
  <select id="f-${key}" name="${key}">
    <option value="">${esc(placeholder)}</option>
    ${options.map(([val, text]) => `<option value="${val}"${a?.[key] === val ? ' selected' : ''}>${esc(text)}</option>`).join('\n    ')}
  </select>
</div>`;
}

function renderForm({ token, customer, answers, errors = [], saved = false, existing = false }) {
  const a = answers || {};
  const first = esc((customer.name || '').split(' ')[0]);
  const errorBox = errors.length
    ? `<div class="notice notice--solid" role="alert" tabindex="-1" id="erros"><strong>Faltam alguns campos.</strong> Preencha: ${errors
        .map((k) => esc(k === 'lgpd' ? 'autorização de uso dos dados' : (FIELDS.find((f) => f[0] === k) || [k, k])[1]))
        .join(', ')}.</div>`
    : '';
  const savedBox = saved
    ? `<div class="notice notice--solid" role="status"><strong>Respostas salvas.</strong> Já recebemos tudo e vamos começar a configurar o seu agente. Você pode voltar neste link para corrigir qualquer coisa.</div>`
    : existing
    ? `<div class="notice" role="status">Você já enviou este formulário. Se mudar algo e salvar de novo, usamos a versão mais recente.</div>`
    : '';

  const body = `
<h1>${first ? `${first}, vamos` : 'Vamos'} configurar seu agente</h1>
<p class="lede">Conte como o seu negócio funciona. Quanto mais detalhes, melhor o agente responde. Leva uns 10 minutos e você pode voltar neste link para editar depois.</p>
${errorBox}${savedBox}
<form class="form" method="post" action="/onboarding/${esc(token)}" novalidate>

<fieldset>
  <legend>Sua empresa</legend>
  <div class="two">
    ${text(a, 'empresa', 'Nome da empresa', { required: true, autocomplete: 'organization' })}
    ${text(a, 'segmento', 'Segmento', { required: true, placeholder: 'Ex.: clínica estética, loja de roupas' })}
  </div>
  <div class="two">
    ${text(a, 'cidade', 'Cidade', { autocomplete: 'address-level2' })}
    ${text(a, 'site', 'Site ou Instagram', { placeholder: '@suaempresa' })}
  </div>
</fieldset>

<fieldset>
  <legend>Contato e WhatsApp</legend>
  <div class="two">
    ${text(a, 'responsavel', 'Seu nome', { required: true, autocomplete: 'name' })}
    ${text(a, 'contato_whatsapp', 'Seu WhatsApp', { type: 'tel', required: true, autocomplete: 'tel', placeholder: '(51) 99999-9999' })}
  </div>
  <div class="two">
    ${text(a, 'numero_agente', 'Número que o agente vai usar', { type: 'tel', required: true, hint: 'O número que seus clientes já chamam.' })}
    ${select(a, 'tipo_whatsapp', 'Esse número usa', [['business', 'WhatsApp Business'], ['pessoal', 'WhatsApp comum'], ['api', 'API oficial do WhatsApp'], ['nao_sei', 'Não sei']])}
  </div>
</fieldset>

<fieldset>
  <legend>O que o agente vai fazer</legend>
  ${checks(a, 'objetivos', 'Marque tudo o que se aplica', OBJETIVOS)}
  <div class="two">
    ${text(a, 'horario', 'Horário de atendimento da equipe', { placeholder: 'Seg a sex, 9h às 18h' })}
    ${select(a, 'fora_horario', 'Fora desse horário, o agente deve', [['responder_tudo', 'Responder normalmente'], ['responder_e_avisar', 'Responder e avisar que a equipe retorna depois'], ['so_recado', 'Só anotar o recado']])}
  </div>
</fieldset>

<fieldset>
  <legend>O que o agente precisa saber</legend>
  ${area(a, 'produtos', 'Produtos ou serviços e preços', { required: true, rows: 7, hint: 'Liste o que você vende, valores, variações e prazos. Pode colar de uma tabela ou cardápio.' })}
  ${area(a, 'pagamento', 'Formas de pagamento e entrega', { rows: 4, hint: 'Pix, cartão, parcelamento, taxa de entrega, retirada etc.' })}
  ${area(a, 'faq', 'Perguntas que os clientes mais fazem', { rows: 7, hint: 'Escreva a pergunta e a resposta que você daria.' })}
</fieldset>

<fieldset>
  <legend>Jeito de falar e limites</legend>
  <div class="two">
    ${select(a, 'tom', 'Tom de voz', TONS)}
    ${text(a, 'nome_agente', 'Nome do agente', { hint: 'Opcional. Ex.: "Lia, da Estúdio Lume".' })}
  </div>
  ${area(a, 'transferir', 'Quando o agente deve passar a conversa para uma pessoa?', { required: true, rows: 4, hint: 'Ex.: reclamações, pedidos acima de R$ 1.000, pedidos de desconto.' })}
  ${area(a, 'proibido', 'O que o agente nunca deve fazer ou dizer?', { rows: 4, hint: 'Ex.: dar desconto, prometer prazo, falar de concorrentes.' })}
</fieldset>

<fieldset>
  <legend>Integrações</legend>
  ${checks(a, 'integracoes', 'Ferramentas que você já usa', INTEGRACOES)}
  ${area(a, 'integracoes_detalhe', 'Detalhes', { rows: 3, hint: 'Qual CRM, link da loja, qual agenda etc.' })}
  ${area(a, 'observacoes', 'Mais alguma coisa que devemos saber?', { rows: 4 })}
</fieldset>

<fieldset>
  <legend>Seus dados</legend>
  <label class="check check--plain"><input type="checkbox" name="lgpd" value="sim"${a.lgpd ? ' checked' : ''} required><span>Autorizo a Auronix a usar estas informações para configurar e operar o meu agente, conforme a LGPD. ${req}</span></label>
</fieldset>

<div class="form__submit">
  <button class="btn btn--dark" type="submit">Salvar respostas</button>
</div>
</form>
${errors.length ? '<script>document.getElementById("erros").focus()</script>' : ''}`;

  return page({ title: 'Onboarding | Auronix', body });
}

function renderInvalid(reason) {
  const msgs = {
    nao_encontrado: ['Link não encontrado', 'Esse link de onboarding não existe ou foi digitado errado. Confira o e-mail que enviamos ou peça um novo link abaixo.'],
    inativo: ['Acesso desativado', 'Esta assinatura não está ativa (reembolso, chargeback ou cancelamento). Se acha que é um engano, fale com a gente.'],
  };
  const [title, text] = msgs[reason] || msgs.nao_encontrado;
  return page({
    title: `${title} | Auronix`,
    body: `<h1>${esc(title)}</h1><p class="lede">${esc(text)}</p>
<p style="margin-top:32px"><a class="btn btn--dark" href="/obrigado#reenviar">Receber o link de novo</a></p>`,
  });
}

module.exports = { FIELDS, clean, validate, labelOf, renderForm, renderInvalid };
