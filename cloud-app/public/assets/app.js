"use strict";
const $=id=>document.getElementById(id);
const safe=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=n=>Number(n||0).toLocaleString("en-US",{style:"currency",currency:"USD"});
const tabs=["Dashboard","Customers","Operations","Finance","Management"];
const statuses=["Planned","Scheduled","In Progress","On Hold","Completed","Cancelled"];
const s={account:null,csrf:"",page:"Dashboard",customers:[],jobs:[],employees:[],appointments:[],dashboard:null,editingCustomer:null,editingJob:null,editingEmployee:null,editingAppointment:null,operationsView:"Jobs",estimates:[],invoices:[],payments:[],financeReport:null,financeView:"Estimates",posProducts:[],posSales:[],posCart:{},posCustomerId:"",posView:"Checkout",posError:"",posBusy:false,licenseInfo:null,licenseError:"",editingEstimate:null,financeError:"",managementView:"Backups",backupItems:[],backupPreview:null,securitySummary:null,auditEvents:[],recoveryError:"",salesLeads:[],salesTotal:0,salesNew:0,salesError:"",companyInvites:[],companies:[],onboardingError:"",emailLab:null,emailLabError:"",newInvite:null,pendingInviteToken:"",pendingStaffToken:"",staffUsers:[],staffInvites:[],staffPilotAvailable:false,staffError:"",newStaffInvite:null,newRecoveryCodes:null,mfaStatus:null,newMfaSecret:null,mfaChallenge:null};
// The invitation token travels only in the URL fragment (not HTTP request/log).
// Remove it from the address bar immediately and keep it only in memory until used.
try{
 const fragment=new URLSearchParams(location.hash.slice(1)).get("invite")||"";
 if(/^[a-f0-9]{64}$/i.test(fragment)){
  s.pendingInviteToken=fragment.toLowerCase();
  history.replaceState(null,"",location.pathname+location.search);
 }else{
  const staff=new URLSearchParams(location.hash.slice(1)).get("staff")||"";
  if(/^[a-f0-9]{64}$/i.test(staff)){
   s.pendingStaffToken=staff.toLowerCase();
   history.replaceState(null,"",location.pathname+location.search);
  }
 }
}catch(e){/* Standard login remains available if URL hash is unsupported. */}
async function request(path,method="GET",data=null){
 const headers={"Accept":"application/json"};
 if(data!==null)headers["Content-Type"]="application/json";
 if(method!=="GET"&&s.csrf)headers["X-Nexus-CSRF"]=s.csrf;
 let res;
 try{
  res=await fetch(path,{method,credentials:"same-origin",cache:"no-store",headers,body:data===null?undefined:JSON.stringify(data)});
 }catch(e){
  throw new Error("Cloud connection failed. Check your internet connection and try again.");
 }
 let json;try{json=await res.json()}catch{throw new Error("The server returned an unexpected response")}
 if(!res.ok)throw new Error(json?.error||"Request failed");
 return json;
}
function notice(text){
 const el=$("message");if(!text){el.hidden=true;el.textContent="";return}
 el.textContent=text;el.hidden=false;
}
function authScreen(mode){
 s.account=null;s.csrf="";s.newMfaSecret=null;s.mfaChallenge=null;
 const setup=mode==="setup";
 $("mount").innerHTML='<div class="auth"><h1>'+ (setup?"Set up Nexus CRM":"Sign in to Nexus CRM") +'</h1>'+
 '<p>'+(setup?"Create your first private company administrator account.":"Sign in to your private cloud CRM.")+'</p>'+
 '<form data-form="'+(setup?"setup":"login")+'">'+
 (setup?'<label>One-time setup code<input name="setupCode" required minlength="30" autocomplete="off" placeholder="Paste your setup code"></label>'+
 '<label>Company name<input name="companyName" required maxlength="150" placeholder="Your company"></label>':"")+
 '<label>Email address<input name="email" type="email" required autocomplete="username"></label>'+
 '<label>Password<input name="password" type="password" required '+(setup?'minlength="12" autocomplete="new-password"':'autocomplete="current-password"')+'></label>'+
 '<div class="hint">'+(setup?"The setup code is valid for one registration. Choose a strong unique password and keep it private.":"Your session is protected by a secure HTTP-only cookie. Never share your password.")+'</div>'+
 '<button class="primary" type="submit">'+(setup?"Create administrator account":"Sign in")+'</button></form>'+
 (!setup?'<p><button type="button" data-action="recover-screen">Use a saved recovery code</button></p>':"")+
 '<p class="muted" style="font-size:12px">Security alpha: company invitations are available for controlled testing. MFA, verified email delivery and complete production backups are not ready. Use fictional records only.</p></div>';
}

async function invitationScreen(){
 if(!s.pendingInviteToken){authScreen("login");return}
 s.account=null;s.csrf="";
 try{
  // Do not replace an existing owner's session by activating another company
  // in the same browser. Ask the invitee to use a private window.
  const existingSession=await request("/api/me").catch(()=>null);
  if(existingSession?.user){
   $("mount").innerHTML='<div class="auth"><h1>Use a separate browser session</h1>'+
    '<p>You are already signed in as <strong>'+safe(existingSession.user.email)+
    '</strong> at <strong>'+safe(existingSession.user.company)+'</strong>.</p>'+
    '<div class="hint">Opening a new company invitation here could switch the current account. Open the invitation link in a private/incognito window or another device to keep these companies separate.</div>'+
    '<button type="button" data-action="cancel-invite">Return to your existing account</button></div>';
   return;
  }
  const invite=await request("/api/invitations/preview","POST",{token:s.pendingInviteToken});
  $("mount").innerHTML='<div class="auth"><h1>Join your company on Nexus CRM</h1>'+
   '<p>This is a one-time invitation for a separate company workspace. Your login will only access that company.</p>'+
   '<div class="hint"><strong>Company:</strong> '+safe(invite.companyName)+
   '<p><strong>Owner email:</strong> '+safe(invite.email)+'</p>'+
   '<p><strong>Invitation expires:</strong> '+safe(new Date(invite.expiresAt*1000).toLocaleString())+'</p></div>'+
   '<form data-form="accept-invite">'+
   '<label>Create a password (14–128 characters)<input type="password" name="password" minlength="14" maxlength="128" autocomplete="new-password" required></label>'+
   '<label>Confirm password<input type="password" name="confirmPassword" minlength="14" maxlength="128" autocomplete="new-password" required></label>'+
   '<div class="actionrow"><button class="primary" type="submit">Activate invited test company</button>'+
   '<button type="button" data-action="cancel-invite">Back to sign in</button></div></form>'+
   '<p class="muted">Invitation-only pilot. Email delivery, email verification and MFA are not yet enabled. Use fictional records until the production security review is complete.</p></div>';
 }catch(e){
  s.pendingInviteToken="";
  authScreen("login");
  notice("This company invitation is invalid, expired or already used. Ask the Nexus owner for a new link.");
 }
}
function authenticatorScreen(){
 if(!s.mfaChallenge){authScreen("login");return}
 $("mount").innerHTML='<div class="auth"><h1>Authenticator verification</h1>'+
  '<p>Enter the current six-digit code from your authenticator app to finish signing in.</p>'+
  '<form data-form="login-mfa"><label>Six-digit code<input type="text" inputmode="numeric" pattern="[0-9]{6}" name="code" maxlength="6" minlength="6" autocomplete="one-time-code" required></label>'+
  '<button type="submit" class="primary">Verify and sign in</button> '+
  '<button type="button" data-action="cancel-mfa-login">Back to sign in</button></form>'+
  '<p class="muted">Codes rotate every 30 seconds. If you lost your authenticator, use a saved recovery code from the sign-in page.</p></div>';
}
function recoveryScreen(){
 s.account=null;s.csrf="";
 $("mount").innerHTML='<div class="auth"><h1>Recover your Nexus CRM account</h1>'+
  '<p>Use a saved, one-time recovery code from your account settings. Codes must be generated before you lose access. We do not send codes by email.</p>'+
  '<form data-form="recover">'+
  '<label>Account email<input type="email" name="email" required autocomplete="username"></label>'+
  '<label>Saved recovery code<input type="text" name="code" required minlength="32" maxlength="32" autocapitalize="off" autocomplete="off" spellcheck="false"></label>'+
  '<label>New password (14 characters minimum)<input type="password" name="newPassword" minlength="14" maxlength="128" required autocomplete="new-password"></label>'+
  '<label>Repeat new password<input type="password" name="confirmPassword" minlength="14" maxlength="128" required autocomplete="new-password"></label>'+
  '<button class="primary" type="submit">Reset my password</button>'+
  '<button type="button" data-action="return-login">Back to sign in</button></form>'+
  '<p class="muted">If you have no saved recovery code, contact the Nexus operator. An automated identity-verification process has not been enabled.</p></div>';
}
async function staffInvitationScreen(){
 if(!s.pendingStaffToken){authScreen("login");return}
 s.account=null;s.csrf="";
 try{
  const me=await request("/api/me").catch(()=>null);
  if(me?.user){
   $("mount").innerHTML='<div class="auth"><h1>Open a private window</h1>'+
    '<p>You are already signed in to <strong>'+safe(me.user.company)+'</strong> as '+safe(me.user.email)+'.</p>'+
    '<div class="hint">To preserve your current session, open this staff invitation in a private/incognito browser window or another device.</div>'+
    '<button type="button" data-action="cancel-invite">Return to your current account</button></div>';
   return;
  }
  const i=await request("/api/staff/invitations/preview","POST",{token:s.pendingStaffToken});
  $("mount").innerHTML='<div class="auth"><h1>Accept staff access</h1>'+
   '<p>Join an existing company workspace in a <strong>'+safe(i.role)+'</strong> role.</p>'+
   '<div class="hint"><strong>Company:</strong> '+safe(i.companyName)+
   '<p><strong>Invited email:</strong> '+safe(i.email)+'</p>'+
   '<p><strong>Role:</strong> '+safe(i.role)+'</p>'+
   '<p><strong>Expires:</strong> '+safe(new Date(i.expiresAt*1000).toLocaleString())+'</p></div>'+
   '<form data-form="accept-staff">'+
   '<label>Create a password (14–128 characters)<input name="password" type="password" minlength="14" maxlength="128" autocomplete="new-password" required></label>'+
   '<label>Confirm password<input name="confirmPassword" type="password" minlength="14" maxlength="128" autocomplete="new-password" required></label>'+
   '<button type="submit" class="primary">Activate staff test account</button>'+
   '<button type="button" data-action="cancel-invite">Cancel</button></form>'+
   '<p class="muted">Pilot only. Email verification, MFA and secure recovery are not ready. Use fictional company records.</p></div>';
 }catch(e){
  s.pendingStaffToken="";authScreen("login");
  notice("That staff invitation is invalid, expired, or already used.");
 }
}
function statusBadge(v){return '<span class="tag">'+safe(v)+'</span>'}
function table(headers,rows){
 return '<p class="table-scroll-hint">Swipe left or right to see all columns</p>'+
 '<div class="tablewrap" role="region" tabindex="0" aria-label="Scrollable data table"><table><thead><tr>'+headers.map(h=>'<th scope="col">'+safe(h)+'</th>').join("")+'</tr></thead><tbody>'+
 (rows.length?rows.join(""):'<tr><td colspan="'+headers.length+'" class="muted">No records yet.</td></tr>')+
 '</tbody></table></div>';
}
function panel(title,contents){return '<section class="panel"><h2>'+safe(title)+'</h2>'+contents+'</section>'}
function disclosurePanel(title,contents,open=false){
 return '<details class="panel editor-panel disclosure-panel"'+(open?' open':'')+'>'+
 '<summary><span>'+safe(title)+'</span><span class="editor-caret" aria-hidden="true"></span></summary>'+
 '<div class="editor-body">'+contents+'</div></details>';
}
function editorPanel(title,contents,open=false){
 if(s.account?.role==="employee")return "";
 return '<details class="panel editor-panel"'+(open?' open':'')+'>'+
 '<summary><span>'+safe(title)+'</span><span class="editor-caret" aria-hidden="true"></span></summary>'+
 '<div class="editor-body">'+contents+'</div></details>';
}
function sectionNav(items,active,key,label){
 return '<nav class="section-tabs" aria-label="'+safe(label)+'">'+items.map(t=>
  '<button type="button" data-'+key+'="'+safe(t)+'" aria-pressed="'+(t===active?"true":"false")+
  '" class="section-tab '+(t===active?"primary active":"")+'">'+safe(t)+'</button>').join("")+'</nav>';
}
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


