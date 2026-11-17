// Nexus CRM cloud alpha API. Deployed with Cloudflare Pages Functions; no secrets in source.
const ITERS=100000, WEEK=604800, STATUSES=["Planned","Scheduled","In Progress","On Hold","Completed","Cancelled"];
const H={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","X-Frame-Options":"DENY","Strict-Transport-Security":"max-age=31536000","Cross-Origin-Resource-Policy":"same-origin","Permissions-Policy":"camera=(), microphone=(), geolocation=(), payment=()","Content-Security-Policy":"default-src 'none'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'"};
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
 return first(db,"SELECT s.token_hash,s.csrf_token,u.id AS user_id,u.tenant_id,u.role,u.email,t.name AS company FROM sessions s JOIN users u ON u.id=s.user_id JOIN tenants t ON t.id=u.tenant_id WHERE s.token_hash=? AND s.expires_at>? AND u.disabled_at IS NULL",await hash(token),now());
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
function checkEmployee(o){
 const x={name:clean(o.name,150),jobTitle:clean(o.jobTitle,120),email:clean(o.email,200),phone:clean(o.phone,80),status:clean(o.status||"Active",15)};
 if(!x.name)throw new Error("Employee name is required");
 if(x.email&&!emailOk(x.email))throw new Error("Invalid employee email");
 if(!["Active","Inactive"].includes(x.status))throw new Error("Invalid employee status");
 return x;
}
function checkAppointment(o){
 const x={jobId:clean(o.jobId,100),employeeId:clean(o.employeeId,100),appointmentDate:clean(o.appointmentDate,10),appointmentTime:clean(o.appointmentTime,5),location:clean(o.location,250),notes:clean(o.notes,1000)};
 if(!x.jobId)throw new Error("Choose a job");
 if(!/^\d{4}-\d{2}-\d{2}$/.test(x.appointmentDate))throw new Error("Enter a valid appointment date");
 const d=new Date(x.appointmentDate+"T12:00:00Z");
 if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==x.appointmentDate)throw new Error("Enter a valid appointment date");
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(x.appointmentTime))throw new Error("Enter a valid appointment time");
 return x;
}
// Finance values are amounts in integer cents; payments are manual bookkeeping entries only.
const financeRoles=["owner","admin"];
const estimateStatuses=["Draft","Sent","Accepted","Declined"];
const paymentMethods=["Cash","Check","Bank transfer","Card (external)","Other"];
function moneyCents(v,positive=false){
 const number=Number(v);
 if(v===""||v===null||v===undefined||!Number.isFinite(number)||number<0||number>1000000000||Math.abs(number*100-Math.round(number*100))>0.00001||positive&&number<=0)
  throw new Error("Amount must be a positive number with at most two decimals"+(positive?"":" (zero allowed)"));
 return Math.round(number*100);
}
function dateOnly(v,description="Date"){
 const s=clean(v,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s))throw new Error(description+" must be YYYY-MM-DD");
 const d=new Date(s+"T12:00:00Z");
 if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==s)throw new Error("Invalid "+description.toLowerCase());
 return s;
}
function documentNumber(prefix,id){return prefix+"-"+id.replace(/-/g,"").slice(0,12).toUpperCase()}
function checkEstimate(v){
 const x={customerId:clean(v.customerId,100),description:clean(v.description,700),status:clean(v.status||"Draft",12)};
 if(!x.customerId||!x.description)throw new Error("Estimate requires a customer and description");
 if(!estimateStatuses.includes(x.status))throw new Error("Invalid estimate status");
 x.amountCents=moneyCents(v.amount);
 return x;
}
function checkInvoice(v){
 const x={customerId:clean(v.customerId,100),description:clean(v.description,700),dueDate:dateOnly(v.dueDate,"Due date")};
 if(!x.customerId||!x.description)throw new Error("Invoice requires a customer and description");
 x.amountCents=moneyCents(v.amount,true);
 return x;
}

// Recovery snapshots contain business records only. They do not include credentials, sessions, or authentication keys.
// In-app snapshots share the current D1 database and are NOT independent/offsite disaster backups.
const SNAPSHOT_DEFS=[
 {table:"customers",cols:["id","name","email","phone","notes","created_at","updated_at"]},
 {table:"employees",cols:["id","name","job_title","email","phone","status","created_at","updated_at"]},
 {table:"jobs",cols:["id","customer_id","title","status","amount_cents","scheduled_date","created_at","updated_at"]},
 {table:"estimates",cols:["id","customer_id","estimate_number","description","amount_cents","status","created_at","updated_at"]},
 {table:"invoices",cols:["id","customer_id","estimate_id","invoice_number","description","amount_cents","due_date","created_at"]},
 {table:"appointments",cols:["id","job_id","employee_id","appointment_date","appointment_time","location","notes","created_at","updated_at"]},
 {table:"payments",cols:["id","invoice_id","amount_cents","paid_date","method","note","created_at"]}
];
const MAX_SNAPSHOTS=30,MAX_SNAPSHOT_BYTES=1800000,MAX_SNAPSHOT_ROWS=2500,MAX_RECOVERY_ROWS=250;
async function buildSnapshot(db,tenantId){
 const statements=SNAPSHOT_DEFS.map(def=>
  db.prepare("SELECT "+def.cols.join(",")+" FROM "+def.table+" WHERE tenant_id=? ORDER BY id LIMIT 2501").bind(tenantId));
 const queries=await db.batch(statements),records={},counts={};
 for(let i=0;i<SNAPSHOT_DEFS.length;i++){
  const def=SNAPSHOT_DEFS[i],rows=queries[i]?.results||[];
  if(rows.length>MAX_SNAPSHOT_ROWS)throw new Error("Backup exceeds the current record count limit");
  records[def.table]=rows;counts[def.table]=rows.length;
 }
 const snapshot={schemaVersion:1,records};
 const payload=JSON.stringify(snapshot);
 if(payload.length>MAX_SNAPSHOT_BYTES)throw new Error("Backup exceeds the current size limit");
 return {payload,counts,digest:await hash(payload)};
}
async function storeSnapshot(db,user,note){
 const n=await first(db,"SELECT COUNT(*) AS n FROM backup_snapshots WHERE tenant_id=?",user.tenant_id);
 if(n?.n>=MAX_SNAPSHOTS)throw new Error("Backup limit reached; contact support before adding more snapshots");
 const content=await buildSnapshot(db,user.tenant_id);
 const id=crypto.randomUUID(),time=now();
 await db.prepare("INSERT INTO backup_snapshots(id,tenant_id,created_by,created_at,schema_version,note,counts_json,payload_json,sha256) VALUES(?,?,?,?,1,?,?,?,?)")
 .bind(id,user.tenant_id,user.user_id,time,clean(note,100),JSON.stringify(content.counts),content.payload,content.digest).run();
 return {id,createdAt:time,counts:content.counts};
}
async function findSnapshot(db,user,id){
 const row=await first(db,"SELECT id,tenant_id,created_at,note,counts_json,payload_json,sha256,schema_version FROM backup_snapshots WHERE id=? AND tenant_id=?",id,user.tenant_id);
 if(!row)return null;
 if(row.schema_version!==1||!same(await hash(row.payload_json),row.sha256))throw new Error("Snapshot integrity check failed");
 const parsed=JSON.parse(row.payload_json);
 if(parsed.schemaVersion!==1||!parsed.records||typeof parsed.records!=="object")throw new Error("Snapshot format not supported");
 let total=0;
 for(const def of SNAPSHOT_DEFS){
  const items=parsed.records[def.table];
  if(!Array.isArray(items)||items.length>MAX_SNAPSHOT_ROWS)throw new Error("Snapshot has an invalid table");
  total+=items.length;
  for(const entry of items){
   if(!entry||typeof entry!=="object"||!entry.id)throw new Error("Snapshot contains an invalid record");
   for(const col of def.cols)if(!(col in entry))throw new Error("Snapshot has missing columns");
  }
 }
 return {row,records:parsed.records,total,counts:JSON.parse(row.counts_json)};
}
async function verifySensitivePassword(db,user,password){
 if(typeof password!=="string"||password.length>128||password.length<12)return false;
 const rateKey=await hash("security-action|"+user.user_id);
 if(await throttled(db,rateKey))throw new Error("Too many security attempts; try again later");
 const entry=await first(db,"SELECT password_hash,salt,iterations FROM users WHERE id=? AND tenant_id=?",user.user_id,user.tenant_id);
 const test=await passwordHash(password,entry?.salt||"4aaf994521f56bead3aa815d0a3379cc",entry?.iterations||ITERS);
 if(!entry||!same(test,entry.password_hash)){
  await badLogin(db,rateKey);return false;
 }
 await db.prepare("DELETE FROM login_attempts WHERE rate_key=?").bind(rateKey).run();
 return true;
}
async function logAudit(db,user,path,method){
 const category=path.startsWith("/api/backups")?"backup":path.startsWith("/api/security")?"security":
  path.split("/")[2]||"system";
 const safeAction=clean(method+" "+path.replace(/\/[0-9a-fA-F-]{36}(?=\/|$)/g,"/:id"),120);
 try{await db.prepare("INSERT INTO security_audit(id,tenant_id,user_id,category,action,resource_id,created_at) VALUES(?,?,?,?,?,?,?)")
  .bind(crypto.randomUUID(),user.tenant_id,user.user_id,category,safeAction,"",now()).run()}
 catch(e){console.error("Audit write failed",String(e?.message||e).slice(0,140))}
}
async function companyRecordCounts(db,tenantId){
 const reads=await db.batch(SNAPSHOT_DEFS.map(d=>db.prepare("SELECT COUNT(*) AS n FROM "+d.table+" WHERE tenant_id=?").bind(tenantId)));
 return Object.fromEntries(SNAPSHOT_DEFS.map((d,i)=>[d.table,reads[i]?.results?.[0]?.n||0]));
}


