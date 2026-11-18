// List only companies for the verified Supabase Auth user, never arbitrary user IDs.
import {authenticatedUser,respond,allow,database} from "../../lib/nexus-pos-server.js";
export default async function handler(req,res){
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
 }catch{return respond(res,503,{error:"Company list currently unavailable"})}
}
