'use strict';
const cloud = (() => {
  const origin = 'https://xmjelakwxnewqalqzktm.supabase.co';
  const apiKey = 'sb_publishable_EpKZ-btnHyHbUP5E0VLMcA_NEzzJF_A';
  const table = '/rest/v1/nexus_phase2_workspaces';
  let session;
  let recoverySession;
  const recoveryKey = 'nexus-password-recovery';
  async function request(path, {method = 'GET', body, token, prefer} = {}) {
    const headers = {apikey:apiKey};
    if (token) headers.Authorization = 'Bearer ' + token;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (prefer) headers.Prefer = prefer;
    const response = await fetch(origin + path, {method,headers,body:JSON.stringify(body),cache:'no-store',redirect:'error'});
    if (response.status === 401 || response.status === 403) throw Error('Sign-in failed or access expired.');
    const text = await response.text();
    let result;
    try { result = text ? JSON.parse(text) : null; } catch { result = null; }
    if (result?.error_code === 'invalid_credentials') throw Error('The Nexus email or password was incorrect.');
    if (response.status === 429) throw Error('Too many attempts. Wait a minute and try again.');
    if (!response.ok) throw Error('Cloud request failed (' + response.status + ').');
    return result;
  }
  function acceptSession(result) {
    session = result;
    session.expires_at ??= Math.floor(Date.now()/1000) + session.expires_in;
  }
  async function signIn(email,password) {
    acceptSession(await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}}));
  }
  async function token() {
    if (!session) throw Error('Sign in to access your cloud workspace.');
    if (session.expires_at <= Math.floor(Date.now()/1000) + 30) {
      acceptSession(await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token}}));
    }
    return session.access_token;
  }
  async function challengePair() {
    const secret = crypto.getRandomValues(new Uint8Array(32));
    const verifier = Array.from(secret, byte => byte.toString(16).padStart(2,'0')).join('');
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));
    const challenge = btoa(String.fromCharCode(...digest)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
    return {verifier,challenge};
  }
  return {
    signedIn: () => Boolean(session),
    signIn,
    async sandboxAction(saleId, action) {
      const response = await fetch('/api/sandbox-checkout',{
        method:'POST',redirect:'error',cache:'no-store',
        headers:{Authorization:'Bearer '+await token(),'Content-Type':'application/json'},
        body:JSON.stringify({saleId,action})
      });
      const result = await response.json().catch(()=>null);
      if (response.status === 404 && !result?.error || response.status === 405 || !result) {
        throw Error('Square Sandbox is unavailable in this preview.');
      }
      if (!response.ok) throw Error(result.error || 'Sandbox request failed.');
      if (!['completed','pending'].includes(result.status)) throw Error('Square Sandbox returned an unknown status.');
      return result.status;
    },
    async register(email,password) {
      const {challenge} = await challengePair();
      const redirect = new URL('/',location.origin);
      redirect.searchParams.set('confirmed','1');
      const result = await request('/auth/v1/signup?redirect_to='+encodeURIComponent(redirect.href),{
        method:'POST',body:{email,password,code_challenge:challenge,code_challenge_method:'s256'}
      });
      return Boolean(result?.access_token);
    },
    async requestReset(email) {
      const pair = await challengePair();
      const redirect = new URL('/?recovery=1',location.origin);
      localStorage.setItem(recoveryKey,JSON.stringify({verifier:pair.verifier,expires:Date.now()+3600000}));
      await request('/auth/v1/recover?redirect_to='+encodeURIComponent(redirect.href),{
        method:'POST',body:{email,code_challenge:pair.challenge,code_challenge_method:'s256'}
      });
    },
    async openReset(code) {
      const saved = JSON.parse(localStorage.getItem(recoveryKey) || 'null');
      if (!saved || saved.expires < Date.now() || !code) throw Error('Request a fresh reset email in this browser.');
      recoverySession = await request('/auth/v1/token?grant_type=pkce',{
        method:'POST',body:{auth_code:code,code_verifier:saved.verifier}
      });
      localStorage.removeItem(recoveryKey);
    },
    async changePassword(password) {
      if (!recoverySession) throw Error('Open a fresh password reset link first.');
      const accessToken = recoverySession.access_token;
      await request('/auth/v1/user',{method:'PUT',token:accessToken,body:{password}});
      recoverySession = null;
      await request('/auth/v1/logout?scope=global',{method:'POST',token:accessToken}).catch(()=>{});
    },
    async signOut() {
      const previous = session;
      session = null;
      if (previous) await request('/auth/v1/logout?scope=local',{method:'POST',token:previous.access_token});
    },
    async list() {
      const rows = await request(table+'?select=owner_id,business_name&order=business_name.asc',{token:await token()});
      return rows.map(row => ({...row,owned:row.owner_id === session.user.id}));
    },
    async read(ownerId) {
      const rows = await request(table+'?owner_id=eq.'+encodeURIComponent(ownerId)+'&select=owner_id,business_name,revision,records',{token:await token()});
      return rows[0] ? {...rows[0],owned:rows[0].owner_id === session.user.id} : null;
    },
    async create(name) {
      await request(table,{method:'POST',token:await token(),body:{business_name:name}});
      return this.read(session.user.id);
    },
    async staff(ownerId) {
      return request('/rest/v1/nexus_phase2_staff?owner_id=eq.'+encodeURIComponent(ownerId)+'&select=email&order=email.asc',{token:await token()});
    },
    async grantStaff(email) {
      await request('/rest/v1/nexus_phase2_staff',{method:'POST',token:await token(),body:{email}});
    },
    async revokeStaff(ownerId,email) {
      await request('/rest/v1/nexus_phase2_staff?owner_id=eq.'+encodeURIComponent(ownerId)+'&email=eq.'+encodeURIComponent(email),{
        method:'DELETE',token:await token()
      });
    },
    async save(workspace, records) {
      if (!workspace.owned) throw Error('Staff access is read-only.');
      const rows = await request(table+'?owner_id=eq.'+encodeURIComponent(workspace.owner_id)+'&revision=eq.'+workspace.revision+'&select=owner_id,business_name,revision,records',{
        method:'PATCH',token:await token(),prefer:'return=representation',body:{records,revision:workspace.revision+1}
      });
      if (!rows.length) throw Error('Another session updated this workspace. Refresh it in Settings and try again.');
      return {...rows[0],owned:true};
    }
  };
})();
