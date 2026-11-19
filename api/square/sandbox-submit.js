// Owner/admin authenticated sandbox checkout. No browser-supplied totals, merchant or location.
import {actor,respond,allow,database,checkWrite} from "../../lib/nexus-pos-server.js";
import {submitPreparedSandboxAttempt} from "../../lib/nexus-square-submit-attempt.js";
export default async function handler(req,res){
 if(!allow(req,res,["POST"]))return;
 const a=await actor(req,res);if(!a)return;
 if(!checkWrite(req,res))return;
 if(process.env.SQUARE_ENVIRONMENT!=="sandbox")return respond(res,503,{error:"Square sandbox disabled"});
 const body=req.body||{};
 const result=await submitPreparedSandboxAttempt({companyId:a.companyId,attemptId:body.attempt_id,
  sourceId:body.source_id,db:database});
 if(!result.submitted)return respond(res,result.reason==="INVALID_INPUT"?400:409,{error:result.reason,
  reconciliation_required:Boolean(result.manualReconciliationRequired)});
 return respond(res,202,{provider_completed:result.providerCompleted===true,
  reconciliation_required:true,receipt_paid:false,
  reason:result.reason||null});
}
