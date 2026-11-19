// Isolated Square Sandbox transport. Not exposed as a public checkout endpoint.
// Call only after server-side company authorization, sale lookup and attempt persistence.
import {buildSquareSandboxPaymentPayload,inspectSquareSandboxPaymentResponse,SQUARE_SANDBOX_API_ORIGIN} from "./nexus-square-sandbox.js";
export async function submitSquareSandboxPayment({draft,locationId,referenceId,merchantId,fetchImpl=fetch,env=process.env}={}){
 if(env.SQUARE_ENVIRONMENT!=="sandbox"||typeof env.SQUARE_SANDBOX_ACCESS_TOKEN!=="string"||!env.SQUARE_SANDBOX_ACCESS_TOKEN)
  return {submitted:false,reason:"SANDBOX_NOT_CONFIGURED"};
 if(locationId!==env.SQUARE_SANDBOX_LOCATION_ID)
  return {submitted:false,reason:"LOCATION_NOT_CONFIGURED"};
 if(typeof merchantId!=="string"||!merchantId)
  return {submitted:false,reason:"MERCHANT_NOT_CONFIGURED"};
 let payload;
 try{payload=buildSquareSandboxPaymentPayload(draft,{locationId,referenceId})}
 catch{return {submitted:false,reason:"INVALID_PAYMENT_DRAFT"}}
 try{
  const response=await fetchImpl(SQUARE_SANDBOX_API_ORIGIN+"/v2/payments",{
   method:"POST",redirect:"error",signal:AbortSignal.timeout(12000),
   headers:{"Authorization":"Bearer "+env.SQUARE_SANDBOX_ACCESS_TOKEN,
    "Square-Version":"2026-09-16","Content-Type":"application/json","Accept":"application/json"},
   body:JSON.stringify(payload)
  });
  const data=await response.json().catch(()=>null);
  const checked=inspectSquareSandboxPaymentResponse(response.status,data,{
   amountCents:draft.amount_cents,locationId,referenceId,merchantId
  });
  // Even provider COMPLETED is not a paid receipt: webhook reconciliation is required.
  return {submitted:true,...checked};
 }catch{return {submitted:false,reason:"PROVIDER_UNAVAILABLE_OR_UNKNOWN_OUTCOME",retryWithSameIdempotencyKey:true}}
}
