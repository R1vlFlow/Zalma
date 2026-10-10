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
  const {normalizeLiveEvents,normalizeWeeklyBlocks}=await import(join(dist,'core','validate.js'));
  const payload=JSON.parse(await readFile(join(root,'data','official-schedules.json'),'utf8'));
  const curatedKug=JSON.parse(await readFile(join(root,'data','kug.json'),'utf8'));
  const kugManifest=JSON.parse(await readFile(join(root,'data','kug-source-manifest.json'),'utf8').catch(()=>'{"sources":[]}'));
  const officialSources=Array.isArray(kugManifest.sources)?kugManifest.sources:[];
  const ldSources=Array.isArray(payload.kugSources)?payload.kugSources:[];
  const periods=[];
  for(const [program,courses] of Object.entries(curatedKug)){
    if(!courses||typeof courses!=='object') continue;
    for(const [course,items] of Object.entries(courses)){
      if(!Array.isArray(items)) continue;
      const source=officialSources.find(x=>String(x.program)===String(program)&&String(x.course)===String(course))||
        (program==='31.05.01'?(ldSources.find(x=>String(x.course)===String(course))||null):null);
      for(const item of items){
        if(!item||typeof item.from!=='string'||typeof item.to!=='string'||item.from>item.to) continue;
        periods.push({program,course,kind:String(item.kind||'study'),label:String(item.label||'Учебный период'),start:item.from,end:item.to,sourceUrl:item.sourceUrl||source?.url||null,sourceSha256:source?.sha256||null});
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
    const source=officialSources.find(x=>String(x.program)===String(program)&&String(x.course)===String(course))||
      (program==='31.05.01'?(ldSources.find(x=>String(x.course)===String(course))||null):null);
    sources.push({program,course,title:source?.title||`КУГ · ${program} · ${course} курс`,url:source?.url||'https://education.almazovcentre.ru/about_institute/programm/specialist_programme/student/',periods:periodCount,status:source?.status||'verified-bootstrap',sha256:source?.sha256||null,checkedAt:source?.checkedAt||null,academicYearInDocument:source?.academicYearInDocument||null});
  }
  const kugIsLiveVerified=kugManifest.status==='live-verified';
  const kugPayload={schemaVersion:2,generatedAt:kugIsLiveVerified?(kugManifest.generatedAt??null):null,academicYear:kugManifest.academicYear??null,sourceManifestStatus:kugManifest.status??'not-live-verified',sources,periods};
  await mkdir(join(dist,'data'),{recursive:true});
  await writeFile(join(dist,'data','kug.json'),JSON.stringify(kugPayload));
  const events=normalizeLiveEvents(payload);
  for(let course=1;course<=6;course++){
    const courseEvents=events.filter(e=>e.program==='31.05.01'&&e.course===course);
    const weeklyBlocks=normalizeWeeklyBlocks(payload,'31.05.01',course);
    const dir=join(dist,'data','schedules','31.05.01');
    await mkdir(dir,{recursive:true});
    const liveGenerated=payload.dataState==='live-generated';
    const snapshotStatus=liveGenerated?'live':payload.dataState==='local-recovery-snapshot'?'partial':'cache';
    const issues=liveGenerated?[]:['LOCAL_RECOVERY_SNAPSHOT','SCHEDULE_SOURCE_COVERAGE_INCOMPLETE'];
    const message=liveGenerated
      ? `Официальный snapshot · ${courseEvents.length} событий`
      : `Частичный локальный snapshot · ${courseEvents.length} подтверждённых событий. Данные требуют синхронизации с официальным источником.`;
    await writeFile(join(dir,`${course}.json`),JSON.stringify({version:1,generatedAt:payload.generatedAt,program:'31.05.01',course,status:snapshotStatus,events:courseEvents,weeklyBlocks,issues,message,sourceUrl:payload.sourcePage,sourceName:'official-schedules.json'}));
  }
}catch(error){
  console.warn(`static schedule snapshot generation skipped: ${error instanceof Error?error.message:String(error)}`);
}

// Publish specialty snapshots generated from the official student page. This
// file is source data (not a UI fixture) and contributes to the build fingerprint.
try{
  const specialistPath=join(root,'data','program-schedules.json');
  const specialist=JSON.parse(await readFile(specialistPath,'utf8'));
  if(specialist?.schemaVersion!==1||!specialist?.programs||typeof specialist.programs!=='object')
    throw new Error('Invalid data/program-schedules.json schemaVersion/programs');
  await writeFile(join(dist,'data','program-schedules.json'),JSON.stringify(specialist));
  for(const [program,programData] of Object.entries(specialist.programs)){
    for(const [courseKey,courseData] of Object.entries(programData?.courses??{})){
      const course=Number(courseKey);
      if(!Number.isInteger(course)||course<1||course>6||!Array.isArray(courseData?.events))continue;
      const target=join(dist,'data','schedules',program,`${course}.json`);
      await mkdir(join(dist,'data','schedules',program),{recursive:true});
      const events=courseData.events;
      const recoveryOnly=specialist.dataState!=='live-generated';
      const fallbackMessage=recoveryOnly
        ? (events.length?`Восстановительный локальный снимок · ${events.length} событий. Исходные PDF не проверены по SHA-256; не считать актуальным расписанием.`:'Официальный источник для этого курса пока не дал опубликованных данных.')
        : (events.length?`Официальный снимок · ${events.length} событий`:'Официальный источник пока не опубликовал расписание.');
      await writeFile(target,JSON.stringify({version:1,generatedAt:courseData.generatedAt??specialist.generatedAt??null,
        program,course,status:recoveryOnly?(events.length?'partial':'unpublished'):(courseData.status??(events.length?'live':'unpublished')),events,
        issues:[...(Array.isArray(courseData.issues)?courseData.issues:[]),...(recoveryOnly?['LOCAL_RECOVERY_SNAPSHOT','SOURCE_BYTES_AND_SHA256_NOT_VERIFIED','NOT_FOR_PRODUCTION']:[])],
        message:recoveryOnly?fallbackMessage:(courseData.message??fallbackMessage),
        sourceUrl:courseData.sourceUrl??specialist.sourcePage,sourceName:courseData.sourceName??programData.title}));
    }
  }
  console.log(`specialist snapshots bundled from official ingestion · ${Object.keys(specialist.programs).length} programs`);
}catch(error){
  // Local dev can build before the first official specialist sync. Release CI
  // runs the producer first and sets REQUIRE_SPECIALIST_SNAPSHOT=1.
  if(process.env.REQUIRE_SPECIALIST_SNAPSHOT==='1')throw new Error(`Specialist schedule snapshot required: ${error instanceof Error?error.message:String(error)}`);
  console.warn(`specialist snapshot generation skipped: ${error instanceof Error?error.message:String(error)}`);
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
