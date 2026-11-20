import test from "node:test";
import assert from "node:assert/strict";

// Read-only live launch-gate checks, plus unauthorized POSTs that MUST fail.
// Never supply credentials, invoices, cards, emails, secrets, or live test records.
const base="https://nexus-crm-pos-integrated-preview.davidrankin2468.workers.dev";
const request=async (path,init={})=>{
 const res=await fetch(base+path,{redirect:"error",signal:AbortSignal.timeout(15000),...init});
 const body=await res.text();
 return {res,body,json:()=>JSON.parse(body)};
};
test("preview explicitly disables production charges and paid licensing",async()=>{
 const {res,json}=await request("/preview-info");
 assert.equal(res.status,200);
 const info=json();
 assert.equal(info.mode,"development");
 assert.equal(info.companyData,"staging");
 assert.equal(info.integrated,true);
 assert.equal(info.paymentProcessing,false);
 assert.equal(info.licenseBilling,false);
 assert.equal(info.topLevelTabs,5);
 const sandbox=await request("/api/square/sandbox-readiness");
 assert.equal(sandbox.res.status,200);
 const state=sandbox.json();
 assert.equal(state.paymentProcessing,false);
 assert.equal(state.liveChargesEnabled,false);
 assert.equal(state.providerVerified,false);
 assert.equal(state.environment,"development");
 assert.ok(!JSON.stringify(state).match(/access.token|password|api.key|secret.key|merchant.id/i),"Readiness must not return provider secrets or IDs");
});
test("private company, account, POS, billing and security endpoints reject anonymous users",async()=>{
 const routes=[
 "/api/me","/api/customers","/api/jobs","/api/backups",
 "/api/platform/companies","/api/pos/products","/api/pos/sales",
 "/api/pos/licensing","/api/pos/export","/api/pos/square/sandbox-attempts"
 ];
 for(const route of routes){
  const {res}=await request(route);
  assert.equal(res.status,401,route+" must reject anonymous reads");
  assert.equal(res.headers.get("cache-control"),"no-store",route+" must not be cacheable");
  assert.equal(res.headers.get("x-content-type-options"),"nosniff",route+" must block MIME sniffing");
  assert.equal(res.headers.get("access-control-allow-origin"),null,route+" must not allow anonymous cross-origin reads");
 }
});
test("anonymous writes cannot insert POS sales, prepare a charge, or alter customers",async()=>{
 const attempts=[
  ["/api/pos/sales",{idempotency_key:"release-smoke-no-write",items:[],tax_cents:0}],
  ["/api/pos/square/sandbox-prepare",{sale_id:"00000000-0000-4000-8000-000000000000"}],
  ["/api/pos/square/sandbox-submit",{attempt_id:"00000000-0000-4000-8000-000000000000"}],
  ["/api/customers",{name:"must-not-write"}]
 ];
 for(const [path,body] of attempts){
  const r=await request(path,{method:"POST",headers:{"Content-Type":"application/json","Origin":base},body:JSON.stringify(body)});
  assert.equal(r.res.status,401,path+" must fail without a session and never write data");
 }
});
test("small read-only availability burst returns consistent healthy responses",async()=>{
 // This is a bounded smoke test, not a production load or capacity benchmark.
 const requests=Array.from({length:8},(_,i)=>request(i%2?"/api/health":"/preview-info"));
 const results=await Promise.all(requests);
 for(let i=0;i<results.length;i++){
  assert.equal(results[i].res.status,200,"Read-only health response "+i+" must succeed");
  const data=results[i].json();
  assert.equal(i%2?data.ok:data.paymentProcessing,i%2?true:false);
 }
});
test("staging HTML uses strict CSP, HSTS, no caching, and blocks framing",async()=>{
 const {res,body}=await request("/");
 assert.equal(res.status,200);
 assert.match(body,/Nexus CRM/i);
 assert.equal(res.headers.get("cache-control"),"no-store");
 assert.equal(res.headers.get("x-content-type-options"),"nosniff");
 assert.equal(res.headers.get("x-frame-options"),"DENY");
 assert.match(res.headers.get("strict-transport-security")||"",/max-age=\d+/);
 const csp=res.headers.get("content-security-policy")||"";
 for(const policy of ["default-src 'self'","script-src 'self'","object-src 'none'","frame-ancestors 'none'"])assert.ok(csp.includes(policy),"Missing CSP "+policy);
 const nonGet=await request("/",{method:"PUT"});
 assert.equal(nonGet.res.status,405,"Public static route must reject unsupported write methods");
});
