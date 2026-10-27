import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {WorkbookEngine,parse} from '../engine.mjs';
import {calculate,combinedParts} from '../calculations.mjs';
import {createPDF} from '../pdf.mjs';
import {PDFDocument} from 'pdf-lib';
const base={name:'Test opening',width:36,height:59.75,quantity:1,left:1,right:1,frame:'ST',louver:4,mount:'I',sizeMethod:'W',sides:'4W',color:'W',tilt:'Smart',stile:'Flat',divider:0,notes:''};
test('formula engine handles conditional errors, ranges, blank cells, comparisons and rounding',()=>{
 const e=new WorkbookEngine({Sheet:{A1:4,A2:5,B1:'=SUM(A1:A2)',B2:'=IF(A1=4,7,1/0)',B3:'=IF(A9=0,TRUE,FALSE)',B4:'=ROUNDUP(-2.11,1)',B5:'=MOD(-3,2)',B6:'=INT(-2.1)',B7:'=EVEN(3)',B8:'=IF("abc"="ABC",1,0)'}});
 for(const[c,v]of Object.entries({B1:9,B2:7,B3:true,B4:-2.2,B5:1,B6:-3,B7:4,B8:1}))assert.equal(e.cell('Sheet',c),v);
 assert.throws(()=>parse('=UNSUPPORTED[abc]'));
 assert.throws(()=>new WorkbookEngine({S:{A1:'=A1'}}).cell('S','A1'),/Circular/);
});
test('retained original formulas agree with finite values saved by Google Sheets',()=>{
 const w=JSON.parse(fs.readFileSync(new URL('../source/workbook.json',import.meta.url))),fixtures=JSON.parse(fs.readFileSync(new URL('./source-baseline.json',import.meta.url))),e=new WorkbookEngine(w);
 for(const {sheet,cell,expected}of fixtures){const actual=e.cell(sheet,cell);if(typeof expected==='number')assert.ok(Math.abs((actual??0)-expected)<1e-7,`${sheet}!${cell}: ${actual} != ${expected}`);else assert.equal(actual,expected,`${sheet}!${cell}`);}
 assert.ok(fixtures.length>300);console.log(`Matched ${fixtures.length} finite source snapshot values; this is not production-order validation.`);
});
test('quantity scales counts, leaves lengths unchanged, and exact sizes determine grouping',()=>{
 const one=calculate(base),three=calculate({...base,quantity:3});assert.equal(one.parts.length,three.parts.length);
 one.parts.forEach((p,i)=>{assert.equal(three.parts[i].length,p.length);assert.equal(three.parts[i].quantity,p.quantity*3);});
 const grouped=combinedParts([base,{...base,name:'Second'}]);assert.equal(grouped.length,one.parts.length);grouped.forEach(p=>assert.equal(p.quantity,one.parts.find(q=>q.name===p.name).quantity*2));
 assert.ok(combinedParts([base,{...base,width:36.0001}]).length>one.parts.length);
 assert.ok(combinedParts([base,{...base,color:'OW'}]).length>one.parts.length);
});
test('unit conversion and workbook dimensional relationships remain exact',()=>{
 const a=calculate(base),b=calculate({...base,width:base.width+1});const part=(r,n)=>r.parts.find(p=>p.name===n);
 assert.ok(Math.abs(part(b,'Louvers').length-part(a,'Louvers').length-12.7)<1e-8);
 assert.ok(Math.abs(part(a,'Top rail').length-part(a,'Louvers').length-23)<1e-8);
 assert.equal(part(a,'Top rail').perUnit,base.left+base.right);
 assert.equal(a.parts.filter(p=>p.name.startsWith('Stile')).reduce((n,p)=>n+p.perUnit,0),4);
});
test('bad inputs, unsupported options, and workbook warnings cannot generate cuts',async()=>{
 for(const patch of [{width:0},{height:NaN},{quantity:0},{quantity:1.2},{left:-1},{frame:'UNKNOWN'},{left:2,right:3},{color:'unsupported'},{divider:60},{mount:'I',sizeMethod:'F'}])assert.throws(()=>calculate({...base,...patch}));
 const tooWide={...base,width:100,left:1,right:0};assert.ok(calculate(tooWide).warnings.length);
 await assert.rejects(createPDF({number:'T',customer:'Test',openings:[tooWide]}));
});
test('648 representative combinations either calculate valid parts or expose workbook warnings',()=>{
 let allowed=0,blocked=0;
 for(const frame of ['ST','DS','EX','ZF','TR','HS'])for(const width of [24,36,48])for(const height of [36,60,72])for(const louver of [3,4])for(const [left,right]of [[1,0],[1,1],[2,2]])for(const divider of [0,height/2]){
  const r=calculate({...base,frame,width,height,louver,left,right,divider});if(r.warnings.some(w=>w!==r.lightGapWarning)){blocked++;continue;}allowed++;for(const p of r.parts){assert.ok(p.length>0&&Number.isFinite(p.length));assert.ok(p.quantity>0&&Number.isInteger(p.quantity));}
 }
 assert.equal(allowed+blocked,648);assert.ok(allowed>300);assert.ok(blocked>0);
});
test('ordinary openings fit one Letter page each; long notes and combined references paginate',async()=>{
 const j={number:'TEST-001',customer:'Example',openings:[base,{...base,name:'Second',height:72.5}]};
 const pdf=await PDFDocument.load(await createPDF(j));assert.equal(pdf.getPageCount(),2);assert.equal(pdf.getPage(0).getWidth(),612);assert.equal(pdf.getPage(0).getHeight(),792);
 const long=await PDFDocument.load(await createPDF({...j,openings:[{...base,notes:'Assembly note\n'.repeat(70)}]}));assert.ok(long.getPageCount()>1);
 const combined=await PDFDocument.load(await createPDF({...j,openings:Array.from({length:50},(_,i)=>({...base,name:`Opening ${i+1} with a lengthy room name`}))},{combined:true}));assert.ok(combined.getPageCount()>1);
});

