import {lineProduct,productId} from './products.js';
// Shared by the quote builder and the server so preview prices round identically.
export function openingPrice(opening,quote){
  const id=productId(lineProduct(opening,quote)),pricing=opening.pricing??(id===productId(quote)?quote.pricing:quote.productPricing?.[id]);
  const area=opening.width*opening.height/144,billableArea=Math.max(area,(pricing?.minimumAreaHundredths||0)/100);
  const override=quote.unitPrices?.[opening.id],rate=pricing?.rateCents;
  const unitPrice=override??(rate==null?null:Math.round(billableArea*rate));
  return {openingId:opening.id,area,billableArea,unitPrice,lineTotal:unitPrice===null?null:unitPrice*opening.quantity,override:override!=null};
}
export function quotePricing(quote){
  const lines=quote.openings.map(o=>openingPrice(o,quote)),subtotal=lines.reduce((sum,line)=>sum+(line.lineTotal??0),0);
  const discount=quote.discountCents||0,installation=quote.installationCents||0;
  const taxable=subtotal-discount+installation,tax=Math.round(taxable*(quote.taxBasisPoints||0)/10000);
  return {lines,subtotal,discount,installation,tax,total:taxable+tax,unpriced:lines.filter(line=>line.unitPrice===null).length};
}
