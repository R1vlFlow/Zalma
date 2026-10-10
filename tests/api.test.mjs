import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';

const dir=await mkdtemp(join(tmpdir(),'zalma-api-'));const port=4197;const env={...process.env,PORT:String(port),HOST:'127.0.0.1',APP_DB_PATH:join(dir,'app.sqlite'),APP_ATTACHMENTS_DIR:join(dir,'attachments')};
const child=spawn(process.execPath,['server/server.mjs'],{cwd:process.cwd(),env,stdio:['ignore','pipe','pipe']});
let output='';child.stdout.on('data',d=>{output+=d.toString();});child.stderr.on('data',d=>{output+=d.toString();});
async function waitForServer(){for(let i=0;i<50;i++){try{const r=await fetch(`http://127.0.0.1:${port}/api/health`);if(r.ok)return;}catch{}await delay(100);}throw new Error(`server did not start: ${output}`);}
await waitForServer();
const user='test-user-00000001';
async function request(path,options={}){const {userId=user,...fetchOptions}=options;const r=await fetch(`http://127.0.0.1:${port}${path}`,{...fetchOptions,headers:{'x-user-id':userId,'content-type':'application/json',...(fetchOptions.headers??{})}});const body=await r.json();return{r,body};}

test('official schedule API keeps a matched long practice block merged end-to-end',async()=>{
 const response=await request('/api/schedule?program=31.05.01&course=4');
 assert.equal(response.r.status,200);
 assert.ok(response.body.events.length>300);
 const rows=response.body.events.filter((e)=>e.group==='424'&&e.date==='2026-10-05'&&e.subject==='Эндокринология');
 assert.equal(rows.length,1);
 assert.deepEqual(rows.map((e)=>[e.start,e.end,e.double,e.doublePart,e.mergedConsecutive]),[['13:30','16:55',true,undefined,true]]);
});

test('event API canonicalizes offset timestamps to UTC',async()=>{
 const create=await request('/api/events',{userId:'offset-user-20261008',method:'POST',body:JSON.stringify({title:'Offset canonicalization',startAt:'2026-10-08T18:00:00+02:00',endAt:'2026-10-08T19:30:00+02:00',timeZone:'Europe/Zurich',category:'meeting',status:'planned',privacy:'private'})});
 assert.equal(create.r.status,201);
 assert.equal(create.body.event.startAt,'2026-10-08T16:00:00.000Z');
 assert.equal(create.body.event.endAt,'2026-10-08T17:30:00.000Z');
 const listed=await request('/api/events?from=2026-10-08T18:00:00%2B02:00&to=2026-10-08T20:00:00%2B02:00',{userId:'offset-user-20261008'});
 assert.equal(listed.r.status,200);assert.equal(listed.body.events.length,1);
});

test('event CRUD stores UTC and survives range query',async()=>{
 const create=await request('/api/events',{method:'POST',body:JSON.stringify({title:'DST test',startAt:'2026-10-08T16:00:00.000Z',endAt:'2026-10-08T17:00:00.000Z',timeZone:'Europe/Zurich',category:'meeting',status:'planned',privacy:'private'})});
 assert.equal(create.r.status,201);assert.ok(create.body.event.id);
 const id=create.body.event.id;
 const list=await request('/api/events?from=2026-10-08T00:00:00.000Z&to=2026-10-09T00:00:00.000Z');assert.equal(list.r.status,200);assert.equal(list.body.events.length,1);assert.equal(list.body.events[0].startAt,'2026-10-08T16:00:00.000Z');
 const update=await request(`/api/events/${id}`,{method:'PUT',body:JSON.stringify({title:'DST updated',startAt:'2026-10-08T16:00:00.000Z',endAt:'2026-10-08T18:00:00.000Z',timeZone:'Europe/Zurich',category:'meeting',status:'confirmed',privacy:'private'})});assert.equal(update.r.status,200);assert.equal(update.body.event.title,'DST updated');
 const del=await request(`/api/events/${update.body.event.id}?scope=single`,{method:'DELETE'});assert.equal(del.r.status,200);
});

