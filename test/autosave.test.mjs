import test from 'node:test';
import assert from 'node:assert/strict';
import {createAutosave} from '../public/autosave.js';

test('autosave serializes edits made during an in-flight request and flush waits for all edits',async()=>{
 let value='first',release;const written=[];
 const save=createAutosave({delay:60000,write:async()=>{const snapshot=value;written.push(snapshot);if(snapshot==='first')await new Promise(resolve=>release=resolve);}});
 save.changed();const first=save.flush();value='second';save.changed();const leaving=save.flush();
 assert.deepEqual(written,['first']);release();await Promise.all([first,leaving]);
 assert.deepEqual(written,['first','second']);assert.equal(save.dirty(),false);
});

test('a conflict keeps changes unsaved and does not retry or overwrite without a new action',async()=>{
 let fail=true,calls=0,last;
 const save=createAutosave({delay:60000,write:async()=>{calls++;if(fail)throw new Error('Changed on another device');},onState:s=>last=s});
 save.changed();await assert.rejects(save.flush(),/another device/);
 assert.equal(save.dirty(),true);assert.match(last.error.message,/another device/);assert.equal(calls,1);
 fail=false;await save.flush();assert.equal(save.dirty(),false);assert.equal(last.error,null);
});

test('reset cancels queued edits without resending the record being left',async()=>{
 let release,calls=0;
 const save=createAutosave({delay:60000,write:async()=>{calls++;await new Promise(resolve=>release=resolve);}});
 save.changed();const pending=save.flush();save.changed();save.reset();release();await pending;
 assert.equal(calls,1);assert.equal(save.dirty(),false);
});
