import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileStore} from '../shop-store.mjs';
import {createShopService} from '../shop-service.mjs';
import {shopHandler} from '../shop-api.mjs';
import {progress,elapsed,schedule,duration,production,finishingStages,stageStatus} from '../public/shop-state.js';
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
  await assert.rejects(service.run('publish',{job:{...job,id:'bad',openings:[{...opening,frameStyle:'MS'}]}}));
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

test('shop jobs advance through every production stage only after all required work is complete',async t=>{
  const f=await fixture(t,{local:false}),owner=await ownerCookie(f.service),shop=await paired(f.service,owner);
  let {job:j}=await f.service.run('publish',{job:{...job,openings:[opening,{...opening,id:'opening-2',name:'Second window'}]}},owner);
  assert.equal(production(j).key,'waiting');
  await assert.rejects(f.service.run('stage',{id:j.id,version:j.version,stage:'capping',status:'complete'},shop),/every cut line/);
  ({job:j}=await f.service.run('timer',{id:j.id,version:j.version,action:'start'},shop));
  ({job:j}=await f.service.run('timer',{id:j.id,version:j.version,action:'pause'},shop));
  assert.equal(production(j).key,'cutting'); // Pausing at zero elapsed time must not send it back to Waiting.
  for(const line of j.openings[0].lines)({job:j}=await f.service.run('line',{id:j.id,version:j.version,lineId:line.id,status:'cut'},shop));
  assert.equal(production(j).key,'cutting'); // Every opening counts.
  const lastLines=j.openings[1].lines;
  for(const line of lastLines)({job:j}=await f.service.run('line',{id:j.id,version:j.version,lineId:line.id,status:'cut'},shop));
  assert.equal(production(j).key,'capping');assert.equal(j.productionCompletedAt,null);
  await assert.rejects(f.service.run('stage',{id:j.id,version:j.version,stage:'building',status:'complete'},shop),/preceding/);
  for(const [index,stage] of finishingStages.entries()){
    ({job:j}=await f.service.run('stage',{id:j.id,version:j.version,stage:stage.key,status:'partial'},shop));
    assert.equal(production(j).key,stage.key);assert.equal(stageStatus(j,stage.key),'partial');
    f.advance(60000);
    ({job:j}=await f.service.run('stage',{id:j.id,version:j.version,stage:stage.key,status:'complete'},shop));
    assert.equal(production(j).key,finishingStages[index+1]?.key||'complete');
    assert.equal(j.production[stage.key].by,'Saw iPad');assert.equal(j.production[stage.key].completedAt,f.time());
  }
  assert.equal(j.productionCompletedAt,f.time());
  const second=createShopService({store:fileStore(f.path),password,secret,now:f.time});
  assert.equal(production((await second.run('dashboard',{},owner)).jobs[0]).key,'complete');
  const handler=shopHandler(second),response=await handler(new Request('https://shop.example/api/shop/stage',{method:'POST',headers:{'content-type':'application/json',cookie:'cutsheet_shop='+shop.shop},body:JSON.stringify({id:j.id,version:j.version,stage:'hinging',status:'complete'})}));
  assert.equal(response.status,200);assert.equal((await response.json()).job.version,j.version);
  await assert.rejects(second.run('stage',{id:j.id,version:j.version,stage:'hinging',status:'complete'}),e=>e.status===401);
});

test('production corrections require confirmation, invalidate later checks and reject stale updates',async t=>{
  const {service}=await fixture(t);let {job:j}=await service.run('publish',{job});
  const lineId=j.openings[0].lines[0].id;
  ({job:j}=await service.run('line',{id:j.id,version:j.version,lineId,status:'partial',completed:0,outOfMaterial:true}));
  assert.equal(production(j).key,'cutting');
  for(const line of j.openings[0].lines)({job:j}=await service.run('line',{id:j.id,version:j.version,lineId:line.id,status:'cut'}));
  for(const stage of finishingStages)({job:j}=await service.run('stage',{id:j.id,version:j.version,stage:stage.key,status:'complete'}));
  await assert.rejects(service.run('stage',{id:j.id,version:j.version,stage:'capping',status:'partial'}),/Confirm/);
  const previousVersion=j.version;
  ({job:j}=await service.run('stage',{id:j.id,version:j.version,stage:'capping',status:'partial',resetFollowing:true}));
  assert.equal(production(j).key,'capping');assert.equal(j.productionCompletedAt,null);
  for(const key of ['boring','building','hinging'])assert.equal(stageStatus(j,key),'not-started');
  await assert.rejects(service.run('stage',{id:j.id,version:previousVersion,stage:'capping',status:'complete'}),e=>e.status===409);
  await assert.rejects(service.run('stage',{id:j.id,version:j.version,stage:'__proto__',status:'complete'}),e=>e.status===400);
  await assert.rejects(service.run('stage',{id:j.id,version:j.version,stage:'capping',status:'bogus'}),e=>e.status===400);
  await assert.rejects(service.run('line',{id:j.id,version:j.version,lineId,status:'not-cut'}),/Confirm/);
  ({job:j}=await service.run('line',{id:j.id,version:j.version,lineId,status:'not-cut',resetFollowing:true}));
  assert.equal(production(j).key,'cutting');assert.deepEqual(j.production,{});
  ({job:j}=await service.run('line',{id:j.id,version:j.version,lineId,status:'cut'}));
  assert.equal(production(j).key,'capping');assert.equal(j.productionCompletedAt,null);
});

test('existing cut sheets enter Capping without assuming finishing work was completed',()=>{
  const legacy={openings:[{lines:[{quantity:2,completed:2,status:'cut'}]}],elapsedMs:300000,completedAt:12345};
  assert.equal(production(legacy).key,'capping');
  const partial={...legacy,openings:[{lines:[{quantity:2,completed:1,status:'partial'}]}]};
  assert.equal(production(partial).key,'cutting');
  assert.equal(stageStatus(legacy,'capping'),'not-started');
});
