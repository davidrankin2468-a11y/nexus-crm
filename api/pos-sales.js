// Authenticated, read-only CRM/POS sales endpoint for the Vercel preview.
// Supabase access tokens are validated server-side; no service-role key is sent to browsers.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function supabase(path, key, bearer) {
  const response = await fetch(process.env.SUPABASE_URL.replace(/\/$/, '') + path, {
    headers: { apikey: key, Authorization: 'Bearer ' + bearer, Accept: 'application/json' },
    signal: AbortSignal.timeout(7000)
  });
  return { ok: response.ok, status: response.status, data: response.ok ? await response.json() : null };
}
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  const companyId = req.query?.company_id;
  if (typeof companyId !== 'string' || !uuid.test(companyId)) return res.status(400).json({ error: 'invalid_company_id' });
  const header = req.headers.authorization || '';
  if (!/^Bearer [A-Za-z0-9._~-]+$/.test(header)) return res.status(401).json({ error: 'authentication_required' });
  const token = header.slice(7);
  const url = process.env.SUPABASE_URL;
  const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publishable || !service) return res.status(503).json({ error: 'backend_unavailable' });
  try {
    const userResponse = await fetch(url.replace(/\/$/, '') + '/auth/v1/user', {
      headers: { apikey: publishable, Authorization: 'Bearer ' + token },
      signal: AbortSignal.timeout(7000)
    });
    if (!userResponse.ok) return res.status(401).json({ error: 'invalid_session' });
    const user = await userResponse.json();
    if (!user?.id || !uuid.test(user.id)) return res.status(401).json({ error: 'invalid_session' });
    // Check membership with service role, scoped to both the verified user and requested company.
    const member = await supabase('/rest/v1/nexus_company_members?select=role&company_id=eq.' + encodeURIComponent(companyId) + '&user_id=eq.' + encodeURIComponent(user.id) + '&limit=1', service, service);
    if (!member.ok) return res.status(503).json({ error: 'membership_lookup_failed' });
    if (!member.data?.length) return res.status(403).json({ error: 'company_access_denied' });
    const role = member.data[0].role;
    if (!['owner', 'admin'].includes(role)) return res.status(403).json({ error: 'insufficient_permissions' });
    const sales = await supabase('/rest/v1/nexus_pos_sales?select=id,status,subtotal_cents,tax_cents,total_cents,created_at&company_id=eq.' + encodeURIComponent(companyId) + '&order=created_at.desc&limit=50', service, service);
    if (!sales.ok) return res.status(503).json({ error: 'sales_lookup_failed' });
    return res.status(200).json({ company_id: companyId, sales: sales.data });
  } catch (_) {
    return res.status(503).json({ error: 'backend_unavailable' });
  }
}