test('all fourteen panel arrangements preserve equal sizing and rail/stile quantities',async()=>{
 for(const n of [1,2,3,4]){
  const reference=calculate({...base,left:n,right:0,width:24*n});
  for(let left=0;left<=n;left++){
   const o={...base,left,right:n-left,width:24*n},r=calculate(o);
   assert.deepEqual(r.warnings,[],`${left}L ${n-left}R`);
   assert.equal(r.panelWidth,reference.panelWidth);
   assert.equal(r.parts.find(p=>p.name==='Top rail').perUnit,n);
   assert.equal(r.parts.filter(p=>p.name.startsWith('Stile')).reduce((sum,p)=>sum+p.perUnit,0),n*2);
   for(const p of r.parts){assert.ok(Number.isFinite(p.length)&&p.length>0);assert.ok(Number.isInteger(p.quantity)&&p.quantity>0);}
   const pdf=await PDFDocument.load(await createPDF({number:'PANEL-TEST',customer:'Example',openings:[o]}));
   assert.equal(pdf.getPageCount(),1);assert.equal(pdf.getAuthor(),'Cut sheet');
  }
 }
});

const tpostBase={...base,width:48,tposts:{construction:'two-piece',positions:[24],sections:[{left:1,right:0},{left:0,right:1}]}};
test('T-post section sizes use the source deductions and react independently to centerline movement',()=>{
 const r=calculate(tpostBase);assert.deepEqual(r.warnings,[]);assert.equal(r.sections.length,2);
 // Independent source deductions for a 48 x 59.75 opening, standard inside frame, Smart tilt.
 // Opening deduction 1/8 inch; outer frame 25 mm; half post 23 mm; stiles 81 mm;
 // inter-panel allowance 2 mm. Louver cut subtracts 2 x 11.5 mm from rail cut.
 const expectedRail=(24-0.125/2)*25.4-25-23-81-2;
 for(const section of r.sections){assert.ok(Math.abs(section.railLength-expectedRail)<1e-8);assert.ok(Math.abs(section.louverLength-(expectedRail-23))<1e-8);}
 const moved=calculate({...tpostBase,tposts:{...tpostBase.tposts,positions:[25]}});
 assert.ok(Math.abs(moved.sections[0].louverLength-r.sections[0].louverLength-25.4)<1e-8);
 assert.ok(Math.abs(moved.sections[1].louverLength-r.sections[1].louverLength+25.4)<1e-8);
 const one=calculate({...tpostBase,tposts:{...tpostBase.tposts,construction:'one-piece'}});
 assert.ok(Math.abs(one.sections[0].railLength-r.sections[0].railLength-11.5)<1e-8);
 assert.equal(one.parts.find(p=>p.name==='T-post').profile,'T POST');
});
test('T-post quantities scale once and combined lists retain section references',()=>{
 const r=calculate(tpostBase),triple=calculate({...tpostBase,quantity:3});
 r.parts.forEach((p,i)=>{assert.equal(triple.parts[i].quantity,p.quantity*3);assert.equal(triple.parts[i].length,p.length);});
 const grouped=combinedParts([tpostBase]);const louver=grouped.find(p=>p.name==='Louvers');
 assert.equal(louver.quantity,30);assert.equal(louver.openings.length,2);assert.match(louver.openings[1].name,/section 2/);
 const unequal=combinedParts([{...tpostBase,tposts:{...tpostBase.tposts,positions:[22]}}]);assert.equal(unequal.filter(p=>p.name==='Louvers').length,2);
 const before=calculate(base);calculate(tpostBase);assert.deepEqual(calculate(base),before);
});
test('invalid T-post structures and geometry are rejected, including PDF generation',async()=>{
 for(const patch of [{positions:[]},{positions:[0]},{positions:[48]},{positions:[NaN]},{positions:['24']},{positions:[30,20],sections:[{left:1,right:0},{left:1,right:0},{left:1,right:0}]},{sections:[]},{sections:[null,null]},{sections:[{left:3,right:1},{left:1,right:0}]},{construction:'unknown'}]){
  const o={...tpostBase,tposts:{...tpostBase.tposts,...patch}};
  assert.throws(()=>calculate(o));await assert.rejects(createPDF({number:'BAD',openings:[o]}));
 }
 const narrow={...tpostBase,tposts:{...tpostBase.tposts,positions:[1]}};assert.throws(()=>calculate(narrow));
});
test('T-post matrix covers 1–4 posts, both constructions, frames, tilts, and divider rails',()=>{
 let valid=0,warned=0;
 for(const n of [1,2,3,4])for(const construction of ['one-piece','two-piece'])for(const frame of ['ST','DS','EX','ZF','TR','HS'])for(const tilt of ['Smart','Front','Back'])for(const divider of [0,30]){
  const o={...base,frame,tilt,divider,width:(n+1)*20,tposts:{construction,positions:Array.from({length:n},(_,i)=>(i+1)*20),sections:Array.from({length:n+1},()=>({left:1,right:0}))}};
  const r=calculate(o);if(r.warnings.some(w=>w!==r.lightGapWarning)){warned++;continue;}valid++;
  assert.equal(r.sections.length,n+1);assert.equal(r.parts.find(p=>p.name.startsWith('T-post')).quantity,n);
  assert.equal(r.parts.filter(p=>p.name.startsWith('Stile')).reduce((sum,p)=>sum+p.quantity,0),(n+1)*2);
  assert.equal(r.parts.filter(p=>p.name==='Top rail').reduce((sum,p)=>sum+p.quantity,0),n+1);
  assert.equal(r.parts.filter(p=>p.name==='Divider rail').length,divider?n+1:0);
  for(const p of r.parts){assert.ok(Number.isFinite(p.length)&&p.length>0);assert.ok(Number.isInteger(p.quantity)&&p.quantity>0);}
 }
 assert.equal(valid+warned,288);assert.ok(valid>150);assert.ok(warned>0);
});
test('T-post opening and combined PDFs paginate the extended cutting lists',async()=>{
 const large={...base,width:100,tposts:{construction:'two-piece',positions:[20,40,60,80],sections:Array.from({length:5},()=>({left:1,right:0}))}};
 for(const o of [tpostBase,large])for(const combined of [false,true]){
  const pdf=await PDFDocument.load(await createPDF({number:'TPOST-001',customer:'Example',openings:[o]},{combined}));
  assert.ok(pdf.getPageCount()>=1);for(const page of pdf.getPages())assert.deepEqual(page.getSize(),{width:612,height:792});
 }
});

