import {offlineShopStore,offlineAccess} from './shop-offline-store.js';
import {progressTarget,previewProgress} from './shop-progress.js';
export function createOfflineShop({store=offlineShopStore,request,now=Date.now,uuid=()=>crypto.randomUUID(),notify=()=>{}}){
 let snapshot=null,flushing=null;
 const same=(a,b)=>a?.ownerId===b?.ownerId&&a?.id===b?.id&&a?.role===b?.role;
 const update=async fn=>{snapshot=await store.update(fn);notify();return snapshot;};
 const view=()=>{
  if(!snapshot)return null;const jobs=structuredClone(snapshot.jobs||[]);
  for(const e of snapshot.queue||[]){if(snapshot.queue.some(q=>q.error&&q.payload.id===e.payload.id))continue;const i=jobs.findIndex(j=>j.id===e.payload.id);if(i>=0&&(jobs[i].revision||1)===e.revision)jobs[i]=previewProgress(jobs[i],e);}
  return {jobs,queue:structuredClone(snapshot.queue||[]),verifiedAt:snapshot.verifiedAt,session:snapshot.session};
 };
 async function hydrate(){snapshot=await store.get();return offlineAccess(snapshot,now())?view():null;}
 async function accept(session,data){
  if(session.role!=='shop')return;
  await update(old=>({session,verifiedAt:now(),jobs:data.jobs,queue:same(old?.session,session)?old.queue||[]:[]}));
 }
 async function enqueue(job,action,payload){
  if(!['line','stage'].includes(action)||job.held)throw Error('Reconnect to change this item.');
  const event={eventId:uuid(),action,payload:structuredClone(payload),base:progressTarget(job,action,payload),revision:job.revision||1,createdAt:now()};
  delete event.payload.version;
  await update(old=>{
   if(!offlineAccess(old,now()))throw Error('Reconnect to renew this iPad’s offline access.');
   if(old.queue?.some(e=>e.error&&e.payload.id===job.id))throw Error('Review the waiting update for this job before making another change.');
   if((old.queue?.length||0)>=1000)throw Error('This iPad has 1,000 waiting updates. Reconnect before continuing.');
   return {...old,queue:[...(old.queue||[]),event]};
  });return event;
 }
 async function flush(){
  if(flushing)return flushing;
  const work=async()=>{
   const session=await request('session',undefined,{force:true});
   if(session.role!=='shop'||!same(snapshot?.session,session)){await update(()=>null);throw Object.assign(Error('Shop access changed. Reconnect this iPad.'),{status:401});}
   while(true){
    snapshot=await store.get();const event=snapshot?.queue?.find(e=>!e.error&&!snapshot.queue.some(other=>other.error&&other.payload.id===e.payload.id));if(!event)break;
    try{
     const result=await request('sync',event);
     await update(old=>{if(!same(old?.session,session))return old;return {...old,jobs:old.jobs.map(j=>j.id===result.job.id?result.job:j),queue:old.queue.filter(e=>e.eventId!==event.eventId)};});
    }catch(e){
     if(e.status===401||e.status===403){await update(()=>null);throw e;}
     if(e.status>=400&&e.status<500&&e.status!==429){await update(old=>({...old,queue:old.queue.map(q=>q.eventId===event.eventId?{...q,error:e.message}:q)}));continue;}
     throw e; // An uncertain acknowledgement keeps exactly the same event ID.
    }
   }
   return view();
  };
  flushing=globalThis.navigator?.locks? navigator.locks.request('cutsheet-shop-sync',work):work();
  try{return await flushing;}finally{flushing=null;}
 }
 async function discardJob(jobId){await update(old=>({...old,queue:old.queue.filter(e=>e.payload.id!==jobId)}));}
 return {hydrate,accept,enqueue,flush,view,discardJob,clear:()=>update(()=>null)};
}
