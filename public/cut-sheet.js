import {frameStyle} from './frames.js';

export function firstLouverHole(result){
  const value=result?.machining?.find(m=>m.label==='First louver hole from stile top')?.value;
  return Number.isFinite(value)&&value>0?value:null;
}

export const louverSummary=result=>{
  const l=result?.louverLayout;
  return !l?'':l.divided?`${l.top} above, ${l.bottom} below per panel`:`${l.total} louvers per panel`;
};
export function cutSheetFacts(o,result,{measurement=String,length=n=>n.toFixed(2),inputUnits='in',units='mm'}={}){
  const layout=o.tposts?o.tposts.sections.map(s=>'L'.repeat(s.left)+'R'.repeat(s.right)).join(' | T | '):'L'.repeat(o.left)+'R'.repeat(o.right);
  return [
    ['Width × height',`${measurement(o.width)} × ${measurement(o.height)} ${inputUnits}`],
    ['Quantity & layout',`${o.quantity} ${o.quantity===1?'unit':'units'} · ${layout}`],
    ['Frame',frameStyle(o).name],
    ['Mount & sides',`${o.mount==='I'?'Inside':'Outside'} · ${o.sides==='4W'?'4 sides':o.sides==='3D'?'3 sides, door':'3 sides'}`],
    ['Finish & louvers',`${{W:'White',OW:'Off-white',SC:'Swiss coffee'}[o.color]} · ${o.louver} in`],
    ['Tilt',`${o.tilt==='Smart'?'Smart View':o.tilt+' tilt'}${o.divisionMode==='split'?' · split rod':''}`],
    ['Measurement type',{W:'Window opening',S:'Shutter size',F:'Outside frame'}[o.sizeMethod]],
    ['Light gap',Number.isFinite(result?.gap)?`${length(result.gap)} ${units}`:'—']
  ];
}
export function cutSheetNotes(result){
  const notes=[],aluminum=[];
  for(const note of result?.reviewNotes||[]){
    const section=/^Section (\d+):.*aluminum reinforcement/.exec(note);
    if(section){aluminum.push(section[1]);continue;}
    if(note.startsWith('Two-piece post:'))notes.push('Two-piece posts: confirm stock pieces per assembly.');
    else if(note.startsWith('The workbook midpoint'))notes.push('Legacy midpoint differs from half the louver length; verify the machining datum.');
    else notes.push(note);
  }
  if(aluminum.length)notes.unshift(`Aluminum inserts: confirm cut lengths for section${aluminum.length===1?'':'s'} ${aluminum.join(', ')}.`);
  return notes;
}
export const machiningLabel=label=>label==='First louver hole from stile top'?'First louver hole from top':label===label.toUpperCase()?label.toLowerCase().replace(/^./,c=>c.toUpperCase()):label;