test('reference folding layouts include LLR/LRR and restart hinges at T-posts',async()=>{
 const {STANDARD_LAYOUTS,TPOST_LAYOUTS,drawing}=await import('../public/layouts.js');
 const codes=Object.values(STANDARD_LAYOUTS).flat().map(([,code])=>code);
 assert.deepEqual(new Set(codes),new Set(['L','R','LL','LR','RR','LLR','LRR','LLRR']));assert.ok(!codes.includes('RRLL'));
 for(const [left,right]of [[2,1],[1,2]]){
  const o={...base,left,right,width:72},r=calculate(o),scene=drawing(o);
  assert.deepEqual(r.warnings,[]);assert.equal(r.parts.find(p=>p.name==='Top rail').quantity,3);
  assert.equal(scene.leaves.filter(p=>p.hingeSide==='left').length,left);assert.equal(scene.leaves.filter(p=>p.hingeSide==='right').length,right);
  assert.equal(scene.leaves.filter(p=>p.hinge).length,2);
 }
 for(const preset of TPOST_LAYOUTS){
  const o={...base,width:96,tposts:{construction:'two-piece',positions:preset.fractions.map(f=>f*96),sections:preset.sections}},r=calculate(o),scene=drawing(o);
  assert.deepEqual(r.warnings,[]);assert.equal(scene.posts.length,preset.fractions.length);const panels=preset.sections.reduce((n,s)=>n+s.left+s.right,0);assert.equal(scene.leaves.length,panels);assert.equal(scene.leaves.filter(p=>p.hinge).length,panels);
  assert.equal(r.parts.filter(p=>p.name==='Top rail').reduce((n,p)=>n+p.quantity,0),panels);
  const pdf=await PDFDocument.load(await createPDF({number:'REFERENCE',customer:'Example',openings:[o]}));assert.ok(pdf.getPageCount()>0);
 }
});

