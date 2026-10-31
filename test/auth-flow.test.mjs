import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {randomUUID} from 'node:crypto';
import {authCallbackURL} from '../public/auth-callback.js';

const origin='https://app.example.test';
const recovery='#access_token=test-only-access&refresh_token=test-only-refresh&type=recovery';
const withoutImports=source=>source.replace(/^import .*;\n/gm,'');
const guard=withoutImports(await readFile(new URL('../public/auth-guard.js',import.meta.url),'utf8')).replace('export const accountSession=await enter();','enter();');
const authSource=withoutImports(await readFile(new URL('../public/auth.js',import.meta.url),'utf8'));

test('home and deep-page recovery links stay on the same origin and route to the password form',()=>{
 for(const path of ['/', '/owner.html?job=example', '/shop.html', '/contacts.html']){
  const target=new URL(authCallbackURL(origin+path+recovery));
  assert.equal(target.origin,origin);assert.equal(target.pathname,'/auth.html');
  assert.equal(target.search,'?mode=reset');assert.equal(target.hash,recovery);
  assert.ok(!target.search.includes('test-only-access'));
 }
});

test('normal app navigation and the auth page do not create redirect loops',()=>{
 for(const path of ['/', '/owner.html?job=example', '/contacts.html#quotes', '/editor.html#tab=openings&opening=one', '/auth.html?mode=reset'+recovery]){
  assert.equal(authCallbackURL(origin+path),null);
 }
 const confirmation=new URL(authCallbackURL(origin+'/#access_token=test-only&type=signup'));
 assert.equal(confirmation.pathname,'/auth.html');assert.equal(confirmation.search,'');
});

test('recovery routing runs before session lookup, even when a previous owner session would open the dashboard',()=>{
 const location=new URL(origin+recovery);let destination,hidden=false,sessionLookups=0;
 location.replace=value=>{destination=value;};
 runInNewContext(guard,{
  window:{},location,authCallbackURL,
  document:{body:{replaceChildren(){hidden=true;}}},
  fetch:async()=>{sessionLookups++;return {ok:true,json:async()=>({role:'owner'})};},
  clearPrivateCache(){},AbortSignal,
 });
 assert.equal(destination,origin+'/auth.html?mode=reset'+recovery);
 assert.equal(hidden,true);assert.equal(sessionLookups,0);
});

async function authPage(path,{completeError=null,passwordError=null}={}){
 const location=new URL(origin+path),requests=[],navigations=[],historyURLs=[];
 location.replace=value=>navigations.push(value);
 const button={disabled:false},form={querySelector:()=>button};
 const root={innerHTML:'',querySelector:()=>form};
 const fields={
  '#account-form':root,'#password':{value:'test-only-new-password-123'},
  '#account-error':{textContent:''},'#account-status':{textContent:''},'#open-workspace':{},
 };
 const context={
  URL,URLSearchParams,AbortSignal,crypto:{randomUUID},location,
  history:{replaceState(_state,_title,value){historyURLs.push(value);location.href=new URL(value,location).href;}},
  document:{querySelector:selector=>fields[selector]||null},
  sessionStorage:{removeItem(){}},localStorage:{removeItem(){},setItem(){}},clearPrivateCache(){},
  fetch:async(url,options)=>{
   requests.push({url,data:JSON.parse(options.body)});
   const error=url.endsWith('/complete')?completeError:passwordError;
   return {ok:!error,json:async()=>error?{error}:{ok:true}};
  },
 };
 await runInNewContext('(async()=>{'+authSource+'})()',context);
 return {root,fields,requests,navigations,historyURLs,location,submit:()=>form.onsubmit({preventDefault(){},target:form})};
}

test('a verified recovery link requires a new password and removes tokens from browser history',async()=>{
 const page=await authPage('/auth.html'+recovery);
 assert.match(page.root.innerHTML,/Choose a new password/);
 assert.match(page.root.innerHTML,/Save password/);
 assert.equal(page.requests.length,1);assert.equal(page.requests[0].url,'/api/auth/complete');
 assert.equal(page.requests[0].data.accessToken,'test-only-access');
 assert.equal(page.location.hash,'');assert.equal(page.location.search,'?mode=reset');
 assert.deepEqual(page.navigations,[]);
 assert.ok(page.historyURLs.every(url=>!url.includes('test-only')));
 const refreshed=await authPage(page.location.pathname+page.location.search);
 assert.match(refreshed.root.innerHTML,/Choose a new password/);
});

test('saving a password shows confirmation only after the server succeeds',async()=>{
 const page=await authPage('/auth.html?mode=reset&next=%2Fowner.html'+recovery);
 await page.submit();
 assert.equal(page.requests.at(-1).url,'/api/auth/password');
 assert.equal(page.requests.at(-1).data.password,'test-only-new-password-123');
 assert.match(page.root.innerHTML,/Password saved/);
 assert.equal(page.fields['#open-workspace'].href,'/owner.html');
 assert.deepEqual(page.navigations,[]);
});

test('password-save failures keep the form visible and do not claim success',async()=>{
 const page=await authPage('/auth.html?mode=reset',{passwordError:'Sign in using the password reset link first.'});
 await page.submit();
 assert.match(page.root.innerHTML,/Choose a new password/);
 assert.doesNotMatch(page.root.innerHTML,/Password saved/);
 assert.match(page.fields['#account-error'].textContent,/Sign in using the password reset link/);
 assert.deepEqual(page.navigations,[]);
});

test('expired recovery links show a retry screen and never load the workspace',async()=>{
 const path='/#error=access_denied&error_code=otp_expired&error_description=Expired';
 const target=new URL(authCallbackURL(origin+path));
 const page=await authPage(target.pathname+target.search+target.hash);
 assert.match(page.root.innerHTML,/Reset your password/);
 assert.match(page.fields['#account-error'].textContent,/invalid or expired/);
 assert.equal(page.requests.length,0);assert.deepEqual(page.navigations,[]);assert.equal(page.location.hash,'');
 const rejected=await authPage('/auth.html'+recovery,{completeError:'This confirmation link is invalid or expired.'});
 assert.match(rejected.fields['#account-error'].textContent,/invalid or expired/);
 assert.deepEqual(rejected.navigations,[]);
});

test('normal confirmation links still finish sign-in; password success cannot link to a different site',async()=>{
 const page=await authPage('/auth.html#access_token=test-only-access&refresh_token=test-only-refresh&type=signup');
 assert.deepEqual(page.navigations,['/']);
 const reset=await authPage('/auth.html?mode=reset&next=https%3A%2F%2Fevil.example'+recovery);
 await reset.submit();assert.equal(reset.fields['#open-workspace'].href,'/');
});
