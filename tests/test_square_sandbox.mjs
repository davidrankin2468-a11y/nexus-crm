import test from "node:test";
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import {SQUARE_SANDBOX_API_ORIGIN,squareSandboxConfigured,verifySquareSandboxSignature,validateSandboxPaymentDraft,buildSquareSandboxPaymentPayload,inspectSquareSandboxPaymentResponse} from "../lib/nexus-square-sandbox.js";
import status from "../api/square/sandbox-status.js";
const url="https://nexus.example.invalid/api/square/webhooks";
const key="fictional-sandbox-signing-key";
const body=JSON.stringify({type:"payment.updated",event_id:"fake-event",environment:"sandbox"});
const signature=createHmac("sha256",key).update(url+body).digest("base64");
function res(){return {code:0,headers:{},setHeader(k,v){this.headers[k]=v;return this},status(n){this.code=n;return this},json(v){this.body=v;return this}}}
test("Square uses sandbox origin exclusively",()=>{assert.equal(SQUARE_SANDBOX_API_ORIGIN,"https://connect.squareupsandbox.com")});
test("valid Square signature requires exact URL and raw bytes",()=>{
 assert.equal(verifySquareSandboxSignature(body,signature,{key,notificationUrl:url}),true);
 assert.equal(verifySquareSandboxSignature(body+" ",signature,{key,notificationUrl:url}),false);
 assert.equal(verifySquareSandboxSignature(body,signature,{key,notificationUrl:url+"/wrong"}),false);
 assert.equal(verifySquareSandboxSignature(body,signature.slice(0,-1)+"A",{key,notificationUrl:url}),false);
});
test("empty, non-HTTPS and malformed payloads fail closed",()=>{
 assert.equal(verifySquareSandboxSignature("",signature,{key,notificationUrl:url}),false);
 assert.equal(verifySquareSandboxSignature(body,signature,{key,notificationUrl:"http://example.com"}),false);
 assert.equal(verifySquareSandboxSignature(body,"garbage",{key,notificationUrl:url}),false);
});
test("Square signature verification supports original Buffer and Uint8Array bytes",()=>{
 const bytes=Buffer.from(body,"utf8");
 assert.equal(verifySquareSandboxSignature(bytes,signature,{key,notificationUrl:url}),true);
 assert.equal(verifySquareSandboxSignature(new Uint8Array(bytes),signature,{key,notificationUrl:url}),true);
 assert.equal(verifySquareSandboxSignature(Buffer.concat([bytes,Buffer.from(" ")]),signature,{key,notificationUrl:url}),false);
 assert.equal(verifySquareSandboxSignature(bytes,signature.replace(/=$/,"!"),{key,notificationUrl:url}),false);
 assert.equal(verifySquareSandboxSignature({body},signature,{key,notificationUrl:url}),false);
});
test("payment preparation rejects raw card data and invalid amounts",()=>{
 const good={source_id:"fake_token_123456",idempotency_key:"sandbox-attempt-01",amount_cents:100,currency:"USD"};
 assert.equal(validateSandboxPaymentDraft(good),true);
 assert.equal(validateSandboxPaymentDraft({...good,amount_cents:-1}),false);
 assert.equal(validateSandboxPaymentDraft({...good,currency:"EUR"}),false);
 assert.equal(validateSandboxPaymentDraft({...good,card_number:"4111111111111111"}),false);
 assert.equal(validateSandboxPaymentDraft({...good,cvv:"123"}),false);
});
test("sandbox status never claims payment is enabled or leaks secrets",()=>{
 const old=process.env.SQUARE_ENVIRONMENT;
 process.env.SQUARE_ENVIRONMENT="production";
 try{
  assert.equal(squareSandboxConfigured(),false);
  const r=res();status({method:"GET"},r);
  assert.equal(r.code,200);assert.equal(r.body.configured,false);
  assert.equal(r.body.paymentProcessing,false);
  assert.equal(r.body.subscriptionBilling,false);
  assert.equal(JSON.stringify(r.body).includes(key),false);
  const bad=res();status({method:"POST"},bad);assert.equal(bad.code,405);
 }finally{if(old===undefined)delete process.env.SQUARE_ENVIRONMENT;else process.env.SQUARE_ENVIRONMENT=old}
});

test("Square idempotency keys follow the documented 45-character limit",()=>{
 const d={source_id:"cnon:card-nonce-ok",idempotency_key:"q".repeat(45),amount_cents:375,currency:"USD"};
 assert.equal(validateSandboxPaymentDraft(d),true);
 assert.equal(validateSandboxPaymentDraft({...d,idempotency_key:"q".repeat(46)}),false);
 assert.equal(validateSandboxPaymentDraft({...d,idempotency_key:"bad key spaces"}),false);
 assert.equal(validateSandboxPaymentDraft({...d,amount_cents:1.01}),false);
});

