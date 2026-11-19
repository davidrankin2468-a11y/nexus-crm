// Cloudflare Pages Functions adapter for the existing Nexus POS pilot.
// Mirrors the Vercel authorization, validation and idempotency rules.
export async function onRequest(context){
 const env=context.env;
 // Vercel POS backend foundation. Requires Supabase Auth Bearer JWT and server-side credentials.
// Never send the service-role key to browsers, logs, HTML, or GitHub.
const supaUrl=()=>String(env.SUPABASE_URL||"").replace(/\/$/,"");
const publicKey=()=>env.SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY||"";
const serviceKey=()=>env.SUPABASE_SERVICE_ROLE_KEY||"";
function configured(){return Boolean(supaUrl()&&publicKey()&&serviceKey())}
function respond(res,status,body){
 res.setHeader("Content-Type","application/json; charset=utf-8");
 res.setHeader("Cache-Control","no-store");
 res.setHeader("X-Content-Type-Options","nosniff");
 return res.status(status).json(body);
}
function allow(req,res,methods){
 res.setHeader("Allow",methods.join(", "));
 if(!methods.includes(req.method)) {respond(res,405,{error:"Method not allowed"});return false}
 return true;
}
async function supa(path,{method="GET",body=null,token=null,privileged=false,prefer=null}={}){
 const key=privileged?serviceKey():publicKey();
 const h={"apikey":key,"Accept":"application/json"};
 // sb_publishable_ and sb_secret_ keys are not JWTs: send them on apikey only.
 // Preserve Bearer support for legacy JWT-based anon/service_role keys.
 if(token)h.Authorization="Bearer "+token;
 else if(!key.startsWith("sb_publishable_")&&!key.startsWith("sb_secret_"))h.Authorization="Bearer "+key;
 if(body!==null)h["Content-Type"]="application/json";
 if(prefer)h["Prefer"]=prefer;
 const out=await fetch(supaUrl()+path,{method,headers:h,body:body===null?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
 const value=await out.json().catch(()=>null);
 if(!out.ok){const e=new Error("Database request failed");e.status=out.status;throw e}
 return value;
}
async function currentUser(req){
 const authorization=req.headers.authorization||"";
 // Only Supabase Auth user tokens; explicitly reject service-role keys from clients.
 const m=/^Bearer ([a-zA-Z0-9._-]{30,4096})$/.exec(authorization);
 if(!m||m[1]===serviceKey()||m[1]===publicKey())return null;
 try{
  const user=await supa("/auth/v1/user",{token:m[1]});
  return /^[0-9a-f-]{36}$/i.test(user?.id||"") && user?.is_anonymous!==true?user:null;
 }catch{return null}
}
async function authenticatedUser(req,res){
 if(!configured()){respond(res,503,{error:"POS backend configuration incomplete"});return null}
 const user=await currentUser(req);
 if(!user){respond(res,401,{error:"Sign in with Supabase Auth required"});return null}
 return user;
}
async function passwordSignIn(email,password){
 if(!configured())throw Error("POS backend configuration incomplete");
 const auth=await supa("/auth/v1/token?grant_type=password",{method:"POST",body:{email,password}});
 if(!auth?.access_token||typeof auth.expires_in!=="number")throw Error("Unexpected authentication response");
 return {access_token:auth.access_token,expires_in:auth.expires_in,token_type:"bearer"};
}
async function actor(req,res){
 const user=await authenticatedUser(req,res);
 if(!user)return null;
 const companyId=String(req.headers["x-nexus-company-id"]||"");
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(companyId)){
  respond(res,400,{error:"Company selection required"});return null
 }
 const qs=new URLSearchParams({company_id:"eq."+companyId,user_id:"eq."+user.id,select:"role",limit:"1"});
 try{
  const memberships=await supa("/rest/v1/nexus_company_members?"+qs.toString(),{privileged:true});
  if(!Array.isArray(memberships)||!["owner","admin"].includes(memberships[0]?.role)){
   respond(res,403,{error:"Company POS access denied"});return null
  }
 }catch{respond(res,503,{error:"Unable to validate company access"});return null}
 return {companyId,userId:user.id};
}
async function database(path,options){return supa(path,{...options,privileged:true})}
function validProduct(x){return x&&typeof x.sku==="string"&&/^[-A-Za-z0-9_]{1,60}$/.test(x.sku)&&typeof x.name==="string"&&x.name.trim().length>0&&x.name.trim().length<=200&&Number.isSafeInteger(x.price_cents)&&x.price_cents>=0&&x.price_cents<=100000000&&Number.isSafeInteger(x.stock_quantity)&&x.stock_quantity>=0&&x.stock_quantity<=1000000}
function sameOrigin(req){const origin=req.headers.origin;const host=req.headers.host;return !origin||(()=>{try{return new URL(origin).host===host&&new URL(origin).protocol==="https:"}catch{return false}})()}
function checkWrite(req,res){if(!sameOrigin(req)){respond(res,403,{error:"Origin denied"});return false}if(!String(req.headers["content-type"]||"").includes("application/json")){respond(res,415,{error:"JSON required"});return false}return true}
function validSale(x){return x&&Array.isArray(x.items)&&x.items.length>=1&&x.items.length<=50&&x.items.every(i=>i&&typeof i.product_id==="string"&&/^[0-9a-f-]{36}$/i.test(i.product_id)&&Number.isSafeInteger(i.quantity)&&i.quantity>=1&&i.quantity<=1000)&&new Set(x.items.map(i=>i.product_id.toLowerCase())).size===x.items.length&&typeof x.idempotency_key==="string"&&/^[a-zA-Z0-9_-]{8,100}$/.test(x.idempotency_key)&&x.tax_cents===0}

 // Consolidated POS API entry point. Existing handlers retain their original authorization and validation.
import {actor,allow,authenticatedUser,checkWrite,configured,database,passwordSignIn,respond,validProduct,validSale} from "../../lib/nexus-pos-server.js";

// Preserved handler: companies
// List only companies for the verified Supabase Auth user, never arbitrary user IDs.
async function handle_companies(req,res){
 if(!allow(req,res,["GET"]))return;
 const user=await authenticatedUser(req,res);if(!user)return;
 try{
  const query=new URLSearchParams({user_id:"eq."+user.id,select:"company_id,role",limit:"100"});
  const memberships=await database("/rest/v1/nexus_company_members?"+query.toString());
  const allowed=(Array.isArray(memberships)?memberships:[])
    .filter(x=>/^[0-9a-f-]{36}$/i.test(x.company_id)&&["owner","admin"].includes(x.role));
  const ids=[...new Set(allowed.map(x=>x.company_id))];
  if(!ids.length)return respond(res,200,{items:[]});
  const companies=await database("/rest/v1/nexus_companies?"+new URLSearchParams({id:"in.("+ids.join(",")+")",select:"id,name",limit:"100"}));
  const membershipsById=new Map(allowed.map(x=>[x.company_id,x.role]));
  const items=(Array.isArray(companies)?companies:[])
    .filter(x=>membershipsById.has(x.id))
    .map(x=>({id:x.id,name:x.name,role:membershipsById.get(x.id)}))
    .sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  return respond(res,200,{items});
 }catch(err){console.error("POS company lookup failed",{status:Number.isInteger(err?.status)?err.status:null,kind:err?.name==="TimeoutError"?"timeout":"upstream"});return respond(res,503,{error:"Company list currently unavailable"})}
}


// Preserved handler: login
// Invite-only pilot login: exchanges credentials with Supabase Auth. No signup endpoint.
async function handle_login(req,res){
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


// Preserved handler: products
async function handle_products(req,res){
 if(!allow(req,res,["GET","POST"]))return;
 try{
  const a=await actor(req,res);if(!a)return;
  if(req.method==="GET"){
   const q=new URLSearchParams({company_id:"eq."+a.companyId,select:"id,sku,name,price_cents,stock_quantity,active",order:"name.asc",limit:"500"});
   const items=await database("/rest/v1/nexus_pos_products?"+q.toString());
   return respond(res,200,{items});
  }
  if(!checkWrite(req,res))return;
  if(!validProduct(req.body))return respond(res,400,{error:"Invalid product"});
  const p=req.body;
  const id=await database("/rest/v1/rpc/nexus_create_pos_product",{
   method:"POST",
   body:{p_company_id:a.companyId,p_actor_id:a.userId,p_sku:p.sku,p_name:p.name.trim(),p_price_cents:p.price_cents,p_stock_quantity:p.stock_quantity}
  });
  if(typeof id!=="string")throw Error("Missing product reference");
  return respond(res,201,{id});
 }catch{return respond(res,503,{error:"Product service unavailable or request rejected"})}
}


// Preserved handler: receipts
// Read-only, company-scoped unpaid POS receipt. No payment-card or personal data.
async function handle_receipts(req,res){
 if(!allow(req,res,["GET"]))return;
 const a=await actor(req,res);if(!a)return;
 const saleId=String(req.query?.sale_id||"");
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saleId))
  return respond(res,400,{error:"Valid receipt reference required"});
 try{
  const filters=new URLSearchParams({company_id:"eq."+a.companyId,id:"eq."+saleId,
   select:"id,status,subtotal_cents,tax_cents,total_cents,created_at",limit:"1"});
  const sales=await database("/rest/v1/nexus_pos_sales?"+filters.toString());
  if(!Array.isArray(sales)||!sales.length)return respond(res,404,{error:"Receipt not found"});
  const itemFilters=new URLSearchParams({company_id:"eq."+a.companyId,sale_id:"eq."+saleId,
   select:"id,product_name,quantity,unit_price_cents,line_total_cents",limit:"100"});
  const items=await database("/rest/v1/nexus_pos_sale_items?"+itemFilters.toString());
  return respond(res,200,{sale:sales[0],items:Array.isArray(items)?items:[],payment_verified:false});
 }catch{return respond(res,503,{error:"Receipt service temporarily unavailable"})}
}


// Preserved handler: sales
async function handle_sales(req,res){
 if(!allow(req,res,["GET","POST"]))return;
 try{
  const a=await actor(req,res);if(!a)return;
  if(req.method==="GET"){
   const q=new URLSearchParams({company_id:"eq."+a.companyId,select:"id,status,subtotal_cents,tax_cents,total_cents,created_at",order:"created_at.desc",limit:"100"});
   const items=await database("/rest/v1/nexus_pos_sales?"+q.toString());
   return respond(res,200,{items});
  }
  if(!checkWrite(req,res))return;
  if(!validSale(req.body))return respond(res,400,{error:"Invalid sale or nonzero tax. No payment was charged."});
  const {items,idempotency_key}=req.body;
  const saleId=await database("/rest/v1/rpc/nexus_record_pos_sale",{method:"POST",body:{p_company_id:a.companyId,p_actor_id:a.userId,p_items:items,p_idempotency_key:idempotency_key}});
  return respond(res,201,{id:saleId,status:"pending",recorded_only:true,payment_charged:false});
 }catch{return respond(res,503,{error:"Sale rejected or service unavailable. Reuse the original idempotency key before retrying."})}
}


// Preserved handler: status
function handle_status(req,res){
 if(!allow(req,res,["GET"]))return;
 return respond(res,configured()?200:503,{status:configured()?"configured":"configuration_required",mode:"development",paymentProcessing:false});
}


const handlers={"companies":handle_companies,"login":handle_login,"products":handle_products,"receipts":handle_receipts,"sales":handle_sales,"status":handle_status};
async function handler(req,res){
 const segments=Array.isArray(req.query?.route)?req.query.route:[req.query?.route].filter(Boolean);
 const route=segments.length===1?String(segments[0]):new URL(req.url||"/", "https://localhost").pathname.split("/").filter(Boolean).slice(2).join("/");
 const selected=handlers[route];
 if(!selected)return respond(res,404,{error:"Unknown POS route"});
 return selected(req,res);
}

 const request=context.request;
 const url=new URL(request.url);
 let body=null;
 if(!['GET','HEAD'].includes(request.method)){
   try{body=await request.json()}catch{body=null}
 }
 const req={method:request.method,url:url.pathname+url.search,headers:Object.fromEntries(request.headers),body,query:{route:url.pathname.split('/').filter(Boolean).slice(2)}};
 let status=200;const headers=new Headers();
 const res={setHeader:(k,v)=>{headers.set(k,v);return res},status:(n)=>{status=n;return res},json:(data)=>new Response(JSON.stringify(data),{status,headers})};
 try{return await handler(req,res)}catch(err){console.error('POS request failure',{kind:err?.name||'Error'});return new Response(JSON.stringify({error:'POS service unavailable'}),{status:503,headers:{'content-type':'application/json','cache-control':'no-store'}})}
}
