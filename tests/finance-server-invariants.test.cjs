const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const api=fs.readFileSync(path.join(__dirname,"../cloud-app/functions/api/[[path]].js"),"utf8");
const between=(a,b)=>{const i=api.indexOf(a),j=api.indexOf(b,i+1);assert.ok(i>=0&&j>i);return api.slice(i,j)};
test("manual payments use a single conditional INSERT checking tenant-scoped invoice balance",()=>{
 const code=between('if(path==="/api/payments"&&method==="POST")','if(path==="/api/reports"&&method==="GET")');
 assert.match(code,/INSERT INTO payments/);
 assert.match(code,/WHERE i\.id=\? AND i\.tenant_id=\?/);
 assert.match(code,/SUM\(p\.amount_cents\)/);
 assert.match(code,/result\.meta\?\.changes!==1/);
});
test("estimate conversion accepts only accepted estimates and rejects existing invoice",()=>{
 const code=between('if(path==="/api/invoices/from-estimate"&&method==="POST")','if(path==="/api/payments"&&method==="GET")');
 assert.match(code,/e\.status='Accepted'/);
 assert.match(code,/NOT EXISTS\(SELECT 1 FROM invoices/);
 assert.match(code,/result\.meta\?\.changes!==1/);
});
test("manual payment and invoice reads are scoped to tenant",()=>{
 for(const [a,b] of [
  ['if(path==="/api/invoices"&&method==="GET")','if(path==="/api/invoices"&&method==="POST")'],
  ['if(path==="/api/payments"&&method==="GET")','if(path==="/api/payments"&&method==="POST")']
 ])assert.match(between(a,b),/WHERE [ip]\.tenant_id=\?/);
});
