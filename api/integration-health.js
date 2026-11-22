// Vercel Node.js serverless function. Read-only integration diagnostics.
// No customer data, payment records, tokens, or secrets are returned.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  const timeoutMs = 6500;
  async function probe(url, headers) {
    try {
      const response = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(timeoutMs) });
      return { ok: response.ok, status: response.status };
    } catch (_) {
      return { ok: false, status: 'unreachable' };
    }
  }
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = process.env.SQUARE_SANDBOX_ACCESS_TOKEN;
  const checks = {
    supabase: url && key
      ? await probe(url + '/rest/v1/nexus_companies?select=id&limit=1', {
          apikey: key, Authorization: 'Bearer ' + key, Accept: 'application/json'
        })
      : { ok: false, status: 'not_configured' },
    squareSandbox: token
      ? await probe('https://connect.squareupsandbox.com/v2/locations', {
          Authorization: 'Bearer ' + token, 'Square-Version': '2025-10-16', Accept: 'application/json'
        })
      : { ok: false, status: 'not_configured' }
  };
  return res.status(checks.supabase.ok && checks.squareSandbox.ok ? 200 : 503).json({
    service: 'nexus-crm-pos-preview',
    mode: 'sandbox',
    productionPaymentsEnabled: false,
    checks
  });
}
