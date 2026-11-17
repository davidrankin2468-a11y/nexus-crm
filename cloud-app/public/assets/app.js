"use strict";
const $=id=>document.getElementById(id);
const safe=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=n=>Number(n||0).toLocaleString("en-US",{style:"currency",currency:"USD"});
const tabs=["Dashboard","Customers","Operations","Finance","Management"];
const statuses=["Planned","Scheduled","In Progress","On Hold","Completed","Cancelled"];
const s={account:null,csrf:"",page:"Dashboard",customers:[],jobs:[],employees:[],appointments:[],dashboard:null,editingCustomer:null,editingJob:null,editingEmployee:null,editingAppointment:null,operationsView:"Jobs",estimates:[],invoices:[],payments:[],financeReport:null,financeView:"Estimates",editingEstimate:null};
async function request(path,method="GET",data=null){
 const headers={"Accept":"application/json"};
 if(data!==null)headers["Content-Type"]="application/json";
 if(method!=="GET"&&s.csrf)headers["X-Nexus-CSRF"]=s.csrf;
 const res=await fetch(path,{method,credentials:"same-origin",cache:"no-store",headers,body:data===null?undefined:JSON.stringify(data)});
 let json;try{json=await res.json()}catch{throw new Error("The server returned an unexpected response")}
 if(!res.ok)throw new Error(json?.error||"Request failed");
 return json;
}
function notice(text){
 const el=$("message");if(!text){el.hidden=true;el.textContent="";return}
 el.textContent=text;el.hidden=false;
}
function authScreen(mode){
 s.account=null;s.csrf="";
 const setup=mode==="setup";
 $("mount").innerHTML='<div class="auth"><h1>'+ (setup?"Set up Nexus CRM":"Nexus CRM Sign In") +'</h1>'+
 '<p>'+(setup?"Create your first private company administrator account. This is separate from the public demo.":"Sign in to your private cloud CRM.")+'</p>'+
 '<form data-form="'+(setup?"setup":"login")+'">'+
 (setup?'<label>One-time setup code<input name="setupCode" required minlength="30" autocomplete="off" placeholder="Paste your setup code"></label>'+
 '<label>Company name<input name="companyName" required maxlength="150" placeholder="Your company"></label>':"")+
 '<label>Email address<input name="email" type="email" required autocomplete="username"></label>'+
 '<label>Password<input name="password" type="password" required '+(setup?'minlength="12" autocomplete="new-password"':'autocomplete="current-password"')+'></label>'+
 '<div class="hint">'+(setup?"The setup code is valid for one registration. Choose a strong unique password and keep it private.":"Your session is protected by a secure HTTP-only cookie. Never share your password.")+'</div>'+
 '<button class="primary" type="submit">'+(setup?"Create administrator account":"Sign in")+'</button></form>'+
 '<p class="muted" style="font-size:12px">Security alpha: invite accounts, MFA, and comprehensive backups are not available yet. Use test data only.</p></div>';
}
function statusBadge(v){return '<span class="tag">'+safe(v)+'</span>'}
function table(headers,rows){
 return '<div class="tablewrap"><table><thead><tr>'+headers.map(h=>'<th>'+safe(h)+'</th>').join("")+'</tr></thead><tbody>'+
 (rows.length?rows.join(""):'<tr><td colspan="'+headers.length+'" class="muted">No records yet.</td></tr>')+
 '</tbody></table></div>';
}
function panel(title,contents){return '<section class="panel"><h2>'+safe(title)+'</h2>'+contents+'</section>'}
function input(name,label,value="",type="text",required=false){
 return '<label>'+safe(label)+'<input name="'+safe(name)+'" type="'+safe(type)+'" value="'+safe(value)+'" maxlength="250" '+(required?"required":"")+'></label>';
}
function customerOptions(selected){
 return s.customers.map(c=>'<option value="'+safe(c.id)+'" '+(c.id===selected?"selected":"")+'>'+safe(c.name)+'</option>').join("");
}
function jobStatusOptions(selected){
 return statuses.map(k=>'<option value="'+safe(k)+'" '+(k===selected?"selected":"")+'>'+safe(k)+'</option>').join("");
}
function localDate(){
 const d=new Date();const f=new Date(d.getTime()-d.getTimezoneOffset()*60000);
 return f.toISOString().slice(0,10);
}
const financeViews=["Estimates","Invoices","Payments","Reports"];
const estimateStatusOptions=selected=>["Draft","Sent","Accepted","Declined"].map(v=>'<option value="'+v+'" '+(v===selected?"selected":"")+'>'+v+'</option>').join("");
const financeNavigation=()=>'<div class="actionrow">'+financeViews.map(t=>
 '<button type="button" data-finance="'+t+'" class="'+(s.financeView===t?"primary":"")+'">'+t+'</button>').join("")+'</div>';
