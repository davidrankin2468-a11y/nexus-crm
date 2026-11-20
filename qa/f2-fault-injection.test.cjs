// Run: node --test qa/f2-fault-injection.test.cjs
// Exercises the actual client handlers with mocked transport; no production writes.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../cloud-app/public/assets/app.js'),'utf8');
function section(start,end){const a=src.indexOf(start);assert.ok(a>=0,'missing '+start);const b=src.indexOf(end,a);assert.ok(b>a,'missing '+end);return src.slice(a,b)}
const job=section('if(type==="job"){','\n }catch(err){notice(err.message)}');
const pos=section('function posPendingRead(){','function posContent(){');
async function jobScenario(failJobs,failDashboard){
 const calls=[],messages=[],s={editingJob:null,jobs:[],dashboard:{}};
 const ctx={s,type:'job',encodeURIComponent,Number,Promise,draw(){},notice(m){messages.push(m)},
 async request(url,method,data){calls.push({url,method});if(method==='POST')return {id:'job-1'};if(url==='/api/jobs'){if(failJobs)throw Error('injected jobs GET failure');return {items:[{id:'job-1'}]}}if(url==='/api/dashboard'){if(failDashboard)throw Error('injected dashboard GET failure');return {jobs:1}}throw Error('unexpected request '+url)}};
 const fn=vm.runInNewContext('(async function(data){'+job+'\n})',ctx);
 await fn({amount:100});
 return {calls,messages,s};
}
test('F2 job write confirmed; both refresh reads fail without a second write',async()=>{
 const x=await jobScenario(true,true);
 assert.equal(x.calls.filter(c=>c.method==='POST').length,1);
 assert.deepEqual(x.calls.map(c=>c.url),['/api/jobs','/api/jobs','/api/dashboard']);
 assert.match(x.messages[0],/Job saved successfully/);
 assert.doesNotMatch(x.messages[0],/failed to save/i);
});
test('F2 job write confirmed; one refresh read fails and other updates',async()=>{
 const x=await jobScenario(true,false);
 assert.equal(x.calls.length,3);assert.equal(x.s.dashboard.jobs,1);
 assert.match(x.messages[0],/Job saved successfully/);
});
test('F2 job save and refresh succeed',async()=>{
 const x=await jobScenario(false,false);
 assert.equal(x.s.jobs[0].id,'job-1');assert.equal(x.calls.length,3);
 assert.match(x.messages[0],/Job saved to your private cloud database/);
});
async function posScenario({refreshFails=false,writeFails=false,retry=false}={}){
 const calls=[],messages=[],storage=new Map(),s={account:{id:'owner'},posBusy:false,posCart:{'product-1':1},posCustomerId:'',posError:'',posProducts:[],posSales:[]};
 const sessionStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 const ctx={s,sessionStorage,crypto:{randomUUID:()=> 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'},JSON,Number,Object,Promise,Error,RegExp,
 posPendingStorageKey:()=> 'pending',draw(){},notice:m=>messages.push(m),
 async request(url,method,payload){calls.push({url,method,payload});if(url==='/api/pos/sales'&&method==='POST'){if(writeFails)throw Error('injected timeout');return {id:'sale-1'}}if(refreshFails)throw Error('injected GET failure');return {items:[]}}};
 vm.runInNewContext(pos,ctx);
 await ctx.posCommit();
 if(retry)await ctx.posCommit();
 return {calls,messages,s,storage};
}
test('F2 confirmed POS sale plus failed GET remains successful; no duplicate write',async()=>{
 const x=await posScenario({refreshFails:true});
 assert.equal(x.calls.filter(c=>c.method==='POST').length,1);
 assert.match(x.messages.at(-1),/Sale sale-1 recorded/);
 assert.match(x.messages.at(-1),/could not refresh/);
 assert.equal(x.storage.size,0);
});
test('F2 ambiguous POS timeout retries same idempotency key',async()=>{
 const x=await posScenario({writeFails:true,retry:true});
 const writes=x.calls.filter(c=>c.method==='POST');
 assert.equal(writes.length,2);
 assert.equal(writes[0].payload.idempotency_key,writes[1].payload.idempotency_key);
 assert.equal(x.storage.size,1);
});
