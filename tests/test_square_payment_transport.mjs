import test from "node:test";
import assert from "node:assert/strict";
import {submitSquareSandboxPayment} from "../lib/nexus-square-payment-transport.js";
const env={SQUARE_ENVIRONMENT:"sandbox",SQUARE_SANDBOX_ACCESS_TOKEN:"fake-token",SQUARE_SANDBOX_LOCATION_ID:"sandbox-loc"};
const draft={source_id:"cnon:card-nonce-ok",idempotency_key:"checkout-0001",amount_cents:1250,currency:"USD"};
const args={env,draft,locationId:"sandbox-loc",referenceId:"receipt-1",merchantId:"merchant-1"};
const completed={payment:{id:"square-fake-1",status:"COMPLETED",amount_money:{amount:1250,currency:"USD"},location_id:"sandbox-loc",reference_id:"receipt-1",merchant_id:"merchant-1"}};
test("sandbox-only payment transport refuses production and mismatched locations without requests",async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;throw Error("unexpected request")};
 assert.equal((await submitSquareSandboxPayment({...args,env:{...env,SQUARE_ENVIRONMENT:"production"},fetchImpl})).submitted,false);
 assert.equal((await submitSquareSandboxPayment({...args,locationId:"other-loc",fetchImpl})).submitted,false);
 assert.equal((await submitSquareSandboxPayment({...args,merchantId:"",fetchImpl})).submitted,false);
 assert.equal(calls,0);
});
test("sandbox payment transport never marks a receipt paid",async()=>{
 let calls=0;
 const result=await submitSquareSandboxPayment({...args,fetchImpl:async(url,opts)=>{
  calls++;assert.equal(url,"https://connect.squareupsandbox.com/v2/payments");
  assert.equal(opts.method,"POST");assert.equal(opts.redirect,"error");
  assert.equal(opts.headers.Authorization,"Bearer fake-token");
  assert.equal(JSON.parse(opts.body).reference_id,"receipt-1");
  return {status:200,json:async()=>completed};
 }});
 assert.equal(calls,1);assert.equal(result.providerCompleted,true);
 assert.equal(result.reconciliationRequired,true);assert.equal(result.paid,undefined);
});
test("sandbox transport rejects merchant mismatch and preserves retry safety",async()=>{
 const bad=await submitSquareSandboxPayment({...args,fetchImpl:async()=>({status:200,json:async()=>({payment:{...completed.payment,merchant_id:"other"}})})});
 assert.equal(bad.providerCompleted,false);assert.equal(bad.reason,"MERCHANT_MISMATCH");
 const unknown=await submitSquareSandboxPayment({...args,fetchImpl:async()=>{throw Error("network lost")}});
 assert.equal(unknown.retryWithSameIdempotencyKey,true);
 assert.equal(unknown.submitted,false);
});
