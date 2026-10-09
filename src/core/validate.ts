import type { ScheduleEvent, ScheduleIndex, ProgramCode, Course } from './types.js';
import { cleanLocation, cleanSubject, cleanTeacher, isoDate, normalizeCourse, normalizeGroup, normalizeHalf, normalizeStream, normalizeTime, normalizeTimeRange, normalizeType } from './normalize.js';

export interface ValidationIssue{level:'error'|'warning';index:number;message:string;field?:string;}

const VALID_PROGRAMS=new Set<ProgramCode>(['31.05.01','31.05.02','37.05.01']);
export function validateScheduleIndex(payload:unknown):{ok:boolean;issues:ValidationIssue[]}{
  const issues:ValidationIssue[]=[];
  if(!payload||typeof payload!=='object'){return{ok:false,issues:[{level:'error',index:-1,message:'Ответ источника не является объектом'}]};}
  const p=payload as Partial<ScheduleIndex>;
  if(typeof p.schemaVersion!=='number')issues.push({level:'error',index:-1,message:'Нет schemaVersion'});
  if(typeof p.generatedAt!=='string')issues.push({level:'error',index:-1,message:'Нет generatedAt'});
  if(!p.courses||typeof p.courses!=='object')issues.push({level:'error',index:-1,message:'Нет courses'});
  if(p.specialty&&!VALID_PROGRAMS.has(p.specialty))issues.push({level:'error',index:-1,message:`Неподдерживаемое направление: ${p.specialty}`});
  for(const [key,courseData] of Object.entries((p.courses??{}) as Record<string,any>)){
    if(!normalizeCourse(key))issues.push({level:'warning',index:-1,message:`Пропущен некорректный курс ${key}`});
    if(courseData&&!VALID_PROGRAMS.has(courseData.specialty))issues.push({level:'warning',index:-1,message:`Курс ${key}: некорректная specialty`});
  }
  return{ok:!issues.some(i=>i.level==='error'),issues};
}

