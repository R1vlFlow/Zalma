import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {SOURCES,STUDENT_PAGE,LIVE_LD_JSON,programNames} from './source-registry.mjs';
import {normalizeGroup,normalizeGroupList,cleanSubject,cleanLocation,cleanTeacher,normalizeStream,normalizeHalf,isoDate,timeRange,typeFrom} from './normalize.mjs';
import {parseSourceBuffer} from './source-parser.mjs';
import {RedisScheduleCache} from './redis-cache.mjs';

const STORAGE=join(process.cwd(),'storage','snapshots');const PIPELINE_VERSION='2026-10-10-schedule-normalization-v6-multifaculty-content-verified-merge';const memory=new Map();
let redisPromise;
async function redisCache(){if(!process.env.REDIS_URL)return null;if(!redisPromise){redisPromise=(async()=>{try{const {createClient}=await import('redis');const client=createClient({url:process.env.REDIS_URL});client.on('error',()=>{});await client.connect();return new RedisScheduleCache(client);}catch{return null;}})();}return redisPromise;}

export function sourcesFor(program,course){return SOURCES.filter(s=>s.program===program&&s.course===course);}
export function available(program,course){const sources=sourcesFor(program,course);return {published:sources.filter(s=>['published','verified'].includes(s.status)),quarantined:sources.filter(s=>s.status==='quarantined')};}
export async function loadSchedule(program,course,{forceRefresh=false}={}){const key=`${program}:${course}`;
 // Generated multi-faculty snapshots are authoritative for Pediatrics/Clinical
 // Psychology. Check them before any memory/Redis/disk snapshot so the previous
 // course payload cannot outlive an official data deployment.
 if(program!=='31.05.01'){
   const generated=await loadGeneratedSpecialistSnapshot(program,course);
   if(generated){memory.set(key,{cachedAt:Date.now(),result:generated});return generated;}
 }
 const mem=memory.get(key);if(!forceRefresh&&mem&&Date.now()-mem.cachedAt<10*60*1000)return mem.result;const external=await redisCache();if(!forceRefresh&&external){const cached=await external.get(key);if(cached?.pipelineVersion===PIPELINE_VERSION&&cached?.result&&Array.isArray(cached.result.events)){memory.set(key,{cachedAt:Date.now(),result:cached.result});return cached.result;}}const disk=await readSnapshot(key);if(!forceRefresh&&disk&&Date.now()-disk.cachedAt<6*60*60*1000){memory.set(key,{cachedAt:Date.now(),result:disk.result});return disk.result;}
 if(program==='31.05.01'){try{const result=await loadLiveLd(program,course);await saveSnapshot(key,result);return result;}catch(err){const local=await loadLocalLd(program,course);if(local){await saveSnapshot(key,local);return {...local,status:'cache',message:`Live источник недоступен. Показан локальный официальный snapshot: ${err.message}`};}if(disk?.result?.events?.length)return {...disk.result,status:'cache',message:`Live источник и локальный snapshot недоступны. Показан последний snapshot: ${err.message}`};return {status:'error',events:[],issues:[String(err.message)],message:'Live источник недоступен и локальный официальный snapshot отсутствует.'};}}
 const {published,quarantined}=available(program,course);if(!published.length){return{status:'unavailable',events:[],issues:['NO_PUBLISHED_SOURCE'],message:`Официальное расписание ${programNames[program]}, ${course} курса, сейчас не опубликовано на странице кабинета студента.`,sourceUrl:STUDENT_PAGE};}
 const events=[];const issues=[];for(const source of published){try{const r=await fetchSource(source);const safe=r.events.filter(e=>e.program===program&&e.course===course);events.push(...safe);issues.push(...(r.warnings??[]));}catch(err){issues.push(`${source.title}: ${err.message}`);}}
 const unique=dedupe(events);const hasQuarantine=quarantined.length>0;const status=unique.length&&issues.length?'partial':unique.length&&hasQuarantine?'partial':unique.length?'live':'error';const result={status,events:unique,issues,sourceUrl:published[0]?.url??quarantined[0]?.url??STUDENT_PAGE,sourceName:published.map(s=>s.title).join(' · '),message:unique.length?`${unique.length} событий. Источников: ${published.length}.${hasQuarantine?' Часть официальных источников проходит карантин и не публикуется.':''}`:`Не удалось получить подтверждённые события. ${issues.join(' ')}`};if(unique.length)await saveSnapshot(key,result);return result;}
