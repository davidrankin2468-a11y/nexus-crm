import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
// The deployed Cloudflare POS adapter adds Square Sandbox handling to the base POS API.
// Never replace it with the base API alone or paid-sale state and Square safety guards disappear.
const shipped=readFileSync("cloudflare/nexus-pos-integrated-worker-module.js","utf8");
const base=readFileSync("cloud-app/functions/api/pos/[[path]].js","utf8");
test("integrated Cloudflare POS module preserves CRM session and Square reconciliation",()=>{
 assert.match(shipped,/import \{current as crmSession\} from "\.\/crm-api\.js"/);
 assert.match(shipped,/handleSquareSandboxAttempt/);
 for(const route of ["sandbox-prepare","sandbox-submit","sandbox-reconcile","sandbox-attempts"])
  assert.ok(shipped.includes(route),"Missing "+route);
 assert.ok(shipped.includes("BACKUP")===false,"POS module should not access backup encryption");
});
test("integrated and base POS endpoints always return actual status on idempotent retry",()=>{
 for(const code of [base,shipped]){
  assert.match(code,/SELECT id,total_cents,status FROM pos_sales WHERE tenant_id=\? AND idempotency_key=\?/);
  assert.match(code,/status:old\.status,payment_charged:false,recorded_only:true,duplicate:true/);
  assert.doesNotMatch(code,/status:"pending",payment_charged:false,recorded_only:true,duplicate:true/);
 }
});
