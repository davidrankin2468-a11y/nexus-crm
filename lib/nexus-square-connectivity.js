// Read-only Square Sandbox verification. Never sends a payment or exposes credentials.
// This module deliberately uses a fixed Sandbox host; it must never accept a host from a user.
import {SQUARE_SANDBOX_API_ORIGIN} from "./nexus-square-sandbox.js";

const apiVersion="2026-09-16";
export function squareSandboxReadOnlyConfigured(env=process.env){
 return env.SQUARE_ENVIRONMENT==="sandbox"
  &&typeof env.SQUARE_SANDBOX_ACCESS_TOKEN==="string"
  &&env.SQUARE_SANDBOX_ACCESS_TOKEN.length>10
  &&typeof env.SQUARE_SANDBOX_LOCATION_ID==="string"
  &&/^[A-Za-z0-9_-]{4,100}$/.test(env.SQUARE_SANDBOX_LOCATION_ID);
}

export async function checkSquareSandboxLocation({env=process.env,fetchImpl=fetch}={}){
 if(!squareSandboxReadOnlyConfigured(env))
  return {connected:false,reason:"CONFIGURATION_REQUIRED"};
 let response;
 try{
  response=await fetchImpl(SQUARE_SANDBOX_API_ORIGIN+"/v2/locations",{
   method:"GET",redirect:"error",
   headers:{
    "Accept":"application/json",
    "Square-Version":apiVersion,
    "Authorization":"Bearer "+env.SQUARE_SANDBOX_ACCESS_TOKEN
   },
   signal:AbortSignal.timeout(10000)
  });
 }catch{
  return {connected:false,reason:"SQUARE_UNAVAILABLE"};
 }
 if(!response?.ok){
  return {connected:false,reason:response?.status===401||response?.status===403
   ?"SQUARE_AUTH_DENIED":"SQUARE_UNAVAILABLE"};
 }
 let data;
 try{data=await response.json()}catch{
  return {connected:false,reason:"BAD_SQUARE_RESPONSE"};
 }
 if(!Array.isArray(data?.locations))
  return {connected:false,reason:"BAD_SQUARE_RESPONSE"};
 const found=data.locations.some(x=>x&&x.id===env.SQUARE_SANDBOX_LOCATION_ID
  &&x.status==="ACTIVE");
 return found?{connected:true,reason:"SANDBOX_LOCATION_VERIFIED"}
   :{connected:false,reason:"SQUARE_LOCATION_NOT_FOUND"};
}
