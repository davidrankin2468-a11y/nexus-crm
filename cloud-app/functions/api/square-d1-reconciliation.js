// Nexus POS Cloudflare D1 Square Sandbox reconciliation.
// All handlers must be called ONLY after CRM cookie auth, owner/admin RBAC,
// same-origin POST and CSRF checks in pos-api.js.
// Read-only Square verification; never creates a charge or accesses Production.
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY=/^[A-Za-z0-9_-]{8,45}$/;
const PAYMENT=/^[A-Za-z0-9_-]{8,200}$/;
const TIMEOUT_MS=12000;
const t=()=>Math.floor(Date.now()/1000);
const configured=env=>env.SQUARE_ENVIRONMENT==="sandbox"&&!!env.SQUARE_SANDBOX_ACCESS_TOKEN&&!!env.SQUARE_SANDBOX_LOCATION_ID&&!!env.SQUARE_SANDBOX_MERCHANT_ID;
function inspection(payment,id,attempt,env){
 if(!payment||typeof payment!=="object"||payment.id!==id)return "PAYMENT_ID_MISMATCH";
 if(payment.status!=="COMPLETED")return "PAYMENT_NOT_COMPLETED";
 if(payment.location_id!==env.SQUARE_SANDBOX_LOCATION_ID||payment.location_id!==attempt.square_location_id)return "LOCATION_MISMATCH";
 if(payment.merchant_id&&payment.merchant_id!==env.SQUARE_SANDBOX_MERCHANT_ID)return "MERCHANT_MISMATCH";
 if(payment.reference_id!==attempt.sale_id)return "SALE_REFERENCE_MISMATCH";
 if(payment.amount_money?.currency!=="USD"||!Number.isSafeInteger(payment.amount_money?.amount)||payment.amount_money.amount!==attempt.amount_cents)return "AMOUNT_MISMATCH";
 if(payment.total_money&&(payment.total_money.currency!=="USD"||payment.total_money.amount!==attempt.amount_cents))return "TOTAL_MISMATCH";
 if(payment.refunded_money?.amount>0)return "PAYMENT_ALREADY_REFUNDED";
 return null;
}
export {inspection as inspectSquarePayment};
export async function verifyCompletedSquareSandboxPayment({paymentId,attempt,env,fetchImpl=fetch}){
 if(!configured(env))return {verified:false,reason:"SANDBOX_NOT_CONFIGURED"};
 if(!PAYMENT.test(paymentId||"")||!attempt||!UUID.test(attempt.sale_id||"")||!Number.isSafeInteger(attempt.amount_cents)||attempt.amount_cents<1||attempt.square_location_id!==env.SQUARE_SANDBOX_LOCATION_ID)return {verified:false,reason:"INVALID_ATTEMPT"};
 const headers={Authorization:"Bearer "+env.SQUARE_SANDBOX_ACCESS_TOKEN,"Square-Version":"2026-09-16",Accept:"application/json"};
 try{
  const locations=await fetchImpl("https://connect.squareupsandbox.com/v2/locations",{method:"GET",redirect:"manual",signal:AbortSignal.timeout(TIMEOUT_MS),headers});
  if(locations.status>=300&&locations.status<400)return {verified:false,reason:"SQUARE_REDIRECT_BLOCKED"};
  if(!locations.ok)return {verified:false,reason:"SQUARE_LOCATIONS_REJECTED",providerStatus:locations.status};
  const locationsBody=await locations.json().catch(()=>null);
  const location=Array.isArray(locationsBody?.locations)?locationsBody.locations.find(l=>l?.id===env.SQUARE_SANDBOX_LOCATION_ID):null;
  if(!location||location.merchant_id!==env.SQUARE_SANDBOX_MERCHANT_ID)return {verified:false,reason:"MERCHANT_LOCATION_NOT_VERIFIED"};
  const response=await fetchImpl("https://connect.squareupsandbox.com/v2/payments/"+encodeURIComponent(paymentId),{method:"GET",redirect:"manual",signal:AbortSignal.timeout(TIMEOUT_MS),headers});
  if(response.status>=300&&response.status<400)return {verified:false,reason:"SQUARE_REDIRECT_BLOCKED"};
  if(!response.ok)return {verified:false,reason:"SQUARE_PAYMENT_REJECTED",providerStatus:response.status};
  const data=await response.json().catch(()=>null);
  const reason=inspection(data?.payment,paymentId,attempt,env);
  if(reason)return {verified:false,reason};
  return {verified:true,paymentId,amountCents:attempt.amount_cents};
 }catch{return {verified:false,reason:"SQUARE_PROVIDER_UNAVAILABLE"}}
}
// Only Square's published, fake Sandbox token is permitted here.
// This endpoint never takes card data, tokens or amounts from the browser.
export async function submitSandboxFakePayment({attempt,env,fetchImpl=fetch}){
 if(!configured(env))return {submitted:false,reason:"SANDBOX_NOT_CONFIGURED"};
 if(!attempt||!UUID.test(attempt.sale_id||"")||!KEY.test(attempt.idempotency_key||"")||!Number.isSafeInteger(attempt.amount_cents)||attempt.amount_cents<1||attempt.amount_cents>100000000||attempt.square_location_id!==env.SQUARE_SANDBOX_LOCATION_ID)return {submitted:false,reason:"INVALID_ATTEMPT"};
 const headers={Authorization:"Bearer "+env.SQUARE_SANDBOX_ACCESS_TOKEN,"Square-Version":"2026-09-16",Accept:"application/json","Content-Type":"application/json"};
 try{
  const response=await fetchImpl("https://connect.squareupsandbox.com/v2/payments",{
   method:"POST",redirect:"manual",signal:AbortSignal.timeout(TIMEOUT_MS),headers,
   body:JSON.stringify({source_id:"cnon:card-nonce-ok",idempotency_key:attempt.idempotency_key,
    amount_money:{amount:attempt.amount_cents,currency:"USD"},location_id:env.SQUARE_SANDBOX_LOCATION_ID,
    reference_id:attempt.sale_id,autocomplete:true})
  });
  if(response.status>=300&&response.status<400)return {submitted:false,reason:"SQUARE_REDIRECT_BLOCKED"};
  if(!response.ok)return {submitted:false,reason:"SQUARE_PAYMENT_REJECTED",providerStatus:response.status};
  const data=await response.json().catch(()=>null);
  const paymentId=data?.payment?.id;
  if(!PAYMENT.test(paymentId||""))return {submitted:false,reason:"PAYMENT_ID_NOT_RETURNED"};
  const mismatch=inspection(data.payment,paymentId,attempt,env);
  if(mismatch)return {submitted:false,reason:mismatch,paymentId};
  return {submitted:true,paymentId,providerCompleted:true};
 }catch{return {submitted:false,reason:"SQUARE_PROVIDER_UNAVAILABLE"}}
}
export async function handleSquareSandboxAttempt({path,method,db,env,tenant,body={},fetchImpl=fetch}){
 if(!configured(env))return json({error:"Sandbox not configured",payment_charged:false},503);
 if(path==="/api/pos/square/sandbox-prepare"&&method==="POST"){
  const id=body?.sale_id,key=body?.idempotency_key;
  if(!UUID.test(id||"")||!KEY.test(key||""))return json({error:"Invalid sale or idempotency key",payment_charged:false},400);
  const sale=await db.prepare("SELECT id,status,total_cents,currency FROM pos_sales WHERE tenant_id=? AND id=?").bind(tenant,id).first();
  if(!sale||sale.status!=="pending"||sale.currency!=="USD"||!Number.isSafeInteger(sale.total_cents)||sale.total_cents<1||sale.total_cents>100000000)return json({error:"SALE_NOT_PAYABLE",payment_charged:false},409);
  const old=await db.prepare("SELECT id,idempotency_key,amount_cents,square_location_id,status FROM pos_square_sandbox_payment_attempts WHERE tenant_id=? AND sale_id=?").bind(tenant,id).first();
  if(old){
   if(old.idempotency_key!==key||old.amount_cents!==sale.total_cents||old.square_location_id!==env.SQUARE_SANDBOX_LOCATION_ID)return json({error:"ATTEMPT_ALREADY_EXISTS",payment_charged:false},409);
   return json({attempt_id:old.id,sale_id:id,amount_cents:old.amount_cents,status:old.status,duplicate:true,payment_charged:false});
  }
  const attemptId=crypto.randomUUID(),created=t();
  try{
   await db.prepare("INSERT INTO pos_square_sandbox_payment_attempts(id,tenant_id,sale_id,idempotency_key,square_location_id,amount_cents,currency,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'USD','prepared',?,?)").bind(attemptId,tenant,id,key,env.SQUARE_SANDBOX_LOCATION_ID,sale.total_cents,created,created).run();
  }catch{
   // D1 uniqueness/tenant triggers fail closed; a retry with same key is safe.
   const existing=await db.prepare("SELECT id,idempotency_key,amount_cents,status FROM pos_square_sandbox_payment_attempts WHERE tenant_id=? AND sale_id=?").bind(tenant,id).first();
   if(existing?.idempotency_key===key&&existing.amount_cents===sale.total_cents)return json({attempt_id:existing.id,sale_id:id,amount_cents:existing.amount_cents,status:existing.status,duplicate:true,payment_charged:false});
   return json({error:"ATTEMPT_CONFLICT",payment_charged:false},409);
  }
  return json({attempt_id:attemptId,sale_id:id,amount_cents:sale.total_cents,status:"prepared",payment_charged:false},201);
 }
 if(path==="/api/pos/square/sandbox-attempts"&&method==="GET"){
  const list=await db.prepare("SELECT id,sale_id,amount_cents,currency,status,created_at,updated_at FROM pos_square_sandbox_payment_attempts WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100").bind(tenant).all();
  return json({items:list.results||[],environment:"sandbox",liveChargesEnabled:false});
 }
 if(path==="/api/pos/square/sandbox-submit"&&method==="POST"){
  if(body?.confirm!=="RUN SANDBOX TEST PAYMENT"||!UUID.test(body?.attempt_id||""))return json({error:"CONFIRMATION_OR_ATTEMPT_REQUIRED",payment_charged:false},400);
  const a=await db.prepare("SELECT id,tenant_id,sale_id,idempotency_key,amount_cents,currency,square_location_id,status,provider_payment_id FROM pos_square_sandbox_payment_attempts WHERE id=? AND tenant_id=?").bind(body.attempt_id,tenant).first();
  if(!a)return json({error:"ATTEMPT_NOT_FOUND",payment_charged:false},404);
  if(a.status!=="prepared"||a.provider_payment_id||a.currency!=="USD"||a.square_location_id!==env.SQUARE_SANDBOX_LOCATION_ID)return json({error:"ATTEMPT_NOT_ELIGIBLE_OR_ALREADY_SUBMITTED",reconciliation_required:a.status==="unknown"||a.status==="completed_unreconciled",payment_charged:false},409);
  const sale=await db.prepare("SELECT status,total_cents,currency FROM pos_sales WHERE id=? AND tenant_id=?").bind(a.sale_id,tenant).first();
  if(!sale||sale.status!=="pending"||sale.total_cents!==a.amount_cents||sale.currency!=="USD")return json({error:"SALE_NOT_PAYABLE",payment_charged:false},409);
  const claim=await db.prepare("UPDATE pos_square_sandbox_payment_attempts SET status='submitted',updated_at=? WHERE id=? AND tenant_id=? AND sale_id=? AND status='prepared' AND provider_payment_id IS NULL").bind(t(),a.id,tenant,a.sale_id).run();
  if(Number(claim?.meta?.changes)!==1)return json({error:"ATTEMPT_ALREADY_CLAIMED",payment_charged:false},409);
  const result=await submitSandboxFakePayment({attempt:a,env,fetchImpl});
  if(!result.submitted){
   // Unknown outcome: do not automatically resubmit. Square might have
   // created the fake payment even if our connection was interrupted.
   await db.prepare("UPDATE pos_square_sandbox_payment_attempts SET status='unknown',updated_at=? WHERE id=? AND tenant_id=? AND status='submitted'").bind(t(),a.id,tenant).run().catch(()=>null);
   return json({error:"SANDBOX_SUBMISSION_OUTCOME_UNKNOWN",reason:result.reason,
    payment_id:result.paymentId||undefined,providerStatus:result.providerStatus||undefined,
    reconciliation_required:true,receipt_paid:false,liveChargesEnabled:false},409);
  }
  try{
   const saved=await db.prepare("UPDATE pos_square_sandbox_payment_attempts SET status='completed_unreconciled',provider_payment_id=?,updated_at=? WHERE id=? AND tenant_id=? AND sale_id=? AND status='submitted' AND provider_payment_id IS NULL").bind(result.paymentId,t(),a.id,tenant,a.sale_id).run();
   if(Number(saved?.meta?.changes)!==1)throw Error("Attempt update was not confirmed");
  }catch{
   await db.prepare("UPDATE pos_square_sandbox_payment_attempts SET status='unknown',updated_at=? WHERE id=? AND tenant_id=? AND status='submitted'").bind(t(),a.id,tenant).run().catch(()=>null);
   return json({error:"SANDBOX_PAYMENT_NEEDS_MANUAL_RECONCILIATION",payment_id:result.paymentId,
    reconciliation_required:true,receipt_paid:false,liveChargesEnabled:false},503);
  }
  return json({submitted:true,environment:"sandbox",provider_completed:true,
   attempt_id:a.id,sale_id:a.sale_id,payment_id:result.paymentId,
   reconciliation_required:true,receipt_paid:false,liveChargesEnabled:false},202);
 }
 if(path==="/api/pos/square/sandbox-reconcile"&&method==="POST"){
  const attemptId=body?.attempt_id,paymentId=body?.payment_id;
  if(!UUID.test(attemptId||"")||!PAYMENT.test(paymentId||""))return json({error:"Invalid attempt or payment ID",payment_verified:false},400);
  const a=await db.prepare("SELECT id,sale_id,tenant_id,amount_cents,currency,square_location_id,status,provider_payment_id FROM pos_square_sandbox_payment_attempts WHERE tenant_id=? AND id=?").bind(tenant,attemptId).first();
  if(!a)return json({error:"ATTEMPT_NOT_FOUND",payment_verified:false},404);
  if(a.currency!=="USD"||a.square_location_id!==env.SQUARE_SANDBOX_LOCATION_ID||!["prepared","completed_unreconciled","unknown","reconciled"].includes(a.status)||a.provider_payment_id&&a.provider_payment_id!==paymentId)return json({error:"ATTEMPT_NOT_ELIGIBLE",payment_verified:false},409);
  const sale=await db.prepare("SELECT id,status,total_cents,currency FROM pos_sales WHERE tenant_id=? AND id=?").bind(tenant,a.sale_id).first();
  if(!sale||sale.total_cents!==a.amount_cents||sale.currency!=="USD"||!((sale.status==="pending"&&["prepared","completed_unreconciled","unknown"].includes(a.status))||(sale.status==="completed"&&a.status==="reconciled")))return json({error:"SALE_NOT_ELIGIBLE",payment_verified:false},409);
  const verified=await verifyCompletedSquareSandboxPayment({paymentId,attempt:a,env,fetchImpl});
  if(!verified.verified)return json({error:"PAYMENT_NOT_VERIFIED",reason:verified.reason,providerStatus:verified.providerStatus||undefined,payment_verified:false},verified.reason==="SQUARE_PROVIDER_UNAVAILABLE"?503:409);
  if(a.status==="reconciled"){
   const event=await db.prepare("SELECT id FROM pos_payment_events WHERE tenant_id=? AND sale_id=? AND provider='square_sandbox' AND provider_event_id=? AND event_type='payment_completed' AND amount_cents=?").bind(tenant,a.sale_id,paymentId,a.amount_cents).first();
   if(!event)return json({error:"RECEIPT_STATE_MISMATCH",payment_verified:true},409);
   return json({reconciled:true,duplicate:true,attempt_id:a.id,sale_id:a.sale_id,status:"completed",payment_verified:true,environment:"sandbox",payment_charged_by_this_request:false});
  }
  // D1 batch is a single atomic SQL transaction. Guard triggers refuse a receipt
  // unless its company, sale, amount and prepared attempt match exactly.
  try{
   const result=await db.batch([
    db.prepare("INSERT INTO pos_payment_events(id,tenant_id,sale_id,provider,provider_event_id,event_type,amount_cents,created_at) VALUES(?,?,?,'square_sandbox',?,'payment_completed',?,?)").bind(crypto.randomUUID(),tenant,a.sale_id,paymentId,a.amount_cents,t()),
    db.prepare("UPDATE pos_sales SET status='completed',completed_at=? WHERE tenant_id=? AND id=? AND status='pending' AND total_cents=? AND currency='USD'").bind(t(),tenant,a.sale_id,a.amount_cents),
    db.prepare("UPDATE pos_square_sandbox_payment_attempts SET status='reconciled',provider_payment_id=?,updated_at=? WHERE id=? AND tenant_id=? AND sale_id=? AND status IN ('prepared','completed_unreconciled','unknown') AND (provider_payment_id IS NULL OR provider_payment_id=?)").bind(paymentId,t(),a.id,tenant,a.sale_id,paymentId)
   ]);
   if(Number(result[1]?.meta?.changes)!==1||Number(result[2]?.meta?.changes)!==1)return json({error:"RECONCILIATION_UNCONFIRMED",payment_verified:true},503);
   return json({reconciled:true,duplicate:false,attempt_id:a.id,sale_id:a.sale_id,status:"completed",payment_verified:true,environment:"sandbox",payment_charged_by_this_request:false});
  }catch{
   // No new charge is ever submitted here. The caller can safely check/retry
   // reconciliation after a conflict; SQL batch rolls back all three writes.
   return json({error:"RECONCILIATION_CONFLICT",payment_verified:true,payment_charged_by_this_request:false},409);
  }
 }
 return json({error:"Not found"},404);
}
