import {lineProduct,productId,PRODUCTS} from './products.js';
import {EWF_ID,nextEwf} from './elegant.js';
import {BROADLEAF_ID,nextBroadleaf} from './broadleaf.js';
import {isSliding,setSliding} from './sliding.js';

// A duplicate keeps every line-specific value, including nested product options
// and a manual unit price. Its position supplies the new displayed line number.
export function duplicateQuoteLine(quote,sourceId,newId){
  const index=quote.openings.findIndex(line=>line.id===sourceId);
  if(index<0)throw new Error('Select a line to duplicate.');
  const copy={...structuredClone(quote.openings[index]),id:newId};
  quote.openings.splice(index+1,0,copy);
  if(Object.hasOwn(quote.unitPrices??{},sourceId))quote.unitPrices[newId]=quote.unitPrices[sourceId];
  return copy;
}

// Repeat product choices, never an opening's measurements or custom price.
export function nextQuoteLine(previous,quote,defaults,productPricing={}){
  const {id,name}=defaults;
  if(!previous)return {id,name,productId:''};
  const identity=lineProduct(previous,quote),product=productId(identity);
  if(!PRODUCTS.some(p=>p.id===product))return {id,name,productId:''};
  const line=product==='shuttersmart'?{...defaults}:{id,name};
  Object.assign(line,identity,{width:null,height:null,quantity:1,notes:''});
  if(product==='shuttersmart'){
    for(const key of ['left','right','louver','frame','frameStyle','frameSides','sides','color','tilt','divisionMode']){
      if(previous[key]!==undefined)line[key]=structuredClone(previous[key]);
    }
    if(!['4W','4S','CW'].includes(line.sides)){line.sides='4W';delete line.frameSides;}
    line.sizeMethod='S';
    line.mount='I';
    line.stile='Flat';
    line.divider=0;
    if(previous.tposts)line.tposts={construction:previous.tposts.construction,sections:structuredClone(previous.tposts.sections),positions:previous.tposts.positions.map(()=>null)};
    if(isSliding(previous))Object.assign(line,setSliding({...line,mount:previous.mount},previous.sliding.layout));
  }
  line.pricing=structuredClone(productPricing[product]??{rateCents:null,minimumAreaHundredths:0,version:0});
  if(product===EWF_ID)line.ewf=nextEwf(previous.ewf);
  if(product===BROADLEAF_ID)line.broadleaf=nextBroadleaf(previous.broadleaf);
  return line;
}
