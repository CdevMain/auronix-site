// Simula um webhook da Cakto no servidor local ou em produção.
// Uso:  node --env-file=.env scripts/simular-webhook.js [evento] [email] [url]
//   evento: purchase_approved (padrão), refund, chargeback, subscription_canceled, subscription_renewed
//   url:    padrão http://127.0.0.1:PORT/webhooks/cakto
const crypto = require('node:crypto');

const event = process.argv[2] || 'purchase_approved';
const email = process.argv[3] || 'cliente.teste@example.com';
const url = process.argv[4] || `http://127.0.0.1:${process.env.PORT || 3100}/webhooks/cakto`;

const payload = {
  secret: process.env.CAKTO_WEBHOOK_SECRET,
  event,
  data: {
    id: process.env.ORDER_ID || crypto.randomUUID(),
    refId: 'TESTE01',
    customer: { name: 'Cliente Teste', email, phone: '5551999999999' },
    offer: { id: 'oferta-teste', name: 'Auronix Pro', price: 197 },
    offer_type: 'main',
    product: { name: 'Auronix', id: 'produto-teste', short_id: 'abc123', type: 'subscription' },
    status: 'paid',
    baseAmount: 197,
    discount: 0,
    amount: 197,
    paymentMethod: 'pix',
    installments: 1,
    paidAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  },
};

fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
  .then(async (r) => console.log(r.status, await r.text()))
  .catch((e) => console.error('Falhou:', e.message));