function addIsoDays(date:string,days:number):string|null{if(!isoDate(date))return null;const d=new Date(`${date}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}

function splitDoubleTimes(start:string,end:string):Array<{start:string;end:string;double:boolean;doublePart?:1|2;durationMinutes:number;doubleOf?:string}>{
  const [shs,sms]=start.split(':');const [ehs,ems]=end.split(':');const sh=Number(shs??0),sm=Number(sms??0),eh=Number(ehs??0),em=Number(ems??0);const a=sh*60+sm,b=eh*60+em,d=b-a;
  if(![185,205].includes(d))return [{start,end,double:false,durationMinutes:d}];
  const slot=(d-15)/2;const firstEnd=a+slot;const secondStart=firstEnd+15;const fmt=(v:number)=>`${String(Math.floor(v/60)).padStart(2,'0')}:${String(v%60).padStart(2,'0')}`;
  return [{start:fmt(a),end:fmt(firstEnd),double:true,doublePart:1,durationMinutes:slot},{start:fmt(secondStart),end:fmt(b),double:true,doublePart:2,durationMinutes:slot}];
}

export function normalizeLiveEvents(payload:unknown):ScheduleEvent[]{
  const result:ScheduleEvent[]=[];const p=payload as any;
  for(const [courseKey,courseData] of Object.entries<any>(p?.courses??{})){
    const course=normalizeCourse(courseKey);if(!course)continue;
    const rawEvents=Array.isArray(courseData?.events)?courseData.events:[];
    for(const [index,raw] of rawEvents.entries()){
      const directDate=isoDate(raw?.date??raw?.dateHint??raw?.weekDate);
      const matrixSlots=Array.isArray(raw?.matrixSlots)?raw.matrixSlots.map((v:unknown)=>Number(v)).filter((n:number)=>Number.isInteger(n)&&n>=0&&n<=6):[];
      const weekStart=isoDate(raw?.weekStart);
      const blockDates:string[]=directDate?[directDate]:(raw?.scheduleMode==='weekly-block'&&weekStart&&matrixSlots.length?matrixSlots.map((slot:number)=>addIsoDays(weekStart,slot)).filter(Boolean) as string[]:[]);
      const time=normalizeTimeRange(`${raw?.start??''} ${raw?.end??''}`) ?? normalizeTimeRange(raw?.time);
      const subject=cleanSubject(raw?.subject??raw?.discipline??raw?.name);
      const stream=normalizeStream(raw?.stream);
      const groupValues=Array.isArray(raw?.groups)?raw.groups:(raw?.group!=null?[raw.group]:[]);
      const groups=groupValues.map(normalizeGroup).filter(Boolean);
      const safeGroups=groups.length?groups:[(stream?'ALL':'')];
      const program=raw?.program??courseData?.specialty??p?.specialty;
      if(!blockDates.length||!time||!subject||!VALID_PROGRAMS.has(program))continue;
      const doubleSlots=raw?.doubleIndex===1||raw?.doubleIndex===2? [ {start:time.start,end:time.end,double:true,doublePart:raw.doubleIndex,durationMinutes:Number(raw?.durationMinutes??0)||undefined,doubleOf:raw?.doubleOf} ] : splitDoubleTimes(time.start,time.end).map(x=>({...x,doubleOf:raw?.doubleOf}));
      for(const date of blockDates)for(const group of safeGroups){
        if(!group)continue;
        for(const slot of doubleSlots){
          result.push({id:String(raw?.id?`${raw.id}-${date}-${slot.doublePart??0}`:`${program}-${course}-${group}-${date}-${slot.start}-${slot.end}-${subject}-${index}-${slot.doublePart??0}`),program,course:course as Course,group,stream,date,start:slot.start,end:slot.end,subject,location:cleanLocation(raw?.location),teacher:cleanTeacher(raw?.teacher),type:normalizeType(raw?.type,subject),half:normalizeHalf(raw?.half),double:slot.double,doublePart:slot.doublePart,doubleOf:slot.doubleOf,durationMinutes:slot.durationMinutes,weeks:raw?.weekNumber?`нед. ${Array.isArray(raw.weekNumber)?raw.weekNumber.join(', '):String(raw.weekNumber)}`:undefined,sourceUrl:raw?.sourceUrl,sourceTitle:raw?.sourceTitle,sourceKind:'live-json',confidence:1});
        }
      }
    }
  }
  return dedupe(result);
}
export function dedupe(events:ScheduleEvent[]):ScheduleEvent[]{
  const map=new Map<string,ScheduleEvent>();
  for(const e of events){const key=[e.program,e.course,normalizeGroup(e.group),e.stream??'',e.date,e.start,e.end,cleanSubject(e.subject).toLowerCase(),cleanLocation(e.location).toLowerCase(),cleanTeacher(e.teacher).toLowerCase(),e.type,e.half??''].join('|');if(!map.has(key)){map.set(key,e);continue;}const prev=map.get(key)!;if((e.confidence??0)>(prev.confidence??0))map.set(key,e);}
  return [...map.values()];
}

export function validateEvents(events:ScheduleEvent[]):ValidationIssue[]{
  const issues:ValidationIssue[]=[];const seen=new Set<string>();
  events.forEach((e,index)=>{
    if(!VALID_PROGRAMS.has(e.program))issues.push({level:'error',index,message:'Неизвестная программа'});
    if(!isoDate(e.date))issues.push({level:'error',index,message:`Некорректная дата ${e.date}`,field:'date'});
    if(!normalizeTime(e.start)||!normalizeTime(e.end))issues.push({level:'error',index,message:'Некорректное время',field:'time'});
    if(!e.subject)issues.push({level:'error',index,message:'Пустая дисциплина',field:'subject'});
    const key=[e.program,e.course,normalizeGroup(e.group),e.stream??'',e.date,e.start,e.end,e.subject.toLowerCase(),e.type,e.half??''].join('|');
    if(seen.has(key))issues.push({level:'warning',index,message:'Дубликат события'});seen.add(key);
  });
  return issues;
}
