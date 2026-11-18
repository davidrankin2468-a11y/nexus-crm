import {actor,respond,allow,database,validSale,checkWrite} from "../../lib/nexus-pos-server.js";
export default async function handler(req,res){
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
  return respond(res,201,{id:saleId,recorded_only:true,payment_charged:false});
 }catch{return respond(res,503,{error:"Sale rejected or service unavailable. Reuse the original idempotency key before retrying."})}
}
