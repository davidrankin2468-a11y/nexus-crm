"use strict";
const $=id=>document.getElementById(id);
const safe=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=n=>Number(n||0).toLocaleString("en-US",{style:"currency",currency:"USD"});
const tabs=["Dashboard","Customers","Operations","Finance","Management"];
const statuses=["Planned","Scheduled","In Progress","On Hold","Completed","Cancelled"];
const s={account:null,csrf:"",page:"Dashboard",customers:[],jobs:[],employees:[],appointments:[],dashboard:null,editingCustomer:null,editingJob:null,editingEmployee:null,editingAppointment:null,operationsView:"Jobs",estimates:[],invoices:[],payments:[],financeReport:null,financeView:"Estimates",editingEstimate:null,financeError:"",managementView:"Backups",backupItems:[],backupPreview:null,securitySummary:null,auditEvents:[],recoveryError:"",salesLeads:[],salesTotal:0,salesNew:0,salesError:""};
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
 if(s.financeError)return nav+panel("Finance needs attention",'<p>Unable to load cloud financial records: '+safe(s.financeError)+'</p><p>Your customers and jobs are still available. Select Refresh data to try Finance again.</p>');
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
  '</title><link rel="stylesheet" href="/assets/print.css?v=2.7"></head><body>'+
  '<small>'+safe(s.account?.company||"Nexus CRM")+'</small><h1>'+head+'</h1>'+details+'</body></html>';
 const w=window.open("","_blank");
 if(!w){notice("Allow pop-ups for this site to print your document.");return}
 w.document.open();w.document.write(content);w.document.close();w.focus();w.print();
}

