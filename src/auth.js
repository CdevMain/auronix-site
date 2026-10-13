// Login do painel.
// Modo Supabase (padrão quando SUPABASE_URL e SUPABASE_ANON_KEY existem): e-mail e senha da conta no Supabase Auth
// do projeto CDEV Site, e só entram os e-mails listados em ADMIN_EMAILS.
// Modo local (sem Supabase configurado): ADMIN_USER e ADMIN_PASS do .env.
// Depois do login, o site cria a própria sessão (cookie HttpOnly, SameSite=Strict); o banco guarda só o hash.
const crypto = require('node:crypto');
const config = require('./config');
const db = require('./db');

const COOKIE = 'aux_sess';
const SESSION_DAYS = 14;

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const safeEqual = (a, b) => crypto.timingSafeEqual(Buffer.from(sha(String(a))), Buffer.from(sha(String(b))));

const mode = () => (config.supabase.url && config.supabase.anonKey ? 'supabase' : 'local');

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function cookieAttrs(maxAgeSec) {
  return [`Path=${config.adminPath}`, 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAgeSec}`, config.secureCookies ? 'Secure' : '']
    .filter(Boolean)
    .join('; ');
}

// ---------- tentativas de login: 5 erros por IP a cada 15 min ----------
const fails = new Map();
function tooManyAttempts(ip) {
  const now = Date.now();
  const list = (fails.get(ip) || []).filter((t) => now - t < 15 * 60 * 1000);
  fails.set(ip, list);
  return list.length >= 5;
}
const recordFail = (ip) => fails.set(ip, [...(fails.get(ip) || []), Date.now()]);

function authConfigured() {
  if (mode() === 'supabase') return config.adminEmails.length > 0;
  return Boolean(config.admin.pass && config.admin.pass !== 'troque-esta-senha');
}

/** Confere o login. Retorna { ok, user, error }. */
async function checkLogin(login, pass) {
  if (!authConfigured()) return { ok: false, error: 'O login do painel não está configurado.' };
  if (mode() === 'local') {
    const okUser = safeEqual(login || '', config.admin.user);
    const okPass = safeEqual(pass || '', config.admin.pass);
    return okUser && okPass ? { ok: true, user: config.admin.user } : { ok: false };
  }
  const email = String(login || '').trim().toLowerCase();
  // Só e-mails autorizados chegam a consultar o Supabase
  if (!config.adminEmails.includes(email) || !pass) return { ok: false };
  try {
    const res = await fetch(`${config.supabase.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: config.supabase.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: String(pass) }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { ok: false };
    const body = await res.json();
    const confirmed = String(body?.user?.email || '').toLowerCase();
    if (confirmed !== email) return { ok: false };
    return { ok: true, user: confirmed };
  } catch (e) {
    console.error('[login supabase]', e.message);
    return { ok: false, error: 'Não foi possível falar com o Supabase agora. Tente de novo em instantes.' };
  }
}

async function createSession(req, res, user) {
  const token = crypto.randomBytes(32).toString('base64url');
  await db.run(
    `INSERT INTO sessions (token_hash, "user", ip, user_agent, expires_at) VALUES (?, ?, ?, ?, now() + interval '${SESSION_DAYS} days')`,
    [sha(token), user, req.ip, String(req.headers['user-agent'] || '').slice(0, 200)]
  );
  res.append('Set-Cookie', `${COOKIE}=${token}; ${cookieAttrs(SESSION_DAYS * 86400)}`);
}

async function destroySession(req, res) {
  const token = readCookie(req, COOKIE);
  if (token) await db.run(`DELETE FROM sessions WHERE token_hash = ?`, [sha(token)]);
  res.append('Set-Cookie', `${COOKIE}=; ${cookieAttrs(0)}`);
}

async function currentSession(req) {
  const token = readCookie(req, COOKIE);
  return token ? db.one(`SELECT * FROM sessions WHERE token_hash = ? AND expires_at > now()`, [sha(token)]) : null;
}

// Bloqueia POST vindo de outro site
function sameOrigin(req) {
  const origin = req.headers.origin || req.headers.referer || '';
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

module.exports = {
  mode, checkLogin, createSession, destroySession, currentSession, sameOrigin, tooManyAttempts, recordFail, authConfigured,
  logoutEverywhere: () => db.run(`DELETE FROM sessions`),
};
