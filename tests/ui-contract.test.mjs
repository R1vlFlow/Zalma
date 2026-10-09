import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
const css=await readFile(new URL('../public/styles.css',import.meta.url),'utf8');
const boot=await readFile(new URL('../public/boot.js',import.meta.url),'utf8');

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

test('built static schedule contains normalized 4K double parts',async()=>{
 const snapshot=JSON.parse(await readFile(new URL('../dist/data/schedules/31.05.01/4.json',import.meta.url),'utf8'));
 assert.ok(snapshot.events.length>500);
 const rows=snapshot.events.filter(e=>e.group==='424'&&e.date==='2026-10-05'&&e.subject==='Эндокринология');
 assert.deepEqual(rows.map(e=>[e.start,e.end,e.doublePart,e.type]),[['13:30','15:05',1,'practice'],['15:20','16:55',2,'practice']]);
});
