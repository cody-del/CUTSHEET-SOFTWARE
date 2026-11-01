import test from 'node:test';
import assert from 'node:assert/strict';
import {EWF_ID,defaultEwf,normalizeEwf,ewfDimensionError,validateEwfOpening,ewfDetails} from '../public/elegant.js';
import {openingPrice} from '../public/quote-pricing.js';
import {nextQuoteLine} from '../public/quote-line-defaults.js';
import {supportsCutSheets,manufacturingOpenings,productName} from '../public/products.js';

test('EWF normalizes only active control options without retaining hidden motor or chain selections',()=>{
 const motor=normalizeEwf({...defaultEwf(),operation:'motorized',cordType:'metal',customCordLength:true,cordLength:30,remote:'multi',wifi:'hub',wandLength:'4',usb10:true});
 assert.equal(motor.cordType,undefined);assert.equal(motor.cordLength,undefined);assert.equal(motor.controlPosition,undefined);
 assert.equal(motor.remote,'multi');assert.equal(motor.wifi,'hub');assert.equal(motor.wandLength,'4');assert.equal(motor.usb10,true);
 const clutch=normalizeEwf({...motor,operation:'clutch'});
 for(const key of ['remote','wifi','wandLength','usb10','valanceColor'])assert.equal(clutch[key],undefined);
 assert.equal(clutch.cordType,'regular');assert.equal(clutch.controlPosition,'right');
 assert.throws(()=>normalizeEwf({operation:'unknown'}));assert.throws(()=>normalizeEwf({cordType:'made-up'}));
 assert.throws(()=>normalizeEwf({lightBlocker:'false'}));
});

test('screenshot dimensions allow decimals and enforce separate clutch and motor minimum widths',()=>{
 for(const [mode,min]of [['clutch',8],['motorized',22]]){
  const ewf=defaultEwf(mode);
  for(const value of [min,51.875,116])assert.equal(ewfDimensionError('width',value,ewf),'');
  for(const value of [min-.001,116.001,NaN])assert.ok(ewfDimensionError('width',value,ewf));
  for(const value of [11,36.58,144])assert.equal(ewfDimensionError('height',value,ewf),'');
  for(const value of [10.999,144.001])assert.ok(ewfDimensionError('height',value,ewf));
 }
 assert.equal(ewfDimensionError('width',null,defaultEwf()),'');
});

test('drafts can omit fabric and custom length, but completed EWF orders require both',()=>{
 const opening={width:36,height:60,ewf:{...defaultEwf(),customCordLength:true}};
 assert.doesNotThrow(()=>validateEwfOpening(opening));
 assert.throws(()=>validateEwfOpening(opening,{complete:true}),/fabric color/);
 opening.ewf.colorNumber='LF-123';
 assert.throws(()=>validateEwfOpening(opening,{complete:true}),/custom cord length/);
 opening.ewf.cordLength=32.625;assert.equal(validateEwfOpening(opening,{complete:true}).cordLength,32.625);
 assert.equal(normalizeEwf({...opening.ewf,customCordLength:false}).cordLength,null);
});

test('new EWF lines retain product choices while clearing room, dimensions and opening-specific cord length',()=>{
 const previous={id:'old',productId:EWF_ID,name:'Kitchen',width:36,height:60,quantity:2,notes:'Kitchen only',ewf:{...defaultEwf(),colorName:'White',colorNumber:'123',cordType:'metal',customCordLength:true,cordLength:36,windowLocation:'South'}};
 const next=nextQuoteLine(previous,{}, {id:'new',name:'Opening 2'});
 assert.equal(next.productId,EWF_ID);assert.equal(next.name,'Opening 2');assert.equal(next.width,null);assert.equal(next.height,null);assert.equal(next.quantity,1);assert.equal(next.notes,'');
 assert.equal(next.ewf.colorName,'White');assert.equal(next.ewf.cordType,'metal');assert.equal(next.ewf.cordLength,null);assert.equal(next.ewf.windowLocation,'');
 assert.equal(previous.ewf.windowLocation,'South');
});

test('EWF never borrows square-foot rates or manufactures cut sheets',()=>{
 const line={id:'shade',productId:EWF_ID,width:51.875,height:36.58,quantity:2,pricing:{rateCents:9999,minimumAreaHundredths:2000}};
 const quote={productId:'shuttersmart',pricing:{rateCents:2500},unitPrices:{},openings:[line,{id:'smart',productId:'shuttersmart'}]};
 assert.equal(openingPrice(line,quote).unitPrice,null);
 quote.unitPrices.shade=12345;assert.equal(openingPrice(line,quote).lineTotal,24690);
 assert.equal(supportsCutSheets(line),false);assert.deepEqual(manufacturingOpenings(quote).map(o=>o.id),['smart']);
 assert.ok(!productName(line).includes('Asia'));
});

test('supplier option summaries preserve model-to-accessories order and omit inactive controls',()=>{
 const lines=ewfDetails({ewf:{...defaultEwf('motorized'),colorName:'Linen',colorNumber:'100',remote:'multi',wandColor:'black',wifi:'hub',windowLocation:'East',usb6:true}});
 const text=lines.join('\n');
 for(const value of ['Linen / 100','Multi channel','Black','Wi-Fi hub','USB 6\' cable with charger: Yes','Window location: East'])assert.ok(text.includes(value));
 assert.ok(lines.findIndex(v=>v.startsWith('Remote:'))<lines.findIndex(v=>v.startsWith('Valance:')));
 assert.ok(!text.includes('Standard cord loop'));assert.ok(!text.includes('Asia'));
});
