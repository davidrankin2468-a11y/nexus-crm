"use strict";
setTimeout(()=>{
 const checks=[],ok=(name,pass,detail)=>checks.push({name,pass:!!pass,detail:detail||""});
 try{
  s.account={company:"Fictional QA Company",email:"qa@example.invalid",role:"owner",isPlatformOperator:true};
  s.dashboard={customers:1,openJobs:1,jobPipeline:1250};
  s.customers=[{id:"qa-c",name:"Fictional Customer",email:"qa-c@example.invalid",phone:"",notes:""}];
  s.jobs=[{id:"qa-j",title:"Fictional Job",customerId:"qa-c",customerName:"Fictional Customer",amount:250,status:"Planned",scheduledDate:""}];
  s.employees=[{id:"qa-e",name:"Sample Employee",jobTitle:"Technician",email:"qa-e@example.invalid",status:"Active",phone:""}];
  s.appointments=[];s.estimates=[];s.invoices=[];s.payments=[];s.financeError="";s.financeReport={estimates:0,invoices:0,acceptedEstimateTotal:0,invoiceTotal:0,paymentTotal:0,outstanding:0,overdueBalance:0};
  s.managementView="Security";s.securitySummary={activeSessions:1,backups:0};s.auditEvents=[];s.recoveryError="";s.onboardingError="";s.companyInvites=[];s.companies=[];s.staffUsers=[];s.staffInvites=[];s.staffError="";s.salesLeads=[];s.salesTotal=0;s.salesNew=0;s.salesError="";
  for(const page of ["Dashboard","Customers","Operations","Finance","Management"]){
   s.page=page;draw();
   const main=document.getElementById("view");
   ok(page+" loaded",main.children.length>0);
   ok(page+" fits phone",document.documentElement.scrollWidth<=innerWidth+3,document.documentElement.scrollWidth+"/"+innerWidth);
   ok(page+" has no public demo link",!document.getElementById("mount").textContent.includes("View public demo"));
  }
  s.page="Customers";draw();
  let details=document.querySelector(".editor-panel");
  ok("Customer form starts collapsed",details&&!details.open);
  ok("Tap target at least 44px",details?.querySelector("summary")?.getBoundingClientRect().height>=44);
  details?.querySelector("summary")?.click();
  ok("Customer add form expands",details?.open&&!!details.querySelector('[data-form="customer"]'));
  s.page="Operations";s.operationsView="Employees";draw();
  ok("Operations sub-tabs",document.querySelectorAll('[data-operation]').length===3);
  ok("Employee editor collapsed",!!document.querySelector('.editor-panel:not([open]) [data-form="employee"]'));
  s.page="Finance";s.financeView="Invoices";draw();
  ok("Finance sub-tabs",document.querySelectorAll('[data-finance]').length>=4);
  ok("Invoice editor collapsed",!!document.querySelector('.editor-panel:not([open]) [data-form="invoice"]'));
  s.page="Management";s.managementView="Team Access";draw();
  ok("Management sub-tabs",document.querySelectorAll('[data-management]').length>=5);
  ok("Team invite collapsed",!!document.querySelector('.editor-panel:not([open]) [data-form="staff-invite"]'));
  s.managementView="Companies";draw();
  ok("Company invite collapsed",!!document.querySelector('.editor-panel:not([open]) [data-form="company-invite"]'));
  s.managementView="Security";draw();
  ok("Security exists once",document.querySelectorAll('[data-form="change-password"]').length===1);
  ok("Recent activity tucked away",!!document.querySelector('.disclosure-panel:not([open])'));
  const btns=[...document.querySelectorAll(".section-tab")];
  ok("Section buttons touch friendly",btns.every(x=>x.getBoundingClientRect().height>=43),btns.map(x=>Math.round(x.getBoundingClientRect().height)).join(","));
 }catch(e){checks.push({name:"UI runtime",pass:false,detail:String(e)})}
 const pre=document.createElement("pre");pre.id="qa-clean-pages";pre.textContent=JSON.stringify({width:innerWidth,checks});document.body.append(pre);
},900);
