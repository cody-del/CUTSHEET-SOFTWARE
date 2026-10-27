import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PDFDocument,PDFName,PDFDict,decodePDFRawStream} from 'pdf-lib';
import {fileStore} from '../shop-store.mjs';
import {createShopService} from '../shop-service.mjs';
import {shopHandler} from '../shop-api.mjs';
import {salesOperations,quoteTotals,orderJob} from '../sales-service.mjs';
import {calculate} from '../calculations.mjs';
import {printedReferences} from './printed-reference-cases.mjs';
import {parseMeasurement} from '../public/measurements.js';
import {finishingStages,productionChecks,openingCheckStatus,production} from '../public/shop-state.js';
import {contactAddressFields} from '../public/contact-address.js';
const password='test-owner-password',secret='test-signing-key-with-more-than-32-characters';
const contact={firstName:'Alex',lastName:'Rivera',address:'123 Example Lane\nNaples, FL',phone:'555-0100',email:'alex@example.com',notes:'PRIVATE: site access instructions'};
const opening={id:'opening-1',name:'Living room',width:36,height:59.5,quantity:2,left:1,right:1,louver:4,frame:'TR',sides:'4W',mount:'I',sizeMethod:'S',color:'W',tilt:'Back',stile:'Flat',divider:0,divisionMode:'divider',notes:'Keep panels labeled.'};
async function fixture(t){const dir=await mkdtemp(join(tmpdir(),'cutsheet-sales-'));t.after(()=>rm(dir,{recursive:true,force:true}));const path=join(dir,'workshop.json'),service=createShopService({store:fileStore(path),password,secret}),owner={owner:(await service.run('login',{password})).token};const run=(op,data={})=>service.run(op,data,owner);return {service,owner,path,run};}
async function quote(f,{priced=true,items=[opening]}={}){await f.run('contact-save',{id:'contact-1',version:0,fields:contact});if(priced)await f.run('pricing-save',{version:0,rateCents:2500,minimumAreaHundredths:0});const {quote}=await f.run('quote-create',{id:'quote-1',contactId:'contact-1'});return (await f.run('quote-save',{id:quote.id,version:quote.version,fields:{openings:items,notes:'Customer quote note'}})).quote;}

async function confirmForProduction(f,order){return (await f.run('order-confirm',confirmation(order,quoteTotals(order).total,0))).order;}

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

test('confirmed order release keeps inputs, is retry-safe and excludes private information',async t=>{
 const f=await fixture(t),q=await quote(f),{order}=await f.run('quote-convert',{id:q.id,version:q.version});
 await confirmForProduction(f,order);
 const released=(await f.run('job-get',{id:order.id})).job;
 const {job}=await f.run('plan',{id:released.id,version:released.version,targetMinutes:90,due:'2026-12-10'});
 assert.deepEqual(job.openings[0].input,opening);assert.deepEqual(job.openings[0].result,calculate(opening));assert.equal(job.number,order.number);assert.equal(job.targetMinutes,90);
 assert.equal((await f.run('order-release',{id:order.id,version:order.version})).job.id,job.id);
 const {code}=await f.run('pairing',{name:'Saw'}),shop={shop:(await f.service.run('pair',{code})).token};const shopData=JSON.stringify(await f.service.run('jobs',{},shop));
 for(const value of [contact.email,'PRIVATE','unitPrices','Customer quote note'])assert.ok(!shopData.includes(value));
});

test('T-post quote conversion preserves section measurements, split mode and original cut outputs',async t=>{
  const f=await fixture(t),items=printedReferences.filter(r=>r.opening.tposts).map(r=>({...r.opening,id:r.id.replaceAll('.','-')}));
  const q=await quote(f,{items}),{order}=await f.run('quote-convert',{id:q.id,version:q.version});await confirmForProduction(f,order);const {job}=await f.run('order-release',{id:order.id,version:order.version});
  for(const [i,o]of items.entries()){assert.deepEqual(job.openings[i].input,o);assert.deepEqual(job.openings[i].result,calculate(o));}
  const detail=await f.run('sales-get',{kind:'order',id:order.id});assert.deepEqual(detail.previews,items.map(o=>calculate(o).louverLayout));
});

test('unpriced or empty quotes cannot become orders, and unsafe cuts still cannot enter production',async t=>{const f=await fixture(t),q=await quote(f,{priced:false});await assert.rejects(f.run('quote-convert',{id:q.id,version:q.version}),/price every opening/);await f.run('pricing-save',{version:0,rateCents:2500,minimumAreaHundredths:0});const {quote:q2}=await f.run('quote-save',{id:q.id,version:q.version,fields:{useCurrentPricing:true,openings:[{...opening,height:60}]}});const {order}=await f.run('quote-convert',{id:q.id,version:q2.version});const confirmed=await confirmForProduction(f,order);await assert.rejects(f.run('order-release',{id:order.id,version:confirmed.version}),/light gap/);assert.equal((await f.run('dashboard')).jobs.length,0);});

test('stale updates, invalid prices and prototype identifiers fail without changing saved data',async t=>{const f=await fixture(t),q=await quote(f);await assert.rejects(f.run('quote-save',{id:q.id,version:1,fields:{name:'Old update'}}),e=>e.status===409);await assert.rejects(f.run('contact-save',{id:'contact-1',version:0,fields:contact}),e=>e.status===409);for(const id of ['__proto__','constructor','prototype'])await assert.rejects(f.run('sales-get',{kind:'quote',id}),e=>e.status===400);for(const fields of [{taxBasisPoints:10001},{discountCents:99999999},{installationCents:-10},{unitPrices:{'opening-1':1.23}},{openings:[opening,opening]},{validUntil:'2026-02-31'}])await assert.rejects(f.run('quote-save',{id:q.id,version:q.version,fields}));assert.equal((await f.run('sales-get',{kind:'quote',id:q.id})).record.version,q.version);});

test('quote and order PDF routes use server records and cut PDFs use the accepted order',async t=>{const f=await fixture(t),q=await quote(f),{order}=await f.run('quote-convert',{id:q.id,version:q.version}),handler=shopHandler(f.service);const request=(op,data)=>new Request('https://example.com/api/shop/'+op,{method:'POST',headers:{'content-type':'application/json',cookie:'cutsheet_owner='+f.owner.owner},body:JSON.stringify(data)});for(const [op,data]of [['sales-document',{kind:'quote',id:q.id}],['sales-document',{kind:'order',id:order.id}],['order-pdf',{id:order.id,units:'mm',openings:[{...opening,width:1}]}]]){const response=await handler(request(op,data));assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/application\/pdf/);const pdf=await PDFDocument.load(await response.arrayBuffer());assert.equal(pdf.getPageCount(),1);assert.equal(pdf.getPage(0).getWidth(),612);}assert.equal((await handler(request('order-pdf',{id:order.id,units:'bogus'}))).status,400);});

