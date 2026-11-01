importScripts('/shop-offline-assets.js');
self.addEventListener('install',event=>event.waitUntil(caches.open(self.SHOP_CACHE).then(cache=>cache.addAll(self.SHOP_ASSETS))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 for(const key of await caches.keys())if(key.startsWith('cutsheet-shop-')&&key!==self.SHOP_CACHE)await caches.delete(key);
 await self.clients.claim();
})()));
self.addEventListener('message',event=>{
 if(event.data?.type!=='CHECK_SHOP_OFFLINE'||!event.ports?.[0])return;
 event.waitUntil((async()=>{
  try{
   const cache=await caches.open(self.SHOP_CACHE);
   const entries=await Promise.all(self.SHOP_ASSETS.map(path=>cache.match(path)));
   event.ports[0].postMessage({type:'SHOP_OFFLINE_STATUS',ready:entries.every(response=>response?.ok)});
  }catch{event.ports[0].postMessage({type:'SHOP_OFFLINE_STATUS',ready:false});}
 })());
});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 // Never cache API responses, credentials, owner pages, or customer records.
 if(event.request.method!=='GET'||url.origin!==self.location.origin||!self.SHOP_ASSETS.includes(url.pathname))return;
 event.respondWith((async()=>{
  // These are public static assets only. Safari may not yet expose the new
  // client while restoring a tab; do not require a live client for cache reads.
  const client=event.clientId?await self.clients.get(event.clientId).catch(()=>null):null;
  if(url.pathname!=='/shop.html'&&client?.url&&new URL(client.url).pathname!=='/shop.html')return fetch(event.request);
  const cache=await caches.open(self.SHOP_CACHE),saved=await cache.match(url.pathname);
  return saved||fetch(event.request);
 })());
});
