import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { handleSquareSandboxWebhook } from "../functions/api/square-sandbox-webhook.js";

const URL = "https://nexus-crm-pos-integrated-preview.davidrankin2468.workers.dev/api/pos/square/webhook";
const KEY = "test-only-signing-secret";
function setup() {
  const rows = new Map();
  const db = { prepare(sql) {
    assert.match(sql, /INSERT OR IGNORE INTO payment_webhook_events/);
    return { bind(provider,id,receivedAt) {
      assert.equal(provider,"square");
      assert.ok(Number.isInteger(receivedAt));
      return { async run() { if (!rows.has(id)) rows.set(id,{provider,id,receivedAt}); } };
    } };
  } };
  return { rows, env:{ DB:db, SQUARE_ENVIRONMENT:"sandbox", SQUARE_SANDBOX_WEBHOOK_SIGNATURE_KEY:KEY } };
}
function request(payload,{valid=true,url=URL}={}) {
  const body=typeof payload==="string"?payload:JSON.stringify(payload);
  const sig=createHmac("sha256",KEY).update(url+body).digest("base64");
  return new Request(url,{method:"POST",headers:{"x-square-hmacsha256-signature":valid?sig:"invalid"},body});
}
const event={event_id:"test_event_123",type:"payment.created",data:{object:{payment:{status:"APPROVED"}}}};
test("valid signed event is recorded as square, not treated as a payment",async()=>{
  const {rows,env}=setup();
  const response=await handleSquareSandboxWebhook(request(event),env);
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{received:true});
  assert.equal(rows.size,1);
  assert.equal(rows.get(event.event_id).provider,"square");
});
test("replayed webhook is idempotent",async()=>{
  const {rows,env}=setup();
  assert.equal((await handleSquareSandboxWebhook(request(event),env)).status,200);
  assert.equal((await handleSquareSandboxWebhook(request(event),env)).status,200);
  assert.equal(rows.size,1);
});
test("invalid signature is rejected before DB write",async()=>{
  const {rows,env}=setup();
  assert.equal((await handleSquareSandboxWebhook(request(event,{valid:false}),env)).status,401);
  assert.equal(rows.size,0);
});
test("missing signature is rejected",async()=>{
  const {rows,env}=setup();
  const response=await handleSquareSandboxWebhook(new Request(URL,{method:"POST",body:JSON.stringify(event)}),env);
  assert.equal(response.status,401);
  assert.equal(rows.size,0);
});
test("malformed signed JSON is rejected",async()=>{
  const {rows,env}=setup();
  assert.equal((await handleSquareSandboxWebhook(request("{bad-json"),env)).status,400);
  assert.equal(rows.size,0);
});
test("invalid event id is rejected",async()=>{
  const {rows,env}=setup();
  assert.equal((await handleSquareSandboxWebhook(request({...event,event_id:"../bad"}),env)).status,400);
  assert.equal(rows.size,0);
});
test("sandbox configuration required",async()=>{
  const {rows,env}=setup();
  delete env.SQUARE_SANDBOX_WEBHOOK_SIGNATURE_KEY;
  assert.equal((await handleSquareSandboxWebhook(request(event),env)).status,503);
  assert.equal(rows.size,0);
});