test("sandbox request body is cents-based and carries idempotency and location",()=>{
 const d={source_id:"cnon:card-nonce-ok",idempotency_key:"checkout-attempt-100",amount_cents:3199,currency:"USD"};
 const p=buildSquareSandboxPaymentPayload(d,{locationId:"FAKE_SANDBOX_LOC_01",referenceId:"fictional-receipt-001"});
 assert.deepEqual(p,{
  source_id:"cnon:card-nonce-ok",idempotency_key:"checkout-attempt-100",
  amount_money:{amount:3199,currency:"USD"},
  location_id:"FAKE_SANDBOX_LOC_01",reference_id:"fictional-receipt-001"
 });
 assert.equal(JSON.stringify(p).includes("card_number"),false);
 assert.throws(()=>buildSquareSandboxPaymentPayload(d,{locationId:"",referenceId:"fictional-receipt-001"}),TypeError);
 assert.throws(()=>buildSquareSandboxPaymentPayload({...d,cvv:"123"},{locationId:"FAKE_SANDBOX_LOC_01",referenceId:"x"}),TypeError);
 assert.throws(()=>buildSquareSandboxPaymentPayload(d,{locationId:"FAKE_SANDBOX_LOC_01",referenceId:"x".repeat(41)}),TypeError);
});

test("mocked success requires matching amount/location and reconciliation",()=>{
 const payload={payment:{id:"fake-square-payment-100",status:"COMPLETED",amount_money:{amount:3199,currency:"USD"},location_id:"FAKE_SANDBOX_LOC_01"}};
 const context={amountCents:3199,locationId:"FAKE_SANDBOX_LOC_01"};
 const result=inspectSquareSandboxPaymentResponse(200,payload,context);
 assert.deepEqual(result,{providerCompleted:true,reconciliationRequired:true,paymentId:"fake-square-payment-100"});
 assert.deepEqual(inspectSquareSandboxPaymentResponse(200,payload,{...context,amountCents:1234}),
  {providerCompleted:false,reconciliationRequired:false,reason:"AMOUNT_MISMATCH"});
 assert.deepEqual(inspectSquareSandboxPaymentResponse(200,payload,{...context,locationId:"OTHER_SANDBOX_LOC"}),
  {providerCompleted:false,reconciliationRequired:false,reason:"LOCATION_MISMATCH"});
});

test("mocked declines, failed payments, and pending status cannot mark a sale paid",()=>{
 const context={amountCents:3199,locationId:"FAKE_SANDBOX_LOC_01"};
 assert.equal(inspectSquareSandboxPaymentResponse(400,{errors:[{code:"CARD_DECLINED"}]},context).providerCompleted,false);
 assert.equal(inspectSquareSandboxPaymentResponse(200,{payment:{id:"fake",status:"PENDING",amount_money:{amount:3199,currency:"USD"},location_id:"FAKE_SANDBOX_LOC_01"}},context).providerCompleted,false);
 assert.equal(inspectSquareSandboxPaymentResponse(200,{},context).providerCompleted,false);
 assert.equal(inspectSquareSandboxPaymentResponse(200,{payment:{id:"fake",status:"COMPLETED",amount_money:{amount:3199,currency:"USD"},location_id:"FAKE_SANDBOX_LOC_01"}},context).reconciliationRequired,true);
});

test("mock retry has the same request key and response ID (provider dedup still untested)",()=>{
 const draft={source_id:"cnon:card-nonce-ok",idempotency_key:"stable-checkout-key-001",amount_cents:999,currency:"USD"};
 const opts={locationId:"FAKE_SANDBOX_LOC_01",referenceId:"fictional-sale-123"};
 const first=buildSquareSandboxPaymentPayload(draft,opts);
 const retry=buildSquareSandboxPaymentPayload(draft,opts);
 assert.deepEqual(retry,first);
 const providerResult={payment:{id:"fake-duplicate-return",status:"COMPLETED",amount_money:{amount:999,currency:"USD"},location_id:"FAKE_SANDBOX_LOC_01"}};
 assert.equal(inspectSquareSandboxPaymentResponse(200,providerResult,{amountCents:999,locationId:opts.locationId}).paymentId,"fake-duplicate-return");
 // The in-memory mock cannot prove real Square deduplication: test live in Sandbox after private configuration.
});
