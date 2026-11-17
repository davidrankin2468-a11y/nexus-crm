(async()=>{
 const out=[];
 const record=(name,pass,detail)=>out.push({name,pass,detail});
 const email="qa+"+Math.random().toString(36).slice(2)+Date.now()+"@example.invalid";
 try{
  const health=await fetch("/api/health",{cache:"no-store"});
  const h=await health.json();
  record("health",health.ok&&h.ok===true,health.status);
  const res=await fetch("/api/interest",{method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",
   body:JSON.stringify({email,company:"QA PRE-LAUNCH TEST",industry:"Painting",note:"Temporary system test",consent:true,website:""})});
  const a=await res.json();
  record("create inquiry",res.status===201&&a.ok===true&&/^[a-f0-9]{48}$/.test(a.receipt||""),res.status+":"+String(a.error||""));
  if(a.receipt){
   const removed=await fetch("/api/interest",{method:"DELETE",headers:{"Content-Type":"application/json"},cache:"no-store",body:JSON.stringify({email,receipt:a.receipt})});
   const b=await removed.json();
   record("withdraw inquiry",removed.ok&&b.removed===true,removed.status+":"+String(b.error||""));
  }
 }catch(e){record("exception",false,String(e))}
 const outEl=document.createElement("pre");outEl.id="qa-check-results";outEl.textContent=JSON.stringify(out);document.body.append(outEl);
})();