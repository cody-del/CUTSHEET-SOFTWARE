import {BROADLEAF_FRACTIONS,broadleafMeasurementParts,combineBroadleafMeasurement} from '../public/broadleaf-measurements.js';
import {PDFDocument,decodePDFRawStream} from 'pdf-lib';
import {createSalesPDF} from '../sales-pdf.mjs';
import {quotePricing} from '../public/quote-pricing.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BROADLEAF_ID,defaultBroadleaf,normalizeBroadleaf,broadleafFrames,broadleafTipSize,validateBroadleafOpening,broadleafDetails} from '../public/broadleaf.js';
import {openingPrice} from '../public/quote-pricing.js';
import {nextQuoteLine} from '../public/quote-line-defaults.js';
import {manufacturingOpenings} from '../public/products.js';
import {createShopService} from '../shop-service.mjs';
import {fileStore} from '../shop-store.mjs';
const valid=()=>({...defaultBroadleaf(),color:'110',frame:'SL10',sections:['LR'],hinge:'paint'});
const item=(b={},o={})=>({id:'broadleaf',productId:BROADLEAF_ID,name:'Living room',width:21,height:57,quantity:2,notes:'',pricing:{rateCents:2500,minimumAreaHundredths:0},broadleaf:{...valid(),...b},...o});

test('Broadleaf matches supplied models, finish codes and mount-specific frame lists',()=>{
 for(const model of ['3.5','4.5'])assert.equal(normalizeBroadleaf({...valid(),model}).model,model);
 for(const model of ['2.5','3','4','5'])assert.throws(()=>normalizeBroadleaf({model}),/model/);
 for(const color of ['110','001','003'])assert.equal(normalizeBroadleaf({color}).color,color);
 assert.deepEqual(broadleafFrames('O').map(f=>f.id),['HS107','SL10','FL10','FLF88','DF20','CF20','NF']);
 assert.deepEqual(broadleafFrames('I').map(f=>f.id),['HS107','BZ17','DZ25','FZ23','EZ30','CZ22','TZ88','NF']);
 assert.throws(()=>normalizeBroadleaf({...valid(),mount:'I'}),/selected mount/);
 assert.throws(()=>normalizeBroadleaf({waiveWarranty:'true'}));
});

test('Finished Size uses entered tip-to-tip dimensions with no tariff and cent-accurate quantity pricing',()=>{
 const o=item({}, {width:51.875,height:36.58});const result=openingPrice(o,{});
 assert.equal(result.area,51.875*36.58/144);assert.equal(result.unitPrice,32944);assert.equal(result.lineTotal,65888);
 assert.equal(openingPrice(o,{unitPrices:{broadleaf:10000}}).lineTotal,20000);
 assert.equal(openingPrice({...o,pricing:{rateCents:2500,minimumAreaHundredths:2000}},{}).lineTotal,100000);
});

test('binder Window Size conversions price outside L and Deco frames by actual framed sides',()=>{
 for(const frame of ['SL10','FL10','FLF88','DF20','CF20'])for(const [sides,edges]of [['4',2],['3-sill',1],['3',1],['3-inverted',1],['2-sill',0],['2',0]]){
  const extension=frame.startsWith('DF')||frame.startsWith('CF')?2.75:1.5;
  assert.deepEqual(broadleafTipSize(item({frame,reference:'WS',sides})),{width:21+extension*2,height:57+extension*edges,issues:[]});
 }
 const priced=openingPrice(item({reference:'WS'}),{});assert.equal(priced.area,10);assert.equal(priced.unitPrice,25000);assert.equal(priced.lineTotal,50000);
});

test('binder inside Z pricing allowances remain distinct from ShutterSmart frame deductions',()=>{
 for(const [frame,total]of [['BZ17',2],['CZ22',2.5],['DZ25',3],['EZ30',4],['TZ88',1.5],['FZ23',2.69]]){
  const size=broadleafTipSize(item({frame,mount:'I',reference:'WS'}));assert.equal(size.width,21+total);assert.equal(size.height,57+total);
 }
 assert.equal(openingPrice(item({frame:'DZ25',mount:'I',reference:'WS'}),{}).unitPrice,25000);
 for(const [frame,mount]of [['HS107','I'],['NF','I'],['NF','O']])assert.deepEqual(broadleafTipSize(item({frame,mount,reference:'WS'})),{width:21,height:57,issues:[]});
});

