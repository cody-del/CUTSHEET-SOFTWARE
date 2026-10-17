import {PRODUCTS,productId,productName,supportsCutSheets} from './products.js';
import {shopRequest} from './shop-client.js';
const h=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function quoteProductPicker(quote){
  return `<section class="quote-product-picker" aria-label="Quote product"><div class="field"><label for="build-product">Product</label><select id="build-product">${PRODUCTS.map(p=>`<option value="${p.id}" ${p.id===productId(quote)?'selected':''}>${h(p.name)}</option>`).join('')}</select></div><div class="product-layout-description"><strong>${h(productName(quote))}</strong><p>${supportsCutSheets(quote)?'Panel and frame configuration, pricing, and cut sheets after the sale.':'Measurements, product details, and pricing. No cut sheets.'}</p></div><p id="product-switch-error" class="field-error" role="alert"></p></section>`;
}

export const quoteBuilderURL=quote=>supportsCutSheets(quote)?'/?quote='+encodeURIComponent(quote.id):'/contacts.html#builder/'+encodeURIComponent(quote.id);

// Save first. Empty quotes can change product; populated quotes are preserved
// while a separate quote is created for the newly selected product.
export function bindQuoteProduct({beforeChange,navigate}){
  const select=document.querySelector('#build-product');if(!select)return;
  const previous=select.value,error=document.querySelector('#product-switch-error');
  select.addEventListener('change',async()=>{
    const next=select.value,product=PRODUCTS.find(p=>p.id===next);if(next===previous||!product)return;
    const main=select.closest('main');select.disabled=true;error.textContent='';if(main)main.inert=true;
    const restore=()=>{select.value=previous;select.disabled=false;if(main)main.inert=false;};
    try{
      const quote=await beforeChange();
      if(!select.isConnected)return;
      const separate=quote.openings.length>0,newId=crypto.randomUUID();
      const switchTo=async label=>{
        const data={productId:next,...(next==='other'?{productLabel:label}:{})};
        const result=separate?
          await shopRequest('quote-create',{...data,id:newId,contactId:quote.contactId,name:label||product.name}):
          await shopRequest('quote-product',{...data,id:quote.id,version:quote.version});
        navigate(result.quote);
      };
      if(!separate&&next!=='other'){await switchTo();restore();return;}
      if(main)main.inert=false;
      const dialog=document.createElement('dialog');dialog.className='product-switch-dialog';
      dialog.innerHTML=`<div class="modal-heading"><h2>${separate?'Start a separate quote':'Choose a brand'}</h2><button type="button" class="icon-btn" data-cancel aria-label="Close dialog">×</button></div><div class="modal-body">${separate?`<p>${h(quote.number)} and its ${h(productName(quote))} line items will stay saved. Create a separate ${h(product.name)} quote for this customer?</p>`:''}<form id="switch-product-form">${next==='other'?'<div class="field"><label for="switch-brand">Brand name</label><input id="switch-brand" maxlength="80" required placeholder="Enter the brand"></div>':''}</form><p class="field-error" role="alert" data-switch-error></p></div><div class="modal-footer"><button type="button" class="btn" data-cancel>Cancel</button><button type="submit" class="btn primary" form="switch-product-form">${separate?'Build new quote':'Use this brand'}</button></div>`;
      document.body.append(dialog);
      dialog.addEventListener('close',()=>{dialog.remove();restore();},{once:true});
      dialog.querySelectorAll('[data-cancel]').forEach(button=>button.onclick=()=>dialog.close());
      dialog.querySelector('form').onsubmit=async event=>{
        event.preventDefault();const buttons=dialog.querySelectorAll('button');buttons.forEach(button=>button.disabled=true);
        try{await switchTo(dialog.querySelector('input')?.value.trim());dialog.close();}
        catch(e){dialog.querySelector('[data-switch-error]').textContent=e.message;buttons.forEach(button=>button.disabled=false);}
      };
      dialog.showModal();dialog.querySelector('input')?.focus();
    }catch(e){restore();error.textContent=e.message;}
  });
}
