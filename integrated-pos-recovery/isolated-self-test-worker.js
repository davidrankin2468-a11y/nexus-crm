import {onRequest} from "./crm-api.js";
const hex=b=>Array.from(b,x=>x.toString(16).padStart(2,"0")).join("");
const rand=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const sha=async s=>hex(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s))));
const stamp=()=>Math.floor(Date.now()/1000);
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname!=="/isolated-integration-check")return onRequest({request,env});
  if(request.method!=="GET")return new Response("Method not allowed",{status:405});
  if(!env.DB)return new Response("Isolated DB missing",{status:503});
  const db=env.DB;
  const existing=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='isolated_test_runs'").first();
  if(!existing)await db.prepare("CREATE TABLE IF NOT EXISTS isolated_test_runs (id TEXT PRIMARY KEY, started_at INTEGER NOT NULL, result_json TEXT)").run();
  const previous=await db.prepare("SELECT result_json FROM isolated_test_runs WHERE id='single-run'").first();
  if(previous)return new Response(previous.result_json||JSON.stringify({status:"already_running"}),{headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
  const lock=await db.prepare("INSERT OR IGNORE INTO isolated_test_runs(id,started_at) VALUES('single-run',?)").bind(stamp()).run();
  if(lock.meta?.changes!==1)return new Response(JSON.stringify({status:"already_running"}),{headers:{"Content-Type":"application/json"}});
  const tests=[];
  const check=(name,ok,detail)=>{tests.push({name,pass:!!ok,...(!ok?{detail}: {})});if(!ok)throw Error(name+": "+(detail||"failed"))};
  const api=async(path,method="GET",data,session)=>{
   const headers={"Origin":url.origin,"Content-Type":"application/json"};
   if(session?.cookie)headers.Cookie=session.cookie;
   if(session?.csrf&&method!=="GET")headers["X-Nexus-CSRF"]=session.csrf;
   const req=new Request(url.origin+path,{method,headers,...(data===undefined?{}:{body:JSON.stringify(data)})});
   const res=await onRequest({request:req,env});
   const out=await res.json().catch(()=>({}));
   if(session){const c=res.headers.get("set-cookie");if(c)session.cookie=c.split(";")[0];if(out.csrf)session.csrf=out.csrf}
   return {status:res.status,data:out};
  };
  let result;
  try{
   const pairs=[];
   for(const letter of ["a","b"]){
    const token=rand(),id=crypto.randomUUID(),name="Isolated API Company "+letter.toUpperCase(),email="isolated-"+id+"@example.test",password="Test-"+rand()+"!";
    const owner=await db.prepare("SELECT id FROM users LIMIT 1").first();
    if(!owner){
     const bootstrapId=crypto.randomUUID(),tenantId=crypto.randomUUID(),t=stamp();
     await db.prepare("INSERT INTO tenants(id,name,created_at) VALUES(?,?,?)").bind(tenantId,"Test Operator Fixture",t).run();
     await db.prepare("INSERT INTO users(id,tenant_id,email,password_hash,salt,iterations,role,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(bootstrapId,tenantId,"operator-fixture@example.test","not-a-login","00000000000000000000000000000000",100000,"owner",t).run();
    }
    const creator=await db.prepare("SELECT id FROM users LIMIT 1").first();
    await db.prepare("INSERT INTO company_invitations(id,company_name,owner_email,token_hash,created_by,created_at,expires_at,delivery_mode) VALUES(?,?,?,?,?,?,?,'manual')").bind(id,name,email,await sha(token),creator.id,stamp(),stamp()+3600).run();
    const session={};
    const preview=await api("/api/invitations/preview","POST",{token});
    check("invitation_preview_"+letter,preview.status===200&&preview.data.companyName===name,JSON.stringify(preview));
    const accepted=await api("/api/invitations/accept","POST",{token,password},session);
    check("invitation_accept_"+letter,accepted.status===201,JSON.stringify(accepted));
    const replay=await api("/api/invitations/accept","POST",{token,password});
    check("invitation_replay_denied_"+letter,replay.status===403,JSON.stringify(replay));
    const me=await api("/api/me","GET",undefined,session);
    check("authenticated_owner_"+letter,me.status===200&&me.data.user?.company===name,JSON.stringify(me));
    const fresh={};
    const login=await api("/api/login","POST",{email,password},fresh);
    check("fresh_login_"+letter,login.status===200,JSON.stringify(login));
    pairs.push(fresh);
   }
   const created=await api("/api/customers","POST",{name:"Isolated sentinel",email:"",phone:"",notes:""},pairs[0]);
   check("customer_create_a",created.status===201,JSON.stringify(created));
   const id=created.data.id;
   const a=await api("/api/customers","GET",undefined,pairs[0]);
   check("a_sees_own",a.status===200&&a.data.items?.some(x=>x.id===id));
   const b=await api("/api/customers","GET",undefined,pairs[1]);
   check("b_cannot_list_a",b.status===200&&!b.data.items?.some(x=>x.id===id));
   const change=await api("/api/customers/"+id,"PATCH",{name:"INTRUSION"},pairs[1]);
   check("b_cannot_modify_a",[403,404].includes(change.status),JSON.stringify(change));
   const again=await api("/api/customers","GET",undefined,pairs[0]);
   check("a_customer_unchanged",again.data.items?.some(x=>x.id===id&&x.name==="Isolated sentinel"));
   result={suite:"nexus-isolated-authenticated-integration",pass:true,passed:tests.length,total:tests.length,tests};
  }catch(e){result={suite:"nexus-isolated-authenticated-integration",pass:false,passed:tests.filter(x=>x.pass).length,total:tests.length,tests,error:String(e.message||e).slice(0,350)}}
  const json=JSON.stringify(result);
  await db.prepare("UPDATE isolated_test_runs SET result_json=? WHERE id='single-run'").bind(json).run();
  return new Response(json,{headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
 }
};