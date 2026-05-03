// GET /api/install-token?product=<productKey>
// Header : Authorization: Bearer <jwt>
//
// Verifie que l'utilisateur possede une licence active pour ce produit, puis
// renvoie une URL de telechargement courte-duree.
//
// Reponse : { downloadUrl, version, kind, mainExe? }

'use strict';

const crypto = require('crypto');
const { supabase, json, preflight, authFromHeaders } = require('./_lib');

// Tous les produits installables passent par le meme endpoint /api/download
// de productivite.triskell-studio.fr (qui sait verifier le HMAC + delivrer).
// Chaque produit a son propre asset path et son propre kind d'installer.
const SUITE_HOST = process.env.SUITE_DOWNLOAD_HOST
                || 'https://productivite.triskell-studio.fr';

const PRODUCT_CONFIG = {
  'suite-des-heros': {
    kind: 'zip-bundle',
    downloadHost: SUITE_HOST,
    assetPath: '/api/download',          // utilise le download.js avec HMAC
    version: process.env.SUITE_VERSION || '1.0',
    validityHours: 24
  },
  'studio-pdf': {
    kind: 'exe-installer',
    downloadHost: SUITE_HOST,
    assetPath: '/_dl/studio-pdf-setup.exe',  // fichier statique CDN, pas de signature
    version: '2.7',
    validityHours: 24,
    expectedExePath: 'C:\\Users\\<USER>\\AppData\\Local\\Programs\\Le Studio PDF\\Le Studio PDF.exe'
  },
  'bobeez': {
    kind: 'exe-installer',
    downloadHost: SUITE_HOST,
    assetPath: '/_dl/bobeez-setup.exe',
    version: '0.1.4',
    validityHours: 24,
    expectedExePath: 'C:\\Users\\<USER>\\AppData\\Local\\Programs\\Bobeez\\Bobeez.exe'
  },
  'delinote': {
    kind: 'exe-installer',
    downloadHost: 'https://delinote.triskell-studio.fr',
    assetPath: '/api/download',
    version: 'latest',
    validityHours: 24
  }
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

  // 2. Genere l'URL de telechargement selon la strategie du produit.
  // Strategie A : assetPath = '/api/download' -> on signe un token HMAC pour
  //   passer le check serveur (download.js verifie la signature + bypass Stripe).
  // Strategie B : assetPath = '/_dl/...' -> on retourne juste l'URL CDN
  //   directe (le check de licence ci-dessus est notre seul gate).
  if (config.assetPath === '/api/download') {
    const url = buildSignedDownloadUrl({
      stripeSessionId: license.stripe_session_id || `lanceur-${license.id}`,
      email: session.email,
      validityHours: config.validityHours,
      downloadHost: config.downloadHost
    });
    return json(200, {
      downloadUrl: url,
      version: config.version,
      kind: config.kind,
      expectedExePath: config.expectedExePath || null
    });
  }

  // Asset CDN direct
  return json(200, {
    downloadUrl: `${config.downloadHost}${config.assetPath}`,
    version: config.version,
    kind: config.kind,
    expectedExePath: config.expectedExePath || null
  });
};

// Token compatible avec le download.js de productivite.triskell-studio.fr :
//   base64url(sessionId|email|expiresAt) + "." + hexHmacSha256(payload, secret)
function buildSignedDownloadUrl({ stripeSessionId, email, validityHours, downloadHost }) {
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
