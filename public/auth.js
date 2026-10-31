import './display-preferences.js';
import {clearPrivateCache} from './account-storage.js';
const root=document.querySelector('#account-form'),params=new URLSearchParams(location.search);
let mode=params.get('mode')||'login',busy=false;
const safeNext=value=>{try{const url=new URL(value||'/',location.origin);return url.origin===location.origin&&!url.pathname.startsWith('/auth')?url.pathname+url.search+url.hash:'/';}catch{return '/';}};
const next=safeNext(params.get('next'));
const links='<div class="account-links"><a href="/auth.html">Sign in</a><a href="/auth.html?mode=signup">Create account</a><a href="/auth.html?mode=recover">Forgot password?</a></div>';
const email='<div class="field"><label for="email">Email</label><input id="email" type="email" autocomplete="email" maxlength="254" required></div>';
const password=newPassword=>`<div class="field"><label for="password">${newPassword?'Create a password':'Password'}</label><input id="password" type="password" autocomplete="${newPassword?'new-password':'current-password'}" ${newPassword?'minlength="12"':''} maxlength="128" required>${newPassword?'<small>At least 12 characters.</small>':''}</div>`;
async function request(action,data){const response=await fetch('/api/auth/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),cache:'no-store',signal:AbortSignal.timeout(25000)});const result=await response.json();if(!response.ok)throw Error(result.error||'Please try again.');return result;}
function resetCache(){clearPrivateCache();sessionStorage.removeItem('cutsheet-account-identity-v1');localStorage.removeItem('cutsheet-active-account-v1');localStorage.setItem('cutsheet-cache-revision-v1',JSON.stringify({id:crypto.randomUUID(),auth:true,at:Date.now()}));}
function success(){resetCache();location.replace(next);}
function render(){
 const title={login:'Welcome back',signup:'Create your account',recover:'Reset your password',reset:'Choose a new password'}[mode]||'Welcome back';
 root.innerHTML=`<h1>${title}</h1><p>${mode==='signup'?'Enter your access code to create a private workspace. Your customers and jobs belong only to your account.':mode==='recover'?'We’ll send a password reset link to your email.':mode==='reset'?'Set a new password for your account.':'Sign in to your private Cut Sheets workspace.'}</p><form id="auth-form">${mode==='signup'?'<div class="field"><label for="access-code">Access code</label><input id="access-code" type="password" autocomplete="off" maxlength="256" required></div>':''}${mode==='reset'?'':email}${mode==='recover'?'':password(mode==='signup'||mode==='reset')}<p role="alert" id="account-error"></p><button class="btn primary">${{signup:'Create account',recover:'Send reset link',reset:'Save password'}[mode]||'Sign in'}</button><p role="status" id="account-status"></p></form>${links}`;
 root.querySelector('form').onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;const button=e.target.querySelector('button');button.disabled=true;document.querySelector('#account-error').textContent='';try{
  const data={email:document.querySelector('#email')?.value,password:document.querySelector('#password')?.value,accessCode:document.querySelector('#access-code')?.value};
  const result=await request(mode==='reset'?'password':mode,data);
  if(mode==='recover'){document.querySelector('#account-status').textContent=result.message;return;}
  if(mode==='signup'&&!result.signedIn){e.target.reset();document.querySelector('#account-status').textContent='Check your email to confirm your account, then sign in.';return;}
  if(mode==='reset'){resetCache();root.innerHTML='<h1>Password saved</h1><p>Your new password is ready to use.</p><a class="btn primary" id="open-workspace">Open workspace</a>';document.querySelector('#open-workspace').href=next;return;}
  success();
 }catch(error){document.querySelector('#account-error').textContent=error.name==='TimeoutError'?'The request timed out. Check your connection and try again.':error.message;}finally{busy=false;button.disabled=false;}};
}
if(!['login','signup','recover','reset','logout'].includes(mode))mode='login';
const fragment=new URLSearchParams(location.hash.slice(1));
if(fragment.has('error')||fragment.has('error_code')){
 history.replaceState(null,'',location.pathname+'?mode=recover');mode='recover';render();
 document.querySelector('#account-error').textContent='This link is invalid or expired. Request a new password reset link.';
}else if(fragment.has('access_token')){
 const tokens={accessToken:fragment.get('access_token'),refreshToken:fragment.get('refresh_token')};
 const recovery=fragment.get('type')==='recovery'||mode==='reset';
 const callbackURL=new URL(location.href);callbackURL.hash='';if(recovery)callbackURL.searchParams.set('mode','reset');
 history.replaceState(null,'',callbackURL.pathname+callbackURL.search);root.innerHTML='<h1>Confirming your account…</h1>';
 try{await request('complete',tokens);resetCache();if(recovery){mode='reset';render();}else success();}catch(e){mode='login';render();document.querySelector('#account-error').textContent=e.message;}
}else if(mode==='logout'){
 root.innerHTML='<h1>Signing out…</h1>';try{await request('logout',{});resetCache();location.replace('/auth.html');}catch(e){mode='login';render();document.querySelector('#account-error').textContent=e.message;}
}else render();
