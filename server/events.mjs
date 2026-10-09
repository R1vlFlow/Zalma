import {randomUUID} from 'node:crypto';
import {database} from './db.mjs';

const FREQUENCIES=new Set(['daily','weekly','monthly','yearly']);
const STATUSES=new Set(['planned','confirmed','in_progress','completed','cancelled']);
const PRIVACY=new Set(['public','private']);

function requireUser(userId){if(!userId||typeof userId!=='string'||userId.length<10||userId.length>128)throw Object.assign(new Error('Требуется идентификатор пользователя'),{statusCode:401});return userId;}
function parseJson(value,fallback){try{return value?JSON.parse(value):fallback;}catch{return fallback;}}
function isoDateValid(v){return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(`${v}T00:00:00Z`));}
function instantValid(v){return typeof v==='string'&&!Number.isNaN(Date.parse(v))&&/[zZ]|[+-]\d{2}:?\d{2}$/.test(v);}
function normalizePayload(input){
  const title=String(input?.title??'').trim();if(!title)throw Object.assign(new Error('Название события обязательно'),{statusCode:422});
  const startRaw=String(input?.startAt??'');const endRaw=String(input?.endAt??'');
  if(!instantValid(startRaw)||!instantValid(endRaw))throw Object.assign(new Error('startAt/endAt должны быть ISO instant с timezone'),{statusCode:422});
  const startAtDate=new Date(startRaw),endAtDate=new Date(endRaw);
  if(endAtDate.getTime()<=startAtDate.getTime())throw Object.assign(new Error('Время окончания должно быть позже начала'),{statusCode:422});
  const startAt=startAtDate.toISOString(),endAt=endAtDate.toISOString();
  const timeZone=String(input?.timeZone??'UTC');try{new Intl.DateTimeFormat('en-US',{timeZone}).format();}catch{throw Object.assign(new Error('Некорректный часовой пояс'),{statusCode:422});}
  const recurrence=input?.recurrence??null;
  if(recurrence){if(!FREQUENCIES.has(recurrence.frequency))throw Object.assign(new Error('Некорректная частота повторения'),{statusCode:422});const interval=Number(recurrence.interval??1);if(!Number.isInteger(interval)||interval<1||interval>31)throw Object.assign(new Error('Некорректный интервал повторения'),{statusCode:422});if(recurrence.until!=null&&!isoDateValid(recurrence.until))throw Object.assign(new Error('Некорректная дата окончания серии'),{statusCode:422});}
  const status=String(input?.status??'planned');if(!STATUSES.has(status))throw Object.assign(new Error('Некорректный статус события'),{statusCode:422});
  const privacy=String(input?.privacy??'private');if(!PRIVACY.has(privacy))throw Object.assign(new Error('Некорректная приватность'),{statusCode:422});
  const attendees=Array.isArray(input?.attendees)?input.attendees.map(x=>String(x).trim()).filter(Boolean).slice(0,100):[];
  return {title,description:String(input?.description??'').trim().slice(0,10000),category:String(input?.category??'personal').trim().slice(0,80)||'personal',status,startAt,endAt,timeZone,allDay:Boolean(input?.allDay),location:String(input?.location??'').trim().slice(0,500),meetingUrl:String(input?.meetingUrl??'').trim().slice(0,1000),attendees,attachments:Array.isArray(input?.attachments)?input.attachments.slice(0,10):[],privacy,recurrence};
}

