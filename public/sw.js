const VERSION='almazov-hub-v2.3.0';
const SHELL=['./','./index.html','./styles.css','./boot.js','./main.js','./manifest.webmanifest','./offline.html','./assets/logo.png','./assets/logo-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
async function networkFirst(request){try{const response=await fetch(request);if(response.ok){const cache=await caches.open(VERSION);await cache.put(request,response.clone());}return response;}catch{const cached=await caches.match(request);if(cached)return cached;throw new Error('offline');}}
async function cacheFirst(request){const cached=await caches.match(request);if(cached)return cached;try{const response=await fetch(request);if(response.ok){const cache=await caches.open(VERSION);await cache.put(request,response.clone());}return response;}catch{return caches.match('./offline.html');}}
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==location.origin)return;
  if(url.pathname.includes('/api/')){event.respondWith(networkFirst(event.request).catch(()=>new Response(JSON.stringify({status:'error',events:[],issues:['OFFLINE'],message:'Сервис API недоступен. Показан локальный snapshot при наличии.'}),{status:503,headers:{'content-type':'application/json;charset=utf-8'}})));return;}
  event.respondWith(cacheFirst(event.request));
});
