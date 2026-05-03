// POST /api/create-completion-checkout
// Header : Authorization: Bearer <jwt>
// Body   : { tier: 2|3|4, productIds: ["delinote", "studio-pdf", ...] }
//
// Cree une session Stripe Checkout pour le "completion bundle" (compléter
// ta Table). Le frontend a déjà calculé le tier en fonction de ce que
// l'utilisateur possede deja. On selectionne le prix Stripe correspondant.
//
// Les Stripe Price IDs doivent etre configures cote Netlify :
//   STRIPE_BUNDLE_PRICE_4   (bundle complet, 4 apps)
//   STRIPE_BUNDLE_PRICE_3   (3 apps)
//   STRIPE_BUNDLE_PRICE_2   (2 apps)
// Le webhook Stripe (en aval) doit appeler /api/register-license une fois par
// productId du bundle pour creer toutes les licences d'un coup.

'use strict';

const Stripe = require('stripe');
const { json, preflight, authFromHeaders } = require('./_lib');

exports.handler = async (event) => {
  const pre = preflight(event);
  if (pre) return pre;
  if (event.httpMethod !== 'POST') return json(405, { error: 'method' });

  const auth = authFromHeaders(event.headers);
  if (!auth) return json(401, { error: 'not-authenticated' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (_) { return json(400, { error: 'invalid-json' }); }

  const tier = parseInt(body.tier, 10);
  const productIds = Array.isArray(body.productIds) ? body.productIds : [];
  if (![2, 3, 4].includes(tier) || productIds.length !== tier) {
    return json(400, { error: 'invalid-tier' });
  }

  const priceId = process.env[`STRIPE_BUNDLE_PRICE_${tier}`];
  if (!priceId) {
    return json(501, { error: 'tier-not-configured', tier });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return json(500, { error: 'stripe-not-configured' });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-11-20.acacia' });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: auth.email,
      allow_promotion_codes: true,
      // On stocke les productIds dans les metadatas pour que le webhook
      // puisse register chaque licence individuellement apres paiement.
      metadata: {
        userId: auth.sub,
        bundle: 'completion',
        tier: String(tier),
        productIds: productIds.join(',')
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
