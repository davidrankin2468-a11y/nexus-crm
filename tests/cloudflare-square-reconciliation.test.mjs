import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const code=await readFile(new URL('../cloudflare/square-d1-reconciliation.js',import.meta.url),'utf8');
const {inspectSquarePayment,verifyCompletedSquareSandboxPayment,submitSandboxFakePayment,handleSquareSandboxAttempt}=
 await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));

const env={SQUARE_ENVIRONMENT:'sandbox',SQUARE_SANDBOX_ACCESS_TOKEN:'fake-sandbox-token',
 SQUARE_SANDBOX_LOCATION_ID:'LOC_1234',SQUARE_SANDBOX_MERCHANT_ID:'MERCHANT_123'};
const paymentId='pay_test_123456789',saleId='f341ff51-0adb-487f-8ac0-b0f9a58945fd';
const attempt={sale_id:saleId,amount_cents:1250,square_location_id:env.SQUARE_SANDBOX_LOCATION_ID};
const payment={id:paymentId,status:'COMPLETED',location_id:env.SQUARE_SANDBOX_LOCATION_ID,
 reference_id:saleId,amount_money:{amount:1250,currency:'USD'},total_money:{amount:1250,currency:'USD'}};
const squareOk=async(url,opts)=>{
 assert.equal(opts.redirect,'manual');
 assert.equal(opts.method,'GET');
 assert.match(opts.headers.Authorization,/Bearer fake-sandbox-token/);
 if(url.endsWith('/v2/locations'))return new Response(JSON.stringify({locations:[{id:'LOC_1234',merchant_id:'MERCHANT_123'}]}));
 if(url.endsWith('/v2/payments/'+paymentId))return new Response(JSON.stringify({payment}));
 throw Error('Unexpected URL: '+url);
};

