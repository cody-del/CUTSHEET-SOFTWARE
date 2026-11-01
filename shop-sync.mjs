import {createHash} from 'node:crypto';
import {progressTarget} from './public/shop-progress.js';
import {productionChecks} from './public/shop-state.js';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const error=(status,message)=>{const e=new Error(message);e.status=status;throw e;};
export function validateProgressEvent(event,time){
 if(!event||!uuid.test(event.eventId)||!['line','stage'].includes(event.action)||!event.payload||typeof event.base!=='string'||event.base.length>2000||!Number.isInteger(event.revision)||event.revision<1)error(400,'Invalid saved shop update.');
 if(!Number.isFinite(event.createdAt)||event.createdAt>time+300000||event.createdAt<time-7*86400000)error(409,'This saved update is over seven days old or its iPad clock is incorrect. Review it with the owner.');
 if(typeof event.payload.id!=='string'||! /^[a-zA-Z0-9_-]{1,64}$/.test(event.payload.id)||['__proto__','constructor','prototype'].includes(event.payload.id))error(400,'Invalid job identifier.');
 if(event.action==='stage'&&(!event.payload.openingId||!productionChecks.some(s=>s.key===event.payload.stage)))error(400,'Choose an opening and finishing check.');
 return {eventId:event.eventId,action:event.action,payload:event.payload,base:event.base,revision:event.revision,createdAt:event.createdAt};
}
export function prepareProgressSync(state,actor,event,time){
 const digest=createHash('sha256').update(JSON.stringify(event)).digest('hex');
 const receipt=state.productionEvents?.[event.eventId];
 const job=state.jobs[event.payload.id];
 if(!job||job.deletedAt||state.orders?.[job.id]?.deletedAt)error(409,'This job was removed from Production. Your saved update needs owner review.');
 if(receipt){
  if(receipt.actorId!==actor.id||receipt.digest!==digest)error(409,'This update ID was already used for different progress.');
  return {duplicate:true,job};
 }
 if((job.revision||1)!==event.revision)error(409,'The owner revised this cut sheet. Review the latest measurements before applying your saved progress.');
 if(progressTarget(job,event.action,event.payload)!==event.base)error(409,'This line or finishing check changed on another device. Your saved progress needs review.');
 return {job,commit(){
  state.productionEvents??={};state.productionEvents[event.eventId]={actorId:actor.id,by:actor.name,jobId:job.id,digest,action:event.action,payload:structuredClone(event.payload),revision:event.revision,occurredAt:event.createdAt,savedAt:time};
 }};
}
