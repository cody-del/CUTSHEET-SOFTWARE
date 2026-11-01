import {createWorkspaceBackup,readWorkspaceBackup} from './workspace-backup.mjs';
const HOUR=3600000,DAY=24*HOUR;
const keyPattern=/^\d{13}-[a-f0-9]{16}\.json$/;
export function createAutomaticBackup({blobs,now=Date.now}){
 const prefix=id=>{if(!/^[a-f0-9-]{36}$/i.test(id))throw Error('Invalid backup account.');return id+'/';};
 async function status(id){const result=await blobs.get(prefix(id)+'status',{type:'json'});return result||{lastSuccess:null,lastAttempt:null};}
 async function list(id){const all=[];for await(const page of blobs.list({prefix:prefix(id)+'copies/',paginate:true}))all.push(...page.blobs);return all.map(b=>b.key.split('/').pop()).filter(k=>keyPattern.test(k)).sort().reverse();}
 async function download(id,key){if(!keyPattern.test(key||''))throw Error('Choose a saved backup.');const backup=await blobs.get(prefix(id)+'copies/'+key,{type:'json'});readWorkspaceBackup(backup);return backup;}
 async function save(id,state){
  const started=now(),previous=await status(id),backup=createWorkspaceBackup(state,started),name=String(started)+'-'+backup.checksum.slice(0,16)+'.json',key=prefix(id)+'copies/'+name;
  try{
   readWorkspaceBackup(backup);await blobs.setJSON(key,backup,{onlyIfNew:true});
   // Read back and validate the stored copy before reporting success or pruning.
   const recovered=await download(id,name);if(recovered.checksum!==backup.checksum)throw Error('Backup verification failed.');
   const info={lastAttempt:started,lastSuccess:started,lastError:null,key:name,bytes:Buffer.byteLength(JSON.stringify(backup)),durationMs:now()-started,verified:true};
   await blobs.setJSON(prefix(id)+'status',info);
   // Keep every hourly copy for 48 hours and the newest copy each day for 30 days.
   try{const days=new Set();for(const item of await list(id)){
    const time=Number(item.slice(0,13)),day=new Date(time).toISOString().slice(0,10),keep=started-time<2*DAY||(started-time<30*DAY&&!days.has(day));days.add(day);
    if(!keep)await blobs.delete(prefix(id)+'copies/'+item);
   }
   }catch{info.cleanupWarning=true;await blobs.setJSON(prefix(id)+'status',info);}
   return info;
  }catch(e){await blobs.setJSON(prefix(id)+'status',{...previous,lastAttempt:started,lastError:'Automatic backup could not be verified. Check backup logs.'});throw e;}
 }
 async function failed(id){const previous=await status(id);await blobs.setJSON(prefix(id)+'status',{...previous,lastAttempt:now(),lastError:'The database could not be backed up. Check the connection.'});}
 return {status,list,save,download,failed};
}
