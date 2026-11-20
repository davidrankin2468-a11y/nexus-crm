import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes, createHmac } from "node:crypto";
import { onRequest } from "../functions/api/[[path]].js";

// ALL data lives in an in-memory database. No live Cloudflare D1 rows,
// production sessions, third-party APIs or secrets are used by this suite.
const base = "https://qa.nexus.invalid";
const TEST_MFA_MASTER_KEY="01".repeat(32); // Isolated in-memory test only; never use in Cloudflare.
const sha256 = x => createHash("sha256").update(x).digest("hex");
const random = () => randomBytes(32).toString("hex");
const dir = new URL("../", import.meta.url);
const sqlRoot = readFileSync(new URL("../schema.sql",import.meta.url),"utf8");
const migrations = [
 "002_employees_appointments.sql","003_finance.sql","004_recovery_audit.sql",
 "005_platform_operator.sql","006_company_invitations.sql","007_staff_invitations.sql",
 "008_account_recovery_codes.sql","009_staff_deactivation.sql","010_totp_mfa.sql",
 "015_invitation_delivery_provenance.sql","016_email_self_test_limits.sql"
];
function memoryDB(){
 const raw = new DatabaseSync(":memory:");
 raw.exec(sqlRoot);
 function stmt(sql,binds=[]){
  return {
   sql,binds,
   bind(...values){ return stmt(sql,values); },
   async first(){ return raw.prepare(sql).get(...binds)??null; },
   async all(){ return {results:raw.prepare(sql).all(...binds)}; },
   async run(){
    const result=raw.prepare(sql).run(...binds);
    return {success:true,meta:{changes:Number(result.changes)}};
   }
  };
 }
 return {
  raw,
  prepare(sql){return stmt(sql);},
  async batch(items){
   raw.exec("BEGIN IMMEDIATE");
   try{
    const results=[];
    for(const item of items){
     const q=raw.prepare(item.sql);
     if(q.columns().length){
      results.push({results:q.all(...item.binds),meta:{changes:0}});
     }else{
      const r=q.run(...item.binds);
      results.push({results:[],meta:{changes:Number(r.changes)}});
     }
    }
    raw.exec("COMMIT");
    return results;
   }catch(e){raw.exec("ROLLBACK");throw e;}
  }
 };
}
function client(){
 return {cookie:"",csrf:""};
}
async function call(db,session,method,path,data,options={}){
 const h = new Headers({"Accept":"application/json"});
 if(method!=="GET"&&!options.noOrigin)h.set("Origin",base);
 if(data!==undefined)h.set("Content-Type","application/json");
 if(session?.cookie&&!options.noCookie)h.set("Cookie",session.cookie);
 if(session?.csrf&&!options.noCsrf)h.set("X-Nexus-CSRF",session.csrf);
 const req=new Request(base+path,{method,headers:h,body:data===undefined?undefined:JSON.stringify(data)});
 const res=await onRequest({request:req,env:{DB:db,MFA_MASTER_KEY:TEST_MFA_MASTER_KEY,...(options.env||{})}});
 let json;
 try{json=await res.json()}catch{json={error:"Non-JSON API response"}}
 const cookie=res.headers.get("set-cookie");
 if(cookie&&session){
  if(/Max-Age=0/.test(cookie))session.cookie="";
  else session.cookie=cookie.split(";")[0];
 }
 if(json?.csrf&&session)session.csrf=json.csrf;
 return {status:res.status,json};
}
async function expectStatus(db,session,method,path,data,status,options={}){
 const r=await call(db,session,method,path,data,options);
 assert.equal(r.status,status,method+" "+path+": "+JSON.stringify(r.json));
 return r.json;
}
function totp(encoded,step){
 const abc="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
 let bits=0,value=0,arr=[];
 for(const char of encoded){
  value=(value<<5)|abc.indexOf(char);bits+=5;
  if(bits>=8){bits-=8;arr.push((value>>>bits)&255);}
 }
 const msg=Buffer.alloc(8);msg.writeBigUInt64BE(BigInt(step));
 const digest=createHmac("sha1",Buffer.from(arr)).update(msg).digest();
 const offset=digest[19]&15;
 const n=(digest.readUInt32BE(offset)&0x7fffffff)%1000000;
 return String(n).padStart(6,"0");
}
const passwordA="QA-Owner-Password-Alpha-2468";
const passwordB="QA-Owner-Password-Beta-2468";
const passwordAdmin="QA-Admin-Password-2468";
const passwordEmployee="QA-Employee-Password-2468";
const emailA="nexus-owner-a@example.invalid";
const emailB="nexus-owner-b@example.invalid";
const emailAdmin="nexus-admin-b@example.invalid";
const emailEmployee="nexus-employee-b@example.invalid";

