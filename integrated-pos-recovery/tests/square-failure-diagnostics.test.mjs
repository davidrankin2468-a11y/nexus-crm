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
