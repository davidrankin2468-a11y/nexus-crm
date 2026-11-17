"use strict";
(async()=>{
 const checks=[];
 const add=(name,pass,detail)=>checks.push({name,pass:!!pass,detail:detail??""});
 try{
  const endpoints=[
   ["/api/health",200],["/api/status",200],["/api/me",401],
   ["/api/customers",401],["/api/jobs",401],["/api/invoices",401],
   ["/api/backups",401],["/api/platform/companies",401],
   ["/api/security/summary",401],["/api/staff/users",401]
  ];
  for(const [url,expected] of endpoints){
   const resp=await fetch(url,{cache:"no-store",credentials:"omit"});
   add("Live "+url,resp.status===expected,String(resp.status));
   if(url==="/api/health"){
    add("Response prevents caching",resp.headers.get("cache-control")==="no-store");
    add("Response declares nosniff",resp.headers.get("x-content-type-options")==="nosniff");
   }
  }
  const noAuthWrite=await fetch("/api/customers",{method:"POST",headers:{"Content-Type":"application/json"},
   credentials:"omit",body:JSON.stringify({name:"NEVER CREATE THIS"})});
  add("Unauthenticated write rejected",noAuthWrite.status===401,String(noAuthWrite.status));
  s.account={company:"QA Temporary Browser View",email:"qa@example.invalid",role:"owner",isPlatformOperator:true};
  s.dashboard={customers:2,openJobs:2,jobPipeline:800};
  s.customers=[{id:"c1",name:"Fictional Customer",email:"",phone:"",notes:""}];
  s.jobs=[{id:"j1",customerId:"c1",customerName:"Fictional Customer",title:"Fictional Job",status:"Planned",amount:800,scheduledDate:""}];
  s.employees=[{id:"e1",name:"QA Employee",jobTitle:"Tester",email:"",phone:"",status:"Active"}];
  s.appointments=[];s.estimates=[];s.invoices=[];s.payments=[];
  s.financeError="";s.financeReport={estimates:0,invoices:0,acceptedEstimateTotal:0,invoiceTotal:0,paymentTotal:0,outstanding:0,overdueBalance:0};
  s.managementView="Security";s.securitySummary={activeSessions:1,backups:0};s.auditEvents=[];s.recoveryError="";
  s.salesLeads=[];s.salesTotal=0;s.salesNew=0;s.salesError="";
  s.companyInvites=[];s.companies=[];s.onboardingError="";
  s.staffUsers=[];s.staffInvites=[];s.staffError="";
  for(const page of ["Dashboard","Customers","Operations","Finance","Management"]){
   s.page=page;draw();
   const view=document.getElementById("view");
   add(page+" renders",view.children.length>0);
   add(page+" within viewport",document.documentElement.scrollWidth<=innerWidth+3,String(document.documentElement.scrollWidth)+"/"+innerWidth);
  }
  for(const [page,subviews,key] of [
   ["Operations",["Jobs","Employees","Schedule"],"operationsView"],
   ["Finance",["Estimates","Invoices","Payments","Reports"],"financeView"],
   ["Management",["Backups","Security","Companies","Team Access","Sales Leads"],"managementView"]
  ]){
   for(const subview of subviews){
    s.page=page;s[key]=subview;draw();
    const view=document.getElementById("view");
    add(page+" / "+subview,view.children.length>0&&document.documentElement.scrollWidth<=innerWidth+3);
   }
  }
  s.page="Customers";draw();
  const editor=document.querySelector(".editor-panel");
  add("Customer editor initially closed",!!editor&&!editor.open);
  editor?.querySelector("summary")?.click();
  add("Customer editor opens on tap",!!editor?.open);
  s.page="Management";s.managementView="Security";draw();
  add("Only one password form",document.querySelectorAll('[data-form="change-password"]').length===1);
  s.account.role="employee";s.page="Dashboard";draw();
  add("Employee finance hidden",!document.querySelector('[data-page="Finance"]'));
  s.page="Customers";draw();
  add("Employee editor hidden",!document.querySelector('[data-form="customer"]'));
  add("No promotional links",!document.getElementById("mount").textContent.includes("View public demo"));
 }catch(e){add("Browser runtime error",false,String(e).slice(0,240))}
 const pre=document.createElement("pre");pre.id="qa-api-smoke-report";
 pre.textContent=JSON.stringify({viewport:innerWidth,total:checks.length,passed:checks.filter(x=>x.pass).length,checks});
 document.body.appendChild(pre);
})();