test('long T-post previews preserve proportions and keep all folds inside their SVG bounds',async()=>{
 const {drawing}=await import('../public/layouts.js');
 for(const width of [110,180,240]){
  const o={...tpostBase,width,height:76,tposts:{construction:'two-piece',positions:[width/3,width*2/3],sections:Array.from({length:3},()=>({left:1,right:1}))}},scene=drawing(o);
  assert.ok(Math.abs(scene.bounds.width/scene.bounds.height-width/76)<1e-10);
  assert.equal(scene.leaves.length,6);assert.equal(scene.posts.length,2);
  for(const shape of scene.shapes)for(const [x,y]of shape.kind==='polygon'?shape.points:[shape.a,shape.b]){assert.ok(Number.isFinite(x)&&x>=0&&x<=scene.width);assert.ok(Number.isFinite(y)&&y>=0&&y<=scene.height);}
 }
});
test('T-post openings over 106 inches use source panel and frame limits',async()=>{
 const o={...tpostBase,width:110,height:76.25,tposts:{construction:'two-piece',positions:[110/3,220/3],sections:Array.from({length:3},()=>({left:1,right:1}))}};
 assert.deepEqual(calculate(o).warnings,[]);
 const pdf=await PDFDocument.load(await createPDF({number:'WIDE',customer:'Example',openings:[o]}));assert.ok(pdf.getPageCount()>0);
 assert.throws(()=>calculate({...base,width:110}));
 const tooWide={...o,width:240,tposts:{...o.tposts,positions:[80,160]}};
 assert.ok(calculate(tooWide).warnings.includes('TOO WIDE PANEL ! ! !'));
 await assert.rejects(createPDF({number:'WIDE',customer:'Example',openings:[tooWide]}));
});

 test('repeated LR configurations cover two through five sections with distinct post and section cuts',async()=>{
 const {TPOST_LAYOUTS,drawing,drawingSVG}=await import('../public/layouts.js');
 for(const count of [2,3,4,5]){
  const preset=TPOST_LAYOUTS.find(p=>p.sections.length===count&&p.sections.every(s=>s.left===1&&s.right===1));
  assert.ok(preset,`Missing ${count}-section LR preset`);
  const o={...base,width:count*30,tposts:{construction:'two-piece',positions:preset.fractions.map(f=>f*count*30),sections:preset.sections}};
  const r=calculate(o),scene=drawing(o);assert.deepEqual(r.warnings,[]);assert.equal(r.sections.length,count);
  assert.equal(r.parts.find(p=>p.name.startsWith('T-post')).quantity,count-1);
  assert.equal(scene.posts.length,count-1);assert.equal(scene.leaves.length,count*2);
  for(let section=1;section<=count;section++){
   assert.equal(scene.leaves.filter(l=>l.section===section).length,2);
   assert.ok(r.parts.some(p=>p.section===section&&p.name==='Top rail'));
  }
  assert.ok(drawingSVG(o).includes(Array(count).fill('LR').join(' | T | ')));
  for(const shape of scene.shapes)for(const [x,y]of shape.kind==='polygon'?shape.points:[shape.a,shape.b]){assert.ok(x>=0&&x<=scene.width);assert.ok(y>=0&&y<=scene.height);}
  const pdf=await PDFDocument.load(await createPDF({number:'MULTI-POST',openings:[o]}));assert.ok(pdf.getPageCount()>0);
 }
});

