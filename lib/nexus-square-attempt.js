// Prepare a Square Sandbox attempt using only a server-read, company-scoped POS sale.
// Does not contact Square or mark any sale paid.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function prepareSquareSandboxAttempt({companyId,saleId,idempotencyKey,locationId,db}={}){
 if(!uuid.test(companyId||"")||!uuid.test(saleId||"")||
  typeof idempotencyKey!=="string"||!/^[A-Za-z0-9_-]{8,45}$/.test(idempotencyKey)||
  typeof locationId!=="string"||!/^[A-Za-z0-9_-]{4,100}$/.test(locationId)||
  typeof db!=="function")return {prepared:false,reason:"INVALID_INPUT"};
 try{
  const q=new URLSearchParams({company_id:"eq."+companyId,id:"eq."+saleId,
   select:"id,status,total_cents",limit:"1"});
  const sales=await db("/rest/v1/nexus_pos_sales?"+q);
  const sale=Array.isArray(sales)&&sales.length===1?sales[0]:null;
  if(!sale||sale.id!==saleId||sale.status!=="pending"||
   !Number.isSafeInteger(sale.total_cents)||sale.total_cents<1||sale.total_cents>100000000)
   return {prepared:false,reason:"SALE_NOT_PAYABLE"};
  const attempt={company_id:companyId,sale_id:saleId,idempotency_key:idempotencyKey,
   square_location_id:locationId,amount_cents:sale.total_cents,currency:"USD",status:"prepared"};
  // Idempotency is enforced by UNIQUE(company_id,idempotency_key) in SQL.
  // On a duplicate, fail closed; never create a second attempt with a new key.
  const saved=await db("/rest/v1/nexus_square_sandbox_payment_attempts",{
   method:"POST",body:attempt,prefer:"return=representation"});
  const record=Array.isArray(saved)&&saved.length===1?saved[0]:null;
  if(!record||record.company_id!==companyId||record.sale_id!==saleId||
   record.amount_cents!==sale.total_cents||record.idempotency_key!==idempotencyKey)
   return {prepared:false,reason:"PERSISTENCE_UNCONFIRMED"};
  return {prepared:true,attemptId:record.id,amountCents:record.amount_cents,referenceId:saleId};
 }catch{return {prepared:false,reason:"PERSISTENCE_UNAVAILABLE_OR_DUPLICATE"}}
}
