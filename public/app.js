import {slidingLayoutThumbnail} from './sliding-drawing.js';
import {isSliding,slidingKind,slidingName,slidingCode,slidingGeometry,slidingDimensionError,setSliding,SLIDING_LAYOUTS} from './sliding.js';
import {SHUTTER_FRACTIONS,createShutterChoiceHistory,shutterMeasurementParts,selectShutterFraction,shutterMeasurementLabel,shutterFrameArrangement,applyShutterFrameArrangement} from './shuttersmart-inputs.js';
import {broadleafMeasurementValue,bindBroadleafFractions} from './broadleaf-measurements.js';
import {createAutosave} from './autosave.js';
import {manufacturingMessage,manufacturingField,blockingWarnings,panelWidthNotes} from './manufacturing-help.js';
import {accountFetch} from './account-storage.js';
import {accountStorage} from './account-storage.js';
import './auth-guard.js';
import {workspaceNav,breadcrumbs,backLink,installNavigationGuard,navigateState} from './workspace-nav.js';
import {openingPrice,quotePricing} from './quote-pricing.js';
import {quoteAdjustmentFields,parseQuoteAmount} from './quote-adjustments.js';
import {nextQuoteLine} from './quote-line-defaults.js';
import {EWF_ID,ewfMeasurement,isElegant,defaultEwf,normalizeEwf,ewfDimensionError} from './elegant.js';
import {ewfEditor,ewfPriceSummary} from './elegant-editor.js';
import {BROADLEAF_ID,defaultBroadleaf,normalizeBroadleaf,broadleafFrames,broadleafDimensionError} from './broadleaf.js';
import {broadleafEditor,broadleafPriceSummary} from './broadleaf-editor.js';
import {PRODUCTS,productId,productName,lineProduct,isManufacturingLine,manufacturingOpenings,hasManufacturingLines,quoteProductNames,CUT_SHEETS_ONLY} from './products.js';
import {parseMeasurement,measurementInput,hasMeasurements} from './measurements.js';
import {cutSheetFacts,cutSheetNotes,louverSummary,machiningLabel} from './cut-sheet.js';
import {shopRequest} from './shop-client.js';
import {loadLogo,saveLogo,readLogoFile} from './branding.js';
import {FRAME_STYLES,FRAME_EDGES,frameSideStyles,frameStyle,frameNotice,frameThumbnail,normalizeFrame} from './frames.js';
import {STANDARD_LAYOUTS,TPOST_LAYOUTS,drawingSVG} from './layouts.js';
const $=s=>document.querySelector(s), h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={jobs:'M4 7h16v13H4z M8 7V4h8v3 M4 11h16',grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',file:'M14 2H5v20h14V7z M14 2v6h5 M8 12h8 M8 16h6',plus:'M12 5v14 M5 12h14',chevron:'M9 5l7 7-7 7',check:'M5 12l4 4L19 6',copy:'M9 9h12v12H9z M15 5V3H3v12h2',trash:'M3 6h18 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7',settings:'M4 7h16 M4 17h16 M8 4v6 M16 14v6',download:'M12 3v12 M7 10l5 5 5-5 M4 17v4h16v-4',arrow:'M4 12h16 M14 6l6 6-6 6',info:'M12 8h.01 M12 11v6 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',ruler:'M3 7h18v10H3z M7 7v4 M11 7v3 M15 7v4 M19 7v3',panels:'M3 3h18v18H3z M12 3v18 M5 7h5 M14 7h5 M5 11h5 M14 11h5 M5 15h5 M14 15h5',clock:'M12 7v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',search:'M21 21l-6-6 M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',close:'M6 6l12 12 M18 6L6 18',back:'M20 12H4 M10 6l-6 6 6 6',archive:'M3 3h18v5H3z M5 8v13h14V8 M9 12h6',upload:'M12 16V4 M7 9l5-5 5 5 M4 17v4h16v-4'};
const icon=(name,cls='')=>`<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]||paths.grid}"/></svg>`;
const FRAMES={ST:'Standard frame',DS:'Designer frame',EX:'Extended frame',ZF:'Z-frame',TR:'Trim frame',HS:'Hanging strip'},COLORS={W:'White',OW:'Off-white',SC:'Swiss coffee'};
const KEY='shutter-factory-workshop-v1',uid=()=>crypto.randomUUID();
const newOpening=(name='New opening')=>({id:uid(),name,width:null,height:null,quantity:1,left:1,right:1,louver:4,frame:'ST',sides:'4W',mount:'I',sizeMethod:'S',color:'W',tilt:'Back',stile:'Flat',divider:0,divisionMode:'divider',notes:''});
function seed(){const a=newOpening('Living room · left'),b=newOpening('Living room · right'),c=newOpening('Primary bedroom');c.width=48;c.height=72;c.quantity=2;return {schema:1,jobs:[{id:uid(),name:'Sample residence',customer:'Example customer',number:'DEMO-001',due:'',notes:'Example job for exploring the app. Replace these measurements before use.',sample:true,archived:false,updated:new Date().toISOString(),openings:[a,b,c]}],units:'in',outputUnits:'mm'};}
let state,storageError='',brandLogo=loadLogo(),logoBusy=false;
try{const raw=accountStorage.getItem(KEY);state=raw?JSON.parse(raw):{schema:1,jobs:[],units:'in',outputUnits:'mm'};if(state.schema!==1||!Array.isArray(state.jobs))throw new Error('Invalid saved data');}catch{state=seed();storageError='Saved jobs could not be loaded. Export any current work before refreshing.';}
let activeJob=state.jobs.find(j=>!j.archived)?.id??null,activeOpening=null,view=activeJob?'editor':'jobs',tab='openings',archiveView=false,result=null,calcError='',calculating=false,requestNumber=0,invalidFields=new Map(),searchTerm='';
const notifiedLightGaps=new Map(),newQuoteLineIds=new Set(),lastTrimStyles=new Map();
const shutterChoiceHistory=createShutterChoiceHistory(accountStorage);
const remoteParams=new URLSearchParams(location.search),remoteKind=remoteParams.has('quote')?'quote':remoteParams.has('order')?'order':remoteParams.has('draft')?'draft':remoteParams.has('job')?'job':null;
let remoteContext=null,remoteSaving=false,advancedPricingOpen=false,pendingElegantId=null;
// Entry layout is a personal browser preference, separate from the quote data.
const ENTRY_MODE_KEY='shutter-entry-mode-v1',openingSteps=new Map();
function readEntryMode(){
 const requested=remoteParams.get('flow');if(['steps','single'].includes(requested))return requested;
 try{return accountStorage.getItem(ENTRY_MODE_KEY)==='steps'?'steps':'single';}catch{return 'single';}
}
let entryMode=readEntryMode();
const stepLabels=['Opening','Shutter','Review'];
const canSwitchEntryMode=()=>quoteEditing()&&currentOpening()&&isShutterLine(currentOpening())&&productId(quoteLine(currentOpening()))==='shuttersmart';
const stepPreview=()=>entryMode==='steps'&&canSwitchEntryMode();
const openingStep=()=>openingSteps.get(currentOpening()?.id)||1;
function stepSectionStart(step){return stepPreview()?`<div class="opening-step-panel" data-step-panel="${step}" ${openingStep()===step?'':'hidden'}>`:'';}
const stepSectionEnd=()=>stepPreview()?'</div>':'';
function entryModeSwitch(){
 if(!canSwitchEntryMode())return '';
 return `<div class="entry-mode-switch" role="group" aria-label="Entry mode">${[['steps','Step by step'],['single','All on one page']].map(([value,label])=>`<button type="button" data-entry-mode="${value}" aria-pressed="${entryMode===value}">${label}</button>`).join('')}</div>`;
}
function changeEntryMode(mode){
 if(!canSwitchEntryMode()||!['steps','single'].includes(mode))return;
 if(invalidFields.size){
  const key=invalidFields.keys().next().value,input=document.getElementById(key),panel=input?.closest('[data-step-panel]');
  if(panel?.hidden)showOpeningStep(Number(panel.dataset.stepPanel));
  toast('Correct the highlighted field before switching layouts.');input?.focus();return;
 }
 entryMode=mode;
 let remembered=true;try{accountStorage.setItem(ENTRY_MODE_KEY,mode);}catch{remembered=false;}
 const url=new URL(location.href);url.searchParams.set('flow',mode);history.replaceState(history.state,'',url);
 rememberEditorView();render();
 document.querySelector(`[data-entry-mode="${mode}"]`)?.focus({preventScroll:true});
 document.querySelector('.page-heading')?.scrollIntoView({block:'start'});
 if(!remembered)toast('Layout changed. This browser could not remember the preference.');
}
function stepNavigation(){
 const j=currentJob(),o=currentOpening(),step=openingStep();
 return `<div class="opening-step-nav"><div class="opening-step-context"><span>Opening ${j.openings.indexOf(o)+1} of ${j.openings.length}</span><strong data-step-opening-name>${h(o.name)}</strong>${editorSaveStatus()}</div><nav aria-label="Opening steps">${stepLabels.map((label,i)=>`<button type="button" data-opening-step="${i+1}" ${step===i+1?'aria-current="step"':''}><span aria-hidden="true">${i+1}</span>${label}</button>`).join('')}</nav></div>`;
}
function stepFooter(){
 const step=openingStep();
 return `<footer class="opening-step-footer"><span>Step ${step} of 3</span><div class="btn-row">${step>1?`<button type="button" class="btn" data-opening-step="${step-1}">← Back</button>`:''}${step<3?`<button type="button" class="btn primary" data-opening-step="${step+1}">Next: ${stepLabels[step]} →</button>`:btn('Add another opening','add-opening','plus')+btn('Review quote →','remote-back',null,'primary')}</div><p id="quote-bottom-error" class="field-error" role="alert"></p></footer>`;
}
function openingReview(o){
 const sides=isSliding(o)?'No frame':o.sides==='CW'?FRAME_EDGES.map(side=>`${side[0].toUpperCase()+side.slice(1)}: ${frameSideStyles(o)[side].name}`).join(' · '):o.sides==='4S'?'Standard bottom':'All four sides';
 return `<div class="opening-review-summary"><div><h2>${h(o.name)}</h2><p>${o.quantity} unit${o.quantity===1?'':'s'} · ${h(shutterMeasurementLabel(o.width,state.units))} × ${h(shutterMeasurementLabel(o.height,state.units))} ${state.units}</p></div><button type="button" class="text-btn" data-opening-step="1">Edit size</button><dl><div><dt>Finish</dt><dd>${h(COLORS[o.color])}</dd></div><div><dt>Louvers / tilt</dt><dd>${o.louver} inch · ${h(o.tilt)} tilt</dd></div><div><dt>Panels</dt><dd>${h(configuration(o))}</dd></div><div><dt>Frame</dt><dd>${h(frameStyle(o).name)}${isSliding(o)?'':' · '+h(sides)}</dd></div>${o.tposts?`<div><dt>Post centerlines</dt><dd>${o.tposts.positions.map(v=>h(shutterMeasurementLabel(v,state.units))).join(' · ')} ${state.units}</dd></div>`:''}${o.divider?`<div><dt>${o.divisionMode==='split'?'Split tilt rod':'Divider rail'}</dt><dd>${h(shutterMeasurementLabel(o.divider,state.units))} ${state.units} from bottom</dd></div>`:''}</dl><button type="button" class="text-btn" data-opening-step="2">Edit shutter options</button></div>`;
}
function showOpeningStep(next){
 openingSteps.set(currentOpening().id,next);rememberEditorView();
 document.querySelectorAll('[data-step-panel]').forEach(el=>{el.hidden=Number(el.dataset.stepPanel)!==next;});
 document.querySelectorAll('.opening-step-nav [data-opening-step]').forEach(el=>{if(Number(el.dataset.openingStep)===next)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');});
 const heading=$('#opening-step-title');if(heading)heading.textContent=['Opening details','Shutter options','Review this opening'][next-1];
 const bottom=$('.step-preview .quote-editor-bottom');if(bottom)bottom.hidden=next!==3;
 const summary=$('.opening-review-summary');if(summary&&next===3)summary.outerHTML=openingReview(currentOpening());
 const footer=$('.opening-step-footer');if(footer){footer.outerHTML=stepFooter();document.querySelectorAll('.opening-step-footer [data-action]').forEach(el=>el.addEventListener('click',()=>action(el.dataset.action)));}
 bindOpeningSteps();heading?.focus({preventScroll:true});$('.opening-step-nav')?.scrollIntoView({block:'start'});
}
function changeOpeningStep(next){
 if(!stepPreview()||![1,2,3].includes(next))return;
 if(invalidFields.size){
  const key=invalidFields.keys().next().value,input=document.getElementById(key),panel=input?.closest('[data-step-panel]');
  if(panel?.hidden)showOpeningStep(Number(panel.dataset.stepPanel));
  toast('Correct the highlighted field before continuing.');input?.focus();return;
 }
 if(next>1&&!hasMeasurements(currentOpening())){toast('Enter the width and height before continuing.');if(openingStep()!==1)showOpeningStep(1);$(currentOpening().width==null?'#width':'#height')?.focus();return;}
 showOpeningStep(next);
}
function bindOpeningSteps(){document.querySelectorAll('[data-opening-step]').forEach(el=>{el.onclick=()=>changeOpeningStep(Number(el.dataset.openingStep));});}
let saveMessage='Saved',saveProblem='';
const autoEditable=()=>remoteContext&&!remoteContext.released&&(remoteContext.kind==='draft'||quoteEditing());
const draftAutosave=createAutosave({write:writeRemote,onState:({dirty,saving,error})=>{
 if(!autoEditable())return;
 saveProblem=error?.message||'';saveMessage=error?'Not saved — '+error.message:saving?'Saving…':dirty?'Saving…':'Saved';
 document.querySelectorAll('[data-draft-save-status],#save-state').forEach(el=>{el.textContent=saveMessage;});
}});
function editorSaveStatus(){return `<span class="editor-save-status" data-draft-save-status role="status">${h(saveMessage)}</span>`;}


const money=value=>value==null?'Not priced':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value/100);
const quoteLine=o=>lineProduct(o,remoteContext?.record);
const isShutterLine=o=>!remoteContext||isManufacturingLine(o,remoteContext.record);
const orderEditing=()=>remoteContext?.kind==='order'&&remoteContext.editing&&!remoteContext.released;
const revisionEditing=()=>!!remoteContext?.revisionEditing;
const lockedOrderQuantity=()=>orderEditing()||revisionEditing()&&remoteContext.revisionKind==='order';
const quoteEditing=()=>remoteContext?.kind==='quote'&&remoteContext.record.status!=='ordered';
const currentJob=()=>state.jobs.find(j=>j.id===activeJob),currentOpening=()=>currentJob()?.openings.find(o=>o.id===activeOpening)||currentJob()?.openings[0];
const panelCount=o=>isSliding(o)?slidingGeometry(o).count:o.tposts?o.tposts.sections.reduce((n,s)=>n+s.left+s.right,0):o.left+o.right;
const configuration=o=>isSliding(o)?slidingCode(o):o.tposts?o.tposts.sections.map(s=>'L'.repeat(s.left)+'R'.repeat(s.right)).join(' | T | '):'L'.repeat(o.left)+'R'.repeat(o.right);
const total=(j,key)=>j.openings.reduce((n,o)=>n+(key==='panels'?panelCount(o)*o.quantity:o.quantity),0);
const measure=(v,unit=state.units)=>v==null?'—':unit==='mm'?String(Math.round(v*25.4*100)/100):String(Math.round(v*10000)/10000);
const cut=v=>state.outputUnits==='mm'?v.toFixed(2):(v/25.4).toFixed(4);
function save(touch=true){document.querySelectorAll('[data-step-opening-name]').forEach(el=>{el.textContent=currentOpening()?.name||'New opening';});if(remoteContext){if(touch){remoteContext.dirty=true;if(autoEditable())draftAutosave.changed();}const el=$('#save-state');if(el)el.textContent=autoEditable()?saveMessage:remoteContext.dirty?'Unsaved changes':'Saved';refreshQuotePricing();return;}try{if(touch&&currentJob())currentJob().updated=new Date().toISOString();accountStorage.setItem(KEY,JSON.stringify(state));storageError='';}catch{storageError='Browser storage is full or unavailable. Export a backup now to keep your work.';}const el=$('#save-state');if(el)el.innerHTML=icon(storageError?'info':'check')+h(storageError?'Not saved — export a backup':'Saved on this browser');}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),4500);}
const btn=(label,action,ico,kind='')=>`<button class="btn ${kind}" data-action="${action}">${ico?icon(ico):''}${label}</button>`;
function sidebar(){return workspaceNav(remoteKind==='quote'?'quotes':'cutsheets',remoteContext?(autoEditable()?saveMessage:remoteContext.dirty?'Unsaved changes':'Saved'):'Loading…');}
function editorBreadcrumb(){const j=currentJob();if(remoteKind==='quote')return backLink(j?.id,'/contacts.html#quotes','Quotes');return backLink(j?.id,'/cutsheets.html','Cut Sheets');}
function render(){const j=currentJob();if(j&&!j.openings.some(o=>o.id===activeOpening))activeOpening=j.openings[0]?.id;$('#app').innerHTML=`${sidebar()}<main class="content ${remoteKind==='quote'?'quote-editor':''} ${stepPreview()?'step-preview':''}" id="main-content">${editorBreadcrumb()}${storageError?`<div class="error-box">${h(storageError)}</div>`:''}${view==='editor'?editorPage():view==='settings'?settingsPage():jobsPage(view==='cutsheets')}</main>`;bind();if(lockedOrderQuantity()){document.querySelectorAll('[data-action="add-opening"],[data-action="duplicate-opening"],[data-action="remove-opening"]').forEach(el=>el.remove());const quantity=$('#quantity');if(quantity)quantity.disabled=true;}if(view==='editor'&&tab==='openings'){validatePostFields();if($('.diagram-wrap'))$('.diagram-wrap').innerHTML=diagram(currentOpening());}if(view==='editor'&&tab!=='details'&&currentOpening())recalculate({notifyGap:false});}
function metrics(j){return `<div class="metrics">${[['panels','Openings',j.openings.length],['grid','Total units',total(j,'units')],['ruler','Total panels',total(j,'panels')],['clock','Job stage','Active']].map(([i,label,value])=>`<div class="metric"><div class="metric-icon">${icon(i)}</div><div><div class="metric-label">${label}</div><strong class="${typeof value==='string'?'small-value':''}">${value}</strong></div></div>`).join('')}</div>`;}
function editorPage(){if(revisionEditing())return revisionEditorPage();if(['draft','job'].includes(remoteContext?.kind))return draftEditorPage();if(remoteContext)return remoteEditorPage();const j=currentJob();if(!j){view='jobs';return jobsPage();}return `<div class="page-heading"><div><div class="eyebrow">${h(j.number)}${j.sample?' · EXAMPLE JOB':''}</div><h1>${h(j.name)}</h1><p class="subheading">${h(j.customer||'Customer not entered')}</p></div><div class="btn-row">${btn('Send to Production','send-shop','arrow')}${btn('Download Print PDF','pdf','download','primary')}</div></div><div class="tabs"><button class="tab ${tab==='openings'?'active':''}" data-tab="openings">Openings <span class="num">${j.openings.length}</span></button><button class="tab ${tab==='preview'?'active':''}" data-tab="preview">Cut sheet</button><button class="tab ${tab==='details'?'active':''}" data-tab="details">Job details</button></div>${tab==='details'?jobDetails():tab==='preview'?previewPage():openingWorkspace()}`;}
function miniature(){return `<svg class="mini-shutter" viewBox="0 0 44 36" aria-hidden="true"><rect x="2" y="1" width="40" height="34" rx="1" fill="none" stroke="currentColor"/><path d="M22 1v34 M5 7h14 M25 7h14 M5 13h14 M25 13h14 M5 19h14 M25 19h14 M5 25h14 M25 25h14 M5 31h14 M25 31h14" fill="none" stroke="currentColor"/></svg>`;}
function pendingQuoteLine(){const o=nextQuoteLine(currentOpening(),remoteContext.record,newOpening('Opening '+(currentJob().openings.length+1)),remoteContext.productPricing);newQuoteLineIds.add(o.id);return o;}
function quoteProductField(o){
  const selected=productId(quoteLine(o)),elegant=pendingElegantId===o.id||isElegant(selected),locked=selected&&!newQuoteLineIds.has(o.id);
  if(locked&&selected==='shuttersmart')return '<p class="shutter-product-name">ShutterSmart</p>';
  const brands=[{id:'shuttersmart',name:'ShutterSmart'},{id:'elegant',name:'Elegant'},{id:'starwood',name:'Starwood'},{id:'other',name:'Other brand'}];
  return `<div class="field ${elegant?'':'wide'} line-product-field"><label for="line-product">Product type</label><select id="line-product" ${locked?'disabled':''}><option value="">Choose a product</option>${brands.map(p=>`<option value="${p.id}" ${p.id===(elegant?'elegant':selected)?'selected':''}>${h(p.name)}</option>`).join('')}</select>${selected==='other'?`<p class="field-help">${h(o.productLabel||remoteContext.record.productLabel)}</p>`:''}</div>${elegant?`<div class="field"><label for="elegant-product">Elegant product</label><select id="elegant-product" ${locked?'disabled':''}><option value="">Choose a product</option><option value="elegant-shutters" ${selected==='elegant-shutters'&&pendingElegantId!==o.id?'selected':''}>Broadleaf Shutters</option><option value="${EWF_ID}" ${selected===EWF_ID&&pendingElegantId!==o.id?'selected':''}>EWF Shades</option></select></div>`:''}`;
}
function openingList(j,o,quote=false){
 return `<section class="opening-list-bottom" aria-label="${quote?'Quote line items':'Job openings'}"><div class="opening-list-heading"><h2>${quote?'Quote lines':'Openings'} <span>${j.openings.length}</span></h2>${btn(quote?'Add line':'Add opening','add-opening','plus')}</div><div class="opening-list">${j.openings.map((x,i)=>`<button class="opening-card ${x.id===o?.id?'active':''}" data-opening="${x.id}" aria-pressed="${x.id===o?.id}"><span class="opening-number">${String(i+1).padStart(2,'0')}</span><strong>${h(x.name)}</strong><span class="dims">${h(shutterMeasurementLabel(x.width,state.units))} × ${h(shutterMeasurementLabel(x.height,state.units))} ${state.units}</span><small>${quote?h(productName(quoteLine(x))):panelCount(x)+' panels'} · ${x.quantity} unit${x.quantity===1?'':'s'}</small>${quote?`<span class="opening-line-price" data-price-opening="${x.id}">${productId(quoteLine(x))?h(money(openingPrice(x,{...remoteContext.record,unitPrices:j.unitPrices}).lineTotal)):''}</span>`:''}<span class="opening-edit">${x.id===o?.id?'Editing':'Edit'}</span></button>`).join('')}</div></section>`;
}
function quoteWorkspace(j,o){
 return `<div class="workspace workspace-flow">${!o?`<div class="empty"><h2>Add a product to this quote</h2>${btn('Add line item','add-opening','plus','primary')}</div>`:(!productId(quoteLine(o))||pendingElegantId===o.id)?`<section class="editor-card"><div class="editor-header"><h2>New line item</h2><button class="icon-btn" data-action="remove-opening" aria-label="Remove opening">${icon('trash')}</button></div><div class="fields">${quoteProductField(o)}</div><p class="field-help">Choose the product first, then enter the opening name, quantity, and measurements.</p></section>`:isShutterLine(o)?openingEditor(o):simpleQuoteEditor(o)}</div>`;
}
function simpleQuoteEditor(o){
  if(productId(quoteLine(o))===BROADLEAF_ID)return broadleafEditor(o,{h,productField:quoteProductField(o),inputField,btn,icon,units:state.units,measurementInput,price:openingPrice(o,{...remoteContext.record,unitPrices:currentJob().unitPrices})});
  if(productId(quoteLine(o))===EWF_ID)return ewfEditor(o,{h,productField:quoteProductField(o),inputField,btn,icon,units:state.units,measurementInput,unitPrice:currentJob().unitPrices[o.id],price:openingPrice(o,{...remoteContext.record,unitPrices:currentJob().unitPrices})});
  return `<section class="editor-card"><div class="editor-header"><h2>Opening details</h2><div class="btn-row">${btn('Duplicate','duplicate-opening','copy','small ghost')}<button class="icon-btn" data-action="remove-opening" aria-label="Remove opening">${icon('trash')}</button></div></div><div class="fields">${quoteProductField(o)}${inputField('name','Opening name',o.name,{wide:true})}${inputField('quantity','Quantity',o.quantity,{type:'number'})}</div><div class="measurement-heading"><span>Measurements</span><div class="input-unit-toggle" aria-label="Measurement units"><button data-input-unit="in" aria-pressed="${state.units==='in'}" class="${state.units==='in'?'active':''}">in</button><button data-input-unit="mm" aria-pressed="${state.units==='mm'}" class="${state.units==='mm'?'active':''}">mm</button></div></div><div class="fields">${inputField('width','Width',measurementInput(o.width,state.units),{suffix:state.units})}${inputField('height','Height',measurementInput(o.height,state.units),{suffix:state.units})}<div class="field wide"><label for="notes">Product details</label><textarea id="notes" data-field="notes" maxlength="1200" placeholder="Color, style, and any other product options…">${h(o.notes||'')}</textarea></div></div>${productId(quoteLine(o))==='other'?'<p class="field-help">Set this line’s price in Advanced pricing below.</p>':''}</section>`;
}
function chooseLineProduct(id){
  const o=currentOpening(),previousProduct=productId(quoteLine(o));
  if(remoteSaving||invalidFields.size){$('#line-product').value=isElegant(previousProduct)?'elegant':previousProduct;if($('#elegant-product'))$('#elegant-product').value=previousProduct;return toast(remoteSaving?'Wait for the quote to finish saving.':'Correct the highlighted fields before changing products.');}
  if(previousProduct&&!newQuoteLineIds.has(o.id))return;
  if(id==='elegant'){pendingElegantId=o.id;render();$('#elegant-product')?.focus();return;}
  const wasPending=pendingElegantId===o.id;pendingElegantId=null;
  if(!PRODUCTS.some(p=>p.id===id))return;
  if(id===previousProduct){if(wasPending)render();return;}
  const apply=label=>{const value=id==='shuttersmart'?{...newOpening(o.name),id:o.id,productId:id}:{id:o.id,productId:id,name:o.name,width:null,height:null,quantity:1,notes:'',...(label?{productLabel:label}:{})};value.pricing=structuredClone(remoteContext.productPricing[id]||{rateCents:null,minimumAreaHundredths:0,version:0});for(const key of ['width','height','quantity','notes'])if(o[key]!==undefined)value[key]=o[key];for(const key of Object.keys(o))delete o[key];Object.assign(o,value);if(id===EWF_ID)o.ewf=defaultEwf();if(id===BROADLEAF_ID)o.broadleaf=defaultBroadleaf();delete currentJob().unitPrices[o.id];newQuoteLineIds.add(o.id);save();render();$(id===EWF_ID?'#quantity':'#name')?.focus();};
  if(id==='other'){
    modal('Product brand','<form id="line-brand-form"><div class="field"><label for="line-brand">Brand name</label><input id="line-brand" maxlength="80" required></div></form>',`${btn('Cancel','close')}<button class="btn primary" type="submit" form="line-brand-form">Continue</button>`);
    $('#line-brand-form').onsubmit=e=>{e.preventDefault();const value=$('#line-brand').value.trim();if(!value)return;$('#modal').close();apply(value);};
    $('#modal').addEventListener('close',()=>{if($('#line-product'))$('#line-product').value=productId(quoteLine(o));},{once:true});
  }else apply();
}
function openingWorkspace(){const j=currentJob(),o=currentOpening();if(quoteEditing())return quoteWorkspace(j,o);return `<div class="workspace workspace-flow">${o?openingEditor(o):`<div class="empty"><h2>Add your first opening</h2>${btn('Add opening','add-opening','plus','primary')}</div>`}${openingList(j,o)}</div>`;}
function inputField(key,label,value,{suffix='',type='text',wide=false,maxlength='80',help=''}={}){return `<div class="field ${wide?'wide':''}"><label for="${key}">${label}</label><div class="${suffix?'input-suffix':''}"><input id="${key}" data-field="${key}" value="${h(value)}" type="${type}" maxlength="${maxlength}" ${type==='number'?'min="1" max="100" step="1"':''} ${(['width','height','divider'].includes(key)||/^post-\d+$/.test(key))?'inputmode="decimal"':''}>${suffix?`<span>${suffix}</span>`:''}</div>${help?`<div class="field-help">${help}</div>`:''}<span class="field-error" id="error-${key}"></span></div>`;}
function selectField(key,label,value,options,wide=false){return `<div class="field ${wide?'wide':''}"><label for="${key}">${label}</label><select id="${key}" data-field="${key}">${Object.entries(options).map(([v,t])=>`<option value="${h(v)}" ${String(value)===v?'selected':''}>${h(t)}</option>`).join('')}</select></div>`;}
const LAYOUTS=STANDARD_LAYOUTS;
function layoutChoices(o){const choices=LAYOUTS[o.left+o.right]||[];return choices.some(([value])=>value===`${o.left}-${o.right}`)?choices:[...choices,[`${o.left}-${o.right}`,configuration(o),'Saved custom layout']];}
function constructionChoices(o){
 const selected=isSliding(o)?slidingKind(o):o.tposts?'tpost':'standard';
 return `<div class="construction-toggle" role="group" aria-label="Shutter type">${Object.entries({standard:'Standard',tpost:'T-post',bypass:'Bypass · 2 tracks',tripass:'Tripass · 3 tracks'}).map(([key,label])=>`<button type="button" data-construction="${key}" aria-pressed="${selected===key}">${label}</button>`).join('')}</div>`;
}
function panelConfiguration(o){return isSliding(o)?slidingConfiguration(o):o.tposts?tpostConfiguration(o):standardPanelConfiguration(o);}
function slidingConfiguration(o){
 const g=slidingGeometry(o),counts={2:'2 panels',3:'3 panels',4:'4 panels',6:'6 panels'};
 return `${choiceField('sliding-count','Number of panels',g.count,counts)}<p class="field-help">${g.tracks} tracks · Front (F) · ${g.tracks===3?'Middle (M) · ':''}Back (B). Layouts read left to right when closed.</p><div class="sliding-layouts" role="group" aria-label="Sliding panel layout">${SLIDING_LAYOUTS[g.count].map(layout=>`<button type="button" class="layout-option" data-sliding-layout="${layout}" aria-pressed="${g.layout===layout}" aria-label="${[...layout].map(c=>({F:'Front',M:'Middle',B:'Back'})[c]).join(', ')}">${slidingLayoutThumbnail(layout)}<strong>${[...layout].join(' · ')}</strong></button>`).join('')}</div><p class="field-help">1 1/2 in overlap between tracks. Same-track panels meet with no gap.</p>`;
}
function slidingSizeSummary(o){
 const g=slidingGeometry(o);
 return `<div class="sliding-size-summary" id="sliding-size-summary" role="status"><div><span>Each panel</span><strong>${g.panelWidth==null?'—':h(shutterMeasurementLabel(g.panelWidth,state.units))} × ${g.panelHeight==null?'—':h(shutterMeasurementLabel(g.panelHeight,state.units))} ${state.units}</strong></div><div><span>Total panels</span><strong>${g.count*o.quantity}</strong></div><p>Height less 2 7/8 in for the board, track and rollers. ${o.mount==='I'?'Panels meet the side walls; no side overlap.':'Panels cover the wall by 1 1/2 in on each side.'} No frame.</p></div>`;
}
function standardPanelConfiguration(o){const n=o.left+o.right;return `${choiceField('panel-count','Number of panels',n,{1:'1 panel',2:'2 panels',3:'3 panels',4:'4 panels'})}<div class="layout-options" role="group" aria-label="Panel layout">${layoutChoices(o).map(([value,code,label])=>`<button type="button" class="layout-option ${value===`${o.left}-${o.right}`?'selected':''}" data-layout="${value}" data-field="layout" value="${value}" aria-pressed="${value===`${o.left}-${o.right}`}" aria-label="${code} — ${label}"><strong>${code}</strong><small>${label}</small></button>`).join('')}</div>`;}
function tpostConfiguration(o){const t=o.tposts;return `${choiceField('post-count','Number of posts',t.positions.length,{1:'1 post',2:'2 posts',3:'3 posts',4:'4 posts'})}<div class="tpost-presets" role="group" aria-label="Common T-post layouts">${TPOST_LAYOUTS.filter(p=>p.fractions.length===t.positions.length).map(p=>{const selected=t.sections.length===p.sections.length&&t.sections.every((section,i)=>section.left===p.sections[i].left&&section.right===p.sections[i].right);return `<button type="button" class="layout-option ${selected?'selected':''}" data-tpost-preset="${p.id}" aria-pressed="${selected}" aria-label="${p.description}"><strong>${p.label}</strong></button>`;}).join('')}</div><div class="tpost-positions">${t.positions.map((v,i)=>shutterMeasurementField('post-'+i,`Post ${i+1} centerline`,v)).join('')}</div><p class="field-help">Post centerlines are measured from the left edge.</p><div class="tpost-sections">${t.sections.map((section,i)=>choiceField('section-'+i,`Section ${i+1} · ${i===0?'left':i===t.sections.length-1?'right':'middle'}`,`${section.left}-${section.right}`,{'1-0':'L','0-1':'R','2-0':'LL','1-1':'LR','0-2':'RR','2-1':'LLR','1-2':'LRR','2-2':'LLRR'})).join('')}</div><div class="post-construction">${choiceField('post-construction','Post construction',t.construction,{'two-piece':'Two-piece','one-piece':'One-piece'})}<button type="button" class="text-btn" data-space-posts>Space posts evenly</button></div>`;}
// Replacing all post positions also replaces their validation errors. Other invalid
// inputs must remain on screen so a configuration change cannot discard a draft.
function preparePostRedistribution(){
  if([...invalidFields.keys()].some(key=>!/^post-\d+$/.test(key))){toast('Correct the highlighted field first.');return false;}
  for(const key of [...invalidFields.keys()])if(/^post-\d+$/.test(key))invalidFields.delete(key);
  return true;
}
function changeConstruction(mode){
 const o=currentOpening(),previous=isSliding(o)?slidingKind(o):o.tposts?'tpost':'standard';
 if(mode===previous)return;
 const sliding=['bypass','tripass'].includes(mode),tpost=mode==='tpost';
 const replaceable=key=>(sliding||tpost)&&key==='width'||/^post-\d+$/.test(key);
 if([...invalidFields.keys()].some(key=>!replaceable(key)))return toast('Correct the highlighted field first.');
 let width=o.width;
 if(invalidFields.has('width')){try{width=parseMeasurement(shutterMeasurementValue($('#width')))/(state.units==='mm'?25.4:1);}catch{return toast('Enter a valid width first.');}}
 if(mode==='standard'&&width>106)return toast('Standard openings are limited to 106 inches. Reduce the width first.');
 if(!sliding&&o.height>114)return toast('Standard and T-post heights are limited to 114 inches. Reduce the height first.');
 o.width=width;
 for(const key of [...invalidFields.keys()])if(replaceable(key))invalidFields.delete(key);
 if(sliding){
  const next=setSliding(o,mode==='bypass'?'FB':'FMB');
  delete o.tposts;delete o.frameStyle;delete o.frameSides;Object.assign(o,next);
 }else{
  if(isSliding(o)){delete o.sliding;o.frame='ST';o.sides='4W';o.mount='I';o.left=1;o.right=1;}
  if(tpost)o.tposts={positions:[width>0?width/2:null],sections:[{left:1,right:0},{left:0,right:1}],construction:'two-piece'};
  else delete o.tposts;
 }
 save();render();
}
function choiceHistoryKey(control,label){
 return control.dataset.choice||(control.dataset.construction?'construction':control.dataset.layout?'panel-layout':control.dataset.tpostPreset?'tpost-layout':control.dataset.slidingLayout?'sliding-layout':control.dataset.frameStyle?'frame-style':control.dataset.frameArrangement?'frame-sides':control.dataset.frameEdge?'frame-side-'+control.dataset.frameEdge:label);
}
function rememberChoice(control,label){shutterChoiceHistory.remember(currentJob().id+':'+currentOpening().id,choiceHistoryKey(control,label));}
function confirmChoice(control,label,from,to,apply){
 const jobId=currentJob().id,openingId=currentOpening().id,openingKey=jobId+':'+openingId,field=choiceHistoryKey(control,label);
 if(String(from)===String(to)){shutterChoiceHistory.remember(openingKey,field);return;}
 // An autosave may replace opening objects while the confirmation is open.
 const commit=()=>{const opening=currentOpening();if(currentJob().id!==jobId||opening?.id!==openingId)return;const before=JSON.stringify(opening);apply(opening);if(JSON.stringify(opening)!==before)shutterChoiceHistory.remember(openingKey,field);};
 if(!shutterChoiceHistory.has(openingKey,field)){commit();return;}
 modal('Change '+label+'?',`<p>Are you sure you want to change <strong>${h(from)}</strong> to <strong>${h(to)}</strong>?</p>`,`${btn('Cancel','close')}<button type="button" class="btn primary" id="confirm-choice">OK</button>`);
 $('#confirm-choice').onclick=()=>{$('#modal').close();commit();};
}
function bindPanelConfiguration(){
 document.querySelectorAll('[data-sliding-layout]').forEach(el=>el.onclick=()=>{
  const o=currentOpening();
  confirmChoice(el,'panel layout',slidingCode(o),[...el.dataset.slidingLayout].join(' · '),(o)=>{
   if(invalidFields.size)return toast('Correct the highlighted field first.');
   o.sliding.layout=el.dataset.slidingLayout;save();render();document.querySelector(`[data-sliding-layout="${o.sliding.layout}"]`)?.focus({preventScroll:true});
  });
 });
 document.querySelectorAll('[data-tpost-preset]').forEach(el=>el.onclick=()=>{
  if(el.getAttribute('aria-pressed')==='true'){rememberChoice(el,'panel layout');return;}
  const o=currentOpening(),p=TPOST_LAYOUTS.find(p=>p.id===el.dataset.tpostPreset);
  confirmChoice(el,'panel layout',configuration(o),p.label,(o)=>{if(!preparePostRedistribution())return;o.tposts={construction:o.tposts?.construction||'two-piece',positions:p.fractions.map(f=>o.width>0?f*o.width:null),sections:structuredClone(p.sections)};save();render();document.querySelector(`[data-tpost-preset="${p.id}"]`)?.focus({preventScroll:true});});
 });
 document.querySelectorAll('[data-construction]').forEach(el=>el.onclick=()=>confirmChoice(el,'construction',isSliding(currentOpening())?slidingName(currentOpening()):currentOpening().tposts?'T-post':'Standard',el.textContent,()=>changeConstruction(el.dataset.construction)));
 document.querySelector('[data-space-posts]')?.addEventListener('click',()=>{if(!preparePostRedistribution())return;const o=currentOpening();if(!(o.width>0))return toast('Enter the opening width before spacing posts.');o.tposts.positions=o.tposts.positions.map((_,i)=>o.width*(i+1)/(o.tposts.positions.length+1));save();render();});
 document.querySelectorAll('[data-layout]').forEach(el=>el.onclick=()=>{
  const o=currentOpening();if(el.value===`${o.left}-${o.right}`){rememberChoice(el,'panel layout');return;}
  confirmChoice(el,'panel layout',configuration(o),el.querySelector('strong').textContent,()=>{fieldChange(el);document.querySelectorAll('[data-layout]').forEach(b=>{const selected=b===el;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});el.focus({preventScroll:true});});
 });
 bindShutterChoices();
}
function bindShutterChoices(){
 document.querySelectorAll('[data-choice]').forEach(el=>el.onclick=()=>{
  const key=el.dataset.choice,o=currentOpening(),selected=document.querySelector(`[data-choice="${key}"][aria-pressed="true"]`);
  confirmChoice(el,document.getElementById(key+'-label').textContent.toLowerCase(),selected?.textContent||'Not selected',el.textContent,(o)=>{
   if(key==='sliding-count'){
    if(invalidFields.size)return toast('Correct the highlighted field first.');
    o.sliding.layout=SLIDING_LAYOUTS[Number(el.value)][0];save();render();
   }else if(key==='mount'&&isSliding(o)){
    if(invalidFields.size)return toast('Correct the highlighted field first.');
    o.mount=el.value;save();render();
   }else if(key==='panel-count'){
    if(invalidFields.size)return toast('Correct the highlighted field first.');
    const n=Number(el.value);[o.left,o.right]=n===1?[1,0]:n===3?[2,1]:[n/2,n/2];save();$('#panel-configuration').innerHTML=panelConfiguration(o);bindPanelConfiguration();refreshOpeningSummary();recalculate();
   }else{
    el.dataset.field=key;fieldChange(el);
    if(key==='stile'){render();return;}
    document.querySelectorAll(`[data-choice="${key}"]`).forEach(b=>b.setAttribute('aria-pressed',String(b.value===el.value)));
   }
   document.querySelector(`[data-choice="${key}"][value="${el.value}"]`)?.focus({preventScroll:true});
  });
 });
 document.querySelectorAll('[data-shutter-fraction]').forEach(el=>el.onclick=()=>{
  const input=document.getElementById(el.dataset.shutterFraction);
  try{input.value=selectShutterFraction(input.value,Number(el.value));}catch{input.focus();return;}
  setFraction(input.id,Number(el.value));fieldChange(input);
 });
 document.querySelectorAll('[data-shutter-measure]').forEach(input=>input.onblur=()=>{
  if(invalidFields.has(input.id))return;
  const o=currentOpening(),value=input.id.startsWith('post-')?o.tposts.positions[Number(input.id.slice(5))]:o[input.id],p=shutterMeasurementParts(value,state.units);
  input.value=value==null?'':shutterMeasurementLabel(value,state.units);setFraction(input.id,p.fraction);
 });
}
function bindFrameChoices(){
 document.querySelectorAll('[data-frame-style]').forEach(el=>el.onclick=()=>{
  const o=currentOpening(),style=FRAME_STYLES.find(f=>f.id===el.dataset.frameStyle),previous=frameStyle(o);
  confirmChoice(el,'frame style',previous.name,style.name,(o)=>{
   if(invalidFields.size)return toast('Correct the highlighted field first.');
   o.frame=style.profile;if(style.id!==style.profile)o.frameStyle=style.id;else delete o.frameStyle;
   if(style.profile!=='ST')lastTrimStyles.set(o.id,style.id);
   if(style.profile==='ST'||o.sides==='CW'){o.sides='4W';delete o.frameSides;}
   save();render();document.querySelector(`[data-frame-style="${style.id}"]`)?.focus({preventScroll:true});
  });
 });
 document.querySelectorAll('[data-frame-arrangement]').forEach(el=>el.onclick=()=>{
  const o=currentOpening(),arrangement=el.dataset.frameArrangement,selected=shutterFrameArrangement(o);
  if(arrangement===selected){rememberChoice(el,'frame sides');return;}
  const previous=frameStyle(o);if(previous.profile!=='ST')lastTrimStyles.set(o.id,previous.id);
  const next=applyShutterFrameArrangement(o,arrangement,lastTrimStyles.get(o.id)||'TR');
  const names={all:'Selected frame on all four sides',bottom:'Standard / L on the bottom',standard:'Standard / L on all four sides',custom:'Custom · choose each side',saved:'Saved frame setup'};
  confirmChoice(el,'frame sides',names[selected],names[arrangement]+(frameStyle(next).id!==previous.id?' · '+frameStyle(next).name:''),(o)=>{
   if(invalidFields.size)return toast('Correct the highlighted field first.');
   delete o.frameStyle;delete o.frameSides;Object.assign(o,next);save();render();document.querySelector(`[data-frame-arrangement="${arrangement}"]`)?.focus({preventScroll:true});
  });
 });
 document.querySelectorAll('[data-frame-edge]').forEach(el=>el.onchange=()=>{
  const o=currentOpening(),side=el.dataset.frameEdge,value=el.value,previous=o.frameSides[side];
  el.value=previous;
  const label=id=>FRAME_STYLES.find(f=>f.id===id)?.name||id;
  confirmChoice(el,side+' frame',label(previous),label(value),()=>{
   el.value=value;el.dataset.field='frame-side-'+side;fieldChange(el);
   document.getElementById('frame-side-'+side)?.focus({preventScroll:true});
  });
 });
}
function framePicker(o){
 const selected=frameStyle(o),arrangement=shutterFrameArrangement(o);
 const styles=['ST','MS','TR','MZ','ZF','EL','DS'].map(id=>FRAME_STYLES.find(f=>f.id===id));
 const arrangements=[['all','Z Z Z Z','Selected frame · all four sides'],['bottom','Z Z Z L','Standard / L on the bottom'],['standard','L L L L','Standard / L · all four sides'],['custom','Custom','Choose each side']];
 return `<section class="frame-picker frame-picker-inline" aria-label="Frame configuration"><h3>Frame</h3><p class="control-label">Frame style</p><div class="frame-row">${styles.map(f=>`<button type="button" class="frame-choice ${selected.id===f.id?'selected':''}" data-frame-style="${f.id}" aria-pressed="${selected.id===f.id}" aria-label="${f.name}">${frameThumbnail(f.id)}<strong>${f.name}</strong></button>`).join('')}</div>
 <div class="field frame-sides-choice"><p class="control-label" id="sides-label">Frame sides</p><div class="frame-side-buttons" id="sides" role="group" tabindex="-1" aria-labelledby="sides-label">${arrangements.map(([value,code,label])=>`<button type="button" class="frame-side-button" data-frame-arrangement="${value}" aria-pressed="${arrangement===value}" aria-label="${code} — ${label}">${frameSideDiagram(value,o)}<span class="frame-side-label">${value==='custom'?'<strong>Custom</strong>':''}${label}</span></button>`).join('')}</div></div>
 ${arrangement==='custom'?`<div class="custom-frame-sides" role="group" aria-label="Custom frame sides">${FRAME_EDGES.map(side=>`<div class="field"><label for="frame-side-${side}">${side[0].toUpperCase()+side.slice(1)} frame</label><select id="frame-side-${side}" data-frame-edge="${side}">${styles.map(f=>`<option value="${f.id}" ${o.frameSides?.[side]===f.id?'selected':''}>${h(f.name)}${f.profile==='ST'?' / L':''}</option>`).join('')}</select></div>`).join('')}</div>`:arrangement==='saved'?`<p class="field-help">Saved ${h(o.sides)} frame setup</p>`:''}
 </section>${frameNotice(o)?`<p class="frame-notice">${h(frameNotice(o))}</p>`:''}`;
}
function frameSideDiagram(arrangement,o){
 const edge=arrangement==='standard'?'L':'Z',bottom=arrangement==='all'?'Z':'L';
 let sides={top:edge,left:edge,right:edge,bottom};
 if(arrangement==='custom')sides={top:'CW',left:'CW',right:'CW',bottom:'CW'};
 return `<svg class="frame-side-diagram" viewBox="0 0 112 104" aria-hidden="true"><rect x="28" y="24" width="56" height="56" fill="none" stroke="currentColor" stroke-width="1.5"/><g fill="currentColor" text-anchor="middle" font-size="17" font-weight="600"><text x="56" y="17">${sides.top}</text><text x="14" y="58">${sides.left}</text><text x="98" y="58">${sides.right}</text><text x="56" y="101">${sides.bottom}</text></g></svg>`;
}
function choiceField(key,label,value,options){
 return `<div class="field choice-field"><p class="control-label" id="${key}-label">${label}</p><div class="choice-buttons" id="${key}" role="group" tabindex="-1" aria-labelledby="${key}-label">${Object.entries(options).map(([v,text])=>`<button type="button" data-choice="${key}" value="${h(v)}" aria-pressed="${String(value)===v}">${h(text)}</button>`).join('')}</div></div>`;
}
function shutterMeasurementField(key,label,value){
 const p=shutterMeasurementParts(value,state.units);
 return `<div class="field shutter-measure-field"><label for="${key}">${label} <span>(${state.units})</span></label><input id="${key}" data-field="${key}" data-shutter-measure value="${value==null?'':h(shutterMeasurementLabel(value,state.units))}" inputmode="decimal" autocomplete="off" aria-describedby="error-${key}">${state.units==='in'?`<div class="fraction-buttons" role="group" aria-label="${label} fraction">${SHUTTER_FRACTIONS.map((text,i)=>`<button type="button" data-shutter-fraction="${key}" value="${i}" aria-pressed="${p.fraction===i}" aria-label="${label} fraction ${text}">${text}</button>`).join('')}</div>`:''}<span class="field-error" id="error-${key}" aria-live="polite"></span></div>`;
}
function shutterMeasurementValue(input){
 const raw=input.value.trim();
 const value=raw?parseMeasurement(raw):null;
 if(state.units==='in')setFraction(input.id,shutterMeasurementParts(value).fraction);
 return raw;
}
function setFraction(key,value){document.querySelectorAll(`[data-shutter-fraction="${key}"]`).forEach(b=>b.setAttribute('aria-pressed',String(Number(b.value)===value)));}
function focusOpening(){if(stepPreview()){openingSteps.set(currentOpening().id,1);rememberEditorView();render();}const el=$('#name')||$('#line-product');el?.focus();el?.scrollIntoView({block:'center'});}

