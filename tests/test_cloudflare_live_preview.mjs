import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";

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

});
test("CRM D1 health is healthy on actual deployed preview",async()=>{
 const {response,json}=await get("/api/health");
 assert.equal(response.status,200);
 assert.equal(json().ok,true);
});
test("anonymous requests cannot read CRM or POS companies or licensing",async()=>{
 for(const path of ["/api/me","/api/pos/products","/api/pos/sales","/api/pos/licensing","/api/pos/export"]){
  const {response}=await get(path);
  assert.equal(response.status,401,"Expected private "+path+" to reject anonymous requests");
 }
});
test("anonymous POST to POS cannot write a sale or run a payment",async()=>{
 const {response}=await get("/api/pos/sales",{
  method:"POST",headers:{"Content-Type":"application/json","Origin":base},
  body:JSON.stringify({idempotency_key:"never-charge-live-smoke",tax_cents:0,items:[]})
 });
 assert.equal(response.status,401);
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
