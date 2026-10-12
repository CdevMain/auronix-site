const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const config = require('./config');

fs.mkdirSync(config.dataDir, { recursive: true });
const db = new Database(path.join(config.dataDir, 'auronix.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS webhook_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  dedupe_key    TEXT NOT NULL UNIQUE,
  event         TEXT NOT NULL,
  order_id      TEXT,
  email         TEXT,
  result        TEXT,
  payload       TEXT NOT NULL,
  received_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  email             TEXT NOT NULL UNIQUE,
  name              TEXT,
  phone             TEXT,
  plan_id           TEXT,
  plan_name         TEXT,
  status            TEXT NOT NULL DEFAULT 'ativo',
  last_order_id     TEXT,
  last_offer_id     TEXT,
  last_product_id   TEXT,
  amount            REAL,
  payment_method    TEXT,
  onboarding_token  TEXT UNIQUE,
  onboarding_sent_at TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS onboardings (
  customer_id   INTEGER PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  answers       TEXT NOT NULL,
  submitted_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

module.exports = db;
