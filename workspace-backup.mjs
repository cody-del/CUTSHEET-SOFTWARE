import {createHash} from 'node:crypto';

// Explicitly exclude device credentials, connection codes and login attempts.
const keys=['schema','jobs','contacts','quotes','orders','drafts','draftImports','draftCounter','companyProfile','pricing','productPricing','salesCounters'];
const maps=['jobs','contacts','quotes','orders','drafts','draftImports','companyProfile','pricing','productPricing','salesCounters'];
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const checksum=data=>createHash('sha256').update(JSON.stringify(data)).digest('hex');
export function createWorkspaceBackup(state,time=Date.now()){
 const data=Object.fromEntries(keys.filter(key=>state[key]!==undefined).map(key=>[key,structuredClone(state[key])]));
 return {format:'cutsheet-company-backup',version:1,createdAt:new Date(time).toISOString(),checksum:checksum(data),data};
}
export function readWorkspaceBackup(backup){
 if(!object(backup)||backup.format!=='cutsheet-company-backup'||backup.version!==1||!object(backup.data)||backup.data.schema!==1||!Number.isFinite(Date.parse(backup.createdAt)))throw Error('Choose a complete company backup exported by Cut Sheets.');
 if(backup.checksum!==checksum(backup.data))throw Error('Backup checksum does not match. The file may be damaged or modified.');
 if(Object.keys(backup.data).some(key=>!keys.includes(key))||maps.some(key=>backup.data[key]!==undefined&&!object(backup.data[key])))throw Error('The backup contains unsupported data.');
 const state={...structuredClone(backup.data),jobs:structuredClone(backup.data.jobs||{}),devices:{},pairings:{},attempts:{}};
 // Do not count the time between a backup and its restoration as shop labor.
 for(const job of Object.values(state.jobs))if(job.startedAt){job.elapsedMs=(job.elapsedMs||0)+Math.max(0,Date.parse(backup.createdAt)-job.startedAt);job.startedAt=null;}
 return state;
}
export function assertEmptyWorkspace(state){
 if(state&&['contacts','quotes','orders','jobs','drafts'].some(key=>Object.keys(state[key]||{}).length))throw Error('The destination contains business records. Restore into an empty workspace; no data was replaced.');
}
