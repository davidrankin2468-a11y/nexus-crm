// Square Sandbox webhook intake: authenticate before persisting; never mutate financial ledger.
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
export async function handleSquareSandboxWebhook(request,env){
 if(request.method!=="POST")return response({error:"Method not allowed"},405);
 if(env.SQUARE_ENVIRONMENT!=="sandbox"||!env.SQUARE_SANDBOX_WEBHOOK_SIGNATURE_KEY||!env.DB)return response({error:"Sandbox webhook not configured"},503);
 const signature=request.headers.get("x-square-hmacsha256-signature");
 if(!signature)return response({error:"Signature required"},401);
 const body=await request.text();
 if(body.length>65536)return response({error:"Payload too large"},413);
 const uri=new URL(request.url);
 const canonical=env.SQUARE_SANDBOX_WEBHOOK_NOTIFICATION_URL||uri.origin+uri.pathname;
 const bytes=new TextEncoder().encode(canonical+body);
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(env.SQUARE_SANDBOX_WEBHOOK_SIGNATURE_KEY),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const mac=new Uint8Array(await crypto.subtle.sign("HMAC",key,bytes));
 const expected=btoa(String.fromCharCode(...mac));
 // Compare decoded bytes without early exit.
 const dec=s=>{try{return Uint8Array.from(atob(s),c=>c.charCodeAt(0))}catch{return new Uint8Array()}};
 const a=dec(signature),b=dec(expected);let diff=a.length^b.length;
 for(let i=0;i<32;i++)diff|=(a[i]||0)^(b[i]||0);
 if(diff!==0)return response({error:"Invalid signature"},401);
 let event;try{event=JSON.parse(body)}catch{return response({error:"Invalid JSON"},400)}
 if(typeof event?.event_id!=="string"||event.event_id.length>200||!/^[A-Za-z0-9_-]+$/.test(event.event_id)||typeof event.type!=="string")return response({error:"Invalid event"},400);
 // Record authenticated event for reconciliation. Never trust payload as proof of payment/refund.
 const now=Math.floor(Date.now()/1000);
 await env.DB.prepare("INSERT OR IGNORE INTO payment_webhook_events(provider,event_id,received_at,outcome) VALUES(?,?,?,'received')").bind("square_sandbox",event.event_id,now).run();
 return response({received:true});
}
