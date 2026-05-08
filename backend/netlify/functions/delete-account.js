// POST /api/delete-account
// Header : Authorization: Bearer <jwt>
//
// Supprime le compte Triskell de l'utilisateur courant. Cascade les licences
// (FK on delete cascade). Le user n'est PAS supprime de Stripe (les paiements
// historiques restent), juste de notre base.
//
// Retourne { ok: true, deletedUserId } ou { ok: false, error }.

'use strict';

const { supabase, json, preflight, authFromHeaders } = require('./_lib');

exports.handler = async (event) => {
  const pre = preflight(event);
  if (pre) return pre;
  if (event.httpMethod !== 'POST') return json(405, { error: 'method-not-allowed' });

  const session = authFromHeaders(event.headers);
  if (!session) return json(401, { error: 'unauthorized' });

  const sb = supabase();

  // L'utilisateur doit confirmer avec son email pour eviter une suppression
  // accidentelle si quelqu'un acquiert un JWT valide.
  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (_) { return json(400, { error: 'invalid-json' }); }

  const confirmEmail = String(body.confirmEmail || '').trim().toLowerCase();
  if (!confirmEmail || confirmEmail !== String(session.email || '').toLowerCase()) {
    return json(400, { error: 'email-mismatch' });
  }

  // Suppression (cascade les licenses + login_codes via FK ou query separe).
  // On nettoie d'abord les login_codes (pas de FK sur user_id, juste email).
  await sb.from('lanceur_login_codes').delete().eq('email', session.email);

  const { error } = await sb.from('lanceur_users').delete().eq('id', session.sub);
  if (error) {
    console.error('delete-account: failed', error);
    return json(500, { error: 'server-error', message: error.message });
  }

  console.log(`Compte supprime : ${session.email} (${session.sub})`);
  return json(200, { ok: true, deletedUserId: session.sub });
};
