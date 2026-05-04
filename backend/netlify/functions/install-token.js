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
    downloadHost: SUITE_HOST,                        // CDN partage productivite
    assetPath: '/_dl/delinote-setup.exe',
    version: '0.9.9',
    validityHours: 24,
    expectedExePath: 'C:\\Users\\<USER>\\AppData\\Local\\Programs\\delinote\\DeliNote.exe'
  },
  // Display name : AlphaBeast. ID interne reste 'ultimate-prompt-builder'
  // pour ne pas casser les licences DB existantes.
  // TODO Jordan : verifier que /_dl/alphabeast-setup.exe existe sur le CDN
  // (sinon ajuster assetPath). Idem expectedExePath selon ce que ton NSIS pose.
  'ultimate-prompt-builder': {
    kind: 'exe-installer',
    downloadHost: SUITE_HOST,
    assetPath: '/_dl/alphabeast-setup.exe',
    version: '1.0.0',
    validityHours: 24,
    expectedExePath: 'C:\\Users\\<USER>\\AppData\\Local\\Programs\\AlphaBeast\\AlphaBeast.exe'
  },
  // AlphaPitch (ex 'triskell-sales-tunnel') : gratuit mais on passe par le meme flux pour
  // tracker les installs et delivrer les MAJ auto.
  // TODO Jordan : verifier que /_dl/alphapitch-setup.exe existe sur le CDN
  // (sinon ajuster assetPath). Idem expectedExePath selon ce que ton NSIS pose.
  'alphapitch': {
    kind: 'exe-installer',
    downloadHost: SUITE_HOST,
    assetPath: '/_dl/alphapitch-setup.exe',
    version: '1.0.0',
    validityHours: 24,
    expectedExePath: 'C:\\Users\\<USER>\\AppData\\Local\\Programs\\AlphaPitch\\AlphaPitch.exe',
    isFree: true   // pas de license a verifier (gratuit, pas de webhook Stripe)
  }
};

// Produits gratuits : on skip la verification de license puisqu'aucun
// paiement Stripe ne crée de license en DB. L'auth JWT seule suffit a
// gater le download (un user non-connecte n'aura jamais de session valide).
const FREE_PRODUCTS = new Set(
  Object.entries(PRODUCT_CONFIG).filter(([, c]) => c.isFree).map(([k]) => k)
);

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

  // Admin bypass : un email dans ADMIN_EMAILS (env Netlify, CSV) court-circuite
  // tout check de licence. Fallback hardcode : contact@triskell-studio.fr
  // (founder Jordan) — comme ca meme si ADMIN_EMAILS n'est pas configure
  // sur Netlify, le founder peut quand meme tout installer.
  const FOUNDER_EMAIL = 'contact@triskell-studio.fr';
  const adminList = [
    FOUNDER_EMAIL,
    ...(process.env.ADMIN_EMAILS || '')
      .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  ];
  const isAdmin = !!session.email
    && adminList.includes(String(session.email).toLowerCase());

  // Produits gratuits OU admin : on saute le check license (aucun webhook
  // Stripe ne crée de license pour un produit gratuit, et un admin n'a pas
  // a en avoir une). L'auth JWT du user suffit a gater le download. On
  // utilise un faux objet license avec un id stable dans le HMAC du
  // download URL si la strategie A est utilisee plus tard.
  let license;
  if (FREE_PRODUCTS.has(productKey) || isAdmin) {
    const tag = isAdmin ? 'admin' : 'free';
    license = { id: `${tag}-${session.sub}`, stripe_session_id: null };
  } else {
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
    license = licenses[0];
  }

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
