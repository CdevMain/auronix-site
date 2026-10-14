// Banco: Postgres no Supabase (esquema "auronix" do projeto CDEV Site).
// Conexão pelo DATABASE_URL (use o "Session pooler" do Supabase, porta 5432).
const fs = require('node:fs');
const path = require('node:path');
const { Pool, types } = require('pg');
const config = require('./config');

// bigint (ids e COUNT) volta como número, não como texto
types.setTypeParser(20, (v) => parseInt(v, 10));

if (!config.databaseUrl) {
  console.error('[erro] DATABASE_URL não configurado. Coloque a conexão do Supabase no .env (veja o README).');
  process.exit(1);
}

const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(config.databaseUrl);
const pool = new Pool({
  connectionString: config.databaseUrl,
  max: Number(process.env.DB_POOL_MAX || 5),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  // Supabase exige TLS. DATABASE_SSL_CA aponta para o certificado do Supabase para verificar o servidor.
  ssl: isLocal
    ? false
    : process.env.DATABASE_SSL_CA
    ? { ca: fs.readFileSync(process.env.DATABASE_SSL_CA, 'utf8') }
    : { rejectUnauthorized: false },
});
pool.on('error', (err) => console.error('[banco]', err.message));

// Todas as tabelas ficam no esquema "auronix". Em vez de depender do search_path (que o pooler do
// Supabase não guarda entre conexões), o nome do esquema é colocado direto no SQL.
const TABLES = ['webhook_events', 'customers', 'onboardings', 'sessions', 'emails', 'contact_messages', 'activity', 'contracts', 'settings', 'customer_photos'];
const TABLE_RE = new RegExp(`\\b(FROM|INTO|UPDATE|JOIN)\\s+(${TABLES.join('|')})\\b`, 'gi');

// Aceita "?" como marcador de parâmetro e converte para $1, $2...
function toPg(sql) {
  let i = 0;
  return sql.replace(TABLE_RE, (_, kw, t) => `${kw} auronix.${t}`).replace(/\?/g, () => `$${++i}`);
}

const db = {
  pool,
  async query(sql, params = []) {
    const r = await pool.query(toPg(sql), params);
    return r.rows;
  },
  async one(sql, params = []) {
    const r = await pool.query(toPg(sql), params);
    return r.rows[0] || null;
  },
  async run(sql, params = []) {
    const r = await pool.query(toPg(sql), params);
    return { changes: r.rowCount, rows: r.rows, id: r.rows[0]?.id ?? null };
  },
  async tx(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const t = {
        query: async (sql, params = []) => (await client.query(toPg(sql), params)).rows,
        run: async (sql, params = []) => {
          const r = await client.query(toPg(sql), params);
          return { changes: r.rowCount, rows: r.rows };
        },
      };
      const out = await fn(t);
      await client.query('COMMIT');
      return out;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  },
};

// ---------- configurações (em memória, gravadas no banco) ----------
const settings = new Map();
db.setting = (key, fallback = null) => (settings.has(key) ? settings.get(key) : fallback);
db.setSetting = async (key, value) => {
  settings.set(key, String(value));
  await db.run(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`, [key, String(value)]);
};

// ---------- histórico do cliente (não trava a requisição) ----------
db.log = (customerId, kind, text) => {
  if (!customerId) return Promise.resolve();
  return db
    .run(`INSERT INTO activity (customer_id, kind, text) VALUES (?, ?, ?)`, [customerId, kind, String(text).slice(0, 2000)])
    .catch((e) => console.error('[histórico]', e.message));
};

/** Cria as tabelas se faltarem, carrega as configurações e limpa sessões vencidas. */
db.init = async () => {
  // Cria as tabelas só se o esquema ainda não existir. O usuário do site (auronix_app) não tem
  // permissão para criar esquemas: no Supabase, a estrutura já foi criada com db/schema.sql.
  const ready = await db.one(`SELECT to_regclass('auronix.settings') IS NOT NULL AS ok`);
  if (!ready.ok && process.env.DB_AUTO_MIGRATE !== '0') {
    await pool.query(fs.readFileSync(path.join(config.root, 'db', 'schema.sql'), 'utf8'));
  }
  for (const row of await db.query(`SELECT key, value FROM settings`)) settings.set(row.key, row.value);
  await db.run(`DELETE FROM sessions WHERE expires_at < now()`);
};

module.exports = db;
