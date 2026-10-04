const CACHE_VERSION='almazov-student-v4.3.0-pre8';
const APP_SHELL=['./','./index.html','./offline.html','./404.html','./logo.png','./logo-512.png','./manifest.webmanifest','./version.json'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_VERSION).then(cache=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('message',event=>{if(event.data==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;
  if(url.pathname.endsWith('/data/official-schedules.json')){
    event.respondWith(fetch(req,{cache:'no-store'}).then(res=>{
      if(res.ok){const copy=res.clone();caches.open(CACHE_VERSION).then(c=>c.put(req,copy));}
      return res;
    }).catch(()=>caches.match(req)));
    return;
  }
  if(req.mode==='navigate'){
    event.respondWith(fetch(req).then(res=>{
      if(res.ok){const copy=res.clone();caches.open(CACHE_VERSION).then(c=>c.put('./index.html',copy));}
      return res;
    }).catch(()=>caches.match(req).then(c=>c||caches.match('./index.html')).catch(()=>caches.match('./offline.html'))));
    return;
  }
  event.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(res=>{
    if(res.ok){const copy=res.clone();caches.open(CACHE_VERSION).then(c=>c.put(req,copy));}
    return res;
  })));
});
