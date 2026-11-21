const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"../cloud-app/functions/api/[[path]].js"),"utf8");
test("audit logging failure cannot change a successful write into a reported failure",()=>{
 const tail=source.slice(source.indexOf("export async function onRequest("));
 assert.match(tail,/const result=await handler\(request,env\)/);
 assert.match(tail,/try\{await logAudit\(env\.DB,user,/);
 assert.match(tail,/catch\(auditError\)\{console\.error\(/);
 assert.match(tail,/return result;/);
});
