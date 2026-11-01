import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileStore} from '../shop-store.mjs';
import {createShopService} from '../shop-service.mjs';
import {progressTarget} from '../public/shop-progress.js';
const opening={id:'opening-a',name:'Living room',width:36,height:59.5,quantity:1,left:1,right:1,louver:4,frame:'TR',sides:'4W',mount:'I',sizeMethod:'S',color:'W',tilt:'Back',stile:'Flat',divider:0,notes:''};
async function fixture(t){const dir=await mkdtemp(join(tmpdir(),'shop-sync-'));t.after(()=>rm(dir,{recursive:true,force:true}));const path=join(dir,'state.json'),store=fileStore(path),service=createShopService({store,local:true});const {job}=await service.run('publish',{job:{id:'job-a',name:'Test',number:'T-1',openings:[opening]}});return {path,store,service,job};}
const event=(job,payload,action='line')=>({eventId:randomUUID(),createdAt:Date.now(),action,payload:{id:job.id,...payload},base:progressTarget(job,action,payload),revision:job.revision||1});
test('read operations do not write the workspace file',async t=>{const f=await fixture(t),before=await readFile(f.path,'utf8');for(const op of ['session','jobs','dashboard'])await f.service.run(op);assert.equal(await readFile(f.path,'utf8'),before);});
test('a retried update applies once, even after another update',async t=>{const f=await fixture(t),line=f.job.openings[0].lines[0],e=event(f.job,{lineId:line.id,status:'cut'});const first=await f.service.run('sync',e);await f.service.run('stage',{id:f.job.id,version:first.job.version,openingId:opening.id,stage:'louvers-capped',status:'partial'});const result=await f.service.run('sync',e);assert.equal(result.job.version,first.job.version+1);const state=JSON.parse(await readFile(f.path));assert.equal(Object.keys(state.productionEvents).length,1);await assert.rejects(f.service.run('sync',{...e,payload:{...e.payload,status:'not-cut'}}),/already used/);});
test('unrelated line changes merge but same-target changes require review',async t=>{const f=await fixture(t),lines=f.job.openings[0].lines;const first=event(f.job,{lineId:lines[0].id,status:'cut'}),second=event(f.job,{lineId:lines[1].id,status:'cut'});await f.service.run('sync',first);await f.service.run('sync',second);await assert.rejects(f.service.run('sync',event(f.job,{lineId:lines[0].id,status:'partial',completed:0,outOfMaterial:false})),/changed on another device/);});
test('manufacturing revisions, deleted jobs, and old events cannot silently replay',async t=>{const f=await fixture(t),e=event(f.job,{lineId:f.job.openings[0].lines[0].id,status:'cut'});await f.store.transaction(s=>{s.jobs[f.job.id].revision=2;});await assert.rejects(f.service.run('sync',e),/revised/);await f.store.transaction(s=>{s.jobs[f.job.id].deletedAt=Date.now();});await assert.rejects(f.service.run('sync',e),/removed/);await assert.rejects(f.service.run('sync',{...e,createdAt:Date.now()-8*86400000}),/seven days/);});
