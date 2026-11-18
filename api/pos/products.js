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
  const id=await database("/rest/v1/rpc/nexus_create_pos_product",{
   method:"POST",
   body:{p_company_id:a.companyId,p_actor_id:a.userId,p_sku:p.sku,p_name:p.name.trim(),p_price_cents:p.price_cents,p_stock_quantity:p.stock_quantity}
  });
  if(typeof id!=="string")throw Error("Missing product reference");
  return respond(res,201,{id});
 }catch{return respond(res,503,{error:"Product service unavailable or request rejected"})}
}
