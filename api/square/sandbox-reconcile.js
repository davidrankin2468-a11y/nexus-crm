// Square sandbox only. Requires authenticated company owner/admin and a
// fresh provider-side verification before a service-role-only atomic DB RPC.
import {actor,respond,allow,database,checkWrite} from "../../lib/nexus-pos-server.js";
import {verifySquareSandboxPayment} from "../../lib/nexus-square-verify-payment.js";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export default async function handler(req,res){
 if(!allow(req,res,["POST"]))return;
 const a=await actor(req,res);if(!a)return;
 if(!checkWrite(req,res))return;
 if(process.env.SQUARE_ENVIRONMENT!=="sandbox")return respond(res,503,{error:"Sandbox disabled"});
 const id=req.body?.attempt_id;
 if(typeof id!=="string"||!uuid.test(id))return respond(res,400,{error:"Invalid attempt ID"});
 try{
  const q=new URLSearchParams({company_id:"eq."+a.companyId,id:"eq."+id,select:"id,company_id,sale_id,amount_cents,currency,square_location_id,provider_payment_id,status",limit:"1"});
  const attempts=await database("/rest/v1/nexus_square_sandbox_payment_attempts?"+q);
  if(!Array.isArray(attempts)||attempts.length!==1)return respond(res,404,{error:"Attempt not found"});
  const attempt=attempts[0];
  if(!["completed_unreconciled","reconciled"].includes(attempt.status)||attempt.currency!=="USD"||!attempt.provider_payment_id)
   return respond(res,409,{error:"Attempt not eligible for reconciliation"});
  const verification=await verifySquareSandboxPayment({paymentId:attempt.provider_payment_id,attempt});
  if(!verification.verified)return respond(res,409,{error:"Provider payment not verified",reason:verification.reason});
  const result=await database("/rest/v1/rpc/nexus_reconcile_square_sandbox_payment",{
   method:"POST",body:{p_company_id:a.companyId,p_attempt_id:id,p_payment_id:attempt.provider_payment_id}
  });
  if(result?.reconciled!==true)return respond(res,503,{error:"Reconciliation not confirmed"});
  return respond(res,200,{...result,payment_verified:true,environment:"sandbox"});
 }catch{return respond(res,503,{error:"Sandbox reconciliation unavailable; do not retry payment submission"})}
}
