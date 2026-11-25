import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileStore} from '../shop-store.mjs';
import {createShopService} from '../shop-service.mjs';
import {shopHandler} from '../shop-api.mjs';
import {quoteTotals} from '../sales-service.mjs';
import {activeOrders,isOrderCompleted} from '../public/order-lifecycle.js';
import {progressTarget} from '../public/shop-progress.js';
import {readWorkspaceBackup} from '../workspace-backup.mjs';

const password='test-owner-password',secret='test-signing-key-with-more-than-32-characters';
const contact={firstName:'Order',lastName:'History',address:'123 Example Lane',phone:'',email:'',notes:''};
const opening={id:'opening-1',name:'Living room',width:36,height:59.5,quantity:1,left:1,right:1,louver:4,frame:'TR',sides:'4W',mount:'I',sizeMethod:'S',color:'W',tilt:'Back',stile:'Flat',divider:0,divisionMode:'divider',notes:''};
async function fixture(t,{supplier=false,held=false,confirm=true}={}){
 const dir=await mkdtemp(join(tmpdir(),'cutsheet-completion-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const path=join(dir,'workshop.json');let time=Date.parse('2026-11-24T12:00:00Z');
 const service=createShopService({store:fileStore(path),password,secret,now:()=>time});
 const owner={owner:(await service.run('login',{password})).token},run=(action,data={})=>service.run(action,data,owner);
 await run('contact-save',{id:'contact-1',version:0,fields:contact});
 await run('pricing-save',{version:0,rateCents:2500,minimumAreaHundredths:0});
 let {quote}=await run('quote-create',{id:'quote-1',contactId:'contact-1',...(supplier?{productId:'other',productLabel:'Supplier'}:{})});
 ({quote}=await run('quote-save',{id:quote.id,version:quote.version,fields:{openings:[{...opening,height:held?60:opening.height}],unitPrices:{'opening-1':50000}}}));
 let {order}=await run('quote-convert',{id:quote.id,version:quote.version});
 if(confirm)({order}=await run('order-confirm',{id:order.id,version:order.version,confirmationId:'confirmation-1',saleTotalCents:quoteTotals(order).total,payment:{id:'payment-1',amountCents:10000,receivedOn:'2026-11-24',method:'check',note:'Deposit'}}));
 const {code}=await run('pairing',{name:'Test iPad'}),shop={shop:(await service.run('pair',{code})).token};
 return {service,owner,shop,path,run,order,advance:ms=>{time+=ms;},read:()=>readFile(path,'utf8').then(JSON.parse)};
}
const queued=(job,payload)=>({eventId:randomUUID(),action:'line',payload:{id:job.id,...payload},base:progressTarget(job,'line',payload),revision:job.revision||1,createdAt:Date.parse('2026-11-24T12:00:00Z')});
const complete=async f=>(await f.run('order-complete',{id:f.order.id,version:(await f.run('sales-get',{kind:'order',id:f.order.id})).record.version})).order;

test('completing an order clears active work while preserving customer history, money, dimensions, progress, backup and printable PDFs',async t=>{
 const f=await fixture(t),before=(await f.run('sales')).financials;
 let {job}=await f.run('job-get',{id:f.order.id});
 const line=job.openings[0].lines.find(l=>l.quantity>1);
 ({job}=await f.run('line',{id:job.id,version:job.version,lineId:line.id,status:'partial',completed:1,outOfMaterial:false}));
 ({job}=await f.run('timer',{id:job.id,version:job.version,action:'start'}));
 f.advance(120000);
 const closed=await complete(f);
 assert.equal(closed.status,'completed');assert.ok(closed.completedAt);assert.equal(closed.completedBy,'Owner');
 assert.equal(activeOrders((await f.run('sales')).orders).length,0);
 assert.deepEqual((await f.run('sales')).financials,before);
 for(const data of [await f.run('dashboard'),await f.service.run('jobs',{},f.shop)]){assert.equal(data.jobs.length,0);assert.equal(data.pendingOrders.length,0);}
 assert.equal((await f.run('dashboard')).removedJobs.length,0);
 assert.equal((await f.run('workspace')).cutSheets.length,0);
 const history=await f.run('sales-get',{kind:'contact',id:'contact-1'});
 assert.equal(history.orders.length,1);assert.equal(history.orders[0].status,'completed');assert.equal(history.orders[0].completedAt,closed.completedAt);
 assert.equal(history.quotes[0].orderId,closed.id);
 const record=(await f.run('sales-get',{kind:'order',id:closed.id})).record;
 assert.deepEqual(record.openings,f.order.openings);assert.deepEqual(record.finance,f.order.finance);
 const saved=await f.read();assert.equal(saved.jobs[closed.id].startedAt,null);assert.equal(saved.jobs[closed.id].elapsedMs,120000);
 assert.deepEqual(saved.jobs[closed.id].openings,job.openings);
 const backup=readWorkspaceBackup(await f.run('workspace-backup'));assert.deepEqual(backup.orders[closed.id],record);assert.deepEqual(backup.jobs[closed.id],saved.jobs[closed.id]);
 const second=createShopService({store:fileStore(f.path),local:true});assert.equal((await second.run('sales-get',{kind:'contact',id:'contact-1'})).orders[0].status,'completed');
 const handler=shopHandler(f.service);
 for(const endpoint of ['order-pdf','sales-document']){
  const response=await handler(new Request('https://example.test/api/shop/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json',cookie:'cutsheet_owner='+f.owner.owner},body:JSON.stringify({kind:'order',id:closed.id,units:'mm'})}));
  assert.equal(response.status,200);assert.match(response.headers.get('Content-Type'),/application\/pdf/);
 }
 const paid=await f.run('order-payment',{id:closed.id,version:closed.version,payment:{id:'final-payment',amountCents:40000,receivedOn:'2026-11-24',method:'cash',note:'Balance'}});
 assert.equal(paid.financials.balanceCents,0);assert.equal(paid.order.status,'completed');
 assert.equal((await f.run('sales')).financials.receivedCents,50000);
});

