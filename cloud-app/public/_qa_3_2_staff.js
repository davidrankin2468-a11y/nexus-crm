"use strict";
setTimeout(()=>{
 const checks=[],record=(name,pass,detail)=>checks.push({name,pass:!!pass,detail:detail||""});
 try{
  s.account={company:"QA Fictional Business",email:"qa@example.invalid",role:"owner",isPlatformOperator:true};
  s.page="Management";s.managementView="Team Access";s.recoveryError="";s.staffError="";
  s.staffUsers=[{id:"a",email:"owner@example.invalid",role:"owner",createdAt:1794000000},
    {id:"b",email:"employee@example.invalid",role:"employee",createdAt:1794000000}];
  s.staffInvites=[{id:"invite",email:"qa-staff@example.invalid",role:"admin",createdAt:1794000000,
   expiresAt:1994000000,redeemedAt:null,revokedAt:null}];
  s.newStaffInvite={token:"ab".repeat(32),email:"qa-staff@example.invalid",role:"admin"};
  draw();
  record("five owner tabs",document.querySelectorAll("[data-page]").length===5);
  record("owner staff invite form",!!document.querySelector('[data-form="staff-invite"]'));
  record("owner can revoke",!!document.querySelector('[data-form="revoke-staff"]'));
  record("copy staff invite",!!document.querySelector('[data-action="copy-staff-invite"]'));
  record("focusable swipeable tables",[...document.querySelectorAll(".tablewrap")].every(x=>x.tabIndex===0&&x.getAttribute("role")==="region"));
  s.page="Account";s.newRecoveryCodes=null;draw();
  record("change password form",!!document.querySelector('[data-form="change-password"]'));
  record("generate recovery form",!!document.querySelector('[data-form="generate-recovery"]'));
  s.account={company:"QA",email:"admin@example.invalid",role:"admin",isPlatformOperator:false};
  s.page="Dashboard";draw();
  record("admin four tabs",document.querySelectorAll("[data-page]").length===4&&!document.querySelector('[data-page="Management"]'));
  s.account={company:"QA",email:"worker@example.invalid",role:"employee",isPlatformOperator:false};
  s.page="Dashboard";s.dashboard={customers:1,openJobs:1,jobPipeline:400};draw();
  record("employee three tabs",document.querySelectorAll("[data-page]").length===3&&!document.querySelector('[data-page="Finance"]'));
  record("employee financial metric hidden",![...document.querySelectorAll(".card")].some(x=>x.textContent.includes("Job pipeline")));
  s.page="Customers";s.customers=[{id:"c",name:"Sample Fictional",email:"",phone:""}];draw();
  record("employee edit controls removed",!document.querySelector('[data-form="customer"]')&&!document.querySelector('[data-customer]'));
  s.page="Account";draw();
  record("employee can manage own account",!!document.querySelector('[data-form="generate-recovery"]'));
  record("no page overflow",document.documentElement.scrollWidth<=innerWidth+4,document.documentElement.scrollWidth+"/"+innerWidth);
  recoveryScreen();
  record("recovery form appears",!!document.querySelector('[data-form="recover"]'));
 }catch(e){checks.push({name:"Unexpected UI error",pass:false,detail:String(e)})}
 const el=document.createElement("pre");el.id="qa-staff-32";el.textContent=JSON.stringify({width:innerWidth,checks});document.body.appendChild(el);
},650);
