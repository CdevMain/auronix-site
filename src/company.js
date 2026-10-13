// Dados da empresa (editáveis no painel em Configurações). Usados no contrato, termos, privacidade e transparência.
const config = require('./config');
const db = require('./db');

const FIELDS = {
  name: { label: 'Razão social ou nome completo', placeholder: 'Ex.: Auronix Tecnologia Ltda.' },
  doc: { label: 'CNPJ ou CPF', placeholder: '00.000.000/0001-00' },
  address: { label: 'Endereço completo', placeholder: 'Rua, número, bairro, cidade, UF, CEP' },
  city: { label: 'Cidade do foro', placeholder: 'Ex.: Guaíba/RS' },
  representative: { label: 'Responsável legal', placeholder: 'Nome de quem assina pela empresa' },
};

function company() {
  const get = (k) => (db.setting(`company.${k}`) || '').trim();
  const c = Object.fromEntries(Object.keys(FIELDS).map((k) => [k, get(k)]));
  c.tradeName = 'Auronix';
  c.email = config.contactEmail;
  c.complete = Boolean(c.name && c.doc && c.address && c.city);
  // Texto para usar no meio de frases: mostra um aviso entre colchetes quando falta o dado
  c.show = (k) => c[k] || `[${FIELDS[k].label.toUpperCase()}]`;
  return c;
}

async function saveCompany(body) {
  for (const k of Object.keys(FIELDS)) await db.setSetting(`company.${k}`, String(body[`empresa_${k}`] || '').trim().slice(0, 300));
}

module.exports = { company, saveCompany, COMPANY_FIELDS: FIELDS };
