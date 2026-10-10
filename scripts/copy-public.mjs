import { cp, copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));
const dist=join(root,'dist');
await mkdir(join(dist,'assets'),{recursive:true});
for(const name of ['index.html','styles.css','sw.js','boot.js','runtime-config.js','telemetry.js','manifest.webmanifest','offline.html'])
  await copyFile(join(root,'public',name),join(dist,name));
await cp(join(root,'public','assets'),join(dist,'assets'),{recursive:true});
await mkdir(join(dist,'data'),{recursive:true});
await cp(join(root,'public','data'),join(dist,'data'),{recursive:true});

try{
  const {normalizeLiveEvents}=await import(join(dist,'core','validate.js'));
  const payload=JSON.parse(await readFile(join(root,'data','official-schedules.json'),'utf8'));
  const curatedKug=JSON.parse(await readFile(join(root,'data','kug.json'),'utf8'));
  const officialSources=Array.isArray(payload.kugSources)?payload.kugSources:[];
  const periods=[];
  for(const [program,courses] of Object.entries(curatedKug)){
    if(!courses||typeof courses!=='object') continue;
    for(const [course,items] of Object.entries(courses)){
      if(!Array.isArray(items)) continue;
      const source=program==='31.05.01'?(officialSources.find(x=>String(x.course)===String(course))||null):null;
      for(const item of items){
        if(!item||typeof item.from!=='string'||typeof item.to!=='string'||item.from>item.to) continue;
        periods.push({program,course,kind:String(item.kind||'study'),label:String(item.label||'Учебный период'),start:item.from,end:item.to,sourceUrl:source?.url||null});
      }
    }
  }
  // Merge official assessment periods only when they are not already represented in the curated full-year KUG.
  for(const p of (Array.isArray(payload.assessmentPeriods)?payload.assessmentPeriods:[])){
    const period={program:'31.05.01',course:String(p.course),kind:String(p.kind||'assessment'),label:String(p.label||'Промежуточная аттестация'),start:p.start,end:p.end,semester:p.semester,sourceUrl:p.sourceUrl};
    if(typeof period.start!=='string'||typeof period.end!=='string') continue;
    if(!periods.some(x=>x.program===period.program&&String(x.course)===period.course&&x.start===period.start&&x.end===period.end)) periods.push(period);
  }
  const sources=[];
  for(const [program,courses] of Object.entries(curatedKug)) for(const [course,items] of Object.entries(courses||{})){
    const periodCount=Array.isArray(items)?items.length:0;
    const source=program==='31.05.01'?(officialSources.find(x=>String(x.course)===String(course))||null):null;
    sources.push({program,course,title:source?.title||`КУГ · ${program} · ${course} курс`,url:source?.url||'https://education.almazovcentre.ru/about_institute/programm/specialist_programme/student/',periods:periodCount,status:source?.status||'verified-bootstrap'});
  }
  const kugPayload={schemaVersion:2,generatedAt:payload.generatedAt??null,sources,periods};
  await mkdir(join(dist,'data'),{recursive:true});
  await writeFile(join(dist,'data','kug.json'),JSON.stringify(kugPayload));
  const events=normalizeLiveEvents(payload);
  for(let course=1;course<=6;course++){
    const courseEvents=events.filter(e=>e.program==='31.05.01'&&e.course===course);
    const dir=join(dist,'data','schedules','31.05.01');
    await mkdir(dir,{recursive:true});
    await writeFile(join(dir,`${course}.json`),JSON.stringify({version:1,generatedAt:payload.generatedAt,program:'31.05.01',course,status:'live',events:courseEvents,issues:[],message:`Bundled official snapshot · ${courseEvents.length} событий`,sourceUrl:payload.sourcePage,sourceName:'official-schedules.json'}));
  }
}catch(error){
  console.warn(`static schedule snapshot generation skipped: ${error instanceof Error?error.message:String(error)}`);
}

async function walk(dir){
  const result=[];
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const path=join(dir,entry.name);
    if(entry.isDirectory())result.push(...await walk(path));
    else result.push(path);
  }
  return result;
}

