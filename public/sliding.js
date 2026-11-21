// Five Day's panel-only sliding rules. Dimensions stay in inches until the
// existing Standard Folding / NF / NF workbook calculates component cuts.
export const SLIDING_OVERLAP=1.5;
export const SLIDING_HEIGHT_DEDUCTION=2.875;
export const SLIDING_LAYOUTS={
  2:['FB','BF'],
  3:['FMB','BMF'],
  4:['FFBB','BBFF','BFFB','FBBF','BFBF','FBFB'],
  6:['FFMMBB','BBMMFF','BBFFMM','MMFFBB','FFBBMM','MMBBFF']
};
export const isSliding=o=>o?.sliding!=null;
export const slidingKind=o=>o.sliding?.layout?.includes('M')?'tripass':'bypass';
export const slidingName=o=>slidingKind(o)==='tripass'?'Tripass':'Bypass';
export const slidingCode=o=>[...(o.sliding?.layout||'')].join(' · ');
export const SLIDING_TILT_SIDES={2:'LR',3:'LRR',4:'LLRR',6:'LLLRRR'};
// Panel order is left to right, viewed from inside the room. Track depth does
// not reverse the handing. Front rods retain their centered placement.
export function slidingTiltPosition(o,index){
  if(o.tilt==='Front')return 'Center';
  if(o.tilt==='Smart')return 'Internal';
  return SLIDING_TILT_SIDES[o.sliding.layout.length][index]==='L'?'Left':'Right';
}
export function slidingPanelSchedule(o,result){
  const g=slidingGeometry(o);
  return g.panels.map(p=>({number:p.number,track:p.track,
    width:Number.isFinite(result?.panelWidth)?result.panelWidth:g.panelWidth==null?null:g.panelWidth*25.4,
    height:Number.isFinite(result?.panelHeight)?result.panelHeight:g.panelHeight==null?null:g.panelHeight*25.4,
    quantity:o.quantity,tiltPosition:slidingTiltPosition(o,p.number-1)}));
}
export function slidingGeometry(o){
  const layout=o.sliding?.layout;
  if(o.sliding?.version!==1||!Object.values(SLIDING_LAYOUTS).some(list=>list.includes(layout)))throw Error('Choose a supported bypass or tripass layout.');
  const count=layout.length,tracks=layout.includes('M')?3:2;
  const joints=[...layout].slice(1).map((track,i)=>track!==layout[i]?SLIDING_OVERLAP:0);
  const overlapCount=joints.filter(Boolean).length,sideOverlap=o.mount==='O'?SLIDING_OVERLAP:0;
  const coverageWidth=Number.isFinite(o.width)?o.width+2*sideOverlap:null;
  const panelWidth=coverageWidth==null?null:(coverageWidth+overlapCount*SLIDING_OVERLAP)/count;
  const panelHeight=Number.isFinite(o.height)?o.height-SLIDING_HEIGHT_DEDUCTION:null;
  let x=-sideOverlap;
  const panels=[...layout].map((track,index)=>{
    const panel={number:index+1,track,start:panelWidth==null?null:x,end:panelWidth==null?null:x+panelWidth};
    if(panelWidth!=null)x+=panelWidth-(joints[index]||0);
    return panel;
  });
  return {layout,count,tracks,overlap:SLIDING_OVERLAP,overlapCount,sideOverlap,heightDeduction:SLIDING_HEIGHT_DEDUCTION,coverageWidth,panelWidth,panelHeight,joints,panels};
}
export function setSliding(o,layout){
  const next={...o,sliding:{version:1,layout},frame:'NF',sides:'NF',sizeMethod:'S',stile:'Flat',left:1,right:0};
  delete next.tposts;delete next.frameStyle;delete next.frameSides;
  slidingGeometry(next);
  return next;
}
export function slidingDimensionError(o,key,value){
  if(value==null)return '';
  const g=slidingGeometry({...o,[key]:value});
  if(key==='width'&&(!(value>0)||g.panelWidth<=3.75||g.panelWidth>106))return 'Enter a width that gives each sliding panel more than 3 3/4 inches and no more than 106 inches.';
  if(key==='height'&&(!(g.panelHeight>=1)||g.panelHeight>114))return 'Height must leave a panel between 1 and 114 inches after the 2 7/8 inch allowance.';
  return '';
}
