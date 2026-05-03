// POST /api/interest
// Header : Authorization: Bearer <jwt>
// Body   : { productKey }
//
// Enregistre l'interet d'un user pour un produit pas encore en vente
// (Studio PDF, Bobeez, etc.). Idempotent : un user ne peut pas etre
// "interesse" plusieurs fois pour le meme produit (UNIQUE INDEX).
//
// Retourne { ok: true, alreadyInterested?: true }.

'use strict';

const { supabase, json, preflight, authFromHeaders } = require('./_lib');

const KNOWN_PRODUCTS = new Set([
  'suite-des-heros', 'delinote', 'studio-pdf', 'bobeez', 'pirate-life-mail'
]);

exports.handler = async (event) => {
  const pre = preflight(event);
  if (pre) return pre;
  if (event.httpMethod !== 'POST') return json(405, { error: 'method-not-allowed' });

  const session = authFromHeaders(event.headers);
  if (!session) return json(401, { error: 'unauthorized' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (_) { return json(400, { error: 'invalid-json' }); }

  const productKey = String(body.productKey || '').trim();
  if (!KNOWN_PRODUCTS.has(productKey)) return json(400, { error: 'unknown-product' });

  const sb = supabase();

  // Insert idempotent — on ignore l'erreur si la paire (user, product) existe deja.
  const { error } = await sb
    .from('product_interest')
    .upsert(
      { user_id: session.sub, product_key: productKey, source: 'launcher' },
      { onConflict: 'user_id,product_key', ignoreDuplicates: true }
    );

  if (error) {
    console.error('interest: upsert failed', error);
    return json(500, { error: 'server-error', message: error.message });
  }

  console.log(`Interest enregistre : ${session.email} -> ${productKey}`);
  return json(200, { ok: true });
};
