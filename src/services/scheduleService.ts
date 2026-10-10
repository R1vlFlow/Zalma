import { LIVE_LD_JSON, PROGRAMS, sourceFor, sourcesFor } from '../data/catalog.js';
import type { Course, ProgramCode, ScheduleEvent, ScheduleIndex, ScheduleLoadResult } from '../core/types.js';
import { validateScheduleIndex, normalizeLiveEvents } from '../core/validate.js';
import { saveCache, readCache } from './cache.js';

const API_BASE='./api/schedule';
const memory=new Map<string,ScheduleLoadResult>();

export async function loadSchedule(program:ProgramCode,course:Course):Promise<ScheduleLoadResult>{
  const key=`${program}:${course}`;
  const cachedResult=memory.get(key);
  if(cachedResult&&cachedResult.status!=='error')return cachedResult;

  try{
    const api=await fetch(`${API_BASE}?program=${encodeURIComponent(program)}&course=${course}`,{cache:'no-store',signal:AbortSignal.timeout(8000)});
    if(api.ok){
      const payload=await api.json() as {events?:ScheduleEvent[];generatedAt?:string;sourceUrl?:string;sourceName?:string;status?:string;issues?:string[];message?:string};
      const status=['partial','cache','unavailable','error','live'].includes(payload.status??'') ? payload.status as ScheduleLoadResult['status'] : 'live';
      const result:ScheduleLoadResult={status,events:Array.isArray(payload.events)?payload.events:[],generatedAt:payload.generatedAt,sourceUrl:payload.sourceUrl,sourceName:payload.sourceName,issues:Array.isArray(payload.issues)?payload.issues:[],message:payload.message??'Расписание получено от сервера.'};
      memory.set(key,result);return result;
    }
  }catch{/* static/offline fallback below */}

  const staticResult=await loadStaticSnapshot(program,course);
  if(staticResult){memory.set(key,staticResult);return staticResult;}

  if(program==='31.05.01')return loadLdRemote(program,course,key);

  const source=sourcesFor(program,course).find(s=>s.status==='published')??sourcesFor(program,course)[0];
  const cached=await readSnapshot(key);
  if(cached){
    const result:ScheduleLoadResult={status:'cache',events:cached.events??[],generatedAt:cached.generatedAt,message:`Показан последний проверенный snapshot. ${source?.title??''}`,issues:[],sourceUrl:source?.url};
    memory.set(key,result);return result;
  }
  const pub=PROGRAMS.find(p=>p.code===program)?.publishedCourses.includes(course);
  const result:ScheduleLoadResult={status:'unavailable',events:[],sourceUrl:sourceFor(program,course),issues:[],message:pub?`Официальный источник опубликован, но серверный snapshot сейчас недоступен. Нажмите «Обновить» или откройте официальный источник.`:`Официальное расписание ${PROGRAMS.find(p=>p.code===program)?.title??program}, ${course} курса, сейчас не опубликовано на странице кабинета студента.`};
  memory.set(key,result);return result;
}

async function loadStaticSnapshot(program:ProgramCode,course:Course):Promise<ScheduleLoadResult|null>{
  try{
    const res=await fetch(`./data/schedules/${encodeURIComponent(program)}/${course}.json`,{cache:'no-store',signal:AbortSignal.timeout(5000)});
    if(!res.ok)return null;
    const payload=await res.json() as {events?:ScheduleEvent[];generatedAt?:string;sourceUrl?:string;sourceName?:string;status?:string;issues?:string[];message?:string};
    if(!Array.isArray(payload.events) || payload.events.length===0)return null;
    const status=(payload.status==='partial'?'partial':'live') as ScheduleLoadResult['status'];
    return {status,events:payload.events,generatedAt:payload.generatedAt,sourceUrl:payload.sourceUrl,sourceName:payload.sourceName,issues:Array.isArray(payload.issues)?payload.issues:[],message:payload.message??`Static snapshot · ${payload.events.length} событий`};
  }catch{return null;}
}

async function loadLdRemote(program:ProgramCode,course:Course,key:string):Promise<ScheduleLoadResult>{
  try{const res=await fetch(LIVE_LD_JSON,{cache:'no-store',signal:AbortSignal.timeout(8000)});if(!res.ok)throw new Error(`HTTP ${res.status}`);const payload=await res.json() as ScheduleIndex;const validation=validateScheduleIndex(payload);if(!validation.ok)throw new Error(validation.issues.filter(i=>i.level==='error').map(i=>i.message).join('; '));const events=normalizeLiveEvents(payload).filter(e=>e.program===program&&e.course===course);const result:ScheduleLoadResult={status:'live',events,generatedAt:payload.generatedAt,sourceUrl:LIVE_LD_JSON,sourceName:'official-schedules.json',issues:validation.issues.map(i=>i.message),message:`Live snapshot ${formatInstant(payload.generatedAt)} · ${events.length} событий`};await saveCache(`raw:${program}`,payload);memory.set(key,result);return result;}
  catch(error){const raw=await readCache<ScheduleIndex>(`raw:${program}`);const payload=(raw as any)?.payload??raw;if(payload){const events=normalizeLiveEvents(payload).filter(e=>e.program===program&&e.course===course);const result:ScheduleLoadResult={status:'cache',events,generatedAt:payload.generatedAt,sourceUrl:LIVE_LD_JSON,sourceName:'last verified snapshot',issues:[],message:`Сеть недоступна. Показан последний проверенный snapshot · ${events.length} событий`};memory.set(key,result);return result;}const result:ScheduleLoadResult={status:'error',events:[],sourceUrl:LIVE_LD_JSON,issues:[error instanceof Error?error.message:'Неизвестная ошибка'],message:'Не удалось загрузить источник расписания. Проверьте интернет и официальный источник.'};memory.set(key,result);return result;}
}

async function readSnapshot(key:string):Promise<{events:ScheduleEvent[];generatedAt?:string}|null>{const raw=await readCache<any>(`snapshot:${key}`);const payload=raw&&'payload'in raw?raw.payload:raw;if(payload&&Array.isArray(payload.events))return payload;return null;}
function formatInstant(value?:string){if(!value)return 'время источника неизвестно';const d=new Date(value);return Number.isNaN(d.getTime())?'время источника неизвестно':new Intl.DateTimeFormat('ru-RU',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Moscow'}).format(d);}
export { sourceFor };
export function clearScheduleMemory(){memory.clear();}