async function loadGeneratedSpecialistSnapshot(program,course){
 try{
  const file=join(process.cwd(),'data','program-schedules.json');
  const payload=JSON.parse(await readFile(file,'utf8'));
  if(payload?.schemaVersion!==1||!payload?.programs||typeof payload.programs!=='object')return null;
  const p=payload.programs[program];const entry=p?.courses?.[String(course)];
  if(!entry||!Array.isArray(entry.events)||entry.events.length===0)return null;
  const generatedAt=entry.generatedAt??payload.generatedAt;
  const time=generatedAt?Date.parse(generatedAt):NaN;
  const sourceName=entry.sourceName??p.title??'Official specialist snapshot';
  const stale=Number.isFinite(time)&&Date.now()-time>7*24*60*60*1000;
  const events=entry.events.filter(e=>e&&e.program===program&&Number(e.course)===Number(course)&&e.subject&&e.start&&e.end&&e.date);
  if(!events.length)return {status:'unavailable',events:[],generatedAt,sourceUrl:entry.sourceUrl??payload.sourcePage,sourceName,issues:Array.isArray(entry.issues)?entry.issues:['NO_VALID_SPECIALIST_EVENTS'],message:entry.status==='unpublished'?`Официальный источник ${sourceName} пока не публикует расписание для ${course} курса.`:`Snapshot ${sourceName} не содержит валидных событий.`};
  const issues=Array.isArray(entry.issues)?[...entry.issues]:[];
  if(stale)issues.push('SPECIALIST_SNAPSHOT_STALE');
  const status=stale?'cache':['partial','cache'].includes(entry.status)?entry.status:'live';
  return {status,events,generatedAt,sourceUrl:entry.sourceUrl??payload.sourcePage,sourceName,issues,message:`${stale?'Последний проверенный snapshot (устарел более чем на 7 дней)':'Official'} ${sourceName} · ${events.length} событий · ${generatedAt??'дата генерации неизвестна'}`};
 }catch{return null;}
}

