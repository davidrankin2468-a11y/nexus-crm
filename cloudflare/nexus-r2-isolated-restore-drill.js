// One-time isolated recovery of an EXISTING encrypted R2 snapshot.
// Invoked from a private Worker service binding only: never a public route.
// The source DB is never written; RECOVERY_DB must be a fresh, separate D1.
const enc=new TextEncoder();
const dec=new TextDecoder();
const FORMAT="nexus-crm-pos-r2-d1-snapshot-v1";
const AAD="NEXUS_CRM_POS_R2_D1_V1";
const hexToBytes=s=>Uint8Array.from(s.match(/../g)||[],x=>parseInt(x,16));
const safe=name=>typeof name==="string"&&/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)&&!name.startsWith("sqlite_")&&!name.startsWith("_cf_");
const quoted=name=>{if(!safe(name))throw Error("Unsafe snapshot identifier");return '"'+name+'"';};
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),x=>x.toString(16).padStart(2,"0")).join("");
const eq=(a,b)=>{
 if(typeof a!=="string"||typeof b!=="string"||a.length!==b.length||a.length<40)return false;
 let differing=0;for(let i=0;i<a.length;i++)differing|=a.charCodeAt(i)^b.charCodeAt(i);
 return differing===0;
};

export async function restoreActualEncryptedArchive(env){
 if(!env?.RECOVERY_DB||!env?.BACKUP_STORE)throw Error("Isolated restore bindings are missing");
 if(!/^[0-9a-f]{64}$/i.test(env.BACKUP_ENCRYPTION_KEY||""))throw Error("Backup decryption key unavailable");
 const key=env.RESTORE_DRILL_OBJECT_KEY;
 if(typeof key!=="string"||!/^snapshots\/v1\/2026\/11\/20\/[A-Za-z0-9-]+\.aes256gcm$/.test(key))
  throw Error("Backup key not pinned to approved scheduled archive");
 // Fail closed on a nonempty destination; no deletion, overwrite, or upsert.
 const pre=await env.RECOVERY_DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").all();
 if((pre.results||[]).length)throw Error("Recovery database must be empty; existing data preserved");
 const object=await env.BACKUP_STORE.get(key);
 if(!object)throw Error("Scheduled encrypted R2 object was not found");
 const m=object.customMetadata||{};
 if(m.format!==FORMAT||m.keyid!=="nexus-backup-key-v1"||!(/^[0-9a-f]{24}$/i).test(m.iv||"")||!(/^[0-9a-f]{64}$/i).test(m.sha256||""))
  throw Error("Encrypted snapshot metadata invalid");
 const c=await object.arrayBuffer();
 if(c.byteLength<16||c.byteLength>12000016)throw Error("Encrypted object size outside limits");
 const keyBytes=hexToBytes(env.BACKUP_ENCRYPTION_KEY);
 const cryptoKey=await crypto.subtle.importKey("raw",keyBytes,"AES-GCM",false,["decrypt"]);
 let plaintext;
 try{
  plaintext=await crypto.subtle.decrypt({name:"AES-GCM",iv:hexToBytes(m.iv),
   additionalData:enc.encode(AAD)},cryptoKey,c);
 }catch{throw Error("Snapshot AES-GCM decryption or authentication failed");}
 const bytes=new Uint8Array(plaintext),digest=await sha(bytes);
 if(digest!==m.sha256)throw Error("Snapshot SHA256 mismatch");
 let data;
 try{data=JSON.parse(dec.decode(bytes));}catch{throw Error("Snapshot JSON invalid");}
 if(data?.format!==FORMAT||data?.schemaVersion!==1||data?.sourceDatabase!=="nexus_crm_full_staging"||
    !data?.records||!Array.isArray(data?.schema))throw Error("Snapshot format or source invalid");
 const tables=data.schema.filter(s=>s.type==="table"),other=data.schema.filter(s=>s.type!=="table");
 const indexes=other.filter(s=>s.type==="index");
 const postDataObjects=other.filter(s=>s.type!=="index");
 if(tables.length<15||tables.length>80||new Set(tables.map(x=>x.name)).size!==tables.length)
  throw Error("Snapshot table inventory invalid");
 if(!tables.some(t=>t.name==="tenants")||!tables.some(t=>t.name==="users")||!tables.some(t=>t.name==="pos_sales"))
  throw Error("Core tables missing from archive");
 if(other.some(s=>!["index","trigger","view"].includes(s.type)))throw Error("Unexpected schema object");
 if(data.schema.some(x=>!safe(x.name)||typeof x.sql!=="string"||!/^CREATE\s/i.test(x.sql)||x.sql.length>12000))
  throw Error("Unsafe or invalid schema object");
 if(Object.keys(data.records).length!==tables.length||tables.some(t=>!Array.isArray(data.records[t.name])))
  throw Error("Snapshot data table mismatch");
 const nrows=tables.reduce((n,t)=>n+data.records[t.name].length,0);
 if(nrows!==data.totalRows||String(nrows)!==m.rows||tables.length!==Number(m.tables)||nrows>20000)
  throw Error("Snapshot row and schema counts do not match authenticated envelope");
 // Only the isolated empty RECOVERY_DB receives writes.
 // D1.exec() splits SQL on newlines, which breaks formatted CREATE TABLE DDL.
 // D1.prepare().run() executes each complete multiline SQLite DDL statement.
 for(const t of tables)await env.RECOVERY_DB.prepare(t.sql).run();
 // Composite foreign keys can reference UNIQUE indexes rather than a table
 // constraint; install every index before inserting dependent child records.
 for(const index of indexes)await env.RECOVERY_DB.prepare(index.sql).run();
 const writes=[env.RECOVERY_DB.prepare("PRAGMA defer_foreign_keys=ON")];
 for(const t of tables){
  const rows=data.records[t.name];
  for(const row of rows){
   if(!row||typeof row!=="object"||Array.isArray(row))throw Error("Invalid snapshot data row");
   const cols=Object.keys(row);
   if(!cols.length||cols.some(x=>!safe(x)))throw Error("Unsafe data columns");
   const values=cols.map(k=>row[k]);
   if(values.some(v=>v!==null&&!["string","number","boolean"].includes(typeof v)))throw Error("Snapshot contains unsupported value");
   writes.push(env.RECOVERY_DB.prepare("INSERT INTO "+quoted(t.name)+" ("+cols.map(quoted).join(",")+
    ") VALUES ("+cols.map(()=>"?").join(",")+")").bind(...values));
  }
 }
 // D1.batch is transactional. Deferred FK checks execute at commit.
 await env.RECOVERY_DB.batch(writes);
 // Triggers must be installed after archived data is loaded to avoid replaying
 // business side effects and changing the authenticated snapshot row totals.
 for(const obj of postDataObjects)await env.RECOVERY_DB.prepare(obj.sql).run();
 const ok=await env.RECOVERY_DB.prepare("PRAGMA quick_check").first();
 if(ok?.quick_check!=="ok")throw Error("Restored D1 quick_check failed");
 const fk=await env.RECOVERY_DB.prepare("PRAGMA foreign_key_check").all();
 if((fk.results||[]).length)throw Error("Restored D1 has foreign key violations");
 let counted=0;
 for(const t of tables){
  const row=await env.RECOVERY_DB.prepare("SELECT count(*) AS n FROM "+quoted(t.name)).first();
  if(row?.n!==data.records[t.name].length)throw Error("Restored D1 row count mismatch for "+t.name);
  counted+=row.n;
 }
 const objs=await env.RECOVERY_DB.prepare("SELECT type,name FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").all();
 if((objs.results||[]).length!==data.schema.length)throw Error("Restored schema inventory differs from archive");
 return Object.freeze({verified:true,source:"encrypted scheduled R2 object",createdAt:data.createdAt,
  sha256:digest,tableCount:tables.length,recordCount:counted,schemaObjectCount:data.schema.length,
  quickCheck:"ok",foreignKeyViolations:0,isolatedRecovery:true,liveSourceModified:false});
}

export function authorizedRestoreRequest(request,env){
 return request.method==="POST"&&new URL(request.url).pathname==="/__internal/restore-drill"
   &&eq(request.headers.get("X-Nexus-Restore-Proof"),env.RESTORE_DRILL_SECRET);
}
