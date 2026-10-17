import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PDFDocument} from 'pdf-lib';
import {fileStore} from '../shop-store.mjs';
import {createShopService} from '../shop-service.mjs';
import {shopHandler} from '../shop-api.mjs';
import {salesOperations,quoteTotals} from '../sales-service.mjs';
import {calculate} from '../calculations.mjs';
import {printedReferences} from './printed-reference-cases.mjs';
import {parseMeasurement} from '../public/measurements.js';
import {finishingStages} from '../public/shop-state.js';
import {contactAddressFields} from '../public/contact-address.js';
const password='test-owner-password',secret='test-signing-key-with-more-than-32-characters';
const contact={firstName:'Alex',lastName:'Rivera',address:'123 Example Lane\nNaples, FL',phone:'555-0100',email:'alex@example.com',notes:'PRIVATE: site access instructions'};
const opening={id:'opening-1',name:'Living room',width:36,height:59.5,quantity:2,left:1,right:1,louver:4,frame:'TR',sides:'4W',mount:'I',sizeMethod:'S',color:'W',tilt:'Back',stile:'Flat',divider:0,divisionMode:'divider',notes:'Keep panels labeled.'};
async function fixture(t){const dir=await mkdtemp(join(tmpdir(),'cutsheet-sales-'));t.after(()=>rm(dir,{recursive:true,force:true}));const path=join(dir,'workshop.json'),service=createShopService({store:fileStore(path),password,secret}),owner={owner:(await service.run('login',{password})).token};const run=(op,data={})=>service.run(op,data,owner);return {service,owner,path,run};}
async function quote(f,{priced=true,items=[opening]}={}){await f.run('contact-save',{id:'contact-1',version:0,fields:contact});if(priced)await f.run('pricing-save',{version:0,rateCents:2500,minimumAreaHundredths:0});const {quote}=await f.run('quote-create',{id:'quote-1',contactId:'contact-1'});return (await f.run('quote-save',{id:quote.id,version:quote.version,fields:{openings:items,notes:'Customer quote note'}})).quote;}

test('contacts and pricing persist across service instances; empty legacy workshop upgrades without losing jobs',async t=>{const f=await fixture(t);await quote(f);const second=createShopService({store:fileStore(f.path),password,secret});const data=await second.run('sales',{},f.owner);assert.equal(data.contacts[0].email,contact.email);assert.equal(data.pricing.rateCents,2500);assert.equal(data.quotes[0].openingCount,1);const state=JSON.parse(await readFile(f.path));assert.ok(state.jobs);assert.ok(state.pairings);assert.equal(state.schema,1);});

test('contacts, prices, quote PDFs and orders are inaccessible to anonymous and paired shop clients',async t=>{const f=await fixture(t),q=await quote(f);const {code}=await f.run('pairing',{name:'Saw'}),paired={shop:(await f.service.run('pair',{code})).token};for(const op of salesOperations){await assert.rejects(f.service.run(op),e=>e.status===401);await assert.rejects(f.service.run(op,{},paired),e=>e.status===403);}const handler=shopHandler(f.service);for(const op of ['sales-document','order-pdf']){const req=cookie=>new Request('https://example.com/api/shop/'+op,{method:'POST',headers:{'content-type':'application/json',cookie},body:JSON.stringify({id:q.id,kind:'quote'})});assert.equal((await handler(req(''))).status,401);assert.equal((await handler(req('cutsheet_shop='+paired.shop))).status,403);}});

test('square-foot pricing rounds each unit once, respects minimums, and snapshots rates per quote',async t=>{const f=await fixture(t),q=await quote(f);const t1=quoteTotals(q);assert.equal(t1.lines[0].area,14.875);assert.equal(t1.lines[0].unitPrice,37188);assert.equal(t1.subtotal,74376);await f.run('pricing-save',{version:1,rateCents:3000,minimumAreaHundredths:2000});assert.equal((await f.run('sales-get',{kind:'quote',id:q.id})).totals.total,74376);const {quote:repriced,totals}=await f.run('quote-save',{id:q.id,version:q.version,fields:{useCurrentPricing:true,installationCents:10000,discountCents:5000,taxBasisPoints:700}});assert.equal(totals.subtotal,120000);assert.equal(totals.tax,8750);assert.equal(totals.total,133750);assert.equal(repriced.pricing.minimumAreaHundredths,2000);});

test('conversion is idempotent and freezes contact, openings and prices',async t=>{const f=await fixture(t),q=await quote(f),{order}=await f.run('quote-convert',{id:q.id,version:q.version});assert.equal((await f.run('quote-convert',{id:q.id,version:q.version})).order.id,order.id);await f.run('contact-save',{id:'contact-1',version:1,fields:{...contact,address:'Changed address'}});await f.run('pricing-save',{version:1,rateCents:9999,minimumAreaHundredths:0});const frozen=await f.run('sales-get',{kind:'order',id:order.id});assert.equal(frozen.contact.address,contact.address);assert.deepEqual(frozen.record.openings,[opening]);assert.equal(frozen.totals.total,74376);const current=await f.run('sales-get',{kind:'quote',id:q.id});await assert.rejects(f.run('quote-save',{id:q.id,version:current.record.version,fields:{name:'Changed'}}),/cannot be changed/);assert.equal((await f.run('sales')).orders.length,1);});

