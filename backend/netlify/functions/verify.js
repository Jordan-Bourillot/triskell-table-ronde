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
    if (insErr || !u) {
      console.error('verify: insert user failed', insErr);
      return json(500, { error: 'server-error' });
    }
    user = u;
    // Mail de bienvenue (best-effort, on ne bloque jamais le login dessus)
    sendWelcomeEmail(email).catch(err =>
      console.error('welcome email failed (silent):', err && err.message));
  }

  const token = signSession(user);
  return json(200, { token, user });
};

// Mail de bienvenue envoye au tout premier login d'un nouvel email Triskell.
// Best-effort : si Resend echoue, on log mais on ne bloque jamais le login.
async function sendWelcomeEmail(email) {
  if (!process.env.RESEND_API_KEY) return;
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: process.env.FROM_EMAIL || 'login@triskell-studio.fr',
    to: email,
    reply_to: process.env.REPLY_TO_EMAIL || 'contact@triskell-studio.fr',
    subject: 'Bienvenue à La Table Ronde 🍻',
    text: welcomeText(email),
    html: welcomeHtml(email),
    tags: [
      { name: 'product', value: 'lanceur' },
      { name: 'type',    value: 'welcome' }
    ]
  });
}

function welcomeText(email) {
  return `Bienvenue à La Table Ronde !

Tu viens de rejoindre Triskell Studio avec ${email}. Quelques mots
pour commencer :

  • La Table Ronde est l'app desktop qui regroupe tous tes outils
    Triskell. Tu la télécharges sur https://app.triskell-studio.fr
    et tu te connectes avec cet email — pas de mot de passe.

  • Ce que tu peux faire dès maintenant :
    - Suite des Héros (27 €) — 11 outils desktop
      https://productivite.triskell-studio.fr
    - DéliNote (79 €) — notes Markdown
      https://delinote.triskell-studio.fr
    - Le Studio PDF (39 €) — fusion / split / OCR
      https://studio-pdf.triskell-studio.fr
    - Bobeez (27 €) — gestionnaire d'images moderne
      https://bobeez.triskell-studio.fr

  • Chaque achat ajoute automatiquement la licence à ton compte
    Triskell. Tu n'as plus qu'à cliquer "Installer" depuis La Table.

Une question, un bug, une suggestion ? Réponds simplement à cet email.

— Triskell Studio
`;
}

function welcomeHtml(email) {
  return `<!doctype html>
<html><body style="margin:0;padding:32px;background:#0d0f12;color:#e9e6df;font-family:-apple-system,Segoe UI,sans-serif;line-height:1.6;">
  <div style="max-width:560px;margin:0 auto;background:#161a20;border:1px solid #262b34;border-radius:14px;padding:36px;">
    <h1 style="color:#c9a961;margin:0 0 8px;font-size:24px;letter-spacing:0.5px;">Bienvenue à la Table Ronde 🍻</h1>
    <p style="color:#9aa0ab;font-size:15px;margin:0 0 20px;">
      Tu viens de rejoindre Triskell Studio avec
      <strong style="color:#c9a961;">${escapeHtml(email)}</strong>.
    </p>

    <p style="color:#e9e6df;font-size:15px;margin:0 0 12px;">Pour commencer :</p>
    <ol style="color:#9aa0ab;font-size:14px;padding-left:20px;margin:0 0 22px;">
      <li style="margin:6px 0;">Télécharge <strong style="color:#fff;">La Table Ronde</strong> sur
        <a href="https://app.triskell-studio.fr" style="color:#c9a961;">app.triskell-studio.fr</a>.</li>
      <li style="margin:6px 0;">Connecte-toi avec <strong>cet email</strong> (pas de mot de passe — un code à 6 chiffres comme à l'instant).</li>
      <li style="margin:6px 0;">Tes licences apparaissent automatiquement, tu cliques "Installer".</li>
    </ol>

    <p style="color:#e9e6df;font-size:15px;margin:18px 0 10px;">Les compagnons disponibles :</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;color:#e9e6df;">
      <tr style="border-bottom:1px solid #262b34;">
        <td style="padding:8px 0;"><strong>Suite des Héros</strong> — 11 outils desktop</td>
        <td style="padding:8px 0;text-align:right;"><a href="https://productivite.triskell-studio.fr" style="color:#c9a961;text-decoration:none;">27 €</a></td>
      </tr>
      <tr style="border-bottom:1px solid #262b34;">
        <td style="padding:8px 0;"><strong>DéliNote</strong> — notes Markdown</td>
        <td style="padding:8px 0;text-align:right;"><a href="https://delinote.triskell-studio.fr" style="color:#c9a961;text-decoration:none;">79 €</a></td>
      </tr>
      <tr style="border-bottom:1px solid #262b34;">
        <td style="padding:8px 0;"><strong>Le Studio PDF</strong> — fusion, split, OCR</td>
        <td style="padding:8px 0;text-align:right;"><a href="https://studio-pdf.triskell-studio.fr" style="color:#c9a961;text-decoration:none;">39 €</a></td>
      </tr>
      <tr>
        <td style="padding:8px 0;"><strong>Bobeez</strong> — gestionnaire d'images</td>
        <td style="padding:8px 0;text-align:right;"><a href="https://bobeez.triskell-studio.fr" style="color:#c9a961;text-decoration:none;">27 €</a></td>
      </tr>
    </table>

    <p style="text-align:center;margin:28px 0 18px;">
      <a href="https://app.triskell-studio.fr"
         style="background:#c9a961;color:#1a1408;text-decoration:none;font-weight:700;padding:14px 32px;border-radius:8px;display:inline-block;">
        Télécharger La Table Ronde
      </a>
    </p>

    <p style="color:#6b7280;font-size:12px;margin:24px 0 0;border-top:1px solid #262b34;padding-top:16px;">
      Une question ? Réponds simplement à cet email — c'est moi (Jordan) qui te lirai.<br>
      Tu peux te désinscrire en supprimant ton compte depuis La Table Ronde &gt; Mon compte &gt; Zone sensible.
    </p>
  </div>
</body></html>`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
}
