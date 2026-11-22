import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../square-d1-reconciliation.js',import.meta.url),'utf8');
const moduleUnderTest=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const env={SQUARE_ENVIRONMENT:'sandbox',SQUARE_SANDBOX_ACCESS_TOKEN:'test-only-token',SQUARE_SANDBOX_LOCATION_ID:'test-location',SQUARE_SANDBOX_MERCHANT_ID:'test-merchant'};
const attempt={sale_id:'11111111-1111-4111-8111-111111111111',idempotency_key:'test_key_12345678',amount_cents:250,square_location_id:'test-location'};
const payment={id:'test_payment_12345',status:'COMPLETED',location_id:'test-location',merchant_id:'test-merchant',reference_id:attempt.sale_id,amount_money:{amount:250,currency:'USD'},total_money:{amount:250,currency:'USD'}};
const check=(p)=>moduleUnderTest.inspectSquarePayment(p,payment.id,attempt,env);
test('valid completed sandbox payment matches all reconciliation fields',()=>assert.equal(check(payment),null));
test('wrong sale reference is rejected',()=>assert.equal(check({...payment,reference_id:'another-sale'}),'SALE_REFERENCE_MISMATCH'));
test('wrong merchant is rejected',()=>assert.equal(check({...payment,merchant_id:'other-merchant'}),'MERCHANT_MISMATCH'));
test('wrong location is rejected',()=>assert.equal(check({...payment,location_id:'other-location'}),'LOCATION_MISMATCH'));
test('currency mismatch is rejected',()=>assert.equal(check({...payment,amount_money:{amount:250,currency:'EUR'}}),'AMOUNT_MISMATCH'));
test('amount mismatch is rejected',()=>assert.equal(check({...payment,amount_money:{amount:251,currency:'USD'}}),'AMOUNT_MISMATCH'));
test('already-refunded payment cannot reconcile as new payment',()=>assert.equal(check({...payment,refunded_money:{amount:1,currency:'USD'}}),'PAYMENT_ALREADY_REFUNDED'));
test('pending payment cannot reconcile',()=>assert.equal(check({...payment,status:'PENDING'}),'PAYMENT_NOT_COMPLETED'));
test('invalid attempt never calls Square',async()=>{
 let calls=0;
 const result=await moduleUnderTest.verifyCompletedSquareSandboxPayment({paymentId:payment.id,attempt:{...attempt,amount_cents:-1},env,fetchImpl:async()=>{calls++;throw Error('unexpected network call')}});
 assert.equal(result.verified,false);assert.equal(result.reason,'INVALID_ATTEMPT');assert.equal(calls,0);
});
test('payment lookup rejects redirect without following it',async()=>{
 let calls=0;
 const result=await moduleUnderTest.verifyCompletedSquareSandboxPayment({paymentId:payment.id,attempt,env,fetchImpl:async()=>{calls++;return calls===1?{ok:true,status:200,json:async()=>({locations:[{id:'test-location',merchant_id:'test-merchant'}]})}:{ok:false,status:302}}});
 assert.equal(result.verified,false);assert.equal(result.reason,'SQUARE_REDIRECT_BLOCKED');assert.equal(calls,2);
});
