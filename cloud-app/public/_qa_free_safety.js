(async()=>{
 const results=[],check=(name,ok,detail="")=>results.push({name,ok:!!ok,detail});
 try{
  s.account={company:"QA Demo",email:"qa@example.invalid",role:"owner",isPlatformOperator:true};
  s.page="Management";s.managementView="Backups";
  s.backupItems=[{id:"fake",note:"QA",createdAt:1794800000,counts:{customers:1,employees:0,jobs:1,estimates:1,invoices:1,appointments:0,payments:1}}];
  s.backupPreview={integrityVerified:true,
   snapshot:{id:"fake",createdAt:1794800000,counts:s.backupItems[0].counts},
   currentCounts:s.backupItems[0].counts};
  s.securitySummary={backups:1,activeSessions:1};
  s.salesLeads=[];s.salesError="";
  draw();
  check("download form",!!document.querySelector('[data-form="download-backup"]'));
  check("local verification form",!!document.querySelector('[data-form="verify-backup"]'));
  document.querySelector('[data-management="Security"]').click();
  check("password change form",!!document.querySelector('[data-form="change-password"]'));
  check("five main tabs",document.querySelectorAll("[data-page]").length===5);
  check("sales tab operator",!!document.querySelector('[data-management="Sales Leads"]'));
  s.account.isPlatformOperator=false;draw();
  check("sales hidden from future company",!document.querySelector('[data-management="Sales Leads"]'));
  s.account.isPlatformOperator=true;draw();
  check("mobile scroll",document.documentElement.scrollWidth<=window.innerWidth+4,String(document.documentElement.scrollWidth)+" / "+window.innerWidth);
  let captured=null;
  const previousObject=URL.createObjectURL,previousClick=HTMLAnchorElement.prototype.click;
  try{
   URL.createObjectURL=b=>{captured=b;return "blob:qa-mock"};
   HTMLAnchorElement.prototype.click=function(){};
   const rows={customers:[{id:"sample",name:"QA"}],employees:[],jobs:[],estimates:[],invoices:[],appointments:[],payments:[]};
   const mock={format:"nexus-crm-business-export-v1",company:"QA Test Only",createdAt:1794800000,records:rows,schemaVersion:1};
   await encryptedBackupDownload(mock,"test-only-secret-passphrase-123456");
   check("encrypted backup created",!!captured && captured.size>100);
   if(captured){
    const verified=await verifyLocalEncryptedBackup({size:captured.size,text:()=>captured.text()},"test-only-secret-passphrase-123456");
    check("encrypted backup decrypts",verified.company==="QA Test Only"&&verified.counts.customers===1);
   }
  }finally{URL.createObjectURL=previousObject;HTMLAnchorElement.prototype.click=previousClick}
 }catch(e){results.push({name:"exception",ok:false,detail:String(e)})}
 const el=document.createElement("pre");el.id="qa-free-results";el.textContent=JSON.stringify(results);document.body.appendChild(el);
})();
