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
  if(!locatio --- TRUNCATED --- 15,541 chars