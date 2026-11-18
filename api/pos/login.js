// Invite-only pilot login: exchanges credentials with Supabase Auth. No signup endpoint.
import {configured,respond,allow,checkWrite,passwordSignIn} from "../../lib/nexus-pos-server.js";
export default async function handler(req,res){
 if(!allow(req,res,["POST"]))return;
 if(!configured())return respond(res,503,{error:"POS backend configuration incomplete"});
 if(!checkWrite(req,res))return;
 const body=req.body;
 if(!body||typeof body!=="object"||Array.isArray(body))return respond(res,400,{error:"Invalid login request"});
 const email=typeof body.email==="string"?body.email.trim().toLowerCase():"";
 const password=body.password;
 if(email.length>254||!/^\S+@\S+\.\S+$/.test(email)||typeof password!=="string"||password.length<8||password.length>1024)
  return respond(res,400,{error:"Email and password required"});
 try{
  const auth=await passwordSignIn(email,password);
  // Browser keeps the access token in memory only; no refresh-token or password is stored.
  return respond(res,200,auth);
 }catch{return respond(res,401,{error:"Sign-in failed. Verify your credentials and account approval."})}
}
