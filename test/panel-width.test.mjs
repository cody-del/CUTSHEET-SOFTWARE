import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PDFDocument,decodePDFRawStream} from 'pdf-lib';
import {calculate,combinedParts} from '../calculations.mjs';
import {createPDF} from '../pdf.mjs';
import {blockingWarnings,panelWidthNotes} from '../public/manufacturing-help.js';
import {cutSheetNotes} from '../public/cut-sheet.js';
import {orderReadiness} from '../order-manufacturing.mjs';
import {calculationHandler} from '../netlify/functions/api.mjs';
import {createShopService} from '../shop-service.mjs';
import {fileStore} from '../shop-store.mjs';
import {shopHandler} from '../shop-api.mjs';

const wide={id:'wide',name:'Wide custom panel',width:48,height:59.5,quantity:1,left:1,right:0,louver:4,frame:'TR',sides:'4W',mount:'I',sizeMethod:'S',color:'W',tilt:'Back',stile:'Flat',divider:0,notes:''};
const tpost={...wide,id:'tpost',name:'Wide T-post panels',width:120,tposts:{construction:'two-piece',positions:[60],sections:[{left:1,right:0},{left:0,right:1}]}};
const ordinary={...wide,id:'ordinary',name:'Ordinary panels',width:36,right:1};
const job={id:'width-test',name:'Custom panel test',number:'TEST-WIDTH',customer:'Example only',notes:'',openings:[ordinary,wide,tpost]};
const post=(path,body)=>new Request('https://test.example/api/'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const pdfText=pdf=>pdf.getPages().map(page=>page.node.Contents().asArray().map(ref=>Buffer.from(decodePDFRawStream(pdf.context.lookup(ref)).decode()).toString()).join('\n').matchAll(/<([\da-f]+)> Tj/gi)).flatMap(matches=>[...matches].map(([,hex])=>Buffer.from(hex,'hex').toString('latin1'))).join(' ');

test('only the exact workbook panel-width warning becomes advisory; calculations retain it',()=>{
 for(const opening of [wide,tpost]){
  const r=calculate(opening);
  assert.deepEqual(r.warnings,['TOO WIDE PANEL ! ! !']);
  assert.deepEqual(blockingWarnings(r),[]);
  assert.ok(cutSheetNotes(r).includes(panelWidthNotes(r)[0]));
  assert.ok(r.parts.every(p=>Number.isFinite(p.length)&&p.length>0));
  assert.ok(r.gap>=1.9&&r.gap<8);
 }
 const unknown='Unknown workbook warning',mount='WRONG MOUNT OPTION OR FRAME ! ! !';
 assert.deepEqual(blockingWarnings({warnings:['TOO WIDE PANEL ! ! !',unknown,mount]}),[unknown,mount]);
 assert.deepEqual(panelWidthNotes(calculate(ordinary)),[]);
 const grouped=combinedParts([wide,tpost]);
 assert.equal(grouped.reduce((n,p)=>n+p.quantity,0),[wide,tpost].flatMap(o=>calculate(o).parts).reduce((n,p)=>n+p.quantity,0));
});

test('single, all-opening and combined PDFs download with readable custom-width notes',async()=>{
 for(const openings of [[wide],[tpost],job.openings])for(const combined of [false,true])for(const units of ['mm','in']){
  const response=await calculationHandler(post('pdf',{job:{...job,openings},combined,units}));
  assert.equal(response.status,200);
  assert.match(response.headers.get('content-type'),/application\/pdf/);
  const pdf=await PDFDocument.load(await response.arrayBuffer()),text=pdfText(pdf);
  assert.match(text,/Custom panel width:/);
  assert.equal((text.match(/Custom panel width:/g)||[]).length,openings.filter(o=>o!==ordinary).length);
  assert.match(text,/WHOLE DISTANCE/);
  if(!combined)assert.equal(pdf.getPageCount(),openings.length);
 }
});

test('a wide panel does not override light-gap, frame or invalid-geometry failures',async()=>{
 for(const o of [wide,tpost])for(const height of [60,52.5]){
  const invalid={...o,height},result=calculate(invalid);
  assert.ok(result.warnings.includes('TOO WIDE PANEL ! ! !'));
  assert.match(blockingWarnings(result).join(' '),/light gap/i);
  assert.equal(orderReadiness({openings:[invalid],finance:{confirmedAt:1}}).status,'blocked');
  assert.throws(()=>combinedParts([ordinary,invalid]),/light gap/i);
  for(const combined of [false,true])await assert.rejects(createPDF({...job,openings:[ordinary,invalid]},{combined}),/light gap/i);
 }
 await assert.rejects(createPDF({...job,openings:[{...wide,frame:'DS',mount:'I'}]}),/MOUNT|mount/);
 await assert.rejects(createPDF({...job,openings:[{...tpost,tposts:{...tpost.tposts,positions:[0]}}]}),/farther right/);
});

test('custom-width orders are ready, can be released and revised, and shop PDFs work',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'panel-width-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const service=createShopService({store:fileStore(join(dir,'workshop.json')),local:true});
 assert.equal(orderReadiness({...job,finance:{confirmedAt:1}}).status,'ready');
 assert.equal(orderReadiness(job).status,'confirmation');
 let {job:released}=await service.run('publish',{job});
 assert.equal(released.openings.length,3);
 assert.ok(released.openings[1].result.warnings.includes('TOO WIDE PANEL ! ! !'));
 const openings=released.openings.map(o=>({...o.input,width:o.input.id===wide.id?50:o.input.width}));
 const input={id:released.id,version:released.version,revision:1,requestId:'wide-revision',openings};
 assert.equal((await service.run('job-revision-preview',input)).changed,true);
 ({job:released}=await service.run('job-revise',input));
 assert.equal(released.openings[1].input.width,50);
 assert.equal(released.revision,2);
 const response=await shopHandler(service)(post('shop/job-pdf',{id:released.id}));
 assert.equal(response.status,200);
 assert.equal((await PDFDocument.load(await response.arrayBuffer())).getPageCount(),3);
 await assert.rejects(service.run('job-revise',{...input,revision:2,version:released.version,requestId:'bad-gap',openings:openings.map(o=>({...o,height:60}))}),/light gap/i);
});
