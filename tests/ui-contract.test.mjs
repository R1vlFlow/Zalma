import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
const css=await readFile(new URL('../public/styles.css',import.meta.url),'utf8');
const boot=await readFile(new URL('../public/boot.js',import.meta.url),'utf8');

const app=await readFile(new URL('../src/app.ts',import.meta.url),'utf8');
const validator=await readFile(new URL('../scripts/validate-dist.mjs',import.meta.url),'utf8');
const awaitSource=async(path)=>readFile(new URL(path,import.meta.url),'utf8');

test('schedule boot tolerates a not-yet-created empty state and always exits loading',()=>{
 assert.match(app,/document\.getElementById\('emptyState'\)\?\.remove\(\)/);
 assert.doesNotMatch(app,/\$\('emptyState'\)\?\.remove\(\)/);
 assert.match(app,/async function reloadEvents\(\)[\s\S]*?catch\(error\)[\s\S]*?state\.status='error'/);
 assert.match(app,/state\.status==='loading'&&state\.scheduleMode!=='kug'[\s\S]*?renderSkeleton\(\)/);
 assert.match(app,/state\.scheduleMode==='kug'&&state\.kugStatus==='loading'[\s\S]*?renderSkeleton\(\)/);
});

test('modals stay outside document flow unless explicitly opened',()=>{
 assert.match(css,/\.modal-backdrop\{[^}]*display:none/s);
 assert.match(css,/\.modal-backdrop\.open\{display:flex\}/);
 assert.match(css,/\.modal\{[^}]*max-height:[^}]*overflow:hidden/s);
 assert.match(css,/\.modal-body\{[^}]*overflow:auto/s);
 assert.match(html,/id="eventModal" aria-hidden="true"/);
 assert.match(app,/function closeAllModals\(\)/);
 assert.match(app,/if\(action==='close-modal'\)\{closeAllModals\(\)/);
});

test('routing rejects missing pages and clears modal state during navigation',()=>{
 assert.match(app,/const destination=document\.getElementById\(`page-\$\{page\}`\)/);
 assert.match(app,/closeAllModals\(\);state\.page=page/);
 assert.match(app,/if\(e\.key==='Escape'\)\{closeAllModals\(\);return;\}/);
});

test('production validation protects the modal CSS contract',()=>{
 assert.match(validator,/Required modal\/layout CSS missing/);
});

for(const page of ['home','schedule','homework','kug','resources','faculties','faq','support','settings','profilePage']){
 test(`page ${page} has a real section`,()=>assert.match(html,new RegExp(`id="page-${page}"`)));
}

test('navigation exposes FAQ and support without placeholder pages',()=>{
 assert.match(html,/data-page="faq"/); assert.match(html,/FAQ/);
 assert.match(html,/data-page="support"/);
 assert.match(html,/id="faqList"/);
 assert.match(html,/id="ticketList"/);
});

test('calendar exposes all required views',()=>{
 for(const view of ['day','workweek','week','month','agenda','list']) assert.match(html,new RegExp(`data-view="${view}"`));
 assert.match(html,/id="eventTitle"/); assert.match(html,/id="eventTimezone"/); assert.match(html,/id="eventRepeat"/); assert.match(html,/id="eventEditScope"/);
});

test('theme contract has semantic tokens and system bootstrap',()=>{
 for(const token of ['--bg:','--surface:','--text:','--border:','--accent:','--success:','--warning:','--danger:','--focus:','--shadow-sm:','--shadow-md:']) assert.ok(css.includes(token),`missing ${token}`);
 assert.match(css,/html\[data-theme=dark\]/);
 assert.match(boot,/prefers-color-scheme/);
 assert.match(boot,/dataset\.themePreference/);
});

test('responsive and accessibility contract is present',()=>{
 assert.match(css,/@media\(max-width:680px\)/);
 assert.match(css,/min-height:44px/);
 assert.match(html,/class="skip"/);
 assert.match(html,/aria-label=/);
 assert.match(html,/aria-live="polite"/);
});

test('built static schedule exposes normalized continuous 4K double block',async()=>{
 const snapshot=JSON.parse(await readFile(new URL('../dist/data/schedules/31.05.01/4.json',import.meta.url),'utf8'));
 assert.ok(snapshot.events.length>500);
 const rows=snapshot.events.filter(e=>e.group==='424'&&e.date==='2026-10-05'&&e.subject==='Эндокринология');
 assert.deepEqual(rows.map(e=>[e.start,e.end,e.doublePart,e.type,e.mergedConsecutive]),[['13:30','16:55',undefined,'practice',true]]);
});


test('double lesson labels render in every calendar view',()=>{
 assert.match(app,/function eventHalfLabel\(e:CalendarEvent\)/);
 assert.match(app,/if\(e\.doublePart===1\)return '1\/2'/);
 assert.match(app,/if\(e\.doublePart===2\)return '2\/2'/);
 assert.match(app,/function eventHalfMarkup\(/);
 for(const fn of ['renderCardSchedule','renderMobile','renderMonth','renderAgenda','renderList']){
   const start=app.indexOf(`function ${fn}(`);
   assert.notEqual(start,-1,`missing ${fn}`);
   const next=app.indexOf('\nfunction ',start+10);
   const body=app.slice(start,next<0?undefined:next);
   assert.match(body,/eventHalfMarkup\(/,`${fn} omits split-part labels`);
 }
 assert.match(css,/\.event-half\.part-2/);
 assert.match(app,/reloadSequence/);
});

test('network loading has bounded timeouts',async()=>{
 const scheduleService=await readFile(new URL('../src/services/scheduleService.ts',import.meta.url),'utf8');
 const eventService=await readFile(new URL('../src/services/eventService.ts',import.meta.url),'utf8');
 assert.match(scheduleService,/AbortSignal\.timeout\(/);
 assert.match(eventService,/AbortSignal\.timeout\(/);
});

test('day/week schedule uses compact cards instead of the legacy vertical time grid',()=>{
 assert.match(app,/function renderCardSchedule\(/);
 assert.match(app,/renderList\(events\):renderCardSchedule\(events,dates\)/);
 assert.doesNotMatch(app,/function renderTimeGrid\(/);
 assert.doesNotMatch(app,/function currentTimeLine\(/);
 assert.match(css,/\.schedule-card-grid/);
 assert.match(app,/class=\"schedule-event-head\"><span class=\"event-time\">/);
});
