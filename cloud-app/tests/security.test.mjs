import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes } from "node:crypto";
import { onRequest } from "../functions/api/[[path]].js";

// ALL data lives in an in-memory database. No live Cloudflare D1 rows,
// production sessions, third-party APIs or secrets are used by this suite.
const base = "https://qa.nexus.invalid";
const sha256 = x => createHash("sha256").update(x).digest("hex");
const random = () => randomBytes(32).toString("hex");
const dir = new URL("../", import.meta.url);
const sqlRoot = readFileSync(new URL("../schema.sql",import.meta.url),"utf8");
const migrations = [
 "002_employees_appointments.sql","003_finance.sql","004_recovery_audit.sql",
 "005_platform_operator.sql","006_company_invitations.sql","007_staff_invitations.sql",
 "008_account_recovery_codes.sql","009_staff_deactivation.sql"
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
 const res=await onRequest({request:req,env:{DB:db}});
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
 console.log("All isolated QA scenarios finished. No production database used.");
});
