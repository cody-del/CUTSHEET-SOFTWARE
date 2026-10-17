// Keep the formatted address for existing contact views and frozen order PDFs.
export function formatContactAddress({streetAddress='',city='',zipCode=''}) {
  const locality=city||zipCode?[city, ['FL',zipCode].filter(Boolean).join(' ')].filter(Boolean).join(', '):'';
  return [streetAddress,locality].filter(Boolean).join('\n');
}

export function contactAddressFields(contact={}) {
  if(typeof contact.streetAddress==='string')return {streetAddress:contact.streetAddress,city:contact.city||'',zipCode:contact.zipCode||''};
  const address=contact.address||'',fallback={streetAddress:address,city:'',zipCode:''};
  if(!address)return fallback;
  // Recognize an explicit Florida city line; preserve everything else verbatim.
  const lines=address.trim().split(/\r?\n/),last=lines.pop();
  const match=last.match(/^(.+?)(?:,\s*|\s+)(?:Florida|FL)(?:\s+(\d{5}(?:-\d{4})?))?$/i);
  if(!match)return fallback;
  let city=match[1].trim();
  const comma=city.lastIndexOf(',');
  if(comma>=0){lines.push(city.slice(0,comma).trim());city=city.slice(comma+1).trim();}
  if(!city||(!lines.length&&/^\d/.test(city)))return fallback;
  return {streetAddress:lines.join('\n'),city,zipCode:match[2]||''};
}
