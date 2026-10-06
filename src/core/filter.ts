import type { GroupRef, ScheduleEvent, Stream } from './types.js';
import { cleanText, normalizeGroup, normalizeStream } from './normalize.js';
import { addDays } from './date.js';

export function eventAppliesToGroup(event:ScheduleEvent,group:GroupRef):boolean{
  if(event.program!==group.program||event.course!==group.course)return false;
  const eg=normalizeGroup(event.group),gg=normalizeGroup(group.group);
  const common=eg===''||eg==='ALL'||eg==='*'||eg==='ОБЩИЕ'||eg==='ОБЩАЯ'||eg==='ВСЕ';
  if(!common && eg!==gg)return false;
  const es:Stream=event.stream??normalizeStream(event.stream),gs:Stream=group.stream??null;
  if(es&&gs&&es!==gs)return false;
  if(common)return !es||!gs||es===gs;
  return true;
}

export function filterEvents(events:ScheduleEvent[],group:GroupRef,monday:string,search:string,type:string):ScheduleEvent[]{
  const q=cleanText(search).toLowerCase(),to=addDays(monday,6);
  return events.filter(e=>eventAppliesToGroup(e,group))
    .filter(e=>e.date>=monday&&e.date<=to)
    .filter(e=>type==='all'||e.type===type)
    .filter(e=>!q||`${e.subject} ${e.location} ${e.teacher} ${e.stream??''} ${e.weeks??''}`.toLowerCase().includes(q))
    .sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start)||a.subject.localeCompare(b.subject,'ru'));
}

export function indexByDate(events:ScheduleEvent[]):Map<string,ScheduleEvent[]>{const map=new Map<string,ScheduleEvent[]>();for(const e of events){const arr=map.get(e.date)??[];arr.push(e);map.set(e.date,arr);}return map;}
