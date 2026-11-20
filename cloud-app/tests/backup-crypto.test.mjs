// Exercises the actual browser backup encrypt/decrypt functions with fictional data.
// No real backup, password, customer record, or cloud storage is accessed.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {webcrypto} from "node:crypto";
import {Blob} from "node:buffer";
import {TextEncoder,TextDecoder} from "node:util";
import vm from "node:vm";
const source=readFileSync(new URL("../public/assets/app.js",import.meta.url),"utf8");
const start=source.indexOf("async function encryptedBackupDownload(");
const stop=source.indexOf("function companyAccessContent(",start);
assert.ok(start>=0&&stop>start,"Backup cryptography functions must be present");
function fixture(){
 let stored;
 const context={
  crypto:webcrypto,Blob,TextEncoder,TextDecoder,Uint8Array,
  btoa:s=>Buffer.from(s,"binary").toString("base64"),
  atob:s=>Buffer.from(s,"base64").toString("binary"),
  URL:{createObjectURL:v=>(stored=v,"blob:fixture"),revokeObjectURL(){}},
  document:{createElement:()=>({click(){},remove(){}}),body:{appendChild(){}}},
  localDate:()=> "fixture",setTimeout(){},
 };
 const functions=vm.runInNewContext(source.slice(start,stop)+";({encryptedBackupDownload,verifyLocalEncryptedBackup})",context);
 return {...functions,download:()=>stored};
}
const record={
 format:"nexus-crm-business-export-v1",schemaVersion:1,
 company:"Fictional Company",createdAt:1234567890,
 records:{customers:[{name:"fictional-only"}],employees:[],jobs:[{title:"test job"}],estimates:[],invoices:[],appointments:[],payments:[]}
};
test("client-encrypted backup round-trips and rejects wrong passphrases and tampering",async()=>{
 const f=fixture();
 await f.encryptedBackupDownload(record,"correct-fictional-passphrase-2026");
 const file=f.download();
 assert.ok(file&&file.size>100);
 const ciphertext=await file.text();
 assert.ok(!ciphertext.includes("fictional-only"),"Plaintext must not appear in encrypted file");
 const ok=await f.verifyLocalEncryptedBackup(file,"correct-fictional-passphrase-2026");
 assert.equal(ok.company,"Fictional Company");
 assert.equal(ok.counts.customers,1);
 assert.equal(ok.counts.jobs,1);
 await assert.rejects(
  ()=>f.verifyLocalEncryptedBackup(file,"incorrect-fictional-passphrase"),
  /Cannot decrypt this backup/
 );
 const modified=JSON.parse(ciphertext);
 const bytes=Buffer.from(modified.data,"base64");
 bytes[0]^=1;
 modified.data=bytes.toString("base64");
 await assert.rejects(
  ()=>f.verifyLocalEncryptedBackup(new Blob([JSON.stringify(modified)]),"correct-fictional-passphrase-2026"),
  /Cannot decrypt this backup/
 );
 modified.iterations=1;
 await assert.rejects(
  ()=>f.verifyLocalEncryptedBackup(new Blob([JSON.stringify(modified)]),"correct-fictional-passphrase-2026"),
  /not a recognized Nexus CRM encrypted backup/
 );
});
