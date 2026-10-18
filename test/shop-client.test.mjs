import test from 'node:test';
import assert from 'node:assert/strict';
import {createShopClient,FRESH_MS,DISPLAY_MS} from '../public/shop-client.js';
const memory=()=>{const data=new Map();return {getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};};
const response=(value,status=200)=>({ok:status<400,status,json:async()=>value});
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve:(...args)=>resolve(...args)};};
function setup(){
 let time=1000,version=1,role='owner';const calls=[],storage=memory(),sharedStorage=memory(),events=[];
 const fetch=async(url,options)=>{const action=url.split('/').pop();calls.push({action,options});return response(action==='session'?{role,id:role}:action==='contact-save'?{version:++version}:{version,rows:[{name:'Saved contact'}]});};
 const options={fetch,storage,sharedStorage,now:()=>time,notify:type=>events.push(type)};
 return {client:createShopClient(options),options,calls,events,tick:ms=>time+=ms,setRole:r=>role=r};
}

test('navigation reuses fresh snapshots across documents without another network read',async()=>{
 const {client,options,calls}=setup();await client.request('session');await client.request('sales');
 const nextPage=createShopClient(options),snapshot=nextPage.peek('sales');assert.equal(snapshot.rows[0].name,'Saved contact');snapshot.rows[0].name='Unsaved edit';
 assert.equal((await nextPage.request('sales')).rows[0].name,'Saved contact');assert.equal(calls.length,2);
});
test('old snapshots may display only with a recently validated session; reads refresh after 30 seconds',async()=>{
 const {client,tick,calls}=setup();await client.request('session');await client.request('sales');tick(FRESH_MS);
 assert.equal(client.peek('sales'),undefined);await client.request('session');assert.equal(client.peek('sales').version,1);
 await client.request('sales');assert.equal(calls.filter(c=>c.action==='sales').length,2);
 tick(DISPLAY_MS);await client.request('session');assert.equal(client.peek('sales'),undefined);
});
test('simultaneous reads are deduplicated, with independent returned objects',async()=>{
 const wait=deferred();let calls=0;const client=createShopClient({fetch:async()=>{calls++;await wait.promise;return response({rows:[]});}});
 const a=client.request('sales'),b=client.request('sales');assert.equal(calls,1);wait.resolve();const [one,two]=await Promise.all([a,b]);one.rows.push('edited');assert.deepEqual(two.rows,[]);
});
test('writes always reach server, invalidate all dependent snapshots, and keep server version payload',async()=>{
 const {client,calls}=setup();await client.request('session');await client.request('sales');await client.request('sales-get',{kind:'contact',id:'one'});
 await client.request('contact-save',{id:'one',version:1});assert.equal(client.peek('sales'),undefined);assert.equal(client.peek('sales-get',{kind:'contact',id:'one'}),undefined);
 assert.equal((await client.request('sales')).version,2);await client.request('contact-save',{id:'one',version:2});assert.equal(calls.filter(c=>c.action==='contact-save').length,2);
 assert.equal(JSON.parse(calls.find(c=>c.action==='contact-save').options.body).version,1);
});
test('an older in-flight read cannot restore data after a successful write',async()=>{
 const wait=deferred();let reads=0;
 const client=createShopClient({fetch:async url=>{if(url.endsWith('sales')){if(++reads===1){await wait.promise;return response({version:1});}return response({version:2});}return response({ok:true});}});
 const old=client.request('sales');await client.request('contact-save',{version:1});wait.resolve();assert.equal((await old).version,2);assert.equal(reads,2);
});
test('a change in another tab invalidates this tab and its later document snapshots',async()=>{
 const {client,options}=setup();await client.request('session');await client.request('sales');
 const tabTwo=createShopClient({...options,storage:memory()});await tabTwo.request('contact-save',{version:1});
 assert.equal(client.peek('sales'),undefined);assert.equal(createShopClient(options).peek('sales'),undefined);
 assert.equal((await client.request('sales')).version,2);
});
test('sign-out and changed roles clear private snapshots across tabs',async()=>{
 const {client,options,setRole,events}=setup();await client.request('session');await client.request('sales');
 setRole('shop');await client.request('session',undefined,{force:true});assert.equal(client.peek('sales'),undefined);assert.ok(events.includes('access-reset'));
 await client.request('jobs');const tabTwo=createShopClient({...options,storage:memory()});await tabTwo.request('logout',{});assert.equal(client.peek('session'),undefined);assert.equal(client.peek('jobs'),undefined);
});
test('permission failures purge snapshots; failed refreshes do not masquerade as fresh data',async()=>{
 let denied=false;const options={storage:memory(),fetch:async url=>response(denied?{error:'Access expired'}:url.endsWith('session')?{role:'owner',id:'owner'}:{rows:[]},denied?401:200)};
 const client=createShopClient(options);await client.request('session');await client.request('sales');denied=true;
 await assert.rejects(client.request('sales',undefined,{force:true}),e=>e.status===401);assert.equal(client.peek('session'),undefined);assert.equal(client.peek('sales'),undefined);
});
test('cache storage errors do not prevent loading or saving',async()=>{
 const bad={getItem:()=>{throw Error();},setItem:()=>{throw Error();},removeItem:()=>{throw Error();}};
 const client=createShopClient({storage:bad,sharedStorage:bad,fetch:async()=>response({role:'owner'})});
 assert.equal((await client.request('session')).role,'owner');assert.equal((await client.request('contact-save',{})).role,'owner');
});
test('detail caches are distinct for each record and are never used for write responses',async()=>{
 let reads=0;const client=createShopClient({fetch:async(url,options)=>response(url.endsWith('session')?{role:'owner'}:{id:JSON.parse(options.body).id,reads:++reads})});
 await client.request('session');assert.equal((await client.request('sales-get',{kind:'order',id:'one'})).id,'one');assert.equal((await client.request('sales-get',{kind:'order',id:'two'})).id,'two');
 await client.request('sales-get',{kind:'order',id:'one'});assert.equal(reads,2);
});
