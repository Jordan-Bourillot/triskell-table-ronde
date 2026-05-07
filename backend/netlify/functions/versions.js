// GET /api/versions
//
// Retourne la version la plus a jour de chaque produit. Le Lanceur compare
// avec la version installee localement pour afficher un badge "Mise a jour".
//
// Configuration via variables d'env Netlify :
//   SUITE_VERSION       (ex. "1.1.0")
//   DELINOTE_VERSION    (ex. "0.4.0")
//   STUDIO_PDF_VERSION  (ex. "0.2.0")
//   ...
// On garde un mapping statique ici, faciles a editer.

'use strict';

const { json, preflight } = require('./_lib');

exports.handler = async (event) => {
  const pre = preflight(event);
  if (pre) return pre;
  if (event.httpMethod !== 'GET') return json(405, { error: 'method' });

  const versions = {
    'suite-des-heros':         process.env.SUITE_VERSION                   || '1.0.0',
    'delinote':                process.env.DELINOTE_VERSION                || null,
    'studio-pdf':              process.env.STUDIO_PDF_VERSION              || null,
    'bobeez':                  process.env.BOBEEZ_VERSION                  || null,
    // ID interne 'ultimate-prompt-builder' = display name AlphaBeast
    'ultimate-prompt-builder': process.env.ALPHABEAST_VERSION              || null,
    'alphapitch':              process.env.ALPHAPITCH_VERSION              || null
  };

  // On filtre les nulls pour ne pas envoyer de bruit
  const out = {};
  for (const [k, v] of Object.entries(versions)) {
    if (v) out[k] = v;
  }

  return json(200, out);
};
