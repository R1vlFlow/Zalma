import { writeFile, readFile, mkdir } from 'node:fs/promises';
const URL='https://raw.githubusercontent.com/R1vlFlow/Zalma/main/data/official-schedules.json';
const out=new URL('../public/data/official-schedules.json',import.meta.url).pathname;
const validateOnly=process.argv.includes('--validate-only');
const res=await fetch(URL,{cache:'no-store'}); if(!res.ok) throw new Error(`HTTP ${res.status}`);
const data=await res.json();
if(typeof data?.schemaVersion!=='number'||typeof data?.generatedAt!=='string'||!data?.courses) throw new Error('Invalid official JSON schema');
const courseCount=Object.keys(data.courses).length; if(courseCount<1) throw new Error('No courses');
if(!validateOnly){await mkdir(new URL('../public/data/',import.meta.url).pathname,{recursive:true});await writeFile(out,JSON.stringify(data));}
console.log(JSON.stringify({ok:true,generatedAt:data.generatedAt,courses:courseCount,events:Object.values(data.courses).reduce((n,c)=>n+(Array.isArray(c.events)?c.events.length:0),0),written:!validateOnly},null,2));
