import {actor,respond,allow,database,validProduct,checkWrite} from "../../lib/nexus-pos-server.js";
export default async function handler(req,res){
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
  const record={company_id:a.companyId,sku:p.sku,name:p.name.trim(),price_cents:p.price_cents,stock_quantity:p.stock_quantity};
  const items=await database("/rest/v1/nexus_pos_products?select=id",{method:"POST",body:record,prefer:"return=representation"});
  return respond(res,201,{id:items?.[0]?.id});
 }catch{return respond(res,503,{error:"Product service unavailable or request rejected"})}
}
