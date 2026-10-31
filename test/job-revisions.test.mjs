import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PDFDocument} from 'pdf-lib';
import {fileStore} from '../shop-store.mjs';
import {createShopService} from '../shop-service.mjs';
import {shopHandler} from '../shop-api.mjs';
import {revisionOperations} from '../job-revisions.mjs';
import {quoteTotals,orderJob} from '../sales-service.mjs';
import {production,productionChecks,openingCheckStatus} from '../public/shop-state.js';
const opening={id:'opening-a',name:'Living room',width:36,height:59.5,quantity:1,left:1,right:1,louver:4,frame:'TR',sides:'4W',mount:'I',sizeMethod:'S',color:'W',tilt:'Back',stile:'Flat',divider:0,notes:''};
const fields={id:'draft',name:'Sample residence',number:'TEST-001',customer:'Private sample customer',notes:'',openings:[opening,{...opening,id:'opening-b',name:'Bedroom'}]};
async function setup(t,{draft=true}={}){
 const dir=await mkdtemp(join(tmpdir(),'cutsheet-revisions-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const path=join(dir,'workshop.json'),password='owner-test-password',service=createShopService({store:fileStore(path),password,secret:'test-signing-secret-more-than-32-characters'});
 const owner={owner:(await service.run('login',{password})).token},run=(op,data={})=>service.run(op,data,owner);
 if(draft){await run('draft-save',{id:fields.id,version:0,fields});await run('draft-release',{id:fields.id,version:1});}
 const {code}=await run('pairing',{name:'Shop iPad'}),shop={shop:(await service.run('pair',{code})).token};
 return {service,run,owner,shop,path};
}
const request=(job,openings,id='revision-request')=>({id:job.id,revision:job.revision||1,version:job.version,requestId:id,openings});
async function mark(f,job,index,name,status='cut'){
 const line=job.openings[index].lines.find(l=>l.name===name);
 return (await f.service.run('line',{id:job.id,version:job.version,lineId:line.id,status,...(status==='partial'?{completed:1,outOfMaterial:true,note:'Need material'}:{})},f.shop)).job;
}

test('revisions preserve unchanged cuts, shortages and other openings while resetting affected finishing',async t=>{
 const f=await setup(t);let {job}=await f.run('job-get',{id:'draft'});
 job=await mark(f,job,0,'Louvers');job=await mark(f,job,0,'Stile · flat','partial');job=await mark(f,job,1,'Louvers');
 ({job}=await f.run('stage',{id:job.id,version:job.version,stage:'capping',status:'complete'}));
 const old=structuredClone(job),items=job.openings.map(o=>({...o.input}));items[0].width=40;
 const input=request(job,items),preview=await f.run('job-revision-preview',input);
 assert.equal(preview.impact.length,1);assert.equal(preview.impact[0].name,'Living room');assert.equal(preview.impact[0].resetFinishing,true);
 assert.ok(preview.impact[0].previouslyCut>0);assert.equal((await f.run('job-get',{id:job.id})).job.revision,undefined);
 ({job}=await f.run('job-revise',{...input,version:preview.version}));
 assert.equal(job.revision,2);assert.equal(job.openings[0].input.width,40);
 const changed=job.openings[0].lines.find(l=>l.name==='Louvers'),unchanged=job.openings[0].lines.find(l=>l.name==='Stile · flat');
 assert.equal(changed.completed,0);assert.equal(changed.status,'not-cut');assert.notEqual(changed.id,old.openings[0].lines[0].id);
 assert.equal(unchanged.completed,1);assert.equal(unchanged.shortage.note,'Need material');
 assert.equal(openingCheckStatus(job,job.openings[0],'louvers-capped'),'not-started');
 assert.equal(openingCheckStatus(job,job.openings[1],'louvers-capped'),'complete');
 assert.equal(job.openings[1].lines[0].completed,old.openings[1].lines[0].completed);
 assert.equal((await f.run('draft-get',{id:'draft'})).draft.openings[0].width,40);
 const state=JSON.parse(await readFile(f.path));assert.equal(state.jobs.draft.revisions[0].openings[0].input.width,36);
 assert.equal(state.jobs.draft.revisions[0].openings[0].lines[0].completed,old.openings[0].lines[0].completed);
 const worker=(await f.service.run('job-get',{id:'draft'},f.shop)).job;
 assert.equal(worker.revision,2);assert.ok(worker.revisionSummary.length);assert.equal(worker.revisions,undefined);assert.equal(worker.lastRevision,undefined);
 assert.ok(!JSON.stringify(worker).includes('Private sample customer'));
});

test('stale iPads and stale owner reviews cannot overwrite newer cuts or revisions; retries are idempotent',async t=>{
 const f=await setup(t);let {job}=await f.run('job-get',{id:'draft'});
 const stale=structuredClone(job),items=job.openings.map(o=>({...o.input,width:40})),input=request(job,items);
 const preview=await f.run('job-revision-preview',input);
 job=await mark(f,job,0,'Louvers');
 await assert.rejects(f.run('job-revise',{...input,version:preview.version}),e=>e.status===409);
 const refreshed=await f.run('job-revision-preview',input);assert.ok(refreshed.impact[0].previouslyCut>0);
 const saved=await f.run('job-revise',{...input,version:refreshed.version});job=saved.job;
 await assert.rejects(f.service.run('line',{id:job.id,version:stale.version,lineId:stale.openings[0].lines[0].id,status:'cut'},f.shop),e=>e.status===409);
 job=await mark(f,job,0,'Louvers');
 const retry=await f.run('job-revise',{...input,version:refreshed.version});assert.equal(retry.job.version,job.version);assert.equal(retry.job.revision,2);assert.equal(retry.job.openings[0].lines[0].completed,job.openings[0].lines[0].completed);
 assert.equal((await f.run('job-revision-preview',input)).applied,true);
 await assert.rejects(f.run('job-revision-preview',{...input,requestId:'other-owner'}),e=>e.status===409);
});

test('notes-only revisions keep cutting and finishing; material changes reset same-sized pieces',async t=>{
 const f=await setup(t);let {job}=await f.run('job-get',{id:'draft'});job=await mark(f,job,0,'Louvers');
 ({job}=await f.run('stage',{id:job.id,version:job.version,openingId:opening.id,stage:'louvers-capped',status:'complete'}));
 let items=job.openings.map(o=>({...o.input,notes:'Recheck room labels'}));
 ({job}=await f.run('job-revise',request(job,items)));
 assert.equal(job.openings[0].lines[0].status,'cut');assert.equal(openingCheckStatus(job,job.openings[0],'louvers-capped'),'complete');
 items=job.openings.map(o=>({...o.input,color:'OW'}));
 ({job}=await f.run('job-revise',request(job,items,'new-color')));
 assert.equal(job.openings[0].lines[0].status,'not-cut');assert.equal(openingCheckStatus(job,job.openings[0],'louvers-capped'),'not-started');
});

test('changed finished jobs reopen, timers pause without losing time, and no-op reviews create no revision',async t=>{
 const f=await setup(t);let {job}=await f.run('job-get',{id:'draft'});
 const unchanged=request(job,job.openings.map(o=>o.input));assert.equal((await f.run('job-revision-preview',unchanged)).changed,false);
 assert.equal((await f.run('job-revise',unchanged)).job.version,job.version);
 ({job}=await f.run('timer',{id:job.id,version:job.version,action:'start'}));
 ({job}=await f.run('job-revise',request(job,job.openings.map(o=>({...o.input,width:40})))));
 assert.equal(job.startedAt,null);assert.ok(job.elapsedMs>=0);
 for(let i=0;i<job.openings.length;i++)for(const line of job.openings[i].lines)job=await mark(f,job,i,line.name);
 for(const check of productionChecks)({job}=await f.run('stage',{id:job.id,version:job.version,stage:check.key,status:'complete'}));
 assert.equal(production(job).key,'complete');
 ({job}=await f.run('job-revise',request(job,job.openings.map(o=>({...o.input,width:42})),'reopen')));
 assert.notEqual(production(job).key,'complete');assert.equal(job.completedAt,null);assert.equal(job.productionCompletedAt,null);
});

test('invalid revisions roll back completely, and removed or added standalone openings remain explicit',async t=>{
 const f=await setup(t),{job}=await f.run('job-get',{id:'draft'}),before=JSON.parse(await readFile(f.path)).jobs.draft;
 for(const items of [[],[job.openings[0].input,job.openings[0].input],[{...opening,height:60}],[{...opening,productId:'starwood'}]])await assert.rejects(f.run('job-revise',request(job,items)));
 assert.deepEqual(JSON.parse(await readFile(f.path)).jobs.draft,before);
 const items=[{...opening,id:'new-opening',name:'New opening'}],preview=await f.run('job-revision-preview',request(job,items));
 assert.equal(preview.impact.filter(x=>x.removed).length,2);assert.equal(preview.impact.filter(x=>x.added).length,1);
 const changed=(await f.run('job-revise',request(job,items))).job;assert.equal(changed.openings.length,1);assert.equal(changed.openings[0].input.id,'new-opening');
});

test('editing an order cut sheet preserves sold lines, prices, payments and the quote',async t=>{
 const f=await setup(t,{draft:false}),run=f.run;
 await run('contact-save',{id:'customer',version:0,fields:{firstName:'Sample',lastName:'Customer',address:'',phone:'',email:'',notes:''}});
 await run('pricing-save',{version:0,rateCents:2500,minimumAreaHundredths:0});
 let {quote}=await run('quote-create',{id:'quote',contactId:'customer'});
 ({quote}=await run('quote-save',{id:quote.id,version:quote.version,fields:{openings:[opening]}}));
 const {order}=await run('quote-convert',{id:quote.id,version:quote.version});
 await run('order-confirm',{id:order.id,version:order.version,confirmationId:'confirm',saleTotalCents:quoteTotals(order).total,payment:{id:'deposit',amountCents:100,receivedOn:'2026-10-31',method:'check'}});
 const before=(await run('sales-get',{kind:'order',id:order.id})).record,{job}=await run('job-get',{id:order.id});
 for(const items of [[{...opening,quantity:2}],[{...opening,id:'other'}]])await assert.rejects(run('job-revise',request(job,items)),/same openings and quantities/);
 await run('job-revise',request(job,[{...opening,width:40}]));
 const after=(await run('sales-get',{kind:'order',id:order.id})).record;
 assert.deepEqual(after.openings,before.openings);assert.deepEqual(after.finance,before.finance);assert.equal(quoteTotals(after).total,quoteTotals(before).total);
 assert.equal(after.manufacturingSpecifications[0].width,40);assert.equal(orderJob(after).revision,2);
 assert.deepEqual((await run('sales-get',{kind:'quote',id:quote.id})).record.openings,quote.openings);
 const handler=shopHandler(f.service),response=await handler(new Request('https://app.test/api/shop/order-pdf',{method:'POST',headers:{'content-type':'application/json',cookie:'cutsheet_owner='+f.owner.owner},body:JSON.stringify({id:order.id})}));
 assert.equal(response.status,200);assert.equal((await PDFDocument.load(await response.arrayBuffer())).getPageCount(),1);
});

test('revision endpoints are owner-only and reject cross-origin requests',async t=>{
 const f=await setup(t),handler=shopHandler(f.service);
 for(const operation of revisionOperations){
  await assert.rejects(f.service.run(operation,{id:'draft'}),e=>e.status===401);
  await assert.rejects(f.service.run(operation,{id:'draft'},f.shop),e=>e.status===403);
  const response=await handler(new Request('https://app.test/api/shop/'+operation,{method:'POST',headers:{'content-type':'application/json',origin:'https://foreign.test',cookie:'cutsheet_owner='+f.owner.owner},body:JSON.stringify({id:'draft'})}));assert.equal(response.status,403);
 }
});
