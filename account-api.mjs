import {createShopService} from './shop-service.mjs';
import {shopHandler} from './shop-api.mjs';
import {AccessError} from './account-auth.mjs';

const json=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export function accountShopHandler({store,auth,secret}){
 const serviceFor=identity=>createShopService({store:store.workspace(identity.ownerId),authenticatedActor:identity.actor||null,password:'Account access only; legacy login disabled',secret});
 const deviceCookies=identity=>identity.device?{shop:identity.device}:{};
 async function principal(request,headers){
  const identity=await auth.resolve(request,headers);if(!identity)return null;
  if(identity.device){const session=await serviceFor(identity).run('session',{},deviceCookies(identity));if(session.role!=='shop')return null;}
  return identity;
 }
 async function handler(request){
  const url=new URL(request.url),operation=url.pathname.split('/').pop(),headers=new Headers();
  try{
   if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return json(403,{error:'Invalid origin.'});
   if(operation==='logout')return auth.handle(new Request(new URL('/api/auth/logout',url),request));
   if(operation==='login')return json(401,{error:'Sign in with your email and password.',authMode:'account'});
   if(operation==='pair'){
    if(request.method!=='POST'||!request.headers.get('content-type')?.startsWith('application/json'))return json(405,{error:'POST JSON required.'});
    await auth.limit(request,'pair');
    const body=await request.text();if(body.length>2000)return json(413,{error:'Request too large.'});
    let data;try{data=JSON.parse(body);}catch{return json(400,{error:'Invalid request.'});}
    const ownerId=await store.pairingOwner(data?.code);if(!ownerId||!await store.ownerActive(ownerId))return json(401,{error:'That connection code is invalid or expired.'});
    const result=await serviceFor({ownerId}).run('pair',data,{});
    if(result.error)return json(result.status||400,{error:result.error});
    const response=json(200,{ok:true});auth.clear(response.headers);
    response.headers.append('Set-Cookie',`${auth.names.device}=${auth.deviceToken(ownerId,result.token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${result.maxAge}`);
    return response;
   }
   await store.init();const identity=await principal(request,headers);
   if(!identity){
    const response=operation==='session'&&request.method==='GET'?json(200,{configured:true,role:null,authMode:'account',publicOwnerAccess:false}):json(401,{error:'Sign in to access your workspace.',authMode:'account'});
    for(const c of headers.getSetCookie())response.headers.append('Set-Cookie',c);return response;
   }
   const service=serviceFor(identity),cookie=deviceCookies(identity);
   if(operation!=='session'&&request.headers.get('x-cutsheet-account')!==identity.ownerId)return json(409,{error:'Your signed-in account changed. Reload this page before continuing.'});
   const response=await shopHandler({run:async(action,data)=>{
    const result=await service.run(action,data,cookie);
    if(action==='pairing')await store.rememberPair(result.code,identity.ownerId);
    return action==='session'?{...result,authMode:'account',ownerId:identity.ownerId}:result;
   }})(request);
   for(const c of headers.getSetCookie())response.headers.append('Set-Cookie',c);
   return response;
  }catch(e){return json(e.status||503,{error:e instanceof AccessError?e.message:'Private workspace access is temporarily unavailable. Please try again.'});}
 }
 async function protect(request,next){
  const headers=new Headers();try{const identity=await principal(request,headers);if(!identity?.actor)return json(401,{error:'Sign in to use the cut-sheet tools.'});if(request.headers.get('x-cutsheet-account')!==identity.ownerId)return json(409,{error:'Your signed-in account changed. Reload this page.'});const response=await next(request);for(const c of headers.getSetCookie())response.headers.append('Set-Cookie',c);return response;}catch{return json(503,{error:'Account access is temporarily unavailable.'});}
 }
 return {handler,protect};
}
