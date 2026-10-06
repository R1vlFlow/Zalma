const CACHE='almazov-schedule-v4';
const SHELL=['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./offline.html','./logo.png','./logo-512.png','./data/catalog.json','./data/manual-specialist-schedules.json','./data/kug.json','./data/sources.json','./version.json'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET')return;
  if(u.origin===self.location.origin && u.pathname.endsWith('/data/live-index.json')){
    e.respondWith(fetch(e.request,{cache:'no-store'}).then(res=>{if(res.ok)caches.open(CACHE).then(c=>c.put(e.request,res.clone())).catch(()=>{});return res;}).catch(()=>caches.match(e.request)));return;
  }
  e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(res=>{if(res.ok&&u.origin===self.location.origin)caches.open(CACHE).then(c=>c.put(e.request,res.clone()));return res;}).catch(()=>caches.match('./offline.html'))));
});
