import {offlineShopStore,offlineAccess} from './shop-offline-store.js';
import {clearPrivateCache} from './account-storage.js';
import {authCallbackURL} from './auth-callback.js';
const current=()=>location.pathname+location.search+location.hash;
const signInURL=()=>'/auth.html?next='+encodeURIComponent(current());
function hide(){document.body.replaceChildren();}
function redirect(){hide();location.replace(signInURL());}
async function validate(){
 const response=await fetch('/api/shop/session',{cache:'no-store',signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Object.assign(Error('Could not verify account access.'),{status:response.status});
 return response.json();
}
async function enter(){
 if(typeof window==='undefined')return null;
 const callback=authCallbackURL(location.href);
 if(callback){hide();location.replace(callback);return new Promise(()=>{});}
 try{
  const session=await validate();
  if(!session.role){
   await offlineShopStore.clear().catch(()=>{});
   clearPrivateCache();
   sessionStorage.removeItem('cutsheet-account-identity-v1');
   if(location.pathname==='/shop.html')return session; // Shop sign-in form only; no records.
   redirect();return new Promise(()=>{});
  }
  if(session.role!=='shop')await offlineShopStore.clear().catch(()=>{});
  const identity=session.local?'local':session.ownerId||session.id;
  const context=JSON.stringify([identity,session.role,session.id]);
  const previous=sessionStorage.getItem('cutsheet-account-context-v1');
  if(previous!==context)clearPrivateCache();
  sessionStorage.setItem('cutsheet-account-identity-v1',identity);sessionStorage.setItem('cutsheet-account-context-v1',context);
  if(!session.local)localStorage.setItem('cutsheet-active-account-v1',context);
  // A paired iPad must never load owner pages or their browser-saved drafts.
  if(session.role==='shop'&&location.pathname!=='/shop.html'){
   hide();location.replace('/shop.html');return new Promise(()=>{});
  }
  window.addEventListener('storage',e=>{if(e.key==='cutsheet-active-account-v1'&&e.newValue!==context){clearPrivateCache();redirect();}});
  window.addEventListener('pagehide',()=>{document.documentElement.style.visibility='hidden';});
  window.addEventListener('pageshow',async e=>{if(!e.persisted)return;try{const next=await validate();if(!next.role||JSON.stringify([next.local?'local':next.ownerId||next.id,next.role,next.id])!==context){redirect();return;}document.documentElement.style.visibility='';}catch(error){if(![401,403].includes(error.status)&&location.pathname==='/shop.html'&&offlineAccess(await offlineShopStore.get().catch(()=>null)))document.documentElement.style.visibility='';else redirect();}});
  return session;
 }catch(error){
  if([401,403].includes(error.status))await offlineShopStore.clear().catch(()=>{});
  if(![401,403].includes(error.status)&&location.pathname==='/shop.html'){
   const saved=await offlineShopStore.get().catch(()=>null);
   if(offlineAccess(saved)){sessionStorage.setItem('cutsheet-account-identity-v1',saved.session.ownerId||saved.session.id);return {...saved.session,offline:true};}
  }
  clearPrivateCache();document.body.innerHTML='<main style="max-width:440px;margin:15vh auto;padding:24px;font-family:system-ui"><h1>Connection interrupted</h1><p>We could not verify access to your private workspace. Please reconnect and try again.</p><a href="/auth.html">Sign in</a></main>';return new Promise(()=>{});
 }
}
export const accountSession=await enter();