test('decimal dimensions survive quote storage and order conversion with cent-accurate pricing',async t=>{
  const f=await fixture(t),item={...opening,width:parseMeasurement('51.875'),height:parseMeasurement('36.58')};
  const q=await quote(f,{items:[item]});
  const saved=await f.run('sales-get',{kind:'quote',id:q.id});
  assert.equal(saved.record.openings[0].width,51.875);assert.equal(saved.record.openings[0].height,36.58);
  assert.equal(saved.totals.lines[0].unitPrice,32944);assert.equal(saved.totals.total,65888);
  const {order}=await f.run('quote-convert',{id:q.id,version:q.version});
  assert.deepEqual(order.openings,[item]);
});

test('order release keeps exact manufacturing inputs, is retry-safe and does not expose contact notes or pricing',async t=>{const f=await fixture(t),q=await quote(f),{order}=await f.run('quote-convert',{id:q.id,version:q.version});const {job}=await f.run('order-release',{id:order.id,version:order.version,targetMinutes:90,due:'2026-12-10'});assert.deepEqual(job.openings[0].input,opening);assert.deepEqual(job.openings[0].result,calculate(opening));assert.equal(job.number,order.number);assert.equal(job.targetMinutes,90);assert.equal((await f.run('order-release',{id:order.id,version:order.version})).job.id,job.id);const {code}=await f.run('pairing',{name:'Saw'}),shop={shop:(await f.service.run('pair',{code})).token};const shopData=JSON.stringify(await f.service.run('jobs',{},shop));assert.ok(!shopData.includes(contact.email));assert.ok(!shopData.includes('PRIVATE'));assert.ok(!shopData.includes('unitPrices'));assert.ok(!shopData.includes('Customer quote note'));});

test('T-post quote conversion preserves section measurements, split mode and original cut outputs',async t=>{
  const f=await fixture(t),items=printedReferences.filter(r=>r.opening.tposts).map(r=>({...r.opening,id:r.id.replaceAll('.','-')}));
  const q=await quote(f,{items}),{order}=await f.run('quote-convert',{id:q.id,version:q.version}),{job}=await f.run('order-release',{id:order.id,version:order.version});
  for(const [i,o]of items.entries()){assert.deepEqual(job.openings[i].input,o);assert.deepEqual(job.openings[i].result,calculate(o));}
  const detail=await f.run('sales-get',{kind:'order',id:order.id});assert.deepEqual(detail.previews,items.map(o=>calculate(o).louverLayout));
});

test('unpriced or empty quotes cannot become orders, and unsafe cuts still cannot enter production',async t=>{const f=await fixture(t),q=await quote(f,{priced:false});await assert.rejects(f.run('quote-convert',{id:q.id,version:q.version}),/price every opening/);await f.run('pricing-save',{version:0,rateCents:2500,minimumAreaHundredths:0});const {quote:q2}=await f.run('quote-save',{id:q.id,version:q.version,fields:{useCurrentPricing:true,openings:[{...opening,height:60}]}});const {order}=await f.run('quote-convert',{id:q.id,version:q2.version});await assert.rejects(f.run('order-release',{id:order.id,version:order.version}),/light gap/);assert.equal((await f.run('dashboard')).jobs.length,0);});

test('stale updates, invalid prices and prototype identifiers fail without changing saved data',async t=>{const f=await fixture(t),q=await quote(f);await assert.rejects(f.run('quote-save',{id:q.id,version:1,fields:{name:'Old update'}}),e=>e.status===409);await assert.rejects(f.run('contact-save',{id:'contact-1',version:0,fields:contact}),e=>e.status===409);for(const id of ['__proto__','constructor','prototype'])await assert.rejects(f.run('sales-get',{kind:'quote',id}),e=>e.status===400);for(const fields of [{taxBasisPoints:10001},{discountCents:99999999},{installationCents:-10},{unitPrices:{'opening-1':1.23}},{openings:[opening,opening]},{validUntil:'2026-02-31'}])await assert.rejects(f.run('quote-save',{id:q.id,version:q.version,fields}));assert.equal((await f.run('sales-get',{kind:'quote',id:q.id})).record.version,q.version);});

test('quote and order PDF routes use server records and cut PDFs use the accepted order',async t=>{const f=await fixture(t),q=await quote(f),{order}=await f.run('quote-convert',{id:q.id,version:q.version}),handler=shopHandler(f.service);const request=(op,data)=>new Request('https://example.com/api/shop/'+op,{method:'POST',headers:{'content-type':'application/json',cookie:'cutsheet_owner='+f.owner.owner},body:JSON.stringify(data)});for(const [op,data]of [['sales-document',{kind:'quote',id:q.id}],['sales-document',{kind:'order',id:order.id}],['order-pdf',{id:order.id,units:'mm',openings:[{...opening,width:1}]}]]){const response=await handler(request(op,data));assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/application\/pdf/);const pdf=await PDFDocument.load(await response.arrayBuffer());assert.equal(pdf.getPageCount(),1);assert.equal(pdf.getPage(0).getWidth(),612);}assert.equal((await handler(request('order-pdf',{id:order.id,units:'bogus'}))).status,400);});

