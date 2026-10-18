import {calculate} from './calculations.mjs';
import {manufacturingOpenings,hasManufacturingLines} from './public/products.js';
export const orderManufacturingOpenings=order=>order.manufacturingSpecifications||manufacturingOpenings(order);
export function orderReadiness(order,released=false){
 if(!hasManufacturingLines(order))return {status:'not-applicable',label:'Quote and order only',issues:[]};
 if(released)return {status:'released',label:'In the shop',issues:[]};
 const issues=[];
 for(const o of orderManufacturingOpenings(order)){
  try{const result=calculate(o);for(const message of result.warnings)issues.push({openingId:o.id,openingName:o.name,message});if(!result.parts.length&&!result.warnings.length)issues.push({openingId:o.id,openingName:o.name,message:'No calculated cut lines.'});}
  catch(e){issues.push({openingId:o.id,openingName:o.name,message:e.message});}
 }
 return issues.length?{status:'blocked',label:'Needs measurement review',issues}:!order.finance?.confirmedAt?{status:'confirmation',label:'Awaiting owner confirmation',issues:[]}:{status:'ready',label:'Ready to send to shop',issues:[]};
}
// Only manufacturing information is included. Payment/contact data stays with the owner.
export function waitingShopOrders(state){return Object.values(state.orders||{}).filter(o=>hasManufacturingLines(o)&&!state.jobs[o.id]).map(o=>({id:o.id,name:o.name,number:o.number,openingCount:orderManufacturingOpenings(o).length,createdAt:o.createdAt,readiness:orderReadiness(o)}));}
