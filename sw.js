/* Compatibility worker for GitHub Pages configured to publish the repository root.
   The canonical app is in dist/. This worker intentionally prefers fresh network data. */
const CACHE='zalma-root-bridge-v1';
const OFFLINE_URL=new URL('./offline.html',self.registration.scope).href;
self.addEventListener('install',event=>event.waitUntil((async()=>{
  try{await (await caches.open(CACHE)).add(OFFLINE_URL);}catch{}
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key!==CACHE&&(key==='almazov-schedule-v4'||key.startsWith('zalma-root-'))).map(key=>caches.delete(key)));
  await self.clients.claim();
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  await Promise.all(clients.map(client=>client.navigate(client.url).catch(()=>null)));
})()));
self.addEventListener('fetch',event=>{
  const request=event.request;
  const url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin)return;
  event.respondWith((async()=>{
    try{
      const response=await fetch(new Request(request,{cache:'no-store'}));
      if(response.ok&&!url.pathname.includes('/api/')&&!url.pathname.endsWith('/version.json')){
        const cache=await caches.open(CACHE);
        await cache.put(request,response.clone()).catch(()=>{});
      }
      return response;
    }catch{
      const cached=await caches.match(request);
      if(cached)return cached;
      const offline=await caches.match(OFFLINE_URL);
      if(offline&&request.mode==='navigate')return offline;
      return new Response('Соединение недоступно. Подключитесь к интернету и обновите страницу.',{status:503,headers:{'content-type':'text/plain;charset=utf-8'}});
    }
  })());
});
