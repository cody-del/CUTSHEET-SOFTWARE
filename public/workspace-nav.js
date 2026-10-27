import './display-preferences.js';
import {loadLogo} from './branding.js';
import {cachedShop,shopRequest} from './shop-client.js';
export const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const h=escapeHTML;
export const destinations=[['home','Home','/'],['contacts','Contacts','/contacts.html#contacts'],['quotes','Quotes','/contacts.html#quotes'],['orders','Orders','/contacts.html#orders'],['cutsheets','Cut Sheets','/cutsheets.html'],['production','Production','/owner.html'],['settings','Settings','/settings.html']];
const sidebarKey='cutsheet-sidebar-collapsed';
let sidebarCollapsed=false;
try{sidebarCollapsed=localStorage.getItem(sidebarKey)==='true';}catch{}
const navPaths={
 home:'M3 10 12 3l9 7v10H3V10Z M9 20v-7h6v7',
 contacts:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
 quotes:'M13 3H5v18h14V9 M13 3v6h6L13 3 M8 13h4 M8 17h7',
 orders:'m3 7 9-4 9 4v13H3V7Z M3 7h18 M9 11h6',
 cutsheets:'M8 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M8 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M7.5 7.5 21 21 M7.5 16.5 21 3',
 production:'M3 21V8l6 3V8l6 3V3h4l2 18H3Z M6 16h1 M11 16h1 M16 16h1',
 settings:'M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6',
 logout:'M9 3H3v18h6 M9 12h12 M17 8l4 4-4 4',
 toggle:'M3 4h18v16H3V4Z M8 4v16 M16 9l-3 3 3 3',
 brand:'M3 3h18v18H3V3Z M7 3v18 M11 3v18 M15 3v18 M19 3v18'
};
const navIcon=key=>`<svg class="workspace-nav-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${navPaths[key]}"/></svg>`;
function applySidebarPreference(){
 document.body.classList.toggle('workspace-collapsed',sidebarCollapsed);
 const toggle=document.querySelector('[data-sidebar-toggle]');
 if(toggle){const label=sidebarCollapsed?'Expand menu':'Collapse menu';toggle.setAttribute('aria-expanded',String(!sidebarCollapsed));toggle.setAttribute('aria-label',label);toggle.title=label;toggle.querySelector('.workspace-nav-label').textContent=label;}
}
globalThis.document?.addEventListener('click',event=>{
 if(!event.target.closest?.('[data-sidebar-toggle]'))return;
 sidebarCollapsed=!sidebarCollapsed;try{localStorage.setItem(sidebarKey,String(sidebarCollapsed));}catch{}
 applySidebarPreference();
});
globalThis.addEventListener?.('storage',event=>{if(event.key===sidebarKey){sidebarCollapsed=event.newValue==='true';applySidebarPreference();}});
export function workspaceNav(active,status='Shared workspace'){
 document.body.classList.add('owner-workspace');applySidebarPreference();const logo=loadLogo(),toggleLabel=sidebarCollapsed?'Expand menu':'Collapse menu';
 return `<a class="skip-link" href="#main-content">Skip to content</a><aside class="workspace-nav"><div class="workspace-nav-heading"><a class="workspace-brand" href="/" aria-label="Home" title="Home">${logo?`<img src="${h(logo.data)}" alt="Company logo">`:navIcon('brand')+'<span class="workspace-brand-name">Cut Sheets</span>'}</a><button type="button" class="workspace-nav-toggle" data-sidebar-toggle aria-controls="workspace-main-nav" aria-expanded="${!sidebarCollapsed}" aria-label="${toggleLabel}" title="${toggleLabel}">${navIcon('toggle')}<span class="workspace-nav-label">${toggleLabel}</span></button></div><nav id="workspace-main-nav" aria-label="Main navigation">${destinations.map(([key,label,url])=>`<a href="${url}" title="${label}" ${key===active?'class="selected" aria-current="page"':''}>${navIcon(key)}<span class="workspace-nav-label">${label}</span></a>`).join('')}</nav><div class="workspace-nav-foot"><span id="save-state" role="status">${h(status)}</span><span data-workspace-sync></span><a class="workspace-sign-out" href="/auth.html?mode=logout" title="Sign out">${navIcon('logout')}<span class="workspace-nav-label">Sign out</span></a></div></aside>`;
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
export function installNavigationGuard({isDirty=()=>false,save=async()=>{},discard=()=>{},onRoute=()=>{},saveLabel=()=> 'Save and leave',autoSave=()=>false}={}){
 let dialog=null,previous={url:location.href,index:history.state?.workspaceIndex||0},reverting=false,pending=null;
 history.replaceState({...history.state,workspaceIndex:previous.index},'');
 async function choose(){if(!isDirty())return true;if(dialog?.open)return false;
  if(autoSave()){try{await save();if(!isDirty())return true;}catch{ /* Keep failed changes visible and let the user decide. */ }}
  dialog=document.createElement('dialog');dialog.className='leave-dialog';dialog.innerHTML='<div class="modal-heading"><h2>Save before leaving?</h2></div><div class="modal-body"><p>You have unsaved changes on this page.</p><p class="field-error" role="alert"></p></div><div class="modal-footer"><button class="btn" data-stay>Stay here</button><button class="btn" data-discard>Discard changes</button><button class="btn primary" data-save>'+h(saveLabel())+'</button></div>';document.body.append(dialog);dialog.showModal();
  return new Promise(resolve=>{let done=false;const finish=value=>{if(done)return;done=true;dialog.close();dialog.remove();resolve(value);};dialog.querySelector('[data-stay]').onclick=()=>finish(false);dialog.oncancel=e=>{e.preventDefault();finish(false);};dialog.querySelector('[data-discard]').onclick=()=>{discard();finish(true);};dialog.querySelector('[data-save]').onclick=async()=>{const button=dialog.querySelector('[data-save]');button.disabled=true;try{await save();if(isDirty())throw new Error('There are still unsaved changes. Save them before leaving.');finish(true);}catch(e){dialog.querySelector('[role="alert"]').textContent=e.message;button.disabled=false;}};});
 }
 async function leave(fn){if(await choose())fn();}
 document.addEventListener('click',e=>{const a=e.target.closest('a[href]');if(!a||e.defaultPrevented||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||a.target||a.hasAttribute('download'))return;if(a.getAttribute('href')==='#main-content'){e.preventDefault();const main=document.getElementById('main-content');if(main){main.tabIndex=-1;main.focus();main.scrollIntoView({block:'start'});}return;}const u=new URL(a.href,location.href);if(!['http:','https:'].includes(u.protocol)||u.origin!==location.origin)return;if(u.href===location.href){e.preventDefault();return;}
 const same=u.pathname===location.pathname&&u.search===location.search;
 const target=same&&u.hash?document.getElementById(decodeURIComponent(u.hash.slice(1))):null;
 if(target){e.preventDefault();target.tabIndex=-1;target.focus({preventScroll:true});target.scrollIntoView({block:'start'});return;}
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
