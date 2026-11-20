import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";

const code=readFileSync("cloud-app/public/assets/app.js","utf8");
const from=code.indexOf("function posPendingStorageKey()");
const to=code.indexOf("async function loadPos()",from);
assert.ok(from>0&&to>from,"CRM POS retry functions must exist");
const helpers=code.slice(from,to);

function harness({failFirst=true,blockStorage=false,confirmedReceipt={id:"confirmed-sale-1",status:"pending",duplicate:false}}={}){
 const entries=new Map(),attempts=[],notices=[];
 let counter=0;
 const s={account:{company:"Test Company A",email:"owner@example.invalid"},posCart:{"product-1":2},posBusy:false};
 let reject=failFirst;
 const ctx={s,
  sessionStorage:{
   getItem(key){return entries.get(key)||null},
   setItem(key,val){if(blockStorage)throw new Error("storage denied");entries.set(key,val)},
   removeItem(key){entries.delete(key)}
  },
  crypto:{randomUUID(){counter++;return "checkout-"+counter+"-unique-ref"}},
  async request(path,method,attempt){attempts.push(JSON.parse(JSON.stringify(attempt)));if(reject){reject=false;throw Error("network timeout")}return confirmedReceipt},
  async loadPos(){},
  draw(){},
  notice(value){notices.push(value)}
 };
 vm.createContext(ctx);
 vm.runInContext(helpers,ctx);
 return {ctx,s,entries,attempts,notices};
}
test("a failed checkout preserves the exact retry key and cart, then clears only after confirmation",async()=>{
 const x=harness();
 await x.ctx.posCommit();
 assert.equal(x.attempts.length,1);
 assert.equal(x.entries.size,1);
 assert.equal(x.s.posCart["product-1"],2);
 const first=x.attempts[0].idempotency_key;
 await x.ctx.posCommit();
 assert.equal(x.attempts.length,2);
 assert.equal(x.attempts[1].idempotency_key,first);
 assert.equal(x.entries.size,0);
 assert.deepEqual(Object.keys(x.s.posCart),[]);
 assert.ok(x.notices.some(s=>s.includes("pending/unpaid")));
});
test("unresolved checkout is scoped to the signed-in company",()=>{
 const x=harness({failFirst:false});
 const pending=x.ctx.posPendingStart([{product_id:"product-1",quantity:1}]);
 assert.ok(pending.idempotency_key);
 assert.equal(x.ctx.posPendingRead().idempotency_key,pending.idempotency_key);
 x.s.account.company="Test Company B";
 assert.equal(x.ctx.posPendingRead(),null);
 x.s.account.company="Test Company A";
 assert.equal(x.ctx.posPendingRead().idempotency_key,pending.idempotency_key);
});
test("if pending storage is disabled the checkout refuses to send anything",async()=>{
 const x=harness({blockStorage:true,failFirst:false});
 await x.ctx.posCommit();
 assert.equal(x.attempts.length,0);
 assert.equal(x.s.posCart["product-1"],2);
 assert.ok(x.notices.some(s=>s.includes("Safe checkout storage is unavailable")));
});

test("a recovered completed sale reports already completed, not pending or unpaid",async()=>{
 const x=harness({failFirst:false,confirmedReceipt:{id:"previous-sale-1",status:"completed",duplicate:true}});
 await x.ctx.posCommit();
 assert.equal(x.attempts.length,1);
 assert.equal(x.entries.size,0);
 assert.ok(x.notices.some(m=>m.includes("already completed")));
 assert.ok(x.notices.every(m=>!m.includes("pending/unpaid")));
});
test("a recovered voided sale reports already voided and creates no new attempt",async()=>{
 const x=harness({failFirst:false,confirmedReceipt:{id:"previous-sale-2",status:"voided",duplicate:true}});
 await x.ctx.posCommit();
 assert.equal(x.attempts.length,1);
 assert.ok(x.notices.some(m=>m.includes("already voided")));
});
