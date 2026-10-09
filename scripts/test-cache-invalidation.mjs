import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const read=path=>readFile(join(root,path),'utf8');
const [boot,worker,workerSource,html,rootIndex,rootWorker,version]=await Promise.all([
  read('dist/boot.js'),read('dist/sw.js'),read('public/sw.js'),read('dist/index.html'),read('index.html'),read('sw.js'),read('dist/version.json').then(JSON.parse)
]);
const check=(condition,message)=>{if(!condition)throw new Error(message);};
check(boot.includes('registration.update()'),'boot must explicitly ask the browser to check for a worker update');
check(boot.includes("window.addEventListener('app:check-update'")&&html.includes('data-action="check-updates"'),'settings must expose a real manual update check');
check(worker.includes("url.pathname.endsWith('/version.json')"),'version metadata must not accumulate stale cache entries');
check(boot.includes("updateViaCache:'none'"),'service-worker script must bypass the HTTP cache');
check(boot.includes("fetch(url,{cache:'no-store'"),'boot must verify the current deployed build');
check(boot.includes("location.replace(pageUrl.href)"),'old builds must trigger a cache-busting navigation');
check(workerSource.includes("request.mode==='navigate'")&&workerSource.includes('networkFirst(request)'),'navigation must be network-first');
check(workerSource.includes("url.searchParams.get('v')===BUILD_ID"),'cache-first must be limited to versioned resources');
check(workerSource.includes("url.pathname.includes('/api/')")&&workerSource.includes('fetchFresh(request)'),'API responses must bypass cached user data');
check(worker.includes(`const BUILD_ID='${version.buildId}'`),'service worker cache version must match this build');
check(!worker.includes('__BUILD_ID__')&&!worker.includes('__VERSIONED_SHELL__'),'generated service worker must not contain build placeholders');
check(html.includes(`?v=${version.buildId}`),'built HTML must version its assets');
check(rootIndex.includes("current.pathname+='dist/'"),'branch-root index must route to canonical dist app');
check(rootWorker.includes("cache:'no-store'"),'legacy root worker must check network before cache');
console.log(`PASS cache invalidation: build ${version.buildId}; network-first navigation; versioned modules; stale-build navigation`);
