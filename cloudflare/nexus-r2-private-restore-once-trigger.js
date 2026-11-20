// One-time PRIVATE encrypted R2 restore orchestrator.
// No public subdomain, routing, source-DB binding, or customer access.
// Queue delivery is internal; the backup Worker decrypts through its own secret.
const EXPLICIT_EVENT="nexus-r2-scheduled-archive-restore-20261120";

async function performRestore(env){
 const existing=await env.RECOVERY_DB.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").first();
 if(existing?.n!==0){
  const core=await env.RECOVERY_DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").first();
  if(core){console.log("Isolated recovery already populated; not importing again");return;}
  throw Error("Isolated recovery contains incomplete tables; restore must be inspected before retry");
 }
 const response=await env.BACKUP_SERVICE.fetch("https://private-restore.internal/__internal/restore-drill",{
  method:"POST",headers:{"X-Nexus-Restore-Proof":env.RESTORE_DRILL_SECRET}
 });
 if(!response.ok){
  console.error("Private encrypted restore failed",response.status);
  throw Error("Actual encrypted archive restore failed; inspect isolated database");
 }
 const outcome=await response.json();
 if(outcome.verified!==true||outcome.isolatedRecovery!==true||outcome.quickCheck!=="ok"||outcome.foreignKeyViolations!==0)
  throw Error("Actual archive verification response invalid");
 console.log("Nexus encrypted R2 restore verified",outcome.tableCount,outcome.recordCount,outcome.schemaObjectCount,outcome.createdAt);
}
export default {
 async fetch(){return new Response("Not found",{status:404,headers:{"Cache-Control":"no-store"}});},
 async scheduled(_event,env){await performRestore(env);},
 async queue(batch,env){
  if(batch.messages?.length!==1||batch.messages[0].body!==EXPLICIT_EVENT)
   throw Error("Unexpected restore queue instruction");
  await performRestore(env);
 }
};
