importScripts('/shop-offline-assets.js');
self.addEventListener('install',event=>event.waitUntil(caches.open(self.SHOP_CACHE).then(cache=>cache.addAll(self.SHOP_ASSETS))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 for(const key of await caches.keys())if(key.startsWith('cutsheet-shop-')&&key!==self.SHOP_CACHE)await caches.delete(key);
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 // Never cache API responses, credentials, owner pages, or customer records.
 if(event.request.method!=='GET'||url.origin!==self.location.origin||!self.SHOP_ASSETS.includes(url.pathname))return;
 event.respondWith((async()=>{
  const client=event.clientId?await self.clients.get(event.clientId):null;
  if(url.pathname!=='/shop.html'&&(!client||new URL(client.url).pathname!=='/shop.html'))return fetch(event.request);
  const cache=await caches.open(self.SHOP_CACHE),saved=await cache.match(url.pathname);
  return saved||fetch(event.request);
 })());
});
