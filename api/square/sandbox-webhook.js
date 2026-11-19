// Signed Square sandbox webhook intake. No sale status changes until reconciliation is built.
import {createHash} from "node:crypto";
import {verifySquareSandboxSignature} from "../../lib/nexus-square-sandbox.js";
import {database,respond,allow} from "../../lib/nexus-pos-server.js";
export const config={api:{bodyParser:false}};
async function rawBytes(req){const chunks=[];let size=0;for await(const chunk of req){const b=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=b.length;if(size>1048576)throw Error("TOO_LARGE");chunks.push(b)}return Buffer.concat(chunks)}
export default async function handler(req,res){
 if(!allow(req,res,["POST"]))return;
 if(process.env.SQUARE_ENVIRONMENT!=="sandbox"||!process.env.SQUARE_SANDBOX_WEBHOOK_SIGNATURE_KEY||!process.env.SQUARE_SANDBOX_WEBHOOK_URL)return respond(res,503,{error:"Sandbox webhook unavailable"});
 let bytes;try{bytes=await rawBytes(req)}catch{return respond(res,413,{error:"Invalid webhook size"})}
 const signature=req.headers["x-square-hmacsha256-signature"];
 if(!verifySquareSandboxSignature(bytes,signature))return respond(res,401,{error:"Invalid webhook signature"});
 let event;try{event=JSON.parse(bytes.toString("utf8"))}catch{return respond(res,400,{error:"Invalid webhook JSON"})}
 const eventId=event?.event_id,eventType=event?.type,payment=event?.data?.object?.payment;
 if(typeof eventId!=="string"||eventId.length<8||eventId.length>200||typeof eventType!=="string"||eventType.length<3||eventType.length>120||typeof payment?.id!=="string"||!payment.id)return respond(res,400,{error:"Invalid payment event"});
 try{
  // Provider payment ID must already be attached to a trusted server-created attempt.
  const q=new URLSearchParams({provider_payment_id:"eq."+payment.id,select:"id,company_id,status",limit:"1"});
  const attempts=await database("/rest/v1/nexus_square_sandbox_payment_attempts?"+q);
  if(!Array.isArray(attempts)||attempts.length!==1)return respond(res,202,{accepted:false,reconciliation_required:true});
  const attempt=attempts[0];
  const record={provider_event_id:eventId,company_id:attempt.company_id,payment_attempt_id:attempt.id,event_type:eventType,raw_body_sha256:createHash("sha256").update(bytes).digest("hex"),status:"received"};
  try{await database("/rest/v1/nexus_square_sandbox_webhook_events",{method:"POST",body:record,prefer:"return=minimal"})}
  catch{
   const dup=await database("/rest/v1/nexus_square_sandbox_webhook_events?"+new URLSearchParams({provider_event_id:"eq."+eventId,select:"id,raw_body_sha256",limit:"1"}));
   if(Array.isArray(dup)&&dup.length===1&&dup[0].raw_body_sha256===record.raw_body_sha256)return respond(res,200,{accepted:true,duplicate:true,reconciliation_required:true});
   return respond(res,503,{error:"Webhook persistence unavailable"});
  }
  return respond(res,202,{accepted:true,reconciliation_required:true});
 }catch{return respond(res,503,{error:"Webhook processing unavailable"})}
}
