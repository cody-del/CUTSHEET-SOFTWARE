// Workers receive a manufacturing projection, never the stored sales record.
// Opening labels, shop notes and material-request notes are intentionally shared.
// Keep this allowlist separate from owner views so new sales fields stay private.
const pick=(value,keys)=>Object.fromEntries(keys.filter(key=>value?.[key]!==undefined).map(key=>[key,structuredClone(value[key])]));
const postView=t=>t?{...pick(t,['construction','positions','configuration','positionDatum']),sections:(t.sections||[]).map(s=>pick(s,['left','right']))}:undefined;
const checks=value=>Object.fromEntries(['louvers-capped','stiles-capped','capping','boring','building','hinging'].filter(key=>value?.[key]).map(key=>[key,pick(value[key],['status','updatedAt','completedAt'])]));
const partKeys=['name','profile','length','quantity','perUnit','section','machining'];
const partView=part=>pick(part,partKeys);
function lineView(line){
 return {...partView(line),...pick(line,['id','completed','status']),shortage:line.shortage?{...pick(line.shortage,['status','note','createdAt','updatedAt']),by:'Workshop'}:null};
}
function openingView(opening){
 const input=pick(opening.input,['id','name','productId','width','height','quantity','left','right','louver','frame','frameStyle','frameSides','sides','mount','sizeMethod','color','tilt','stile','divider','divisionMode','notes']);
 if(opening.input.tposts)input.tposts=postView(opening.input.tposts);
 if(input.frameSides)input.frameSides=pick(input.frameSides,['top','bottom','left','right']);
 const result=pick(opening.result,['hinges','panelWidth','panelHeight','louversPerPanel','gap','lightGapWarning','warnings','reviewNotes','version','status']);
 result.parts=(opening.result.parts||[]).map(partView);
 result.machining=(opening.result.machining||[]).map(m=>pick(m,['label','value']));
 if(opening.result.louverLayout)result.louverLayout=pick(opening.result.louverLayout,['bottom','top','middle','total','divided','bottomHeight','topHeight','middleHeight','dividerFromBottom','panelHeight']);
 if(opening.result.sections)result.sections=opening.result.sections.map(s=>pick(s,['number','left','right','start','end','railLength','louverLength','louverQuantity']));
 if(opening.result.tposts)result.tposts=postView(opening.result.tposts);
 return {input,result,lines:opening.lines.map(lineView),production:checks(opening.production),...pick(opening,['productionCompletedAt'])};
}
function readinessView(value){return value?{...pick(value,['status','label']),issues:(value.issues||[]).map(i=>pick(i,['openingId','openingName','message']))}:undefined;}
function label(record){return 'Job '+record.number;}
export function workerJob(job){
 const result={...pick(job,['id','number','productId','held','due','targetMinutes','publishedAt','updatedAt','version','elapsedMs','startedAt','completedAt','cuttingStartedAt','productionCompletedAt','notes']),name:label(job),displayName:label(job),activity:[],production:checks(job.production),openings:job.openings.map(openingView)};
 if(job.readiness)result.readiness=readinessView(job.readiness);
 return result;
}
export function workerResponse(value){
 // All permitted read and mutation responses pass through the same projection.
 if(value.job)return {job:workerJob(value.job)};
 if(value.jobs)return {serverTime:value.serverTime,jobs:value.jobs.map(workerJob),pendingOrders:(value.pendingOrders||[]).map(order=>({...pick(order,['id','number','openingCount','createdAt','version']),name:label(order),displayName:label(order),readiness:readinessView(order.readiness)}))};
 return value;
}
