import {orderFinancials,salesFinancials} from './public/order-finance.js';
import {orderReadiness,orderManufacturingOpenings} from './order-manufacturing.mjs';
import {quotePricing} from './public/quote-pricing.js';
import {PRODUCTS,productId,productFor,productName,lineProduct,isManufacturingLine,manufacturingOpenings,hasManufacturingLines,quoteProductNames,supportsCutSheets,CUT_SHEETS_ONLY} from './public/products.js';
import {randomUUID} from 'node:crypto';
import {calculate} from './calculations.mjs';
import {production} from './public/shop-state.js';
import {formatContactAddress} from './public/contact-address.js';

export const salesOperations=['sales','pricing-save','sales-get','contact-save','quote-create','quote-product','quote-save','quote-convert','order-release','order-confirm','order-payment','order-payment-void','order-specifications-save'];
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
  for(const price of Object.values(quote.unitPrices))if(price!=null)amount(price,'unit price');
  amount(quote.discountCents,'discount');amount(quote.installationCents,'installation');amount(quote.taxBasisPoints,'tax rate',10000);
  const totals=quotePricing(quote);
  if(!Number.isSafeInteger(totals.subtotal)||totals.subtotal>10000000000)fail(400,'The quote total is too large.');
  if(totals.discount>totals.subtotal)fail(400,'Discount cannot exceed the product subtotal.');
  return totals;
}
const requireProduct=record=>{const product=productFor(record);if(!product)fail(400,'Choose a supported product.');return product;};
const requireCutSheets=record=>{if(!hasManufacturingLines(record))fail(422,CUT_SHEETS_ONLY);};
function openings(value,record,pricingFor){
  if(!Array.isArray(value)||value.length>100)fail(400,'A quote can hold up to 100 openings.');
  const seen=new Set();return value.map(raw=>{
    identifier(raw?.id);if(seen.has(raw.id))fail(400,'Opening identifiers must be unique.');seen.add(raw.id);
    const previous=record.openings.find(o=>o.id===raw.id),identity=raw.productId===undefined?lineProduct(previous,record):lineProduct(raw,record);
    requireProduct(identity);
    if(previous&&(productId(identity)!==productId(lineProduct(previous,record))||identity.productLabel!==lineProduct(previous,record).productLabel))fail(400,'Add a new line item to choose a different product.');
    const keys=supportsCutSheets(identity)?['id','name','width','height','quantity','left','right','louver','frame','frameStyle','sides','mount','sizeMethod','color','tilt','stile','divider','divisionMode','notes','tposts']:['id','name','width','height','quantity','notes'];
    const o=Object.fromEntries(keys.filter(k=>raw[k]!==undefined).map(k=>[k,structuredClone(raw[k])]));
    if(raw.productId!==undefined||previous?.productId!==undefined){
      o.productId=productId(identity);
      if(o.productId==='other')o.productLabel=text(identity.productLabel,'brand name',80,true);
      // The server owns price snapshots; a client cannot supply a fabricated rate.
      o.pricing=structuredClone(previous?.pricing??(previous&&productId(identity)===productId(record)?record.pricing:pricingFor(identity)));
    }
    o.name=text(o.name,'opening name',80,true);o.notes=text(o.notes||'','opening notes',1200);
    if(supportsCutSheets(identity))calculate(o);
    else{
      for(const key of ['width','height'])if(typeof o[key]!=='number'||!Number.isFinite(o[key])||o[key]<=0||o[key]>10000)fail(400,'Enter dimensions greater than zero and no larger than 10,000 inches.');
      if(!Number.isInteger(o.quantity)||o.quantity<1||o.quantity>100)fail(400,'Quantity must be a whole number between 1 and 100.');
    }
    return o;
  });
}
const summary=q=>({id:q.id,productId:productId(q),productLabel:q.productLabel,productNames:quoteProductNames(q),manufacturingOpeningCount:manufacturingOpenings(q).length,contactId:q.contactId,number:q.number,name:q.name,status:q.status,orderId:q.orderId,quoteId:q.quoteId,createdAt:q.createdAt,updatedAt:q.updatedAt,version:q.version,openingCount:q.openings.length,total:quoteTotals(q).total,unpriced:quoteTotals(q).unpriced});
export async function runSales(state,operation,data,time,publish){
  state.contacts??={};state.quotes??={};state.orders??={};state.salesCounters??={quote:0,order:0};state.pricing??={rateCents:null,minimumAreaHundredths:0,version:0};
  state.productPricing??={};
  const pricingFor=record=>productId(record)==='other'?{rateCents:null,minimumAreaHundredths:0,version:0}:supportsCutSheets(record)?state.pricing:state.productPricing[requireProduct(record).id]||{rateCents:null,minimumAreaHundredths:0,version:0};
  const touch=r=>{r.version++;r.updatedAt=time;return r;};
  const orderSummary=q=>({...summary(q),released:!!state.jobs[q.id],productionStage:hasManufacturingLines(q)?production(state.jobs[q.id]).key:null,financials:orderFinancials(q,quoteTotals(q).total),readiness:orderReadiness(q,!!state.jobs[q.id])});
  if(operation==='pricing-save'){
    const product=requireProduct(data),previous=pricingFor(data);if(product.id==='other')fail(400,'Set a unit price on each line for other brands.');current(previous,data.version);
    const rateCents=amount(data.rateCents,'price per square foot',1000000);if(!rateCents)fail(400,'Enter a price greater than zero.');
    const pricing={rateCents,minimumAreaHundredths:amount(data.minimumAreaHundredths,'minimum square footage',100000),version:previous.version+1,updatedAt:time};
    if(supportsCutSheets(data))state.pricing=pricing;else state.productPricing[product.id]=pricing;
    return {productId:product.id,pricing};
  }
  if(operation==='sales'){const orders=Object.values(state.orders).map(orderSummary);return {financials:salesFinancials(orders),pricing:state.pricing,productPricing:Object.fromEntries(PRODUCTS.map(product=>[product.id,pricingFor({productId:product.id})])),contacts:Object.values(state.contacts).sort((a,b)=>b.updatedAt-a.updatedAt),quotes:Object.values(state.quotes).map(summary),orders};}
  if(operation==='sales-get'){
    if(data.kind==='contact'){const contact=get(state.contacts,data.id);return {contact,quotes:Object.values(state.quotes).filter(q=>q.contactId===contact.id).map(summary),orders:Object.values(state.orders).filter(q=>q.contactId===contact.id).map(orderSummary),cutSheets:Object.values(state.drafts||{}).filter(d=>d.contactId===contact.id).map(d=>({id:d.id,name:d.name,number:d.number,openingCount:d.openings.length,archived:d.archived,released:!!state.jobs[d.id],stage:state.jobs[d.id]?production(state.jobs[d.id]).label:'Draft'}))};}
    if(!['quote','order'].includes(data.kind))fail(400,'Choose a contact, quote, or order.');
    const record=get(data.kind==='quote'?state.quotes:state.orders,data.id);
    requireProduct(record);
    return {record:{...record,productId:productId(record)},contact:record.customer||get(state.contacts,record.contactId),totals:quoteTotals(record),previews:hasManufacturingLines(record)?record.openings.map(o=>isManufacturingLine(o,record)?calculate(o).louverLayout||null:null):[],productPricing:Object.fromEntries(PRODUCTS.map(p=>[p.id,pricingFor({productId:p.id})])),released:!!state.jobs[record.id],...(data.kind==='order'?{productionStage:hasManufacturingLines(record)?production(state.jobs[record.id]).key:null,financials:orderFinancials(record,quoteTotals(record).total),readiness:orderReadiness(record,!!state.jobs[record.id])}:{})};
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
    const id=identifier(data.id),contact=get(state.contacts,data.contactId),product=requireProduct(data);
    if(state.quotes[id]){if(productId(state.quotes[id])!==product.id)fail(409,'This quote already uses a different product.');return {quote:state.quotes[id]};}
    if(Object.keys(state.quotes).length>=1000)fail(400,'Quote capacity reached.');
    const quote={id,contactId:contact.id,productId:product.id,...(product.id==='other'?{productLabel:text(data.productLabel,'brand name',80,true)}:{}),number:'Q-'+String(++state.salesCounters.quote).padStart(4,'0'),name:text(data.name||product.name,'quote name',100,true),status:'draft',pricing:structuredClone(pricingFor(data)),openings:[],unitPrices:{},installationCents:0,discountCents:0,taxBasisPoints:0,notes:'',validUntil:'',createdAt:time,updatedAt:time,version:1};
    state.quotes[id]=quote;return {quote};
  }
  if(operation==='quote-product'){
    const previous=get(state.quotes,data.id);current(previous,data.version);
    if(previous.status==='ordered')fail(409,'This quote has been converted to an order and cannot be changed.');
    if(previous.openings.length)fail(409,'Start a separate quote for this product to keep the existing line items.');
    const product=requireProduct(data),label=product.id==='other'?text(data.productLabel,'brand name',80,true):undefined;
    const quote={...structuredClone(previous),productId:product.id,pricing:structuredClone(pricingFor(data)),unitPrices:{},status:'draft'};
    delete quote.productLabel;if(label)quote.productLabel=label;
    if([productName(previous),'Shutter Smart shutters'].includes(previous.name))quote.name=productName(quote);
    quoteTotals(quote);state.quotes[quote.id]=touch(quote);return {quote};
  }
  if(operation==='quote-save'){
    const previous=get(state.quotes,data.id);current(previous,data.version);if(previous.status==='ordered')fail(409,'This quote has been converted to an order and cannot be changed.');
    const fields=data.fields;if(!fields||typeof fields!=='object'||Array.isArray(fields))fail(400,'Enter quote details.');
    const quote=structuredClone(previous);requireProduct(quote);quote.productId=productId(quote);
    if(('productId'in fields&&fields.productId!==quote.productId)||('productLabel'in fields&&fields.productLabel!==quote.productLabel))fail(400,'Start a new quote to select a different product.');
    if('openings'in fields){
      // An older tab must not replace a newer multi-product quote with untagged data.
      quote.openings=openings(fields.openings,quote,pricingFor);
    }
    if(fields.useCurrentPricing===true){quote.pricing=structuredClone(pricingFor(quote));for(const o of quote.openings)if(o.productId!==undefined)o.pricing=structuredClone(pricingFor(lineProduct(o,quote)));}
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
    requireProduct(quote);
    if(quote.orderId)return {order:get(state.orders,quote.orderId)};
    current(quote,data.version);
    if(!quote.openings.length||quoteTotals(quote).unpriced)fail(400,'Add openings and price every opening before converting to an order.');
    const id=randomUUID();if(Object.keys(state.orders).length>=1000)fail(400,'Order capacity reached.');
    const order={...structuredClone(quote),productId:productId(quote),id,quoteId:quote.id,quoteNumber:quote.number,number:'O-'+String(++state.salesCounters.order).padStart(4,'0'),status:'ordered',customer:structuredClone(get(state.contacts,quote.contactId)),createdAt:time,updatedAt:time,version:1};
    state.orders[id]=order;quote.status='ordered';quote.orderId=id;touch(quote);return {order};
  }
  const orderResult=order=>({order,financials:orderFinancials(order,quoteTotals(order).total),released:!!state.jobs[order.id],readiness:orderReadiness(order,!!state.jobs[order.id]),releaseIssue:order.releaseIssue||''});
  async function sendConfirmedOrder(order){
    if(!hasManufacturingLines(order)||state.jobs[order.id])return;
    const ready=orderReadiness(order);if(ready.status==='blocked'){order.releaseIssue=ready.issues.map(i=>i.openingName+': '+i.message).join(' ');return;}
    try{await publish({job:orderJob(order)});order.status='in-production';delete order.releaseIssue;}
    catch(e){if(![400,409,422].includes(e.status))throw e;order.releaseIssue=e.message;}
  }
  const paymentInput=raw=>{
    const input=raw||{},id=identifier(input.id),amountCents=amount(input.amountCents,'payment amount',10000000000);
    const receivedOn=date(input.receivedOn);if(!receivedOn)fail(400,'Enter the payment date.');
    if(!['cash','check','card','transfer','other'].includes(input.method))fail(400,'Choose a payment method.');
    return {id,amountCents,receivedOn,method:input.method,note:text(input.note||'','payment note',500)};
  };
  if(operation==='order-confirm'){
    const order=get(state.orders,data.id),confirmationId=identifier(data.confirmationId),saleTotalCents=amount(data.saleTotalCents,'agreed order total',10000000000),payment=paymentInput(data.payment);
    if(payment.amountCents>saleTotalCents)fail(400,'Payment cannot exceed the agreed order total.');
    const confirmation={confirmationId,saleTotalCents,payment};
    if(order.finance?.confirmedAt){if(JSON.stringify(order.finance.confirmation)!==JSON.stringify(confirmation))fail(409,'This order was already confirmed. Reload it to record another payment.');return orderResult(order);}
    current(order,data.version);
    order.finance={confirmedAt:time,saleTotalCents,confirmation,payments:payment.amountCents?[{...payment,recordedAt:time}]:[]};
    await sendConfirmedOrder(order);touch(order);return orderResult(order);
  }
  if(operation==='order-payment'){
    const order=get(state.orders,data.id);if(!order.finance?.confirmedAt)fail(400,'Confirm the agreed order total first.');
    const payment=paymentInput(data.payment),previous=order.finance.payments.find(p=>p.id===payment.id);
    if(previous){if(Object.keys(payment).some(key=>payment[key]!==previous[key]))fail(409,'This payment ID was already used. Reload the order.');return orderResult(order);}
    current(order,data.version);if(!payment.amountCents)fail(400,'Enter a payment greater than zero.');
    if(payment.amountCents>orderFinancials(order).balanceCents)fail(400,'Payment cannot exceed the outstanding balance.');
    if(order.finance.payments.length>=1000)fail(400,'Payment record capacity reached.');
    order.finance.payments.push({...payment,recordedAt:time});touch(order);return orderResult(order);
  }
  if(operation==='order-payment-void'){
    const order=get(state.orders,data.id),payment=order.finance?.payments.find(p=>p.id===identifier(data.paymentId));if(!payment)fail(404,'Payment not found.');
    if(payment.voidedAt)return orderResult(order);current(order,data.version);
    payment.voidReason=text(data.reason,'correction reason',500,true);payment.voidedAt=time;touch(order);return orderResult(order);
  }
  if(operation==='order-specifications-save'){
    const order=get(state.orders,data.id);requireCutSheets(order);current(order,data.version);
    if(state.jobs[order.id])fail(409,'This order is already in the shop. Its manufacturing specifications are locked.');
    const original=manufacturingOpenings(order);
    if(!Array.isArray(data.openings)||data.openings.length!==original.length)fail(400,'Keep the same ShutterSmart openings and quantities as the sold order.');
    const canonical=openings(data.openings,{...order,productId:'shuttersmart',openings:orderManufacturingOpenings(order)},pricingFor);
    if(canonical.some((o,i)=>o.id!==original[i].id||o.quantity!==original[i].quantity||!isManufacturingLine(o,{productId:'shuttersmart'})))fail(400,'Keep the same ShutterSmart openings and quantities as the sold order.');
    order.specificationHistory=[...(order.specificationHistory||[]),{at:time,openings:structuredClone(orderManufacturingOpenings(order))}].slice(-20);
    order.manufacturingSpecifications=canonical.map(({pricing,...o})=>o);
    if(order.finance?.confirmedAt)await sendConfirmedOrder(order);touch(order);return orderResult(order);
  }
  if(operation==='order-release'){
    const order=get(state.orders,data.id);requireCutSheets(order);if(state.jobs[order.id])return {job:state.jobs[order.id]};
    current(order,data.version);
    const result=await publish({job:{...orderJob(order),due:data.due||''},targetMinutes:data.targetMinutes,due:data.due});
    touch(order);order.status='in-production';return result;
  }
  fail(404,'Unknown sales action.');
}

export function orderJob(order){requireCutSheets(order);return {productId:'shuttersmart',id:order.id,name:order.name,number:order.number,customer:contactName(order.customer).slice(0,120),notes:'',due:'',openings:orderManufacturingOpenings(order).map(o=>{const {pricing,...input}=o;return structuredClone(input);})};}