test("Nexus CRM isolated end-to-end regression: 5 workspaces, tenants, roles, recovery and backups",async t=>{
 const db=memoryDB();
 // Apply additive schema migrations before first login; seed operator only after bootstrap.
 for(const file of migrations)db.raw.exec(readFileSync(new URL("../migrations/"+file,import.meta.url),"utf8"));
 const a=client(),b=client(),admin=client(),employee=client();
 const setupCode=random();
 await db.prepare("INSERT INTO bootstrap_tokens(token_hash,created_at,expires_at) VALUES(?,?,?)")
  .bind(sha256(setupCode),Math.floor(Date.now()/1000),Math.floor(Date.now()/1000)+300).run();

 await t.test("unauthenticated routes, HTTP methods, setup and login",async()=>{
  await expectStatus(db,null,"GET","/api/health",undefined,200);
  await expectStatus(db,null,"GET","/api/me",undefined,401);
  await expectStatus(db,null,"GET","/api/customers",undefined,401);
  await expectStatus(db,null,"DELETE","/api/customers",undefined,405);
  await expectStatus(db,null,"POST","/api/login",{email:emailA,password:"wrong"},401);
  await expectStatus(db,a,"POST","/api/setup",{
   setupCode,companyName:"QA Company A",email:emailA,password:passwordA
  },201);
  const me=await expectStatus(db,a,"GET","/api/me",undefined,200);
  assert.equal(me.user.company,"QA Company A");
  assert.equal(me.user.role,"owner");
  await expectStatus(db,null,"POST","/api/setup",{
   setupCode,companyName:"DUPLICATE",email:"duplicate@example.invalid",password:passwordA
  },409);
 });
 // Apply the same idempotent migration again after the first setup.
 db.raw.exec(readFileSync(new URL("../migrations/005_platform_operator.sql",import.meta.url),"utf8"));

 await t.test("CSRF and same-origin protections",async()=>{
  await expectStatus(db,a,"POST","/api/customers",{name:"No CSRF"},403,{noCsrf:true});
  await expectStatus(db,a,"POST","/api/customers",{name:"No origin"},403,{noOrigin:true});
  const items=await expectStatus(db,a,"GET","/api/customers",undefined,200);
  assert.equal(items.items.length,0);
 });
 let aCustomer,bCustomer,bJob,bEstimate,bInvoice,bEmployee,bAppointment;

 await t.test("tenant A initial CRUD",async()=>{
  const customer=await expectStatus(db,a,"POST","/api/customers",{name:"Alpha QA Customer",email:"alpha@example.invalid",phone:"",notes:""},201);
  aCustomer=customer.id;
  await expectStatus(db,a,"POST","/api/jobs",{
   customerId:aCustomer,title:"Alpha QA Job",status:"Planned",amount:500,scheduledDate:"2026-12-01"
  },201);
  assert.equal((await expectStatus(db,a,"GET","/api/jobs",undefined,200)).items.length,1);
 });
 await t.test("platform-only owner invitations and single-use tenant activation",async()=>{
  assert.equal((await expectStatus(db,a,"GET","/api/me",undefined,200)).user.isPlatformOperator,true);
  const inv=await expectStatus(db,a,"POST","/api/platform/invitations",{
   companyName:"QA Company B",email:emailB,password:passwordA
  },201);
  assert.match(inv.token,/^[a-f0-9]{64}$/);
  const preview=await expectStatus(db,null,"POST","/api/invitations/preview",{token:inv.token},200);
  assert.equal(preview.companyName,"QA Company B");
  await expectStatus(db,b,"POST","/api/invitations/accept",{token:inv.token,password:passwordB},201);
  await expectStatus(db,null,"POST","/api/invitations/accept",{token:inv.token,password:passwordB},403);
  assert.equal((await expectStatus(db,b,"GET","/api/me",undefined,200)).user.company,"QA Company B");
  assert.equal((await expectStatus(db,b,"GET","/api/me",undefined,200)).user.isPlatformOperator,false);
  await expectStatus(db,b,"GET","/api/platform/companies",undefined,403);
  const listing=await expectStatus(db,a,"GET","/api/platform/companies",undefined,200);
  assert.equal(listing.items.length,2);
 });
 await t.test("free email lab is platform-only, read-only and non-sending",async()=>{
  await expectStatus(db,null,"GET","/api/platform/email-lab",undefined,401);
  await expectStatus(db,b,"GET","/api/platform/email-lab",undefined,403);
  const before=db.raw.prepare("SELECT COUNT(*) AS n FROM company_invitations").get().n;
  const lab=await expectStatus(db,a,"GET","/api/platform/email-lab",undefined,200);
  assert.equal(lab.mode,"cloudflare_free_preview");
  assert.equal(lab.sendAvailable,false);
  assert.equal(lab.emailSent,false);
  assert.equal(lab.productionEmailReady,false);
  assert.equal(lab.sample.to,"example-recipient@example.invalid");
  assert.ok(lab.sample.body.includes("This is a preview"));
  assert.ok(!JSON.stringify(lab).includes("secret"));
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM company_invitations").get().n,before);
 });
 await t.test("owner-only self email test cannot be used for customer invitations",async()=>{
  const secret="local-fake-resend-credential-not-production";
  const env={EMAIL_SELF_TEST_ENABLED:"true",EMAIL_DELIVERY_MODE:"disabled",
   RESEND_API_KEY:secret,RESEND_FROM:"notifications@nexussoftwareusa.com",
   RESEND_SENDER_DOMAIN_VERIFIED:"true",PUBLIC_APP_ORIGIN:"https://qa.nexus.example.org"};
  const countBefore=db.raw.prepare("SELECT COUNT(*) AS n FROM company_invitations").get().n;
  await expectStatus(db,null,"POST","/api/platform/email-self-test",{password:passwordA},401,{env});
  await expectStatus(db,b,"POST","/api/platform/email-self-test",{password:passwordB},403,{env});
  await expectStatus(db,a,"POST","/api/platform/email-self-test",{password:passwordA},403,{env,noCsrf:true});
  await expectStatus(db,a,"POST","/api/platform/email-self-test",{password:passwordA},503,{env:{...env,EMAIL_SELF_TEST_ENABLED:"false"}});
  await expectStatus(db,a,"POST","/api/platform/email-self-test",{password:"wrong"},403,{env});
  let externalCalls=0;
  const saved=globalThis.fetch;
  try{
   globalThis.fetch=async (url,opts)=>{
    externalCalls++;
    assert.equal(url,"https://api.resend.com/emails");
    assert.equal(opts.headers.Authorization,"Bearer "+secret);
    const msg=JSON.parse(opts.body);
    assert.deepEqual(msg.to,[emailA],"Self-test must be restricted to authenticated operator email");
    assert.ok(!JSON.stringify(msg).includes("/#invite="));
    return {ok:true,json:async()=>({id:"accepted-self-test-in-ci"})};
   };
   const accepted=await expectStatus(db,a,"POST","/api/platform/email-self-test",{password:passwordA},200,{env});
   assert.equal(accepted.providerAccepted,true);
   assert.equal(accepted.delivered,false);
   assert.equal(accepted.recipient,emailA);
   await expectStatus(db,a,"POST","/api/platform/email-self-test",{password:passwordA},429,{env});
   assert.equal(externalCalls,1);
   assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM company_invitations").get().n,countBefore);
   assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM email_self_test_limits").get().n,1);
  }finally{globalThis.fetch=saved;}
 });
 await t.test("provider rejection is categorized safely and shortens retry cooldown",async()=>{
  const secret="local-fake-resend-credential-not-production";
  const env={EMAIL_SELF_TEST_ENABLED:"true",EMAIL_DELIVERY_MODE:"disabled",
   RESEND_API_KEY:secret,RESEND_FROM:"notifications@nexussoftwareusa.com",
   RESEND_SENDER_DOMAIN_VERIFIED:"true",PUBLIC_APP_ORIGIN:"https://qa.nexus.example.org"};
  db.raw.prepare("DELETE FROM email_self_test_limits").run();
  const saved=globalThis.fetch;
  let calls=0;
  try{
   globalThis.fetch=async()=>{
    calls++;
    return {ok:false,status:401,json:async()=>({message:"possibly-sensitive-provider-error",name:"invalid_api_key"})};
   };
   const r=await call(db,a,"POST","/api/platform/email-self-test",{password:passwordA},{env});
   assert.equal(r.status,502);
   assert.match(r.json.error,/API key \(401\)/);
   assert.ok(!JSON.stringify(r.json).includes("possibly-sensitive-provider-error"));
   assert.ok(!JSON.stringify(r.json).includes(secret));
   assert.equal(calls,1);
   const wait=db.raw.prepare("SELECT next_allowed_at FROM email_self_test_limits").get();
   assert.ok(wait.next_allowed_at<=Math.floor(Date.now()/1000)+123);
   assert.ok(wait.next_allowed_at>=Math.floor(Date.now()/1000)+115);
   await expectStatus(db,a,"POST","/api/platform/email-self-test",{password:passwordA},429,{env});
   assert.equal(calls,1);
  }finally{
   globalThis.fetch=saved;
   db.raw.prepare("DELETE FROM email_self_test_limits").run();
  }
 });
 await t.test("email invitation delivery fails closed when verified sender is unavailable",async()=>{
  const before=db.raw.prepare("SELECT count(*) AS n FROM company_invitations").get().n;
  await expectStatus(db,a,"POST","/api/platform/invitations",{
   companyName:"Email Not Configured",email:"mail-no-send@example.invalid",password:passwordA,deliveryMode:"email"
  },503);
  await expectStatus(db,a,"POST","/api/platform/invitations",{
   companyName:"Bad Delivery",email:"mail-invalid@example.invalid",password:passwordA,deliveryMode:"external"
  },400);
  assert.equal(db.raw.prepare("SELECT count(*) AS n FROM company_invitations").get().n,before);
  await expectStatus(db,b,"POST","/api/staff/invitations",{
   email:"staff-no-send@example.invalid",role:"employee",password:passwordB,deliveryMode:"email"
  },503);
  assert.equal(db.raw.prepare("SELECT count(*) AS n FROM staff_invitations").get().n,0);
 });
 await t.test("email invitation provider delivery is token-private, owner-restricted and revocable",async()=>{
  const config={
   EMAIL_DELIVERY_MODE:"resend",
   RESEND_API_KEY:"testing-provider-key-not-real",
   RESEND_FROM:"test@nexus.example.org",
   RESEND_SENDER_DOMAIN_VERIFIED:"true",
   PUBLIC_APP_ORIGIN:"https://crm.nexus.example.org",
   REQUIRE_VERIFIED_INVITATION_EMAIL:"true"
  };
  const oldFetch=globalThis.fetch;
  const sent=[];
  globalThis.fetch=async (url,options)=>{
   assert.equal(url,"https://api.resend.com/emails");
   const message=JSON.parse(options.body);
   sent.push(message);
   assert.ok(message.text.includes("https://crm.nexus.example.org/#"));
   return new Response(JSON.stringify({id:"accepted-provider-test"}),{status:200,headers:{"Content-Type":"application/json"}});
  };
  try{
   await expectStatus(db,a,"POST","/api/platform/invitations",{
    companyName:"Manual Must Fail",email:"manual-denied@example.invalid",password:passwordA
   },403,{env:config});
   const sentInvite=await expectStatus(db,a,"POST","/api/platform/invitations",{
    companyName:"Email QA Tenant",email:"email-qa-owner@example.invalid",password:passwordA,deliveryMode:"email"
   },201,{env:config});
   assert.equal(sentInvite.emailSubmitted,true);
   assert.equal(sentInvite.token,undefined,"Email delivery must not reveal invite token in HTTP response");
   assert.equal(db.raw.prepare("SELECT delivery_mode FROM company_invitations WHERE id=?").get(sentInvite.id).delivery_mode,"email");
   assert.equal(sent.length,1);
   assert.equal(sent[0].to[0],"email-qa-owner@example.invalid");
   assert.equal(sent[0].text.includes("/#invite="),true);
   await expectStatus(db,b,"POST","/api/platform/invitations",{
    companyName:"Unauthorized",email:"unauthorized@example.invalid",password:passwordB,deliveryMode:"email"
   },403,{env:config});
   await expectStatus(db,a,"POST","/api/platform/invitations/"+sentInvite.id+"/revoke",{password:passwordA},200,{env:config});
   const staff=await expectStatus(db,b,"POST","/api/staff/invitations",{
    email:"email-qa-staff@example.invalid",role:"employee",password:passwordB,deliveryMode:"email"
   },201,{env:config});
   assert.equal(staff.token,undefined);
   assert.equal(staff.emailSubmitted,true);
   assert.equal(db.raw.prepare("SELECT delivery_mode FROM staff_invitations WHERE id=?").get(staff.id).delivery_mode,"email");
   assert.equal(sent.length,2);
   assert.ok(sent[1].text.includes("/#staff="));
   await expectStatus(db,b,"POST","/api/staff/invitations/"+staff.id+"/revoke",{password:passwordB},200,{env:config});
  }finally{globalThis.fetch=oldFetch;}
 });
 await t.test("provider refusal revokes attempted email invitations",async()=>{
  const config={
   EMAIL_DELIVERY_MODE:"resend",RESEND_API_KEY:"testing-provider-key-not-real",
   RESEND_FROM:"test@nexus.example.org",RESEND_SENDER_DOMAIN_VERIFIED:"true",
   PUBLIC_APP_ORIGIN:"https://crm.nexus.example.org"
  };
  const oldFetch=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({error:"rejected"}),{status:503,headers:{"Content-Type":"application/json"}});
  try{
   await expectStatus(db,a,"POST","/api/platform/invitations",{
    companyName:"Provider Refused",email:"refused-owner@example.invalid",password:passwordA,deliveryMode:"email"
   },503,{env:config});
   const q=db.raw.prepare("SELECT count(*) AS n FROM company_invitations WHERE owner_email='refused-owner@example.invalid' AND revoked_at IS NOT NULL").get();
   assert.equal(q.n,1);
   const aBefore=db.raw.prepare("SELECT count(*) AS n FROM staff_invitations WHERE email='refused-staff@example.invalid' AND revoked_at IS NOT NULL").get().n;
   await expectStatus(db,b,"POST","/api/staff/invitations",{
    email:"refused-staff@example.invalid",role:"admin",password:passwordB,deliveryMode:"email"
   },503,{env:config});
   assert.equal(db.raw.prepare("SELECT count(*) AS n FROM staff_invitations WHERE email='refused-staff@example.invalid' AND revoked_at IS NOT NULL").get().n,aBefore+1);
  }finally{globalThis.fetch=oldFetch;}
 });
 await t.test("strict commercial email policy blocks old manual owner and staff invites",async()=>{
  const strict={REQUIRE_VERIFIED_INVITATION_EMAIL:"true"};
  const manual=await expectStatus(db,a,"POST","/api/platform/invitations",{
   companyName:"Old Manual Must Be Blocked",email:"legacy-manual-owner@example.invalid",password:passwordA
  },201);
  assert.equal(db.raw.prepare("SELECT delivery_mode FROM company_invitations WHERE id=?").get(manual.id).delivery_mode,"manual");
  await expectStatus(db,null,"POST","/api/invitations/accept",{
   token:manual.token,password:passwordB
  },403,{env:strict});
  assert.equal(db.raw.prepare("SELECT redeemed_at FROM company_invitations WHERE id=?").get(manual.id).redeemed_at,null);
  await expectStatus(db,a,"POST","/api/platform/invitations/"+manual.id+"/revoke",{password:passwordA},200);
  const staff=await expectStatus(db,b,"POST","/api/staff/invitations",{
   email:"legacy-manual-staff@example.invalid",role:"employee",password:passwordB
  },201);
  assert.equal(db.raw.prepare("SELECT delivery_mode FROM staff_invitations WHERE id=?").get(staff.id).delivery_mode,"manual");
  await expectStatus(db,null,"POST","/api/staff/invitations/accept",{
   token:staff.token,password:passwordEmployee
  },403,{env:strict});
  assert.equal(db.raw.prepare("SELECT redeemed_at FROM staff_invitations WHERE id=?").get(staff.id).redeemed_at,null);
  await expectStatus(db,b,"POST","/api/staff/invitations/"+staff.id+"/revoke",{password:passwordB},200);
 });
 await t.test("company B customer, job, employee, appointment and Finance",async()=>{
  bCustomer=(await expectStatus(db,b,"POST","/api/customers",{
   name:"Beta QA Customer",email:"beta@example.invalid",phone:"",notes:""
  },201)).id;
  bJob=(await expectStatus(db,b,"POST","/api/jobs",{
   title:"Beta QA Job",customerId:bCustomer,status:"Scheduled",amount:200,scheduledDate:"2026-12-03"
  },201)).id;
  bEmployee=(await expectStatus(db,b,"POST","/api/employees",{
   name:"QA Staff Directory",jobTitle:"Installer",status:"Active",email:"qa-directory@example.invalid"
  },201)).id;
  bAppointment=(await expectStatus(db,b,"POST","/api/appointments",{
   jobId:bJob,employeeId:bEmployee,appointmentDate:"2026-12-03",appointmentTime:"10:30",location:"Demo",notes:""
  },201)).id;
  bEstimate=(await expectStatus(db,b,"POST","/api/estimates",{
   customerId:bCustomer,description:"Demo estimate",amount:150,status:"Accepted"
  },201)).id;
  bInvoice=(await expectStatus(db,b,"POST","/api/invoices/from-estimate",{
   estimateId:bEstimate,dueDate:"2026-12-30"
  },201)).id;
  const payment=await expectStatus(db,b,"POST","/api/payments",{
   invoiceId:bInvoice,amount:50,paidDate:"2026-12-04",method:"Cash",note:"Test"
  },201);
  assert.ok(payment.id);
  const invoice=(await expectStatus(db,b,"GET","/api/invoices",undefined,200)).items[0];
  assert.equal(invoice.balance,100);
  const extra=await call(db,b,"POST","/api/payments",{
   invoiceId:bInvoice,amount:105,paidDate:"2026-12-05",method:"Cash"
  });
  assert.ok(extra.status>=400,"Overpayment should be blocked");
  assert.equal((await expectStatus(db,b,"GET","/api/payments",undefined,200)).items.length,1);
 });
 await t.test("two-way tenant isolation and ID tampering",async()=>{
  assert.equal((await expectStatus(db,a,"GET","/api/customers",undefined,200)).items.length,1);
  assert.equal((await expectStatus(db,b,"GET","/api/customers",undefined,200)).items.length,1);
  assert.equal((await expectStatus(db,a,"GET","/api/invoices",undefined,200)).items.length,0);
  assert.equal((await expectStatus(db,a,"GET","/api/estimates",undefined,200)).items.length,0);
  assert.equal((await expectStatus(db,a,"GET","/api/appointments",undefined,200)).items.length,0);
  await expectStatus(db,a,"PATCH","/api/customers/"+bCustomer,{name:"Cross-tenant edit"},404);
  await expectStatus(db,a,"PATCH","/api/jobs/"+bJob,{title:"Cross-tenant edit"},404);
  await expectStatus(db,a,"PATCH","/api/employees/"+bEmployee,{name:"Cross-tenant edit"},404);
  await expectStatus(db,a,"PATCH","/api/appointments/"+bAppointment,{location:"Cross-tenant edit"},404);
  await expectStatus(db,a,"PATCH","/api/estimates/"+bEstimate,{description:"Cross-tenant edit"},404);
  const bad=await call(db,a,"POST","/api/jobs",{
   customerId:bCustomer,title:"Cross-tenant insertion",amount:30,status:"Planned"
  });
  assert.ok(bad.status>=400);
  const badFinance=await call(db,a,"POST","/api/invoices",{
   customerId:bCustomer,description:"Cross tenant",amount:50,dueDate:"2026-12-30"
  });
  assert.ok(badFinance.status>=400);
  const badPayment=await call(db,a,"POST","/api/payments",{
   invoiceId:bInvoice,amount:10,paidDate:"2026-12-05",method:"Cash"
  });
  assert.ok(badPayment.status>=400);
  assert.equal((await expectStatus(db,b,"GET","/api/customers",undefined,200)).items[0].name,"Beta QA Customer");
  assert.equal((await expectStatus(db,b,"GET","/api/invoices",undefined,200)).items[0].balance,100);
 });
 await t.test("staff enrollment: roles, Finance denial, read-only employee, owner-only security",async()=>{
  const one=await expectStatus(db,b,"POST","/api/staff/invitations",{
   email:emailAdmin,role:"admin",password:passwordB
  },201);
  await expectStatus(db,admin,"POST","/api/staff/invitations/accept",{
   token:one.token,password:passwordAdmin
  },201);
  await expectStatus(db,null,"POST","/api/staff/invitations/accept",{
   token:one.token,password:passwordAdmin
  },403);
  const two=await expectStatus(db,b,"POST","/api/staff/invitations",{
   email:emailEmployee,role:"employee",password:passwordB
  },201);
  await expectStatus(db,employee,"POST","/api/staff/invitations/accept",{
   token:two.token,password:passwordEmployee
  },201);
  await expectStatus(db,admin,"GET","/api/invoices",undefined,200);
  await expectStatus(db,admin,"POST","/api/customers",{
   name:"Admin's QA Customer"
  },201);
  await expectStatus(db,admin,"GET","/api/backups",undefined,403);
  await expectStatus(db,admin,"GET","/api/security/activity",undefined,403);
  await expectStatus(db,admin,"GET","/api/staff/users",undefined,403);
  await expectStatus(db,admin,"GET","/api/platform/companies",undefined,403);
  await expectStatus(db,employee,"GET","/api/customers",undefined,200);
  await expectStatus(db,employee,"GET","/api/jobs",undefined,200);
  await expectStatus(db,employee,"GET","/api/appointments",undefined,200);
  await expectStatus(db,employee,"POST","/api/customers",{name:"Not allowed"},403);
  await expectStatus(db,employee,"GET","/api/invoices",undefined,403);
  await expectStatus(db,employee,"GET","/api/reports",undefined,403);
  await expectStatus(db,employee,"GET","/api/security/summary",undefined,403);
  const dashboard=await expectStatus(db,employee,"GET","/api/dashboard",undefined,200);
  assert.equal(dashboard.jobPipeline,0);
 });
 await t.test("admin self-service recovery, code replay and invalidated sessions",async()=>{
  const codes=await expectStatus(db,admin,"POST","/api/security/recovery-codes",{password:passwordAdmin},201);
  assert.equal(codes.codes.length,8);
  assert.equal((await expectStatus(db,admin,"GET","/api/security/recovery-count",undefined,200)).remaining,8);
  const newPassword="QA-Admin-Recovered-Password-2468";
  await expectStatus(db,null,"POST","/api/recover",{
   email:emailAdmin,code:codes.codes[0],newPassword
  },200);
  await expectStatus(db,admin,"GET","/api/me",undefined,401);
  await expectStatus(db,null,"POST","/api/recover",{
   email:emailAdmin,code:codes.codes[0],newPassword
  },403);
  await expectStatus(db,null,"POST","/api/login",{email:emailAdmin,password:passwordAdmin},401);
  await expectStatus(db,admin,"POST","/api/login",{email:emailAdmin,password:newPassword},200);
  await expectStatus(db,admin,"POST","/api/security/change-password",{
   currentPassword:newPassword,newPassword:"QA-Admin-Rotated-Password-2468"
  },200);
  await expectStatus(db,admin,"GET","/api/me",undefined,200);
 });
 await t.test("staff deactivation revokes old sessions and blocks new login",async()=>{
  const staff=(await expectStatus(db,b,"GET","/api/staff/users",undefined,200)).items;
  const target=staff.find(x=>x.email===emailEmployee);
  assert.ok(target);
  await expectStatus(db,b,"POST","/api/staff/users/"+target.id+"/disable",{
   password:passwordB
  },200);
  await expectStatus(db,employee,"GET","/api/me",undefined,401);
  await expectStatus(db,null,"POST","/api/login",{
   email:emailEmployee,password:passwordEmployee
  },401);
  await expectStatus(db,b,"POST","/api/staff/users/"+target.id+"/enable",{
   password:passwordB
  },200);
  await expectStatus(db,employee,"POST","/api/login",{
   email:emailEmployee,password:passwordEmployee
  },200);
 });
 await t.test("employee self-service security, password rotation and code replacement",async()=>{
  const saved=await expectStatus(db,employee,"POST","/api/security/recovery-codes",{
   password:passwordEmployee
  },201);
  assert.equal(saved.codes.length,8);
  assert.equal((await expectStatus(db,employee,"GET","/api/security/recovery-count",undefined,200)).remaining,8);
  const newPassword="QA-Employee-Rotated-Password-2468";
  await expectStatus(db,employee,"POST","/api/security/change-password",{
   currentPassword:passwordEmployee,newPassword
  },200);
  await expectStatus(db,null,"POST","/api/login",{email:emailEmployee,password:passwordEmployee},401);
  await expectStatus(db,employee,"POST","/api/security/recovery-codes",{password:newPassword},201);
  const old=await call(db,null,"POST","/api/recover",{
   email:emailEmployee,code:saved.codes[0],newPassword:"QA-Attacker-Replay-Code-2468"
  });
  assert.ok(old.status>=400,"Regenerated recovery codes must invalidate previous codes");
 });
 await t.test("revoked and expired invitations cannot create accounts",async()=>{
  const revoked=await expectStatus(db,a,"POST","/api/platform/invitations",{
   companyName:"QA Revoked Company",email:"qa-revoked-owner@example.invalid",password:passwordA
  },201);
  await expectStatus(db,a,"POST","/api/platform/invitations/"+revoked.id+"/revoke",{
   password:passwordA
  },200);
  await expectStatus(db,null,"POST","/api/invitations/accept",{
   token:revoked.token,password:passwordB
  },403);
  const staff=await expectStatus(db,b,"POST","/api/staff/invitations",{
   email:"qa-expired-staff@example.invalid",role:"employee",password:passwordB
  },201);
  // Move the invitation's test-only timestamps together to preserve the
  // schema invariant (expires_at > created_at) while simulating expiry.
  const simulatedNow=Math.floor(Date.now()/1000);
  db.raw.prepare("UPDATE staff_invitations SET created_at=?,expires_at=? WHERE id=?")
   .run(simulatedNow-3600,simulatedNow-1,staff.id);
  await expectStatus(db,null,"POST","/api/staff/invitations/accept",{
   token:staff.token,password:passwordEmployee
  },403);
  const count=db.raw.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  assert.equal(count,4,"Rejected invitations must not create any new users");
 });
 await t.test("backup ownership is scoped to the authenticated company",async()=>{
  const own=await expectStatus(db,a,"POST","/api/backups",{note:"Company A isolation QA"},201);
  await expectStatus(db,a,"GET","/api/backups/"+own.snapshot.id+"/preview",undefined,200);
  await expectStatus(db,b,"GET","/api/backups/"+own.snapshot.id+"/preview",undefined,404);
  await expectStatus(db,b,"POST","/api/backups/"+own.snapshot.id+"/export",{
   password:passwordB
  },404);
 });
 await t.test("backup snapshot, integrity preview, exports and audit trail",async()=>{
  const backup=await expectStatus(db,b,"POST","/api/backups",{note:"QA regression snapshot"},201);
  assert.ok(backup.snapshot?.id);
  const list=await expectStatus(db,b,"GET","/api/backups",undefined,200);
  assert.equal(list.items.length,1);
  const preview=await expectStatus(db,b,"GET","/api/backups/"+backup.snapshot.id+"/preview",undefined,200);
  assert.equal(preview.integrityVerified,true);
  const exportInfo=await expectStatus(db,b,"POST","/api/backups/"+backup.snapshot.id+"/export",{
   password:passwordB
  },200);
  assert.ok(exportInfo.records?.customers);
  await expectStatus(db,employee,"GET","/api/backups",undefined,403);
  const activity=await expectStatus(db,b,"GET","/api/security/activity",undefined,200);
  assert.ok(activity.items.length>0);
  assert.equal(db.raw.prepare("PRAGMA foreign_key_check").all().length,0);
  assert.equal(db.raw.prepare("PRAGMA quick_check").get().quick_check,"ok");
 });
 await t.test("authenticator MFA: enrollment, challenge, replay, expiry, disable and recovery",async()=>{
  const before=await expectStatus(db,a,"GET","/api/security/mfa/status",undefined,200);
  assert.equal(before.available,true);
  assert.equal(before.enabled,false);
  await expectStatus(db,a,"POST","/api/security/mfa/start",{password:"wrong password"},403);
  const seed=await expectStatus(db,a,"POST","/api/security/mfa/start",{password:passwordA},201);
  assert.match(seed.secret,/^[A-Z2-7]{32}$/);
  assert.ok(seed.otpauthUrl.startsWith("otpauth://totp/"));
  const account=db.raw.prepare("SELECT user_id,secret_cipher_hex FROM user_mfa").get();
  assert.equal(account.secret_cipher_hex.length,72);
  assert.equal(account.secret_cipher_hex.includes(seed.secret),false);
  const initial=Math.floor(Date.now()/30000);
  await expectStatus(db,a,"POST","/api/security/mfa/confirm",{code:"0000000"},403);
  await expectStatus(db,a,"POST","/api/security/mfa/confirm",{code:totp(seed.secret,initial-1)},200);
  const enabled=await expectStatus(db,a,"GET","/api/security/mfa/status",undefined,200);
  assert.equal(enabled.enabled,true);
  const newLogin=client();
  const challenge=await expectStatus(db,newLogin,"POST","/api/login",{email:emailA,password:passwordA},200);
  assert.equal(challenge.mfaRequired,true);
  assert.equal(newLogin.cookie,"","Password must not issue authenticated cookie when MFA is enabled");
  await expectStatus(db,newLogin,"POST","/api/login/mfa",{challenge:challenge.challenge,code:"000000"},403);
  const valid=totp(seed.secret,Math.floor(Date.now()/30000));
  await expectStatus(db,newLogin,"POST","/api/login/mfa",{challenge:challenge.challenge,code:valid},200);
  assert.ok(newLogin.cookie,"Valid authenticator code must issue a session");
  await expectStatus(db,newLogin,"GET","/api/me",undefined,200);
  await expectStatus(db,null,"POST","/api/login/mfa",{challenge:challenge.challenge,code:valid},403);
  const expires=await expectStatus(db,null,"POST","/api/login",{email:emailA,password:passwordA},200);
  assert.equal(expires.mfaRequired,true);
  const accountStep=db.raw.prepare("SELECT last_used_step FROM user_mfa").get().last_used_step;
  assert.ok(accountStep>=initial);
  db.raw.prepare("UPDATE mfa_login_challenges SET created_at=?,expires_at=? WHERE token_hash=?")
    .run(Math.floor(Date.now()/1000)-400,Math.floor(Date.now()/1000)-100,sha256(expires.challenge));
  await expectStatus(db,null,"POST","/api/login/mfa",{challenge:expires.challenge,code:totp(seed.secret,Math.floor(Date.now()/30000)+1)},403);
  await expectStatus(db,a,"POST","/api/security/mfa/disable",{password:"wrong",code:"000000"},403);
  await expectStatus(db,a,"POST","/api/security/mfa/disable",{
   password:passwordA,code:totp(seed.secret,Math.floor(Date.now()/30000)+1)
  },200);
  assert.equal((await expectStatus(db,a,"GET","/api/security/mfa/status",undefined,200)).enabled,false);
  const simple=await expectStatus(db,null,"POST","/api/login",{email:emailA,password:passwordA},200);
  assert.equal(simple.mfaRequired,undefined,"MFA-disabled users sign in normally");
 });
 await t.test("MFA disaster recovery: saved code resets password and disables lost authenticator",async()=>{
  const codes=await expectStatus(db,a,"POST","/api/security/recovery-codes",{password:passwordA},201);
  const start=await expectStatus(db,a,"POST","/api/security/mfa/start",{password:passwordA},201);
  await expectStatus(db,a,"POST","/api/security/mfa/confirm",{
   code:totp(start.secret,Math.floor(Date.now()/30000)-1)
  },200);
  const attempt=await expectStatus(db,null,"POST","/api/login",{email:emailA,password:passwordA},200);
  assert.equal(attempt.mfaRequired,true);
  const replacement="QA-Owner-Rescued-Password-2468";
  await expectStatus(db,null,"POST","/api/recover",{
   email:emailA,code:codes.codes[0],newPassword:replacement
  },200);
  await expectStatus(db,a,"GET","/api/me",undefined,401);
  await expectStatus(db,null,"POST","/api/login/mfa",{
   challenge:attempt.challenge,code:totp(start.secret,Math.floor(Date.now()/30000))
  },403);
  const recovered=await expectStatus(db,a,"POST","/api/login",{
   email:emailA,password:replacement
  },200);
  assert.equal(recovered.mfaRequired,undefined);
  assert.equal((await expectStatus(db,a,"GET","/api/security/mfa/status",undefined,200)).enabled,false);
  await expectStatus(db,null,"POST","/api/recover",{
   email:emailA,code:codes.codes[0],newPassword:replacement
  },403);
 });
 console.log("All isolated QA scenarios finished. No production database used.");
});

