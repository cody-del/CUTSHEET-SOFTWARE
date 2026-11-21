import {parseMeasurement,measurementInput} from './measurements.js';
import {frameStyle,frameSideStyles} from './frames.js';

// UI choice history belongs to an individual opening, not its inherited defaults.
// Remember it through re-renders and reloads without adding fields to shop records.
export function createShutterChoiceHistory(storage,key='shutter-choice-history-v1'){
 let entries=new Map();
 try{
  const saved=JSON.parse(storage?.getItem(key)||'[]');
  if(Array.isArray(saved))entries=new Map(saved.filter(e=>Array.isArray(e)&&typeof e[0]==='string'&&Array.isArray(e[1])).slice(-500).map(([id,fields])=>[id,new Set(fields.filter(f=>typeof f==='string'))]));
 }catch{}
 return {
  has:(opening,field)=>entries.get(opening)?.has(field)||false,
  remember(opening,field){
   const fields=entries.get(opening)||new Set();fields.add(field);entries.delete(opening);entries.set(opening,fields);
   if(entries.size>500)entries.delete(entries.keys().next().value);
   try{storage?.setItem(key,JSON.stringify([...entries].map(([id,fields])=>[id,[...fields]])));}catch{}
  }
 };
}

export const SHUTTER_FRACTIONS=['0','1/8','1/4','3/8','1/2','5/8','3/4','7/8'];
export function shutterMeasurementParts(value,unit='in'){
 if(value==null)return {whole:'',fraction:0};
 const ticks=value*8;
 // Never round a saved size to fit the picker. Non-eighth values remain exact.
 if(unit!=='in'||Math.abs(ticks-Math.round(ticks))>1e-9)return {whole:measurementInput(value,unit),fraction:0};
 return {whole:String(Math.floor(Math.round(ticks)/8)),fraction:Math.round(ticks)%8};
}
export function shutterMeasurementLabel(value,unit='in'){
 if(value==null)return '—';
 const p=shutterMeasurementParts(value,unit);
 return p.whole+(p.fraction?' '+SHUTTER_FRACTIONS[p.fraction]:'');
}
export function selectShutterFraction(raw,fraction){
 if(!Number.isInteger(fraction)||fraction<0||fraction>7)throw Error('Choose a fraction from 0 to 7/8.');
 // Replace the displayed fraction, rather than adding it again on every click.
 const whole=Math.floor(parseMeasurement(raw.trim()||'0'));
 return shutterMeasurementLabel(whole+fraction/8);
}
export function shutterFrameArrangement(o){
 if(o.sides==='4W'&&frameStyle(o).profile==='ST')return 'standard';
 if(o.sides==='4W')return 'all';
 if(o.sides==='4S')return 'bottom';
 return o.sides==='CW'?'custom':'saved';
}
export function applyShutterFrameArrangement(o,arrangement,trimStyle='TR'){
 const next={...o};delete next.frameSides;
 if(arrangement==='custom'){
  next.sides='CW';
  next.frameSides=Object.fromEntries(Object.entries(frameSideStyles(o)).map(([side,style])=>[side,style?.id||frameStyle(o).id]));
 }else if(arrangement==='standard'){
  next.frame='ST';if(frameStyle(o).id==='MS')next.frameStyle='MS';else delete next.frameStyle;
  next.sides='4W';
 }else if(['all','bottom'].includes(arrangement)){
  if(frameStyle(o).profile==='ST'){
   const selected=frameStyle({frame:trimStyle});next.frame=selected.profile;
   if(selected.id!==selected.profile)next.frameStyle=selected.id;else delete next.frameStyle;
  }
  next.sides=arrangement==='all'?'4W':'4S';
 }else throw Error('Choose a frame arrangement.');
 return next;
}
