// Shared presentation helpers. Quantities and elapsed time are authoritative on the server.
export const productionStages=[
  {key:'waiting',label:'Waiting'}, {key:'cutting',label:'Cutting'},
  {key:'capping',label:'Capping'}, {key:'boring',label:'Boring'},
  {key:'building',label:'Building'}, {key:'hinging',label:'Hinging'},
  {key:'complete',label:'Complete'}
];
export const finishingStages=productionStages.slice(2,-1);
export const productionChecks=[
  {key:'louvers-capped',label:'Louvers capped',stage:'capping'},
  {key:'stiles-capped',label:'Stiles capped',stage:'capping'},
  {key:'boring',label:'Stiles & rails bored',stage:'boring'},
  {key:'building',label:'Panels built & pressed',stage:'building'},
  {key:'hinging',label:'Hinged / complete',stage:'hinging'}
];
// Older jobs recorded one Capping check. Preserve that work until a worker
// explicitly updates either of the new independent checks.
const recordedStatus=(record,key)=>record?.[key]?.status||
  (['louvers-capped','stiles-capped'].includes(key)?record?.capping?.status:null);
export const openingCheckStatus=(job,opening,key)=>recordedStatus(opening.production,key)||recordedStatus(job.production,key)||'not-started';
export function checkStatus(job,key){
  const statuses=job.openings.map(opening=>openingCheckStatus(job,opening,key));
  return statuses.length&&statuses.every(s=>s==='complete')?'complete':statuses.some(s=>s!=='not-started')?'partial':'not-started';
}
export function stageStatus(job,key){
  if(key!=='capping')return checkStatus(job,key);
  const statuses=['louvers-capped','stiles-capped'].map(key=>checkStatus(job,key));
  return statuses.every(s=>s==='complete')?'complete':statuses.some(s=>s!=='not-started')?'partial':'not-started';
}
function cuttingStarted(job){
  return !!(job.cuttingStartedAt||job.startedAt||job.elapsedMs||job.completedAt||
    job.openings.some(o=>o.lines.some(l=>l.status==='partial'||l.completed>0)));
}
function openingPhase(job,opening){
  const scoped={...job,openings:[opening]},cut=progress(scoped);
  const statuses=finishingStages.map(stage=>stageStatus(scoped,stage.key));
  if(cut.complete&&statuses.every(status=>status==='complete'))return productionStages.at(-1);
  // Follow finishing work that is actually in progress, even while cuts remain.
  // Completed work in one opening must not advance an untouched opening.
  const active=statuses.reduce((last,status,index)=>status==='partial'?index:last,-1);
  if(active>=0)return finishingStages[active];
  if(cut.complete||statuses.some(status=>status==='complete')){
    const next=statuses.findIndex(status=>status!=='complete');
    if(next>=0)return finishingStages[next];
  }
  return productionStages[cuttingStarted({...scoped,cuttingStartedAt:null,startedAt:null,elapsedMs:0,completedAt:null})||statuses.some(status=>status!=='not-started')?1:0];
}
export function production(job) {
  if(!job)return productionStages[0];
  const p=progress(job),hasFinishing=productionChecks.some(check=>checkStatus(job,check.key)!=='not-started');
  if(!hasFinishing)return productionStages[p.complete?2:cuttingStarted(job)?1:0];
  const unfinished=job.openings.map(opening=>openingPhase(job,opening)).filter(stage=>stage.key!=='complete');
  if(!unfinished.length&&p.complete)return productionStages.at(-1);
  const active=unfinished.reduce((latest,stage)=>productionStages.indexOf(stage)>productionStages.indexOf(latest)?stage:latest,productionStages[0]);
  return active.key==='waiting'?productionStages[1]:active;
}
export function openingProduction(job,opening){return openingPhase(job,opening);}
export function productionStageStatus(job,key){
  if(key==='waiting')return production(job).key==='waiting'?'not-started':'complete';
  if(key==='complete')return production(job).key==='complete'?'complete':'not-started';
  if(key==='cutting')return progress(job).complete?'complete':cuttingStarted(job)?'partial':'not-started';
  return stageStatus(job,key);
}
// A job appears in its current column and in earlier columns with unfinished work.
// These are views of the same job, never duplicate production records.
export function productionColumns(job){
  const active=production(job),index=productionStages.indexOf(active);
  if(active.key==='complete')return ['complete'];
  return productionStages.filter((stage,i)=>stage.key===active.key||
    (i>0&&i<index&&productionStageStatus(job,stage.key)!=='complete')).map(stage=>stage.key);
}
export const openingProgress=opening=>progress({openings:[opening]});
export const completedOpenings=job=>job.openings.filter(opening=>openingProduction(job,opening).key==='complete').length;
export function elapsed(job, now=Date.now()) {
  return (job.elapsedMs||0)+(job.startedAt?Math.max(0,now-job.startedAt):0);
}
export function progress(job) {
  const lines=job.openings.flatMap(o=>o.lines),total=lines.reduce((n,l)=>n+l.quantity,0);
  const done=lines.reduce((n,l)=>n+l.completed,0);
  return {total,done,percent:total?(done===total?100:Math.min(99,Math.round(done/total*100))):0,lines:lines.length,
    cutLines:lines.filter(l=>l.completed===l.quantity).length,
    complete:total>0&&done===total,
    alerts:lines.filter(l=>l.shortage&&l.shortage.status!=='resolved')};
}
export function schedule(job,now=Date.now()) {
  const p=progress(job),minutes=elapsed(job,now)/60000;
  if(p.alerts.length)return {label:'Needs material',tone:'attention'};
  if(p.complete)return {label:job.targetMinutes&&minutes>job.targetMinutes?'Complete · over estimate':'Fully cut',tone:'complete'};
  // A date-only deadline stays on schedule through the end of that shop day.
  const today=new Date(now).toLocaleDateString('en-CA',{timeZone:'America/New_York'});
  if(job.due&&job.due<today)return {label:'Past target date',tone:'attention'};
  if(job.targetMinutes&&minutes>job.targetMinutes)return {label:'Over estimate',tone:'attention'};
  if(!job.targetMinutes)return {label:'No time estimate',tone:'quiet'};
  if(!minutes)return {label:'Ready to cut',tone:'quiet'};
  return {label:'Within estimate',tone:'normal'};
}
export function duration(ms) {
  if(ms<60000)return `${Math.floor(Math.max(0,ms)/1000)}s`;
  const minutes=Math.floor(Math.max(0,ms)/60000),hours=Math.floor(minutes/60);
  return hours?`${hours}h ${minutes%60}m`:`${minutes}m`;
}
