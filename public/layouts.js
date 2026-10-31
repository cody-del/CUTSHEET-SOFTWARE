import {frameShapes,frameSideStyles,frameDescription} from './frames.js';
// Shared folding geometry for the app, layout choices, and printed cut sheets.
// T-posts divide independent hinge groups. No sliding/bypass layout is modeled.
export const STANDARD_LAYOUTS={
  1:[['1-0','L','1 left'],['0-1','R','1 right']],
  2:[['2-0','LL','2 left'],['1-1','LR','1 left, 1 right'],['0-2','RR','2 right']],
  3:[['2-1','LLR','2 left, 1 right'],['1-2','LRR','1 left, 2 right']],
  4:[['2-2','LLRR','2 left, 2 right']]
};
export const TPOST_LAYOUTS=[
  {id:'single-pair-single',label:'L · T · LR · T · R',description:'1 left, post, left + right, post, 1 right',fractions:[.25,.75],sections:[{left:1,right:0},{left:1,right:1},{left:0,right:1}]},
  ...[2,3,4,5].map(count=>({
    id:count===2?'pair-pair':`pairs-${count}`,
    label:Array(count).fill('LR').join(' · T · '),
    description:`${count} left + right pairs · ${count-1} ${count===2?'post':'posts'}`,
    fractions:Array.from({length:count-1},(_,i)=>(i+1)/count),
    sections:Array.from({length:count},()=>({left:1,right:1}))
  }))
];
export function drawing(o,{louverLayout}={}){
  const shapes=[],left=22,top=28,width=214,height=Math.max(24,width*(o.height||60)/(o.width||48)),bottom=top+height;
  const line=(a,b,tone='#999',weight=.65)=>shapes.push({kind:'line',a,b,tone,weight});
  const polygon=(points,fill='#fff',tone='#777',weight=.8)=>shapes.push({kind:'polygon',points,fill,tone,weight});
  const rectangle=(x,y,w,h,fill='#fff',tone='#777')=>polygon([[x,y],[x+w,y],[x+w,y+h],[x,y+h]],fill,tone);
  // Recessed opening and frame reveal stay behind the outward-folding leaves.
  rectangle(left,top,width,height,'#fafafa','#888');
  polygon([[left,top],[left+5,top-5],[left+width+5,top-5],[left+width,top]],'#f4f4f4');
  polygon([[left+width,top],[left+width+5,top-5],[left+width+5,bottom-5],[left+width,bottom]],'#eee');
  if(!Object.values(frameSideStyles(o)).filter(Boolean).every(f=>f.square))rectangle(left+3,top+3,width-6,height-6,'#fafafa','#bbb');
  shapes.push(...frameShapes(o,{left,top,width,height}));
  const sections=o.tposts?o.tposts.sections:[{left:o.left,right:o.right}],positions=o.tposts?.positions||[],leaves=[],posts=[];
  for(let i=0;i<sections.length;i++){
    const start=i?positions[i-1]:0,end=positions[i]??o.width;
    // Invalid in-progress measurements should not distort the preview or draw off-canvas.
    if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>o.width||end<=start)continue;
    const sx=left+start/o.width*width,sw=(end-start)/o.width*width,s=sections[i],count=s.left+s.right;
    if(!count)continue;
    const pw=(sw-6)/count,projection=pw*.78,depth=Math.min(22,pw*.42);
    for(const [direction,n,anchor] of [[1,s.left,sx+3],[-1,s.right,sx+sw-3]]){
      for(let p=0;p<n;p++){
        const x1=anchor+direction*projection*p,x2=anchor+direction*projection*(p+1),d1=p%2?depth:0,d2=p%2?0:depth;
        leaves.push({x1,x2,d1,d2,hinge:p===0,section:i+1,direction});
      }
    }
    if(i<positions.length)posts.push(sx+sw);
  }
  for(const x of posts)rectangle(x-2.5,top+1,5,height-2,'#e8e8e8','#555');
  const lerp=(a,b,t)=>a+(b-a)*t;
  for(const leaf of leaves.sort((a,b)=>(a.d1+a.d2)-(b.d1+b.d2))){
    const {x1,x2,d1,d2,direction}=leaf;
    const points=[[x1,top+4+d1],[x2,top+4+d2],[x2,bottom-4+d2],[x1,bottom-4+d1]];
    polygon(points,'#fff','#666');
    const edge=(u,v)=>[lerp(x1,x2,u),lerp(top+4,bottom-4,v)+lerp(d1,d2,u)];
    polygon([edge(.1,.06),edge(.9,.06),edge(.9,.94),edge(.1,.94)],'#fafafa','#aaa',.5);
    const hasDivision=o.divider>0&&o.divider<o.height;
    const actualCenter=louverLayout?.dividerFromBottom,louverHeight=louverLayout?.panelHeight;
    const split=hasDivision?Math.max(.075,Math.min(.925,Number.isFinite(actualCenter)&&louverHeight>0?1-actualCenter/louverHeight:1-o.divider/o.height)):null;
    const railHalf=o.divisionMode==='split'?0:.025;
    const spans=split===null?[[.06,.94,louverLayout?.total??(louverLayout===undefined?12:0),'full']]:[
      [.06,split-railHalf,louverLayout?.top??(louverLayout===undefined?Math.round(12*split):0),'top'],
      [split+railHalf,.94,louverLayout?.bottom??(louverLayout===undefined?Math.round(12*(1-split)):0),'bottom']
    ];
    leaf.louvers=[];
    for(const [start,end,count,group]of spans){
      const pitch=(end-start)/Math.max(1,count);
      for(let l=0;l<count;l++){
        const a=start+(l+.16)*pitch,b=start+(l+.84)*pitch;
        polygon([edge(.1,a),edge(.9,a),edge(.9,b),edge(.1,b)],'#fff','#aaa',.45);
        Object.assign(shapes.at(-1),{role:'louver',group,section:leaf.section});
        leaf.louvers.push({group,points:shapes.at(-1).points});
      }
    }
    if(split!==null&&o.divisionMode!=='split'){
      polygon([edge(.1,split-railHalf),edge(.9,split-railHalf),edge(.9,split+railHalf),edge(.1,split+railHalf)],'#eee','#777',.65);
      Object.assign(shapes.at(-1),{role:'divider',section:leaf.section});
    }
    if(o.tilt==='Front'){
      // An opaque rod sits in front of the louvers and follows each leaf's perspective.
      // A divider rail separates the upper and lower louver controls.
      const spans=split===null?[[.1,.9]]:[[.1,Math.min(.9,split-.04)],[Math.max(.1,split+.04),.9]];
      for(const [start,end]of spans)if(end>start){
        polygon([edge(.46,start),edge(.54,start),edge(.54,end),edge(.46,end)],'#fff','#555',.8);
        line(edge(.52,start),edge(.52,end),'#ccc',.45);
      }
    }
    for(const v of [.15,.85]){const point=edge(0,v);line([point[0],point[1]-2],[point[0],point[1]+2],'#333',1.5);}
    // Small hinge-edge markers follow each connected leaf rather than repeating outer jamb hinges.
    leaf.hingeSide=direction===1?'left':'right';
  }
  return {width:260,height:bottom+Math.max(0,...leaves.map(l=>Math.max(l.d1,l.d2)))+36,shapes,leaves,posts,bounds:{left,top,width,height}};
}
export function drawingSVG(o,{thumbnail=false,widthLabel='',heightLabel='',louverLayout}={}){
  const d=drawing(o,{louverLayout}),f=n=>Number(n.toFixed(3)),point=p=>p.map(f).join(',');
  const paths=d.shapes.map(s=>s.kind==='polygon'?`<polygon points="${s.points.map(point).join(' ')}" fill="${s.fill}" stroke="${s.tone}" stroke-width="${s.weight}"/>`:`<line x1="${f(s.a[0])}" y1="${f(s.a[1])}" x2="${f(s.b[0])}" y2="${f(s.b[1])}" stroke="${s.tone}" stroke-width="${s.weight}"/>`).join('');
  const escape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const code=o.tposts?o.tposts.sections.map(s=>'L'.repeat(s.left)+'R'.repeat(s.right)).join(' | T | '):'L'.repeat(o.left)+'R'.repeat(o.right);
  return `<svg class="${thumbnail?'layout-drawing':'diagram'}" viewBox="0 0 ${d.width} ${f(d.height)}" preserveAspectRatio="xMidYMid meet" ${thumbnail?'aria-hidden="true"':`role="img" aria-label="${escape(frameDescription(o))}; Folding layout ${escape(code)}; ${escape(widthLabel)} wide by ${escape(heightLabel)} tall${louverLayout?`; ${louverLayout.divided?`${louverLayout.top} louvers above, ${louverLayout.bottom} below`:`${louverLayout.total} louvers per panel`}`:''}"`}>${paths}${thumbnail?'':`<text x="130" y="13" text-anchor="middle" font-size="9" fill="#666">${escape(widthLabel)}</text><text x="250" y="${f(d.bounds.top+d.bounds.height/2)}" text-anchor="middle" font-size="9" fill="#666" transform="rotate(90 250 ${f(d.bounds.top+d.bounds.height/2)})">${escape(heightLabel)}</text><text x="130" y="${f(d.height-10)}" text-anchor="middle" font-size="9" fill="#555">${escape(code)}</text>`}</svg>`;
}
