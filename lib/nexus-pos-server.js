// Vercel POS backend foundation. Requires Supabase Auth Bearer JWT and server-side credentials.
// Never send the service-role key to browsers, logs, HTML, or GitHub.
const supaUrl=()=>String(process.env.SUPABASE_URL||"").replace(/\/$/,"");
const publicKey=()=>process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY||"";
const serviceKey=()=>process.env.SUPABASE_SERVICE_ROLE_KEY||"";
export function configured(){return Boolean(supaUrl()&&publicKey()&&serviceKey())}
export function respond(res,status,body){
 res.setHeader("Content-Type","application/json; charset=utf-8");
 res.setHeader("Cache-Control","no-store");
 res.setHeader("X-Content-Type-Options","nosniff");
 return res.status(status).json(body);
}
export function allow(req,res,methods){
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
export async function authenticatedUser(req,res){
 if(!configured()){respond(res,503,{error:"POS backend configuration incomplete"});return null}
 const user=await currentUser(req);
 if(!user){respond(res,401,{error:"Sign in with Supabase Auth required"});return null}
 return user;
}
export async function passwordSignIn(email,password){
 if(!configured())throw Error("POS backend configuration incomplete");
 const auth=await supa("/auth/v1/token?grant_type=password",{method:"POST",body:{email,password}});
 if(!auth?.access_token||typeof auth.expires_in!=="number")throw Error("Unexpected authentication response");
 return {access_token:auth.access_token,expires_in:auth.expires_in,token_type:"bearer"};
}
export async function actor(req,res){
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
export async function database(path,options){return supa(path,{...options,privileged:true})}
export function validProduct(x){return x&&typeof x.sku==="string"&&/^[-A-Za-z0-9_]{1,60}$/.test(x.sku)&&typeof x.name==="string"&&x.name.trim().length>0&&x.name.trim().length<=200&&Number.isSafeInteger(x.price_cents)&&x.price_cents>=0&&x.price_cents<=100000000&&Number.isSafeInteger(x.stock_quantity)&&x.stock_quantity>=0&&x.stock_quantity<=1000000}
export function sameOrigin(req){const origin=req.headers.origin;const host=req.headers.host;return !origin||(()=>{try{return new URL(origin).host===host&&new URL(origin).protocol==="https:"}catch{return false}})()}
export function checkWrite(req,res){if(!sameOrigin(req)){respond(res,403,{error:"Origin denied"});return false}if(!String(req.headers["content-type"]||"").includes("application/json")){respond(res,415,{error:"JSON required"});return false}return true}
export function validSale(x){return x&&Array.isArray(x.items)&&x.items.length>=1&&x.items.length<=50&&x.items.every(i=>i&&typeof i.product_id==="string"&&/^[0-9a-f-]{36}$/i.test(i.product_id)&&Number.isSafeInteger(i.quantity)&&i.quantity>=1&&i.quantity<=1000)&&new Set(x.items.map(i=>i.product_id.toLowerCase())).size===x.items.length&&typeof x.idempotency_key==="string"&&/^[a-zA-Z0-9_-]{8,100}$/.test(x.idempotency_key)&&x.tax_cents===0}
