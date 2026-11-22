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
// Group only identical finished sizes. Counts include every ordered unit.
export function groupFinishedPanels(panels){
 const groups=[];
 for(const p of panels){
  let group=groups.find(g=>g.width===p.width&&g.height===p.height);
  if(!group){group={width:p.width,height:p.height,quantity:0,tilts:{}};groups.push(group);}
  group.quantity+=p.quantity;
  group.tilts[p.tiltPosition]=(group.tilts[p.tiltPosition]||0)+p.quantity;
 }
 return groups;
}
export function finishedPanelLines(o,result){
 if(!isSliding(o))return [];
 return groupFinishedPanels(slidingPanelSchedule(o,result)).map(p=>`${panelDimension(p.width)}" W × ${panelDimension(p.height)}" H · Qty ${p.quantity} · Tilt: ${['Left','Right','Center','Internal'].filter(side=>p.tilts[side]).map(side=>`${p.tilts[side]} ${side}`).join(' / ')}`);
}
export function slidingPanelTable(o,result){
 const lines=finishedPanelLines(o,result);
 if(!lines.length)return '';
 return `<section class="sliding-panel-list" aria-label="Finished panels">${lines.map(line=>`<p><strong>Panel size</strong><span>${escape(line)}</span></p>`).join('')}</section>`;
}