test('valid completed sandbox payment must match configured account, location, sale, amount and currency',async()=>{
 const res=await verifyCompletedSquareSandboxPayment({paymentId,attempt,env,fetchImpl:squareOk});
 assert.deepEqual(res,{verified:true,paymentId,amountCents:1250});
});
test('inspection fails closed on status, amount, currency, reference, merchant and location mismatches',()=>{
 const bad=[
  [{status:'APPROVED'},'PAYMENT_NOT_COMPLETED'],
  [{amount_money:{amount:1251,currency:'USD'}},'AMOUNT_MISMATCH'],
  [{amount_money:{amount:1250,currency:'EUR'}},'AMOUNT_MISMATCH'],
  [{reference_id:'different'},'SALE_REFERENCE_MISMATCH'],
  [{merchant_id:'OTHER'},'MERCHANT_MISMATCH'],
  [{location_id:'OTHER'},'LOCATION_MISMATCH'],
  [{total_money:{amount:1251,currency:'USD'}},'TOTAL_MISMATCH'],
  [{refunded_money:{amount:100,currency:'USD'}},'PAYMENT_ALREADY_REFUNDED'],
  [{id:'other'},'PAYMENT_ID_MISMATCH']
 ];
 for(const [part,reason] of bad)assert.equal(inspectSquarePayment({...payment,...part},paymentId,attempt,env),reason);
});
test('provider authentication and merchant location mismatch fail closed',async()=>{
 const bad=await verifyCompletedSquareSandboxPayment({paymentId,attempt,env,
  fetchImpl:async()=>new Response(JSON.stringify({locations:[{id:'LOC_1234',merchant_id:'OTHER'}]}))});
 assert.equal(bad.reason,'MERCHANT_LOCATION_NOT_VERIFIED');
 assert.equal(bad.verified,false);
});
test('provider redirects are blocked and not followed',async()=>{
 let calls=0;
 const bad=await verifyCompletedSquareSandboxPayment({paymentId,attempt,env,
  fetchImpl:async()=>{calls++;return new Response(null,{status:302,headers:{Location:'https://example.invalid'}})}});
 assert.equal(calls,1);assert.equal(bad.reason,'SQUARE_REDIRECT_BLOCKED');
});
test('provider timeout/network failure is not payment verification',async()=>{
 const bad=await verifyCompletedSquareSandboxPayment({paymentId,attempt,env,
  fetchImpl:async()=>{throw Error('temporary outage')}});
 assert.equal(bad.verified,false);assert.equal(bad.reason,'SQUARE_PROVIDER_UNAVAILABLE');
});
test('production mode never sends a provider request',async()=>{
 let calls=0;
 const bad=await verifyCompletedSquareSandboxPayment({paymentId,attempt,
  env:{...env,SQUARE_ENVIRONMENT:'production'},fetchImpl:async()=>{calls++}});
 assert.equal(calls,0);assert.equal(bad.reason,'SANDBOX_NOT_CONFIGURED');
});
test('preparation rejects invalid references before accessing D1',async()=>{
 let touched=false;
 const db={prepare:()=>{touched=true;throw Error('DB should not be used')}};
 const response=await handleSquareSandboxAttempt({path:'/api/pos/square/sandbox-prepare',
  method:'POST',body:{sale_id:'bad',idempotency_key:'bad'},db,env,tenant:'some-tenant'});
 assert.equal(response.status,400);assert.equal(touched,false);
});
test('reconciliation rejects arbitrary invalid payment IDs before accessing D1',async()=>{
 let touched=false;
 const db={prepare:()=>{touched=true;throw Error('DB should not be used')}};
 const response=await handleSquareSandboxAttempt({path:'/api/pos/square/sandbox-reconcile',
  method:'POST',body:{attempt_id:saleId,payment_id:'../../danger'},db,env,tenant:'some-tenant'});
 assert.equal(response.status,400);assert.equal(touched,false);
});
test('sandbox preparation does not contact provider and returns existing idempotent attempt',async()=>{
 let calls=[];
 const old={id:'attempt-old',idempotency_key:'safe-key-111',amount_cents:1250,
  square_location_id:'LOC_1234',status:'prepared'};
 const db={prepare:(sql)=>({bind:(...args)=>({first:async()=>{
  calls.push({sql,args});
  return sql.includes('FROM pos_sales')?{id:saleId,status:'pending',total_cents:1250,currency:'USD'}:old;
 }})})};
 const res=await handleSquareSandboxAttempt({path:'/api/pos/square/sandbox-prepare',method:'POST',
  body:{sale_id:saleId,idempotency_key:'safe-key-111'},db,env,tenant:'tenant-A',
  fetchImpl:async()=>{throw Error('No provider calls allowed')}});
 const body=await res.json();
 assert.equal(body.duplicate,true);assert.equal(body.payment_charged,false);
 assert.equal(calls.length,2);
 assert.deepEqual(calls[0].args,['tenant-A',saleId]);
});

test('fake Sandbox submission never uses real cards, client totals or production URL',async()=>{
 let body;const attemptWithKey={...attempt,idempotency_key:'safe-key-123456'};
 const res=await submitSandboxFakePayment({attempt:attemptWithKey,env,fetchImpl:async(url,opts)=>{
  assert.equal(url,'https://connect.squareupsandbox.com/v2/payments');
  assert.equal(opts.method,'POST');assert.equal(opts.redirect,'manual');
  body=JSON.parse(opts.body);
  return new Response(JSON.stringify({payment}),{status:200});
 }});
 assert.equal(res.submitted,true);assert.equal(res.paymentId,paymentId);
 assert.deepEqual(body,{source_id:'cnon:card-nonce-ok',idempotency_key:'safe-key-123456',
  amount_money:{amount:1250,currency:'USD'},location_id:'LOC_1234',reference_id:saleId,autocomplete:true});
});
test('fake Sandbox submission is blocked without Sandbox mode',async()=>{
 let calls=0;
 const res=await submitSandboxFakePayment({attempt:{...attempt,idempotency_key:'safe-key-123456'},env:{...env,SQUARE_ENVIRONMENT:'production'},fetchImpl:async()=>{calls++}});
 assert.equal(calls,0);assert.equal(res.reason,'SANDBOX_NOT_CONFIGURED');
});
test('submission requires exact confirmation before touching D1',async()=>{
 let touched=false;
 const res=await handleSquareSandboxAttempt({path:'/api/pos/square/sandbox-submit',method:'POST',
  body:{attempt_id:saleId,confirm:'no'},tenant:'tenant-A',env,
  db:{prepare:()=>{touched=true;throw Error('should not run')}}});
 assert.equal(res.status,400);assert.equal(touched,false);
});