const measurementNames={W:'Window opening size',S:'Shutter size',F:'Outside frame size'};
const measurementHelp=()=> 'Enter the shutter width and height.';
const divisionHelp=o=>o.divisionMode==='split'?'Uses the workbook’s split-rod allowance. Leave the position blank to apply the allowance without a separate split.':'Leave the position blank for no divider rail.';
const lightGapHTML=()=>Number.isFinite(result?.gap)?`<p class="light-gap">Light gap <strong>${cut(result.gap)} ${state.outputUnits}</strong></p>`:'';
function openingEditor(o){return `<section class="editor-card shutter-editor">
 ${stepPreview()?`<div class="opening-step-titlebar"><h2 class="opening-step-title" id="opening-step-title" tabindex="-1">${['Opening details','Shutter options','Review this opening'][openingStep()-1]}</h2><div class="btn-row"><button type="button" class="icon-btn" data-action="duplicate-opening" aria-label="Duplicate opening" title="Duplicate opening">${icon('copy')}</button><button type="button" class="icon-btn" data-action="remove-opening" aria-label="Remove opening" title="Remove opening">${icon('trash')}</button></div></div>`:''}
 ${stepSectionStart(1)}
 <div class="editor-header"><h2>Opening ${currentJob().openings.indexOf(o)+1}</h2><div class="btn-row">${btn('Duplicate','duplicate-opening','copy','small ghost')}<button class="icon-btn" data-action="remove-opening" aria-label="Remove opening">${icon('trash')}</button></div></div>
 ${quoteEditing()?`<div class="fields shutter-product">${quoteProductField(o)}</div>`:''}
 <div class="shutter-opening-start">
  ${inputField('name','Room / opening name',o.name)}
  ${choiceField('color','Finish',o.color,COLORS)}
  <div class="shutter-quantity">${inputField('quantity','Quantity',o.quantity,{type:'number'})}</div>
 </div>
 ${constructionChoices(o)}
 ${isSliding(o)?choiceField('mount','Mount',o.mount,{I:'Inside mount',O:'Outside mount'}):''}
 <div class="shutter-size-heading"><h3>Size</h3><span>${isSliding(o)?'Opening / track measurements':'Shutter size'}</span><div class="input-unit-toggle" aria-label="Measurement units"><button data-input-unit="in" aria-pressed="${state.units==='in'}" class="${state.units==='in'?'active':''}">in</button><button data-input-unit="mm" aria-pressed="${state.units==='mm'}" class="${state.units==='mm'?'active':''}">mm</button></div></div>
 <div class="shutter-size-row">${shutterMeasurementField('width',isSliding(o)?'Opening width':'Width',o.width)}${shutterMeasurementField('height','Height',o.height)}</div>
 ${isSliding(o)?`<p class="field-help">Enter the height. We subtract 2 7/8 in to calculate the panel height.</p>${slidingSizeSummary(o)}`:''}
 ${stepSectionEnd()}${stepSectionStart(2)}
 <div class="shutter-basic-choices">
  ${choiceField('louver','Louver size',o.louver,{3:'3 inch',4:'4 inch'})}
  ${choiceField('tilt','Tilt rod',o.tilt,{Back:'Back',Front:'Front',...(o.tilt==='Smart'?{Smart:'Smart View (saved)'}:{})})}
 </div>
 <section class="panel-configuration shutter-section" aria-label="Panel layout"><h3>Panel layout</h3><div id="panel-configuration">${panelConfiguration(o)}</div></section>
 ${isSliding(o)?'':framePicker(o)}
 <section class="shutter-section shutter-rail" aria-label="Divider rail or split tilt rod">
  ${choiceField('divisionMode','Divider rail or split tilt rod',o.divisionMode||'divider',{divider:'Divider rail',split:'Split tilt rod'})}
  ${shutterMeasurementField('divider',o.divisionMode==='split'?'Split from bottom':'Divider from bottom',o.divider||null)}
  <p class="field-help" id="division-help">${divisionHelp(o)}</p>
  ${o.stile==='Reg'?`<div class="saved-stile"><p class="field-help">This saved opening uses a Regular outside stile.</p>${choiceField('stile','Outside stile',o.stile,{Flat:'Use Flat'})}</div>`:''}
 </section>
 ${stepSectionEnd()}${stepSectionStart(3)}
 ${stepPreview()?openingReview(o):''}
 <section class="opening-preview" aria-label="Opening schematic"><div class="preview-heading"><span>Shutter preview</span><small>${isSliding(o)?'Closed panels · track layout below':'Front view · folds shown open'}</small></div><div class="diagram-wrap">${diagram(o)}</div></section>
 <div class="field"><label for="notes">Shop notes</label><textarea id="notes" data-field="notes" maxlength="1200" placeholder="Optional instructions">${h(o.notes)}</textarea></div>
 <div class="calculation-status" id="results">${loading()}</div>
 ${stepSectionEnd()}
</section>`;}