/* Keep a pending sale's idempotency key until the server confirms the result.
   The account/company scope prevents a different company from retrying it. */
function posPendingStorageKey(){
 return "nexus-pos-pending:"+String(s.account?.email||"").toLowerCase()+":"+String(s.account?.company||"").toLowerCase();
}
function posPendingRead(){
 if(!s.account)return null;
 try{
  const value=JSON.parse(sessionStorage.getItem(posPendingStorageKey())||"null");
  if(!value||typeof value.idempotency_key!=="string"||!/^[-A-Za-z0-9_]{8,100}$/.test(value.idempotency_key)||!Array.isArray(value.items)||value.items.length<1||value.items.length>50)return null;
  if(value.items.some(x=>!x||typeof x.product_id!=="string"||!Number.isSafeInteger(x.quantity)||x.quantity<1))return null;
  if(value.customer_id!==undefined&&value.customer_id!==null&&typeof value.customer_id!=="string")return null;
  return value;
 }catch{return null}
}
function posPendingStart(items){
 const existing=posPendingRead();
 if(existing)return existing;
 const attempt={idempotency_key:crypto.randomUUID().replace(/-/g,""),items,tax_cents:0,customer_id:s.posCustomerId||null};
 try{sessionStorage.setItem(posPendingStorageKey(),JSON.stringify(attempt))}
 catch{throw Error("Safe checkout storage is unavailable. No sale was sent. Enable session storage and retry.")}
 return attempt;
}
function posPendingFinish(){
 try{sessionStorage.removeItem(posPendingStorageKey())}
 catch{/* The server has already confirmed; no new attempt occurs here. */}
}
async function posCommit(){
 if(s.posBusy)return;
 let attempt=posPendingRead();
 if(!attempt){
  const items=Object.entries(s.posCart).filter(([,quantity])=>quantity>0).map(([product_id,quantity])=>({product_id,quantity}));
  if(!items.length)return;
  try{attempt=posPendingStart(items)}catch(e){notice(e.message);return}
 }
 s.posBusy=true;draw();
 try{
  const receipt=await request("/api/pos/sales","POST",attempt);
  if(!receipt?.id)throw Error("Sale response did not contain a receipt reference");
  posPendingFinish();s.posCart={};s.posCustomerId="";await loadPos();
  const existingTerminalSale=receipt.duplicate&&String(receipt.status||"pending")!=="pending";
  notice((existingTerminalSale?"Existing sale "+receipt.id+" is already "+receipt.status+". This retry created no new sale or charge.":"Sale "+receipt.id+" recorded as pending/unpaid. No card was charged.")+(s.posError?" Records could not refresh; select Refresh to retry.":""));
 }catch(err){
  notice("Sale outcome not yet confirmed: "+err.message+". Retry the same pending sale to avoid a duplicate.");
 }finally{s.posBusy=false;draw()}
}

