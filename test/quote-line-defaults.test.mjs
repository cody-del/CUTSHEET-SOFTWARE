import test from 'node:test';
import assert from 'node:assert/strict';
import {nextQuoteLine,duplicateQuoteLine} from '../public/quote-line-defaults.js';
import {quotePricing} from '../public/quote-pricing.js';
const defaults={id:'new-opening',name:'Opening 2',width:null,height:null,quantity:1,left:1,right:1,louver:4,frame:'ST',sides:'4W',mount:'I',sizeMethod:'S',color:'W',tilt:'Back',stile:'Flat',divider:0,divisionMode:'divider',notes:''};
const prices={shuttersmart:{rateCents:2500,minimumAreaHundredths:0,version:2}};

test('duplicating a complete quote line inserts it next, retains pricing, and keeps edits independent',()=>{
 const source={...defaults,id:'first',name:'Living room',productId:'shuttersmart',width:72.5,height:59.125,quantity:2,frame:'TR',sides:'CW',frameSides:{top:'standard',bottom:'standard',left:'trim',right:'trim'},divider:28,notes:'Match existing opening',pricing:prices.shuttersmart,tposts:{construction:'standard',positions:[36.5],sections:[{left:1,right:0},{left:0,right:1}]}};
 const quote={openings:[source,{...defaults,id:'second',width:24,height:60,productId:'shuttersmart',pricing:prices.shuttersmart}],unitPrices:{first:48000},discountCents:2500,installationCents:1000,taxBasisPoints:0};
 const before=structuredClone(quote),total=quotePricing(quote).total;
 const copy=duplicateQuoteLine(quote,'first','copy');
 assert.deepEqual(quote.openings.map(o=>o.id),['first','copy','second']);
 assert.deepEqual(copy,{...before.openings[0],id:'copy'});
 assert.equal(quote.unitPrices.copy,48000);
 assert.equal(quotePricing(quote).total,total+96000);
 assert.equal(quote.discountCents,2500);assert.equal(quote.installationCents,1000);
 copy.tposts.positions[0]=35;copy.tposts.sections[0].left=2;copy.frameSides.top='trim';copy.pricing.rateCents=1;quote.unitPrices.copy=50000;
 assert.deepEqual(source,before.openings[0]);assert.equal(quote.unitPrices.first,48000);
});

test('duplicates preserve calculated, zero, and cleared price overrides and all supplier or sliding options',()=>{
 for(const options of [{sliding:{layout:'FMB',overlap:1.625,tiltPositions:['Left','Right','Right']}},{ewf:{model:'room-darkening',motorType:'wand-remote',remote:'multi-channel'}},{broadleaf:{louver:4.5,tposts:{positions:[24,48]}}}]){
  for(const override of [undefined,null,0,12345]){
   const source={...defaults,id:'last',...options};
   const quote={openings:[source],unitPrices:override===undefined?{}:{last:override}};
   const copy=duplicateQuoteLine(quote,'last','new');
   assert.deepEqual(copy,{...source,id:'new'});
   assert.equal(Object.hasOwn(quote.unitPrices,'new'),override!==undefined);
   assert.equal(quote.unitPrices.new,override);
   for(const key of Object.keys(options))assert.notEqual(copy[key],source[key]);
  }
 }
});

test('ShutterSmart additions always use Inside mount and Shutter size regardless of the previous line',()=>{
 for(const mount of ['I','O'])for(const sizeMethod of ['S','W','F',undefined]){
  const line=nextQuoteLine({...defaults,mount,sizeMethod}, {productId:'shuttersmart'},defaults,prices);
  assert.equal(line.sizeMethod,'S');assert.equal(line.mount,'I');
 }
});

test('new quote lines inherit product options but reset opening-specific values',()=>{
 const previous={...defaults,id:'old',name:'Kitchen',productId:'shuttersmart',width:51.875,height:72,quantity:3,frame:'TR',color:'OW',tilt:'Front',louver:3,mount:'O',sizeMethod:'W',sides:'4S',left:2,right:2,divider:30,notes:'Only for kitchen',pricing:{rateCents:1000},unitPrice:12345};
 const snapshot=structuredClone(previous),line=nextQuoteLine(previous,{productId:'shuttersmart'},defaults,prices);
 for(const key of ['productId','frame','color','tilt','louver','sides','left','right'])assert.equal(line[key],previous[key]);
 assert.equal(line.sizeMethod,'S');assert.equal(line.mount,'I');
 assert.equal(line.id,'new-opening');assert.equal(line.name,'Opening 2');assert.equal(line.width,null);assert.equal(line.height,null);assert.equal(line.quantity,1);assert.equal(line.divider,0);assert.equal(line.notes,'');assert.equal(line.unitPrice,undefined);
 assert.equal(line.pricing.rateCents,2500);assert.deepEqual(previous,snapshot);
});

test('T-post arrangement is copied independently with new centerlines required',()=>{
 const previous={...defaults,productId:'shuttersmart',frameStyle:'modern-standard',tposts:{construction:'standard',positions:[28,56,84],sections:Array.from({length:4},()=>({left:1,right:1}))}};
 const line=nextQuoteLine(previous,{},defaults,prices);
 assert.equal(line.frameStyle,'modern-standard');assert.deepEqual(line.tposts.positions,[null,null,null]);assert.deepEqual(line.tposts.sections,previous.tposts.sections);assert.equal(line.tposts.construction,'standard');
 line.tposts.sections[0].left=2;assert.equal(previous.tposts.sections[0].left,1);
});

test('mixed-product lines use the currently selected product including custom brand names',()=>{
 for(const productId of ['elegant-shutters','starwood','other']){
  const previous={id:'current',productId,productLabel:'Custom Brand',width:40,height:60,quantity:2,notes:'Opening instructions',frame:'TR',tposts:{positions:[20]}};
  const line=nextQuoteLine(previous,{productId:'shuttersmart'},defaults,{[productId]:{rateCents:1800}});
  assert.equal(line.productId,productId);assert.equal(line.frame,undefined);assert.equal(line.tposts,undefined);assert.equal(line.width,null);assert.equal(line.height,null);assert.equal(line.quantity,1);assert.equal(line.notes,'');assert.equal(line.pricing.rateCents,1800);
  if(productId==='other')assert.equal(line.productLabel,'Custom Brand');
 }
});

test('first or unselected lines still ask for a product; legacy lines inherit their quote product',()=>{
 for(const previous of [null,{productId:''}])assert.deepEqual(nextQuoteLine(previous,{},defaults,prices),{id:'new-opening',name:'Opening 2',productId:''});
 const line=nextQuoteLine({...defaults,frame:'TR'}, {productId:'shuttersmart'},defaults,prices);
 assert.equal(line.productId,'shuttersmart');assert.equal(line.frame,'TR');
});

test('new ShutterSmart quote lines use Flat without altering saved Regular openings',()=>{
 const previous={...defaults,productId:'shuttersmart',stile:'Reg'};
 const line=nextQuoteLine(previous,{},defaults,prices);
 assert.equal(line.stile,'Flat');
 assert.equal(previous.stile,'Reg');
});
