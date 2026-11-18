import test from "node:test";
import assert from "node:assert/strict";
import {squareSandboxReadOnlyConfigured,checkSquareSandboxLocation} from "../lib/nexus-square-connectivity.js";
import route from "../api/square/sandbox-connectivity.js";

const env={SQUARE_ENVIRONMENT:"sandbox",SQUARE_SANDBOX_ACCESS_TOKEN:"fake_sandbox_token_only_for_tests",
 SQUARE_SANDBOX_LOCATION_ID:"FAKE_SANDBOX_LOCATION_01"};
const location=env.SQUARE_SANDBOX_LOCATION_ID;
const exampleResponse=(status,body)=>({ok:status>=200&&status<300,status,json:async()=>body});

test("Sandbox configuration requires token, location, and sandbox mode",()=>{
 assert.equal(squareSandboxReadOnlyConfigured(env),true);
 assert.equal(squareSandboxReadOnlyConfigured({...env,SQUARE_ENVIRONMENT:"production"}),false);
 assert.equal(squareSandboxReadOnlyConfigured({...env,SQUARE_SANDBOX_LOCATION_ID:""}),false);
 assert.equal(squareSandboxReadOnlyConfigured({...env,SQUARE_SANDBOX_ACCESS_TOKEN:""}),false);
});
test("Read-only request is fixed to Square Sandbox Locations and does not return secrets",async()=>{
 let calls=0;
 const result=await checkSquareSandboxLocation({env,fetchImpl:async (url,options)=>{
  calls++;
  assert.equal(url,"https://connect.squareupsandbox.com/v2/locations");
  assert.equal(options.method,"GET");
  assert.equal(options.redirect,"error");
  assert.equal(options.headers.Authorization,"Bearer "+env.SQUARE_SANDBOX_ACCESS_TOKEN);
  assert.equal(options.headers["Square-Version"],"2026-09-16");
  assert.equal(options.body,undefined);
  return exampleResponse(200,{locations:[{id:location,status:"ACTIVE"}]});
 }});
 assert.deepEqual(result,{connected:true,reason:"SANDBOX_LOCATION_VERIFIED"});
 assert.equal(calls,1);
 assert.equal(JSON.stringify(result).includes(env.SQUARE_SANDBOX_ACCESS_TOKEN),false);
 assert.equal(JSON.stringify(result).includes(location),false);
});
test("Wrong or disabled location cannot pass",async()=>{
 for(const locations of [[{id:"A_DIFFERENT_LOCATION",status:"ACTIVE"}],[{id:location,status:"INACTIVE"}],[{id:location,status:"UNKNOWN"}],[{id:location}]]){
  const result=await checkSquareSandboxLocation({env,fetchImpl:async()=>exampleResponse(200,{locations})});
  assert.deepEqual(result,{connected:false,reason:"SQUARE_LOCATION_NOT_FOUND"});
 }
});
test("Provider 401/500, bad JSON and timeout are sanitized",async()=>{
 const denied=await checkSquareSandboxLocation({env,fetchImpl:async()=>exampleResponse(401,{errors:[{detail:"do not expose secret"}]})});
 assert.deepEqual(denied,{connected:false,reason:"SQUARE_AUTH_DENIED"});
 const bad=await checkSquareSandboxLocation({env,fetchImpl:async()=>exampleResponse(500,{error:"unsafe provider message"})});
 assert.deepEqual(bad,{connected:false,reason:"SQUARE_UNAVAILABLE"});
 const malformed=await checkSquareSandboxLocation({env,fetchImpl:async()=>exampleResponse(200,{locations:"bad"})});
 assert.deepEqual(malformed,{connected:false,reason:"BAD_SQUARE_RESPONSE"});
 const thrown=await checkSquareSandboxLocation({env,fetchImpl:async()=>{throw Error("unsafe provider message")}});
 assert.deepEqual(thrown,{connected:false,reason:"SQUARE_UNAVAILABLE"});
});
test("Production mode never performs a Square request",async()=>{
 let calls=0;
 const result=await checkSquareSandboxLocation({env:{...env,SQUARE_ENVIRONMENT:"production"},fetchImpl:async()=>{
  calls++;throw Error("must not call provider");
 }});
 assert.deepEqual(result,{connected:false,reason:"CONFIGURATION_REQUIRED"});
 assert.equal(calls,0);
});

