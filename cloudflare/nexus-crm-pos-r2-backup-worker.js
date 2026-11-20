// Nexus CRM + POS: private, encrypted R2 recovery snapshots.
// Dedicated scheduled Worker, never mounted into the customer-facing application.
// Source D1 is READ-ONLY. R2 bucket has NO public access or HTTP response route.
// Key handling: BACKUP_ENCRYPTION_KEY is a distinct 32-byte hex Cloudflare secret.
// Retain this key outside this deployment before any rotation or account recovery.
export const SNAPSHOT_FORMAT="nexus-crm-pos-r2-d1-snapshot-v1";
const SOURCE_DB="nexus_crm_full_staging";
const AAD="NEXUS_CRM_POS_R2_D1_V1";
const MAX_BYTES=12000000;
const MAX_TABLES=80;
const MAX_ROWS_PER_TABLE=20000;
const enc=new TextEncoder();
const decoder=new TextDecoder();

function toHex(buf){return [...new Uint8Array(buf)].map(v=>v.toString(16).padStart(2,"0")).join("");}
function fromHex(s){if(typeof s!=="string"||!/^([0-9a-f]{2})+$/i.test(s))throw Error("Invalid hex");return Uint8Array.from(s.match(/../g),s=>parseInt(s,16));}
async function digest(bytes){return toHex(await crypto.subtle.digest("SHA-256",bytes));}
async function encryptionKey(env){
 if(!/^[0-9a-f]{64}$/i.test(env.BACKUP_ENCRYPTION_KEY||""))throw Error("Backup encryption secret not configured");
 return crypto.subtle.importKey("raw",fromHex(env.BACKUP_ENCRYPTION_KEY),"AES-GCM",false,["encrypt","decrypt"]);
}
function required(env){
 if(!env?.DB||!env?.BACKUP_STORE)throw Error("Backup database/R2 binding missing");
}
function safeTable(name){
 if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)||name.startsWith("sqlite_")||name.startsWith("_cf_"))throw Error("Unsafe database table");
 return '"'+name+'"';
}
function rowCounts(snapshot){
 return Object.fromEntries(Object.entries(snapshot.records).map(([name,rows])=>[name,rows.length]));
}

export async function collectSnapshot(env,now=new Date()){
 required(env);
 const q=await env.DB.prepare("PRAGMA quick_check").first();
 if(q?.quick_check!=="ok")throw Error("Source D1 failed quick_check");
 const listed=await env.DB.prepare(
  "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name"
 ).all();
 const objects=(listed.results||[]).filter(x=>!String(x.name).startsWith("_cf_")&&!String(x.tbl_name).startsWith("_cf_"));
 const tableNames=objects.filter(x=>x.type==="table").map(x=>x.name);
 if(tableNames.length<15||tableNames.length>MAX_TABLES||new Set(tableNames).size!==tableNames.length)throw Error("Unexpected database table count");
 if(!tableNames.includes("tenants")||!tableNames.includes("users")||!tableNames.includes("pos_sales")||!tableNames.includes("user_mfa"))throw Error("Required database tables missing");
 const statements=tableNames.map(name=>env.DB.prepare("SELECT * FROM "+safeTable(name)));
 // D1 batch executes the read statements in one database transaction/snapshot.
 const batches=await env.DB.batch(statements);
 if(batches.length!==tableNames.length)throw Error("D1 batch result length mismatch");
 const records={};let totalRows=0;
 for(let i=0;i<tableNames.length;i++){
  const rows=batches[i]?.results;
  if(!Array.isArray(rows)||rows.length>MAX_ROWS_PER_TABLE||batches[i]?.success===false)throw Error("D1 table snapshot incomplete: "+tableNames[i]);
  records[tableNames[i]]=rows;
  totalRows+=rows.length;
 }
 const snapshot={
  format:SNAPSHOT_FORMAT,schemaVersion:1,sourceDatabase:SOURCE_DB,
  createdAt:now.toISOString(),schema:objects,records,
  counts:rowCounts({records}),totalRows
 };
 const bytes=enc.encode(JSON.stringify(snapshot));
 if(bytes.length>MAX_BYTES)throw Error("Snapshot size cap reached; use streaming export");
 return {snapshot,bytes,tableCount:tableNames.length,totalRows};
}

export async function verifyStoredBackup(env,key){
 required(env);
 const obj=await env.BACKUP_STORE.get(key);
 if(!obj)throw Error("R2 backup object missing");
 const meta=obj.customMetadata||{};
 if(meta.format!==SNAPSHOT_FORMAT||meta.keyid!=="nexus-backup-key-v1")throw Error("Unknown backup envelope");
 const iv=fromHex(meta.iv||"");
 if(iv.length!==12)throw Error("Invalid backup IV");
 const cipher=await obj.arrayBuffer();
 const secret=await encryptionKey(env);
 const restored=new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",iv,additionalData:enc.encode(AAD)},secret,cipher));
 const sum=await digest(restored);
 if(sum!==meta.sha256)throw Error("Backup checksum mismatch");
 const payload=JSON.parse(decoder.decode(restored));
 if(payload?.format!==SNAPSHOT_FORMAT||!payload.records||!payload.schema||payload.schemaVersion!==1)
  throw Error("Decrypted backup structure invalid");
 const names=Object.keys(payload.records);
 if(names.length<15||!names.includes("users")||!names.includes("tenants")||!names.includes("pos_sales"))throw Error("Backup missing core tables");
 const counted=Object.values(payload.records).reduce((sum,rows)=>{
  if(!Array.isArray(rows))throw Error("Invalid table records");return sum+rows.length;
 },0);
 if(counted!==payload.totalRows||String(counted)!==meta.rows)throw Error("Backup row totals mismatch");
 return {verified:true,key,tableCount:names.length,rowCount:counted,createdAt:payload.createdAt,sha256:sum};
}

export async function createEncryptedBackup(env,now=new Date()){
 required(env);
 const source=await collectSnapshot(env,now);
 const secret=await encryptionKey(env);
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:enc.encode(AAD)},secret,source.bytes));
 const sha256=await digest(source.bytes);
 const dt=now.toISOString();
 const objectKey="snapshots/v1/"+dt.slice(0,4)+"/"+dt.slice(5,7)+"/"+dt.slice(8,10)+"/"+dt.replace(/[:.]/g,"-")+"-"+crypto.randomUUID()+".aes256gcm";
 await env.BACKUP_STORE.put(objectKey,encrypted,{
  httpMetadata:{contentType:"application/octet-stream"},
  customMetadata:{
   format:SNAPSHOT_FORMAT,keyid:"nexus-backup-key-v1",iv:toHex(iv),sha256,
   rows:String(source.totalRows),tables:String(source.tableCount),createdat:dt
  }
 });
 const result=await verifyStoredBackup(env,objectKey);
 if(result.rowCount!==source.totalRows||result.tableCount!==source.tableCount)throw Error("Backup verified with mismatched counts");
 return result;
}

export default {
 async fetch(){return new Response("Not found",{status:404,headers:{"Cache-Control":"no-store"}});},
 async scheduled(_controller,env){const out=await createEncryptedBackup(env);console.log("Encrypted R2 backup verified",out.key,out.tableCount,out.rowCount);}
};
