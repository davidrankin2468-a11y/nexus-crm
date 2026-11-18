// Read-only, company-scoped unpaid POS receipt. No payment-card or personal data.
import {actor,respond,allow,database} from "../../lib/nexus-pos-server.js";
export default async function handler(req,res){
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
