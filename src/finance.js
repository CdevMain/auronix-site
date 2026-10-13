// Receita, custo e lucro por cliente e no total.
const config = require('./config');
const db = require('./db');

// Status que entram na receita do mês
const BILLING = new Set(['ativo', 'atrasado']);

const planById = (id) => config.plans.find((p) => p.id === id) || null;

function planCost(planId) {
  const plan = planById(planId);
  const saved = db.setting(`cost.${planId}`);
  if (saved != null && saved !== '') return Number(saved);
  return plan ? plan.defaultCost : 0;
}

function customerFinance(c) {
  const plan = planById(c.plan_id);
  const revenue = plan ? plan.priceNumber : Number(c.amount) || 0;
  const cost = c.cost_override != null ? Number(c.cost_override) : plan ? planCost(plan.id) : 0;
  const fees = c.fees != null ? Number(c.fees) : null;
  const profit = revenue - cost;
  const net = fees != null ? profit - fees : null;
  return {
    plan,
    revenue,
    cost,
    fees,
    profit,
    net,
    margin: revenue ? profit / revenue : 0,
    billing: BILLING.has(c.status) && !c.is_test,
  };
}

function totals(customers) {
  const t = { mrr: 0, cost: 0, profit: 0, fees: 0, feesKnown: 0, billingCount: 0, byPlan: {} };
  for (const p of config.plans) t.byPlan[p.id] = { plan: p, count: 0, revenue: 0, cost: 0, profit: 0 };
  t.byPlan._outro = { plan: { id: '_outro', name: 'Plano não identificado' }, count: 0, revenue: 0, cost: 0, profit: 0 };
  for (const c of customers) {
    const f = customerFinance(c);
    if (!f.billing) continue;
    t.billingCount++;
    t.mrr += f.revenue;
    t.cost += f.cost;
    t.profit += f.profit;
    if (f.fees != null) { t.fees += f.fees; t.feesKnown++; }
    const bucket = t.byPlan[f.plan?.id] || t.byPlan._outro;
    bucket.count++;
    bucket.revenue += f.revenue;
    bucket.cost += f.cost;
    bucket.profit += f.profit;
  }
  t.margin = t.mrr ? t.profit / t.mrr : 0;
  return t;
}

const brl = (n) => (n == null || Number.isNaN(n) ? '-' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const pct = (n) => `${(n * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

module.exports = { BILLING, planById, planCost, customerFinance, totals, brl, pct };
