// Gera a configuração do agente no ZappMillion a partir do onboarding:
// prompt, documentos de conhecimento, ajustes e o arquivo de importação (.json).
// Também calcula o uso das respostas do plano (o ZappMillion conta cada resposta do agente).
const config = require('./config');

// ---------- perfis de economia ----------
// O tempo de resposta (debounce) é o que mais economiza: o agente espera, junta as mensagens seguidas do contato
// e responde uma vez só. As regras do prompt fazem o resto (resolver em menos mensagens).
// "porConversa" é uma estimativa inicial de respostas por conversa: ajuste olhando o uso real.
const PROFILES = {
  economico: {
    label: 'Econômico',
    min: 45,
    max: 90,
    porConversa: 3.5,
    resumo: 'Espera mais antes de responder e resolve em menos mensagens. Indicado para o Start.',
  },
  equilibrado: {
    label: 'Equilibrado',
    min: 25,
    max: 50,
    porConversa: 4.5,
    resumo: 'Bom meio-termo entre rapidez e economia. Indicado para o Pro.',
  },
  experiencia: {
    label: 'Experiência',
    min: 10,
    max: 25,
    porConversa: 6,
    resumo: 'Responde rápido e conversa com mais naturalidade. Indicado para o Business.',
  },
};
const PLAN_PROFILE = { start: 'economico', pro: 'equilibrado', business: 'experiencia' };
const profileFor = (c) => (PROFILES[c.agent_profile] ? c.agent_profile : PLAN_PROFILE[c.plan_id] || 'equilibrado');

const planOf = (c) => config.plans.find((p) => p.id === c.plan_id) || null;
const limitOf = (c) => Number(String(planOf(c)?.responses ?? '').replace(/\D/g, '')) || 0;

// ---------- localização ----------
const isUrl = (v) => /^https?:\/\//i.test(String(v || '').trim());
function location(c, answers) {
  const fromOnb = String(answers?.endereco || '').trim();
  const query = (c.maps_query || '').trim() || (fromOnb && !isUrl(fromOnb) ? fromOnb : '');
  const url = (c.maps_url || '').trim() || (isUrl(fromOnb) ? fromOnb : '');
  // Para o mapa embutido: endereço, ou o que der para tirar do link (coordenadas, ?q= ou nome do lugar)
  let embedQ = query;
  if (!embedQ && url) {
    const at = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    const q = url.match(/[?&](?:q|query)=([^&]+)/);
    const place = url.match(/\/place\/([^/@?]+)/);
    if (at) embedQ = `${at[1]},${at[2]}`;
    else if (q) embedQ = decodeURIComponent(q[1].replace(/\+/g, ' '));
    else if (place) embedQ = decodeURIComponent(place[1].replace(/\+/g, ' '));
  }
  const openUrl = url || (query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : '');
  return {
    query,
    url,
    openUrl,
    embed: embedQ ? `https://www.google.com/maps?q=${encodeURIComponent(embedQ)}&output=embed` : '',
  };
}

