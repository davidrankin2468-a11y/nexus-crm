// Cloudflare Workers Square Sandbox connectivity adapter.
// Read-only: never creates payments, refunds, receipts, or changes a sale.
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
export async function squareSandboxConnectivity({request,env,fetchImpl=fetch}){
 if(request.method!=="GET")return json({error:"Method not allowed"},405);
 if(env.SQUARE_ENVIRONMENT!=="sandbox"||!env.SQUARE_SANDBOX_ACCESS_TOKEN||!env.SQUARE_SANDBOX_LOCATION_ID||!env.SQUARE_SANDBOX_MERCHANT_ID)
  return json({connected:false,reason:"SANDBOX_NOT_CONFIGURED",paymentProcessing:false},503);
 try{
  const response=await fetchImpl("https://connect.squareupsandbox.com/v2/locations",{
   method:"GET",redirect:"manual",signal:AbortSignal.timeout(12000),
   headers:{"Authorization":"Bearer "+env.SQUARE_SANDBOX_ACCESS_TOKEN,"Square-Version":"2026-09-16","Accept":"application/json"}
  });
  if(response.status>=300&&response.status<400)return json({connected:false,reason:"SQUARE_REDIRECT_BLOCKED",providerStatus:response.status,paymentProcessing:false},502);
  if(!response.ok)return json({connected:false,reason:"SQUARE_PROVIDER_REJECTED",providerStatus:response.status,paymentProcessing:false},502);
  const payload=await response.json().catch(()=>null);
  const location=Array.isArray(payload?.locations)&&payload.locations.find(x=>x?.id===env.SQUARE_SANDBOX_LOCATION_ID);
  if(!location)return json({connected:false,reason:"SANDBOX_LOCATION_NOT_FOUND",paymentProcessing:false},409);
  if(location.merchant_id&&location.merchant_id!==env.SQUARE_SANDBOX_MERCHANT_ID)
   return json({connected:false,reason:"SANDBOX_MERCHANT_MISMATCH",paymentProcessing:false},409);
  return json({connected:true,environment:"sandbox",locationVerified:true,merchantVerified:Boolean(location.merchant_id),paymentProcessing:false});
 }catch{return json({connected:false,reason:"SQUARE_PROVIDER_UNAVAILABLE",paymentProcessing:false},503)}
}
