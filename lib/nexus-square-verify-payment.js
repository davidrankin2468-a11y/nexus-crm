// Read-only Square Sandbox payment verification for safe reconciliation.
// Never trusts webhook payloads as proof of payment; never marks sales paid.
import {inspectSquareSandboxPaymentResponse,SQUARE_SANDBOX_API_ORIGIN} from "./nexus-square-sandbox.js";
export async function verifySquareSandboxPayment({paymentId,attempt,env=process.env,fetchImpl=fetch}={}){
 if(env.SQUARE_ENVIRONMENT!=="sandbox"||!env.SQUARE_SANDBOX_ACCESS_TOKEN||!env.SQUARE_SANDBOX_MERCHANT_ID||!env.SQUARE_SANDBOX_LOCATION_ID)return {verified:false,reason:"SANDBOX_NOT_CONFIGURED"};
 if(typeof paymentId!=="string"||!/^[A-Za-z0-9_-]{8,200}$/.test(paymentId)||!attempt||attempt.provider_payment_id!==paymentId||typeof attempt.sale_id!=="string"||!Number.isSafeInteger(attempt.amount_cents)||attempt.amount_cents<1||attempt.square_location_id!==env.SQUARE_SANDBOX_LOCATION_ID)return {verified:false,reason:"INVALID_ATTEMPT"};
 try{
  const response=await fetchImpl(SQUARE_SANDBOX_API_ORIGIN+"/v2/payments/"+encodeURIComponent(paymentId),{method:"GET",redirect:"error",signal:AbortSignal.timeout(12000),headers:{"Authorization":"Bearer "+env.SQUARE_SANDBOX_ACCESS_TOKEN,"Square-Version":"2026-09-16","Accept":"application/json"}});
  const payload=await response.json().catch(()=>null);
  const checked=inspectSquareSandboxPaymentResponse(response.status,payload,{amountCents:attempt.amount_cents,locationId:attempt.square_location_id,referenceId:attempt.sale_id,merchantId:env.SQUARE_SANDBOX_MERCHANT_ID});
  if(!checked.providerCompleted||checked.paymentId!==paymentId)return {verified:false,reason:checked.reason||"PAYMENT_ID_MISMATCH"};
  return {verified:true,paymentId,requiresAtomicReceiptReconciliation:true};
 }catch{return {verified:false,reason:"PROVIDER_UNAVAILABLE"}}
}