async function loadPos(){
 try{
  const [p,sales]=await Promise.all([request("/api/pos/products"),request("/api/pos/sales")]);
  s.posProducts=p.items;s.posSales=sales.items;s.posError="";
 }catch(e){s.posError=e.message||"POS unavailable";}
 try{
  const result=await request("/api/pos/square/sandbox-attempts");
  s.squareAttempts=result.items||[];s.squareAttemptsError="";
 }catch(e){s.squareAttempts=[];s.squareAttemptsError=e.message||"Sandbox attempt list unavailable";}
 draw();
}
function posContent(){
 const nav=sectionNav(["Checkout","Inventory","Customers","Reports"],s.posView,"posview","POS sections");
 const pending=posPendingRead();
 const pendingAlert=pending?panel("Checkout awaiting confirmation",'<p>A previous attempt may already be recorded. Retry with the same checkout reference; do not create a second sale.</p><button data-action="pos-retry" type="button" '+(s.posBusy?"disabled":"")+'>Retry pending sale safely</button>'):"";
 const squareCard=panel("Square Sandbox connection",'<p>Check Square Sandbox securely from this signed-in CRM dashboard. No cards are charged.</p><button type="button" data-action="square-check">Check Square Sandbox</button>'+(s.squareResult?'<p role="status">'+safe(s.squareResult)+'</p>':""));
 const warn=panel("Nexus POS · Test transactions",'<p>Company-scoped records. Sales remain pending/unpaid until payment is separately verified. No credit card is charged and no tax calculation is performed.</p>')+pendingAlert+squareCard;
 if(s.posError)return nav+warn+panel("Connection error",safe(s.posError)+' <button data-action="pos-refresh">Retry</button>');
 if(s.posView==="Customers")return nav+warn+panel("CRM customers",table(["Name","Email"],s.customers.map(x=>'<tr><td>'+safe(x.name)+'</td><td>'+safe(x.email)+'</td></tr>')));
 if(s.posView==="Reports"){
  const pendingTotal=s.posSales.reduce((a,x)=>a+((x.status==="pending"||x.status==="recorded")?Number(x.total_cents):0),0);
  const rows=s.posSales.map(x=>'<tr><td>'+safe(x.id)+'</td><td>'+safe(x.customer_name||"Walk-in")+'</td><td>'+safe(x.status)+'</td><td>'+money(x.total_cents/100)+'</td><td>'+
   (x.status==="pending"?(Number(x.total_cents)>0?'<button type="button" data-square-prepare="'+safe(x.id)+'">Prepare Sandbox</button> ':"")+'<button type="button" data-pos-void="'+safe(x.id)+'">Void unpaid</button>':"—")+'</td></tr>');
  const records=panel("Recorded POS activity",'<h3>Unpaid / unverified recorded total: '+money(pendingTotal/100)+'</h3><p>This report does not confirm card settlement or tax compliance.</p>'+table(["Receipt","CRM customer","Status","Amount","Action"],rows));
  const exportPanel=s.account?.role==="owner"?panel("Encrypted POS backup",'<p>Download company-scoped inventory, sales, sale lines, stock movements, refunds, and event records encrypted with a backup passphrase on this device. No password or card data is exported. Independent restoration is not implemented yet.</p>'+
    '<form data-form="pos-download" class="gridform"><label>Backup passphrase<input required type="password" name="backupPassphrase" minlength="12" maxlength="256" autocomplete="new-password"></label>'+
    '<label>Repeat backup passphrase<input required type="password" name="confirmPassphrase" minlength="12" maxlength="256" autocomplete="new-password"></label>'+
    '<div class="actionrow"><button type="submit" class="primary">Download encrypted POS records</button></div></form>'):"";
  const sqAttempts=s.squareAttempts||[];
  const sqRows=sqAttempts.map(a=>'<tr><td>'+safe(a.id)+'</td><td>'+safe(a.sale_id)+'</td><td>'+safe(a.status)+'</td><td>'+money(a.amount_cents/100)+'</td><td>'+
    (a.status==="prepared"?'<button type="button" data-square-submit="'+safe(a.id)+'">Run fake payment</button>':"—")+'</td></tr>');
  const sqOptions=sqAttempts.filter(a=>["prepared","completed_unreconciled","unknown","reconciled"].includes(a.status))
    .map(a=>'<option value="'+safe(a.id)+'">'+safe(a.sale_id)+' ('+safe(a.status)+')</option>').join("");
  const sqPanel=panel("Square Sandbox payment testing",
    '<p>Use Prepare Sandbox on an unpaid sale above. Then Run fake payment uses only Square’s published test token, never a real card. The server independently verifies the resulting payment before it marks that same company’s sale complete.</p>'+
    (s.squareAttemptsError?'<p>'+safe(s.squareAttemptsError)+'</p>':"")+
    (sqRows.length?table(["Attempt ID","Sale ID","Status","Amount","Action"],sqRows):'<p>No Sandbox payment attempts for this company yet.</p>')+
    '<h3>Verify an existing Sandbox payment</h3><p>For recovery only: enter the payment ID from a completed Square Sandbox transaction. This does not create a payment.</p>'+
    '<form data-form="square-reconcile" class="gridform"><label>Attempt<select name="attempt_id" required>'+sqOptions+'</select></label>'+
    '<label>Square Sandbox payment ID<input name="payment_id" required minlength="8" maxlength="200" pattern="[A-Za-z0-9_-]+"></label>'+
    '<button type="submit" class="primary" '+(sqOptions?"":'disabled')+'>Verify and reconcile</button></form>');
  return nav+warn+records+sqPanel+exportPanel;
 }
 if(s.posView==="Inventory")return nav+warn+editorPanel("Add product",'<form data-form="pos-product" class="gridform"><label>SKU<input required name="sku" pattern="[-A-Za-z0-9_]+" maxlength="60"></label><label>Product name<input required name="name" maxlength="200"></label><label>Price ($)<input required name="price" type="number" min="0" step=".01" max="1000000"></label><label>Starting stock<input required name="stock_quantity" type="number" min="0" step="1" max="1000000"></label><button class="primary" type="submit">Save product</button></form>')+panel("Inventory",table(["SKU","Name","Price","Stock"],s.posProducts.map(p=>'<tr><td>'+safe(p.sku)+'</td><td>'+safe(p.name)+'</td><td>'+money(p.price_cents/100)+'</td><td>'+safe(p.stock_quantity)+'</td></tr>')));
 const rows=Object.entries(s.posCart).map(([id,q])=>({p:s.posProducts.find(x=>x.id===id),q})).filter(x=>x.p&&x.q>0);
 const total=rows.reduce((a,x)=>a+x.p.price_cents*x.q,0);
 return nav+warn+panel("Products",table(["Item","Price","Stock","Add"],s.posProducts.filter(x=>x.active).map(p=>'<tr><td>'+safe(p.name)+'</td><td>'+money(p.price_cents/100)+'</td><td>'+safe(p.stock_quantity)+'</td><td><button data-pos-add="'+safe(p.id)+'" '+(pending||s.posBusy||p.stock_quantity<=(s.posCart[p.id]||0)?"disabled":"")+'>Add</button></td></tr>')))+
 panel("Checkout cart",'<label>CRM customer (optional)<select data-pos-customer="1" '+(pending||s.posBusy?"disabled":"")+'>'
  +'<option value="">Walk-in / no customer</option>'
  +s.customers.map(c=>'<option value="'+safe(c.id)+'" '+(c.id===s.posCustomerId?"selected":"")+'>'+safe(c.name)+'</option>').join("")
  +'</select></label>'+table(["Item","Qty","Subtotal","Remove"],rows.map(x=>'<tr><td>'+safe(x.p.name)+'</td><td>'+safe(x.q)+'</td><td>'+money(x.p.price_cents*x.q/100)+'</td><td><button data-pos-remove="'+safe(x.p.id)+'">−1</button></td></tr>'))+
 '<h3>Total before tax: '+money(total/100)+'</h3><div class="actionrow"><button data-action="pos-record" class="primary" '+(!total||s.posBusy||pending?"disabled":"")+'>Record sale (unpaid)</button><button data-action="pos-clear" '+(pending||s.posBusy?"disabled":"")+'>Clear cart</button></div>');
}
const financeViews=["Estimates","Invoices","Payments","Reports","POS"];
const estimateStatusOptions=selected=>["Draft","Sent","Accepted","Declined"].map(v=>'<option value="'+v+'" '+(v===selected?"selected":"")+'>'+v+'</option>').join("");
const financeNavigation=()=>sectionNav(financeViews,s.financeView,"finance","Finance sections");
function financeContent(){
 const nav=financeNavigation(),view=s.financeView;
 if(view==="POS")return nav+posContent();
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
  return nav+(s.customers.length?editorPanel(e?"Edit estimate":"New estimate",create,!!e):panel("Getting started",'<p>Add a customer before creating an estimate.</p>'))+
   (eligible.length?editorPanel("Invoice accepted estimate",convert):"")+
   panel("Estimates · "+s.estimates.length,table(["Estimate","Customer","Work","Amount","Status","Actions"],rows));
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
  return nav+(s.customers.length?editorPanel("Create invoice",create):panel("Getting started",'<p>Add a customer before creating an invoice.</p>'))+
   panel("Invoices · "+s.invoices.length,table(["Invoice","Customer","Amount","Paid","Balance","Due date","Status","Action"],rows)+
   '<p class="panel-note">These records do not calculate taxes or send invoice emails.</p>');
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
  return nav+(due.length?editorPanel("Record payment",form):"")+
   panel("Payments · "+s.payments.length,table(["Date","Invoice","Customer","Amount","Method","Note"],rows)+
   '<p class="panel-note">Payments are recorded only; no card charge or bank transfer is made.</p>');
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
  panel("Export records",'<div class="actionrow">'+["estimates","invoices","payments"].map(t=>'<button data-export="'+t+'">'+
   t.charAt(0).toUpperCase()+t.slice(1)+' CSV</button>').join("")+'</div>')+
  '<p class="panel-note">Based on recorded entries. Bank reconciliation and tax reports are not included.</p>';
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

const managementTabs=["Backups","Security","Licensing","Sales Leads","Companies","Team Access"];
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
 return summary+panel("Business inquiries",
 '<p class="panel-note">Review requests and update follow-up status. These are inquiries, not customer accounts.</p>'+

 '<div class="actionrow"><button type="button" data-export-leads="true">Export inquiries CSV</button></div>'+
 table(["Business / email","Industry","Requested features","Received","Status"],rows))+
 '<p class="panel-note">Email links open your mail app; messages are not sent automatically.</p>';
}
function exportLeadsCsv(){
 const fields=["email","company","industry","interestNote","status","createdAt"];
 const cell=v=>'"'+String(v??"").replace(/"/g,'""')+'"';
 const content=[fields.join(",")].concat(s.salesLeads.map(x=>fields.map(k=>cell(x[k])).join(","))).join("\r\n");
 const url=URL.createObjectURL(new Blob([content],{type:"text/csv;charset=utf-8"}));
 const a=document.createElement("a");a.href=url;a.download="nexus-crm-early-access-inquiries.csv";
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

async function encryptedBackupDownload(data,passphrase,kind="crm"){
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
 anchor.href=url;anchor.download="nexus-"+(kind==="pos"?"pos":"crm")+"-encrypted-backup-"+localDate()+".json";
 document.body.appendChild(anchor);anchor.click();anchor.remove();
 setTimeout(()=>URL.revokeObjectURL(url),5000);
 return true;
}

async function verifyLocalEncryptedBackup(file,passphrase){
 if(!file||typeof file.text!=="function")throw Error("Choose an encrypted backup file.");
 if(file.size<100||file.size>6000000)throw Error("Backup file must be between 100 bytes and 6 MB.");
 const content=JSON.parse(await file.text());
 if(content.format!=="nexus-crm-encrypted-backup-v1"||
  content.encryption!=="AES-256-GCM"||content.kdf!=="PBKDF2-SHA256"||
  !Number.isInteger(content.iterations)||content.iterations<100000||content.iterations>400000)
  throw Error("This file is not a recognized Nexus CRM encrypted backup.");
 const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
 const salt=bytes(content.salt),iv=bytes(content.iv),data=bytes(content.data);
 if(salt.length!==16||iv.length!==12||data.length>2200000)throw Error("Encrypted backup is invalid or too large.");
 const encoder=new TextEncoder();
 const material=await crypto.subtle.importKey("raw",encoder.encode(passphrase),"PBKDF2",false,["deriveKey"]);
 const key=await crypto.subtle.deriveKey({name:"PBKDF2",salt,hash:"SHA-256",iterations:content.iterations},
  material,{name:"AES-GCM",length:256},false,["decrypt"]);
 let decoded;
 try{decoded=await crypto.subtle.decrypt({name:"AES-GCM",iv},key,data)}
 catch{throw Error("Cannot decrypt this backup. Check your passphrase or file integrity.")}
 const parsed=JSON.parse(new TextDecoder().decode(decoded));
 if(!["nexus-crm-business-export-v1","nexus-pos-company-export-v1"].includes(parsed?.format)||parsed.schemaVersion!==1||!parsed.records||typeof parsed.records!=="object")
  throw Error("Decrypted file is not a supported Nexus CRM business export.");
 const keys=parsed.format==="nexus-pos-company-export-v1"?["pos_products","pos_sales","pos_sale_items","pos_inventory_movements","pos_refunds","pos_payment_events"]:["customers","employees","jobs","estimates","invoices","appointments","payments"];
 for(const k of keys){if(!Array.isArray(parsed.records[k]))throw Error("Backup is missing "+k+" records.")}
 return {createdAt:parsed.createdAt,company:parsed.company,counts:Object.fromEntries(keys.map(k=>[k,parsed.records[k].length]))};
}

function companyEmailLabContent(){
 if(!s.account?.isPlatformOperator)return "";
 if(s.emailLabError)return panel("Business email lab · preview only",'<p>'+safe(s.emailLabError)+'</p>');
 if(!s.emailLab)return panel("Business email lab · preview only","<p>Checking the private email preview…</p>");
 const sample=s.emailLab.sample||{};
 const testAction=s.emailLab.selfTestAvailable
  ?'<form data-form="email-self-test"><p><strong>Send a connection test to your signed-in account:</strong> '+safe(s.account.email||"")+'</p>'+
   '<label>Confirm your Nexus CRM password<input type="password" name="password" required autocomplete="current-password"></label>'+
   '<button class="primary" type="submit">Send one test to my email</button>'+
   '<p class="muted">Restricted to the account owner. One attempt every 30 minutes. This never invites a customer.</p></form>'
  :'<p class="muted">Self-test is not enabled yet. No customer emails can be sent.</p>';
 const pilotAction=s.emailLab.pilotInviteAvailable
  ?'<form data-form="email-invite-pilot">'+
   '<p><strong>Fictional company email invitation:</strong> creates a unique +nexus-test address that arrives in your Gmail inbox.</p>'+
   '<label>Confirm your Nexus CRM password<input type="password" name="password" required autocomplete="current-password"></label>'+
   '<button class="primary" type="submit">Email a pilot company invitation to my Gmail</button>'+
   '<p class="muted">Private acceptance test only. No real customer account or payment is initiated. One outbound pilot test per 30 minutes.</p></form>'
  :'<p class="muted">Pilot invitation sending is disabled. Regular customer emails remain disabled.</p>';
 return panel("Business email lab · sender connection",
  '<p class="panel-note">NexusSoftwareUSA.com sender verification and actual email delivery are separate checks. The sample preview never sends a message or creates an invitation.</p>'+
  '<p><strong>CRM sender:</strong> '+safe(s.emailLab.status||"Not connected")+'</p>'+
  '<p><strong>Example subject:</strong> '+safe(sample.subject||"")+'</p>'+
  '<p><strong>Example recipient:</strong> '+safe(sample.to||"")+'</p>'+
  '<div class="hint" style="white-space:pre-wrap">'+safe(sample.body||"")+'</div>'+
  '<p class="muted">Illustrative text only: no real invitation token or customer address.</p>'+
  testAction+pilotAction);
}
function companyAccessContent(){
 if(!s.account?.isPlatformOperator)return panel("Access denied","<p>Company enrollment is managed by the Nexus platform operator only.</p>");
 if(s.onboardingError)return panel("Company onboarding needs attention",'<p>'+safe(s.onboardingError)+'</p><p>Reload the data to try again. Existing company records are unaffected.</p>');
 const link=s.newInvite?location.origin+"/#invite="+s.newInvite.token:"";
 const oneTime=s.newInvite?panel("One-time company invitation — copy this now",
  '<p><strong>'+safe(s.newInvite.companyName)+'</strong> · '+safe(s.newInvite.email)+'</p>'+
  '<p>Copy and privately share this link with the intended owner. It expires in 3 days and works only once. Nexus does not email it automatically.</p>'+
  '<label>Invitation link<input type="text" readonly autocomplete="off" aria-label="New company invitation link" value="'+safe(link)+'"></label>'+
  '<div class="actionrow"><button class="primary" type="button" data-action="copy-company-invite">Copy invitation link</button>'+
  '<button type="button" data-action="clear-company-invite">Hide link</button></div>'+
  '<p class="muted">Keep this link private. Anyone holding it could activate the invited account until it expires or is revoked.</p>'):"";
 const invites=s.companyInvites.map(x=>{
  const state=x.redeemedAt?"Accepted":x.revokedAt?"Revoked":x.expiresAt<=Math.floor(Date.now()/1000)?"Expired":"Pending";
  const cancel=state==="Pending"?'<form data-form="revoke-company-invite" class="actionrow">'+
   '<input type="hidden" name="id" value="'+safe(x.id)+'">'+
   '<label>Owner password<input name="password" type="password" autocomplete="current-password" required></label>'+
   '<button type="submit">Revoke</button></form>':"";
  return '<tr><td>'+safe(x.companyName)+'</td><td>'+safe(x.email)+'</td><td>'+safe(state)+'</td>'+
   '<td>'+safe(new Date(x.expiresAt*1000).toLocaleDateString())+'</td><td>'+cancel+'</td></tr>';
 });
 const companies=s.companies.map(x=>'<tr><td>'+safe(x.name)+'</td><td>'+safe(x.ownerEmail||"No owner")+'</td>'+
  '<td>'+safe(x.userCount)+'</td><td>'+safe(x.customerCount)+'</td><td>'+safe(x.jobCount)+'</td></tr>');
 return editorPanel("Invite test company",
  '<p>Create a new workspace and owner sign-in. Invitations expire after three days and can be used once.</p>'+
  '<div class="hint">Test accounts only. Email verification and MFA are not enabled.</div>'+
  '<form data-form="company-invite" class="gridform">'+
  input("companyName","New company name","","text",true)+
  input("email","Company owner email","","email",true)+
  '<label>Your current Nexus CRM password<input name="password" type="password" autocomplete="current-password" required></label>'+
  '<div class="actionrow"><button class="primary" type="submit">Create one-time company invitation</button></div></form>'+
  '<p class="panel-note">Send the invitation privately. Do not onboard actual businesses yet.</p>')+
  oneTime+
  panel("Company invitations · "+s.companyInvites.length,table(["Company","Invited owner","Status","Expires","Action"],invites))+
  panel("Companies · "+s.companies.length,table(["Company","Owner account","Users","Customers","Jobs"],companies))+companyEmailLabContent();
}

function mfaPanel(){
 const status=s.mfaStatus||{};
 if(!status.available)return panel("Authenticator protection",
  '<p class="panel-note">The authenticator service has not been configured for this environment.</p>');
 if(status.enabled)return panel("Authenticator protection",
  '<p><strong>Enabled.</strong> A six-digit authenticator code is required after your password on new sign-ins.</p>'+
  '<p class="panel-note">Keep your one-time recovery codes in a safe place.</p>'+
  '<form data-form="mfa-disable">'+
  '<label>Current account password<input name="password" type="password" autocomplete="current-password" required></label>'+
  '<label>Current authenticator code<input name="code" type="text" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="one-time-code" required></label>'+
  '<button type="submit">Disable authenticator protection</button></form>');
 if(s.newMfaSecret)return panel("Finish authenticator setup",
  '<p>Add a new account in your authenticator app using the manual setup key below. '+
  'Choose a time-based, six-digit code. Your device time should be set automatically.</p>'+
  '<label>Private setup key<input type="text" readonly aria-label="Authenticator manual setup key" value="'+safe(s.newMfaSecret.secret)+'"></label>'+
  '<p class="panel-note">This setup expires in 10 minutes. Do not share this key.</p>'+
  '<form data-form="mfa-confirm"><label>Authenticator code<input name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" minlength="6" autocomplete="one-time-code" required></label>'+
  '<button type="submit" class="primary">Verify and enable</button></form>');
 return disclosurePanel("Enable authenticator protection",
  '<p>For stronger sign-in security, add an authenticator app on your phone. '+
  'You can enter a setup key manually, so a computer is not required.</p>'+
  '<form data-form="mfa-start"><label>Confirm account password<input type="password" name="password" autocomplete="current-password" required></label>'+
  '<button type="submit" class="primary">Generate authenticator setup key</button></form>');
}
function accountSecurityContent(){
 const generated=s.newRecoveryCodes;
 const issued=generated?panel("Save your recovery codes now",
  '<p><strong>Each code works one time.</strong> These eight codes are shown only now. Save them in a private password manager or secure offline location. Creating new codes cancels old ones.</p>'+
  '<label>Recovery codes<textarea readonly rows="11" aria-label="New account recovery codes">'+safe(generated.join("\n"))+'</textarea></label>'+
  '<div class="actionrow"><button type="button" class="primary" data-action="copy-recovery">Copy recovery codes</button>'+
  '<button type="button" data-action="hide-recovery">Hide codes</button></div>'):"";
 return mfaPanel()+panel("Change your account password",
  '<p>Changing your password signs out other devices.</p>'+
  '<form data-form="change-password">'+
  '<label>Current password<input name="currentPassword" type="password" autocomplete="current-password" required></label>'+
  '<label>New password<input name="newPassword" type="password" minlength="14" maxlength="128" autocomplete="new-password" required></label>'+
  '<label>Confirm password<input name="confirmPassword" type="password" minlength="14" maxlength="128" autocomplete="new-password" required></label>'+
  '<button type="submit" class="primary">Change password</button></form>')+
  panel("Offline recovery codes",
  '<p>Generate eight single-use codes for password recovery. New codes invalidate old ones; this is not MFA.</p>'+
  '<form data-form="generate-recovery"><label>Confirm current password<input name="password" type="password" required autocomplete="current-password"></label>'+
  '<button type="submit" class="primary">Generate new recovery codes</button></form>')+
  issued;
}
function teamAccessContent(){
 if(s.account?.role!=="owner")return panel("Access denied","<p>Only company owners can manage team access.</p>");
 if(s.staffError)return panel("Team access unavailable",'<p>'+safe(s.staffError)+'</p><p>Refresh to retry. Your other company records are unchanged.</p>');
 const link=s.newStaffInvite?location.origin+"/#staff="+s.newStaffInvite.token:"";
 const minted=s.newStaffInvite?panel("Copy this one-time staff link",
  '<p><strong>'+safe(s.newStaffInvite.email)+'</strong> · '+safe(s.newStaffInvite.role)+'</p>'+
  '<p>Private pilot invitation. The link works once, expires in three days, and is not sent by Nexus CRM.</p>'+
  '<label>Staff invitation link<input readonly type="text" value="'+safe(link)+'" aria-label="New staff invite link"></label>'+
  '<div class="actionrow"><button type="button" class="primary" data-action="copy-staff-invite">Copy invitation</button>'+
  '<button type="button" data-action="clear-staff-invite">Hide link</button></div>'):"";
 const users=s.staffUsers.map(x=>{
  const active=x.disabledAt===null||x.disabledAt===undefined;
  const action=x.role==="owner"?"Owner account":
   '<form data-form="toggle-staff" class="actionrow">'+
   '<input name="id" type="hidden" value="'+safe(x.id)+'">'+
   '<input name="action" type="hidden" value="'+(active?"disable":"enable")+'">'+
   '<label>Confirm owner password<input name="password" type="password" required autocomplete="current-password"></label>'+
   '<button type="submit">'+(active?"Disable access":"Enable access")+'</button></form>';
  return '<tr><td>'+safe(x.email)+'</td><td>'+safe(x.role)+'</td>'+
   '<td>'+safe(active?"Active":"Disabled")+'</td>'+
   '<td>'+safe(new Date(x.createdAt*1000).toLocaleDateString())+'</td>'+
   '<td>'+action+'</td></tr>';
 });
 const invites=s.staffInvites.map(x=>{
  const status=x.redeemedAt?"Accepted":x.revokedAt?"Revoked":x.expiresAt<=Math.floor(Date.now()/1000)?"Expired":"Pending";
  const cancel=status==="Pending"?
   '<form data-form="revoke-staff" class="actionrow"><input type="hidden" name="id" value="'+safe(x.id)+'">'+
   '<label>Owner password<input name="password" type="password" required autocomplete="current-password"></label>'+
   '<button type="submit">Revoke</button></form>':"";
  return '<tr><td>'+safe(x.email)+'</td><td>'+safe(x.role)+'</td><td>'+safe(status)+'</td><td>'+cancel+'</td></tr>';
 });
 return editorPanel("Invite team member",
  '<p><strong>Admin</strong> can edit operations and Finance. <strong>Employee</strong> can view operations only.</p>'+
  '<div class="hint">Pilot testing only: use an address you control. Email verification and MFA are not enabled.</div>'+
  '<form data-form="staff-invite" class="gridform">'+
  input("email","Staff email","","email",true)+
  '<label>Staff role<select name="role" required><option value="employee">Employee · read-only operations</option>'+
  '<option value="admin">Admin · edit operations and Finance</option></select></label>'+
  '<label>Confirm your Nexus CRM password<input name="password" type="password" required autocomplete="current-password"></label>'+
  '<div class="actionrow"><button type="submit" class="primary">Create staff invitation</button></div></form>')+
  (s.staffPilotAvailable?panel("Pilot staff email test · Gmail only",
   '<p>After activating your fictional Nexus Email Pilot QA company, send one employee or admin invitation to a unique Gmail alias that belongs to your original Nexus owner inbox.</p>'+
   '<form data-form="staff-email-pilot" class="gridform">'+
   '<label>Test staff role<select name="role" required><option value="employee">Employee · read-only</option><option value="admin">Admin · edit operations and Finance</option></select></label>'+
   '<label>Confirm pilot company owner password<input name="password" type="password" required autocomplete="current-password"></label>'+
   '<button class="primary" type="submit">Email a test staff invitation to my Gmail</button></form>'+
   '<p class="muted">Fictional pilot only, no customer accounts or payments. Link expires in three days and works once. Sending is limited to one test every 30 minutes.</p>'):"")+
  minted+panel("Team accounts · "+s.staffUsers.length,table(["Email","Role","Status","Created","Access"],users))+
  panel("Invitations · "+s.staffInvites.length,table(["Email","Role","Status","Action"],invites));
}

async function loadLicenseInfo(){
 try{const info=await request("/api/pos/licensing");s.licenseInfo=info;s.licenseError="";}
 catch(err){s.licenseError=err.message||"License catalog unavailable";s.licenseInfo=null}
 draw();
}
function licenseManagementContent(){
 if(s.licenseError)return panel("License information unavailable",'<p>'+safe(s.licenseError)+'</p><button data-action="license-refresh" type="button">Retry</button>');
 if(!s.licenseInfo)return panel("Nexus Software licensing",'<p>Loading your company license status…</p><button data-action="license-refresh" type="button">Refresh</button>');
 const info=s.licenseInfo,license=info.license||{status:"unlicensed"};
 const cards=(info.plans||[]).map(p=>'<div class="card"><strong>'+safe(p.label)+'</strong><p>'+money(p.price_cents/100)+' / '+safe(p.billing_period)+'</p><small class="muted">Proposed plan · not available for purchase</small></div>').join("");
 return panel("Nexus CRM licensing",'<p><strong>Company status:</strong> '+safe(license.status||"unlicensed")+'</p>'+
  '<p class="panel-note">These prices are draft options. Square billing and license activation are disabled until verified webhooks, company provisioning, taxes, and owner approval are complete.</p>'+
  '<div class="cards">'+cards+'</div><div class="actionrow"><button data-action="license-refresh" type="button">Refresh license status</button></div>');
}
function managementContent(){
 const nav=sectionNav(managementTabs.filter(tab=>!["Sales Leads","Companies"].includes(tab)||s.account?.isPlatformOperator),s.managementView,"management","Management sections");
 if(s.account?.role!=="owner")return nav+panel("Owner controls",'<p>Backups and security operations are restricted to the company owner.</p>');
 if(s.managementView==="Sales Leads")return s.account?.isPlatformOperator?nav+salesLeadsContent():nav+panel("Access denied","<p>This area is reserved for the Nexus platform operator.</p>");
 if(s.managementView==="Companies")return nav+companyAccessContent();
 if(s.managementView==="Team Access")return nav+teamAccessContent();
 if(s.managementView==="Licensing")return nav+licenseManagementContent();
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
  const verifyPanel=disclosurePanel("Verify encrypted backup",'<p>Check an exported file and passphrase entirely on this device. The file is not uploaded to Nexus CRM.</p>'+
    '<form data-form="verify-backup"><label>Select backup file<input type="file" name="backupFile" required accept=".json,application/json"></label>'+
    '<label>Backup passphrase<input type="password" name="backupPassphrase" required autocomplete="off"></label>'+
    '<button class="primary" type="submit">Verify my backup</button></form>');
  return nav+
   panel("Backup & recovery",'<p class="panel-note">Snapshots are stored within the same database. Independent off-site backups are not configured yet.</p>')+
   editorPanel("Create recovery snapshot",
    '<form data-form="backup"><label>Snapshot label<input name="note" maxlength="100" value="Before CRM updates"></label>'+
    '<button class="primary" type="submit">Save snapshot</button></form>')+
   panel("Saved snapshots · "+s.backupItems.length,table(["Created","Label","Records included","Action"],entries))+
   details+downloadForm+verifyPanel;
 }
 const x=s.securitySummary||{};
 const rows=s.auditEvents.map(e=>'<tr><td>'+safe(new Date(e.createdAt*1000).toLocaleString())+'</td><td>'+
  safe(e.category)+'</td><td>'+safe(e.action)+'</td></tr>');
 return nav+panel("Account security",'<p><strong>Company:</strong> '+safe(s.account?.company||"")+'</p>'+
    '<p><strong>Owner:</strong> '+safe(s.account?.email||"")+'</p>'+
    '<p><strong>Active sessions:</strong> '+safe(x.activeSessions??"—")+'</p>'+
    '<p><strong>Multifactor authentication:</strong> Not configured.</p>'+
    '<p><strong>Cloud snapshots:</strong> '+safe(x.backups??"—")+'</p>'+
    '<p><strong>Independent off-site backup:</strong> Not configured.</p>'+
    '<div class="hint">Passwords, session cookies, and login tokens are excluded from recovery snapshots. Keep using fictional records until security review, MFA, and off-site backup testing are complete.</div>')+
    accountSecurityContent()+
    disclosurePanel("Sign out other devices",'<p>Revoke other active Nexus CRM sign-in sessions. This device stays signed in.</p>'+
    '<form data-form="revoke-sessions"><label>Account password<input name="password" type="password" required autocomplete="current-password"></label>'+
    '<button class="primary" type="submit">Sign out other devices</button></form>')+
    disclosurePanel("Recent activity",table(["When","Area","Action"],rows));
}

function currentTab(){
 const d=$("view");
 if(s.page==="Account"){d.innerHTML=accountSecurityContent();return;}
 if(s.page==="Dashboard"){
  const x=s.dashboard||{customers:0,openJobs:0,jobPipeline:0};
  d.innerHTML='<div class="cards overview-cards">'+
  '<div class="card">Customers<strong>'+x.customers+'</strong></div>'+
  '<div class="card">Open jobs<strong>'+x.openJobs+'</strong></div>'+'<div class="card">Employees<strong>'+s.employees.length+'</strong></div>'+'<div class="card">Appointments<strong>'+s.appointments.length+'</strong></div>'+
  '<div class="card">Job pipeline<strong>'+money(x.jobPipeline)+'</strong></div></div>'+
   // POS belongs inside Finance; use the existing CRM session and tenant context.
   (["owner","admin"].includes(s.account?.role)
     ?panel("Sales & Finance · Nexus POS",'<p>Use POS checkout, inventory, CRM customers, and sales reports inside Finance. Test sales remain pending/unpaid; no Square charge is made.</p>'+
       '<div class="actionrow"><button type="button" class="primary" data-action="open-integrated-pos">Open POS inside CRM</button>'+
       '<button type="button" data-action="open-finance">Open Sales & Finance</button></div>')
     :"");
 }
 if(s.page==="Customers"){
  const editing=s.customers.find(c=>c.id===s.editingCustomer);
  const form='<form data-form="customer" class="gridform">'+
   input("name","Customer name",editing?.name||"","text",true)+input("email","Email address",editing?.email||"","email")+
   input("phone","Phone",editing?.phone||"")+input("notes","Notes",editing?.notes||"")+
   '<div class="actionrow"><button class="primary" type="submit">'+(editing?"Save customer":"Add customer")+'</button>'+
   (editing?'<button type="button" data-action="cancel-edit">Cancel</button>':"")+'</div></form>';
  const rows=s.customers.map(c=>'<tr><td>'+safe(c.name)+'</td><td>'+safe(c.email)+'</td><td>'+safe(c.phone)+'</td><td><button data-customer="'+safe(c.id)+'">Edit</button></td></tr>');
  d.innerHTML=editorPanel(editing?"Edit customer":"Add customer",form,!!editing)+panel("Customers · "+s.customers.length,table(["Name","Email","Phone","Action"],rows));
 }
 if(s.page==="Operations"){
  const nav=sectionNav(["Jobs","Schedule","Employees"],s.operationsView,"operation","Operations sections");
  if(s.operationsView==="Jobs"){
  const editing=s.jobs.find(j=>j.id===s.editingJob);
  const form=s.customers.length?
    '<form data-form="job" class="gridform">'+
    '<label>Customer<select name="customerId" required>'+customerOptions(editing?.customerId)+'</select></label>'+
    input("title","Job title",editing?.title||"","text",true)+
    '<label>Amount ($)<input name="amount" type="number" min="0" max="1000000000" step=".01" required value="'+safe(editing?.amount??0)+'"></label>'+
    input("scheduledDate","Scheduled date",editing?.scheduledDate||"","date")+
    input("siteAddress","Property / job-site address",editing?.siteAddress||"")+
    input("siteInstructions","Site instructions",editing?.siteInstructions||"")+
    '<label>Crew lead<select name="crewLeadId"><option value="">Unassigned</option>'+s.employees.filter(e=>e.status==="Active"||e.id===editing?.crewLeadId).map(e=>'<option value="'+safe(e.id)+'" '+(e.id===editing?.crewLeadId?"selected":"")+'>'+safe(e.name)+'</option>').join("")+'</select></label>'+
    '<label>Status<select name="status">'+jobStatusOptions(editing?.status||"Planned")+'</select></label>'+
    '<div class="actionrow"><button class="primary" type="submit">'+(editing?"Save job":"Create job")+'</button>'+
    (editing?'<button type="button" data-action="cancel-edit">Cancel</button>':"")+'</div></form>':
    '<p>Add a customer in the Customers tab before creating jobs.</p>';
  const rows=s.jobs.map(j=>'<tr><td>'+safe(j.title)+'</td><td>'+safe(j.customerName)+'</td><td>'+money(j.amount)+'</td><td>'+statusBadge(j.status)+'</td><td>'+safe(j.scheduledDate||"Not scheduled")+'</td><td><button data-job="'+safe(j.id)+'">Edit</button></td></tr>');
  d.innerHTML=nav+(s.customers.length?editorPanel(editing?"Edit job":"Create job",form,!!editing):panel("Getting started",form))+panel("Jobs · "+s.jobs.length,table(["Job","Customer","Amount","Status","Date","Action"],rows));

  }else if(s.operationsView==="Employees"){
   const e=s.employees.find(x=>x.id===s.editingEmployee);
   const form='<form data-form="employee" class="gridform">'+
    input("name","Employee name",e?.name||"","text",true)+input("jobTitle","Role",e?.jobTitle||"")+
    input("email","Email",e?.email||"","email")+input("phone","Phone",e?.phone||"")+
    '<label>Status<select name="status">'+["Active","Inactive"].map(v=>'<option value="'+v+'" '+(v===(e?.status||"Active")?"selected":"")+'>'+v+'</option>').join("")+'</select></label>'+
    '<div class="actionrow"><button class="primary" type="submit">'+(e?"Save employee":"Add employee")+'</button>'+
    (e?'<button type="button" data-action="cancel-edit">Cancel</button>':"")+'</div></form>';
   const rows=s.employees.map(e=>'<tr><td>'+safe(e.name)+'</td><td>'+safe(e.jobTitle)+'</td><td>'+safe(e.email)+'</td><td>'+statusBadge(e.status)+'</td><td><button data-employee="'+safe(e.id)+'">Edit</button></td></tr>');
   d.innerHTML=nav+editorPanel(e?"Edit employee":"Add employee",form,!!e)+panel("Employees · "+s.employees.length,table(["Name","Role","Email","Status","Action"],rows)+
     '<p class="panel-note">Directory records are separate from Team Access logins.</p>');
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
   d.innerHTML=nav+(s.jobs.length?editorPanel(e?"Edit appointment":"Schedule appointment",form,!!e):panel("Getting started",form))+
     panel("Appointments · "+s.appointments.length,table(["Date","Time","Job","Employee","Location","Action"],rows)+
     '<p class="panel-note">Times are local to your business. Calendar synchronization is not enabled.</p>');
  }
 }
 if(s.page==="Finance")d.innerHTML=financeContent();
 if(s.page==="Management")d.innerHTML=managementContent();
}
function draw(){
 if(!s.account)return;
 if(s.account.role==="owner"&&s.page==="Account"){s.page="Management";s.managementView="Security";}
 $("mount").innerHTML='<div class="layout"><aside class="sidebar"><div class="tenant">'+safe(s.account.company)+'</div>'+
 (s.account.role==="owner"?tabs:tabs.filter(t=>t!=="Management"&&(t!=="Finance"||s.account.role!=="employee")).concat("Account")).map(t=>'<button class="nav '+(s.page===t?"active":"")+'" data-page="'+t+'">'+(t==="Account"?"My Account":t)+'</button>').join("")+
 '</aside><main class="content"><div class="content-heading"><div><h1>'+safe(s.page)+'</h1></div>'+
 '<div class="actionrow"><button data-action="refresh">Refresh data</button><button data-action="logout">Sign out</button></div></div><div id="view"></div></main></div>';
 currentTab();
 if(s.account.role==="employee"&&s.page!=="Account"){
  // Employees have read-only operational access; server RBAC enforces this as well.
  $("view").querySelectorAll('form[data-form],button[data-customer],button[data-job],button[data-employee],button[data-appointment],button[data-estimate]').forEach(el=>el.remove());
  if(s.page==="Dashboard"){
   const cards=$("view").querySelectorAll(".card");
   if(cards.length>=5)cards[4].remove();
  }
 }
}
// Fetch independent workspaces concurrently. A failure in Finance or Management
// must not prevent the core CRM from loading.
let refreshNumber=0;
async function refresh(){
 const seq=++refreshNumber;
 const me=await request("/api/me");
 if(seq!==refreshNumber)return;
 s.account=me.user;s.csrf=me.csrf;
 const coreLoad=Promise.all([request("/api/customers"),request("/api/jobs"),request("/api/employees"),request("/api/appointments"),request("/api/dashboard")])
  .then(([customers,jobs,employees,appointments,dashboard])=>({customers,jobs,employees,appointments,dashboard}));
 const financeLoad=s.account.role==="employee"
  ?Promise.resolve({estimates:{items:[]},invoices:{items:[]},payments:{items:[]},reports:{totals:null}})
  :Promise.all([request("/api/estimates"),request("/api/invoices"),request("/api/payments"),request("/api/reports")])
    .then(([estimates,invoices,payments,reports])=>({estimates,invoices,payments,reports}));
 const owner=s.account.role==="owner";
 const managementLoad=owner?Promise.all([request("/api/backups"),request("/api/security/summary"),request("/api/security/activity")])
  .then(([backups,summary,activity])=>({backups,summary,activity})):Promise.resolve(null);
 const platform=owner&&s.account.isPlatformOperator;
 // Lead inbox and company controls must fail independently; the public
 // interest database should never block managing test company invitations.
 const leadsLoad=platform?request("/api/sales/leads"):Promise.resolve(null);
 const companiesLoad=platform?Promise.all([
  request("/api/platform/invitations"),request("/api/platform/companies")
 ]).then(([invitations,companies])=>({invitations,companies})):Promise.resolve(null);
 const staffLoad=owner?Promise.all([request("/api/staff/users"),request("/api/staff/invitations")])
  .then(([users,invitations])=>({users,invitations})):Promise.resolve(null);
 const mfaLoad=request("/api/security/mfa/status");
 const emailLabLoad=platform?request("/api/platform/email-lab"):Promise.resolve(null);
 const outcomes=await Promise.allSettled([coreLoad,financeLoad,managementLoad,leadsLoad,companiesLoad,staffLoad,mfaLoad,emailLabLoad]);
 if(seq!==refreshNumber)return;
 if(outcomes[0].status==="rejected")throw outcomes[0].reason;
 const core=outcomes[0].value;
 s.customers=core.customers.items;s.jobs=core.jobs.items;s.employees=core.employees.items;
 s.appointments=core.appointments.items;s.dashboard=core.dashboard;
 s.mfaStatus=outcomes[6].status==="fulfilled"?outcomes[6].value:{available:false,enabled:false};
 const financial=outcomes[1];
 if(financial.status==="fulfilled"){
  s.estimates=financial.value.estimates.items;s.invoices=financial.value.invoices.items;
  s.payments=financial.value.payments.items;s.financeReport=financial.value.reports.totals;s.financeError="";
 }else{s.financeError=financial.reason?.message||"Unable to load Finance";}
 if(owner){
  const management=outcomes[2];
  if(management.status==="fulfilled"){
   s.backupItems=management.value.backups.items;s.securitySummary=management.value.summary;
   s.auditEvents=management.value.activity.items;s.recoveryError="";
  }else{s.recoveryError=management.reason?.message||"Unable to load recovery controls";}
  const team=outcomes[5];
  if(team.status==="fulfilled"){
   s.staffUsers=team.value.users.items;s.staffInvites=team.value.invitations.items;s.staffPilotAvailable=Boolean(team.value.invitations.pilotStaffAvailable);s.staffError="";
  }else{s.staffError=team.reason?.message||"Unable to load team access";}
  if(platform){
   const sales=outcomes[3],companyData=outcomes[4];
   if(sales.status==="fulfilled"){
    s.salesLeads=sales.value.items;s.salesTotal=sales.value.total;s.salesNew=sales.value.newCount;s.salesError="";
   }else{s.salesError=sales.reason?.message||"Unable to load sales inquiries";}
   if(companyData.status==="fulfilled"){
    s.companyInvites=companyData.value.invitations.items;s.companies=companyData.value.companies.items;s.onboardingError="";
   }else{s.onboardingError=companyData.reason?.message||"Unable to load company onboarding";}
   const email=outcomes[7];
   if(email.status==="fulfilled"){s.emailLab=email.value;s.emailLabError="";}
   else{s.emailLab=null;s.emailLabError="Unable to load the safe email preview";}
  }
 }
 draw();
}
async function start(){
 try{
  // Invitation owners need not wait for the public status request.
  if(s.pendingInviteToken){await invitationScreen();return}
  if(s.pendingStaffToken){await staffInvitationScreen();return}
  const status=await request("/api/status");
  try{await refresh();notice("")}
  catch(e){if((e.message||"").includes("sign in"))authScreen(status.configured?"login":"setup");
  else if(e.message==="Please sign in")authScreen(status.configured?"login":"setup");
  else throw e;}
 }catch(e){$("mount").innerHTML='<div class="auth"><h1>Cloud connection unavailable</h1><p>The private CRM database or deployment is not ready.</p><button data-action="retry">Try again</button></div>';notice(e.message)}
}
document.addEventListener("click",async e=>{
 const b=e.target.closest("button");if(!b)return;
 if(b.dataset.action==="cancel-mfa-login"){s.mfaChallenge=null;authScreen("login");notice("");return}
 if(b.dataset.action==="recover-screen"){recoveryScreen();notice("");return}
 if(b.dataset.action==="return-login"){authScreen("login");notice("");return}
 if(b.dataset.action==="copy-recovery"){
  if(!s.newRecoveryCodes)return;
  try{await navigator.clipboard.writeText(s.newRecoveryCodes.join("\n"));notice("Recovery codes copied. Store them securely.")}
  catch(e){notice("Select the codes above and copy them manually.");}
  return;
 }
 if(b.dataset.action==="hide-recovery"){s.newRecoveryCodes=null;draw();notice("Recovery codes hidden.");return}
 if(b.dataset.page){s.newRecoveryCodes=null;s.newMfaSecret=null;s.page=b.dataset.page;s.editingCustomer=null;s.editingJob=null;s.editingEmployee=null;s.editingAppointment=null;s.editingEstimate=null;draw();notice("");return}
 if(b.dataset.action==="open-integrated-pos"){
  if(!s.account||!["owner","admin"].includes(s.account.role)){notice("POS access denied.");return}
  s.page="Finance";s.financeView="POS";draw();notice("");await loadPos();return;
 }
 if(b.dataset.action==="open-finance"){
  if(!s.account||!["owner","admin"].includes(s.account.role)){notice("Finance access denied.");return}
  s.page="Finance";s.financeView="Estimates";draw();notice("");return;
 }
 if(b.dataset.finance){s.financeView=b.dataset.finance;s.editingEstimate=null;draw();notice("");if(s.financeView==="POS")await loadPos();return}
 if(b.dataset.operation){s.operationsView=b.dataset.operation;s.editingJob=null;s.editingEmployee=null;s.editingAppointment=null;draw();notice("");return}
 if(b.dataset.management){s.managementView=b.dataset.management;s.backupPreview=null;if(s.managementView!=="Security"){s.newRecoveryCodes=null;s.newMfaSecret=null;}if(s.managementView!=="Companies")s.newInvite=null;draw();notice("");if(s.managementView==="Licensing")await loadLicenseInfo();return}
 if(b.dataset.action==="copy-company-invite"){
  if(!s.newInvite)return;
  const link=location.origin+"/#invite="+s.newInvite.token;
  try{await navigator.clipboard.writeText(link);notice("Invitation link copied. Share it privately with the invited owner.")}
  catch(e){notice("Select the invitation link above and copy it manually.");}
  return;
 }
 if(b.dataset.action==="copy-staff-invite"){
  if(!s.newStaffInvite)return;
  const link=location.origin+"/#staff="+s.newStaffInvite.token;
  try{await navigator.clipboard.writeText(link);notice("Staff invitation copied. Share it privately with the invited user.")}
  catch(e){notice("Select the invitation link above and copy it manually.");}
  return;
 }
 if(b.dataset.action==="clear-staff-invite"){s.newStaffInvite=null;draw();notice("Staff invite link hidden.");return}
 if(b.dataset.action==="clear-company-invite"){s.newInvite=null;draw();notice("One-time invitation link hidden.");return}
 if(b.dataset.action==="cancel-invite"){
  s.pendingInviteToken="";s.pendingStaffToken="";
  try{await refresh();notice("");}catch(e){authScreen("login");notice("");}
  return;
 }
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
 if(b.dataset.posview){s.posView=b.dataset.posview;draw();return}
 if(b.dataset.posAdd){if(posPendingRead()){notice("Resolve the pending checkout before changing the cart.");return}const p=s.posProducts.find(x=>x.id===b.dataset.posAdd);if(p&&p.active&&!s.posBusy&&(s.posCart[p.id]||0)<p.stock_quantity){s.posCart[p.id]=(s.posCart[p.id]||0)+1;draw()}return}
 if(b.dataset.posRemove){if(posPendingRead()){notice("Resolve the pending checkout before changing the cart.");return}const id=b.dataset.posRemove;s.posCart[id]=Math.max(0,(s.posCart[id]||0)-1);if(!s.posCart[id])delete s.posCart[id];draw();return}
 if(b.dataset.action==="pos-clear"){if(posPendingRead()){notice("A checkout needs confirmation before clearing the cart.");return}s.posCart={};draw();return}
 if(b.dataset.posVoid){
  const saleId=b.dataset.posVoid;
  if(!s.posSales.some(x=>x.id===saleId&&x.status==="pending")){notice("Only pending sales can be voided.");return}
  if(!confirm("Void this UNPAID sale and restore its reserved stock? This does not refund a card."))return;
  b.disabled=true;
  try{
   const result=await request("/api/pos/sales/void","POST",{sale_id:saleId,confirm:"VOID UNPAID SALE"});
   await loadPos();notice("Unpaid sale "+result.id+" voided. Stock restored; no payment or refund processed.");
  }catch(err){notice(err.message)}
  finally{b.disabled=false}
  return;
 }
 if(b.dataset.squarePrepare){
  b.disabled=true;
  try{
   const sale=b.dataset.squarePrepare;
   const key="qatest_"+sale.replace(/-/g,"");
   const a=await request("/api/pos/square/sandbox-prepare","POST",{sale_id:sale,idempotency_key:key});
   await loadPos();notice("Sandbox attempt "+a.attempt_id+" prepared for this unpaid sale. No payment submitted.");
  }catch(err){notice("Sandbox preparation: "+err.message)}
  return;
 }
 if(b.dataset.squareSubmit){
  if(!confirm("Run a FAKE Square Sandbox card payment for this pending test sale? No real card or money will be used."))return;
  b.disabled=true;
  try{
   const r=await request("/api/pos/square/sandbox-submit","POST",{attempt_id:b.dataset.squareSubmit,confirm:"RUN SANDBOX TEST PAYMENT"});
   if(!r.provider_completed||!r.payment_id)throw Error("Provider completion not yet confirmed. Check attempts; do not resubmit.");
   const done=await request("/api/pos/square/sandbox-reconcile","POST",{attempt_id:r.attempt_id,payment_id:r.payment_id});
   await loadPos();notice(done.reconciled?"Fake Square Sandbox payment verified and sale completed. No real charge.":"Sandbox receipt requires review.");
  }catch(err){await loadPos();notice("Sandbox test needs review: "+err.message+". Do not run a second payment. Use manual verification or contact support.");}
  return;
 }
  if(b.dataset.action==="square-check"){
  b.disabled=true;s.squareResult="Checking Square Sandbox...";draw();
  try{const res=await fetch("/api/pos/square/sandbox-connectivity",{method:"GET",credentials:"same-origin",cache:"no-store",headers:{"Accept":"application/json"}});const data=await res.json();
   if(res.ok&&data.connected)s.squareResult="Square Sandbox connected. Location verified; merchant "+(data.merchantVerified?"verified.":"not included in response.")+" No charges made.";
   else if(res.status===401){let crmOk=false;try{await request("/api/me");crmOk=true}catch{}s.squareResult=crmOk?"CRM sign-in works, but POS authorization failed.":"CRM sign-in session unavailable.";}
   else s.squareResult="Square Sandbox status: "+(data.reason||data.error||"HTTP "+res.status);
  }catch(err){s.squareResult="Square check could not complete: "+err.message}
  draw();return;
 }
 if(b.dataset.action==="pos-refresh"){await loadPos();return}
 if(b.dataset.action==="license-refresh"){await loadLicenseInfo();return}
 if(b.dataset.action==="pos-retry"){await posCommit();return}
 if(b.dataset.action==="pos-record"){await posCommit();return}
 if(b.dataset.action==="retry"){await start();return}
 if(b.dataset.action==="refresh"){try{await refresh();if(s.page==="Finance"&&s.financeView==="POS")await loadPos();notice("Records refreshed from the cloud database.")}catch(err){notice(err.message)}return}
 if(b.dataset.action==="logout"){try{await request("/api/logout","POST",{});s.account=null;s.csrf="";authScreen("login");notice("Signed out.")}catch(err){notice(err.message)}}
});
document.addEventListener("change",e=>{
 if(!e.target?.matches?.('select[data-pos-customer]'))return;
 if(posPendingRead()||s.posBusy){draw();return}
 const id=e.target.value;
 if(id&&!s.customers.some(c=>c.id===id)){notice("CRM customer is unavailable");draw();return}
 s.posCustomerId=id;draw();
});
document.addEventListener("submit",async e=>{
 const f=e.target;if(!f.dataset.form)return;
 e.preventDefault();const type=f.dataset.form,data=Object.fromEntries(new FormData(f));
 const btn=f.querySelector('button[type="submit"]');if(btn)btn.disabled=true;
 try{
  if(type==="email-invite-pilot"){
   const result=await request("/api/platform/email-invite-pilot","POST",{password:data.password});
   await refresh();s.managementView="Companies";draw();
   notice("Pilot invitation accepted by Resend for "+result.email+". Check your Gmail inbox, then open the invitation link in a private tab. No customer billing enabled.");
   return;
  }
  if(type==="email-self-test"){
   const done=await request("/api/platform/email-self-test","POST",{password:data.password});
   if(done.providerAccepted){
    s.emailTestStatus="Resend accepted a test addressed to "+done.recipient+". Check Inbox and Spam. Delivery not confirmed until you receive it.";
    draw();
    notice(s.emailTestStatus);
   }else notice("Email test did not complete.");
   return;
  }
  if(type==="square-reconcile"){
   const result=await request("/api/pos/square/sandbox-reconcile","POST",{attempt_id:data.attempt_id,payment_id:String(data.payment_id||"").trim()});
   await loadPos();notice(result.reconciled?"Square Sandbox payment independently verified and sale reconciled. No real charge.":"Sandbox payment not reconciled.");return;
  }
   if(type==="pos-product"){
   const price=Number(data.price),stock=Number(data.stock_quantity);
   if(!Number.isFinite(price)||price<0||!Number.isSafeInteger(Math.round(price*100))||!Number.isSafeInteger(stock)||stock<0)throw Error("Invalid product");
   await request("/api/pos/products","POST",{sku:data.sku,name:data.name,price_cents:Math.round(price*100),stock_quantity:stock});
   await loadPos();notice("Company product saved.");return;
  }
  if(type==="recover"){
   if(data.newPassword!==data.confirmPassword)throw Error("New passwords do not match.");
   if(String(data.newPassword).length<14)throw Error("Use at least 14 characters for your new password.");
   await request("/api/recover","POST",{email:data.email,code:data.code,newPassword:data.newPassword});
   authScreen("login");notice("Password reset succeeded. Sign in with your new password.");return;
  }
  if(type==="generate-recovery"){
   const result=await request("/api/security/recovery-codes","POST",{password:data.password});
   s.newRecoveryCodes=result.codes;
   if(s.account?.role==="owner"){s.page="Management";s.managementView="Security";}
   else{s.page="Account";}
   draw();
   notice("New codes generated. Save them now; they cannot be displayed again.");return;
  }
  if(type==="accept-staff"){
   if(data.password!==data.confirmPassword)throw Error("Passwords do not match.");
   if(String(data.password).length<14)throw Error("Choose a password of at least 14 characters.");
   await request("/api/staff/invitations/accept","POST",{token:s.pendingStaffToken,password:data.password});
   s.pendingStaffToken="";s.page="Dashboard";await refresh();notice("Test staff account activated.");return;
  }
  if(type==="staff-email-pilot"){
   const sent=await request("/api/staff/email-invite-pilot","POST",{password:data.password,role:data.role});
   await refresh();s.managementView="Team Access";draw();
   notice("Resend accepted a "+sent.role+" test invitation for "+sent.email+". Check your Gmail Inbox and Spam, then activate it in a private browser tab. Delivery must still be confirmed.");
   return;
  }
  if(type==="staff-invite"){
   const result=await request("/api/staff/invitations","POST",data);
   await refresh();s.managementView="Team Access";s.newStaffInvite=result;draw();
   notice("Staff invitation created. Copy the private link now; it is shown only once.");return;
  }
  if(type==="toggle-staff"){
   await request("/api/staff/users/"+encodeURIComponent(data.id)+"/"+data.action,"POST",{password:data.password});
   await refresh();notice("Staff account access updated. Disabled accounts are signed out.");return;
  }
  if(type==="revoke-staff"){
   await request("/api/staff/invitations/"+encodeURIComponent(data.id)+"/revoke","POST",{password:data.password});
   s.newStaffInvite=null;await refresh();notice("Staff invitation revoked.");return;
  }
  if(type==="accept-invite"){
   if(data.password!==data.confirmPassword)throw Error("Passwords do not match.");
   if(String(data.password).length<14)throw Error("Choose a password of at least 14 characters.");
   await request("/api/invitations/accept","POST",{token:s.pendingInviteToken,password:data.password});
   s.pendingInviteToken="";await refresh();notice("New test company activated. Its records are separate from other companies.");return;
  }
  if(type==="company-invite"){
   const result=await request("/api/platform/invitations","POST",data);
   await refresh();s.managementView="Companies";s.newInvite=result;draw();
   notice("One-time invitation created. Copy it privately now; the code will not be shown again after you leave.");return;
  }
  if(type==="revoke-company-invite"){
   await request("/api/platform/invitations/"+encodeURIComponent(data.id)+"/revoke","POST",{password:data.password});
   s.newInvite=null;await refresh();notice("Invitation revoked.");return;
  }
  if(type==="login"||type==="setup"){
   const result=await request("/api/"+type,"POST",data);
   if(result.mfaRequired){s.mfaChallenge=result.challenge;authenticatorScreen();notice("");return;}
   await refresh();notice(type==="setup"?"Administrator created and signed in.":"Signed in successfully.");return;
  }
  if(type==="login-mfa"){
   if(!s.mfaChallenge)throw Error("Authenticator challenge expired. Sign in again.");
   await request("/api/login/mfa","POST",{challenge:s.mfaChallenge,code:data.code});
   s.mfaChallenge=null;await refresh();notice("Signed in securely.");return;
  }
  if(type==="mfa-start"){
   s.newMfaSecret=await request("/api/security/mfa/start","POST",{password:data.password});
   draw();notice("Enter the setup key in your authenticator app, then verify a six-digit code.");return;
  }
  if(type==="mfa-confirm"){
   await request("/api/security/mfa/confirm","POST",{code:data.code});
   s.newMfaSecret=null;await refresh();notice("Authenticator verification enabled. Your other sessions were signed out.");return;
  }
  if(type==="mfa-disable"){
   await request("/api/security/mfa/disable","POST",{password:data.password,code:data.code});
   await refresh();notice("Authenticator verification disabled.");return;
  }
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
  if(type==="verify-backup"){
   const verified=await verifyLocalEncryptedBackup(data.backupFile,data.backupPassphrase);
   notice("Encrypted backup verified for "+verified.company+": "+describeBackupCounts(verified.counts)+". File was checked locally, not uploaded.");
   f.reset();return;
  }
  if(type==="pos-download"){
   if(s.account?.role!=="owner")throw Error("Only the company owner can export POS records.");
   if(data.backupPassphrase!==data.confirmPassphrase)throw Error("The POS backup passphrases do not match.");
   if(String(data.backupPassphrase).length<12)throw Error("Use a backup passphrase of at least 12 characters.");
   const records=await request("/api/pos/export");
   await encryptedBackupDownload(records,data.backupPassphrase,"pos");
   notice("Encrypted POS records saved to your device. Keep the file and passphrase secure; independent restoration requires support.");return;
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
  if(type==="change-password"){
   if(data.newPassword!==data.confirmPassword)throw Error("New passwords do not match.");
   if(String(data.newPassword).length<14)throw Error("Password must be at least 14 characters.");
   const result=await request("/api/security/change-password","POST",{currentPassword:data.currentPassword,newPassword:data.newPassword});
   f.reset();await refresh();notice("Account password updated. "+result.otherSessionsRevoked+" other sessions signed out.");return;
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
  if(type==="convert-estimate"||type==="invoice"||type==="payment"){
   // Confirm an acknowledged write independently of subsequent read failures.
   const converting=type==="convert-estimate",paying=type==="payment";
   if(!converting)data.amount=Number(data.amount);
   const endpoint=converting?"/api/invoices/from-estimate":paying?"/api/payments":"/api/invoices";
   await request(endpoint,"POST",data);
   if(converting)s.financeView="Invoices";
   const reads=await Promise.allSettled([
    request("/api/estimates"),request("/api/invoices"),request("/api/payments"),request("/api/reports")
   ]);
   if(reads[0].status==="fulfilled")s.estimates=reads[0].value.items;
   if(reads[1].status==="fulfilled")s.invoices=reads[1].value.items;
   if(reads[2].status==="fulfilled")s.payments=reads[2].value.items;
   if(reads[3].status==="fulfilled")s.financeReport=reads[3].value.totals;
   const complete=reads.every(x=>x.status==="fulfilled");
   s.financeError=complete?"":"Financial records could not all refresh. Your submission succeeded; use Refresh, not Submit again.";
   draw();
   const confirmation=converting?"Invoice created from your accepted estimate.":paying?"Manual payment recorded successfully.":"Invoice saved to your private cloud database.";
   notice(complete?confirmation:confirmation+" Some records could not refresh; select Refresh to retry. Do not submit again.");return;
  }
  if(type==="job"){
   data.amount=Number(data.amount);
   const url=s.editingJob?"/api/jobs/"+encodeURIComponent(s.editingJob):"/api/jobs";
   await request(url,s.editingJob?"PATCH":"POST",data);s.editingJob=null;
   // F1: refresh only affected business records. F2: never report a confirmed write as failed because a follow-up read failed.
   const results=await Promise.allSettled([request("/api/jobs"),request("/api/dashboard")]);
   if(results[0].status==="fulfilled")s.jobs=results[0].value.items;
   if(results[1].status==="fulfilled")s.dashboard=results[1].value;
   draw();
   notice(results.every(x=>x.status==="fulfilled")?"Job saved to your private cloud database.":"Job saved successfully. Some records could not refresh; select Refresh to retry.");return;
  }
 }catch(err){notice(err.message)}finally{if(btn)btn.disabled=false}
});
start();
