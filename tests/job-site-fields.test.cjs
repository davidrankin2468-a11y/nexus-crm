const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const api=fs.readFileSync(path.join(__dirname,"../cloud-app/functions/api/[[path]].js"),"utf8");
const ui=fs.readFileSync(path.join(__dirname,"../cloud-app/public/assets/app.js"),"utf8");
const migration=fs.readFileSync(path.join(__dirname,"../cloud-app/migrations/2026-11-job-site-fields.sql"),"utf8");
test("job-site fields are persisted in create, update, and read endpoints",()=>{
 for(const field of ["site_address","site_instructions","crew_lead_id"]){
  assert.match(api,new RegExp(field,"g"));
  assert.match(migration,new RegExp("ADD COLUMN "+field));
 }
 assert.match(api,/INSERT INTO jobs\([^\n]*site_address,site_instructions,crew_lead_id/);
 assert.match(api,/UPDATE jobs SET[^\n]*site_address=\?,site_instructions=\?,crew_lead_id=\?/);
});
test("crew lead is checked against same-tenant active employee",()=>{
 const checks=api.match(/SELECT id FROM employees WHERE id=\? AND tenant_id=\? AND status=/g)||[];
 assert.ok(checks.length>=2,"create and update must both check employee tenant and active status");
});
test("job form exposes new fields",()=>{
 for(const field of ["siteAddress","siteInstructions","crewLeadId"])assert.ok(ui.includes('name="'+field+'"')||ui.includes('input("'+field+'"'));
});
