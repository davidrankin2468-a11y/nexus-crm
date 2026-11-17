// Nexus CRM cloud alpha API. Deployed with Cloudflare Pages Functions; no secrets in source.
const ITERS=100000, WEEK=604800, STATUSES=["Planned","Scheduled","In Progress","On Hold","Completed","Cancelled"];
const H={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
const response=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{...H,...extra}});
const error=(message,status=400)=>response({error:message},status);
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
const unhex=s=>new Uint8Array((s.match(/.{2}/g)||[]).map(v=>parseInt(v,16)));
const secret=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const hash=async str=>hex(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(str))));
const same=(a,b)=>{if(a.length!==b.length)return false;let t=0;for(let i=0;i<a.length;i++)t|=a.charCodeAt(i)^b.charCodeAt(i);return t===0};
const passwordHash=async (password,salt,iterations=ITERS)=>{
 const material=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);
 return hex(new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2",salt:unhex(salt),hash:"SHA-256",iterations},material,256)));
};
const clean=(s,max=200)=>String(s??"").trim().slice(0,max);
const emailOk=x=>x.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);
const now=()=>Math.floor(Date.now()/1000);
const first=(db,sql,...v)=>db.prepare(sql).bind(...v).first();
const all=async(db,sql,...v)=>(await db.prepare(sql).bind(...v).all()).results||[];
const setCookie=(token,clear=false)=>"__Host-nexuscrm="+(clear?"":token)+"; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age="+(clear?"0":WEEK);
const fromCookie=req=>{const m=(req.headers.get("Cookie")||"").match(/(?:^|;\s*)__Host-nexuscrm=([a-f0-9]{64})(?:;|$)/);return m?.[1]||""};
async function readJson(req) {
 if(!(req.headers.get("Content-Type")||"").toLowerCase().includes("application/json"))throw new Error("JSON body required");
 if(Number(req.headers.get("Content-Length")||0)>32768)throw new Error("Request too large");
 const body=await req.text();if(body.length>32768)throw new Error("Request too large");
 let v;try{v=JSON.parse(body)}catch{throw new Error("Invalid JSON")}
 if(!v||Array.isArray(v)||typeof v!=="object")throw new Error("JSON object required");
 return v;
}
async function current(req,db){
 const token=fromCookie(req);if(!token)return null;
 return first(db,"SELECT s.token_hash,s.csrf_token,u.id AS user_id,u.tenant_id,u.role,u.email,t.name AS company FROM sessions s JOIN users u ON u.id=s.user_id JOIN tenants t ON t.id=u.tenant_id WHERE s.token_hash=? AND s.expires_at>?",await hash(token),now());
}
async function issue(db,userId){
 const token=secret(),csrf=secret();
 await db.prepare("INSERT INTO sessions(token_hash,user_id,csrf_token,created_at,expires_at) VALUES(?,?,?,?,?)").bind(await hash(token),userId,csrf,now(),now()+WEEK).run();
 return {token,csrf};
}
async function throttled(db,key){
 const item=await first(db,"SELECT failures,window_started FROM login_attempts WHERE rate_key=?",key);
 return !!item&&item.window_started>now()-900&&item.failures>=8;
}
async function badLogin(db,key){
 const t=now(),cutoff=t-900;
 await db.prepare("INSERT INTO login_attempts(rate_key,failures,window_started) VALUES(?,1,?) ON CONFLICT(rate_key) DO UPDATE SET failures=CASE WHEN login_attempts.window_started<? THEN 1 ELSE login_attempts.failures+1 END,window_started=CASE WHEN login_attempts.window_started<? THEN ? ELSE login_attempts.window_started END").bind(key,t,cutoff,cutoff,t).run();
}
function checkCustomer(v){
 const obj={name:clean(v.name,150),email:clean(v.email,200),phone:clean(v.phone,80),notes:clean(v.notes,1000)};
 if(!obj.name)throw new Error("Customer name is required");
 if(obj.email&&!emailOk(obj.email))throw new Error("Invalid customer email");
 return obj;
}
function checkJob(v){
 const amount=Number(v.amount);
 const x={title:clean(v.title,180),customerId:clean(v.customerId,100),status:clean(v.status||"Planned",30),scheduledDate:clean(v.scheduledDate,10)};
 if(!x.title||!x.customerId)throw new Error("Job requires customer and title");
 if(!STATUSES.includes(x.status))throw new Error("Invalid job status");
 if(!Number.isFinite(amount)||amount<0||amount>1e9)throw new Error("Invalid job amount");
 if(x.scheduledDate&&!/^\d{4}-\d{2}-\d{2}$/.test(x.scheduledDate))throw new Error("Invalid date");
 x.amountCents=Math.round(amount*100);return x;
}
async function handler(request,env){
 const db=env.DB,method=request.method.toUpperCase(),path=new URL(request.url).pathname.replace(/\/+$/,"");
 if(!db)return error("Cloud database not configured",503);
 if(!path.startsWith("/api/"))return error("Not found",404);
 if(!["GET","POST","PATCH"].includes(method))return error("Method not allowed",405);
 if(method!=="GET"&&request.headers.get("Origin")!==new URL(request.url).origin)return error("Origin not allowed",403);
 if(path==="/api/health"&&method==="GET")return response({ok:!!(await first(db,"SELECT 1 AS ok"))?.ok,version:"2.5-alpha"});
 if(path==="/api/status"&&method==="GET"){
  const r=await first(db,"SELECT COUNT(*) AS count FROM users");return response({configured:!!r?.count,version:"2.5-alpha"});
 }
 if(path==="/api/diagnose"&&method==="GET"){
  const users=await first(db,"SELECT COUNT(*) AS n FROM users");
  if(users?.n)return error("Not available",404);
  const salt=hex(crypto.getRandomValues(new Uint8Array(16))),started=Date.now();
  try{
    const result=await passwordHash("test-only-probe-password",salt);
    return response({ok:result.length===64,elapsedMs:Date.now()-started});
  }catch(e){return response({ok:false,errorName:String(e?.name),errorMessage:String(e?.message).slice(0,200)})}
 }
 if(path==="/api/setup"&&method==="POST"){
  const v=await readJson(request),code=clean(v.setupCode,150),companyName=clean(v.companyName,150),email=clean(v.email,254).toLowerCase(),password=String(v.password||"");
  if(!companyName||!code||!emailOk(email)||password.length<12||password.length>128)return error("Company, email, setup code and a password of at least 12 characters are required");
  const users=await first(db,"SELECT COUNT(*) AS count FROM users");
  if(users?.count)return error("Setup has already been completed",409);
  const tokenHash=await hash(code);
  const token=await first(db,"SELECT token_hash FROM bootstrap_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>?",tokenHash,now());
  if(!token)return error("Invalid or expired setup code",403);
  const salt=hex(crypto.getRandomValues(new Uint8Array(16))),ph=await passwordHash(password,salt),tenantId=crypto.randomUUID(),userId=crypto.randomUUID(),t=now();
  await db.batch([
   db.prepare("INSERT INTO tenants(id,name,created_at) VALUES(?,?,?)").bind(tenantId,companyName,t),
   db.prepare("INSERT INTO users(id,tenant_id,email,password_hash,salt,iterations,role,created_at) VALUES(?,?,?,?,? ,?,'owner',?)").bind(userId,tenantId,email,ph,salt,ITERS,t),
   db.prepare("UPDATE bootstrap_tokens SET used_at=? WHERE token_hash=? AND used_at IS NULL").bind(t,tokenHash)
  ]);
  const s=await issue(db,userId);
  return response({ok:true,csrf:s.csrf},201,{"Set-Cookie":setCookie(s.token)});
 }
 if(path==="/api/login"&&method==="POST"){
  const v=await readJson(request),email=clean(v.email,254).toLowerCase(),password=String(v.password||"");
  if(!emailOk(email)||password.length>128)return error("Invalid email or password",401);
  const rateKey=await hash(email+"|"+(request.headers.get("CF-Connecting-IP")||"unknown"));
  if(await throttled(db,rateKey))return error("Too many attempts. Try again in 15 minutes",429);
  const u=await first(db,"SELECT id,password_hash,salt,iterations FROM users WHERE email=?",email);
  const candidate=await passwordHash(password,u?.salt||"4aaf994521f56bead3aa815d0a3379cc",u?.iterations||ITERS);
  if(!u||!same(candidate,u.password_hash)){await badLogin(db,rateKey);return error("Invalid email or password",401)}
  await db.prepare("DELETE FROM login_attempts WHERE rate_key=?").bind(rateKey).run();
  const s=await issue(db,u.id);
  return response({ok:true,csrf:s.csrf},200,{"Set-Cookie":setCookie(s.token)});
 }
 const user=await current(request,db);
 if(!user)return error("Please sign in",401);
 if(path==="/api/me"&&method==="GET")return response({user:{email:user.email,role:user.role,company:user.company},csrf:user.csrf_token});
 if(method!=="GET"&&!same(request.headers.get("X-Nexus-CSRF")||"",user.csrf_token))return error("Session verification required",403);
 if(path==="/api/logout"&&method==="POST"){
  await db.prepare("DELETE FROM sessions WHERE token_hash=?").bind(user.token_hash).run();
  return response({ok:true},200,{"Set-Cookie":setCookie("",true)});
 }
 if(path==="/api/dashboard"&&method==="GET"){
  const c=await first(db,"SELECT COUNT(*) AS count FROM customers WHERE tenant_id=?",user.tenant_id);
  const j=await first(db,"SELECT COUNT(*) AS count FROM jobs WHERE tenant_id=? AND status NOT IN ('Cancelled','Completed')",user.tenant_id);
  const v=await first(db,"SELECT COALESCE(SUM(amount_cents),0) AS amount FROM jobs WHERE tenant_id=?",user.tenant_id);
  return response({customers:c?.count||0,openJobs:j?.count||0,jobPipeline:(v?.amount||0)/100});
 }
 if(path==="/api/customers"&&method==="GET"){
  return response({items:await all(db,"SELECT id,name,email,phone,notes,created_at AS createdAt FROM customers WHERE tenant_id=? ORDER BY created_at DESC LIMIT 500",user.tenant_id)});
 }
 if(path==="/api/customers"&&method==="POST"){
  const x=checkCustomer(await readJson(request)),id=crypto.randomUUID(),t=now();
  await db.prepare("INSERT INTO customers(id,tenant_id,name,email,phone,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").bind(id,user.tenant_id,x.name,x.email,x.phone,x.notes,t,t).run();
  return response({id,ok:true},201);
 }
 if(path.startsWith("/api/customers/")&&method==="PATCH"){
  const id=decodeURIComponent(path.slice(15)),old=await first(db,"SELECT * FROM customers WHERE id=? AND tenant_id=?",id,user.tenant_id);
  if(!old)return error("Customer not found",404);
  const x=checkCustomer({...old,...await readJson(request)});
  await db.prepare("UPDATE customers SET name=?,email=?,phone=?,notes=?,updated_at=? WHERE id=? AND tenant_id=?").bind(x.name,x.email,x.phone,x.notes,now(),id,user.tenant_id).run();
  return response({ok:true});
 }
 if(path==="/api/jobs"&&method==="GET"){
  return response({items:await all(db,"SELECT j.id,j.title,j.status,j.amount_cents/100.0 AS amount,j.scheduled_date AS scheduledDate,j.customer_id AS customerId,c.name AS customerName FROM jobs j JOIN customers c ON c.id=j.customer_id AND c.tenant_id=j.tenant_id WHERE j.tenant_id=? ORDER BY j.created_at DESC LIMIT 500",user.tenant_id)});
 }
 if(path==="/api/jobs"&&method==="POST"){
  const x=checkJob(await readJson(request)),c=await first(db,"SELECT id FROM customers WHERE id=? AND tenant_id=?",x.customerId,user.tenant_id);
  if(!c)return error("Customer must belong to your company");
  const id=crypto.randomUUID(),t=now();
  await db.prepare("INSERT INTO jobs(id,tenant_id,customer_id,title,status,amount_cents,scheduled_date,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(id,user.tenant_id,x.customerId,x.title,x.status,x.amountCents,x.scheduledDate,t,t).run();
  return response({ok:true,id},201);
 }
 if(path.startsWith("/api/jobs/")&&method==="PATCH"){
  const id=decodeURIComponent(path.slice(10)),old=await first(db,"SELECT id,title,status,customer_id AS customerId,amount_cents/100.0 AS amount,scheduled_date AS scheduledDate FROM jobs WHERE id=? AND tenant_id=?",id,user.tenant_id);
  if(!old)return error("Job not found",404);
  const x=checkJob({...old,...await readJson(request)}),c=await first(db,"SELECT id FROM customers WHERE id=? AND tenant_id=?",x.customerId,user.tenant_id);
  if(!c)return error("Customer must belong to your company");
  await db.prepare("UPDATE jobs SET title=?,status=?,customer_id=?,amount_cents=?,scheduled_date=?,updated_at=? WHERE id=? AND tenant_id=?").bind(x.title,x.status,x.customerId,x.amountCents,x.scheduledDate,now(),id,user.tenant_id).run();
  return response({ok:true});
 }
 return error("Not found",404);
}
export async function onRequest({request,env}){
 try{return await handler(request,env)}
 catch(e){
  if(/^(JSON body required|Request too large|Invalid JSON|JSON object required|Customer name is required|Invalid customer email|Job requires|Invalid job status|Invalid job amount|Invalid date)/.test(e?.message||""))return error(e.message);
  console.error("Nexus CRM error:",String(e?.message||e).slice(0,240));
  return error("Service error; please try again",500);
 }
}
