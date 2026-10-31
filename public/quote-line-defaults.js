import {lineProduct,productId,PRODUCTS} from './products.js';

// Repeat product choices, never an opening's measurements or custom price.
export function nextQuoteLine(previous,quote,defaults,productPricing={}){
  const {id,name}=defaults;
  if(!previous)return {id,name,productId:''};
  const identity=lineProduct(previous,quote),product=productId(identity);
  if(!PRODUCTS.some(p=>p.id===product))return {id,name,productId:''};
  const line=product==='shuttersmart'?{...defaults}:{id,name};
  Object.assign(line,identity,{width:null,height:null,quantity:1,notes:''});
  if(product==='shuttersmart'){
    for(const key of ['left','right','louver','frame','frameStyle','frameSides','sides','mount','sizeMethod','color','tilt','stile','divisionMode']){
      if(previous[key]!==undefined)line[key]=structuredClone(previous[key]);
    }
    if(!['4W','4S','CW'].includes(line.sides)){line.sides='4W';delete line.frameSides;}
    line.divider=0;
    if(previous.tposts)line.tposts={construction:previous.tposts.construction,sections:structuredClone(previous.tposts.sections),positions:previous.tposts.positions.map(()=>null)};
  }
  line.pricing=structuredClone(productPricing[product]??{rateCents:null,minimumAreaHundredths:0,version:0});
  return line;
}
