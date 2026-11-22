import test from 'node:test';
import assert from 'node:assert/strict';
import { verifySandboxRefund, inspectSandboxRefund } from '../square-sandbox-refund-verification.js';

const env = { SQUARE_ENVIRONMENT: 'sandbox', SQUARE_SANDBOX_ACCESS_TOKEN: 'fake-test-token', SQUARE_SANDBOX_LOCATION_ID: 'sandbox-location' };
const refundId = 'sandbox_refund_123', paymentId = 'sandbox_payment_123';
test('rejects invalid and out-of-range refund amounts without contacting Square', async () => {
  for (const amountCents of [0, -1, 1.5, Number.MAX_SAFE_INTEGER, 100000001, NaN]) {
    let calls = 0;
    const result = await verifySandboxRefund({ refundId, paymentId, amountCents, env, fetchImpl: async () => { calls++; throw Error('network should not be used'); } });
    assert.deepEqual(result, { verified: false, reason: 'INVALID_REFUND' });
    assert.equal(calls, 0);
  }
});
test('rejects missing provider amount without throwing', () => {
  const reason = inspectSandboxRefund({ id: refundId, payment_id: paymentId, status: 'COMPLETED' }, { paymentId, amountCents: 100, locationId: env.SQUARE_SANDBOX_LOCATION_ID });
  assert.equal(reason, 'AMOUNT_MISMATCH');
});
test('rejects redirect without following it', async () => {
  let redirectMode;
  const result = await verifySandboxRefund({ refundId, paymentId, amountCents: 100, env, fetchImpl: async (_url, opts) => { redirectMode = opts.redirect; return { status: 302, ok: false }; } });
  assert.equal(redirectMode, 'manual');
  assert.equal(result.reason, 'SQUARE_REDIRECT_BLOCKED');
});
