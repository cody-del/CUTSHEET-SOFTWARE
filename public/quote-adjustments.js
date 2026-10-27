// Keep editor adjustments in the same integer-cent format as saved proposals.
export function quoteAdjustmentFields(record){
  return Object.fromEntries(['discountCents','installationCents','taxBasisPoints'].map(key=>[key,record[key]??0]));
}

export function parseQuoteAmount(value,{optional=false,tax=false}={}){
  const raw=value.trim();
  if(!raw)return optional?null:0;
  if(!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(raw))throw new Error(tax?'Enter a percentage from 0 to 100, with up to two decimals.':'Enter a positive amount or zero, with up to two decimals.');
  const [whole,fraction='']=raw.split('.'),amount=Number(whole||0)*100+Number(fraction.padEnd(2,'0'));
  if(!Number.isSafeInteger(amount)||amount>(tax?10000:100000000))throw new Error(tax?'Tax must be between 0 and 100%.':'The maximum amount is $1,000,000.00.');
  return amount;
}
