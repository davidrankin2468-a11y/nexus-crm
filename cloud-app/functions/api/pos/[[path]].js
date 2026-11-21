// Nexus POS development API: separate Pages route; never handles card details.
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
const now=()=>Math.floor(Date.now()/1000);
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,"0")).join("");
async function userFor(request,db){
 const token=(request.headers.get("Cookie")||"").match(/(?:^|;\s*)__Host-nexuscrm=([a-f0-9]{64})(?:;|$)/)?.[1];
 if(!token)return null;
 return db.prepare("SELECT u.tenant_id,u.role,s.csrf_token FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.disabled_at IS NULL").bind(await hash(token),now()).first();
}
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
   // Never cancel an unpaid checkout while a Square attempt may still charge.
   // Even "prepared" attempts require explicit payment-status resolution first.
   const paymentAttempt=await db.prepare("SELECT status FROM pos_square_sandbox_payment_attempts WHERE tenant_id=? AND sale_id=? AND status!='failed' LIMIT 1").bind(tenant,v.sale_id).first();
   if(paymentAttempt&&paymentAttempt.status!=="failed")
    return json({error:"Square payment attempt exists; resolve its status before voiding this sale"},409);
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
