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
 return Object.freeze({
  mode:"cloudflare_free_preview",
  sendAvailable:false,
  emailSent:false,
  realInvitationCreated:false,
  senderConfiguredInCRM:ready.providerConfigured,
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
export async function sendInvitationEmail({env,email,companyName,token,kind="company",fetcher=fetch}={}){
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
