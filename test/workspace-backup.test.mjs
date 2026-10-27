import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkspaceBackup,readWorkspaceBackup,assertEmptyWorkspace} from '../workspace-backup.mjs';
import {createShopService} from '../shop-service.mjs';
import {shopHandler} from '../shop-api.mjs';

test('company backup restores business records without restoring device access or idle timer hours',()=>{
 const time=Date.UTC(2026,9,26,12),state={schema:1,contacts:{one:{name:'Sample customer'}},quotes:{q:{total:123}},orders:{o:{payments:[{amount:50}]}},drafts:{d:{openings:[]}},draftImports:{legacy:{id:'d'}},draftCounter:3,companyProfile:{name:'Company',terms:'Terms',logo:{data:'image'}},productPricing:{shuttersmart:{rateCents:123}},pricing:{rateCents:123},salesCounters:{quote:7,order:4},jobs:{j:{elapsedMs:1000,startedAt:time-5000,openings:[{lines:[{completed:2,status:'partial'}]}]}},devices:{secret:'session'},pairings:{code:'private'},attempts:{key:'private'}};
 const backup=JSON.parse(JSON.stringify(createWorkspaceBackup(state,time))),restored=readWorkspaceBackup(backup);
 for(const key of ['contacts','quotes','orders','drafts','draftImports','draftCounter','companyProfile','productPricing','pricing','salesCounters'])assert.deepEqual(restored[key],state[key]);
 assert.equal(restored.jobs.j.openings[0].lines[0].completed,2);assert.equal(restored.jobs.j.startedAt,null);assert.equal(restored.jobs.j.elapsedMs,6000);
 assert.equal(state.jobs.j.startedAt,time-5000);
 for(const key of ['devices','pairings','attempts']){assert.equal(backup.data[key],undefined);assert.deepEqual(restored[key],{});}
});

test('restoration rejects corrupt backups and refuses to overwrite an existing workspace',()=>{
 const backup=createWorkspaceBackup({schema:1,jobs:{},contacts:{one:{name:'Saved'}}});
 backup.data.contacts.one.name='Changed';assert.throws(()=>readWorkspaceBackup(backup),/checksum/);
 for(const value of [null,{},createWorkspaceBackup({schema:2,jobs:{}}),createWorkspaceBackup({schema:1,jobs:[]})])assert.throws(()=>readWorkspaceBackup(value));
 for(const key of ['contacts','quotes','orders','drafts','jobs'])assert.throws(()=>assertEmptyWorkspace({[key]:{one:{}}}),/business records/);
 assert.doesNotThrow(()=>assertEmptyWorkspace({schema:1,jobs:{}}));
});

test('backup download is owner-only, uncached, and excludes access credentials',async()=>{
 const state={schema:1,jobs:{},devices:{},pairings:{},attempts:{},contacts:{one:{email:'owner-only@example.invalid'}}};
 const service=createShopService({store:{transaction:async fn=>fn(state)},password:'owner-test-password',secret:'test-secret-with-more-than-thirty-two-characters'});
 const owner={owner:(await service.run('login',{password:'owner-test-password'})).token};
 const {code}=await service.run('pairing',{name:'Shop iPad'},owner),worker={shop:(await service.run('pair',{code})).token};
 await assert.rejects(service.run('workspace-backup',{},worker),/Only the owner/);
 await assert.rejects(service.run('workspace-backup',{}),/sign in/);
 const handle=shopHandler(service),response=await handle(new Request('https://example.test/api/shop/workspace-backup',{headers:{cookie:'cutsheet_owner='+owner.owner}}));
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.match(response.headers.get('content-disposition'),/attachment; filename="cut-sheets-company-backup/);
 const result=await response.json();assert.equal(result.data.contacts.one.email,'owner-only@example.invalid');assert.equal(result.data.devices,undefined);
});
