import {supportsCutSheets,CUT_SHEETS_ONLY} from './public/products.js';
import {FRAME_STYLES,frameStyle,frameNotice} from './public/frames.js';
import workbook from './source/workbook.json' with {type:'json'};
import {WorkbookEngine} from './engine.mjs';
export const VERSION='20170211FCNew / app 0.5';
export const FRAMES={ST:'Standard',DS:'Designer',EX:'Extended',ZF:'Z-frame',TR:'Trim frame',HS:'Hanging strip'};
export const SCOPE='Standard and T-post Shutter Smart shutters, 3 or 4 inch louvers. Manufacturing validation pending.';
export const SOURCE_URL='https://docs.google.com/spreadsheets/d/1FGIwG2DLI-5FSbQ9KTH9_tn0t5dYAbkG/edit';
export class ValidationError extends Error {}
export function lightGapWarning(gap){
  if(!Number.isFinite(gap))return '';
  // Ignore only floating-point noise at the limits; never validate rounded display units.
  const mm=Math.round(gap*1e9)/1e9;
  if(mm>=1.9&&mm<8)return '';
  return `The light gap is not going to work: ${mm<1.9?'it is below 1.9 mm':'it is 8.0 mm or above'}. The light gap must be at least 1.9 mm and less than 8.0 mm. Review the opening measurements and louver options before cutting.`;
}
const clean=v=>String(v??'').trim().replace(/\s+/g,' ');
const numeric=(v,name,min,max,integer=false)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max||integer&&!Number.isInteger(v))throw new ValidationError(`${name} must be ${integer?'a whole number ':''}between ${min} and ${max}.`);return v;};
export const hasTposts=o=>o?.tposts!=null;
export const panelCount=o=>hasTposts(o)?o.tposts.sections.reduce((n,s)=>n+s.left+s.right,0):o.left+o.right;
export const configuration=o=>hasTposts(o)?o.tposts.sections.map(s=>'L'.repeat(s.left)+'R'.repeat(s.right)).join(' | T | '):'L'.repeat(o.left)+'R'.repeat(o.right);
export function validateOpening(o){
  if(!o||typeof o!=='object')throw new ValidationError('An opening is required.');
  if(!supportsCutSheets(o))throw new ValidationError(CUT_SHEETS_ONLY);
  numeric(o.width,'Width (inches)',1,hasTposts(o)?Number.MAX_SAFE_INTEGER:106);numeric(o.height,'Height (inches)',1,114);
  numeric(o.quantity,'Quantity',1,100,true);
  if(hasTposts(o)){
    const t=o.tposts;
    if(typeof t!=='object'||!Array.isArray(t.positions)||t.positions.length<1||t.positions.length>4)throw new ValidationError('Choose between 1 and 4 T-posts.');
    if(!['one-piece','two-piece'].includes(t.construction))throw new ValidationError('Choose one-piece or two-piece T-post construction.');
    if(!Array.isArray(t.sections)||t.sections.length!==t.positions.length+1)throw new ValidationError('Each T-post opening needs one more section than posts.');
    let previous=0;
    for(const [i,position]of t.positions.entries()){
      numeric(position,`T-post ${i+1} position (inches)`,0,o.width);
      if(position<=previous)throw new ValidationError(`T-post ${i+1} must be farther right than ${i?`T-post ${i} (${previous} inches)`:'the left edge'}.`);
      if(position>=o.width)throw new ValidationError(`T-post ${i+1} must lie inside the ${o.width}-inch opening.`);
      previous=position;
    }
    for(const [i,section]of t.sections.entries()){
      if(!section||typeof section!=='object')throw new ValidationError(`Section ${i+1} needs a panel arrangement.`);
      numeric(section.left,`Section ${i+1} left panels`,0,2,true);numeric(section.right,`Section ${i+1} right panels`,0,2,true);
      if(![1,2,3,4].includes(section.left+section.right))throw new ValidationError(`Section ${i+1} needs 1, 2, 3, or 4 panels.`);
    }
  }else{
    numeric(o.left,'Left panels',0,4,true);numeric(o.right,'Right panels',0,4,true);
    if(![1,2,3,4].includes(o.left+o.right))throw new ValidationError('Choose 1, 2, 3, or 4 total panels.');
  }
  if(o.frameStyle!==undefined&&(!FRAME_STYLES.some(f=>f.id===o.frameStyle)||(frameStyle(o).profile&&frameStyle(o).profile!==o.frame)))throw new ValidationError('Choose a valid frame style matching the cutting profile.');
  if(!Object.hasOwn(FRAMES,o.frame))throw new ValidationError('Choose a supported frame.');
  if(![3,4].includes(o.louver))throw new ValidationError('Choose 3 or 4 inch louvers.');
  for(const [key,allowed]of Object.entries({mount:['I','O'],sizeMethod:['W','S','F'],sides:['4W','3W','3D'],color:['W','OW','SC'],tilt:['Smart','Front','Back'],stile:['Flat','Reg']}))if(!allowed.includes(o[key]))throw new ValidationError(`Invalid ${key}.`);
  if(o.sizeMethod==='F'&&o.mount!=='O')throw new ValidationError('Outside frame measurements require an outside mount.');
  if(o.divisionMode!==undefined&&!['divider','split'].includes(o.divisionMode))throw new ValidationError('Choose divider rail or split tilt rod mode.');
  numeric(o.divider??0,'Divider position',0,o.height);
  if(o.divider>=o.height)throw new ValidationError('The divider must be below the top of the opening.');
  if(clean(o.name).length>80||clean(o.notes).length>1200)throw new ValidationError('Opening name or notes are too long.');
  return o;
}
function openingEngine(o){
  const controls={A15:1,B15:o.quantity,C15:o.color,D15:o.louver,E15:o.tilt,F15:o.mount,G15:hasTposts(o)?'TP':'SF',H15:o.frame,I15:o.sides,J15:o.sizeMethod,K15:o.width,L15:o.height,M15:hasTposts(o)?o.tposts.sections.reduce((n,s)=>n+s.left,0):o.left,N15:hasTposts(o)?o.tposts.sections.reduce((n,s)=>n+s.right,0):o.right,O15:o.divider??0,P15:0,Q15:'',R15:'White',S15:o.stile,T15:'',G31:0,J31:0,M31:0,P31:0,W5:0,W6:0,W7:0,W8:0,W9:0,W14:0};
  const overrides=Object.fromEntries(Object.entries(controls).map(([c,v])=>['INPUT SCREEN!'+c,v]));
  // Product family is explicit; never inherit a prior job's specialty settings.
  Object.assign(overrides,{'CALCULATION!J29':1,'CALCULATION!H15':o.divisionMode==='split'?2:1,'CALCULATION!P1':1,'DATA ENTRY CALC!B15':false});
  // Clear every T-post input on every request; section data must not leak between jobs.
  for(const c of ['E31','F31','G31','H31','I31','J31','K31','L31','M31','N31','O31','P31','Q31','R31'])overrides['INPUT SCREEN!'+c]=0;
  Object.assign(overrides,{'CALCULATION!Y38':2,'CALCULATION (2)!D13':hasTposts(o)&&o.tposts.construction==='one-piece'?1:2});
  if(hasTposts(o)){
    o.tposts.positions.forEach((value,i)=>overrides['INPUT SCREEN!'+['G31','J31','M31','P31'][i]]=value);
    o.tposts.sections.forEach((section,i)=>{overrides['INPUT SCREEN!'+['E31','H31','K31','N31','Q31'][i]]=section.left;overrides['INPUT SCREEN!'+['F31','I31','L31','O31','R31'][i]]=section.right;});
  }
  return new WorkbookEngine(workbook,overrides);
}
function louverLayout(o,e){
  // These are the same per-panel groups printed beside the workbook's tilt rods.
  const count=c=>{const v=e.cell('CALCULATION (2)',c);return Number.isInteger(v)&&v>=0?v:0;};
  const groups=count('K46'),bottom=count('F44'),top=groups?count('F46'):0,middle=groups===2?count('F45'):0;
  const center=e.cell('CALCULATION (2)','B44'),panelHeight=e.cell('CALCULATION (2)','B26');
  return {bottom,top,middle,total:bottom+top+middle,divided:groups>0,
    dividerFromBottom:o.divisionMode!=='split'&&o.divider>0&&Number.isFinite(center)?center:null,panelHeight};
}
export function calculate(o){
  validateOpening(o);
  if(frameNotice(o))return {parts:[],hinges:[],machining:[],warnings:[frameNotice(o)],reviewNotes:[],version:VERSION,status:'preview-only'};
  const e=openingEngine(o);
  if(hasTposts(o))return calculateTposts(o,e);
  const p=c=>e.cell('PRINT SHEET',c),warnings=[];
  for(const c of ['A12','B12','A13','B13','A14','A15']){const v=e.cell('CALCULATION (2)',c);if(typeof v==='string'&&clean(v))warnings.push(clean(v));}
  const extra=e.cell('DATA ENTRY  ','A24');if(typeof extra==='string'&&clean(extra))warnings.push(clean(extra));
  const parts=[];
  for(const r of [22,24,25,26,28,29,30,40,41,42,43]){
    const qty=p('J'+r),length=p('H'+r),label=clean(p('B'+r));
    if(!label||qty===null||typeof qty==='string'&&!clean(qty)||qty===0)continue;
    if(typeof qty!=='number'||!Number.isInteger(qty)||qty<0||typeof length!=='number'||length<=0)throw new ValidationError(`The workbook could not calculate a valid ${label.toLowerCase()} cut. Check the opening measurements and options.`);
    const type=clean([p('D'+r),p('E'+r),p('F'+r),p('G'+r)].filter(v=>typeof v==='string').join(' '));
    const name=r===28?'Top rail':r===29?'Bottom rail':r===30?'Divider rail':r===40?'Top frame':r===41?'Bottom frame':r===42?'Left frame':r===43?'Right frame':r===22?'Louvers':r===24?'Aluminum insert':r===25?'Stile · regular':'Stile · flat';
    parts.push({name,profile:r===28||r===29?`${label} ${clean(p('F'+r))}`:type,length,quantity:qty*o.quantity,perUnit:qty,source:`PRINT SHEET!H${r}`,machining:r>=40?'See frame profile':r===22?`${o.louver}" ${o.tilt} tilt`:''});
  }
  for(const r of [54,55,56]){const length=p('J'+r),qty=p('L'+r);if(typeof length==='number'&&typeof qty==='number'&&length>0&&qty>0)parts.push({name:'Tiltrod'+(o.divider? r===54?' · bottom':' · top':''),profile:o.tilt,length,quantity:qty,perUnit:qty/o.quantity,source:`PRINT SHEET!J${r}`,machining:''});}
  if(!parts.some(x=>x.name==='Louvers'))throw new ValidationError('No valid louver cuts were calculated.');
  const hinges=['D18','E18','F18','G18','H18','I18','J18'].map(p).filter(x=>typeof x==='number'&&x>0);
  const machining=[];
  for(const [label,c]of [['First louver hole from stile top','H27'],['Louver midpoint','H23']]){const v=p(c);if(typeof v==='number'&&v>0)machining.push({label,value:v});}
  for(const [labelCell,valueCell]of [['B31','E31'],['F31','H31']]){const label=clean(p(labelCell)),v=p(valueCell);if(label&&typeof v==='number'&&v>0)machining.push({label,value:v});}
  const panelWidth=e.cell('CALCULATION','Q26')+e.cell('CALCULATION','P16')+e.cell('CALCULATION','P17');
  const panelHeight=e.cell('CALCULATION (2)','B26');
  const reviewNotes=[];
  const louver=parts.find(part=>part.name==='Louvers'),midpoint=machining.find(m=>m.label==='Louver midpoint');
  if(midpoint&&Math.abs(midpoint.value-louver.length/2)>0.01){midpoint.label='Legacy louver midpoint - verify';reviewNotes.push('The workbook midpoint differs from half the louver cut length. Verify this machining value against a trusted order.');}
  const louvers=louverLayout(o,e),gap=p('L9'),gapWarning=lightGapWarning(gap);
  if(gapWarning)warnings.push(gapWarning);
  return {parts,hinges,machining,panelWidth,panelHeight,louversPerPanel:louvers.total,louverLayout:louvers,gap,lightGapWarning:gapWarning,warnings:[...new Set(warnings)],reviewNotes,version:VERSION,status:'validation-draft',review:'Compare with a trusted completed cut sheet before cutting.',traceCount:e.cache.size};
}
function calculateTposts(o,e){
  const p=c=>e.cell('T Post Cutsheet',c),warnings=[],reviewNotes=[],parts=[],machining=[];
  for(const c of ['A12','B12','A13','B13','A14','A15']){const v=e.cell('CALCULATION (2)',c);if(typeof v==='string'&&clean(v))warnings.push(clean(v));}
  const extra=e.cell('DATA ENTRY  ','A24');if(typeof extra==='string'&&clean(extra))warnings.push(clean(extra));
  if(e.cell('T-POST ','D10')!=='OK')throw new ValidationError('The workbook rejected the T-post configuration.');
  function add(name,profile,length,quantity,source,section=null,machiningDetail=''){
    if(quantity===0||quantity===null||typeof quantity==='string'&&!clean(quantity))return;
    if(!Number.isInteger(quantity)||quantity<0||!Number.isFinite(length)||length<=0)throw new ValidationError(`The workbook could not calculate ${name.toLowerCase()}${section?` for section ${section}`:''}. Check the post positions and panel configuration.`);
    parts.push({name,profile:clean(profile),length,quantity,perUnit:quantity/o.quantity,source:'T Post Cutsheet!'+source,section,machining:machiningDetail});
  }
  const sections=o.tposts.sections.map((section,i)=>{
    const r=18+i,rr=32+i,number=i+1;
    const profile=clean([p('C'+r),p('D'+r),p('G'+r)].filter(v=>typeof v==='string').join(' '));
    add('Louvers',profile,p('H'+r),p('L'+r),'H'+r,number,`${o.louver}" ${o.tilt} tilt`);
    add('Top rail',p('C'+rr),p('J'+rr),p('D'+rr),'J'+rr,number);
    add('Bottom rail',p('E'+rr),p('J'+rr),p('F'+rr),'J'+rr,number);
    if(o.divider)add('Divider rail',p('H'+rr),p('J'+rr),p('I'+rr),'J'+rr,number);
    const midpoint=p('J'+r);if(Number.isFinite(midpoint)&&midpoint>0)machining.push({label:`Section ${number} louver midpoint`,value:midpoint});
    // This sheet calls for aluminum on wide louvers but has no insert cut-size output.
    // Keep the source instruction visible instead of inventing a fabrication length.
    if(profile.includes('WITH ALUMINUM'))reviewNotes.push(`Section ${number}: the workbook specifies aluminum reinforcement but does not supply its insert cut length on the T-post sheet. Verify the insert cut before fabrication.`);
    return {number,left:section.left,right:section.right,start:i?o.tposts.positions[i-1]:0,end:o.tposts.positions[i]??o.width,railLength:p('J'+rr),louverLength:p('H'+r),louverQuantity:p('L'+r)};
  });
  for(const r of [25,26])add(r===25?'Stile · regular':'Stile · flat',[p('D'+r),p('E'+r),p('F'+r),p('G'+r)].join(' '),p('H'+r),p('L'+r),'H'+r);
  for(const [r,name]of [[39,'Top frame'],[40,'Bottom frame'],[41,'Left frame'],[42,'Right frame'],[43,o.tposts.construction==='two-piece'?'T-post assembly':'T-post']])add(name,[p('E'+r),p('F'+r),p('G'+r)].filter(v=>typeof v==='string').join(' '),p('H'+r),p('L'+r),'H'+r,null,r===43?o.tposts.construction:'See frame profile');
  for(const r of [48,49,50])add('Tiltrod'+(o.divider?r===48?' · bottom':' · top':''),o.tilt,p('L'+r),p('K'+r),'L'+r);
  if(parts.filter(p=>p.name==='Louvers').length!==sections.length||!parts.some(p=>p.name.startsWith('T-post')))throw new ValidationError('The workbook did not return a complete T-post cutting list for this frame.');
  const hole=p('H27');if(Number.isFinite(hole)&&hole>0)machining.unshift({label:'First louver hole from stile top',value:hole});
  for(const [labelCell,valueCell]of [['B30','E30'],['F30','H30']]){const label=clean(p(labelCell)),value=p(valueCell);if(label&&Number.isFinite(value)&&value>0)machining.push({label,value});}
  const hinges=['D16','E16','F16','G16','H16','I16','J16'].map(p).filter(v=>Number.isFinite(v)&&v>0);
  if(o.tposts.construction==='two-piece')reviewNotes.push('Two-piece post: the workbook lists one ST FRAME post assembly per position. Confirm the stock pieces per assembly before cutting.');
  const louvers=louverLayout(o,e),gap=p('L8'),gapWarning=lightGapWarning(gap);
  if(gapWarning)warnings.push(gapWarning);
  return {parts,sections,tposts:{...o.tposts,configuration:configuration(o),positionDatum:'Cumulative post centerlines from the left edge of the entered measurement'},hinges,machining,panelWidth:null,panelHeight:e.cell('CALCULATION (2)','B26'),louversPerPanel:louvers.total,louverLayout:louvers,gap,lightGapWarning:gapWarning,warnings:[...new Set(warnings)],reviewNotes,version:VERSION,status:'validation-draft',review:'Compare with a trusted completed cut sheet before cutting.',traceCount:e.cache.size};
}
export function combinedParts(openings){
  const groups=new Map();
  for(const o of openings){const result=calculate(o);if(result.warnings.length)throw new ValidationError(`${o.name}: ${result.warnings.join('; ')}`);for(const part of result.parts){
    // Keep exact dimensions and manufacturing attributes. Display rounding never groups distinct cuts.
    const key=JSON.stringify([part.name,part.profile,part.length,o.color,o.louver,o.tilt,part.machining]);
    if(!groups.has(key))groups.set(key,{...part,section:null,color:o.color,quantity:0,openings:[]});
    const group=groups.get(key);group.quantity+=part.quantity;group.openings.push({name:o.name+(part.section?` / section ${part.section}`:''),quantity:part.quantity});
  }}
  return [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name)||b.length-a.length);
}
