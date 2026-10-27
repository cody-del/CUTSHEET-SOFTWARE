import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileStore} from '../shop-store.mjs';
import {createShopService} from '../shop-service.mjs';
import {shopHandler} from '../shop-api.mjs';
import {progress,elapsed,schedule,duration,production,productionChecks,checkStatus,stageStatus,productionStageStatus,productionColumns,openingCheckStatus,openingProduction,completedOpenings} from '../public/shop-state.js';
import {calculate} from '../calculations.mjs';

const opening={id:'opening-1',name:'Front window',width:36,height:59.5,quantity:2,left:1,right:1,louver:4,frame:'TR',sides:'4W',mount:'I',sizeMethod:'S',color:'W',tilt:'Back',stile:'Flat',divider:0,notes:''};
const job={id:'job-1',name:'Workshop test',number:'TEST-001',notes:'Test only',due:'',openings:[opening]};
const password='test-password-long-enough',secret='test-session-secret-with-more-than-32-characters';
async function fixture(t,{local=true,publicOwnerAccess=false}={}){
  const directory=await mkdtemp(join(tmpdir(),'cutsheet-shop-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  let time=Date.UTC(2026,9,16,16);const path=join(directory,'workshop.json');
  const service=createShopService({store:fileStore(path),local,publicOwnerAccess,password,secret,now:()=>time});
  return {service,path,advance:ms=>time+=ms,time:()=>time};
}
const ownerCookie=async service=>({owner:(await service.run('login',{password})).token});
async function paired(service,cookie){const {code}=await service.run('pairing',{name:'Saw iPad'},cookie);return {shop:(await service.run('pair',{code})).token};}

test('worker reads and writes expose manufacturing only, including held orders and nested T-post data',async t=>{
  const f=await fixture(t,{local:false}),owner=await ownerCookie(f.service),shop=await paired(f.service,owner);
  const privateValue='PRIVATE_CUSTOMER_555_EMAIL_PRICE';
  const tposts={positions:[36],sections:[{left:1,right:1,price:privateValue},{left:1,right:1}],construction:'two-piece',customer:privateValue};
  const input={...opening,width:72,tposts,pricing:{unitPrice:privateValue},customer:privateValue,customerNotes:privateValue,notes:'Fit hinges on the left'};
  await f.service.run('publish',{job:{...job,name:privateValue,notes:'Pack each opening separately',openings:[input]}},owner);
  await fileStore(f.path).transaction(state=>{
    state.jobs[job.id].activity[0].by=privateValue;
    state.jobs[job.id].finance={total:privateValue};
    state.orders??={};state.orders.held={id:'held',number:'O-002',name:privateValue,customer:{firstName:privateValue},productId:'shuttersmart',openings:[input],version:1};
  });
  const safe=value=>assert.ok(!JSON.stringify(value).includes(privateValue));
  safe(await f.service.run('jobs',{},shop));
  let {job:j}=await f.service.run('job-get',{id:job.id},shop);safe(j);
  assert.equal(j.notes,'Pack each opening separately');assert.equal(j.openings[0].input.notes,'Fit hinges on the left');
  assert.equal(j.name,'Job TEST-001');assert.equal(j.openings[0].input.name,opening.name);
  assert.deepEqual(j.openings[0].result.louverLayout,calculate(input).louverLayout);
  assert.deepEqual(j.openings[0].lines.map(l=>[l.name,l.length,l.quantity]),calculate(input).parts.map(l=>[l.name,l.length,l.quantity]));
  for(const [operation,data]of [['timer',{action:'start'}],['line',{lineId:j.openings[0].lines[0].id,status:'partial',completed:1,outOfMaterial:true,note:'Need louver stock'}],['stage',{stage:'louvers-capped',status:'complete',openingId:opening.id}]]){
    ({job:j}=await f.service.run(operation,{id:j.id,version:j.version,...data},shop));safe(j);
  }
  assert.equal(j.openings[0].lines[0].shortage.note,'Need louver stock');
  const held=(await f.service.run('job-get',{id:'held'},shop)).job;safe(held);
  safe(await f.service.run('stage',{id:'held',version:held.version,stage:'boring',status:'partial'},shop));
  const ownerView=(await f.service.run('job-get',{id:job.id},owner)).job;
  assert.equal(ownerView.name,privateValue);assert.equal(ownerView.openings[0].input.customerNotes,privateValue);
  assert.equal(ownerView.openings[0].production['louvers-capped'].by,'Saw iPad');
});

test('a light gap outside the shop limits cannot be released',async t=>{
  const {service}=await fixture(t);
  for(const height of [60,52.5])await assert.rejects(service.run('publish',{job:{...job,openings:[{...opening,height}]}}),/The light gap is not going to work/);
  assert.equal((await service.run('jobs')).jobs.length,0);
});

test('release uses original calculations and freezes the cut sheet',async t=>{
  const {service}=await fixture(t),{job:released}=await service.run('publish',{job,targetMinutes:90});
  assert.deepEqual(released.openings[0].lines.map(({id,completed,status,shortage,...part})=>part),calculate(opening).parts);
  assert.equal(released.openings[0].input.quantity,2);
  assert.equal(progress(released).percent,0);
  await assert.rejects(service.run('publish',{job:{...job,openings:[{...opening,width:40}]}}),/already in the shop/);
  assert.equal((await service.run('jobs')).jobs[0].openings[0].input.width,36);
  const {job:modern}=await service.run('publish',{job:{...job,id:'modern',openings:[{...opening,frame:'ST',frameStyle:'MS'}]}});
  assert.deepEqual(modern.openings[0].result.parts,calculate({...opening,frame:'ST'}).parts);
  assert.equal(modern.openings[0].input.frameStyle,'MS');
});

test('partial cuts synchronize quantity, alert and paused time across service instances',async t=>{
  const f=await fixture(t);let {job:j}=await f.service.run('publish',{job,targetMinutes:30});
  ({job:j}=await f.service.run('timer',{id:j.id,version:j.version,action:'start'}));f.advance(12*60000);
  const line=j.openings[0].lines[0];
  ({job:j}=await f.service.run('line',{id:j.id,version:j.version,lineId:line.id,status:'partial',completed:3,outOfMaterial:true,note:'Need white louver stock'}));
  assert.equal(j.startedAt,null);assert.equal(j.elapsedMs,12*60000);assert.equal(progress(j).alerts.length,1);
  const second=createShopService({store:fileStore(f.path),local:true});const remote=(await second.run('dashboard')).jobs[0];
  assert.equal(remote.openings[0].lines[0].completed,3);assert.equal(remote.openings[0].lines[0].shortage.note,'Need white louver stock');
  assert.equal(schedule(remote,f.time()).label,'Needs material');
  ({job:j}=await f.service.run('resolve',{id:j.id,version:j.version,lineId:line.id,status:'acknowledged'}));
  assert.equal(progress(j).alerts.length,1);
  ({job:j}=await f.service.run('resolve',{id:j.id,version:j.version,lineId:line.id,status:'resolved'}));
  assert.equal(progress(j).alerts.length,0);assert.equal(j.openings[0].lines[0].completed,3);assert.equal(j.startedAt,null);
});

test('timer excludes pauses, rejects simultaneous jobs and stops on final cut',async t=>{
  const f=await fixture(t);let {job:j}=await f.service.run('publish',{job,targetMinutes:5});
  const {job:other}=await f.service.run('publish',{job:{...job,id:'job-2'}});
  ({job:j}=await f.service.run('timer',{id:j.id,version:j.version,action:'start'}));
  await assert.rejects(f.service.run('timer',{id:other.id,version:other.version,action:'start'}),/Pause TEST-001/);
  f.advance(3*60000);({job:j}=await f.service.run('timer',{id:j.id,version:j.version,action:'pause'}));
  f.advance(30*60000);assert.equal(elapsed(j,f.time()),3*60000);
  ({job:j}=await f.service.run('timer',{id:j.id,version:j.version,action:'start'}));f.advance(4*60000);
  assert.equal(schedule(j,f.time()).label,'Over estimate');
  await assert.rejects(f.service.run('timer',{id:j.id,version:j.version,action:'finish'}),/every cut-sheet line/);
  for(const line of j.openings[0].lines)({job:j}=await f.service.run('line',{id:j.id,version:j.version,lineId:line.id,status:'cut'}));
  assert.equal(progress(j).percent,100);assert.equal(j.startedAt,null);assert.equal(j.elapsedMs,7*60000);assert.ok(j.completedAt);
  assert.equal(schedule(j,f.time()).label,'Complete · over estimate');
});

test('stale or concurrent changes cannot silently overwrite another employee',async t=>{
  const {service}=await fixture(t),{job:j}=await service.run('publish',{job});const lineId=j.openings[0].lines[0].id;
  const results=await Promise.allSettled([service.run('line',{id:j.id,version:j.version,lineId,status:'cut'}),service.run('line',{id:j.id,version:j.version,lineId,status:'not-cut'})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.match(results.find(r=>r.status==='rejected').reason.message,/another device/);
  assert.equal((await service.run('jobs')).jobs[0].openings[0].lines[0].status,'cut');
});

test('invalid counts and missing shortage answers never save',async t=>{
  const {service}=await fixture(t),{job:j}=await service.run('publish',{job}),line=j.openings[0].lines[0];
  for(const values of [{completed:-1,outOfMaterial:false},{completed:1.5,outOfMaterial:false},{completed:line.quantity,outOfMaterial:false},{completed:2}]){
    await assert.rejects(service.run('line',{id:j.id,version:j.version,lineId:line.id,status:'partial',...values}));
  }
  const saved=(await service.run('jobs')).jobs[0];assert.equal(saved.version,j.version);assert.equal(saved.openings[0].lines[0].completed,0);
  const {job:partial}=await service.run('line',{id:j.id,version:j.version,lineId:line.id,status:'partial',completed:0,outOfMaterial:true});
  assert.equal(progress(partial).alerts.length,1);
});

test('hosted owner auth, one-time pairing, expiry and revocation enforce roles',async t=>{
  const f=await fixture(t,{local:false}),service=f.service;
  await assert.rejects(service.run('jobs'),e=>e.status===401);
  const owner=await ownerCookie(service);const {job:j}=await service.run('publish',{job},owner);
  const {code}=await service.run('pairing',{name:'Saw iPad'},owner);const pairing=await service.run('pair',{code}),shop={shop:pairing.token};
  assert.equal((await service.run('session',{},shop)).role,'shop');
  assert.equal((await service.run('pair',{code})).status,401);
  for(const operation of ['dashboard','publish','pairing','plan','resolve','revoke'])await assert.rejects(service.run(operation,{},shop),e=>e.status===403);
  await service.run('line',{id:j.id,version:j.version,lineId:j.openings[0].lines[0].id,status:'cut'},shop);
  const {devices}=await service.run('dashboard',{},owner);await service.run('revoke',{deviceId:devices[0].id},owner);
  await assert.rejects(service.run('jobs',{},shop),e=>e.status===401);
  f.advance(13*3600000);await assert.rejects(service.run('dashboard',{},owner),e=>e.status===401);
});

test('hosted setup fails closed, rate limiting persists and forged cookies fail',async t=>{
  const f=await fixture(t,{local:false}),service=f.service;
  assert.equal((await createShopService({store:null}).run('session')).configured,false);
  await assert.rejects(createShopService({store:null}).run('jobs'),e=>e.status===503);
  for(let i=0;i<10;i++)assert.equal((await service.run('login',{password:'wrong'})).status,401);
  assert.equal((await service.run('login',{password})).status,429);
  f.advance(16*60000);const owner=await ownerCookie(service);assert.equal((await service.run('session',{},owner)).role,'owner');
  assert.equal((await service.run('session',{}, {owner:owner.owner+'x'})).role,null);
});

test('temporary public owner access supports shared work and restores normal access when disabled',async t=>{
  const f=await fixture(t,{local:false}),protectedService=f.service;
  const owner=await ownerCookie(protectedService),shop=await paired(protectedService,owner);
  const publicService=createShopService({store:fileStore(f.path),password,secret,publicOwnerAccess:true,now:f.time});
  for(const cookie of [{},shop]){
    const session=await publicService.run('session',{},cookie);
    assert.equal(session.role,'owner');assert.equal(session.publicOwnerAccess,true);
    assert.equal(session.cookie,undefined);assert.equal(session.token,undefined);
  }
  const {job:released}=await publicService.run('publish',{job});
  assert.equal(released.activity[0].by,'Public owner access');
  await publicService.run('pricing-save',{version:0,rateCents:2500,minimumAreaHundredths:0});
  assert.equal((await publicService.run('sales')).pricing.rateCents,2500);
  assert.equal((await publicService.run('dashboard',{},shop)).jobs.length,1);
  for(const operation of ['pair','pairing','revoke'])await assert.rejects(publicService.run(operation,{}),e=>e.status===403);
  assert.equal((await publicService.run('login',{password:'wrong'})).status,401);
  // A new protected instance sees the saved work, without granting lasting public access.
  assert.equal((await protectedService.run('session')).role,null);
  for(const operation of ['dashboard','sales','jobs'])await assert.rejects(protectedService.run(operation),e=>e.status===401);
  assert.equal((await protectedService.run('session',{},shop)).role,'shop');
  await assert.rejects(protectedService.run('sales',{},shop),e=>e.status===403);
  assert.equal((await protectedService.run('jobs',{},shop)).jobs.length,1);
  assert.equal((await protectedService.run('sales',{},owner)).pricing.rateCents,2500);
  assert.equal((await protectedService.run('session',{},await ownerCookie(protectedService))).role,'owner');
});

test('public access requires an explicit server boolean and preserves HTTP write protections',async t=>{
  const f=await fixture(t,{local:false,publicOwnerAccess:true}),handler=shopHandler(f.service);
  const response=await handler(new Request('https://shop.example/api/shop/session'));
  assert.equal(response.headers.get('set-cookie'),null);
  assert.equal((await response.json()).publicOwnerAccess,true);
  const request=origin=>new Request('https://shop.example/api/shop/publish',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({job})});
  assert.equal((await handler(request('https://evil.example'))).status,403);
  assert.equal((await handler(request('https://shop.example'))).status,200);
  for(const value of [undefined,false,'false','true',1]){
    const service=createShopService({store:fileStore(f.path),password,secret,publicOwnerAccess:value});
    assert.equal((await service.run('session',{publicOwnerAccess:true})).role,null);
  }
  assert.equal((await createShopService({store:null,password,secret,publicOwnerAccess:true}).run('session')).configured,false);
});

test('setup diagnostics identify incomplete settings without exposing credential values',async()=>{
  const store={transaction:async fn=>fn({jobs:{},devices:{},pairings:{},attempts:{}})};
  const shortPassword='private123',shortSecret='private-session-value';
  const incomplete=await createShopService({store,password:shortPassword,secret:shortSecret}).run('session');
  assert.equal(incomplete.configured,false);
  assert.deepEqual(incomplete.setupIssues,[
    'The owner password must contain at least 12 characters.',
    'The session signing key must contain at least 32 characters.'
  ]);
  assert.ok(!JSON.stringify(incomplete).includes(shortPassword));
  assert.ok(!JSON.stringify(incomplete).includes(shortSecret));
  const missingStore=await createShopService({store:null,password,secret}).run('session');
  assert.deepEqual(missingStore.setupIssues,['The database connection is missing.']);
  const ready=await createShopService({store,password,secret}).run('session');
  assert.equal(ready.configured,true);
  assert.equal(ready.setupIssues,undefined);
});

test('shop HTTP API protects writes, limits bodies, and uses secure HttpOnly cookies',async t=>{
  const {service}=await fixture(t,{local:false}),handler=shopHandler(service);
  const request=(action,data,extra={})=>new Request('https://shop.example/api/shop/'+action,{method:'POST',headers:{'content-type':'application/json',origin:'https://shop.example',...extra},body:JSON.stringify(data)});
  const login=await handler(request('login',{password}));assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);assert.match(cookie,/Secure/);assert.ok(!(await login.json()).token);
  assert.equal((await handler(request('publish',{job},{cookie,origin:'https://evil.example'}))).status,403);
  assert.equal((await handler(request('publish',{job},{cookie,'content-type':'text/plain'}))).status,415);
  assert.equal((await handler(request('publish',{job,x:'x'.repeat(512001)},{cookie}))).status,413);
  assert.equal((await handler(request('publish',{job},{cookie}))).status,200);
  assert.equal((await handler(new Request('https://shop.example/api/shop/dashboard'))).status,401);
});

test('due date uses the shop day and completed jobs do not appear overdue',()=>{
  const j={openings:[{lines:[{quantity:10,completed:0}]}],elapsedMs:0,startedAt:null,due:'2026-10-16',targetMinutes:60};
  assert.equal(schedule(j,Date.UTC(2026,9,17,2)).label,'Ready to cut');
  assert.equal(schedule(j,Date.UTC(2026,9,17,6)).label,'Past target date');
  j.openings[0].lines[0].completed=10;assert.equal(schedule(j,Date.UTC(2026,9,17,6)).label,'Fully cut');
});

test('progress does not round incomplete jobs to fully cut and short timers show seconds',()=>{
  const j={openings:[{lines:[{quantity:1000,completed:999}]}]};
  assert.equal(progress(j).percent,99);assert.equal(progress(j).complete,false);
  assert.equal(duration(8000),'8s');assert.equal(duration(3600000),'1h 0m');
});

test('invalid deadlines are validation errors and expired pairing codes cannot connect',async t=>{
  const f=await fixture(t,{local:false}),owner=await ownerCookie(f.service);
  await assert.rejects(f.service.run('publish',{job,due:'2026-99-99'},owner),e=>e.status===400);
  const {code}=await f.service.run('pairing',{name:'Expired code test'},owner);f.advance(11*60000);
  assert.equal((await f.service.run('pair',{code})).status,401);
});

test('shop jobs advance through every production stage with separate manual cap checks',async t=>{
  const f=await fixture(t,{local:false}),owner=await ownerCookie(f.service),shop=await paired(f.service,owner);
  let {job:j}=await f.service.run('publish',{job:{...job,openings:[opening,{...opening,id:'opening-2',name:'Second window'}]}},owner);
  assert.equal(production(j).key,'waiting');
  ({job:j}=await f.service.run('timer',{id:j.id,version:j.version,action:'start'},shop));
  ({job:j}=await f.service.run('timer',{id:j.id,version:j.version,action:'pause'},shop));
  assert.equal(production(j).key,'cutting');
  for(const line of j.openings[0].lines)({job:j}=await f.service.run('line',{id:j.id,version:j.version,lineId:line.id,status:'cut'},shop));
  assert.equal(production(j).key,'cutting'); // Every opening counts.
  for(const line of j.openings[1].lines)({job:j}=await f.service.run('line',{id:j.id,version:j.version,lineId:line.id,status:'cut'},shop));
  assert.equal(production(j).key,'capping');assert.equal(j.productionCompletedAt,null);
  assert.equal(checkStatus(j,'louvers-capped'),'not-started'); // Cutting never marks capping automatically.
  for(const [index,check] of productionChecks.entries()){
    ({job:j}=await f.service.run('stage',{id:j.id,version:j.version,stage:check.key,status:'partial'},shop));
    assert.equal(production(j).key,check.stage);assert.equal(checkStatus(j,check.key),'partial');
    f.advance(60000);
    ({job:j}=await f.service.run('stage',{id:j.id,version:j.version,stage:check.key,status:'complete'},shop));
    assert.equal(production(j).key,productionChecks[index+1]?.stage||'complete');
    assert.equal(j.production[check.key].by,undefined);assert.equal(j.production[check.key].completedAt,f.time());
    assert.equal((await f.service.run('job-get',{id:j.id},owner)).job.production[check.key].by,'Saw iPad');
  }
  assert.equal(j.productionCompletedAt,f.time());
  const second=createShopService({store:fileStore(f.path),password,secret,now:f.time});
  assert.equal(production((await second.run('dashboard',{},owner)).jobs[0]).key,'complete');
  const handler=shopHandler(second),response=await handler(new Request('https://shop.example/api/shop/stage',{method:'POST',headers:{'content-type':'application/json',cookie:'cutsheet_shop='+shop.shop},body:JSON.stringify({id:j.id,version:j.version,stage:'hinging',status:'complete'})}));
  assert.equal(response.status,200);assert.equal((await response.json()).job.version,j.version);
  await assert.rejects(second.run('stage',{id:j.id,version:j.version,stage:'hinging',status:'complete'}),e=>e.status===401);
});

test('parallel finishing and further partial cuts preserve recorded work without skipping unfinished stages',async t=>{
  const f=await fixture(t,{local:false}),owner=await ownerCookie(f.service),shop=await paired(f.service,owner);
  let {job:j}=await f.service.run('publish',{job},owner);
  const run=async(op,data)=>{({job:j}=await f.service.run(op,{id:j.id,version:j.version,...data},shop));};
  const lineId=j.openings[0].lines[0].id;
  await run('line',{lineId,status:'partial',completed:3,outOfMaterial:false});
  await run('stage',{stage:'louvers-capped',status:'partial'});
  await run('stage',{stage:'boring',status:'complete'});
  await run('stage',{stage:'stiles-capped',status:'complete'});
  assert.equal(stageStatus(j,'capping'),'partial');assert.equal(production(j).key,'capping');
  await run('line',{lineId,status:'partial',completed:5,outOfMaterial:true,note:'Need stock'});
  assert.equal(checkStatus(j,'louvers-capped'),'partial');assert.equal(checkStatus(j,'boring'),'complete');
  assert.equal(checkStatus(j,'stiles-capped'),'complete');assert.equal(progress(j).alerts.length,1);
  for(const line of j.openings[0].lines)await run('line',{lineId:line.id,status:'cut'});
  assert.equal(production(j).key,'capping');assert.equal(j.productionCompletedAt,null);
  await run('stage',{stage:'louvers-capped',status:'complete'});
  assert.equal(production(j).key,'building'); // Boring was already recorded by the worker.
  await run('stage',{stage:'hinging',status:'complete'});
  assert.equal(production(j).key,'building');assert.equal(j.productionCompletedAt,null);
  await run('stage',{stage:'building',status:'complete'});
  assert.equal(production(j).key,'complete');assert.equal(j.productionCompletedAt,f.time());
  const second=createShopService({store:fileStore(f.path),password,secret,now:f.time});
  assert.deepEqual((await second.run('job-get',{id:j.id},shop)).job.production,j.production);
});

test('independent corrections retain other checks, recalculate completion, and reject stale updates',async t=>{
  const f=await fixture(t),{service}=f;let {job:j}=await service.run('publish',{job});
  const run=async(op,data)=>{({job:j}=await service.run(op,{id:j.id,version:j.version,...data}));};
  for(const check of productionChecks)await run('stage',{stage:check.key,status:'complete'});
  assert.equal(production(j).key,'cutting');assert.equal(j.productionCompletedAt,null);
  f.advance(60000);
  for(const line of j.openings[0].lines)await run('line',{lineId:line.id,status:'cut'});
  assert.equal(production(j).key,'complete');assert.equal(j.productionCompletedAt,f.time());
  const previousVersion=j.version,otherChecks=structuredClone(j.production);
  await run('stage',{stage:'louvers-capped',status:'partial'});
  assert.equal(production(j).key,'capping');assert.equal(j.productionCompletedAt,null);
  for(const check of productionChecks.slice(1))assert.deepEqual(j.production[check.key],otherChecks[check.key]);
  await assert.rejects(service.run('stage',{id:j.id,version:previousVersion,stage:'louvers-capped',status:'complete'}),e=>e.status===409);
  await assert.rejects(service.run('stage',{id:j.id,version:j.version,stage:'__proto__',status:'complete'}),e=>e.status===400);
  await assert.rejects(service.run('stage',{id:j.id,version:j.version,stage:'louvers-capped',status:'bogus'}),e=>e.status===400);
  await run('stage',{stage:'louvers-capped',status:'complete'});
  const finishing=structuredClone(j.production),lineId=j.openings[0].lines[0].id;
  await run('line',{lineId,status:'not-cut'});
  assert.equal(production(j).key,'cutting');assert.deepEqual(j.production,finishing);assert.equal(j.productionCompletedAt,null);
  f.advance(60000);await run('line',{lineId,status:'cut'});
  assert.equal(production(j).key,'complete');assert.equal(j.productionCompletedAt,f.time());
});

test('existing combined Capping records and older tabs retain their completed work',async t=>{
  const f=await fixture(t);let {job:j}=await f.service.run('publish',{job});
  await fileStore(f.path).transaction(state=>{state.jobs[j.id].production={capping:{status:'complete',completedAt:12345,by:'Original iPad'}};});
  ({job:j}=await f.service.run('job-get',{id:j.id}));
  assert.equal(checkStatus(j,'louvers-capped'),'complete');assert.equal(checkStatus(j,'stiles-capped'),'complete');
  ({job:j}=await f.service.run('stage',{id:j.id,version:j.version,stage:'louvers-capped',status:'not-started'}));
  assert.equal(checkStatus(j,'louvers-capped'),'not-started');assert.equal(checkStatus(j,'stiles-capped'),'complete');assert.equal(stageStatus(j,'capping'),'partial');
  ({job:j}=await f.service.run('stage',{id:j.id,version:j.version,stage:'capping',status:'complete'}));
  assert.equal(stageStatus(j,'capping'),'complete');assert.equal(j.production.capping,undefined);
});

test('existing cut sheets enter Capping without assuming finishing work was completed',()=>{
  const legacy={openings:[{lines:[{quantity:2,completed:2,status:'cut'}]}],elapsedMs:300000,completedAt:12345};
  assert.equal(production(legacy).key,'capping');
  const partial={...legacy,openings:[{lines:[{quantity:2,completed:1,status:'partial'}]}]};
  assert.equal(production(partial).key,'cutting');
  assert.equal(stageStatus(legacy,'capping'),'not-started');
});


test('each opening completes independently and the job waits for every opening',async t=>{
  const f=await fixture(t,{local:false}),owner=await ownerCookie(f.service),shop=await paired(f.service,owner);
  let {job:j}=await f.service.run('publish',{job:{...job,openings:[opening,{...opening,id:'opening-2',name:'Second room',quantity:1}]}},owner);
  const run=async(op,data)=>{({job:j}=await f.service.run(op,{id:j.id,version:j.version,...data},shop));};
  for(const line of j.openings[0].lines)await run('line',{lineId:line.id,status:'cut'});
  assert.equal(openingProduction(j,j.openings[0]).key,'capping');assert.equal(completedOpenings(j),0);
  for(const check of productionChecks)await run('stage',{openingId:opening.id,stage:check.key,status:'complete'});
  assert.equal(openingProduction(j,j.openings[0]).key,'complete');assert.equal(openingProduction(j,j.openings[1]).key,'waiting');
  assert.equal(completedOpenings(j),1);assert.equal(production(j).key,'cutting');assert.equal(j.productionCompletedAt,null);
  assert.equal(openingCheckStatus(j,j.openings[1],'louvers-capped'),'not-started');
  const firstCompletion=j.openings[0].productionCompletedAt;
  f.advance(60000);
  await run('stage',{openingId:'opening-2',stage:'louvers-capped',status:'partial'});
  assert.equal(openingCheckStatus(j,j.openings[0],'louvers-capped'),'complete');
  for(const line of j.openings[1].lines)await run('line',{lineId:line.id,status:'cut'});
  assert.equal(production(j).key,'capping');
  for(const check of productionChecks)await run('stage',{openingId:'opening-2',stage:check.key,status:'complete'});
  assert.equal(completedOpenings(j),2);assert.equal(production(j).key,'complete');assert.equal(j.productionCompletedAt,f.time());
  assert.equal(j.openings[0].productionCompletedAt,firstCompletion);
  const second=createShopService({store:fileStore(f.path),password,secret,now:f.time});
  assert.deepEqual((await second.run('job-get',{id:j.id},shop)).job.openings,j.openings);
  const version=j.version;
  await run('stage',{openingId:opening.id,stage:'louvers-capped',status:'not-started'});
  assert.equal(completedOpenings(j),1);assert.equal(production(j).key,'capping');
  assert.equal(openingProduction(j,j.openings[1]).key,'complete');assert.equal(j.productionCompletedAt,null);
  await assert.rejects(f.service.run('stage',{id:j.id,version,openingId:'opening-2',stage:'louvers-capped',status:'partial'},shop),e=>e.status===409);
  for(const openingId of ['unknown','__proto__',null])await assert.rejects(f.service.run('stage',{id:j.id,version:j.version,openingId,stage:'louvers-capped',status:'complete'},shop),e=>[400,404].includes(e.status));
});

test('opening overrides preserve legacy whole-job checks and require every unit to be cut',async t=>{
  const f=await fixture(t);let {job:j}=await f.service.run('publish',{job:{...job,openings:[opening,{...opening,id:'opening-2'}]}});
  await fileStore(f.path).transaction(state=>{state.jobs[j.id].production={capping:{status:'complete',completedAt:12345},boring:{status:'complete'},building:{status:'complete'},hinging:{status:'complete'}};});
  ({job:j}=await f.service.run('job-get',{id:j.id}));
  ({job:j}=await f.service.run('stage',{id:j.id,version:j.version,openingId:opening.id,stage:'louvers-capped',status:'partial'}));
  assert.equal(openingCheckStatus(j,j.openings[0],'louvers-capped'),'partial');assert.equal(openingCheckStatus(j,j.openings[0],'stiles-capped'),'complete');
  assert.equal(openingCheckStatus(j,j.openings[1],'louvers-capped'),'complete');
  for(const line of j.openings[1].lines)({job:j}=await f.service.run('line',{id:j.id,version:j.version,lineId:line.id,status:'cut'}));
  assert.equal(completedOpenings(j),1);
  const line=j.openings[1].lines[0];
  ({job:j}=await f.service.run('line',{id:j.id,version:j.version,lineId:line.id,status:'partial',completed:line.quantity/2,outOfMaterial:false}));
  assert.equal(completedOpenings(j),0);assert.equal(openingProduction(j,j.openings[1]).key,'cutting');
  assert.equal(openingCheckStatus(j,j.openings[1],'louvers-capped'),'complete');
  // Whole-job actions from older tabs deliberately update every opening.
  ({job:j}=await f.service.run('stage',{id:j.id,version:j.version,stage:'capping',status:'not-started'}));
  for(const o of j.openings)assert.equal(openingCheckStatus(j,o,'louvers-capped'),'not-started');
});


test('material shortages and partial cutting remain visible while capping advances',async t=>{
  const f=await fixture(t,{local:false}),owner=await ownerCookie(f.service),shop=await paired(f.service,owner);
  let {job:j}=await f.service.run('publish',{job},owner);
  const run=async(operation,data)=>{({job:j}=await f.service.run(operation,{id:j.id,version:j.version,...data},shop));};
  await run('timer',{action:'start'});f.advance(60000);
  const louver=j.openings[0].lines.find(line=>line.name==='Louvers');
  await run('line',{lineId:louver.id,status:'partial',completed:5,outOfMaterial:true,note:'Need louver stock'});
  const remaining=progress(j).total-progress(j).done;
  await run('stage',{openingId:opening.id,stage:'louvers-capped',status:'partial'});
  assert.equal(production(j).key,'capping');
  assert.deepEqual(productionColumns(j),['cutting','capping']);
  assert.equal(productionStageStatus(j,'cutting'),'partial');
  assert.equal(productionStageStatus(j,'capping'),'partial');
  assert.equal(progress(j).total-progress(j).done,remaining);
  assert.equal(progress(j).alerts.length,1);assert.equal(j.startedAt,null);
  assert.equal(j.productionCompletedAt,null);assert.equal(completedOpenings(j),0);
  const reloaded=(await createShopService({store:fileStore(f.path),password,secret,now:f.time}).run('job-get',{id:j.id},shop)).job;
  assert.equal(production(reloaded).key,'capping');assert.deepEqual(productionColumns(reloaded),['cutting','capping']);
  assert.equal(progress(reloaded).alerts[0].shortage.note,'Need louver stock');
  await run('stage',{stage:'boring',status:'partial'});
  assert.equal(production(j).key,'boring');assert.deepEqual(productionColumns(j),['cutting','capping','boring']);
  await run('stage',{stage:'boring',status:'not-started'});
  assert.equal(production(j).key,'capping');
  for(const key of ['louvers-capped','stiles-capped'])await run('stage',{stage:key,status:'complete'});
  assert.equal(production(j).key,'boring');assert.deepEqual(productionColumns(j),['cutting','boring']);
  for(const line of j.openings[0].lines)await run('line',{lineId:line.id,status:'cut'});
  assert.deepEqual(productionColumns(j),['boring']);assert.equal(progress(j).alerts.length,0);
  for(const key of ['boring','building','hinging'])await run('stage',{stage:key,status:'complete'});
  assert.equal(production(j).key,'complete');assert.deepEqual(productionColumns(j),['complete']);
  assert.equal(completedOpenings(j),1);assert.equal(j.productionCompletedAt,f.time());
});

test('overlapping openings keep untouched work and corrected cuts in the pipeline',async t=>{
  const f=await fixture(t);let {job:j}=await f.service.run('publish',{job:{...job,openings:[opening,{...opening,id:'opening-2'}]}});
  const run=async(operation,data)=>{({job:j}=await f.service.run(operation,{id:j.id,version:j.version,...data}));};
  for(const line of j.openings[0].lines)await run('line',{lineId:line.id,status:'cut'});
  await run('stage',{openingId:opening.id,stage:'louvers-capped',status:'partial'});
  assert.equal(production(j).key,'capping');assert.deepEqual(productionColumns(j),['cutting','capping']);
  assert.equal(openingProduction(j,j.openings[1]).key,'waiting');
  for(const check of productionChecks)await run('stage',{openingId:opening.id,stage:check.key,status:'complete'});
  assert.equal(production(j).key,'cutting');assert.equal(completedOpenings(j),1);
  assert.deepEqual(productionColumns(j),['cutting']);
  for(const line of j.openings[1].lines)await run('line',{lineId:line.id,status:'cut'});
  await run('stage',{openingId:'opening-2',stage:'louvers-capped',status:'partial'});
  const lineId=j.openings[1].lines[0].id;
  await run('line',{lineId,status:'not-cut'});
  assert.equal(production(j).key,'capping');assert.deepEqual(productionColumns(j),['cutting','capping']);
  assert.equal(productionStageStatus(j,'cutting'),'partial');assert.equal(j.productionCompletedAt,null);
});