test('support ticket creates history and is isolated by owner',async()=>{
 const created=await request('/api/support/tickets',{method:'POST',body:JSON.stringify({subject:'Ошибка времени',category:'schedule',priority:'high',description:'Проверка корректности часового пояса.'})});
 assert.equal(created.r.status,201);assert.match(created.body.ticket.number,/^ALM-/);assert.equal(created.body.ticket.messages.length,1);
 const list=await request('/api/support/tickets');assert.equal(list.body.tickets.length,1);
 const id=created.body.ticket.id;const msg=await request(`/api/support/tickets/${id}/messages`,{method:'POST',body:JSON.stringify({body:'Добавляю уточнение.'})});assert.equal(msg.r.status,201);assert.equal(msg.body.ticket.messages.length,2);
 const foreign=await fetch(`http://127.0.0.1:${port}/api/support/tickets/${id}`,{headers:{'x-user-id':'foreign-user-000000'}});assert.equal(foreign.status,404);
});

after(async()=>{child.kill('SIGTERM');await delay(150);await rm(dir,{recursive:true,force:true});});

test('recurring events expand and support series/following/single scopes', async()=>{
 const created=await request('/api/events',{method:'POST',body:JSON.stringify({title:'Повторяющаяся встреча',startAt:'2026-10-08T08:00:00.000Z',endAt:'2026-10-08T09:00:00.000Z',timeZone:'Europe/Zurich',category:'meeting',status:'planned',privacy:'private',recurrence:{frequency:'weekly',interval:1,weekdays:[4],until:'2026-10-29'}})});
 assert.equal(created.r.status,201);
 const first=created.body.event; assert.ok(first.seriesId);
 const list=await request('/api/events?from=2026-10-01T00:00:00.000Z&to=2026-11-01T00:00:00.000Z');
 assert.equal(list.r.status,200); assert.equal(list.body.events.length,4); assert.ok(list.body.events.every((e)=>e.seriesId===first.seriesId));
 const occurrence=list.body.events[1];
 const single=await request(`/api/events/${occurrence.id}`,{method:'PUT',body:JSON.stringify({scope:'single',title:'Одна изменённая встреча',startAt:occurrence.startAt,endAt:occurrence.endAt,timeZone:'Europe/Zurich',category:'meeting',status:'confirmed',privacy:'private'})});
 assert.equal(single.r.status,200); assert.equal(single.body.event.title,'Одна изменённая встреча');
 const afterSingle=await request('/api/events?from=2026-10-01T00:00:00.000Z&to=2026-11-01T00:00:00.000Z');
 assert.equal(afterSingle.body.events.length,4); assert.equal(afterSingle.body.events.filter((e)=>e.title==='Одна изменённая встреча').length,1); const filtered=await request('/api/events?from=2026-10-01T00:00:00.000Z&to=2026-11-01T00:00:00.000Z&status=confirmed&category=meeting'); assert.equal(filtered.body.events.length,1); assert.equal(filtered.body.events[0].title,'Одна изменённая встреча');
 const seriesUpdate=await request(`/api/events/${first.id}`,{method:'PUT',body:JSON.stringify({scope:'series',title:'Серия обновлена',startAt:first.startAt,endAt:first.endAt,timeZone:'Europe/Zurich',category:'meeting',status:'planned',privacy:'private',recurrence:{frequency:'weekly',interval:1,weekdays:[4],until:'2026-10-29'}})});
 assert.equal(seriesUpdate.r.status,200); assert.equal(seriesUpdate.body.event.title,'Серия обновлена');
 const afterSeries=await request('/api/events?from=2026-10-01T00:00:00.000Z&to=2026-11-01T00:00:00.000Z');
 assert.equal(afterSeries.body.events.length,4); assert.equal(afterSeries.body.events.filter((e)=>e.title==='Серия обновлена').length,4);
});

test('support ticket accepts a small attachment and protects attachment ownership', async()=>{
 const data=Buffer.from('qa attachment','utf8').toString('base64');
 const created=await request('/api/support/tickets',{method:'POST',body:JSON.stringify({subject:'Вложение',category:'technical',priority:'normal',description:'Проверка вложения',attachments:[{name:'log.txt',type:'text/plain',size:Buffer.from('qa attachment','utf8').length,dataBase64:data}]})});
 assert.equal(created.r.status,201); assert.equal(created.body.ticket.attachments.length,1); const id=created.body.ticket.attachments[0].id;
 const file=await fetch(`http://127.0.0.1:${port}/api/support/attachments/${id}`,{headers:{'x-user-id':user}}); assert.equal(file.status,200); assert.equal(Buffer.from(await file.arrayBuffer()).toString('utf8'),'qa attachment');
 const foreign=await fetch(`http://127.0.0.1:${port}/api/support/attachments/${id}`,{headers:{'x-user-id':'foreign-user-000000'}}); assert.equal(foreign.status,404);
});
