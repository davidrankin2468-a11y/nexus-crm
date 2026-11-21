import {handleSquareSandboxWebhook} from "./square-sandbox-webhook.js";
import {verifySandboxRefund,inspectSandboxRefund} from "./square-sandbox-refund-verification.js";
void verifySandboxRefund;
import {onRequest as crmApi} from "./crm-api.js";
import {onRequest as posApi} from "./pos-api.js";
import {HTML,APP,CSS,PRINT} from "./assets.js";
const headers={"X-Robots-Tag":"noindex, nofollow","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY","Cache-Control":"no-store","Strict-Transport-Security":"max-age=31536000"};
export default {
 async fetch(request,env){
  const path=new URL(request.url).pathname;
  if(path.startsWith('/api/') && path!='/api/pos/square/webhook' && path!='/api/square/sandbox-readiness') {
   const ip=request.headers.get('CF-Connecting-IP')||'unknown';
   const auth=/login|signin|sign-in|register|signup|password|reset|mfa|verify|session/i.test(path);
   const limiter=auth?env.NEXUS_AUTH_RATE_LIMIT:env.NEXUS_API_RATE_LIMIT;
   if(!limiter)return new Response('Security limiter unavailable',{status:503,headers:{'Cache-Control':'no-store'}});
   try {const result=await limiter.limit({key:ip+':'+(auth?'auth':'api')});if(!result.success)return new Response(JSON.stringify({error:'Too many requests'}),{status:429,headers:{'Content-Type':'application/json','Retry-After':'60','Cache-Control':'no-store'}})}catch(e){console.error('rate_limit_error');return new Response('Security check unavailable',{status:503,headers:{'Cache-Control':'no-store'}})}
  }
  if(path==="/regression-status"&&request.method==="GET"){
   const tests=[];
   const assert=(name,pass)=>tests.push({name,pass:Boolean(pass)});
   const good={id:"sandbox_refund_12345678",payment_id:"sandbox_payment_12345678",status:"COMPLETED",amount_money:{amount:50,currency:"USD"},location_id:"sandbox_location_12345678"};
   const expected={paymentId:good.payment_id,amountCents:50,locationId:good.location_id};
   assert("valid_completed_refund",inspectSandboxRefund(good,expected)===null);
   assert("reject_pending_refund",inspectSandboxRefund({...good,status:"PENDING"},expected)==="REFUND_NOT_COMPLETED");
   assert("reject_wrong_payment",inspectSandboxRefund({...good,payment_id:"wrong"},expected)==="PAYMENT_MISMATCH");
   assert("reject_wrong_amount",inspectSandboxRefund({...good,amount_money:{amount:51,currency:"USD"}},expected)==="AMOUNT_MISMATCH");
   assert("reject_wrong_currency",inspectSandboxRefund({...good,amount_money:{amount:50,currency:"EUR"}},expected)==="AMOUNT_MISMATCH");
   assert("reject_wrong_location",inspectSandboxRefund({...good,location_id:"wrong"},expected)==="LOCATION_MISMATCH");
   assert("reject_invalid_refund_id",inspectSandboxRefund({...good,id:"bad"},expected)==="REFUND_ID_INVALID");
   assert("partial_refund_amount_accepted",inspectSandboxRefund(good,{...expected,amountCents:50})===null);
   try{
    if(!env.DB)throw Error("no_database");
    const queries=[
     --- TRUNCATED --- 6,566 chars