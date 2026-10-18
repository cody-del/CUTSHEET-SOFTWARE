import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileStore} from '../shop-store.mjs';
import {createShopService} from '../shop-service.mjs';
import {shopHandler} from '../shop-api.mjs';
const opening={id:'opening-1',name:'Front window',width:36,height:59.5,quantity:1,left:1,right:1,louver:4,frame:'TR',sides:'4W',mount:'I',sizeMethod:'S',color:'W',tilt:'Back',stile:'Flat',divider:0,notes:''};
const fields={name:'Saved draft',number:'DRAFT-001',customer:'Example customer',notes:'Shop instructions',due:'',archived:false,openings:[opening]};
const password='owner-test-password',secret='test-session-key-more-than-32-characters';
async function setup(t,local=true){const directory=await mkdtemp(join(tmpdir(),'workspace-test-'));t.after(()=>rm(directory,{recursive:true,force:true}));const path=join(directory,'state.json');return {path,service:createShopService({store:fileStore(path),local,password,secret})};}
test('shared drafts persist across instances, reject stale changes, and strip client metadata',async t=>{
 const {service,path}=await setup(t);const {draft}=await service.run('draft-save',{id:'draft-1',version:0,fields:{...fields,unitPrices:{secret:123},openings:[{...opening,pricing:{rateCents:1}}]}});
 assert.equal(draft.version,1);assert.equal(draft.unitPrices,undefined);assert.equal(draft.openings[0].pricing,undefined);
 const second=createShopService({store:fileStore(path),local:true});assert.deepEqual((await second.run('draft-get',{id:'draft-1'})).draft,draft);
 const updated=(await second.run('draft-save',{id:'draft-1',version:1,fields:{...fields,name:'Changed elsewhere'}})).draft;
 await assert.rejects(service.run('draft-save',{id:'draft-1',version:1,fields}),/another device/);
 assert.equal((await service.run('draft-get',{id:'draft-1'})).draft.name,updated.name);
 const list=(await service.run('workspace')).cutSheets;assert.equal(list.length,1);assert.equal(list[0].stage,'Draft');
});
test('browser import is idempotent and never overwrites a newer shared copy',async t=>{
 const {service}=await setup(t),job={...fields,id:'legacy-1',sample:true,updated:'2026-01-01'};
 const result=await service.run('draft-import',{job});assert.equal(result.existing,false);
 await service.run('draft-save',{id:result.id,version:1,fields:{...fields,name:'Edited shared copy'}});
 const again=await service.run('draft-import',{job:{...job,updated:'2026-10-17'}});assert.equal(again.id,result.id);assert.equal(again.existing,true);
 assert.equal((await service.run('draft-get',{id:result.id})).draft.name,'Edited shared copy');
 const changed=await service.run('draft-import',{job:{...job,notes:'New browser notes'}});assert.notEqual(changed.id,result.id);
 assert.equal((await service.run('workspace')).cutSheets.length,2);
});
test('shared release freezes server draft, does not duplicate list entries, and is idempotent',async t=>{
 const {service}=await setup(t);await service.run('draft-save',{id:'draft-1',version:0,fields});
 const {job}=await service.run('draft-release',{id:'draft-1',version:1,targetMinutes:30,due:'2026-12-01',openings:[{...opening,width:50}]});
 assert.equal(job.openings[0].input.width,36);assert.equal(job.customer,undefined);assert.equal(job.openings[0].input.pricing,undefined);
 assert.equal((await service.run('draft-release',{id:'draft-1',version:1})).job.id,job.id);
 await assert.rejects(service.run('draft-save',{id:'draft-1',version:2,fields}),/released/);
 const list=(await service.run('workspace')).cutSheets;assert.equal(list.length,1);assert.equal(list[0].released,true);
 const saved=await service.run('draft-get',{id:'draft-1'});assert.equal(saved.released,true);
});
test('invalid or non-ShutterSmart drafts and invalid releases stay out of production',async t=>{
 const {service}=await setup(t);
 for(const input of [{...fields,productId:'starwood'},{...fields,openings:[{...opening,productId:'elegant-shutters'}]},{...fields,name:''},{...fields,due:'2026-02-31'},{...fields,openings:[{...opening,width:-1}]}])await assert.rejects(service.run('draft-save',{id:'bad',version:0,fields:input}));
 await service.run('draft-save',{id:'empty',version:0,fields:{...fields,openings:[]}});await assert.rejects(service.run('draft-release',{id:'empty',version:1}));
 await service.run('draft-save',{id:'gap',version:0,fields:{...fields,openings:[{...opening,height:60}]}});await assert.rejects(service.run('draft-release',{id:'gap',version:1}),/light gap/);
 await service.run('draft-save',{id:'archived',version:0,fields:{...fields,archived:true}});await assert.rejects(service.run('draft-release',{id:'archived',version:1}),/Restore/);
 assert.equal((await service.run('jobs')).jobs.length,0);
});
test('new workspace APIs retain owner authorization and same-origin protection',async t=>{
 const {service}=await setup(t,false),owner={owner:(await service.run('login',{password})).token};
 const {code}=await service.run('pairing',{name:'Test iPad'},owner),shop={shop:(await service.run('pair',{code})).token};
 for(const operation of ['workspace','draft-get','draft-save','draft-import','draft-release']){await assert.rejects(service.run(operation,{},shop),/Only the owner/);await assert.rejects(service.run(operation,{}),/sign in/);}
 const handle=shopHandler(service);
 const r=await handle(new Request('https://example.test/api/shop/draft-save',{method:'POST',headers:{origin:'https://foreign.test','content-type':'application/json'},body:JSON.stringify({id:'x',version:0,fields})}));assert.equal(r.status,403);
});
test('legacy publish cannot bypass an empty, archived, or newer saved draft',async t=>{
 const {service}=await setup(t);
 await service.run('draft-save',{id:'empty',version:0,fields:{...fields,openings:[]}});
 await assert.rejects(service.run('publish',{job:{...fields,id:'empty',version:1}}),/Add an opening/);
 await service.run('draft-save',{id:'archive',version:0,fields:{...fields,archived:true}});
 await assert.rejects(service.run('publish',{job:{...fields,id:'archive',version:1}}),/Restore/);
 await service.run('draft-save',{id:'versioned',version:0,fields});
 await assert.rejects(service.run('publish',{job:{...fields,id:'versioned',version:0}}),/another device/);
 assert.equal((await service.run('jobs')).jobs.length,0);
});
test('imports keep changed browser metadata even when a job was already released',async t=>{
 const {service}=await setup(t);await service.run('publish',{job:{...fields,id:'legacy'}});
 const imported=await service.run('draft-import',{job:{...fields,id:'legacy',notes:'New notes after release'}});
 assert.equal(imported.kind,'draft');assert.notEqual(imported.id,'legacy');
 assert.equal((await service.run('draft-get',{id:imported.id})).draft.notes,'New notes after release');
 assert.equal((await service.run('jobs')).jobs[0].notes,fields.notes);
});
