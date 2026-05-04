// POST /api/register-license
// Endpoint INTERNE appele par les webhooks Stripe (Suite des Heros, DeliNote, etc.)
// pour ajouter une licence a un compte (et creer le compte si besoin).
//
// Header : X-Internal-Secret: <INTERNAL_SHARED_SECRET>
// Body   : { email, productKey, stripeSessionId }

'use strict';

const crypto = require('crypto');
const { supabase, json, preflight, normalizeEmail } = require('./_lib');

const KNOWN_PRODUCTS = new Set([
  'suite-des-heros',
  'delinote',
  'studio-pdf',
  'bobeez',
  'pirate-life-mail',
  'ultimate-prompt-builder',  // alias display : AlphaBeast — paye 19€
  'alphapitch'                // gratuit, license trackee pour MAJ auto (ex 'triskell-sales-tunnel')
]);

function constantTimeEq(a, b) {
  const bufA = Buffer.from(a || '', 'utf8');
  const bufB = Buffer.from(b || '', 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

exports.handler = async (event) => {
  const pre = preflight(event);
  if (pre) return pre;
  if (event.httpMethod !== 'POST') return json(405, { error: 'method-not-allowed' });

  const provided = event.headers['x-internal-secret']
                || event.headers['X-Internal-Secret'];
  const expected = process.env.INTERNAL_SHARED_SECRET;
  if (!expected || !constantTimeEq(provided, expected)) {
    return json(401, { error: 'unauthorized' });
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (_) { return json(400, { error: 'invalid-json' }); }

  const email = normalizeEmail(body.email);
  const productKey = typeof body.productKey === 'string' ? body.productKey.trim() : '';
  const stripeSessionId = typeof body.stripeSessionId === 'string'
    ? body.stripeSessionId.trim() : null;

  if (!email) return json(400, { error: 'invalid-email' });
  if (!KNOWN_PRODUCTS.has(productKey)) return json(400, { error: 'unknown-product' });

  const sb = supabase();

  // 1. Cree (ou retrouve) l'utilisateur.
  const { data: user, error: upsertErr } = await sb
    .from('users')
    .upsert({ email }, { onConflict: 'email' })
    .select('id, email')
    .single();

  if (upsertErr || !user) {
    console.error('register-license: upsert user failed', upsertErr);
    return json(500, { error: 'server-error' });
  }

  // 2. Insere la licence (idempotent grace a stripe_session_id unique).
  const insertPayload = {
    user_id: user.id,
    product_key: productKey,
    stripe_session_id: stripeSessionId,
    status: 'active'
  };

  if (stripeSessionId) {
    const { data: existing } = await sb
      .from('licenses')
      .select('id')
      .eq('stripe_session_id', stripeSessionId)
      .maybeSingle();
    if (existing) {
      return json(200, { ok: true, licenseId: existing.id, deduped: true });
    }
  }

  const { data: license, error: licErr } = await sb
    .from('licenses')
    .insert(insertPayload)
    .select('id')
    .single();

  if (licErr) {
    console.error('register-license: insert license failed', licErr);
    return json(500, { error: 'server-error' });
  }

  return json(200, { ok: true, licenseId: license.id });
};