// Bundle/minify the production entry and critical shell files. Local environments
// without installed dependencies may still run functional QA; release workflows
// set REQUIRE_MINIFICATION=1 so a production artifact cannot be published unminified.
let minified=false;
let esbuild=null;
try { esbuild=await import('esbuild'); }
catch(error) {
  if(process.env.REQUIRE_MINIFICATION==='1') throw new Error(`esbuild is required for an RC build: ${error instanceof Error?error.message:String(error)}`);
  console.warn('RC MINIFICATION SKIPPED: install esbuild to produce a minified artifact; CI release workflows require it.');
}
if(esbuild){
  const entry=join(dist,'main.js');
  const bundled=await esbuild.build({entryPoints:[entry],outfile:entry,bundle:true,minify:true,format:'esm',target:['es2022'],legalComments:'none',write:false});
  const output=bundled.outputFiles?.find(f=>f.path.endsWith('.js'));
  if(!output)throw new Error('esbuild did not emit the bundled application entry');
  await writeFile(entry,output.text);
  for(const name of ['styles.css','boot.js','runtime-config.js','telemetry.js']){
    const path=join(dist,name);const source=await readFile(path,'utf8');
    const result=await esbuild.transform(source,{loader:name.endsWith('.css')?'css':'js',minify:true,target:'es2022',legalComments:'none'});
    await writeFile(path,result.code);
  }
  minified=true;
}

// Fingerprint the actual deployable output, not just the human-edited version
// string. Any JS/CSS/HTML/data change creates a new immutable asset namespace.
const files=(await walk(dist)).filter(path=>!path.endsWith(`${sep}version.json`)).sort();
const hash=createHash('sha256');
for(const path of files){
  hash.update(relative(dist,path).split(sep).join('/'));
  hash.update('\0');
  hash.update(await readFile(path));
  hash.update('\0');
}
hash.update('source-version.json\0');
hash.update(await readFile(join(root,'version.json')));
hash.update('build-generator\0');
hash.update(await readFile(fileURLToPath(import.meta.url)));
const buildId=hash.digest('hex').slice(0,16);

const bootPath=join(dist,'boot.js');
const bootSource=await readFile(bootPath,'utf8');
await writeFile(bootPath,bootSource.replaceAll('__BUILD_ID__',buildId));

// Stamp direct HTML resources and every relative ES-module import. This also
// protects users without Service Worker support from stale browser HTTP caches.
let html=await readFile(join(dist,'index.html'),'utf8');
html=html.replace(/<html\b([^>]*)>/i,(_match,attrs)=>`<html${attrs} data-build-id="${buildId}">`);
html=html.replace(/(<meta\s+name="description"[^>]*>)/i,`$1\n<meta name="app-build" content="${buildId}">`);
html=html.replace(/((?:src|href)="\.\/)(boot\.js|runtime-config\.js|telemetry\.js|styles\.css|main\.js|manifest\.webmanifest)(?:\?[^\"]*)?("\s*)/g,`$1$2?v=${buildId}$3`);
await writeFile(join(dist,'index.html'),html);

const jsFiles=(await walk(dist)).filter(path=>path.endsWith('.js')&&!path.endsWith(`${sep}sw.js`));
for(const path of jsFiles){
  let source=await readFile(path,'utf8');
  source=source.replace(/((?:from|import)\s*\(?\s*["'])(\.\.?\/[^"']+\.js)(["'])/g,(_match,prefix,specifier,suffix)=>`${prefix}${specifier}?v=${buildId}${suffix}`);
  await writeFile(path,source);
}

// Versioned assets make the SW install safe even while an older SW still
// controls the page. Do not precache index.html: navigation is network-first.
const versionedPaths=[
  './styles.css', './boot.js', './manifest.webmanifest', './offline.html',
  ...jsFiles.map(path=>'./'+relative(dist,path).split(sep).join('/'))
].map(path=>`${path}?v=${buildId}`);
const uniqueVersionedPaths=[...new Set(versionedPaths)];
let sw=await readFile(join(dist,'sw.js'),'utf8');
sw=sw.replaceAll('__BUILD_ID__',buildId).replace('__VERSIONED_SHELL__',JSON.stringify(uniqueVersionedPaths));
await writeFile(join(dist,'sw.js'),sw);

const sourceVersion=JSON.parse(await readFile(join(root,'version.json'),'utf8'));
await writeFile(join(dist,'version.json'),JSON.stringify({...sourceVersion,buildId,minified},null,2)+'\n');
console.log(`public assets copied; release fingerprint ${buildId}; ${jsFiles.length} JS files versioned; minified=${minified}`);
