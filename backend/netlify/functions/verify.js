// POST /api/verify
// Body : { email, code }
// Effet : verifie le code, cree (ou retrouve) le compte, renvoie un JWT de session.
// Reponse : { token, user: { id, email } }

'use strict';

const { Resend } = require('resend');
const {
  supabase,
  json,
  preflight,
  hashCode,
  signSession,
  normalizeEmail
} = require('./_lib');
const { welcomeText, welcomeHtml } = require('./_welcome_email');

const MAX_ATTEMPTS = 5;

exports.handler = async (event) => {
  const pre = preflight(event);
  if (pre) return pre;
  if (event.httpMethod !== 'POST') return json(405, { error: 'method-not-allowed' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (_) { return json(400, { error: 'invalid-json' }); }

  const email = normalizeEmail(body.email);
  const code = typeof body.code === 'string' ? body.code.replace(/\s/g, '') : '';
  if (!email) return json(400, { error: 'invalid-email' });
  if (!/^\d{6}$/.test(code)) return json(400, { error: 'invalid-code' });

  const sb = supabase();

  // On prend le dernier code non consomme, non expire, pour cet email.
  const nowIso = new Date().toISOString();
  const { data: rows, error } = await sb
    .from('login_codes')
    .select('id, code_hash, attempts, consumed_at, expires_at')
    .eq('email', email)
    .is('consumed_at', null)
    .gte('expires_at', nowIso)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('verify: select failed', error);
    return json(500, { error: 'server-error' });
  }
  if (!rows || rows.length === 0) {
    return json(401, { error: 'no-active-code' });
  }

  const row = rows[0];

  if (row.attempts >= MAX_ATTEMPTS) {
    // Trop d'echecs : on consomme la ligne pour forcer un nouveau code.
    await sb.from('login_codes').update({ consumed_at: nowIso }).eq('id', row.id);
    return json(401, { error: 'too-many-attempts' });
  }

  if (row.code_hash !== hashCode(code)) {
    await sb.from('login_codes')
      .update({ attempts: row.attempts + 1 })
      .eq('id', row.id);
    return json(401, { error: 'wrong-code' });
  }

  // Code valide -> on le consomme pour eviter le rejouer.
  await sb.from('login_codes').update({ consumed_at: nowIso }).eq('id', row.id);

  // On detecte si c'est une PREMIERE connexion (pour envoyer le mail
  // de bienvenue) en cherchant le user existant avant l'upsert.
  const { data: existing } = await sb
    .from('users')
    .select('id, email, created_at')
    .eq('email', email)
    .maybeSingle();

  let user;
  let isFirstLogin = false;
  if (existing) {
    const { data: u } = await sb.from('users')
      .update({ last_login_at: nowIso })
      .eq('id', existing.id)
      .select('id, email')
      .single();
    user = u;
  } else {
    const { data: u, error: insErr } = await sb.from('users')
      .insert({ email, last_login_at: nowIso })
      .select('id, email')
      .single();
    if (insErr) {
      // Race condition : un autre verify parallele a deja insere ce email
      // entre notre SELECT et notre INSERT. La contrainte UNIQUE(email)
      // remonte un 23505 — on retombe sur le user existant, sans renvoyer
      // de welcome email (l'autre verify s'en chargera).
      if (insErr.code === '23505') {
        const { data: raceUser } = await sb
          .from('users').select('id, email').eq('email', email).single();
        if (!raceUser) {
          console.error('verify: race fallback failed', insErr);
          return json(500, { error: 'server-error' });
        }
        const { data: u2 } = await sb.from('users')
          .update({ last_login_at: nowIso })
          .eq('id', raceUser.id)
          .select('id, email')
          .single();
        user = u2 || raceUser;
      } else {
        console.error('verify: insert user failed', insErr);
        return json(500, { error: 'server-error' });
      }
    } else if (!u) {
      console.error('verify: insert user returned no row');
      return json(500, { error: 'server-error' });
    } else {
      user = u;
      isFirstLogin = true;
    }
  }

  if (isFirstLogin) {
    // Mail de bienvenue (best-effort, on ne bloque jamais le login dessus)
    sendWelcomeEmail(email).catch(err =>
      console.error('welcome email failed (silent):', err && err.message));
  }

  const token = signSession(user);
  return json(200, { token, user });
};

// Mail de bienvenue envoye au tout premier login d'un nouvel email Triskell.
// Template (welcomeText/welcomeHtml) extrait dans _welcome_email.js.
// Best-effort : si Resend echoue, on log mais on ne bloque jamais le login.
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

