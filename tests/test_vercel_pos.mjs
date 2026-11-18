import test from 'node:test';
import assert from 'node:assert/strict';
import products from '../api/pos/products.js';
import sales from '../api/pos/sales.js';
import status from '../api/pos/status.js';
import {validProduct,validSale} from '../lib/nexus-pos-server.js';

const companyA='11111111-1111-4111-8111-111111111111',companyB='22222222-2222-4222-8222-222222222222';
const actor='33333333-3333-4333-8333-333333333333',productId='44444444-4444-4444-8444-444444444444';
const calls=[];
process.env.SUPABASE_URL='https://example.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_fictional_test_key';
process.env.SUPABASE_SERVICE_ROLE_KEY='fictional_service_key_only_for_tests';
const oldFetch=globalThis.fetch;
globalThis.fetch=async (url,options)=>{
 const u=new URL(url);
 calls.push({url:u.pathname,query:u.searchParams,body:options.body?JSON.parse(options.body):undefined,authorization:options.headers.Authorization});
 let code=200,out=null;
 if(u.pathname==='/auth/v1/user')out={id:actor};
 else if(u.pathname==='/rest/v1/nexus_company_members')out=u.searchParams.get('company_id')==='eq.'+companyA?[{role:'owner'}]:[];
 else if(u.pathname==='/rest/v1/nexus_pos_products')out=options.method==='POST'?[{id:productId}]:[{id:productId,company_id:companyA,name:'Test item',price_cents:125,stock_quantity:2,active:true}];
 else if(u.pathname==='/rest/v1/nexus_pos_sales')out=[];
 else if(u.pathname==='/rest/v1/rpc/nexus_record_pos_sale')out='55555555-5555-4555-8555-555555555555';
 else{code=404;out={error:'not found'};}
 return {ok:code===200,status:code,json:async()=>out};
};
function res(){return {code:null,headers:{},setHeader(k,v){this.headers[k]=v;return this},status(v){this.code=v;return this},json(v){this.body=v;return this}}}
function req(method='GET',company=companyA,body=undefined,token='goodtoken'.padEnd(35,'x')){
 return {method,headers:{authorization:'Bearer '+token,'x-nexus-company-id':company,'content-type':'application/json',origin:'https://preview.example.com',host:'preview.example.com'},body};
}
test('status reports configured without exposing keys',()=>{const r=res();status(req(),r);assert.equal(r.code,200);assert.equal(JSON.stringify(r.body).includes('service_key'),false)});
test('rejects anonymous access',async()=>{const q=req();delete q.headers.authorization;const r=res();await products(q,r);assert.equal(r.code,401)});
test('rejects company B when actor only belongs to A',async()=>{const r=res();await products(req('GET',companyB),r);assert.equal(r.code,403)});
test('limits product queries to verified company A',async()=>{calls.length=0;const r=res();await products(req(),r);assert.equal(r.code,200);const q=calls.find(x=>x.url==='/rest/v1/nexus_pos_products');assert.equal(q.query.get('company_id'),'eq.'+companyA)});
test('validates cents and inventory bounds',()=>{assert.equal(validProduct({sku:'A1',name:'Valid',price_cents:123,stock_quantity:1}),true);assert.equal(validProduct({sku:'A1',name:'Bad',price_cents:1.5,stock_quantity:1}),false)});
test('product insert receives verified tenant, not forged body company',async()=>{calls.length=0;const body={sku:'B2',name:'Item B',price_cents:100,stock_quantity:4,company_id:companyB};const r=res();await products(req('POST',companyA,body),r);assert.equal(r.code,201);const q=calls.find(x=>x.url==='/rest/v1/nexus_pos_products');assert.equal(q.body.company_id,companyA)});
test('sales prevent duplicate product lines and nonzero client tax',()=>{assert.equal(validSale({items:[{product_id:productId,quantity:1},{product_id:productId,quantity:1}],idempotency_key:'unique_key',tax_cents:0}),false);assert.equal(validSale({items:[{product_id:productId,quantity:1}],idempotency_key:'unique_key',tax_cents:100}),false)});
test('record sale uses atomic database RPC and verified actor/company',async()=>{calls.length=0;const body={items:[{product_id:productId,quantity:1}],idempotency_key:'test_key_987654',tax_cents:0,p_company_id:companyB};const r=res();await sales(req('POST',companyA,body),r);assert.equal(r.code,201);assert.equal(r.body.payment_charged,false);const q=calls.find(x=>x.url==='/rest/v1/rpc/nexus_record_pos_sale');assert.equal(q.body.p_company_id,companyA);assert.equal(q.body.p_actor_id,actor);assert.equal(q.body.p_idempotency_key,'test_key_987654')});
test('blocks mismatched Origin on POST',async()=>{const q=req('POST',companyA,{sku:'X',name:'X',price_cents:100,stock_quantity:1});q.headers.origin='https://attacker.invalid';const r=res();await products(q,r);assert.equal(r.code,403)});
test('unsupported HTTP methods return 405',async()=>{const r=res();await sales(req('DELETE'),r);assert.equal(r.code,405)});
test('unconfigured deployment fails closed',async()=>{const key=process.env.SUPABASE_SERVICE_ROLE_KEY;delete process.env.SUPABASE_SERVICE_ROLE_KEY;const r=res();await sales(req(),r);assert.equal(r.code,503);process.env.SUPABASE_SERVICE_ROLE_KEY=key});
test.after(()=>{globalThis.fetch=oldFetch});