test('frame appearances stay distinct, fit the preview, and respect three-sided frames',async()=>{
 const {FRAME_STYLES,frameShapes}=await import('../public/frames.js');
 const {drawing}=await import('../public/layouts.js');
 const signatures=new Set();
 for(const frame of FRAME_STYLES){
  const o={...base,frame:frame.profile||'ST',...(frame.id===frame.profile?{}:{frameStyle:frame.id})};
  const shapes=frameShapes(o,{left:22,top:28,width:214,height:120});signatures.add(JSON.stringify(shapes));
  for(const width of [36,150]){
   const scene=drawing({...o,width});
   for(const shape of scene.shapes)for(const [x,y]of shape.kind==='polygon'?shape.points:[shape.a,shape.b])assert.ok(Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&x<=scene.width&&y>=0&&y<=scene.height);
  }
  const three=frameShapes({...o,sides:'3W'},{left:22,top:28,width:214,height:120});
  assert.ok(three.every(s=>s.points.every(([,y])=>y<=148)));
  assert.equal(three.length,frame.bands.length*(frame.id==='HS'?2:3));
 }
 assert.equal(signatures.size,FRAME_STYLES.length);
});
test('confirmed modern and Elegance styles use the exact base cutting rules and generate PDFs',async()=>{
 for(const [frameStyle,frame]of [['MS','ST'],['MZ','ZF'],['EL','ZF']]){
  for(const source of [base,tpostBase]){
   const o={...source,frameStyle},expected=calculate({...source,frame}),actual=calculate(o);
   assert.deepEqual(actual,expected);
   assert.equal(o.frame,source.frame,'calculation does not mutate a saved record');
   // Compare valid shutter-size examples so manufacturing warnings still block unsafe PDFs.
   const printable={...o,sizeMethod:'S',height:59.5};
   assert.deepEqual(calculate(printable).warnings,[]);
   const pdf=await PDFDocument.load(await createPDF({number:'FRAME',openings:[printable]}));
   assert.equal(pdf.getPageCount(),1);
  }
 }
 assert.notDeepEqual(calculate({...base,frame:'DS',mount:'O'}).parts,calculate({...base,frame:'ST',mount:'O'}).parts);
 assert.throws(()=>calculate({...base,frameStyle:'made-up'}),/valid frame style/);
 assert.throws(()=>calculate({...base,frame:'ST',frameStyle:'ZF'}),/matching the cutting profile/);
 assert.deepEqual(calculate({...base,frameStyle:'ST'}).parts,calculate(base).parts);
});
