import {createHash} from 'node:crypto';
import schema from './source/account-schema.json' with {type:'json'};
import {emptyWorkshop} from './shop-store.mjs';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const digest=value=>createHash('sha256').update(String(value)).digest('hex');
export function accountStore(pool){
 let ready;
 async function init(){
  if(!ready)ready=(async()=>{const c=await pool.connect();try{
   await c.query('BEGIN');await c.query("SELECT pg_advisory_xact_lock(18243, 19026)");await c.query(schema.sql);await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}})().catch(e=>{ready=null;throw e;});
  await ready;
 }
 const valid=id=>{if(!uuid.test(id||''))throw new Error('Invalid authenticated account.');return id;};
 return {
  init,
  async secret(name){await init();const {rows}=await pool.query('SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name=$1',[name]);return rows[0]?.decrypted_secret||'';},
  async rateLimit(key,limit=10){await init();const {rows}=await pool.query(`INSERT INTO cutsheet_private.attempts (key,count,until_at) VALUES ($1,1,now()+interval '15 minutes') ON CONFLICT (key) DO UPDATE SET count=CASE WHEN attempts.until_at<now() THEN 1 ELSE attempts.count+1 END, until_at=CASE WHEN attempts.until_at<now() THEN now()+interval '15 minutes' ELSE attempts.until_at END RETURNING count`,[digest(key)]);return rows[0].count<=limit;},
  async approveEmail(email){await init();await pool.query(`INSERT INTO cutsheet_private.signup_approvals (email,expires_at) VALUES ($1,now()+interval '7 days') ON CONFLICT (email) DO UPDATE SET expires_at=excluded.expires_at`,[email.toLowerCase()]);},
  async enroll(user){
   valid(user.id);if(!user.email_confirmed_at||!user.email||user.is_anonymous)return false;
   await init();const c=await pool.connect();try{
    await c.query('BEGIN');const {rows}=await c.query('SELECT user_id FROM cutsheet_private.accounts WHERE user_id=$1 AND disabled=false',[user.id]);
    if(rows.length){await c.query('COMMIT');return true;}
    const grant=await c.query('SELECT email FROM cutsheet_private.signup_approvals WHERE email=$1 AND expires_at>now() AND (claimed_by IS NULL OR claimed_by=$2) FOR UPDATE',[user.email.toLowerCase(),user.id]);
    if(!grant.rows.length){await c.query('ROLLBACK');return false;}
    await c.query('INSERT INTO cutsheet_private.accounts (user_id,email) VALUES ($1,$2) ON CONFLICT (user_id) DO NOTHING',[user.id,user.email.toLowerCase()]);
    const active=await c.query('SELECT user_id FROM cutsheet_private.accounts WHERE user_id=$1 AND disabled=false',[user.id]);
    if(!active.rows.length){await c.query('ROLLBACK');return false;}
    await c.query('UPDATE cutsheet_private.signup_approvals SET claimed_by=$2 WHERE email=$1',[user.email.toLowerCase(),user.id]);
    await c.query('COMMIT');return true;
   }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  },
  async sessionActive(id,sessionId){if(!uuid.test(sessionId||''))return false;await init();const {rows}=await pool.query('SELECT id FROM auth.sessions WHERE id=$1 AND user_id=$2',[sessionId,valid(id)]);return rows.length===1;},
  async ownerActive(id){await init();const {rows}=await pool.query('SELECT user_id FROM cutsheet_private.accounts WHERE user_id=$1 AND disabled=false',[valid(id)]);return rows.length===1;},
  async rememberPair(code,ownerId){await init();await pool.query(`INSERT INTO cutsheet_private.pairings (code_hash,owner_id,expires_at) VALUES ($1,$2,now()+interval '10 minutes') ON CONFLICT (code_hash) DO UPDATE SET owner_id=excluded.owner_id,expires_at=excluded.expires_at`,[digest(code.replace(/[^a-zA-Z0-9]/g,'').toUpperCase()),valid(ownerId)]);},
  async pairingOwner(code){await init();const {rows}=await pool.query('SELECT owner_id FROM cutsheet_private.pairings WHERE code_hash=$1 AND expires_at>now()',[digest(String(code||'').replace(/[^a-zA-Z0-9]/g,'').toUpperCase())]);return rows[0]?.owner_id;},
  workspace(ownerId){valid(ownerId);return {async transaction(fn){
   await init();const c=await pool.connect();try{
    await c.query('BEGIN');
    // The verified identity comes from Supabase Auth, never from a request field.
    await c.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:ownerId,role:'authenticated'})]);
    await c.query('SET LOCAL ROLE cutsheet_app');
    await c.query('INSERT INTO cutsheet_private.workspaces (owner_id,data) VALUES ($1,$2) ON CONFLICT (owner_id) DO NOTHING',[ownerId,emptyWorkshop()]);
    const {rows}=await c.query('SELECT data FROM cutsheet_private.workspaces WHERE owner_id=$1 FOR UPDATE',[ownerId]);
    if(!rows.length)throw new Error('Workspace access denied.');
    const state=rows[0].data,result=await fn(state);
    await c.query('UPDATE cutsheet_private.workspaces SET data=$2,updated_at=now() WHERE owner_id=$1',[ownerId,state]);
    await c.query('COMMIT');return result;
   }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  }};}
 };
}
