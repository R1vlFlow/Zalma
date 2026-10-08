import { cp, copyFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
const root=new URL('..',import.meta.url).pathname;const dist=join(root,'dist');
await mkdir(join(dist,'assets'),{recursive:true});
for(const name of ['index.html','styles.css','sw.js','boot.js','manifest.webmanifest','offline.html']) await copyFile(join(root,'public',name),join(dist,name));
await cp(join(root,'public','assets'),join(dist,'assets'),{recursive:true});
await mkdir(join(dist,'data'),{recursive:true});
await cp(join(root,'public','data'),join(dist,'data'),{recursive:true});
try{
  const {readFile,writeFile,mkdir}=await import('node:fs/promises');
  const {normalizeLiveEvents}=await import(join(dist,'core','validate.js'));
  const payload=JSON.parse(await readFile(join(root,'data','official-schedules.json'),'utf8'));
  const events=normalizeLiveEvents(payload);
  for(let course=1;course<=6;course++){
    const courseEvents=events.filter(e=>e.program==='31.05.01'&&e.course===course);
    const dir=join(dist,'data','schedules','31.05.01');
    await mkdir(dir,{recursive:true});
    await writeFile(join(dir,`${course}.json`),JSON.stringify({version:1,generatedAt:payload.generatedAt,program:'31.05.01',course,status:'live',events:courseEvents,issues:[],message:`Bundled official snapshot · ${courseEvents.length} событий`,sourceUrl:payload.sourcePage,sourceName:'official-schedules.json'}));
  }
}catch(error){console.warn(`static schedule snapshot generation skipped: ${error instanceof Error?error.message:String(error)}`);}
console.log('public assets and static schedule snapshots copied');
