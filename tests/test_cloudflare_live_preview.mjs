import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";

// Live read-only smoke checks of development preview. No credentials or test writes.
const base="https://nexus-crm-pos-integrated-preview.davidrankin2468.workers.dev";
async function get(path,init={}){
 const response=await fetch(base+path,{redirect:"error",signal:AbortSignal.timeout(15000),...init});
 const text=await response.text();
 return {response,text,json:()=>JSON.parse(text)};
}
test("Cloudflare integrated CRM preview is reachable and not payment-enabled",async()=>{
 const {response,json}=await get("/preview-info");
 assert.equal(response.status,200);
 const info=json();
 assert.equal(info.integrated,true);
 assert.equal(info.topLevelTabs,5);
 assert.equal(info.paymentProcessing,false);
 assert.equal(info.licenseBilling,false);
 assert.equal(info.mode,"development");
 assert.equal(info.companyData,"staging");
 const blobs={
  crm:execFileSync("git",["hash-object","cloud-app/functions/api/[[path]].js"],{encoding:"utf8"}).trim(),
  pos:execFileSync("git",["hash-object","cloud-app/functions/api/pos/[[path]].js"],{encoding:"utf8"}).trim(),
  app:execFileSync("git",["hash-object","cloud-app/public/assets/app.js"],{encoding:"utf8"}).trim(),
 };
 assert.deepEqual(info.blobs,blobs,"Cloudflare preview must match the current CRM and POS source code");
 const integratedHash=execFileSync("git",["hash-object","cloudflare/nexus-pos-integrated-worker-module.js"],{encoding:"utf8"}).trim();
 assert.equal(info.integratedPosHash,integratedHash,"Cloudflare must publish the hash of its Square-aware integrated POS module");

 // Independently check the bytes the Worker actually serves, not just its reported manifest.
 const servedApp=await get("/assets/app.js");
 assert.equal(servedApp.response.status,200);
 const actual=Buffer.from(servedApp.text);
 const servedHash=createHash("sha1").update(`blob ${actual.length}\0`).update(actual).digest("hex");
 assert.equal(servedHash,blobs.app,"Live frontend bytes must match tested GitHub source");

});
test("CRM D1 health is healthy on actual deployed preview",async()=>{
 const {response,json}=await get("/api/health");
 assert.equal(response.status,200);
 const health=json();
 assert.equal(health.ok,true);
 assert.equal(health.authenticatorAvailable,true,"MFA master key must remain configured on the deployed preview");
});
test("anonymous requests cannot read CRM or POS companies or licensing",async()=>{
 for(const path of ["/api/me","/api/pos/products","/api/pos/sales","/api/pos/licensing","/api/pos/export"]){
  const {response}=await get(path);
  assert.equal(response.status,401,"Expected private "+path+" to reject anonymous requests");
 }
});
test("anonymous users cannot send company invitations or bypass private onboarding",async()=>{
 const {response}=await get("/api/platform/invitations",{
  method:"POST",headers:{"Content-Type":"application/json","Origin":base},
  body:JSON.stringify({companyName:"Never created",email:"not-a-user@example.invalid",deliveryMode:"email"})
 });
 assert.equal(response.status,401,"Invitations must be platform-operator-only");
 const {response:unknown}=await get("/api/public/signup",{
  method:"POST",headers:{"Content-Type":"application/json","Origin":base},
  body:JSON.stringify({email:"not-a-user@example.invalid"})
 });
 assert.equal(unknown.status,401,"Public signup must not register unauthenticated visitors");
});
test("business email lab is inaccessible to anonymous users and has no public send surface",async()=>{
 const {response}=await get("/api/platform/email-lab");
 assert.equal(response.status,401);
 const app=await get("/assets/app.js");
 assert.equal(app.response.status,200);
 assert.match(app.text,/companyEmailLabContent/);
 assert.match(app.text,/Business email lab/);
});
test("private Gmail-alias invitation test cannot be sent anonymously",async()=>{
 const {response}=await get("/api/platform/email-invite-pilot",{
  method:"POST",headers:{"Content-Type":"application/json","Origin":base},
  body:JSON.stringify({email:"outsider@example.invalid",password:"invalid"})
 });
 assert.equal(response.status,401);
 const app=await get("/assets/app.js");
 assert.equal(app.response.status,200);
 assert.match(app.text,/data-form="email-invite-pilot"/);
 assert.match(app.text,/pilotInviteAvailable/);
});
test("private fictional staff pilot cannot send an email anonymously",async()=>{
 const {response}=await get("/api/staff/email-invite-pilot",{
  method:"POST",headers:{"Content-Type":"application/json","Origin":base},
  body:JSON.stringify({role:"employee",email:"outsider@example.invalid",password:"invalid"})
 });
 assert.equal(response.status,401);
 const app=await get("/assets/app.js");
 assert.equal(app.response.status,200);
 assert.match(app.text,/data-form="staff-email-pilot"/);
 assert.match(app.text,/staffPilotAvailable/);
});
test("anonymous POST to POS cannot write a sale or run a payment",async()=>{
 const {response}=await get("/api/pos/sales",{
  method:"POST",headers:{"Content-Type":"application/json","Origin":base},
  body:JSON.stringify({idempotency_key:"never-charge-live-smoke",tax_cents:0,items:[]})
 });
 assert.equal(response.status,401);
});
test("customer launch remains a private pilot, not public enrollment",async()=>{
 const page=await get("/");
 assert.equal(page.response.status,200);
 assert.match(page.text,/Pilot system — use test records until launch review/);
 const status=await get("/api/status");
 assert.equal(status.response.status,200);
 assert.equal(typeof status.json().configured,"boolean");
});
test("static frontend is the original five-tab CRM with POS inside Finance",async()=>{
 const index=await get("/");
 assert.equal(index.response.status,200);
 assert.match(index.text,/Nexus CRM/);
 const js=await get("/assets/app.js");
 assert.equal(js.response.status,200);
 assert.match(js.text,/const tabs=\["Dashboard","Customers","Operations","Finance","Management"\]/);
 assert.match(js.text,/const financeViews=\["Estimates","Invoices","Payments","Reports","POS"\]/);
 assert.match(js.text,/data-action="open-integrated-pos"/);
 assert.match(js.text,/licenseManagementContent/);
 assert.match(js.text,/data-pos-void/);
 assert.match(js.text,/data-pos-customer/);
 assert.match(js.text,/data-form="pos-download"/);
 assert.match(js.text,/nexus-pos-company-export-v1/);
});