test('closing is owner-only, versioned, confirmed, and requires an accessible contact',async t=>{
 const f=await fixture(t);
 for(const action of ['order-complete','order-reopen']){
  await assert.rejects(f.service.run(action,{id:f.order.id,version:f.order.version}),e=>e.status===401);
  await assert.rejects(f.service.run(action,{id:f.order.id,version:f.order.version},f.shop),e=>e.status===403);
 }
 await assert.rejects(f.run('order-complete',{id:f.order.id,version:1}),e=>e.status===409);
 await f.run('sales-delete',{kind:'contact',id:'contact-1',version:1});
 await assert.rejects(complete(f),/Restore this customer/);
 assert.equal(isOrderCompleted((await f.run('sales-get',{kind:'order',id:f.order.id})).record),false);
 const unconfirmed=await fixture(t,{confirm:false});await assert.rejects(complete(unconfirmed),/Confirm this order/);
});

test('closed jobs reject stale shop changes and old offline work; reopening retains progress and supports fresh syncing',async t=>{
 const f=await fixture(t);const {job}=await f.service.run('job-get',{id:f.order.id},f.shop),line=job.openings[0].lines[0];
 const offline=queued(job,{lineId:line.id,status:'cut'});
 const closed=await complete(f),saved=await f.read();
 const requests=[
  ['job-get',{id:closed.id}],['line',{id:closed.id,version:job.version,lineId:line.id,status:'cut'}],
  ['stage',{id:closed.id,version:job.version,stage:'boring',status:'complete'}],
  ['timer',{id:closed.id,version:job.version,action:'start'}],['plan',{id:closed.id,version:job.version}],
  ['resolve',{id:closed.id,version:job.version,lineId:line.id,status:'resolved'}],
  ['order-release',{id:closed.id,version:closed.version}],['publish',{job:{id:closed.id,openings:[opening]}}],
  ['order-specifications-save',{id:closed.id,version:closed.version,openings:[opening]}],
  ...['job-revision-get','job-revision-preview','job-revision-apply'].map(action=>[action,{id:closed.id,openings:[opening]}]),
  ...['production-remove','production-restore'].map(action=>[action,{id:closed.id,version:saved.jobs[closed.id].version}])
 ];
 for(const [action,data] of requests)await assert.rejects(f.run(action,data),e=>e.status===409,action);
 await assert.rejects(f.service.run('sync',offline,f.shop),/completed/);
 await assert.rejects(f.run('order-reopen',{id:closed.id,version:f.order.version}),e=>e.status===409);
 const reopened=(await f.run('order-reopen',{id:closed.id,version:closed.version})).order;
 assert.equal(reopened.status,'in-production');assert.equal(reopened.completedAt,undefined);
 assert.deepEqual(reopened.completionHistory.map(e=>e.action),['completed','reopened']);
 assert.equal(activeOrders((await f.run('sales')).orders).length,1);assert.equal((await f.run('dashboard')).jobs.length,1);
 const current=(await f.service.run('job-get',{id:closed.id},f.shop)).job;
 assert.equal(current.startedAt,null);assert.equal(current.progressEpoch,1);assert.deepEqual(current.openings,job.openings);
 await assert.rejects(f.service.run('sync',offline,f.shop),/changed on another device/);
 await assert.rejects(f.service.run('line',{id:job.id,version:job.version,lineId:line.id,status:'cut'},f.shop),e=>e.status===409);
 const fresh=await f.service.run('sync',queued(current,{lineId:line.id,status:'cut'}),f.shop);
 assert.equal(fresh.job.openings[0].lines[0].status,'cut');
});

