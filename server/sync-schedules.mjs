import {mkdir,writeFile,rename,access} from "node:fs/promises";
import {join} from "node:path";
import {loadSchedule,sourcesFor} from "./pipeline.mjs";

const programs=["31.05.01","31.05.02","37.05.01"];
const root=join(process.cwd(),"public","data","schedules");
await mkdir(root,{recursive:true});
const report=[];
for(const program of programs){
  for(let course=1;course<=6;course++){
    const result=await loadSchedule(program,course,{forceRefresh:true});
    const payload={version:1,generatedAt:result.generatedAt??new Date().toISOString(),program,course,status:result.status,events:result.events??[],issues:result.issues??[],message:result.message,sourceUrl:result.sourceUrl,sourceName:result.sourceName};
    const dir=join(root,program);
    await mkdir(dir,{recursive:true});
    const file=join(dir,`${course}.json`);
    if((result.events??[]).length>0){const tmp=`${file}.tmp`;await writeFile(tmp,JSON.stringify(payload));await rename(tmp,file);} else {try{await access(file);}catch{const tmp=`${file}.tmp`;await writeFile(tmp,JSON.stringify(payload));await rename(tmp,file);}}
    const expected=sourcesFor(program,course).some(s=>['published','verified'].includes(s.status));report.push({program,course,status:result.status,events:result.events.length,issues:result.issues.length,expected});
  }
}
await writeFile(join(root,"index.json"),JSON.stringify({version:1,generatedAt:new Date().toISOString(),items:report}));
const failures=report.filter(x=>x.expected&&x.events===0);
process.stdout.write(JSON.stringify({ok:failures.length===0,items:report,failures},null,2)+"\n");
if(failures.length)process.exitCode=1;
