import {accountStorage,accountFetch} from './account-storage.js';
import './auth-guard.js';
import {financialMetrics} from './order-ui.js';
import {workspaceNav,escapeHTML as h,sessionValue,remember,keepScroll,restoreScroll,rememberReturn,installNavigationGuard,guardedNavigation} from './workspace-nav.js';
import {shopRequest,cachedShop,warmWorkspace} from './shop-client.js';
import {startWorkspaceSync,sameSnapshot} from './workspace-sync.js';
import {loadLogo,saveLogo,readLogoFile} from './branding.js';
import {getTextSize,saveTextSize,textSizeOptions} from './display-preferences.js';
import {production,schedule} from './shop-state.js';
import {quoteBuilderURL} from './quote-product.js';
const $=s=>document.querySelector(s),KEY='shutter-factory-workshop-v1',params=new URLSearchParams(location.search);
if(location.pathname==='/'&&(params.has('quote')||params.has('order')))location.replace('/editor.html'+location.search+location.hash);
const page=location.pathname.includes('cutsheets')?'cutsheets':location.pathname.includes('settings')?'settings':'home',title={home:'Home',cutsheets:'Cut Sheets',settings:'Settings'}[page];
let draftDirty=false,draftSave=null;
let companyDirty=false,companyDraft=null;
let session,data=null,error='',search=sessionValue('cutsheet-search',''),filter=sessionValue('cutsheet-filter','all'),legacy=[],imports={},busy=false;
const label=c=>[c?.firstName,c?.lastName].filter(Boolean).join(' '),money=n=>n==null?'Not priced':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100);
let migrationCache={};try{migrationCache=JSON.parse(accountStorage.getItem('cut-sheet-imports-v1'))||{};}catch{}
async function legacySignature(job){const keys=['id','name','number','customer','notes','due','archived','openings'],value=Object.fromEntries(keys.map(k=>[k,job[k]]));const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');}
async function restoreImports(){imports={};await Promise.all(legacy.map(async(j,i)=>{const key=await legacySignature(j),record=migrationCache[key];if(record&&data.workspace.cutSheets.some(x=>x.id===record.id))imports[i]={...record,existing:true};}));}
const sheetURL=x=>'/editor.html?'+x.kind+'='+encodeURIComponent(x.id);
function notify(message){$('#toast').textContent=message;$('#toast').classList.add('show');setTimeout(()=>$('#toast').classList.remove('show'),5000);}
function browserData(){try{const raw=accountStorage.getItem(KEY);if(!raw)return {schema:1,jobs:[],units:'in',outputUnits:'mm'};const value=JSON.parse(raw);if(value.schema!==1||!Array.isArray(value.jobs))throw Error();return value;}catch{throw new Error('The browser backup could not be read. Export its original data before replacing it.');}}
function heading(sub='',actions=''){return `<div class="page-heading"><div><h1>${title}</h1>${sub?`<p class="subheading">${sub}</p>`:''}</div>${actions?`<div class="btn-row">${actions}</div>`:''}</div>`;}
function render(){document.title=page==='cutsheets'?title:title+' · Cut Sheets';$('#workspace-root').innerHTML=workspaceNav(page,session?.local?'Local preview':data?'Shared workspace':'Connecting…')+`<main class="content" id="main-content">${error?`<div class="error-box" role="alert">${h(error)} <button class="btn" id="retry">Retry</button></div>`:''}${!session?'<p>Loading workspace…</p>':session.role!=='owner'?`<section class="workspace-empty"><h1>${session.role==='shop'?'Shop iPad':'Welcome'}</h1><p>${session.role==='shop'?'This device is connected for shop work.':'Open owner access to connect to your workspace.'}</p><a class="btn primary" href="${session.role==='shop'?'/shop.html':'/owner.html'}">${session.role==='shop'?'Open Shop Floor':'Owner access'}</a></section>`:!data?'<p>Loading saved work…</p>':page==='home'?home():page==='cutsheets'?sheets():settings()}</main>`;bind();}
function row(url,name,sub,right='',id=''){return `<a class="workspace-row" href="${h(url)}" ${id?`data-record="${h(id)}"`:''}><div><strong>${h(name)}</strong><small>${h(sub)}</small></div><span>${h(right)} →</span></a>`;}
function home(){
 const {sales,board,workspace}=data,quotes=sales.quotes.filter(q=>q.status!=='ordered');
 const recent=[...quotes.map(q=>({id:q.id,at:q.updatedAt,url:q.status==='draft'?quoteBuilderURL(q):'/contacts.html#quote/'+q.id,name:label(sales.contacts.find(c=>c.id===q.contactId))||q.name,sub:q.number+' · '+q.name,next:q.status==='draft'?'Continue quote':'Review proposal'})),
  ...workspace.cutSheets.filter(x=>!x.archived).map(x=>({id:x.id,at:x.updatedAt,url:x.released?'/owner.html?job='+x.id:sheetURL(x),name:x.customer||x.name,sub:x.number+' · '+x.name,next:x.released?(x.stage==='Complete'?'View completed job':x.stage==='Waiting'?'Open checklist':'Continue '+x.stage.toLowerCase()):'Continue cut sheet'})),
  ...sales.orders.filter(o=>!o.financials?.confirmed||!o.manufacturingOpeningCount).map(o=>({id:o.id,at:o.updatedAt,url:'/contacts.html#order/'+o.id,name:label(sales.contacts.find(c=>c.id===o.contactId))||o.name,sub:o.number+' · '+o.name,next:o.financials?.confirmed?'View order':'Confirm sale & payment'}))];
 const unique=[...new Map(recent.map(x=>[x.id,x])).values()].sort((a,b)=>b.at-a.at).slice(0,8);
 const attention=board.jobs.filter(j=>schedule(j,Date.now()).tone==='attention').length+(board.pendingOrders||[]).filter(o=>o.readiness?.status==='blocked').length;
 return heading()+`<section class="workflow-starts" aria-label="Start or continue work">
 <article><h2>New quote</h2><p>Choose a customer, add openings, and price the job.</p><a class="btn primary" href="/contacts.html#quotes?new=1">Create Quote</a></article>
 <article><h2>Make a cut sheet</h2><p>Enter ShutterSmart measurements for a job you already have.</p><button class="btn primary" id="new-draft">Create Cut Sheet</button></article>
 <article><h2>Continue a job</h2><p>Pick up a quote, cut sheet, or shop job where you left off.</p><a class="btn" href="#recent-work">Find my job</a></article></section>
 ${attention?`<a class="home-attention" href="/owner.html?filter=attention">${attention} ${attention===1?'job needs':'jobs need'} attention →</a>`:''}
 <section class="workspace-panel" id="recent-work" tabindex="-1"><header><h2>Recent work</h2><a href="/owner.html">Production →</a></header>${unique.map(x=>row(x.url,x.name,x.sub,x.next,x.id)).join('')||'<div class="workspace-empty">Start a quote or cut sheet above. Your saved work will appear here.</div>'}</section>
 <details class="home-summary"><summary>Sales summary</summary>${financialMetrics(sales.financials||{})}</details>`;
}
function sheets(){return heading('Prepare and print ShutterSmart jobs. Send to Production for digital check-off.','<button class="btn primary" id="new-draft">Create Cut Sheet</button>')+`<div class="workspace-toolbar"><input id="sheet-search" aria-label="Search cut sheets" placeholder="Search job, customer, or number…" value="${h(search)}"><select id="sheet-filter" aria-label="Filter cut sheets">${[['all','All cut sheets'],['draft','Standalone drafts'],['awaiting','Orders to prepare'],['released','Sent to Production'],['archived','Archived']].map(([v,l])=>`<option value="${v}" ${filter===v?'selected':''}>${l}</option>`).join('')}</select></div><div id="sheet-results">${sheetRows()}</div>`;}
function sheetRows(){const list=data.workspace.cutSheets.filter(x=>(filter==='archived'?x.archived:!x.archived)&&(filter==='all'||filter==='archived'||filter==='draft'&&x.kind==='draft'&&!x.released||filter==='awaiting'&&x.kind==='order'&&!x.released||filter==='released'&&x.released)&&[x.name,x.number,x.customer].join(' ').toLowerCase().includes(search.toLowerCase()));return list.length?`<div class="sales-table"><table><thead><tr><th>JOB</th><th>SOURCE</th><th>OPENINGS</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>${list.map(x=>`<tr><td><a href="${h(sheetURL(x))}">${h(x.number)} · ${h(x.name)}</a><small>${h(x.customer)}</small></td><td>${x.kind==='order'?'From order':x.kind==='draft'?'Standalone':'Production job'}</td><td>${x.openingCount}</td><td>${h(x.stage==='Waiting'?'Sent · waiting to cut':x.stage)}</td><td><a href="${h(sheetURL(x))}">${x.released?'View / edit cut sheet':'Prepare cut sheet'} →</a>${x.released?`<small><a href="/owner.html?job=${h(x.id)}">Open Digital Checklist →</a></small>`:''}</td></tr>`).join('')}</tbody></table></div>`:'<div class="workspace-empty">No cut sheets match this view. Create a draft or convert a ShutterSmart quote to an order.</div>';}
function migration(){if(!legacy.length)return '';return `<section class="migration-panel"><h2>Bring in browser drafts</h2><p>These jobs were saved in this browser. Import a shared copy to open it on other devices. Original browser copies stay intact.</p>${legacy.map((j,i)=>{const r=imports[i];return `<div class="migration-item"><div><strong>${h(j.number)} · ${h(j.name)}</strong><small>${j.openings?.length||0} openings${j.archived?' · Archived':''}</small>${r?.error?`<small class="migration-error">${h(r.error)}</small>`:''}</div>${r?.id?`<a class="btn" href="${h(sheetURL(r))}">${r.existing?'Already shared':'Imported'} →</a>`:`<button class="btn" data-import="${i}" ${busy?'disabled':''}>Import copy</button>`}</div>`;}).join('')}<p>For drafts on another device, export a browser backup from Settings there, then import it here.</p></section>`;}
function settings(){
 const prefs=browserData();
 if(!companyDirty)companyDraft={...data.company,logo:data.company.version?data.company.logo:loadLogo()};
 const logo=companyDraft.logo;
 return heading()+`<section class="display-settings" aria-label="Display settings">
  <div><h2>Display</h2><p>Screen text · saves automatically on this device.</p></div>
  <fieldset class="text-size-options"><legend>Text size</legend><div>${textSizeOptions.map(option=>`<label><input type="radio" name="text-size" value="${option.value}" ${getTextSize()===option.value?'checked':''}><span>${option.label}</span></label>`).join('')}</div></fieldset>
 </section><section class="settings-section company-settings">
  <h2>Company details</h2><p>Used on order PDFs and proposals.</p>
  <form id="company-form">
   <div class="company-logo-field">
    ${logo?`<img class="logo-preview" src="${h(logo.data)}" alt="Company logo">`:''}
    <input type="file" id="logo-file" accept="image/png,image/jpeg,image/webp" hidden>
    <div class="btn-row"><button type="button" class="btn" id="upload-logo">${logo?'Replace logo':'Upload logo'}</button>${logo?'<button type="button" class="text-btn" id="remove-logo">Remove</button>':''}</div>
   </div>
   <div class="fields company-fields">
    <div class="field wide"><label for="company-name">Business name</label><input id="company-name" data-company="name" required maxlength="120" autocomplete="organization" value="${h(companyDraft.name)}"></div>
    <div class="field wide"><label for="company-address">Company address</label><textarea id="company-address" data-company="address" rows="2" maxlength="650" autocomplete="street-address">${h(companyDraft.address)}</textarea></div>
    <div class="field"><label for="company-phone">Phone</label><input id="company-phone" data-company="phone" type="tel" maxlength="80" autocomplete="tel" value="${h(companyDraft.phone)}"></div>
    <div class="field"><label for="company-email">Email</label><input id="company-email" data-company="email" type="email" maxlength="254" autocomplete="email" value="${h(companyDraft.email)}"></div>
    <div class="field wide"><label for="company-website">Website</label><input id="company-website" data-company="website" maxlength="200" value="${h(companyDraft.website)}"></div>
    <div class="field wide"><label for="company-terms">Terms and conditions</label><textarea id="company-terms" data-company="terms" rows="6" maxlength="12000">${h(companyDraft.terms)}</textarea><span class="field-help">Printed as entered on orders and proposals.</span></div>
   </div>
   <p class="field-error" id="company-error" role="alert"></p>
   <div class="settings-actions"><button class="btn primary" id="save-company" ${busy?'disabled':''}>Save company details</button><span class="company-save-status" role="status">${companyDirty?'Unsaved changes':''}</span></div>
  </form>
 </section><div class="workspace-settings">
  <section class="settings-section">
   <h2>Product pricing</h2><p>Square-foot rates and minimums for each product.</p>
   <div class="settings-actions"><a class="btn" href="/contacts.html#pricing">Manage pricing</a></div>
  </section>
  <section class="settings-section">
   <h2>Shop devices</h2><p>Connect and manage the shop’s iPads.</p>
   <div class="settings-actions"><a class="btn" href="/owner.html?settings=devices">Manage shop access</a></div>
  </section>
  <section class="settings-section">
   <h2>Measurements & printing</h2><p>Unit preferences save automatically on this browser.</p>
   <div class="settings-fields">
    <div class="field"><label for="input-unit">Input measurements</label><select id="input-unit">${[['in','Inches · decimals or fractions'],['mm','Millimeters']].map(([v,l])=>`<option value="${v}" ${prefs.units===v?'selected':''}>${l}</option>`).join('')}</select></div>
    <div class="field"><label for="output-unit">Cut sheet dimensions</label><select id="output-unit">${[['mm','Millimeters · 2 decimals'],['in','Decimal inches · 4 decimals']].map(([v,l])=>`<option value="${v}" ${prefs.outputUnits===v?'selected':''}>${l}</option>`).join('')}</select></div>
   </div>
   <p class="settings-print-note">US Letter · portrait · one opening per page.<br>Cut lengths do not include saw-kerf allowance.</p>
  </section>
 </div>
 <section class="settings-section">
  <h2>Company backup</h2><p>Download customers, quotes, orders, cut sheets, production progress and company settings. Keep this file in a private, backed-up folder.</p>
  <div class="settings-actions"><button class="btn" id="company-backup">Download company backup</button></div>
  <p class="field-help">Passwords and shop-device connections are not included. This is a manual backup.</p>
 </section>
 <details class="settings-backups"><summary>Older browser drafts</summary><div class="settings-backups-body">
  <p>Import or export older drafts saved only on this browser. This backup does not include shared contacts, quotes, orders, or production progress.</p>
  <div class="settings-actions"><button class="btn" id="import-file">Import browser backup</button><button class="btn" id="backup">Export browser backup</button></div>
 ${migration()}</div></details>`;
}
const canSync=()=>!busy&&!draftDirty&&!companyDirty&&!document.querySelector('dialog[open]')&&!document.activeElement?.matches('input,textarea,select');
function cachedPage(){
 if(session?.role!=='owner')return null;
 if(page==='settings')return cachedShop('company-get');
 if(page==='cutsheets'){const workspace=cachedShop('workspace');return workspace?{workspace}:null;}
 const sales=cachedShop('sales'),board=cachedShop('dashboard'),workspace=cachedShop('workspace');return sales&&board&&workspace?{sales,board,workspace}:null;
}
async function load({quiet=false,force=false}={}){
 if(!quiet){session=cachedShop('session')||session;data=data||cachedPage();render();}
 try{
  const nextSession=await shopRequest('session',undefined,{force});
  if(nextSession.role!=='owner'){session=nextSession;data=null;error='';render();return;}
  const next=page==='settings'?await shopRequest('company-get',undefined,{force}):page==='cutsheets'?{workspace:await shopRequest('workspace',undefined,{force})}:await Promise.all([shopRequest('sales',undefined,{force}),shopRequest('dashboard',undefined,{force}),shopRequest('workspace',undefined,{force})]).then(([sales,board,workspace])=>({sales,board,workspace}));
  if(quiet&&!canSync())return;
  const changed=!sameSnapshot(data,next)||!sameSnapshot(session,nextSession)||!!error;
  session=nextSession;data=next;error='';
  if(page==='settings'){if(!quiet&&!legacy.length)legacy=browserData().jobs;if(legacy.length){data.workspace=await shopRequest('workspace',undefined,{force});await restoreImports();}}
  if(!quiet||changed)render();
  if(!quiet){restoreScroll(page);void warmWorkspace();}
 }catch(e){if(quiet)throw e;error=e.message;render();}
}
async function newDraft(){
 let contacts;busy=true;
 try{contacts=(await shopRequest('sales')).contacts;}catch(e){notify(e.message);return;}finally{busy=false;}
 const d=$('#workspace-dialog');
 d.innerHTML=`<div class="modal-heading"><h2>Create Cut Sheet</h2></div><form id="draft-form"><div class="modal-body"><p class="field-help">A standalone ShutterSmart job. Save or print it, then optionally send it to Production.</p><div class="fields"><div class="field wide"><label for="draft-name">Job name</label><input id="draft-name" required maxlength="100" autofocus></div><div class="field"><label for="draft-contact">Link to contact (optional)</label><select id="draft-contact"><option value="">No linked contact</option>${contacts.map(c=>`<option value="${h(c.id)}">${h(label(c))}</option>`).join('')}</select></div><div class="field wide"><label for="draft-customer">Customer name (optional)</label><input id="draft-customer" maxlength="120"></div></div><p class="field-error" id="draft-error" role="alert"></p></div><div class="modal-footer"><button class="btn" type="button" id="cancel-draft">Cancel</button><button class="btn primary">Create Cut Sheet</button></div></form>`;
 d.showModal();draftDirty=false;
 $('#draft-contact').onchange=()=>{const c=contacts.find(c=>c.id===$('#draft-contact').value);$('#draft-customer').readOnly=!!c;if(c)$('#draft-customer').value=label(c);draftDirty=true;};
 const close=()=>guardedNavigation(()=>{draftDirty=false;d.close();});$('#cancel-draft').onclick=close;d.oncancel=e=>{if(draftDirty){e.preventDefault();close();}};
 const id=crypto.randomUUID();
 draftSave=async()=>{if(!$('#draft-form').reportValidity())throw new Error('Enter a job name.');await shopRequest('draft-save',{id,version:0,fields:{name:$('#draft-name').value,contactId:$('#draft-contact').value,customer:$('#draft-customer').value,openings:[]}});draftDirty=false;d.close();};
 $('#draft-form').oninput=()=>{draftDirty=true;};$('#draft-form').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('.primary');b.disabled=true;try{await draftSave();location.href='/editor.html?draft='+id;}catch(e){$('#draft-error').textContent=e.message;b.disabled=false;}};
}
async function importDraft(index){busy=true;render();try{imports[index]=await shopRequest('draft-import',{job:legacy[index]});migrationCache[await legacySignature(legacy[index])]=imports[index];try{accountStorage.setItem('cut-sheet-imports-v1',JSON.stringify(migrationCache));}catch{}data.workspace=await shopRequest('workspace');notify(imports[index].existing?'This copy is already shared.':'Shared copy imported. Original browser draft kept.');}catch(e){imports[index]={error:e.message};}finally{busy=false;render();}}
function importFile(){const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.onchange=async()=>{try{const f=input.files[0];if(!f)return;if(f.size>5e6)throw new Error('Choose a backup smaller than 5 MB.');const backup=JSON.parse(await f.text());if(backup.schema!==1||!Array.isArray(backup.jobs)||backup.jobs.length>500||backup.jobs.some(j=>!j||typeof j.name!=='string'||typeof j.number!=='string'||!Array.isArray(j.openings)))throw new Error('Choose a Cut Sheets browser backup.');legacy=backup.jobs;data.workspace=await shopRequest('workspace');await restoreImports();render();notify('Backup opened. Import the jobs you want to share.');}catch(e){notify(e.message);}};input.click();}
async function saveCompany(){
 if(!$('#company-form').reportValidity())throw new Error('Check the company details above.');
 busy=true;$('#save-company').disabled=true;
 try{
  // Older browser-only logos can be larger than the shared settings limit.
  if(companyDraft.logo?.data.length>350000){
   const bytes=Uint8Array.from(atob(companyDraft.logo.data.split(',')[1]),c=>c.charCodeAt(0));
   companyDraft.logo=await readLogoFile(new File([bytes],companyDraft.logo.name,{type:'image/png'}),{maxDataLength:350000});
  }
  const result=await shopRequest('company-save',{version:data.company.version,fields:companyDraft});
  data=result;companyDirty=false;companyDraft=null;
  try{saveLogo(result.company.logo);}catch{}
  render();notify('Company details saved.');
 }finally{busy=false;if($('#save-company'))$('#save-company').disabled=false;}
}
function bind(){
 $('#company-backup')?.addEventListener('click',async e=>{const button=e.currentTarget;button.disabled=true;try{
  if(companyDirty)throw Error('Save company details before downloading a backup.');
  const response=await accountFetch('/api/shop/workspace-backup',{cache:'no-store',signal:AbortSignal.timeout(30000)});
  if(!response.ok){const result=await response.json();throw Error(result.error||'Could not download the company backup.');}
  const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download='cut-sheets-company-backup-'+new Date().toISOString().slice(0,10)+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);notify('Company backup downloaded.');
 }catch(error){notify(error.message);}finally{button.disabled=false;}});
 document.querySelectorAll('input[name="text-size"]').forEach(input=>input.addEventListener('change',()=>{if(input.checked)notify(saveTextSize(input.value)?'Text size saved.':'Text size changed for this visit. Browser storage is unavailable.');}));
 $('#retry')?.addEventListener('click',()=>load({force:true}));$('#new-draft')?.addEventListener('click',newDraft);$('#import-file')?.addEventListener('click',importFile);
 $('#sheet-search')?.addEventListener('input',e=>{search=e.target.value;remember('cutsheet-search',search);$('#sheet-results').innerHTML=sheetRows();});$('#sheet-filter')?.addEventListener('change',e=>{filter=e.target.value;remember('cutsheet-filter',filter);$('#sheet-results').innerHTML=sheetRows();});document.querySelectorAll('[data-import]').forEach(b=>b.onclick=()=>importDraft(Number(b.dataset.import)));
 const companyChanged=()=>{companyDirty=true;$('.company-save-status').textContent='Unsaved changes';};
 document.querySelectorAll('[data-company]').forEach(input=>input.addEventListener('input',()=>{companyDraft[input.dataset.company]=input.value;companyChanged();}));
 $('#company-form')?.addEventListener('submit',async e=>{e.preventDefault();try{await saveCompany();}catch(e){$('#company-error').textContent=e.message;}});
 $('#upload-logo')?.addEventListener('click',()=>$('#logo-file').click());$('#logo-file')?.addEventListener('change',async e=>{try{const file=e.target.files[0];if(!file)return;companyDraft.logo=await readLogoFile(file,{maxDataLength:350000});companyChanged();render();}catch(e){notify(e.message);}});$('#remove-logo')?.addEventListener('click',()=>{companyDraft.logo=null;companyChanged();render();});
 for(const [selector,key] of [['#input-unit','units'],['#output-unit','outputUnits']])$(selector)?.addEventListener('change',e=>{try{const prefs=browserData();prefs[key]=e.target.value;accountStorage.setItem(KEY,JSON.stringify(prefs));notify('Preference saved.');}catch(e){notify(e.message);}});
 $('#backup')?.addEventListener('click',()=>{try{const value=browserData(),url=URL.createObjectURL(new Blob([JSON.stringify({...value,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='cut-sheet-browser-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}catch(e){notify(e.message);}});
}
if(params.has('filter'))filter=params.get('filter');
document.addEventListener('click',e=>{const a=e.target.closest('a');if(a){keepScroll(page);if(a.dataset.record)rememberReturn(a.dataset.record,'/','Home');}});
window.addEventListener('shop-access-reset',()=>{session=null;data=null;companyDraft=null;companyDirty=false;$('#workspace-dialog').close();render();});
installNavigationGuard({isDirty:()=>draftDirty||companyDirty,save:async()=>{if(companyDirty){await saveCompany();return;}await draftSave();data.workspace=await shopRequest('workspace');render();},discard:()=>{draftDirty=false;companyDirty=false;companyDraft=null;}});
await load();
startWorkspaceSync(async()=>{await load({quiet:true,force:true});void warmWorkspace();},{canRefresh:canSync,connected:!!session&&!error});
