// Administrator-only recovery. Dry-run by default; never overwrite business data.
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {databaseOptions} from '../shop-database.mjs';
import {accountStore} from '../account-store.mjs';
import {readWorkspaceBackup,assertEmptyWorkspace} from '../workspace-backup.mjs';
const [file,emailInput,flag]=process.argv.slice(2),email=emailInput?.trim().toLowerCase();
if(!file||!email||!/^\S+@\S+\.\S+$/.test(email)||flag&&flag!=='--apply')throw Error('Usage: node scripts/restore-workspace.mjs backup.json owner@example.com [--apply]');
const state=readWorkspaceBackup(JSON.parse(await readFile(file,'utf8')));
const options=databaseOptions();if(!options)throw Error('Set the database connection in the environment.');
const pool=new Pool(options);let c;
try{
 await accountStore(pool).init();c=await pool.connect();await c.query('BEGIN');
 const accounts=await c.query('SELECT a.user_id FROM cutsheet_private.accounts a JOIN auth.users u ON u.id=a.user_id WHERE lower(u.email)=$1 AND u.email_confirmed_at IS NOT NULL AND a.disabled=false',[email]);
 if(accounts.rows.length!==1)throw Error('Exactly one authorized, email-verified account must match.');
 const id=accounts.rows[0].user_id;
 // Create and lock even a missing destination to prevent a concurrent first write.
 await c.query('INSERT INTO cutsheet_private.workspaces(owner_id,data) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,{schema:1,jobs:{},devices:{},pairings:{},attempts:{}}]);
 const current=await c.query('SELECT data FROM cutsheet_private.workspaces WHERE owner_id=$1 FOR UPDATE',[id]);
 assertEmptyWorkspace(current.rows[0].data);
 if(flag==='--apply'){
  await c.query('UPDATE cutsheet_private.workspaces SET data=$2,updated_at=now() WHERE owner_id=$1',[id,state]);
  await c.query('COMMIT');console.log('Company backup restored. Reconnect shop devices from owner Settings.');
 }else{await c.query('ROLLBACK');console.log('Backup verified and destination is empty. Run again with --apply to restore.');}
}catch(error){if(c)await c.query('ROLLBACK');throw error;}finally{c?.release();await pool.end();}
