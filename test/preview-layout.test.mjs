import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument,decodePDFRawStream} from 'pdf-lib';
import {calculate} from '../calculations.mjs';
import {createPDF,formatPrintLength} from '../pdf.mjs';
import {drawing} from '../public/layouts.js';
import {printedReferences} from './printed-reference-cases.mjs';

const example={...printedReferences[1].opening,name:'Opening 1',width:71,height:63.375,frame:'ZF',sides:'3W',sizeMethod:'W',divider:25};
const large={...printedReferences[2].opening,width:150,height:76.25,divider:30,tposts:{construction:'two-piece',positions:[28,57,89,120],sections:Array.from({length:5},()=>({left:1,right:1}))}};

function pageTextRuns(pdf,page){
  const stream=page.node.Contents().asArray().map(ref=>Buffer.from(decodePDFRawStream(pdf.context.lookup(ref)).decode()).toString()).join('\n');
  return [...stream.matchAll(/BT\n([\s\S]*?)\nET/g)].map(([,block])=>{
    const position=block.match(/1 0 0 1 ([\d.-]+) ([\d.-]+) Tm/),value=block.match(/<([\da-f]+)> Tj/i);
    return {x:Number(position[1]),y:Number(position[2]),text:Buffer.from(value[1],'hex').toString('latin1')};
  });
}

test('a two-section T-post groups like parts in a full-width table, with every cut beside its quantity',async()=>{
  const opening={...printedReferences[2].opening,name:'T-post opening',width:72.5,height:59.125,sides:'4S',divider:0,
    notes:'Width kept exact. Height reduced to meet the light-gap requirement. Post centerline measured from the left. Trim on top and sides, Standard bottom. Keep these panels together for installation and check the room label before assembly.',
    tposts:{construction:'two-piece',positions:[36.5],sections:[{left:1,right:0},{left:0,right:1}]}};
  const result=calculate(opening);
  for(const units of ['mm','in']){
    const pdf=await PDFDocument.load(await createPDF({number:'PRINT-LAYOUT',openings:[opening]},{units}));
    assert.equal(pdf.getPageCount(),1);
    const runs=pageTextRuns(pdf,pdf.getPage(0));
    assert.equal(runs.filter(r=>r.text==='PART / PROFILE').length,1,'one full-width parts table');
    const qty=runs.find(r=>r.text==='QTY'),cut=runs.find(r=>r.text===`SIZE (${units})`),end=runs.find(r=>r.text===`MACHINING (${units})`);
    const expectedOrder=['Louvers - Section 1','Louvers - Section 2','Stile flat','Top rail - Section 1','Top rail - Section 2','Bottom rail - Section 1','Bottom rail - Section 2','Top frame','Bottom frame','Left frame','Right frame','T-post assembly','Tiltrod'];
    const names=expectedOrder.map(label=>runs.find(r=>r.text===label));
    assert.ok(names.every(Boolean),'every part is printed with an explicit section where needed');
    assert.equal(names.length,result.parts.length,'no cuts are merged or dropped');
    names.forEach((name,i)=>{
      const p=result.parts.find(p=>p.name.replace(' · ',' ')+(p.section?` - Section ${p.section}`:'')===name.text);
      const bottom=names[i+1]?.y??end.y;
      assert.equal(name.x,names[0].x,'all rows read down the same column');
      assert.ok(name.y>bottom,'louvers, stiles and each rail type stay grouped');
      for(const [header,value]of [[qty,String(p.quantity)],[cut,formatPrintLength(p.length,units)]]){
        assert.ok(runs.some(r=>r.x===header.x&&r.y<=name.y+1&&r.y>bottom&&r.text===value),`${name.text}: ${header.text} ${value}`);
      }
      assert.ok(runs.some(r=>r.text===p.profile&&r.y<=name.y+1&&r.y>bottom),`${name.text}: profile retained`);
    });
    assert.equal(runs.filter(r=>r.text==='WHOLE DISTANCE').length,result.parts.filter(p=>p.name.startsWith('Stile')).length);
    const holeLabel=runs.find(r=>r.text==='WHOLE DISTANCE'),holeValue=runs.find(r=>r.x===holeLabel.x&&r.y<holeLabel.y&&r.text.endsWith(` ${units}`));
    assert.ok(holeValue&&holeLabel.y-holeValue.y===12,'whole distance uses a compact two-line label');
    assert.ok(runs.some(r=>r.y===holeValue.y&&r.text==='from top'),'drilling reference stays with its value');
    assert.ok(runs.some(r=>r.text==='Hinged / complete'));
  }
});

