import {loadLogo} from './branding.js';
import {cachedShop,shopRequest} from './shop-client.js';
export const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const h=escapeHTML;
export const destinations=[['home','Home','/'],['contacts','Contacts','/contacts.html#contacts'],['quotes','Quotes','/contacts.html#quotes'],['orders','Orders','/contacts.html#orders'],['cutsheets','Cut Sheets','/cutsheets.html'],['production','Production','/owner.html'],['settings','Settings','/settings.html']];
export function workspaceNav(active,status='Shared workspace'){
 document.body.classList.add('owner-workspace');const logo=loadLogo();
 return `<a class="skip-link" href="#main-content">Skip to content</a><aside class="workspace-nav"><a class="workspace-brand" href="/" aria-label="Home">${logo?`<img src="${h(logo.data)}" alt="Company logo">`:'<span class="brand-symbol">▥</span> Cut Sheets'}</a><nav aria-label="Main navigation">${destinations.map(([key,label,url])=>`<a href="${url}" ${key===active?'class="selected" aria-current="page"':''}>${label}</a>`).join('')}</nav><div class="workspace-nav-foot"><span id="save-state" role="status">${h(status)}</span><span data-workspace-sync></span><a href="/auth.html?mode=logout">Sign out</a></div></aside>`;
}
// Fetch a likely next screen on hover or keyboard focus, without navigating or writing.
const prefetchedPages=new Set();
function preloadLink(event){
 const a=event.target.closest?.('a[href]');if(!a||cachedShop('session')?.role!=='owner')return;
 const url=new URL(a.href,location.href);if(url.origin!==location.origin)return;
 let action,data;
 if(url.pathname==='/contacts.html'){
  const [kind,id]=url.hash.slice(1).split('?')[0].split('/');
  if(['contact','quote','order'].includes(kind)&&id){action='sales-get';data={kind,id};}else action='sales';
 }else if(url.pathname==='/cutsheets.html')action='workspace';
 else if(['/owner.html','/shop.html'].includes(url.pathname))action='dashboard';
 else if(url.pathname==='/editor.html'){
  for(const kind of ['quote','order','draft'])if(url.searchParams.has(kind)){action=kind==='draft'?'draft-get':'sales-get';data={...(kind==='draft'?{}:{kind}),id:url.searchParams.get(kind)};break;}
 }
 if(action)void shopRequest(action,data).catch(()=>{});
 if(['/','/contacts.html','/cutsheets.html','/owner.html','/settings.html','/editor.html'].includes(url.pathname)&&url.pathname!==location.pathname&&!prefetchedPages.has(url.pathname)){
  prefetchedPages.add(url.pathname);const link=document.createElement('link');link.rel='prefetch';link.href=url.pathname;document.head.append(link);
 }
}
globalThis.document?.addEventListener('pointerover',preloadLink,{passive:true});
globalThis.document?.addEventListener('focusin',preloadLink);
export function breadcrumbs(items=[]){return `<nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a>${items.map(([label,url])=>`<span aria-hidden="true">/</span>${url?`<a href="${h(url)}">${h(label)}</a>`:`<span aria-current="page">${h(label)}</span>`}`).join('')}</nav>`;}
export function sessionValue(key,fallback=null){try{return JSON.parse(sessionStorage.getItem('workspace:'+key))??fallback;}catch{return fallback;}}
export function remember(key,value){try{sessionStorage.setItem('workspace:'+key,JSON.stringify(value));}catch{}}
export function safeLocalURL(value,fallback='/'){try{const u=new URL(value,location.origin);return u.origin===location.origin?u.pathname+u.search+u.hash:fallback;}catch{return fallback;}}
export function rememberReturn(id,url,label){remember('return:'+id,{url:safeLocalURL(url),label});}
export function recordBack(id,url,label){const saved=sessionValue('return:'+id);return saved&&saved.url!==location.pathname+location.search+location.hash?saved:{url,label};}
export function backLink(id,url,label){const back=recordBack(id,url,label);return `<a class="workspace-back" href="${h(back.url)}">← ${h(back.label)}</a>`;}
export function restoreScroll(key){requestAnimationFrame(()=>scrollTo(0,sessionValue('scroll:'+key,0)));}
export function keepScroll(key){remember('scroll:'+key,scrollY);}
let guard;
export function navigateState(url,state={}){const index=(history.state?.workspaceIndex||0)+1;history.pushState({...state,workspaceIndex:index},'',safeLocalURL(url));window.dispatchEvent(new Event('workspace-route'));}
export function installNavigationGuard({isDirty=()=>false,save=async()=>{},discard=()=>{},onRoute=()=>{},saveLabel=()=> 'Save and leave'}={}){
 let dialog=null,previous={url:location.href,index:history.state?.workspaceIndex||0},reverting=false,pending=null;
 history.replaceState({...history.state,workspaceIndex:previous.index},'');
 async function choose(){if(!isDirty())return true;if(dialog?.open)return false;
  dialog=document.createElement('dialog');dialog.className='leave-dialog';dialog.innerHTML='<div class="modal-heading"><h2>Save before leaving?</h2></div><div class="modal-body"><p>You have unsaved changes on this page.</p><p class="field-error" role="alert"></p></div><div class="modal-footer"><button class="btn" data-stay>Stay here</button><button class="btn" data-discard>Discard changes</button><button class="btn primary" data-save>'+h(saveLabel())+'</button></div>';document.body.append(dialog);dialog.showModal();
  return new Promise(resolve=>{let done=false;const finish=value=>{if(done)return;done=true;dialog.close();dialog.remove();resolve(value);};dialog.querySelector('[data-stay]').onclick=()=>finish(false);dialog.oncancel=e=>{e.preventDefault();finish(false);};dialog.querySelector('[data-discard]').onclick=()=>{discard();finish(true);};dialog.querySelector('[data-save]').onclick=async()=>{const button=dialog.querySelector('[data-save]');button.disabled=true;try{await save();if(isDirty())throw new Error('There are still unsaved changes. Save them before leaving.');finish(true);}catch(e){dialog.querySelector('[role="alert"]').textContent=e.message;button.disabled=false;}};});
 }
 async function leave(fn){if(await choose())fn();}
 document.addEventListener('click',e=>{const a=e.target.closest('a[href]');if(!a||e.defaultPrevented||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||a.target||a.hasAttribute('download'))return;if(a.getAttribute('href')==='#main-content'){e.preventDefault();const main=document.getElementById('main-content');if(main){main.tabIndex=-1;main.focus();main.scrollIntoView({block:'start'});}return;}const u=new URL(a.href,location.href);if(!['http:','https:'].includes(u.protocol)||u.origin!==location.origin)return;if(u.href===location.href){e.preventDefault();return;}
 const same=u.pathname===location.pathname&&u.search===location.search;
 if(isDirty()||same){e.preventDefault();e.stopImmediatePropagation();leave(()=>{if(same){navigateState(u.pathname+u.search+u.hash);}else location.assign(u.href);});}
 },true);
 const route=()=>{previous={url:location.href,index:history.state?.workspaceIndex||0};onRoute();};
 window.addEventListener('workspace-route',route);
 window.addEventListener('popstate',()=>{const target={url:location.href,index:history.state?.workspaceIndex||0};if(reverting){reverting=false;const fn=pending;pending=null;fn?.();return;}
  if(isDirty()&&target.index!==previous.index){const distance=previous.index-target.index;reverting=true;pending=()=>leave(()=>{reverting=true;pending=route;history.go(-distance);});history.go(distance);return;}route();
 });
 window.addEventListener('beforeunload',e=>{if(isDirty()){e.preventDefault();e.returnValue='';}});
 guard={leave};return guard;
}
export const guardedNavigation=fn=>guard?guard.leave(fn):fn();