function datesForRaw(raw){
  const direct=isoDate(raw?.date??raw?.dateHint??'');
  if(direct)return [direct];
  if(raw?.scheduleMode!=='weekly-block')return [];
  const start=isoDate(raw?.weekStart);const slots=Array.isArray(raw?.matrixSlots)?raw.matrixSlots.map(Number).filter(n=>Number.isInteger(n)&&n>=0&&n<=6):[];
  if(!start||!slots.length)return [];
  const base=new Date(`${start}T00:00:00Z`);return slots.map(slot=>{const d=new Date(base);d.setUTCDate(d.getUTCDate()+slot);return d.toISOString().slice(0,10);});
}
export function splitDoubleTimes(start,end){
  const [sh,sm]=start.split(':').map(Number);const [eh,em]=end.split(':').map(Number);const a=sh*60+sm,b=eh*60+em,d=b-a;
  if(![185,205].includes(d))return [{start,end,double:false,durationMinutes:d}];
  const slot=(d-15)/2;const firstEnd=a+slot;const secondStart=firstEnd+15;const fmt=(v)=>`${String(Math.floor(v/60)).padStart(2,'0')}:${String(v%60).padStart(2,'0')}`;
  return [{start:fmt(a),end:fmt(firstEnd),double:true,doublePart:1,durationMinutes:slot},{start:fmt(secondStart),end:fmt(b),double:true,doublePart:2,durationMinutes:slot}];
}
export function normalizeOfficialCoursePayload(payload,program,course,sourceUrl,sourceTitle='official-schedules.json'){
  const events=[];const courseData=payload?.courses?.[String(course)];
  for(const [index,raw] of (Array.isArray(courseData?.events)?courseData.events:[]).entries()){
    const dates=datesForRaw(raw);const tr=timeRange(`${raw?.start??''} ${raw?.end??''}`)||timeRange(raw?.time);const subject=cleanSubject(raw?.subject??raw?.discipline??raw?.name);if(!dates.length||!tr||!subject)continue;
    const groups=normalizeGroupList(raw?.groups??raw?.group);const stream=normalizeStream(raw?.stream);if(!groups.length&&!stream)continue;const visibleGroups=groups.length?groups:['_ALL_'];
    const alreadyDouble=raw?.doubleIndex===1||raw?.doubleIndex===2;
    const durationMinutes=Number(tr.end.slice(0,2))*60+Number(tr.end.slice(3))-Number(tr.start.slice(0,2))*60-Number(tr.start.slice(3));
    if(durationMinutes<=0) console.warn(`[schedule-parser] invalid duration ${program}/${course} ${raw?.date??raw?.weekStart??'?'} ${subject}: ${tr.start}-${tr.end}`);
    if(durationMinutes>=175&&![185,205].includes(durationMinutes)&&!alreadyDouble) console.warn(`[schedule-parser] unclassified long block kept intact ${program}/${course} ${raw?.date??raw?.weekStart??'?'} ${raw?.group??raw?.groups??'?'} ${subject}: ${tr.start}-${tr.end} (${durationMinutes} min)`);
    const rawDuration=Number(tr.end.slice(0,2))*60+Number(tr.end.slice(3))-Number(tr.start.slice(0,2))*60-Number(tr.start.slice(3));
    const doubleSlots=alreadyDouble
      ? [{start:tr.start,end:tr.end,double:true,doublePart:raw.doubleIndex,durationMinutes:Number(raw?.durationMinutes??0)||rawDuration,doubleOf:typeof raw?.doubleOf==='string'?raw.doubleOf:undefined}]
      : raw?.orgMerged===true||raw?.mergedConsecutive===true
        ? [{start:tr.start,end:tr.end,double:true,durationMinutes:Number(raw?.durationMinutes??0)||rawDuration,doubleOf:typeof raw?.doubleOf==='string'?raw.doubleOf:undefined}]
        : splitDoubleTimes(tr.start,tr.end).map(x=>({...x,doubleOf:typeof raw?.doubleOf==='string'?raw.doubleOf:(x.doublePart?`auto:${program}:${course}:${raw?.weekStart??''}:${subject}:${tr.start}-${tr.end}`:undefined)}));
    for(const date of dates)for(const groupValue of visibleGroups){const group=groupValue==='_ALL_'?'ALL':normalizeGroup(groupValue);for(const slot of doubleSlots){events.push({id:String(raw?.id?`${raw.id}-${date}-${slot.doublePart??0}`:`${program}-${course}-${group}-${date}-${slot.start}-${slot.end}-${subject}-${index}-${slot.doublePart??0}`),program,course,group,stream,date,start:slot.start,end:slot.end,subject,location:cleanLocation(raw?.location),teacher:cleanTeacher(raw?.teacher),type:typeFrom(raw?.type,subject),half:normalizeHalf(raw?.half),double:slot.double,orgMerged:raw?.orgMerged===true||undefined,mergedConsecutive:raw?.mergedConsecutive===true||undefined,doublePart:slot.doublePart,doubleOf:slot.doubleOf,durationMinutes:slot.durationMinutes,weeks:raw?.weekNumber?`нед. ${Array.isArray(raw.weekNumber)?raw.weekNumber.join(', '):String(raw.weekNumber)}`:undefined,sourceUrl,sourceTitle,sourceKind:'live-json',confidence:1});}}
  }
  return mergeAutoSplitDoubleSlots(dedupe(events));
}
function mergeAutoSplitDoubleSlots(events){
  const mins=v=>Number(v.slice(0,2))*60+Number(v.slice(3));
  const identity=e=>[e.program,e.course,e.group,e.stream??'',e.date,String(e.subject??'').toLocaleLowerCase('ru-RU'),String(e.location??'').toLocaleLowerCase('ru-RU'),String(e.teacher??'').toLocaleLowerCase('ru-RU'),e.type,e.half??'',e.doubleOf??''].join('|');
  const ordered=[...events].sort((a,b)=>identity(a).localeCompare(identity(b))||a.start.localeCompare(b.start));const out=[];
  for(let i=0;i<ordered.length;){const first=ordered[i],second=ordered[i+1];if(second&&typeof first.doubleOf==='string'&&first.doubleOf.startsWith('auto:')&&first.doubleOf===second.doubleOf&&first.doublePart===1&&second.doublePart===2&&identity(first)===identity(second)){const gap=mins(second.start)-mins(first.end);if(gap>=0&&gap<=20&&mins(second.end)>mins(first.start)){const merged={...first,end:second.end,double:true,mergedConsecutive:true,durationMinutes:mins(second.end)-mins(first.start),doublePart:undefined,id:first.id.replace(/-1$/,'')};if(/\bОРГ\b|основы\s+российской\s+государственности/i.test(first.subject)){merged.orgMerged=true;delete merged.mergedConsecutive;}out.push(merged);i+=2;continue;}}out.push(first);i++;}return out;
}
async function loadLiveLd(program,course){const res=await fetch(LIVE_LD_JSON,{cache:'no-store',signal:AbortSignal.timeout(Number(process.env.SCHEDULE_FETCH_TIMEOUT_MS??30000))});if(!res.ok)throw new Error(`HTTP ${res.status}`);const payload=await res.json();if(typeof payload?.schemaVersion!=='number'||!payload?.courses)throw new Error('Invalid official JSON schema');const events=normalizeOfficialCoursePayload(payload,program,course,LIVE_LD_JSON);return{status:'live',events,generatedAt:payload.generatedAt,sourceUrl:LIVE_LD_JSON,sourceName:'official-schedules.json',issues:[],message:`Live snapshot ${payload.generatedAt??''} · ${events.length} событий`};}
async function loadLocalLd(program,course){try{const payload=JSON.parse(await readFile(join(process.cwd(),'data','official-schedules.json'),'utf8'));if(typeof payload?.schemaVersion!=='number'||!payload?.courses)throw new Error('Invalid local official JSON schema');const events=normalizeOfficialCoursePayload(payload,program,course,'file://local/data/official-schedules.json','local official-schedules.json');if(!events.length)throw new Error('Локальный официальный snapshot не содержит событий');return{status:'cache',events,generatedAt:payload.generatedAt,sourceUrl:LIVE_LD_JSON,sourceName:'local official-schedules.json',issues:[],message:`Локальный официальный snapshot ${payload.generatedAt??''} · ${events.length} событий`};}catch{return null;}}
async function fetchSource(source){const res=await fetch(source.url,{redirect:'follow',signal:AbortSignal.timeout(30000),headers:{accept:'application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/html;q=0.9,*/*;q=0.1'}});if(!res.ok)throw new Error(`HTTP ${res.status}`);const declared=source.kind==='official-pdf'?'pdf':source.kind==='official-xlsx'?'xlsx':'html';const buffer=Buffer.from(await res.arrayBuffer());return parseSourceBuffer(buffer,{program:source.program,course:source.course,source},declared);}
export function dedupe(events){const map=new Map();for(const e of events){const key=[e.program,e.course,e.group,e.stream??'',e.date,e.start,e.end,e.subject.toLowerCase(),e.location.toLowerCase(),e.type,e.half??''].join('|');const p=map.get(key);if(!p||(e.confidence??0)>(p.confidence??0))map.set(key,e);}return[...map.values()];}
async function readSnapshot(key){try{const payload=JSON.parse(await readFile(join(STORAGE,`${key.replace(/[^a-z0-9:.\-]/gi,'_')}.json`),'utf8'));return payload?.pipelineVersion===PIPELINE_VERSION?payload:null;}catch{return null;}}
async function saveSnapshot(key,result){await mkdir(STORAGE,{recursive:true});const file=join(STORAGE,`${key.replace(/[^a-z0-9:.\-]/gi,'_')}.json`);const tmp=`${file}.tmp`;const payload={pipelineVersion:PIPELINE_VERSION,cachedAt:Date.now(),result};await writeFile(tmp,JSON.stringify(payload));await rename(tmp,file);memory.set(key,{cachedAt:Date.now(),result});const external=await redisCache();if(external)await external.set(key,{pipelineVersion:PIPELINE_VERSION,result},6*60*60*1000);}
