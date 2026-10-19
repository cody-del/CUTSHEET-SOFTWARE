const scope=()=>{try{return sessionStorage.getItem('cutsheet-account-identity-v1')||'';}catch{return '';}};
export function scopedKey(key){const id=scope();return id&&id!=='local'?'account:'+id+':'+key:key;}
export const accountStorage={getItem:key=>localStorage.getItem(scopedKey(key)),setItem:(key,value)=>localStorage.setItem(scopedKey(key),value),removeItem:key=>localStorage.removeItem(scopedKey(key))};
export function accountFetch(url,options={}){const headers=new Headers(options.headers),id=scope();if(id&&id!=='local')headers.set('X-CutSheet-Account',id);return fetch(url,{...options,headers});}
export function clearPrivateCache(){
 try{for(const key of Object.keys(sessionStorage))if(key.startsWith('cutsheet-read-cache-')||key.startsWith('workspace:'))sessionStorage.removeItem(key);}catch{}
}
