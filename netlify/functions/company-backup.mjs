import {accounts} from '../../account-runtime.mjs';
import {backupStorage} from '../../backup-runtime.mjs';
export const config={schedule:'17 * * * *'};
export default async()=>{
 const backups=backupStorage();let failed=0;
 for(const id of await accounts.backupOwners()){
  try{const state=await accounts.workspace(id).transaction(s=>s,{readOnly:true});await backups.save(id,state);}
  catch{failed++;await backups.failed(id).catch(()=>{});console.error('Scheduled company backup failed; see private backup status.');}
 }
 if(failed)throw Error('One or more company backups failed.');
};
