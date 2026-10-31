import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileStore} from '../shop-store.mjs';
import {createShopService} from '../shop-service.mjs';
import {shopHandler} from '../shop-api.mjs';
import {quoteTotals} from '../sales-service.mjs';
import {readWorkspaceBackup} from '../workspace-backup.mjs';

const password='test-owner-password',secret='test-signing-key-with-more-than-32-characters';
const contact={firstName:'Delete',lastName:'Test',address:'123 Example Lane',phone:'555-0100',email:'delete@example.invalid',notes:'Keep saved notes'};
const opening={id:'opening-1',name:'Living room',width:36,height:59.5,quantity:1,left:1,right:1,louver:4,frame:'TR',sides:'4W',mount:'I',sizeMethod:'S',color:'W',tilt:'Back',stile:'Flat',divider:0,divisionMode:'divider',notes:''};
async function fixture(t){
 const dir=await mkdtemp(join(tmpdir(),'cutsheet-delete-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const path=join(dir,'workshop.json');let time=Date.parse('2026-10-31T12:00:00Z');
 const service=createShopService({store:fileStore(path),password,secret,now:()=>time});
 const owner={owner:(await service.run('login',{password})).token},run=(action,data={})=>service.run(action,data,owner);
 await run('contact-save',{id:'contact-1',version:0,fields:contact});
 await run('pricing-save',{version:0,rateCents:2500,minimumAreaHundredths:0});
 let {quote}=await run('quote-create',{id:'quote-1',contactId:'contact-1'});
 ({quote}=await run('quote-save',{id:quote.id,version:quote.version,fields:{openings:[opening]}}));
 const {order}=await run('quote-convert',{id:quote.id,version:quote.version});
 const {code}=await run('pairing',{name:'Test shop'}),shop={shop:(await service.run('pair',{code})).token};
 return {service,owner,shop,path,run,order,advance:ms=>{time+=ms;},read:()=>readFile(path,'utf8').then(JSON.parse)};
}
const deleted=(list,kind,id)=>list.deleted[kind+'s'].find(r=>r.id===id);

test('delete/restore contacts preserves related records and prevents stale saves or new quotes for deleted contacts',async t=>{
 const f=await fixture(t);
 await f.run('draft-save',{id:'draft-1',version:0,fields:{productId:'shuttersmart',name:'Standalone',number:'CS-001',contactId:'contact-1',openings:[opening]}});
 await f.run('sales-delete',{kind:'contact',id:'contact-1',version:1});
 const list=await f.run('sales');assert.equal(list.contacts.length,0);assert.equal(list.quotes.length,1);assert.equal(list.orders.length,1);
 assert.equal(list.quotes[0].customerName,'Delete Test');
 assert.equal((await f.run('sales-get',{kind:'quote',id:'quote-1'})).contact.notes,contact.notes);
 assert.equal((await f.run('sales-get',{kind:'order',id:f.order.id})).contact.email,contact.email);
 assert.equal((await f.run('workspace')).cutSheets.length,2);
 await assert.rejects(f.run('sales-get',{kind:'contact',id:'contact-1'}),e=>e.status===410);
 await assert.rejects(f.run('contact-save',{id:'contact-1',version:1,fields:contact}),e=>e.status===410);
 await assert.rejects(f.run('quote-create',{id:'new-quote',contactId:'contact-1'}),e=>e.status===410);
 await assert.rejects(f.run('draft-save',{id:'new-draft',version:0,fields:{productId:'shuttersmart',name:'New',number:'CS-002',contactId:'contact-1',openings:[opening]}}),e=>e.status===404);
 const existing=(await f.run('draft-get',{id:'draft-1'})).draft;
 await f.run('draft-save',{id:existing.id,version:existing.version,fields:existing});
 const backup=await f.run('workspace-backup');assert.ok(readWorkspaceBackup(backup).contacts['contact-1'].deletedAt);
 await f.run('sales-restore',{kind:'contact',id:'contact-1',version:deleted(list,'contact','contact-1').version});
 assert.equal((await f.run('sales')).contacts[0].notes,contact.notes);
 assert.equal((await f.run('sales')).deleted.contacts.length,0);
});

test('deleting a quote leaves its order intact; stale links and PDF requests cannot use a deleted quote',async t=>{
 const f=await fixture(t),q=(await f.run('sales-get',{kind:'quote',id:'quote-1'})).record;
 await f.run('sales-delete',{kind:'quote',id:q.id,version:q.version});
 assert.equal((await f.run('sales')).quotes.length,0);assert.equal((await f.run('sales')).orders.length,1);
 for(const [action,data]of [['sales-get',{kind:'quote',id:q.id}],['quote-save',{id:q.id,version:q.version,fields:{name:'Stale'}}],['quote-convert',{id:q.id,version:q.version}],['quote-create',{id:q.id,contactId:q.contactId}]])await assert.rejects(f.run(action,data),e=>e.status===410);
 const handler=shopHandler(f.service),request=(kind,id)=>new Request('https://example.test/api/shop/sales-document',{method:'POST',headers:{'Content-Type':'application/json',cookie:'cutsheet_owner='+f.owner.owner},body:JSON.stringify({kind,id})});
 assert.equal((await handler(request('quote',q.id))).status,410);
 assert.equal((await handler(request('order',f.order.id))).status,200);
 const r=deleted(await f.run('sales'),'quote',q.id);await f.run('sales-restore',{kind:'quote',id:q.id,version:r.version});
 assert.equal((await f.run('sales-get',{kind:'quote',id:q.id})).record.orderId,f.order.id);
});

test('deleting an unconfirmed order removes held production and cut sheets; restoring preserves finishing checks',async t=>{
 const f=await fixture(t);
 let {job}=await f.service.run('job-get',{id:f.order.id},f.shop);
 ({job}=await f.service.run('stage',{id:job.id,version:job.version,stage:'louvers-capped',status:'partial'},f.shop));
 const order=(await f.run('sales-get',{kind:'order',id:f.order.id})).record;
 await f.run('sales-delete',{kind:'order',id:order.id,version:order.version});
 const list=await f.run('sales');assert.equal(list.orders.length,0);assert.equal(list.quotes[0].orderDeleted,true);
 assert.equal((await f.run('sales-get',{kind:'quote',id:'quote-1'})).orderDeleted,true);
 assert.equal((await f.run('workspace')).cutSheets.length,0);
 assert.equal((await f.service.run('jobs',{},f.shop)).pendingOrders.length,0);
 await assert.rejects(f.service.run('job-get',{id:order.id},f.shop),e=>e.status===404);
 await assert.rejects(f.service.run('stage',{id:order.id,version:job.version,stage:'louvers-capped',status:'complete'},f.shop),e=>e.status===404);
 await assert.rejects(f.run('quote-convert',{id:'quote-1',version:list.quotes[0].version}),e=>e.status===410);
 const r=deleted(list,'order',order.id);await f.run('sales-restore',{kind:'order',id:order.id,version:r.version});
 const restored=(await f.service.run('job-get',{id:order.id},f.shop)).job;
 assert.equal(restored.openings[0].production['louvers-capped'].status,'partial');
 assert.equal((await f.run('dashboard')).pendingOrders.length,1);
 assert.equal((await f.run('sales-get',{kind:'quote',id:'quote-1'})).orderDeleted,false);
});

test('order deletion pauses a running timer, hides every production path and retains payments and cut progress for restore',async t=>{
 const f=await fixture(t),total=quoteTotals(f.order).total;
 const {order}=await f.run('order-confirm',{id:f.order.id,version:f.order.version,confirmationId:'confirm-1',saleTotalCents:total,payment:{id:'payment-1',amountCents:10000,receivedOn:'2026-10-31',method:'check',note:'Deposit'}});
 let {job}=await f.service.run('job-get',{id:order.id},f.shop),line=job.openings[0].lines.find(l=>l.quantity>1);
 ({job}=await f.service.run('line',{id:job.id,version:job.version,lineId:line.id,status:'partial',completed:1,outOfMaterial:false},f.shop));
 ({job}=await f.service.run('timer',{id:job.id,version:job.version,action:'start'},f.shop));
 f.advance(120000);
 await f.run('sales-delete',{kind:'order',id:order.id,version:order.version});
 assert.deepEqual((await f.run('dashboard')).jobs,[]);assert.deepEqual((await f.service.run('jobs',{},f.shop)).jobs,[]);
 assert.equal((await f.run('workspace')).cutSheets.length,0);
 const list=await f.run('sales');assert.equal(list.financials.soldCents,0);assert.equal(list.financials.receivedCents,0);assert.equal(list.financials.balanceCents,0);
 const saved=await f.read();assert.equal(saved.jobs[order.id].elapsedMs,120000);assert.equal(saved.jobs[order.id].startedAt,null);assert.equal(saved.orders[order.id].finance.payments[0].amountCents,10000);
 for(const [action,data]of [['job-get',{id:order.id}],['line',{id:order.id,version:job.version,lineId:line.id,status:'cut'}],['stage',{id:order.id,version:job.version,stage:'louvers-capped',status:'complete'}],['timer',{id:order.id,version:job.version,action:'start'}]])await assert.rejects(f.service.run(action,data,f.shop),e=>e.status===404);
 await assert.rejects(f.run('order-release',{id:order.id,version:order.version}),e=>e.status===410);
 await assert.rejects(f.run('publish',{job:{id:order.id,openings:[opening]}}),e=>e.status===410);
 const handler=shopHandler(f.service);
 const pdf=await handler(new Request('https://example.test/api/shop/job-pdf',{method:'POST',headers:{'Content-Type':'application/json',cookie:'cutsheet_shop='+f.shop.shop},body:JSON.stringify({id:order.id})}));assert.equal(pdf.status,404);
 const backup=readWorkspaceBackup(await f.run('workspace-backup'));assert.ok(backup.orders[order.id].deletedAt);assert.ok(backup.jobs[order.id].deletedAt);
 f.advance(3600000);const r=deleted(list,'order',order.id);
 await f.run('sales-restore',{kind:'order',id:order.id,version:r.version});
 const restored=(await f.service.run('job-get',{id:order.id},f.shop)).job;
 assert.equal(restored.startedAt,null);assert.equal(restored.elapsedMs,120000);
 assert.equal(restored.openings[0].lines.find(l=>l.id===line.id).completed,1);
 assert.equal((await f.run('sales')).financials.receivedCents,10000);assert.equal((await f.run('sales')).financials.soldCents,total);
 await assert.rejects(f.service.run('line',{id:order.id,version:job.version,lineId:line.id,status:'cut'},f.shop),e=>e.status===409);
});

test('only owners may delete/restore, record versions are checked, and arbitrary collections cannot be targeted',async t=>{
 const f=await fixture(t);
 for(const operation of ['sales-delete','sales-restore']){
  await assert.rejects(f.service.run(operation,{kind:'contact',id:'contact-1',version:1}),e=>e.status===401);
  await assert.rejects(f.service.run(operation,{kind:'contact',id:'contact-1',version:1},f.shop),e=>e.status===403);
  for(const kind of ['job','__proto__','constructor',null])await assert.rejects(f.run(operation,{kind,id:'contact-1',version:1}),e=>e.status===400);
 }
 await assert.rejects(f.run('sales-delete',{kind:'contact',id:'contact-1',version:0}),e=>e.status===409);
 await f.run('sales-delete',{kind:'contact',id:'contact-1',version:1});
 await assert.rejects(f.run('sales-restore',{kind:'contact',id:'contact-1',version:1}),e=>e.status===409);
 const r=deleted(await f.run('sales'),'contact','contact-1');await f.run('sales-restore',{kind:'contact',id:'contact-1',version:r.version});
 await assert.rejects(f.run('sales-delete',{kind:'contact',id:'contact-1',version:1}),e=>e.status===409);
 assert.equal((await f.run('sales')).contacts.length,1);
});
