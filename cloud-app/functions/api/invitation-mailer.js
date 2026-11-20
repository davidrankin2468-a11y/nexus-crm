// Secure transactional invitation delivery foundation (Cloudflare / Resend).
// Not connected to production signup yet: a verified sending domain, protected
// RESEND_API_KEY and application origin are prerequisites.
// Never log invitation links, tokens or Resend credentials.
// This module performs no network I/O unless explicitly called by an authenticated
// invite-creation workflow with a fully configured environment.
const address=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const tokenRe=/^[a-f0-9]{64}$/;
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const safeSubject=s=>String(s).replace(/[\r\n\t\u0000-\u001f]/g," ").trim().slice(0,120);

function originOf(value){
 try{
  const url=new URL(value);
  if(url.protocol!=="https:"||url.username||url.password||url.port||url.pathname!=="/"||url.search||url.hash)
   return null;
  if(url.hostname==="localhost"||url.hostname.endsWith(".localhost")||url.hostname.endsWith(".invalid"))
   return null;
  return url.origin;
 }catch{return null;}
}

export function invitationMailReadiness(env={}){
 const configured=env.EMAIL_DELIVERY_MODE==="resend"
   &&typeof env.RESEND_API_KEY==="string"&&env.RESEND_API_KEY.length>12
   &&typeof env.RESEND_FROM==="string"&&address.test(env.RESEND_FROM)
   &&env.RESEND_SENDER_DOMAIN_VERIFIED==="true"
   &&!!originOf(env.PUBLIC_APP_ORIGIN);
 return Object.freeze({
  ready:!!configured,
  provider:configured?"resend":"disabled",
  providerConfigured:configured,
  // This alone is never evidence of actual email delivery or mailbox ownership.
  emailOwnershipVerified:false,
  liveCustomerOnboardingEnabled:false
 });
}

// No-cost preview for the private platform operator only.
// Contains NO real email address, invitation token, provider secret, or executable link.
export function freeInvitationEmailLab(env={}){
 const ready=invitationMailReadiness(env);
 const selfReady=env.EMAIL_SELF_TEST_ENABLED==="true"&&invitationMailReadiness({...env,EMAIL_DELIVERY_MODE:"resend"}).ready;
 return Object.freeze({
  mode:"cloudflare_free_preview",
  sendAvailable:false,
  emailSent:false,
  realInvitationCreated:false,
  senderConfiguredInCRM:ready.providerConfigured,
  selfTestAvailable:selfReady,
  productionEmailReady:false,
  status:ready.providerConfigured?"Sender configured in CRM; final delivery tests still required":"CRM outbound sender not connected yet; confirm Resend domain verification separately",
  sample:Object.freeze({
   subject:"Your Nexus CRM company owner invitation (SAMPLE ONLY)",
   to:"example-recipient@example.invalid",
   from:"Not configured — sample only",
   body:"Hello,\n\nYou have been invited to Sample Company on Nexus CRM.\n\n[Your unique invitation link would appear here after verification.]\n\nInvitations are single-use and expire after three days.\n\nThis is a preview. No email has been sent."
  }),
  steps:Object.freeze([
   "The private Cloudflare preview stays available during email verification",
   "After Resend marks NexusSoftwareUSA.com Verified, configure the Resend API key securely in Cloudflare",
   "Test sending only to a verified inbox you control before enabling customer invitations"
  ])
 });
}

