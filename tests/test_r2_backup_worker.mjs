import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import backupWorker,{createEncryptedBackup,verifyStoredBackup,collectSnapshot,isCentralMidnight} from "../cloudflare/nexus-crm-pos-r2-backup-worker.js";
Object.defineProperty(globalThis,"crypto",{value:webcrypto,configurable:true});
const tables=[
 "tenants","users","user_mfa","account_recovery_codes","customers","jobs","appointments",
 "employees","estimates","invoices","payments","backup_snapshots","security_audit","sessions",
 "pos_sales","pos_products","pos_sale_items","pos_refunds","pos_payment_events"
];
const dbRecords=Object.fromEntries(tables.map(name=>[name,name==="users"?[{id:"fictional-user",tenant_id:"fictitious",password_hash:"fake"}]:name==="tenants"?[{id:"fictitious",name:"Test company"}]:[]]));
function makeEnv(){
 const objects=new Map();
 const requests=[];
 const env={
  BACKUP_ENCRYPTION_KEY:"ab".repeat(32),
  DB:{
   prepare(query){
    requests.push(query);
    if(query==="PRAGMA quick_check")return {first:async()=>({quick_check:"ok"})};
    if(query.startsWith("SELECT type,name"))return {all:async()=>({results:tables.map(name=>({type:"table",name,tbl_name:name,sql:`CREATE TABLE "${name}" (id TEXT)`}))})};
    if(query.startsWith("SELECT * FROM "))return {query};
    throw Error("unexpected query: "+query);
   },
   async batch(list){return list.map(stmt=>{
    const name=stmt.query.match(/^SELECT \* FROM "([^"]+)"$/)?.[1];
    if(!name)throw Error("bad select");
    return {success:true,results:dbRecords[name]};
   });}
  },
  BACKUP_STORE:{
   async put(key,value,options){
    objects.set(key,{data:new Uint8Array(value),customMetadata:{...options.customMetadata}});
   },
   async get(key){
    const o=objects.get(key);
    return o?{customMetadata:{...o.customMetadata},arrayBuffer:async()=>new Uint8Array(o.data).buffer}:null;
   }
  }
 };
 return {env,objects,requests};
}
test("scheduled export is table-complete, encrypted, and decrypted readback checked",async()=>{
 const {env,objects}=makeEnv();
 const out=await createEncryptedBackup(env,new Date("2026-11-19T09:00:00Z"));
 assert.equal(out.verified,true);assert.equal(out.tableCount,tables.length);assert.equal(out.rowCount,2);
 assert.match(out.key,/^snapshots\/v1\/2026\/11\/19\//);
 assert.equal(objects.size,1);
 const obj=objects.get(out.key);
 assert.equal(obj.customMetadata.rows,"2");
 assert.ok(!new TextDecoder().decode(obj.data).includes("fictional-user"));
 const result=await verifyStoredBackup(env,out.key);
 assert.equal(result.verified,true);
 assert.ok(!Object.keys(env).some(k=>k.includes("MFA")),"Backup key must be distinct from MFA");
});
test("wrong backup key and tampered encrypted object both fail",async()=>{
 const {env,objects}=makeEnv();
 const out=await createEncryptedBackup(env,new Date("2026-11-19T09:00:00Z"));
 const encrypted=objects.get(out.key);
 const evilKey={...env,BACKUP_ENCRYPTION_KEY:"cd".repeat(32)};
 await assert.rejects(()=>verifyStoredBackup(evilKey,out.key));
 encrypted.data[0]^=1;
 await assert.rejects(()=>verifyStoredBackup(env,out.key));
});
test("partial data, internal tables or a failed D1 integrity check never produce a backup",async()=>{
 const {env,objects}=makeEnv();
 const missing={...env,DB:{...env.DB,batch:async()=>[]}};
 await assert.rejects(()=>collectSnapshot(missing),/length mismatch/);
 const corrupt={...env,DB:{...env.DB,prepare(query){
   if(query==="PRAGMA quick_check")return {first:async()=>({quick_check:"corrupt"})};
   return env.DB.prepare(query);
 }}};
 await assert.rejects(()=>createEncryptedBackup(corrupt),/failed quick_check/);
 assert.equal(objects.size,0);
});

test("UTC cron pairs select exactly local midnight in both CST and CDT",()=>{
 const times=[
  ["2026-11-20T05:00:00Z",false],
  ["2026-11-20T06:00:00Z",true],
  ["2027-07-01T05:00:00Z",true],
  ["2027-07-01T06:00:00Z",false],
  ["2027-03-14T05:00:00Z",false],
  ["2027-03-14T06:00:00Z",true],
  ["2027-11-07T05:00:00Z",true],
  ["2027-11-07T06:00:00Z",false]
 ];
 for(const [value,want] of times)assert.equal(isCentralMidnight(Date.parse(value)),want,value);
});
test("scheduled handler skips wrong local hour, performs only the midnight backup",async()=>{
 const {env,objects,requests}=makeEnv();
 await backupWorker.scheduled({scheduledTime:Date.parse("2026-11-20T05:00:00Z")},env);
 assert.equal(objects.size,0);assert.equal(requests.length,0);
 await backupWorker.scheduled({scheduledTime:Date.parse("2026-11-20T06:00:00Z")},env);
 assert.equal(objects.size,1);
 const key=[...objects.keys()][0];
 assert.match(key,/^snapshots\/v1\/2026\/11\/20\//);
 assert.equal((await verifyStoredBackup(env,key)).verified,true);
});
