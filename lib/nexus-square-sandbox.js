// Square SANDBOX preparation only: no network calls and no real charges.
import {createHmac,timingSafeEqual} from "node:crypto";

export const SQUARE_SANDBOX_API_ORIGIN="https://connect.squareupsandbox.com";

export function squareSandboxConfigured(){
 return process.env.SQUARE_ENVIRONMENT==="sandbox"
  &&Boolean(process.env.SQUARE_SANDBOX_ACCESS_TOKEN)
  &&Boolean(process.env.SQUARE_SANDBOX_LOCATION_ID)
  &&Boolean(process.env.SQUARE_SANDBOX_WEBHOOK_SIGNATURE_KEY)
  &&/^https:\/\/[^\s]+$/.test(process.env.SQUARE_SANDBOX_WEBHOOK_URL||"");
}
export function verifySquareSandboxSignature(rawBody,signature,options={}){
 const key=options.key??process.env.SQUARE_SANDBOX_WEBHOOK_SIGNATURE_KEY;
 const notificationUrl=options.notificationUrl??process.env.SQUARE_SANDBOX_WEBHOOK_URL;
 if(typeof rawBody!=="string"||!rawBody.length||rawBody.length>1048576
  ||typeof signature!=="string"||typeof key!=="string"||!key
  ||typeof notificationUrl!=="string"||!/^https:\/\/[^\s]+$/.test(notificationUrl))return false;
 const expected=createHmac("sha256",key).update(notificationUrl+rawBody,"utf8").digest("base64");
 const left=Buffer.from(expected,"utf8"),right=Buffer.from(signature,"utf8");
 return left.length===right.length && timingSafeEqual(left,right);
}
export function validateSandboxPaymentDraft(input){
 // Square's CreatePayment idempotency_key has a strict 45-character maximum.
 // Derive amount from an authorized, server-read receipt when wiring the provider.
 // Never accept raw card numbers or client-posted amounts in the real checkout API.
 if(!input||typeof input!=="object"||Array.isArray(input))return false;
 const {source_id,idempotency_key,amount_cents,currency}=input;
 return typeof source_id==="string"&&source_id.length>=8&&source_id.length<=400
  &&typeof idempotency_key==="string"&&/^[A-Za-z0-9_-]{8,45}$/.test(idempotency_key)
  &&Number.isSafeInteger(amount_cents)&&amount_cents>0&&amount_cents<=100000000
  &&currency==="USD"
  &&!Object.prototype.hasOwnProperty.call(input,"card_number")
  &&!Object.prototype.hasOwnProperty.call(input,"cvv");
}


// Pure request construction for offline sandbox contract tests only.
// Caller MUST read amount/location from an authorized server-side sale, never the browser.
// This function does not send network requests, settle money, or mark receipts paid.
export function buildSquareSandboxPaymentPayload(draft, {locationId, referenceId} = {}) {
 if(!validateSandboxPaymentDraft(draft)) throw new TypeError("Invalid sandbox payment draft");
 if(typeof locationId!=="string"||!/^[A-Za-z0-9_-]{4,100}$/.test(locationId))
  throw new TypeError("Invalid sandbox location");
 if(typeof referenceId!=="string"||!referenceId||referenceId.length>40)
  throw new TypeError("Invalid receipt reference");
 return {
  source_id:draft.source_id,
  idempotency_key:draft.idempotency_key,
  amount_money:{amount:draft.amount_cents,currency:"USD"},
  location_id:locationId,
  reference_id:referenceId
 };
}

// Inspect a synthetic or eventual provider response WITHOUT activating a sale.
// A completed provider response still needs authenticated webhook reconciliation,
// provider event deduplication, and tenant-validated receipt lookup.
export function inspectSquareSandboxPaymentResponse(httpStatus, payload, expected={}) {
 if(!Number.isInteger(httpStatus)||httpStatus<200||httpStatus>=300)
  return {providerCompleted:false,reconciliationRequired:false,reason:"PROVIDER_REJECTED"};
 const payment=payload?.payment;
 if(!payment||typeof payment.id!=="string"||!payment.id||
  typeof payment.status!=="string")
  return {providerCompleted:false,reconciliationRequired:false,reason:"BAD_PROVIDER_RESPONSE"};
 if(payment.status!=="COMPLETED")
  return {providerCompleted:false,reconciliationRequired:false,reason:"NOT_COMPLETED"};
 if(!Number.isSafeInteger(expected.amountCents)||expected.amountCents<1||
  payment.amount_money?.amount!==expected.amountCents||
  payment.amount_money?.currency!=="USD")
  return {providerCompleted:false,reconciliationRequired:false,reason:"AMOUNT_MISMATCH"};
 if(typeof expected.locationId!=="string"||!expected.locationId||
  payment.location_id!==expected.locationId)
  return {providerCompleted:false,reconciliationRequired:false,reason:"LOCATION_MISMATCH"};
 return {providerCompleted:true,reconciliationRequired:true,paymentId:payment.id};
}
