import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const src=readFileSync(new URL("../api/square/sandbox-prepare.js",import.meta.url),"utf8");
test("sandbox preparation is authenticated, company scoped and non-charging",()=>{
 assert.match(src,/actor\(req,res\)/);
 assert.match(src,/checkWrite\(req,res\)/);
 assert.match(src,/companyId:a\.companyId/);
 assert.match(src,/prepareSquareSandboxAttempt/);
 assert.match(src,/payment_charged:false/);
 assert.doesNotMatch(src,/submitSquareSandboxPayment|\/v2\/payments|SQUARE_SANDBOX_ACCESS_TOKEN/);
});
test("sandbox preparation requires explicit sandbox environment",()=>{
 assert.match(src,/SQUARE_ENVIRONMENT!=="sandbox"/);
 assert.match(src,/SQUARE_SANDBOX_LOCATION_ID/);
});
