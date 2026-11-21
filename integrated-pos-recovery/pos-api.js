import {verifySandboxRefund} from "./square-sandbox-refund-verification.js";
import {current as crmSession} from "./crm-api.js";
import {handleSquareSandboxAttempt} from "./square-d1-reconciliation.js";
// Nexus POS development API: separate Pages route; never handles card details.
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
const now=()=>Math.floor(Date.now()/1000);
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,"0")).join("");
async function userFor(request,db){return crmSession(request,db)}
async function bodyOf(request){if(!(request.headers.get("Content-Type")||"").includes("application/json"))throw Error("JSON required");const t=await request.text();if(t.length>16384)throw Error("Body too large");return JSON.parse(t)}
export async function onRequest({request,env}){
 try{
  if(!env.DB)return json({error:"Database unavailable"},503);
  const method=request.method,path=new URL(request.url).pathname,db=env.DB;
  if(!["GET","POST"].includes(method))return json({error:"Method not allowed"},405);
  const user=await userFor(request,db);if(!user)return json({error:"Sign in required"},401);
  if(user.role!=="owner"&&user.role!=="admin")return json({error:"POS permission denied"},403);
  if(method==="POST"){
   if(request.headers.get("Origin")!==new URL(request.url).origin)return json({error:"Origin denied"},403);
   if(request.headers.get("X-Nexus-CSRF")!==user.csrf_token)return json({error:"CSRF token required"},403);
  }
  const tenant=user.tenant_id;
  if(path==="/api/pos/square/sandbox-connectivity"&&method==="GET"){
   if(env.SQUARE_ENVIRONMENT!=="sandbox"||!env.SQUARE_SANDBOX_ACCESS_TOKEN||!env.SQUARE_SANDBOX_LOCATION_ID||!env.SQUARE_SANDBOX_MERCHANT_ID)return json({connected:false,reason:"SANDBOX_NOT_CONFIGURED",paymentProcessing:false},503);
   try{
    const response=await fetch("https://connect.squareupsandbox.com/v2/locations",{method:"GET",redirect:"manual",signal:AbortSignal.timeout(12000),headers:{Authorization:"Bearer "+env.SQUARE_SANDBOX_ACCESS_TOKEN,"Square-Version":"2026-09-16",Accept:"application/json"}});
    if(response.status>=300&&response.status<400)return json({connected:false,reason:"SQUARE_REDIRECT_BLOCKED",providerStatus:response.status,paymentProcessing:false},502);
    if(!response.ok)return json({connected:false,reason:"SQUARE_PROVIDER_REJECTED",providerStatus:response.status,paymentProcessing:false},502);
    const data=await response.json().catch(()=>null);
    const location=Array.isArray(data?.locations)?data.locations.find(x=>x?.id===env.SQUARE_SANDBOX_LOCATION_ID):null;
    if(!location)return json({connected:false,reason:"SANDBOX_LOCATION_NOT_FOUND",paymentProcessing:false},409);
    if(location.merchant_id&&location.merchant_id!==env.SQUARE_SANDBOX_ --- TRUNCATED --- 19,501 chars