"use strict";
setTimeout(()=>{
 const checks=[],ok=(name,pass,detail)=>checks.push({name,pass:!!pass,detail:detail||""});
 try{
  s.account={company:"QA Fictional Firm",email:"owner@example.invalid",role:"owner",isPlatformOperator:false};
  s.page="Management";s.managementView="Team Access";s.staffError="";s.recoveryError="";
  s.staffUsers=[
   {id:"owner123",email:"owner@example.invalid",role:"owner",disabledAt:null,createdAt:1794000000},
   {id:"active123",email:"active@example.invalid",role:"admin",disabledAt:null,createdAt:1794000000},
   {id:"disabled123",email:"disabled@example.invalid",role:"employee",disabledAt:1794000001,createdAt:1794000000}
  ];
  s.staffInvites=[];s.newStaffInvite=null;draw();
  const view=document.getElementById("view");
  ok("Owner has five tabs",document.querySelectorAll("[data-page]").length===5);
  ok("Team form",!!view.querySelector('[data-form="staff-invite"]'));
  ok("Disable staff account",!!view.querySelector('form[data-form="toggle-staff"] input[value="disable"]'));
  ok("Enable disabled account",!!view.querySelector('form[data-form="toggle-staff"] input[value="enable"]'));
  ok("Owner account protected",view.querySelectorAll('form[data-form="toggle-staff"]').length===2);
  ok("Mobile horizontally contained",document.documentElement.scrollWidth<=innerWidth+4,document.documentElement.scrollWidth+"/"+innerWidth);
  s.page="Account";draw();ok("Recovery codes available",!!document.querySelector('form[data-form="generate-recovery"]'));
  s.account={company:"QA",email:"worker@example.invalid",role:"employee",isPlatformOperator:false};
  s.page="Dashboard";s.dashboard={customers:1,openJobs:1,jobPipeline:999};draw();
  ok("Employee sees three tabs",document.querySelectorAll("[data-page]").length===3);
  ok("Employee sees no Finance",!document.querySelector('[data-page="Finance"]'));
  ok("Employee sees no financial metric",![...document.querySelectorAll(".card")].some(x=>x.textContent.includes("Job pipeline")));
  recoveryScreen();ok("Reset form appears",!!document.querySelector('[data-form="recover"]'));
 }catch(e){checks.push({name:"Unexpected error",pass:false,detail:String(e)})}
 const out=document.createElement("pre");out.id="qa-staff-disable";out.textContent=JSON.stringify({width:innerWidth,checks});document.body.append(out);
},650);
