"use strict";
setTimeout(()=>{
 const checks=[],check=(name,pass)=>checks.push({name,pass:!!pass});
 try{
  s.account={company:"QA Fictional Company",email:"qa@example.invalid",role:"owner",isPlatformOperator:true};
  s.page="Management";s.managementView="Companies";s.onboardingError="";s.recoveryError="";
  s.companyInvites=[{id:"qa-invite",companyName:"QA Fictional Tenant",email:"qa@example.invalid",createdAt:1794800000,expiresAt:1994800000,redeemedAt:null,revokedAt:null}];
  s.companies=[{id:"qa-company",name:"QA Fictional Tenant",ownerEmail:"qa@example.invalid",userCount:1,customerCount:0,jobCount:0}];
  s.newInvite={token:"ab".repeat(32),companyName:"QA Fictional Tenant",email:"qa@example.invalid"};
  draw();
  check("five main tabs",document.querySelectorAll('[data-page]').length===5);
  check("create invitation",!!document.querySelector('[data-form="company-invite"]'));
  check("revoke invitation",!!document.querySelector('[data-form="revoke-company-invite"]'));
  check("copy one-time link",!!document.querySelector('[data-action="copy-company-invite"]'));
  check("no horizontal overflow",document.documentElement.scrollWidth<=innerWidth+3);
  s.account.isPlatformOperator=false;draw();
  check("nonoperator denied",document.getElementById("view").textContent.includes("Access denied"));
  check("nonoperator nav hidden",!document.querySelector('[data-management="Companies"]'));
 }catch(e){checks.push({name:"exception",pass:false,error:String(e)})}
 const pre=document.createElement("pre");pre.id="qa-company-mobile";pre.textContent=JSON.stringify(checks);document.body.append(pre);
},900);
