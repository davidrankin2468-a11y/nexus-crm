import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Script} from "node:vm";
const app=readFileSync("cloud-app/public/assets/app.js","utf8");
const index=readFileSync("cloud-app/public/index.html","utf8");
const api=readFileSync("cloud-app/functions/api/pos/[[path]].js","utf8");
test("business email lab is shown only inside platform Management, never sends mail",()=>{
 assert.match(app,/function companyEmailLabContent\(\)/);
 assert.match(app,/if\(!s\.account\?\.isPlatformOperator\)return ""/);
 assert.match(app,/companyEmailLabContent\(\)/);
 assert.match(app,/request\("\/api\/platform\/email-lab"\)/);
 assert.match(app,/preview never sends a message or creates an invitation/);
 assert.doesNotThrow(()=>new Script(app));
});
test("fictional company email pilot is private and never enables normal customer sending",()=>{
 assert.match(app,/data-form="email-invite-pilot"/);
 assert.match(app,/request\("\/api\/platform\/email-invite-pilot"/);
 assert.match(app,/pilotInviteAvailable/);
 assert.match(app,/private tab/);
 assert.doesNotThrow(()=>new Script(app));
});
test("existing five tabs are preserved; POS stays within Finance",()=>{
 assert.match(app,/const tabs=\["Dashboard","Customers","Operations","Finance","Management"\]/);
 assert.match(app,/const financeViews=\["Estimates","Invoices","Payments","Reports","POS"\]/);
 assert.match(app,/if\(view==="POS"\)return nav\+posContent\(\)/);
 assert.doesNotThrow(()=>new Script(app));
});
test("CRM dashboard opens integrated POS for owner/admin only",()=>{
 assert.match(app,/data-action="open-integrated-pos"/);
 assert.match(app,/\["owner","admin"\]\.includes\(s\.account\?\.role\)/);
 assert.match(app,/if\(b\.dataset\.action==="open-integrated-pos"\)/);
 assert.match(app,/s\.page="Finance";s\.financeView="POS"/);
});
test("same authenticated CRM tenant and session protect POS API",()=>{
 assert.match(api,/__Host-nexuscrm=/);
 assert.match(api,/const tenant=user\.tenant_id/);
 assert.match(api,/user\.role!=="owner"&&user\.role!=="admin"/);
 assert.match(api,/X-Nexus-CSRF/);
 assert.match(api,/Origin denied/);
 assert.match(api,/payment_charged:false/);
});
test("CRM webpage loads the integrated POS UI, not a separate embedded demo",()=>{
 assert.match(index,/\/assets\/app\.js\?v=3\.4\.1-pos-integrated/);
 assert.doesNotMatch(index,/pos-demo|<iframe/);
 assert.match(app,/request\("\/api\/pos\/products"/);
 assert.match(app,/request\("\/api\/pos\/sales"/);
});