function financeContent(){
 const nav=financeNavigation(),view=s.financeView;
 if(view==="Estimates"){
  const e=s.estimates.find(x=>x.id===s.editingEstimate);
  const create='<form data-form="estimate" class="gridform">'+
    '<label>Customer<select name="customerId" required>'+customerOptions(e?.customerId)+'</select></label>'+
    input("description","Work description",e?.description||"","text",true)+
    '<label>Estimate amount ($)<input name="amount" type="number" required min="0" step=".01" max="1000000000" value="'+safe(e?.amount??0)+'"></label>'+
    '<label>Status<select name="status">'+estimateStatusOptions(e?.status||"Draft")+'</select></label>'+
    '<div class="actionrow"><button class="primary" type="submit">'+(e?"Save estimate":"Create estimate")+'</button>'+
     (e?'<button type="button" data-action="cancel-edit">Cancel</button>':"")+'</div></form>';
  const eligible=s.estimates.filter(x=>x.status==="Accepted"&&!x.invoiced&&x.amount>0);
  const convert=eligible.length?'<form data-form="convert-estimate" class="gridform">'+
   '<label>Accepted estimate<select name="estimateId" required>'+eligible.map(x=>
    '<option value="'+safe(x.id)+'">'+safe(x.number)+" · "+safe(x.customerName)+" · "+money(x.amount)+'</option>').join("")+'</select></label>'+
   input("dueDate","Invoice due date",localDate(),"date",true)+
   '<div class="actionrow"><button class="primary" type="submit">Create invoice from estimate</button></div></form>':
   '<p>Mark an estimate as Accepted (with an amount above $0) to convert it into an invoice.</p>';
  const rows=s.estimates.map(x=>'<tr><td>'+safe(x.number)+'</td><td>'+safe(x.customerName)+'</td><td>'+safe(x.description)+'</td><td>'+money(x.amount)+'</td><td>'+statusBadge(x.status)+'</td><td>'+
   (x.invoiced?'<span class="muted">Invoiced</span>':'<button data-estimate="'+safe(x.id)+'">Edit</button>')+
   ' <button data-print-type="estimate" data-print-id="'+safe(x.id)+'">Print</button></td></tr>');
  return nav+panel(e?"Edit estimate":"New estimate",s.customers.length?create:"<p>Add a customer before creating an estimate.</p>")+
   panel("Convert accepted estimate to invoice",convert)+panel("Saved estimates",table(["Estimate","Customer","Work","Amount","Status","Actions"],rows));
 }
 if(view==="Invoices"){
  const create='<form data-form="invoice" class="gridform">'+
   '<label>Customer<select name="customerId" required>'+customerOptions()+'</select></label>'+
   input("description","Invoice description","","text",true)+
   '<label>Invoice amount ($)<input name="amount" type="number" required min=".01" step=".01" max="1000000000" value="0.00"></label>'+
   input("dueDate","Due date",localDate(),"date",true)+
   '<div class="actionrow"><button class="primary" type="submit">Create invoice</button></div></form>';
  const rows=s.invoices.map(x=>'<tr><td>'+safe(x.number)+'</td><td>'+safe(x.customerName)+'</td><td>'+money(x.amount)+'</td><td>'+
   money(x.paid)+'</td><td>'+money(x.balance)+'</td><td>'+safe(x.dueDate)+'</td><td>'+statusBadge(x.status)+'</td><td>'+
   '<button data-print-type="invoice" data-print-id="'+safe(x.id)+'">Print</button></td></tr>');
  return nav+panel("Create invoice",s.customers.length?create:'<p>Add a customer before creating an invoice.</p>')+
   panel("Saved invoices",table(["Invoice","Customer","Amount","Paid","Balance","Due date","Status","Action"],rows))+
   '<p class="muted">Invoices are draft bookkeeping records. Tax, line items, legal terms, and sending emails are not included yet.</p>';
 }
 if(view==="Payments"){
  const due=s.invoices.filter(x=>Number(x.balance)>0.005);
  const form=due.length?'<form data-form="payment" class="gridform">'+
   '<label>Invoice with balance<select name="invoiceId" required>'+due.map(i=>'<option value="'+safe(i.id)+'">'+safe(i.number)+' · '+safe(i.customerName)+' · Due '+money(i.balance)+'</option>').join("")+'</select></label>'+
   '<label>Amount received ($)<input name="amount" type="number" required min=".01" step=".01" max="1000000000" placeholder="0.00"></label>'+
   input("paidDate","Received date",localDate(),"date",true)+
   '<label>Method<select name="method">'+["Cash","Check","Bank transfer","Card (external)","Other"].map(m=>'<option value="'+safe(m)+'">'+safe(m)+'</option>').join("")+'</select></label>'+
   input("note","Reference / note")+
   '<div class="actionrow"><button class="primary" type="submit">Record received payment</button></div></form>':
   '<p>There are no unpaid invoices. Create an invoice to record a payment.</p>';
  const rows=s.payments.map(p=>'<tr><td>'+safe(p.paidDate)+'</td><td>'+safe(p.invoiceNumber)+'</td><td>'+safe(p.customerName)+'</td><td>'+
   money(p.amount)+'</td><td>'+safe(p.method)+'</td><td>'+safe(p.note)+'</td></tr>');
  return nav+panel("Record a payment",form)+panel("Payment history",table(["Date","Invoice","Customer","Amount","Method","Note"],rows))+
   '<p class="hint">Record payments you received outside this app. Nexus CRM does not charge cards, transfer funds, or verify bank deposits.</p>';
 }
 const x=s.financeReport||{estimates:0,invoices:0,acceptedEstimateTotal:0,invoiceTotal:0,paymentTotal:0,outstanding:0,overdueBalance:0};
 const cards='<div class="cards">'+
  '<div class="card">Estimates<strong>'+safe(x.estimates)+'</strong></div>'+
  '<div class="card">Invoices<strong>'+safe(x.invoices)+'</strong></div>'+
  '<div class="card">Invoice total<strong>'+money(x.invoiceTotal)+'</strong></div>'+
  '<div class="card">Recorded payments<strong>'+money(x.paymentTotal)+'</strong></div>'+
  '<div class="card">Outstanding<strong>'+money(x.outstanding)+'</strong></div>'+
  '<div class="card">Overdue<strong>'+money(x.overdueBalance)+'</strong></div></div>';
 const statusCounts=["Paid","Partial","Overdue","Unpaid"].map(v=>
  '<tr><td>'+v+'</td><td>'+s.invoices.filter(i=>i.status===v).length+'</td></tr>');
 return nav+cards+
  panel("Finance reporting",table(["Invoice status","Count"],statusCounts)+
    '<p>Accepted estimate pipeline: <strong>'+money(x.acceptedEstimateTotal)+'</strong></p>')+
  panel("Export preview records",'<div class="actionrow">'+["estimates","invoices","payments"].map(t=>'<button data-export="'+t+'">'+
   t.charAt(0).toUpperCase()+t.slice(1)+' CSV</button>').join("")+'</div>')+
  '<p class="muted">Reports reflect recorded bookkeeping entries only. No bank reconciliation or tax reporting is provided.</p>';
}
function saveCSV(kind){
 const rows={estimates:s.estimates,invoices:s.invoices,payments:s.payments}[kind];
 if(!rows)return;
 const cols={estimates:["number","customerName","description","amount","status","createdAt"],
  invoices:["number","customerName","description","amount","paid","balance","dueDate","status"],
  payments:["invoiceNumber","customerName","amount","paidDate","method","note"]}[kind];
 const cell=v=>'"'+String(v??"").replace(/"/g,'""')+'"';
 const csv=[cols.join(",")].concat(rows.map(x=>cols.map(k=>cell(x[k])).join(","))).join("\r\n");
 const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
 const a=document.createElement("a");a.href=url;a.download="nexus-finance-"+kind+"-"+localDate()+".csv";
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function printFinance(kind,recordId){
 const x=(kind==="invoice"?s.invoices:s.estimates).find(v=>v.id===recordId);
 if(!x)return;
 const inv=kind==="invoice";
 const head=(inv?"INVOICE":"ESTIMATE")+" "+safe(x.number);
 const details=[
  '<p><strong>Customer:</strong> '+safe(x.customerName)+'</p>',
  '<p><strong>Description:</strong> '+safe(x.description)+'</p>',
  '<p><strong>Status:</strong> '+safe(x.status)+'</p>',
  inv?'<p><strong>Due date:</strong> '+safe(x.dueDate)+'</p>':'',
  '<h2>Amount: '+money(x.amount)+'</h2>',
  inv?'<p>Recorded payments: '+money(x.paid)+' · Outstanding: '+money(x.balance)+'</p>':'',
  '<hr><p>Development preview — not a final tax invoice or proof of payment.</p>'
 ].join("");
 const content='<!doctype html><html lang="en"><head><meta charset="utf-8"><title>'+head+
  '</title><style>body{font-family:Arial,sans-serif;max-width:760px;margin:40px auto;padding:20px;color:#1c2930;line-height:1.5}h1{border-bottom:3px solid #77ad62;padding-bottom:12px}h2{font-size:23px}p{margin:14px 0}@media print{body{margin:0}}</style></head><body>'+
  '<small>'+safe(s.account?.company||"Nexus CRM")+'</small><h1>'+head+'</h1>'+details+'</body></html>';
 const w=window.open("","_blank");
 if(!w){notice("Allow pop-ups for this site to print your document.");return}
 w.document.open();w.document.write(content);w.document.close();w.focus();w.print();
}

function currentTab(){
 const d=$("view");
 if(s.page==="Dashboard"){
  const x=s.dashboard||{customers:0,openJobs:0,jobPipeline:0};
  d.innerHTML='<div class="cards">'+
  '<div class="card">Customers<strong>'+x.customers+'</strong></div>'+
  '<div class="card">Open jobs<strong>'+x.openJobs+'</strong></div>'+'<div class="card">Employees<strong>'+s.employees.length+'</strong></div>'+'<div class="card">Appointments<strong>'+s.appointments.length+'</strong></div>'+
  '<div class="card">Job pipeline<strong>'+money(x.jobPipeline)+'</strong></div></div>'+
  panel("Cloud data is connected",'<p>The dashboard is reading records from your company’s Cloudflare D1 database, not from the public demo or this browser’s local storage.</p>')+
  panel("Next development milestones",'<p>Finance, private backups, and offline synchronization remain upcoming milestones. Employees and appointments now have permanent cloud storage.</p>');
 }
 if(s.page==="Customers"){
  const editing=s.customers.find(c=>c.id===s.editingCustomer);
  const form='<form data-form="customer" class="gridform">'+
   input("name","Customer name",editing?.name||"","text",true)+input("email","Email address",editing?.email||"","email")+
   input("phone","Phone",editing?.phone||"")+input("notes","Notes",editing?.notes||"")+
   '<div class="actionrow"><button class="primary" type="submit">'+(editing?"Save customer":"Add customer")+'</button>'+
   (editing?'<button type="button" data-action="cancel-edit">Cancel</button>':"")+'</div></form>';
  const rows=s.customers.map(c=>'<tr><td>'+safe(c.name)+'</td><td>'+safe(c.email)+'</td><td>'+safe(c.phone)+'</td><td><button data-customer="'+safe(c.id)+'">Edit</button></td></tr>');
  d.innerHTML=panel(editing?"Edit customer":"Add customer",form)+panel("Saved customers",table(["Name","Email","Phone","Action"],rows));
 }
 if(s.page==="Operations"){
  const nav='<div class="actionrow">'+["Jobs","Schedule","Employees"].map(t=>'<button data-operation="'+t+'" class="'+(s.operationsView===t?"primary":"")+'">'+t+'</button>').join("")+'</div>';
  if(s.operationsView==="Jobs"){
  const editing=s.jobs.find(j=>j.id===s.editingJob);
  const form=s.customers.length?
    '<form data-form="job" class="gridform">'+
    '<label>Customer<select name="customerId" required>'+customerOptions(editing?.customerId)+'</select></label>'+
    input("title","Job title",editing?.title||"","text",true)+
    '<label>Amount ($)<input name="amount" type="number" min="0" max="1000000000" step=".01" required value="'+safe(editing?.amount??0)+'"></label>'+
    input("scheduledDate","Scheduled date",editing?.scheduledDate||"","date")+
    '<label>Status<select name="status">'+jobStatusOptions(editing?.status||"Planned")+'</select></label>'+
    '<div class="actionrow"><button class="primary" type="submit">'+(editing?"Save job":"Create job")+'</button>'+
    (editing?'<button type="button" data-action="cancel-edit">Cancel</button>':"")+'</div></form>':
    '<p>Add a customer in the Customers tab before creating jobs.</p>';
  const rows=s.jobs.map(j=>'<tr><td>'+safe(j.title)+'</td><td>'+safe(j.customerName)+'</td><td>'+money(j.amount)+'</td><td>'+statusBadge(j.status)+'</td><td>'+safe(j.scheduledDate||"Not scheduled")+'</td><td><button data-job="'+safe(j.id)+'">Edit</button></td></tr>');
  d.innerHTML=nav+panel(editing?"Edit job":"Create job",form)+panel("Saved jobs",table(["Job","Customer","Amount","Status","Date","Action"],rows));

  }else if(s.operationsView==="Employees"){
   const e=s.employees.find(x=>x.id===s.editingEmployee);
   const form='<form data-form="employee" class="gridform">'+
    input("name","Employee name",e?.name||"","text",true)+input("jobTitle","Role",e?.jobTitle||"")+
    input("email","Email",e?.email||"","email")+input("phone","Phone",e?.phone||"")+
    '<label>Status<select name="status">'+["Active","Inactive"].map(v=>'<option value="'+v+'" '+(v===(e?.status||"Active")?"selected":"")+'>'+v+'</option>').join("")+'</select></label>'+
    '<div class="actionrow"><button class="primary" type="submit">'+(e?"Save employee":"Add employee")+'</button>'+
    (e?'<button type="button" data-action="cancel-edit">Cancel</button>':"")+'</div></form>';
   const rows=s.employees.map(e=>'<tr><td>'+safe(e.name)+'</td><td>'+safe(e.jobTitle)+'</td><td>'+safe(e.email)+'</td><td>'+statusBadge(e.status)+'</td><td><button data-employee="'+safe(e.id)+'">Edit</button></td></tr>');
   d.innerHTML=nav+panel(e?"Edit employee":"Add employee",form)+panel("Employees",table(["Name","Role","Email","Status","Action"],rows))+
     '<p class="muted">This is a staff directory. Employee login accounts and payroll are not enabled.</p>';
  }else{
   const e=s.appointments.find(x=>x.id===s.editingAppointment);
   const jobs=s.jobs.map(j=>'<option value="'+safe(j.id)+'" '+(j.id===e?.jobId?"selected":"")+'>'+safe(j.title)+'</option>').join("");
   const staff='<option value="">Unassigned</option>'+s.employees.filter(x=>x.status==="Active"||x.id===e?.employeeId).map(x=>'<option value="'+safe(x.id)+'" '+(x.id===e?.employeeId?"selected":"")+'>'+safe(x.name)+'</option>').join("");
   const form=s.jobs.length?'<form data-form="appointment" class="gridform">'+
    '<label>Job<select name="jobId" required>'+jobs+'</select></label>'+
    '<label>Employee<select name="employeeId">'+staff+'</select></label>'+
    input("appointmentDate","Date",e?.appointmentDate||new Date().toISOString().slice(0,10),"date",true)+
    '<label>Time<input name="appointmentTime" type="time" required value="'+safe(e?.appointmentTime||"09:00")+'"></label>'+
    input("location","Location",e?.location||"")+input("notes","Notes",e?.notes||"")+
    '<div class="actionrow"><button class="primary" type="submit">'+(e?"Save appointment":"Schedule appointment")+'</button>'+
    (e?'<button type="button" data-action="cancel-edit">Cancel</button>':"")+'</div></form>':
    '<p>Create a job first to schedule an appointment.</p>';
   const rows=s.appointments.map(x=>'<tr><td>'+safe(x.appointmentDate)+'</td><td>'+safe(x.appointmentTime)+'</td><td>'+safe(x.jobTitle)+'</td><td>'+safe(x.employeeName)+'</td><td>'+safe(x.location)+'</td><td><button data-appointment="'+safe(x.id)+'">Edit</button></td></tr>');
   d.innerHTML=nav+panel(e?"Edit appointment":"Schedule appointment",form)+panel("Appointments",table(["Date","Time","Job","Employee","Location","Action"],rows))+
   '<p class="muted">Appointment times are local business times; external calendar sync is not connected.</p>';
  }
 }
 if(s.page==="Finance")d.innerHTML=financeContent();
 if(s.page==="Management"){
  d.innerHTML=panel("Company account",'<p><strong>Company:</strong> '+safe(s.account?.company||"")+'</p><p><strong>Account:</strong> '+safe(s.account?.email||"")+'</p><p><strong>Role:</strong> '+safe(s.account?.role||"")+'</p>')+
  panel("Security and backups",'<p>Sign-in uses a server-side password hash and secure session cookie. Cloud records are filtered by company identity on every query.</p>'+
  '<p>This is an alpha test environment. MFA, staff invitations, audit logs, automated backup/restore tests, and offline sync remain future work.</p>'+
  '<button data-action="logout">Sign out</button>');
 }
}
function draw(){
 if(!s.account)return;
 $("mount").innerHTML='<div class="layout"><aside class="sidebar"><div class="tenant">'+safe(s.account.company)+'</div>'+
 tabs.map(t=>'<button class="nav '+(s.page===t?"active":"")+'" data-page="'+t+'">'+t+'</button>').join("")+
 '</aside><main class="content"><div class="content-heading"><div><h1>'+safe(s.page)+'</h1><p>Connected company records · secure cloud alpha</p></div>'+
 '<button data-action="refresh">Refresh data</button></div><div id="view"></div></main></div>';
 currentTab();
}
async function refresh(){
 const me=await request("/api/me");
 s.account=me.user;s.csrf=me.csrf;
 const [customers,jobs,employees,appointments,dashboard,estimates,invoices,payments,reports]=await Promise.all([request("/api/customers"),request("/api/jobs"),request("/api/employees"),request("/api/appointments"),request("/api/dashboard"),request("/api/estimates"),request("/api/invoices"),request("/api/payments"),request("/api/reports")]);
 s.customers=customers.items;s.jobs=jobs.items;s.employees=employees.items;s.appointments=appointments.items;s.dashboard=dashboard;
 s.estimates=estimates.items;s.invoices=invoices.items;s.payments=payments.items;s.financeReport=reports.totals;
 draw();
}
async function start(){
 try{
  const status=await request("/api/status");
  try{await refresh();notice("")}
  catch(e){if((e.message||"").includes("sign in"))authScreen(status.configured?"login":"setup");
  else if(e.message==="Please sign in")authScreen(status.configured?"login":"setup");
  else throw e;}
 }catch(e){$("mount").innerHTML='<div class="auth"><h1>Cloud connection unavailable</h1><p>The private CRM database or deployment is not ready.</p><button data-action="retry">Try again</button></div>';notice(e.message)}
}
document.addEventListener("click",async e=>{
 const b=e.target.closest("button");if(!b)return;
 if(b.dataset.page){s.page=b.dataset.page;s.editingCustomer=null;s.editingJob=null;s.editingEmployee=null;s.editingAppointment=null;s.editingEstimate=null;draw();notice("");return}
 if(b.dataset.finance){s.financeView=b.dataset.finance;s.editingEstimate=null;draw();notice("");return}
 if(b.dataset.operation){s.operationsView=b.dataset.operation;s.editingJob=null;s.editingEmployee=null;s.editingAppointment=null;draw();notice("");return}
 if(b.dataset.customer){s.page="Customers";s.editingCustomer=b.dataset.customer;draw();return}
 if(b.dataset.job){s.page="Operations";s.operationsView="Jobs";s.editingJob=b.dataset.job;draw();return}
 if(b.dataset.employee){s.page="Operations";s.operationsView="Employees";s.editingEmployee=b.dataset.employee;draw();return}
 if(b.dataset.estimate){s.page="Finance";s.financeView="Estimates";s.editingEstimate=b.dataset.estimate;draw();return}
 if(b.dataset.printType){printFinance(b.dataset.printType,b.dataset.printId);return}
 if(b.dataset.export){saveCSV(b.dataset.export);return}
 if(b.dataset.appointment){s.page="Operations";s.operationsView="Schedule";s.editingAppointment=b.dataset.appointment;draw();return}
 if(b.dataset.action==="cancel-edit"){s.editingCustomer=null;s.editingJob=null;s.editingEmployee=null;s.editingAppointment=null;s.editingEstimate=null;draw();return}
 if(b.dataset.action==="retry"){await start();return}
 if(b.dataset.action==="refresh"){try{await refresh();notice("Records refreshed from the cloud database.")}catch(err){notice(err.message)}return}
 if(b.dataset.action==="logout"){try{await request("/api/logout","POST",{});s.account=null;s.csrf="";authScreen("login");notice("Signed out.")}catch(err){notice(err.message)}}
});
document.addEventListener("submit",async e=>{
 const f=e.target;if(!f.dataset.form)return;
 e.preventDefault();const type=f.dataset.form,data=Object.fromEntries(new FormData(f));
 const btn=f.querySelector('button[type="submit"]');if(btn)btn.disabled=true;
 try{
  if(type==="login"||type==="setup"){await request("/api/"+type,"POST",data);await refresh();notice(type==="setup"?"Administrator created and signed in.":"Signed in successfully.");return}
  if(type==="customer"){
   const url=s.editingCustomer?"/api/customers/"+encodeURIComponent(s.editingCustomer):"/api/customers";
   await request(url,s.editingCustomer?"PATCH":"POST",data);s.editingCustomer=null;
   await refresh();notice("Customer saved to your private cloud database.");return;
  }
  if(type==="employee"){
   const url=s.editingEmployee?"/api/employees/"+encodeURIComponent(s.editingEmployee):"/api/employees";
   await request(url,s.editingEmployee?"PATCH":"POST",data);s.editingEmployee=null;
   await refresh();notice("Employee saved to your private cloud database.");return;
  }
  if(type==="appointment"){
   const url=s.editingAppointment?"/api/appointments/"+encodeURIComponent(s.editingAppointment):"/api/appointments";
   await request(url,s.editingAppointment?"PATCH":"POST",data);s.editingAppointment=null;
   await refresh();notice("Appointment saved to your private cloud database.");return;
  }
  if(type==="estimate"){
   data.amount=Number(data.amount);
   const path=s.editingEstimate?"/api/estimates/"+encodeURIComponent(s.editingEstimate):"/api/estimates";
   await request(path,s.editingEstimate?"PATCH":"POST",data);
   s.editingEstimate=null;await refresh();notice("Estimate saved to your private cloud database.");return;
  }
  if(type==="convert-estimate"){
   await request("/api/invoices/from-estimate","POST",data);
   s.financeView="Invoices";await refresh();notice("Invoice created from your accepted estimate.");return;
  }
  if(type==="invoice"){
   data.amount=Number(data.amount);
   await request("/api/invoices","POST",data);
   await refresh();notice("Invoice saved to your private cloud database.");return;
  }
  if(type==="payment"){
   data.amount=Number(data.amount);
   await request("/api/payments","POST",data);
   await refresh();notice("Manual payment recorded successfully.");return;
  }
  if(type==="job"){
   data.amount=Number(data.amount);
   const url=s.editingJob?"/api/jobs/"+encodeURIComponent(s.editingJob):"/api/jobs";
   await request(url,s.editingJob?"PATCH":"POST",data);s.editingJob=null;
   await refresh();notice("Job saved to your private cloud database.");return;
  }
 }catch(err){notice(err.message)}finally{if(btn)btn.disabled=false}
});
start();
