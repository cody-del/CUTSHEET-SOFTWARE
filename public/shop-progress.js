// Shared target comparison for queued shop updates. Unrelated work may sync;
// changes to this exact line/check or a manufacturing revision require review.
import {openingCheckStatus,openingProduction,production} from './shop-state.js';
export function progressTarget(job,action,payload){
 if(action==='line'){
  const line=job.openings.flatMap(o=>o.lines).find(l=>l.id===payload.lineId);
  if(!line)throw Error('This cut line is no longer on the cut sheet.');
  return JSON.stringify([line.status,line.completed,line.shortage?.status||null,line.shortage?.note||'']);
 }
 const opening=job.openings.find(o=>o.input.id===payload.openingId);
 if(!opening)throw Error('This opening is no longer on the cut sheet.');
 return JSON.stringify([openingCheckStatus(job,opening,payload.stage)]);
}
export function previewProgress(job,event){
 const result=structuredClone(job),p=event.payload,time=event.createdAt;
 if(event.action==='line'){
  const line=result.openings.flatMap(o=>o.lines).find(l=>l.id===p.lineId);if(!line)return result;
  line.status=p.status;line.completed=p.status==='cut'?line.quantity:p.status==='not-cut'?0:p.completed;
  if(p.status==='partial'&&p.outOfMaterial){line.shortage={status:'open',note:p.note||'',createdAt:time,updatedAt:time};result.startedAt=null;}
  else if(p.status==='cut'&&line.shortage)line.shortage.status='resolved';
 }else{
  const opening=result.openings.find(o=>o.input.id===p.openingId);if(!opening)return result;
  opening.production??={};opening.production[p.stage]={status:p.status,updatedAt:time,completedAt:p.status==='complete'?time:null};
 }
 result.cuttingStartedAt??=time;
 for(const o of result.openings)o.productionCompletedAt=openingProduction(result,o).key==='complete'?time:null;
 result.productionCompletedAt=production(result).key==='complete'?time:null;
 return result;
}
