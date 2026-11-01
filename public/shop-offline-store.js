export const OFFLINE_LEASE_MS=12*60*60*1000;
let database;
function db(){
 if(!database)database=new Promise((resolve,reject)=>{
  if(!globalThis.indexedDB)return reject(Error('Offline storage is unavailable on this device.'));
  const request=indexedDB.open('cutsheet-shop-offline-v1',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('state');
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
 }).catch(e=>{database=null;throw e;});return database;
}
export const offlineShopStore={
 async get(){const d=await db();return new Promise((resolve,reject)=>{const r=d.transaction('state').objectStore('state').get('shop');r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);});},
 async update(fn){const d=await db();return new Promise((resolve,reject)=>{
  const tx=d.transaction('state','readwrite'),s=tx.objectStore('state'),r=s.get('shop');let next;
  r.onsuccess=()=>{try{next=fn(r.result||null);if(next===null)s.delete('shop');else s.put(next,'shop');}catch(e){tx.abort();reject(e);}};
  tx.oncomplete=()=>resolve(next);tx.onerror=()=>reject(tx.error||Error('Could not save on this iPad.'));tx.onabort=()=>reject(tx.error||Error('Could not save on this iPad.'));
 });},
 clear(){return this.update(()=>null);}
};
export function offlineAccess(snapshot,now=Date.now()){
 return snapshot?.session?.role==='shop'&&snapshot.verifiedAt<=now&&now-snapshot.verifiedAt<OFFLINE_LEASE_MS;
}
