import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";

// Use the exact shipping D1 POS schema, with a minimal session/auth fixture.
const source=readFileSync("cloud-app/functions/api/pos/[[path]].js","utf8");
const {onRequest}=await import("data:text/javascript;base64,"+Buffer.from(source).toString("base64"));

function sqliteD1(){
 const sql=new DatabaseSync(":memory:");
 sql.exec("PRAGMA foreign_keys = ON;");
 sql.exec(`CREATE TABLE tenants(id TEXT PRIMARY KEY,name TEXT NOT NULL,created_at INTEGER NOT NULL);
 CREATE TABLE users(id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), role TEXT NOT NULL, disabled_at INTEGER);
 CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),csrf_token TEXT NOT NULL,expires_at INTEGER NOT NULL);`);
 sql.exec(readFileSync("cloud-app/migrations/007_pos_multi_company.sql","utf8"));
 const db={
  prepare(query){
   const state={args:[]};
   return {
    sql:query,
    get args(){return state.args},
    bind(...args){state.args=args;return this},
    async first(){return sql.prepare(query).get(...state.args)||null},
    async all(){return {results:sql.prepare(query).all(...state.args)}},
    async run(){return sql.prepare(query).run(...state.args)}
   };
  },
  async batch(stmts){
   sql.exec("BEGIN");
   try{
    const out=[];
    for(const stmt of stmts)out.push(sql.prepare(stmt.sql).run(...stmt.args));
    sql.exec("COMMIT");return out;
   }catch(e){sql.exec("ROLLBACK");throw e}
  }
 };
 return {sql,db};
}
const hash=v=>createHash("sha256").update(v).digest("hex");
const tokA="a".repeat(64),tokB="b".repeat(64),tokEmployee="c".repeat(64);
const f=sqliteD1();
function seed(){
 const t=Math.floor(Date.now()/1000)+3600;
 f.sql.prepare("INSERT INTO tenants(id,name,created_at) VALUES (?,'Fictional A',1)").run("tenant-a");
 f.sql.prepare("INSERT INTO tenants(id,name,created_at) VALUES (?,'Fictional B',1)").run("tenant-b");
 for(const [id,tenant,role,token] of [
  ["owner-a","tenant-a","owner",tokA],["owner-b","tenant-b","admin",tokB],
  ["employee-a","tenant-a","employee",tokEmployee]]){
  f.sql.prepare("INSERT INTO users(id,tenant_id,role,disabled_at) VALUES (?,?,?,NULL)").run(id,tenant,role);
  f.sql.prepare("INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES (?,?,?,?)").run(hash(token),id,"valid-csrf",t);
 }
}
async function requestPOS(path,{method="GET",token=tokA,csrf="valid-csrf",origin="https://pos.test",body}={}){
 const headers=new Headers({"Cookie":"__Host-nexuscrm="+token});
 if(method==="POST"){
  headers.set("Origin",origin);
  headers.set("Content-Type","application/json");
  headers.set("X-Nexus-CSRF",csrf);
 }
 const request=new Request("https://pos.test"+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 const response=await onRequest({request,env:{DB:f.db}});
 let data;try{data=await response.json()}catch{data=null}
 return {status:response.status,data};
}
const product=(sku,price,stock,tenant_id)=>({sku,name:"Test "+sku,price_cents:price,stock_quantity:stock,tenant_id});
const cart=(id,key,qty=1)=>({idempotency_key:key,tax_cents:0,items:[{product_id:id,quantity:qty}]});
test("integrated authenticated company-isolated checkout with real D1 POS schema",async t=>{
 seed();
 await t.test("company A creates a product without accepting forged tenant ID",async()=>{
  const r=await requestPOS("/api/pos/products",{method:"POST",body:product("SKU-A",550,2,"tenant-b")});
  assert.equal(r.status,201);
  assert.equal(f.sql.prepare("SELECT tenant_id FROM pos_products WHERE id=?").get(r.data.id).tenant_id,"tenant-a");
  const movement=f.sql.prepare("SELECT tenant_id,reason,quantity_delta FROM pos_inventory_movements WHERE product_id=?").get(r.data.id);
  assert.equal(movement.tenant_id,"tenant-a");
  assert.equal(movement.reason,"restock");
  assert.equal(movement.quantity_delta,2);
 });
 let productA,productB;
 await t.test("company B creates separate SKU, sees only company B inventory",async()=>{
  const b=await requestPOS("/api/pos/products",{method:"POST",token:tokB,body:product("SKU-A",800,3,"tenant-a")});
  assert.equal(b.status,201);productB=b.data.id;
  productA=f.sql.prepare("SELECT id FROM pos_products WHERE tenant_id='tenant-a'").get().id;
  const listB=await requestPOS("/api/pos/products",{token:tokB});
  assert.equal(listB.status,200);
  assert.equal(listB.data.items.length,1);
  assert.equal(listB.data.items[0].id,productB);
  const listA=await requestPOS("/api/pos/products");
  assert.equal(listA.data.items.length,1);
  assert.equal(listA.data.items[0].id,productA);
 });
 await t.test("cross-company product checkout is denied",async()=>{
  const r=await requestPOS("/api/pos/sales",{method:"POST",body:cart(productB,"cross-company-key")});
  assert.equal(r.status,409);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM pos_sales").get().n,0);
 });
 let saleId;
 await t.test("a company A checkout records an unpaid receipt and deducts its own stock",async()=>{
  const r=await requestPOS("/api/pos/sales",{method:"POST",body:cart(productA,"real-sql-test-key")});
  assert.equal(r.status,201);
  assert.equal(r.data.status,"pending");
  assert.equal(r.data.payment_charged,false);
  saleId=r.data.id;
  const sale=f.sql.prepare("SELECT status,completed_at,total_cents FROM pos_sales WHERE id=?").get(saleId);
  assert.equal(sale.status,"pending");
  assert.equal(sale.completed_at,null);
  assert.equal(sale.total_cents,550);
  assert.equal(f.sql.prepare("SELECT stock_quantity FROM pos_products WHERE id=?").get(productA).stock_quantity,1);
  assert.equal(f.sql.prepare("SELECT stock_quantity FROM pos_products WHERE id=?").get(productB).stock_quantity,3);
 });
 await t.test("retrying same reference returns same receipt without deducting more stock",async()=>{
  const duplicate=await requestPOS("/api/pos/sales",{method:"POST",body:cart(productA,"real-sql-test-key")});
  assert.equal(duplicate.status,200);
  assert.equal(duplicate.data.id,saleId);
  assert.equal(duplicate.data.duplicate,true);
  assert.equal(f.sql.prepare("SELECT stock_quantity FROM pos_products WHERE id=?").get(productA).stock_quantity,1);
 });
 await t.test("oversell, employee access, wrong CSRF and uncalculated tax are denied",async()=>{
  assert.equal((await requestPOS("/api/pos/sales",{method:"POST",body:cart(productA,"oversell-key-012",2)})).status,409);
  assert.equal((await requestPOS("/api/pos/products",{token:tokEmployee})).status,403);
  assert.equal((await requestPOS("/api/pos/products",{method:"POST",csrf:"wrong",body:product("SKU-X",1,1)})).status,403);
  assert.equal((await requestPOS("/api/pos/sales",{method:"POST",body:{...cart(productA,"tax-key-012"),tax_cents:50}})).status,400);
  assert.equal((await requestPOS("/api/pos/sales",{method:"POST",origin:"https://attacker.invalid",body:cart(productA,"origin-key-012")})).status,403);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM pos_sales").get().n,1);
 });
 await t.test("batch rollback keeps stock and receipts intact when a line write fails",async()=>{
  f.sql.exec("CREATE TRIGGER block_test_line BEFORE INSERT ON pos_sale_items BEGIN SELECT RAISE(ABORT,'intentional test rollback'); END;");
  const r=await requestPOS("/api/pos/sales",{method:"POST",body:cart(productA,"rollback-key-012")});
  assert.equal(r.status,500);
  assert.equal(f.sql.prepare("SELECT stock_quantity FROM pos_products WHERE id=?").get(productA).stock_quantity,1);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM pos_sales").get().n,1);
  f.sql.exec("DROP TRIGGER block_test_line");
 });
 await t.test("simultaneous last-stock attempts create at most one sale",async()=>{
  const responses=await Promise.all([
   requestPOS("/api/pos/sales",{method:"POST",body:cart(productA,"last-stock-01")}),
   requestPOS("/api/pos/sales",{method:"POST",body:cart(productA,"last-stock-02")})
  ]);
  assert.deepEqual(responses.map(x=>x.status).sort(),[201,409]);
  assert.equal(f.sql.prepare("SELECT stock_quantity FROM pos_products WHERE id=?").get(productA).stock_quantity,0);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM pos_sales WHERE tenant_id='tenant-a'").get().n,2);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM pos_sales WHERE tenant_id='tenant-b'").get().n,0);
 });
 f.sql.close();
});
