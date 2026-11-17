"use strict";
const $=id=>document.getElementById(id);
const form=$("interest-form"),statusEl=$("interest-status"),receiptArea=$("receipt"),receiptValue=$("receipt-value");
const year=$("year");if(year)year.textContent=new Date().getFullYear();
const showStatus=(message,success=false)=>{
 if(!statusEl)return;
 statusEl.textContent=message;statusEl.className="form-status "+(success?"success":"error");
};
if(form){
 form.addEventListener("submit",async event=>{
  event.preventDefault();
  const btn=form.querySelector('button[type="submit"]');
  if(!form.reportValidity())return;
  const d=new FormData(form);
  const body={email:String(d.get("email")||"").trim(),company:String(d.get("company")||"").trim(),
   industry:String(d.get("industry")||"").trim(),note:String(d.get("note")||"").trim(),
   website:String(d.get("website")||""),consent:d.get("consent")==="on"};
  if(btn)btn.disabled=true;
  showStatus("Submitting your request…",true);
  try{
   const response=await fetch("/api/interest",{method:"POST",credentials:"omit",cache:"no-store",
    headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
   const result=await response.json();
   if(!response.ok)throw Error(result.error||"Request could not be saved");
   showStatus(result.message||"Request saved. Thank you.",true);
   if(result.receipt&&receiptValue&&receiptArea){receiptValue.textContent=result.receipt;receiptArea.hidden=false}
   if(!result.existing)form.querySelectorAll("input:not([type=checkbox]),textarea").forEach(el=>{if(el.name!=="website")el.value=""});
  }catch(e){showStatus(e?.message||"Could not submit. Please try again.")}
  finally{if(btn)btn.disabled=false}
 });
}
const copy=$("copy-receipt");
if(copy)copy.addEventListener("click",async()=>{
 const code=receiptValue?.textContent;
 if(!code)return;
 try{await navigator.clipboard.writeText(code);copy.textContent="Copied"}
 catch{copy.textContent="Select and copy the code above"}
});
const withdrawal=$("withdraw-form"),withdrawStatus=$("withdraw-status");
if(withdrawal){
 withdrawal.addEventListener("submit",async event=>{
  event.preventDefault();
  if(!withdrawal.reportValidity())return;
  const btn=withdrawal.querySelector('button[type="submit"]');if(btn)btn.disabled=true;
  const d=new FormData(withdrawal);
  const value={email:String(d.get("email")||"").trim(),receipt:String(d.get("receipt")||"").trim()};
  if(withdrawStatus){withdrawStatus.textContent="Checking your request…";withdrawStatus.className="form-status"}
  try{
   const response=await fetch("/api/interest",{method:"DELETE",credentials:"omit",cache:"no-store",
    headers:{"Content-Type":"application/json"},body:JSON.stringify(value)});
   const result=await response.json();
   if(!response.ok)throw Error(result.error||"Unable to withdraw");
   if(withdrawStatus){withdrawStatus.textContent=result.removed?
     "Your inquiry was withdrawn and its saved details deleted.":
     "No matching inquiry was found. Double-check your email and reference code.";
    withdrawStatus.className="form-status "+(result.removed?"success":"error")}
   if(result.removed)withdrawal.reset();
  }catch(e){if(withdrawStatus){withdrawStatus.textContent=e.message;withdrawStatus.className="form-status error"}}
  finally{if(btn)btn.disabled=false}
 });
}
