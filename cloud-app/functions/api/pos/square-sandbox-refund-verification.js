// Read-only, fail-closed verification of an existing Square Sandbox refund.
export async function verifySandboxRefund({refundId,paymentId,amountCents,env,fetchImpl=fetch}){
 const valid=s=>typeof s==="string"&&/^[A-Za-z0-9_-]{8,200}$/.test(s);
 if(env?.SQUARE_ENVIRONMENT!=="sandbox"||!env.SQUARE_SANDBOX_ACCESS_TOKEN||!env.SQUARE_SANDBOX_LOCATION_ID)return {verified:false,reason:"SANDBOX_NOT_CONFIGURED"};
 if(!valid(refundId)||!valid(paymentId)||!Number.isSafeInteger(amountCents)||amountCents<1)return {verified:false,reason:"INVALID_REFUND"};
 try{
  const r=await fetchImpl("https://connect.squareupsandbox.com/v2/refunds/"+encodeURIComponent(refundId),{method:"GET",redirect:"manual",signal:AbortSignal.timeout(12000),headers:{Authorization:"Bearer "+env.SQUARE_SANDBOX_ACCESS_TOKEN,"Square-Version":"2026-09-16",Accept:"application/json"}});
  if(!r.ok)return {verified:false,reason:"SQUARE_REFUND_REJECTED",providerStatus:r.status};
  const v=(await r.json()).refund;
  if(v?.id!==refundId||v?.payment_id!==paymentId||v?.status!=="COMPLETED"||v?.amount_money?.currency!=="USD"||v?.amount_money?.amount!==amountCents||(v?.location_id&&v.location_id!==env.SQUARE_SANDBOX_LOCATION_ID))return {verified:false,reason:"REFUND_MISMATCH"};
  return {verified:true,refundId,paymentId,amountCents};
 }catch{return {verified:false,reason:"SQUARE_PROVIDER_UNAVAILABLE"}}
}
