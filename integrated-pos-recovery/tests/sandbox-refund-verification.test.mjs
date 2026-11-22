import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../square-sandbox-refund-verification.js',import.meta.url),'utf8');
const {inspectSandboxRefund,verifySandboxRefund}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const env={SQUARE_ENVIRONMENT:'sandbox',SQUARE_SANDBOX_ACCESS_TOKEN:'mock-only',SQUARE_SANDBOX_LOCATION_ID:'sandbox_location'};
const good={id:'sandbox_refund_123456',payment_id:'sandbox_payment_123456',status:'COMPLETED',amount_money:{amount:50,currency:'USD'},location_id:'sandbox_location'};
const args={refundId:good.id,paymentId:good.payment_id,amountCents:50,env};
const response=(status,body)=>({status,ok:status>=200&&status<300,json:async()=>body});
test('completed partial refund verifies using read-only GET',async()=>{
 let count=0;const result=await verifySandboxRefund({...args,fetchImpl:async(url,options)=>{count++;assert.equal(options.method,'GET');assert.equal(options.redirect,'manual');assert.match(url,/connect.squareupsandbox.com\/v2\/refunds\//);return response(200,{refund:good})}});
 assert.equal(count,1);assert.equal(result.verified,true);
});
test('pending refund is rejected',()=>assert.equal(inspectSandboxRefund({...good,status:'PENDING'},{paymentId:good.payment_id,amountCents:50,locationId:good.location_id}),'REFUND_NOT_COMPLETED'));
test('wrong payment cannot reconcile',()=>assert.equal(inspectSandboxRefund({...good,payment_id:'another_payment'},{paymentId:good.payment_id,amountCents:50,locationId:good.location_id}),'PAYMENT_MISMATCH'));
test('wrong amount or currency cannot reconcile',()=>{
 for(const money of [{amount:51,currency:'USD'},{amount:50,currency:'EUR'}])assert.equal(inspectSandboxRefund({...good,amount_money:money},{paymentId:good.payment_id,amountCents:50,locationId:good.location_id}),'AMOUNT_MISMATCH');
});
test('wrong location cannot reconcile',()=>assert.equal(inspectSandboxRefund({...good,location_id:'another_location'},{paymentId:good.payment_id,amountCents:50,locationId:good.location_id}),'LOCATION_MISMATCH'));
test('provider redirect is blocked without following',async()=>{
 let calls=0;const result=await verifySandboxRefund({...args,fetchImpl:async()=>{calls++;return response(302,{})}});assert.equal(calls,1);assert.equal(result.reason,'SQUARE_REDIRECT_BLOCKED');
});
test('provider 429 retains only safe HTTP status',async()=>{
 const result=await verifySandboxRefund({...args,fetchImpl:async()=>response(429,{errors:[{detail:'secret'}]})});assert.deepEqual(result,{verified:false,reason:'SQUARE_REFUND_REJECTED',providerStatus:429});
});
test('timeout is fail closed',async()=>{
 const result=await verifySandboxRefund({...args,fetchImpl:async()=>{throw Error('timeout with sensitive detail')}});assert.deepEqual(result,{verified:false,reason:'SQUARE_PROVIDER_UNAVAILABLE'});
});
test('invalid input never calls Square',async()=>{
 let calls=0;const result=await verifySandboxRefund({...args,amountCents:0,fetchImpl:async()=>{calls++;return response(200,{refund:good})}});assert.equal(calls,0);assert.equal(result.reason,'INVALID_REFUND');
});
test('production environment cannot verify sandbox refunds',async()=>{
 let calls=0;const result=await verifySandboxRefund({...args,env:{...env,SQUARE_ENVIRONMENT:'production'},fetchImpl:async()=>{calls++;return response(200,{refund:good})}});assert.equal(calls,0);assert.equal(result.reason,'SANDBOX_NOT_CONFIGURED');
});

test('missing amount_money fails closed with an amount mismatch, not a provider outage',async()=>{
 const malformed={...good,amount_money:null};
 const result=await verifySandboxRefund({...args,fetchImpl:async()=>response(200,{refund:malformed})});
 assert.deepEqual(result,{verified:false,reason:'AMOUNT_MISMATCH'});
 assert.equal(inspectSandboxRefund(malformed,{paymentId:good.payment_id,amountCents:50,locationId:good.location_id}),'AMOUNT_MISMATCH');
});
