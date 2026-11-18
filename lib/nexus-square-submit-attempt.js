// Server-side Square sandbox submission; never trusts browser totals or location.
// A claimed attempt is not automatically retried after uncertain network outcomes.
import {submitSquareSandboxPayment} from "./nexus-square-payment-transport.js";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function submitPreparedSandboxAttempt({companyId,attemptId,sourceId,db,env=process.env,transport=submitSquareSandboxPayment}={}){
 if(!uuid.test(companyId||"")||!uuid.test(attemptId||"")||typeof sourceId!=="string"||sourceId.length<8||sourceId.length>400||typeof db!=="function")return {submitted:false,reason:"INVALID_INPUT"};
 if(env.SQUARE_ENVIRONMENT!=="sandbox"||!env.SQUARE_SANDBOX_LOCATION_ID||!env.SQUARE_SANDBOX_MERCHANT_ID||!env.SQUARE_SANDBOX_ACCESS_TOKEN)return {submitted:false,reason:"SANDBOX_NOT_CONFIGURED"};
 try{
  const q=new URLSearchParams({company_id:"eq."+companyId,id:"eq."+attemptId,status:"eq.prepared",select:"id,sale_id,amount_cents,idempotency_key,square_location_id",limit:"1"});
  const rows=await db("/rest/v1/nexus_square_sandbox_payment_attempts?"+q);
  const attempt=Array.isArray(rows)&&rows.length===1?rows[0]:null;
  if(!attempt||attempt.square_location_id!==env.SQUARE_SANDBOX_LOCATION_ID||!uuid.test(attempt.sale_id)||!Number.isSafeInteger(attempt.amount_cents)||attempt.amount_cents<1)return {submitted:false,reason:"ATTEMPT_NOT_PAYABLE"};
  const saleQ=new URLSearchParams({company_id:"eq."+companyId,id:"eq."+attempt.sale_id,select:"id,status,total_cents",limit:"1"});
  const sales=await db("/rest/v1/nexus_pos_sales?"+saleQ);
  if(!Array.isArray(sales)||sales.length!==1||sales[0].status!=="pending"||sales[0].total_cents!==attempt.amount_cents)return {submitted:false,reason:"SALE_CHANGED"};
  // Atomic compare-and-set: only one caller may claim the prepared attempt.
  const claimQ=new URLSearchParams({company_id:"eq."+companyId,id:"eq."+attemptId,status:"eq.prepared",select:"id"});
  const claimed=await db("/rest/v1/nexus_square_sandbox_payment_attempts?"+claimQ,{method:"PATCH",body:{status:"submitted",updated_at:new Date().toISOString()},prefer:"return=representation"});
  if(!Array.isArray(claimed)||claimed.length!==1||claimed[0].id!==attemptId)return {submitted:false,reason:"ALREADY_CLAIMED"};
  const result=await transport({draft:{source_id:sourceId,idempotency_key:attempt.idempotency_key,amount_cents:attempt.amount_cents,currency:"USD"},locationId:attempt.square_location_id,referenceId:attempt.sale_id,merchantId:env.SQUARE_SANDBOX_MERCHANT_ID,env});
  // Never mark the POS receipt paid here. Webhook/provider reconciliation required.
  if(result.submitted&&result.providerCompleted&&result.paymentId){
   await db("/rest/v1/nexus_square_sandbox_payment_attempts?"+new URLSearchParams({company_id:"eq."+companyId,id:"eq."+attemptId,status:"eq.submitted"}),{method:"PATCH",body:{status:"completed_unreconciled",provider_payment_id:result.paymentId,updated_at:new Date().toISOString()},prefer:"return=representation"});
  }
  return {...result,payment_charged:result.providerCompleted===true,reconciliation_required:result.reconciliationRequired===true};
 }catch{return {submitted:false,reason:"SUBMISSION_OR_PERSISTENCE_UNCERTAIN",manualReconciliationRequired:true}}
}
