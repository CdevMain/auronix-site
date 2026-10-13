// Contrato de prestação de serviços: modelo, criação por cliente, envio e aceite eletrônico.
// O texto de cada contrato é congelado no momento em que é criado (body_html) e recebe um hash SHA-256.
// O aceite guarda nome, CPF/CNPJ, e-mail, data, IP e navegador: é a prova de que aquele texto foi aceito.
const crypto = require('node:crypto');
const config = require('./config');
const db = require('./db');
const { esc } = require('./html');
const { company } = require('./company');

const VERSION = '1.0 (12/10/2026)';
const TITLE = 'Contrato de prestação de serviços: agente de IA para WhatsApp';

const brl = (n) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const today = () => new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'long', year: 'numeric' });

function compareValue(label, planIndex) {
  const row = config.comparison.find((r) => r[0].toLowerCase().startsWith(label.toLowerCase()));
  return row ? row[planIndex + 1] : null;
}

/** Corpo do contrato. Sem cliente, gera o modelo público com campos em branco. */
function contractBody({ customer = null, plan = null, date = today() } = {}) {
  const co = company();
  const p = plan || null;
  const idx = p ? config.plans.findIndex((x) => x.id === p.id) : -1;
  const blank = (label) => `<span class="blank">${esc(label)}</span>`;
  const client = customer
    ? `<strong>${esc(customer.name || customer.email)}</strong>, e-mail ${esc(customer.email)}${customer.phone ? `, telefone ${esc(customer.phone)}` : ''}, com CPF ou CNPJ informado no aceite eletrônico abaixo`
    : `${blank('nome ou razão social')}, inscrito no CPF ou CNPJ ${blank('número')}, e-mail ${blank('e-mail')}`;
  const planText = p
    ? `<strong>${esc(p.name)}</strong>, pelo valor mensal de <strong>${brl(p.priceNumber)}</strong>, com até <strong>${Number(p.responses || 0).toLocaleString('pt-BR')} respostas do agente por mês</strong>`
    : `escolhido pelo CONTRATANTE no site ${esc(config.publicUrl.replace(/^https?:\/\//, ''))}, pelo valor e com o limite mensal de respostas indicados na página de planos no momento da contratação`;
  const support = idx >= 0 ? compareValue('Suporte', idx) : null;
  const meetings = idx >= 0 ? compareValue('Reuniões', idx) : null;
  const features = p ? `<ul>${p.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : '';

  const clauses = [
    ['Partes', `<p><strong>CONTRATADA:</strong> ${esc(co.show('name'))}, nome fantasia Auronix, inscrita no CPF ou CNPJ ${esc(co.show('doc'))}, com endereço em ${esc(co.show('address'))}, e-mail ${esc(co.email)}${co.representative ? `, neste ato representada por ${esc(co.representative)}` : ''}.</p>
<p><strong>CONTRATANTE:</strong> ${client}.</p>`],
    ['Objeto', `<p>A CONTRATADA configura, opera e mantém um agente de inteligência artificial que atende os clientes do CONTRATANTE pelo WhatsApp, com base nas informações que o CONTRATANTE fornecer no formulário de onboarding e nos ajustes posteriores.</p>`],
    ['Plano, preço e pagamento', `<p>O CONTRATANTE assina o plano ${planText}.</p>${features}
<p>O pagamento é mensal, feito pela plataforma Cakto, e se renova automaticamente a cada período até o cancelamento. Eventuais reajustes serão comunicados por e-mail com pelo menos 30 dias de antecedência.</p>`],
    ['Limite de respostas', `<p>Conta como resposta cada mensagem enviada pelo agente a um cliente do CONTRATANTE. Ao se aproximar do limite mensal do plano, a CONTRATADA avisará o CONTRATANTE. As condições para uso acima do limite, como mudança de plano, serão combinadas entre as partes antes de qualquer cobrança adicional.</p>`],
    ['Configuração', `<p>Depois da confirmação do pagamento, o CONTRATANTE recebe o formulário de onboarding. A configuração começa quando o formulário é enviado completo. Antes de o agente atender clientes reais, o CONTRATANTE poderá testar e aprovar as respostas.</p>`],
    ['Obrigações da CONTRATADA', `<ul>
<li>Configurar e manter o agente funcionando conforme as informações aprovadas pelo CONTRATANTE.</li>
<li>Prestar suporte ${support ? `no nível <strong>${esc(support.toLowerCase())}</strong> do plano contratado` : 'conforme o plano contratado'}${meetings && meetings !== '—' ? `, com reuniões mensais de acompanhamento (${esc(meetings)})` : ''}.</li>
<li>Fazer os ajustes de funcionamento previstos no plano.</li>
<li>Tratar os dados pessoais apenas para executar este contrato, de acordo com a LGPD.</li>
</ul>`],
    ['Obrigações do CONTRATANTE', `<ul>
<li>Fornecer informações verdadeiras e atualizadas, como produtos, preços, prazos e políticas, que o agente vai repassar.</li>
<li>Manter ativo o número de WhatsApp usado pelo agente e cumprir as políticas do WhatsApp e da Meta.</li>
<li>Não usar o agente para spam, envio em massa não solicitado, conteúdo ilegal, enganoso ou discriminatório.</li>
<li>Acompanhar as conversas que o agente passar para a sua equipe.</li>
</ul>`],
    ['Limites do serviço', `<p>O agente responde com base no que foi ensinado e pode cometer erros. Negociações, reclamações e situações fora do previsto devem ser repassadas a uma pessoa da equipe do CONTRATANTE. A CONTRATADA não responde por indisponibilidades do WhatsApp, da Meta ou de outros serviços de terceiros, nem por decisões tomadas pelo CONTRATANTE com base nas respostas do agente.</p>
<p>A responsabilidade total da CONTRATADA por danos ligados a este contrato fica limitada ao valor pago pelo CONTRATANTE nos 3 meses anteriores ao fato, exceto nos casos em que a lei não permitir essa limitação.</p>`],
    ['Proteção de dados', `<p>Em relação às conversas entre o agente e os clientes do CONTRATANTE, o CONTRATANTE é o controlador e a CONTRATADA é a operadora dos dados, nos termos da LGPD (Lei 13.709/2018). A CONTRATADA usa esses dados apenas para prestar o serviço, adota medidas de segurança e usa somente os fornecedores listados na página de transparência. Detalhes na <a href="${esc(config.publicUrl)}/privacidade">política de privacidade</a>.</p>`],
    ['Confidencialidade e propriedade', `<p>As partes manterão em sigilo as informações comerciais uma da outra. As informações do negócio do CONTRATANTE continuam sendo dele. A tecnologia, os modelos de configuração e os métodos de trabalho da CONTRATADA continuam sendo dela.</p>`],
    ['Vigência e cancelamento', `<p>O contrato vale por prazo indeterminado, com renovação mensal e sem fidelidade. Qualquer parte pode cancelar a qualquer momento, por e-mail, e o cancelamento vale para as cobranças seguintes. Contratações online têm direito de arrependimento em até 7 dias, com devolução do valor pago, conforme o artigo 49 do Código de Defesa do Consumidor. A CONTRATADA pode suspender o serviço em caso de falta de pagamento ou uso proibido.</p>`],
    ['Aceite eletrônico e foro', `<p>O CONTRATANTE aceita este contrato eletronicamente. O aceite registra nome, CPF ou CNPJ, e-mail, data, hora, endereço IP, navegador e o código de verificação (hash SHA-256) do texto aceito, e tem validade jurídica nos termos da Medida Provisória 2.200-2/2001, artigo 10, parágrafo 2º.</p>
<p>Fica eleito o foro da comarca de ${esc(co.show('city'))} para resolver questões deste contrato, ressalvado o direito do consumidor de usar o foro do seu domicílio.</p>`],
  ];

  return `<header class="contract__head">
  <p class="contract__brand">auronix</p>
  <h1>${esc(TITLE)}</h1>
  <p class="contract__meta">Versão ${esc(VERSION)}. Emitido em ${esc(date)}.</p>
</header>
${clauses.map(([h, body], i) => `<section class="contract__clause"><h2><span>${i + 1}.</span> ${esc(h)}</h2>${body}</section>`).join('\n')}`;
}

// ---------- banco ----------
const byToken = (token) => db.one(`SELECT * FROM contracts WHERE token = ?`, [token]);
const byId = (id) => db.one(`SELECT * FROM contracts WHERE id = ?`, [id]);
const latestFor = (customerId) => db.one(`SELECT * FROM contracts WHERE customer_id = ? AND status != 'cancelado' ORDER BY id DESC LIMIT 1`, [customerId]);
const allFor = (customerId) => db.query(`SELECT * FROM contracts WHERE customer_id = ? ORDER BY id DESC`, [customerId]);

async function createFor(customer) {
  const plan = config.plans.find((p) => p.id === customer.plan_id) || null;
  const body = contractBody({ customer, plan });
  const token = crypto.randomBytes(24).toString('base64url');
  const row = await db.one(
    `INSERT INTO contracts (customer_id, token, version, title, body_html, body_hash) VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
    [customer.id, token, VERSION, TITLE, body, sha(body)]
  );
  await db.log(customer.id, 'contrato', `Contrato criado (versão ${VERSION}${plan ? ', ' + plan.name : ''})`);
  return row;
}

