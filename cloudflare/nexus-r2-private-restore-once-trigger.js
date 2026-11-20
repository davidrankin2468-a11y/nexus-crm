// Temporary PRIVATE scheduled control for one isolated R2 restore drill.
// No public routing/subdomain and no live CRM database binding.
// The encrypted object and decryption secret remain inside the dedicated
// nexus-crm-pos-r2-backups Worker, reached only through a service binding.
export default {
 async fetch(){return new Response("Not found",{status:404,headers:{"Cache-Control":"no-store"}});},
 async scheduled(_event,env){
  // After restoration succeeds, subsequent ticks do nothing. The trigger
  // itself is removed after a verified restore, to avoid perpetual billing.
  const ready=await env.RECOVERY_DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").first();
  if(ready){console.log("Isolated restore already present; no repeat write");return;}
  const result=await env.BACKUP_SERVICE.fetch("https://private-restore.internal/__internal/restore-drill",{
   method:"POST",headers:{"X-Nexus-Restore-Proof":env.RESTORE_DRILL_SECRET}
  });
  if(!result.ok){
   console.error("Isolated R2 restore attempt failed",result.status);
   throw Error("Isolated encrypted R2 restore failed");
  }
  const report=await result.json();
  if(report.verified!==true||report.isolatedRecovery!==true||report.quickCheck!=="ok")
   throw Error("Isolated R2 restore returned invalid verification report");
  console.log("Nexus isolated encrypted R2 restore complete",report.tableCount,report.recordCount,report.schemaObjectCount,report.createdAt);
 }
};
