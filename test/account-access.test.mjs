import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import schema from '../source/account-schema.json' with {type:'json'};
import {accountStore} from '../account-store.mjs';
import {createAccountAuth} from '../account-auth.mjs';
import {accountShopHandler} from '../account-api.mjs';
import {emptyWorkshop} from '../shop-store.mjs';
import {calculationHandler} from '../netlify/functions/api.mjs';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const SA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',SB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const secret='test-only-session-secret-at-least-thirty-two-characters',code='test-only-invitation-code';
const token=sid=>'verified.'+Buffer.from(JSON.stringify({session_id:sid})).toString('base64url')+'.test';
const contact={firstName:'Private',lastName:'Customer',address:'123 Example St',phone:'555-0100',email:'private@example.invalid',notes:'Account A only'};
const opening={id:'opening-a',name:'Private opening',width:36,height:59.5,quantity:2,left:1,right:1,louver:4,frame:'TR',sides:'4W',mount:'I',sizeMethod:'S',color:'W',tilt:'Back',stile:'Flat',divider:0,notes:''};
async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE SCHEMA vault;
 CREATE TABLE auth.users (id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
 CREATE TABLE auth.sessions (id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id));
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
 CREATE TABLE vault.decrypted_secrets(name text PRIMARY KEY,decrypted_secret text);
 CREATE TABLE public.cutsheet_workshop(id text PRIMARY KEY,data jsonb);
 GRANT ALL ON public.cutsheet_workshop TO anon,authenticated;
 `);
 await db.query('INSERT INTO public.cutsheet_workshop VALUES ($1,$2)',['main',{...emptyWorkshop(),contacts:{legacy:{name:'Preserved legacy record'}}}]);
 const pool={query:(sql,args)=>sql===schema.sql?db.exec(sql):db.query(sql,args),connect:async()=>({query:(sql,args)=>sql===schema.sql?db.exec(sql):db.query(sql,args),release(){}})};
 const store=accountStore(pool);await store.init();
 await db.query('INSERT INTO vault.decrypted_secrets VALUES ($1,$2),($3,$4)',['CUTSHEET_SIGNUP_ACCESS_CODE',code,'CUTSHEET_SUPABASE_PUBLISHABLE_KEY','test-public-key']);
 const users={};for(const [id,sid,email]of [[A,SA,'a@example.invalid'],[B,SB,'b@example.invalid']]){
  await db.query('INSERT INTO auth.users VALUES ($1,$2,now())',[id,email]);await db.query('INSERT INTO auth.sessions VALUES ($1,$2)',[sid,id]);
  users[token(sid)]={id,email,email_confirmed_at:new Date().toISOString(),is_anonymous:false};
 }
 const calls=[];const clientFactory=()=>({auth:{
  getUser:async tok=>({data:{user:users[tok]},error:users[tok]?null:{message:'Invalid token'}}),
  signInWithPassword:async data=>{calls.push(['login',data.email]);const pair=Object.entries(users).find(([,u])=>u.email===data.email);return pair&&data.password==='valid-password-123'?{data:{session:{access_token:pair[0],refresh_token:'refresh-'+pair[1].id}}}:{data:{},error:{}};},
  signUp:async data=>{calls.push(['signup',data.email]);return {data:{user:{id:A},session:null}};},
  refreshSession:async()=>({data:{},error:{message:'Expired'}}),
  setSession:async()=>({data:{},error:null}),signOut:async()=>({error:null}),
  resetPasswordForEmail:async()=>({error:null}),updateUser:async()=>({error:null})
 }});
 const auth=createAccountAuth({store,env:{CUTSHEET_SESSION_SECRET:secret},clientFactory,settingsFetch:async()=>({ok:true,json:async()=>({external:{email:true},mailer_autoconfirm:false})})});
 const api=accountShopHandler({store,auth,secret});
 const req=(action,data,id=A,extra={})=>new Request('https://example.test/api/shop/'+action,{method:data===undefined?'GET':'POST',headers:{...(data===undefined?{}:{'content-type':'application/json'}),...(id?{cookie:'__Host-cutsheet-access='+token(id===A?SA:SB),'x-cutsheet-account':id}:{}),...extra},...(data===undefined?{}:{body:JSON.stringify(data)})});
 const run=async(action,data,id=A,extra={})=>{const response=await api.handler(req(action,data,id,extra));return {status:response.status,value:await response.json(),response};};
 const enroll=async id=>{const user=users[token(id===A?SA:SB)];await store.approveEmail(user.email);assert.equal(await store.enroll(user),true);};
 return {db,store,auth,api,calls,req,run,enroll,users};
}

test('database RLS isolates users even with another owner ID; anonymous access and legacy access are denied',async t=>{
 const {db,store,enroll}=await fixture(t);await enroll(A);await enroll(B);
 await store.workspace(A).transaction(s=>{s.contacts={one:contact};});await store.workspace(B).transaction(s=>{s.contacts={};});
 await db.query('BEGIN');await db.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:B})]);await db.query('SET LOCAL ROLE cutsheet_app');
 assert.deepEqual((await db.query('SELECT owner_id FROM cutsheet_private.workspaces')).rows.map(r=>r.owner_id),[B]);
 assert.equal((await db.query('SELECT data FROM cutsheet_private.workspaces WHERE owner_id=$1',[A])).rows.length,0);
 assert.equal((await db.query('UPDATE cutsheet_private.workspaces SET data=$2 WHERE owner_id=$1',[A,{}])).affectedRows,0);
 await assert.rejects(db.query('UPDATE cutsheet_private.workspaces SET owner_id=$1 WHERE owner_id=$2',[A,B]),/row-level security/);await db.query('ROLLBACK');
 for(const role of ['anon','authenticated']){await db.query('BEGIN');await db.exec('SET LOCAL ROLE '+role);await assert.rejects(db.query('SELECT * FROM cutsheet_private.workspaces'),/permission denied/);await db.query('ROLLBACK');await db.query('BEGIN');await db.exec('SET LOCAL ROLE '+role);await assert.rejects(db.query('SELECT * FROM public.cutsheet_workshop'),/permission denied/);await db.query('ROLLBACK');}
 assert.equal((await db.query('SELECT data FROM public.cutsheet_workshop')).rows[0].data.contacts.legacy.name,'Preserved legacy record');
 assert.equal((await store.workspace(A).transaction(s=>s.contacts.one)).phone,contact.phone);
});

test('account endpoints isolate contact records, jobs, PDFs and writes; legacy cookies and public mode cannot bypass login',async t=>{
 const f=await fixture(t);await f.enroll(A);await f.enroll(B);
 assert.equal((await f.run('contact-save',{id:'customer-a',version:0,fields:contact})).status,200);
 assert.equal((await f.run('sales',undefined,B)).value.contacts.length,0);
 assert.equal((await f.run('sales-get',{kind:'contact',id:'customer-a'},B)).status,404);
 assert.equal((await f.run('contact-save',{id:'customer-a',version:1,fields:{...contact,phone:'attacker'}},B)).status,409);
 assert.equal((await f.run('publish',{job:{id:'job-a',name:'Private job',number:'A-001',openings:[opening],notes:''}})).status,200);
 assert.equal((await f.run('jobs',undefined,B)).value.jobs.length,0);
 for(const action of ['job-get','job-pdf'])assert.equal((await f.run(action,{id:'job-a'},B)).status,404);
 assert.equal((await f.run('line',{id:'job-a',version:2,lineId:'opening-a-0',status:'cut'},B)).status,404);
 for(const action of ['sales','jobs','workspace','dashboard'])assert.equal((await f.run(action,undefined,null,{cookie:'cutsheet_owner=old; cutsheet_shop=old'})).status,401);
 assert.equal((await f.run('session',undefined,null)).value.role,null);
 assert.equal((await f.run('sales',undefined,A,{'x-cutsheet-account':B})).status,409);
 const denied=await f.api.protect(new Request('https://example.test/api/info'),calculationHandler);assert.equal(denied.status,401);
});

test('signup needs the secret; direct Auth users, unconfirmed users and revoked sessions cannot enroll',async t=>{
 const f=await fixture(t);
 const request=(action,data)=>new Request('https://example.test/api/auth/'+action,{method:'POST',headers:{'Content-Type':'application/json',origin:'https://example.test'},body:JSON.stringify(data)});
 const signup=accessCode=>f.auth.handle(request('signup',{email:'a@example.invalid',password:'valid-password-123',accessCode}));
 assert.equal((await signup('wrong')).status,403);assert.equal(f.calls.length,0);
 assert.equal((await f.run('sales')).status,401); // A valid Supabase token alone is insufficient.
 const response=await signup(code);assert.equal(response.status,200);assert.equal((await response.json()).confirmationRequired,true);
 const a=f.users[token(SA)];a.email_confirmed_at=null;assert.equal((await f.run('sales')).status,401);a.email_confirmed_at=new Date().toISOString();
 assert.equal((await f.run('sales')).status,200);
 const login=await f.auth.handle(request('login',{email:a.email,password:'valid-password-123'}));assert.equal(login.status,200);
 for(const value of login.headers.getSetCookie())assert.match(value,/HttpOnly; Secure; SameSite=Strict/);
 assert.equal((await login.json()).access_token,undefined);
 await f.db.query('DELETE FROM auth.sessions WHERE id=$1',[SA]);assert.equal((await f.run('sales')).status,401);
 assert.equal((await f.run('sales',undefined,B)).status,401);
 assert.equal((await f.auth.handle(new Request('https://example.test/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',origin:'https://evil.test'},body:'{}'}))).status,403);
});

test('paired shop iPads stay within the account that issued their code and can be revoked',async t=>{
 const f=await fixture(t);await f.enroll(A);await f.enroll(B);
 const pairing=await f.run('pairing',{name:'Account A iPad'});assert.equal(pairing.status,200);
 const paired=await f.run('pair',{code:pairing.value.code},null);assert.equal(paired.status,200);
 const cookie=paired.response.headers.getSetCookie().find(c=>c.startsWith('__Host-cutsheet-device=')&&!c.startsWith('__Host-cutsheet-device=;')).split(';')[0];
 const own={'cookie':cookie,'x-cutsheet-account':A};
 assert.equal((await f.run('session',undefined,null,own)).value.ownerId,A);
 assert.equal((await f.run('jobs',undefined,null,own)).status,200);
 assert.equal((await f.run('sales',undefined,null,own)).status,403);
 assert.equal((await f.run('jobs',undefined,null,{...own,'x-cutsheet-account':B})).status,409);
 assert.equal((await f.run('jobs',undefined,null,{...own,cookie:cookie+'tampered'})).status,401);
 const board=await f.run('dashboard');await f.run('revoke',{deviceId:board.value.devices[0].id});
 assert.equal((await f.run('jobs',undefined,null,own)).status,401);
});

test('deployed SQL is exactly the reviewed migration',async()=>{
 assert.equal(schema.sql,await readFile(new URL('../supabase/migrations/20261019125949_account_workspaces.sql',import.meta.url),'utf8'));
});
