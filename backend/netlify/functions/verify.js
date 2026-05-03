// POST /api/verify
// Body : { email, code }
// Effet : verifie le code, cree (ou retrouve) le compte, renvoie un JWT de session.
// Reponse : { token, user: { id, email } }

'use strict';

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

  // Cree (ou retrouve) l'utilisateur.
  const { data: user, error: upsertErr } = await sb
    .from('users')
    .upsert({ email, last_login_at: nowIso }, { onConflict: 'email' })
    .select('id, email')
    .single();

  if (upsertErr || !user) {
    console.error('verify: upsert user failed', upsertErr);
    return json(500, { error: 'server-error' });
  }

  const token = signSession(user);
  return json(200, { token, user });
};
