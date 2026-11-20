import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {webcrypto} from "node:crypto";
import {restoreActualEncryptedArchive,authorizedRestoreRequest} from "../cloudflare/nexus-r2-isolated-restore-drill.js";
Object.defineProperty(globalThis,"crypto",{value:webcrypto,configurable:true});
const enc=new TextEncoder();
const tables=["tenants","users","user_mfa","account_recovery_codes","customers","jobs","appointments","employees","estimates","invoices","payments","backup_snapshots","security_audit","sessions","pos_sales","pos_products","pos_sale_items","pos_refunds","pos_payment_events"];
const schema=tables.map(n=>({type:"table",name:n,sql:`CREATE TABLE "${n}" (id TEXT PRIMARY KEY${n==="users"?',tenant_id TEXT REFERENCES tenants(id)':""})`}));
schema.push({type:"index",name:"idx_users_tenant",sql:"CREATE INDEX idx_users_tenant ON users(tenant_id)"});
const records=Object.fromEntries(tables.map(t=>[t,t==="tenants"?[{id:"fictional-tenant"}]:t==="users"?[{id:"fictional-user",tenant_id:"fictional-tenant"}]:[]]));
function recovery(){
 const db=new DatabaseSync(":memory:");
 db.exec("PRAGMA foreign_keys=ON");
 const prepare=sql=>{
  const stmt=db.prepare(sql);
  return {run:async()=>stmt.run(),first:async()=>stmt.get(),all:async()=>({results:stmt.all()}),
   bind:(...params)=>({run:async()=>stmt.run(...params),first:async()=>stmt.get(...params),all:async()=>({results:stmt.all(...params)}),stmt,params})};
 };
 return {
  db,
  api:{
   prepare,
   exec:async sql=>db.exec(sql),
   batch:async steps=>{
    db.exec("BEGIN");
    try{
     const results=[];
     for(const step of steps)results.push(step.stmt?step.stmt.run(...step.params):undefined);
     db.exec("COMMIT");return results;
    }catch(e){db.exec("ROLLBACK");throw e;}
   }
  }
 };
}
async function sample(){
 const data={format:"nexus-crm-pos-r2-d1-snapshot-v1",schemaVersion:1,sourceDatabase:"nexus_crm_full_staging",
  createdAt:"2026-11-20T06:00:27.724Z",schema,records,
  counts:Object.fromEntries(tables.map(t=>[t,records[t].length])),totalRows:2};
 const plaintext=enc.encode(JSON.stringify(data));
 const keyBytes=new Uint8Array(32).fill(53),iv=new Uint8Array(12).fill(23);
 const key=await crypto.subtle.importKey("raw",keyBytes,"AES-GCM",false,["encrypt"]);
 const sealed=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:enc.encode("NEXUS_CRM_POS_R2_D1_V1")},key,plaintext));
 const sum=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",plaintext)),x=>x.toString(16).padStart(2,"0")).join("");
 const objectKey="snapshots/v1/2026/11/20/2026-11-20T06-00-27-724Z-fixture.aes256gcm";
 const {db,api}=recovery();
 const env={BACKUP_ENCRYPTION_KEY:Array.from(keyBytes,x=>x.toString(16).padStart(2,"0")).join(""),
  RESTORE_DRILL_OBJECT_KEY:objectKey,RESTORE_DRILL_SECRET:"f".repeat(64),RECOVERY_DB:api,
  BACKUP_STORE:{get:async k=>k===objectKey?{customMetadata:{format:data.format,keyid:"nexus-backup-key-v1",
   iv:Array.from(iv,x=>x.toString(16).padStart(2,"0")).join(""),sha256:sum,rows:"2",tables:String(tables.length)},
   arrayBuffer:async()=>sealed.slice().buffer}:null}};
 return {db,env,objectKey};
}
test("decrypt exact AES-GCM R2 archive and fully restore isolated D1 tables/indexes/foreign keys",async()=>{
 const {db,env}=await sample();
 const res=await restoreActualEncryptedArchive(env);
 assert.equal(res.verified,true);
 assert.equal(res.tableCount,tables.length);
 assert.equal(res.recordCount,2);
 assert.equal(res.schemaObjectCount,tables.length+1);
 assert.equal(res.foreignKeyViolations,0);
 assert.equal(res.liveSourceModified,false);
 assert.equal(db.prepare("SELECT count(*) n FROM tenants").get().n,1);
 assert.equal(db.prepare("SELECT tenant_id FROM users").get().tenant_id,"fictional-tenant");
 assert.equal(db.prepare("PRAGMA quick_check").get().quick_check,"ok");
 await assert.rejects(()=>restoreActualEncryptedArchive(env),/must be empty/);
 db.close();
});
test("tampered ciphertext and unauthorized internal caller fail without creating database tables",async()=>{
 const {db,env}=await sample();
 const original=env.BACKUP_STORE.get;
 env.BACKUP_STORE.get=async k=>{
  const o=await original(k);
  return {...o,arrayBuffer:async()=>{const x=new Uint8Array(await o.arrayBuffer());x[0]^=1;return x.buffer;}};
 };
 await assert.rejects(()=>restoreActualEncryptedArchive(env),/decryption or authentication failed/);
 assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().n,0);
 const authorized=new Request("https://internal.invalid/__internal/restore-drill",{method:"POST",headers:{"X-Nexus-Restore-Proof":"f".repeat(64)}});
 const denied=new Request("https://internal.invalid/__internal/restore-drill",{method:"POST",headers:{"X-Nexus-Restore-Proof":"a".repeat(64)}});
 assert.equal(authorizedRestoreRequest(authorized,env),true);
 assert.equal(authorizedRestoreRequest(denied,env),false);
 assert.equal(authorizedRestoreRequest(new Request("https://internal.invalid/__internal/restore-drill"),env),false);
 db.close();
});