test('supplier orders and held manufacturing orders can be closed without generating or altering shop work',async t=>{
 for(const options of [{supplier:true},{held:true}]){
  const f=await fixture(t,options),closed=await complete(f);
  assert.equal((await f.run('dashboard')).pendingOrders.length,0);assert.equal((await f.run('workspace')).cutSheets.length,0);
  assert.equal((await f.run('sales-get',{kind:'contact',id:'contact-1'})).orders[0].id,closed.id);
  assert.equal(Object.keys((await f.read()).jobs).length,0);
  if(options.held)await assert.rejects(f.run('stage',{id:closed.id,version:closed.version,stage:'boring',status:'complete'}),/completed/);
  const {order}=await f.run('order-reopen',{id:closed.id,version:closed.version});assert.equal(order.status,'ordered');
  assert.equal((await f.run('dashboard')).pendingOrders.length,options.held?1:0);
 }
});

test('deleting and restoring a completed order preserves completion instead of putting it back in Production',async t=>{
 const f=await fixture(t),closed=await complete(f);
 await f.run('sales-delete',{kind:'order',id:closed.id,version:closed.version});
 await f.run('sales-restore',{kind:'order',id:closed.id,version:closed.version+1});
 assert.equal(activeOrders((await f.run('sales')).orders).length,0);assert.equal((await f.run('dashboard')).jobs.length,0);
 assert.equal((await f.run('sales-get',{kind:'contact',id:'contact-1'})).orders[0].status,'completed');
});

test('closing and reopening a manually removed job preserves its removal until explicitly restored',async t=>{
 const f=await fixture(t),{job}=await f.run('job-get',{id:f.order.id});
 await f.run('production-remove',{id:job.id,version:job.version});
 const closed=await complete(f);assert.equal((await f.run('dashboard')).removedJobs.length,0);
 await f.run('order-reopen',{id:closed.id,version:closed.version});
 const board=await f.run('dashboard');assert.equal(board.jobs.length,0);assert.equal(board.removedJobs.length,1);
});