// ---------- textos ----------
const TOM = {
  proximo: 'simpática e próxima, com linguagem simples do dia a dia',
  profissional: 'profissional e direta, sem gírias',
  descontraido: 'descontraída e leve; pode usar emojis, no máximo um por mensagem',
  formal: 'formal e cordial, sem gírias e sem emojis',
};
const OBJETIVO = {
  atendimento: 'Tire as dúvidas usando os documentos da empresa. Se a resposta não estiver neles, diga que vai confirmar com a equipe e transfira.',
  vendas: 'Quando a pessoa mostrar interesse, indique a opção que combina com ela, com o preço e o próximo passo para comprar, na mesma mensagem.',
  agendamento: 'Para agendar, peça de uma vez: serviço, dia e horário de preferência e nome completo.',
  qualificacao: 'Antes de passar para a equipe, descubra o que a pessoa precisa, para quando e qual o orçamento, perguntando tudo numa mensagem só.',
  suporte: 'Em problemas com pedido, peça o número do pedido e a descrição do problema numa mensagem só. Se não resolver com as informações que tem, transfira.',
  cobranca: 'Em cobranças, seja educado e objetivo: informe valor, vencimento e como pagar.',
};
const ECONOMIA = {
  economico: [
    'Resolva em uma mensagem só: responda, passe o preço quando fizer sentido e diga o próximo passo, tudo junto.',
    'Na primeira resposta, cumprimente e já ajude no mesmo texto. Nunca mande só "Olá, tudo bem?".',
    'Quando precisar de dados da pessoa, peça todos de uma vez.',
    'Antecipe a dúvida seguinte: ao passar um preço, já diga as formas de pagamento e o prazo.',
    'Se a pessoa só agradecer, disser "ok" ou mandar um emoji, despeça-se em uma frase e não faça novas perguntas.',
    'Em negociação, reclamação ou caso fora do padrão, transfira logo em vez de insistir.',
  ],
  equilibrado: [
    'Prefira resolver em uma mensagem: resposta, preço quando fizer sentido e próximo passo juntos.',
    'Na primeira resposta, cumprimente e já ajude no mesmo texto.',
    'Quando precisar de dados da pessoa, peça todos de uma vez.',
    'Se a pessoa só agradecer ou disser "ok", despeça-se em uma frase.',
  ],
  experiencia: ['Converse com naturalidade, mas evite mensagens só de saudação.'],
};
const FRASE_TRANSFERIR = 'Vou chamar alguém da equipe para continuar com você. Só um instante!';

// Quebra um texto livre em itens (linhas, ponto e vírgula ou frases)
function items(text) {
  const t = String(text || '').trim();
  if (!t) return [];
  let parts = t.split(/\n+|;\s*/).map((s) => s.replace(/^[-*•\d.)\s]+/, '').trim()).filter(Boolean);
  if (parts.length === 1) parts = t.split(/\.\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/).map((s) => s.trim()).filter(Boolean);
  return parts.map((s) => s.replace(/[.;]+$/, '') + '.');
}
// Itens numa frase só: "reclamações; pedidos acima de R$ 1.000; quando pedirem desconto."
const inline = (text) => {
  const list = items(text).map((t, i) => {
    const x = t.replace(/\.$/, '');
    return /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]/.test(x) ? x[0].toLowerCase() + x.slice(1) : x;
  });
  return list.length ? list.join('; ') + '.' : '';
};
const bullets = (list) => list.map((s) => `- ${s}`).join('\n');