function diagram(o){if(!hasMeasurements(o))return '<p class="preview-placeholder">Enter width and height to see the shutter preview.</p>';if(invalidFields.size||o.tposts&&o.tposts.positions.some((v,i)=>v<=0||v>=o.width||i>0&&v<=o.tposts.positions[i-1]))return '<p class="preview-placeholder">Correct the highlighted fields to see the full opening.</p>';return drawingSVG(o,{louverLayout:result?.status==='preview-only'?undefined:result?.louverLayout??null,widthLabel:`${measure(o.width)} ${state.units}`,heightLabel:`${measure(o.height)} ${state.units}`})+(result?.louverLayout?`<p class="louver-count">${h(louverSummary(result))}</p>`:'');}
const loading=()=>'<div class="loading-text">Calculating from workbook rules…</div><div class="skeleton"></div>';
function partTable(parts){return `<div class="table-scroll"><table><thead><tr><th>PART / PROFILE</th><th class="number">QTY</th><th class="number">CUT LENGTH (${state.outputUnits})</th></tr></thead><tbody>${parts.map((p,i)=>`<tr><td>${h(p.name)}${p.section?` <span class="part-section">· section ${p.section}</span>`:''}<small>${h(p.profile)}</small></td><td class="number">${p.quantity}</td><td class="number" style="font-weight:650;color:#151515">${cut(p.length)} <span style="font-size:calc(9px + var(--text-size-increase, 0pt));font-weight:400;color:#777777">${state.outputUnits}</span></td></tr>`).join('')}</tbody></table></div>`;}

