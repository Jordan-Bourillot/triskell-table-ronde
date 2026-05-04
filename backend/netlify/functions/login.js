// POST /api/login
// Body : { email }
// Effet : genere un code 6 chiffres, le stocke (hashe) et l'envoie par email.
// Reponse : { ok: true } (ou erreur en cas d'email invalide)

'use strict';

const { Resend } = require('resend');
const {
  supabase,
  json,
  preflight,
  makeCode,
  hashCode,
  normalizeEmail
} = require('./_lib');
const { emailText, emailHtml } = require('./_login_email');

const CODE_TTL_MIN = 15;
const RATE_LIMIT_PER_HOUR = parseInt(process.env.LOGIN_RATE_LIMIT_PER_HOUR || '20', 10);

// Emails qui contournent completement le rate limit (utile pour le dev/founder).
// Configure via env Netlify : LOGIN_BYPASS_EMAILS = "a@b.fr,c@d.fr"
const BYPASS_EMAILS = (process.env.LOGIN_BYPASS_EMAILS || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

exports.handler = async (event) => {
  const pre = preflight(event);
  if (pre) return pre;
  if (event.httpMethod !== 'POST') return json(405, { error: 'method-not-allowed' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (_) { return json(400, { error: 'invalid-json' }); }

  const email = normalizeEmail(body.email);
  if (!email) return json(400, { error: 'invalid-email' });

  const sb = supabase();

  // Rate limit : LOGIN_RATE_LIMIT_PER_HOUR codes par heure et par email. Les
  // emails dans LOGIN_BYPASS_EMAILS sont exemptes (founder / debug).
  if (!BYPASS_EMAILS.includes(email)) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await sb
      .from('login_codes')
      .select('id', { count: 'exact', head: true })
      .eq('email', email)
      .gte('created_at', oneHourAgo);

    if ((count || 0) >= RATE_LIMIT_PER_HOUR) {
      return json(429, { error: 'too-many-requests' });
    }
  }

  // Genere et stocke le code.
  const code = makeCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MIN * 60 * 1000).toISOString();

  const { error: insertErr } = await sb
    .from('login_codes')
    .insert({ email, code_hash: hashCode(code), expires_at: expiresAt });

  if (insertErr) {
    console.error('login: insert failed', insertErr);
    return json(500, { error: 'server-error' });
  }

  // Envoi de l'email.
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.FROM_EMAIL || 'login@triskell-studio.fr',
      to: email,
      reply_to: process.env.REPLY_TO_EMAIL || 'contact@triskell-studio.fr',
      subject: `${code} — Ton sceau pour la Table Ronde`,
      text: emailText(code),
      html: emailHtml(code)
    });
  } catch (err) {
    console.error('login: resend failed', err);
    return json(500, { error: 'mail-failed' });
  }

  return json(200, { ok: true, expiresIn: CODE_TTL_MIN * 60 });
};
