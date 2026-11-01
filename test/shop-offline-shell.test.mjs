import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createOfflineShell} from '../public/shop-offline-shell.js';

const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
function serviceWorker(){
 const sw=new EventTarget();sw.ready=Promise.resolve();sw.register=async()=>({});
 sw.controller={postMessage:(_,ports)=>ports[0].postMessage({type:'SHOP_OFFLINE_STATUS',ready:true})};return sw;
}
test('offline readiness waits for installation, control and a complete-cache acknowledgement',async()=>{
 const sw=serviceWorker(),installed=deferred(),reply=deferred(),states=[];let port;
 sw.ready=installed.promise;sw.controller=null;
 const shell=createOfflineShell({serviceWorker:sw,notify:s=>states.push(s),timeoutMs:2000});
 const result=shell.prepare();await Promise.resolve();assert.equal(shell.state(),'preparing');
 installed.resolve();await new Promise(r=>setImmediate(r));assert.equal(shell.state(),'preparing');
 sw.controller={postMessage:(_,ports)=>{port=ports[0];reply.resolve();}};sw.dispatchEvent(new Event('controllerchange'));
 await reply.promise;assert.equal(shell.state(),'preparing');
 port.postMessage({type:'SHOP_OFFLINE_STATUS',ready:true});assert.equal(await result,true);
 assert.deepEqual(states,['preparing','ready']);
});
test('missing cache entries, failed installs and old workers never report offline ready',async()=>{
 const sw=serviceWorker(),shell=createOfflineShell({serviceWorker:sw,probeMs:10,timeoutMs:100});
 const controller=sw.controller;sw.controller=null;sw.register=async()=>{throw Error('Quota exceeded');};assert.equal(await shell.prepare(),false);assert.equal(shell.state(),'error');
 sw.register=async()=>({});sw.controller=controller;sw.controller.postMessage=(_,ports)=>ports[0].postMessage({type:'SHOP_OFFLINE_STATUS',ready:false});
 assert.equal(await shell.prepare(),false);assert.equal(shell.state(),'error');
 sw.controller.postMessage=()=>{};assert.equal(await shell.prepare(),false);assert.equal(shell.state(),'error');
 sw.controller.postMessage=(_,ports)=>ports[0].postMessage({type:'SHOP_OFFLINE_STATUS',ready:true});
 assert.equal(await shell.prepare(),true);assert.equal(shell.state(),'ready');
});
test('an installed worker verifies cached files even when the update check has no network',async()=>{
 const sw=serviceWorker();sw.register=async()=>{throw Error('Offline');};
 const shell=createOfflineShell({serviceWorker:sw});assert.equal(await shell.prepare(),true);
});
test('a stalled installation times out without claiming readiness later',async()=>{
 const sw=serviceWorker(),installed=deferred();sw.ready=installed.promise;
 const shell=createOfflineShell({serviceWorker:sw,timeoutMs:10});assert.equal(await shell.prepare(),false);
 installed.resolve();await new Promise(r=>setImmediate(r));assert.equal(shell.state(),'error');
});

async function worker(){
 const handlers={},entries=new Map(),cache={addAll:async paths=>{for(const path of paths)entries.set(path,new Response(path));},match:async path=>entries.get(path)};
 const self={SHOP_CACHE:'cutsheet-shop-test',SHOP_ASSETS:['/shop.html','/shop.js','/shop.css'],location:{origin:'https://workshop.test'},addEventListener:(type,fn)=>{handlers[type]=fn;},clients:{claim:async()=>{},get:async id=>id==='owner'?{url:'https://workshop.test/owner.html'}:null}};
 vm.runInNewContext(await readFile(new URL('../public/shop-service-worker.js',import.meta.url),'utf8'),{self,importScripts(){},caches:{open:async()=>cache,keys:async()=>[],delete:async()=>{}},URL,fetch:async()=>{throw Error('Offline');}});
 await new Promise((resolve,reject)=>handlers.install({waitUntil:promise=>promise.then(resolve,reject)}));
 return {handlers,entries};
}
test('restored shop navigation with query parameters and no client can load all public assets offline',async()=>{
 const {handlers}=await worker();
 for(const path of ['/shop.html?job=test&opening=living-room','/shop.js','/shop.css']){
  let response;handlers.fetch({request:{method:'GET',url:'https://workshop.test'+path},clientId:'',respondWith:p=>{response=p;}});
  assert.equal(await (await response).text(),path.split('?')[0]);
 }
 let ownerAsset;handlers.fetch({request:{method:'GET',url:'https://workshop.test/shop.js'},clientId:'owner',respondWith:p=>{ownerAsset=p;}});
 await assert.rejects(ownerAsset,/Offline/);
 for(const path of ['/api/shop/jobs','/owner.html','/contacts.html']){
  handlers.fetch({request:{method:'GET',url:'https://workshop.test'+path},respondWith:()=>assert.fail('Private routes must not use the static cache')});
 }
});
test('the worker rejects offline readiness if any required cached file is missing',async()=>{
 const {handlers,entries}=await worker();
 async function status(){let result;await new Promise((resolve,reject)=>handlers.message({data:{type:'CHECK_SHOP_OFFLINE'},ports:[{postMessage:value=>{result=value;}}],waitUntil:p=>p.then(resolve,reject)}));return result;}
 assert.equal((await status()).ready,true);entries.delete('/shop.js');assert.equal((await status()).ready,false);
});