test('new orders wait on the owner board and track shop production without duplicate cards',async t=>{
  const f=await fixture(t),q=await quote(f),{order}=await f.run('quote-convert',{id:q.id,version:q.version});
  const dashboard=await f.run('dashboard');
  assert.equal(dashboard.pendingOrders.length,1);assert.equal(dashboard.pendingOrders[0].id,order.id);
  assert.equal(dashboard.jobs.length,0);
  assert.equal((await f.run('sales')).orders[0].productionStage,'waiting');
  const {code}=await f.run('pairing',{name:'Shop'}),shop={shop:(await f.service.run('pair',{code})).token};
  assert.equal((await f.service.run('jobs',{},shop)).pendingOrders[0].readiness.status,'confirmation');
  await confirmForProduction(f,order);
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

test('products keep independent pricing and simple quote inputs never use shutter calculations',async t=>{
  const f=await fixture(t);await quote(f);
  for(const productId of ['elegant-shutters','starwood']){
    let {quote:q}=await f.run('quote-create',{id:'quote-'+productId,contactId:'contact-1',productId});
    assert.equal(q.pricing.rateCents,null);
    const item={id:'simple',name:'Great room',width:51.875,height:36.58,quantity:2,notes:'White finish, customer selected style.'};
    ({quote:q}=await f.run('quote-save',{id:q.id,version:q.version,fields:{openings:[{...item,frame:'TR',left:1,right:1}]}}));
    assert.deepEqual(q.openings,[item]);assert.equal(quoteTotals(q).unpriced,1);
    await f.run('pricing-save',{productId,version:0,rateCents:4000,minimumAreaHundredths:0});
    ({quote:q}=await f.run('quote-save',{id:q.id,version:q.version,fields:{useCurrentPricing:true}}));
    assert.equal(quoteTotals(q).lines[0].unitPrice,52711);
    const detail=await f.run('sales-get',{kind:'quote',id:q.id});assert.deepEqual(detail.previews,[]);
    const {order}=await f.run('quote-convert',{id:q.id,version:q.version});
    assert.equal(order.productId,productId);assert.deepEqual(order.openings,[item]);
    assert.equal((await f.run('sales-get',{kind:'order',id:order.id})).productionStage,null);
  }
  const sales=await f.run('sales');assert.equal(sales.pricing.rateCents,2500);assert.equal(sales.productPricing['elegant-shutters'].rateCents,4000);
  assert.equal((await f.run('dashboard')).pendingOrders.length,0);
  const other=await f.run('quote-create',{id:'custom-brand',contactId:'contact-1',productId:'other',productLabel:'Example Blinds'});
  assert.equal(other.quote.productLabel,'Example Blinds');assert.equal(other.quote.pricing.rateCents,null);
  const {quote:custom}=await f.run('quote-save',{id:other.quote.id,version:1,fields:{openings:[{id:'custom',name:'Office',width:36.58,height:625,quantity:1,notes:'Roller shade'}],unitPrices:{custom:12345}}});
  assert.equal(quoteTotals(custom).total,12345);
  assert.equal((await f.run('quote-convert',{id:custom.id,version:custom.version})).order.productLabel,'Example Blinds');
  await assert.rejects(f.run('pricing-save',{productId:'other',version:0,rateCents:99,minimumAreaHundredths:0}),/unit price on each line/);
});

test('only ShutterSmart can release jobs or generate manufacturing PDFs, including forged and stale requests',async t=>{
  const f=await fixture(t);await quote(f);
  for(const productId of ['elegant-shutters','starwood','other']){
    let {quote:q}=await f.run('quote-create',{id:'quote-'+productId,contactId:'contact-1',productId,productLabel:'Example brand'});
    ({quote:q}=await f.run('quote-save',{id:q.id,version:q.version,fields:{openings:[opening],unitPrices:{[opening.id]:50000}}}));
    const {order}=await f.run('quote-convert',{id:q.id,version:q.version});
    const handler=shopHandler(f.service),request=(op,data)=>new Request('https://example.com/api/shop/'+op,{method:'POST',headers:{'content-type':'application/json',cookie:'cutsheet_owner='+f.owner.owner},body:JSON.stringify(data)});
    for(const op of ['order-release','order-pdf']){
      const response=await handler(request(op,{id:order.id,version:order.version,productId:'shuttersmart',openings:[opening]}));
      assert.equal(response.status,422);assert.match((await response.json()).error,/only for ShutterSmart/);
    }
    for(const id of [q.id,order.id])for(const tag of [{},{productId:'shuttersmart'}])await assert.rejects(f.run('publish',{job:{id,name:'Spoofed',number:'TEST',...tag,openings:[opening]}}),/only for ShutterSmart/);
    const response=await handler(request('sales-document',{kind:'quote',id:q.id}));assert.equal(response.status,200);
    const pdf=await PDFDocument.load(await response.arrayBuffer());assert.equal(pdf.getPageCount(),1);assert.match(pdf.getTitle(),/Proposal/);
  }
  for(const productId of ['elegant-shutters','starwood','other','future-product',null,'']){
    assert.throws(()=>calculate({...opening,productId}),/only for ShutterSmart/);
    await assert.rejects(f.run('publish',{job:{id:'explicit-product',name:'Test',number:'TEST',productId,openings:[opening]}}),/only for ShutterSmart/);
    const {createPDF}=await import('../pdf.mjs');await assert.rejects(createPDF({productId,openings:[opening]}),/only for ShutterSmart/);
  }
  assert.equal((await f.run('dashboard')).jobs.length,0);assert.equal((await f.run('dashboard')).pendingOrders.length,0);
});

test('product identity is fixed and invalid simple measurements cannot be saved',async t=>{
  const f=await fixture(t),q=await quote(f);
  for(const productId of ['future-product','constructor',null,''])await assert.rejects(f.run('quote-create',{id:'invalid-product',contactId:'contact-1',productId}),/supported product/);
  await assert.rejects(f.run('quote-save',{id:q.id,version:q.version,fields:{productId:'elegant-shutters'}}),/new quote/);
  await assert.rejects(f.run('quote-create',{id:q.id,contactId:'contact-1',productId:'starwood'}),/different product/);
  const {quote:simple}=await f.run('quote-create',{id:'simple',contactId:'contact-1',productId:'elegant-shutters'});
  for(const change of [{width:0},{width:'51.875'},{height:-1},{height:Infinity},{quantity:1.2},{productId:'unknown'}])await assert.rejects(f.run('quote-save',{id:simple.id,version:1,fields:{openings:[{...opening,...change}]}}));
  assert.equal((await f.run('sales-get',{kind:'quote',id:simple.id})).record.version,1);
});

test('untagged saved quotes and orders remain ShutterSmart with unchanged cut outputs',async t=>{
  const f=await fixture(t),q=await quote(f),{order}=await f.run('quote-convert',{id:q.id,version:q.version});
  const {writeFile}=await import('node:fs/promises'),state=JSON.parse(await readFile(f.path));
  delete state.quotes[q.id].productId;delete state.orders[order.id].productId;await writeFile(f.path,JSON.stringify(state));
  const second=createShopService({store:fileStore(f.path),password,secret}),run=(op,data)=>second.run(op,data,f.owner);
  assert.equal((await run('sales-get',{kind:'quote',id:q.id})).record.productId,'shuttersmart');
  assert.equal((await run('sales')).orders[0].productId,'shuttersmart');
  await confirmForProduction(f,order);
  const {job}=await run('order-release',{id:order.id,version:order.version});assert.equal(job.productId,'shuttersmart');assert.deepEqual(job.openings[0].result,calculate(opening));
});

test('empty quote product selection switches pricing and layout identity while preserving its contact and number',async t=>{
  const f=await fixture(t),original=await quote(f,{items:[]});
  assert.equal(original.name,'Alex Rivera');
  await f.run('pricing-save',{productId:'elegant-shutters',version:0,rateCents:4000,minimumAreaHundredths:1200});
  const {quote:elegant}=await f.run('quote-product',{id:original.id,version:original.version,productId:'elegant-shutters'});
  assert.equal(elegant.productId,'elegant-shutters');assert.equal(elegant.name,'Alex Rivera');
  assert.equal(elegant.pricing.rateCents,4000);assert.equal(elegant.pricing.minimumAreaHundredths,1200);
  assert.equal(elegant.contactId,original.contactId);assert.equal(elegant.number,original.number);assert.equal(elegant.notes,original.notes);
  assert.equal(elegant.version,original.version+1);assert.deepEqual(elegant.openings,[]);
  await assert.rejects(f.run('quote-product',{id:original.id,version:original.version,productId:'starwood'}),e=>e.status===409);
  const {quote:starwood}=await f.run('quote-product',{id:elegant.id,version:elegant.version,productId:'starwood'});
  assert.equal(starwood.name,'Alex Rivera');assert.equal(starwood.pricing.rateCents,null);
  const {quote:custom}=await f.run('quote-product',{id:starwood.id,version:starwood.version,productId:'other',productLabel:'Example shades'});
  assert.equal(custom.productLabel,'Example shades');assert.equal(custom.name,'Alex Rivera');
  const {quote:back}=await f.run('quote-product',{id:custom.id,version:custom.version,productId:'shuttersmart'});
  assert.equal(back.name,'Alex Rivera');assert.equal(back.productLabel,undefined);assert.equal(back.pricing.rateCents,2500);
  assert.equal((await f.run('sales')).quotes.length,1);
});

test('product changes cannot overwrite line items, sold orders, or concurrent changes',async t=>{
  const f=await fixture(t),q=await quote(f);
  await assert.rejects(f.run('quote-product',{id:q.id,version:q.version,productId:'elegant-shutters'}),/separate quote/);
  assert.deepEqual((await f.run('sales-get',{kind:'quote',id:q.id})).record.openings,q.openings);
  const {order}=await f.run('quote-convert',{id:q.id,version:q.version});
  await assert.rejects(f.run('quote-product',{id:q.id,version:q.version+1,productId:'starwood'}),/cannot be changed/);
  assert.deepEqual((await f.run('sales-get',{kind:'order',id:order.id})).record.openings,q.openings);
  const {quote:empty}=await f.run('quote-create',{id:'empty-custom',contactId:'contact-1',name:'Customer-selected name'});
  for(const data of [{productId:'unknown'},{productId:'other',productLabel:''}])await assert.rejects(f.run('quote-product',{id:empty.id,version:empty.version,...data}),e=>e.status===400);
  const {quote:changed}=await f.run('quote-product',{id:empty.id,version:empty.version,productId:'starwood'});
  assert.equal(changed.name,'Customer-selected name');
});


test('mixed quote lines keep product-specific prices, decimals, minimums and immutable identities',async t=>{
  const f=await fixture(t);let q=await quote(f,{items:[]});
  await f.run('pricing-save',{productId:'elegant-shutters',version:0,rateCents:4000,minimumAreaHundredths:1400});
  await f.run('pricing-save',{productId:'starwood',version:0,rateCents:3000,minimumAreaHundredths:0});
  const items=[{...opening,productId:'shuttersmart',pricing:{rateCents:1}},
    {id:'elegant',productId:'elegant-shutters',name:'Bedroom shades',width:51.875,height:36.58,quantity:2,notes:'White',pricing:{rateCents:1}},
    {id:'starwood',productId:'starwood',name:'Study',width:36,height:48,quantity:1,notes:''},
    {id:'custom',productId:'other',productLabel:'Example shades',name:'Office',width:36.58,height:625,quantity:1,notes:''}];
  ({quote:q}=await f.run('quote-save',{id:q.id,version:q.version,fields:{openings:items,unitPrices:{custom:12345}}}));
  assert.deepEqual(q.openings.map(o=>o.pricing.rateCents),[2500,4000,3000,null]);
  assert.deepEqual(quoteTotals(q).lines.map(l=>l.lineTotal),[74376,112000,36000,12345]);
  assert.equal(quoteTotals(q).total,234721);
  const second=createShopService({store:fileStore(f.path),password,secret});
  const loaded=await second.run('sales-get',{kind:'quote',id:q.id},f.owner);
  assert.deepEqual(loaded.record,q);assert.equal(loaded.previews.length,4);assert.equal(loaded.previews[1],null);
  assert.equal(loaded.record.openings[1].width,51.875);assert.equal(loaded.record.openings[1].height,36.58);
  for(const change of [{productId:'shuttersmart'},{productId:'starwood'}])await assert.rejects(f.run('quote-save',{id:q.id,version:q.version,fields:{openings:q.openings.map(o=>o.id==='elegant'?{...o,...change}:o)}}),/new line item/);
  await assert.rejects(f.run('quote-save',{id:q.id,version:q.version,fields:{openings:q.openings.map(o=>o.id==='custom'?{...o,productLabel:'Changed brand'}:o)}}),/new line item/);
  // A stale client dropping product tags cannot reinterpret an existing line.
  const untagged=q.openings.map(({productId,productLabel,pricing,...o})=>o);
  ({quote:q}=await f.run('quote-save',{id:q.id,version:q.version,fields:{openings:untagged}}));
  assert.deepEqual(q.openings.map(o=>o.productId),['shuttersmart','elegant-shutters','starwood','other']);
  assert.equal(quoteTotals(q).total,234721);
  await f.run('pricing-save',{productId:'elegant-shutters',version:1,rateCents:5000,minimumAreaHundredths:0});
  assert.equal((await f.run('sales-get',{kind:'quote',id:q.id})).totals.total,234721);
  ({quote:q}=await f.run('quote-save',{id:q.id,version:q.version,fields:{useCurrentPricing:true}}));
  assert.equal(quoteTotals(q).lines[1].lineTotal,131776);assert.equal(q.unitPrices.custom,12345);
});

test('mixed sold orders preserve every line but cut PDFs and shop jobs contain only ShutterSmart',async t=>{
  const f=await fixture(t);let q=await quote(f,{items:[]});
  const elegant={id:'elegant',productId:'elegant-shutters',name:'Elegant only',width:36.58,height:625,quantity:2,notes:'Shade only'},ss={...opening,productId:'shuttersmart'};
  ({quote:q}=await f.run('quote-save',{id:q.id,version:q.version,fields:{openings:[elegant,ss],unitPrices:{elegant:50000}}}));
  const {order}=await f.run('quote-convert',{id:q.id,version:q.version});
  assert.equal(order.openings.length,2);assert.equal(quoteTotals(order).total,174376);
  const manufacturing=orderJob(order);assert.equal(manufacturing.openings.length,1);assert.equal(manufacturing.openings[0].id,ss.id);assert.ok(!JSON.stringify(manufacturing).includes('pricing'));
  assert.equal((await f.run('dashboard')).pendingOrders[0].openingCount,1);
  const summary=(await f.run('sales')).orders[0];assert.equal(summary.openingCount,2);assert.equal(summary.manufacturingOpeningCount,1);assert.match(summary.productNames,/Elegant Shutters.*ShutterSmart/);
  const handler=shopHandler(f.service),request=(op,data)=>new Request('https://example.com/api/shop/'+op,{method:'POST',headers:{'content-type':'application/json',cookie:'cutsheet_owner='+f.owner.owner},body:JSON.stringify(data)});
  for(const [op,data]of [['sales-document',{kind:'quote',id:q.id}],['sales-document',{kind:'order',id:order.id}],['order-pdf',{id:order.id,units:'mm'}]]){
    const response=await handler(request(op,data));assert.equal(response.status,200);
    const pdf=await PDFDocument.load(await response.arrayBuffer());assert.equal(pdf.getPageCount(),1);
  }
  await confirmForProduction(f,order);
  const {job}=await f.run('order-release',{id:order.id,version:order.version});
  assert.equal(job.openings.length,1);assert.deepEqual(job.openings[0].result,calculate(ss));
  assert.ok(!JSON.stringify(job).includes('Elegant only'));assert.ok(!JSON.stringify(job).includes('pricing'));
  assert.equal((await f.run('sales-get',{kind:'order',id:order.id})).record.openings.length,2);
  const {code}=await f.run('pairing',{name:'Saw'}),shop={shop:(await f.service.run('pair',{code})).token};
  assert.ok(!JSON.stringify(await f.service.run('jobs',{},shop)).includes('Elegant only'));
});

test('legacy nonmanufacturing quotes can add ShutterSmart without converting their other lines',async t=>{
  const f=await fixture(t);await quote(f);
  let {quote:q}=await f.run('quote-create',{id:'legacy-elegant',contactId:'contact-1',productId:'elegant-shutters'});
  const legacy={id:'legacy',name:'Legacy shade',width:36,height:48,quantity:1,notes:''};
  ({quote:q}=await f.run('quote-save',{id:q.id,version:q.version,fields:{openings:[legacy],unitPrices:{legacy:30000}}}));
  ({quote:q}=await f.run('quote-save',{id:q.id,version:q.version,fields:{openings:[...q.openings,{...opening,productId:'shuttersmart'}]}}));
  assert.deepEqual(q.openings[0],legacy);assert.equal(q.openings[1].pricing.rateCents,2500);
  const {order}=await f.run('quote-convert',{id:q.id,version:q.version});
  assert.equal(order.productId,'elegant-shutters');assert.equal(orderJob(order).productId,'shuttersmart');
  assert.equal(orderJob(order).openings.length,1);
  // A raw publish cannot bypass sale confirmation or replace the sold specifications.
  await assert.rejects(f.run('publish',{job:{id:order.id,productId:'shuttersmart',name:'Forged',number:'Forged',finance:{confirmedAt:1},openings:[{...opening,id:'forged',width:12}]}}),/Confirm the order sale total/);
  await confirmForProduction(f,order);const {job}=await f.run('job-get',{id:order.id});
  assert.equal(job.number,order.number);assert.equal(job.openings[0].input.id,opening.id);assert.equal(job.openings[0].input.width,36);
  assert.equal((await f.run('sales-get',{kind:'order',id:order.id})).record.openings.length,2);
});

test('explicit nonmanufacturing lines in a default quote never enter manufacturing',async t=>{
  const f=await fixture(t);let q=await quote(f,{items:[]});
  ({quote:q}=await f.run('quote-save',{id:q.id,version:q.version,fields:{openings:[{id:'only-elegant',productId:'elegant-shutters',name:'Shade',width:625,height:36.58,quantity:1,notes:''}],unitPrices:{'only-elegant':50000}}}));
  assert.equal(q.openings[0].pricing.rateCents,null); // No accidental inheritance of the ShutterSmart rate.
  const {order}=await f.run('quote-convert',{id:q.id,version:q.version});
  assert.throws(()=>orderJob(order),/only for ShutterSmart/);
  await assert.rejects(f.run('order-release',{id:order.id,version:order.version}),/only for ShutterSmart/);
  assert.deepEqual((await f.run('dashboard')).pendingOrders,[]);
  assert.equal((await f.run('sales-get',{kind:'order',id:order.id})).productionStage,null);
});

const receipt=(id,amountCents)=>({id,amountCents,receivedOn:'2026-10-17',method:'check',note:'Test receipt'});
const confirmation=(order,saleTotalCents=70000,paid=20000)=>({id:order.id,version:order.version,confirmationId:'confirm-1',saleTotalCents,payment:receipt('initial-1',paid)});
test('confirmed order stores agreed price, receipt and balance and automatically reaches the shop exactly once',async t=>{
 const f=await fixture(t),q=await quote(f),{order}=await f.run('quote-convert',{id:q.id,version:q.version});
 assert.deepEqual((await f.run('sales')).financials,{soldCents:0,receivedCents:0,balanceCents:0,needsPricing:1});
 const request=confirmation(order,71023,20517),r=await f.run('order-confirm',request);
 assert.equal(r.released,true);assert.equal(r.readiness.status,'released');
 assert.deepEqual(r.financials,{confirmed:true,saleTotalCents:71023,paidCents:20517,balanceCents:50506,paymentStatus:'Partially paid'});
 assert.deepEqual(r.order.openings,order.openings);assert.equal(quoteTotals(r.order).total,74376);
 assert.equal((await f.run('order-confirm',request)).order.version,r.order.version);
 await assert.rejects(f.run('order-confirm',{...request,saleTotalCents:90000}),e=>e.status===409);
 const board=await f.run('dashboard');assert.equal(board.jobs.length,1);assert.equal(board.pendingOrders.length,0);assert.deepEqual(board.jobs[0].openings[0].result,calculate(opening));
 assert.deepEqual((await f.run('sales')).financials,{soldCents:71023,receivedCents:20517,balanceCents:50506,needsPricing:0});
 const other=createShopService({store:fileStore(f.path),password,secret});assert.deepEqual((await other.run('sales-get',{kind:'order',id:order.id},f.owner)).financials,r.financials);
 const {code}=await f.run('pairing',{name:'Shop'}),shop={shop:(await f.service.run('pair',{code})).token};
 const payload=JSON.stringify(await f.service.run('jobs',{},shop));for(const key of ['finance','saleTotalCents','payments','Test receipt',contact.email,'PRIVATE'])assert.ok(!payload.includes(key),key);
});
test('payment ledger rejects bad amounts, stale edits and changed retries; void retains an audit record',async t=>{
 const f=await fixture(t),q=await quote(f),{order}=await f.run('quote-convert',{id:q.id,version:q.version});
 for(const change of [{saleTotalCents:-1},{saleTotalCents:1.5},{payment:receipt('bad',80000)},{payment:{...receipt('bad',100),receivedOn:'2026-02-31'}}])await assert.rejects(f.run('order-confirm',{...confirmation(order),...change}));
 const r=await f.run('order-confirm',confirmation(order));
 for(const amount of [-1,0,1.5,50001])await assert.rejects(f.run('order-payment',{id:order.id,version:r.order.version,payment:receipt('bad',amount)}));
 await assert.rejects(f.run('order-payment',{id:order.id,version:1,payment:receipt('stale',100)}),e=>e.status===409);
 const request={id:order.id,version:r.order.version,payment:receipt('payment-2',12345)},p=await f.run('order-payment',request);
 assert.equal(p.financials.paidCents,32345);assert.equal(p.financials.balanceCents,37655);
 assert.equal((await f.run('order-payment',request)).order.finance.payments.length,2);
 await assert.rejects(f.run('order-payment',{...request,payment:receipt('payment-2',100)}),e=>e.status===409);
 await assert.rejects(f.run('order-payment-void',{id:order.id,version:p.order.version,paymentId:'payment-2',reason:''}));
 const v=await f.run('order-payment-void',{id:order.id,version:p.order.version,paymentId:'payment-2',reason:'Duplicate paper entry'});
 assert.equal(v.financials.paidCents,20000);assert.equal(v.financials.balanceCents,50000);assert.equal(v.order.finance.payments.length,2);assert.equal(v.order.finance.payments[1].voidReason,'Duplicate paper entry');assert.ok(v.order.finance.payments[1].voidedAt);
 const paid=await f.run('order-payment',{id:order.id,version:v.order.version,payment:receipt('final',50000)});assert.equal(paid.financials.paymentStatus,'Paid');assert.equal(paid.financials.balanceCents,0);
});
test('blocked orders remain visible in the shop; corrected manufacturing inputs release without changing the sold quote or payment',async t=>{
 const f=await fixture(t),q=await quote(f,{items:[{...opening,height:60}]}),{order}=await f.run('quote-convert',{id:q.id,version:q.version});
 const r=await f.run('order-confirm',confirmation(order));assert.equal(r.released,false);assert.equal(r.readiness.status,'blocked');assert.match(r.releaseIssue,/light gap/);
 const pending=(await f.run('jobs')).pendingOrders;assert.equal(pending.length,1);assert.equal(pending[0].readiness.status,'blocked');assert.equal(pending[0].finance,undefined);
 for(const items of [[],[{...opening,id:'new'}],[{...opening,quantity:3}],[{...opening,productId:'elegant-shutters'}]])await assert.rejects(f.run('order-specifications-save',{id:order.id,version:r.order.version,openings:items}));
 const corrected=await f.run('order-specifications-save',{id:order.id,version:r.order.version,openings:[opening]});
 assert.equal(corrected.released,true);assert.equal(corrected.order.openings[0].height,60);assert.equal(corrected.order.manufacturingSpecifications[0].height,59.5);assert.equal(corrected.order.specificationHistory[0].openings[0].height,60);
 assert.deepEqual(corrected.financials,r.financials);assert.deepEqual((await f.run('sales-get',{kind:'quote',id:q.id})).record.openings,q.openings);
 assert.equal((await f.run('jobs')).pendingOrders.length,0);assert.deepEqual((await f.run('jobs')).jobs[0].openings[0].input,opening);
 assert.deepEqual(orderJob(corrected.order).openings,[opening]);
 await assert.rejects(f.run('order-specifications-save',{id:order.id,version:corrected.order.version,openings:[opening]}),e=>e.status===409);
 const handler=shopHandler(f.service),response=await handler(new Request('https://example.com/api/shop/order-pdf',{method:'POST',headers:{'content-type':'application/json',cookie:'cutsheet_owner='+f.owner.owner},body:JSON.stringify({id:order.id,units:'mm'})}));assert.equal(response.status,200);assert.equal((await PDFDocument.load(await response.arrayBuffer())).getPageCount(),1);
});
test('correcting an unconfirmed order waits for pricing; mixed orders send only ShutterSmart',async t=>{
 const f=await fixture(t);await quote(f,{items:[]});
 let {quote:q}=await f.run('quote-create',{id:'mixed',contactId:'contact-1',productId:'elegant-shutters'});
 ({quote:q}=await f.run('quote-save',{id:q.id,version:q.version,fields:{openings:[{id:'shade',name:'Shade',width:36,height:60,quantity:1,productId:'elegant-shutters'},{...opening,productId:'shuttersmart',height:60}],unitPrices:{shade:12500}}}));
 const {order}=await f.run('quote-convert',{id:q.id,version:q.version});
 const fixed=await f.run('order-specifications-save',{id:order.id,version:order.version,openings:[{...opening,productId:'shuttersmart'}]});assert.equal(fixed.released,false);assert.equal(fixed.readiness.status,'confirmation');
 const ready=await f.run('order-confirm',confirmation(fixed.order,90000,0));assert.equal(ready.released,true);assert.equal(ready.financials.paidCents,0);assert.equal(ready.order.finance.payments.length,0);
 assert.equal((await f.run('jobs')).jobs[0].openings.length,1);assert.equal((await f.run('jobs')).jobs[0].openings[0].input.productId,'shuttersmart');assert.equal(ready.order.openings.length,2);
});
test('nonmanufacturing orders track sales and full payment without creating shop jobs',async t=>{
 const f=await fixture(t);await quote(f,{items:[]});let {quote:q}=await f.run('quote-create',{id:'elegant',contactId:'contact-1',productId:'elegant-shutters'});
 ({quote:q}=await f.run('quote-save',{id:q.id,version:q.version,fields:{openings:[{id:'shade',name:'Shade',width:51.875,height:36.58,quantity:1}],unitPrices:{shade:45025}}}));
 const {order}=await f.run('quote-convert',{id:q.id,version:q.version}),r=await f.run('order-confirm',confirmation(order,45025,45025));
 assert.equal(r.released,false);assert.equal(r.readiness.status,'not-applicable');assert.equal(r.financials.paymentStatus,'Paid');assert.equal((await f.run('jobs')).jobs.length,0);assert.deepEqual((await f.run('sales')).financials,{soldCents:45025,receivedCents:45025,balanceCents:0,needsPricing:0});
});

test('pending digital cut sheets expose only manufacturing data and keep cutting locked',async t=>{
 const f=await fixture(t),q=await quote(f,{items:[{...opening,height:60}]}),{order}=await f.run('quote-convert',{id:q.id,version:q.version});
 const {code}=await f.run('pairing',{name:'Cutting iPad'}),shop={shop:(await f.service.run('pair',{code})).token};
 await assert.rejects(f.service.run('job-get',{id:order.id}),e=>e.status===401);
 const {job:preview}=await f.service.run('job-get',{id:order.id},shop);
 assert.equal(preview.held,true);assert.equal(preview.readiness.status,'blocked');assert.equal(preview.openings[0].lines[0].completed,0);
 assert.equal(preview.openings[0].lines[0].quantity,calculate({...opening,height:60}).parts[0].quantity);
 for(const word of ['finance','customer','pricing','unitPrices','installationCents','PRIVATE',contact.email])assert.ok(!JSON.stringify(preview).includes(word),word);
 for(const operation of ['line','timer'])await assert.rejects(f.service.run(operation,{id:preview.id,version:preview.version,lineId:preview.openings[0].lines[0].id,status:'cut',action:'start'},shop),e=>e.status===404);
 const handler=shopHandler(f.service),request=op=>new Request('https://example.com/api/shop/'+op,{method:'POST',headers:{'content-type':'application/json',cookie:'cutsheet_shop='+shop.shop},body:JSON.stringify({id:order.id})});
 assert.equal((await handler(request('job-get'))).status,200);assert.equal((await handler(request('job-pdf'))).status,422);
 assert.equal((await f.run('jobs')).jobs.length,0);assert.equal((await f.run('sales-get',{kind:'order',id:order.id})).record.version,order.version);
 await assert.rejects(f.service.run('job-get',{id:q.id},shop),e=>e.status===404);
 await assert.rejects(f.service.run('job-get',{id:'__proto__'},shop),e=>e.status===400);
});

test('digital sheet switches from held preview to released progress and paired workers can print the same cuts',async t=>{
 const f=await fixture(t),q=await quote(f),{order}=await f.run('quote-convert',{id:q.id,version:q.version});
 assert.equal((await f.run('job-get',{id:order.id})).job.held,true);
 const {code}=await f.run('pairing',{name:'Cutting iPad'}),shop={shop:(await f.service.run('pair',{code})).token};
 await f.run('order-confirm',confirmation(order));
 let {job}=await f.service.run('job-get',{id:order.id},shop);assert.equal(job.held,undefined);
 ({job}=await f.service.run('line',{id:job.id,version:job.version,lineId:job.openings[0].lines[0].id,status:'partial',completed:4,outOfMaterial:false},shop));
 assert.equal((await f.run('job-get',{id:order.id})).job.openings[0].lines[0].completed,4);
 const handler=shopHandler(f.service),request=(cookie,units='mm')=>new Request('https://example.com/api/shop/job-pdf',{method:'POST',headers:{'content-type':'application/json',cookie},body:JSON.stringify({id:order.id,units,openings:[{...opening,width:1}]})});
 assert.equal((await handler(request(''))).status,401);
 assert.equal((await handler(request('cutsheet_shop='+shop.shop,'bogus'))).status,400);
 const response=await handler(request('cutsheet_shop='+shop.shop));assert.equal(response.status,200);
 const pdf=await PDFDocument.load(await response.arrayBuffer());assert.equal(pdf.getPageCount(),1);assert.equal(pdf.getPage(0).getWidth(),612);
 assert.deepEqual((await f.run('job-get',{id:order.id})).job.openings[0].input,opening);
});


test('all order release routes require server-side sale confirmation and failed attempts leave financials untouched',async t=>{
 const f=await fixture(t),q=await quote(f),{order}=await f.run('quote-convert',{id:q.id,version:q.version}),handler=shopHandler(f.service);
 for(const [op,data] of [['order-release',{id:order.id,version:order.version,finance:{confirmedAt:1}}],['publish',{job:{...order,finance:{confirmedAt:1,saleTotalCents:1}}}]]){
  const response=await handler(new Request('https://example.com/api/shop/'+op,{method:'POST',headers:{'content-type':'application/json',cookie:'cutsheet_owner='+f.owner.owner},body:JSON.stringify(data)}));
  assert.equal(response.status,422);assert.match((await response.json()).error,/Confirm the order sale total/);
 }
 assert.equal((await f.run('jobs')).jobs.length,0);
 assert.equal((await f.run('sales-get',{kind:'order',id:order.id})).record.version,order.version);
 assert.deepEqual((await f.run('sales')).financials,{soldCents:0,receivedCents:0,balanceCents:0,needsPricing:1});
 await confirmForProduction(f,order);
 assert.equal((await f.run('jobs')).jobs.length,1);assert.equal((await f.run('sales')).financials.soldCents,quoteTotals(order).total);
 assert.equal((await f.run('order-release',{id:order.id,version:order.version})).job.id,order.id);
});


test('blank measurements never produce a zero-dollar or minimum-area quote price',async()=>{
 const {openingPrice}=await import('../public/quote-pricing.js'),{measurementInput,hasMeasurements}=await import('../public/measurements.js');
 for(const value of [null,undefined,''])assert.equal(measurementInput(value),'');
 for(const value of [null,undefined,0,NaN]){
  const o={...opening,width:value};assert.equal(hasMeasurements(o),false);
  const p=openingPrice(o,{pricing:{rateCents:2500,minimumAreaHundredths:2000},unitPrices:{[o.id]:12345}});
  assert.equal(p.unitPrice,null);assert.equal(p.lineTotal,null);
 }
 assert.equal(hasMeasurements(opening),true);
});

test('builder price adjustments persist through reload, proposal, and order without changing product rates',async t=>{
 const {quoteAdjustmentFields,parseQuoteAmount}=await import('../public/quote-adjustments.js');
 const f=await fixture(t),q=await quote(f),unitPrice=parseQuoteAmount('350.25');
 const fields={unitPrices:{[opening.id]:unitPrice},discountCents:parseQuoteAmount('50.50'),installationCents:parseQuoteAmount('75.25'),taxBasisPoints:parseQuoteAmount('6.50',{tax:true})};
 const saved=await f.run('quote-save',{id:q.id,version:q.version,fields});
 assert.equal(saved.totals.subtotal,70050);assert.equal(saved.totals.total,77239);
 const reloaded=await f.run('sales-get',{kind:'quote',id:q.id});
 assert.deepEqual(quoteAdjustmentFields(reloaded.record),{discountCents:5050,installationCents:7525,taxBasisPoints:650});
 assert.equal(reloaded.totals.lines[0].override,true);
 assert.equal((await f.run('sales')).pricing.rateCents,2500);
 const {order}=await f.run('quote-convert',{id:q.id,version:reloaded.record.version});
 assert.equal(quoteTotals(order).total,77239);
 assert.deepEqual(order.unitPrices,fields.unitPrices);
 assert.deepEqual(quoteAdjustmentFields(order),quoteAdjustmentFields(reloaded.record));
});

test('clearing custom prices restores calculated rates and excessive discounts cannot save',async t=>{
 const {parseQuoteAmount}=await import('../public/quote-adjustments.js');
 const f=await fixture(t),q=await quote(f);
 const {quote:custom}=await f.run('quote-save',{id:q.id,version:q.version,fields:{unitPrices:{[opening.id]:0},installationCents:1250}});
 assert.equal(quoteTotals(custom).total,1250);
 await assert.rejects(f.run('quote-save',{id:q.id,version:custom.version,fields:{discountCents:1}}),/Discount cannot exceed/);
 const {quote:restored,totals}=await f.run('quote-save',{id:q.id,version:custom.version,fields:{unitPrices:{[opening.id]:parseQuoteAmount('',{optional:true})},installationCents:parseQuoteAmount(''),discountCents:0}});
 assert.equal(totals.total,74376);assert.equal(totals.lines[0].override,false);
 assert.equal(restored.unitPrices[opening.id],null);
 for(const value of ['-1','NaN','1,000','3.456','1000000.01'])assert.throws(()=>parseQuoteAmount(value));
 assert.throws(()=>parseQuoteAmount('100.01',{tax:true}));
 assert.equal(parseQuoteAmount('.50'),50);assert.equal(parseQuoteAmount('36.58'),3658);
 assert.equal(parseQuoteAmount('0',{optional:true}),0);
});

test('all finishing checks can be recorded before any cuts, persist independently and survive order release',async t=>{
 const f=await fixture(t),second={...opening,id:'opening-2',name:'Bedroom'},q=await quote(f,{items:[{...opening,height:60},second]});
 const {order}=await f.run('quote-convert',{id:q.id,version:q.version});
 const {code}=await f.run('pairing',{name:'Finishing iPad'}),shop={shop:(await f.service.run('pair',{code})).token};
 let {job}=await f.service.run('job-get',{id:order.id},shop);
 for(const check of [...productionChecks].reverse()){
  ({job}=await f.service.run('stage',{id:job.id,version:job.version,openingId:opening.id,stage:check.key,status:'complete'},shop));
  assert.equal(openingCheckStatus(job,job.openings[0],check.key),'complete');
  assert.equal(openingCheckStatus(job,job.openings[1],check.key),'not-started');
 }
 assert.ok(job.openings.every(o=>o.lines.every(l=>l.completed===0)));assert.notEqual(production(job).key,'complete');
 const persisted=createShopService({store:fileStore(f.path),password,secret});
 assert.deepEqual((await persisted.run('job-get',{id:job.id},shop)).job.openings[0].production,job.openings[0].production);
 const stage={id:job.id,version:job.version,openingId:second.id,stage:'louvers-capped',status:'partial'};
 await assert.rejects(f.service.run('stage',{...stage,version:order.version},shop),e=>e.status===409);
 await assert.rejects(f.service.run('stage',{...stage,openingId:'missing'},shop),e=>e.status===404);
 await assert.rejects(f.service.run('stage',{...stage,status:'cut'},shop),e=>e.status===400);
 ({job}=await f.service.run('stage',stage,shop));
 const current=(await f.run('sales-get',{kind:'order',id:order.id})).record;
 const fixed=await f.run('order-specifications-save',{id:current.id,version:current.version,openings:[opening,second]});
 await confirmForProduction(f,fixed.order);
 const released=(await f.run('job-get',{id:order.id})).job;
 assert.equal(released.held,undefined);
 for(const check of productionChecks)assert.equal(openingCheckStatus(released,released.openings[0],check.key),'complete');
 assert.equal(openingCheckStatus(released,released.openings[1],'louvers-capped'),'partial');
 assert.ok(released.activity.some(a=>a.message.includes('Hinged / complete')));
 assert.ok(released.openings.every(o=>o.lines.every(l=>l.completed===0)));
});

const companyFields={name:'Sample Shutters',address:'123 Sample Avenue\nNaples, FL 34102',phone:'555-0100',email:'office@example.com',website:'example.com',terms:'Sample terms for testing.\nFinal sample paragraph.'};
const tinyLogo={name:'logo.png',data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg=='};
function pdfText(pdf){return pdf.getPages().map(page=>{
 const contents=page.node.Contents();return contents.asArray().map(ref=>Buffer.from(decodePDFRawStream(pdf.context.lookup(ref)).decode()).toString()).join('\n').replace(/<([\da-f]+)>/gi,(_,hex)=>Buffer.from(hex,'hex').toString('latin1'));
}).join('\n');}

test('shared company settings validate, version and persist without changing existing business data',async t=>{
 const f=await fixture(t);await quote(f);
 assert.equal((await f.run('company-get')).company.version,0);
 const saved=await f.run('company-save',{version:0,fields:{...companyFields,logo:tinyLogo}});
 assert.equal(saved.company.version,1);
 const second=createShopService({store:fileStore(f.path),password,secret});
 assert.deepEqual((await second.run('company-get',{},f.owner)).company,saved.company);
 assert.equal((await f.run('sales')).quotes.length,1);
 await assert.rejects(f.run('company-save',{version:0,fields:companyFields}),e=>e.status===409);
 for(const fields of [null,{...companyFields,name:''},{...companyFields,email:'invalid'}, {...companyFields,terms:'x'.repeat(12001)}, {...companyFields,logo:{name:'remote',data:'https://example.com/logo.png'}}, {...companyFields,logo:{name:'bad',data:'data:image/png;base64,AA=='}}])await assert.rejects(f.run('company-save',{version:1,fields}),e=>e.status===400);
 assert.deepEqual((await f.run('company-get')).company,saved.company);
 const removed=await f.run('company-save',{version:1,fields:{...companyFields,logo:null}});assert.equal(removed.company.logo,null);
});

test('order PDFs use saved company details, agreed totals and payments; all lines and long terms paginate',async t=>{
 const f=await fixture(t),items=Array.from({length:12},(_,i)=>({...opening,id:'line-'+i,name:'Room '+(i+1)})),q=await quote(f,{items});
 const {order}=await f.run('quote-convert',{id:q.id,version:q.version});await f.run('order-confirm',confirmation(order,900000,100000));
 const terms=Array.from({length:50},(_,i)=>`Sample clause ${i+1}. These terms are a test fixture for checking order document pagination.`).join('\n');
 await f.run('company-save',{version:0,fields:{...companyFields,terms,logo:tinyLogo}});
 const handler=shopHandler(f.service),response=await handler(new Request('https://example.com/api/shop/sales-document',{method:'POST',headers:{'content-type':'application/json',cookie:'cutsheet_owner='+f.owner.owner},body:JSON.stringify({id:order.id,kind:'order',company:{name:'Forged'},total:1})}));
 assert.equal(response.status,200);
 const pdf=await PDFDocument.load(await response.arrayBuffer()),content=pdfText(pdf);
 assert.ok(pdf.getPageCount()>2);assert.equal(pdf.getAuthor(),companyFields.name);
 for(const value of ['Sample Shutters','123 Sample Avenue','555-0100','Room 1','Room 12','Terms and conditions','Sample clause 50.','Order adjustment','Order total','$9,000.00','Payments received','$1,000.00','Balance due','$8,000.00'])assert.ok(content.includes(value),value);
 for(const value of ['Forged','PRIVATE:','Keep panels labeled.'])assert.ok(!content.includes(value),value);
 assert.ok(pdf.getPage(0).node.Resources().lookupMaybe(PDFName.of('XObject'),PDFDict)?.keys().length>0);
});

test('quote drafts retain unfinished dimensions without inventing a price or allowing an order',async t=>{
 const f=await fixture(t),q=await quote(f,{items:[{...opening,height:null}]});
 const saved=await f.run('sales-get',{kind:'quote',id:q.id});assert.equal(saved.record.openings[0].height,null);assert.equal(saved.totals.unpriced,1);assert.deepEqual(saved.previews,[null]);
 await assert.rejects(f.run('quote-convert',{id:q.id,version:q.version}),/price every opening/);
 const {quote:finished}=await f.run('quote-save',{id:q.id,version:q.version,fields:{openings:[opening]}});
 assert.equal((await f.run('sales-get',{kind:'quote',id:q.id})).totals.unpriced,0);
 const {order}=await f.run('quote-convert',{id:q.id,version:finished.version});await confirmForProduction(f,order);
 const job=(await f.run('dashboard')).jobs[0];assert.equal(job.displayName,'Alex Rivera');assert.equal(job.customer,undefined);
 assert.ok(!JSON.stringify(job).includes(contact.email));assert.ok(!JSON.stringify(job).includes(contact.phone));
});

test('autosaved blank line can still choose its product and receives that product rate',async t=>{
 const f=await fixture(t);let q=await quote(f,{items:[{...opening,productId:'shuttersmart',width:null,height:null}]});
 await f.run('pricing-save',{productId:'elegant-shutters',version:0,rateCents:4000,minimumAreaHundredths:0});
 ({quote:q}=await f.run('quote-save',{id:q.id,version:q.version,fields:{openings:[{...q.openings[0],productId:'elegant-shutters'}]}}));
 assert.equal(q.openings[0].productId,'elegant-shutters');assert.equal(q.openings[0].pricing.rateCents,4000);
 ({quote:q}=await f.run('quote-save',{id:q.id,version:q.version,fields:{openings:[{...q.openings[0],width:36,height:60}]}}));
 await assert.rejects(f.run('quote-save',{id:q.id,version:q.version,fields:{openings:[{...q.openings[0],productId:'starwood'}]}}),/new line item/);
});
