import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PDFDocument} from 'pdf-lib';
import {calculate,validateOpening} from '../calculations.mjs';
import {SLIDING_LAYOUTS,slidingGeometry,setSliding,slidingPanelSchedule} from '../public/sliding.js';
import {slidingPanelTable,panelDimension,finishedPanelLines,groupFinishedPanels} from '../public/sliding-panels.js';
import {blockingWarnings} from '../public/manufacturing-help.js';
import {drawing,drawingSVG} from '../public/layouts.js';
import {cutSheetFacts} from '../public/cut-sheet.js';
import {nextQuoteLine} from '../public/quote-line-defaults.js';
import {createPDF} from '../pdf.mjs';
import {createShopService} from '../shop-service.mjs';
import {fileStore} from '../shop-store.mjs';
import {quoteTotals} from '../sales-service.mjs';
const base={id:'slide-1',name:'Sliding door',productId:'shuttersmart',width:96,height:90,quantity:1,mount:'I',louver:4,color:'W',tilt:'Back',divider:0,divisionMode:'divider',notes:''};
const panel=(layout='FFBB',extra={})=>setSliding({...base,...extra},layout);
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
// Independent expectations for a 96-inch opening. Only changes of track overlap.
const widths={FB:48.75,BF:48.75,FMB:33,BMF:33,FFBB:24.375,BBFF:24.375,BFFB:24.75,FBBF:24.75,BFBF:25.125,FBFB:25.125,FFMMBB:16.5,BBMMFF:16.5,BBFFMM:16.5,MMFFBB:16.5,FFBBMM:16.5,MMBBFF:16.5};
test('every sliding layout closes at the entered width with exact joints and one height deduction',()=>{
 assert.deepEqual(Object.keys(widths).sort(),Object.values(SLIDING_LAYOUTS).flat().sort());
 for(const [layout,width] of Object.entries(widths))for(const mount of ['I','O']){
  const o=panel(layout,{mount,quantity:2}),g=slidingGeometry(o),r=calculate(o),n=layout.length;
  close(g.panelWidth,width+(mount==='O'?3/n:0));close(g.panelHeight,87.125);close(r.panelHeight,2212.975);
  close(g.panels[0].start,mount==='O'?-1.5:0);close(g.panels.at(-1).end,96+(mount==='O'?1.5:0));
  for(let i=1;i<n;i++)close(g.panels[i-1].end-g.panels[i].start,layout[i-1]===layout[i]?0:1.5);
  assert.equal(r.parts.find(p=>p.name==='Stile · flat').quantity,n*4);
  assert.equal(r.parts.find(p=>p.name==='Louvers').quantity,23*n*2);
  assert.deepEqual(r.hinges,[]);assert.ok(r.parts.every(p=>!/(frame|regular|T-post)/i.test(p.name)));
  assert.deepEqual(blockingWarnings(r),[]);close(r.panelWidth,g.panelWidth*25.4);
 }
});
test('flat NF component dimensions match the preserved standard folding workbook',()=>{
 const r=calculate(panel());
 // 24 3/8 x 87 1/8 finished NF panel, flat/flat, 4-inch back tilt.
 for(const [name,length,quantity] of [['Louvers',522.325,92],['Stile · flat',2212.975,8],['Top rail',524.325,4],['Bottom rail',524.325,4],['Tiltrod',1940,4]]){
  const p=r.parts.find(p=>p.name===name);close(p.length,length);assert.equal(p.quantity,quantity);assert.match(p.source,/^PRINT SHEET!/);
 }
 close(r.gap,5.8875);assert.equal(r.louversPerPanel,23);
});
test('drafts retain blank measurements; invalid or mixed construction settings cannot reach calculation',()=>{
 assert.doesNotThrow(()=>validateOpening(panel('FB',{width:null,height:null}),{allowIncomplete:true,shutterSizeOnly:true}));
 for(const o of [panel('FB',{width:1}),panel('FB',{height:2.875}),panel('FB',{height:117}),{...panel(),frame:'TR'},{...panel(),sides:'4W'},{...panel(),stile:'Reg'},{...panel(),left:2},{...panel(),sizeMethod:'W'},{...panel(),tposts:{}},{...panel(),sliding:{version:2,layout:'FFBB'}},{...panel(),sliding:{version:1,layout:'FFFF'}},{...panel(),sliding:{version:1,layout:'FFBB',pricing:100}}])assert.throws(()=>validateOpening(o));
 assert.throws(()=>validateOpening({...panel(),sliding:undefined}),/No frame/);
 assert.throws(()=>validateOpening(panel('FB',{divider:88})),/below the top/);
});
test('a workbook height adjustment cannot silently change the requested finished panel height',async()=>{
 const o=panel('FFBB',{height:62.875}),r=calculate(o);
 assert.equal(r.requestedPanelHeight,1524);assert.notEqual(r.panelHeight,r.requestedPanelHeight);
 assert.ok(blockingWarnings(r).some(w=>w.includes('adjusted this panel height')));
 await assert.rejects(createPDF({name:'Height check',openings:[o]}));
});
test('new quote lines repeat sliding choices without carrying measurements or double deductions',()=>{
 const previous=panel('FFMMBB',{mount:'O',quantity:3});
 const next=nextQuoteLine(previous,{productId:'shuttersmart'},{...base,id:'next',name:'Next'});
 assert.deepEqual(next.sliding,previous.sliding);assert.equal(next.mount,'O');assert.equal(next.frame,'NF');assert.equal(next.width,null);assert.equal(next.height,null);assert.equal(next.quantity,1);
 close(calculate({...next,width:96,height:90}).panelHeight,2212.975);
});
test('previews draw the real number of panels, tracks, louvers and inset dividers',()=>{
 for(const layout of ['FB','FMB','FFBB','FFMMBB']){
  const o=panel(layout,{tilt:'Front',divider:40}),r=calculate(o),scene=drawing(o,{louverLayout:r.louverLayout});
  assert.equal(scene.leaves.length,layout.length);assert.equal(scene.posts.length,0);assert.equal(scene.labels.filter(l=>l.role==='track').length,layout.includes('M')?3:2);
  assert.equal(scene.shapes.filter(s=>s.role==='track-panel').length,layout.length);
  assert.equal(scene.shapes.filter(s=>s.role==='louver').length,r.louversPerPanel*layout.length);
  for(const d of scene.shapes.filter(s=>s.role==='divider')){const p=scene.leaves.find(p=>p.number===d.section);assert.ok(d.points[0][0]>p.x);assert.ok(d.points[1][0]<p.x+p.w);}
  assert.ok(scene.shapes.every(s=>s.kind!=='polygon'||s.points.every(([x,y])=>x>=0&&x<=scene.width&&y>=0&&y<=scene.height)));
 }
});
test('sliding PDFs keep each opening on one page and distinguish entered and finished dimensions',async()=>{
 const openings=['FB','FMB','FFBB','FFMMBB'].flatMap(layout=>['I','O'].map(mount=>panel(layout,{id:layout+mount,mount})));
 for(const units of ['mm','in']){const pdf=await PDFDocument.load(await createPDF({name:'Sliding preview',openings},{units}));assert.equal(pdf.getPageCount(),openings.length);}
 const svg=drawingSVG(panel('FFBB',{mount:'O'}),{widthLabel:'96 in',heightLabel:'90 in'});assert.match(svg,/99 in overall/);assert.match(svg,/87 1\/8 in panel/);
 const facts=cutSheetFacts(openings[0],calculate(openings[0]));assert.match(facts[0][1],/96 × 90/);assert.match(finishedPanelLines(openings[0])[0],/48 3\/4" W × 87 1\/8" H/);assert.match(facts.find(([label])=>label==='Measurement type')[1],/2 7\/8/);
});
async function setup(t){const dir=await mkdtemp(join(tmpdir(),'sliding-workspace-'));t.after(()=>rm(dir,{recursive:true,force:true}));const path=join(dir,'state.json'),password='sliding-test-password',secret='sliding-test-secret-more-than-32-characters';const service=createShopService({store:fileStore(path),password,secret});const owner={owner:(await service.run('login',{password})).token},run=(op,data={})=>service.run(op,data,owner);return {service,run,path,password,secret,owner};}
test('sliding drafts persist across instances, release, reach workers and revise with height deducted once',async t=>{
 const f=await setup(t),input=panel('FFMMBB',{mount:'O'}),fields={name:'Sample job',number:'SLIDE-001',customer:'Private customer',notes:'',openings:[input]};
 await f.run('draft-save',{id:'slide-job',version:0,fields});
 const second=createShopService({store:fileStore(f.path),password:f.password,secret:f.secret});
 const {productId,...savedInput}=input;assert.deepEqual((await second.run('draft-get',{id:'slide-job'},f.owner)).draft.openings[0],savedInput);
 let {job}=await f.run('draft-release',{id:'slide-job',version:1});
 const {code}=await f.run('pairing',{name:'Test iPad'}),shop={shop:(await f.service.run('pair',{code})).token};
 let worker=(await f.service.run('job-get',{id:job.id},shop)).job;
 assert.deepEqual(worker.openings[0].input.sliding,input.sliding);close(worker.openings[0].result.panelHeight,2212.975);assert.ok(!JSON.stringify(worker).includes('Private customer'));
 const request={id:job.id,version:job.version,revision:job.revision||1,requestId:'change-size',openings:[{...input,height:96}]};
 const preview=await f.run('job-revision-preview',request);({job}=await f.run('job-revise',{...request,version:preview.version}));
 assert.equal(job.openings[0].input.height,96);close(job.openings[0].result.panelHeight,93.125*25.4);
 worker=(await f.service.run('job-get',{id:job.id},shop)).job;close(worker.openings[0].result.panelHeight,93.125*25.4);
});
test('quote to order to production retains the layout and hides customer details from workers',async t=>{
 const f=await setup(t),input=panel('FFBB',{mount:'O'});
 await f.run('contact-save',{id:'contact',version:0,fields:{firstName:'Private',lastName:'Customer',address:'123 Private Street',phone:'555-0100',email:'private@example.com',notes:'private note'}});
 await f.run('pricing-save',{version:0,rateCents:2500,minimumAreaHundredths:0});
 let {quote}=await f.run('quote-create',{id:'quote-slide',contactId:'contact'});
 ({quote}=await f.run('quote-save',{id:quote.id,version:quote.version,fields:{openings:[input]}}));
 let {order}=await f.run('quote-convert',{id:quote.id,version:quote.version});assert.deepEqual(order.openings[0].sliding,input.sliding);
 const confirmed=await f.run('order-confirm',{id:order.id,version:order.version,confirmationId:'confirm-slide',saleTotalCents:quoteTotals(order).total,payment:{id:'receipt',amountCents:0,receivedOn:'2026-11-21',method:'check',note:''}});assert.equal(confirmed.released,true);
 const {job}=await f.run('job-get',{id:order.id});assert.deepEqual(job.openings[0].input.sliding,input.sliding);close(job.openings[0].result.panelHeight,2212.975);
 const {code}=await f.run('pairing',{name:'Test iPad'}),shop={shop:(await f.service.run('pair',{code})).token};
 const worker=JSON.stringify(await f.service.run('job-get',{id:order.id},shop));for(const secret of ['private@example.com','123 Private Street','saleTotalCents','rateCents'])assert.ok(!worker.includes(secret));
});

