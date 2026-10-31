import test from 'node:test';
import assert from 'node:assert/strict';
import {nextQuoteLine} from '../public/quote-line-defaults.js';
const defaults={id:'new-opening',name:'Opening 2',width:null,height:null,quantity:1,left:1,right:1,louver:4,frame:'ST',sides:'4W',mount:'I',sizeMethod:'S',color:'W',tilt:'Back',stile:'Flat',divider:0,divisionMode:'divider',notes:''};
const prices={shuttersmart:{rateCents:2500,minimumAreaHundredths:0,version:2}};

test('new quote lines inherit product options but reset opening-specific values',()=>{
 const previous={...defaults,id:'old',name:'Kitchen',productId:'shuttersmart',width:51.875,height:72,quantity:3,frame:'TR',color:'OW',tilt:'Front',louver:3,mount:'O',sizeMethod:'W',sides:'4S',left:2,right:2,divider:30,notes:'Only for kitchen',pricing:{rateCents:1000},unitPrice:12345};
 const snapshot=structuredClone(previous),line=nextQuoteLine(previous,{productId:'shuttersmart'},defaults,prices);
 for(const key of ['productId','frame','color','tilt','louver','mount','sizeMethod','sides','left','right'])assert.equal(line[key],previous[key]);
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
