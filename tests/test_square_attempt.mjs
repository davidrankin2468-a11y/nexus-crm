import test from "node:test";
import assert from "node:assert/strict";
import {prepareSquareSandboxAttempt} from "../lib/nexus-square-attempt.js";
const companyId="11111111-1111-4111-8111-111111111111",saleId="22222222-2222-4222-8222-222222222222";
const args={companyId,saleId,idempotencyKey:"attempt-0001",locationId:"FAKE_LOC_001"};
test("preparation reads only the authorized company sale and persists server total",async()=>{
 let writes=0;
 const result=await prepareSquareSandboxAttempt({...args,db:async(path,options)=>{
  if(!options){assert.match(path,/company_id=eq%2E11111111/);assert.match(path,/id=eq%2E22222222/);return [{id:saleId,status:"pending",total_cents:1499}]}
  writes++;assert.equal(options.method,"POST");assert.equal(options.body.amount_cents,1499);
  assert.equal(options.body.company_id,companyId);return [{...options.body,id:"attempt-id"}];
 }});
 assert.equal(writes,1);assert.deepEqual(result,{prepared:true,attemptId:"attempt-id",amountCents:1499,referenceId:saleId});
});
test("wrong tenant, paid sale and zero total never create payment attempts",async()=>{
 for(const sales of [[],[{id:saleId,status:"paid",total_cents:100}],[{id:saleId,status:"pending",total_cents:0}]]){
  let writes=0;const r=await prepareSquareSandboxAttempt({...args,db:async(path,options)=>{if(options){writes++;return []}return sales}});
  assert.equal(r.prepared,false);assert.equal(writes,0);
 }
});
test("bad idempotency key and persistence failure fail closed",async()=>{
 let calls=0;const db=async()=>{calls++;throw Error("duplicate key")};
 assert.equal((await prepareSquareSandboxAttempt({...args,idempotencyKey:"bad key",db})).reason,"INVALID_INPUT");
 assert.equal(calls,0);
 assert.equal((await prepareSquareSandboxAttempt({...args,db})).reason,"PERSISTENCE_UNAVAILABLE_OR_DUPLICATE");
});
