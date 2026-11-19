import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../cloudflare/square-sandbox-connectivity.js',import.meta.url),'utf8');
const {squareSandboxConnectivity}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const request={method:'GET'};
const env={SQUARE_ENVIRONMENT:'sandbox',SQUARE_SANDBOX_ACCESS_TOKEN:'test-token',SQUARE_SANDBOX_LOCATION_ID:'LOC1',SQUARE_SANDBOX_MERCHANT_ID:'MERCHANT1'};
test('rejects incomplete sandbox settings without provider call',async()=>{
 let called=false;const res=await squareSandboxConnectivity({request,env:{...env,SQUARE_ENVIRONMENT:'production'},fetchImpl:async()=>{called=true;throw Error('should not call')}});
 assert.equal(res.status,503);assert.equal(called,false);assert.equal((await res.json()).paymentProcessing,false);
});
test('verifies matching sandbox location and merchant without payment',async()=>{
 const res=await squareSandboxConnectivity({request,env,fetchImpl:async(url,opts)=>{
  assert.match(url,/squareupsandbox/);assert.match(opts.headers.Authorization,/Bearer test-token/);assert.equal(opts.redirect,"manual");
  return new Response(JSON.stringify({locations:[{id:'LOC1',merchant_id:'MERCHANT1'}]}),{status:200});
 }});
 assert.equal(res.status,200);assert.deepEqual(await res.json(),{connected:true,environment:'sandbox',locationVerified:true,merchantVerified:true,paymentProcessing:false});
});
test('rejects merchant mismatch',async()=>{
 const res=await squareSandboxConnectivity({request,env,fetchImpl:async()=>new Response(JSON.stringify({locations:[{id:'LOC1',merchant_id:'OTHER'}]}),{status:200})});
 assert.equal(res.status,409);assert.equal((await res.json()).reason,'SANDBOX_MERCHANT_MISMATCH');
});
test('rejects provider errors without exposing credentials',async()=>{
 const res=await squareSandboxConnectivity({request,env,fetchImpl:async()=>new Response('invalid token',{status:401})});
 assert.equal(res.status,502);const body=await res.text();assert.equal(JSON.parse(body).providerStatus,401);assert.doesNotMatch(body,/test-token/);
});

test('refuses Square redirects without following them',async()=>{
 let calls=0;
 const res=await squareSandboxConnectivity({request,env,fetchImpl:async(url,opts)=>{
  calls+=1;
  assert.equal(opts.redirect,'manual');
  return new Response(null,{status:302,headers:{Location:'https://example.invalid/redirect'}});
 }});
 assert.equal(calls,1);
 assert.equal(res.status,502);
 assert.deepEqual(await res.json(),{connected:false,reason:'SQUARE_REDIRECT_BLOCKED',providerStatus:302,paymentProcessing:false});
});
