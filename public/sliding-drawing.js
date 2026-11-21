import {slidingGeometry,slidingTiltPosition} from './sliding.js';

export function slidingDrawing(o,{louverLayout}={}){
 const g=slidingGeometry(o),shapes=[],labels=[],left=22,top=28,width=214;
 const coverage=g.coverageWidth>0?g.coverageWidth:72,pw=g.panelWidth>0?g.panelWidth:coverage/g.count;
 const ph=g.panelHeight>0?g.panelHeight:60,scale=width/coverage,height=Math.max(24,ph*scale),bottom=top+height;
 const rect=(x,y,w,h,fill='#fff',tone='#777',weight=.65,role)=>{
  const shape={kind:'polygon',points:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]],fill,tone,weight};
  if(role)shape.role=role;shapes.push(shape);return shape;
 };
 const line=(a,b,tone='#aaa',weight=.5)=>shapes.push({kind:'line',a,b,tone,weight});
 const panels=g.panels.map((p,i)=>({...p,x:left+((p.start??i*pw)+g.sideOverlap)*scale,w:pw*scale}));
 // Back-to-front paint order preserves the actual shared stile overlap.
 for(const p of [...panels].sort((a,b)=>({B:0,M:1,F:2})[a.track]-({B:0,M:1,F:2})[b.track])){
  rect(p.x,top,p.w,height,'#fff','#555',.8,'panel');
  const stile=Math.min(p.w*.24,1.875*scale),rail=Math.min(height*.12,3*scale),x=p.x+stile,w=p.w-2*stile;
  const dividerInches=Number.isFinite(louverLayout?.dividerFromBottom)?louverLayout.dividerFromBottom/25.4:o.divider;
  const split=o.divider>0?Math.max(rail,Math.min(height-rail,height-dividerInches/ph*height)):null;
  const half=split===null||o.divisionMode==='split'?0:1.5*scale;
  const spans=split===null?[[rail,height-rail,louverLayout?.total??12,'full']]:[[rail,split-half,louverLayout?.top??6,'top'],[split+half,height-rail,louverLayout?.bottom??6,'bottom']];
  for(const [a,b,count,group]of spans){
   const pitch=(b-a)/Math.max(1,count);
   for(let n=0;n<count;n++)Object.assign(rect(x,top+a+(n+.12)*pitch,w,pitch*.76,'#fafafa','#aaa',.4,'louver'),{group,section:p.number});
   if(o.tilt==='Front'&&b>a)rect(p.x+p.w/2-.6,top+a,1.2,b-a,'#fff','#777',.4,'tiltrod');
  }
  line([x,top+rail],[x, bottom-rail]);line([x+w,top+rail],[x+w,bottom-rail]);
  if(split!==null&&half)Object.assign(rect(x,top+split-half,w,2*half,'#eee','#888',.5,'divider'),{section:p.number});
 }
 // Bird's-eye layout separates the tracks without inventing folding hinges.
 const trackTop=bottom+23,trackY={B:trackTop,M:trackTop+14,F:trackTop+(g.tracks-1)*14};
 for(const track of g.tracks===3?['B','M','F']:['B','F']){
  labels.push({x:9,y:trackY[track]+3,text:track,size:7,role:'track'});
  line([left,trackY[track]],[left+width,trackY[track]],'#ccc',.4);
 }
 for(const p of panels){
  rect(p.x,trackY[p.track]-2,p.w,4,'#555','#fff',.4,'track-panel');
  const position=slidingTiltPosition(o,p.number-1);
  labels.push({x:p.x+p.w/2,y:trackY[p.track]-5,text:`${p.number} ${position[0]}`,size:6,role:'panel',panel:p.number,tiltPosition:position});
 }
 // Visual seams only: same-track panels still meet at the exact same coordinate.
 for(let i=1;i<panels.length;i++)if(panels[i-1].track===panels[i].track){
  const p=panels[i];shapes.push({kind:'line',a:[p.x,trackY[p.track]-2],b:[p.x,trackY[p.track]+2],tone:'#fff',weight:1,role:'panel-separator'});
 }
 return {width:260,height:trackTop+(g.tracks-1)*14+28,shapes,labels,leaves:panels,posts:[],bounds:{left,top,width,height}};
}

// Layout-card illustration; separators do not change manufacturing geometry.
export function slidingLayoutThumbnail(layout){
 const tracks=[...layout],cell=160/tracks.length,y={B:8,M:24,F:40};
 const bars=tracks.map((track,i)=>`<rect x="${10+i*cell}" y="${y[track]}" width="${cell+(i<tracks.length-1&&track!==tracks[i+1]?3:0)}" height="4" rx="1" fill="currentColor"/>`).join('');
 const seams=tracks.map((track,i)=>i&&track===tracks[i-1]?`<line data-role="panel-separator" x1="${10+i*cell}" x2="${10+i*cell}" y1="${y[track]}" y2="${y[track]+4}" stroke="#fff" stroke-width="1.5"/>`:'').join('');
 return `<svg viewBox="0 0 180 52" aria-hidden="true">${bars}${seams}</svg>`;
}