test('new orders wait on the owner board and track shop production without duplicate cards',async t=>{
  const f=await fixture(t),q=await quote(f),{order}=await f.run('quote-convert',{id:q.id,version:q.version});
  const dashboard=await f.run('dashboard');
  assert.equal(dashboard.pendingOrders.length,1);assert.equal(dashboard.pendingOrders[0].id,order.id);
  assert.equal(dashboard.jobs.length,0);
  assert.equal((await f.run('sales')).orders[0].productionStage,'waiting');
  const {code}=await f.run('pairing',{name:'Shop'}),shop={shop:(await f.service.run('pair',{code})).token};
  assert.equal((await f.service.run('jobs',{},shop)).pendingOrders,undefined);
  let {job:j}=await f.run('order-release',{id:order.id,version:order.version});
  assert.equal((await f.run('dashboard')).pendingOrders.length,0);
  assert.equal((await f.run('dashboard')).jobs.length,1);
  const detail=()=>f.run('sales-get',{kind:'order',id:order.id});
  for(const line of j.openings[0].lines)({job:j}=await f.service.run('line',{id:j.id,version:j.version,lineId:line.id,status:'cut'},shop));
  assert.equal((await detail()).productionStage,'capping');
  for(const stage of finishingStages)({job:j}=await f.service.run('stage',{id:j.id,version:j.version,stage:stage.key,status:'complete'},shop));
  assert.equal((await detail()).productionStage,'complete');
  assert.equal((await f.run('sales')).orders[0].productionStage,'complete');
  assert.equal((await f.run('sales-get',{kind:'contact',id:'contact-1'})).orders[0].productionStage,'complete');
  assert.deepEqual((await detail()).record.openings,order.openings);
});

test('structured Florida addresses persist, retain private notes, and freeze correctly on orders',async t=>{
  const f=await fixture(t),q=await quote(f);
  const fields={firstName:'Alex',lastName:'Rivera',streetAddress:'123 Example Lane\nUnit 2',city:'Naples',zipCode:'34102-1234',phone:contact.phone,email:contact.email};
  const {contact:saved}=await f.run('contact-save',{id:'contact-1',version:1,fields});
  assert.equal(saved.state,'FL');assert.equal(saved.address,'123 Example Lane\nUnit 2\nNaples, FL 34102-1234');
  assert.equal(saved.notes,contact.notes);
  const second=createShopService({store:fileStore(f.path),password,secret});
  assert.deepEqual((await second.run('sales-get',{kind:'contact',id:saved.id},f.owner)).contact,saved);
  for(const invalid of [{zipCode:'3410'},{zipCode:'34abc'},{state:'CA'}])await assert.rejects(f.run('contact-save',{id:saved.id,version:saved.version,fields:{...fields,...invalid}}),e=>e.status===400);
  const {order}=await f.run('quote-convert',{id:q.id,version:q.version});
  assert.equal(order.customer.address,saved.address);assert.equal(order.customer.zipCode,'34102-1234');
  await f.run('contact-save',{id:saved.id,version:saved.version,fields:{...fields,city:'Bonita Springs',zipCode:'34135'}});
  const frozen=await f.run('sales-get',{kind:'order',id:order.id});
  assert.equal(frozen.contact.address,saved.address);
  assert.equal((await f.run('sales-get',{kind:'quote',id:q.id})).contact.city,'Bonita Springs');
});

test('legacy address editing preserves unrecognized text and old clients cannot leave stale components',async t=>{
  assert.deepEqual(contactAddressFields(contact),{streetAddress:'123 Example Lane',city:'Naples',zipCode:''});
  assert.deepEqual(contactAddressFields({address:'123 Example Lane, Naples, Florida 34102'}),{streetAddress:'123 Example Lane',city:'Naples',zipCode:'34102'});
  const legacy='Example building\nUnit 22\nSavannah, GA 31401';
  assert.deepEqual(contactAddressFields({address:legacy}),{streetAddress:legacy,city:'',zipCode:''});
  const f=await fixture(t);
  let {contact:saved}=await f.run('contact-save',{id:'contact-1',version:0,fields:{...contact,...contactAddressFields({address:legacy})}});
  assert.equal(saved.address,legacy);
  ({contact:saved}=await f.run('contact-save',{id:saved.id,version:saved.version,fields:{...contact,address:saved.address}}));
  assert.equal(saved.streetAddress,legacy);
  ({contact:saved}=await f.run('contact-save',{id:saved.id,version:saved.version,fields:{...contact,address:'A changed legacy address'}}));
  assert.equal(saved.streetAddress,undefined);assert.equal(saved.address,'A changed legacy address');
  const {contact:empty}=await f.run('contact-save',{id:'empty-address',version:0,fields:{...contact,streetAddress:'',city:'',zipCode:''}});
  assert.equal(empty.address,'');assert.equal(empty.state,'FL');
});
