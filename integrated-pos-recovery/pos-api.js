import {verifySandboxRefund} from "./square-sandbox-refund-verification.js";
import {current as crmSession} from "./crm-api.js";
import {handleSquareSandboxAttempt} from "./square-d1-reconciliation.js";
// Nexus POS development API: separate Pages route; never handles card details.
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
const now=()=>Math.floor(Date.now()/1000);
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,"0")).join("");
async function userFor(request,db){return crmSession(request,db)}
async function bodyOf(request){if(!(request.headers.get("Content-Type")||"").includes("application/json"))throw Error("JSON required");const t=await request.text();if(t.length>16384)throw Error("Body too large");return JSON.parse(t)}
export async function onRequest({request,env}){
 try{
  if(!env.DB)return json({error:"Database unavailable"},503);
  const method=request.method,path=new URL(request.url).pathname,db=env.DB;
  if(!["GET","POST"].includes(method))return json({error:"Method not allowed"},405);
  const user=await userFor(request,db);if(!user)return json({error:"Sign in required"},401);
  if(user.role!=="owner"&&user.role!=="admin")return json({error:"POS permission denied"},403);
  if(method==="POST"){
   if(request.headers.get("Origin")!==new URL(request.url).origin)return json({error:"Origin denied"},403);
   if(request.headers.get("X-Nexus-CSRF")!==user.csrf_token)return json({error:"CSRF token required"},403);
  }
  const tenant=user.tenant_id;
  if(path==="/api/pos/square/sandbox-connectivity"&&method==="GET"){
   if(env.SQUARE_ENVIRONMENT!=="sandbox"||!env.SQUARE_SANDBOX_ACCESS_TOKEN||!env.SQUARE_SANDBOX_LOCATION_ID||!env.SQUARE_SANDBOX_MERCHANT_ID)return json({connected:false,reason:"SANDBOX_NOT_CONFIGURED",paymentProcessing:false},503);
   try{
    const response=await fetch("https://connect.squareupsandbox.com/v2/locations",{method:"GET",redirect:"manual",signal:AbortSignal.timeout(12000),headers:{Authorization:"Bearer "+env.SQUARE_SANDBOX_ACCESS_TOKEN,"Square-Version":"2026-09-16",Accept:"application/json"}});
    if(response.status>=300&&response.status<400)return json({connected:false,reason:"SQUARE_REDIRECT_BLOCKED",providerStatus:response.status,paymentProcessing:false},502);
    if(!response.ok)return json({connected:false,reason:"SQUARE_PROVIDER_REJECTED",providerStatus:response.status,paymentProcessing:false},502);
    const data=await response.json().catch(()=>null);
    const location=Array.isArray(data?.locations)?data.locations.find(x=>x?.id===env.SQUARE_SANDBOX_LOCATION_ID):null;
    if(!location)return json({connected:false,reason:"SANDBOX_LOCATION_NOT_FOUND",paymentProcessing:false},409);
    if(location.merchant_id&&location.merchant_id!==env.SQUARE_SANDBOX_MERCHANT_ID)return json({connected:false,reason:"SANDBOX_MERCHANT_MISMATCH",paymentProcessing:false},409);
    return json({connected:true,environment:"sandbox",locationVerified:true,merchantVerified:Boolean(location.merchant_id),paymentProcessing:false});
   }catch{return json({connected:false,reason:"SQUARE_PROVIDER_UNAVAILABLE",paymentProcessing:false},503)}
  }

  if((path==="/api/pos/square/sandbox-prepare"&&method==="POST")||(path==="/api/pos/square/sandbox-reconcile"&&method==="POST")||(path==="/api/pos/square/sandbox-submit"&&method==="POST")||(path==="/api/pos/square/sandbox-attempts"&&method==="GET"))return handleSquareSandboxAttempt({path,method,db,env,tenant,body:method==="POST"?await bodyOf(request):{}});
  if(path==="/api/pos/square/sandbox-refund-retry-check"&&method==="POST"){
   if(user.role!=="owner")return json({error:"Owner access required"},403);
   if(env.SQUARE_ENVIRONMENT!=="sandbox")return json({error:"Sandbox only"},403);
   const v=await bodyOf(request);
   if(!/^[a-f0-9-]{36}$/i.test(v.sale_id||""))return json({error:"Valid sale ID required"},400);
   const refund=await db.prepare("SELECT provider_refund_id,amount_cents,idempotency_key FROM pos_refunds WHERE tenant_id=? AND sale_id=? AND idempotency_key LIKE 'nxrf_%' ORDER BY created_at DESC LIMIT 1").bind(tenant,v.sale_id).first();
   if(!refund)return json({error:"No previously verified sandbox test refund for this sale"},404);
   const payment=await db.prepare("SELECT provider_payment_id FROM pos_square_sandbox_payment_attempts WHERE tenant_id=? AND sale_id=? AND status='reconciled' AND provider_payment_id IS NOT NULL").bind(tenant,v.sale_id).first();
   if(!payment)return json({error:"Reconciled sandbox payment not found"},409);
   const verification=await verifySandboxRefund({refundId:refund.provider_refund_id,paymentId:payment.provider_payment_id,amountCents:refund.amount_cents,env});
   if(!verification.verified)return json({verified:false,recorded:true,reason:verification.reason},409);
   const row=await db.prepare("SELECT COUNT(*) AS refund_count,COALESCE(SUM(amount_cents),0) AS refund_sum FROM pos_refunds WHERE tenant_id=? AND sale_id=? AND provider_refund_id=?").bind(tenant,v.sale_id,refund.provider_refund_id).first();
   const sale=await db.prepare("SELECT status,total_cents,refunded_cents FROM pos_sales WHERE tenant_id=? AND id=?").bind(tenant,v.sale_id).first();
   const pass=Number(row.refund_count)===1&&Number(sale.refunded_cents)>=Number(refund.amount_cents)&&Number(sale.refunded_cents)<=Number(sale.total_cents);
   return json({verified:true,recorded:true,duplicate:false,read_only:true,pass,refund_count:Number(row.refund_count),amount_cents:refund.amount_cents,sale_status:sale.status,remaining_cents:sale.total_cents-sale.refunded_cents});
  }
  if(path==="/api/pos/square/sandbox-refund-test"&&method==="POST"){
   if(user.role!=="owner")return json({error:"Owner access required"},403);
   if(env.SQUARE_ENVIRONMENT!=="sandbox"||!env.SQUARE_SANDBOX_ACCESS_TOKEN||!env.SQUARE_SANDBOX_LOCATION_ID)return json({error:"Sandbox not configured"},503);
   const v=await bodyOf(request);
   if(!/^[a-f0-9-]{36}$/i.test(v.sale_id||"")||v.confirm!=="RUN PARTIAL SANDBOX REFUND"||!Number.isSafeInteger(v.amount_cents)||v.amount_cents<1)return json({error:"Explicit sandbox confirmation required"},400);
   if(!/^[a-f0-9-]{36}$/i.test(v.operation_id||""))return json({error:"Stable refund operation ID required; retry with the same ID"},400);
   const key="nxrf_"+v.operation_id.replace(/-/g,"").toLowerCase();
   const prior=await db.prepare("SELECT tenant_id,sale_id,amount_cents,provider_refund_id FROM pos_refunds WHERE idempotency_key=?").bind(key).first();
   if(prior)return prior.tenant_id===tenant&&prior.sale_id===v.sale_id&&prior.amount_cents===v.amount_cents?json({verified:true,recorded:true,duplicate:true,refund_id:prior.provider_refund_id,sale_id:v.sale_id,amount_cents:v.amount_cents}):json({error:"Refund operation ID already used for a different refund"},409);
   const sale=await db.prepare("SELECT status,total_cents,refunded_cents FROM pos_sales WHERE tenant_id=? AND id=?").bind(tenant,v.sale_id).first();
   if(!sale||v.amount_cents>=sale.total_cents||v.amount_cents>sale.total_cents-sale.refunded_cents||!["completed","partially_refunded"].includes(sale.status))return json({error:"Only a completed sandbox sale with sufficient balance is eligible for a partial refund"},409);
   const payment=await db.prepare("SELECT provider_payment_id FROM pos_square_sandbox_payment_attempts WHERE tenant_id=? AND sale_id=? AND status='reconciled' AND provider_payment_id IS NOT NULL").bind(tenant,v.sale_id).first();
   if(!payment)return json({error:"Reconciled sandbox payment not found"},409);

   // Atomically reserve this operation BEFORE contacting Square. A second request
   // must not issue another provider POST, including after an unknown outcome.
   // Requires migration: pos_square_sandbox_refund_operations.
   const claim=await db.prepare("INSERT INTO pos_square_sandbox_refund_operations(operation_key,tenant_id,sale_id,amount_cents,payment_id,status,created_at) VALUES(?,?,?,?,?,'pending',?) ON CONFLICT DO NOTHING").bind(key,tenant,v.sale_id,v.amount_cents,payment.provider_payment_id,now()).run();
   if(Number(claim?.meta?.changes??claim?.changes??0)!==1){
    const previous=await db.prepare("SELECT tenant_id,sale_id,amount_cents,payment_id,status FROM pos_square_sandbox_refund_operations WHERE operation_key=?").bind(key).first();
    if(!previous||previous.tenant_id!==tenant||previous.sale_id!==v.sale_id||previous.amount_cents!==v.amount_cents||previous.payment_id!==payment.provider_payment_id)return json({error:"Refund operation ID already reserved for a different refund"},409);
    return json({error:"Refund operation already submitted or outcome unknown; reconcile with Square before retrying",operationPending:true,retrySameOperation:false},409);
   }
   let response;
   try{response=await fetch("https://connect.squareupsandbox.com/v2/refunds",{method:"POST",redirect:"manual",signal:AbortSignal.timeout(12000),headers:{Authorization:"Bearer "+env.SQUARE_SANDBOX_ACCESS_TOKEN,"Square-Version":"2026-09-16","Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({idempotency_key:key,amount_money:{amount:v.amount_cents,currency:"USD"},payment_id:payment.provider_payment_id,reason:"Nexus CRM POS partial sandbox refund test"})});}
   catch(error){const timedOut=error?.name==="TimeoutError"||error?.name==="AbortError";return json({error:timedOut?"Square Sandbox refund request timed out; outcome unknown":"Square Sandbox refund transport failed; outcome unknown",failureCode:timedOut?"SQUARE_REFUND_TIMEOUT":"SQUARE_REFUND_NETWORK",retrySameOperation:false,operationPending:true,recorded:false},503);}
   if(response.status>=300&&response.status<400)return json({error:"Square redirect blocked"},502);
   const data=await response.json().catch(()=>null);
   if(!response.ok)return json({error:"Square Sandbox refund request rejected",providerStatus:response.status,providerErrors:(data?.errors||[]).map(x=>x.code).slice(0,3)},409);
   const refund=data?.refund;
   if(!refund?.id||refund.payment_id!==payment.provider_payment_id||refund.amount_money?.amount!==v.amount_cents||refund.amount_money?.currency!=="USD")return json({error:"Square refund response mismatch; investigate before retry"},502);
   if(refund.status!=="COMPLETED")return json({created:true,recorded:false,refund_id:refund.id,status:refund.status,message:"Square refund not yet completed; retry the same test later to verify."},202);
   const verifyRequest=new Request(new URL("/api/pos/square/sandbox-refund-verify",request.url),{method:"POST",headers:request.headers,body:JSON.stringify({refund_id:refund.id,sale_id:v.sale_id,amount_cents:v.amount_cents,operation_id:v.operation_id})});
   return onRequest({request:verifyRequest,env});
  }
  if(path==="/api/pos/square/sandbox-refund-verify"&&method==="POST"){
   if(user.role!=="owner")return json({error:"Owner access required"},403);
   if(env.SQUARE_ENVIRONMENT!=="sandbox")return json({error:"Sandbox only"},403);
   const v=await bodyOf(request);
   if(!/^[A-Za-z0-9_-]{8,200}$/.test(v.refund_id||"")||!/^[a-f0-9-]{36}$/i.test(v.sale_id||"")||!Number.isSafeInteger(v.amount_cents)||v.amount_cents<1)return json({error:"Invalid refund, sale, or amount"},400);
   if(!/^[a-f0-9-]{36}$/i.test(v.operation_id||""))return json({error:"Stable refund operation ID required"},400);
   const sale=await db.prepare("SELECT status,total_cents,refunded_cents FROM pos_sales WHERE tenant_id=? AND id=?").bind(tenant,v.sale_id).first();
   if(!sale||!["completed","partially_refunded","refunded"].includes(sale.status))return json({error:"Paid sale not found"},404);
   const existing=await db.prepare("SELECT tenant_id,sale_id,amount_cents,idempotency_key FROM pos_refunds WHERE provider_refund_id=?").bind(v.refund_id).first();
   const expectedRefundKey="nxrf_"+v.operation_id.replace(/-/g,"").toLowerCase();
   if(existing)return existing.tenant_id===tenant&&existing.sale_id===v.sale_id&&existing.amount_cents===v.amount_cents&&existing.idempotency_key===expectedRefundKey?json({verified:true,recorded:true,duplicate:true,refund_id:v.refund_id,sale_id:v.sale_id,amount_cents:v.amount_cents}):json({error:"Refund ID already used for another operation"},409);
   if(v.amount_cents>sale.total_cents-sale.refunded_cents)return json({error:"Refund exceeds remaining balance"},409);
   const payment=await db.prepare("SELECT provider_payment_id FROM pos_square_sandbox_payment_attempts WHERE tenant_id=? AND sale_id=? AND status='reconciled' AND provider_payment_id IS NOT NULL").bind(tenant,v.sale_id).first();
   if(!payment)return json({error:"Verified Square payment not found"},409);
   const result=await verifySandboxRefund({refundId:v.refund_id,paymentId:payment.provider_payment_id,amountCents:v.amount_cents,env});
   if(!result.verified)return json({verified:false,reason:result.reason},409);
   const refundKey="nxrf_"+v.operation_id.replace(/-/g,"").toLowerCase();
   const reserved=await db.prepare("SELECT tenant_id,sale_id,amount_cents,payment_id,status FROM pos_square_sandbox_refund_operations WHERE operation_key=?").bind(refundKey).first();
   if(!reserved||reserved.tenant_id!==tenant||reserved.sale_id!==v.sale_id||reserved.amount_cents!==v.amount_cents||reserved.payment_id!==payment.provider_payment_id||reserved.status!=="pending")return json({error:"Matching pending refund reservation required"},409);
   const stamp=now();
   await db.batch([
    db.prepare("INSERT INTO pos_refunds(id,tenant_id,sale_id,amount_cents,reason,provider_refund_id,idempotency_key,created_at) SELECT ?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM pos_refunds WHERE provider_refund_id=?) AND EXISTS(SELECT 1 FROM pos_sales WHERE tenant_id=? AND id=? AND status IN ('completed','partially_refunded') AND total_cents-refunded_cents>=?)").bind(crypto.randomUUID(),tenant,v.sale_id,v.amount_cents,"Verified Square Sandbox refund",v.refund_id,refundKey,stamp,v.refund_id,tenant,v.sale_id,v.amount_cents),
    db.prepare("UPDATE pos_sales SET refunded_cents=COALESCE((SELECT SUM(amount_cents) FROM pos_refunds WHERE tenant_id=? AND sale_id=?),0),status=CASE WHEN COALESCE((SELECT SUM(amount_cents) FROM pos_refunds WHERE tenant_id=? AND sale_id=?),0)=total_cents THEN 'refunded' WHEN COALESCE((SELECT SUM(amount_cents) FROM pos_refunds WHERE tenant_id=? AND sale_id=?),0)>0 THEN 'partially_refunded' ELSE status END WHERE tenant_id=? AND id=?").bind(tenant,v.sale_id,tenant,v.sale_id,tenant,v.sale_id,tenant,v.sale_id)
   ]);
   const recorded=await db.prepare("SELECT sale_id,amount_cents FROM pos_refunds WHERE provider_refund_id=?").bind(v.refund_id).first();
   if(!recorded||recorded.sale_id!==v.sale_id||recorded.amount_cents!==v.amount_cents)return json({error:"Refund ledger was not recorded; investigate before retry"},409);
   // Unknown provider outcomes stay locked; release only after verified ledger recording.
   await db.prepare("UPDATE pos_square_sandbox_refund_operations SET status='verified' WHERE operation_key=? AND tenant_id=? AND sale_id=? AND amount_cents=? AND status='pending'").bind(refundKey,tenant,v.sale_id,v.amount_cents).run();
   const updated=await db.prepare("SELECT status,refunded_cents FROM pos_sales WHERE tenant_id=? AND id=?").bind(tenant,v.sale_id).first();
   return json({verified:true,recorded:true,refund_id:v.refund_id,sale_id:v.sale_id,amount_cents:v.amount_cents,status:updated.status,refunded_cents:updated.refunded_cents});
  }
  if(path==="/api/pos/export"&&method==="GET"){
   // Owner-only business record export. The browser encrypts it with a separate
   // user-chosen passphrase. No passwords, sessions, tokens, or card data included.
   if(user.role!=="owner")return json({error:"Owner required for POS export"},403);
   const defs=[
    ["pos_products","id,sku,name,price_cents,stock_quantity,active,created_at,updated_at"],
    ["pos_sales","id,customer_id,status,subtotal_cents,tax_cents,total_cents,refunded_cents,currency,idempotency_key,created_at,completed_at"],
    ["pos_sale_items","id,sale_id,product_id,product_name,quantity,unit_price_cents,line_total_cents"],
    ["pos_inventory_movements","id,product_id,sale_id,quantity_delta,reason,created_at"],
    ["pos_refunds","id,sale_id,amount_cents,reason,provider_refund_id,idempotency_key,created_at"],
    ["pos_payment_events","id,sale_id,provider,provider_event_id,event_type,amount_cents,created_at"]
   ];
   const queries=defs.map(([table,columns])=>db.prepare("SELECT "+columns+" FROM "+table+" WHERE tenant_id=? ORDER BY id LIMIT 1001").bind(tenant));
   const results=await db.batch(queries),records={},counts={};
   for(let i=0;i<defs.length;i++){
    const table=defs[i][0],list=results[i]?.results||[];
    if(list.length>1000)return json({error:"POS export exceeds current safe record limit"},413);
    records[table]=list;counts[table]=list.length;
   }
   return json({format:"nexus-pos-company-export-v1",schemaVersion:1,
    companyScoped:true,createdAt:now(),counts,records,
    encryptedOnServer:false,cardDataIncluded:false});
  }
  if(path==="/api/pos/licensing"&&method==="GET"){
   const plans=await db.prepare("SELECT code,label,price_cents,currency,billing_period FROM nexus_license_plan_catalog WHERE published=0 ORDER BY price_cents").all();
   const license=await db.prepare("SELECT id,plan_code,status,activated_at,expires_at FROM nexus_tenant_licenses WHERE tenant_id=? LIMIT 1").bind(tenant).first();
   return json({plans:plans.results,license:license||{status:"unlicensed"},proposedOnly:true,
    purchasesEnabled:false,subscriptionBilling:false,paymentProcessing:false});
  }
  if(path==="/api/pos/products"&&method==="GET"){
   const r=await db.prepare("SELECT id,sku,name,price_cents,stock_quantity,active FROM pos_products WHERE tenant_id=? ORDER BY name LIMIT 500").bind(tenant).all();
   return json({items:r.results});
  }
  if(path==="/api/pos/products"&&method==="POST"){
   const v=await bodyOf(request);
   if(typeof v.sku!=="string"||!/^[-A-Za-z0-9_]{1,60}$/.test(v.sku)||typeof v.name!=="string"||!v.name.trim()||v.name.length>200||!Number.isSafeInteger(v.price_cents)||v.price_cents<0||v.price_cents>100000000||!Number.isSafeInteger(v.stock_quantity)||v.stock_quantity<0||v.stock_quantity>1000000)return json({error:"Invalid product"},400);
   const id=crypto.randomUUID(),t=now();
   const writes=[db.prepare("INSERT INTO pos_products(id,tenant_id,sku,name,price_cents,stock_quantity,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").bind(id,tenant,v.sku,v.name.trim(),v.price_cents,v.stock_quantity,t,t)];
   if(v.stock_quantity>0){
    writes.push(db.prepare("INSERT INTO pos_inventory_movements(id,tenant_id,product_id,sale_id,quantity_delta,reason,created_at) VALUES(?,?,?,?,?,'restock',?)").bind(crypto.randomUUID(),tenant,id,null,v.stock_quantity,t));
   }
   // Both rows commit together, so opening stock always has an auditable movement.
   await db.batch(writes);
   return json({id},201);
  }
  if(path==="/api/pos/sales/void"&&method==="POST"){
   // This records cancellation of an UNPAID checkout only: never a Square refund.
   const v=await bodyOf(request);
   if(typeof v.sale_id!=="string"||!/^[a-f0-9]{8}-[a-f0-9-]{27,31}$/i.test(v.sale_id)||v.confirm!=="VOID UNPAID SALE")
    return json({error:"Valid unpaid receipt ID and confirmation required"},400);
   const existing=await db.prepare("SELECT status FROM pos_sales WHERE tenant_id=? AND id=?").bind(tenant,v.sale_id).first();
   if(!existing)return json({error:"Sale not found for this company"},404);
   if(existing.status==="voided")return json({id:v.sale_id,status:"voided",duplicate:true,payment_charged:false,refund_processed:false});
   if(existing.status!=="pending")return json({error:"Only pending/unpaid sales can be voided"},409);
   const paymentAttempt=await db.prepare("SELECT status FROM pos_square_sandbox_payment_attempts WHERE tenant_id=? AND sale_id=? AND status!='failed' LIMIT 1").bind(tenant,v.sale_id).first();
   if(paymentAttempt&&paymentAttempt.status!=="failed")return json({error:"Square payment attempt exists; resolve its status before voiding this sale"},409);
   // D1 trigger 013 atomically restores inventory exactly once on pending -> voided.
   const result=await db.prepare("UPDATE pos_sales SET status='voided' WHERE tenant_id=? AND id=? AND status='pending'").bind(tenant,v.sale_id).run();
   const changed=Number(result?.meta?.changes??result?.changes??0);
   if(changed!==1){
    const latest=await db.prepare("SELECT status FROM pos_sales WHERE tenant_id=? AND id=?").bind(tenant,v.sale_id).first();
    if(latest?.status==="voided")return json({id:v.sale_id,status:"voided",duplicate:true,payment_charged:false,refund_processed:false});
    return json({error:"Sale state changed; refresh before retrying"},409);
   }
   return json({id:v.sale_id,status:"voided",inventory_restored:true,payment_charged:false,refund_processed:false});
  }
  if(path==="/api/pos/sales"&&method==="GET"){
   const r=await db.prepare("SELECT s.id,s.customer_id,c.name AS customer_name,s.status,s.subtotal_cents,s.tax_cents,s.total_cents,s.created_at FROM pos_sales s LEFT JOIN customers c ON c.id=s.customer_id AND c.tenant_id=s.tenant_id WHERE s.tenant_id=? ORDER BY s.created_at DESC LIMIT 100").bind(tenant).all();
   return json({items:r.results});
  }
  if(path==="/api/pos/sales"&&method==="POST"){
   const v=await bodyOf(request);
   if(typeof v.idempotency_key!=="string"||! /^[a-zA-Z0-9_-]{8,100}$/.test(v.idempotency_key)||!Array.isArray(v.items)||v.items.length<1||v.items.length>50||!Number.isSafeInteger(v.tax_cents)||v.tax_cents!==0)return json({error:"Invalid sale"},400);
   // An optional POS customer MUST be from the same authenticated CRM company.
   // The browser cannot override tenant_id, price, or company ownership.
   const customerId=v.customer_id===null||v.customer_id===undefined||v.customer_id===""?null:v.customer_id;
   if(customerId!==null){
    if(typeof customerId!=="string"||!/^[a-f0-9]{8}-[a-f0-9-]{27,31}$/i.test(customerId))return json({error:"Invalid CRM customer reference"},400);
    const approved=await db.prepare("SELECT id FROM customers WHERE tenant_id=? AND id=?").bind(tenant,customerId).first();
    if(!approved)return json({error:"CRM customer not found in this company"},404);
   }
   const old=await db.prepare("SELECT id,total_cents,status FROM pos_sales WHERE tenant_id=? AND idempotency_key=?").bind(tenant,v.idempotency_key).first();
   if(old)return json({id:old.id,total_cents:old.total_cents,status:old.status,payment_charged:false,recorded_only:true,duplicate:true});
   const qty=new Map();
   for(const item of v.items){if(typeof item.product_id!=="string"||!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>1000)return json({error:"Invalid line"},400);qty.set(item.product_id,(qty.get(item.product_id)||0)+item.quantity)}
   if(qty.size>50)return json({error:"Too many products"},400);
   const lines=[];let subtotal=0;
   for(const [id,quantity] of qty){const p=await db.prepare("SELECT id,name,price_cents,stock_quantity FROM pos_products WHERE tenant_id=? AND id=? AND active=1").bind(tenant,id).first();if(!p||p.stock_quantity<quantity)return json({error:"Product unavailable or insufficient stock"},409);const amount=p.price_cents*quantity;if(!Number.isSafeInteger(amount))return json({error:"Amount overflow"},400);subtotal+=amount;lines.push({p,quantity,amount})}
   if(!Number.isSafeInteger(subtotal)||subtotal+v.tax_cents>1000000000)return json({error:"Sale amount too large"},400);
   const saleId=crypto.randomUUID(),t=now(),stmts=[db.prepare("INSERT INTO pos_sales(id,tenant_id,customer_id,status,subtotal_cents,tax_cents,total_cents,idempotency_key,created_at,completed_at) VALUES(?,?,?,'pending',?,?,?,?,?,NULL)").bind(saleId,tenant,customerId,subtotal,0,subtotal,v.idempotency_key,t)];
   for(const {p,quantity,amount} of lines){
    stmts.push(db.prepare("UPDATE pos_products SET stock_quantity=stock_quantity-?,updated_at=? WHERE tenant_id=? AND id=?").bind(quantity,t,tenant,p.id));
    stmts.push(db.prepare("INSERT INTO pos_sale_items(id,tenant_id,sale_id,product_id,product_name,quantity,unit_price_cents,line_total_cents) VALUES(?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),tenant,saleId,p.id,p.name,quantity,p.price_cents,amount));
    stmts.push(db.prepare("INSERT INTO pos_inventory_movements(id,tenant_id,product_id,sale_id,quantity_delta,reason,created_at) VALUES(?,?,?,?,?,'sale',?)").bind(crypto.randomUUID(),tenant,p.id,saleId,-quantity,t));
   }
   await db.batch(stmts);
   return json({id:saleId,total_cents:subtotal,status:"pending",payment_charged:false,recorded_only:true},201);
  }
  return json({error:"Not found"},404);
 }catch(e){if(/UNIQUE constraint failed/.test(String(e)))return json({error:"Duplicate SKU or request"},409);if(/CHECK constraint failed/.test(String(e)))return json({error:"Stock or amount constraint failed"},409);return json({error:"POS request failed"},500)}
}
