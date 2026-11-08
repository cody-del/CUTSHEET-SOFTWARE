import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileStore} from '../shop-store.mjs';
import {createShopService} from '../shop-service.mjs';
import {shopHandler} from '../shop-api.mjs';
import {productionColumns} from '../public/shop-state.js';
import {progressTarget} from '../public/shop-progress.js';

const opening={id:'opening-1',name:'Front window',width:36,height:59.5,quantity:2,left:1,right:1,louver:4,frame:'TR',sides:'4W',mount:'I',sizeMethod:'S',color:'W',tilt:'Back',stile:'Flat',divider:0,notes:''};
const input={id:'job-1',name:'Workshop test',number:'TEST-001',notes:'Test only',openings:[opening]};
const password='test-only-owner-password',secret='test-only-secret-more-than-thirty-two-characters';
async function fixture(t){
 const directory=await mkdtemp(join(tmpdir(),'production-removal-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const store=fileStore(join(directory,'workshop.json'));let time=Date.UTC(2026,10,8,16);
 const service=createShopService({store,local:false,password,secret,now:()=>time});
 const owner={owner:(await service.run('login',{password})).token};
 const {code}=await service.run('pairing',{name:'Test shop iPad'},owner);
 const shop={shop:(await service.run('pair',{code})).token};
 return {store,service,owner,shop,run:(operation,data)=>service.run(operation,data,owner),advance:ms=>time+=ms,time:()=>time};
}

test('removing a multi-stage job preserves cuts, finishing and finances, pauses time and can be restored',async t=>{
 const f=await fixture(t);let {job}=await f.run('publish',{job:input});
 const finance={totalCents:100000,payments:[{id:'deposit',amountCents:25000}]};
 await f.store.transaction(s=>{s.orders={[input.id]:{...input,productId:'shuttersmart',version:1,finance,customer:{firstName:'Test'},createdAt:f.time()}};});
 ({job}=await f.run('line',{id:job.id,version:job.version,lineId:job.openings[0].lines[0].id,status:'partial',completed:1,outOfMaterial:false}));
 ({job}=await f.run('stage',{id:job.id,version:job.version,openingId:opening.id,stage:'louvers-capped',status:'partial'}));
 ({job}=await f.run('timer',{id:job.id,version:job.version,action:'start'}));f.advance(60000);
 assert.deepEqual(productionColumns(job),['cutting','capping']);
 const savedOpenings=structuredClone(job.openings);
 await f.run('production-remove',{id:job.id,version:job.version});
 const board=await f.run('dashboard');assert.equal(board.jobs.length,0);assert.equal(board.pendingOrders.length,0);assert.equal(board.removedJobs.length,1);
 const worker=await f.service.run('jobs',{},f.shop);assert.equal(worker.jobs.length,0);assert.equal(worker.removedJobs,undefined);
 const state=await f.store.transaction(s=>structuredClone(s));
 assert.deepEqual(state.jobs[job.id].openings,savedOpenings);assert.deepEqual(state.orders[job.id].finance,finance);
 assert.equal(state.jobs[job.id].startedAt,null);assert.equal(state.jobs[job.id].elapsedMs,60000);
 assert.equal((await f.run('workspace')).cutSheets.find(j=>j.id===job.id).stage,'Removed from production');
 assert.ok((await f.run('workspace-backup')).data.jobs[job.id].productionRemovedAt);
 const restarted=createShopService({store:f.store,local:true});
 assert.equal((await restarted.run('dashboard')).removedJobs.length,1);
 await f.run('production-restore',{id:job.id,version:board.removedJobs[0].version});
 const restored=(await f.run('dashboard')).jobs[0];assert.deepEqual(productionColumns(restored),['cutting','capping']);
 assert.deepEqual(restored.openings,savedOpenings);assert.equal(restored.startedAt,null);assert.equal(restored.elapsedMs,60000);
 assert.equal((await f.run('dashboard')).removedJobs.length,0);
});

test('owner permission, request origin, identifiers and current versions are required',async t=>{
 const f=await fixture(t);const {job}=await f.run('publish',{job:input});
 for(const op of ['production-remove','production-restore']){
  await assert.rejects(f.service.run(op,{id:job.id,version:job.version},f.shop),e=>e.status===403);
  await assert.rejects(f.service.run(op,{id:job.id,version:job.version}),e=>e.status===401);
 }
 await assert.rejects(f.run('production-remove',{id:'__proto__',version:job.version}),e=>e.status===400);
 await assert.rejects(f.run('production-remove',{id:job.id,version:job.version-1}),e=>e.status===409);
 assert.equal((await f.run('dashboard')).jobs.length,1);
 const api=shopHandler(f.service),request=(method,origin)=>new Request('https://example.test/api/shop/production-remove',{method,headers:{cookie:'cutsheet_owner='+f.owner.owner,origin,'content-type':'application/json'},...(method==='POST'?{body:JSON.stringify({id:job.id,version:job.version})}:{})});
 assert.equal((await api(request('GET','https://example.test'))).status,405);
 assert.equal((await api(request('POST','https://evil.test'))).status,403);
 assert.equal((await api(request('POST','https://example.test'))).status,200);
 const deleted=(await f.run('dashboard')).removedJobs[0];
 await assert.rejects(f.run('production-remove',{id:job.id,version:deleted.version}),e=>e.status===409);
 await f.run('production-restore',{id:job.id,version:deleted.version});
 const restored=(await f.run('dashboard')).jobs[0];
 await assert.rejects(f.run('production-restore',{id:job.id,version:restored.version}),e=>e.status===409);
});

test('removed jobs reject stale iPad reads, PDFs, direct writes and queued offline updates',async t=>{
 const f=await fixture(t);const {job}=await f.run('publish',{job:input});
 const lineId=job.openings[0].lines[0].id;
 const event={eventId:randomUUID(),action:'line',payload:{id:job.id,lineId,status:'cut'},base:progressTarget(job,'line',{lineId}),revision:1,createdAt:f.time()};
 await f.run('production-remove',{id:job.id,version:job.version});
 for(const [op,data]of [['job-get',{}],['line',{lineId,status:'cut'}],['stage',{openingId:opening.id,stage:'boring',status:'complete'}],['timer',{action:'start'}]])
  await assert.rejects(f.service.run(op,{id:job.id,version:job.version,...data},f.shop),e=>e.status===404);
 await assert.rejects(f.service.run('sync',event,f.shop),e=>e.status===409&&/owner review/.test(e.message));
 const response=await shopHandler(f.service)(new Request('https://example.test/api/shop/job-pdf',{method:'POST',headers:{cookie:'cutsheet_shop='+f.shop.shop,'content-type':'application/json'},body:JSON.stringify({id:job.id})}));
 assert.equal(response.status,404);
 assert.equal((await f.store.transaction(s=>s.jobs[job.id])).openings[0].lines[0].completed,0);
});

test('waiting orders can be removed and restored without deleting the order or its finishing checks',async t=>{
 const f=await fixture(t);
 await f.store.transaction(s=>{s.orders={waiting:{...input,id:'waiting',number:'O-5000',productId:'shuttersmart',version:1,createdAt:f.time(),finance:{confirmedAt:f.time()},customer:{firstName:'Test'},finishingProgress:{openings:{[opening.id]:{'louvers-capped':{status:'partial'}}}}}};});
 assert.equal((await f.run('dashboard')).pendingOrders.length,1);
 await f.run('production-remove',{id:'waiting',version:1});
 assert.equal((await f.run('dashboard')).pendingOrders.length,0);
 await assert.rejects(f.run('stage',{id:'waiting',version:2,stage:'boring',status:'complete',openingId:opening.id}),e=>e.status===404);
 await f.run('production-restore',{id:'waiting',version:2});
 assert.equal((await f.run('dashboard')).pendingOrders.length,1);
 assert.equal((await f.run('job-get',{id:'waiting'})).job.openings[0].production['louvers-capped'].status,'partial');
 // An explicit release from Orders must not accidentally restore a removed card.
 await f.run('production-remove',{id:'waiting',version:3});
 await f.run('publish',{job:{...input,id:'waiting'}});
 let board=await f.run('dashboard');assert.equal(board.jobs.length,0);assert.equal(board.pendingOrders.length,0);assert.equal(board.removedJobs.length,1);
 await f.run('production-restore',{id:'waiting',version:board.removedJobs[0].version});
 board=await f.run('dashboard');assert.equal(board.jobs.length,1);assert.equal(board.removedJobs.length,0);
 const state=await f.store.transaction(s=>s);assert.equal(state.orders.waiting.productionRemovedAt,undefined);assert.equal(state.jobs.waiting.productionRemovedAt,undefined);
});
