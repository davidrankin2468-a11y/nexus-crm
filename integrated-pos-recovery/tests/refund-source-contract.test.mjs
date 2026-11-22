import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../pos-api.js',import.meta.url),'utf8');
const verify=src.slice(src.indexOf('if(path==="/api/pos/square/sandbox-refund-verify"'),src.indexOf('if(path==="/api/pos/export"'));
const create=src.slice(src.indexOf('if(path==="/api/pos/square/sandbox-refund-test"'),src.indexOf('if(path==="/api/pos/square/sandbox-refund-verify"'));
test('refund verification is owner-only',()=>assert.match(verify,/if\(user\.role!=="owner"\)/));
test('refund verification is sandbox-only',()=>assert.match(verify,/if\(env\.SQUARE_ENVIRONMENT!=="sandbox"\)/));
test('verification requires stable operation ID',()=>assert.match(verify,/if\(!\/\^\[a-f0-9-\]\{36\}\$\/i\.test\(v\.operation_id\|\|""\)\)/));
test('no legacy verification key fallback',()=>assert.doesNotMatch(verify,/square_refund_/));
test('same operation checked before provider refund',()=>assert.ok(create.indexOf('const prior=await db.prepare')<create.indexOf('fetch("https://connect.squareupsandbox.com/v2/refunds"')));
test('same operation is Square idempotency key',()=>assert.match(create,/idempotency_key:key/));
test('unknown outcome blocks provider replay until reconciliation',()=>assert.match(create,/retrySameOperation:false,operationPending:true,recorded:false/));
test('ledger insert conditional on provider refund uniqueness',()=>assert.match(verify,/WHERE NOT EXISTS\(SELECT 1 FROM pos_refunds WHERE provider_refund_id=\?\)/));
test('provider refund verified before ledger insert',()=>assert.ok(verify.indexOf('await verifySandboxRefund')<verify.indexOf('await db.batch')));
test('atomic operation claim precedes provider POST',()=>assert.ok(create.indexOf('INSERT INTO pos_square_sandbox_refund_operations')>=0&&create.indexOf('INSERT INTO pos_square_sandbox_refund_operations')<create.indexOf('fetch("https://connect.squareupsandbox.com/v2/refunds"')));
test('duplicate claim blocks provider replay',()=>assert.match(create,/if\(Number\(claim\?\.meta\?\.changes/));

const reconciliationSource=readFileSync(new URL('../square-d1-reconciliation.js',import.meta.url),'utf8');
const sandboxModule=await import('data:text/javascript;base64,'+Buffer.from(reconciliationSource).toString('base64'));
const sandboxEnv={SQUARE_ENVIRONMENT:'sandbox',SQUARE_SANDBOX_ACCESS_TOKEN:'mock-secret',SQUARE_SANDBOX_LOCATION_ID:'sandbox-location',SQUARE_SANDBOX_MERCHANT_ID:'sandbox-merchant'};
const sandboxAttempt={sale_id:'11111111-1111-4111-8111-111111111111',idempotency_key:'test_key_12345678',amount_cents:250,square_location_id:'sandbox-location'};
test('mocked Square payment: rejects provider redirect without replay',async()=>{
 let calls=0;
 const result=await sandboxModule.submitSandboxFakePayment({attempt:sandboxAttempt,env:sandboxEnv,fetchImpl:async()=>{calls++;return {status:302,ok:false}}});
 assert.equal(result.submitted,false);assert.equal(result.reason,'SQUARE_REDIRECT_BLOCKED');assert.equal(calls,1);
});
test('mocked Square payment: timeout reports unknown provider outcome',async()=>{
 let calls=0;
 const result=await sandboxModule.submitSandboxFakePayment({attempt:sandboxAttempt,env:sandboxEnv,fetchImpl:async()=>{calls++;throw Error('simulated timeout')}});
 assert.equal(result.submitted,false);assert.equal(result.reason,'SQUARE_PROVIDER_UNAVAILABLE');assert.equal(calls,1);
});
test('mocked Square payment: provider 429 preserved as safe status',async()=>{
 const result=await sandboxModule.submitSandboxFakePayment({attempt:sandboxAttempt,env:sandboxEnv,fetchImpl:async()=>({status:429,ok:false})});
 assert.deepEqual(result,{submitted:false,reason:'SQUARE_PAYMENT_REJECTED',providerStatus:429});
});
test('mocked Square payment: invalid attempt never calls provider',async()=>{
 let calls=0;
 const result=await sandboxModule.submitSandboxFakePayment({attempt:{...sandboxAttempt,amount_cents:-1},env:sandboxEnv,fetchImpl:async()=>{calls++;throw Error('should not call')}});
 assert.equal(result.reason,'INVALID_ATTEMPT');assert.equal(calls,0);
});
test('mocked Square verification: rejects cross-location before provider call',async()=>{
 let calls=0;
 const result=await sandboxModule.verifyCompletedSquareSandboxPayment({paymentId:'sandbox_payment_123456',attempt:{...sandboxAttempt,square_location_id:'other-location'},env:sandboxEnv,fetchImpl:async()=>{calls++;throw Error('should not call')}});
 assert.equal(result.reason,'INVALID_ATTEMPT');assert.equal(calls,0);
});
test('payment idempotency: claim precedes fake payment submission',()=>{
 const handler=reconciliationSource.slice(reconciliationSource.indexOf('if(path==="/api/pos/square/sandbox-submit"'));
 assert.ok(handler.indexOf("status='submitted'")>=0);
 assert.ok(handler.indexOf("status='submitted'")<handler.indexOf('await submitSandboxFakePayment'));
 assert.match(handler,/a\.status!=="prepared"/);
 assert.match(handler,/reconciliation_required:a\.status==="unknown"/);
});

test('unknown sandbox payment outcome explicitly forbids replay',()=>{
 const handler=reconciliationSource.slice(reconciliationSource.indexOf('if(path==="/api/pos/square/sandbox-submit"'),reconciliationSource.indexOf('if(path==="/api/pos/square/sandbox-reconcile"'));
 assert.match(handler,/SANDBOX_SUBMISSION_OUTCOME_UNKNOWN[\\s\\S]*?retrySameOperation:false,operationPending:true/);
 assert.match(handler,/SANDBOX_PAYMENT_NEEDS_MANUAL_RECONCILIATION[\\s\\S]*?retrySameOperation:false,operationPending:true/);
});
