import test from 'node:test';
import assert from 'node:assert/strict';
import {createShopService} from '../shop-service.mjs';
import {emptyWorkshop} from '../shop-store.mjs';
import {shopHandler} from '../shop-api.mjs';

const code='test-only reusable shop phrase';
function fixture(){
 let time=Date.now();const state=emptyWorkshop();
 const options={store:{transaction:async fn=>fn(state)},password:'test-only owner password',secret:'test-only signing secret with thirty two characters',now:()=>time};
 const service=createShopService(options);
 return {state,service,options,advance:ms=>time+=ms};
}
async function owner(service){return {owner:(await service.run('login',{password:'test-only owner password'})).token};}

test('code setup validates length and confirmation, hashes secrets, and keeps existing paired iPads',async()=>{
 const {state,service}=fixture(),cookie=await owner(service);
 await assert.rejects(service.run('shop-access-save',{code:'1234',confirmCode:'1234'},cookie),/12–128/);
 await assert.rejects(service.run('shop-access-save',{code,confirmCode:'different'},cookie),/do not match/);
 assert.equal(state.shopAccess,undefined);
 const pair=await service.run('pairing',{name:'Existing iPad'},cookie);
 const paired=await service.run('pair',{code:pair.code});
 const saved=await service.run('shop-access-save',{code,confirmCode:code},cookie);
 assert.equal(saved.shopAccess.enabled,true);assert.ok(state.shopAccess.salt);assert.equal(state.shopAccess.hash.length,128);
 assert.ok(!JSON.stringify(state).includes(code));
 assert.equal((await service.run('session',{}, {shop:paired.token})).role,'shop');
 const first=await service.run('shop-login',{code});
 assert.equal((await service.run('session',{}, {shop:first.token})).role,'shop');
 assert.equal((await service.run('shop-login',{code})).cookie,'shop');
 const previousHash=state.shopAccess.hash;
 await service.run('shop-access-save',{code,confirmCode:code},cookie);
 assert.notEqual(state.shopAccess.hash,previousHash);
 assert.equal((await service.run('session',{}, {shop:first.token})).role,null);
 assert.equal((await service.run('session',{}, {shop:paired.token})).role,'shop');
});

test('shared login rate-limits incorrect attempts and public access cannot create persistent credentials',async()=>{
 const f=fixture(),cookie=await owner(f.service);
 await f.service.run('shop-access-save',{code,confirmCode:code},cookie);
 for(let i=0;i<10;i++)assert.equal((await f.service.run('shop-login',{code:'invalid code long enough',client:'same'})).status,401);
 assert.equal((await f.service.run('shop-login',{code,client:'same'})).status,429);
 f.advance(15*60000+1);assert.equal((await f.service.run('shop-login',{code,client:'same'})).cookie,'shop');
 const publicService=createShopService({...f.options,publicOwnerAccess:true});
 for(const action of ['shop-login','shop-access-save'])await assert.rejects(publicService.run(action,{code,confirmCode:code}),e=>e.status===403);
});

test('shared login rejects cross-origin requests and malformed bodies',async()=>{
 const {service}=fixture(),handle=shopHandler(service);
 for(const body of ['null','[]','invalid'])assert.equal((await handle(new Request('https://example.test/api/shop/shop-login',{method:'POST',headers:{'content-type':'application/json'},body}))).status,400);
 assert.equal((await handle(new Request('https://example.test/api/shop/shop-login',{method:'POST',headers:{'content-type':'application/json',origin:'https://other.test'},body:JSON.stringify({code})}))).status,403);
});