test('the divider example renders nine louvers above and six below, inside the stiles',()=>{
  const result=calculate(example),scene=drawing(example,{louverLayout:result.louverLayout});
  assert.equal(result.louverLayout.top,9);assert.equal(result.louverLayout.bottom,6);
  assert.equal(result.parts.find(p=>p.name==='Louvers').quantity,30);
  for(const leaf of scene.leaves){
    assert.equal(leaf.louvers.filter(l=>l.group==='top').length,9);
    assert.equal(leaf.louvers.filter(l=>l.group==='bottom').length,6);
  }
  const rails=scene.shapes.filter(s=>s.role==='divider');assert.equal(rails.length,2);
  rails.forEach((rail,i)=>{
    const leaf=scene.leaves[i],xs=rail.points.map(p=>p[0]);
    assert.ok(Math.min(...xs)>Math.min(leaf.x1,leaf.x2));
    assert.ok(Math.max(...xs)<Math.max(leaf.x1,leaf.x2));
    assert.ok(Math.abs(Math.max(...xs)-Math.min(...xs)-Math.abs(leaf.x2-leaf.x1)*.8)<1e-9);
    // No drawn louver crosses the divider's top or bottom edge, including perspective.
    for(const l of leaf.louvers)for(const edge of [0,1]){
      if(l.group==='top')assert.ok(l.points[3-edge][1]<rail.points[edge][1]);
      else assert.ok(l.points[edge][1]>rail.points[3-edge][1]);
    }
  });
});

test('louver preview counts track source totals for standard, divided, split and T-post panels',()=>{
  for(const base of [example,large,...printedReferences.map(r=>r.opening)])for(const divider of [0,base.height/2])for(const divisionMode of ['divider','split']){
    const o={...base,divider,divisionMode},r=calculate(o),scene=drawing(o,{louverLayout:r.louverLayout});
    assert.equal(r.louverLayout.total,r.louversPerPanel);
    scene.leaves.forEach(l=>assert.equal(l.louvers.length,r.louversPerPanel));
    assert.equal(r.parts.filter(p=>p.name==='Louvers').reduce((n,p)=>n+p.quantity,0),scene.leaves.length*r.louversPerPanel*o.quantity);
    assert.equal(scene.shapes.filter(s=>s.role==='divider').length,divider&&divisionMode==='divider'?scene.leaves.length:0);
  }
});

test('all four references, the divider example, and a five-section opening fit one page each',async()=>{
  const openings=[...printedReferences.map(r=>r.opening),{...example,height:63.4},large];
  for(const units of ['mm','in']){
    const pdf=await PDFDocument.load(await createPDF({number:'LAYOUT-TEST',customer:'',openings},{units}));
    assert.equal(pdf.getPageCount(),openings.length);
    pdf.getPages().forEach(p=>assert.deepEqual(p.getSize(),{width:612,height:792}));
  }
});

test('expanded parts lists leave room for notes and the checklist with one through four T-posts',async()=>{
  const openings=Array.from({length:4},(_,i)=>{
    const sections=i+2;
    return {...large,name:`Opening with ${i+1} T-posts`,width:sections*30,tilt:i%2?'Front':'Back',
      notes:'Keep these panels together for installation. Check the room label before moving them to assembly.',
      tposts:{construction:'two-piece',positions:Array.from({length:i+1},(_,n)=>(n+1)*30),sections:Array.from({length:sections},()=>({left:1,right:1}))}};
  });
  for(const units of ['mm','in']){
    const pdf=await PDFDocument.load(await createPDF({number:'LAYOUT-NOTES',customer:'Example customer and installation address with enough detail to wrap onto a second header line for this layout check',openings},{units}));
    assert.equal(pdf.getPageCount(),openings.length);
    pdf.getPages().forEach((page,i)=>{
      const runs=pageTextRuns(pdf,page),louvers=runs.filter(r=>/^Louvers - Section /.test(r.text)),stiles=runs.filter(r=>/^Stile (regular|flat)$/.test(r.text));
      assert.equal(louvers.length,i+2);
      assert.equal(new Set(louvers.map(r=>r.x)).size,1,'all louvers stay in the same column');
      assert.equal(stiles.length,2);
      assert.equal(new Set(stiles.map(r=>r.x)).size,1,'flat and regular stiles stay together');
      const labels=runs.filter(r=>r.text==='WHOLE DISTANCE');
      assert.equal(labels.length,stiles.length,'both stile profiles retain their drilling box');
    });
  }
});