const managementTabs=["Backups","Security","Sales Leads"];
function describeBackupCounts(counts){
 const labels={customers:"customers",employees:"employees",jobs:"jobs",appointments:"appointments",estimates:"estimates",invoices:"invoices",payments:"payments"};
 return Object.entries(labels).map(([k,v])=>safe(counts?.[k]??0)+" "+v).join(" · ");
}
function salesLeadsContent(){
 if(s.salesError)return panel("Sales inquiries unavailable",'<p>'+safe(s.salesError)+'</p><p>Check the launch site configuration and refresh. Your CRM records are unaffected.</p>');
 const summary='<div class="cards"><div class="card">Interested businesses<strong>'+s.salesTotal+'</strong></div>'+
  '<div class="card">New inquiries<strong>'+s.salesNew+'</strong></div>'+
  '<div class="card">Contacted / closed<strong>'+Math.max(0,s.salesTotal-s.salesNew)+'</strong></div></div>';
 const statusList=["New","Contacted","Closed"];
 const rows=s.salesLeads.map(x=>'<tr>'+
  '<td><a href="mailto:'+encodeURIComponent(x.email)+'" title="Compose email to interested business">'+safe(x.email)+'</a><small class="muted" style="display:block">'+safe(x.company||"Business not supplied")+'</small></td>'+
  '<td>'+safe(x.industry)+'</td><td>'+safe(x.interestNote||"—")+'</td>'+
  '<td>'+safe(new Date(x.createdAt*1000).toLocaleDateString())+'</td>'+
  '<td><form data-form="lead-status" class="actionrow"><input name="id" type="hidden" value="'+safe(x.id)+'">'+
  '<select name="status" aria-label="Lead status">'+statusList.map(v=>'<option value="'+v+'" '+(v===x.status?"selected":"")+'>'+v+'</option>').join("")+'</select>'+
  '<button type="submit">Save</button></form><button type="button" data-delete-lead="'+safe(x.id)+'">Delete inquiry</button></td></tr>');
 return summary+panel("Early-access inquiries",
 '<p>These requests come from the separate public Nexus CRM website. Only the owner can see their details here. A submitted inquiry is not a CRM account or a sale.</p>'+
 '<p><a href="https://nexus-crm-showcase.pages.dev/" target="_blank" rel="noopener noreferrer">Open public product website ↗</a></p>'+
 '<div class="actionrow"><button type="button" data-export-leads="true">Export inquiries CSV</button></div>'+
 table(["Business / email","Industry","Requested features","Received","Status"],rows))+
 '<p class="muted">Clicking an email address opens your own email application. No automated outreach or marketing emails are sent by Nexus CRM.</p>';
}
function exportLeadsCsv(){
 const fields=["email","company","industry","interestNote","status","createdAt"];
 const cell=v=>'"'+String(v??"").replace(/"/g,'""')+'"';
 const content=[fields.join(",")].concat(s.salesLeads.map(x=>fields.map(k=>cell(x[k])).join(","))).join("\r\n");
 const url=URL.createObjectURL(new Blob([content],{type:"text/csv;charset=utf-8"}));
 const a=document.createElement("a");a.href=url;a.download="nexus-crm-early-access-inquiries.csv";
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

async function encryptedBackupDownload(data,passphrase){
 if(!globalThis.crypto?.subtle)throw Error("Your browser does not support secure encrypted file exports.");
 if(passphrase.length<12||passphrase.length>256)throw Error("Backup passphrase must be 12–256 characters.");
 const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
 const encoder=new TextEncoder();
 const source=encoder.encode(JSON.stringify(data));
 const material=await crypto.subtle.importKey("raw",encoder.encode(passphrase),"PBKDF2",false,["deriveKey"]);
 const rounds=200000;
 const key=await crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:rounds,hash:"SHA-256"},
  material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
 const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},key,source));
 // Verify that the exact payload can be decrypted before offering the download.
 const restored=new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",iv},key,encrypted));
 if(restored.length!==source.length||restored.some((byte,i)=>byte!==source[i]))throw Error("Backup validation failed");
 const b64=bytes=>{
  let binary="";
  for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(binary);
 };
 const packageData={format:"nexus-crm-encrypted-backup-v1",encryption:"AES-256-GCM",
  kdf:"PBKDF2-SHA256",iterations:rounds,salt:b64(salt),iv:b64(iv),
  data:b64(encrypted)};
 const content=new Blob([JSON.stringify(packageData,null,2)],{type:"application/json"});
 const url=URL.createObjectURL(content);
 const anchor=document.createElement("a");
 anchor.href=url;anchor.download="nexus-crm-encrypted-backup-"+localDate()+".json";
 document.body.appendChild(anchor);anchor.click();anchor.remove();
 setTimeout(()=>URL.revokeObjectURL(url),5000);
 return true;
}

