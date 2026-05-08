// GET /api/admin/dashboard
// Header : Authorization: Bearer <jwt>
//
// Retourne un snapshot pour le dashboard admin :
// - totaux (users, licences actives, interets, codes login emis 24h)
// - 30 derniers users + 30 dernieres licences
// - interets groupes par produit (avec emails -> CSV pour mailing)
// - serie 30j (nouveaux users par jour, nouvelles licences par jour)

'use strict';

const { supabase, json, preflight, authAdmin } = require('./_lib');

exports.handler = async (event) => {
  const pre = preflight(event);
  if (pre) return pre;
  if (event.httpMethod !== 'GET') return json(405, { error: 'method-not-allowed' });

  const admin = authAdmin(event.headers);
  if (!admin) return json(403, { error: 'forbidden' });

  const sb = supabase();

  const since30dIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const since24hIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // --- Totaux (count: 'exact', head: true => requete legere) ---
  const [
    usersCountRes,
    licensesCountRes,
    licensesActiveCountRes,
    interestsCountRes,
    codes24hRes
  ] = await Promise.all([
    sb.from('lanceur_users').select('id', { count: 'exact', head: true }),
    sb.from('lanceur_licenses').select('id', { count: 'exact', head: true }),
    sb.from('lanceur_licenses').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    sb.from('lanceur_product_interest').select('id', { count: 'exact', head: true }),
    sb.from('lanceur_login_codes').select('id', { count: 'exact', head: true }).gte('created_at', since24hIso)
  ]);

  // --- Listes recentes ---
  const [usersList, licensesList, interestsList] = await Promise.all([
    sb.from('lanceur_users')
      .select('id, email, created_at, last_login_at')
      .order('created_at', { ascending: false })
      .limit(30),
    sb.from('lanceur_licenses')
      .select('id, product_key, status, stripe_session_id, purchased_at, user_id')
      .order('purchased_at', { ascending: false })
      .limit(30),
    sb.from('lanceur_product_interest')
      .select('id, product_key, created_at, user_id')
      .order('created_at', { ascending: false })
      .limit(200)
  ]);

  // Resoudre les emails pour les licenses + intérêts (1 lookup par batch)
  const userIds = new Set();
  for (const l of (licensesList.data || [])) if (l.user_id) userIds.add(l.user_id);
  for (const i of (interestsList.data || [])) if (i.user_id) userIds.add(i.user_id);

  let userById = {};
  if (userIds.size > 0) {
    const { data: usersForLookup } = await sb
      .from('lanceur_users')
      .select('id, email')
      .in('id', Array.from(userIds));
    for (const u of (usersForLookup || [])) userById[u.id] = u.email;
  }

  // --- Interests groupes par produit (avec emails) ---
  const interestsByProduct = {};
  for (const i of (interestsList.data || [])) {
    const key = i.product_key || 'unknown';
    if (!interestsByProduct[key]) interestsByProduct[key] = [];
    interestsByProduct[key].push({
      email: userById[i.user_id] || '?',
      created_at: i.created_at
    });
  }

  // --- Serie 30j : nouveaux users / licences par jour ---
  const [series30dUsers, series30dLicenses] = await Promise.all([
    sb.from('lanceur_users').select('created_at').gte('created_at', since30dIso),
    sb.from('lanceur_licenses').select('purchased_at').gte('purchased_at', since30dIso)
  ]);
  const dayKey = (iso) => iso ? iso.slice(0, 10) : '';
  const usersByDay = {};
  const licByDay = {};
  for (const u of (series30dUsers.data || [])) {
    const d = dayKey(u.created_at); if (d) usersByDay[d] = (usersByDay[d] || 0) + 1;
  }
  for (const l of (series30dLicenses.data || [])) {
    const d = dayKey(l.purchased_at); if (d) licByDay[d] = (licByDay[d] || 0) + 1;
  }
  // Combler les jours sans event pour avoir une serie continue
  const series = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);
    series.push({ day: d, users: usersByDay[d] || 0, licenses: licByDay[d] || 0 });
  }

  return json(200, {
    admin: { email: admin.email },
    totals: {
      users: usersCountRes.count || 0,
      licenses: licensesCountRes.count || 0,
      licenses_active: licensesActiveCountRes.count || 0,
      interests: interestsCountRes.count || 0,
      login_codes_24h: codes24hRes.count || 0
    },
    recent_users: (usersList.data || []).map(u => ({
      email: u.email,
      created_at: u.created_at,
      last_login_at: u.last_login_at
    })),
    recent_licenses: (licensesList.data || []).map(l => ({
      product_key: l.product_key,
      email: userById[l.user_id] || '?',
      status: l.status,
      stripe_session_id: l.stripe_session_id,
      purchased_at: l.purchased_at
    })),
    interests_by_product: interestsByProduct,
    series_30d: series
  });
};
