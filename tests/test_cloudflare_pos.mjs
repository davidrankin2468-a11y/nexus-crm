import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=readFileSync("cloud-app/functions/api/pos/[[path]].js","utf8");
const {onRequest}=await import("data:text/javascript;base64,"+Buffer.from(source).toString("base64"));
const cookie="__Host-nexuscrm="+"a".repeat(64);

function db(role="owner",options={}){
 const calls=[];
 let batches=[];
 const instance={
  calls,
  get batches(){return batches},
  prepare(sql){
   const statement={
    sql,args:[],
    bind(...args){this.args=args;calls.push(this);return this},
    async first(){
     if(sql.includes("FROM sessions"))return role?{tenant_id:"tenant-a",role,csrf_token:"csrf-test"}:null;
     if(sql.includes("idempotency_key"))return options.duplicate||null;
     if(sql.includes("FROM customers"))return options.customer||null;
     if(sql.includes("FROM pos_products")&&sql.includes("active=1"))return options.product||{id:"p1",name:"Example",price_cents:250,stock_quantity:3};
     return null;
    },
    async all(){return {results:options.results||[{id:"p1",sku:"TEST",name:"Example",price_cents:250,stock_quantity:3,active:1}]}},
    async run(){return {success:true}}
   };return statement;
  },
  async batch(stmts){batches.push(stmts);return stmts.map(()=>({success:true}))}
 };
 return instance;
}
async function call(url,{method="GET",role="owner",body=null,headers={},options={}}={}){
 const d=db(role,options);
 const h=new Headers(headers);
 if(!h.has("Cookie"))h.set("Cookie",cookie);
 if(method!=="GET"&&body!==null){h.set("Content-Type","application/json");h.set("Origin","https://pos.test");if(!h.has("X-Nexus-CSRF"))h.set("X-Nexus-CSRF","csrf-test")}
 const request=new Request("https://pos.test"+url,{method,headers:h,body:body===null?undefined:JSON.stringify(body)});
 const response=await onRequest({request,env:{DB:d}});
 return {response,data:await response.json(),db:d};
}
test("no database binding fails closed (503)",async()=>{
 const request=new Request("https://pos.test/api/pos/products");
 const response=await onRequest({request,env:{}});assert.equal(response.status,503);
});
test("unauthenticated GET returns 401",async()=>{
 const request=new Request("https://pos.test/api/pos/products");
 const response=await onRequest({request,env:{DB:db()}});
 assert.equal(response.status,401);
});
test("employee cannot access POS",async()=>{
 const r=await call("/api/pos/products",{role:"employee"});assert.equal(r.response.status,403);
});
test("all inventory reads bind authenticated tenant",async()=>{
 const r=await call("/api/pos/products");
 assert.equal(r.response.status,200);
 assert.equal(r.data.items.length,1);
 const query=r.db.calls.find(c=>c.sql.includes("FROM pos_products")&&c.sql.includes("ORDER BY"));
 assert.deepEqual(query.args,["tenant-a"]);
});
test("invalid HTTP method is rejected",async()=>{
 const r=await call("/api/pos/products",{method:"DELETE"});assert.equal(r.response.status,405);
});
test("cross origin POST is rejected",async()=>{
 const d=db();const request=new Request("https://pos.test/api/pos/products",{method:"POST",headers:{"Content-Type":"application/json","Cookie":cookie,"Origin":"https://evil.invalid","X-Nexus-CSRF":"csrf-test"},body:JSON.stringify({sku:"P1",name:"P",price_cents:100,stock_quantity:1})});
 const res=await onRequest({request,env:{DB:d}});assert.equal(res.status,403);
});
test("missing CSRF rejects POST",async()=>{
 const r=await call("/api/pos/products",{method:"POST",body:{sku:"P1",name:"P",price_cents:100,stock_quantity:1},headers:{"X-Nexus-CSRF":"incorrect"}});
 assert.equal(r.response.status,403);assert.equal(r.db.calls.some(c=>c.sql.startsWith("INSERT")),false);
});
test("product writes insert session tenant rather than request company",async()=>{
 const r=await call("/api/pos/products",{method:"POST",body:{sku:"P1",name:"Test",price_cents:100,stock_quantity:1,tenant_id:"tenant-other"}});
 assert.equal(r.response.status,201);
 const s=r.db.calls.find(c=>c.sql.startsWith("INSERT INTO pos_products"));
 assert.equal(s.args[1],"tenant-a");
});
test("invalid sale quantity rejected before writing",async()=>{
 const r=await call("/api/pos/sales",{method:"POST",body:{idempotency_key:"key-number-001",tax_cents:0,items:[{product_id:"p1",quantity:0}]}});
 assert.equal(r.response.status,400);assert.equal(r.db.batches.length,0);
});
test("insufficient inventory prevents sale",async()=>{
 const r=await call("/api/pos/sales",{method:"POST",body:{idempotency_key:"key-number-002",tax_cents:0,items:[{product_id:"p1",quantity:4}]}});
 assert.equal(r.response.status,409);assert.equal(r.db.batches.length,0);
});
test("same idempotency key returns prior receipt",async()=>{
 const r=await call("/api/pos/sales",{method:"POST",body:{idempotency_key:"key-number-003",tax_cents:0,items:[{product_id:"p1",quantity:1}]},options:{duplicate:{id:"receipt-prior",total_cents:250,status:"pending"}}});
 assert.equal(r.response.status,200);assert.equal(r.data.duplicate,true);assert.equal(r.db.batches.length,0);
});
test("retry of a completed sale retains paid lifecycle status and cannot create a second sale",async()=>{
 const r=await call("/api/pos/sales",{method:"POST",body:{idempotency_key:"key-completed-001",tax_cents:0,items:[{product_id:"p1",quantity:1}]},options:{duplicate:{id:"completed-original",total_cents:250,status:"completed"}}});
 assert.equal(r.response.status,200);
 assert.equal(r.data.duplicate,true);
 assert.equal(r.data.status,"completed");
 assert.equal(r.data.payment_charged,false);
 assert.equal(r.db.batches.length,0);
});
test("sale writes are batched and scoped to session tenant",async()=>{
 const r=await call("/api/pos/sales",{method:"POST",body:{idempotency_key:"key-number-004",tax_cents:0,items:[{product_id:"p1",quantity:2}]}});
 assert.equal(r.response.status,201);assert.equal(r.data.recorded_only,true);
 assert.equal(r.db.batches.length,1);
 const statements=r.db.batches[0];
 assert.equal(statements.length,4);
 const stock=statements.find(s=>s.sql.startsWith("UPDATE pos_products"));
 assert.equal(stock.args[2],"tenant-a");
 assert.equal(stock.args[0],2);
});

