"use strict";
setTimeout(async()=>{
 const checks=[],add=(name,pass,detail)=>checks.push({name,pass:!!pass,detail:detail??""});
 try{
  const health=await fetch("/api/health",{cache:"no-store"}).then(r=>r.json());
  add("Live CRM version 3.4",health.version==="3.4-alpha");
  add("MFA encryption configured",health.authenticatorAvailable===true);
  const noAuth=await fetch("/api/security/mfa/status",{credentials:"omit"});
  add("Protected MFA status",noAuth.status===401,String(noAuth.status));
  s.account={company:"QA Fictional Company",email:"qa@example.invalid",role:"owner",isPlatformOperator:false};
  s.page="Management";s.managementView="Security";s.recoveryError="";
  s.auditEvents=[];s.securitySummary={activeSessions:1,backups:0};
  s.mfaStatus={available:true,enabled:false};s.newMfaSecret=null;
  draw();
  add("Owner MFA enrollment",!!document.querySelector('form[data-form="mfa-start"]'));
  add("Single password change form",document.querySelectorAll('[data-form="change-password"]').length===1);
  s.newMfaSecret={secret:"THISISONLYATESTKEY"};
  draw();
  add("Manual setup key displayed",document.querySelector('input[aria-label="Authenticator manual setup key"]')?.value==="THISISONLYATESTKEY");
  add("Six-digit confirmation form",!!document.querySelector('form[data-form="mfa-confirm"]'));
  s.mfaStatus={available:true,enabled:true};s.newMfaSecret=null;draw();
  add("MFA disable form",!!document.querySelector('form[data-form="mfa-disable"]'));
  s.account.role="employee";s.page="Account";s.mfaStatus={available:true,enabled:false};draw();
  add("Employee MFA enrollment available",!!document.querySelector('form[data-form="mfa-start"]'));
  s.mfaChallenge="ab".repeat(32);authenticatorScreen();
  add("MFA sign-in screen",!!document.querySelector('form[data-form="login-mfa"]'));
  add("No horizontal page overflow",document.documentElement.scrollWidth<=innerWidth+3,document.documentElement.scrollWidth+"/"+innerWidth);
 }catch(e){checks.push({name:"Runtime exception",pass:false,detail:String(e)})}
 const pre=document.createElement("pre");pre.id="qa-mfa-checks";
 pre.textContent=JSON.stringify({width:innerWidth,total:checks.length,passed:checks.filter(x=>x.pass).length,checks});
 document.body.appendChild(pre);
},900);