test('outside hanging-strip Window Size requires measured tip-to-tip dimensions instead of an invented allowance',()=>{
 const o=item({frame:'HS107',reference:'WS'});assert.equal(openingPrice(o,{}).unitPrice,null);
 assert.throws(()=>validateBroadleafOpening(o,{complete:true}),/tip-to-tip/);
 o.broadleaf.tipWidth=24;o.broadleaf.tipHeight=60;assert.equal(openingPrice(o,{}).unitPrice,25000);
 assert.doesNotThrow(()=>validateBroadleafOpening(o,{complete:true}));
 assert.equal(normalizeBroadleaf({...o.broadleaf,reference:'MFF'}).tipWidth,null);
});

test('all four T-post measurements and five section layouts are required and validated on order conversion',()=>{
 const o=item({postCount:4,postLocations:[24,48,72,96],sections:['L','LR','LL','RR','R'],postSize:'2'}, {width:120,height:72});
 assert.doesNotThrow(()=>validateBroadleafOpening(o,{complete:true}));
 for(const mutate of [b=>b.postLocations[3]=null,b=>b.postLocations[2]=47,b=>b.postLocations[3]=120,b=>b.sections[4]='']){
  const bad=structuredClone(o);mutate(bad.broadleaf);assert.throws(()=>validateBroadleafOpening(bad,{complete:true}));
 }
 assert.throws(()=>normalizeBroadleaf({...o.broadleaf,frame:'DF20'}),/1-inch/);
 assert.throws(()=>normalizeBroadleaf({...o.broadleaf,postFace:'flat'}),/beaded/);
 const reduced=normalizeBroadleaf({...o.broadleaf,postCount:1});assert.deepEqual(reduced.postLocations,[24]);assert.deepEqual(reduced.sections,['L','LR']);
});

test('drafts allow missing choices but orders require finish, configurations and valid divider locations',()=>{
 assert.doesNotThrow(()=>validateBroadleafOpening({width:null,height:null,broadleaf:defaultBroadleaf()}));
 assert.throws(()=>validateBroadleafOpening(item({color:''}),{complete:true}),/color/);
 assert.throws(()=>validateBroadleafOpening(item({frame:''}),{complete:true}),/frame/);
 assert.throws(()=>validateBroadleafOpening(item({hinge:''}),{complete:true}),/hinge/);
 const o=item({divider:'2-location',dividerLocations:[20,40],splitLocation:25});assert.doesNotThrow(()=>validateBroadleafOpening(o,{complete:true}));
 assert.throws(()=>validateBroadleafOpening(item({divider:'2-location',dividerLocations:[40,20]}),{complete:true}),/increase/);
 assert.throws(()=>validateBroadleafOpening(item({splitLocation:58}),{complete:true}),/split/);
 assert.deepEqual(normalizeBroadleaf({...o.broadleaf,divider:'1-even'}).dividerLocations,[]);
});

test('Add Line carries product choices but clears opening-specific measurements and warranty waiver',()=>{
 const previous=item({postCount:2,postLocations:[20,40],sections:['L','LR','R'],divider:'1-location',dividerLocations:[30],splitLocation:32,waiveWarranty:true});
 const next=nextQuoteLine(previous,{}, {id:'new',name:'Opening 2'});
 assert.equal(next.productId,BROADLEAF_ID);assert.equal(next.width,null);assert.equal(next.height,null);assert.equal(next.quantity,1);
 assert.deepEqual(next.broadleaf.postLocations,[null,null]);assert.deepEqual(next.broadleaf.sections,['L','LR','R']);
 assert.deepEqual(next.broadleaf.dividerLocations,[null]);assert.equal(next.broadleaf.splitLocation,null);assert.equal(next.broadleaf.waiveWarranty,false);
 assert.equal(next.broadleaf.frame,'SL10');assert.equal(previous.broadleaf.waiveWarranty,true);
});

test('legacy Broadleaf prices remain unchanged; mixed quotes manufacture ShutterSmart only',()=>{
 const old=item();delete old.broadleaf;assert.equal(openingPrice(old,{}).unitPrice,20781);
 const quote={openings:[old,item(),{id:'smart',productId:'shuttersmart'},{id:'ewf',productId:'elegant-ewf-shades'}]};
 assert.deepEqual(manufacturingOpenings(quote).map(o=>o.id),['smart']);
 const lines=broadleafDetails(item({postCount:2,postLocations:[7,14],sections:['L','LR','R'],divider:'1-location',dividerLocations:[25]}));
 assert.ok(lines.indexOf('Section 1: 1 panel – L')<lines.indexOf('T-post 1: 7 in from left'));
 assert.ok(lines.includes('Tip-to-tip: 21 in W × 57 in H'));assert.ok(lines.some(s=>s.includes('Bright White · 110')));
});

