import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeSandboxFailure} from './square-sandbox-failure-diagnostics.js';

test('refund timeout and network diagnostics retain only allowlisted metadata', () => {
 for (const reason of ['SQUARE_REFUND_TIMEOUT','SQUARE_REFUND_NETWORK']) {
  const record = sanitizeSandboxFailure({operation:'refund_submit',reason,providerStatus:503,at:'2026-11-22T16:00:00.000Z',accessToken:'DO_NOT_STORE',providerBody:{card:'4111111111111111'}});
  assert.deepEqual(record,{operation:'refund_submit',reason,providerStatus:503,at:'2026-11-22T16:00:00.000Z'});
  assert.equal(JSON.stringify(record).includes('DO_NOT_STORE'),false);
 }
});

test('invalid calendar dates and unknown reasons are discarded', () => {
 const record=sanitizeSandboxFailure({operation:'refund_submit',reason:'raw sensitive error',providerStatus:200,at:'2026-02-30T12:00:00.000Z'});
 assert.deepEqual(record,{operation:'refund_submit',reason:'UNKNOWN_FAILURE',providerStatus:null,at:null});
});