test("isolated platform Gmail-plus pilot invitation: no customer sending, one-time redemption and tenant isolation",async()=>{
 const db=memoryDB();
 for(const file of migrations)db.raw.exec(readFileSync(new URL("../migrations/"+file,import.meta.url),"utf8"));
 const owner=client(),invitee=client(),setupCode=random();
 const ownerMail="qa-private-pilot@gmail.com",ownerPw="Nexus-Testing-Owner-Pass-2468",inviteePw="Nexus-Testing-Invitee-Pass-2468";
 await db.prepare("INSERT INTO bootstrap_tokens(token_hash,created_at,expires_at) VALUES(?,?,?)")
  .bind(sha256(setupCode),Math.floor(Date.now()/1000),Math.floor(Date.now()/1000)+300).run();
 await expectStatus(db,owner,"POST","/api/setup",{setupCode,companyName:"Nexus Fictional QA",email:ownerMail,password:ownerPw},201);
 db.raw.exec(readFileSync(new URL("../migrations/005_platform_operator.sql",import.meta.url),"utf8"));
 const env={EMAIL_INVITATION_PILOT_ENABLED:"true",EMAIL_DELIVERY_MODE:"disabled",
  RESEND_API_KEY:"ci-fake-provider-never-live",RESEND_FROM:"notifications@nexussoftwareusa.com",
  RESEND_SENDER_DOMAIN_VERIFIED:"true",PUBLIC_APP_ORIGIN:"https://qa.nexus.example.org"};
 assert.equal((await expectStatus(db,owner,"GET","/api/platform/email-lab",undefined,200,{env})).pilotInviteAvailable,true);
 assert.equal((await expectStatus(db,owner,"GET","/api/platform/email-lab",undefined,200,{env:{...env,EMAIL_INVITATION_PILOT_ENABLED:"false"}})).pilotInviteAvailable,false);
 await expectStatus(db,null,"POST","/api/platform/email-invite-pilot",{password:ownerPw},401,{env});
 await expectStatus(db,owner,"POST","/api/platform/email-invite-pilot",{password:ownerPw},503,{env:{...env,EMAIL_INVITATION_PILOT_ENABLED:"false"}});
 await expectStatus(db,owner,"POST","/api/platform/email-invite-pilot",{password:"wrong"},403,{env});
 let transportCalls=0,mailMessage=null;
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async (url,options)=>{
   assert.equal(url,"https://api.resend.com/emails");
   assert.equal(options.redirect,"manual");
   mailMessage=JSON.parse(options.body);
   assert.equal(mailMessage.to.length,1);
   assert.match(mailMessage.to[0],/^qa-private-pilot\+nexus-test-[a-z0-9-]+@gmail\.com$/);
   assert.equal(mailMessage.from,"notifications@nexussoftwareusa.com");
   transportCalls++;
   return new Response(JSON.stringify({id:"test-provider-accepted-pilot"}),{status:200,headers:{"Content-Type":"application/json"}});
  };
  const created=await expectStatus(db,owner,"POST","/api/platform/email-invite-pilot",{
   password:ownerPw,email:"stranger@example.org",companyName:"Malicious override"
  },201,{env});
  assert.equal(created.emailSubmitted,true);
  assert.equal(created.pilotOnly,true);
  assert.equal(created.delivered,false);
  assert.match(created.email,/^qa-private-pilot\+nexus-test-[a-z0-9-]+@gmail\.com$/);
  assert.equal(created.token,undefined);
  assert.equal(transportCalls,1);
  assert.equal(mailMessage.to[0],created.email);
  const stored=db.raw.prepare("SELECT owner_email,company_name,delivery_mode,redeemed_at FROM company_invitations WHERE id=?").get(created.id);
  assert.equal(stored.owner_email,created.email);
  assert.equal(stored.company_name,created.companyName);
  assert.equal(stored.delivery_mode,"email");
  assert.equal(stored.redeemed_at,null);
  await expectStatus(db,owner,"POST","/api/platform/email-invite-pilot",{password:ownerPw},429,{env});
  assert.equal(transportCalls,1);
  const token=mailMessage.text.match(/#invite=([a-f0-9]{64})/)?.[1];
  assert.ok(token,"Only outbound provider message should contain redemption token");
  await expectStatus(db,invitee,"POST","/api/invitations/accept",{token,password:inviteePw},201,{env});
  assert.equal((await expectStatus(db,invitee,"GET","/api/me",undefined,200,{env})).user.isPlatformOperator,false);
  await expectStatus(db,invitee,"GET","/api/platform/companies",undefined,403,{env});
  assert.deepEqual((await expectStatus(db,invitee,"GET","/api/customers",undefined,200,{env})).items,[]);
  await expectStatus(db,null,"POST","/api/invitations/accept",{token,password:inviteePw},403,{env});
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM company_invitations").get().n,1);
 }finally{globalThis.fetch=original;}
});