// Preserve the global fetch receiver in Cloudflare Workers. Passing fetch as\n// a bare default callback can throw "Illegal invocation" before any API call.\n// This route exists ONLY for the private operator's own account email.
// It does not use a live invitation token and does not change normal email
// onboarding rollout state. The API checks operator, password and throttle.
export async function sendSelfTestEmail({env={},email,fetcher=(...args)=>globalThis.fetch(...args)}={}){
 const ready=env.EMAIL_SELF_TEST_ENABLED==="true"
   &&invitationMailReadiness({...env,EMAIL_DELIVERY_MODE:"resend"}).ready;
 if(!ready)return {sent:false,reason:"SELF_TEST_NOT_CONFIGURED"};
 if(typeof email!=="string"||email.length>254||!address.test(email))
  return {sent:false,reason:"INVALID_ACCOUNT_EMAIL"};
 if(typeof fetcher!=="function")return {sent:false,reason:"DELIVERY_UNAVAILABLE"};
 const body=Object.freeze({
  from:env.RESEND_FROM,to:[email],
  subject:"Nexus CRM email connection test",
  text:"This is a secure test from Nexus Software Solutions. Your Nexus CRM business email sender is connected to Resend. No customer account was created, and no invitation or payment was sent. If you did not request this test, review your Nexus CRM account security.",
  html:"<p>This is a secure email connection test from Nexus Software Solutions.</p><p>No customer account was created, and no invitation or payment was sent.</p><p>If you did not request this test, review your Nexus CRM account security.</p>"
 });
 let response;
 try{
  response=await fetcher("https://api.resend.com/emails",{
   method:"POST",headers:{"Authorization":"Bearer "+env.RESEND_API_KEY,"Content-Type":"application/json"},
   body:JSON.stringify(body),redirect:"error",signal:AbortSignal.timeout(12000)
  });
 }catch{return {sent:false,reason:"DELIVERY_UNAVAILABLE"};}
 if(!response?.ok){
  // Do not forward Resend's arbitrary error text: it may contain addresses,
  // credentials, or provider internals. Only reveal finite status categories.
  const status=Number(response?.status);
  const reason=status===401?"API_KEY_REJECTED":
    status===403?"SENDER_OR_KEY_PERMISSIONS":
    status===400||status===422?"MESSAGE_VALIDATION":
    status===429?"RATE_LIMITED":
    status>=500&&status<=599?"PROVIDER_ERROR":"DELIVERY_REJECTED";
  return {sent:false,reason};
 }
 try{
  const data=await response.json();
  if(typeof data?.id!=="string"||data.id.length<5||data.id.length>200)
   return {sent:false,reason:"DELIVERY_UNCONFIRMED"};
 }catch{return {sent:false,reason:"DELIVERY_UNCONFIRMED"};}
 return {sent:true,reason:"PROVIDER_ACCEPTED"};
}

export function buildInvitationEmail({env={},email,companyName,token,kind="company"}={}){
 if(!invitationMailReadiness(env).ready)throw Error("Verified invitation email delivery is not configured");
 if(typeof email!=="string"||email.length>254||!address.test(email))throw Error("Invalid invitation recipient");
 if(typeof companyName!=="string"||!companyName.trim()||companyName.length>150)throw Error("Invalid company name");
 if(!tokenRe.test(token||""))throw Error("Invalid invitation token");
 if(!["company","staff"].includes(kind))throw Error("Invalid invitation kind");
 const origin=originOf(env.PUBLIC_APP_ORIGIN);
 const href=origin+"/#"+(kind==="company"?"invite":"staff")+"="+encodeURIComponent(token);
 const label=kind==="company"?"company owner":"company staff";
 const subject=safeSubject("Your Nexus CRM "+label+" invitation");
 const text="You have been invited to "+companyName+" on Nexus CRM.\nOpen this single-use link to accept your invitation: "+href+"\nThe link expires after 3 days. If you were not expecting it, ignore this message. Never share this link.";
 const html='<p>You have been invited to <strong>'+escapeHtml(companyName)+'</strong> on Nexus CRM.</p>'+
  '<p><a href="'+escapeHtml(href)+'">Accept your invitation</a> (expires in 3 days)</p>'+
  '<p>If you did not expect this invitation, ignore this message. Never share the link.</p>';
 return Object.freeze({from:env.RESEND_FROM,to:Object.freeze([email]),subject,text,html});
}

// Injectable fetcher makes provider failure tests completely offline. All
// success and error returns are deliberately non-sensitive.
export async function sendInvitationEmail({env,email,companyName,token,kind="company",fetcher=(...args)=>globalThis.fetch(...args)}={}){
 const message=buildInvitationEmail({env,email,companyName,token,kind});
 if(typeof fetcher!=="function")throw Error("Email delivery transport unavailable");
 let response;
 try{
  response=await fetcher("https://api.resend.com/emails",{
   method:"POST",
   headers:{"Authorization":"Bearer "+env.RESEND_API_KEY,"Content-Type":"application/json"},
   body:JSON.stringify(message),
   redirect:"error",
   signal:AbortSignal.timeout(12000)
  });
 }catch{return {sent:false,reason:"DELIVERY_UNAVAILABLE"};}
 if(!response?.ok)return {sent:false,reason:"DELIVERY_REJECTED"};
 try{
  const payload=await response.json();
  if(typeof payload?.id!=="string"||payload.id.length<5||payload.id.length>200)
   return {sent:false,reason:"DELIVERY_UNCONFIRMED"};
 }catch{return {sent:false,reason:"DELIVERY_UNCONFIRMED"};}
 return {sent:true,reason:"PROVIDER_ACCEPTED"};
}
