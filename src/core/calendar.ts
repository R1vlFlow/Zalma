import type {LessonType,ScheduleEvent,EventStatus} from './types.js';
import {localDate,localTime,localDateTimeInput} from './time.js';

export type CalendarEventKind='schedule'|'personal';
export type {EventStatus};
export interface CalendarEvent{
  id:string;kind:CalendarEventKind;title:string;subject?:string;description?:string;category?:string;status?:EventStatus;startAt:string;endAt:string;timeZone:string;allDay?:boolean;location?:string;meetingUrl?:string;attendees?:string[];recurrence?:RecurrenceRule|null;seriesId?:string;readOnly:boolean;privacy?:'public'|'private';
  program?:ScheduleEvent['program'];course?:ScheduleEvent['course'];group?:string;stream?:ScheduleEvent['stream'];type?:LessonType;teacher?:string;half?:ScheduleEvent['half'];doublePart?:ScheduleEvent['doublePart'];weeks?:string;
}
export interface RecurrenceRule{frequency:'daily'|'weekly'|'monthly'|'yearly';interval:number;weekdays?:number[];until?:string|null;}
function localToUtc(localValue:string,zone:string):string{
  const m=localValue.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if(!m)throw new Error('Некорректная локальная дата и время');
  const year=Number(m[1]??0),month=Number(m[2]??0),day=Number(m[3]??0),hour=Number(m[4]??0),minute=Number(m[5]??0),second=Number(m[6]??0);
  const naive=Date.UTC(year,month-1,day,hour,minute,second);
  const offset=(utc:number)=>{
    const ps=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(utc));
    const g=(t:string)=>Number(ps.find(p=>p.type===t)?.value??0);
    return Date.UTC(g('year'),g('month')-1,g('day'),g('hour'),g('minute'),g('second'))-utc;
  };
  let guess=naive; for(let i=0;i<4;i++)guess=naive-offset(guess); return new Date(guess).toISOString();
}
export function scheduleToCalendarEvent(e:ScheduleEvent,_displayTimeZone:string):CalendarEvent{const startAt=localToUtc(`${e.date}T${e.start}`,'Europe/Moscow');const endAt=localToUtc(`${e.date}T${e.end}`,'Europe/Moscow');return{id:e.id,kind:'schedule',title:e.subject,description:'',category:e.type,status:'planned',startAt,endAt,timeZone:'Europe/Moscow',allDay:false,location:e.location,program:e.program,course:e.course,group:e.group,stream:e.stream,type:e.type,teacher:e.teacher,half:e.half,doublePart:e.doublePart,weeks:e.weeks,readOnly:true};}
export function decorateEvent(e:CalendarEvent,timeZone:string){return{event:e,date:localDate(e.startAt,timeZone),start:localTime(e.startAt,timeZone),end:localTime(e.endAt,timeZone),startInput:localDateTimeInput(e.startAt,timeZone),endInput:localDateTimeInput(e.endAt,timeZone)};}
export function eventDates(e:CalendarEvent,timeZone:string):string[]{const first=localDate(e.startAt,timeZone),last=localDate(e.endAt,timeZone),out:string[]=[];let cursor=first;while(cursor<=last&&out.length<370){out.push(cursor);const d=new Date(`${cursor}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+1);cursor=d.toISOString().slice(0,10);}return out;}
