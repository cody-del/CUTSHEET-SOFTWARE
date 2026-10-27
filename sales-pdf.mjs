import {orderFinancials} from './public/order-finance.js';
import {productName,lineProduct,isManufacturingLine} from './public/products.js';
import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {frameStyle} from './public/frames.js';
const clean=value=>String(value??'').normalize('NFKD').replace(/[–—]/g,'-').replace(/×/g,'x').replace(/·/g,' / ').replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^\x20-\x7e\n]/g,'');
const money=cents=>cents==null?'Not priced':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);

export async function createSalesPDF({record:q,contact:c,totals:t,company={}},kind){
 const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
 const ink=rgb(.08,.08,.08),gray=rgb(.4,.4,.4),rule=rgb(.86,.86,.86),pale=rgb(.955,.955,.955),isOrder=kind==='order';
 const label=isOrder?'ORDER':'PROPOSAL',pages=[];let page,y;
 doc.setTitle(q.number+' - '+(isOrder?'Order':'Proposal'));if(company.name)doc.setAuthor(clean(company.name));
 const logo=company.logo?.data?await doc.embedPng(company.logo.data):null;
 function text(value,x,yy,size=10,f=font,color=ink){page.drawText(clean(value),{x,y:yy,size,font:f,color});}
 function right(value,x,yy,size=10,f=font,color=ink){text(value,x-f.widthOfTextAtSize(clean(value),size),yy,size,f,color);}
 function line(yy){page.drawLine({start:{x:36,y:yy},end:{x:576,y:yy},thickness:.6,color:rule});}
 function wrap(value,width,size=10,f=font){
  const rows=[];
  for(const paragraph of clean(value).split('\n')){
   let row='';
   for(let word of paragraph.trim().split(/\s+/)){
    if(!word)continue;
    if(row&&f.widthOfTextAtSize(row+' '+word,size)<=width){row+=' '+word;continue;}
    if(row){rows.push(row);row='';}
    while(f.widthOfTextAtSize(word,size)>width){let end=1;while(end<word.length&&f.widthOfTextAtSize(word.slice(0,end+1),size)<=width)end++;rows.push(word.slice(0,end));word=word.slice(end);}
    row=word;
   }
   rows.push(row);
  }
  return rows;
 }
 function newPage(first=false){
  page=doc.addPage([612,792]);pages.push(page);
  if(first){
   let top=750;const companyX=logo?190:36,companyWidth=logo?215:330;
   if(logo){const scale=Math.min(138/logo.width,60/logo.height);page.drawImage(logo,{x:36,y:top-logo.height*scale,width:logo.width*scale,height:logo.height*scale});}
   for(const s of wrap(company.name,companyWidth,14,bold).filter(Boolean)){text(s,companyX,top,14,bold);top-=18;}
   if(company.name)top-=3;
   for(const value of [company.address,company.phone,company.email,company.website].filter(Boolean))for(const s of wrap(value,companyWidth,9)){text(s,companyX,top,9,font,gray);top-=13;}
   right(label,576,746,21,bold);right(q.number,576,721,12,bold);
   right(new Date(q.createdAt).toLocaleDateString('en-US',{timeZone:'America/New_York'}),576,700,9,font,gray);
   if(q.validUntil&&!isOrder)right('Valid through '+q.validUntil,576,683,9,font,gray);
   y=Math.min(top-9,665);line(y);y-=26;
  }else{
   text(label+'  '+q.number,36,751,11,bold);
   right(wrap(company.name||'',300,9)[0],576,751,9,font,gray);line(735);y=712;
  }
 }
 function ensure(height){if(y-height<56)newPage();}
 function paragraph(value,{heading='',size=9.5}={}){
  const rows=wrap(value,540,size),leading=size+4;
  ensure((heading?24:0)+Math.min(3,rows.length)*leading);
  if(heading){text(heading,36,y,11,bold);y-=22;}
  for(const s of rows){ensure(leading);text(s,36,y,size,font,gray);y-=leading;}
  y-=12;
 }
 function tableHeader(){
  ensure(32);page.drawRectangle({x:36,y:y-22,width:540,height:26,color:pale});
  text('ITEM',46,y-12,8,bold);text('DESCRIPTION',78,y-12,8,bold);
  right('QTY',412,y-12,8,bold);right('UNIT PRICE',488,y-12,8,bold);right('AMOUNT',566,y-12,8,bold);y-=32;
 }
 newPage(true);
 const customer=[...wrap([c.firstName,c.lastName].filter(Boolean).join(' '),260,11,bold).map(s=>[s,11,bold]),...[c.address,c.phone,c.email].filter(Boolean).flatMap(s=>wrap(s,260,9).map(r=>[r,9,font]))];
 const jobName=wrap(q.name,235,11,bold),blockHeight=Math.max(customer.length*15,jobName.length*15)+40;ensure(blockHeight);
 text('CUSTOMER',36,y,8,bold,gray);text(isOrder?'ORDER DETAILS':'QUOTE DETAILS',330,y,8,bold,gray);y-=21;
 let cy=y;for(const [s,size,f]of customer){text(s,36,cy,size,f);cy-=15;}
 let jy=y;for(const s of jobName){text(s,330,jy,11,bold);jy-=15;}
 y=Math.min(cy,jy)-23;tableHeader();
 for(const [i,o]of q.openings.entries()){
  const priced=t.lines.find(l=>l.openingId===o.id),details=[];
  details.push(productName(lineProduct(o,q)),`${o.width}" W x ${o.height}" H`);
  if(isManufacturingLine(o,q)){
   const config=o.tposts?o.tposts.sections.map(s=>'L'.repeat(s.left)+'R'.repeat(s.right)).join(' / T / '):'L'.repeat(o.left)+'R'.repeat(o.right);
   details.push([frameStyle(o).name,o.mount==='I'?'Inside mount':'Outside mount',o.sides].filter(Boolean).join(' / '));
   details.push([({W:'White',OW:'Off-white',SC:'Swiss coffee'})[o.color],o.louver+'" louvers',o.tilt==='Smart'?'Smart View':o.tilt+' tilt',config].filter(Boolean).join(' / '));
   if(o.divider)details.push('Divider rail: '+o.divider+'"');
  }else if(o.notes)details.push(o.notes);
  // Workshop-only notes and machining dimensions do not belong on a client order.
  const rows=[...wrap(o.name,302,10,bold).map(s=>[s,bold,10]),...details.flatMap(s=>wrap(s,302,9).map(r=>[r,font,9]))];
  let offset=0;
  while(offset<rows.length){
   if(y-Math.min(rows.length-offset,5)*13-16<56){newPage();tableHeader();}
   const count=Math.min(rows.length-offset,Math.floor((y-56-16)/13)),height=count*13+16;
   if(i%2===0)page.drawRectangle({x:36,y:y-height,width:540,height,color:pale});
   text(String(i+1).padStart(2,'0'),46,y-15,9,bold);
   if(!offset){right(o.quantity,412,y-15,10);right(money(priced?.unitPrice),488,y-15,10);right(money(priced?.lineTotal),566,y-15,10,bold);}
   else text('(cont.)',46,y-29,7,font,gray);
   for(let n=0;n<count;n++){const [s,f,size]=rows[offset+n];text(s,78,y-15-n*13,size,f,f===bold?ink:gray);}
   y-=height;line(y);offset+=count;
  }
 }
 if(!q.openings.length){ensure(35);text('No line items added.',46,y-15,10,font,gray);y-=35;}
 const finance=orderFinancials(q,t.total),summary=[['Products',t.subtotal]];
 if(t.discount)summary.push(['Discount',-t.discount]);
 if(t.installation)summary.push(['Installation',t.installation]);
 summary.push(['Tax ('+(q.taxBasisPoints/100).toFixed(2)+'%)',t.tax]);
 if(isOrder&&finance.confirmed&&finance.saleTotalCents!==t.total)summary.push(['Order adjustment',finance.saleTotalCents-t.total]);
 summary.push([t.unpriced?'Total (incomplete)':isOrder?'Order total':'Proposal total',isOrder?finance.saleTotalCents:t.total,true]);
 if(isOrder&&finance.confirmed)summary.push(['Payments received',finance.paidCents],['Balance due',finance.balanceCents,true]);
 y-=22;ensure(summary.length*23+20);
 for(const [name,value,strong]of summary){
  if(strong){page.drawLine({start:{x:330,y:y+13},end:{x:576,y:y+13},thickness:.5,color:rule});}
  text(name,330,y,strong?10.5:10,strong?bold:font,strong?ink:gray);right(money(value),576,y,strong?11:10,strong?bold:font);y-=23;
 }
 y-=14;
 if(q.notes)paragraph(q.notes,{heading:'Notes'});
 if(company.terms)paragraph(company.terms,{heading:'Terms and conditions',size:9});
 for(const [i,p]of pages.entries()){
  page=p;line(42);text(q.number,36,26,8,font,gray);right('Page '+(i+1)+' of '+pages.length,576,26,8,font,gray);
 }
 return doc.save();
}
