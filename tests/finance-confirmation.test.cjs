// Regression test for acknowledged finance writes followed by failed reads.
// Run: node --test tests/finance-confirmation.test.cjs
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"../cloud-app/public/assets/app.js"),"utf8");
const begin=source.indexOf('  if(type==="convert-estimate"||type==="invoice"||type==="payment"){');
const end=source.indexOf('  if(type==="job"){',begin);
assert.ok(begin>=0&&end>begin,"finance submission handler exists");
const block=source.slice(begin,end);
const handler=new Function("type","data","s","request","draw","notice",`return (async()=>{${block}})()`);
for(const type of ["convert-estimate","invoice","payment"]){
 test(type+": successful POST plus failed GET still reports success, never retries POST",async()=>{
  const calls=[],messages=[],s={financeView:"Estimates",financeError:"",estimates:[],invoices:[],payments:[]};
  const request=async(url,method)=>{
   calls.push({url,method:method||"GET"});
   if(method==="POST")return {ok:true,id:"fictional-id"};
   if(url==="/api/invoices")throw Error("Simulated read failure");
   return url==="/api/reports"?{totals:{outstanding:20}}:{items:[]};
  };
  await handler(type,{amount:20},s,request,()=>{},x=>messages.push(x));
  assert.equal(calls.filter(x=>x.method==="POST").length,1);
  assert.equal(calls.filter(x=>x.method!=="POST").length,4);
  assert.match(messages.at(-1),/refresh/i);
  assert.match(messages.at(-1),/Do not submit again/i);
  assert.match(s.financeError,/submission succeeded/i);
 });
 test(type+": failed POST never reports a successful save",async()=>{
  const calls=[],messages=[],s={financeView:"Estimates"};
  const request=async(url,method)=>{calls.push({url,method});throw Error("Simulated write failure")};
  await assert.rejects(()=>handler(type,{amount:20},s,request,()=>{},x=>messages.push(x)),/write failure/);
  assert.equal(calls.length,1);
  assert.equal(messages.length,0);
 });
}
