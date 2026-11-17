// Nexus CRM early-access interest API. Isolated from the private business CRM database.
const H={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
const answer=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:H});
const bad=(m,s=400)=>answer({error:m},s);
const clean=(v,max)=>String(v??"").trim().slice(0,max);
const emailOk=v=>v.length>=5&&v.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const sha=async str=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(str))),v=>v.toString(16).padStart(2,"0")).join("");
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(24)),v=>v.toString(16).padStart(2,"0")).join("");
const industries=["Landscaping","Painting","Construction","Home Services","Other"];
const now=()=>Math.floor(Date.now()/1000);
async function parse(req){
 if(!(req.headers.get("Content-Type")||"").toLowerCase().startsWith("application/json"))throw Error("Send a JSON request");
 if(Number(req.headers.get("Content-Length")||0)>8192)throw Error("Request too large");
 const raw=await req.text();if(raw.length>8192)throw Error("Request too large");
 let data;try{data=JSON.parse(raw)}catch{throw Error("Invalid JSON")}
 if(!data||typeof data!=="object"||Array.isArray(data))throw Error("Expected a JSON object");
 return data;
}
async function throttle(db,req){
 const key=await sha("interest-ip:"+String(req.headers.get("CF-Connecting-IP")||"unknown"));
 const t=now();
 const sql="INSERT INTO submission_limits(rate_key,window_started,attempts) VALUES(?,?,1) ON CONFLICT(rate_key) DO UPDATE SET attempts=CASE WHEN submission_limits.window_started<? THEN 1 ELSE submission_limits.attempts+1 END,window_started=CASE WHEN submission_limits.window_started<? THEN ? ELSE submission_limits.window_started END RETURNING attempts";
 const row=await db.prepare(sql).bind(key,t,t-86400,t-86400,t).first();
 if(!row||row.attempts>4)throw Error("Too many requests today; try again later");
 if(row.attempts===1)await db.prepare("DELETE FROM submission_limits WHERE window_started<?").bind(t-7*86400).run();
}
export async function onRequest({request,env}){
 if(!env.LEADS)return bad("Interest registration is unavailable",503);
 if(!["POST","DELETE"].includes(request.method))return bad("Method not allowed",405);
 if(request.headers.get("Origin")!==new URL(request.url).origin)return bad("Submit from the Nexus CRM website",403);
 try{
  const v=await parse(request);
  if(request.method==="DELETE"){
   const email=clean(v.email,254).toLowerCase(),receipt=clean(v.receipt,72);
   if(!emailOk(email)||!/^[a-f0-9]{48}$/.test(receipt))return bad("Valid email and receipt code required");
   await throttle(env.LEADS,request);
   const digest=await sha(receipt);
   const done=await env.LEADS.prepare("DELETE FROM inquiries WHERE email=? AND receipt_hash=?").bind(email,digest).run();
   return answer({ok:true,removed:(done.meta?.changes||0)===1});
  }
  if(v.website)return answer({ok:true,message:"Request received"}); // spam honeypot
  if(v.consent!==true)return bad("Please consent to being contacted about your inquiry");
  const email=clean(v.email,254).toLowerCase(),company=clean(v.company,140),industry=clean(v.industry,30),note=clean(v.note,500);
  if(!emailOk(email))return bad("Enter a valid email");
  if(!industries.includes(industry))return bad("Choose a valid industry");
  await throttle(env.LEADS,request);
  const exists=await env.LEADS.prepare("SELECT id FROM inquiries WHERE email=?").bind(email).first();
  if(exists)return answer({ok:true,existing:true,message:"An interest request for this email is already recorded."});
  const receipt=token(),digest=await sha(receipt),t=now();
  const sql="INSERT INTO inquiries(id,email,company,industry,interest_note,receipt_hash,status,consent_at,created_at,updated_at) VALUES(?,?,?,?,?,?,'New',?,?,?)";
  await env.LEADS.prepare(sql).bind(crypto.randomUUID(),email,company,industry,note,digest,t,t,t).run();
  return answer({ok:true,receipt,message:"Your interest has been saved for review. This is not a purchase or an active account."},201);
 }catch(e){
  const m=String(e?.message||"");
  if(m.startsWith("Too many requests"))return bad(m,429);
  if(/^(Send a JSON|Request too large|Invalid JSON|Expected a JSON)/.test(m))return bad(m);
  console.error("Nexus interest request failed",m.slice(0,180));
  return bad("Unable to save your request right now",500);
 }
}
