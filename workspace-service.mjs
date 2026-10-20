import {orderReadiness} from './order-manufacturing.mjs';
import {createHash,randomUUID} from 'node:crypto';
import {calculate} from './calculations.mjs';
import {SalesError} from './sales-service.mjs';
import {supportsCutSheets,hasManufacturingLines,manufacturingOpenings,CUT_SHEETS_ONLY} from './public/products.js';
import {production} from './public/shop-state.js';

export const workspaceOperations=['workspace','draft-get','draft-save','draft-import','draft-release'];
const fail=(status,message)=>{throw new SalesError(status,message);};
const identifier=value=>{if(typeof value!=='string'||!/^[-a-zA-Z0-9_]{1,64}$/.test(value)||['__proto__','constructor','prototype'].includes(value))fail(400,'Invalid draft identifier.');return value;};
const text=(value,label,max=120)=>{if(typeof value!=='string'||value.length>max)fail(400,`Enter a valid ${label}.`);return value.trim();};
function fields(raw){
  if(!raw||!supportsCutSheets(raw))fail(422,CUT_SHEETS_ONLY);
  const name=text(raw.name,'job name',100),number=text(raw.number,'job number');
  if(!name||!number)fail(400,'Enter a job name and number.');
  if(!Array.isArray(raw.openings)||raw.openings.length>100)fail(400,'A draft can hold up to 100 openings.');
  const seen=new Set(),openings=raw.openings.map(item=>{
    identifier(item?.id);if(seen.has(item.id))fail(400,'Opening identifiers must be unique.');seen.add(item.id);
    if(!supportsCutSheets(item))fail(422,CUT_SHEETS_ONLY);
    const keys=['id','name','width','height','quantity','left','right','louver','frame','frameStyle','sides','mount','sizeMethod','color','tilt','stile','divider','divisionMode','notes','tposts'];
    const o=Object.fromEntries(keys.filter(k=>item[k]!==undefined).map(k=>[k,structuredClone(item[k])]));
    o.name=text(o.name,'opening name',80);if(!o.name)fail(400,'Enter an opening name.');o.notes=text(o.notes||'','opening notes',1200);
    calculate(o);return o;
  });
  const due=raw.due||'';if(due&&(!/^\d{4}-\d{2}-\d{2}$/.test(due)||!Number.isFinite(Date.parse(due+'T12:00:00Z'))||new Date(due+'T12:00:00Z').toISOString().slice(0,10)!==due))fail(400,'Enter a valid target date.');
  return {productId:'shuttersmart',name,number,customer:text(raw.customer||'','customer'),notes:text(raw.notes||'','shop notes',1200),due,archived:!!raw.archived,openings};
}
const fingerprint=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function runWorkspace(state,operation,data,time,publish){
  state.drafts??={};state.draftImports??={};
  const get=id=>{const draft=state.drafts[identifier(id)];if(!draft)fail(404,'This shared draft was not found.');return draft;};
  const current=(draft,version)=>{if(draft.version!==version)fail(409,'This draft changed on another device. Reload it before saving again.');};
  if(operation==='workspace'){
    const orders=Object.values(state.orders||{}).filter(hasManufacturingLines).map(o=>({id:o.id,kind:'order',name:o.name,number:o.number,customer:[o.customer?.firstName,o.customer?.lastName].filter(Boolean).join(' '),openingCount:manufacturingOpenings(o).length,updatedAt:o.updatedAt,stage:state.jobs[o.id]?production(state.jobs[o.id]).label:orderReadiness(o).label,released:!!state.jobs[o.id],archived:false}));
    const drafts=Object.values(state.drafts).map(d=>({id:d.id,kind:'draft',name:d.name,number:d.number,customer:d.customer,openingCount:d.openings.length,updatedAt:d.updatedAt,stage:state.jobs[d.id]?production(state.jobs[d.id]).label:'Draft',released:!!state.jobs[d.id],archived:d.archived,imported:!!d.sourceId}));
    const jobs=Object.values(state.jobs).filter(j=>!state.orders?.[j.id]&&!state.drafts[j.id]).map(j=>({id:j.id,kind:'job',name:j.name,number:j.number,customer:'',openingCount:j.openings.length,updatedAt:j.updatedAt,stage:production(j).label,released:true,archived:false}));
    return {cutSheets:[...orders,...drafts,...jobs].sort((a,b)=>b.updatedAt-a.updatedAt)};
  }
  if(operation==='draft-get'){const draft=get(data.id);return {draft,released:!!state.jobs[draft.id]};}
  if(operation==='draft-save'){
    const id=identifier(data.id),previous=state.drafts[id];
    if(previous)current(previous,data.version);else if(data.version!==0)fail(409,'This draft no longer exists.');
    if(state.jobs[id])fail(409,'This job has been released. Its manufacturing specifications are locked.');
    if(state.orders?.[id]||state.quotes?.[id])fail(409,'That identifier belongs to an order or quote.');
    if(!previous&&Object.keys(state.drafts).length>=500)fail(400,'Shared draft capacity reached.');
    const contactId=data.fields?.contactId??previous?.contactId??'';
    const contact=contactId?state.contacts?.[identifier(contactId)]:null;
    if(contactId&&!contact)fail(404,'Choose a contact from this workspace.');
    const input=fields(data.fields);
    if(contact)input.customer=[contact.firstName,contact.lastName].filter(Boolean).join(' ').slice(0,120);
    const draft={...previous,...input,contactId,id,createdAt:previous?.createdAt||time,updatedAt:time,version:(previous?.version||0)+1};
    state.drafts[id]=draft;return {draft};
  }
  if(operation==='draft-import'){
    const sourceId=identifier(data.job?.id),input=fields(data.job),key=fingerprint({sourceId,input}),old=state.draftImports[key];
    if(old)return {...old,existing:true};
    // Import a copy; never replace a cloud revision or a released cut sheet.
    const existing=state.jobs[sourceId];
    if(existing&&fingerprint(existing.openings.map(o=>o.input))===fingerprint(input.openings)&&existing.number===input.number&&existing.name===input.name&&(existing.notes||'')===input.notes&&(existing.due||'')===input.due&&!input.customer&&!input.archived){const result={kind:'job',id:sourceId};state.draftImports[key]=result;return {...result,existing:true};}
    if(Object.keys(state.drafts).length>=500)fail(400,'Shared draft capacity reached.');
    const id=randomUUID(),draft={...input,id,sourceId,sourceHash:key,createdAt:time,updatedAt:time,version:1};
    state.drafts[id]=draft;const result={kind:'draft',id};state.draftImports[key]=result;return {...result,existing:false};
  }
  if(operation==='draft-release'){
    const draft=get(data.id);if(state.jobs[draft.id])return {job:state.jobs[draft.id]};current(draft,data.version);
    if(draft.archived)fail(400,'Restore this draft before releasing it to the shop.');
    const result=await publish({job:structuredClone(draft),targetMinutes:data.targetMinutes,due:data.due||draft.due});
    draft.version++;draft.updatedAt=time;draft.due=result.job.due;return result;
  }
  fail(404,'Unknown workspace action.');
}
