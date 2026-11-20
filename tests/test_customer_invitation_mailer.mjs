import test from "node:test";
import assert from "node:assert/strict";
import {invitationMailReadiness,buildInvitationEmail,sendInvitationEmail,freeInvitationEmailLab,sendSelfTestEmail} from "../cloud-app/functions/api/invitation-mailer.js";
const token="b".repeat(64);
const safeEnv={
 EMAIL_DELIVERY_MODE:"resend",RESEND_API_KEY:"sandbox-test-secret-never-production",
 RESEND_FROM:"hello@nexus-software.example",RESEND_SENDER_DOMAIN_VERIFIED:"true",
 PUBLIC_APP_ORIGIN:"https://nexus.example.org"
};
const create=(other={})=>({env:safeEnv,email:"person@example.org",companyName:"Sample & Sons <QA>",token,kind:"company",...other});

test("Cloudflare free email preview never sends or exposes tokens, keys or real recipients",()=>{
 const lab=freeInvitationEmailLab({RESEND_API_KEY:"secret-that-must-not-appear",PUBLIC_APP_ORIGIN:"https://nexussoftwareusa.com"});
 assert.equal(lab.mode,"cloudflare_free_preview");
 assert.equal(lab.sendAvailable,false);
 assert.equal(lab.emailSent,false);
 assert.equal(lab.realInvitationCreated,false);
 assert.equal(lab.productionEmailReady,false);
 assert.equal(lab.senderConfiguredInCRM,false);
 assert.equal(lab.sample.to,"example-recipient@example.invalid");
 assert.ok(lab.sample.body.includes("This is a preview"));
 assert.ok(lab.sample.body.includes("\n"));
 assert.ok(!JSON.stringify(lab).includes("secret-that-must-not-appear"));
 assert.ok(!JSON.stringify(lab).includes("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"));
 const configured=freeInvitationEmailLab(safeEnv);
 assert.equal(configured.senderConfiguredInCRM,true);
 assert.equal(configured.sendAvailable,false);
 assert.equal(configured.productionEmailReady,false);
});

test("owner-only connection test is explicit and does not use invitation tokens",async()=>{
 let calls=0;
 const selfEnv={...safeEnv,EMAIL_DELIVERY_MODE:"disabled",EMAIL_SELF_TEST_ENABLED:"true"};
 const fetcher=async (url,options)=>{
  calls++;
  assert.equal(url,"https://api.resend.com/emails");
  assert.equal(options.method,"POST");
  assert.equal(options.redirect,"error");
  const data=JSON.parse(options.body);
  assert.deepEqual(data.to,["person@example.org"]);
  assert.equal(data.from,selfEnv.RESEND_FROM);
  assert.match(data.subject,/connection test/i);
  assert.ok(!JSON.stringify(data).includes(token));
  assert.ok(!JSON.stringify(data).includes("/#invite="));
  return {ok:true,json:async()=>({id:"mail-test-accepted"})};
 };
 assert.equal(freeInvitationEmailLab(selfEnv).selfTestAvailable,true);
 assert.equal(freeInvitationEmailLab(selfEnv).sendAvailable,false);
 assert.equal(freeInvitationEmailLab(selfEnv).productionEmailReady,false);
 assert.deepEqual(await sendSelfTestEmail({env:selfEnv,email:"person@example.org",fetcher}),{sent:true,reason:"PROVIDER_ACCEPTED"});
 assert.equal(calls,1);
 assert.deepEqual(await sendSelfTestEmail({env:{...selfEnv,EMAIL_SELF_TEST_ENABLED:"false"},email:"person@example.org",fetcher}),{sent:false,reason:"SELF_TEST_NOT_CONFIGURED"});
 assert.equal(calls,1);
 assert.deepEqual(await sendSelfTestEmail({env:selfEnv,email:"malformed",fetcher}),{sent:false,reason:"INVALID_ACCOUNT_EMAIL"});
 assert.equal(calls,1);
 for(const [status,reason] of [
  [401,"API_KEY_REJECTED"],[403,"SENDER_OR_KEY_PERMISSIONS"],
  [400,"MESSAGE_VALIDATION"],[422,"MESSAGE_VALIDATION"],
  [429,"RATE_LIMITED"],[503,"PROVIDER_ERROR"],[418,"DELIVERY_REJECTED"]
 ]){
  const result=await sendSelfTestEmail({env:selfEnv,email:"person@example.org",
   fetcher:async()=>({ok:false,status,json:async()=>({name:"validation_error",message:"do not reveal arbitrary provider text or secret"})})});
  assert.deepEqual(result,{sent:false,reason});
  assert.ok(!JSON.stringify(result).includes("secret"));
  assert.ok(!JSON.stringify(result).includes("do not reveal"));
 }

 assert.deepEqual(await sendSelfTestEmail({env:selfEnv,email:"person@example.org",fetcher:async()=>{throw Error("connection");}}),{sent:false,reason:"DELIVERY_UNAVAILABLE"});
});
test("onboarding email remains disabled until sender/domain/provider are configured",()=>{
 const read=invitationMailReadiness({});
 assert.equal(read.ready,false);
 assert.equal(read.liveCustomerOnboardingEnabled,false);
 assert.equal(read.emailOwnershipVerified,false);
 for(const [key,value] of Object.entries({
  EMAIL_DELIVERY_MODE:"disabled",
  RESEND_API_KEY:undefined,
  RESEND_FROM:"bad-address",
  RESEND_SENDER_DOMAIN_VERIFIED:"false",
  PUBLIC_APP_ORIGIN:"http://nexus.example.org"
 }))assert.equal(invitationMailReadiness({...safeEnv,[key]:value}).ready,false,key);
 assert.equal(invitationMailReadiness(safeEnv).ready,true);
 assert.equal(invitationMailReadiness(safeEnv).liveCustomerOnboardingEnabled,false);
});

