import { sandboxCheckout } from '../server/sandbox-checkout.mjs';

export default {
  fetch(request) {
    const settings = {
      supabaseUrl: process.env.SUPABASE_URL,
      publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
      serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      accessToken: process.env.SQUARE_SANDBOX_ACCESS_TOKEN,
      locationId: process.env.SQUARE_SANDBOX_LOCATION_ID
    };
    if (request.method === 'GET') {
      return Response.json({ configured: Object.values(settings).every(Boolean) }, {
        headers: { 'Cache-Control': 'no-store' }
      });
    }
    return sandboxCheckout(settings)(request);
  }
};