function managementContent(){
 const nav='<div class="actionrow">'+managementTabs.map(tab=>
  '<button data-management="'+tab+'" class="'+(s.managementView===tab?"primary":"")+'">'+tab+'</button>').join("")+'</div>';
 if(s.account?.role!=="owner")return nav+panel("Owner controls",'<p>Backups and security operations are restricted to the company owner.</p>');
 if(s.managementView==="Sales Leads")return nav+salesLeadsContent();
 if(s.recoveryError)return nav+panel("Management temporarily unavailable",'<p>'+safe(s.recoveryError)+'</p><p>Customers and jobs remain accessible. Use Refresh data to try again.</p>');
 if(s.managementView==="Backups"){
  const entries=s.backupItems.map(x=>'<tr><td>'+safe(new Date(x.createdAt*1000).toLocaleString())+'</td>'+
   '<td>'+safe(x.note)+'</td><td>'+describeBackupCounts(x.counts)+'</td><td><button data-preview-backup="'+safe(x.id)+'">Preview</button></td></tr>');
  const preview=s.backupPreview;
  const details=preview?panel("Recovery preview — "+new Date(preview.snapshot.createdAt*1000).toLocaleString(),
   '<p><strong>Integrity:</strong> '+(preview.integrityVerified?"Verified":"Not verified")+'</p>'+
   '<p><strong>Snapshot:</strong> '+describeBackupCounts(preview.snapshot.counts)+'</p>'+
   '<p><strong>Currently stored:</strong> '+describeBackupCounts(preview.currentCounts)+'</p>'+
   '<div class="hint">Recovering this snapshot will add missing business records only. It will not overwrite existing edits, remove newer records, or restore passwords or account settings. A new safety checkpoint will be created first.</div>'+
   '<form data-form="recover"><input type="hidden" name="snapshotId" value="'+safe(preview.snapshot.id)+'">'+
   '<label>Type RECOVER MISSING RECORDS<input name="confirm" required maxlength="40" autocomplete="off" placeholder="RECOVER MISSING RECORDS"></label>'+
   '<label>Confirm with your account password<input name="password" type="password" required autocomplete="current-password"></label>'+
   '<button class="primary" type="submit">Recover missing records</button> <button type="button" data-action="hide-preview">Cancel</button></form>'):"";
  const downloadForm=preview?panel("Download an encrypted backup",'<p>Save a separate, encrypted copy to this device. Choose a new backup passphrase and keep it somewhere safe. The passphrase stays on your device and is not sent to the server.</p>'+
    '<form data-form="download-backup"><input type="hidden" name="snapshotId" value="'+safe(preview.snapshot.id)+'">'+
    '<label>Confirm with your Nexus CRM login password<input name="password" type="password" required autocomplete="current-password"></label>'+
    '<label>Choose a separate backup passphrase (12+ characters)<input name="backupPassphrase" type="password" required minlength="12" maxlength="256" autocomplete="new-password"></label>'+
    '<label>Repeat the backup passphrase<input name="confirmPassphrase" type="password" required minlength="12" maxlength="256" autocomplete="new-password"></label>'+
    '<button class="primary" type="submit">Download encrypted backup</button></form>'+
    '<p class="muted">The encrypted file contains business records only, not login credentials. Keep both the file and its separate passphrase safe. Automatic import from this file is not available yet; an assisted recovery process is still needed.</p>'):"";
  return nav+
   panel("Private recovery snapshots",'<p>Cloudflare D1 Time Travel provides automatic point-in-time recovery for this production-storage database, with up to 30 days of history. The snapshots below are a second recovery convenience, stored inside the same D1 database—not an independent off-site backup.</p>'+
    '<div class="hint">This version does not require downloading ZIP files. R2 independent backup storage is not enabled; you should continue using test records until off-site backups and restore drills are completed.</div>'+
    '<form data-form="backup"><label>Snapshot label<input name="note" maxlength="100" value="Before CRM updates"></label>'+
    '<button class="primary" type="submit">Save recovery snapshot</button></form>')+
   panel("Saved snapshots · "+s.backupItems.length,table(["Created","Label","Records included","Action"],entries))+
   details+downloadForm;
 }
 const x=s.securitySummary||{};
 const rows=s.auditEvents.map(e=>'<tr><td>'+safe(new Date(e.createdAt*1000).toLocaleString())+'</td><td>'+
  safe(e.category)+'</td><td>'+safe(e.action)+'</td></tr>');
 return nav+panel("Account security",'<p><strong>Company:</strong> '+safe(s.account?.company||"")+'</p>'+
    '<p><strong>Owner:</strong> '+safe(s.account?.email||"")+'</p>'+
    '<p><strong>Active sessions:</strong> '+safe(x.activeSessions??"—")+'</p>'+
    '<p><strong>Multifactor authentication:</strong> Not enabled yet.</p>'+
    '<p><strong>Cloud snapshots:</strong> '+safe(x.backups??"—")+'</p>'+
    '<p><strong>Independent off-site backup:</strong> Not configured.</p>'+
    '<div class="hint">Passwords, session cookies, and login tokens are excluded from recovery snapshots. Keep using fictional records until security review, MFA, and off-site backup testing are complete.</div>')+
    panel("Sign out other devices",'<p>Revoke other active Nexus CRM sign-in sessions. This device stays signed in.</p>'+
    '<form data-form="revoke-sessions"><label>Account password<input name="password" type="password" required autocomplete="current-password"></label>'+
    '<button class="primary" type="submit">Sign out other devices</button></form>')+
    panel("Recent activity",table(["When","Area","Action"],rows));
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
 if(s.page==="Management")d.innerHTML=managementContent();
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
 try{
  const [estimates,invoices,payments,reports]=await Promise.all([request("/api/estimates"),request("/api/invoices"),request("/api/payments"),request("/api/reports")]);
  s.estimates=estimates.items;s.invoices=invoices.items;s.payments=payments.items;s.financeReport=reports.totals;s.financeError="";
 }catch(e){
  s.estimates=[];s.invoices=[];s.payments=[];s.financeReport=null;
  s.financeError=e?.message||"Unable to load Finance";
 }
 if(s.account?.role==="owner"){
  try{
   const [b,security,activity]=await Promise.all([request("/api/backups"),request("/api/security/summary"),request("/api/security/activity")]);
   s.backupItems=b.items;s.securitySummary=security;s.auditEvents=activity.items;s.recoveryError="";
  }catch(e){s.recoveryError=e?.message||"Unable to load recovery controls";}
  try{
   const lead=await request("/api/sales/leads");
   s.salesLeads=lead.items;s.salesTotal=lead.total;s.salesNew=lead.newCount;s.salesError="";
  }catch(e){s.salesError=e?.message||"Unable to load inquiries";}
 }
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
 if(b.dataset.management){s.managementView=b.dataset.management;s.backupPreview=null;draw();notice("");return}
 if(b.dataset.exportLeads){exportLeadsCsv();return}
 if(b.dataset.deleteLead){
  if(!confirm("Permanently delete this early-access inquiry? This cannot be undone."))return;
  try{await request("/api/sales/leads/"+encodeURIComponent(b.dataset.deleteLead)+"/delete","POST",{confirm:"DELETE INQUIRY"});await refresh();notice("Inquiry deleted.");}
  catch(e){notice(e.message)}return;
 }
 if(b.dataset.previewBackup){
  try{s.backupPreview=await request("/api/backups/"+encodeURIComponent(b.dataset.previewBackup)+"/preview");draw();notice("Snapshot checked for integrity.");}
  catch(err){notice(err.message)}return;
 }
 if(b.dataset.action==="hide-preview"){s.backupPreview=null;draw();return}
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
  if(type==="lead-status"){
   await request("/api/sales/leads/"+encodeURIComponent(data.id),"PATCH",{status:data.status});
   await refresh();notice("Inquiry status saved.");return;
  }
  if(type==="download-backup"){
   if(data.backupPassphrase!==data.confirmPassphrase)throw Error("The backup passphrases do not match.");
   if(String(data.backupPassphrase).length<12)throw Error("Use a backup passphrase of at least 12 characters.");
   const record=await request("/api/backups/"+encodeURIComponent(data.snapshotId)+"/export","POST",{password:data.password});
   if(record.format!=="nexus-crm-business-export-v1")throw Error("Unexpected backup export format");
   await encryptedBackupDownload(record,data.backupPassphrase);
   f.reset();notice("Encrypted backup downloaded. Keep the file and separate backup passphrase safe.");return;
  }
  if(type==="backup"){
   await request("/api/backups","POST",data);s.backupPreview=null;
   await refresh();notice("Recovery snapshot saved privately in the CRM database.");return;
  }
  if(type==="recover"){
   if(data.confirm!=="RECOVER MISSING RECORDS")throw new Error("Type the exact confirmation phrase.");
   const result=await request("/api/backups/"+encodeURIComponent(data.snapshotId)+"/recover","POST",{password:data.password,confirm:data.confirm});
   s.backupPreview=null;await refresh();
   notice("Recovery complete: "+result.restored+" missing records restored; "+result.skipped+" existing records kept. Checkpoint created.");return;
  }
  if(type==="revoke-sessions"){
   const result=await request("/api/security/logout-others","POST",data);
   await refresh();notice(result.otherSessionsRevoked+" other sessions signed out.");return;
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
