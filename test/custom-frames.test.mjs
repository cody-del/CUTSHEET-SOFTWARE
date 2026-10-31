import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PDFDocument} from 'pdf-lib';
import {calculate} from '../calculations.mjs';
import {createPDF} from '../pdf.mjs';
import {fileStore} from '../shop-store.mjs';
import {createShopService} from '../shop-service.mjs';
import {quoteTotals} from '../sales-service.mjs';
import {workerJob} from '../worker-view.mjs';
import {FRAME_EDGES,FRAME_SETUPS,frameShapes,frameCuttingPlan} from '../public/frames.js';
import {cutSheetFacts} from '../public/cut-sheet.js';
import {nextQuoteLine} from '../public/quote-line-defaults.js';
import {printedReferences} from './printed-reference-cases.mjs';

const custom={...printedReferences.at(-1).opening,id:'custom-opening',name:'Custom window'};
const frameParts=r=>r.parts.filter(p=>/frame$/.test(p.name));
async function setup(t){
 const dir=await mkdtemp(join(tmpdir(),'custom-frames-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const path=join(dir,'workshop.json');return {path,service:createShopService({store:fileStore(path),local:true})};
}

test('4S uses Standard bottom with Trim and Z families; explicit custom setup gives the same cuts',()=>{
 for(const [frame,frameStyle,profile]of [['ST','ST','STD'],['ST','MS','STD'],['TR','TR','TRF'],['ZF','ZF','ZFR'],['ZF','MZ','ZFR'],['ZF','EL','ZFR']]){
  const o={...custom,frame,frameStyle,sides:'4S'};delete o.frameSides;
  const r=calculate(o),cw=calculate({...o,sides:'CW',frameSides:{top:frameStyle,bottom:'ST',left:frameStyle,right:frameStyle}});
  assert.deepEqual(r.parts,cw.parts,frameStyle);assert.equal(r.gap,cw.gap);
  const parts=frameParts(r);assert.equal(parts.find(p=>p.name==='Bottom frame').profile,'BOTTOM STD');
  for(const part of parts.filter(p=>p.name!=='Bottom frame'))assert.ok(part.profile.endsWith(profile),`${frameStyle}: ${part.profile}`);
 }
});

test('custom standard overrides apply independently to each edge and never leak into another calculation',()=>{
 const plain={...custom,sides:'4W'};delete plain.frameSides;
 const before=calculate(plain);
 for(const side of FRAME_EDGES){
  const frameSides=Object.fromEntries(FRAME_EDGES.map(edge=>[edge,edge===side?'ST':'TR']));
  const parts=frameParts(calculate({...custom,frameSides}));
  for(const part of parts)assert.equal(part.profile,`${part.name.split(' ')[0].toUpperCase()} ${part.name.toLowerCase().startsWith(side)?'STD':'TRF'}`);
 }
 assert.deepEqual(calculate(plain),before);
});

test('custom preview and summary identify each profile, including aliases in one cutting family',()=>{
 const shapes=frameShapes(custom,{left:22,top:28,width:214,height:120});
 for(const side of FRAME_EDGES)assert.ok(shapes.filter(s=>s.side===side).every(s=>s.frameStyle===custom.frameSides[side]));
 assert.equal(shapes.filter(s=>s.side==='top').length,1);
 assert.ok(shapes.filter(s=>s.side==='left').length>1);
 const facts=cutSheetFacts(custom,calculate(custom));
 assert.match(facts.find(([key])=>key==='Frame')[1],/Top: Standard; Bottom: Standard; Left: Trim; Right: Trim/);
 assert.match(facts.find(([key])=>key==='Mount & sides')[1],/Custom \(CW\)/);
 const aliases={...custom,frameSides:{top:'MZ',bottom:'MS',left:'ZF',right:'EL'}};
 assert.deepEqual(frameCuttingPlan(aliases),{profile:'ZF',sides:{top:'ZF',bottom:'ST',left:'ZF',right:'ZF'}});
 assert.equal(calculate(aliases).parts.length,10);
});

test('custom input rejects missing, unavailable or extra side values; unsupported trim mixtures cannot produce cuts',async()=>{
 for(const frameSides of [undefined,{top:'ST'}, {...custom.frameSides,right:'NF'}, {...custom.frameSides,privateNote:'private'}])assert.throws(()=>calculate({...custom,frameSides}),/frame for the top/);
 assert.deepEqual(Object.keys(FRAME_SETUPS),['4W','4S','CW']);
 for(const sides of ['NF','2W','CD'])assert.throws(()=>calculate({...custom,sides}),/Invalid sides/);
 for(const o of [{...custom,frameSides:{...custom.frameSides,right:'ZF'}},{...custom,frame:'DS',frameStyle:'DS',sides:'4S'}]){
  const r=calculate(o);assert.equal(r.status,'preview-only');assert.deepEqual(r.parts,[]);
  await assert.rejects(createPDF({number:'UNCONFIRMED',openings:[o]}),/frame|sill/i);
 }
});

test('new lines preserve independent custom choices but do not inherit retired arrangements',()=>{
 const defaults={...custom,id:'next',name:'Next opening',width:null,height:null,sides:'4W'};delete defaults.frameSides;
 const line=nextQuoteLine({...custom,productId:'shuttersmart'},{},defaults);
 assert.deepEqual(line.frameSides,custom.frameSides);line.frameSides.top='ZF';assert.equal(custom.frameSides.top,'ST');
 for(const sides of ['3W','3D']){
  const legacy={...custom,sides};delete legacy.frameSides;
  assert.ok(calculate(legacy).parts.length); // Existing saved setup remains readable.
  const next=nextQuoteLine({...legacy,productId:'shuttersmart'},{},defaults);
  assert.equal(next.sides,'4W');assert.equal(next.frameSides,undefined);
 }
});

test('custom frames stay on one page for standard and one through four T-post openings',async()=>{
 const openings=[custom,...Array.from({length:4},(_,i)=>({...custom,width:(i+2)*30,height:76.25,
  tposts:{construction:'two-piece',positions:Array.from({length:i+1},(_,n)=>(n+1)*30),sections:Array.from({length:i+2},()=>({left:1,right:1}))}}))];
 for(const o of openings){
  const r=calculate(o);assert.deepEqual(r.warnings,[]);
  assert.deepEqual(frameParts(r).map(p=>[p.name,p.profile]),[['Top frame','TOP STD'],['Bottom frame','BOTTOM STD'],['Left frame','LEFT TRF'],['Right frame','RIGHT TRF']]);
 }
 for(const units of ['mm','in'])assert.equal((await PDFDocument.load(await createPDF({number:'CUSTOM',openings},{units}))).getPageCount(),openings.length);
});

test('custom sides survive quote, order, production and worker projection without customer data',async t=>{
 const {service}=await setup(t),run=(op,data={})=>service.run(op,data);
 await run('contact-save',{id:'contact',version:0,fields:{firstName:'Sample',lastName:'Customer',email:'private@example.test',phone:'555-0100',address:'Private address',notes:'Private contact note'}});
 await run('pricing-save',{version:0,rateCents:2500,minimumAreaHundredths:0});
 let {quote}=await run('quote-create',{id:'quote',contactId:'contact'});
 ({quote}=await run('quote-save',{id:quote.id,version:quote.version,fields:{openings:[custom]}}));
 const {order}=await run('quote-convert',{id:quote.id,version:quote.version});
 assert.deepEqual(order.openings[0].frameSides,custom.frameSides);
 await run('order-confirm',{id:order.id,version:order.version,confirmationId:'confirmed',saleTotalCents:quoteTotals(order).total,payment:{id:'no-deposit',amountCents:0,receivedOn:'2026-10-31',method:'check'}});
 const {job}=await run('job-get',{id:order.id});
 assert.deepEqual(job.openings[0].input.frameSides,custom.frameSides);
 assert.deepEqual(job.openings[0].result.parts,calculate(custom).parts);
 job.openings[0].input.frameSides.privateNote='private@example.test';
 const worker=workerJob(job);assert.deepEqual(worker.openings[0].input.frameSides,custom.frameSides);
 assert.ok(!JSON.stringify(worker).includes('private@example.test'));
});

test('custom drafts reload with all sides; unconfirmed mixtures remain saved but cannot enter Production',async t=>{
 const {path,service}=await setup(t),fields={name:'Custom draft',number:'CUSTOM-001',customer:'',notes:'',due:'',archived:false,openings:[custom]};
 await service.run('draft-save',{id:'custom',version:0,fields});
 const second=createShopService({store:fileStore(path),local:true});
 assert.deepEqual((await second.run('draft-get',{id:'custom'})).draft.openings[0].frameSides,custom.frameSides);
 const opening={...custom,frameSides:{...custom.frameSides,right:'ZF'}};
 await service.run('draft-save',{id:'mixed',version:0,fields:{...fields,openings:[opening]}});
 assert.deepEqual((await service.run('draft-get',{id:'mixed'})).draft.openings[0].frameSides,opening.frameSides);
 await assert.rejects(service.run('draft-release',{id:'mixed',version:1}),/different trim profiles/);
});
