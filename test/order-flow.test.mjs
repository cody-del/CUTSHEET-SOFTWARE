import test from 'node:test';
import assert from 'node:assert/strict';
import {orderActionsSection,orderPaymentPage,orderPaymentHistory} from '../public/order-ui.js';

const fixture=()=>({record:{id:'order-a',number:'O-5000',name:'Sample order',openings:[{productId:'shuttersmart'}]},contact:{firstName:'Sample',lastName:'Customer'},totals:{total:10000},released:true,productionStage:'cutting',readiness:{status:'released'}});
const primary=html=>[...html.matchAll(/class="btn primary"[^>]*>([^<]+)</g)].map(match=>match[1]);

test('released orders lead with printing and open the existing digital job and controlled measurement editor',()=>{
 const html=orderActionsSection(fixture());
 assert.deepEqual(primary(html),['Print cut sheets']);
 assert.match(html,/Sent to Production · Cutting/);
 assert.match(html,/href="\/owner.html\?job=order-a&from=order">Digital cut sheets/);
 assert.match(html,/href="\/editor.html\?order=order-a&edit=1&from=order">Edit measurements/);
 assert.doesNotMatch(html,/Record payment|Create cut sheet|draft=/);
 assert.match(html,/Edit measurements<\/a><button[^>]+data-action="document">Print customer order/);
});

test('unsent orders lead with release only when ready; blocked or unknown readiness leads to correction',()=>{
 const detail={...fixture(),released:false,readiness:{status:'ready'}};
 assert.deepEqual(primary(orderActionsSection(detail)),['Send to Production']);
 detail.readiness={status:'blocked',issues:[{openingName:'Kitchen <door>',message:'Check light gap'}]};
 const html=orderActionsSection(detail);
 assert.deepEqual(primary(html),['Edit measurements']);
 assert.match(html,/Kitchen &lt;door&gt;/);
 assert.doesNotMatch(html,/data-action="release"|data-action="cut-pdf"|Digital cut sheets/);
 delete detail.readiness;
 assert.deepEqual(primary(orderActionsSection(detail)),['Edit measurements']);
});

test('removed orders offer restoration, not another release or a new job',()=>{
 const html=orderActionsSection({...fixture(),productionStage:'removed'});
 assert.deepEqual(primary(html),['Restore in Production']);
 assert.match(html,/owner.html\?job=order-a&from=order/);
 assert.match(html,/data-action="cut-pdf"/);
 assert.doesNotMatch(html,/data-action="release"|>Digital cut sheets</);
});

test('supplier-only orders never offer manufacturing; mixed orders identify only ShutterSmart openings',()=>{
 const detail=fixture();detail.record.openings=[{productId:'elegant-shutters'}];
 assert.deepEqual(primary(orderActionsSection(detail)),['Print customer order']);
 assert.doesNotMatch(orderActionsSection(detail),/cut-pdf|owner.html|editor.html|data-action="release"/);
 detail.record.openings.push({productId:'shuttersmart'});
 assert.match(orderActionsSection(detail),/1 ShutterSmart opening only/);
 assert.deepEqual(primary(orderActionsSection(detail)),['Print cut sheets']);
});

test('order confirmation has one next action, explains the handoff, and cannot bypass payment confirmation',()=>{
 const detail={...fixture(),released:false,readiness:{status:'ready'}};
 const html=orderPaymentPage(detail,()=>'<input>');
 assert.deepEqual(primary(html),['Confirm &amp; send to Production']);
 assert.match(html,/You can print them on the next screen/);
 assert.doesNotMatch(html,/<aside|data-action="release"|View cut sheets/);
 detail.readiness={status:'blocked',issues:[{openingName:'Kitchen',message:'Check size'}]};
 assert.match(orderPaymentPage(detail,()=>''),/Measurements need review/);
 detail.record.openings=[{productId:'starwood'}];detail.readiness={status:'not-applicable'};
 assert.deepEqual(primary(orderPaymentPage(detail,()=>'')),['Confirm order &amp; payment']);
 assert.match(orderPaymentPage(detail,()=>''),/These products do not create cut sheets/);
});

test('visible payment history preserves all entries, corrections and receipt amounts',()=>{
 const detail=fixture();detail.record.finance={payments:[
  {id:'p1',amountCents:50000,receivedOn:'2026-11-01',method:'check',note:'Deposit'},
  {id:'p2',amountCents:20000,receivedOn:'2026-11-02',method:'cash',note:'<receipt>',voidedAt:1,voidReason:'Wrong amount <corrected>'},
  {id:'p3',amountCents:30000,receivedOn:'2026-11-03',method:'card',note:'Balance'}
 ]};
 const html=orderPaymentHistory(detail);
 assert.doesNotMatch(html,/<details|<summary|<receipt>|<corrected>/);
 for(const value of ['$500.00','$200.00','$300.00','Deposit','Balance','&lt;receipt&gt;','Wrong amount &lt;corrected&gt;'])assert.ok(html.includes(value));
 assert.equal((html.match(/class="payment-entry /g)||[]).length,3);
 assert.equal((html.match(/data-void-payment=/g)||[]).length,2);
 assert.doesNotMatch(html,/data-void-payment="p2"/);
});
