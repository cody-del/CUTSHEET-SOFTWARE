import {parseMeasurement,measurementInput} from './measurements.js';

export const BROADLEAF_FRACTIONS=['','1/16','1/8','3/16','1/4','5/16','3/8','7/16','1/2','9/16','5/8','11/16','3/4','13/16','7/8','15/16'];
export function broadleafMeasurementParts(value,unit='in'){
 if(value==null)return {whole:'',fraction:0};
 // Preserve existing decimals and metric measurements; never round to a sixteenth.
 const ticks=value*16;
 if(unit!=='in'||Math.abs(ticks-Math.round(ticks))>1e-9)return {whole:measurementInput(value,unit),fraction:0};
 return {whole:String(Math.floor(Math.round(ticks)/16)),fraction:Math.round(ticks)%16};
}
export function combineBroadleafMeasurement(raw,fraction=0){
 if(!raw.trim()&&!fraction)return null;
 const whole=parseMeasurement(raw.trim()||'0');
 return Number.isInteger(whole)?whole+fraction/16:whole;
}
export function broadleafMeasurementValue(input){
 const picker=input.parentElement.parentElement.querySelector('[data-broadleaf-fraction]');
 if(!picker)return input.value;
 const raw=input.value.trim();
 if(raw&&!Number.isInteger(parseMeasurement(raw)))picker.value='0';
 const value=combineBroadleafMeasurement(raw,Number(picker.value));
 return value==null?'':String(value);
}
export function bindBroadleafFractions(root=document){
 root.querySelectorAll('[data-broadleaf-fraction]').forEach(picker=>picker.addEventListener('change',()=>{
  const input=root.getElementById(picker.dataset.broadleafFraction);
  // Choosing a fraction replaces the decimal portion instead of adding it twice.
  try{input.value=String(Math.floor(parseMeasurement(input.value.trim()||'0')));}catch{}
  input.dispatchEvent(new Event('input',{bubbles:true}));
 }));
}
