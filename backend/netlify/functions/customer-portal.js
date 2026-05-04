// POST /api/customer-portal
// Header : Authorization: Bearer <jwt>
//
// Cree une session Stripe Customer Portal pour l'utilisateur authentifie.
// Renvoie l'URL a ouvrir : il y verra ses factures, methodes de paiement
// et historique d'achat.
//
// Pre-requis :
//   - STRIPE_SECRET_KEY
//   - LANCEUR_APP_URL (fallback : https://triskell-studio.fr)
//   - Customer Portal active dans Stripe Dashboard (Settings > Billing > Customer portal)
//
// On retrouve le Stripe customer via l'email du compte Triskell (tous nos
// checkouts sont crees avec customer_email = cet email, donc Stripe a un
// customer pour quiconque a paye au moins une fois). Si le user n'a jamais
// paye, on renvoie 404 'no-stripe-customer' et le frontend bascule sur le
// mailto fallback.

'use strict';

const Stripe = require('stripe');
const { json, preflight, authFromHeaders } = require('./_lib');

exports.handler = async (event) => {
  const pre = preflight(event);
  if (pre) return pre;
  if (event.httpMethod !== 'POST') return json(405, { error: 'method' });

  const auth = authFromHeaders(event.headers);
  if (!auth) return json(401, { error: 'not-authenticated' });

  if (!process.env.STRIPE_SECRET_KEY) {
    return json(500, { error: 'stripe-not-configured' });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-11-20.acacia' });

  // 1. Retrouver le customer Stripe via l'email du compte (lowercase pour
  // matcher la normalisation faite par Resend / login).
  let stripeCustomerId = null;
  try {
    const customers = await stripe.customers.list({
      email: String(auth.email || '').toLowerCase(),
      limit: 1
    });
    if (customers.data.length > 0) {
      stripeCustomerId = customers.data[0].id;
    }
  } catch (err) {
    console.error('customer-portal stripe list:', err.message);
    return json(500, { error: 'stripe-list-failed', message: err.message });
  }

  if (!stripeCustomerId) {
    return json(404, { error: 'no-stripe-customer' });
  }

  // 2. Creer la session de portail.
  const returnUrl = process.env.LANCEUR_APP_URL || 'https://triskell-studio.fr';
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl,
    });
    return json(200, { url: session.url });
  } catch (err) {
    console.error('customer-portal billingPortal:', err.message);
    // Erreur typique : "No configuration provided" si le portal n'est pas
    // configure dans Stripe Dashboard.
    return json(500, { error: 'portal-error', message: err.message });
  }
};
