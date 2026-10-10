import { readFile, stat, readdir } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const dist=join(root,'dist');
for(const f of ['index.html','styles.css','boot.js','runtime-config.js','telemetry.js','main.js','sw.js','manifest.webmanifest','offline.html','version.json'])await readFile(join(dist,f));
const html=await readFile(join(dist,'index.html'),'utf8');
const css=await readFile(join(dist,'styles.css'),'utf8');
for(const selector of ['.modal-backdrop{','.modal-backdrop.open{','.modal{','.modal-body{'])if(!css.includes(selector))throw new Error(`Required modal/layout CSS missing: ${selector}`);
const version=JSON.parse(await readFile(join(dist,'version.json'),'utf8'));
const manifest=JSON.parse(await readFile(join(dist,'manifest.webmanifest'),'utf8'));
if(manifest.display!=='standalone'||!manifest.start_url||!manifest.scope||manifest.prefer_related_applications!==false)throw new Error('PWA manifest missing install-critical fields');
for(const [size,name] of [[192,'assets/pwa-192.png'],[512,'assets/pwa-512.png'],[512,'assets/pwa-maskable-512.png']]){
 const image=await readFile(join(dist,name));
 if(image.readUInt32BE(16)!==size||image.readUInt32BE(20)!==size)throw new Error(`PWA icon dimensions invalid: ${name}`);
 if(!manifest.icons.some(icon=>icon.src===name&&icon.sizes===`${size}x${size}`))throw new Error(`PWA manifest missing icon: ${name}`);
}
if(process.env.REQUIRE_SPECIALIST_SNAPSHOT==='1'){
 const specialist=JSON.parse(await readFile(join(dist,'data','program-schedules.json'),'utf8'));
 if(specialist?.schemaVersion!==1||!specialist?.programs)throw new Error('Official multi-faculty schedule snapshot is missing/invalid');
 for(const [program,course] of [['31.05.02',1],['31.05.02',2],['37.05.01',1],['37.05.01',2]]){
  const item=specialist.programs?.[program]?.courses?.[String(course)];
  if(!item||!Array.isArray(item.events)||item.events.length===0)throw new Error(`Official specialist snapshot has no validated events for ${program}/${course}`);
  const bundle=JSON.parse(await readFile(join(dist,'data','schedules',program,`${course}.json`),'utf8'));
  if(!Array.isArray(bundle.events)||bundle.events.length===0)throw new Error(`Static schedule bundle is empty for ${program}/${course}`);
 }
}
if(process.env.REQUIRE_MINIFICATION==='1'&&version.minified!==true)throw new Error('Release build is not minified');
if(!/^[a-f0-9]{16}$/.test(version.buildId??''))throw new Error('Missing/invalid content-derived buildId in dist/version.json');
if(!html.includes(`data-build-id="${version.buildId}"`)||!html.includes(`name="app-build" content="${version.buildId}"`))throw new Error('HTML build marker does not match version.json');
const ids=[...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);
if(new Set(ids).size!==ids.length)throw new Error('Duplicate HTML ids');
const internal=[...html.matchAll(/(?:href|src)="\.\/([^"#]+)"/g)].map(m=>m[1].split(/[?#]/)[0]);
for(const p of internal)await stat(join(dist,p));
for(const name of ['boot.js','runtime-config.js','telemetry.js','styles.css','main.js','manifest.webmanifest']){
  if(!html.includes(`./${name}?v=${version.buildId}`))throw new Error(`${name} is not cache-busted for this build`);
}
const boot=await readFile(join(dist,'boot.js'),'utf8');
const sw=await readFile(join(dist,'sw.js'),'utf8');
if(!boot.includes(`const BUILD_ID='${version.buildId}'`))throw new Error('boot.js build marker mismatch');
if(sw.includes('__BUILD_ID__')||sw.includes('__VERSIONED_SHELL__'))throw new Error('Unexpanded service worker build token');
if(!sw.includes(`const BUILD_ID='${version.buildId}'`)||!sw.includes("cache:'no-store'"))throw new Error('Service worker does not enforce the current build/network freshness');
if(sw.includes("const SHELL=['./'"))throw new Error('Legacy cache-first shell detected in service worker');
if(!/url\.pathname\.includes\('\/api\/'\)[\s\S]*?fetchFresh\(request\)/.test(sw))throw new Error('Service worker API requests do not bypass stale cache');
const shellMatch=sw.match(/const VERSIONED_SHELL=(\[[^\n]*\]);/);
if(!shellMatch)throw new Error('Versioned shell manifest missing');
const shell=JSON.parse(shellMatch[1]);
if(shell.some(asset=>asset.includes('index.html')))throw new Error('index.html must not be pre-cached during worker installation');
if(!shell.includes(`./styles.css?v=${version.buildId}`))throw new Error('Stylesheet missing from versioned cache manifest');

async function walk(dir){
  const entries=await readdir(dir,{withFileTypes:true});let paths=[];
  for(const entry of entries){const path=join(dir,entry.name);if(entry.isDirectory())paths.push(...await walk(path));else paths.push(path);}
  return paths;
}
const jsFiles=(await walk(dist)).filter(path=>path.endsWith('.js')&&!path.endsWith(`${sep}sw.js`));
for(const path of jsFiles){
  const code=await readFile(path,'utf8');
  const imports=[...code.matchAll(/(?:from|import)\s*\(?\s*["'](\.\.?\/[^"']+\.js(?:\?[^"']*)?)["']/g)];
  for(const match of imports){
    const specifier=match[1];
    if(!specifier.endsWith(`?v=${version.buildId}`))throw new Error(`Unversioned JS module import in ${relative(dist,path)}: ${specifier}`);
    await stat(join(dirname(path),specifier.split('?')[0]));
  }
}
const rootIndex=await readFile(join(root,'index.html'),'utf8');
if(!rootIndex.includes("current.pathname+='dist/'")||!rootIndex.includes("navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'})"))throw new Error('Root branch-deployment bridge is missing');
console.log(JSON.stringify({ok:true,buildId:version.buildId,ids:ids.length,internalAssets:internal.length,versionedModules:jsFiles.length,cacheInvalidation:'PASS'},null,2));
