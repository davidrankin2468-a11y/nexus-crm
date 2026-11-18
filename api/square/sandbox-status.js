// A non-sensitive readiness probe. Never triggers a charge or webhook acknowledgement.
import {squareSandboxConfigured} from "../../lib/nexus-square-sandbox.js";
export default function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 res.setHeader("Content-Type","application/json; charset=utf-8");
 if(req.method!=="GET"){res.setHeader("Allow","GET");return res.status(405).json({error:"Method not allowed"})}
 return res.status(200).json({
  environment:"sandbox",configured:squareSandboxConfigured(),
  paymentProcessing:false,subscriptionBilling:false,refundProcessing:false,
  nextStep:squareSandboxConfigured()?"Sandbox provider connection tests required":"Connect sandbox credentials privately before provider integration tests"
 });
}
