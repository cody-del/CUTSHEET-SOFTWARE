import test from 'node:test';
import assert from 'node:assert/strict';
import {createAutomaticBackup} from '../automatic-backup.mjs';
import {readWorkspaceBackup} from '../workspace-backup.mjs';
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const memory=()=>{const values=new Map();return {values,get:async key=>structuredClone(values.get(key)||null),setJSON:async(key,v)=>{values.set(key,structuredClone(v));},delete:async key=>values.delete(key),async *list({prefix}){yield {blobs:[...values.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))};}};};
test('automatic backups verify restoration, exclude access secrets, and scope downloads',async()=>{const blobs=memory(),backup=createAutomaticBackup({blobs});const info=await backup.save(id,{schema:1,jobs:{},contacts:{one:{firstName:'Sample'}},devices:{token:'private'},pairings:{secret:'private'}});assert.equal(info.verified,true);const saved=await backup.download(id,info.key);assert.equal(readWorkspaceBackup(saved).contacts.one.firstName,'Sample');assert.equal(saved.data.devices,undefined);assert.equal((await backup.status(other)).lastSuccess,null);await assert.rejects(backup.download(other,info.key));await assert.rejects(backup.download(id,'../status'));});
test('backup read-back failures do not claim success or prune old copies',async()=>{const blobs=memory(),backup=createAutomaticBackup({blobs});const info=await backup.save(id,{schema:1,jobs:{}});const get=blobs.get;blobs.get=async key=>key.includes('/copies/')?null:get(key);await assert.rejects(backup.save(id,{schema:1,jobs:{},contacts:{}}));assert.equal((await backup.status(id)).lastSuccess,info.lastSuccess);assert.match((await backup.status(id)).lastError,/could not/);});
test('retention keeps 48 hours of hourly copies and daily history up to 30 days',async()=>{const blobs=memory();let now=Date.now()-32*86400000;const backup=createAutomaticBackup({blobs,now:()=>now});for(let day=0;day<33;day++){now+=86400000;await backup.save(id,{schema:1,jobs:{}});}const copies=await backup.list(id);assert.equal(copies.length,30);assert.ok(copies.every(k=>now-Number(k.slice(0,13))<30*86400000));});

test('retention cleanup failure does not hide a successfully verified backup',async()=>{
 const blobs=memory();let time=Date.now()-31*86400000;const backup=createAutomaticBackup({blobs,now:()=>time});await backup.save(id,{schema:1,jobs:{}});time+=31*86400000;blobs.delete=async()=>{throw Error('Temporary cleanup failure');};
 const info=await backup.save(id,{schema:1,jobs:{}});assert.equal(info.verified,true);assert.equal(info.cleanupWarning,true);assert.equal((await backup.status(id)).lastSuccess,time);
});
