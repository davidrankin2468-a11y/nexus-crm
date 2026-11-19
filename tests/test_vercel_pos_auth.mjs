import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import login from '../api/pos/login.js';
import companies from '../api/pos/companies.js';

const companyA='11111111-1111-4111-8111-111111111111',companyB='22222222-2222-4222-8222-222222222222';
const userId='33333333-3333-4333-8333-333333333333';
const accessToken='test_access_token_123456789012345678901';
const fakeKey='fictional_service_key_only_for_tests';
process.env.SUPABASE_URL='https://example.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_fictional_test_key';
process.env.SUPABASE_SERVICE_ROLE_KEY=fakeKey;
const oldFetch=globalThis.fetch;
const calls=[];
let anonymous=false;
globalThis.fetch=async (url,options)=>{
 const u=new URL(url);
 const b=options.body?JSON.parse(options.body):null;
 calls.push({path:u.pathname,query:u.searchParams,body:b,auth:options.headers.Authorization,apikey:options.headers.apikey});
 let result=null;
 if(u.pathname==='/auth/v1/token'){
  assert.equal(u.searchParams.get('grant_type'),'password');
  result={access_token:accessToken,expires_in:3600,refresh_token:'never_return_refresh'};
 }else if(u.pathname==='/auth/v1/user'){
  result={id:userId,is_anonymous:anonymous};
 }else if(u.pathname==='/rest/v1/nexus_company_members'){
  assert.equal(u.searchParams.get('user_id'),'eq.'+userId);
  result=[{company_id:companyA,role:'owner'},{company_id:companyB,role:'employee'}];
 }else if(u.pathname==='/rest/v1/nexus_companies'){
  result=[{id:companyA,name:'Fictional A'},{id:companyB,name:'Fictional B'}];
 }else{
  return {ok:false,status:404,json:async()=>({error:'not found'})};
 }
 return {ok:true,status:200,json:async()=>result};
};
function res(){return {code:null,headers:{},setHeader(k,v){this.headers[k]=v;return this},status(v){this.code=v;return this},json(v){this.body=v;return this}}}
function req(method='GET',body,withAuth=true){
 return {method,headers:{host:'preview.example.com',origin:'https://preview.example.com','content-type':'application/json',...(withAuth?{authorization:'Bearer '+accessToken}:{})},body};
}

test('invite-only login returns short-lived access token but not refresh token or password',async()=>{
 calls.length=0;
 const r=res();
 await login(req('POST',{email:'OWNER@EXAMPLE.INVALID',password:'fake-password-for-test'}),r);
 assert.equal(r.code,200);
 assert.equal(r.body.access_token,accessToken);
 assert.equal(r.body.expires_in,3600);
 assert.equal('refresh_token' in r.body,false);
 assert.equal(JSON.stringify(r.body).includes('fake-password'),false);
 const backend=calls.find(x=>x.path==='/auth/v1/token');
 assert.equal(backend.body.email,'owner@example.invalid');
 assert.equal(backend.body.password,'fake-password-for-test');
 assert.equal(backend.auth,undefined); // sb_publishable keys are not JWT bearer tokens
 assert.equal(backend.apikey,process.env.SUPABASE_PUBLISHABLE_KEY);
});
test('rejects cross-site credential proxying and invalid credentials body',async()=>{
 const cross=req('POST',{email:'owner@example.invalid',password:'test-password'});
 cross.headers.origin='https://attacker.invalid';
 const denied=res();await login(cross,denied);assert.equal(denied.code,403);
 const invalid=res();await login(req('POST',{email:'not_an_email',password:'x'}),invalid);assert.equal(invalid.code,400);
});
test('anonymous requests never receive company data',async()=>{
 const r=res();await companies(req('GET',null,false),r);assert.equal(r.code,401);
});
test('anonymous Supabase accounts cannot access company records',async()=>{
 anonymous=true;
 const r=res();await companies(req(),r);
 assert.equal(r.code,401);
 anonymous=false;
});
test('company discovery returns only authorized owner/admin memberships',async()=>{
 calls.length=0;
 const r=res();await companies(req(),r);
 assert.equal(r.code,200);
 assert.deepEqual(r.body.items,[{id:companyA,name:'Fictional A',role:'owner'}]);
 assert.equal(calls.some(x=>x.path==='/rest/v1/nexus_company_members'&&x.auth==='Bearer '+fakeKey),true);
});
test('Vercel route for separate secure pilot exists without overriding the original demo',()=>{
 const config=JSON.parse(readFileSync('vercel.json','utf8'));
 const paths=config.rewrites.map(x=>x.source);
 assert.equal(paths.includes('/pos-secure'),true);
 assert.equal(paths.includes('/pos'),true);
 const html=readFileSync('pos-secure/index.html','utf8');
 const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
 assert.equal(scripts.length,1);
 assert.doesNotThrow(()=>new Script(scripts[0][1]));
 assert.equal(html.includes('/api/pos/login'),true);
 assert.equal(html.includes('/api/pos/companies'),true);
 assert.equal(html.includes('Record unpaid sale'),true);
 assert.equal(html.includes('Retry the same sale'),true);
});
test('modern Supabase secret key is never sent as a JWT Bearer header',async()=>{
 const previous=process.env.SUPABASE_SERVICE_ROLE_KEY;
 process.env.SUPABASE_SERVICE_ROLE_KEY='sb_secret_fake_test_key';
 try{
  calls.length=0;const r=res();
  await companies(req(),r);
  assert.equal(r.code,200);
  const x=calls.find(q=>q.path==='/rest/v1/nexus_company_members');
  assert.equal(x.apikey,'sb_secret_fake_test_key');
  assert.equal(x.auth,undefined);
 }finally{process.env.SUPABASE_SERVICE_ROLE_KEY=previous}
});
test.after(()=>{globalThis.fetch=oldFetch;});
