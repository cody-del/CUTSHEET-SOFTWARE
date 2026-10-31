import {createHash} from 'node:crypto';
import {calculate,validateOpening,configuration} from './calculations.mjs';
import {supportsCutSheets,manufacturingOpenings,CUT_SHEETS_ONLY} from './public/products.js';
import {frameSideStyles,frameDescription,frameSetupLabel} from './public/frames.js';
import {productionChecks,openingCheckStatus,openingProduction,production,progress} from './public/shop-state.js';

export const revisionOperations=['job-revision-get','job-revision-preview','job-revise'];
export class RevisionError extends Error{constructor(status,message){super(message);this.status=status;}}
const fail=(status,message)=>{throw new RevisionError(status,message);};
const stable=v=>JSON.stringify(v,(_,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]])):value);
const digest=v=>createHash('sha256').update(stable(v)).digest('hex');
const currentView=({revisions,lastRevision,...job})=>job;
const keys=['id','name','productId','width','height','quantity','left','right','louver','frame','frameStyle','frameSides','sides','mount','sizeMethod','color','tilt','stile','divider','divisionMode','notes','tposts'];
function inputs(items){
 if(!Array.isArray(items)||!items.length||items.length>100)fail(400,'Keep between 1 and 100 openings on the cut sheet.');
 const seen=new Set();return items.map(raw=>{
  if(!raw||typeof raw.id!=='string'||!/^[-a-zA-Z0-9_]{1,64}$/.test(raw.id)||['__proto__','constructor','prototype'].includes(raw.id)||seen.has(raw.id))fail(400,'Each opening needs a unique valid identifier.');seen.add(raw.id);
  if(!supportsCutSheets(raw))fail(422,CUT_SHEETS_ONLY);
  const o=Object.fromEntries(keys.filter(k=>raw[k]!==undefined).map(k=>[k,structuredClone(raw[k])]));
  if(typeof o.name!=='string'||!o.name.trim()||o.name.length>80)fail(400,'Enter an opening name.');
  o.name=o.name.trim();if(o.notes===undefined)o.notes='';
  if(typeof o.notes!=='string')fail(400,'Enter valid shop notes.');
  if(o.tposts)o.tposts={construction:o.tposts.construction,positions:o.tposts.positions,sections:o.tposts.sections?.map(s=>({left:s.left,right:s.right}))};
  return validateOpening(o);
 });
}
const materialInput=({id,name,notes,productId,...rest})=>rest;
const partKey=p=>p.name+'|'+(p.section||0);
function specifications(o){return {
 'Opening name':o.name,Width:o.width+' in',Height:o.height+' in',Quantity:String(o.quantity),
 Frame:frameDescription(o),'Frame arrangement':frameSetupLabel(o),Finish:({W:'White',OW:'Off-white',SC:'Swiss coffee'})[o.color],
 Louvers:o.louver+' in',Tilt:o.tilt,Stile:o.stile,Mount:o.mount==='I'?'Inside':'Outside',
 'Measurement type':({S:'Shutter size',W:'Window opening size',F:'Outside frame size'})[o.sizeMethod],
 Layout:configuration(o),'T-posts':o.tposts?o.tposts.construction+'; '+o.tposts.positions.join(', ')+' in from left':'None',
 Divider:(o.divisionMode==='split'?'Split tilt rod':'Divider rail')+'; '+(o.divider||0)+' in from bottom'
};}
function cutIdentity(part,input){
 const side=part.name.endsWith(' frame')?part.name.split(' ')[0].toLowerCase():null;
 return stable({name:part.name,profile:part.profile,length:part.length,quantity:part.quantity,section:part.section||0,machining:part.machining||'',color:input.color,frameStyle:side?frameSideStyles(input)[side]?.id:null});
}
function effectiveChecks(job,opening){
 return Object.fromEntries(productionChecks.map(check=>{
  const record=opening.production?.[check.key]||job.production?.[check.key]||(['louvers-capped','stiles-capped'].includes(check.key)?opening.production?.capping||job.production?.capping:null)||{};
  return [check.key,{...structuredClone(record),status:openingCheckStatus(job,opening,check.key)}];
 }));
}
function prepare(job,items){
 const nextRevision=(job.revision||1)+1,impact=[];
 const openings=items.map(input=>{
  const old=job.openings.find(o=>o.input.id===input.id),result=calculate(input);
  if(result.warnings.length||!result.parts.length)fail(422,`${input.name}: ${result.warnings.join(' ')||'No valid cut lines.'}`);
  const previous=new Map((old?.lines||[]).map(line=>[partKey(line),line]));
  const changes=[],lines=result.parts.map((part,i)=>{
   const before=previous.get(partKey(part));previous.delete(partKey(part));
   if(before&&cutIdentity(before,old.input)===cutIdentity(part,input))return {...structuredClone(before),...part};
   changes.push({name:part.name,section:part.section||null,before:before?{profile:before.profile,length:before.length,quantity:before.quantity,completed:before.completed}:null,after:{profile:part.profile,length:part.length,quantity:part.quantity}});
   return {...part,id:`${input.id}-r${nextRevision}-${i}`,completed:0,status:'not-cut',shortage:null};
  });
  for(const before of previous.values())changes.push({name:before.name,section:before.section||null,before:{profile:before.profile,length:before.length,quantity:before.quantity,completed:before.completed},after:null});
  const changed=!old||stable(inputs([old.input])[0])!==stable(input);
  const machiningChanged=old&&stable([old.result.hinges,old.result.machining])!==stable([result.hinges,result.machining]);
  const reset=!old||!!changes.length||machiningChanged||stable(materialInput(inputs([old.input])[0]))!==stable(materialInput(input));
  const beforeSpecs=old?specifications(old.input):{},afterSpecs=specifications(input);
  const inputChanges=old?Object.keys(afterSpecs).filter(key=>beforeSpecs[key]!==afterSpecs[key]).map(key=>`${key}: ${beforeSpecs[key]} → ${afterSpecs[key]}`):[];
  if(old&&(old.input.notes||'')!==(input.notes||''))inputChanges.push('Shop notes updated');
  if(changed||changes.length||machiningChanged)impact.push({openingId:input.id,name:input.name,changes,inputChanges,resetFinishing:!!old&&reset,added:!old,removed:false,previouslyCut:changes.reduce((n,c)=>n+(c.before?.completed||0),0)});
  return {input,result,lines,production:reset?{}:effectiveChecks(job,old),productionCompletedAt:reset?null:old.productionCompletedAt||null};
 });
 for(const old of job.openings.filter(o=>!items.some(i=>i.id===o.input.id)))impact.push({openingId:old.input.id,name:old.input.name,changes:old.lines.map(l=>({name:l.name,section:l.section||null,before:{profile:l.profile,length:l.length,quantity:l.quantity,completed:l.completed},after:null})),resetFinishing:true,removed:true,added:false,previouslyCut:old.lines.reduce((n,l)=>n+l.completed,0)});
 return {openings,impact,nextRevision,changed:impact.length>0};
}

