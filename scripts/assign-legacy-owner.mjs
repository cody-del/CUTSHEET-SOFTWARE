// Run only after the named user has signed up with the access code and verified
// their email. Credentials stay in the environment; this script never prints data.
import {Pool} from 'pg';
import {databaseOptions} from '../shop-database.mjs';
import {accountStore} from '../account-store.mjs';
const email=process.argv[2]?.trim().toLowerCase();
if(!email||!/^\S+@\S+\.\S+$/.test(email))throw Error('Usage: node scripts/assign-legacy-owner.mjs owner@example.com');
const options=databaseOptions();if(!options)throw Error('Set the database connection in the environment.');
const pool=new Pool(options);await accountStore(pool).init();const c=await pool.connect();
try{
 await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(18243,19027)');
 const users=await c.query('SELECT a.user_id FROM cutsheet_private.accounts a JOIN auth.users u ON u.id=a.user_id WHERE lower(u.email)=$1 AND u.email_confirmed_at IS NOT NULL AND a.disabled=false',[email]);
 if(users.rows.length!==1)throw Error('Exactly one authorized, email-verified account must match.');
 const ownerId=users.rows[0].user_id;
 await c.query('CREATE TABLE IF NOT EXISTS cutsheet_private.legacy_assignment (id text PRIMARY KEY,owner_id uuid NOT NULL REFERENCES auth.users(id),assigned_at timestamptz NOT NULL DEFAULT now())');
 await c.query('ALTER TABLE cutsheet_private.legacy_assignment ENABLE ROW LEVEL SECURITY');
 await c.query('REVOKE ALL ON cutsheet_private.legacy_assignment FROM PUBLIC,anon,authenticated,cutsheet_app');
 const prior=await c.query("SELECT owner_id FROM cutsheet_private.legacy_assignment WHERE id='main'");
 if(prior.rows.length)throw Error('Existing data has already been assigned; no changes made.');
 const legacy=await c.query("SELECT data FROM public.cutsheet_workshop WHERE id='main' FOR UPDATE");
 if(!legacy.rows.length)throw Error('No legacy workspace found.');
 const existing=await c.query('SELECT data FROM cutsheet_private.workspaces WHERE owner_id=$1 FOR UPDATE',[ownerId]);
 const current=existing.rows[0]?.data;
 if(current&&['contacts','quotes','orders','jobs','drafts'].some(key=>Object.keys(current[key]||{}).length))throw Error('The destination already has business records. Review a merge before migrating.');
 const data={...legacy.rows[0].data,devices:{},pairings:{},attempts:{}};
 await c.query('INSERT INTO cutsheet_private.workspaces (owner_id,data) VALUES ($1,$2) ON CONFLICT (owner_id) DO UPDATE SET data=excluded.data,updated_at=now()',[ownerId,data]);
 await c.query("INSERT INTO cutsheet_private.legacy_assignment (id,owner_id) VALUES ('main',$1)",[ownerId]);
 await c.query('COMMIT');console.log('Existing records assigned to the verified account. Original snapshot preserved; old device credentials not copied.');
}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();await pool.end();}
