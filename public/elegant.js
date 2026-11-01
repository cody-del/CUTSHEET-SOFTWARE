import {ewfSelectedFabric,ewfCatalogDimensionError} from './ewf-catalog.js';
// Options follow the supplied Elegant ordering screenshots.
export const EWF_ID='elegant-ewf-shades';
export const ewfFabric=e=>e.fabricCode&&ewfSelectedFabric(e)?`${ewfSelectedFabric(e).name} / ${e.fabricCode}`:[e.colorName,e.colorNumber].filter(Boolean).join(' / ');
export const ewfMeasurement=value=>value==null?'—':String(Math.round(value*10000)/10000);
export const isElegant=id=>['elegant-shutters',EWF_ID].includes(id);
export const EWF_OPTIONS=Object.freeze({
 operation:{clutch:'Clutch / chain',motorized:'Motorized'},
 model:{'light-filtering':'Roller shades · Light filtering','room-darkening':'Roller shades · Room darkening'},
 mount:{I:'Inside mount',O:'Outside mount'},
 controlPosition:{right:'Right side',left:'Left side'},
 controlType:{'standard-loop':'Standard cord loop'},
 cordType:{regular:'Regular cord',metal:'Metal ball chain','plastic-coordinated':'Plastic ball chain · Color coordinated','plastic-white':'Plastic ball chain · White'},
 valance:{none:'No valance (open roll)',square:'Square / flat valance',curved:'Curved valance',painted:'Square / flat valance (painted)'},
 motorType:{'wand-remote':'Wand and remote'},
 wandPosition:{right:'Right side',left:'Left side'},
 wandLength:{2:'2 foot',3:'3 foot',4:'4 foot',5:'5 foot',standard:'Standard per height'},
 remote:{none:'No remote',single:'Single channel',multi:'Multi channel'},
 chargeCord:{3:'3 foot',6:'6 foot',10:'10 foot'},
 wandColor:{coordinated:'Color coordinated',beige:'Beige',black:'Black',blue:'Blue',brown:'Brown',gray:'Gray',white:'White'},
 wifi:{none:'No Wi-Fi bridge',hub:'Wi-Fi hub'}
});
const common={operation:'clutch',model:'light-filtering',fabricCode:'',colorName:'',colorNumber:'',mount:'I',valance:'none',lightBlocker:false,lightBlockerFeet:null,holdDownBrackets:false,spacerBlocks:false,windowLocation:''};
const clutch={controlPosition:'right',controlType:'standard-loop',cordType:'regular',customCordLength:false,cordLength:null};
const motor={motorType:'wand-remote',wandPosition:'right',wandLength:'2',remote:'none',valanceColor:'Color coordinated',chargeCord:'6',wandColor:'coordinated',usb6:false,usb10:false,wifi:'none'};
export function defaultEwf(operation='clutch'){return {...common,operation,...(operation==='motorized'?motor:clutch)};}
export function normalizeEwf(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Enter valid EWF shade options.');
 const defaults=defaultEwf(value.operation??'clutch'),out={};
 for(const [key,fallback]of Object.entries(defaults)){
  const v=value[key]??fallback;
  if(EWF_OPTIONS[key]){if(!Object.hasOwn(EWF_OPTIONS[key],v))throw new Error('Choose a valid '+key.replace(/[A-Z]/g,m=>' '+m.toLowerCase())+'.');out[key]=String(v);}
  else if(typeof fallback==='boolean'){if(typeof v!=='boolean')throw new Error('Choose yes or no for '+key+'.');out[key]=v;}
  else if(['cordLength','lightBlockerFeet'].includes(key)){out[key]=v;}
  else{const max=key==='colorName'?255:120;if(typeof v!=='string'||v.length>max)throw new Error('Keep '+(key==='colorName'?'fabric color / number':'shade text fields')+' within '+max+' characters.');out[key]=v.trim();}
 }
 if(out.fabricCode){const fabric=ewfSelectedFabric(out);if(!fabric||fabric.model!==out.model)throw new Error('Choose a fabric for the selected model.');out.colorName=fabric.name;out.colorNumber='';}
 if(!out.lightBlocker)out.lightBlockerFeet=null;
 else if(out.lightBlockerFeet!==null&&(!Number.isFinite(out.lightBlockerFeet)||out.lightBlockerFeet<=0||out.lightBlockerFeet>1000))throw new Error('Enter total light-blocker feet per shade, greater than zero.');
 if(out.operation==='clutch'){
  if(!out.customCordLength)out.cordLength=null;
  else if(out.cordLength!==null&&(!Number.isFinite(out.cordLength)||out.cordLength<=0||out.cordLength>10000))throw new Error('Enter a custom cord length greater than zero.');
 }
 return out;
}
export function ewfDimensionError(key,value,config){
 return ewfCatalogDimensionError(key,value,config);
}
export function validateEwfOpening(opening,{complete=false}={}){
 const ewf=normalizeEwf(opening.ewf);
 for(const key of ['width','height']){const error=ewfDimensionError(key,opening[key],ewf);if(error)throw new Error(error);if(complete&&opening[key]==null)throw new Error('Enter width and height.');}
 if(complete&&!ewf.colorName&&!ewf.colorNumber)throw new Error('Enter the fabric color / number.');
 if(complete&&ewf.customCordLength&&ewf.cordLength==null)throw new Error('Enter the custom cord length.');
 if(complete&&ewf.lightBlocker&&ewf.lightBlockerFeet==null)throw new Error('Enter total light-blocker feet per shade.');
 return ewf;
}
export function nextEwf(previous){const copy=normalizeEwf(previous);copy.windowLocation='';if(copy.customCordLength)copy.cordLength=null;if(copy.lightBlocker)copy.lightBlockerFeet=null;return copy;}
export function ewfDetails(opening){
 const e=normalizeEwf(opening.ewf),v=key=>EWF_OPTIONS[key]?.[e[key]]||e[key],yes=key=>e[key]?'Yes':'No';
 const rows=[v('model'),`Fabric: ${ewfFabric(e)||'Not selected'}`,v('mount')];
 if(e.operation==='clutch')rows.push(`Control: ${v('controlPosition')} / ${v('controlType')}`,`Cord: ${v('cordType')}${e.customCordLength?' / Custom length: '+(e.cordLength==null?'Not entered':e.cordLength+' in'):''}`,`Valance: ${v('valance')}`);
 else rows.push(`Motor: ${v('motorType')}`,`Control wand: ${v('wandPosition')} / ${v('wandLength')}`,`Remote: ${v('remote')}`,`Valance: ${v('valance')} / ${e.valanceColor}`,`Charge cord: ${v('chargeCord')} / Wand color: ${v('wandColor')}`,`USB 6' cable with charger: ${yes('usb6')} / USB 10' cable with charger: ${yes('usb10')}`,`Wi-Fi: ${v('wifi')}`);
 rows.push(`Light blocker: ${e.lightBlocker&&e.lightBlockerFeet!=null?e.lightBlockerFeet+' ft per shade':yes('lightBlocker')} / Hold-down brackets: ${yes('holdDownBrackets')} / Spacer blocks: ${yes('spacerBlocks')}`);
 if(e.windowLocation)rows.push('Window location: '+e.windowLocation);
 return rows;
}
