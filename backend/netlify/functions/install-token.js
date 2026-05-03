// GET /api/install-token?product=<productKey>
// Header : Authorization: Bearer <jwt>
//
// Verifie que l'utilisateur possede une licence active pour ce produit, puis
// renvoie une URL de telechargement courte-duree.
//
// Reponse : { downloadUrl, version, kind, mainExe? }
//
// Implementation :
// - Pour 'suite-des-heros' : on genere un token HMAC compatible avec
//   l'endpoint /api/download deja en place sur productivite.triskell-studio.fr,
//   en reutilisant le DOWNLOAD_SIGNING_SECRET partage entre les deux backends.
// - Pour les autres produits : pas encore cable (renvoie 501).

'use strict';

const crypto = require('crypto');
const { supabase, json, preflight, authFromHeaders } = require('./_lib');

const PRODUCT_CONFIG = {
  'suite-des-heros': {
    kind: 'zip-bundle',
    downloadHost: process.env.SUITE_DOWNLOAD_HOST
                || 'https://productivite.triskell-studio.fr',
    version: process.env.SUITE_VERSION || '1.0',
    validityHours: 24
  },
  // Sera ajoute quand DeliNote aura son endpoint de download.
  // 'delinote': { kind: 'exe-installer', ... }
};

exports.handler = async (event) => {
  const pre = preflight(event);
  if (pre) return pre;
  if (event.httpMethod !== 'GET') return json(405, { error: 'method-not-allowed' });

  const session = authFromHeaders(event.headers);
  if (!session) return json(401, { error: 'unauthorized' });

  const productKey = (event.queryStringParameters || {}).product;
  if (!productKey) return json(400, { error: 'missing-product' });

  const config = PRODUCT_CONFIG[productKey];
  if (!config) return json(501, { error: 'product-not-installable' });

  // 1. Verifie que l'utilisateur a une licence active sur ce produit.
  const sb = supabase();
  const { data: licenses, error } = await sb
    .from('licenses')
    .select('id, stripe_session_id, purchased_at')
    .eq('user_id', session.sub)
    .eq('product_key', productKey)
    .eq('status', 'active')
    .order('purchased_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('install-token: select failed', error);
    return json(500, { error: 'server-error' });
  }
  if (!licenses || licenses.length === 0) {
    return json(403, { error: 'no-license' });
  }

  const license = licenses[0];

  // 2. Genere une URL de telechargement.
  if (productKey === 'suite-des-heros') {
    const url = buildSuiteDownloadUrl({
      stripeSessionId: license.stripe_session_id || `lanceur-${license.id}`,
      email: session.email,
      validityHours: config.validityHours,
      downloadHost: config.downloadHost
    });
    return json(200, {
      downloadUrl: url,
      version: config.version,
      kind: config.kind
    });
  }

  return json(501, { error: 'not-implemented' });
};

// Token compatible avec le download.js de productivite.triskell-studio.fr :
//   base64url(sessionId|email|expiresAt) + "." + hexHmacSha256(payload, secret)
function buildSuiteDownloadUrl({ stripeSessionId, email, validityHours, downloadHost }) {
  const secret = process.env.DOWNLOAD_SIGNING_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('DOWNLOAD_SIGNING_SECRET manquant ou trop court');
  }
  const expiresAt = Date.now() + validityHours * 60 * 60 * 1000;
  const payload = `${stripeSessionId}|${email}|${expiresAt}`;
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const token = `${Buffer.from(payload).toString('base64url')}.${signature}`;
  return `${downloadHost}/api/download?t=${encodeURIComponent(token)}`;
}
