// Authenticated, read-only reconciliation probe. Does not alter receipts.
import {actor,respond,allow,database} from "../../lib/nexus-pos-server.js";
import {verifySquareSandboxPayment} from "../../lib/nexus-square-verify-payment.js";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export default async function handler(req,res){
 if(!allow(req,res,["GET"]))return;
 const a=await actor(req,res);if(!a)return;
 if(process.env.SQUARE_ENVIRONMENT!=="sandbox")return respond(res,503,{error:"Sandbox disabled"});
 const id=req.query?.attempt_id;
 if(typeof id!=="string"||!uuid.test(id))return respond(res,400,{error:"Invalid attempt ID"});
 try{
  const q=new URLSearchParams({company_id:"eq."+a.companyId,id:"eq."+id,select:"id,sale_id,amount_cents,square_location_id,provider_payment_id,status",limit:"1"});
  const attempts=await database("/rest/v1/nexus_square_sandbox_payment_attempts?"+q);
  if(!Array.isArray(attempts)||attempts.length!==1)return respond(res,404,{error:"Attempt not found"});
  const attempt=attempts[0];
  if(!attempt.provider_payment_id)return respond(res,409,{verified:false,reason:"PAYMENT_ID_NOT_RECORDED"});
  const result=await verifySquareSandboxPayment({paymentId:attempt.provider_payment_id,attempt});
  return respond(res,result.verified?200:409,{...result,receipt_updated:false});
 }catch{return respond(res,503,{error:"Reconciliation verification unavailable"})}
}
