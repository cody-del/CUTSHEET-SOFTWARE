import test from 'node:test';
import assert from 'node:assert/strict';
import {calculate,combinedParts} from '../calculations.mjs';
import {formatPrintLength} from '../pdf.mjs';

const opening={name:'Print precision reference',width:34.5,height:58.75,quantity:1,
  left:1,right:0,frame:'TR',frameStyle:'TR',sides:'4S',mount:'I',sizeMethod:'S',
  color:'W',tilt:'Back',stile:'Flat',louver:4,divider:0,notes:''};

test('PRINT SHEET (74) printed targets match without rounding calculated dimensions',()=>{
  const r=calculate(opening),before=structuredClone(r);
  const expected=[['Louvers','729.5'],['Aluminum insert','707.5'],['Stile · flat','1442.3'],
    ['Top rail','731.5'],['Bottom rail','731.5'],['Top frame','876.3'],['Bottom frame','876.3'],
    ['Left frame','1492.3'],['Right frame','1492.3'],['Tiltrod','1175.0']];
  assert.deepEqual(r.parts.map(p=>[p.name,formatPrintLength(p.length)]),expected);
  assert.deepEqual(r.machining.map(m=>formatPrintLength(m.value)),['338.6','364.8','679.6']);
  assert.deepEqual(r.hinges.map(n=>formatPrintLength(n,'mm',{hinge:true})),['46','496','946','1396']);
  assert.equal(formatPrintLength(r.gap),'3.0');
  assert.equal(r.parts.find(p=>p.name==='Stile · flat').length,1442.25);
  assert.deepEqual(r,before);
});

test('printed millimeters round decimal ties like the workbook without rounding ordinary values up',()=>{
  for(const [value,expected]of [[1442.25,'1442.3'],[735.8499999999999,'735.9'],
    [731.5,'731.5'],[729.44,'729.4'],[729.46,'729.5'],[1442.2499,'1442.2'],
    [338.62500000000006,'338.6']])assert.equal(formatPrintLength(value),expected);
  assert.equal(formatPrintLength(450.49999999999994,'mm',{hinge:true}),'451');
});

test('inch printing retains four decimals and exact sizes still control combined grouping',()=>{
  const a=calculate(opening),b=calculate({...opening,name:'Second',height:58.751});
  const stile=r=>r.parts.find(p=>p.name==='Stile · flat');
  assert.notEqual(stile(a).length,stile(b).length);
  assert.equal(formatPrintLength(stile(a).length),formatPrintLength(stile(b).length));
  assert.equal(combinedParts([opening,{...opening,name:'Second',height:58.751}]).filter(p=>p.name==='Stile · flat').length,2);
  for(const value of [1442.25,338.625,46,3.025]){
    assert.equal(formatPrintLength(value,'in'),(value/25.4).toFixed(4));
    assert.equal(formatPrintLength(value,'in',{hinge:true}),(value/25.4).toFixed(4));
  }
});
