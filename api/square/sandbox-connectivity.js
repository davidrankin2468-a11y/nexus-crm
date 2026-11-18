// Restricted read-only Sandbox connection check. Does not charge, refund, or change data.
// Available only to a signed-in owner/admin with current CRM company membership.
import {actor,respond,allow} from "../../lib/nexus-pos-server.js";
import {checkSquareSandboxLocation} from "../../lib/nexus-square-connectivity.js";

export default async function handler(req,res){
 if(!allow(req,res,["GET"]))return;
 const a=await actor(req,res);
 if(!a)return;
 const result=await checkSquareSandboxLocation();
 return respond(res,result.connected?200:503,{
  environment:"sandbox",connected:result.connected,reason:result.reason,
  paymentProcessing:false,refundProcessing:false,subscriptionBilling:false
 });
}
