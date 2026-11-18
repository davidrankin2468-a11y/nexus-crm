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
 // Derive amount from an authorized, server-read receipt when wiring the provider.
 // Never accept raw card numbers or client-posted amounts in the real checkout API.
 if(!input||typeof input!=="object"||Array.isArray(input))return false;
 const {source_id,idempotency_key,amount_cents,currency}=input;
 return typeof source_id==="string"&&source_id.length>=8&&source_id.length<=400
  &&typeof idempotency_key==="string"&&/^[A-Za-z0-9_-]{8,100}$/.test(idempotency_key)
  &&Number.isSafeInteger(amount_cents)&&amount_cents>0&&amount_cents<=100000000
  &&currency==="USD"
  &&!Object.prototype.hasOwnProperty.call(input,"card_number")
  &&!Object.prototype.hasOwnProperty.call(input,"cvv");
}
