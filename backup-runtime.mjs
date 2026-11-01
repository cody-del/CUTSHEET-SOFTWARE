import {getStore} from '@netlify/blobs';
import {createAutomaticBackup} from './automatic-backup.mjs';
// Site-wide private storage survives deploys. Netlify encrypts it at rest/in transit.
export const backupStorage=()=>createAutomaticBackup({blobs:getStore({name:'cutsheet-private-company-backups',consistency:'strong'})});
