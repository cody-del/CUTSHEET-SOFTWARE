import {hasManufacturingLines} from './public/products.js';
import {productionName} from './order-manufacturing.mjs';

export const productionRemovalOperations=['production-remove','production-restore'];
export const removedFromProduction=(state,id)=>!!(state.jobs[id]?.productionRemovedAt||state.orders?.[id]?.productionRemovedAt);
const removedAt=(state,id)=>state.jobs[id]?.productionRemovedAt||state.orders?.[id]?.productionRemovedAt;
export function removedProductionJobs(state){
 const records=new Map(Object.values(state.orders||{}).filter(hasManufacturingLines).map(o=>[o.id,o]));
 for(const job of Object.values(state.jobs))records.set(job.id,job);
 return [...records.values()].filter(r=>removedFromProduction(state,r.id)&&!r.deletedAt&&!state.orders?.[r.id]?.deletedAt).map(r=>({
  id:r.id,number:r.number,name:r.name,displayName:productionName(state.orders?.[r.id]||state.drafts?.[r.id]||r),version:r.version,removedAt:removedAt(state,r.id)
 })).sort((a,b)=>b.removedAt-a.removedAt);
}
export function changeProductionRemoval(state,operation,data,actor,time){
 const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
 if(actor.role!=='owner')fail(403,'Only the owner can remove or restore production jobs.');
 if(typeof data.id!=='string'||!/^[-a-zA-Z0-9_]{1,64}$/.test(data.id)||['__proto__','constructor','prototype'].includes(data.id))fail(400,'Invalid job identifier.');
 const job=state.jobs[data.id],order=state.orders?.[data.id],record=job||order;
 if(!record||record.deletedAt||order?.deletedAt||!job&&!hasManufacturingLines(order))fail(404,'This production job was not found.');
 if(data.version!==record.version)fail(409,'This job changed on another device. Review its latest progress and try again.');
 const restoring=operation==='production-restore';
 if(restoring?!removedFromProduction(state,data.id):removedFromProduction(state,data.id))fail(409,restoring?'This job is already in Production.':'This job is already in Removed.');
 if(restoring){
  for(const source of [job,order].filter(Boolean)){delete source.productionRemovedAt;delete source.productionRemovedBy;}
 }else{record.productionRemovedAt=time;record.productionRemovedBy=actor.name;}
 if(job){
  if(job.startedAt){job.elapsedMs=(job.elapsedMs||0)+Math.max(0,time-job.startedAt);job.startedAt=null;}
  job.activity??=[];job.activity.unshift({at:time,by:actor.name,message:restoring?'Restored to Production; timer remains paused.':'Removed from Production; progress saved and timer paused.'});job.activity=job.activity.slice(0,1000);
 }
 record.version++;record.updatedAt=time;
 // An unreleased order may be released while hidden. Keep any order-level
 // removal marker versioned when restoring the resulting production job.
 if(restoring&&order&&job){order.version++;order.updatedAt=time;}
 return {ok:true,id:record.id,version:record.version};
}