const link = (c) => `${config.publicUrl}/contrato/${c.token}`;

async function send(contract, customer) {
  const mail = require('./mail');
  const r = await mail.sendContract(customer, link(contract));
  if (r.ok) {
    await db.run(`UPDATE contracts SET status = CASE WHEN status = 'criado' THEN 'enviado' ELSE status END, sent_at = now() WHERE id = ?`, [contract.id]);
  }
  return r;
}

async function markViewed(contract) {
  if (!contract.viewed_at) {
    await db.run(`UPDATE contracts SET viewed_at = now(), status = CASE WHEN status IN ('criado', 'enviado') THEN 'visualizado' ELSE status END WHERE id = ?`, [contract.id]);
    await db.log(contract.customer_id, 'contrato', 'Cliente abriu o contrato');
  }
}

// ---------- validação de CPF e CNPJ ----------
function validCPF(d) {
  if (!/^\d{11}$/.test(d) || /^(\d)\1+$/.test(d)) return false;
  const calc = (len) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}
function validCNPJ(d) {
  if (!/^\d{14}$/.test(d) || /^(\d)\1+$/.test(d)) return false;
  const calc = (len) => {
    const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = w.reduce((s, x, i) => s + x * Number(d[i]), 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}
function formatDoc(d) {
  return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

async function accept(contract, { name, doc, email, agree }, req) {
  const errors = [];
  const digits = String(doc || '').replace(/\D/g, '');
  if (String(name || '').trim().length < 3) errors.push('Informe o nome completo ou a razão social.');
  if (!(validCPF(digits) || validCNPJ(digits))) errors.push('Informe um CPF ou CNPJ válido.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim())) errors.push('Informe um e-mail válido.');
  if (agree !== 'sim') errors.push('Marque que leu e aceita o contrato.');
  // O texto não pode ter mudado desde a criação
  if (sha(contract.body_html) !== contract.body_hash) errors.push('Este contrato foi alterado. Peça um novo link.');
  if (errors.length) return { ok: false, errors };
  // Só aceita se ainda não foi aceito nem cancelado (evita dois aceites ao mesmo tempo)
  const done = await db.one(
    `UPDATE contracts SET status = 'aceito', accepted_at = now(), accepted_name = ?, accepted_doc = ?, accepted_email = ?, accepted_ip = ?, accepted_ua = ?
     WHERE id = ? AND status NOT IN ('aceito', 'cancelado') RETURNING *`,
    [String(name).trim().slice(0, 200), formatDoc(digits), String(email).trim().toLowerCase().slice(0, 200), req.ip, String(req.headers['user-agent'] || '').slice(0, 300), contract.id]
  );
  if (!done) return { ok: false, errors: ['Este contrato já foi aceito ou cancelado.'] };
  await db.log(contract.customer_id, 'contrato', `Contrato aceito por ${String(name).trim()} (${formatDoc(digits)})`);
  return { ok: true, contract: done };
}

async function cancel(contract) {
  await db.run(`UPDATE contracts SET status = 'cancelado', canceled_at = now() WHERE id = ?`, [contract.id]);
  await db.log(contract.customer_id, 'contrato', 'Contrato cancelado no painel');
}

const STATUS = { criado: 'Criado, não enviado', enviado: 'Enviado', visualizado: 'Visualizado', aceito: 'Aceito', cancelado: 'Cancelado' };

module.exports = {
  VERSION, TITLE, STATUS, contractBody, createFor, send, markViewed, accept, cancel, link, byToken, byId, latestFor, allFor, validCPF, validCNPJ,
};
