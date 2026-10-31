// Appearance stays distinct; confirmed aliases share the named workbook cutting rules.
export const FRAME_STYLES=[
  {id:'ST',name:'Standard frame',group:'Outside mount',profile:'ST',square:true,bands:[5]},
  {id:'MS',name:'Modern Standard frame',group:'Outside mount',profile:'ST',square:true,bands:[7]},
  {id:'DS',name:'Designer frame',group:'Outside mount',profile:'DS',bands:[11,9,7,4,2]},
  {id:'TR',name:'Trim frame',group:'Inside mount',profile:'TR',bands:[4,2]},
  {id:'MZ',name:'Modern Z frame',group:'Inside mount',profile:'ZF',bands:[10,3]},
  {id:'ZF',name:'Z frame',group:'Inside mount',profile:'ZF',bands:[9,7,4,2]},
  {id:'EL',name:'Elegance frame',group:'Inside mount',profile:'ZF',bands:[12,10,8,6,4,2]},
  {id:'HS',name:'Hanging strip',group:'Additional profiles',profile:'HS',bands:[3],available:false}
];
// Retain the identity of older saved EX openings without offering it for new choices.
const legacyExtended={id:'EX',name:'Extended frame (legacy)',profile:'EX',bands:[10,7,2]};
export const frameStyle=o=>FRAME_STYLES.find(f=>f.id===(o.frameStyle||o.frame))||(o.frame==='EX'?legacyExtended:FRAME_STYLES[0]);
// Older preview-only records may have a different fallback profile. Resolve only
// these confirmed aliases, leaving unsupported or mismatched canonical styles invalid.
export function normalizeFrame(o){const profile={MS:'ST',MZ:'ZF',EL:'ZF'}[o?.frameStyle];return profile?{...o,frame:profile}:o;}
export const frameNotice=o=>frameStyle(o).profile?'':`${frameStyle(o).name}: visual preview only. Cutting deductions still need confirmation before a cut sheet can be generated.`;
export const FRAME_EDGES=['top','bottom','left','right'];
export const FRAME_SETUPS={'4W':'Same frame on all four sides','4S':'Standard (L) frame on bottom',CW:'Custom · choose each side'};
export const frameSetupLabel=o=>FRAME_SETUPS[o.sides]||({'3W':'3 sides · saved window setup','3D':'3 sides · saved door setup'}[o.sides]||o.sides);
export function frameSideStyles(o){
 const selected=frameStyle(o);
 return Object.fromEntries(FRAME_EDGES.map(side=>[side,o.sides==='CW'?FRAME_STYLES.find(f=>f.id===o.frameSides?.[side])||selected:o.sides==='4S'&&side==='bottom'?FRAME_STYLES[0]:side==='bottom'&&['3W','3D'].includes(o.sides)?null:selected]));
}
export function frameDescription(o){
 if(o.sides==='CW')return FRAME_EDGES.map(side=>`${side[0].toUpperCase()+side.slice(1)}: ${frameSideStyles(o)[side].name.replace(/ frame$/i,'')}`).join('; ');
 return frameStyle(o).name+(o.sides==='4S'?' · Standard (L) bottom':'');
}
// The workbook has one main profile and an ST override for each edge.
// Other profile codes in a custom cell are silently treated as the main profile.
export function frameCuttingPlan(o){
 const styles=frameSideStyles(o),profiles=[...new Set(Object.values(styles).filter(Boolean).map(f=>f.profile))],main=profiles.find(p=>p!=='ST')||'ST';
 if(o.sides==='CW'&&profiles.filter(p=>p!=='ST').length>1)return {warning:'This custom setup mixes different trim profiles. Confirm its frame cuts before sending it to Production.'};
 if(['CW','4S'].includes(o.sides)&&profiles.includes('DS')&&profiles.includes('ST'))return {warning:'Designer with a Standard (L) side needs its sill cuts confirmed. The original program uses a special Designer sill.'};
 return {profile:o.sides==='CW'?main:o.frame,sides:Object.fromEntries(FRAME_EDGES.map(side=>[side,styles[side]?.profile||'']))};
}
// Standard profiles have a plain square face. Decorative profiles retain moulding.
// Three-sided frames omit the sill in either construction.
export function frameShapes(o,{left,top,width,height}){
 if(['CW','4S'].includes(o.sides))return Object.entries(frameSideStyles(o)).flatMap(([side,style])=>frameShapes({frame:style.profile,frameStyle:style.id,sides:'4W'},{left,top,width,height}).filter(shape=>shape.side===side));
 const style=frameStyle(o),shapes=[],right=left+width,bottom=top+height,three=o.sides==='3W'||o.sides==='3D';
 if(style.square){
  const b=style.bands[0],face=(x,y,w,h,side)=>shapes.push({kind:'polygon',points:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]],fill:'#fff',tone:'#888',weight:.65,side,frameStyle:style.id});
  face(left-b,top-b,width+2*b,b,'top');
  face(left-b,top,b,height,'left');
  face(right,top,b,height,'right');
  if(!three)face(left-b,bottom,width+2*b,b,'bottom');
  return shapes;
 }
 for(const [i,b]of style.bands.entries()){
  const fill=i%2?'#f1f1f1':'#fff',tone=i===0?'#666':'#aaa';
  const poly=(points,side)=>shapes.push({kind:'polygon',points,fill,tone,weight:i===0?.85:.45,side,frameStyle:style.id});
  if(style.id!=='HS')poly([[left-b,top-b],[right+b,top-b],[right,top],[left,top]],'top');
  poly([[left-b,top-b],[left,top],[left,bottom],[left-b,bottom+(three?0:b)]],'left');
  poly([[right,top],[right+b,top-b],[right+b,bottom+(three?0:b)],[right,bottom]],'right');
  if(!three&&style.id!=='HS')poly([[left,bottom],[right,bottom],[right+b,bottom+b],[left-b,bottom+b]],'bottom');
 }
 return shapes;
}
// The seven catalogue photos have an edited sky backdrop. Keep their silhouettes
// inside each card with frame and shutter ending together; the shared background
// is sampled from a product-free sky area of the same image.
const FRAME_PHOTOS={
 ST:{box:[115,262,236,261],outline:'116,276 134,263 350,283 350,521 116,521'},
 MS:{box:[107,678,241,265],outline:'108,693 126,679 346,700 346,941 108,941'},
 DS:{box:[90,1088,277,311],outline:'92,1092 98,1089 365,1114 365,1397 92,1397'},
 TR:{box:[608,262,223,254],outline:'609,264 828,285 828,514 609,514'},
 MZ:{box:[612,580,224,254],outline:'614,581 834,602 834,832 614,832'},
 ZF:{box:[607,907,215,251],outline:'608,909 820,932 820,1156 608,1156'},
 EL:{box:[595,1218,244,267],outline:'597,1220 837,1249 837,1483 597,1483'}
};
export function frameThumbnail(id){
 const photo=FRAME_PHOTOS[id];
 if(photo){const [x,y,w,h]=photo.box;return `<svg class="frame-thumbnail frame-photo" data-frame="${id}" viewBox="${x-7} ${y-7} ${w+14} ${h+14}" aria-hidden="true"><image href="/assets/frame-sky.png" width="1000" height="1573" style="clip-path:polygon(${photo.outline.split(' ').map(p=>p.split(',').map(n=>n+'px').join(' ')).join(',')})"/></svg>`;}
 // No photograph was supplied for the retained hanging-strip option.
 return `<svg class="frame-thumbnail" viewBox="0 0 140 150" aria-hidden="true"><path d="M24 15H38V135H24Z" fill="#eee" stroke="#777"/><path d="M38 15H124V135H38Z" fill="#fff" stroke="#999"/><path d="M43 43H124M43 68H124M43 93H124M43 118H124" stroke="#aaa"/><path d="M43 45H124M43 70H124M43 95H124M43 120H124" stroke="#ddd" stroke-width="3"/></svg>`;
}