test('Broadleaf options survive storage, rate snapshots and order conversion without creating a shop job',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'broadleaf-service-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const service=createShopService({store:fileStore(join(dir,'data.json')),local:true}),run=(op,data={})=>service.run(op,data);
 await run('contact-save',{id:'contact',version:0,fields:{firstName:'Demo',lastName:'Customer',address:'',phone:'',email:'',notes:''}});
 await run('pricing-save',{productId:BROADLEAF_ID,version:0,rateCents:2500,minimumAreaHundredths:0});
 let {quote}=await run('quote-create',{id:'quote',contactId:'contact',productId:BROADLEAF_ID});
 const opening=item({reference:'WS',postCount:1,postLocations:[10.9375],sections:['LR','LR']},{width:21.0625,height:57.9375});opening.pricing={rateCents:1};
 ({quote}=await run('quote-save',{id:quote.id,version:quote.version,fields:{openings:[opening]}}));
 assert.equal(quote.openings[0].pricing.rateCents,2500);assert.deepEqual(quote.openings[0].broadleaf,opening.broadleaf);
 await run('pricing-save',{productId:BROADLEAF_ID,version:1,rateCents:9999,minimumAreaHundredths:0});
 const saved=await run('sales-get',{kind:'quote',id:quote.id});assert.equal(saved.record.openings[0].width,21.0625);assert.equal(saved.record.openings[0].height,57.9375);assert.equal(saved.totals.total,50914);
 const {order}=await run('quote-convert',{id:quote.id,version:quote.version});assert.deepEqual(order.openings,quote.openings);
 assert.equal((await run('dashboard')).jobs.length,0);
 await assert.rejects(run('order-release',{id:order.id,version:order.version}),/only for ShutterSmart/);
 const created=await run('quote-create',{id:'incomplete',contactId:'contact',productId:BROADLEAF_ID});
 const draft=(await run('quote-save',{id:created.quote.id,version:created.quote.version,fields:{openings:[item({postCount:1,postLocations:[null],sections:['LR','LR']})]}})).quote;
 await assert.rejects(run('quote-convert',{id:draft.id,version:draft.version}),/T-post 1 location/);
});


test('Broadleaf proposal PDF preserves fraction sizes, frame codes and every T-post section',async()=>{
 const record={id:'q',number:'Q-0001',name:'Demo Customer',createdAt:'2026-11-01T12:00:00Z',openings:[item({model:'4.5',postCount:4,postLocations:[24,48,72,96],sections:['LR','LR','LR','LR','LR']},{width:120,height:72})],unitPrices:{}};
 const pdf=await PDFDocument.load(await createSalesPDF({record,contact:{firstName:'Demo',lastName:'Customer'},totals:quotePricing(record)},'quote'));
 const text=pdf.getPages().map(page=>page.node.Contents().asArray().map(ref=>Buffer.from(decodePDFRawStream(pdf.context.lookup(ref)).decode()).toString()).join('\n').replace(/<([\da-f]+)>/gi,(_,hex)=>Buffer.from(hex,'hex').toString('latin1'))).join('\n');
 for(const expected of ['4 1/2-inch louvers','SL10','T-post 4: 96 in from left','Section 5: 2 panels - LR','120 in W x 72 in H'])assert.ok(text.includes(expected),expected);
 assert.ok(!text.includes('412-inch'));
});

 test('Broadleaf sixteenth picker preserves every fraction and keeps existing decimals and metric values exact',()=>{
 assert.deepEqual(BROADLEAF_FRACTIONS,['','1/16','1/8','3/16','1/4','5/16','3/8','7/16','1/2','9/16','5/8','11/16','3/4','13/16','7/8','15/16']);
 for(let fraction=0;fraction<16;fraction++){
  const expected=51+fraction/16,parts=broadleafMeasurementParts(expected);
  assert.deepEqual(parts,{whole:'51',fraction});assert.equal(combineBroadleafMeasurement(parts.whole,parts.fraction),expected);
 }
 assert.deepEqual(broadleafMeasurementParts(36.58),{whole:'36.58',fraction:0});
 assert.equal(combineBroadleafMeasurement('51.875',7),51.875);
 assert.equal(combineBroadleafMeasurement('51 15/16',7),51.9375);
 assert.equal(combineBroadleafMeasurement('',1),.0625);
 assert.equal(combineBroadleafMeasurement('',0),null);
 assert.equal(broadleafMeasurementParts(625/25.4,'mm').whole,'625');
 assert.throws(()=>combineBroadleafMeasurement('invalid',1));
 });
