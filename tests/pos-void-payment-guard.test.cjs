const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"../cloud-app/functions/api/pos/[[path]].js"),"utf8");
test("unresolved Square payment attempts block unpaid sale void",()=>{
 const start=source.indexOf('if(path==="/api/pos/sales/void"');
 const end=source.indexOf('if(path==="/api/pos/sales"&&method==="GET")',start);
 assert.ok(start>=0&&end>start);
 const route=source.slice(start,end);
 assert.match(route,/pos_square_sandbox_payment_attempts/);
 assert.match(route,/paymentAttempt\.status!=="failed"/);
 assert.match(route,/return json\(\{error:"Square payment attempt exists; resolve its status before voiding this sale"\},409\)/);
 assert.ok(route.indexOf("paymentAttempt.status")<route.indexOf("UPDATE pos_sales SET status='voided'"));
});
