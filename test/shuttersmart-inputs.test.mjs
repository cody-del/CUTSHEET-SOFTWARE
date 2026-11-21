import test from 'node:test';
import assert from 'node:assert/strict';
import {SHUTTER_FRACTIONS,createShutterChoiceHistory,shutterMeasurementParts,selectShutterFraction,shutterMeasurementLabel,shutterFrameArrangement,applyShutterFrameArrangement} from '../public/shuttersmart-inputs.js';
import {parseMeasurement} from '../public/measurements.js';
import {calculate} from '../calculations.mjs';
import {frameCuttingPlan,frameStyle} from '../public/frames.js';

const opening={id:'test',name:'Test',width:36.25,height:59.5,quantity:1,left:1,right:1,louver:4,frame:'TR',sides:'4W',mount:'I',sizeMethod:'S',color:'W',tilt:'Back',stile:'Flat',divider:0,notes:''};
test('whole inches and eighth choices retain exact cut sizes through an edit round trip',()=>{
 for(const width of [23,31.125,31.25,36.125,36.25,51.875,36.58,35.0625]){
  const actual=parseMeasurement(shutterMeasurementLabel(width));
  assert.equal(actual,width);
  assert.deepEqual(calculate({...opening,width:actual}),calculate({...opening,width}));
 }
 assert.equal(shutterMeasurementLabel(1.125),'1 1/8');
 assert.equal(shutterMeasurementLabel(1.25),'1 1/4');
 assert.equal(SHUTTER_FRACTIONS.length,8);
});
test('fraction buttons replace the fraction in the full measurement without accumulating it',()=>{
 assert.equal(selectShutterFraction('36',2),'36 1/4');
 assert.equal(selectShutterFraction('36 1/4',2),'36 1/4');
 assert.equal(selectShutterFraction('36 1/4',1),'36 1/8');
 assert.equal(selectShutterFraction('36 1/8',0),'36');
 assert.equal(selectShutterFraction('51.875',2),'51 1/4');
 assert.equal(selectShutterFraction('',1),'0 1/8');
 assert.throws(()=>selectShutterFraction('bad',1));
 assert.throws(()=>selectShutterFraction('12',8));
 for(let f=0;f<8;f++){
  const value=selectShutterFraction('36 7/8',f);
  assert.equal(parseMeasurement(value),36+f/8);
  assert.equal(selectShutterFraction(value,f),value);
 }
 assert.deepEqual(shutterMeasurementParts(625/25.4,'mm'),{whole:'625',fraction:0});
 assert.equal(shutterMeasurementLabel(625/25.4,'mm'),'625');
});
test('three frame buttons keep existing cutting rules and Standard on four sides',()=>{
 const bottom=applyShutterFrameArrangement(opening,'bottom');
 assert.equal(bottom.sides,'4S');
 assert.deepEqual(frameCuttingPlan(bottom).sides,{top:'TR',bottom:'ST',left:'TR',right:'TR'});
 const standard=applyShutterFrameArrangement(bottom,'standard');
 assert.equal(standard.sides,'4W');assert.equal(standard.frame,'ST');
 assert.deepEqual(frameCuttingPlan(standard).sides,{top:'ST',bottom:'ST',left:'ST',right:'ST'});
 const all=applyShutterFrameArrangement(standard,'all','MZ');
 assert.equal(all.frame,'ZF');assert.equal(all.frameStyle,'MZ');assert.equal(all.sides,'4W');
 assert.equal(shutterFrameArrangement(all),'all');assert.equal(shutterFrameArrangement(bottom),'bottom');assert.equal(shutterFrameArrangement(standard),'standard');
 assert.equal(frameStyle(applyShutterFrameArrangement({...opening,frame:'ST',frameStyle:'MS'},'standard')).id,'MS');
 assert.deepEqual(opening,{id:'test',name:'Test',width:36.25,height:59.5,quantity:1,left:1,right:1,louver:4,frame:'TR',sides:'4W',mount:'I',sizeMethod:'S',color:'W',tilt:'Back',stile:'Flat',divider:0,notes:''});
});
test('saved custom sides remain custom until a replacement is explicitly selected',()=>{
 const custom={...opening,sides:'CW',frameSides:{top:'ST',bottom:'ST',left:'TR',right:'TR'}};
 assert.equal(shutterFrameArrangement(custom),'custom');
 const next=applyShutterFrameArrangement(custom,'standard');
 assert.equal(next.frameSides,undefined);assert.equal(next.sides,'4W');
 assert.equal(custom.sides,'CW');assert.equal(custom.frameSides.left,'TR');
});

test('custom starts from current side profiles and preserves the resulting cut sizes',()=>{
 const bottom={...opening,sides:'4S'};
 const custom=applyShutterFrameArrangement(bottom,'custom');
 assert.equal(custom.sides,'CW');
 assert.deepEqual(custom.frameSides,{top:'TR',bottom:'ST',left:'TR',right:'TR'});
 assert.deepEqual(calculate(custom).parts,calculate(bottom).parts);
 const mixed={...custom,frame:'ZF',frameSides:{top:'ST',bottom:'ST',left:'ZF',right:'ST'}};
 const result=calculate(mixed);
 assert.notEqual(result.status,'preview-only');
 assert.deepEqual(result.parts.filter(p=>/frame$/.test(p.name)).map(p=>p.profile),['TOP STD','BOTTOM STD','LEFT ZFR','RIGHT STD']);
 const again=applyShutterFrameArrangement(mixed,'custom');
 assert.deepEqual(again.frameSides,mixed.frameSides);
 again.frameSides.left='ST';assert.equal(mixed.frameSides.left,'ZF');
});

test('first choices are independent per opening and field, and survive reloads',()=>{
 let stored=null;const storage={getItem:()=>stored,setItem:(key,value)=>stored=value};
 const history=createShutterChoiceHistory(storage);
 assert.equal(history.has('quote:one','panel-count'),false);
 history.remember('quote:one','panel-count');
 assert.equal(history.has('quote:one','panel-count'),true);
 assert.equal(history.has('quote:one','panel-layout'),false);
 assert.equal(history.has('quote:two','panel-count'),false);
 history.remember('quote:one','panel-layout');
 const reloaded=createShutterChoiceHistory(storage);
 assert.equal(reloaded.has('quote:one','panel-count'),true);
 assert.equal(reloaded.has('quote:one','panel-layout'),true);
 assert.equal(reloaded.has('quote:two','panel-layout'),false);
 reloaded.remember('quote:one','frame-side-top');
 assert.equal(reloaded.has('quote:one','frame-side-bottom'),false);
});

test('choice tracking still works when browser storage is unavailable or invalid',()=>{
 for(const storage of [{getItem:()=>'{bad',setItem:()=>{}},{getItem:()=>{throw Error();},setItem:()=>{throw Error();}}]){
  const history=createShutterChoiceHistory(storage);
  history.remember('one','tilt');assert.equal(history.has('one','tilt'),true);
 }
});