test('same-track panels have subtle visual seams without physical gaps or size changes',async()=>{
 const {slidingLayoutThumbnail}=await import('../public/sliding-drawing.js');
 for(const [layout,count] of [['FB',0],['FFBB',2],['FMB',0],['FFMMBB',3]]){
  const o=panel(layout),before=calculate(o),g=slidingGeometry(o),scene=drawing(o),thumbnail=slidingLayoutThumbnail(layout);
  const seams=scene.shapes.filter(s=>s.role==='panel-separator');assert.equal(seams.length,count);
  assert.equal((thumbnail.match(/data-role="panel-separator"/g)||[]).length,count);
  assert.equal((thumbnail.match(/<rect /g)||[]).length,layout.length);
  for(let i=1;i<g.panels.length;i++)if(layout[i]===layout[i-1])close(g.panels[i].start,g.panels[i-1].end);
  assert.deepEqual(calculate(o),before);
 }
});

test('one quote can mix a standard single panel with bypass and repeated bypass lines through production',async t=>{
 const f=await setup(t),standard={...base,id:'standard',name:'Single window',width:31.25,height:59.5,left:1,right:0,frame:'TR',sides:'4W',sizeMethod:'S',stile:'Flat'};
 const defaults={...standard,id:'bypass',name:'Sliding door'},line=nextQuoteLine(standard,{productId:'shuttersmart'},defaults);
 assert.equal(line.productId,'shuttersmart');assert.equal(line.width,null);assert.equal(line.height,null);assert.equal(line.sliding,undefined);
 const bypass=setSliding({...line,width:96,height:90},'FB');
 const repeated=nextQuoteLine(bypass,{productId:'shuttersmart'},{...defaults,id:'bypass-2',name:'Second sliding door'});
 assert.deepEqual(repeated.sliding,bypass.sliding);assert.equal(repeated.width,null);assert.equal(repeated.height,null);
 const items=[standard,bypass,{...repeated,width:96,height:90}],original=calculate(standard);
 await f.run('contact-save',{id:'mixed-contact',version:0,fields:{firstName:'Sample',lastName:'Mixed order',address:'',phone:'',email:'',notes:''}});
 await f.run('pricing-save',{version:0,rateCents:2500,minimumAreaHundredths:0});
 let {quote}=await f.run('quote-create',{id:'mixed-quote',contactId:'mixed-contact'});
 ({quote}=await f.run('quote-save',{id:quote.id,version:quote.version,fields:{openings:items,useCurrentPricing:true}}));
 const second=createShopService({store:fileStore(f.path),password:f.password,secret:f.secret});
 const saved=(await second.run('sales-get',{kind:'quote',id:quote.id},f.owner)).record;
 assert.equal(saved.openings.length,3);assert.deepEqual(saved.openings.map(o=>o.sliding?.layout||'standard'),['standard','FB','FB']);
 assert.equal(quoteTotals(saved).lines.length,3);assert.equal(quoteTotals(saved).subtotal,quoteTotals(saved).lines.reduce((sum,l)=>sum+l.lineTotal,0));
 const {order}=await f.run('quote-convert',{id:quote.id,version:quote.version});
 const confirmed=await f.run('order-confirm',{id:order.id,version:order.version,confirmationId:'mixed-confirmation',saleTotalCents:quoteTotals(order).total,payment:{id:'mixed-receipt',amountCents:0,receivedOn:'2026-11-21',method:'check',note:''}});
 assert.equal(confirmed.released,true);
 const {job}=await f.run('job-get',{id:order.id});assert.equal(job.openings.length,3);assert.deepEqual(job.openings[0].result,original);
 for(const o of job.openings.slice(1)){assert.equal(o.input.sliding.layout,'FB');assert.equal(o.result.parts.find(p=>p.name==='Stile · flat').quantity,4);close(o.result.panelHeight,87.125*25.4);}
});

 test('panel schedule preserves exact sizes and quantities and hands each layout left to right',()=>{
  const expected={2:['Left','Right'],3:['Left','Right','Right'],4:['Left','Left','Right','Right'],6:['Left','Left','Left','Right','Right','Right']};
  for(const layout of Object.values(SLIDING_LAYOUTS).flat()){
   const o=panel(layout,{mount:'O',quantity:2}),r=calculate(o),schedule=slidingPanelSchedule(o,r),g=slidingGeometry(o);
   assert.deepEqual(schedule.map(p=>p.tiltPosition),expected[layout.length]);
   assert.equal(schedule.map(p=>p.track).join(''),layout);
   assert.equal(schedule.reduce((n,p)=>n+p.quantity,0),layout.length*2);
   for(const p of schedule){close(p.width,g.panelWidth*25.4);close(p.height,87.125*25.4);assert.equal(p.quantity,2);}
   const drawingLabels=drawing(o).labels.filter(l=>l.role==='panel');
   assert.deepEqual(drawingLabels.map(l=>l.tiltPosition),expected[layout.length]);
   assert.deepEqual(drawingLabels.map(l=>l.panel),schedule.map(p=>p.number));
   assert.match(slidingPanelTable(o,r),new RegExp(`Qty ${layout.length*2}`));
   assert.match(slidingPanelTable(o,r),/87 1\/8/);
   for(const [tilt,position] of [['Front','Center'],['Smart','Internal']])assert.ok(slidingPanelSchedule({...o,tilt}).every(p=>p.tiltPosition===position));
  }
 });
 test('finished panel schedules fit alongside cutting and drilling on one page per sliding opening',async()=>{
  const openings=Object.values(SLIDING_LAYOUTS).flat().map(layout=>panel(layout,{width:72,mount:'O',quantity:2,divider:60.625,id:layout}));
  for(const units of ['in','mm']){
   const pdf=await PDFDocument.load(await createPDF({name:'Panel schedule',openings},{units}));assert.equal(pdf.getPageCount(),openings.length);
  }
 });

 test('finished panel fractions are exact and independent of millimeter cut sizes',()=>{
  for(const [inches,label] of [[87.125,'87 1/8'],[19.125,'19 1/8'],[19.15625,'19 5/32'],[26+1/3,'26 1/3'],[13+1/48,'13 1/48'],[36,'36'],[.625,'5/8']])assert.equal(panelDimension(inches*25.4),label);
  assert.equal(panelDimension(null),'—');
  assert.equal(panelDimension(19.123456*25.4),'19.123456');
  const o=panel('FFBB',{width:72,mount:'O'}),r=calculate(o),before=structuredClone(r);
  const html=slidingPanelTable(o,r);
  assert.match(html,/&quot; W/);assert.match(html,/&quot; H/);assert.match(html,/19 1\/8/);assert.match(html,/87 1\/8/);assert.doesNotMatch(html,/Width \(mm\)/);
  const facts=cutSheetFacts(o,r,{units:'mm'});assert.ok(facts.every(([label])=>label!=='Each panel · no frame'));
  assert.deepEqual(finishedPanelLines(o,r),['19 1/8" W × 87 1/8" H · Qty 4 · Tilt: 2 Left / 2 Right']);
  assert.deepEqual(r,before);close(r.parts.find(p=>p.name==='Stile · flat').length,2212.975);
 });

 test('compact panel summary counts tilt positions across units without mixing different sizes',()=>{
  for(const [layout,left,right] of [['FB',1,1],['FMB',1,2],['FFBB',2,2],['FFMMBB',3,3]]){
   const o=panel(layout,{quantity:2});
   assert.equal(finishedPanelLines(o).length,1);
   assert.match(finishedPanelLines(o)[0],new RegExp(`Qty ${layout.length*2} · Tilt: ${left*2} Left / ${right*2} Right`));
   assert.doesNotMatch(slidingPanelTable(o),/<table|Track|Front|Middle|Back/);
  }
  assert.match(finishedPanelLines(panel('FB',{tilt:'Front'}))[0],/Tilt: 2 Center$/);
  assert.match(finishedPanelLines(panel('FB',{tilt:'Smart'}))[0],/Tilt: 2 Internal$/);
  assert.deepEqual(groupFinishedPanels([
   {width:500,height:2000,quantity:2,tiltPosition:'Left'},
   {width:500,height:2000,quantity:2,tiltPosition:'Right'},
   {width:501,height:2000,quantity:1,tiltPosition:'Right'}
  ]),[{width:500,height:2000,quantity:4,tilts:{Left:2,Right:2}},{width:501,height:2000,quantity:1,tilts:{Right:1}}]);
 });
