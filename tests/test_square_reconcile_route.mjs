import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/square/sandbox-reconcile.js";
const req=(method="POST",body={attempt_id:"11111111-1111-4111-8111-111111111111"})=>({method,body,headers:{host:"example.test",origin:"https://example.test","content-type":"application/json"}});
function res(){return {statusCode:0,headers:{},setHeader(k,v){this.headers[k]=v;return this},status(n){this.statusCode=n;return this},json(v){this.body=v;return this}}}
test("reconciliation rejects unsupported methods without charging",async()=>{const r=res();await handler(req("GET"),r);assert.equal(r.statusCode,405);assert.equal(r.body.error,"Method not allowed")});
test("reconciliation rejects missing authentication without charging",async()=>{const r=res();await handler(req(),r);assert.equal(r.statusCode,503);assert.match(r.body.error,/configuration incomplete/);});
