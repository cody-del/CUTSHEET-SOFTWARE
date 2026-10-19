import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {calculationHandler as handler} from '../netlify/functions/api.mjs';

const opening = {name:'Hosted test',width:36,height:59.75,quantity:1,left:1,right:1,frame:'ST',louver:4,mount:'I',sizeMethod:'W',sides:'4W',color:'W',tilt:'Front',stile:'Flat',divider:0,notes:''};
const job = {number:'HOST-001',customer:'Example',openings:[opening]};
const request = (path, data, options={}) => new Request(`https://cut-sheets.example${path}`, {
  method:'POST',headers:{'content-type':'application/json',origin:'https://cut-sheets.example',...options.headers},
  body:typeof data==='string'?data:JSON.stringify(data),
});

test('hosted API reports version and calculates source-backed cut lengths', async () => {
  assert.equal((await handler(new Request('https://cut-sheets.example/api/info'))).status,200);
  const response = await handler(request('/api/calculate',opening));
  assert.equal(response.status,200);
  const data=await response.json();
  assert.ok(data.parts.length>0);
  assert.deepEqual(data.warnings,[]);
});

test('hosted API returns downloadable Letter PDFs in both modes and units', async () => {
  for (const combined of [false,true]) for (const units of ['mm','in']) {
    const response=await handler(request('/api/pdf',{job,combined,units}));
    assert.equal(response.status,200);
    assert.equal(response.headers.get('content-type'),'application/pdf');
    assert.match(response.headers.get('content-disposition'),/^attachment;/);
    const pdf=await PDFDocument.load(await response.arrayBuffer());
    assert.equal(pdf.getPageCount(),1);
    assert.equal(pdf.getPage(0).getWidth(),612);
  }
});

test('hosted API rejects invalid input, foreign origins, and oversized requests', async () => {
  for (const [req,status] of [
    [request('/api/pdf','{'),400],
    [request('/api/pdf',null),400],
    [request('/api/pdf',{job,units:'cm'}),400],
    [request('/api/pdf',{job},{headers:{origin:'https://another-site.example'}}),403],
    [request('/api/pdf',{job},{headers:{'content-type':'text/plain'}}),415],
    [request('/api/pdf',' '.repeat(512001)),413],
    [request('/api/pdf',{job:{...job,openings:[{...opening,width:100,left:1,right:0}]}}),422],
    [new Request('https://cut-sheets.example/api/pdf'),405],
    [request('/api/missing',{}),404],
  ]) assert.equal((await handler(req)).status,status);
});
