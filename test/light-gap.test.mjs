import test from 'node:test';
import assert from 'node:assert/strict';
import {calculate,combinedParts,lightGapWarning} from '../calculations.mjs';
import {createPDF} from '../pdf.mjs';
import {calculationHandler as handler} from '../netlify/functions/api.mjs';

const base={name:'Light gap check',width:36,height:60,quantity:1,left:1,right:1,frame:'TR',louver:4,mount:'I',sizeMethod:'S',sides:'4W',color:'W',tilt:'Back',stile:'Flat',divider:0,notes:''};
const postOpening={...base,width:72,tposts:{construction:'two-piece',positions:[36],sections:[{left:1,right:0},{left:0,right:1}]}};
const request=(path,data)=>new Request(`https://cut-sheets.example/api/${path}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});

test('light gap limits use millimeters before display rounding: 1.9 allowed, 8.0 rejected',()=>{
  for(const gap of [0,1.8,1.89,1.8999])assert.match(lightGapWarning(gap),/below 1.9 mm/);
  for(const gap of [1.9,1.9001,2,7.9,7.9999])assert.equal(lightGapWarning(gap),'');
  for(const gap of [8,8.0001,8.9,9])assert.match(lightGapWarning(gap),/8.0 mm or above/);
  assert.equal(lightGapWarning(1.9-1e-13),'');
  assert.match(lightGapWarning(8-1e-13),/8.0 mm or above/);
});

test('standard and T-post gaps remain visible but invalid gaps cannot become production PDFs',async()=>{
  for(const opening of [base,postOpening])for(const [height,expectedGap,reason]of [[60,1.8,/below 1.9 mm/],[52.5,8.65,/8.0 mm or above/]]){
    const o={...opening,height},result=calculate(o),job={number:'GAP-TEST',customer:'Example',openings:[o]};
    assert.ok(Math.abs(result.gap-expectedGap)<1e-9);
    assert.ok(result.parts.length>0);
    assert.match(result.lightGapWarning,reason);
    assert.ok(result.warnings.includes(result.lightGapWarning));
    assert.throws(()=>combinedParts([o]),reason);
    const response=await handler(request('calculate',o));
    assert.equal(response.status,200);
    assert.match((await response.json()).lightGapWarning,reason);
    for(const units of ['mm','in'])for(const combined of [false,true]){
      await assert.rejects(createPDF(job,{units,combined}),reason);
      const download=await handler(request('pdf',{job,units,combined}));
      assert.equal(download.status,422);
      assert.match((await download.json()).error,reason);
    }
    assert.equal(calculate({...o,height:59.5}).lightGapWarning,'');
  }
});
