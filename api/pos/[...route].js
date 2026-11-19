// Consolidated POS API entry point. Existing handlers retain their original authorization and validation.
import {actor,allow,authenticatedUser,checkWrite,configured,database,passwordSignIn,respond,validProduct,validSale} from "../../lib/nexus-pos-server.js";

// Preserved handler: companies
// List only companies for the verified Supabase Auth user, never arbitrary user IDs.
async function handle_companies(req,res){
 if(!allow(req,res,["GET"]))return;
 const user=await authenticatedUser(req,res);if(!user)return;
 try{
  const query=new URLSearchParams({user_id:"eq."+user.id,select:"company_id,role",limit:"100"});
  const memberships=await database("/rest/v1/nexus_company_members?"+query.toString());
  const allowed=(Array.isArray(memberships)?memberships:[])
    .filter(x=>/^[0-9a-f-]{36}$/i.test(x.company_id)&&["owner","admin"].includes(x.role));
  const ids=[...new Set(allowed.map(x=>x.company_id))];
  if(!ids.length)return respond(res,200,{items:[]});
  const companies=await database("/rest/v1/nexus_companies?"+new URLSearchParams({id:"in.("+ids.join(",")+")",select:"id,name",limit:"100"}));
  const membershipsById=new Map(allowed.map(x=>[x.company_id,x.role]));
  const items=(Array.isArray(companies)?companies:[])
    .filter(x=>membershipsById.has(x.id))
    .map(x=>({id:x.id,name:x.name,role:membershipsById.get(x.id)}))
    .sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  return respond(res,200,{items});
 }catch(err){console.error("POS company lookup failed",{status:Number.isInteger(err?.status)?err.status:null,kind:err?.name==="TimeoutError"?"timeout":"upstream"});return respond(res,503,{error:"Company list currently unavailable"})}
}


// Preserved handler: login
// Invite-only pilot login: exchanges credentials with Supabase Auth. No signup endpoint.
async function handle_login(req,res){
 if(!allow(req,res,["POST"]))return;
 if(!configured())return respond(res,503,{error:"POS backend configuration incomplete"});
 if(!checkWrite(req,res))return;
 const body=req.body;
 if(!body||typeof body!=="object"||Array.isArray(body))return respond(res,400,{error:"Invalid login request"});
 const email=typeof body.email==="string"?body.email.trim().toLowerCase():"";
 const password=body.password;
 if(email.length>254||!/^\S+@\S+\.\S+$/.test(email)||typeof password!=="string"||password.length<8||password.length>1024)
  return respond(res,400,{error:"Email and password required"});
 try{
  const auth=await passwordSignIn(email,password);
  // Browser keeps the access token in memory only; no refresh-token or password is stored.
  return respond(res,200,auth);
 }catch{return respond(res,401,{error:"Sign-in failed. Verify your credentials and account approval."})}
}


// Preserved handler: products
async function handle_products(req,res){
 if(!allow(req,res,["GET","POST"]))return;
 try{
  const a=await actor(req,res);if(!a)return;
  if(req.method==="GET"){
   const q=new URLSearchParams({company_id:"eq."+a.companyId,select:"id,sku,name,price_cents,stock_quantity,active",order:"name.asc",limit:"500"});
   const items=await database("/rest/v1/nexus_pos_products?"+q.toString());
   return respond(res,200,{items});
  }
  if(!checkWrite(req,res))return;
  if(!validProduct(req.body))return respond(res,400,{error:"Invalid product"});
  const p=req.body;
  const id=await database("/rest/v1/rpc/nexus_create_pos_product",{
   method:"POST",
   body:{p_company_id:a.companyId,p_actor_id:a.userId,p_sku:p.sku,p_name:p.name.trim(),p_price_cents:p.price_cents,p_stock_quantity:p.stock_quantity}
  });
  if(typeof id!=="string")throw Error("Missing product reference");
  return respond(res,201,{id});
 }catch{return respond(res,503,{error:"Product service unavailable or request rejected"})}
}


// Preserved handler: receipts
// Read-only, company-scoped unpaid POS receipt. No payment-card or personal data.
async function handle_receipts(req,res){
 if(!allow(req,res,["GET"]))return;
 const a=await actor(req,res);if(!a)return;
 const saleId=String(req.query?.sale_id||"");
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saleId))
  return respond(res,400,{error:"Valid receipt reference required"});
 try{
  const filters=new URLSearchParams({company_id:"eq."+a.companyId,id:"eq."+saleId,
   select:"id,status,subtotal_cents,tax_cents,total_cents,created_at",limit:"1"});
  const sales=await database("/rest/v1/nexus_pos_sales?"+filters.toString());
  if(!Array.isArray(sales)||!sales.length)return respond(res,404,{error:"Receipt not found"});
  const itemFilters=new URLSearchParams({company_id:"eq."+a.companyId,sale_id:"eq."+saleId,
   select:"id,product_name,quantity,unit_price_cents,line_total_cents",limit:"100"});
  const items=await database("/rest/v1/nexus_pos_sale_items?"+itemFilters.toString());
  return respond(res,200,{sale:sales[0],items:Array.isArray(items)?items:[],payment_verified:false});
 }catch{return respond(res,503,{error:"Receipt service temporarily unavailable"})}
}


// Preserved handler: sales
async function handle_sales(req,res){
 if(!allow(req,res,["GET","POST"]))return;
 try{
  const a=await actor(req,res);if(!a)return;
  if(req.method==="GET"){
   const q=new URLSearchParams({company_id:"eq."+a.companyId,select:"id,status,subtotal_cents,tax_cents,total_cents,created_at",order:"created_at.desc",limit:"100"});
   const items=await database("/rest/v1/nexus_pos_sales?"+q.toString());
   return respond(res,200,{items});
  }
  if(!checkWrite(req,res))return;
  if(!validSale(req.body))return respond(res,400,{error:"Invalid sale or nonzero tax. No payment was charged."});
  const {items,idempotency_key}=req.body;
  const saleId=await database("/rest/v1/rpc/nexus_record_pos_sale",{method:"POST",body:{p_company_id:a.companyId,p_actor_id:a.userId,p_items:items,p_idempotency_key:idempotency_key}});
  return respond(res,201,{id:saleId,status:"pending",recorded_only:true,payment_charged:false});
 }catch{return respond(res,503,{error:"Sale rejected or service unavailable. Reuse the original idempotency key before retrying."})}
}


// Preserved handler: status
function handle_status(req,res){
 if(!allow(req,res,["GET"]))return;
 return respond(res,configured()?200:503,{status:configured()?"configured":"configuration_required",mode:"development",paymentProcessing:false});
}


const handlers={"companies":handle_companies,"login":handle_login,"products":handle_products,"receipts":handle_receipts,"sales":handle_sales,"status":handle_status};
export default async function handler(req,res){
 const segments=Array.isArray(req.query?.route)?req.query.route:[req.query?.route].filter(Boolean);
 const route=segments.length===1?String(segments[0]):new URL(req.url||"/", "https://localhost").pathname.split("/").filter(Boolean).slice(2).join("/");
 const selected=handlers[route];
 if(!selected)return respond(res,404,{error:"Unknown POS route"});
 return selected(req,res);
}
