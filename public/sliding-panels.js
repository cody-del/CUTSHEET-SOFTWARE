import {isSliding,slidingPanelSchedule} from './sliding.js';
import {shutterMeasurementLabel} from './shuttersmart-inputs.js';

export const trackName=track=>({F:'Front',M:'Middle',B:'Back'})[track];
export const panelDimension=(mm,units='in')=>Number.isFinite(mm)?units==='in'?shutterMeasurementLabel(mm/25.4):String(Number(mm.toFixed(3))):'—';
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function slidingPanelTable(o,result,{units='in'}={}){
 if(!isSliding(o))return '';
 const panels=slidingPanelSchedule(o,result),total=panels.reduce((sum,p)=>sum+p.quantity,0);
 return `<section class="sliding-panel-list" aria-label="Finished panels"><div class="sliding-panel-heading"><h3>Finished panels</h3><strong>${total} panels total</strong></div><p>Left to right, viewed from inside the room. Quantities include all ${o.quantity} ${o.quantity===1?'unit':'units'}.</p><div class="sliding-panel-scroll"><table><thead><tr><th scope="col">Panel</th><th scope="col">Track</th><th scope="col">Width (${units})</th><th scope="col">Height (${units})</th><th scope="col">Qty</th><th scope="col">Tilt position</th></tr></thead><tbody>${panels.map(p=>`<tr><th scope="row">${p.number}</th><td>${trackName(p.track)}</td><td>${escape(panelDimension(p.width,units))}</td><td>${escape(panelDimension(p.height,units))}</td><td>${p.quantity}</td><td>${p.tiltPosition}</td></tr>`).join('')}</tbody></table></div></section>`;
}
