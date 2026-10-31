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
export function productionName(record){return [...new Set([[record.customer?.firstName,record.customer?.lastName].filter(Boolean).join(' ')||(typeof record.customer==='string'?record.customer:''),record.name].filter(Boolean))].join(' · ');}
// Only manufacturing information is included. Payment/contact data stays with the owner.
export function waitingShopOrders(state){return Object.values(state.orders||{}).filter(o=>!o.deletedAt&&hasManufacturingLines(o)&&!state.jobs[o.id]).map(o=>({id:o.id,name:o.name,displayName:productionName(o),number:o.number,openingCount:orderManufacturingOpenings(o).length,createdAt:o.createdAt,version:o.version,readiness:orderReadiness(o)}));}

// Held cutting dimensions stay read-only; finishing work can be recorded before release.
export function heldOrderSheet(order){
 const openings=orderManufacturingOpenings(order).map(({pricing,...input})=>{
  let result;try{result=calculate(input);}catch(e){result={parts:[],warnings:[e.message]};}
  return {input:structuredClone(input),result,production:structuredClone(order.finishingProgress?.openings?.[input.id]||{}),lines:result.parts.map((part,i)=>({...part,id:input.id+'-'+i,completed:0,status:'not-cut',shortage:null}))};
 });
 return {id:order.id,productId:'shuttersmart',name:order.name,displayName:productionName(order),number:order.number,held:true,readiness:orderReadiness(order),openings,notes:'',due:'',targetMinutes:0,elapsedMs:0,startedAt:null,production:structuredClone(order.finishingProgress?.production||{}),activity:structuredClone(order.finishingProgress?.activity||[]),version:order.version};
}