// Invite-only multi-company onboarding. A bearer invitation is delivered by the platform
// operator; only its SHA-256 digest exists in D1. No public self-service signup.
const INVITE_LIFETIME=3*24*60*60;
const INVITE_LIMIT=25;
const inviteTokenOk=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
const accountPasswordOk=x=>typeof x==="string"&&x.length>=14&&x.length<=128;
async function platformOperator(db,user){
 if(user.role!=="owner")return false;
 return !!(await first(db,"SELECT user_id FROM platform_operators WHERE user_id=?",user.user_id));
}
async function inviteRateLimit(db,request,invalid=false){
 const key=await hash("company-invite|"+(request.headers.get("CF-Connecting-IP")||"unknown"));
 if(await throttled(db,key))return false;
 if(invalid)await badLogin(db,key);
 return true;
}

// RFC 6238: authenticator seeds are encrypted at rest under Cloudflare Pages secret.
const b32Alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32(bytes){
 let value=0,bits=0,out="";
 for(const b of bytes){value=(value<<8)|b;bits+=8;while(bits>=5){bits-=5;out+=b32Alphabet[(value>>>bits)&31]}}
 if(bits)out+=b32Alphabet[(value<<(5-bits))&31];
 return out;
}
async function mfaEncryptionKey(env){
 if(typeof env.MFA_MASTER_KEY!=="string"||!/^[0-9a-f]{64}$/i.test(env.MFA_MASTER_KEY))
  throw new Error("MFA encryption secret not configured");
 return crypto.subtle.importKey("raw",unhex(env.MFA_MASTER_KEY),"AES-GCM",false,["encrypt","decrypt"]);
}
async function sealMfa(env,userId,bytes){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const ciphertext=await crypto.subtle.encrypt({name:"AES-GCM",iv,
  additionalData:new TextEncoder().encode(userId)},await mfaEncryptionKey(env),bytes);
 return {secretCipherHex:hex(new Uint8Array(ciphertext)),secretIvHex:hex(iv)};
}
async function openMfa(env,userId,row){
 return new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",iv:unhex(row.secret_iv_hex),
  additionalData:new TextEncoder().encode(userId)},
  await mfaEncryptionKey(env),unhex(row.secret_cipher_hex)));
}
async function otpForStep(secretBytes,step){
 const counter=new Uint8Array(8);new DataView(counter.buffer).setBigUint64(0,BigInt(step));
 const key=await crypto.subtle.importKey("raw",secretBytes,{name:"HMAC",hash:"SHA-1"},false,["sign"]);
 const d=new Uint8Array(await crypto.subtle.sign("HMAC",key,counter));
 const offset=d[d.length-1]&15;
 const n=(((d[offset]&127)<<24)|((d[offset+1]&255)<<16)|((d[offset+2]&255)<<8)|d[offset+3])>>>0;
 return String(n%1000000).padStart(6,"0");
}
async function verifyOtp(secretBytes,code,lastUsedStep=-1){
 if(typeof code!=="string"||!/^\d{6}$/.test(code))return null;
 const t=Math.floor(now()/30);
 for(const delta of [-1,0,1]){
  const candidate=t+delta;
  if(candidate>=0&&candidate>lastUsedStep&&same(await otpForStep(secretBytes,candidate),code))return candidate;
 }
 return null;
}
const MFA_CHALLENGE_SECONDS=300;

function permitted(role,method,path){
 const ownSecurity=(path==="/api/security/change-password"&&method==="POST")||
  (path==="/api/security/recovery-codes"&&method==="POST")||
  (path==="/api/security/recovery-count"&&method==="GET")||
  (path==="/api/security/mfa/status"&&method==="GET")||
  (["/api/security/mfa/start","/api/security/mfa/confirm","/api/security/mfa/disable"].includes(path)&&method==="POST");
 if(role==="owner")return true;
 if(ownSecurity)return role==="admin"||role==="employee";
 if(role==="admin")return /^\/api\/(dashboard|customers|jobs|employees|appointments|estimates|invoices|payments|reports)(\/|$)/.test(path);
 if(role==="employee")return method==="GET"&&/^\/api\/(dashboard|customers|jobs|employees|appointments)(\/|$)/.test(path);
 return false;
}

