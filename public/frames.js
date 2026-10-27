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
// Standard profiles have a plain square face. Decorative profiles retain moulding.
// Three-sided frames omit the sill in either construction.
export function frameShapes(o,{left,top,width,height}){
 const style=frameStyle(o),shapes=[],right=left+width,bottom=top+height,three=o.sides==='3W'||o.sides==='3D';
 if(style.square){
  const b=style.bands[0],face=(x,y,w,h)=>shapes.push({kind:'polygon',points:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]],fill:'#fff',tone:'#888',weight:.65});
  face(left-b,top-b,width+2*b,b);
  face(left-b,top,b,height);
  face(right,top,b,height);
  if(!three)face(left-b,bottom,width+2*b,b);
  return shapes;
 }
 for(const [i,b]of style.bands.entries()){
  const fill=i%2?'#f1f1f1':'#fff',tone=i===0?'#666':'#aaa';
  const poly=points=>shapes.push({kind:'polygon',points,fill,tone,weight:i===0?.85:.45});
  if(style.id!=='HS')poly([[left-b,top-b],[right+b,top-b],[right,top],[left,top]]);
  poly([[left-b,top-b],[left,top],[left,bottom],[left-b,bottom+(three?0:b)]]);
  poly([[right,top],[right+b,top-b],[right+b,bottom+(three?0:b)],[right,bottom]]);
  if(!three&&style.id!=='HS')poly([[left,bottom],[right,bottom],[right+b,bottom+b],[left-b,bottom+b]]);
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
