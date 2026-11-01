// Elegant North American Broadleaf, 2026 binder pp. 7–9, 14–16, 23, 25.
// Quote specifications only: these are not ShutterSmart manufacturing rules.
export const BROADLEAF_ID='elegant-shutters';
export const BROADLEAF_OPTIONS={
 model:{'3.5':'3½-inch louvers','4.5':'4½-inch louvers'},
 color:{'':'Choose a color','110':'Bright White · 110','001':'Pure White · 001','003':'Silk White · 003'},
 reference:{MFF:'Finished size (MFF)',WS:'Window size (WS)'},mount:{O:'Outside mount (OM)',I:'Inside mount (IM)'},
 tilt:{front:'Front tilt – Standard',hidden:'Hidden tilt'},
 sides:{'4':'4 sided','3-sill':'3 sided w/ sill plate','3':'3 sided','3-inverted':'3 sided inverted (café)','2-sill':'2 sided w/ sill plate','2':'2 sided'},
 buildout:{'0':'None','0.5':'0.5″','1':'1″','1.5':'1.5″'},
 divider:{none:'None','1-location':'1 divider rail – Specify location','2-location':'2 divider rails – Specify locations','1-even':'1 divider rail – Split evenly','2-even':'2 divider rails – Split evenly'},
 postSize:{'1':'1″ T-post','2':'2″ T-post'},face:{beaded:'Beaded',flat:'Flat'},
 hinge:{'':'Choose a hinge color',paint:'Paint hinge – Paint coordinate',brass:'Specialty hinge – Polished Brass',steel:'Specialty hinge – Stainless Steel',bronze:'Specialty hinge – Oil-Rub Bronze',black:'Specialty hinge – Black'},
 configuration:{'':'Choose a panel configuration',L:'1 panel – L',R:'1 panel – R',LL:'2 panels – LL',LR:'2 panels – LR',RR:'2 panels – RR',LLR:'3 panels – LLR',LRR:'3 panels – LRR',LLRR:'4 panels – LLRR'}
};
export const BROADLEAF_FRAMES=[
 {id:'HS107',name:'Hanging Strip (HS107)',mounts:['I','O'],extension:null},
 {id:'SL10',name:'1″ L Frame (SL10)',mounts:['O'],extension:1.5},
 {id:'FL10',name:'Flat L Frame (FL10)',mounts:['O'],extension:1.5},
 {id:'FLF88',name:'French Door L Frame (FLF88)',mounts:['O'],extension:1.5},
 {id:'DF20',name:'2″ Camber Insert Deco Frame (DF20)',mounts:['O'],extension:2.75},
 {id:'CF20',name:'2″ Classic Insert Deco Frame (CF20)',mounts:['O'],extension:2.75},
 {id:'BZ17',name:'Bullnose Z Frame (BZ17)',mounts:['I'],extension:1},
 {id:'DZ25',name:'2.5″ Deluxe Z Frame (DZ25)',mounts:['I'],extension:1.5},
 {id:'FZ23',name:'Flat Z Frame (FZ23)',mounts:['I'],extension:1.345},
 {id:'EZ30',name:'3″ Elegant Z Frame (EZ30)',mounts:['I'],extension:2},
 {id:'CZ22',name:'2¼″ Crown Z Frame (CZ22)',mounts:['I'],extension:1.25},
 {id:'TZ88',name:'Colonial Tilt Out Z Frame (TZ88)',mounts:['I'],extension:.75},
 {id:'NF',name:'No frame / Direct mount',mounts:['I','O'],extension:0}
];
export const broadleafFrames=mount=>BROADLEAF_FRAMES.filter(f=>f.mounts.includes(mount));
export const broadleafFrame=id=>BROADLEAF_FRAMES.find(f=>f.id===id);
export const broadleafManualTip=b=>b.reference==='WS'&&b.mount==='O'&&b.frame==='HS107';
export const broadleafMeasure=n=>n==null?'Not entered':String(Math.round(n*10000)/10000);
export function defaultBroadleaf(){return {model:'3.5',color:'',sideBySide:false,reference:'MFF',mount:'O',tilt:'front',splitLocation:null,frame:'',sides:'4',buildout:'0',divider:'none',dividerLocations:[],postCount:0,postSize:'1',postFace:'beaded',postLocations:[],sections:[''],stileFace:'beaded',hinge:'',sillCap:false,waiveWarranty:false,tipWidth:null,tipHeight:null};}
const enumKeys={model:'model',color:'color',reference:'reference',mount:'mount',tilt:'tilt',sides:'sides',buildout:'buildout',divider:'divider',postSize:'postSize',postFace:'face',stileFace:'face',hinge:'hinge'};
function dimension(v,label){if(v==null||v===0)return null;if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>10000)throw new Error('Enter a valid '+label+' in inches.');return v;}
export function normalizeBroadleaf(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Enter valid Broadleaf options.');
 const b={...defaultBroadleaf()};
 for(const [key,options]of Object.entries(enumKeys)){const v=value[key]??b[key];if(!Object.hasOwn(BROADLEAF_OPTIONS[options],v))throw new Error('Choose a valid '+key+'.');b[key]=String(v);}
 for(const key of ['sideBySide','sillCap','waiveWarranty']){const v=value[key]??b[key];if(typeof v!=='boolean')throw new Error('Choose yes or no for '+key+'.');b[key]=v;}
 b.frame=value.frame??'';if(b.frame&&!broadleafFrames(b.mount).some(f=>f.id===b.frame))throw new Error('Choose a frame for the selected mount.');
 b.splitLocation=dimension(value.splitLocation,'tilt bar split location');
 b.postCount=value.postCount??0;if(!Number.isInteger(b.postCount)||b.postCount<0||b.postCount>4)throw new Error('Choose zero to four T-posts.');
 for(const key of ['postLocations','dividerLocations','sections'])if(value[key]!==undefined&&!Array.isArray(value[key]))throw new Error('Enter valid '+key+'.');
 b.postLocations=Array.from({length:b.postCount},(_,i)=>dimension(value.postLocations?.[i],'T-post location'));
 b.sections=Array.from({length:b.postCount+1},(_,i)=>{const v=value.sections?.[i]??'';if(!Object.hasOwn(BROADLEAF_OPTIONS.configuration,v))throw new Error('Choose a valid panel configuration.');return v;});
 b.dividerLocations=Array.from({length:b.divider.endsWith('-location')?Number(b.divider[0]):0},(_,i)=>dimension(value.dividerLocations?.[i],'divider rail location'));
 if(!b.postCount){b.postSize='1';b.postFace='beaded';}
 if(b.postCount&&b.postSize==='2'){
  if(['DF20','CF20'].includes(b.frame))throw new Error('Deco frames require a 1-inch T-post.');
  if(b.postFace!=='beaded')throw new Error('The 2-inch T-post is available with a beaded face only.');
 }
 if(broadleafManualTip(b)){b.tipWidth=dimension(value.tipWidth,'tip-to-tip width');b.tipHeight=dimension(value.tipHeight,'tip-to-tip height');}
 return b;
}
export function broadleafDimensionError(key,value){const [min,max]=key==='width'?[8,572]:[10,144];return value==null?'':!Number.isFinite(value)||value<min||value>max?`${key==='width'?'Width':'Height'} must be between ${min} and ${max} inches.`:'';}
export function broadleafTipSize(opening){
 // Preserve legacy generic Broadleaf quotes and orders exactly as saved.
 if(!opening.broadleaf)return {width:opening.width,height:opening.height,issues:[]};
 const b=normalizeBroadleaf(opening.broadleaf),base={width:opening.width,height:opening.height,issues:[]};
 if(b.reference==='MFF')return base;
 if(!b.frame)return {...base,width:null,height:null,issues:['Choose a frame to calculate the tip-to-tip size.']};
 if(broadleafManualTip(b))return {width:b.tipWidth,height:b.tipHeight,issues:b.tipWidth&&b.tipHeight?[]:['Enter the measured tip-to-tip width and height for this hanging strip.']};
 const edge=b.frame==='HS107'?0:broadleafFrame(b.frame).extension;
 // Both vertical sides are framed. Sill plates do not add to height (p. 23).
 const verticalEdges=b.sides==='4'?2:b.sides.startsWith('3')?1:0;
 return {...base,width:base.width==null?null:base.width+2*edge,height:base.height==null?null:base.height+verticalEdges*edge};
}
export function validateBroadleafOpening(opening,{complete=false}={}){
 const b=normalizeBroadleaf(opening.broadleaf);
 for(const key of ['width','height']){const error=broadleafDimensionError(key,opening[key]);if(error)throw new Error(error);if(complete&&opening[key]==null)throw new Error('Enter width and height.');}
 if(!complete)return b;
 for(const [key,label]of [['color','color'],['frame','frame type'],['hinge','hinge color']])if(!b[key])throw new Error('Choose a '+label+'.');
 if(b.sections.some(v=>!v))throw new Error('Choose a panel configuration for every section.');
 if(b.splitLocation!=null&&b.splitLocation>=opening.height)throw new Error('Tilt bar split location must be below the entered height.');
 for(const [key,size,label]of [['postLocations',opening.width,'T-post'],['dividerLocations',opening.height,'Divider rail']]){
  for(let i=0;i<b[key].length;i++){const v=b[key][i];if(v==null)throw new Error(`Enter ${label} ${i+1} location.`);if(v>=size||v<=(b[key][i-1]??0))throw new Error(`${label} locations must increase and stay inside the entered ${key==='postLocations'?'width':'height'}.`);}
 }
 const tip=broadleafTipSize({...opening,broadleaf:b});if(tip.issues.length)throw new Error(tip.issues[0]);
 return b;
}
export function nextBroadleaf(previous){const b=normalizeBroadleaf(previous);return {...b,splitLocation:null,dividerLocations:b.dividerLocations.map(()=>null),postLocations:b.postLocations.map(()=>null),tipWidth:null,tipHeight:null,waiveWarranty:false};}
export function broadleafDetails(opening,{compact=false}={}){
 if(!opening.broadleaf)return [];
 const b=normalizeBroadleaf(opening.broadleaf),v=key=>BROADLEAF_OPTIONS[enumKeys[key]][b[key]],m=broadleafMeasure,tip=broadleafTipSize(opening);
 const rows=[v('model'),`Color: ${v('color')}`,`Side by side: ${b.sideBySide?'Yes':'No'}`,`${v('reference')} / ${v('mount')}`,`Tip-to-tip: ${m(tip.width)} in W × ${m(tip.height)} in H`,`Tilt bar: ${v('tilt')}${b.splitLocation!=null?' / Split: '+m(b.splitLocation)+' in from bottom':''}`,`Frame: ${broadleafFrame(b.frame)?.name||'Not selected'} / ${v('sides')}`,`Build-out thickness: ${v('buildout')}`,`Divider rail: ${v('divider')}${b.dividerLocations.length?' / '+b.dividerLocations.map(n=>m(n)+' in').join(', ')+' from bottom':''}`];
 if(b.postCount)rows.push(`T-post: ${b.postCount} / ${v('postSize')} / ${v('postFace')}`);
 for(let i=0;i<b.sections.length;i++){rows.push(`${b.postCount?'Section '+(i+1):'Panel configuration'}: ${BROADLEAF_OPTIONS.configuration[b.sections[i]]}`);if(i<b.postCount)rows.push(`T-post ${i+1}: ${m(b.postLocations[i])} in from left`);}
 rows.push(`Stile face: ${v('stileFace')} / ${v('hinge')}`,`Sill cap: ${b.sillCap?'Yes':'No'}`);
 if(b.waiveWarranty)rows.push('Warranty waiver selected');
 if(compact){
  const panelRows=rows.filter(row=>row.startsWith('Section ')||row.startsWith('Panel configuration:'));
  const postRows=rows.filter(row=>/^T-post \d+:/.test(row));
  return [rows[0]+' / '+rows[1],rows[2]+' / '+rows[3],rows[4],rows[5],rows[6],rows[7]+' / '+rows[8],
   ...(b.postCount?[rows.find(row=>row.startsWith('T-post:'))]:[]),panelRows.join(' / '),...(postRows.length?[postRows.join(' / ')]:[]),
   rows.find(row=>row.startsWith('Stile face:'))+' / '+rows.find(row=>row.startsWith('Sill cap:')),
   ...(b.waiveWarranty?['Warranty waiver selected']:[])];
 }
 return rows;
}
