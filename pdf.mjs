import {supportsCutSheets,CUT_SHEETS_ONLY} from './public/products.js';
import {drawing} from './public/layouts.js';
import {cutSheetFacts,cutSheetNotes,louverSummary,machiningLabel,firstLouverHole} from './public/cut-sheet.js';
import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {calculate,combinedParts,ValidationError,configuration} from './calculations.mjs';
const COLORS={W:'White',OW:'Off-white',SC:'Swiss coffee'};
const ascii=s=>String(s??'').normalize('NFKD').replace(/×/g,'x').replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/·/g,'  ').replace(/[–—]/g,'-').replace(/[^\x20-\x7e\n]/g,'');
export async function createPDF(job,{combined=false,units='mm'}={}){
  if(!job||!Array.isArray(job.openings)||job.openings.length<1||job.openings.length>100)throw new ValidationError('Add between 1 and 100 openings.');
  if(!supportsCutSheets(job))throw new ValidationError(CUT_SHEETS_ONLY);
  const results=job.openings.map(o=>({o,result:calculate(o)}));
  for(const {o,result}of results)if(result.warnings.length)throw new ValidationError(`${o.name}: ${result.warnings.join('; ')}`);
  const pdf=await PDFDocument.create(),regular=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  pdf.setTitle(`${job.number||'Job'} - ${combined?'Combined cutting list':'Cut sheets'}`);pdf.setAuthor('Cut sheet');
  const ink=rgb(.08,.08,.08),muted=rgb(.4,.4,.4),pale=rgb(.95,.95,.95),white=rgb(1,1,1),line=rgb(.87,.87,.87);
  const margin=32,width=548,floor=54,length=n=>units==='in'?(n/25.4).toFixed(4):n.toFixed(2);
  let page,y,openingLabel='';
  function text(s,x,yy,size=9,font=regular,color=ink){page.drawText(ascii(s),{x,y:yy,size,font,color});}
  function wrap(s,w,size=9,font=regular){const lines=[];for(const paragraph of ascii(s).split('\n')){let current='';for(const word of paragraph.split(/\s+/)){if(font.widthOfTextAtSize(word,size)>w){if(current){lines.push(current);current='';}let part='';for(const ch of word){if(font.widthOfTextAtSize(part+ch,size)>w){lines.push(part);part='';}part+=ch;}current=part;continue;}if(current&&font.widthOfTextAtSize(current+' '+word,size)>w){lines.push(current);current=word;}else current+=(current?' ':'')+word;}lines.push(current);}return lines;}
  function rect(x,yy,w,h,color,border=false){page.drawRectangle({x,y:yy,width:w,height:h,color,...(border?{borderColor:line,borderWidth:.5}:{})});}
  function newPage(title=''){
    page=pdf.addPage([612,792]);text('CUT SHEET'+(job.revision>1?' · REVISION '+job.revision+' · Replaces earlier copies':''),margin,759,9,bold);text(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(new Date()),519,759,8,regular,muted);
    const jobLines=wrap(`${job.number||'Unnumbered job'}${job.customer?'   '+job.customer:''}`,width,9);
    jobLines.forEach((l,i)=>text(l,margin,742-i*11,9,regular,muted));y=724-(jobLines.length-1)*11;
    if(title){for(const l of wrap(title,width,16,bold)){text(l,margin,y,16,bold);y-=20;}}
  }
  function ensure(height,title='continued'){if(y-height<floor)newPage(`${openingLabel?openingLabel+'  ':''}${title}`);}
  function paragraph(value,{size=8.5,boldText=false}={}){
    const font=boldText?bold:regular;
    for(const l of wrap(value,width,size,font)){ensure(size+5);text(l,margin,y-size,size,font);y-=size+4;}y-=3;
  }
  function factsLayout(items,{w=width,columns=2,compact=false,dense=false}={}){
    const gap=5,cw=(w-gap*(columns-1))/columns,size=compact?8.2:9,rows=[];
    for(let i=0;i<items.length;i+=columns){
      const group=items.slice(i,i+columns).map(([label,value])=>({label:wrap(label,cw-14,7),value:wrap(value,cw-14,size,bold)}));
      const height=Math.max(...group.map(c=>(dense?3:11)+c.label.length*8+c.value.length*(size+2)));
      rows.push({group,height});
    }
    return {gap,cw,size,rows,height:rows.reduce((sum,row)=>sum+row.height+gap,0)};
  }
  function facts(items,{x=margin,...options}={}){
    const {gap,cw,size,rows}=factsLayout(items,options),start=y;
    for(const {group,height}of rows){
      ensure(height+gap,'Machining continued');
      group.forEach((cell,col)=>{const xx=x+col*(cw+gap);rect(xx,y-height,cw,height,col%2===0?pale:white,true);let yy=y-10;const keyDatum=cell.label.join(' ')==='Whole distance';cell.label.forEach(l=>{text(l,xx+7,yy,7,keyDatum?bold:regular,keyDatum?ink:muted);yy-=8;});cell.value.forEach(l=>{text(l,xx+7,yy,size,bold);yy-=size+2;});});
      y-=height+gap;
    }
    return start-y;
  }
  function schematic(o,result,x,top,w,h){
    const scene=drawing(o,{louverLayout:result.louverLayout}),scale=Math.min(w/scene.width,h/scene.height),dx=x+(w-scene.width*scale)/2,dy=top;
    const tone=hex=>{const v=parseInt(hex.slice(1),16);return hex.length===4?rgb(((v>>8)&15)/15,((v>>4)&15)/15,(v&15)/15):rgb((v>>16)/255,((v>>8)&255)/255,(v&255)/255);};
    for(const s of scene.shapes){if(s.kind==='line')page.drawLine({start:{x:dx+s.a[0]*scale,y:dy-s.a[1]*scale},end:{x:dx+s.b[0]*scale,y:dy-s.b[1]*scale},thickness:s.weight*scale,color:tone(s.tone)});
      else page.drawSvgPath(s.points.map((p,i)=>`${i?'L':'M'} ${p[0]} ${p[1]}`).join(' ')+' Z',{x:dx,y:dy,scale,color:tone(s.fill),borderColor:tone(s.tone),borderWidth:s.weight});}
    wrap(louverSummary(result),w,8).forEach((l,i)=>text(l,x+(w-regular.widthOfTextAtSize(ascii(l),8))/2,top-h-5-i*10,8,regular,muted));
  }
  function tableColumns(w,small,isCombined){
    if(isCombined)return {name:161,qty:175,cut:230,cutCheck:302,partialCheck:355,refs:392,refsWidth:w-400};
    if(small)return {name:w-166,qty:w-154,cut:w-122,cutCheck:w-68,partialCheck:w-25};
    return {name:w*.48-17,qty:w*.48,cut:w*.59,cutCheck:w-107,partialCheck:w-42};
  }
  function tableHeader(x,w,yy,small=false,isCombined=false){
    const c=tableColumns(w,small,isCombined);rect(x,yy-19,w,19,ink);
    text('PART / PROFILE',x+7,yy-12,7,bold,white);text('QTY',x+c.qty,yy-12,7,bold,white);text(`SIZE (${units})`,x+c.cut,yy-12,7,bold,white);
    for(const [label,center]of [['CUT',c.cutCheck],['PARTIALLY CUT',c.partialCheck]]){
      const size=small?5.8:6.5;text(label,x+center-bold.widthOfTextAtSize(label,size)/2,yy-12,size,bold,white);
    }
    if(isCombined)text('OPENINGS',x+c.refs,yy-12,7,bold,white);
  }
  function rowData(p,w,small,isCombined=false,scale=1){
    const c=tableColumns(w,small,isCombined),title=p.name.replace(' · ',' ')+(p.section?`  S${p.section}`:''),nameSize=(small?8:9)*scale,profileSize=7*scale,valueSize=(small?9:10)*scale;
    const name=wrap(title,c.name,nameSize,bold),profile=wrap(p.profile,c.name,profileSize);
    const refs=isCombined?wrap(p.openings.map(o=>`${o.name} (${o.quantity})`).join(', '),c.refsWidth,7):[];
    const baseHeight=Math.max(small?20:22,(small?3:5)+name.length*(nameSize+1)+profile.length*(profileSize+1),refs.length*9+7);
    return {p,name,profile,refs,nameSize,profileSize,valueSize,baseHeight,height:baseHeight};
  }
  function row(data,x,w,top,index,small,isCombined=false){
    const {p,name,profile,refs,nameSize,profileSize,valueSize,baseHeight,height}=data,c=tableColumns(w,small,isCombined);rect(x,top-height,w,height,index%2===0?pale:white);
    let yy=top-(height-baseHeight)/2-nameSize-(small?0:1);name.forEach(l=>{text(l,x+7,yy,nameSize,bold);yy-=nameSize+1;});profile.forEach(l=>{text(l,x+7,yy,profileSize,regular,muted);yy-=profileSize+1;});
    const center=top-height/2,numberY=isCombined?top-14:center-valueSize*.3;
    text(p.quantity,x+c.qty,numberY,valueSize,bold);text(length(p.length),x+c.cut,numberY,valueSize,bold);
    // Printed status is intentionally blank; paper marks are independent of digital progress.
    // A continued combined row keeps just one pair of checkboxes with its quantity.
    if(p.quantity!=='')for(const offset of [c.cutCheck,c.partialCheck])page.drawRectangle({x:x+offset-4,y:isCombined?top-16:center-4,width:8,height:8,color:white,borderColor:muted,borderWidth:.7});
    if(isCombined)refs.forEach((l,i)=>text(l,x+c.refs,top-11-i*9,7));
  }
  function partTables(parts,isCombined=false,maxHeight=0){
    // Longer section lists use two readable columns instead of a mostly empty second page.
    const gap=12;
    function layout(columns,scale=1){
      const w=(width-gap*(columns-1))/columns,small=columns===2,size=Math.ceil(parts.length/columns);
      const groups=Array.from({length:columns},(_,i)=>parts.slice(i*size,(i+1)*size).map(p=>rowData(p,w,small,isCombined,scale)));
      return {columns,w,small,groups,height:19+Math.max(...groups.map(group=>group.reduce((sum,row)=>sum+row.height,0)))+12};
    }
    let plan=layout(!isCombined&&parts.length>16?2:1);
    if(!isCombined&&maxHeight>0){
      if(plan.columns===1&&plan.height>maxHeight&&parts.length>10){const compact=layout(2);if(compact.height<=maxHeight)plan=compact;}
      // Enlarge only after reserving the actual machining, notes and bottom checklist.
      for(const scale of [1.2,1.1]){const larger=layout(plan.columns,scale);if(larger.height<=maxHeight){plan=larger;break;}}
      const extra=Math.max(0,maxHeight-plan.height),count=Math.max(...plan.groups.map(group=>group.length));
      for(const group of plan.groups)for(const data of group)data.height+=extra/count;
    }
    const {columns,w,small,groups}=plan;
    const top=y;let bottom=y;
    for(let col=0;col<columns;col++){
      y=top;const x=margin+col*(w+gap);tableHeader(x,w,y,small,isCombined);y-=19;
      let index=0;
      for(const data of groups[col]){
        const {p}=data;
        // A combined row can carry many room references; keep every reference with its cut.
        const referenceChunks=isCombined&&data.height>y-floor?Math.max(1,Math.floor((y-floor-8)/9)):data.refs.length;
        if(isCombined&&data.refs.length>referenceChunks){
          for(let i=0;i<data.refs.length;i+=referenceChunks){const chunk={...data,refs:data.refs.slice(i,i+referenceChunks),p:{...p,quantity:i?'':p.quantity}};chunk.height=Math.max(22,5+chunk.name.length*(chunk.nameSize+1)+chunk.profile.length*8,chunk.refs.length*9+7);chunk.baseHeight=chunk.height;
            if(y-chunk.height<floor){newPage('Combined cutting list continued');tableHeader(x,w,y,small,true);y-=19;}
            row(chunk,x,w,y,index++,small,true);y-=chunk.height;
          }
        }else{
          if(y-data.height<floor){newPage(`${openingLabel?openingLabel+'  ':''}Cutting list continued`);tableHeader(x,w,y,small,isCombined);y-=19;}
          row(data,x,w,y,index++,small,isCombined);y-=data.height;
        }
      }
      bottom=Math.min(bottom,y);
    }
    y=bottom-12;
  }
  function completionLayout(openings){
    const tilts=[...new Set(openings.map(o=>o.tilt==='Smart'?'Smart View':`${o.tilt} tilt`))].join(' / ');
    const gap=5,w=(width-gap*5)/6;
    const labels=[['Louvers notched',tilts],['Stiles capped'],['Louvers capped'],['Stiles and rails bored'],['Panels built and pressed'],['Hinged / complete']]
      .map(lines=>lines.flatMap(label=>wrap(label,w-12,8,bold)));
    const height=Math.max(44,...labels.map(lines=>lines.length*9+22));
    return {gap,w,labels,height};
  }
  function completionChecklist(openings){
    const {gap,w,labels,height}=completionLayout(openings);
    ensure(height+6,'Shop progress');
    const top=floor+height;
    labels.forEach((lines,i)=>{
      const x=margin+i*(w+gap);rect(x,floor,w,height,i%2===0?pale:white,true);
      lines.forEach((label,j)=>text(label,x+6,top-12-j*9,8,bold));
      for(const [label,offset]of [['Partial',6],['Complete',43]]){
        page.drawRectangle({x:x+offset,y:floor+8,width:7,height:7,color:white,borderColor:muted,borderWidth:.7});
        text(label,x+offset+10,floor+9,7);
      }
    });
    y=floor;
  }
  if(combined){
    newPage('Combined cutting list');paragraph(`${job.openings.length} openings. Parts grouped by exact size, profile and finish.`);
    partTables(combinedParts(job.openings).map(p=>({...p,profile:`${COLORS[p.color]}   ${p.profile}`})),true);
    for(const {o,result}of results){
      const notes=[o.divisionMode==='split'?'Split tilt-rod mode':'',Number.isFinite(result.gap)?`Light gap ${length(result.gap)} ${units}`:'',o.tposts?`${configuration(o)}; post centerlines ${o.tposts.positions.map(v=>length(v*25.4)).join(', ')} ${units}`:'',...cutSheetNotes(result),o.notes].filter(Boolean);
      if(notes.length)paragraph(`${o.name}: ${notes.join('. ')}`);
    }
    completionChecklist(job.openings);
  }else for(let index=0;index<results.length;index++){
    const {o,result}=results[index];openingLabel=`${String(index+1).padStart(2,'0')}  ${o.name||'Untitled opening'}`;newPage(openingLabel);
    const firstHole=firstLouverHole(result),summary=cutSheetFacts(o,result,{length,units}),top=y;
    // Keep the drilling datum next to quantity without adding height to a
    // densely populated T-post page. Preserve the input basis with dimensions.
    facts([summary[1],['Whole distance',firstHole===null?'Not available':length(firstHole)+' '+units],
      [`${summary[0][0]} · ${summary[6][1]}`,summary[0][1]],...summary.slice(2,6),summary[7]],
      {w:350,compact:true,dense:result.parts.length>12});
    schematic(o,result,397,top,183,Math.min(130,top-y-15));
    y-=5;
    if(o.tposts)paragraph(`${o.tposts.construction==='two-piece'?'Two-piece':'One-piece'} posts. Centerlines from left (${units}): ${o.tposts.positions.map(v=>length(v*25.4)).join('   ')}`);
    if(o.divider)paragraph(`${o.divisionMode==='split'?'Split':'Divider'} input from bottom: ${length(o.divider*25.4)} ${units}.`);
    const machining=[['Hinges from stile end',result.hinges.map(length).join(', ')],...result.machining.map(m=>[machiningLabel(m.label),length(m.value)])];
    const machiningOptions={columns:machining.length>6?3:2,compact:true,dense:result.parts.length>12},notes=cutSheetNotes(result);
    const paragraphHeight=(value,size=8.5)=>wrap(value,width,size).length*(size+4)+3;
    const remaining=16+factsLayout(machining,machiningOptions).height+3+notes.reduce((sum,note)=>sum+paragraphHeight(note,8),0)+(o.notes?paragraphHeight(`Shop notes: ${o.notes}`):0)+completionLayout([o]).height+12;
    partTables(result.parts,false,y-floor-remaining);
    ensure(48,'Machining continued');text(`MACHINING (${units})`,margin,y-8,8,bold);y-=16;
    facts(machining,machiningOptions);
    y-=3;for(const note of notes)paragraph(note,{size:8});
    if(o.notes)paragraph(`Shop notes: ${o.notes}`);
    completionChecklist([o]);
  }
  const pages=pdf.getPages();pages.forEach((p,i)=>{page=p;page.drawLine({start:{x:margin,y:40},end:{x:580,y:40},thickness:.5,color:line});text(`Cut lengths in ${units}`,margin,27,7,regular,muted);text(`${i+1} / ${pages.length}`,550,27,8,regular,muted);});
  return pdf.save();
}
