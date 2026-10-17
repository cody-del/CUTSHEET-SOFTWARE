import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {drawing} from './public/layouts.js';
import {calculate} from './calculations.mjs';
import {frameStyle} from './public/frames.js';
const clean=value=>String(value??'').normalize('NFKD').replace(/[–—]/g,'-').replace(/×/g,'x').replace(/·/g,' / ').replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^\x20-\x7e\n]/g,'');
const money=cents=>cents===null?'Not priced':'$'+(cents===0?0:cents/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
export async function createSalesPDF({record:q,contact:c,totals:t},kind){
  const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold),ink=rgb(.08,.08,.08),gray=rgb(.43,.43,.43),pale=rgb(.95,.95,.95);
  doc.setTitle(q.number+' - '+(kind==='order'?'Order':'Quote'));let page,y;const pages=[];
  function text(s,x,yy,size=10,f=font,color=ink){page.drawText(clean(s),{x,y:yy,size,font:f,color});}
  function wrap(s,width,size=10,f=font){const out=[];for(const paragraph of clean(s).split('\n')){let row='';for(const word of paragraph.split(/\s+/)){for(const char of (row?' ':'')+word){if(f.widthOfTextAtSize(row+char,size)>width){out.push(row);row='';}row+=char;}}out.push(row);}return out;}
  function newPage(){page=doc.addPage([612,792]);pages.push(page);text(kind==='order'?'ORDER':'QUOTE',36,748,11,bold);text(q.number,460,748,12,bold);page.drawLine({start:{x:36,y:732},end:{x:576,y:732},thickness:1,color:ink});y=708;}
  function ensure(height){if(y-height<50)newPage();}
  function paragraph(value,width=540,size=10,f=font){const spacing=Math.max(15,size*1.3);for(const line of wrap(value,width,size,f)){ensure(spacing);text(line,36,y,size,f);y-=spacing;}}
  newPage();paragraph(q.name,540,20,bold);y-=12;
  paragraph([c.firstName,c.lastName].filter(Boolean).join(' '),540,12,bold);
  for(const value of [c.address,c.phone,c.email])if(value)paragraph(value);
  y-=10;paragraph('Shutter Smart  /  '+new Date(q.createdAt).toLocaleDateString('en-US',{timeZone:'America/New_York'}),540,9);
  if(q.validUntil&&kind==='quote')paragraph('Valid through '+q.validUntil,540,9);
  y-=14;
  if(!q.openings.length)paragraph('No openings added yet.');
  for(const [i,o]of q.openings.entries()){
    const line=t.lines.find(l=>l.openingId===o.id),config=o.tposts?o.tposts.sections.map(s=>'L'.repeat(s.left)+'R'.repeat(s.right)).join(' / T / '):'L'.repeat(o.left)+'R'.repeat(o.right);
    const description=[o.width+'" W x '+o.height+'" H',frameStyle(o).name,o.mount==='I'?'Inside mount':'Outside mount',o.louver+'" louvers',o.tilt==='Smart'?'Smart View':o.tilt+' tilt',({W:'White',OW:'Off-white',SC:'Swiss coffee'})[o.color],config].join(' / ');
    const details=wrap(description,290,9),title=wrap(String(i+1).padStart(2,'0')+'  '+o.name,290,12,bold),height=Math.max(130,50+details.length*13+title.length*15);
    ensure(height);page.drawRectangle({x:36,y:y-height+10,width:540,height,color:i%2?pale:rgb(1,1,1),borderColor:rgb(.88,.88,.88),borderWidth:.6});let top=y-10;
    for(const name of title){text(name,170,top,12,bold);top-=15;}
    text(money(line.lineTotal),566-bold.widthOfTextAtSize(clean(money(line.lineTotal)),11),y-10,11,bold);
    for(const detail of details){text(detail,170,top,9,font,gray);top-=13;}
    text(o.quantity+' unit'+(o.quantity===1?'':'s')+' / '+line.billableArea.toFixed(2)+' billable sq ft each',170,top-3,9);text(money(line.unitPrice)+' each',170,top-17,9);
    const scene=drawing(o,{louverLayout:calculate(o).louverLayout}),scale=Math.min(105/scene.width,(height-24)/scene.height),dx=48+(105-scene.width*scale)/2,dy=y-2;
    const tone=hex=>{const v=parseInt(hex.slice(1),16);return hex.length===4?rgb(((v>>8)&15)/15,((v>>4)&15)/15,(v&15)/15):rgb((v>>16)/255,((v>>8)&255)/255,(v&255)/255);};
    for(const s of scene.shapes){if(s.kind==='line')page.drawLine({start:{x:dx+s.a[0]*scale,y:dy-s.a[1]*scale},end:{x:dx+s.b[0]*scale,y:dy-s.b[1]*scale},thickness:s.weight*scale,color:tone(s.tone)});else page.drawSvgPath(s.points.map((p,i)=>`${i?'L':'M'} ${p[0]} ${p[1]}`).join(' ')+' Z',{x:dx,y:dy,scale,color:tone(s.fill),borderColor:tone(s.tone),borderWidth:s.weight});}
    y-=height;
  }
  y-=16;ensure(125);
  for(const [label,value]of [['Shutters',t.subtotal],['Discount',-t.discount],['Installation',t.installation],['Tax ('+(q.taxBasisPoints/100).toFixed(2)+'%)',t.tax]]){text(label,330,y,10,font,gray);text(money(value),576-font.widthOfTextAtSize(clean(money(value)),10),y,10);y-=19;}
  text(t.unpriced?'TOTAL (incomplete)':'TOTAL',330,y,11,bold);text(money(t.total),576-bold.widthOfTextAtSize(clean(money(t.total)),12),y,12,bold);y-=35;
  if(q.notes){paragraph('Notes',540,11,bold);paragraph(q.notes);}
  for(const [i,p]of pages.entries()){page=p;text(q.number+'  /  '+(i+1)+' of '+pages.length,36,26,8,font,gray);}
  return doc.save();
}
