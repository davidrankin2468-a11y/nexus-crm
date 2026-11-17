export async function onRequestGet({env}) {
 try {
  if (!env.LEADS) return Response.json({ok:false,service:"Nexus CRM early-access site"},{status:503,headers:{"Cache-Control":"no-store"}});
  const result=await env.LEADS.prepare("SELECT 1 AS ok").first();
  return Response.json({ok:result?.ok===1,service:"Nexus CRM early-access site"},{headers:{"Cache-Control":"no-store"}});
 } catch(e) {
  return Response.json({ok:false},{status:503,headers:{"Cache-Control":"no-store"}});
 }
}