test("restricted Gmail staff pilot invitation sends to operator alias, activates role, rejects replay and cross-tenant access",async()=>{
 const db=memoryDB();
 for(const file of migrations)db.raw.exec(readFileSync(new URL("../migrations/"+file,import.meta.url),"utf8"));
 const operator=client(),pilotOwner=client(),staff=client(),outsider=client(),setupCode=random();
 const opEmail="qa-staff-pilot@gmail.com";
 const opPw="Nexus-Test-Operator-Account-Pw-2026";
 const ownerPw="Nexus-Test-Fictional-Company-Pw-2026";
 const employeePw="Nexus-Test-Employee-Account-Pw-2026";
 await db.prepare("INSERT INTO bootstrap_tokens(token_hash,created_at,expires_at) VALUES(?,?,?)")
  .bind(sha256(setupCode),Math.floor(Date.now()/1000),Math.floor(Date.now()/1000)+300).run();
 await expectStatus(db,operator,"POST","/api/setup",{setupCode,companyName:"Nexus Internal Platform",email:opEmail,password:opPw},201);
 db.raw.exec(readFileSync(new URL("../migrations/005_platform_operator.sql",import.meta.url),"utf8"));
 const env={EMAIL_INVITATION_PILOT_ENABLED:"true",EMAIL_STAFF_PILOT_ENABLED:"true",EMAIL_DELIVERY_MODE:"disabled",
  RESEND_API_KEY:"fake-staff-pilot-credential-do-not-use",RESEND_FROM:"notifications@nexussoftwareusa.com",
  RESEND_SENDER_DOMAIN_VERIFIED:"true",PUBLIC_APP_ORIGIN:"https://qa.nexus.example.org"};
 const initial=await expectStatus(db,operator,"GET","/api/staff/invitations",undefined,200,{env});
 assert.equal(initial.pilotStaffAvailable,false,"Normal platform company cannot run staff pilot");
 await expectStatus(db,operator,"POST","/api/staff/email-invite-pilot",{password:opPw,role:"employee"},403,{env});
 let mail=null,sendCount=0;
 const saved=globalThis.fetch;
 try{
  globalThis.fetch=async (url,opts)=>{
   assert.equal(url,"https://api.resend.com/emails");
   assert.equal(opts.redirect,"manual");
   mail=JSON.parse(opts.body);
   assert.equal(mail.to.length,1);
   assert.ok(mail.to[0].endsWith("@gmail.com"));
   sendCount++;
   return new Response(JSON.stringify({id:"accepted-staff-pilot-test-"+sendCount}),{status:200,headers:{"Content-Type":"application/json"}});
  };
  const company=await expectStatus(db,operator,"POST","/api/platform/email-invite-pilot",{password:opPw},201,{env});
  assert.equal(company.emailSubmitted,true);
  const companyToken=mail.text.match(/#invite=([a-f0-9]{64})/)?.[1];
  assert.ok(companyToken);
  await expectStatus(db,pilotOwner,"POST","/api/invitations/accept",{token:companyToken,password:ownerPw},201,{env});
  assert.equal((await expectStatus(db,pilotOwner,"GET","/api/staff/invitations",undefined,200,{env})).pilotStaffAvailable,true);
  assert.equal((await expectStatus(db,pilotOwner,"GET","/api/staff/invitations",undefined,200,{env:{...env,EMAIL_STAFF_PILOT_ENABLED:"false"}})).pilotStaffAvailable,false);
  await expectStatus(db,null,"POST","/api/staff/email-invite-pilot",{password:ownerPw,role:"employee"},401,{env});
  await expectStatus(db,operator,"POST","/api/staff/email-invite-pilot",{password:opPw,role:"employee"},403,{env});
  await expectStatus(db,pilotOwner,"POST","/api/staff/email-invite-pilot",{password:ownerPw,role:"owner"},400,{env});
  await expectStatus(db,pilotOwner,"POST","/api/staff/email-invite-pilot",{password:"bad",role:"employee"},403,{env});
  await expectStatus(db,pilotOwner,"POST","/api/staff/email-invite-pilot",{password:ownerPw,role:"employee"},503,{env:{...env,EMAIL_STAFF_PILOT_ENABLED:"false"}});
  const created=await expectStatus(db,pilotOwner,"POST","/api/staff/email-invite-pilot",{
   role:"employee",password:ownerPw,email:"stranger@example.org"
  },201,{env});
  assert.equal(created.pilotOnly,true);
  assert.equal(created.emailSubmitted,true);
  assert.equal(created.delivered,false);
  assert.equal(created.token,undefined);
  assert.match(created.email,/^qa-staff-pilot\+nexus-staff-test-[a-z0-9-]+@gmail\.com$/);
  assert.equal(sendCount,2);
  assert.deepEqual(mail.to,[created.email]);
  assert.ok(!JSON.stringify(created).includes("#staff="));
  await expectStatus(db,pilotOwner,"POST","/api/staff/email-invite-pilot",{role:"employee",password:ownerPw},429,{env});
  assert.equal(sendCount,2);
  const entry=db.raw.prepare("SELECT tenant_id,email,role,delivery_mode,redeemed_at FROM staff_invitations WHERE id=?").get(created.id);
  assert.equal(entry.email,created.email);
  assert.equal(entry.role,"employee");
  assert.equal(entry.delivery_mode,"email");
  const staffToken=mail.text.match(/#staff=([a-f0-9]{64})/)?.[1];
  assert.ok(staffToken);
  await expectStatus(db,staff,"POST","/api/staff/invitations/accept",{token:staffToken,password:employeePw},201,{env});
  const me=await expectStatus(db,staff,"GET","/api/me",undefined,200,{env});
  assert.equal(me.user.role,"employee");
  assert.equal(me.user.isPlatformOperator,false);
  assert.equal(db.raw.prepare("SELECT tenant_id FROM users WHERE email=?").get(created.email).tenant_id,entry.tenant_id);
  assert.deepEqual((await expectStatus(db,staff,"GET","/api/customers",undefined,200,{env})).items,[]);
  await expectStatus(db,staff,"GET","/api/invoices",undefined,403,{env});
  await expectStatus(db,staff,"GET","/api/staff/invitations",undefined,403,{env});
  await expectStatus(db,staff,"GET","/api/platform/companies",undefined,403,{env});
  await expectStatus(db,outsider,"POST","/api/staff/invitations/accept",{token:staffToken,password:employeePw},403,{env});
  const users=db.raw.prepare("SELECT COUNT(*) AS n FROM users WHERE tenant_id=?").get(entry.tenant_id).n;
  assert.equal(users,2);
 }finally{globalThis.fetch=saved;}
});
