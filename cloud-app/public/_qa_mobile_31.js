"use strict";
setTimeout(()=>{
 const tests=[],test=(name,pass,detail)=>tests.push({name,pass:!!pass,detail:detail??""});
 try{
  s.account={company:"QA Fictional Business",email:"qa@example.invalid",role:"owner",isPlatformOperator:true};
  s.page="Management";s.managementView="Companies";s.onboardingError="";s.recoveryError="";s.salesError="";
  s.companyInvites=[{id:"invtest",companyName:"QA Company Invitation",email:"qa@example.invalid",createdAt:1794800000,expiresAt:1994800000,redeemedAt:null,revokedAt:null}];
  s.companies=[{id:"cqa",name:"QA Company",ownerEmail:"qa@example.invalid",userCount:1,customerCount:0,jobCount:0}];
  s.newInvite={token:"ab".repeat(32),companyName:"QA Company",email:"qa@example.invalid"};
  draw();
  const nav=[...document.querySelectorAll("[data-page]")];
  test("Five main tabs",nav.length===5);
  test("Mobile tab tap sizes",nav.every(b=>b.getBoundingClientRect().height>=44),nav.map(b=>Math.round(b.getBoundingClientRect().height)).join(","));
  test("Company invite form",!!document.querySelector('[data-form="company-invite"]'));
  test("Invitation copy available",!!document.querySelector('[data-action="copy-company-invite"]'));
  test("Scrollable tables accessible",[...document.querySelectorAll(".tablewrap")].every(d=>d.tabIndex===0 && d.getAttribute("role")==="region"));
  test("No horizontal page overflow",document.documentElement.scrollWidth<=innerWidth+4,document.documentElement.scrollWidth+"/"+innerWidth);
  s.account.isPlatformOperator=false;draw();
  test("Other company blocked",document.getElementById("view").textContent.includes("Access denied")&&!document.querySelector('[data-management="Companies"]'));
  s.account.isPlatformOperator=true;draw();
  test("Management tab remains within five tabs",document.querySelectorAll("[data-page]").length===5);
 }catch(e){tests.push({name:"Uncaught test exception",pass:false,detail:String(e)})}
 const el=document.createElement("pre");el.id="qa-31";el.textContent=JSON.stringify({width:innerWidth,tests});document.body.append(el);
},750);
