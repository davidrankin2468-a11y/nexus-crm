import test from "node:test";
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import {SQUARE_SANDBOX_API_ORIGIN,squareSandboxConfigured,verifySquareSandboxSignature,validateSandboxPaymentDraft} from "../lib/nexus-square-sandbox.js";
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
