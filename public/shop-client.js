// Display snapshots only. Every write still goes to the server with its version.
import {accountFetch} from './account-storage.js';
const READS=new Set(['session','sales','workspace','dashboard','jobs','sales-get','draft-get','job-get']);
const AUTH=new Set(['login','logout','pair']);
const KEY='cutsheet-read-cache-v2',REVISION='cutsheet-cache-revision-v1';
export const FRESH_MS=30000,DISPLAY_MS=5*60000;
const copy=value=>value===undefined?undefined:structuredClone(value);
const identity=s=>JSON.stringify([s?.role,s?.id,s?.local,s?.publicOwnerAccess]);

export function createShopClient({fetch:fetcher,storage,sharedStorage,now=Date.now,notify=()=>{}}){
  let entries={},revision='',generation=0;
  const pending=new Map();
  const sharedRevision=()=>{try{return sharedStorage?.getItem(REVISION)||'';}catch{return '';}};
  revision=sharedRevision();
  try{const saved=JSON.parse(storage?.getItem(KEY)||'null');if(saved?.revision===revision)entries=saved.entries||{};}catch{}
  const keyFor=(action,data)=>action+':'+JSON.stringify(data||null);
  function persist(){
    entries=Object.fromEntries(Object.entries(entries).filter(([,e])=>now()-e.at<DISPLAY_MS).sort((a,b)=>b[1].at-a[1].at).slice(0,40));
    try{storage?.setItem(KEY,JSON.stringify({revision,entries}));}catch{try{storage?.removeItem(KEY);}catch{}}
  }
  function invalidate({auth=false,broadcast=false}={}){
    const session=entries[keyFor('session')];entries={};generation++;pending.clear();
    if(!auth&&session)entries[keyFor('session')]=session;
    if(broadcast){revision=JSON.stringify({id:Math.random().toString(36).slice(2),at:now(),auth});try{sharedStorage?.setItem(REVISION,revision);}catch{}}
    persist();notify(auth?'access-reset':'invalidate');
  }
  function checkRevision(){const latest=sharedRevision();if(latest!==revision){revision=latest;let auth=false;try{auth=!!JSON.parse(latest).auth;}catch{}invalidate({auth});}}
  function peek(action,data,{maxAge=action==='session'?FRESH_MS:DISPLAY_MS}={}){
    checkRevision();const e=entries[keyFor(action,data)],session=entries[keyFor('session')];
    if(!e||now()-e.at>=maxAge||now()<e.at)return undefined;
    if(action!=='session'&&(!session?.value?.role||now()-session.at>=FRESH_MS))return undefined;
    return copy(e.value);
  }
  async function request(action,data,{force=false}={}){
    checkRevision();const read=READS.has(action),key=keyFor(action,data);
    if(read&&!force){const cached=peek(action,data,{maxAge:FRESH_MS});if(cached!==undefined)return cached;}
    if(read&&pending.has(key))return copy(await pending.get(key));
    if(!read)invalidate({auth:AUTH.has(action)});
    const started=generation;
    const operation=(async()=>{
      let response,result;
      try{
        response=await fetcher('/api/shop/'+action,{method:data===undefined?'GET':'POST',headers:data===undefined?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),cache:'no-store',signal:AbortSignal.timeout(20000)});
        result=await response.json();
      }catch{
        if(!read)invalidate({auth:AUTH.has(action),broadcast:true});
        throw new Error(read?'Could not refresh the workspace. Check your connection and try again.':'Could not confirm the update. Reconnect and refresh to check the saved progress before trying again.');
      }
      // A response started before a write/sign-out must never restore the old snapshot.
      if(read&&started!==generation)return request(action,data,{force:true});
      if(!response.ok){
        if(response.status===401||response.status===403)invalidate({auth:true,broadcast:true});
        else if(!read)invalidate({broadcast:true});
        const error=new Error(result.error||'Could not connect to the shop.');error.status=response.status;throw error;
      }
      if(read){
        if(action==='session'){
          const previous=entries[keyFor('session')]?.value;
          if(!result.role||previous&&identity(previous)!==identity(result))invalidate({auth:true});
        }
        entries[key]={at:now(),value:copy(result)};persist();
      }else invalidate({auth:AUTH.has(action),broadcast:true});
      return result;
    })();
    if(read)pending.set(key,operation);
    try{return copy(await operation);}finally{if(pending.get(key)===operation)pending.delete(key);}
  }
  return {request,peek,checkRevision};
}
const safeStorage=name=>{try{return globalThis[name];}catch{return undefined;}};
const client=createShopClient({fetch:(...args)=>accountFetch(...args),storage:safeStorage('sessionStorage'),sharedStorage:safeStorage('localStorage'),notify:type=>globalThis.window?.dispatchEvent(new Event('shop-'+type))});
export const shopRequest=client.request,cachedShop=client.peek;
globalThis.window?.addEventListener('storage',e=>{if(e.key===REVISION)client.checkRevision();});
export async function warmWorkspace(){
  if(cachedShop('session')?.role!=='owner')return;
  await Promise.allSettled(['sales','dashboard','workspace'].map(action=>shopRequest(action)));
}
