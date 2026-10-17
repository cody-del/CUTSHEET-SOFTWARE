import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PDFDocument} from 'pdf-lib';
import {fileStore} from '../shop-store.mjs';
import {createShopService} from '../shop-service.mjs';
import {shopHandler} from '../shop-api.mjs';
import {salesOperations,quoteTotals,orderJob} from '../sales-service.mjs';
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
  const {job}=await run('order-release',{id:order.id,version:order.version});assert.equal(job.productId,'shuttersmart');assert.deepEqual(job.openings[0].result,calculate(opening));
});

test('empty quote product selection switches pricing and layout identity while preserving its contact and number',async t=>{
  const f=await fixture(t),original=await quote(f,{items:[]});
  await f.run('pricing-save',{productId:'elegant-shutters',version:0,rateCents:4000,minimumAreaHundredths:1200});
  const {quote:elegant}=await f.run('quote-product',{id:original.id,version:original.version,productId:'elegant-shutters'});
  assert.equal(elegant.productId,'elegant-shutters');assert.equal(elegant.name,'Elegant Shutters');
  assert.equal(elegant.pricing.rateCents,4000);assert.equal(elegant.pricing.minimumAreaHundredths,1200);
  assert.equal(elegant.contactId,original.contactId);assert.equal(elegant.number,original.number);assert.equal(elegant.notes,original.notes);
  assert.equal(elegant.version,original.version+1);assert.deepEqual(elegant.openings,[]);
  await assert.rejects(f.run('quote-product',{id:original.id,version:original.version,productId:'starwood'}),e=>e.status===409);
  const {quote:starwood}=await f.run('quote-product',{id:elegant.id,version:elegant.version,productId:'starwood'});
  assert.equal(starwood.name,'Starwood');assert.equal(starwood.pricing.rateCents,null);
  const {quote:custom}=await f.run('quote-product',{id:starwood.id,version:starwood.version,productId:'other',productLabel:'Example shades'});
  assert.equal(custom.productLabel,'Example shades');assert.equal(custom.name,'Example shades');
  const {quote:back}=await f.run('quote-product',{id:custom.id,version:custom.version,productId:'shuttersmart'});
  assert.equal(back.name,'ShutterSmart');assert.equal(back.productLabel,undefined);assert.equal(back.pricing.rateCents,2500);
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
  // Even a raw publish request must take the accepted order's filtered specifications.
  const {job}=await f.run('publish',{job:{id:order.id,productId:'shuttersmart',name:'Forged',number:'Forged',openings:[{...opening,id:'forged',width:12}]}});
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