test("record-only checkout stays pending and never claims payment was collected",async()=>{
 const r=await call("/api/pos/sales",{method:"POST",body:{idempotency_key:"test-pending-001",tax_cents:0,items:[{product_id:"p1",quantity:1}]}});
 assert.equal(r.response.status,201);
 assert.equal(r.data.payment_charged,false);
 assert.equal(r.data.status,"pending");
 assert.equal(r.data.recorded_only,true);
 const insert=r.db.batches[0].find(s=>s.sql.startsWith("INSERT INTO pos_sales"));
 assert.match(insert.sql,/'pending'/);
 assert.doesNotMatch(insert.sql,/'completed'/);
 assert.equal(insert.args.length,8);
});
test("client-provided tax is rejected until calculation and collection are implemented",async()=>{
 const r=await call("/api/pos/sales",{method:"POST",body:{idempotency_key:"test-no-tax-001",tax_cents:99,items:[{product_id:"p1",quantity:1}]}});
 assert.equal(r.response.status,400);
 assert.equal(r.db.batches.length,0);
});
test("duplicate checkout response explicitly says pending and unpaid",async()=>{
 const r=await call("/api/pos/sales",{method:"POST",body:{idempotency_key:"retry-idem-01",tax_cents:0,items:[{product_id:"p1",quantity:1}]},options:{duplicate:{id:"prior-01",total_cents:250}}});
 assert.equal(r.response.status,200);
 assert.equal(r.data.duplicate,true);
 assert.equal(r.data.payment_charged,false);
 assert.equal(r.data.status,"pending");
 assert.equal(r.db.batches.length,0);
});

test("POS sale rejects forged cross-company CRM customer before writing",async()=>{
 const r=await call("/api/pos/sales",{
  method:"POST",body:{
   idempotency_key:"cross-tenant-customer-001",tax_cents:0,
   customer_id:"11111111-1111-4111-8111-111111111111",
   items:[{product_id:"p1",quantity:1}]
  }
 });
 assert.equal(r.response.status,404);
 assert.equal(r.db.batches.length,0);
 const q=r.db.calls.find(x=>x.sql.includes("FROM customers"));
 assert.deepEqual(q.args,["tenant-a","11111111-1111-4111-8111-111111111111"]);
});
test("POS sale preserves approved CRM customer association",async()=>{
 const id="11111111-1111-4111-8111-111111111111";
 const r=await call("/api/pos/sales",{
  method:"POST",options:{customer:{id}},body:{
   idempotency_key:"approved-crm-customer-01",tax_cents:0,customer_id:id,
   items:[{product_id:"p1",quantity:1}]
  }
 });
 assert.equal(r.response.status,201);
 const insert=r.db.batches[0].find(x=>x.sql.startsWith("INSERT INTO pos_sales"));
 assert.equal(insert.args[2],id);
});
