import {randomUUID} from 'node:crypto';
import {calculate} from './calculations.mjs';
import {production} from './public/shop-state.js';
import {formatContactAddress} from './public/contact-address.js';

export const salesOperations=['sales','pricing-save','sales-get','contact-save','quote-create','quote-save','quote-convert','order-release'];
export class SalesError extends Error {constructor(status,message){super(message);this.status=status;}}
const fail=(status,message)=>{throw new SalesError(status,message);};
const identifier=value=>{if(typeof value!=='string'||!/^[-a-zA-Z0-9_]{1,64}$/.test(value)||['__proto__','constructor','prototype'].includes(value))fail(400,'Invalid record identifier.');return value;};
const text=(value,label,max,required=false)=>{if(typeof value!=='string'||value.length>max||required&&!value.trim())fail(400,`Enter a valid ${label}.`);return value.trim();};
const amount=(value,label,max=100000000)=>{if(!Number.isSafeInteger(value)||value<0||value>max)fail(400,`Enter a valid ${label}.`);return value;};
const date=value=>{if(value==='')return '';if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T12:00:00Z'))||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value)fail(400,'Enter a valid date.');return value;};
const get=(collection,id)=>{const record=collection[identifier(id)];if(!record)fail(404,'This record was not found.');return record;};
const current=(record,version)=>{if(record.version!==version)fail(409,'This record changed on another device. Reload it before saving again.');};
const contactName=c=>[c.firstName,c.lastName].filter(Boolean).join(' ');
function contactAddress(fields,previous){
  if(['streetAddress','city','zipCode'].some(key=>key in fields)){
    if(fields.state!==undefined&&!['FL','Florida'].includes(fields.state))fail(400,'Contact addresses use Florida.');
    const address={streetAddress:text(fields.streetAddress??'','street address',500),city:text(fields.city??'','city',100),state:'FL',zipCode:text(fields.zipCode??'','ZIP code',10)};
    if(address.zipCode&&!/^\d{5}(?:-\d{4})?$/.test(address.zipCode))fail(400,'Enter a 5-digit ZIP code or ZIP+4, such as 34102 or 34102-1234.');
    return {...address,address:formatContactAddress(address)};
  }
  const address=text(fields.address,'address',650);
  // Older open tabs may still save a combined address; never leave stale components.
  return previous?.streetAddress!==undefined&&address===previous.address?
    {address,streetAddress:previous.streetAddress,city:previous.city,state:previous.state,zipCode:previous.zipCode}:{address};
}
export function quoteTotals(quote){
  let subtotal=0,unpriced=0;
  const lines=quote.openings.map(opening=>{
    const area=opening.width*opening.height/144,billableArea=Math.max(area,(quote.pricing?.minimumAreaHundredths||0)/100);
    const override=quote.unitPrices[opening.id];
    const unitPrice=override===null||override===undefined?(quote.pricing?.rateCents===null||quote.pricing?.rateCents===undefined?null:Math.round(billableArea*quote.pricing.rateCents)):amount(override,'unit price');
    if(unitPrice===null)unpriced++;else subtotal+=unitPrice*opening.quantity;
    return {openingId:opening.id,area,billableArea,unitPrice,lineTotal:unitPrice===null?null:unitPrice*opening.quantity,override:override!==null&&override!==undefined};
  });
  if(!Number.isSafeInteger(subtotal)||subtotal>10000000000)fail(400,'The quote total is too large.');
  const discount=amount(quote.discountCents,'discount'),installation=amount(quote.installationCents,'installation');
  if(discount>subtotal)fail(400,'Discount cannot exceed the shutter subtotal.');
  const taxable=subtotal-discount+installation,tax=Math.round(taxable*amount(quote.taxBasisPoints,'tax rate',10000)/10000);
  return {subtotal,discount,installation,tax,total:taxable+tax,unpriced,lines};
}
function openings(value){
  if(!Array.isArray(value)||value.length>100)fail(400,'A quote can hold up to 100 openings.');
  const seen=new Set();return value.map(raw=>{
    identifier(raw?.id);if(seen.has(raw.id))fail(400,'Opening identifiers must be unique.');seen.add(raw.id);
    const o=Object.fromEntries(['id','name','width','height','quantity','left','right','louver','frame','frameStyle','sides','mount','sizeMethod','color','tilt','stile','divider','divisionMode','notes','tposts'].filter(k=>raw[k]!==undefined).map(k=>[k,structuredClone(raw[k])]));
    o.name=text(o.name,'opening name',80,true);o.notes=text(o.notes||'','opening notes',1200);
    calculate(o);return o;
  });
}
const summary=q=>({id:q.id,contactId:q.contactId,number:q.number,name:q.name,status:q.status,orderId:q.orderId,quoteId:q.quoteId,createdAt:q.createdAt,updatedAt:q.updatedAt,version:q.version,openingCount:q.openings.length,total:quoteTotals(q).total,unpriced:quoteTotals(q).unpriced});
export async function runSales(state,operation,data,time,publish){
  state.contacts??={};state.quotes??={};state.orders??={};state.salesCounters??={quote:0,order:0};state.pricing??={rateCents:null,minimumAreaHundredths:0,version:0};
  const touch=r=>{r.version++;r.updatedAt=time;return r;};
  const orderSummary=q=>({...summary(q),released:!!state.jobs[q.id],productionStage:production(state.jobs[q.id]).key});
  if(operation==='pricing-save'){current(state.pricing,data.version);const rateCents=amount(data.rateCents,'price per square foot',1000000);if(!rateCents)fail(400,'Enter a price greater than zero.');state.pricing={rateCents,minimumAreaHundredths:amount(data.minimumAreaHundredths,'minimum square footage',100000),version:state.pricing.version+1,updatedAt:time};return {pricing:state.pricing};}
  if(operation==='sales')return {pricing:state.pricing,contacts:Object.values(state.contacts).sort((a,b)=>b.updatedAt-a.updatedAt),quotes:Object.values(state.quotes).map(summary),orders:Object.values(state.orders).map(orderSummary)};
  if(operation==='sales-get'){
    if(data.kind==='contact'){const contact=get(state.contacts,data.id);return {contact,quotes:Object.values(state.quotes).filter(q=>q.contactId===contact.id).map(summary),orders:Object.values(state.orders).filter(q=>q.contactId===contact.id).map(orderSummary)};}
    if(!['quote','order'].includes(data.kind))fail(400,'Choose a contact, quote, or order.');
    const record=get(data.kind==='quote'?state.quotes:state.orders,data.id);
    return {record,contact:record.customer||get(state.contacts,record.contactId),totals:quoteTotals(record),previews:record.openings.map(o=>calculate(o).louverLayout||null),released:!!state.jobs[record.id],...(data.kind==='order'?{productionStage:production(state.jobs[record.id]).key}:{})};
  }
  if(operation==='contact-save'){
    const id=identifier(data.id),previous=state.contacts[id];if(previous)current(previous,data.version);else if(data.version!==0)fail(409,'This contact no longer exists.');
    if(!previous&&Object.keys(state.contacts).length>=2000)fail(400,'Contact capacity reached.');
    const fields=data.fields||{};
    if(typeof fields!=='object'||Array.isArray(fields))fail(400,'Enter valid contact details.');
    const contact={id,firstName:text(fields.firstName,'first name',80),lastName:text(fields.lastName,'last name',80),...contactAddress(fields,previous),phone:text(fields.phone,'phone number',60),email:text(fields.email,'email',254),notes:text(fields.notes??previous?.notes??'','contact notes',10000),createdAt:previous?.createdAt||time,updatedAt:time,version:(previous?.version||0)+1};
    if(!contactName(contact))fail(400,'Enter a first or last name.');
    if(contact.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email))fail(400,'Enter a valid email address.');
    state.contacts[id]=contact;return {contact};
  }
  if(operation==='quote-create'){
    const id=identifier(data.id),contact=get(state.contacts,data.contactId);if(state.quotes[id])return {quote:state.quotes[id]};
    if(Object.keys(state.quotes).length>=1000)fail(400,'Quote capacity reached.');
    const quote={id,contactId:contact.id,number:'Q-'+String(++state.salesCounters.quote).padStart(4,'0'),name:text(data.name||'Shutter Smart shutters','quote name',100,true),status:'draft',pricing:structuredClone(state.pricing),openings:[],unitPrices:{},installationCents:0,discountCents:0,taxBasisPoints:0,notes:'',validUntil:'',createdAt:time,updatedAt:time,version:1};
    state.quotes[id]=quote;return {quote};
  }
  if(operation==='quote-save'){
    const previous=get(state.quotes,data.id);current(previous,data.version);if(previous.status==='ordered')fail(409,'This quote has been converted to an order and cannot be changed.');
    const fields=data.fields;if(!fields||typeof fields!=='object'||Array.isArray(fields))fail(400,'Enter quote details.');
    const quote=structuredClone(previous);
    if(fields.useCurrentPricing===true)quote.pricing=structuredClone(state.pricing);
    if('openings'in fields)quote.openings=openings(fields.openings);
    if('name'in fields)quote.name=text(fields.name,'quote name',100,true);
    if('notes'in fields)quote.notes=text(fields.notes,'quote notes',5000);
    if('validUntil'in fields)quote.validUntil=date(fields.validUntil);
    for(const key of ['installationCents','discountCents','taxBasisPoints'])if(key in fields)quote[key]=amount(fields[key],key==='taxBasisPoints'?'tax rate':'amount',key==='taxBasisPoints'?10000:100000000);
    if(fields.unitPrices!==undefined&&(!fields.unitPrices||typeof fields.unitPrices!=='object'||Array.isArray(fields.unitPrices)))fail(400,'Enter valid prices.');
    const prices=fields.unitPrices||quote.unitPrices;
    quote.unitPrices=Object.fromEntries(quote.openings.map(o=>[o.id,prices[o.id]===null||prices[o.id]===undefined?null:amount(prices[o.id],'unit price')]));
    if('status'in fields){if(!['draft','ready'].includes(fields.status))fail(400,'Choose draft or ready.');quote.status=fields.status;}
    const totals=quoteTotals(quote);
    if(quote.status==='ready'&&(!quote.openings.length||totals.unpriced))fail(400,'Add openings and price every opening before marking the quote ready.');
    state.quotes[quote.id]=touch(quote);return {quote,totals};
  }
  if(operation==='quote-convert'){
    const quote=get(state.quotes,data.id);
    if(quote.orderId)return {order:get(state.orders,quote.orderId)};
    current(quote,data.version);
    if(!quote.openings.length||quoteTotals(quote).unpriced)fail(400,'Add openings and price every opening before converting to an order.');
    const id=randomUUID();if(Object.keys(state.orders).length>=1000)fail(400,'Order capacity reached.');
    const order={...structuredClone(quote),id,quoteId:quote.id,quoteNumber:quote.number,number:'O-'+String(++state.salesCounters.order).padStart(4,'0'),status:'ordered',customer:structuredClone(get(state.contacts,quote.contactId)),createdAt:time,updatedAt:time,version:1};
    state.orders[id]=order;quote.status='ordered';quote.orderId=id;touch(quote);return {order};
  }
  if(operation==='order-release'){
    const order=get(state.orders,data.id);if(state.jobs[order.id])return {job:state.jobs[order.id]};
    current(order,data.version);
    const result=await publish({job:{id:order.id,name:order.name,number:order.number,notes:'',due:data.due||'',openings:structuredClone(order.openings)},targetMinutes:data.targetMinutes,due:data.due});
    touch(order);order.status='in-production';return result;
  }
  fail(404,'Unknown sales action.');
}

export function orderJob(order){return {id:order.id,name:order.name,number:order.number,customer:contactName(order.customer).slice(0,120),notes:'',due:'',openings:structuredClone(order.openings)};}
