// GET /api/me
// Header : Authorization: Bearer <jwt>
// Reponse : { user: { id, email }, licenses: [{ product_key, status, purchased_at }] }

'use strict';

const { supabase, json, preflight, authFromHeaders } = require('./_lib');

exports.handler = async (event) => {
  const pre = preflight(event);
  if (pre) return pre;
  if (event.httpMethod !== 'GET') return json(405, { error: 'method-not-allowed' });

  const session = authFromHeaders(event.headers);
  if (!session) return json(401, { error: 'unauthorized' });

  const sb = supabase();

  const { data: licenses, error } = await sb
    .from('lanceur_licenses')
    .select('product_key, status, purchased_at')
    .eq('user_id', session.sub)
    .eq('status', 'active')
    .order('purchased_at', { ascending: false });

  if (error) {
    console.error('me: select licenses failed', error);
    return json(500, { error: 'server-error' });
  }

  return json(200, {
    user: { id: session.sub, email: session.email },
    licenses: licenses || []
  });
};
