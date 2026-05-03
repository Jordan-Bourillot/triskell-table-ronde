// Helpers partages entre les Netlify Functions.
'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

// --- Sentry (no-op si SENTRY_DSN absent ou @sentry/node pas installe) ---
let _Sentry = null;
(function initSentry() {
  try {
    const dsn = process.env.SENTRY_DSN || '';
    if (!dsn.startsWith('https://')) return;
    const Sentry = require('@sentry/node');
    Sentry.init({
      dsn,
      environment: process.env.NETLIFY_ENV || 'production',
      tracesSampleRate: 0.0,
      sendDefaultPii: false,
      release: process.env.COMMIT_REF || undefined
    });
    _Sentry = Sentry;
  } catch (_) { /* @sentry/node absent — on ignore */ }
})();

// Wrapper pour envoyer une erreur a Sentry sans planter si Sentry est absent.
function captureException(err, context) {
  try {
    if (_Sentry) _Sentry.captureException(err, { extra: context || {} });
  } catch (_) { /* noop */ }
}

// --- Supabase singleton ---
let _sb = null;
function supabase() {
  if (_sb) return _sb;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY manquants');
  _sb = createClient(url, key, { auth: { persistSession: false } });
  return _sb;
}

// --- Reponses HTTP ---
function json(status, body) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(body)
  };
}

function preflight(event) {
  if (event.httpMethod === 'OPTIONS') return json(204, {});
  return null;
}

// --- Codes de connexion (6 chiffres) ---
function makeCode() {
  // 100000-999999, sans biais
  const n = crypto.randomInt(100000, 1000000);
  return String(n);
}

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

// --- JWT session (30 jours) ---
function signSession(user) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET manquant');
  return jwt.sign(
    { sub: user.id, email: user.email },
    secret,
    { expiresIn: '30d' }
  );
}

function verifySession(token) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET manquant');
  try {
    return jwt.verify(token, secret);
  } catch (_) {
    return null;
  }
}

// Lit le bearer token et renvoie le payload, ou null
function authFromHeaders(headers) {
  const h = headers && (headers.authorization || headers.Authorization);
  if (!h || !h.startsWith('Bearer ')) return null;
  return verifySession(h.slice(7));
}

// --- Validation email basique ---
function normalizeEmail(raw) {
  if (typeof raw !== 'string') return null;
  const e = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  if (e.length > 254) return null;
  return e;
}

// Admin guard : verifie que la session JWT correspond a un email present
// dans la whitelist ADMIN_EMAILS (CSV) cote env Netlify. Renvoie le payload
// session si admin, null sinon.
function authAdmin(headers) {
  const session = authFromHeaders(headers);
  if (!session || !session.email) return null;
  const list = (process.env.ADMIN_EMAILS || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!list.includes(String(session.email).toLowerCase())) return null;
  return session;
}

module.exports = {
  supabase,
  json,
  preflight,
  makeCode,
  hashCode,
  signSession,
  verifySession,
  authFromHeaders,
  authAdmin,
  normalizeEmail,
  captureException
};
