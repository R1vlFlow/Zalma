import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const time=await import('../dist/core/time.js');
const {localDate,localTime,localDateTimeToUtc}=time;
const {normalizeLiveEvents}=await import('../dist/core/validate.js');

test('timezone conversion preserves Zurich summer time',()=>{
  const utc=localDateTimeToUtc('2026-07-01T10:00','Europe/Zurich');
  assert.equal(utc,'2026-07-01T08:00:00.000Z');
  assert.equal(localDate(utc,'Europe/Zurich'),'2026-07-01');
  assert.equal(localTime(utc,'Europe/Zurich'),'10:00');
});

test('timezone conversion handles Zurich winter DST offset',()=>{
  const utc=localDateTimeToUtc('2026-01-15T10:00','Europe/Zurich');
  assert.equal(utc,'2026-01-15T09:00:00.000Z');
});

test('event created in New York renders on correct Zurich day',()=>{
  const utc=localDateTimeToUtc('2026-10-08T18:00','America/New_York');
  assert.equal(utc,'2026-10-08T22:00:00.000Z');
  assert.equal(localDate(utc,'Europe/Zurich'),'2026-10-09');
  assert.equal(localTime(utc,'Europe/Zurich'),'00:00');
});


test('official weekly-block source materializes dates and splits double practicals for 4-6 courses',async()=>{
  const payload=JSON.parse(await readFile('data/official-schedules.json','utf8'));
  const events=normalizeLiveEvents(payload);
  const monday424=events.filter((e)=>e.course===4&&e.group==='424'&&e.date==='2026-10-05'&&e.subject==='Эндокринология');
  assert.equal(monday424.length,2);
  assert.deepEqual(monday424.map((e)=>[e.start,e.end,e.double,e.doublePart]),[['13:30','15:05',true,1],['15:20','16:55',true,2]]);
  const groups6=new Set(events.filter((e)=>e.course===6&&['617','618'].includes(e.group)).map((e)=>e.group));
  assert.deepEqual([...groups6].sort(),['617','618']);
});
