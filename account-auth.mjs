import {createClient} from '@supabase/supabase-js';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {digest} from './account-store.mjs';

export class AccessError extends Error {constructor(status,message){super(message);this.status=status;}}
const fail=(status,message)=>{throw new AccessError(status,message);};
const equal=(a,b)=>timingSafeEqual(Buffer.from(digest(a)),Buffer.from(digest(b)));
const cookies=request=>Object.fromEntries((request.headers.get('cookie')||'').split(';').map(v=>v.trim().split('=')));
const names={access:'__Host-cutsheet-access',refresh:'__Host-cutsheet-refresh',device:'__Host-cutsheet-device'};
const json=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export function createAccountAuth({store,env=process.env,clientFactory=createClient,settingsFetch=fetch}){
 const secret=env.CUTSHEET_SESSION_SECRET||'';
 let configCache;
 async function config(){
  if(configCache&&Date.now()-configCache.at<30000)return configCache;
  const url=env.CUTSHEET_SUPABASE_URL||'https://uvfwnjrhbixcgjymzomm.supabase.co';
  const key=env.CUTSHEET_SUPABASE_PUBLISHABLE_KEY||await store.secret('CUTSHEET_SUPABASE_PUBLISHABLE_KEY');
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)||!key||secret.length<32)fail(503,'Account access is being configured. Please try again shortly.');
  const response=await settingsFetch(url+'/auth/v1/settings',{headers:{apikey:key},signal:AbortSignal.timeout(10000)});
  const settings=response.ok?await response.json():null;
  if(!settings?.external?.email||settings.mailer_autoconfirm!==false)fail(503,'Email verification must be enabled before account access is available.');
  // No sessions or credentials are shared between requests.
  return configCache={url,key,at:Date.now()};
 }
 async function client(){const {url,key}=await config();return clientFactory(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});}
 function sessionId(token){try{return JSON.parse(Buffer.from(token.split('.')[1],'base64url')).session_id;}catch{return '';}}
 function setTokens(headers,session){
  for(const [key,value]of [['access',session.access_token],['refresh',session.refresh_token]])headers.append('Set-Cookie',`${names[key]}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${30*86400}`);
  headers.append('Set-Cookie',`${names.device}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
 }
 function clear(headers){for(const name of [...Object.values(names),'cutsheet_owner','cutsheet_shop'])headers.append('Set-Cookie',`${name}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);}
 const signature=body=>createHmac('sha256',secret).update(body).digest('base64url');
 function deviceToken(ownerId,token){if(secret.length<32)fail(503,'Device access is not configured.');const body=Buffer.from(JSON.stringify({ownerId,token})).toString('base64url');return body+'.'+signature(body);}
 function deviceIdentity(value){try{const [body,sig]=value.split('.');if(secret.length<32||!equal(signature(body),sig))return null;const p=JSON.parse(Buffer.from(body,'base64url'));return typeof p.token==='string'&&typeof p.ownerId==='string'?p:null;}catch{return null;}}
 async function verify(auth,token){
  const {data,error}=await auth.getUser(token);if(error||!data?.user?.email_confirmed_at||data.user.is_anonymous)return null;
  if(!await store.sessionActive(data.user.id,sessionId(token)))return null;
  if(!await store.enroll(data.user))return null;
  return data.user;
 }
 async function resolve(request,headers=new Headers()){
  const c=cookies(request);
  if(c[names.access]||c[names.refresh]){
   const sb=await client();let user=c[names.access]?await verify(sb.auth,c[names.access]):null;
   if(!user&&c[names.refresh]){const {data,error}=await sb.auth.refreshSession({refresh_token:c[names.refresh]});if(!error&&data.session){user=await verify(sb.auth,data.session.access_token);if(user)setTokens(headers,data.session);}}
   if(user)return {ownerId:user.id,actor:{role:'owner',id:user.id,name:user.email},email:user.email};
   clear(headers);return null;
  }
  const d=deviceIdentity(c[names.device]||'');
  if(d&&await store.ownerActive(d.ownerId))return {ownerId:d.ownerId,device:d.token};
  return null;
 }
 async function limit(request,action){if(!await store.rateLimit(action+':'+(request.headers.get('x-nf-client-connection-ip')||'local')))fail(429,'Too many attempts. Please wait 15 minutes and try again.');}
 const emailInput=data=>{const email=typeof data.email==='string'?data.email.trim().toLowerCase():'';if(email.length>254||!/^\S+@\S+\.\S+$/.test(email))fail(400,'Enter a valid email address.');return email;};
 const passwordInput=data=>{if(typeof data.password!=='string'||data.password.length<12||data.password.length>128)fail(400,'Use a password with 12–128 characters.');return data.password;};
 async function handle(request){
  const path=new URL(request.url).pathname.split('/').pop();
  if(!['login','signup','complete','recover','password','logout'].includes(path))return json(404,{error:'Unknown account action.'});
  if(request.method!=='POST')return json(405,{error:'POST required.'});
  if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return json(403,{error:'Invalid origin.'});
  if(!request.headers.get('content-type')?.startsWith('application/json'))return json(415,{error:'Expected JSON.'});
  try{
   const reader=request.body?.getReader();let length=0;const chunks=[];if(reader)while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>12000){await reader.cancel();fail(413,'Request too large.');}chunks.push(Buffer.from(value));}
   let data;try{data=JSON.parse(Buffer.concat(chunks).toString());}catch{fail(400,'Invalid request.');}if(!data||Array.isArray(data)||typeof data!=='object')fail(400,'Invalid request.');
   if(path==='logout'){
    const c=cookies(request),response=json(200,{ok:true});clear(response.headers);
    if(c[names.access]&&c[names.refresh]){const sb=await client();await sb.auth.setSession({access_token:c[names.access],refresh_token:c[names.refresh]});const {error}=await sb.auth.signOut({scope:'local'});if(error)fail(503,'Sign-out could not be confirmed. Reconnect and try again.');}
    return response;
   }
   await limit(request,path);
   const sb=await client();
   if(path==='signup'){
    const email=emailInput(data),password=passwordInput(data),code=await store.secret('CUTSHEET_SIGNUP_ACCESS_CODE');
    if(code.length<12)fail(503,'Account registration is not ready yet.');
    if(typeof data.accessCode!=='string'||data.accessCode.length>256||!equal(code,data.accessCode))fail(403,'That access code is not valid.');
    // Only code-approved email addresses may enroll, even if Auth's public
    // signup endpoint is called directly. Never trust user_metadata for access.
    await store.approveEmail(email);
    const {data:result,error}=await sb.auth.signUp({email,password,options:{emailRedirectTo:new URL('/auth.html',request.url).href}});
    if(error)fail(error.status===429?429:400,error.status===429?'Please wait before requesting another email.':'Account could not be created. Try signing in or resetting your password.');
    const response=json(200,{ok:true,confirmationRequired:true});
    if(result.session){const user=await verify(sb.auth,result.session.access_token);if(!user)fail(403,'Confirm your email before signing in.');setTokens(response.headers,result.session);return jsonWithHeaders({ok:true,signedIn:true},response.headers);}
    return response;
   }
   if(path==='login'){
    const email=emailInput(data);if(typeof data.password!=='string'||data.password.length>128)fail(400,'Enter your password.');
    const {data:result,error}=await sb.auth.signInWithPassword({email,password:data.password});
    if(error||!result.session)fail(401,'Check your email and password, and confirm your email before signing in.');
    const user=await verify(sb.auth,result.session.access_token);if(!user)fail(403,'This account has not been authorized. Create your account using the access code.');
    const response=json(200,{ok:true});setTokens(response.headers,result.session);return response;
   }
   if(path==='complete'){
    if(typeof data.accessToken!=='string'||data.accessToken.length>8000||typeof data.refreshToken!=='string'||data.refreshToken.length>1000)fail(400,'Invalid confirmation link.');
    const user=await verify(sb.auth,data.accessToken);if(!user)fail(401,'This confirmation link is invalid or expired. Please sign in.');
    const response=json(200,{ok:true});setTokens(response.headers,{access_token:data.accessToken,refresh_token:data.refreshToken});return response;
   }
   if(path==='recover'){
    const email=emailInput(data);const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:new URL('/auth.html?mode=reset',request.url).href});
    if(error)fail(503,'Password reset email is unavailable right now. Ask the account administrator to reset your password.');
    return json(200,{ok:true,message:'If an account exists, check your email for a password reset link.'});
   }
   if(path==='password'){
    const c=cookies(request),headers=new Headers(),identity=await resolve(request,headers);if(!identity?.actor)fail(401,'Sign in using the password reset link first.');
    const password=passwordInput(data);const {error:setError}=await sb.auth.setSession({access_token:c[names.access],refresh_token:c[names.refresh]});if(setError)fail(401,'Open a fresh password reset link.');
    const {error}=await sb.auth.updateUser({password});if(error)fail(400,'The password could not be updated. Choose a different password and try again.');return jsonWithHeaders({ok:true},headers);
   }
   return json(404,{error:'Unknown account action.'});
  }catch(e){return json(e instanceof AccessError?e.status:503,{error:e instanceof AccessError?e.message:'Account access is temporarily unavailable. Please try again.'});}
 }
 function jsonWithHeaders(data,headers){const r=json(200,data);for(const cookie of headers.getSetCookie())r.headers.append('Set-Cookie',cookie);return r;}
 return {resolve,handle,limit,deviceToken,clear,names};
}
