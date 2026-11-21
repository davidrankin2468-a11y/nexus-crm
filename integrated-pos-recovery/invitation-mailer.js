// Secure transactional invitation delivery foundation (Cloudflare / Resend).
// Not connected to production signup yet: a verified sending domain, protected
// RESEND_API_KEY and application origin are prerequisites.
// Never log invitation links, tokens or Resend credentials.
// This module performs no network I/O unless explicitly called by an authenticated
// invite-creation workflow with a fully configured environment.
// Never follow redirects with the Resend Authorization header: in Cloudflare
// Workers, redirect:"error" is unsupported and throws before sending.
// redirect:"manual" returns any 3xx response, treated as a rejected send.
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
   body:"Hello,\n\nYou have been invited to Sample Company  --- TRUNCATED --- 8,678 chars