function build(c, answers, profileKey = profileFor(c)) {
  const a = answers || {};
  const p = PROFILES[profileKey] || PROFILES.equilibrado;
  const empresa = (a.empresa || c.name || 'a empresa').trim();
  const loc = location(c, a);

  // Prompt: quem é, como fala, o que faz, o que nunca faz, sobre o negócio, transferência e horário.
  // O ZappMillion já entrega ao agente: formato da resposta, data, nome do contato, ações, mídias e conhecimento.
  const nome = String(a.nome_agente || '').trim().replace(/\.$/, '');
  const quem = !nome
    ? `Você atende os clientes da ${empresa} pelo WhatsApp.`
    : nome.includes(',')
    ? `Você é ${nome}, e atende os clientes pelo WhatsApp.`
    : `Você é ${nome} e atende os clientes da ${empresa} pelo WhatsApp.`;
  const comoFalar = `Como falar: ${TOM[a.tom] || 'simpática e direta'}. ${
    profileKey === 'experiencia' ? 'Frases curtas e claras.' : 'Mensagens completas e objetivas, com frases curtas, sem enrolação.'
  } Escreva como uma pessoa da equipe, sem textos longos ou listas enormes.`;

  const fazer = [
    ...(Array.isArray(a.objetivos) ? a.objetivos : []).map((k) => OBJETIVO[k]).filter(Boolean),
    ...ECONOMIA[profileKey],
    'Se perguntarem se você é uma pessoa, diga com naturalidade que é a assistente virtual da empresa.',
  ];
  const nunca = [
    ...items(a.proibido),
    'Nunca invente preço, prazo, estoque ou regra que não esteja nos documentos.',
    'Nunca peça senha, dados de cartão ou documentos pessoais pelo WhatsApp.',
  ];

  const sobre = [
    `${empresa}${a.segmento ? `, ${a.segmento.trim().replace(/\.$/, '')}` : ''}${a.cidade ? `, em ${a.cidade.trim()}` : ''}.`,
    a.site ? `Site ou Instagram: ${a.site.trim()}.` : '',
    'Preços, pagamento, horários e endereço estão nos documentos de conhecimento: consulte antes de responder.',
  ].filter(Boolean).join(' ');

  const transferir = `Quando transferir para uma pessoa: ${inline(a.transferir) || 'quando a pessoa pedir para falar com alguém ou quando você não souber resolver.'} Antes de transferir, mande exatamente: "${FRASE_TRANSFERIR}"`;

  const horario = a.horario ? a.horario.trim().replace(/\.$/, '') : '';
  const fora = {
    responder_e_avisar: `Fora do horário da equipe${horario ? ` (${horario})` : ''}: atenda normalmente e avise que, se precisar de uma pessoa, a equipe retorna no próximo horário de atendimento.`,
    so_recado: `Fora do horário da equipe${horario ? ` (${horario})` : ''}: não tente resolver. Peça nome e assunto numa mensagem só, diga que a equipe retorna no próximo horário de atendimento e encerre.`,
  }[a.fora_horario] || '';

  const prompt = [
    quem,
    comoFalar,
    `O que fazer:\n${bullets(fazer)}`,
    `O que nunca fazer:\n${bullets(nunca)}`,
    `Sobre o negócio: ${sobre}`,
    transferir,
    fora,
  ].filter(Boolean).join('\n\n');

  // Documentos de conhecimento: um assunto por documento
  const docs = [];
  const add = (title, content) => { if (String(content || '').trim()) docs.push({ title, content: String(content).trim() }); };
  add('Produtos, serviços e preços', a.produtos);
  add('Formas de pagamento e entrega', a.pagamento);
  add('Horário de atendimento', horario ? `${horario}.${a.fora_horario === 'so_recado' ? ' Fora desse horário, anotamos o recado e a equipe retorna no próximo horário.' : a.fora_horario === 'responder_e_avisar' ? ' Fora desse horário, a assistente virtual atende e a equipe retorna no próximo horário.' : ''}` : '');
  add('Localização', [loc.query, loc.openUrl ? `Mapa: ${loc.openUrl}` : ''].filter(Boolean).join('\n'));
  add('Perguntas frequentes', a.faq);
  add('Sobre a empresa', [
    `${empresa}${a.segmento ? ` (${a.segmento.trim()})` : ''}${a.cidade ? `, ${a.cidade.trim()}` : ''}.`,
    a.site ? `Site ou Instagram: ${a.site.trim()}.` : '',
  ].filter(Boolean).join(' '));

  // Integrações do ZappMillion que combinam com o que o cliente usa
  const det = a.integracoes_detalhe ? ` (${a.integracoes_detalhe.trim()})` : '';
  const INTEG = {
    google_agenda: 'Google Calendar: para consultar horários livres e marcar.',
    planilha: `Google Sheets ou Microsoft Excel: para registrar pedidos ou contatos${det}.`,
    crm: `CRM do cliente${det}: procure em Integrações › CRM & Vendas.`,
    catalogo: 'Catálogo do WhatsApp: cadastre as fotos dos produtos em Mídias, com a descrição de quando enviar.',
    loja: `Loja virtual${det}: procure a plataforma em Integrações › E-commerce & Pagamentos.`,
  };
  const integracoes = (Array.isArray(a.integracoes) ? a.integracoes : []).map((k) => INTEG[k]).filter(Boolean);

  const ajustes = {
    nome: `${a.nome_agente ? a.nome_agente.trim().split(/[,\s]/)[0] : 'Atendente'} · ${empresa}`.slice(0, 80),
    min: p.min,
    max: p.max,
    idioma: 'Português (Brasil)',
    email: c.email || '',
    // Horário no ZappMillion = fora dele o agente não responde. Como o cliente quer atendimento fora do horário
    // (responder ou anotar recado), deixamos sem horário; o prompt cuida do comportamento.
    horario: 'Sem horário definido (o prompt orienta o que fazer fora do expediente)',
  };

  const dicas = [];
  if (!a.faq) dicas.push('Sem perguntas frequentes no onboarding: peça ao cliente as 5 dúvidas mais comuns. Respostas prontas evitam idas e vindas.');
  if (!a.pagamento) dicas.push('Formas de pagamento em branco: sem isso o agente precisa transferir ou perguntar, e gasta respostas.');
  if (profileKey === 'economico') {
    dicas.push('Se o cliente aceitar, defina um horário de atendimento no ZappMillion: fora dele o agente não responde e não gasta respostas.');
    dicas.push('Cadastre catálogo ou tabela de preços em Mídias: um arquivo enviado substitui várias mensagens.');
  }

  // Arquivo de importação do ZappMillion (mesmo formato do "Exportar agente")
  const json = {
    name: ajustes.nome,
    active: true,
    prompt,
    model: null,
    operatingHours: null,
    debounceMinSeconds: p.min,
    debounceMaxSeconds: p.max,
    replyLanguage: 'pt-BR',
    outcomes: [],
    assets: [],
    knowledge: docs.map((d) => ({ title: d.title, content: d.content })),
  };

  return { profileKey, profile: p, prompt, docs, ajustes, integracoes, dicas, json, loc };
}

