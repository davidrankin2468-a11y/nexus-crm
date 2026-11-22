import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeSandboxFailure} from '../square-sandbox-failure-diagnostics.js';

test('diagnostic records retain only approved fields and codes', () => {
 const result=sanitizeSandboxFailure({reason:'SQUARE_REFUND_REJECTED',providerStatus:429,operation:'refund_verify',at:'2026-11-22T14:00:00.000Z',accessToken:'secret',paymentId:'sensitive',error:'raw provider response'});
 assert.deepEqual(result,{operation:'refund_verify',reason:'SQUARE_REFUND_REJECTED',providerStatus:429,at:'2026-11-22T14:00:00.000Z'});
 assert.equal(JSON.stringify(result).includes('secret'),false);
 assert.equal(Object.isFrozen(result),true);
});
test('unknown reason and invalid fields fail closed',()=>{
 assert.deepEqual(sanitizeSandboxFailure({reason:'token=secret',providerStatus:200,operation:'delete',at:'invalid'}),{operation:'unknown',reason:'UNKNOWN_FAILURE',providerStatus:null,at:null});
});

test('known Square payment failures retain actionable sanitized reason',()=>{
 for(const reason of ['SQUARE_PAYMENT_REJECTED','SQUARE_LOCATIONS_REJECTED','PAYMENT_ID_NOT_RETURNED','PAYMENT_NOT_COMPLETED','MERCHANT_LOCATION_NOT_VERIFIED','SALE_REFERENCE_MISMATCH','INVALID_ATTEMPT']){
  const value=sanitizeSandboxFailure({reason,providerStatus:503,operation:'payment_reconcile',rawBody:'private'});
  assert.equal(value.reason,reason);
  assert.equal(value.providerStatus,503);
  assert.equal('rawBody' in value,false);
 }
});
