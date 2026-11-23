import { squareSandbox } from './square-sandbox.mjs';

export function sandboxCheckout({ supabaseUrl, publishableKey, serviceKey, accessToken, locationId, fetchImpl = fetch }) {
  return async request => {
    const reply = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
    if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
    const bearer = request.headers.get('Authorization');
    if (!bearer?.startsWith('Bearer ')) return reply({ error: 'Sign in to Nexus.' }, 401);
    if (!supabaseUrl || !publishableKey || !serviceKey || !accessToken || !locationId) {
      return reply({ error: 'Square Sandbox is awaiting server configuration.' }, 503);
    }
    const body = await request.json().catch(() => null);
    const saleId = body?.saleId;
    const kind = body?.action ?? 'payment';
    if (!['payment','refund'].includes(kind)) return reply({ error: 'Unknown Sandbox action.' }, 400);
    if (typeof saleId !== 'string' || !/^[a-z0-9-]{1,128}$/i.test(saleId)) {
      return reply({ error: 'Select a saved test receipt.' }, 400);
    }
    const operations = '/rest/v1/nexus_phase2_square_operations';
    async function database(path, method = 'GET', data, prefer) {
      const headers = { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey };
      if (data) headers['Content-Type'] = 'application/json';
      if (prefer) headers.Prefer = prefer;
      const response = await fetchImpl(supabaseUrl + path, { method, headers, body: data && JSON.stringify(data), redirect: 'error' });
      if (!response.ok) throw new Error('Database request failed.');
      if (response.status !== 204) return response.json();
    }
    try {
      const identity = await fetchImpl(supabaseUrl + '/auth/v1/user', {
        headers: { apikey: publishableKey, Authorization: bearer }, redirect: 'error'
      });
      if (!identity.ok) return reply({ error: 'Sign in to Nexus again.' }, 401);
      const { id: owner, email_confirmed_at: verified } = await identity.json();
      if (!verified || typeof owner !== 'string' || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(owner)) {
        return reply({ error: 'A verified Nexus account is required.' }, 403);
      }
      const query = new URLSearchParams({ owner_id: 'eq.' + owner, sale_id: 'eq.' + saleId, kind: 'eq.' + kind });
      const [workspace] = await database('/rest/v1/nexus_phase2_workspaces?' + new URLSearchParams({
        owner_id: 'eq.' + owner, select: 'records'
      }));
      const receipt = workspace?.records?.sales?.find(sale => sale?.id === saleId);
      if (!receipt) return reply({ error: 'Receipt not found in your owner workspace.' }, 404);
      const cents = receipt.totalCents;
      if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 100000) {
        return reply({ error: 'Sandbox receipts must total between $0.01 and $1,000.' }, 422);
      }
      let paymentId;
      if (kind === 'refund') {
        const paymentQuery = new URLSearchParams(query);
        paymentQuery.set('kind','eq.payment');
        const [payment] = await database(operations + '?' + paymentQuery);
        if (!payment?.provider_id || payment.status !== 'completed' ||
            payment.amount_cents !== cents || payment.location_id !== locationId) {
          return reply({ error: 'A matching completed Sandbox payment is required.' }, 409);
        }
        paymentId = payment.provider_id;
      }
      await database(operations + '?on_conflict=owner_id,sale_id,kind', 'POST', {
        owner_id: owner, sale_id: saleId, kind, amount_cents: cents, location_id: locationId
      }, 'resolution=ignore-duplicates,return=minimal');
      const [operation] = await database(operations + '?' + query);
      if (operation.amount_cents !== cents || operation.location_id !== locationId) {
        return reply({ error: 'The stored Sandbox attempt requires review.' }, 409);
      }
      if (['completed','pending'].includes(operation.status)) {
        return reply({ status: operation.status, providerId: operation.provider_id });
      }
      const claim = new URLSearchParams({ id: 'eq.' + operation.id, status: 'eq.prepared' });
      const [claimed] = await database(operations + '?' + claim, 'PATCH', { status: 'submitted' }, 'return=representation');
      if (!claimed) return reply({ error: 'This Sandbox attempt is in progress or requires reconciliation.' }, 409);
      const operationPath = operations + '?id=eq.' + encodeURIComponent(operation.id) + '&status=eq.submitted';
      try {
        const square = squareSandbox({ accessToken, locationId, fetchImpl });
        const args = { idempotencyKey: operation.id, cents };
        const result = kind === 'refund'
          ? await square.refund({ ...args, paymentId })
          : { id: await square.pay(args), status: 'COMPLETED' };
        const status = result.status.toLowerCase();
        const [saved] = await database(operationPath, 'PATCH', { status, provider_id: result.id }, 'return=representation');
        if (!saved) throw new Error('Sandbox result not saved.');
        return reply({ status, providerId: result.id });
      } catch {
        await database(operationPath, 'PATCH', { status: 'needs_review' }).catch(() => {});
        return reply({ error: 'Square Sandbox outcome requires reconciliation. No new attempt was started.' }, 502);
      }
    } catch {
      return reply({ error: 'Sandbox checkout could not finish. Check the stored attempt before retrying.' }, 502);
    }
  };
}
