const CACHE_NAME='almazov-student-ui-prerelease-2.0-cache4';
const SHELL=['./','./index.html','./offline.html','./404.html','./logo.png','./logo.webp','./manifest.webmanifest','./sw.js','./version.json'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('message',event=>{if(event.data==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',event=>{
  const req=event.request;if(req.method!=='GET')return;
  const url=new URL(req.url);if(url.origin!==self.location.origin)return;
  const isSchedule=url.pathname.endsWith('/data/official-schedules.json')||url.pathname.endsWith('/data/official-schedules.json/');
  if(isSchedule){
    event.respondWith((async()=>{
      try{
        const fresh=await fetch(req,{cache:'no-store'});
        if(fresh.ok){const c=await caches.open(CACHE_NAME);await c.put('./data/official-schedules.json',fresh.clone());}
        return fresh;
      }catch(e){return (await caches.match('./data/official-schedules.json'))||Response.error();}
    })());return;
  }
  const isVersion=url.pathname.endsWith('/version.json');
  if(isVersion){event.respondWith(fetch(req,{cache:'no-store'}));return;}
  if(req.mode==='navigate'){
    event.respondWith((async()=>{try{const fresh=await fetch(req,{cache:'no-store'});const c=await caches.open(CACHE_NAME);await c.put('./index.html',fresh.clone());return fresh;}catch(e){return (await caches.match(req))||(await caches.match('./index.html'))||(await caches.match('./offline.html'));}})());return;
  }
  event.respondWith((async()=>{const cached=await caches.match(req);if(cached)return cached;try{const fresh=await fetch(req);if(fresh.ok){const c=await caches.open(CACHE_NAME);await c.put(req,fresh.clone());}return fresh;}catch(e){return Response.error();}})());
});
