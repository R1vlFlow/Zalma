import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';

const dir=await mkdtemp(join(tmpdir(),'zalma-http-accept-'));
const port=4327;
const env={...process.env,PORT:String(port),HOST:'127.0.0.1',APP_DB_PATH:join(dir,'app.sqlite'),APP_ATTACHMENTS_DIR:join(dir,'attachments')};
const child=spawn(process.execPath,['server/server.mjs'],{cwd:process.cwd(),env,stdio:['ignore','pipe','pipe']});
let output='';child.stdout.on('data',d=>output+=d.toString());child.stderr.on('data',d=>output+=d.toString());
async function request(path,options={}){const res=await fetch(`http://127.0.0.1:${port}${path}`,{...options,headers:{'content-type':'application/json','x-user-id':'http-acceptance-user-2026',...(options.headers??{})}});let body=null;try{body=await res.json();}catch{}return{res,body};}
try{
  for(let i=0;i<50;i++){try{const h=await request('/api/health');if(h.res.ok)break;}catch{}await delay(100);if(i===49)throw new Error(`server did not start: ${output}`);}
  const schedule4=await request('/api/schedule?program=31.05.01&course=4');
  assert.equal(schedule4.res.status,200);assert.ok(schedule4.body.events.length>500);
  const e424=schedule4.body.events.filter(e=>e.group==='424'&&e.date==='2026-10-05'&&e.subject==='Эндокринология');
  assert.deepEqual(e424.map(e=>[e.start,e.end,e.doublePart,e.type]),[['13:30','15:05',1,'practice'],['15:20','16:55',2,'practice']]);
  const schedule6=await request('/api/schedule?program=31.05.01&course=6');
  const groups6=new Set(schedule6.body.events.filter(e=>['617','618'].includes(e.group)).map(e=>e.group));
  assert.deepEqual([...groups6].sort(),['617','618']);

  const created=await request('/api/events',{method:'POST',body:JSON.stringify({title:'Acceptance event',startAt:'2026-10-08T16:00:00.000Z',endAt:'2026-10-08T17:00:00.000Z',timeZone:'Europe/Zurich',category:'meeting',status:'planned',privacy:'private'})});
  assert.equal(created.res.status,201);assert.equal(created.body.event.startAt,'2026-10-08T16:00:00.000Z');
  const listed=await request('/api/events?from=2026-10-08T00:00:00.000Z&to=2026-10-09T00:00:00.000Z');assert.equal(listed.res.status,200);assert.equal(listed.body.events.length,1);
  const invalid=await request('/api/events',{method:'POST',body:JSON.stringify({title:'',startAt:'2026-10-08T16:00:00.000Z',endAt:'2026-10-08T17:00:00.000Z',timeZone:'Europe/Zurich'})});assert.equal(invalid.res.status,422);

  const ticket=await request('/api/support/tickets',{method:'POST',body:JSON.stringify({subject:'Acceptance ticket',category:'technical',priority:'normal',description:'Проверка поддержки.'})});
  assert.equal(ticket.res.status,201);assert.match(ticket.body.ticket.number,/^ALM-/);assert.equal(ticket.body.ticket.messages.length,1);
  const foreign=await request(`/api/support/tickets/${ticket.body.ticket.id}`,{headers:{'x-user-id':'foreign-user-acceptance'}});assert.equal(foreign.res.status,404);
  console.log('HTTP acceptance: schedule 4/6, UTC CRUD, 422 validation and support ownership PASS');
}catch(error){console.error(output);throw error;}finally{child.kill('SIGTERM');await delay(150);await rm(dir,{recursive:true,force:true});}
