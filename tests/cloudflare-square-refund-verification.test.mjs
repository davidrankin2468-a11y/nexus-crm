import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const code=await readFile(new URL('../cloudflare/square-sandbox-refund-verification.js',import.meta.url),'utf8');
const {inspectSandboxRefund,verifySandboxRefund}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const env={SQUARE_ENVIRONMENT:'sandbox',SQUARE_SANDBOX_ACCESS_TOKEN:'test-token',SQUARE_SANDBOX_LOCATION_ID:'LOC123'};
const paymentId='pay_12345678',refundId='refund_12345678';
const refund={id:refundId,payment_id:paymentId,status:'COMPLETED',amount_money:{amount:100,currency:'USD'},location_id:'LOC123'};
const args={paymentId,amountCents:100,locationId:'LOC123'};
test('completed matching sandbox refund verified',async()=>{
 const r=await verifySandboxRefund({refundId,paymentId,amountCents:100,env,fetchImpl:async(url,opts)=>{
  assert.match(url,/squareupsandbox.com\/v2\/refunds\//);assert.equal(opts.redirect,'manual');
  return new Response(JSON.stringify({refund}));
 }});
 assert.equal(r.verified,true);
});
test('refund validation rejects mismatched payment, status, amount, currency and location',()=>{
 for(const bad of [{payment_id:'wrong'},{status:'PENDING'},{amount_money:{amount:99,currency:'USD'}},{amount_money:{amount:100,currency:'EUR'}},{location_id:'WRONG'}])
  assert.notEqual(inspectSandboxRefund({...refund,...bad},args),null);
});
test('provider errors and redirects fail closed',async()=>{
 for(const response of [new Response(null,{status:302}),new Response('{}',{status:503})]){
  const r=await verifySandboxRefund({refundId,paymentId,amountCents:100,env,fetchImpl:async()=>response});
  assert.equal(r.verified,false);
 }
});
test('network failure and missing credentials fail closed',async()=>{
 const r=await verifySandboxRefund({refundId,paymentId,amountCents:100,env,fetchImpl:async()=>{throw Error('offline')}});
 assert.equal(r.reason,'SQUARE_PROVIDER_UNAVAILABLE');
 assert.equal((await verifySandboxRefund({refundId,paymentId,amountCents:100,env:{}})).verified,false);
});
