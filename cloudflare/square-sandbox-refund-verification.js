// Fail-closed Square Sandbox refund verification; no charges or refunds created here.
const ID=/^[A-Za-z0-9_-]{8,200}$/;
export function inspectSandboxRefund(refund,{paymentId,amountCents,locationId}){
 if(!refund||!ID.test(refund.id||''))return 'REFUND_ID_INVALID';
 if(refund.payment_id!==paymentId)return 'PAYMENT_MISMATCH';
 if(refund.status!=='COMPLETED')return 'REFUND_NOT_COMPLETED';
 if(refund.amount_money?.currency!=='USD'||refund.amount_money.amount!==amountCents)return 'AMOUNT_MISMATCH';
 if(refund.location_id&&refund.location_id!==locationId)return 'LOCATION_MISMATCH';
 return null;
}
export async function verifySandboxRefund({refundId,paymentId,amountCents,env,fetchImpl=fetch}){
 if(env?.SQUARE_ENVIRONMENT!=='sandbox'||!env.SQUARE_SANDBOX_ACCESS_TOKEN||!env.SQUARE_SANDBOX_LOCATION_ID)return {verified:false,reason:'SANDBOX_NOT_CONFIGURED'};
 if(!ID.test(refundId||'')||!ID.test(paymentId||'')||!Number.isSafeInteger(amountCents)||amountCents<1)return {verified:false,reason:'INVALID_REFUND'};
 try{
  const response=await fetchImpl('https://connect.squareupsandbox.com/v2/refunds/'+encodeURIComponent(refundId),{
   method:'GET',redirect:'manual',signal:AbortSignal.timeout(12000),
   headers:{Authorization:'Bearer '+env.SQUARE_SANDBOX_ACCESS_TOKEN,'Square-Version':'2026-09-16',Accept:'application/json'}
  });
  if(response.status>=300&&response.status<400)return {verified:false,reason:'SQUARE_REDIRECT_BLOCKED'};
  if(!response.ok)return {verified:false,reason:'SQUARE_REFUND_REJECTED',providerStatus:response.status};
  const body=await response.json().catch(()=>null);
  const reason=inspectSandboxRefund(body?.refund,{paymentId,amountCents,locationId:env.SQUARE_SANDBOX_LOCATION_ID});
  return reason?{verified:false,reason}:{verified:true,refundId,paymentId,amountCents};
 }catch{return {verified:false,reason:'SQUARE_PROVIDER_UNAVAILABLE'}}
}
