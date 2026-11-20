import test from "node:test";
import assert from "node:assert/strict";
import {invitationMailReadiness,buildInvitationEmail,sendInvitationEmail} from "../cloud-app/functions/api/invitation-mailer.js";
const token="b".repeat(64);
const safeEnv={
 EMAIL_DELIVERY_MODE:"resend",RESEND_API_KEY:"sandbox-test-secret-never-production",
 RESEND_FROM:"hello@nexus-software.example",RESEND_SENDER_DOMAIN_VERIFIED:"true",
 PUBLIC_APP_ORIGIN:"https://nexus.example.org"
};
const create=(other={})=>({env:safeEnv,email:"person@example.org",companyName:"Sample & Sons <QA>",token,kind:"company",...other});

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