const originalFetch=globalThis.fetch;
const existing={};
for(const k of ["SUPABASE_URL","SUPABASE_PUBLISHABLE_KEY","SUPABASE_SERVICE_ROLE_KEY",
  "SQUARE_ENVIRONMENT","SQUARE_SANDBOX_ACCESS_TOKEN","SQUARE_SANDBOX_LOCATION_ID"]){
 existing[k]=process.env[k];
}
process.env.SUPABASE_URL="https://fake-supa-for-tests.invalid";
process.env.SUPABASE_PUBLISHABLE_KEY="sb_publishable_fake_only_for_tests";
process.env.SUPABASE_SERVICE_ROLE_KEY="sb_secret_fake_only_for_tests";
Object.assign(process.env,env);
const accountId="33333333-3333-4333-8333-333333333333";
const companyId="11111111-1111-4111-8111-111111111111";
const token="fake_supabase_user_token_abcdefghijklmnopqrstuvwxyz01234567890";
const request=(method="GET",isAuthorized=true)=>({method,headers:{
 "host":"nexus-preview.example.invalid",
 "x-nexus-company-id":companyId,
 ...(isAuthorized?{authorization:"Bearer "+token}:{})
}});
const response=()=>({code:0,headers:{},setHeader(k,v){this.headers[k]=v;return this},
 status(code){this.code=code;return this},json(body){this.body=body;return this}});
let membershipRole="owner";
let squareCalls=0;
globalThis.fetch=async (url,options={})=>{
 const u=new URL(url);
 if(u.hostname==="fake-supa-for-tests.invalid"){
  if(u.pathname==="/auth/v1/user")return exampleResponse(200,{id:accountId,is_anonymous:false});
  if(u.pathname==="/rest/v1/nexus_company_members"){
   return exampleResponse(200,membershipRole?[{role:membershipRole}]:[]);
  }
  throw Error("Unexpected Supabase request");
 }
 if(u.hostname==="connect.squareupsandbox.com"){
  squareCalls++;
  assert.equal(options.method,"GET");
  return exampleResponse(200,{locations:[{id:location,status:"ACTIVE"}]});
 }
 throw Error("No unexpected origin permitted");
};

test("Connectivity API denies unauthenticated calls before contacting Square",async()=>{
 squareCalls=0;
 const res=response();
 await route(request("GET",false),res);
 assert.equal(res.code,401);
 assert.equal(squareCalls,0);
});
test("Connectivity API denies employee access before contacting Square",async()=>{
 squareCalls=0;membershipRole="employee";
 try{
  const res=response();
  await route(request(),res);
  assert.equal(res.code,403);
  assert.equal(squareCalls,0);
 }finally{membershipRole="owner"}
});
test("Connectivity API denies users without membership in selected company",async()=>{
 squareCalls=0;membershipRole=null;
 try{
  const res=response();
  await route(request(),res);
  assert.equal(res.code,403);
  assert.equal(squareCalls,0);
 }finally{membershipRole="owner"}
});
test("Connectivity API denies POST before contacting Square",async()=>{
 squareCalls=0;
 const res=response();
 await route(request("POST"),res);
 assert.equal(res.code,405);
 assert.equal(squareCalls,0);
});
test("Authorized owner receives only a safe connection status, never provider data",async()=>{
 squareCalls=0;
 const res=response();
 await route(request(),res);
 assert.equal(res.code,200);
 assert.deepEqual(res.body,{
  environment:"sandbox",connected:true,reason:"SANDBOX_LOCATION_VERIFIED",
  paymentProcessing:false,refundProcessing:false,subscriptionBilling:false
 });
 assert.equal(squareCalls,1);
 assert.equal(JSON.stringify(res.body).includes(env.SQUARE_SANDBOX_ACCESS_TOKEN),false);
 assert.equal(JSON.stringify(res.body).includes(location),false);
});
test.after(()=>{
 globalThis.fetch=originalFetch;
 for(const [key,value] of Object.entries(existing)){
  if(value===undefined)delete process.env[key];else process.env[key]=value;
 }
});
