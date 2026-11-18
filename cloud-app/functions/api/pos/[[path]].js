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
  if(path==="/api/pos/sales"&&method==="GET"){
   const r=await db.prepare("SELECT id,status,subtotal_cents,tax_cents,total_cents,created_at FROM pos_sales WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100").bind(tenant).all();
   return json({items:r.results});
  }
  if(path==="/api/pos/sales"&&method==="POST"){
   const v=await bodyOf(request);
   if(typeof v.idempotency_key!=="string"||! /^[a-zA-Z0-9_-]{8,100}$/.test(v.idempotency_key)||!Array.isArray(v.items)||v.items.length<1||v.items.length>50||!Number.isSafeInteger(v.tax_cents)||v.tax_cents!==0)return json({error:"Invalid sale"},400);
   const old=await db.prepare("SELECT id,total_cents FROM pos_sales WHERE tenant_id=? AND idempotency_key=?").bind(tenant,v.idempotency_key).first();
   if(old)return json({id:old.id,total_cents:old.total_cents,status:"pending",payment_charged:false,recorded_only:true,duplicate:true});
   const qty=new Map();
   for(const item of v.items){if(typeof item.product_id!=="string"||!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>1000)return json({error:"Invalid line"},400);qty.set(item.product_id,(qty.get(item.product_id)||0)+item.quantity)}
   if(qty.size>50)return json({error:"Too many products"},400);
   const lines=[];let subtotal=0;
   for(const [id,quantity] of qty){const p=await db.prepare("SELECT id,name,price_cents,stock_quantity FROM pos_products WHERE tenant_id=? AND id=? AND active=1").bind(tenant,id).first();if(!p||p.stock_quantity<quantity)return json({error:"Product unavailable or insufficient stock"},409);const amount=p.price_cents*quantity;if(!Number.isSafeInteger(amount))return json({error:"Amount overflow"},400);subtotal+=amount;lines.push({p,quantity,amount})}
   if(!Number.isSafeInteger(subtotal)||subtotal+v.tax_cents>1000000000)return json({error:"Sale amount too large"},400);
   const saleId=crypto.randomUUID(),t=now(),stmts=[db.prepare("INSERT INTO pos_sales(id,tenant_id,status,subtotal_cents,tax_cents,total_cents,idempotency_key,created_at,completed_at) VALUES(?,?,'pending',?,?,?,?,?,NULL)").bind(saleId,tenant,subtotal,0,subtotal,v.idempotency_key,t)];
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
