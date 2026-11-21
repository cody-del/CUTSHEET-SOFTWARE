import {isSliding,slidingPanelSchedule} from './sliding.js';
import {measurementInput} from './measurements.js';

export const trackName=track=>({F:'Front',M:'Middle',B:'Back'})[track];
// Finished sizes are always inches, independently of the parts-list units.
// Dividing equal panels can produce 1/32, 1/48, etc. Never round the panel
// to the eighth-inch input picker: that would misstate its finished overlap.
export function panelDimension(mm){
 if(!Number.isFinite(mm))return '—';
 const inches=mm/25.4,whole=Math.floor(inches),fraction=inches-whole;
 for(let denominator=1;denominator<=64;denominator++){
  const numerator=Math.round(fraction*denominator);
  if(Math.abs(fraction-numerator/denominator)>1e-9)continue;
  if(!numerator)return String(whole);
  if(numerator===denominator)return String(whole+1);
  return `${whole?whole+' ':''}${numerator}/${denominator}`;
 }
 // Preserve unusual decimal inputs instead of inventing a rounded fraction.
 return measurementInput(inches);
}
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function slidingPanelTable(o,result){
 if(!isSliding(o))return '';
 const panels=slidingPanelSchedule(o,result),total=panels.reduce((sum,p)=>sum+p.quantity,0);
 return `<section class="sliding-panel-list" aria-label="Finished panels"><div class="sliding-panel-heading"><h3>Finished panels</h3><strong>${total} panels total</strong></div><p>Left to right, viewed from inside the room. Quantities include all ${o.quantity} ${o.quantity===1?'unit':'units'}.</p><div class="sliding-panel-scroll"><table><thead><tr><th scope="col">Panel</th><th scope="col">Track</th><th scope="col">Width (in)</th><th scope="col">Height (in)</th><th scope="col">Qty</th><th scope="col">Tilt position</th></tr></thead><tbody>${panels.map(p=>`<tr><th scope="row">${p.number}</th><td>${trackName(p.track)}</td><td>${escape(panelDimension(p.width))}</td><td>${escape(panelDimension(p.height))}</td><td>${p.quantity}</td><td>${p.tiltPosition}</td></tr>`).join('')}</tbody></table></div></section>`;
}