function localParts(iso,zone){const ps=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',weekday:'short',hourCycle:'h23'}).formatToParts(new Date(iso));const g=t=>Number(ps.find(p=>p.type===t)?.value??0);const weekday=ps.find(p=>p.type==='weekday')?.value;return{year:g('year'),month:g('month'),day:g('day'),hour:g('hour'),minute:g('minute'),second:g('second'),weekday};}
function localDate(p){return `${p.year}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`;}
function localTime(p){return `${String(p.hour).padStart(2,'0')}:${String(p.minute).padStart(2,'0')}`;}
function localToUtc(local,zone){const m=local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);if(!m)throw new Error('Invalid local datetime');const naive=Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]??0));const offset=(utc)=>{const p=localParts(new Date(utc).toISOString(),zone);return Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second)-utc;};let guess=naive;for(let i=0;i<4;i++)guess=naive-offset(guess);return new Date(guess).toISOString();}
function addDaysLocal(dateString,days){const d=new Date(`${dateString}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function addMonthsLocal(dateString,months){const [y,m,d]=dateString.split('-').map(Number);const base=new Date(Date.UTC(y,m-1,1));base.setUTCMonth(base.getUTCMonth()+months);const last=new Date(Date.UTC(base.getUTCFullYear(),base.getUTCMonth()+1,0)).getUTCDate();base.setUTCDate(Math.min(d,last));return base.toISOString().slice(0,10);}
function addYearsLocal(dateString,years){const [y,m,d]=dateString.split('-').map(Number);const leap=m===2&&d===29;return `${String(y+years).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(leap&&!( (y+years)%4===0 && ((y+years)%100!==0 || (y+years)%400===0)) ?28:d).padStart(2,'0')}`;}
function dayOfWeek(date){return new Date(`${date}T12:00:00Z`).getUTCDay();}
function expandPayload(base,ownerId,limitDays=730){
  const p=normalizePayload(base);const recurrence=p.recurrence;const start=p.startAt;const startParts=localParts(start,p.timeZone);const endMs=Date.parse(p.endAt);const duration=endMs-Date.parse(start);const firstDate=localDate(startParts);const firstTime=localTime(startParts);const until=recurrence?.until??addDaysLocal(firstDate,limitDays);const occurrences=[];
  let cursor=firstDate;let index=0;const weekdays=(recurrence?.weekdays??[]).map(Number).filter(n=>n>=0&&n<=6);
  while(cursor<=until&&index<2000){
    let take=index===0;
    if(recurrence){
      if(recurrence.frequency==='daily')take=((Math.floor((Date.parse(`${cursor}T00:00:00Z`)-Date.parse(`${firstDate}T00:00:00Z`))/86400000)%recurrence.interval)===0);
      else if(recurrence.frequency==='weekly'){
        const weeks=Math.floor((Date.parse(`${cursor}T00:00:00Z`)-Date.parse(`${firstDate}T00:00:00Z`))/86400000/7);take=(weeks%recurrence.interval===0)&&(weekdays.length?weekdays.includes(dayOfWeek(cursor)):dayOfWeek(cursor)===dayOfWeek(firstDate));
      } else if(recurrence.frequency==='monthly'){const [y,m]=firstDate.split('-').map(Number);const [cy,cm]=cursor.split('-').map(Number);const months=(cy-y)*12+(cm-m);take=(months>=0&&months%recurrence.interval===0)&&cursor.slice(8)===firstDate.slice(8);}
      else if(recurrence.frequency==='yearly'){const [y]=firstDate.split('-').map(Number);const [cy]=cursor.split('-').map(Number);take=(cy-y>=0&&(cy-y)%recurrence.interval===0)&&cursor.slice(5)===firstDate.slice(5);}
    }
    if(take){const startAt=localToUtc(`${cursor}T${firstTime}`,p.timeZone);const endAt=new Date(Date.parse(startAt)+duration).toISOString();occurrences.push({id:randomUUID(),seriesId:recurrence?randomUUID():null,occurrenceIndex:index,title:p.title,description:p.description,category:p.category,status:p.status,startAtUtc:startAt,endAtUtc:endAt,timeZone:p.timeZone,allDay:p.allDay,location:p.location,meetingUrl:p.meetingUrl,attendees:p.attendees,attachments:p.attachments,privacy:p.privacy,recurrence:p.recurrence});index++;}
    if(recurrence?.frequency==='monthly')cursor=addMonthsLocal(cursor,1);
    else if(recurrence?.frequency==='yearly')cursor=addYearsLocal(cursor,1);
    else cursor=addDaysLocal(cursor,1);
  }
  if(!recurrence)return [{...occurrences[0],seriesId:null,occurrenceIndex:0}];
  const seriesId=randomUUID();return occurrences.map(x=>({...x,seriesId}));
}

function rowToEvent(row){return {id:row.id,seriesId:row.series_id??undefined,occurrenceIndex:Number(row.occurrence_index),title:row.title,description:row.description,category:row.category,status:row.status,startAt:row.start_at_utc,endAt:row.end_at_utc,timeZone:row.time_zone,allDay:Boolean(row.all_day),location:row.location,meetingUrl:row.meeting_url,attendees:parseJson(row.attendees_json,[]),attachments:parseJson(row.attachments_json,[]),privacy:row.privacy,recurrence:parseJson(row.recurrence_json,null),kind:'personal',readOnly:false};}

export async function listEvents(userId,from,to,filters={}){const db=await database();userId=requireUser(userId);if(!instantValid(from)||!instantValid(to)||Date.parse(to)<=Date.parse(from))throw Object.assign(new Error('Некорректный диапазон from/to'),{statusCode:422});const fromUtc=new Date(from).toISOString(),toUtc=new Date(to).toISOString();const status=filters.status&&STATUSES.has(filters.status)?filters.status:null;const category=typeof filters.category==='string'&&filters.category.trim().length<=80?filters.category.trim():null;const rows=db.prepare(`SELECT * FROM events WHERE owner_id=? AND end_at_utc>? AND start_at_utc<? AND (? IS NULL OR status=?) AND (? IS NULL OR category=?) ORDER BY start_at_utc ASC LIMIT 5000`).all(userId,fromUtc,toUtc,status,status,category,category);return rows.map(rowToEvent);}
export async function createEvent(userId,input){const db=await database();userId=requireUser(userId);const expanded=expandPayload(input);const now=new Date().toISOString();const stmt=db.prepare(`INSERT INTO events(id,owner_id,series_id,occurrence_index,title,description,category,status,start_at_utc,end_at_utc,time_zone,all_day,location,meeting_url,attendees_json,attachments_json,privacy,recurrence_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);for(const e of expanded)stmt.run(e.id,userId,e.seriesId,e.occurrenceIndex,e.title,e.description,e.category,e.status,e.startAtUtc,e.endAtUtc,e.timeZone,e.allDay?1:0,e.location,e.meetingUrl,JSON.stringify(e.attendees),JSON.stringify(e.attachments),e.privacy,e.recurrence?JSON.stringify(e.recurrence):null,now,now);return rowToEvent(db.prepare('SELECT * FROM events WHERE id=?').get(expanded[0].id));}
export async function updateEvent(userId,id,input,scope='series'){
  const db=await database();
  userId=requireUser(userId);
  const current=db.prepare('SELECT * FROM events WHERE id=? AND owner_id=?').get(id,userId);
  if(!current)throw Object.assign(new Error('Событие не найдено'),{statusCode:404});
  if(!['single','following','series'].includes(scope))throw Object.assign(new Error('Некорректный режим изменения серии'),{statusCode:422});
  const p=normalizePayload(input);
  const now=new Date().toISOString();
  if(scope==='single'){
    db.prepare(`UPDATE events SET title=?,description=?,category=?,status=?,start_at_utc=?,end_at_utc=?,time_zone=?,all_day=?,location=?,meeting_url=?,attendees_json=?,attachments_json=?,privacy=?,recurrence_json=?,updated_at=? WHERE id=? AND owner_id=?`).run(p.title,p.description,p.category,p.status,p.startAt,p.endAt,p.timeZone,p.allDay?1:0,p.location,p.meetingUrl,JSON.stringify(p.attendees),JSON.stringify(p.attachments),p.privacy,null,now,id,userId);
    return rowToEvent(db.prepare('SELECT * FROM events WHERE id=? AND owner_id=?').get(id,userId));
  }
  const series=current.series_id??current.id;
  if(scope==='series'){
    db.prepare(`DELETE FROM events WHERE owner_id=? AND (series_id=? OR id=?)`).run(userId,series,series);
    const expanded=expandPayload({...p,recurrence:p.recurrence});
    for(const e of expanded)stmtInsert(db,e,userId,now);
    return rowToEvent(db.prepare('SELECT * FROM events WHERE id=? AND owner_id=?').get(expanded[0].id,userId));
  }
  db.prepare(`DELETE FROM events WHERE owner_id=? AND (series_id=? OR id=?) AND occurrence_index>=?`).run(userId,series,series,current.occurrence_index);
  const expanded=expandPayload({...p,recurrence:p.recurrence});
  for(const e of expanded)stmtInsert(db,e,userId,now);
  return rowToEvent(db.prepare('SELECT * FROM events WHERE id=? AND owner_id=?').get(expanded[0].id,userId));
}
function stmtInsert(db,e,userId,now){db.prepare(`INSERT INTO events(id,owner_id,series_id,occurrence_index,title,description,category,status,start_at_utc,end_at_utc,time_zone,all_day,location,meeting_url,attendees_json,attachments_json,privacy,recurrence_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(e.id,userId,e.seriesId,e.occurrenceIndex,e.title,e.description,e.category,e.status,e.startAtUtc,e.endAtUtc,e.timeZone,e.allDay?1:0,e.location,e.meetingUrl,JSON.stringify(e.attendees),JSON.stringify(e.attachments),e.privacy,e.recurrence?JSON.stringify(e.recurrence):null,now,now);}
export async function deleteEvent(userId,id,scope='series'){const db=await database();userId=requireUser(userId);const row=db.prepare('SELECT * FROM events WHERE id=? AND owner_id=?').get(id,userId);if(!row)throw Object.assign(new Error('Событие не найдено'),{statusCode:404});if(scope==='single')db.prepare('DELETE FROM events WHERE id=? AND owner_id=?').run(id,userId);else if(scope==='following'){const series=row.series_id??row.id;db.prepare(`DELETE FROM events WHERE owner_id=? AND (series_id=? OR id=?) AND occurrence_index>=?`).run(userId,series,series,row.occurrence_index);}else{const series=row.series_id??row.id;db.prepare(`DELETE FROM events WHERE owner_id=? AND (series_id=? OR id=?)`).run(userId,series,series);}return {ok:true};}
