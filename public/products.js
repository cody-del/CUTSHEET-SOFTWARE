// Existing untagged records were created by the ShutterSmart-only application.
// Explicit unknown products never inherit manufacturing capabilities.
export const PRODUCTS=Object.freeze([
  Object.freeze({id:'shuttersmart',name:'ShutterSmart',cutSheets:true}),
  Object.freeze({id:'elegant-shutters',name:'Elegant Shutters',cutSheets:false}),
  Object.freeze({id:'starwood',name:'Starwood',cutSheets:false}),
  Object.freeze({id:'other',name:'Other brand',cutSheets:false})
]);
export const productId=record=>record?.productId===undefined?'shuttersmart':record.productId;
export const productFor=record=>PRODUCTS.find(product=>product.id===productId(record));
export const productName=record=>productId(record)==='other'?(record.productLabel||'Other brand'):(productFor(record)?.name||'Unknown product');
export const supportsCutSheets=record=>productId(record)==='shuttersmart';
export const CUT_SHEETS_ONLY='Cut sheets and shop production are available only for ShutterSmart.';
