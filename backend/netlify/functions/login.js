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
  signSession,
  normalizeEmail
} = require('./_lib');
const { emailText, emailHtml } = require('./_login_email');
const { welcomeText, welcomeHtml } = require('./_welcome_email');

const CODE_TTL_MIN = 15;
const RATE_LIMIT_PER_HOUR = parseInt(process.env.LOGIN_RATE_LIMIT_PER_HOUR || '20', 10);

// Emails qui contournent completement le rate limit (utile pour le dev/founder).
// Configure via env Netlify : LOGIN_BYPASS_EMAILS = "a@b.fr,c@d.fr"
const BYPASS_EMAILS = (process.env.LOGIN_BYPASS_EMAILS || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

// Emails qui sautent completement l'etape du code 6 chiffres : /api/login
// renvoie directement { token, user } et le frontend bascule sur l'app sans
// passer par /api/verify. Reserve aux comptes founder/dev de confiance.
// Configure via env Netlify : LOGIN_SKIP_CODE_EMAILS = "a@b.fr,c@d.fr"
const SKIP_CODE_EMAILS = (process.env.LOGIN_SKIP_CODE_EMAILS || '')
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

  // Court-circuit founder/dev : pour les emails LOGIN_SKIP_CODE_EMAILS, on
  // ouvre la session directement sans generer ni envoyer de code.
  if (SKIP_CODE_EMAILS.includes(email)) {
    try {
      const { user, isFirstLogin } = await upsertUser(sb, email);
      if (isFirstLogin) {
        sendWelcomeEmail(email).catch(err =>
          console.error('welcome email failed (silent):', err && err.message));
      }
      const token = signSession(user);
      return json(200, { ok: true, skipCode: true, token, user });
    } catch (err) {
      console.error('login: skip-code path failed', err);
      return json(500, { error: 'server-error' });
    }
  }

  // Rate limit : LOGIN_RATE_LIMIT_PER_HOUR codes par heure et par email. Les
  // emails dans LOGIN_BYPASS_EMAILS sont exemptes (founder / debug).
  if (!BYPASS_EMAILS.includes(email)) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await sb
      .from('lanceur_login_codes')
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
    .from('lanceur_login_codes')
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

// Reproduit la logique de upsert user de verify.js pour la voie "skip code".
// Renvoie { user, isFirstLogin }.
async function upsertUser(sb, email) {
  const nowIso = new Date().toISOString();

  const { data: existing } = await sb
    .from('lanceur_users').select('id, email').eq('email', email).maybeSingle();

  if (existing) {
    const { data: u } = await sb.from('lanceur_users')
      .update({ last_login_at: nowIso })
      .eq('id', existing.id)
      .select('id, email')
      .single();
    return { user: u || existing, isFirstLogin: false };
  }

  const { data: u, error: insErr } = await sb.from('lanceur_users')
    .insert({ email, last_login_at: nowIso })
    .select('id, email')
    .single();

  if (!insErr && u) return { user: u, isFirstLogin: true };

  // Race condition : un autre login parallele vient d'inserer l'email.
  if (insErr && insErr.code === '23505') {
    const { data: raceUser } = await sb
      .from('lanceur_users').select('id, email').eq('email', email).single();
    if (!raceUser) throw insErr;
    const { data: u2 } = await sb.from('lanceur_users')
      .update({ last_login_at: nowIso })
      .eq('id', raceUser.id)
      .select('id, email')
      .single();
    return { user: u2 || raceUser, isFirstLogin: false };
  }

  throw insErr || new Error('upsertUser: insert returned no row');
}

async function sendWelcomeEmail(email) {
  if (!process.env.RESEND_API_KEY) return;
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: process.env.FROM_EMAIL || 'login@triskell-studio.fr',
    to: email,
    reply_to: process.env.REPLY_TO_EMAIL || 'contact@triskell-studio.fr',
    subject: 'Bienvenue à la Table Ronde — ton sceau t\'attend',
    text: welcomeText(email),
    html: welcomeHtml(email),
    tags: [
      { name: 'product', value: 'lanceur' },
      { name: 'type',    value: 'welcome' }
    ]
  });
}
