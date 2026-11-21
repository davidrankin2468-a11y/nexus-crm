import {invitationMailReadiness,sendInvitationEmail,freeInvitationEmailLab,sendSelfTestEmail} from "./invitation-mailer.js";
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
export async function current(req,db){
 const token=fromCookie(re --- TRUNCATED --- 83,356 chars