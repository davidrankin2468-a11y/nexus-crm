// Owner/admin-only payment attempt preparation; never submits a charge.
import {actor,respond,allow,database,checkWrite} from "../../lib/nexus-pos-server.js";
import {prepareSquareSandboxAttempt} from "../../lib/nexus-square-attempt.js";
export default async function handler(req,res){
 if(!allow(req,res,["POST"]))return;
 const a=await actor(req,res);if(!a)return;
 if(!checkWrite(req,res))return;
 if(process.env.SQUARE_ENVIRONMENT!=="sandbox"||!process.env.SQUARE_SANDBOX_LOCATION_ID)
  return respond(res,503,{error:"Square sandbox not configured"});
 const body=req.body||{};
 const result=await prepareSquareSandboxAttempt({companyId:a.companyId,saleId:body.sale_id,
  idempotencyKey:body.idempotency_key,locationId:process.env.SQUARE_SANDBOX_LOCATION_ID,db:database});
 if(!result.prepared)return respond(res,result.reason==="INVALID_INPUT"?400:409,{error:result.reason,payment_charged:false});
 return respond(res,201,{attempt_id:result.attemptId,amount_cents:result.amountCents,
  status:"prepared",payment_charged:false});
}
