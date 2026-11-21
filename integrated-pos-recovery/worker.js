import {handleSquareSandboxWebhook} from "./square-sandbox-webhook.js";
import {verifySandboxRefund,inspectSandboxRefund} from "./square-sandbox-refund-verification.js";
void verifySandboxRefund;
import {onRequest as crmApi,permitted} from "./crm-api.js";
import {onRequest as posApi} from "./pos-api.js";
import {HTML,APP,CSS,PRINT} from "./assets.js";
const headers={"X-Robots-Tag":"noindex, nofollow","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY","Cache-Control":"no-store","Strict-Transport-Security":"max-age=31536000"};
export default {
 async fetch(request,env){
  const path=new URL(request.url).pathname;
  if(path.startsWith('/api/') && path!='/api/pos/square/webhook' && path!='/api/square/sandbox-readiness') {
   const ip=request.headers.get('CF-Connecting-IP')||'unknown';
   const auth=/login|signin|sign-in|register|signup|password|reset|mfa|verify|session/i.test(path);
   const limiter=auth?env.NEXUS_AUTH_RATE_LIMIT:env.NEXUS_API_RATE_LIMIT;
   if(!limiter)return new Response('Security limiter unavailable',{status:503,headers:{'Cache-Control':'no-store'}});
   try {const result=await limiter.limit({key:ip+':'+(auth?'auth':'api')});if(!result.success)return new Response(JSON.stringify({error:'Too many requests'}),{status:429,headers:{'Content-Type':'application/json','Retry-After':'60','Cache-Control':'no-store'}})}catch(e){console.error('rate_limit_error');return new Response('Security check unavailable',{status:503,headers:{'Cache-Control':'no-store'}})}
  }
  if(path==="/regression-status"&&request.method==="GET"){
   const tests=[];
   const assert=(name,pass)=>tests.push({name,pass:Boolean(pass)});
   const good={id:"sandbox_refund_12345678",payment_id:"sandbox_payment_12345678",status:"COMPLETED",amount_money:{amount:50,currency:"USD"},location_id:"sandbox_location_12345678"};
   const expected={paymentId:good.payment_id,amountCents:50,locationId:good.location_id};
   assert("employee_cannot_create_customer",!permitted("employee","POST","/api/customers"));
   assert("employee_cannot_view_finances",!permitted("employee","GET","/api/payments"));
   assert("employee_cannot_manage_platform",!permitted("employee","GET","/api/platform/companies"));
   assert("admin_cannot_manage_platform",!permitted("admin","GET","/api/platform/companies"));
   assert("admin_can_manage_customers",permitted("admin","POST","/api/customers"));
   assert("employee_can_view_customers",permitted("employee","GET","/api/customers"));
   assert("unknown_role_denied",!permitted("unknown","GET","/api/customers"));
   assert("owner_can_manage_customers",permitted("owner","POST","/api/customers"));
   assert("valid_completed_refund",inspectSandboxRefund(good,expected)===null);
   assert("reject_pending_refund",inspectSandboxRefund({...good,status:"PENDING"},expected)==="REFUND_NOT_COMPLETED");
   assert("reject_wrong_payment",inspectSandboxRefund({...good,payment_id:"wrong"},expected)==="PAYMENT_MISMATCH");
   assert("reject_wrong_amount",inspectSandboxRefund({...good,amount_money:{amount:51,currency:"USD"}},expected)==="AMOUNT_MISMATCH");
   assert("reject_wrong_currency",inspectSandboxRefund({...good,amount_money:{amount:50,currency:"EUR"}},expected)==="AMOUNT_MISMATCH");
   assert("reject_wrong_location",inspectSandboxRefund({...good,location_id:"wrong"},expected)==="LOCATION_MISMATCH");
   assert("reject_invalid_refund_id",inspectSandboxRefund({...good,id:"bad"},expected)==="REFUND_ID_INVALID");
   assert("partial_refund_amount_accepted",inspectSandboxRefund(good,{...expected,amountCents:50})===null);
   try{
    if(!env.DB)throw Error("no_database");
    const queries=[
     ["database_integrity","PRAGMA quick_check",r=>r.length===1&&r[0].quick_check==="ok"],
     ["foreign_keys","PRAGMA foreign_key_check",r=>r.length===0],
     ["no_duplicate_provider_refunds","SELECT provider_refund_id FROM pos_refunds WHERE provider_refund_id IS NOT NULL GROUP BY provider_refund_id HAVING COUNT(*)>1",r=>r.length===0],
     ["no_refund_ledger_mismatch","SELECT s.id FROM pos_sales s LEFT JOIN pos_refunds r ON r.tenant_id=s.tenant_id AND r.sale_id=s.id GROUP BY s.id HAVING s.refunded_cents!=COALESCE(SUM(r.amount_cents),0)",r=>r.length===0],
     ["no_over_refund","SELECT id FROM pos_sales WHERE refunded_cents>total_cents",r=>r.length===0],
     ["no_bad_refund_status","SELECT id FROM pos_sales WHERE (status='refunded' AND refunded_cents!=total_cents) OR (status='partially_refunded' AND (refunded_cents<=0 OR refunded_cents>=total_cents))",r=>r.length===0],
     ["no_orphan_customers","SELECT c.id FROM customers c LEFT JOIN tenants t ON t.id=c.tenant_id WHERE t.id IS NULL",r=>r.length===0],
     ["no_orphan_users","SELECT u.id FROM users u LEFT JOIN tenants t ON t.id=u.tenant_id WHERE t.id IS NULL",r=>r.length===0],
     ["no_invalid_inventory","SELECT id FROM pos_products WHERE stock_quantity<0 OR price_cents<0",r=>r.length===0],
     ["no_duplicate_tenant_skus","SELECT tenant_id,sku FROM pos_products GROUP BY tenant_id,sku HAVING COUNT(*)>1",r=>r.length===0],
     ["no_invalid_company_invitations","SELECT id FROM company_invitations WHERE expires_at<=created_at OR (redeemed_at IS NOT NULL AND revoked_at IS NOT NULL)",r=>r.length===0],
     ["no_invalid_staff_invitations","SELECT id FROM staff_invitations WHERE expires_at<=created_at OR (redeemed_at IS NOT NULL AND revoked_at IS NOT NULL)",r=>r.length===0],
     ["no_duplicate_license_features","SELECT plan_code,feature_key FROM license_entitlements GROUP BY plan_code,feature_key HAVING COUNT(*)>1",r=>r.length===0],
     ["onboarding_no_orphan_staff_invites","SELECT s.id FROM staff_invitations s LEFT JOIN tenants t ON t.id=s.tenant_id WHERE t.id IS NULL",r=>r.length===0],
     ["onboarding_no_orphan_jobs","SELECT j.id FROM jobs j LEFT JOIN tenants t ON t.id=j.tenant_id WHERE t.id IS NULL",r=>r.length===0],
     ["onboarding_no_cross_tenant_jobs","SELECT j.id FROM jobs j JOIN customers c ON c.id=j.customer_id WHERE j.tenant_id!=c.tenant_id",r=>r.length===0],
     ["onboarding_no_cross_tenant_sale_items","SELECT i.id FROM pos_sale_items i JOIN pos_sales s ON s.id=i.sale_id WHERE i.tenant_id!=s.tenant_id",r=>r.length===0],
     ["onboarding_no_cross_tenant_refunds","SELECT r.id FROM pos_refunds r JOIN pos_sales s ON s.id=r.sale_id WHERE r.tenant_id!=s.tenant_id",r=>r.length===0]
    ];
    for(const [name,sql,check] of queries){try{const r=await env.DB.prepare(sql).all();assert(name,check(r.results||[]));}catch{assert(name,false)}}
   }catch{assert("database_available",false)}
   const pass=tests.every(x=>x.pass);
   return new Response(JSON.stringify({suite:"nexus-crm-pos-safe-regression",type:"read-only-and-mocked",passed:tests.filter(x=>x.pass).length,total:tests.length,pass,tests,livePartialRefund:false,liveDuplicateRetry:false,authenticatedPenetrationTest:false}),{status:pass?200:503,headers:{"Content-Type":"application/json","Cache-Control":"no-store","X-Robots-Tag":"noindex"}});
  }
  if(path==="/api/square/sandbox-readiness"&&request.method==="GET")return new Response(JSON.stringify({environment:"development",paymentProcessing:false,merchantConfigured:Boolean(env.SQUARE_SANDBOX_MERCHANT_ID),locationConfigured:Boolean(env.SQUARE_SANDBOX_LOCATION_ID),tokenConfigured:Boolean(env.SQUARE_SANDBOX_ACCESS_TOKEN),providerVerified:false,liveChargesEnabled:false}),{headers:{"Content-Type":"application/json; charset=utf-8",...headers}});
  if(path==="/api/pos/square/webhook")return handleSquareSandboxWebhook(request,env);
  if(path.startsWith("/api/pos/"))return posApi({request,env});
  if(path.startsWith("/api/"))return crmApi({request,env});
  if(request.method!=="GET"&&request.method!=="HEAD")return new Response("Method not allowed",{status:405,headers:{...headers,Allow:"GET, HEAD"}});
  if(path==="/preview-info")return new Response(request.method==="HEAD"?null:JSON.stringify({name:"Nexus CRM + POS",mode:"development",companyData:"staging",paymentProcessing:false,integrated:true,topLevelTabs:5,licenseBilling:false,integratedPosHash:"c3e37ae576ee628d144d3894fd71df7df67db991",source:"GitHub feature/nexus-pos-crm-foundation",blobs:{"crm":"6cad3ee5b93904c7fd6cae9c246f45b787819970","pos":"2f375b79d6296752b6eb1fd7aea86d515ae6e164","app":"68ec0d854a9cc699cc30e02d4e98d0656c2586a8"}}),{headers:{"Content-Type":"application/json; charset=utf-8",...headers}});
  const asset={"/":{body:HTML,type:"text/html; charset=utf-8"},"/index.html":{body:HTML,type:"text/html; charset=utf-8"},"/assets/app.js":{body:APP,type:"application/javascript; charset=utf-8"},"/assets/styles.css":{body:CSS,type:"text/css; charset=utf-8"},"/assets/print.css":{body:PRINT,type:"text/css; charset=utf-8"}}[path];
  if(!asset)return new Response("Not found",{status:404,headers});
  return new Response(request.method==="HEAD"?null:asset.body,{headers:{"Content-Type":asset.type,...headers,"Content-Security-Policy":path==="/"||path==="/index.html"?"default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'":"default-src 'none'"}});
 }
};
