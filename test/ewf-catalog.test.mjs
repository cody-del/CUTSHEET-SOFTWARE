import test from 'node:test';
import assert from 'node:assert/strict';
import {EWF_CATALOG as data} from '../public/ewf-catalog-data.js';
import {ewfColors,ewfSelectedFabric,ewfCatalogPrice,EWF_PRICING} from '../public/ewf-catalog.js';
import {defaultEwf,normalizeEwf,validateEwfOpening,ewfDimensionError} from '../public/elegant.js';
import {openingPrice} from '../public/quote-pricing.js';
const shade=(options={},dimensions={})=>({id:'ewf',productId:'elegant-ewf-shades',width:36,height:60,quantity:1,pricing:{...EWF_PRICING},ewf:normalizeEwf({...defaultEwf(),fabricCode:'R05001',...options}),...dimensions});
const price=o=>openingPrice(o,{unitPrices:{},status:'draft'});

test('color lists match the supplied ordering lists and resolve to unique binder codes',()=>{
 assert.equal(data.fabrics.length,186);assert.equal(new Set(data.fabrics.map(f=>f.code)).size,186);
 for(const model of ['light-filtering','room-darkening']){
  const colors=ewfColors(model);assert.equal(colors.length,69);
  assert.deepEqual(colors.map(f=>f.name),colors.map(f=>f.name).sort((a,b)=>a.localeCompare(b)));
  for(const f of colors){assert.equal(ewfSelectedFabric({model,colorName:f.name}).code,f.code);assert.ok(f.maxWidth>0);}
 }
 for(const [code,name]of [['R07002','Victoria Beige'],['R07002D','Dark Victorian Beige'],['R07007','Enchanting'],['R07007D','Dark Village'],['R06003','Tuffle']])assert.equal(ewfSelectedFabric({fabricCode:code}).name,name);
 assert.throws(()=>normalizeEwf({...defaultEwf(),fabricCode:'R05001D'}),/selected model/);
});

test('all 900 grid cells are present; next upper bands apply with no interpolation',()=>{
 for(const [group,rows]of Object.entries(data.grids)){
  assert.equal(rows.length,15);
  for(const [r,row]of rows.entries()){
   assert.equal(row.length,15);
   for(const [c,value]of row.entries()){
    assert.ok(Number.isInteger(value)&&value>0);
    const fabric=data.fabrics.find(f=>f.group===Number(group)&&!f.review&&f.maxWidth===116);
    const o=shade({fabricCode:fabric.code,model:fabric.model},{width:data.widths[c],height:data.heights[r]});
    const result=ewfCatalogPrice(o),review=data.reviewCells.some(x=>x.group===Number(group)&&x.width===o.width&&x.height===o.height);
    assert.equal(result.baseCents,review?null:value+(o.width>90?10000:0)+(o.width>93?10000:0));
   }
  }
 }
 assert.equal(price(shade({}, {width:24,height:36})).unitPrice,21600); // $171 + $45
 assert.equal(price(shade({}, {width:24.001,height:36.001})).unitPrice,24800); // 32×42 $203 + $45
 assert.equal(price(shade({fabricCode:'R11001'},{width:24,height:36})).unitPrice,23900); // group 2 $194
 assert.equal(price(shade({fabricCode:'R05001D',model:'room-darkening'},{width:24,height:36})).unitPrice,22800); // group 3 $183
 assert.equal(price(shade({fabricCode:'R11001D',model:'room-darkening'},{width:24,height:36})).unitPrice,25500); // group 4 $210
});

test('known accessory charges and $45 are included once per shade, including quantity changes',()=>{
 const basic=shade(),motor=shade({operation:'motorized',remote:'multi',usb6:true,usb10:true,wifi:'hub',valance:'square'});
 const extra=36500+11600+5000+6000+45000+9500;
 assert.equal(price(motor).unitPrice,price(basic).unitPrice+extra);
 for(const quantity of [1,2,3,100])assert.equal(price({...motor,quantity}).lineTotal,price(motor).unitPrice*quantity);
 assert.equal(price(shade({operation:'motorized',remote:'single'})).unitPrice,price(basic).unitPrice+36500+8800);
 assert.equal(price(shade({lightBlocker:true,lightBlockerFeet:10.5})).unitPrice,price(basic).unitPrice+11025);
 assert.equal(price(shade({valance:'curved'})).unitPrice,price(basic).unitPrice+9500);
 for(const width of [90,90.001,93,93.001]){
  const o=shade({fabricCode:'R06001'},{width});const base=data.grids[1][4][data.widths.findIndex(v=>v>=width)];
  assert.equal(price(o).unitPrice,base+4500+(width>90?10000:0)+(width>93?10000:0));
 }
});

test('source conflicts and undocumented surcharges require confirmation, not guessed prices',()=>{
 for(const o of [shade({}, {height:66}),shade({fabricCode:'R06001'},{width:90,height:54}),shade({fabricCode:'R13001'}),shade({fabricCode:'R12001D',model:'room-darkening'}),shade({valance:'painted'}),shade({spacerBlocks:true}),shade({holdDownBrackets:true}),shade({customCordLength:true,cordLength:30}),shade({cordType:'plastic-white'})]){
  assert.equal(price(o).unitPrice,null);assert.ok(price(o).issues.length);
  assert.equal(openingPrice(o,{unitPrices:{ewf:20000},status:'draft'}).unitPrice,24500);
 }
 assert.equal(price(shade({lightBlocker:true})).unitPrice,null);
 assert.throws(()=>validateEwfOpening(shade({lightBlocker:true}),{complete:true}),/light-blocker feet/);
});

test('binder size limits apply to both automatic and manual prices',()=>{
 assert.match(ewfDimensionError('width',24,defaultEwf('motorized')),/25/);
 assert.equal(ewfDimensionError('width',22,{...defaultEwf('motorized'),valance:'square'}),'');
 for(const o of [shade({fabricCode:'R20004'},{width:78.501}),shade({fabricCode:'R05001'},{width:90.501}),shade({fabricCode:'R07001'},{width:110.001}),shade({fabricCode:'R05001D',model:'room-darkening',valance:'square'},{height:86.001})]){
  assert.throws(()=>validateEwfOpening(o),/must be between/);
  assert.equal(openingPrice(o,{unitPrices:{ewf:10000}}).unitPrice,null);
 }
});

test('manual price behavior preserves sold legacy orders, and repeated calculations never compound charges',()=>{
 const o=shade();delete o.pricing;
 const old={status:'ordered',unitPrices:{ewf:20000}};
 assert.equal(openingPrice(o,old).unitPrice,20000);
 const draft={...old,status:'draft'};assert.equal(openingPrice(o,draft).unitPrice,24500);
 const saved={...o,pricing:{...EWF_PRICING}};
 for(let i=0;i<3;i++)assert.equal(openingPrice(saved,{...old}).unitPrice,24500);
 assert.equal(saved.pricing.tariffCents,4500);
});
