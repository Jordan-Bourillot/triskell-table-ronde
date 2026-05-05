// POST /api/create-completion-checkout
// Header : Authorization: Bearer <jwt>
// Body   : { count, productIds: [...], expectedPrice (info, recalculé serveur) }
//
// Cree une session Stripe Checkout pour le "completion bundle" (Compléter
// ta Table). Le prix est calculé SERVEUR à partir des productIds reçus +
// la table de prix interne, jamais on ne fait confiance au prix client.
//
// Modèle de pricing (depuis 2026-05-03) : remise progressive sur le total
// individuel selon le nombre d'outils (2 → -15%, 3 → -25%, 4 → -35%).
// Plus de Price IDs Stripe figés : on utilise price_data à la volée pour
// que le checkout reflète exactement le prix qu'on vient de calculer.

'use strict';

const Stripe = require('stripe');
const { json, preflight, authFromHeaders } = require('./_lib');

// Source de vérité pour le pricing serveur. Doit rester en sync avec
// apps.json (frontend). Si tu ajoutes/retires/modifies un prix produit,
// modifie LES DEUX endroits — sinon le client paiera le prix recalculé
// serveur (qui prime), et un warning sera loggé en cas d'écart.
const PRODUCT_PRICES_EUR = {
  // Quotidien (paid premium)
  'suite-des-heros': 27,
  'delinote': 79,
  'studio-pdf': 39,
  'bobeez': 27,
  // Pro (paid premium) — ajoutes pour que le bundle "Compléter ta Table"
  // fonctionne aussi dans l'Atelier des Pros. Sinon le checkout retournait
  // 'discount-not-configured' quand l'user picke des produits pro.
  'le-denicheur': 129,
  'ultimate-prompt-builder': 19,   // alias display : AlphaBeast
  'pack-electricien-pro': 27
};

const DISCOUNTS = { 2: 15, 3: 25, 4: 35 };

function computeBundleCents(productIds) {
  const count = productIds.length;
  const discount = DISCOUNTS[count];
  if (typeof discount !== 'number') return null;

  let totalEur = 0;
  for (const id of productIds) {
    const p = PRODUCT_PRICES_EUR[id];
    if (typeof p !== 'number') return null; // produit inconnu
    totalEur += p;
  }
  const bundleEur = Math.round(totalEur * (1 - discount / 100));
  return bundleEur * 100; // Stripe veut des centimes
}

exports.handler = async (event) => {
  const pre = preflight(event);
  if (pre) return pre;
  if (event.httpMethod !== 'POST') return json(405, { error: 'method' });

  const auth = authFromHeaders(event.headers);
  if (!auth) return json(401, { error: 'not-authenticated' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (_) { return json(400, { error: 'invalid-json' }); }

  const productIds = Array.isArray(body.productIds)
    ? body.productIds.map(String).filter(Boolean) : [];
  // Dédoublonnage défensif : un même productId envoyé 2x ne doit pas multiplier.
  const uniqueIds = [...new Set(productIds)];
  if (uniqueIds.length !== productIds.length || uniqueIds.length < 2 || uniqueIds.length > 4) {
    return json(400, { error: 'invalid-product-list' });
  }

  const unitAmountCents = computeBundleCents(uniqueIds);
  if (unitAmountCents === null) {
    return json(400, { error: 'discount-not-configured', productIds: uniqueIds });
  }

  // Sanity check : on signale (sans bloquer) si le client annonçait un prix
  // différent du nôtre. Permet de detecter rapidement si frontend et backend
  // sont désynchronisés (ex. nouveau produit ajouté côté apps.json mais pas
  // côté backend).
  if (typeof body.expectedPrice === 'number'
      && Math.abs(body.expectedPrice - unitAmountCents / 100) > 0.5) {
    console.warn(`completion-checkout: client/server price mismatch ` +
                 `(client=${body.expectedPrice}€, server=${unitAmountCents/100}€)`);
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return json(500, { error: 'stripe-not-configured' });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-11-20.acacia' });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      // price_data : on passe le prix calculé directement sans créer un
      // Stripe Price persistant. Évite de se retrouver avec 1 Price par
      // combinaison possible (combinatoire explosive avec N produits).
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'eur',
          unit_amount: unitAmountCents,
          product_data: {
            name: `Compléter ta Table · ${uniqueIds.length} outils`,
            description: uniqueIds.join(', ')
          }
        }
      }],
      customer_email: auth.email,
      allow_promotion_codes: true,
      metadata: {
        userId: auth.sub,
        bundle: 'completion',
        count: String(uniqueIds.length),
        productIds: uniqueIds.join(',')
      },
      success_url: `${process.env.LANCEUR_APP_URL || 'https://app.triskell-studio.fr'}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${process.env.LANCEUR_APP_URL || 'https://app.triskell-studio.fr'}/cancel`
    });

    return json(200, { url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('completion-checkout failed', err);
    return json(500, { error: 'stripe-failed', message: err.message });
  }
};
