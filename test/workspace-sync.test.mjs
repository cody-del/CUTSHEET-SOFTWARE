import test from 'node:test';
import assert from 'node:assert/strict';
import {startWorkspaceSync,sameSnapshot} from '../public/workspace-sync.js';
function environment(t){
 const oldWindow=globalThis.window,oldDocument=globalThis.document;
 const window=new EventTarget(),document=new EventTarget(),label={textContent:''};
 document.hidden=false;document.querySelectorAll=()=>[label];globalThis.window=window;globalThis.document=document;
 t.mock.timers.enable({apis:['setInterval','Date'],now:1000});
 t.after(()=>{window.dispatchEvent(new Event('pagehide'));globalThis.window=oldWindow;globalThis.document=oldDocument;});
 return {window,document,label,tick:async ms=>{t.mock.timers.tick(ms);await Promise.resolve();await Promise.resolve();}};
}
test('background sync runs every 30 seconds and defers while hidden or editing',async t=>{
 const {document,tick}=environment(t);let calls=0,editing=false;
 startWorkspaceSync(async()=>{calls++;},{canRefresh:()=>!editing});
 await tick(29000);assert.equal(calls,0);await tick(1000);assert.equal(calls,1);
 editing=true;await tick(30000);assert.equal(calls,1);editing=false;document.hidden=true;await tick(30000);assert.equal(calls,1);
 document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));await tick(0);assert.equal(calls,2);
});
test('reconnection and another tab saving refresh promptly; overlapping refreshes are prevented',async t=>{
 const {window,tick}=environment(t);let calls=0,finish;
 startWorkspaceSync(()=>{calls++;return new Promise(r=>finish=r);});
 window.dispatchEvent(new Event('online'));window.dispatchEvent(new Event('online'));await tick(30000);assert.equal(calls,1);
 finish();await tick(0);window.dispatchEvent(new Event('shop-invalidate'));await tick(1000);assert.equal(calls,2);finish();
});
test('network failures are visible and the timer resumes after browser back/forward restoration',async t=>{
 const {window,label,tick}=environment(t);let calls=0;
 startWorkspaceSync(async()=>{calls++;throw Error('offline');},{connected:false});assert.match(label.textContent,/Waiting/);
 await tick(30000);assert.match(label.textContent,/interrupted/);window.dispatchEvent(new Event('pagehide'));await tick(30000);assert.equal(calls,1);
 const event=new Event('pageshow');event.persisted=true;window.dispatchEvent(event);await tick(0);assert.equal(calls,2);await tick(30000);assert.equal(calls,3);
});
test('changing only the server clock does not trigger a disruptive page rerender',()=>{
 assert.ok(sameSnapshot({board:{serverTime:1,jobs:[{version:1}]}},{board:{serverTime:2,jobs:[{version:1}]}}));
 assert.equal(sameSnapshot({jobs:[{version:1}]},{jobs:[{version:2}]}),false);
});