export function runRevision(state,operation,data,actor,time){
 if(actor.role!=='owner')fail(403,'Only the owner can edit cut sheets.');
 const job=typeof data.id==='string'&&Object.hasOwn(state.jobs,data.id)?state.jobs[data.id]:null;
 const order=state.orders?.[data.id],draft=state.drafts?.[data.id];
 if(!job||job.deletedAt||order?.deletedAt)fail(404,'This cut sheet is no longer in Production.');
 if(operation==='job-revision-get')return {job:currentView(job),kind:order?'order':draft?'draft':'job'};
 const canonical=inputs(data.openings),inputHash=digest(canonical);
 // A retry after a lost response must not reset work entered on the new revision.
 if(data.requestId&&job.lastRevision?.requestId===data.requestId){
  if(job.lastRevision.inputHash!==inputHash)fail(409,'This update was already saved with different measurements. Reload the cut sheet.');
  return {job:currentView(job),applied:true};
 }
 if(data.revision!==(job.revision||1))fail(409,'The owner has updated this cut sheet. Reload it before editing again.');
 if(order){
  const original=manufacturingOpenings(order);
  if(canonical.length!==original.length||canonical.some((o,i)=>o.id!==original[i].id||o.quantity!==original[i].quantity))fail(400,'Keep the same openings and quantities as the sold order.');
 }
 const prepared=prepare(job,canonical);
 if(operation==='job-revision-preview')return {version:job.version,revision:job.revision||1,...Object.fromEntries(['impact','nextRevision','changed'].map(k=>[k,prepared[k]]))};
 if(data.version!==job.version)fail(409,'Shop progress changed while you reviewed this update. Review changes again before saving.');
 if(typeof data.requestId!=='string'||!/^[-a-zA-Z0-9_]{1,64}$/.test(data.requestId))fail(400,'This update needs a valid request identifier.');
 if(!prepared.changed)return {job:currentView(job)};
 const history={revision:job.revision||1,replacedAt:time,by:actor.name,openings:structuredClone(job.openings),production:structuredClone(job.production),completedAt:job.completedAt,productionCompletedAt:job.productionCompletedAt};
 job.revisions=[...(job.revisions||[]),history].slice(-20);
 if(job.startedAt){job.elapsedMs+=Math.max(0,time-job.startedAt);job.startedAt=null;}
 job.openings=prepared.openings;job.production={};job.revision=prepared.nextRevision;job.revisedAt=time;
 job.completedAt=progress(job).complete?(job.completedAt||time):null;
 for(const o of job.openings)o.productionCompletedAt=openingProduction(job,o).key==='complete'?(o.productionCompletedAt||time):null;
 job.productionCompletedAt=production(job).key==='complete'?(job.productionCompletedAt||time):null;
 job.lastRevision={requestId:data.requestId,inputHash};
 job.revisionSummary=prepared.impact.map(i=>({name:i.name,resetFinishing:i.resetFinishing,removed:i.removed,changedLines:i.changes.length}));
 job.activity.unshift({at:time,by:actor.name,message:`Updated cut sheet to revision ${job.revision}: ${prepared.impact.map(i=>i.name).join(', ')}. Previous printed copies replaced.`});job.activity=job.activity.slice(0,200);
 job.updatedAt=time;job.version++;
 if(order){order.manufacturingSpecifications=structuredClone(canonical);order.manufacturingRevision=job.revision;order.updatedAt=time;order.version++;}
 if(draft){draft.openings=structuredClone(canonical);draft.revision=job.revision;draft.updatedAt=time;draft.version++;}
 return {job:currentView(job)};
}
