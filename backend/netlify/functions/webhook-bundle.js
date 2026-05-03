// POST /api/webhook-bundle
//
// Webhook Stripe dedie au bundle "Compléter ta Table". Branche cote Stripe
// dashboard sur le meme endpoint que les achats single, ou en endpoint dedie.
// On filtre via session.metadata.bundle === 'completion'.
//
// A reception de checkout.session.completed :
//   1. Verifie la signature Stripe.
//   2. Recupere les productIds depuis metadata.productIds (CSV).
//   3. Cree N licences en appelant register-license (idempotent via
//      stripe_session_id : on ajoute "#productId" pour que chaque licence
//      ait un session_id unique).
//
// Variables d'env requises :
//   STRIPE_SECRET_KEY
//   STRIPE_WEBHOOK_SECRET
//   INTERNAL_SHARED_SECRET   (pour appeler register-license)

'use strict';

const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-11-20.acacia'
});

const KNOWN_PRODUCTS = new Set([
  'suite-des-heros', 'delinote', 'studio-pdf', 'bobeez'
]);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'method-not-allowed' };
  }

  const signature = event.headers['stripe-signature'];
  if (!signature) return { statusCode: 400, body: 'no-signature' };

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64')
    : event.body;

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('webhook-bundle: bad signature', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  if (stripeEvent.type !== 'checkout.session.completed') {
    return { statusCode: 200, body: JSON.stringify({ received: true, ignored: stripeEvent.type }) };
  }

  const session = stripeEvent.data.object;
  const meta = session.metadata || {};

  if (meta.bundle !== 'completion') {
    return { statusCode: 200, body: JSON.stringify({ received: true, ignored: 'not-bundle' }) };
  }

  if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
    return { statusCode: 200, body: JSON.stringify({ received: true, status: session.payment_status }) };
  }

  const email = session.customer_details?.email || session.customer_email;
  if (!email) return { statusCode: 200, body: JSON.stringify({ received: true, error: 'no-email' }) };

  const productIds = (meta.productIds || '').split(',').map(s => s.trim()).filter(Boolean);
  const valid = productIds.filter(p => KNOWN_PRODUCTS.has(p));
  if (valid.length === 0) {
    return { statusCode: 200, body: JSON.stringify({ received: true, error: 'no-valid-products' }) };
  }

  const apiBase = process.env.SELF_API_URL
              || process.env.URL
              || 'https://triskell-lanceur-api.netlify.app';
  const internalSecret = process.env.INTERNAL_SHARED_SECRET;
  if (!internalSecret) {
    console.error('webhook-bundle: INTERNAL_SHARED_SECRET not set');
    return { statusCode: 500, body: 'misconfigured' };
  }

  const results = [];
  for (const productKey of valid) {
    try {
      const r = await fetch(`${apiBase}/api/register-license`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': internalSecret
        },
        body: JSON.stringify({
          email,
          productKey,
          // Suffixe le sessionId pour garantir l'unicite par licence
          stripeSessionId: `${session.id}#${productKey}`
        })
      });
      const data = await r.json().catch(() => ({}));
      results.push({ productKey, ok: r.ok, ...data });
    } catch (err) {
      results.push({ productKey, ok: false, error: err.message });
    }
  }

  const failed = results.filter(r => !r.ok);
  if (failed.length > 0) {
    console.error('webhook-bundle: some licences failed', failed);
    // 500 -> Stripe re-essaiera. register-license est idempotent donc safe.
    return { statusCode: 500, body: JSON.stringify({ received: true, results }) };
  }

  return { statusCode: 200, body: JSON.stringify({ received: true, count: results.length, results }) };
};