async function handler(request,env){
 const db=env.DB,method=request.method.toUpperCase(),path=new URL(request.url).pathname.replace(/\/+$/,"");
 if(!db)return error("Cloud database not configured",503);
 if(!path.startsWith("/api/"))return error("Not found",404);
 if(!["GET","POST","PATCH"].includes(method))return error("Method not allowed",405);
 if(method!=="GET"&&request.headers.get("Origin")!==new URL(request.url).origin)return error("Origin not allowed",403);
 if(path==="/api/health"&&method==="GET")return response({ok:!!(await first(db,"SELECT 1 AS ok"))?.ok,version:"3.4-alpha",authenticatorAvailable:!!env.MFA_MASTER_KEY});
 if(path==="/api/status"&&method==="GET"){
  const r=await first(db,"SELECT COUNT(*) AS count FROM users");return response({configured:!!r?.count,version:"3.4-alpha"});
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
  const u=await first(db,"SELECT id,password_hash,salt,iterations,disabled_at FROM users WHERE email=?",email);
  const candidate=await passwordHash(password,u?.salt||"4aaf994521f56bead3aa815d0a3379cc",u?.iterations||ITERS);
  if(!u||u.disabled_at!==null||!same(candidate,u.password_hash)){await badLogin(db,rateKey);return error("Invalid email or password",401)}
  await db.prepare("DELETE FROM login_attempts WHERE rate_key=?").bind(rateKey).run();
  const mfa=await first(db,"SELECT user_id FROM user_mfa WHERE user_id=? AND enabled_at IS NOT NULL",u.id);
  if(mfa){
   if(!env.MFA_MASTER_KEY)return error("Authenticator temporarily unavailable",503);
   const challenge=secret(),t=now();
   await db.batch([
    db.prepare("DELETE FROM mfa_login_challenges WHERE user_id=?").bind(u.id),
    db.prepare("INSERT INTO mfa_login_challenges(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)")
     .bind(await hash(challenge),u.id,t,t+MFA_CHALLENGE_SECONDS)
   ]);
   return response({ok:true,mfaRequired:true,challenge,expiresIn:MFA_CHALLENGE_SECONDS});
  }
  const session=await issue(db,u.id);
  return response({ok:true,csrf:session.csrf},200,{"Set-Cookie":setCookie(session.token)});
 }
 if(path==="/api/login/mfa"&&method==="POST"){
  const v=await readJson(request);
  const challenge=clean(v.challenge,100).toLowerCase(),code=typeof v.code==="string"?v.code.trim():"";
  if(!inviteTokenOk(challenge)||!/^\d{6}$/.test(code))return error("Invalid authenticator verification",403);
  const tokenHash=await hash(challenge),t=now();
  const row=await first(db,`SELECT c.user_id,m.secret_cipher_hex,m.secret_iv_hex,m.last_used_step,u.disabled_at
   FROM mfa_login_challenges c JOIN user_mfa m ON m.user_id=c.user_id
   JOIN users u ON u.id=c.user_id
   WHERE c.token_hash=? AND c.expires_at>? AND m.enabled_at IS NOT NULL`,tokenHash,t);
  if(!row||row.disabled_at!==null)return error("Authenticator challenge expired or invalid",403);
  const rateKey=await hash("mfa-login|"+row.user_id+"|"+(request.headers.get("CF-Connecting-IP")||"unknown"));
  if(await throttled(db,rateKey))return error("Too many authenticator attempts. Try again later.",429);
  const step=await verifyOtp(await openMfa(env,row.user_id,row),code,row.last_used_step);
  if(step===null){await badLogin(db,rateKey);return error("Incorrect or already-used authenticator code",403)}
  const results=await db.batch([
   db.prepare("UPDATE user_mfa SET last_used_step=? WHERE user_id=? AND enabled_at IS NOT NULL AND last_used_step<?")
    .bind(step,row.user_id,step),
   db.prepare("DELETE FROM mfa_login_challenges WHERE token_hash=? AND user_id=? AND expires_at>?")
    .bind(tokenHash,row.user_id,t)
  ]);
  if(results[0]?.meta?.changes!==1||results[1]?.meta?.changes!==1)return error("Authenticator code already used",403);
  await db.prepare("DELETE FROM login_attempts WHERE rate_key=?").bind(rateKey).run();
  const session=await issue(db,row.user_id);
  return response({ok:true,csrf:session.csrf},200,{"Set-Cookie":setCookie(session.token)});
 }
 if(path==="/api/invitations/preview"&&method==="POST"){
  const v=await readJson(request),token=clean(v.token,128).toLowerCase();
  if(!await inviteRateLimit(db,request))return error("Too many attempts; try later",429);
  if(!inviteTokenOk(token)){
   await inviteRateLimit(db,request,true);return error("Invalid or expired invitation",403);
  }
  const invite=await first(db,"SELECT company_name AS companyName,owner_email AS email,expires_at AS expiresAt FROM company_invitations WHERE token_hash=? AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at>?",await hash(token),now());
  if(!invite){await inviteRateLimit(db,request,true);return error("Invalid or expired invitation",403)}
  return response({ok:true,companyName:invite.companyName,email:invite.email,expiresAt:invite.expiresAt});
 }
 if(path==="/api/invitations/accept"&&method==="POST"){
  const v=await readJson(request),token=clean(v.token,128).toLowerCase(),password=typeof v.password==="string"?v.password:"";
  if(!await inviteRateLimit(db,request))return error("Too many attempts; try later",429);
  if(!inviteTokenOk(token)){
   await inviteRateLimit(db,request,true);return error("Invalid or expired invitation",403);
  }
  if(!accountPasswordOk(password))return error("Choose a password of 14–128 characters",400);
  const tokenHash=await hash(token),t=now();
  const invite=await first(db,"SELECT id,company_name,owner_email FROM company_invitations WHERE token_hash=? AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at>?",tokenHash,t);
  if(!invite){
   await inviteRateLimit(db,request,true);return error("Invalid or expired invitation",403);
  }
  const taken=await first(db,"SELECT id FROM users WHERE email=?",invite.owner_email);
  if(taken)return error("This email is already assigned to an account. Contact the Nexus operator.",409);
  const newUserId=crypto.randomUUID(),salt=hex(crypto.getRandomValues(new Uint8Array(16)));
  const ph=await passwordHash(password,salt,ITERS);
  // The same invite UUID is the new tenant's UUID; the unique tenant PK prevents
  // two concurrent redemptions creating duplicate companies. D1 batch is atomic.
  const rs=await db.batch([
   db.prepare("INSERT INTO tenants(id,name,created_at) SELECT id,company_name,? FROM company_invitations WHERE id=? AND token_hash=? AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at>?")
    .bind(t,invite.id,tokenHash,t),
   db.prepare("INSERT INTO users(id,tenant_id,email,password_hash,salt,iterations,role,created_at) SELECT ?,id,owner_email,?,?,?,'owner',? FROM company_invitations WHERE id=? AND token_hash=? AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at>?")
    .bind(newUserId,ph,salt,ITERS,t,invite.id,tokenHash,t),
   db.prepare("UPDATE company_invitations SET redeemed_at=?,redeemed_user_id=? WHERE id=? AND token_hash=? AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at>?")
    .bind(t,newUserId,invite.id,tokenHash,t)
  ]);
  if(rs.some(x=>x.meta?.changes!==1))throw new Error("Invitation redemption did not complete");
  const session=await issue(db,newUserId);
  await logAudit(db,{tenant_id:invite.id,user_id:newUserId},"/api/invitations/accept","POST");
  return response({ok:true,company:invite.company_name,email:invite.owner_email,csrf:session.csrf},201,{"Set-Cookie":setCookie(session.token)});
 }
 // Staff activation stays separate from tenant-owner creation; existing users are not changed.
 if(path==="/api/staff/invitations/preview"&&method==="POST"){
  const v=await readJson(request),token=clean(v.token,128).toLowerCase();
  if(!await inviteRateLimit(db,request))return error("Too many attempts; try later",429);
  if(!inviteTokenOk(token)){
   await inviteRateLimit(db,request,true);return error("Invalid or expired invitation",403);
  }
  const item=await first(db,`SELECT si.email,si.role,si.expires_at AS expiresAt,t.name AS companyName
    FROM staff_invitations si JOIN tenants t ON t.id=si.tenant_id
    WHERE si.token_hash=? AND si.redeemed_at IS NULL AND si.revoked_at IS NULL AND si.expires_at>?`,await hash(token),now());
  if(!item){await inviteRateLimit(db,request,true);return error("Invalid or expired invitation",403)}
  return response({ok:true,...item});
 }
 if(path==="/api/staff/invitations/accept"&&method==="POST"){
  const v=await readJson(request),token=clean(v.token,128).toLowerCase(),password=typeof v.password==="string"?v.password:"";
  if(!await inviteRateLimit(db,request))return error("Too many attempts; try later",429);
  if(!inviteTokenOk(token)){
   await inviteRateLimit(db,request,true);return error("Invalid or expired invitation",403);
  }
  if(!accountPasswordOk(password))return error("Choose a password of 14–128 characters",400);
  const tokenHash=await hash(token),t=now();
  const invite=await first(db,`SELECT id,tenant_id,email,role FROM staff_invitations
   WHERE token_hash=? AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at>?`,tokenHash,t);
  if(!invite){await inviteRateLimit(db,request,true);return error("Invalid or expired invitation",403)}
  if(await first(db,"SELECT id FROM users WHERE email=?",invite.email))return error("Account already exists for this email",409);
  const uid=crypto.randomUUID(),salt=hex(crypto.getRandomValues(new Uint8Array(16))),ph=await passwordHash(password,salt,ITERS);
  const operations=await db.batch([
   db.prepare(`INSERT INTO users(id,tenant_id,email,password_hash,salt,iterations,role,created_at)
     SELECT ?,tenant_id,email,?,?,?,role,? FROM staff_invitations
     WHERE id=? AND token_hash=? AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at>?`)
    .bind(uid,ph,salt,ITERS,t,invite.id,tokenHash,t),
   db.prepare(`UPDATE staff_invitations SET redeemed_at=?,redeemed_user_id=?
     WHERE id=? AND token_hash=? AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at>?`)
    .bind(t,uid,invite.id,tokenHash,t)
  ]);
  if(operations.some(x=>x.meta?.changes!==1))throw Error("Staff invitation was not redeemed");
  const session=await issue(db,uid);
  await logAudit(db,{tenant_id:invite.tenant_id,user_id:uid},"/api/staff/invitations/accept","POST");
  return response({ok:true,role:invite.role,csrf:session.csrf},201,{"Set-Cookie":setCookie(session.token)});
 }
 if(path==="/api/recover"&&method==="POST"){
  // High-entropy single-use recovery codes are generated only after sign-in
  // and password re-verification; never send a code through the public API.
  const v=await readJson(request),email=clean(v.email,254).toLowerCase(),
    code=clean(v.code,80).toLowerCase(),password=typeof v.newPassword==="string"?v.newPassword:"";
  const key=await hash("recovery|"+email+"|"+(request.headers.get("CF-Connecting-IP")||"unknown"));
  if(await throttled(db,key))return error("Too many attempts; try again later",429);
  if(!emailOk(email)||!/^[a-f0-9]{32}$/.test(code)||!accountPasswordOk(password)){
   await badLogin(db,key);return error("Invalid recovery details",400);
  }
  const account=await first(db,"SELECT id,tenant_id FROM users WHERE email=?",email);
  const codeHash=await hash((account?.id||"unknown")+":"+code);
  const existing=account?await first(db,"SELECT code_hash FROM account_recovery_codes WHERE user_id=? AND code_hash=? AND used_at IS NULL",account.id,codeHash):null;
  if(!existing){await badLogin(db,key);return error("Invalid or already-used recovery code",403)}
  const salt=hex(crypto.getRandomValues(new Uint8Array(16))),ph=await passwordHash(password,salt,ITERS),t=now();
  const out=await db.batch([
   db.prepare("UPDATE users SET password_hash=?,salt=?,iterations=? WHERE id=? AND EXISTS(SELECT 1 FROM account_recovery_codes WHERE user_id=? AND code_hash=? AND used_at IS NULL)")
    .bind(ph,salt,ITERS,account.id,account.id,codeHash),
   db.prepare("UPDATE account_recovery_codes SET used_at=? WHERE user_id=? AND code_hash=? AND used_at IS NULL")
    .bind(t,account.id,codeHash),
   db.prepare("DELETE FROM sessions WHERE user_id=?").bind(account.id),
   db.prepare("DELETE FROM user_mfa WHERE user_id=?").bind(account.id),
   db.prepare("DELETE FROM mfa_login_challenges WHERE user_id=?").bind(account.id)
  ]);
  if(out[0]?.meta?.changes!==1||out[1]?.meta?.changes!==1)throw Error("Recovery was not completed");
  await db.prepare("DELETE FROM login_attempts WHERE rate_key=?").bind(key).run();
  await logAudit(db,{tenant_id:account.tenant_id,user_id:account.id},"/api/recover","POST");
  return response({ok:true,message:"Password updated. Sign in with your new password."});
 }
 const user=await current(request,db);
 if(!user)return error("Please sign in",401);
 if(path==="/api/me"&&method==="GET"){
  const platform=await first(db,"SELECT user_id FROM platform_operators WHERE user_id=?",user.user_id);
  return response({user:{email:user.email,role:user.role,company:user.company,isPlatformOperator:!!platform},csrf:user.csrf_token});
 }
 if(method!=="GET"&&!same(request.headers.get("X-Nexus-CSRF")||"",user.csrf_token))return error("Session verification required",403);
 if(path==="/api/logout"&&method==="POST"){
  await db.prepare("DELETE FROM sessions WHERE token_hash=?").bind(user.token_hash).run();
  return response({ok:true},200,{"Set-Cookie":setCookie("",true)});
 }
 if(!permitted(user.role,method,path))return error("Your account role does not allow this action",403);
 if(path==="/api/dashboard"&&method==="GET"){
  const c=await first(db,"SELECT COUNT(*) AS count FROM customers WHERE tenant_id=?",user.tenant_id);
  const j=await first(db,"SELECT COUNT(*) AS count FROM jobs WHERE tenant_id=? AND status NOT IN ('Cancelled','Completed')",user.tenant_id);
  const v=await first(db,"SELECT COALESCE(SUM(amount_cents),0) AS amount FROM jobs WHERE tenant_id=?",user.tenant_id);
  return response({customers:c?.count||0,openJobs:j?.count||0,jobPipeline:user.role==="employee"?0:(v?.amount||0)/100,financialHidden:user.role==="employee"});
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
 if(path==="/api/employees"&&method==="GET"){
  return response({items:await all(db,"SELECT id,name,job_title AS jobTitle,email,phone,status,created_at AS createdAt FROM employees WHERE tenant_id=? ORDER BY created_at DESC LIMIT 500",user.tenant_id)});
 }
 if(path==="/api/employees"&&method==="POST"){
  const x=checkEmployee(await readJson(request)),id=crypto.randomUUID(),t=now();
  await db.prepare("INSERT INTO employees(id,tenant_id,name,job_title,email,phone,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)")
    .bind(id,user.tenant_id,x.name,x.jobTitle,x.email,x.phone,x.status,t,t).run();
  return response({ok:true,id},201);
 }
 if(path.startsWith("/api/employees/")&&method==="PATCH"){
  const id=decodeURIComponent(path.slice("/api/employees/".length));
  const old=await first(db,"SELECT id,name,job_title AS jobTitle,email,phone,status FROM employees WHERE id=? AND tenant_id=?",id,user.tenant_id);
  if(!old)return error("Employee not found",404);
  const x=checkEmployee({...old,...await readJson(request)});
  await db.prepare("UPDATE employees SET name=?,job_title=?,email=?,phone=?,status=?,updated_at=? WHERE id=? AND tenant_id=?")
   .bind(x.name,x.jobTitle,x.email,x.phone,x.status,now(),id,user.tenant_id).run();
  return response({ok:true});
 }
 if(path==="/api/appointments"&&method==="GET"){
  return response({items:await all(db,`SELECT a.id,a.job_id AS jobId,a.employee_id AS employeeId,a.appointment_date AS appointmentDate,a.appointment_time AS appointmentTime,
  a.location,a.notes,j.title AS jobTitle,COALESCE(e.name,'Unassigned') AS employeeName
  FROM appointments a JOIN jobs j ON j.id=a.job_id AND j.tenant_id=a.tenant_id
  LEFT JOIN employees e ON e.id=a.employee_id AND e.tenant_id=a.tenant_id
  WHERE a.tenant_id=? ORDER BY a.appointment_date,a.appointment_time LIMIT 500`,user.tenant_id)});
 }
 if(path==="/api/appointments"&&method==="POST"){
  const x=checkAppointment(await readJson(request));
  const related=await first(db,"SELECT id FROM jobs WHERE id=? AND tenant_id=?",x.jobId,user.tenant_id);
  if(!related)return error("Job does not belong to your company",400);
  if(x.employeeId){
   const member=await first(db,"SELECT id FROM employees WHERE id=? AND tenant_id=?",x.employeeId,user.tenant_id);
   if(!member)return error("Employee does not belong to your company",400);
  }
  const id=crypto.randomUUID(),t=now();
  await db.prepare("INSERT INTO appointments(id,tenant_id,job_id,employee_id,appointment_date,appointment_time,location,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .bind(id,user.tenant_id,x.jobId,x.employeeId||null,x.appointmentDate,x.appointmentTime,x.location,x.notes,t,t).run();
  return response({ok:true,id},201);
 }
 if(path.startsWith("/api/appointments/")&&method==="PATCH"){
  const id=decodeURIComponent(path.slice("/api/appointments/".length));
  const old=await first(db,"SELECT id,job_id AS jobId,employee_id AS employeeId,appointment_date AS appointmentDate,appointment_time AS appointmentTime,location,notes FROM appointments WHERE id=? AND tenant_id=?",id,user.tenant_id);
  if(!old)return error("Appointment not found",404);
  const x=checkAppointment({...old,...await readJson(request)});
  const related=await first(db,"SELECT id FROM jobs WHERE id=? AND tenant_id=?",x.jobId,user.tenant_id);
  if(!related)return error("Job does not belong to your company",400);
  if(x.employeeId){
   const member=await first(db,"SELECT id FROM employees WHERE id=? AND tenant_id=?",x.employeeId,user.tenant_id);
   if(!member)return error("Employee does not belong to your company",400);
  }
  await db.prepare("UPDATE appointments SET job_id=?,employee_id=?,appointment_date=?,appointment_time=?,location=?,notes=?,updated_at=? WHERE id=? AND tenant_id=?")
    .bind(x.jobId,x.employeeId||null,x.appointmentDate,x.appointmentTime,x.location,x.notes,now(),id,user.tenant_id).run();
  return response({ok:true});
 }
 // Finance endpoints are deliberately owner/admin-only while employee login roles are still under development.
 if(path.startsWith("/api/estimates")||path.startsWith("/api/invoices")||path.startsWith("/api/payments")||path==="/api/reports"){
  if(!financeRoles.includes(user.role))return error("Only company administrators can access Finance",403);
 }
 if(path==="/api/estimates"&&method==="GET"){
  const items=await all(db,`SELECT e.id,e.estimate_number AS number,e.customer_id AS customerId,c.name AS customerName,
    e.description,e.amount_cents/100.0 AS amount,e.status,e.created_at AS createdAt,
    EXISTS(SELECT 1 FROM invoices i WHERE i.tenant_id=e.tenant_id AND i.estimate_id=e.id) AS invoiced
   FROM estimates e JOIN customers c ON c.id=e.customer_id AND c.tenant_id=e.tenant_id
   WHERE e.tenant_id=? ORDER BY e.created_at DESC,e.id DESC LIMIT 500`,user.tenant_id);
  return response({items});
 }
 if(path==="/api/estimates"&&method==="POST"){
  const x=checkEstimate(await readJson(request));
  if(!(await first(db,"SELECT id FROM customers WHERE id=? AND tenant_id=?",x.customerId,user.tenant_id)))return error("Choose a customer in your company");
  const id=crypto.randomUUID(),number=documentNumber("EST",id),t=now();
  await db.prepare("INSERT INTO estimates(id,tenant_id,customer_id,estimate_number,description,amount_cents,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)")
   .bind(id,user.tenant_id,x.customerId,number,x.description,x.amountCents,x.status,t,t).run();
  return response({ok:true,id,number},201);
 }
 if(path.startsWith("/api/estimates/")&&method==="PATCH"){
  const id=decodeURIComponent(path.slice("/api/estimates/".length));
  const old=await first(db,"SELECT id,customer_id AS customerId,description,amount_cents/100.0 AS amount,status FROM estimates WHERE id=? AND tenant_id=?",id,user.tenant_id);
  if(!old)return error("Estimate not found",404);
  const o=await readJson(request),x=checkEstimate({...old,...o});
  if(await first(db,"SELECT id FROM invoices WHERE estimate_id=? AND tenant_id=?",id,user.tenant_id))return error("This estimate has already been invoiced; it can no longer be edited",409);
  if(!(await first(db,"SELECT id FROM customers WHERE id=? AND tenant_id=?",x.customerId,user.tenant_id)))return error("Choose a customer in your company");
  await db.prepare("UPDATE estimates SET customer_id=?,description=?,amount_cents=?,status=?,updated_at=? WHERE id=? AND tenant_id=? AND NOT EXISTS(SELECT 1 FROM invoices i WHERE i.tenant_id=estimates.tenant_id AND i.estimate_id=estimates.id)")
   .bind(x.customerId,x.description,x.amountCents,x.status,now(),id,user.tenant_id).run();
  return response({ok:true});
 }
 if(path==="/api/invoices"&&method==="GET"){
  const items=await all(db,`SELECT i.id,i.invoice_number AS number,i.customer_id AS customerId,c.name AS customerName,i.estimate_id AS estimateId,
   i.description,i.amount_cents/100.0 AS amount,i.due_date AS dueDate,i.created_at AS createdAt,
   COALESCE(p.total,0)/100.0 AS paid,
   (i.amount_cents-COALESCE(p.total,0))/100.0 AS balance,
   CASE WHEN COALESCE(p.total,0)>=i.amount_cents THEN 'Paid'
        WHEN i.due_date<date('now') THEN 'Overdue'
        WHEN COALESCE(p.total,0)>0 THEN 'Partial'
        ELSE 'Unpaid' END AS status
   FROM invoices i JOIN customers c ON c.id=i.customer_id AND c.tenant_id=i.tenant_id
   LEFT JOIN (SELECT tenant_id,invoice_id,SUM(amount_cents) AS total FROM payments GROUP BY tenant_id,invoice_id) p
    ON p.tenant_id=i.tenant_id AND p.invoice_id=i.id
   WHERE i.tenant_id=? ORDER BY i.created_at DESC,i.id DESC LIMIT 500`,user.tenant_id);
  return response({items});
 }
 if(path==="/api/invoices"&&method==="POST"){
  const x=checkInvoice(await readJson(request));
  if(!(await first(db,"SELECT id FROM customers WHERE id=? AND tenant_id=?",x.customerId,user.tenant_id)))return error("Choose a customer in your company");
  const id=crypto.randomUUID(),number=documentNumber("INV",id);
  await db.prepare("INSERT INTO invoices(id,tenant_id,customer_id,estimate_id,invoice_number,description,amount_cents,due_date,created_at) VALUES(?,?,?,NULL,?,?,?,?,?)")
   .bind(id,user.tenant_id,x.customerId,number,x.description,x.amountCents,x.dueDate,now()).run();
  return response({ok:true,id,number},201);
 }
 if(path==="/api/invoices/from-estimate"&&method==="POST"){
  const v=await readJson(request),estimateId=clean(v.estimateId,100),dueDate=dateOnly(v.dueDate,"Due date");
  if(!estimateId)return error("Choose an estimate");
  const id=crypto.randomUUID(),number=documentNumber("INV",id);
  const result=await db.prepare(`INSERT INTO invoices(id,tenant_id,customer_id,estimate_id,invoice_number,description,amount_cents,due_date,created_at)
    SELECT ?,e.tenant_id,e.customer_id,e.id,?,e.description,e.amount_cents,?,?
    FROM estimates e WHERE e.id=? AND e.tenant_id=? AND e.status='Accepted' AND e.amount_cents>0
     AND NOT EXISTS(SELECT 1 FROM invoices i WHERE i.tenant_id=e.tenant_id AND i.estimate_id=e.id)`)
   .bind(id,number,dueDate,now(),estimateId,user.tenant_id).run();
  if(result.meta?.changes!==1)return error("Accept this estimate first, or check whether it was already invoiced",409);
  return response({ok:true,id,number},201);
 }
 if(path==="/api/payments"&&method==="GET"){
  const items=await all(db,`SELECT p.id,p.invoice_id AS invoiceId,i.invoice_number AS invoiceNumber,
    c.name AS customerName,p.amount_cents/100.0 AS amount,p.paid_date AS paidDate,
    p.method,p.note,p.created_at AS createdAt
   FROM payments p JOIN invoices i ON i.id=p.invoice_id AND i.tenant_id=p.tenant_id
   JOIN customers c ON c.id=i.customer_id AND c.tenant_id=p.tenant_id
   WHERE p.tenant_id=? ORDER BY p.paid_date DESC,p.created_at DESC,p.id DESC LIMIT 500`,user.tenant_id);
  return response({items});
 }
 if(path==="/api/payments"&&method==="POST"){
  const v=await readJson(request);
  const invoiceId=clean(v.invoiceId,100),amount=moneyCents(v.amount,true);
  const paidDate=dateOnly(v.paidDate,"Payment date"),methodName=clean(v.method,30),note=clean(v.note,350);
  if(!invoiceId)throw new Error("Choose an invoice");
  if(!paymentMethods.includes(methodName))throw new Error("Invalid payment method");
  const id=crypto.randomUUID();
  // A single conditional INSERT checks the balance and writes the payment atomically.
  const result=await db.prepare(`INSERT INTO payments(id,tenant_id,invoice_id,amount_cents,paid_date,method,note,created_at)
   SELECT ?,i.tenant_id,i.id,?,?,?,?,? FROM invoices i
   WHERE i.id=? AND i.tenant_id=? AND i.amount_cents >=
     (SELECT COALESCE(SUM(p.amount_cents),0) FROM payments p WHERE p.tenant_id=i.tenant_id AND p.invoice_id=i.id) + ?`)
   .bind(id,amount,paidDate,methodName,note,now(),invoiceId,user.tenant_id,amount).run();
  if(result.meta?.changes!==1)return error("Invoice not found, already paid, or payment exceeds balance",409);
  return response({ok:true,id},201);
 }
 if(path==="/api/reports"&&method==="GET"){
  const totals=await first(db,`SELECT
    (SELECT COUNT(*) FROM estimates e WHERE e.tenant_id=?) AS estimates,
    (SELECT COUNT(*) FROM invoices i WHERE i.tenant_id=?) AS invoices,
    (SELECT COALESCE(SUM(e.amount_cents),0) FROM estimates e WHERE e.tenant_id=? AND e.status='Accepted')/100.0 AS acceptedEstimateTotal,
    (SELECT COALESCE(SUM(i.amount_cents),0) FROM invoices i WHERE i.tenant_id=?)/100.0 AS invoiceTotal,
    (SELECT COALESCE(SUM(p.amount_cents),0) FROM payments p WHERE p.tenant_id=?)/100.0 AS paymentTotal,
    (SELECT COALESCE(SUM(i.amount_cents-(SELECT COALESCE(SUM(p.amount_cents),0) FROM payments p
      WHERE p.invoice_id=i.id AND p.tenant_id=i.tenant_id)),0)
     FROM invoices i WHERE i.tenant_id=? AND i.due_date<date('now'))/100.0 AS overdueBalance
    `,user.tenant_id,user.tenant_id,user.tenant_id,user.tenant_id,user.tenant_id,user.tenant_id);
  return response({totals:{...totals,outstanding:Math.round(((totals?.invoiceTotal||0)-(totals?.paymentTotal||0))*100)/100}});
 }
 // Business backups and tenant-wide security logs are owner-only. Each signed-in
 // account may still manage its own password and one-time recovery codes.
 if(path.startsWith("/api/backups")||path.startsWith("/api/security/")){
  const ownCredentials=(method==="POST"&&(
   path==="/api/security/change-password"||path==="/api/security/recovery-codes"||
   path==="/api/security/mfa/start"||path==="/api/security/mfa/confirm"||path==="/api/security/mfa/disable"))||
   (method==="GET"&&(path==="/api/security/recovery-count"||path==="/api/security/mfa/status"));
  if(user.role!=="owner"&&!ownCredentials)return error("Owner account required",403);
 }
 if(path==="/api/backups"&&method==="GET"){
  const list=await all(db,"SELECT id,created_at AS createdAt,note,counts_json AS countsJson FROM backup_snapshots WHERE tenant_id=? ORDER BY created_at DESC,id DESC LIMIT 30",user.tenant_id);
  return response({items:list.map(x=>({id:x.id,createdAt:x.createdAt,note:x.note,counts:JSON.parse(x.countsJson)})),limit:MAX_SNAPSHOTS,storage:"same-database",timeTravelAvailable:true});
 }
 if(path==="/api/backups"&&method==="POST"){
  const body=await readJson(request);
  const note=clean(body.note||"Manual safety snapshot",100);
  const created=await storeSnapshot(db,user,note);
  return response({ok:true,snapshot:created},201);
 }
 if(path.startsWith("/api/backups/")&&path.endsWith("/export")&&method==="POST"){
  // Export only after password re-verification. A separate client-side passphrase encrypts it.
  const id=decodeURIComponent(path.slice("/api/backups/".length,-"/export".length));
  const data=await readJson(request);
  if(!(await verifySensitivePassword(db,user,data.password)))return error("Incorrect account password",403);
  const record=await findSnapshot(db,user,id);
  if(!record)return error("Backup not found",404);
  if(record.row.payload_json.length>MAX_SNAPSHOT_BYTES)return error("Backup too large for export",413);
  return response({format:"nexus-crm-business-export-v1",company:user.company,
   sourceSnapshotId:record.row.id,createdAt:record.row.created_at,exportedAt:now(),
   counts:record.counts,schemaVersion:1,records:record.records});
 }
 if(path.startsWith("/api/backups/")&&path.endsWith("/preview")&&method==="GET"){
  const id=decodeURIComponent(path.slice("/api/backups/".length,-"/preview".length));
  const data=await findSnapshot(db,user,id);
  if(!data)return error("Backup not found",404);
  const currentCounts=await companyRecordCounts(db,user.tenant_id);
  return response({snapshot:{id:data.row.id,createdAt:data.row.created_at,note:data.row.note,counts:data.counts,total:data.total},
   integrityVerified:true,currentCounts,recoveryMode:"missing-records-only",
   warning:"Recovery adds missing records only. It does not overwrite edits or delete newer records."});
 }
 if(path.startsWith("/api/backups/")&&path.endsWith("/recover")&&method==="POST"){
  const id=decodeURIComponent(path.slice("/api/backups/".length,-"/recover".length));
  const body=await readJson(request);
  if(body.confirm!=="RECOVER MISSING RECORDS")return error("Confirmation phrase is required",400);
  if(!(await verifySensitivePassword(db,user,body.password)))return error("Incorrect account password",403);
  const data=await findSnapshot(db,user,id);
  if(!data)return error("Backup not found",404);
  if(data.total>MAX_RECOVERY_ROWS)return error("This snapshot exceeds the current safe recovery limit; use D1 Time Travel with support",409);
  // Create an additional pre-recovery checkpoint. Abort recovery if this fails.
  const checkpoint=await storeSnapshot(db,user,"Automatic checkpoint before missing-record recovery");
  const operations=[];
  for(const def of SNAPSHOT_DEFS){
   for(const row of data.records[def.table]){
    const columns=["tenant_id",...def.cols];
    const params=[user.tenant_id,...def.cols.map(key=>row[key])];
    operations.push(db.prepare("INSERT OR IGNORE INTO "+def.table+"("+columns.join(",")+") VALUES("+columns.map(()=>"?").join(",")+")").bind(...params));
   }
  }
  let restored=0;
  if(operations.length){
   const results=await db.batch(operations); // Transaction: no partial recovery on SQL error.
   restored=results.reduce((sum,r)=>sum+(r?.meta?.changes||0),0);
  }
  return response({ok:true,restored,skipped:data.total-restored,checkpointId:checkpoint.id,mode:"missing-records-only"});
 }
 if(path==="/api/security/summary"&&method==="GET"){
  const s=await first(db,"SELECT COUNT(*) AS count FROM sessions WHERE user_id=? AND expires_at>?",user.user_id,now());
  const b=await first(db,"SELECT COUNT(*) AS count,MAX(created_at) AS lastBackup FROM backup_snapshots WHERE tenant_id=?",user.tenant_id);
  return response({activeSessions:s?.count||0,backups:b?.count||0,lastBackupAt:b?.lastBackup||null,
   mfaEnabled:!!(await first(db,"SELECT enabled_at FROM user_mfa WHERE user_id=? AND enabled_at IS NOT NULL",user.user_id)),
   independentBackupEnabled:false,d1TimeTravelDays:30,verifiedDatabaseStorage:"production"});
 }
 if(path==="/api/security/activity"&&method==="GET"){
  const items=await all(db,"SELECT category,action,created_at AS createdAt FROM security_audit WHERE tenant_id=? ORDER BY created_at DESC,id DESC LIMIT 50",user.tenant_id);
  return response({items});
 }
 if(path==="/api/security/mfa/status"&&method==="GET"){
  const m=await first(db,"SELECT enabled_at AS enabledAt,pending_until AS pendingUntil FROM user_mfa WHERE user_id=?",user.user_id);
  return response({available:!!env.MFA_MASTER_KEY,enabled:!!m?.enabledAt,
   pending:!!m?.pendingUntil&&m.pendingUntil>now()});
 }
 if(path==="/api/security/mfa/start"&&method==="POST"){
  if(!env.MFA_MASTER_KEY)return error("Authenticator service not configured",503);
  const v=await readJson(request);
  if(!(await verifySensitivePassword(db,user,v.password)))return error("Incorrect account password",403);
  const enrolled=await first(db,"SELECT enabled_at AS enabledAt FROM user_mfa WHERE user_id=?",user.user_id);
  if(enrolled?.enabledAt)return error("Authenticator protection is already enabled",409);
  const plain=crypto.getRandomValues(new Uint8Array(20)),sealed=await sealMfa(env,user.user_id,plain),t=now();
  await db.prepare(`INSERT INTO user_mfa(user_id,secret_cipher_hex,secret_iv_hex,created_at,pending_until,enabled_at,last_used_step)
   VALUES(?,?,?,?,?,NULL,-1) ON CONFLICT(user_id) DO UPDATE SET
   secret_cipher_hex=excluded.secret_cipher_hex,secret_iv_hex=excluded.secret_iv_hex,
   created_at=excluded.created_at,pending_until=excluded.pending_until,enabled_at=NULL,last_used_step=-1`)
   .bind(user.user_id,sealed.secretCipherHex,sealed.secretIvHex,t,t+600).run();
  const encoded=base32(plain);
  const otpauthUrl="otpauth://totp/"+encodeURIComponent("Nexus CRM:"+user.email)+
   "?secret="+encoded+"&issuer="+encodeURIComponent("Nexus CRM")+"&algorithm=SHA1&digits=6&period=30";
  return response({ok:true,secret:encoded,otpauthUrl,expiresIn:600},201);
 }
 if(path==="/api/security/mfa/confirm"&&method==="POST"){
  if(!env.MFA_MASTER_KEY)return error("Authenticator service unavailable",503);
  const v=await readJson(request),code=typeof v.code==="string"?v.code.trim():"";
  const row=await first(db,`SELECT secret_cipher_hex,secret_iv_hex,last_used_step,pending_until
   FROM user_mfa WHERE user_id=? AND enabled_at IS NULL AND pending_until>?`,user.user_id,now());
  if(!row)return error("Authenticator setup expired. Start again.",409);
  const rateKey=await hash("mfa-confirm|"+user.user_id);
  if(await throttled(db,rateKey))return error("Too many verification attempts",429);
  const step=await verifyOtp(await openMfa(env,user.user_id,row),code,row.last_used_step);
  if(step===null){await badLogin(db,rateKey);return error("Invalid authenticator code",403)}
  const t=now();
  const results=await db.batch([
   db.prepare("UPDATE user_mfa SET enabled_at=?,pending_until=NULL,last_used_step=? WHERE user_id=? AND enabled_at IS NULL AND pending_until>?")
    .bind(t,step,user.user_id,t),
   db.prepare("DELETE FROM sessions WHERE user_id=? AND token_hash<>?").bind(user.user_id,user.token_hash),
   db.prepare("DELETE FROM mfa_login_challenges WHERE user_id=?").bind(user.user_id)
  ]);
  if(results[0]?.meta?.changes!==1)return error("Authenticator enrollment expired",409);
  await db.prepare("DELETE FROM login_attempts WHERE rate_key=?").bind(rateKey).run();
  return response({ok:true,enabled:true,otherSessionsRevoked:results[1]?.meta?.changes||0});
 }
 if(path==="/api/security/mfa/disable"&&method==="POST"){
  if(!env.MFA_MASTER_KEY)return error("Authenticator service unavailable",503);
  const v=await readJson(request),code=typeof v.code==="string"?v.code.trim():"";
  if(!(await verifySensitivePassword(db,user,v.password)))return error("Incorrect account password",403);
  const row=await first(db,`SELECT secret_cipher_hex,secret_iv_hex,last_used_step
   FROM user_mfa WHERE user_id=? AND enabled_at IS NOT NULL`,user.user_id);
  if(!row)return error("Authenticator protection is not enabled",409);
  const rateKey=await hash("mfa-disable|"+user.user_id);
  if(await throttled(db,rateKey))return error("Too many authenticator attempts",429);
  const step=await verifyOtp(await openMfa(env,user.user_id,row),code,row.last_used_step);
  if(step===null){await badLogin(db,rateKey);return error("Invalid authenticator code",403)}
  await db.batch([
   db.prepare("DELETE FROM user_mfa WHERE user_id=?").bind(user.user_id),
   db.prepare("DELETE FROM mfa_login_challenges WHERE user_id=?").bind(user.user_id),
   db.prepare("DELETE FROM sessions WHERE user_id=? AND token_hash<>?").bind(user.user_id,user.token_hash)
  ]);
  await db.prepare("DELETE FROM login_attempts WHERE rate_key=?").bind(rateKey).run();
  return response({ok:true,enabled:false});
 }
 if(path==="/api/security/recovery-count"&&method==="GET"){
  const row=await first(db,"SELECT COUNT(*) AS remaining FROM account_recovery_codes WHERE user_id=? AND used_at IS NULL",user.user_id);
  return response({remaining:row?.remaining||0});
 }
 if(path==="/api/security/recovery-codes"&&method==="POST"){
  const v=await readJson(request);
  if(!(await verifySensitivePassword(db,user,v.password)))return error("Incorrect account password",403);
  const codes=Array.from({length:8},()=>hex(crypto.getRandomValues(new Uint8Array(16))));
  const t=now();
  const writes=await Promise.all(codes.map(async code=>
   db.prepare("INSERT INTO account_recovery_codes(user_id,code_hash,created_at) VALUES(?,?,?)")
    .bind(user.user_id,await hash(user.user_id+":"+code),t)));
  await db.batch([db.prepare("DELETE FROM account_recovery_codes WHERE user_id=?").bind(user.user_id),...writes]);
  return response({ok:true,codes,remaining:8,warning:"Save these codes now. Each works once; old codes have been invalidated."},201);
 }
 if(path==="/api/security/change-password"&&method==="POST"){
  const v=await readJson(request);
  const currentPassword=typeof v.currentPassword==="string"?v.currentPassword:"";
  const newPassword=typeof v.newPassword==="string"?v.newPassword:"";
  if(newPassword.length<14||newPassword.length>128)return error("New password must be 14–128 characters",400);
  if(newPassword===currentPassword)return error("Choose a different password",400);
  if(!(await verifySensitivePassword(db,user,currentPassword)))return error("Incorrect current password",403);
  const salt=hex(crypto.getRandomValues(new Uint8Array(16))),newHash=await passwordHash(newPassword,salt,ITERS);
  const transactions=await db.batch([
   db.prepare("UPDATE users SET password_hash=?,salt=?,iterations=? WHERE id=? AND tenant_id=?").bind(newHash,salt,ITERS,user.user_id,user.tenant_id),
   db.prepare("DELETE FROM sessions WHERE user_id=? AND token_hash<>?").bind(user.user_id,user.token_hash)
  ]);
  if(transactions[0]?.meta?.changes!==1)throw Error("Unable to update password");
  return response({ok:true,otherSessionsRevoked:transactions[1]?.meta?.changes||0});
 }
 if(path==="/api/security/logout-others"&&method==="POST"){
  const data=await readJson(request);
  if(!(await verifySensitivePassword(db,user,data.password)))return error("Incorrect account password",403);
  const result=await db.prepare("DELETE FROM sessions WHERE user_id=? AND token_hash<>?").bind(user.user_id,user.token_hash).run();
  return response({ok:true,otherSessionsRevoked:result.meta?.changes||0});
 }
 // Sales interest entries are in a separate D1 database and require company-owner authentication.
 if(path.startsWith("/api/sales/")){
  if(user.role!=="owner"||!(await first(db,"SELECT user_id FROM platform_operators WHERE user_id=?",user.user_id)))
   return error("Nexus platform operator account required",403);
  if(!env.LEADS)return error("Sales inquiry database is not connected",503);
 }
 if(path==="/api/sales/leads"&&method==="GET"){
  const items=(await env.LEADS.prepare("SELECT id,email,company,industry,interest_note AS interestNote,status,created_at AS createdAt,updated_at AS updatedAt FROM inquiries ORDER BY created_at DESC LIMIT 300").all()).results||[];
  const count=await env.LEADS.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN status='New' THEN 1 ELSE 0 END) AS newCount FROM inquiries").first();
  return response({items,total:count?.total||0,newCount:count?.newCount||0});
 }
 if(path.startsWith("/api/sales/leads/")&&method==="PATCH"){
  const id=decodeURIComponent(path.slice("/api/sales/leads/".length)),v=await readJson(request);
  if(!["New","Contacted","Closed"].includes(v.status))return error("Invalid lead status",400);
  const result=await env.LEADS.prepare("UPDATE inquiries SET status=?,updated_at=? WHERE id=?").bind(v.status,now(),id).run();
  if(result.meta?.changes!==1)return error("Inquiry not found",404);
  return response({ok:true});
 }
 if(path.startsWith("/api/sales/leads/")&&path.endsWith("/delete")&&method==="POST"){
  const id=decodeURIComponent(path.slice("/api/sales/leads/".length,-"/delete".length));
  const v=await readJson(request);
  if(v.confirm!=="DELETE INQUIRY")return error("Type DELETE INQUIRY to confirm",400);
  const result=await env.LEADS.prepare("DELETE FROM inquiries WHERE id=?").bind(id).run();
  if(result.meta?.changes!==1)return error("Inquiry not found",404);
  return response({ok:true});
 }
 if(path.startsWith("/api/staff/")){
  if(user.role!=="owner")return error("Only company owners can manage staff access",403);
 }
 if(path==="/api/staff/users"&&method==="GET"){
  const items=await all(db,`SELECT id,email,role,created_at AS createdAt,disabled_at AS disabledAt FROM users
    WHERE tenant_id=? ORDER BY created_at ASC LIMIT 100`,user.tenant_id);
  return response({items});
 }
 if(/^\/api\/staff\/users\/[a-z0-9-]{36}\/(disable|enable)$/.test(path)&&method==="POST"){
  const match=path.match(/^\/api\/staff\/users\/([a-z0-9-]{36})\/(disable|enable)$/);
  const id=match[1],action=match[2],v=await readJson(request);
  if(!(await verifySensitivePassword(db,user,v.password)))return error("Incorrect owner password",403);
  const target=await first(db,"SELECT id,role,disabled_at AS disabledAt FROM users WHERE id=? AND tenant_id=? AND role IN ('admin','employee')",id,user.tenant_id);
  if(!target)return error("Staff account not found",404);
  if(action==="disable"){
   if(target.disabledAt!==null)return error("Staff account is already disabled",409);
   const update=await db.batch([
    db.prepare("UPDATE users SET disabled_at=? WHERE id=? AND tenant_id=? AND role IN ('admin','employee') AND disabled_at IS NULL")
     .bind(now(),id,user.tenant_id),
    db.prepare("DELETE FROM sessions WHERE user_id=?").bind(id)
   ]);
   if(update[0]?.meta?.changes!==1)return error("Staff account could not be disabled",409);
   return response({ok:true,disabled:true,revokedSessions:update[1]?.meta?.changes||0});
  }
  if(target.disabledAt===null)return error("Staff account is already active",409);
  const update=await db.prepare("UPDATE users SET disabled_at=NULL WHERE id=? AND tenant_id=? AND role IN ('admin','employee') AND disabled_at IS NOT NULL")
   .bind(id,user.tenant_id).run();
  if(update.meta?.changes!==1)return error("Staff account could not be enabled",409);
  return response({ok:true,disabled:false});
 }
 if(path==="/api/staff/invitations"&&method==="GET"){
  const items=await all(db,`SELECT id,email,role,created_at AS createdAt,expires_at AS expiresAt,redeemed_at AS redeemedAt,revoked_at AS revokedAt
   FROM staff_invitations WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100`,user.tenant_id);
  return response({items});
 }
 if(path==="/api/staff/invitations"&&method==="POST"){
  const v=await readJson(request),email=clean(v.email,254).toLowerCase(),role=clean(v.role,20);
  if(!emailOk(email)||!["admin","employee"].includes(role))return error("Valid staff email and role required",400);
  if(!(await verifySensitivePassword(db,user,v.password)))return error("Incorrect owner password",403);
  if(await first(db,"SELECT id FROM users WHERE email=?",email))return error("An account already exists for this email",409);
  const active=await first(db,`SELECT COUNT(*) AS n FROM staff_invitations
    WHERE tenant_id=? AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at>?`,user.tenant_id,now());
  if(active?.n>=25)return error("Only 25 active staff invitations are allowed in the pilot",409);
  const existing=await first(db,`SELECT id FROM staff_invitations WHERE tenant_id=? AND email=?
    AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at>?`,user.tenant_id,email,now());
  if(existing)return error("An active invitation already exists for this email",409);
  const token=secret(),id=crypto.randomUUID(),t=now(),expiresAt=t+INVITE_LIFETIME;
  await db.prepare(`INSERT INTO staff_invitations(id,tenant_id,email,role,token_hash,created_by,created_at,expires_at)
    VALUES(?,?,?,?,?,?,?,?)`)
   .bind(id,user.tenant_id,email,role,await hash(token),user.user_id,t,expiresAt).run();
  return response({ok:true,id,email,role,expiresAt,token},201);
 }
 if(path.startsWith("/api/staff/invitations/")&&path.endsWith("/revoke")&&method==="POST"){
  const id=decodeURIComponent(path.slice("/api/staff/invitations/".length,-"/revoke".length)),v=await readJson(request);
  if(!(await verifySensitivePassword(db,user,v.password)))return error("Incorrect owner password",403);
  const result=await db.prepare(`UPDATE staff_invitations SET revoked_at=?
     WHERE id=? AND tenant_id=? AND redeemed_at IS NULL AND revoked_at IS NULL`)
   .bind(now(),id,user.tenant_id).run();
  if(result.meta?.changes!==1)return error("Active staff invitation not found",404);
  return response({ok:true});
 }
 if(path.startsWith("/api/platform/")){
  if(!(await platformOperator(db,user)))return error("Nexus platform operator access required",403);
 }
 if(path==="/api/platform/invitations"&&method==="GET"){
  const items=await all(db,`SELECT id,company_name AS companyName,owner_email AS email,created_at AS createdAt,
    expires_at AS expiresAt,redeemed_at AS redeemedAt,revoked_at AS revokedAt
    FROM company_invitations ORDER BY created_at DESC,id DESC LIMIT 100`);
  return response({items,mode:"invitation-only",selfRegistrationEnabled:false});
 }
 if(path==="/api/platform/companies"&&method==="GET"){
  const items=await all(db,`SELECT t.id,t.name,t.created_at AS createdAt,
    COALESCE((SELECT u.email FROM users u WHERE u.tenant_id=t.id AND u.role='owner' ORDER BY u.created_at LIMIT 1),'') AS ownerEmail,
    (SELECT COUNT(*) FROM users u WHERE u.tenant_id=t.id) AS userCount,
    (SELECT COUNT(*) FROM customers c WHERE c.tenant_id=t.id) AS customerCount,
    (SELECT COUNT(*) FROM jobs j WHERE j.tenant_id=t.id) AS jobCount
    FROM tenants t ORDER BY t.created_at DESC LIMIT 100`);
  return response({items});
 }
 if(path==="/api/platform/invitations"&&method==="POST"){
  const v=await readJson(request),company=clean(v.companyName,150),email=clean(v.email,254).toLowerCase();
  if(!company||company.length>150||!emailOk(email))return error("Enter a company name and a valid owner email",400);
  if(!(await verifySensitivePassword(db,user,v.password)))return error("Incorrect account password",403);
  if(await first(db,"SELECT id FROM users WHERE email=?",email))return error("This email already has an account",409);
  const active=await first(db,"SELECT COUNT(*) AS n FROM company_invitations WHERE redeemed_at IS NULL AND revoked_at IS NULL AND expires_at>?",now());
  if(active?.n>=INVITE_LIMIT)return error("Active pilot invitation limit reached",409);
  const existing=await first(db,"SELECT id FROM company_invitations WHERE owner_email=? AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at>?",email,now());
  if(existing)return error("An active invitation already exists for this email; revoke it to issue another",409);
  const token=secret(),digest=await hash(token),id=crypto.randomUUID(),t=now(),expiresAt=t+INVITE_LIFETIME;
  await db.prepare("INSERT INTO company_invitations(id,company_name,owner_email,token_hash,created_by,created_at,expires_at) VALUES(?,?,?,?,?,?,?)")
   .bind(id,company,email,digest,user.user_id,t,expiresAt).run();
  // Token is returned exactly once and never retained in browser storage.
  return response({ok:true,id,companyName:company,email,expiresAt,token},201);
 }
 if(path.startsWith("/api/platform/invitations/")&&path.endsWith("/revoke")&&method==="POST"){
  const id=decodeURIComponent(path.slice("/api/platform/invitations/".length,-"/revoke".length));
  const v=await readJson(request);
  if(!(await verifySensitivePassword(db,user,v.password)))return error("Incorrect account password",403);
  const r=await db.prepare("UPDATE company_invitations SET revoked_at=? WHERE id=? AND redeemed_at IS NULL AND revoked_at IS NULL")
   .bind(now(),id).run();
  if(r.meta?.changes!==1)return error("Active invitation not found",404);
  return response({ok:true});
 }
 return error("Not found",404);
}
export async function onRequest({request,env}){
 try{
  const result=await handler(request,env);
  if(request.method!=="GET"&&result.status>=200&&result.status<300&&
   /^\/api\/(customers|jobs|employees|appointments|estimates|invoices|payments|backups|security|sales|platform|staff)(\/|$)/.test(new URL(request.url).pathname)){
   const user=await current(request,env.DB).catch(()=>null);
   if(user)await logAudit(env.DB,user,new URL(request.url).pathname,request.method);
  }
  return result;
 }
 catch(e){
  if(/^(JSON body required|Request too large|Invalid JSON|JSON object required|Customer name is required|Invalid customer email|Job requires|Invalid job status|Invalid job amount|Invalid date|Employee name is required|Invalid employee email|Invalid employee status|Choose a job|Enter a valid appointment date|Enter a valid appointment time|Amount must|Due date must|Invalid due date|Payment date must|Invalid payment date|Estimate requires|Invoice requires|Invalid estimate status|Choose an invoice|Invalid payment method|Backup exceeds|Backup limit reached|Snapshot integrity|Snapshot format|Snapshot has|Snapshot contains|Too many security attempts)/.test(e?.message||""))return error(e.message);
  console.error("Nexus CRM error:",String(e?.message||e).slice(0,240));
  return error("Service error; please try again",500);
 }
}
