import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/square/sandbox-reconcile.js";
const company="11111111-1111-4111-8111-111111111111";
const user="22222222-2222-4222-8222-222222222222";
const attemptId="33333333-3333-4333-8333-333333333333";
const saleId="44444444-4444-4444-8444-444444444444";
const paymentId="PAYMENT_TEST_1234";
const envKeys=["SUPABASE_URL","SUPABASE_PUBLISHABLE_KEY","SUPABASE_SERVICE_ROLE_KEY","SQUARE_ENVIRONMENT","SQUARE_SANDBOX_ACCESS_TOKEN","SQUARE_SANDBOX_LOCATION_ID","SQUARE_SANDBOX_MERCHANT_ID"];
const saved=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
Object.assign(process.env,{SUPABASE_URL:"https://fake.supabase.invalid",SUPABASE_PUBLISHABLE_KEY:"sb_publishable_test",SUPABASE_SERVICE_ROLE_KEY:"sb_secret_test",SQUARE_ENVIRONMENT:"sandbox",SQUARE_SANDBOX_ACCESS_TOKEN:"fake_token",SQUARE_SANDBOX_LOCATION_ID:"LOC_TEST_1234",SQUARE_SANDBOX_MERCHANT_ID:"MERCHANT_TEST"});
const originalFetch=globalThis.fetch;
let membership="owner",providerStatus="COMPLETED",dbCalls=[],providerCalls=0;
globalThis.fetch=async(url,options)=>{
 const u=new URL(url);const body=options.body?JSON.parse(options.body):null;
 dbCalls.push({path:u.pathname,query:u.searchParams,body});
 let value;
 if(u.pathname==="/auth/v1/user")value={id:user,is_anonymous:false};
 else if(u.pathname==="/rest/v1/nexus_company_members")value=membership?[{role:membership}]:[];
 else if(u.pathname==="/rest/v1/nexus_square_sandbox_payment_attempts"){
  assert.equal(u.searchParams.get("company_id"),"eq."+company);
  value=[{id:attemptId,company_id:company,sale_id:saleId,amount_cents:1499,currency:"USD",square_location_id:"LOC_TEST_1234",provider_payment_id:paymentId,status:"completed_unreconciled"}];
 }else if(u.pathname==="/v2/payments/"+paymentId){
  providerCalls++;
  value={payment:{id:paymentId,status:providerStatus,amount_money:{amount:1499,currency:"USD"},location_id:"LOC_TEST_1234",merchant_id:"MERCHANT_TEST",reference_id:saleId}};
 }else if(u.pathname==="/rest/v1/rpc/nexus_reconcile_square_sandbox_payment"){
  assert.deepEqual(body,{p_company_id:company,p_attempt_id:attemptId,p_payment_id:paymentId});
  value={reconciled:true,already_reconciled:false,sale_id:saleId};
 }else throw Error("Unexpected fetch "+u.pathname);
 return {ok:true,status:200,json:async()=>value};
};
const req=(method="POST",body={attempt_id:attemptId},companyId=company)=>({method,body,headers:{host:"example.test",origin:"https://example.test","content-type":"application/json",authorization:"Bearer test_access_token_12345678901234567890","x-nexus-company-id":companyId}});
function res(){return {statusCode:0,headers:{},setHeader(k,v){this.headers[k]=v;return this},status(n){this.statusCode=n;return this},json(v){this.body=v;return this}}}
test("method rejected",async()=>{const r=res();await handler(req("GET"),r);assert.equal(r.statusCode,405)});
test("no authentication rejected",async()=>{const x=req();delete x.headers.authorization;const r=res();await handler(x,r);assert.equal(r.statusCode,401)});
test("wrong company membership rejected before provider call",async()=>{membership=null;providerCalls=0;const r=res();await handler(req(),r);assert.equal(r.statusCode,403);assert.equal(providerCalls,0);membership="owner"});
test("cross-site POST rejected",async()=>{const x=req();x.headers.origin="https://attacker.invalid";const r=res();await handler(x,r);assert.equal(r.statusCode,403)});
test("non-JSON write rejected",async()=>{const x=req();x.headers["content-type"]="text/plain";const r=res();await handler(x,r);assert.equal(r.statusCode,415)});
test("disabled sandbox never calls Square",async()=>{const old=process.env.SQUARE_ENVIRONMENT;process.env.SQUARE_ENVIRONMENT="disabled";providerCalls=0;try{const r=res();await handler(req(),r);assert.equal(r.statusCode,503);assert.equal(providerCalls,0)}finally{process.env.SQUARE_ENVIRONMENT=old}});
test("invalid attempt rejected before provider call",async()=>{providerCalls=0;const r=res();await handler(req("POST",{attempt_id:"bad"}),r);assert.equal(r.statusCode,400);assert.equal(providerCalls,0)});
test("incomplete provider payment rejected without RPC",async()=>{dbCalls=[];providerStatus="PENDING";const r=res();await handler(req(),r);assert.equal(r.statusCode,409);assert.equal(dbCalls.some(x=>x.path.endsWith("/nexus_reconcile_square_sandbox_payment")),false);providerStatus="COMPLETED"});
test("verified sandbox payment reconciles only selected tenant sale",async()=>{dbCalls=[];const r=res();await handler(req(),r);assert.equal(r.statusCode,200);assert.equal(r.body.payment_verified,true);assert.equal(r.body.environment,"sandbox");assert.equal(dbCalls.filter(x=>x.path.endsWith("/nexus_reconcile_square_sandbox_payment")).length,1)});
test.after(()=>{globalThis.fetch=originalFetch;for(const k of envKeys){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k]}});