function resultsHTML(){if(calculating)return loading();if(calcError)return `<div class="error-box">${icon('info')} ${h(manufacturingMessage(calcError))} ${fixOpeningButton(calcError)}</div>`;if(!result)return '';return `<div class="results-heading"><div><h3>Calculated cutting list</h3><p>${result.parts.length} part lines · quantities include all identical units</p></div><span class="badge">${icon('check')} Workbook rules</span></div>${calculationWarningsHTML()}${partTable(result.parts)}${result.reviewNotes?.length?`<div class="validation-note">${icon('info')}${result.reviewNotes.map(h).join(' ')}</div>`:''}`;}
function fixOpeningButton(message){return `<button type="button" class="text-btn" data-fix-field="${manufacturingField(message)}">Fix this →</button>`;}
function calculationWarningsHTML(){
  const errors=blockingWarnings(result),notes=panelWidthNotes(result);
  return `${errors.length?`<div class="error-box" role="alert">${errors.map(w=>`<div>${h(manufacturingMessage(w))} ${fixOpeningButton(w)}</div>`).join('')}</div>`:''}${notes.length?`<div class="validation-note" role="status">${icon('info')}<span>${notes.map(h).join(' ')} This width note does not block printing.</span></div>`:''}`;
}
function calculationStatus(){
  if(calculating)return loading();
  if(calcError)return `<div class="error-box" role="alert">${h(manufacturingMessage(calcError))} ${fixOpeningButton(calcError)}</div>`;
  if(!result)return hasMeasurements(currentOpening())?'':'<p class="field-help">Enter width and height to calculate this opening.</p>';
  const messages=calculationWarningsHTML();
  if(result.status==='preview-only')return messages;
  if(quoteEditing())return `${messages||'<div class="status-line">Opening specifications calculated</div>'}${lightGapHTML()}`;
  return `${messages}<div class="status-line"><span>${icon('check')}${result.parts.length} cut lines calculated</span><button class="text-btn" id="review-cut-sheet">Review cut sheet →</button></div>${lightGapHTML()}${result.reviewNotes?.length?`<details class="review-note"><summary>Fabrication notes to verify</summary><p>${result.reviewNotes.map(h).join(' ')}</p></details>`:''}`;
}
async function recalculate({notifyGap=true}={}){const o=currentOpening();if(quoteEditing()&&!isShutterLine(o)){requestNumber++;result=null;calculating=false;calcError='';return;}const serial=++requestNumber;result=null;calcError='';calculating=true;const target=$('#results')||$('#preview-content');if(!target)return;if(!hasMeasurements(o)){calculating=false;target.innerHTML=tab==='preview'?'<p class="preview-placeholder">Enter width and height in Openings before printing this cut sheet.</p>':calculationStatus();if($('.diagram-wrap'))$('.diagram-wrap').innerHTML=diagram(o);return;}if(invalidFields.size){calculating=false;calcError='Correct the highlighted fields to calculate this opening.';target.innerHTML=calculationStatus();return;}target.innerHTML=loading();if($('.diagram-wrap'))$('.diagram-wrap').innerHTML=diagram(o);try{const response=await accountFetch('/api/calculate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(o)});const data=await response.json();if(serial!==requestNumber)return;if(!response.ok)throw new Error(data.error);result=data;}catch(e){if(serial!==requestNumber)return;calcError=e.message==='Failed to fetch'?'The local app server is unavailable. Start the app server and retry.':e.message;}if(serial!==requestNumber)return;calculating=false;if($('.diagram-wrap'))$('.diagram-wrap').innerHTML=diagram(o);if(tab==='preview'&&$('#preview-content')){$('#preview-content').innerHTML=previewContent();}else if($('#results'))$('#results').innerHTML=calculationStatus();checkLightGap(o,notifyGap);}
function checkLightGap(o,notify){
  if(!result)return;
  const key=`${currentJob()?.id}:${o.id}`,warning=result.lightGapWarning;
  if(!warning){notifiedLightGaps.delete(key);return;}
  if(!notify||notifiedLightGaps.get(key)===warning||$('#modal').open)return;
  notifiedLightGaps.set(key,warning);
  modal('Light gap needs attention',`<p><strong>${h(o.name)}</strong></p><p>${h(warning)}</p><p>Current light gap: <strong>${cut(result.gap)} ${state.outputUnits}</strong></p>`,btn('Got it','close',null,'primary'));
}
function previewPage(){const j=currentJob();if(!j.openings.length)return `<div class="empty">${icon('file')}<h2>Add an opening to preview a cut sheet.</h2>${btn('Add opening','add-opening','plus','primary')}</div>`;return `<div class="preview-toolbar"><select id="preview-opening" aria-label="Opening to preview" style="max-width:280px">${j.openings.map(o=>`<option value="${o.id}" ${o.id===activeOpening?'selected':''}>${h(o.name)}</option>`).join('')}</select></div><div id="preview-content">${loading()}</div>`;}
const previewWarning=manufacturingMessage;
function previewContent(){
  if(!result&&!calcError)return loading();
  const j=currentJob(),o=currentOpening(),warnings=calcError?[calcError]:blockingWarnings(result),hasCuts=result&&result.status!=='preview-only';
  const facts=cutSheetFacts(o,result,{measurement:measure,length:cut,inputUnits:state.units,units:state.outputUnits});
  const machining=hasCuts?[...(result.hinges.length?[['Hinges from stile end',result.hinges.map(cut).join(' · ')]]:[]),...result.machining.map(m=>[machiningLabel(m.label),cut(m.value)])]:[];
  const notes=cutSheetNotes(result);
  return `<article class="paper"><header class="paper-header paper-header-compact"><div><small>CUT SHEET${j.revision>1?' · REVISION '+j.revision:''}</small><p>${h(j.number)}${j.customer?` · ${h(j.customer)}`:''}</p></div>${remoteContext?.kind==='order'||remoteContext?.released||remoteContext?.record.status==='ordered'?'':'<button type="button" class="text-btn" data-edit-opening>Edit opening</button>'}</header><h2 class="paper-opening-title">${h(o.name)}</h2><section class="paper-opening"><dl class="spec-grid">${facts.map(([label,value])=>`<div><dt>${h(label)}</dt><dd>${h(value)}</dd></div>`).join('')}</dl><figure class="paper-shutter-preview" aria-label="Shutter preview">${diagram(o)}</figure></section>${o.tposts?`<p class="paper-posts">${o.tposts.construction==='two-piece'?'Two-piece':'One-piece'} posts · Centerlines from left (${state.outputUnits}): ${o.tposts.positions.map(v=>cut(v*25.4)).join(' · ')}</p>`:''}${warnings.length?`<div class="paper-issue" role="alert"><div>${warnings.map(w=>`<p>${h(previewWarning(w))}</p>`).join('')}</div>${remoteContext?.kind==='order'||remoteContext?.released||remoteContext?.record.status==='ordered'?'':'<button type="button" class="text-btn" data-edit-opening>Review options</button>'}</div>`:''}${hasCuts?`${partTable(result.parts)}<section class="paper-machining"><h3>Machining <span>(${state.outputUnits})</span></h3><dl class="spec-grid">${machining.map(([label,value])=>`<div><dt>${h(label)}</dt><dd>${h(value)}</dd></div>`).join('')}</dl></section>${notes.length?`<div class="paper-notes">${notes.map(n=>`<p>${h(n)}</p>`).join('')}</div>`:''}${o.notes?`<p class="paper-notes"><b>Shop notes:</b> ${h(o.notes)}</p>`:''}`:''}<div class="paper-footer">Cut lengths in ${state.outputUnits}</div></article>`;
}
function jobDetails(){const j=currentJob();return `<section class="details-card"><h2>Job details</h2><p class="subheading" style="margin:7px 0 25px">Keep the order details together with every opening.</p><div class="fields">${inputField('job-name','Job name',j.name,{wide:true,maxlength:'100'})}${remoteContext?.kind==='draft'?`<div class="field"><label for="job-contact">Link to contact (optional)</label><select id="job-contact"><option value="">No linked contact</option>${(remoteContext.contacts||[]).map(c=>`<option value="${h(c.id)}" ${c.id===j.contactId?'selected':''}>${h([c.firstName,c.lastName].filter(Boolean).join(' '))}</option>`).join('')}</select></div>`:''}${j.contactId?`<div class="field"><label>Customer</label><a href="/contacts.html#contact/${h(j.contactId)}">${h(j.customer)}</a></div>`:inputField('job-customer','Customer name (optional)',j.customer,{maxlength:'120'})}${inputField('job-number','Job number',j.number,{maxlength:'120'})}${inputField('job-due','Target date',j.due,{type:'date'})}<div class="field wide"><label for="job-notes">Job notes</label><textarea id="job-notes" data-job-field="notes" maxlength="1200">${h(j.notes)}</textarea></div></div><div class="btn-row">${btn(j.archived?'Restore job':'Archive job','archive-job','archive','ghost')}${btn('Back to openings','back-openings','arrow','primary')}</div></section>`;}
function jobsPage(cutsheets=false){const jobs=state.jobs.filter(j=>!!j.archived===archiveView);return `<div class="page-heading"><div><div class="eyebrow">YOUR JOBS</div><h1>${cutsheets?'Cut sheets':archiveView?'Archived jobs':'Jobs'}</h1><p class="subheading">${cutsheets?'Clean, organized cutting lists for every opening.':'Measurements and cut sheets, together.'}</p></div>${btn('New job','new-job','plus','primary')}</div><div class="jobs-toolbar"><div class="search">${icon('search')}<input id="job-search" placeholder="Search jobs, customers, or job numbers…" aria-label="Search jobs" value="${h(searchTerm)}"></div><div class="btn-row">${btn(archiveView?'Active jobs':'View archive','toggle-archive','archive','small')}${btn('Import backup','import','upload','small')}</div></div><div class="job-grid" id="job-grid">${jobCards(jobs,cutsheets)}</div>`;}
function jobCards(jobs,cutsheets){const found=jobs.filter(j=>`${j.name} ${j.customer} ${j.number}`.toLowerCase().includes(searchTerm.toLowerCase()));return found.length?found.map(j=>`<button class="job-card" data-job="${j.id}" ${cutsheets?'data-preview="true"':''}>${icon(cutsheets?'file':'jobs')}<div class="eyebrow">${h(j.number)} ${j.sample?' / EXAMPLE':''}</div><h2>${h(j.name)}</h2><p>${h(j.customer||'Customer not entered')}</p><footer><span>${j.openings.length} openings · ${total(j,'units')} units</span><span class="badge ${j.archived?'ghost':'amber'}">${j.archived?'Archived':'Active'}</span></footer></button>`).join(''):`<div class="empty" style="grid-column:1/-1">${icon('jobs')}<h2>${searchTerm?'No matching jobs.':archiveView?'No archived jobs.':'Your next job belongs here.'}</h2><p>${searchTerm?'Try a different customer or job number.':'Create a job, add openings, and generate your cutting lists.'}</p></div>`;}
function brandingSettings(){return `<section class="settings-card branding-settings"><h2>Company logo</h2><p>Show your logo in the top-left corner of the app. Saved in this browser.</p><div class="logo-preview">${brandLogo?`<img src="${h(brandLogo.data)}" alt="Current company logo">`:`<span>${icon('panels')}<b>Cut sheet</b></span>`}</div>${brandLogo?`<p class="logo-filename">${h(brandLogo.name)}</p>`:''}<div class="btn-row"><button type="button" class="btn" id="upload-logo">${icon('upload')}${brandLogo?'Replace logo':'Upload logo'}</button>${brandLogo?'<button type="button" class="text-btn" id="remove-logo">Remove logo</button>':''}<input type="file" id="logo-file" accept="image/png,image/jpeg,image/webp" hidden></div><p class="logo-help">PNG, JPG, or WebP · Up to 5 MB. A transparent PNG works best.</p><div id="logo-error" class="field-error" role="alert"></div></section>`;}
function bindBranding(){
  $('#upload-logo')?.addEventListener('click',()=>$('#logo-file').click());
  $('#logo-file')?.addEventListener('change',async e=>{
    const file=e.target.files[0];if(!file||logoBusy)return;
    logoBusy=true;const button=$('#upload-logo');button.disabled=true;button.textContent='Saving logo…';$('#logo-error').textContent='';
    try{const logo=await readLogoFile(file);try{saveLogo(logo);}catch{throw new Error('The logo could not be saved. Browser storage may be full. Try a smaller image.');}brandLogo=logo;render();toast('Logo updated.');}
    catch(error){if($('#logo-error'))$('#logo-error').textContent=error.message;else toast(error.message);}
    finally{logoBusy=false;if($('#upload-logo')){$('#upload-logo').disabled=false;$('#upload-logo').innerHTML=icon('upload')+(brandLogo?'Replace logo':'Upload logo');}if($('#logo-file'))$('#logo-file').value='';}
  });
  $('#remove-logo')?.addEventListener('click',()=>{
    if(logoBusy)return;
    try{saveLogo(null);brandLogo=null;render();toast('Logo removed.');}catch{$('#logo-error').textContent='The logo could not be removed. Please try again.';}
  });
}
function settingsPage(){return `<div class="page-heading"><div><div class="eyebrow">PREFERENCES</div><h1>Settings</h1><p class="subheading">Logo, units, backups, and calculation details.</p></div></div><div class="settings-layout">${brandingSettings()}<section class="settings-card"><h2>Measurements & output</h2><p>Input units can change without altering the physical dimensions. PDF and cutting-list units are controlled separately.</p><div class="fields">${selectField('settings-input','Input measurements',state.units,{in:'Inches (decimals or fractions)',mm:'Millimeters'})}${selectField('settings-output','Cut sheet dimensions',state.outputUnits,{mm:'Millimeters · 2 decimals',in:'Decimal inches · 4 decimals'})}</div><div class="row" style="margin-top:16px"><span>Paper size</span><b>US Letter · portrait</b></div><div class="row"><span>Opening organization</span><b>Each opening starts on a new page</b></div><div class="row"><span>Saw-kerf allowance</span><b>None added</b></div></section><section class="settings-card"><h2>Calculation source</h2><p>Extracted from your FRENCH CUT NEW PROGRAM workbook. The app evaluates the original formulas for the supported configuration.</p><div class="row"><span>Workbook version</span><b>20170211FCNew</b></div><div class="row"><span>Product family</span><b>Shutter Smart</b></div><div class="row"><span>Configuration</span><b>Standard and T-post</b></div><div class="row"><span>Production validation</span><b style="color:var(--amber)">Pending reference cut sheets</b></div><p style="margin:17px 0 0"><a href="https://docs.google.com/spreadsheets/d/1FGIwG2DLI-5FSbQ9KTH9_tn0t5dYAbkG/edit" target="_blank" rel="noopener">Open source workbook ↗</a></p></section><section class="settings-card"><h2>Saved jobs</h2><p>Jobs are stored in this browser on this computer. Export backups regularly, or import one to move jobs to another browser. Importing merges jobs by ID.</p><div class="btn-row">${btn('Export backup','backup','download')}${btn('Import backup','import','upload')}</div></section><section class="settings-card"><h2>What this version supports</h2><ul><li>Standard: 1, 2, 3, or 4 equal panels</li><li>T-post: 1–4 posts with a panel arrangement for each section</li><li>3 inch and 4 inch louvers</li><li>Standard, designer, Z, and trim frames</li><li>Inside and outside mounts</li><li>One optional divider rail or tilt-rod split</li><li>Opening PDFs and combined cutting lists</li></ul><p>French cuts, double-hung, wood, and specialty hardware are not enabled in this version.</p></section></div>`;}

document.addEventListener('click',e=>{const el=e.target.closest('[data-opening]');if(!el)return;if(invalidFields.size)return toast('Correct the highlighted field before switching openings.');activeOpening=el.dataset.opening;rememberEditorView();render();focusOpening();});
document.addEventListener('click',e=>{const control=e.target.closest('[data-fix-field]');if(!control)return;const opening=currentJob()?.openings.find(o=>o.id===control.dataset.fixOpening);if(opening)activeOpening=opening.id;$('#modal')?.close();tab='openings';if(stepPreview())openingSteps.set(currentOpening().id,['width','height','quantity','name'].includes(control.dataset.fixField)?1:2);render();const input=document.getElementById(control.dataset.fixField)||(control.dataset.fixField==='mount'?document.querySelector('[data-frame-style][aria-pressed="true"]'):null);input?.scrollIntoView({block:'center'});input?.focus({preventScroll:true});});
function bind(){
 bindOpeningSteps();
 document.querySelectorAll('[data-entry-mode]').forEach(el=>el.addEventListener('click',()=>changeEntryMode(el.dataset.entryMode)));
 $('#job-contact')?.addEventListener('change',e=>{const j=currentJob(),c=remoteContext.contacts.find(c=>c.id===e.target.value);j.contactId=e.target.value;if(c)j.customer=[c.firstName,c.lastName].filter(Boolean).join(' ').slice(0,120);save();render();});
  $('#line-product')?.addEventListener('change',e=>chooseLineProduct(e.target.value));
  $('#elegant-product')?.addEventListener('change',e=>chooseLineProduct(e.target.value));
  bindEwfFields();bindBroadleafFields();
  bindQuoteAdjustments();
  bindPanelConfiguration();bindBranding();$('#preview-content')?.addEventListener('click',e=>{if(e.target.closest('[data-edit-opening]')){const needsMountReview=result?.warnings.some(w=>w.includes('WRONG MOUNT OPTION OR FRAME'));tab='openings';render();if(needsMountReview){document.querySelector('[data-frame-style][aria-pressed="true"]')?.focus();}else $('#name')?.focus();}});bindFrameChoices();$('#results')?.addEventListener('click',e=>{if(e.target.closest('#review-cut-sheet')){if(invalidFields.size)return toast('Correct the highlighted field first.');tab='preview';render();}});document.querySelectorAll('[data-action]').forEach(el=>el.addEventListener('click',()=>action(el.dataset.action)));document.querySelectorAll('[data-job]').forEach(el=>el.addEventListener('click',()=>{if(invalidFields.size)return toast('Correct the highlighted field first.');activeJob=el.dataset.job;activeOpening=null;invalidFields.clear();view='editor';tab=el.dataset.preview?'preview':'openings';render();}));document.querySelectorAll('[data-tab]').forEach(el=>el.addEventListener('click',()=>{if(invalidFields.size){toast('Correct the highlighted field first.');return;}tab=el.dataset.tab;rememberEditorView();render();}));document.querySelectorAll('[data-input-unit]').forEach(el=>el.addEventListener('click',()=>{if(invalidFields.size)return toast('Correct the highlighted field first.');state.units=el.dataset.inputUnit;save();render();}));document.querySelectorAll('[data-field]').forEach(el=>{el.addEventListener('change',()=>fieldChange(el));if(el.tagName!=='SELECT')el.addEventListener('input',()=>fieldChange(el,false));});$('#job-notes')?.addEventListener('change',e=>{currentJob().notes=e.target.value;save();});$('#preview-opening')?.addEventListener('change',e=>{activeOpening=e.target.value;recalculate();});$('#job-search')?.addEventListener('input',e=>{searchTerm=e.target.value;$('#job-grid').innerHTML=jobCards(state.jobs.filter(j=>!!j.archived===archiveView),view==='cutsheets');document.querySelectorAll('[data-job]').forEach(el=>el.addEventListener('click',()=>{activeJob=el.dataset.job;activeOpening=null;view='editor';tab=el.dataset.preview?'preview':'openings';render();}));});}
function bindBroadleafFields(){
 const o=currentOpening();if(!o||productId(quoteLine(o))!==BROADLEAF_ID)return;
 bindBroadleafFractions();
 document.querySelectorAll('[data-broadleaf]').forEach(el=>{
  el.addEventListener(el.tagName==='SELECT'||el.type==='checkbox'?'change':'input',()=>{
   const o=currentOpening(),key=el.dataset.broadleaf,b=structuredClone(o.broadleaf||defaultBroadleaf());
   const rerender=['mount','reference','frame','divider','postCount','postSize'].includes(key);
   if(rerender&&[...invalidFields.keys()].some(k=>k!=='broadleaf-'+key)){el.value=String(b[key]);return toast('Correct the highlighted fields first.');}
   try{
    let value=el.type==='checkbox'?el.checked:el.value;
    if(el.hasAttribute('data-broadleaf-measure')){value=broadleafMeasurementValue(el);value=value.trim()?parseMeasurement(value):null;if(value!=null&&state.units==='mm')value/=25.4;}
    if(['sideBySide','sillCap'].includes(key))value=value==='true';
    if(key==='postCount')value=Number(value);
    if(key.startsWith('section-'))b.sections[Number(key.slice(8))]=value;
    else if(key.startsWith('post-'))b.postLocations[Number(key.slice(5))]=value;
    else if(key.startsWith('divider-'))b.dividerLocations[Number(key.slice(8))]=value;
    else b[key]=value;
    if(key==='mount'&&!broadleafFrames(b.mount).some(f=>f.id===b.frame))b.frame='';
    if(['DF20','CF20'].includes(b.frame))b.postSize='1';
    if(b.postSize==='2')b.postFace='beaded';
    o.broadleaf=normalizeBroadleaf(b);invalidFields.delete('broadleaf-'+key);el.removeAttribute('aria-invalid');
    const error=$('#broadleaf-'+key+'-error');if(error)error.textContent='';
    save();if(rerender){render();$('#broadleaf-'+key)?.focus();}
   }catch(e){if(remoteContext){remoteContext.dirty=true;if(autoEditable())draftAutosave.changed();}invalidFields.set('broadleaf-'+key,e.message);el.setAttribute('aria-invalid','true');const error=$('#broadleaf-'+key+'-error');if(error)error.textContent=e.message;else toast(e.message);refreshQuotePricing();}
  });
 });
}
function bindEwfFields(){
 const o=currentOpening();if(!o||productId(quoteLine(o))!==EWF_ID)return;
 for(const key of ['width','height']){
  const el=$('#'+key);if(!el)continue;el.setAttribute('aria-describedby','error-'+key);const problem=ewfDimensionError(key,o[key],o.ewf);
  if(problem){invalidFields.set(key,problem);el.dataset.ewfLimitError='true';el.setAttribute('aria-invalid','true');$('#error-'+key).textContent=problem;}
 }
 document.querySelectorAll('[data-ewf]').forEach(el=>{
  const update=()=>{
   const o=currentOpening(),key=el.dataset.ewf,rerender=['operation','model','fabricCode','customCordLength','lightBlocker'].includes(key);let value=el.type==='checkbox'?el.checked:el.value;
   if(rerender&&[...invalidFields.keys()].some(k=>!(['width','height'].includes(k)&&$('#'+k)?.dataset.ewfLimitError)&&!(k==='ewf-cordLength'&&(key==='operation'||key==='customCordLength'&&!value))&&!(k==='ewf-lightBlockerFeet'&&key==='lightBlocker'&&!value))){if(el.type==='checkbox')el.checked=o.ewf[key];else el.value=o.ewf[key];return toast('Correct the highlighted fields first.');}
   try{
    if(['cordLength','lightBlockerFeet'].includes(key))value=value.trim()?parseMeasurement(value):null;
    o.ewf=normalizeEwf({...o.ewf,...(key==='model'||key==='fabricCode'?{fabricCode:'',colorName:'',colorNumber:''}:{}),[key]:value});invalidFields.delete('ewf-'+key);el.removeAttribute('aria-invalid');
    const error=$('#ewf-'+key+'-error');if(error)error.textContent='';
    // A control-system change changes the supplier price; require a fresh unit price.
    if(key!=='windowLocation'){delete currentJob().unitPrices[o.id];invalidFields.delete('price-unitPrice');if($('#price-unitPrice')){$('#price-unitPrice').value='';$('#price-unitPrice').removeAttribute('aria-invalid');$('#price-unitPrice-error').textContent='';}}
    if(key==='operation'||key==='model'||key==='fabricCode'){for(const k of ['width','height','ewf-cordLength','price-unitPrice'])invalidFields.delete(k);}
    if(key==='customCordLength'&&!value)invalidFields.delete('ewf-cordLength');
    if(key==='lightBlocker'&&!value)invalidFields.delete('ewf-lightBlockerFeet');
    for(const dimension of ['width','height']){const problem=ewfDimensionError(dimension,o[dimension],o.ewf),input=$('#'+dimension);if(problem){invalidFields.set(dimension,problem);if(input)input.dataset.ewfLimitError='true';input?.setAttribute('aria-invalid','true');}else{invalidFields.delete(dimension);if(input)delete input.dataset.ewfLimitError;input?.removeAttribute('aria-invalid');}if($('#error-'+dimension))$('#error-'+dimension).textContent=problem;}
    save();if(rerender){render();$('#ewf-'+key)?.focus();}
   }catch(e){invalidFields.set('ewf-'+key,e.message);el.setAttribute('aria-invalid','true');const error=$('#ewf-'+key+'-error');if(error)error.textContent=e.message;else toast(e.message);}
  };
  el.addEventListener(el.tagName==='SELECT'||el.type==='checkbox'?'change':'input',update);
 });
}
function fieldChange(el,notifyGap=true){const key=el.dataset.field;
 if(key==='sides'||key.startsWith('frame-side-')){
  const o=currentOpening();
  if(invalidFields.size){el.value=key==='sides'?o.sides:o.frameSides?.[key.slice(11)];return toast('Correct the highlighted fields first.');}
  if(key==='sides'){
   if(el.value==='CW')o.frameSides=Object.fromEntries(Object.entries(frameSideStyles(o)).map(([side,style])=>[side,style?.id||frameStyle(o).id]));
   else delete o.frameSides;
   o.sides=el.value;
  }else o.frameSides={...o.frameSides,[key.slice(11)]:el.value};
  save();render();return;
 }
if(key==='post-count'){const o=currentOpening();if(!preparePostRedistribution()){el.value=String(o.tposts.positions.length);return;}const n=Number(el.value);o.tposts.positions=Array.from({length:n},(_,i)=>o.width>0?o.width*(i+1)/(n+1):null);o.tposts.sections=Array.from({length:n+1},(_,i)=>o.tposts.sections[i]||{left:1,right:1});save();render();return;}if(key.startsWith('settings-')){state[key==='settings-input'?'units':'outputUnits']=el.value;save();return;}if(key.startsWith('job-')){const k=key.slice(4);if(['name','number'].includes(k)&&!el.value.trim()){toast('Job name and number cannot be blank.');el.setAttribute('aria-invalid','true');invalidFields.set(key,'Job name and number cannot be blank.');if(remoteContext)remoteContext.dirty=true;return;}invalidFields.delete(key);el.removeAttribute('aria-invalid');currentJob()[k]=el.value.trim();save();if(k==='name')$('.page-heading h1').textContent=currentJob().name;if(k==='customer')$('.page-heading .subheading').textContent=currentJob().customer||'Customer not entered';return;}const o=currentOpening();try{let value=el.hasAttribute?.('data-shutter-measure')?shutterMeasurementValue(el):productId(quoteLine(o))===BROADLEAF_ID&&['width','height'].includes(key)?broadleafMeasurementValue(el):el.value;if(['width','height','divider'].includes(key)||/^post-\d+$/.test(key)){value=!value.trim()?(key==='divider'?0:null):parseMeasurement(value);if(state.units==='mm'&&value!=null)value/=25.4;if(value!=null&&!Number.isFinite(value))throw new Error('Enter a finite measurement.');if(key!=='divider'&&value!=null&&value<=0)throw new Error('Measurement must be greater than zero.');if(isShutterLine(o)&&!isSliding(o)&&(key==='width'&&!o.tposts&&!stepPreview()&&value>106||key==='height'&&value>114))throw new Error(`The workbook limit is ${key==='width'?106:114} inches.`);if(isSliding(o)&&['width','height'].includes(key)){const problem=slidingDimensionError(o,key,value);if(problem)throw new Error(problem);}if(productId(quoteLine(o))===EWF_ID&&['width','height'].includes(key)){const problem=ewfDimensionError(key,value,o.ewf);if(problem)throw new Error(problem);}if(productId(quoteLine(o))===BROADLEAF_ID&&['width','height'].includes(key)){const problem=broadleafDimensionError(key,value);if(problem)throw new Error(problem);}if(!isShutterLine(o)&&value>10000)throw new Error('Measurements must not exceed 10,000 inches.');}else if(['quantity','louver'].includes(key)){value=Number(value);if(!Number.isInteger(value)||value<1||value>100)throw new Error('Enter a whole number between 1 and 100.');}else if(key==='name'){value=value.trim();if(!value)throw new Error('Give this opening a name.');}if(key==='layout'){[o.left,o.right]=value.split('-').map(Number);}else if(/^post-\d+$/.test(key)){o.tposts.positions[Number(key.slice(5))]=value;}else if(/^section-\d+$/.test(key)){const [left,right]=value.split('-').map(Number);o.tposts.sections[Number(key.slice(8))]={left,right};}else if(key==='post-construction'){o.tposts.construction=value;}else{if(['width','height'].includes(key)&&o[key]!==value&&productId(quoteLine(o))===EWF_ID){delete currentJob().unitPrices[o.id];if($('#price-unitPrice'))$('#price-unitPrice').value='';}o[key]=value;}if(key==='width'&&o.tposts&&value!=null)o.tposts.positions=o.tposts.positions.map((p,i)=>{if(p!=null)return p;const position=value*(i+1)/(o.tposts.positions.length+1),input=$('#post-'+i);if(input){input.value=shutterMeasurementLabel(position,state.units);setFraction(input.id,shutterMeasurementParts(position,state.units).fraction);}return position;});invalidFields.delete(key);el.removeAttribute('aria-invalid');const err=$('#error-'+key);if(err)err.textContent='';validatePostFields();save();refreshOpeningSummary();recalculate({notifyGap});}catch(e){if(remoteContext){remoteContext.dirty=true;if(autoEditable())draftAutosave.changed();}delete el.dataset.geometryError;delete el.dataset.ewfLimitError;invalidFields.set(key,e.message);el.setAttribute('aria-invalid','true');const err=$('#error-'+key);if(err)err.textContent=e.message;refreshOpeningSummary();recalculate();}}
function validatePostFields(){
  const o=currentOpening();if(!o?.tposts||!(o.width>0))return;
  for(let i=0;i<o.tposts.positions.length;i++){const key='post-'+i,el=$('#'+key);if(el?.dataset.geometryError){invalidFields.delete(key);delete el.dataset.geometryError;el.removeAttribute('aria-invalid');$('#error-'+key).textContent='';}}
  o.tposts.positions.forEach((value,i)=>{const key='post-'+i,el=$('#'+key);if(!el||invalidFields.has(key))return;const previous=i?o.tposts.positions[i-1]:0;let message='';if(value<=0||value>=o.width)message=`Post ${i+1} must be inside the ${measure(o.width)} ${state.units} opening.`;else if(value<=previous)message=`Post ${i+1} must be farther right than post ${i} (${measure(previous)} ${state.units}).`;if(message){invalidFields.set(key,message);el.dataset.geometryError='true';el.setAttribute('aria-invalid','true');$('#error-'+key).textContent=message;}});
}
function refreshOpeningSummary(){
  const o=currentOpening(),card=document.querySelector(`.opening-card[data-opening="${o.id}"]`);
  if(isSliding(o)&&$('#sliding-size-summary'))$('#sliding-size-summary').outerHTML=slidingSizeSummary(o);
  if($('#measurement-help'))$('#measurement-help').textContent=measurementHelp(o);
  if($('#division-help'))$('#division-help').textContent=divisionHelp(o);
  const dividerLabel=document.querySelector('label[for="divider"]');if(dividerLabel)dividerLabel.innerHTML=(o.divisionMode==='split'?'Split from bottom':'Divider from bottom')+` <span>(${state.units})</span>`;
  document.querySelector('#divider')?.closest('.shutter-measure-field')?.querySelector('.fraction-buttons')?.setAttribute('aria-label',(o.divisionMode==='split'?'Split from bottom':'Divider from bottom')+' fraction');
  document.querySelectorAll('[data-shutter-fraction="divider"]').forEach(b=>b.setAttribute('aria-label',(o.divisionMode==='split'?'Split from bottom':'Divider from bottom')+' fraction '+SHUTTER_FRACTIONS[Number(b.value)]));
  if(card){card.querySelector('strong').textContent=o.name;card.querySelector('.dims').textContent=`${shutterMeasurementLabel(o.width,state.units)} × ${shutterMeasurementLabel(o.height,state.units)} ${state.units}`;card.querySelector('small').textContent=quoteEditing()?`${productName(quoteLine(o))} · ${o.quantity} unit${o.quantity===1?'':'s'}`:`${panelCount(o)} panels · ${o.quantity} unit${o.quantity===1?'':'s'}`;}
  refreshQuotePricing();
  if($('.metrics'))$('.metrics').outerHTML=metrics(currentJob());
  if($('.diagram-wrap'))$('.diagram-wrap').innerHTML=diagram(o);
  document.querySelectorAll('[data-tpost-preset]').forEach(el=>{const p=TPOST_LAYOUTS.find(p=>p.id===el.dataset.tpostPreset),selected=!!o.tposts&&o.tposts.sections.length===p.sections.length&&o.tposts.sections.every((section,i)=>section.left===p.sections[i].left&&section.right===p.sections[i].right);el.classList.toggle('selected',selected);el.setAttribute('aria-pressed',String(selected));});
  const stats=document.querySelectorAll('.diagram-stats strong');if(stats.length){stats[0].textContent=`${o.left} left / ${o.right} right`;stats[1].textContent=`${o.louver} inch`;}
  const summary=document.querySelectorAll('.summary-box .row b');if(summary.length){summary[1].textContent=COLORS[o.color];summary[2].textContent=FRAMES[o.frame];summary[3].textContent=panelCount(o)*o.quantity;}
}
function modal(title,body,footer){const d=$('#modal');d.innerHTML=`<div class="modal-heading"><h2 id="modal-title">${title}</h2><button class="icon-btn" id="modal-close" aria-label="Close dialog">${icon('close')}</button></div><div class="modal-body">${body}</div><div class="modal-footer">${footer}</div>`;d.setAttribute('aria-labelledby','modal-title');$('#modal-close').onclick=()=>d.close();d.showModal();d.querySelectorAll('[data-action="close"]').forEach(x=>x.onclick=()=>d.close());}
function openNewJob(){modal('Start a new job',`<p>Give the job a name. You can add openings right after.</p><form id="new-job-form"><div class="fields"><div class="field wide"><label for="new-name">Job name</label><input id="new-name" name="name" placeholder="e.g. Hawthorne residence" maxlength="100" required autofocus></div><div class="field wide"><label for="new-customer">Customer</label><input id="new-customer" name="customer" maxlength="120" placeholder="Customer or company"></div><div class="field wide"><label for="new-number">Job number</label><input id="new-number" name="number" maxlength="120" value="JOB-${String(state.jobs.filter(j=>!j.sample).length+1).padStart(3,'0')}" required></div></div><p class="field-error" id="modal-error" style="margin:12px 0 0"></p></form>`,`${btn('Cancel','close',null)}<button class="btn primary" type="submit" form="new-job-form">Create job ${icon('arrow')}</button>`);$('#new-job-form').onsubmit=e=>{e.preventDefault();const name=$('#new-name').value.trim(),number=$('#new-number').value.trim();if(!name||!number)return $('#modal-error').textContent='Enter a job name and number.';const j={id:uid(),name,number,customer:$('#new-customer').value.trim(),due:'',notes:'',sample:false,archived:false,updated:new Date().toISOString(),openings:[]};state.jobs.unshift(j);activeJob=j.id;activeOpening=null;view='editor';tab='openings';invalidFields.clear();save();$('#modal').close();render();toast('Job created. Add your first opening.');};}
async function sendToShop(){
  if(invalidFields.size)return toast('Correct the highlighted field before sending to the shop.');
  if(remoteContext?.kind==='draft'){try{await persistRemote();}catch(e){return toast(e.message);}}
  const job=currentJob();if(!job?.openings.length)return toast('Add an opening first.');
  try{
    const session=await shopRequest('session');
    if(!session.configured){toast('Connect shared shop storage on the hosted site first.');return;}
    if(session.role!=='owner'){location.href='/owner.html';return;}
  }catch(error){return toast(error.message);}
  modal('Send to Production',`<p>Production receives a fixed copy of every calculated cut sheet in <strong>${h(job.name)}</strong>. Workers can check off cuts and finishing steps. You can revise measurements later with Edit cut sheet. Downloading a PDF alone does not send the job.</p><form id="release-form"><div class="fields"><div class="field"><label for="release-time">Estimated cutting time (minutes)</label><input id="release-time" type="number" min="0" max="60000" step="1" placeholder="e.g. 90"></div><div class="field"><label for="release-due">Target date</label><input id="release-due" type="date" value="${h(job.due||'')}"></div></div><p class="field-help">The timer tracks active cutting time and excludes pauses. An estimate lets the dashboard flag jobs running over.</p></form><p class="field-error" id="release-error" role="alert"></p>`,`${btn('Cancel','close')}<button class="btn primary" type="submit" form="release-form" id="release-save">Send to Production</button>`);
  $('#release-form').onsubmit=async event=>{
    event.preventDefault();const button=$('#release-save');button.disabled=true;button.textContent='Sending…';
    try{if(remoteContext?.kind==='order')await shopRequest('order-release',{id:remoteContext.record.id,version:remoteContext.record.version,targetMinutes:Number($('#release-time').value),due:$('#release-due').value});else if(remoteContext?.kind==='draft')await shopRequest('draft-release',{id:job.id,version:remoteContext.record.version,targetMinutes:Number($('#release-time').value),due:$('#release-due').value});else await shopRequest('publish',{job:structuredClone(job),targetMinutes:Number($('#release-time').value),due:$('#release-due').value});$('#modal').close();await loadRemote();toast('Job released. Track its progress in Production.');}
    catch(error){const opening=job.openings.find(o=>error.message.includes(o.name+':'));$('#release-error').innerHTML=h(previewWarning(error.message))+` <button type="button" class="text-btn" data-fix-field="${manufacturingField(error.message)}" data-fix-opening="${h(opening?.id||activeOpening)}">Review this opening →</button>`;button.disabled=false;button.textContent='Send to Production';}
  };
}
async function openPDF(){if(revisionEditing())return toast('Review and send the updated cut sheet before printing.');const incomplete=currentJob()?.openings.find(o=>!hasMeasurements(o));if(incomplete)return toast(incomplete.name+': enter width and height before printing.');if(remoteContext?.kind==='draft'&&remoteContext.dirty){try{await persistRemote();}catch(e){return toast(e.message);}}if(invalidFields.size)return toast('Correct the highlighted field before generating a PDF.');const j=currentJob();if(!j||!j.openings.length)return toast('Add at least one opening first.');modal('Generate cut sheets',`<p>A clean US Letter PDF, ready to save or print. Dimensions are labeled on every page.</p><label class="option-card"><input type="radio" name="pdf-mode" value="all" checked><span><strong>All openings</strong><small>Each opening starts on a new page · ${j.openings.length} openings</small></span></label><label class="option-card"><input type="radio" name="pdf-mode" value="current"><span><strong>Selected opening</strong><small>${h(currentOpening()?.name)}</small></span></label><label class="option-card"><input type="radio" name="pdf-mode" value="combined"><span><strong>Combined cutting list</strong><small>Matching parts grouped by exact size, finish, and profile</small></span></label><div class="field" style="margin-top:19px"><label for="pdf-units">Cut length units</label><select id="pdf-units"><option value="mm" ${state.outputUnits==='mm'?'selected':''}>Millimeters · 2 decimals</option><option value="in" ${state.outputUnits==='in'?'selected':''}>Decimal inches · 4 decimals</option></select></div><p class="field-error" id="pdf-error" role="alert" style="margin:12px 0 0"></p>`,`${btn('Cancel','close',null)}<button class="btn primary" id="download-pdf">${icon('download')}Download Print PDF</button>`);$('#download-pdf').onclick=async()=>{const button=$('#download-pdf'),mode=$('input[name="pdf-mode"]:checked').value;button.disabled=true;button.textContent='Generating PDF…';$('#pdf-error').textContent='';try{const snapshot=structuredClone(j);if(mode==='current')snapshot.openings=[structuredClone(currentOpening())];const response=await accountFetch('/api/pdf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({job:snapshot,combined:mode==='combined',units:$('#pdf-units').value})});if(!response.ok){const data=await response.json();throw new Error(data.error);}download(await response.blob(),`${j.number.replace(/[^\w-]/g,'-')}-${mode==='combined'?'combined-list':mode==='current'?'opening':'cut-sheets'}.pdf`);$('#modal').close();toast('PDF downloaded. Open it to print.');}catch(e){$('#pdf-error').textContent=previewWarning(e.message);button.disabled=false;button.innerHTML=icon('download')+'Download Print PDF';}};}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function backup(){download(new Blob([JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'}),`cut-sheet-backup-${new Date().toISOString().slice(0,10)}.json`);toast('Backup exported. Keep it somewhere safe.');}
async function importBackup(){const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.onchange=async()=>{const file=input.files[0];if(!file)return;try{if(file.size>5e6)throw new Error('Backup must be smaller than 5 MB.');const data=JSON.parse(await file.text());if(data.schema!==1||!Array.isArray(data.jobs)||data.jobs.length>500)throw new Error('This is not a compatible job backup.');const seen=new Set();for(const j of data.jobs){if(typeof j.id!=='string'||!/^[-a-zA-Z0-9]{1,64}$/.test(j.id)||seen.has(j.id)||typeof j.name!=='string'||j.name.length>100||typeof j.number!=='string'||j.number.length>120||typeof j.customer!=='string'||j.customer.length>120||!Array.isArray(j.openings)||j.openings.length>100||typeof j.updated!=='string')throw new Error('Backup contains an invalid job.');seen.add(j.id);const ids=new Set();for(const o of j.openings){if(typeof o.id!=='string'||!/^[-a-zA-Z0-9]{1,64}$/.test(o.id)||ids.has(o.id)||typeof o.name!=='string'||o.name.length>80)throw new Error('Backup contains an invalid opening.');ids.add(o.id);const r=await accountFetch('/api/calculate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(o)});if(!r.ok)throw new Error(`Cannot import ${o.name}: ${(await r.json()).error}`);}}
    // Newer local jobs win. Restore does not silently replace subsequent work with an old backup.
    let count=0;for(const j of data.jobs){const i=state.jobs.findIndex(x=>x.id===j.id);if(i<0){state.jobs.push(j);count++;}else if(j.updated>state.jobs[i].updated){state.jobs[i]=j;count++;}}
    save(false);view='jobs';render();toast(`${count} jobs imported or updated. Existing newer jobs kept.`);
  }catch(e){toast(e.message);}};input.click();}
function action(name){if(remoteSaving&&(orderEditing()||revisionEditing()))return;if(name==='revise-cut-sheet')return beginRevision();if(name==='review-revision')return reviewRevision().catch(e=>toast(e.message));if(name==='cancel-revision')return cancelRevision();if(name==='order-edit'&&remoteContext?.kind==='order'&&!remoteContext.released){remoteContext.editing=true;for(const o of currentJob().openings)if(o.sizeMethod!=='S'||!isSliding(o)&&o.mount!=='I'){o.sizeMethod='S';if(!isSliding(o))o.mount='I';remoteContext.dirty=true;}tab='openings';return render();}if(lockedOrderQuantity()&&['add-opening','remove-opening','duplicate-opening'].includes(name))return;if(remoteContext&&['remote-save','remote-back'].includes(name))return saveRemote(name==='remote-back');if(remoteContext?.kind==='draft'&&name==='archive-job'){currentJob().archived=!currentJob().archived;save();return saveRemote(true);}if(remoteContext&&['jobs','cutsheets','settings','new-job','archive-job','import','backup'].includes(name))return toast('Save your opening changes and return to the quote or order first.');if(['jobs','cutsheets','settings'].includes(name)){if(invalidFields.size)return toast('Correct the highlighted field before leaving this opening.');view=name;render();return;}
  if(name==='review-sheet'){tab='preview';render();$('#preview-opening')?.focus();return;}if(name==='send-shop')return sendToShop();if(name==='new-job')return openNewJob();if(name==='pdf')return openPDF();if(name==='backup')return backup();if(name==='import')return importBackup();
  if(name==='toggle-archive'){archiveView=!archiveView;render();return;}
  if(name==='details'||name==='back-openings'){if(invalidFields.size)return toast('Correct the highlighted field first.');tab=name==='details'?'details':'openings';render();return;}
  if(name==='add-opening'){if(invalidFields.size)return toast('Correct the highlighted field first.');const j=currentJob();if(j.archived)return toast('Restore the job before adding openings.');if(j.openings.length>=100)return toast('A job can hold up to 100 openings.');const o=quoteEditing()?pendingQuoteLine():newOpening(`Opening ${j.openings.length+1}`);j.openings.push(o);activeOpening=o.id;tab='openings';rememberEditorView();save();render();const first=quoteEditing()&&!productId(quoteLine(o))?$('#line-product'):$(productId(quoteLine(o))===EWF_ID?'#quantity':'#name');first?.focus();if(first?.tagName==='INPUT')first.select();return;}
  if(name==='duplicate-opening'){if(invalidFields.size)return toast('Correct the highlighted field first.');const j=currentJob();if(j.openings.length>=100)return toast('A job can hold up to 100 openings.');const o=structuredClone(currentOpening());if(isShutterLine(o)){o.sizeMethod='S';if(!isSliding(o))o.mount='I';}o.id=uid();o.name=(o.name+' (copy)').slice(0,80);if(quoteEditing())j.unitPrices[o.id]=j.unitPrices[currentOpening().id]??null;j.openings.push(o);activeOpening=o.id;save();render();toast('Opening duplicated. Adjust the name and measurements.');return;}
  if(name==='remove-opening'){const o=currentOpening();modal('Remove this opening?',`<p>Remove <b>${h(o.name)}</b> from this job? Other openings stay in place.</p>`,`${btn('Keep opening','close',null)}<button class="btn danger" id="confirm-remove">Remove opening</button>`);$('#confirm-remove').onclick=()=>{currentJob().openings=currentJob().openings.filter(x=>x.id!==o.id);invalidFields.clear();activeOpening=null;save();$('#modal').close();render();toast('Opening removed.');};return;}
  if(name==='archive-job'){const j=currentJob();j.archived=!j.archived;save();view='jobs';archiveView=false;render();toast(j.archived?'Job archived. Find it in View archive.':'Job restored.');}
}
function quoteChanges(){return {openings:currentJob().openings,unitPrices:currentJob().unitPrices,...quoteAdjustmentFields(currentJob())};}
function quoteAdjustmentsHTML(){
  const j=currentJob(),o=currentOpening(),hasProduct=o&&productId(quoteLine(o)),override=hasProduct?j.unitPrices[o.id]:null;
  const field=(key,label,value,help,optional=false)=>`<div class="field"><label for="price-${key}">${label}</label><input id="price-${key}" data-quote-price="${key}" type="text" inputmode="decimal" value="${value==null?'':(value/100).toFixed(2)}" ${optional?'placeholder="Use calculated price"':''} aria-describedby="price-${key}-help price-${key}-error"><p id="price-${key}-help" class="field-help">${help}</p><p id="price-${key}-error" class="field-error" aria-live="polite"></p></div>`;
  return `<details class="quote-advanced" id="quote-advanced" ${advancedPricingOpen||(override!=null&&productId(quoteLine(o))!==EWF_ID)||productId(quoteLine(o))==='other'?'open':''}><summary>Advanced pricing</summary><div class="quote-advanced-body">${hasProduct&&productId(quoteLine(o))!==EWF_ID?`<h3 id="quote-line-price-heading">${h(o.name)} · line price</h3><div class="fields">${field('unitPrice','Price per unit ($)',override,'Override this opening’s price. Quantity is applied automatically; clear it to restore calculated pricing.',true)}<div class="quote-price-default"><p class="field-help" id="calculated-price-help">${calculatedPriceHelp()}</p><button class="btn small" type="button" id="reset-unit-price">Use calculated price</button></div></div>`:''}<h3>Whole quote</h3><div class="fields quote-adjustment-fields">${field('discountCents','Discount ($)',j.discountCents,'Subtracts from the product subtotal. Set to 0 to remove.')}${field('installationCents','Installation charge ($)',j.installationCents,'Adds to the quote. Set to 0 to remove.')}${field('taxBasisPoints','Tax (%)',j.taxBasisPoints,'Applied after the discount, including installation.')}</div><p class="field-help">These adjustments apply only to this quote. Your saved product rates stay the same.</p></div></details>`;
}
function calculatedPriceHelp(){
  const o=currentOpening();if(!o||!productId(quoteLine(o)))return '';
  const calculated=openingPrice(o,{...remoteContext.record,unitPrices:{}}).unitPrice;
  return calculated==null?'No calculated price yet. Enter measurements and set a product rate, or enter a price above.':`Calculated price: ${money(calculated)} per unit.`;
}
function bindQuoteAdjustments(){
  $('#quote-advanced')?.addEventListener('toggle',e=>{advancedPricingOpen=e.target.open;});
  document.querySelectorAll('[data-quote-price]').forEach(el=>el.addEventListener('input',()=>{
    const key=el.dataset.quotePrice,error=$('#price-'+key+'-error');
    try{
      const value=parseQuoteAmount(el.value,{optional:key==='unitPrice',tax:key==='taxBasisPoints'});
      if(key==='unitPrice')currentJob().unitPrices[currentOpening().id]=value;else currentJob()[key]=value;
      invalidFields.delete('price-'+key);el.removeAttribute('aria-invalid');error.textContent='';
    }catch(e){invalidFields.set('price-'+key,e.message);el.setAttribute('aria-invalid','true');error.textContent=e.message;}
    for(const id of ['#remote-error','#quote-bottom-error'])if($(id))$(id).textContent='';
    save();
  }));
  $('#reset-unit-price')?.addEventListener('click',()=>{
    const input=$('#price-unitPrice');currentJob().unitPrices[currentOpening().id]=null;input.value='';input.removeAttribute('aria-invalid');invalidFields.delete('price-unitPrice');$('#price-unitPrice-error').textContent='';save();input.focus();
  });
}
function quotePricingHTML(){
  if(!quoteEditing())return '';
  const q={...remoteContext.record,...quoteChanges(),openings:currentJob().openings},t=quotePricing(q);
  if(!q.openings.length)return '';
  if(invalidFields.size)return '<p class="field-error">Correct the highlighted fields to update quote pricing.</p>';
  return `<div class="sales-section-heading"><h2>Openings</h2><span class="subheading">${quoteProductNames(q)} · ${q.openings.length} opening${q.openings.length===1?'':'s'}</span></div><div class="sales-table"><table><thead><tr><th>OPENING / PRODUCT</th><th>SIZE (IN)</th><th>QTY</th><th class="number">EACH</th><th class="number">LINE TOTAL</th><th><span class="sr-only">Edit opening</span></th></tr></thead><tbody>${q.openings.map((o,i)=>`<tr><td>${h(o.name)}<small>${productId(quoteLine(o))?h(productName(quoteLine(o))):'Choose a product'}</small></td><td>${h(shutterMeasurementLabel(o.width))} × ${h(shutterMeasurementLabel(o.height))}</td><td>${o.quantity}</td><td class="number">${money(t.lines[i].unitPrice)}${t.lines[i].override?'<small>Custom price</small>':''}</td><td class="number"><strong>${money(t.lines[i].lineTotal)}</strong></td><td><button type="button" class="btn small" data-opening="${h(o.id)}" aria-pressed="${o.id===activeOpening}" aria-label="Edit ${h(o.name)}">${o.id===activeOpening?'Editing':'Edit'}</button></td></tr>`).join('')}</tbody></table></div><div class="builder-totals">${[['Products',t.subtotal],['Discount',-t.discount],['Installation',t.installation],['Tax',t.tax]].filter(([label,value])=>label==='Products'||value).map(([label,value])=>`<div><span>${label}</span><strong>${label==='Tax'&&t.discount>t.subtotal?'—':money(value)}</strong></div>`).join('')}<div class="builder-total"><span>${t.unpriced?'Priced items subtotal':'Quote total'}</span><strong>${t.discount>t.subtotal?'—':money(t.total)}</strong></div></div>${t.unpriced?`<p class="field-help">${q.openings.some(o=>!hasMeasurements(o))?'Enter each opening’s width and height to see its price.':q.openings.some((o,i)=>productId(quoteLine(o))===BROADLEAF_ID&&t.lines[i].issues?.length)?'Review the Broadleaf frame and tip-to-tip measurements above.':q.openings.some((o,i)=>productId(quoteLine(o))===EWF_ID&&t.lines[i].unitPrice==null)?'Choose an EWF fabric and review any options that need a confirmed supplier price.':'Set the product rates in Pricing, then use current pricing on the proposal review, or enter a custom unit price.'}</p>`:''}${t.discount>t.subtotal?'<p class="field-error">Discount cannot exceed the product subtotal. Update it in Advanced pricing.</p>':''}`;
}
function refreshQuotePricing(){
  if(!quoteEditing())return;
  const ewfPrice=$('#ewf-price-summary');if(ewfPrice)ewfPrice.innerHTML=invalidFields.size?'<p class="field-error">Correct the highlighted fields to update pricing.</p>':ewfPriceSummary(openingPrice(currentOpening(),{...remoteContext.record,unitPrices:currentJob().unitPrices}),h);
  const broadleafPrice=$('#broadleaf-price-summary');if(broadleafPrice)broadleafPrice.innerHTML=invalidFields.size?'<p class="field-error">Correct the highlighted fields to update pricing.</p>':broadleafPriceSummary(currentOpening(),openingPrice(currentOpening(),{...remoteContext.record,unitPrices:currentJob().unitPrices}),h);
  const priceHeading=$('#quote-line-price-heading');if(priceHeading)priceHeading.textContent=currentOpening().name+' · line price';
  const total=$('#quote-running-totals');if(total)total.innerHTML=quotePricingHTML();
  if($('#calculated-price-help'))$('#calculated-price-help').textContent=calculatedPriceHelp();
  const discount=$('#price-discountCents');
  if(discount&&!invalidFields.has('price-discountCents')){const t=quotePricing({...remoteContext.record,...quoteChanges()}),message=t.discount>t.subtotal?'Discount cannot exceed the product subtotal.':'';$('#price-discountCents-error').textContent=message;if(message)discount.setAttribute('aria-invalid','true');else discount.removeAttribute('aria-invalid');}
  for(const o of currentJob().openings){if(!productId(quoteLine(o)))continue;const el=document.querySelector(`[data-price-opening="${o.id}"]`);if(el)el.textContent=invalidFields.size&&o.id===currentOpening()?.id?'Check measurements':money(openingPrice(o,{...remoteContext.record,unitPrices:currentJob().unitPrices}).lineTotal);}
}
function orderEditorPage(){const j=currentJob(),editing=orderEditing(),confirmed=!!remoteContext.record.finance?.confirmedAt,released=remoteContext.released;return `<div class="page-heading"><div><div class="eyebrow">${h(j.number)} · SHUTTERSMART</div><h1>${editing?'Review measurements':h(j.name)}</h1><p class="subheading">${h(j.customer)}</p></div><div class="btn-row"><a class="btn" href="/contacts.html#order/${h(j.id)}">${confirmed?'Back to order':'Pricing & payment →'}</a>${editing?btn(confirmed?'Save corrections & send to Production':'Save corrections','remote-save',null,'primary'):released?btn('Edit cut sheet','revise-cut-sheet')+`<a class="btn" href="/owner.html?job=${h(j.id)}">Open Digital Checklist →</a>`:btn('Review measurements','order-edit',null,'primary')}${editing?'':btn('Download Print PDF','pdf','download')}</div></div><p class="remote-notice">${released?'Sent to Production. Use Edit cut sheet to review and send corrections.':editing?'Correct the shop measurements here. The sold quote, quantities, and agreed price stay unchanged.'+(confirmed?' Saving valid corrections sends this order to Production.':' Confirm the sale and payment on the order to send it to Production.'):'Only ShutterSmart lines are shown. Confirm sale and payment on the order to send valid cut sheets to Production.'}</p><div id="remote-error" class="field-error" role="alert"></div>${editing?`<div class="tabs"><button class="tab ${tab==='openings'?'active':''}" data-tab="openings">Measurements</button><button class="tab ${tab==='preview'?'active':''}" data-tab="preview">Cut sheet</button></div>${tab==='preview'?previewPage():openingWorkspace()}`:previewPage()}`;}
function remoteEditorPage(){
  if(remoteContext.kind==='order')return orderEditorPage();
  if(stepPreview())return stepQuotePage();
  const j=currentJob(),editable=quoteEditing();
  return `<header class="page-heading quote-editor-heading"><div><h1>Quote ${h(j.number)}</h1>${j.customer?`<p class="subheading">${h(j.customer)}</p>`:''}</div><div class="quote-heading-controls">${entryModeSwitch()}<div class="btn-row">${editable?editorSaveStatus()+btn('Review Proposal →','remote-back',null,'primary'):btn('Back to quote','remote-back')}</div></div></header><div id="remote-error" class="field-error" role="alert"></div>${editable?`${openingWorkspace()}<div class="quote-editor-bottom">${quoteAdjustmentsHTML()}<section id="quote-running-totals" class="quote-running-totals" aria-label="Quote pricing">${quotePricingHTML()}</section><footer class="quote-editor-actions editor-actions-sticky">${editorSaveStatus()}<div class="btn-row">${btn('Add Line','add-opening','plus')}${btn('Save now','remote-save')}${btn('Review Proposal →','remote-back',null,'primary')}</div><p id="quote-bottom-error" class="field-error" role="alert"></p></footer></div>`:previewPage()}`;
}
function stepQuotePage(){
 const j=currentJob();
 return `<header class="page-heading step-quote-heading"><div><h1>${h(j.customer||'Build quote')}</h1><p class="subheading">Quote ${h(j.number)}</p></div>${entryModeSwitch()}</header><div id="remote-error" class="field-error" role="alert"></div>${stepNavigation()}<div class="step-form-body">${openingWorkspace()}<div class="quote-editor-bottom" ${openingStep()===3?'':'hidden'}>${quoteAdjustmentsHTML()}<section id="quote-running-totals" class="quote-running-totals" aria-label="Quote pricing">${quotePricingHTML()}</section></div></div>${stepFooter()}`;
}
function rememberEditorView(){const url=new URL(location.href);url.hash=new URLSearchParams({tab,opening:activeOpening||'',...(stepPreview()?{step:openingStep()}:{})}).toString();history.replaceState(history.state,'',url);}
function draftEditorPage(){const j=currentJob(),released=remoteContext.released;return `<div class="page-heading"><div><div class="eyebrow">${h(j.number)} · SHUTTERSMART</div><h1>${h(j.name)}</h1><p class="subheading">${h(j.customer)}${released?' · Released to shop':j.archived?' · Archived':' · Draft'}</p></div><div class="btn-row">${released?btn('Edit cut sheet','revise-cut-sheet')+`<a class="btn" href="/owner.html?job=${h(j.id)}">Open Digital Checklist →</a>`:editorSaveStatus()+(!j.archived?btn('Send to Production','send-shop','arrow'):'')}${btn('Download Print PDF','pdf','download','primary')}</div></div><div id="remote-error" class="field-error" role="alert"></div>${released?'<p class="remote-notice">Sent to Production. Use Edit cut sheet to review and send corrections.</p>'+previewPage():`<div class="tabs">${[['openings','Openings'],['preview','Cut sheet'],['details','Job details']].map(([value,label])=>`<button class="tab ${tab===value?'active':''}" data-tab="${value}">${label}</button>`).join('')}</div>${tab==='details'?jobDetails():tab==='preview'?previewPage():openingWorkspace()}<footer class="editor-actions-sticky">${editorSaveStatus()}<div class="btn-row">${btn('Add opening','add-opening','plus')}${btn('Save now','remote-save')}${tab==='preview'?btn('Download Print PDF','pdf','download','primary'):btn('Review cut sheet →','review-sheet',null,'primary')}</div></footer>`}`;}
function revisionEditorPage(){
 const j=currentJob(),order=remoteContext.revisionKind==='order';
 return `<div class="page-heading"><div><div class="eyebrow">${h(j.number)} · REVISION ${remoteContext.baseRevision+1}</div><h1>Edit cut sheet</h1><p class="subheading">${h(j.name)}</p></div><div class="btn-row">${btn('Cancel','cancel-revision')}${btn('Review & update shop','review-revision',null,'primary')}</div></div><p class="remote-notice">The shop keeps the current version until you review and save these changes.${order?' Sold quantities and pricing stay unchanged.':''}</p><div id="remote-error" class="field-error" role="alert"></div><div class="tabs"><button class="tab ${tab==='openings'?'active':''}" data-tab="openings">Openings</button><button class="tab ${tab==='preview'?'active':''}" data-tab="preview">Cut sheet</button></div>${tab==='preview'?previewPage():openingWorkspace()}<footer class="editor-actions-sticky"><span>${remoteContext.dirty?'Unsaved changes':'Editing revision '+(remoteContext.baseRevision+1)}</span><div class="btn-row">${order?'':btn('Add opening','add-opening','plus')}${btn('Cancel','cancel-revision')}${btn('Review & update shop','review-revision',null,'primary')}</div></footer>`;
}
async function beginRevision(){
 try{
  const data=await shopRequest('job-revision-get',{id:currentJob().id},{force:true});
  remoteContext.revisionEditing=true;remoteContext.revisionKind=data.kind;remoteContext.baseRevision=data.job.revision||1;
  remoteContext.dirty=false;remoteContext.revisionAttempt=null;draftAutosave.reset();invalidFields.clear();
  currentJob().openings=structuredClone(data.job.openings.map(o=>o.input));currentJob().revision=data.job.revision||1;
  for(const o of currentJob().openings)if(o.sizeMethod!=='S'||!isSliding(o)&&o.mount!=='I'){o.sizeMethod='S';if(!isSliding(o))o.mount='I';remoteContext.dirty=true;}
  tab='openings';render();
 }catch(e){toast(e.message);}
}
function cancelRevision(){
 if(!remoteContext.dirty){remoteContext.revisionEditing=false;return loadRemote();}
 modal('Discard cut sheet changes?','<p>The shop will keep its current cut sheet.</p>',btn('Keep editing','close')+'<button class="btn" id="discard-revision">Discard changes</button>');
 $('#discard-revision').onclick=()=>{$('#modal').close();remoteContext.revisionEditing=false;remoteContext.dirty=false;invalidFields.clear();void loadRemote();};
}
async function reviewRevision(){
 if(remoteSaving)throw new Error('An update is already being reviewed.');
 if(invalidFields.size)throw new Error('Correct the highlighted measurements before updating the shop.');
 remoteSaving=true;const work=$('#main-content');if(work)work.inert=true;
 try{
 const openings=structuredClone(currentJob().openings),fingerprint=JSON.stringify(openings);
 if(remoteContext.revisionAttempt?.fingerprint!==fingerprint)remoteContext.revisionAttempt={fingerprint,id:uid()};
 const request={id:currentJob().id,revision:remoteContext.baseRevision,openings,requestId:remoteContext.revisionAttempt.id};
 const preview=await shopRequest('job-revision-preview',request);
 if(work)work.inert=false;
 if(preview.applied){remoteContext.revisionEditing=false;remoteContext.dirty=false;await loadRemote();toast('The shop already has this updated cut sheet.');return;}
 if(!preview.changed){remoteContext.revisionEditing=false;remoteContext.dirty=false;await loadRemote();toast('No cut sheet changes to send.');return;}
 const describe=part=>part?`${part.quantity} × ${cut(part.length)} ${state.outputUnits} · ${part.profile||'same profile'}`:'Removed';
 const body=`<p><strong>Send revision ${preview.nextRevision} to the shop?</strong></p><p>Unchanged cut lines keep their progress. Changed cut lines restart at zero. Finishing checks reset only for affected openings. Previous progress stays in the revision history.</p>${preview.impact.map(item=>`<section class="revision-opening"><h3>${h(item.name)}${item.added?' · added':item.removed?' · removed':''}</h3>${item.inputChanges?.length?`<p>${item.inputChanges.map(h).join('<br>')}</p>`:''}${item.changes.length?`<ul>${item.changes.map(change=>`<li><strong>${h(change.name)}${change.section?' · section '+change.section:''}</strong><span>${change.before?h(describe(change.before)):'New line'} → ${h(describe(change.after))}</span>${change.before?.completed?`<small>${change.before.completed} previously cut — check these pieces before reusing them.</small>`:''}</li>`).join('')}</ul>`:'<p>Cut sizes are unchanged.</p>'}${item.resetFinishing?'<p>Finishing checks will restart for this opening.</p>':''}</section>`).join('')}<p>Replace earlier printed copies. A running cutting timer will pause.</p><p id="revision-error" class="field-error" role="alert"></p>`;
 await new Promise((resolve,reject)=>{
  let saved=false,applying=false;
  modal('Review cut sheet changes',body,btn('Back to editing','close')+'<button class="btn primary" id="apply-revision">Update shop cut sheet</button>');
  const dialog=$('#modal');dialog.classList.add('revision-dialog');dialog.oncancel=e=>{if(applying)e.preventDefault();};
  dialog.addEventListener('close',()=>{dialog.classList.remove('revision-dialog');dialog.oncancel=null;if(!saved)reject(new Error('Changes have not been sent. You can keep editing.'));},{once:true});
  $('#apply-revision').onclick=async()=>{
   applying=true;const button=$('#apply-revision');dialog.querySelectorAll('button').forEach(b=>b.disabled=true);button.textContent='Updating…';
   try{
    await shopRequest('job-revise',{...request,version:preview.version});saved=true;remoteContext.dirty=false;remoteContext.revisionEditing=false;
    dialog.close();await loadRemote();toast('Shop cut sheet updated. Replace earlier printed copies.');resolve();
   }catch(e){applying=false;$('#revision-error').textContent=e.message;dialog.querySelectorAll('button').forEach(b=>b.disabled=false);button.textContent='Update shop cut sheet';}
  };
 });}finally{remoteSaving=false;if(work)work.inert=false;}
}
async function persistRemote(){
 if(revisionEditing())return reviewRevision();
 if(autoEditable()){
  if(invalidFields.size)throw new Error('Correct the highlighted fields before saving.');
  if(remoteContext.dirty&&!draftAutosave.dirty())draftAutosave.changed();
  await draftAutosave.flush();return;
 }
 return writeRemote();
}
async function writeRemote(){
 if(remoteSaving)throw new Error('A save is already in progress. Please wait.');
 if(invalidFields.size)throw new Error('Correct the highlighted fields before saving.');
 const incomplete=currentJob().openings.find(o=>!hasMeasurements(o));if(!autoEditable()&&incomplete&&productId(quoteLine(incomplete)))throw new Error(incomplete.name+': enter width and height before saving.');
 if(remoteContext.kind==='quote'&&currentJob().openings.some(o=>!productId(quoteLine(o))))throw new Error('Choose a product for every line item before saving.');
 if(quoteEditing()&&quotePricing({...remoteContext.record,...quoteChanges()}).discount>quotePricing({...remoteContext.record,...quoteChanges()}).subtotal)throw new Error('Discount cannot exceed the product subtotal. Update it in Advanced pricing.');
 if(!remoteContext.dirty)return;
 remoteSaving=true;
 const work=orderEditing()?$('#main-content'):null;if(work)work.inert=true;
 try{
  if(remoteContext.kind==='order'){
   const result=await shopRequest('order-specifications-save',{id:remoteContext.record.id,version:remoteContext.record.version,openings:structuredClone(currentJob().openings)});
   remoteContext.record=result.order;remoteContext.released=result.released;remoteContext.dirty=false;
   currentJob().openings=structuredClone(result.order.manufacturingSpecifications||manufacturingOpenings(result.order));
   if(result.released){remoteContext.editing=false;tab='preview';}save(false);return;
  }

  const isDraft=remoteContext.kind==='draft',snapshot=structuredClone(isDraft?currentJob():quoteChanges());
  const result=await shopRequest(isDraft?'draft-save':'quote-save',{id:remoteContext.record.id,version:remoteContext.record.version,fields:isDraft?snapshot:{...snapshot,status:'draft'}}),record=isDraft?result.draft:result.quote;
  remoteContext.record=record;
  if(!isDraft){for(const o of record.openings)if(hasMeasurements(o))newQuoteLineIds.delete(o.id);else newQuoteLineIds.add(o.id);for(const id of ['#line-product','#elegant-product'])if($(id)&&currentOpening())$(id).disabled=!!productId(quoteLine(currentOpening()))&&!newQuoteLineIds.has(currentOpening().id);}
  remoteContext.dirty=JSON.stringify(snapshot)!==JSON.stringify(isDraft?currentJob():quoteChanges());
  if(!remoteContext.dirty){if(isDraft){currentJob().customer=record.customer;currentJob().contactId=record.contactId;}currentJob().openings=structuredClone(record.openings);if(!isDraft)currentJob().unitPrices=structuredClone(record.unitPrices);refreshQuotePricing();}save(false);

 }finally{remoteSaving=false;if(work)work.inert=false;}
}
async function saveRemote(back=false){
 const el=$('#remote-error');if(el)el.textContent='';if($('#quote-bottom-error'))$('#quote-bottom-error').textContent='';
 try{await persistRemote();if(back)location.href=remoteContext.kind==='draft'?'/cutsheets.html':'/contacts.html#'+remoteContext.kind+'/'+remoteContext.record.id;else {if(remoteContext.kind==='order')render();toast(remoteContext.kind==='order'?(remoteContext.released?'Measurements saved. Order sent to the shop.':'Corrections saved. Review any flagged measurements before cutting.'):remoteContext.kind==='draft'?'Draft saved to the shared workspace.':'Quote saved.');}}
 catch(e){const bottom=$('#quote-bottom-error');if(bottom){bottom.textContent=e.message;bottom.scrollIntoView({block:'nearest'});}if(el)el.textContent=e.message;else toast(e.message);}
}
async function loadRemote(){
 $('#app').innerHTML=sidebar()+'<main class="content" id="main-content"><p>Loading saved opening specifications…</p></main>';
 try{
  let record,contact={},contacts=[],productPricing,released=false;
  if(remoteKind==='job'){const data=await shopRequest('jobs'),j=data.jobs.find(j=>j.id===remoteParams.get('job'));if(!j)throw new Error('This released job was not found.');record={...j,customer:'',openings:j.openings.map(o=>structuredClone(o.input))};released=true;}
  else if(remoteKind==='draft'){const data=await shopRequest('draft-get',{id:remoteParams.get('draft')});record=data.draft;released=data.released;contacts=(await shopRequest('sales')).contacts;}
  else{const data=await shopRequest('sales-get',{kind:remoteKind,id:remoteParams.get(remoteKind)});({record,contact,productPricing,released}=data);}
  if(remoteKind==='order'&&!hasManufacturingLines(record))throw new Error(CUT_SHEETS_ONLY);
  if(remoteKind==='quote'&&record.status==='ordered'){location.replace('/contacts.html#quote/'+record.id);return;}
  remoteContext={kind:remoteKind,record,contacts,productPricing,released,dirty:false};draftAutosave.reset();saveMessage='Saved';
  const job=['draft','job'].includes(remoteKind)?structuredClone(record):{productId:remoteKind==='order'?'shuttersmart':productId(record),id:record.id,name:record.name,number:record.number,revision:record.manufacturingRevision,customer:[contact.firstName,contact.lastName].filter(Boolean).join(' ').slice(0,120),notes:'',due:'',archived:false,sample:false,...quoteAdjustmentFields(record),unitPrices:structuredClone(record.unitPrices),openings:structuredClone(remoteKind==='order'?(record.manufacturingSpecifications||manufacturingOpenings(record)).map(({pricing,...o})=>o):record.openings)};
  job.openings=job.openings.map(normalizeFrame);
  let measurementUpdated=false;
  if(remoteKind==='quote'||remoteKind==='draft'&&!released)for(const o of job.openings)if(isManufacturingLine(o,record)&&(o.sizeMethod!=='S'||!isSliding(o)&&o.mount!=='I')){o.sizeMethod='S';if(!isSliding(o))o.mount='I';measurementUpdated=true;}
  if(remoteKind==='quote')for(const o of job.openings)if(!hasMeasurements(o))newQuoteLineIds.add(o.id);
  const firstDraft=remoteKind==='draft'&&!released&&!job.openings.length;if(firstDraft)job.openings.push(newOpening('Opening 1'));
  if(remoteKind==='quote'&&!job.openings.length)job.openings.push({id:uid(),productId:'',name:'Opening 1'});
  const savedView=new URLSearchParams(location.hash.slice(1));state={...state,jobs:[job]};activeJob=job.id;activeOpening=savedView.get('opening')||remoteParams.get('opening');view='editor';if(entryMode==='steps'&&activeOpening)openingSteps.set(activeOpening,[1,2,3].includes(Number(savedView.get('step')))?Number(savedView.get('step')):1);tab=remoteKind==='order'||released?'preview':savedView.get('tab')||'openings';if(!['openings','preview','details'].includes(tab))tab='openings';render();
  if(firstDraft||measurementUpdated)save();
  document.title=record.number+' · '+(remoteKind==='quote'?'Quote openings':'Cut sheets');
  if(released&&remoteParams.get('edit')==='1'){remoteParams.delete('edit');const url=new URL(location.href);url.searchParams.delete('edit');history.replaceState(history.state,'',url);await beginRevision();}
 }catch(e){$('#app').innerHTML=sidebar()+`<main class="content" id="main-content">${breadcrumbs([[remoteKind==='quote'?'Quotes':'Cut Sheets']])}<h1>Openings unavailable</h1><p class="subheading">${h(e.message)}</p><a class="btn" href="${remoteKind==='quote'?'/contacts.html#quotes':'/cutsheets.html'}">Back to ${remoteKind==='quote'?'Quotes':'Cut Sheets'}</a></main>`;}
}
installNavigationGuard({autoSave:autoEditable,saveLabel:()=>revisionEditing()?'Review & update shop':orderEditing()&&remoteContext.record.finance?.confirmedAt?'Save & send to Production':'Save and leave',isDirty:()=>!!remoteContext?.dirty,save:persistRemote,discard:()=>{draftAutosave.reset();remoteContext.dirty=false;invalidFields.clear();}});
if(remoteKind)await loadRemote();else location.replace('/cutsheets.html');
