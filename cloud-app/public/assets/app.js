"use strict";
const $=id=>document.getElementById(id);
const safe=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=n=>Number(n||0).toLocaleString("en-US",{style:"currency",currency:"USD"});
const tabs=["Dashboard","Customers","Operations","Finance","Management"];
const statuses=["Planned","Scheduled","In Progress","On Hold","Completed","Cancelled"];
const s={account:null,csrf:"",page:"Dashboard",customers:[],jobs:[],employees:[],appointments:[],dashboard:null,editingCustomer:null,editingJob:null,editingEmployee:null,editingAppointment:null,operationsView:"Jobs"};
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
 if(s.page==="Finance"){
  d.innerHTML=panel("Finance — next cloud migration",'<p>The previous public demo has estimates, invoices, payments, reports, and printable previews. These features are not yet connected to this private database.</p>'+
   '<div class="hint">This secure alpha saves customers, jobs, employees and appointments to the cloud; Finance is still in development. Do not use the public demo to store real invoices or payment information.</div>');
 }
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
 const [customers,jobs,employees,appointments,dashboard]=await Promise.all([request("/api/customers"),request("/api/jobs"),request("/api/employees"),request("/api/appointments"),request("/api/dashboard")]);
 s.customers=customers.items;s.jobs=jobs.items;s.employees=employees.items;s.appointments=appointments.items;s.dashboard=dashboard;
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
 if(b.dataset.page){s.page=b.dataset.page;s.editingCustomer=null;s.editingJob=null;s.editingEmployee=null;s.editingAppointment=null;draw();notice("");return}
 if(b.dataset.operation){s.operationsView=b.dataset.operation;s.editingJob=null;s.editingEmployee=null;s.editingAppointment=null;draw();notice("");return}
 if(b.dataset.customer){s.page="Customers";s.editingCustomer=b.dataset.customer;draw();return}
 if(b.dataset.job){s.page="Operations";s.operationsView="Jobs";s.editingJob=b.dataset.job;draw();return}
 if(b.dataset.employee){s.page="Operations";s.operationsView="Employees";s.editingEmployee=b.dataset.employee;draw();return}
 if(b.dataset.appointment){s.page="Operations";s.operationsView="Schedule";s.editingAppointment=b.dataset.appointment;draw();return}
 if(b.dataset.action==="cancel-edit"){s.editingCustomer=null;s.editingJob=null;s.editingEmployee=null;s.editingAppointment=null;draw();return}
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
  if(type==="job"){
   data.amount=Number(data.amount);
   const url=s.editingJob?"/api/jobs/"+encodeURIComponent(s.editingJob):"/api/jobs";
   await request(url,s.editingJob?"PATCH":"POST",data);s.editingJob=null;
   await refresh();notice("Job saved to your private cloud database.");return;
  }
 }catch(err){notice(err.message)}finally{if(btn)btn.disabled=false}
});
start();