test("only an exact public HTTPS origin, with no credentials, query or fragment, is allowed",()=>{
 for(const bad of [
  "http://nexus.example.org","https://localhost","https://dev.invalid",
  "https://nexus.example.org/evil","https://nexus.example.org/#secret",
  "https://nexus.example.org/?next=https://evil.example",
  "https://user:password@nexus.example.org",
  "https://nexus.example.org:8443/"
 ])assert.equal(invitationMailReadiness({...safeEnv,PUBLIC_APP_ORIGIN:bad}).ready,false,bad);
});

test("company and staff invitation links use URL fragments and escape company HTML",()=>{
 const company=buildInvitationEmail(create());
 assert.match(company.html,/Sample &amp; Sons &lt;QA&gt;/);
 assert.ok(!company.html.includes("<QA>"));
 assert.ok(company.html.includes("https://nexus.example.org/#invite="+token));
 assert.ok(company.text.includes("https://nexus.example.org/#invite="+token));
 assert.equal(company.to.length,1);
 const staff=buildInvitationEmail(create({kind:"staff"}));
 assert.ok(staff.html.includes("/#staff="+token));
 assert.ok(!staff.html.includes("/#invite="+token));
});

test("invalid recipient, company, token, and delivery kind are rejected",()=>{
 for(const invalid of [
  {email:"bad\r\nBcc:other@example.org"},
  {email:"<script>@example.org"},
  {companyName:""},
  {companyName:"a".repeat(151)},
  {token:"short"},
  {token:"A".repeat(64)},
  {kind:"billing"}
 ])assert.throws(()=>buildInvitationEmail(create(invalid)));
});

test("provider accepts a valid mail only via a single secure request, no token in URL",async()=>{
 let count=0;
 const fakeFetch=async (url,options)=>{
  count++;
  assert.equal(url,"https://api.resend.com/emails");
  assert.equal(options.method,"POST");
  assert.equal(options.redirect,"error");
  assert.equal(options.headers.Authorization,"Bearer "+safeEnv.RESEND_API_KEY);
  const body=JSON.parse(options.body);
  assert.deepEqual(body.to,["person@example.org"]);
  assert.ok(body.html.includes("/#invite="+token));
  assert.ok(!url.includes(token));
  return {ok:true,json:async()=>({id:"email-confirmed-in-test"})};
 };
 const result=await sendInvitationEmail({...create(),fetcher:fakeFetch});
 assert.deepEqual(result,{sent:true,reason:"PROVIDER_ACCEPTED"});
 assert.equal(count,1);
});

test("provider timeout, failed status, empty response, and exceptions fail closed",async()=>{
 for(const [fetcher,reason] of [
  [async()=>{throw Error("network down")},"DELIVERY_UNAVAILABLE"],
  [async()=>({ok:false,status:429}),"DELIVERY_REJECTED"],
  [async()=>({ok:true,json:async()=>({})}),"DELIVERY_UNCONFIRMED"],
  [async()=>({ok:true,json:async()=>{throw Error("bad JSON")}}),"DELIVERY_UNCONFIRMED"]
 ]){
  const result=await sendInvitationEmail({...create(),fetcher});
  assert.equal(result.sent,false);
  assert.equal(result.reason,reason);
  assert.ok(!JSON.stringify(result).includes(token));
 }
});

test("cannot invoke any sending transport when configuration is absent",async()=>{
 let touched=false;
 await assert.rejects(()=>sendInvitationEmail({...create({env:{}}),fetcher:async()=>{touched=true;}}));
 assert.equal(touched,false);
});
