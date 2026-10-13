// Simula um webhook da Cakto (mesmo formato do envio real: `data` é uma lista).
// Uso:  node --env-file=local.env scripts/simular-webhook.js [evento] [email] [plano] [url]
//   evento: purchase_approved (padrão), refund, chargeback, subscription_canceled, subscription_renewed,
//           subscription_paused, subscription_resumed, subscription_late, subscription_late_recovered
//   plano:  start | pro (padrão) | business
//   url:    padrão http://127.0.0.1:PORT/webhooks/cakto
const crypto = require('node:crypto');

const event = process.argv[2] || 'purchase_approved';
const email = process.argv[3] || 'cliente.teste@example.com';
const planId = process.argv[4] || 'pro';
const url = process.argv[5] || `http://127.0.0.1:${process.env.PORT || 3100}/webhooks/cakto`;

const plans = require('../plans.json').plans;
const plan = plans.find((p) => p.id === planId) || plans[0];
const price = Number(String(plan.price).replace(/\D/g, '')) || 0;
const now = new Date().toISOString();

const main = {
  id: process.env.ORDER_ID || crypto.randomUUID(),
  refId: 'teste01',
  customer: { name: 'Cliente Teste', email, phone: '51999999999', docNumber: '12345678909', birthDate: null, docType: 'cpf' },
  address: null,
  shipping: null,
  affiliate: '',
  offer: { id: (plan.caktoOfferIds || [])[0] || 'oferta-teste', name: plan.name, price, image: null },
  offer_type: 'main',
  product: { name: plan.name, id: crypto.randomUUID(), short_id: 'teste', type: 'subscription', invoiceDescription: '' },
  subscription: null,
  subscription_period: 1,
  parent_order: null,
  checkoutUrl: plan.checkoutUrl,
  status: 'paid',
  baseAmount: price,
  discount: 0,
  amount: price,
  installments: 1,
  paymentMethod: 'pix',
  paymentMethodName: 'Pix',
  paidAt: now,
  createdAt: now,
  card: null,
};

// Um order bump junto, como a Cakto manda quando o cliente leva algo a mais
const bump = {
  ...main,
  id: crypto.randomUUID(),
  offer: { id: 'bump-teste', name: 'Oferta extra', price: 27, image: null },
  offer_type: 'orderbump',
  product: { name: 'Oferta extra', id: crypto.randomUUID(), short_id: 'bump', type: 'unique', invoiceDescription: '' },
  parent_order: main.refId,
  amount: 27,
};

const payload = { secret: process.env.CAKTO_WEBHOOK_SECRET, event, data: [main, bump] };

fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
  .then(async (r) => console.log(r.status, await r.text()))
  .catch((e) => console.error('Falhou:', e.message));
