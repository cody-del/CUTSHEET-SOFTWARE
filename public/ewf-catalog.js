import {EWF_CATALOG as catalog} from './ewf-catalog-data.js';

// Keep this catalog version immutable: sold orders retain their original pricing rules.
export const EWF_PRICING=Object.freeze({catalogVersion:'ewf-2026-04-v1',tariffCents:4500,version:1,rateCents:null,minimumAreaHundredths:0});
const byCode=new Map(catalog.fabrics.map(f=>[f.code,f]));
export const ewfColors=model=>catalog.fabrics.filter(f=>f.listed&&f.model===model).sort((a,b)=>a.name.localeCompare(b.name));
export function ewfSelectedFabric(e={}){
 if(e.fabricCode)return byCode.get(e.fabricCode)||null;
 const text=[e.colorName,e.colorNumber].filter(Boolean).join(' / ').trim();
 const code=text.match(/\bR\d{5}D?\b/i)?.[0]?.toUpperCase();
 if(code&&byCode.has(code))return byCode.get(code);
 return catalog.fabrics.find(f=>f.model===e.model&&f.name.toLowerCase()===text.toLowerCase())||null;
}
export function ewfCatalogDimensionError(key,value,e={}){
 if(value==null)return '';
 const fabric=ewfSelectedFabric(e),motor=e.operation==='motorized';
 const min=key==='width'?(motor?(e.valance==='none'?25:22):8):11;
 const max=key==='width'?Math.min(116,fabric?.maxWidth??116):(e.model==='room-darkening'&&['square','painted'].includes(e.valance)?86:144);
 return !Number.isFinite(value)||value<min||value>max?`${key==='width'?'Width':'Height'} must be between ${min} and ${max} inches${key==='width'&&fabric&&max<116?' for '+fabric.name:key==='width'&&motor&&e.valance==='none'?' for motorized open roll':key==='height'&&max===86?' for a room-darkening flat valance':''}.`:'';
}
export function ewfCatalogPrice(opening){
 const e=opening.ewf||{},fabric=ewfSelectedFabric(e),issues=[];
 for(const key of ['width','height']){
  if(!Number.isFinite(opening[key]))issues.push('Enter width and height.');
  else {const error=ewfCatalogDimensionError(key,opening[key],e);if(error)issues.push(error);}
 }
 if(!fabric)issues.push('Choose a fabric color to calculate the price.');
 else if(fabric.model!==e.model)issues.push('Choose a fabric for the selected model.');
 if(issues.length)return {baseCents:null,issues:[...new Set(issues)],invalid:true};
 const column=catalog.widths.findIndex(w=>opening.width<=w),row=catalog.heights.findIndex(h=>opening.height<=h);
 if(fabric.review)issues.push(fabric.review);
 if(catalog.reviewCells.some(c=>c.group===fabric.group&&c.width===catalog.widths[column]&&c.height===catalog.heights[row]))issues.push('This size falls in a conflicting binder price cell. Confirm its price with Elegant.');
 // These choices are offered by the supplier, but have no explicit surcharge in the binder.
 if(e.valance==='painted')issues.push('Confirm the painted valance price.');
 if(e.holdDownBrackets)issues.push('Confirm the hold-down bracket price.');
 if(e.spacerBlocks)issues.push('Confirm the spacer block price.');
 if(e.operation==='clutch'&&e.customCordLength)issues.push('Confirm the custom cord length price.');
 if(e.operation==='clutch'&&e.cordType==='plastic-white')issues.push('Confirm the white plastic chain price.');
 if(e.operation==='motorized'&&e.valance!=='none'&&e.valanceColor?.toLowerCase()!=='color coordinated')issues.push('Confirm the custom valance color price.');
 if(e.lightBlocker&&!(Number.isFinite(e.lightBlockerFeet)&&e.lightBlockerFeet>0))issues.push('Enter total light-blocker feet per shade.');
 const base=catalog.grids[fabric.group][row][column];
 let accessories=0;
 if(['square','curved'].includes(e.valance))accessories+=catalog.valanceCents[column];
 if(e.operation==='motorized'){
  accessories+=36500; // Includes the standard wand; $175 is a replacement part only.
  accessories+=({none:0,single:8800,multi:11600})[e.remote]||0;
  if(e.usb6)accessories+=5000;if(e.usb10)accessories+=6000;if(e.wifi==='hub')accessories+=45000;
 }
 // The grid and surcharge page list separate oversize and freight thresholds.
 if(opening.width>90)accessories+=10000;
 if(opening.width>93)accessories+=10000;
 if(e.lightBlocker&&Number.isFinite(e.lightBlockerFeet))accessories+=Math.round(e.lightBlockerFeet*1050);
 return {baseCents:issues.length?null:base+accessories,issues,invalid:false};
}

export function ewfPrice(opening,quote,pricing,override){
 // Previously sold manual-price orders must never acquire a new fee or catalog price.
 if(quote.status==='ordered'&&!pricing?.catalogVersion)return {unitPrice:override??null,issues:[]};
 if(pricing?.catalogVersion&&pricing.catalogVersion!==EWF_PRICING.catalogVersion)return {unitPrice:null,issues:['This saved catalog version is unavailable.']};
 const result=ewfCatalogPrice(opening);
 const dimensionError=['width','height'].some(k=>ewfCatalogDimensionError(k,opening[k],opening.ewf));
 const fabric=ewfSelectedFabric(opening.ewf),modelMismatch=fabric&&fabric.model!==opening.ewf?.model;
 // A confirmed manual base price can resolve unlisted options, never invalid sizes/model.
 const base=dimensionError||modelMismatch?null:override??result.baseCents;
 return {unitPrice:base==null?null:base+(pricing?.tariffCents??EWF_PRICING.tariffCents),issues:result.issues};
}
