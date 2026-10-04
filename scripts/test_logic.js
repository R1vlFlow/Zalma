const fs=require('fs');
const vm=require('vm');
const src=fs.readFileSync('app.js','utf8');
const cut=src.indexOf("try{const saved=JSON.parse");
const code=src.slice(0,cut)+'\nglobalThis.TEST_APP=APP;\n';
const ctx={Intl,Date,Math,Number,String,Set,Array,Object,JSON,RegExp,URLSearchParams,localStorage:{getItem(){return null},setItem(){},removeItem(){}},console,globalThis:null};
ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(code,ctx,{timeout:5000});
const A=ctx.TEST_APP;
function assert(ok,msg){if(!ok)throw new Error(msg);}
function clone(x){return JSON.parse(JSON.stringify(x));}
const cat=JSON.parse(fs.readFileSync('data/catalog.json','utf8'));
const manual=JSON.parse(fs.readFileSync('data/manual-specialist-schedules.json','utf8'));
A.catalog=cat;A.manual=manual;A.kug=JSON.parse(fs.readFileSync('data/kug.json','utf8'));A.live=null;

// Calendar invariants.
assert(A.weekNumberForDate(new Date('2026-09-01T12:00:00'))===1,'week 1 mapping failed');
assert(A.dateForWeek('',2,0)==='2026-09-07','week 2 Monday failed');
assert(A.dateToWeekday('2026-10-05')===0,'date to weekday failed');
assert(A.expandWeeks('2–5, 7, 9-10').join(',')==='2,3,4,5,7,9,10','week parser failed');

// Every published manual group must have a non-empty schedule and only valid events.
for(const [program,prog] of Object.entries(manual.programs)){
  for(const [course,c] of Object.entries(prog.courses)){
    for(const group of c.groups){
      A.state.program=program;A.state.course=course;A.state.group=group;
      const events=A.manualRuleEvents();
      assert(events.length>0,`${program}/${course}/${group} has no events`);
      assert(events.every(e=>A.eventIsValid(e)),`${program}/${course}/${group} invalid event`);
      assert(events.every(e=>e.date && e.weekday>=0 && e.weekday<=6),`${program}/${course}/${group} bad date/day`);
      const unique=new Set(events.map(e=>[e.date,e.start,e.end,e.subject,e.location,e.lessonType,e.doubleIndex].join('|')));
      assert(unique.size===events.length,`${program}/${course}/${group} duplicate events remain`);
    }
  }
}

// Peds year 2: lectures with the known source mismatch must never be displayed.
A.state.program='31.05.02';A.state.course='2';A.state.group='201П';
assert(A.getCourseData().lectureStatus==='source_mismatch','Peds 2 lecture source status missing');
assert(!A.getCourseData().lectureRules?.length,'Unverified Peds 2 lectures leaked into active rules');
assert(A.manualRuleEvents().every(e=>e.lessonType==='practice'),'Peds 2 leaked unverified lecture');

// Unknown course/group cannot inherit another schedule.
A.state.course='3';A.state.group='';assert(A.eventsForCurrentGroup().length===0,'unsupported course leaked');
A.state.course='1';A.state.group='999П';assert(A.eventsForCurrentGroup().length===0,'unknown group leaked');

// Semantic dedupe and split isolation.
const base={date:'2026-09-07',weekday:0,start:'09:00',end:'10:30',subject:'Химия',location:'123',lessonType:'practice',weekNumber:2};
assert(A.dedupeEvents([clone(base),{...clone(base),id:'x'}]).length===1,'semantic duplicate with another id was not collapsed');
assert(A.dedupeEvents([clone(base),clone(base)]).length===1,'semantic dedupe failed');
assert(A.dedupeEvents([{...base,doubleIndex:'1/2'},{...base,doubleIndex:'2/2'}]).length===2,'split pair collapsed');

// Live strict group filtering, date wins over stale weekday.
A.state.program='31.05.01';A.state.course='1';A.state.group='123';
A.live={schemaVersion:7,generatedAt:'2026-10-01T00:00:00Z',courses:{'1':{groups:['123','124'],events:[
  {id:'a',group:'123',course:1,date:'2026-09-07',weekday:6,start:'09:00',end:'10:30',subject:'Химия',type:'practice'},
  {id:'b',group:'124',course:1,date:'2026-09-07',start:'09:00',end:'10:30',subject:'Чужая пара',type:'practice'},
  {id:'c',group:'123',course:1,date:'2026-09-08',start:'10:45',end:'12:15',subject:'Физика',type:'lecture'}
]}}};
const g123=A.liveEvents();assert(g123.length===2,'live group filter failed');assert(g123[0].weekday===0&&g123[1].weekday===1,'live date weekday normalization failed');
A.state.group='124';assert(A.liveEvents().length===1&&A.liveEvents()[0].subject==='Чужая пара','live isolation failed');


// Task and utility invariants.
assert(A.safeColor('#abcdef','#000000')==='#abcdef','safe color accepted hex failed');
assert(A.safeColor('red','#000000')==='#000000','safe color rejected malformed value failed');
assert(A.eventIsValid({...base,end:'08:00'})===false,'invalid reversed event accepted');
assert(A.groupMatches('101','101КП')===true && A.groupMatches('101КП','101')===true,'psychology group alias failed');
assert(A.groupMatches('201П','202П')===false,'cross-group match leaked');

console.log('PASS schedule logic tests · manual groups, source quarantine, dedupe, splits, live isolation, utilities');
