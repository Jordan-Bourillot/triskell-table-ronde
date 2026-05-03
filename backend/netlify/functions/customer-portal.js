// POST /api/customer-portal
// Header : Authorization: Bearer <jwt>
//
// Cree une session Stripe Customer Portal pour l'utilisateur authentifie.
// Renvoie l'URL a ouvrir : il y verra ses factures, methodes de paiement
// et historique d'achat.
//
// Pre-requis :
//   - STRIPE_SECRET_KEY (deja configure)
//   - LANCEUR_APP_URL (fallback : https://triskell-studio.fr)
//   - Customer Portal active dans Stripe Dashboard (Settings > Billing > Customer portal)
//
// Si le user n'a jamais paye (pas de Stripe customer associe), on renvoie
// un statut 404 avec error: 'no-stripe-customer' et le frontend bascule
// sur le mailto fallback.

'use strict';

const Stripe = require('stripe');
const { json, preflight, authFromHeaders, getSupabaseClient } = require('./_lib');

exports.handler = async (event) => {
  const pre = preflight(event);
  if (pre) return pre;
  if (event.httpMethod !== 'POST') return json(405, { error: 'method' });

  const auth = authFromHeaders(event.headers);
  if (!auth) return json(401, { error: 'not-authenticated' });

  if (!process.env.STRIPE_SECRET_KEY) {
    return json(500, { error: 'stripe-not-configured' });
  }

  // 1. Recuperer le Stripe customer ID associe a cet email.
  // On le retrouve via les licences (chaque licence a un stripe_customer_id
  // ecrit par les webhooks). On prend le plus recent.
  let stripeCustomerId = null;
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('licenses')
      .select('stripe_customer_id, created_at')
      .eq('user_email', auth.email.toLowerCase())
      .not('stripe_customer_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) {
      console.error('customer-portal supabase:', error.message);
      return json(500, { error: 'db-error' });
    }
    if (data && data.length) stripeCustomerId = data[0].stripe_customer_id;
  } catch (err) {
    console.error('customer-portal:', err.message);
    return json(500, { error: 'db-error' });
  }

  if (!stripeCustomerId) {
    // Le user n'a jamais payé chez nous — pas de portal possible.
    return json(404, { error: 'no-stripe-customer' });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-11-20.acacia' });
  const returnUrl = process.env.LANCEUR_APP_URL || 'https://triskell-studio.fr';

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl,
    });
    return json(200, { url: session.url });
  } catch (err) {
    console.error('customer-portal stripe:', err.message);
    // Erreur typique : "No configuration provided" si le portal n'est pas
    // configure dans Stripe Dashboard.
    return json(500, { error: 'portal-error', message: err.message });
  }
};