// ---------- uso das respostas ----------
const DAY = 86400000;
function usage(c, now = new Date()) {
  const limit = limitOf(c);
  const p = PROFILES[profileFor(c)];
  const capacity = limit ? { conversas: Math.floor(limit / p.porConversa), porDia: Math.floor(limit / p.porConversa / 30) } : null;
  if (c.usage_used == null || !c.usage_cycle_start) return { limit, capacity, known: false };
  const start = new Date(c.usage_cycle_start);
  const days = Math.max(1, Math.floor((now - start) / DAY) + 1);
  const used = c.usage_used;
  const perDay = used / days;
  const projected = Math.round(perDay * 30);
  const pct = limit ? used / limit : 0;
  const runsOutIn = perDay > 0 && limit ? Math.floor((limit - used) / perDay) : null;
  const state = !limit ? 'sem_limite' : used >= limit ? 'estourou' : projected > limit ? 'vai_estourar' : projected > limit * 0.85 ? 'atencao' : 'ok';
  return { limit, capacity, known: true, used, days, perDay, projected, pct, runsOutIn, state, updatedAt: c.usage_updated_at };
}

function txtExport(c, answers, FIELDS, labelOf) {
  const lines = [`Onboarding: ${answers.empresa || c.name || c.email}`, `Cliente: ${c.name || '-'} <${c.email}>`, `Plano: ${c.plan_name || '-'}`, ''];
  for (const [k, label] of FIELDS) {
    const v = labelOf(k, answers[k]);
    const text = Array.isArray(v) ? v.join(', ') : v;
    lines.push(`${label}:`, text ? String(text) : '-', '');
  }
  lines.push(`Autorizou uso dos dados (LGPD): ${answers.lgpd ? 'Sim' : 'Não'}`);
  return lines.join('\n');
}

module.exports = { PROFILES, PLAN_PROFILE, profileFor, build, usage, location, limitOf, planOf, isUrl, txtExport };
