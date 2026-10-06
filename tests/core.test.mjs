import test from 'node:test';
import assert from 'node:assert/strict';
const {parseHtmlTable,detectHeaders}=await import('../dist/core/htmlTableParser.js');
const {cleanSubject,cleanTeacher,cleanLocation,normalizeStream,normalizeGroupList,normalizeTimeRange,normalizeHalf,parseWeekSpec}=await import('../dist/core/normalize.js');
const {validateScheduleIndex,normalizeLiveEvents,dedupe,validateEvents}=await import('../dist/core/validate.js');
const {eventAppliesToGroup,filterEvents}=await import('../dist/core/filter.js');
const {mondayOf,addDays,weekNumberFromAnchor,mondayFromWeek}=await import('../dist/core/date.js');

const base={program:'31.05.01',course:1,date:'2026-10-06',start:'09:00',end:'10:35',subject:'Химия',location:'ЦДТИ, ауд. 4.2.11',teacher:'Иванов И.И.',type:'practice'};

test('HTML parser resolves nested rowspan/colspan and keeps columns aligned',()=>{
 const html=`<table><thead><tr><th rowspan="2">День</th><th colspan="2">Время</th><th colspan="2">Группы</th></tr><tr><th>начало</th><th>конец</th><th>101</th><th>102</th></tr></thead><tbody><tr><td>ПН</td><td>09:00</td><td>10:35</td><td rowspan="2">Химия</td><td>Физика</td></tr><tr><td>ВТ</td><td colspan="2">10:50-12:25</td><td>Практика</td></tr></tbody></table>`;
 const grid=parseHtmlTable(html);assert.equal(grid[0][0],'День');assert.equal(grid[1][3],'101');assert.equal(grid[2][3],'Химия');assert.equal(grid[2][4],'Физика');assert.equal(grid[3][0],'ВТ');assert.equal(grid[3][3],'Химия');assert.equal(grid[3][4],'Практика');assert.ok(detectHeaders(grid).length>=3);
});

test('normalization handles Russian variants and split groups',()=>{assert.equal(cleanSubject('  Химия  * '),'Химия');assert.equal(cleanTeacher('доцент:  Иванов И.И.'),'Иванов И.И.');assert.equal(cleanLocation('ауд 3.17/3.18'),'ауд. 3.17 / 3.18');assert.equal(normalizeStream('Поток Б'),'B');assert.deepEqual(normalizeGroupList('101-103'),'101 102 103'.split(' '));assert.deepEqual(normalizeGroupList('101П;102П'),'101П 102П'.split(' '));assert.deepEqual(normalizeHalf('числитель'),'1/2');assert.deepEqual(normalizeHalf('знаменатель'),'2/2');assert.deepEqual(normalizeTimeRange('9.20 - 10.45'),{start:'09:20',end:'10:45'});assert.deepEqual(parseWeekSpec('(2-4, 7)'),[2,3,4,7]);});

test('calendar week helpers do not drift weekdays',()=>{assert.equal(mondayOf('2026-10-06'),'2026-10-05');assert.equal(addDays('2026-10-05',6),'2026-10-11');assert.equal(weekNumberFromAnchor('2026-10-06','2026-08-31'),6);assert.equal(mondayFromWeek('2026-08-31',6),'2026-10-05');});

test('official payload requires schema',()=>{assert.equal(validateScheduleIndex({}).ok,false);assert.equal(validateScheduleIndex({schemaVersion:7,generatedAt:'x',courses:{}}).ok,true);});

test('stream-specific ALL events are isolated',()=>{const e={...base,id:'x',group:'ALL',stream:'A',date:'2026-10-06'};assert.equal(eventAppliesToGroup(e,{program:'31.05.01',course:1,group:'123',stream:'B'}),false);assert.equal(eventAppliesToGroup(e,{program:'31.05.01',course:1,group:'110',stream:'A'}),true);});

test('exact group event ignores stream mismatch only when group is exact',()=>{const e={...base,id:'x',group:'123',stream:'A'};assert.equal(eventAppliesToGroup(e,{program:'31.05.01',course:1,group:'123',stream:'B'}),false);assert.equal(eventAppliesToGroup(e,{program:'31.05.01',course:1,group:'123',stream:null}),true);});

test('semantic dedupe removes duplicated rows with different ids',()=>{const a={...base,id:'1',stream:'B',group:'123'};const b={...a,id:'2'};assert.equal(dedupe([a,b]).length,1);});

test('1/2 and 2/2 never collapse',()=>{const a={...base,id:'1',stream:'B',group:'123',half:'1/2'};const b={...base,id:'2',stream:'B',group:'123',half:'2/2'};assert.equal(dedupe([a,b]).length,2);});

test('normalizeLiveEvents does not invent dates',()=>{const payload={schemaVersion:7,generatedAt:'2026-10-01T00:00:00Z',specialty:'31.05.01',courses:{'1':{specialty:'31.05.01',groups:['123'],events:[{id:'1',group:'123',stream:'B',date:'',start:'09:00',end:'10:35',subject:'Химия'}]}}};assert.equal(normalizeLiveEvents(payload).length,0);});

test('filterEvents returns only the selected week and group',()=>{const events=[{...base,id:'1',group:'123',stream:'B',date:'2026-10-06'},{...base,id:'2',group:'110',stream:'A',date:'2026-10-06'},{...base,id:'3',group:'123',stream:'B',date:'2026-10-13'}];const r=filterEvents(events,{program:'31.05.01',course:1,group:'123',stream:'B'},'2026-10-05','','all');assert.equal(r.length,1);assert.equal(r[0].id,'1');});

test('validateEvents catches malformed schedule records',()=>{const issues=validateEvents([{...base,id:'x',date:'bad',start:'33:99'}]);assert.ok(issues.some(i=>i.level==='error'&&/дата/.test(i.message)));assert.ok(issues.some(i=>i.level==='error'&&/время/.test(i.message)));});

test('server HTML adapter expands rowspan/colspan before semantic parsing',async()=>{
  const {parseHtmlTable:serverParse}=await import('../server/html-adapter.mjs');
  const html='<table><tr><th rowspan="2">ПН</th><th colspan="2">Время</th><th>101</th><th>102</th></tr><tr><th>09:00</th><th>10:35</th><td rowspan="2">Химия<br>ауд. 4.2.11</td><td>Физика</td></tr><tr><td>ВТ</td><td colspan="2">10:50-12:25</td><td>Практика</td></tr></table>';
  const grid=serverParse(html);assert.equal(grid[1][3],'Химия ауд. 4.2.11');assert.equal(grid[2][3],'Химия ауд. 4.2.11');assert.equal(grid[2][0],'ВТ');
});

test('server HTML semantic parser supports group rows with day columns',async()=>{
  const {parseHtmlSchedule}=await import('../server/html-adapter.mjs');
  const source={url:'test://html-row-groups',title:'Fixture HTML row groups'};
  const html=`<table><tr><th>Группа</th><th>ПН 05.10</th><th>ВТ 06.10</th></tr><tr><td>123</td><td>09:00-10:35 Химия ауд. 4.2.11</td><td>10:50-12:25 Биология ауд. 3.17</td></tr><tr><td>124</td><td>09:00-10:35 Физика ауд. 2.11</td><td>10:50-12:25 Анатомия ауд. 3.17</td></tr></table>`;
  const result=parseHtmlSchedule(html,{program:'31.05.01',course:1,source});
  assert.equal(result.events.filter(e=>e.group==='123').length,2);
  assert.ok(result.events.some(e=>e.group==='123'&&e.date==='2026-10-05'&&e.subject==='Химия'));
  assert.ok(result.events.some(e=>e.group==='123'&&e.date==='2026-10-06'&&e.subject==='Биология'));
  assert.ok(result.events.some(e=>e.group==='124'&&e.date==='2026-10-05'&&e.subject==='Физика'));
});

test('server HTML semantic parser resets date per day and binds group columns',async()=>{
  const {parseHtmlSchedule}=await import('../server/html-adapter.mjs');
  const source={url:'test://html',title:'Fixture HTML'};
  const html=`<table><tr><th>Группа</th><th>ПН 05.10</th><th>ВТ 06.10</th></tr><tr><td>123</td><td>09:00-10:35 Химия ауд. 4.2.11</td><td>10:50-12:25 Биология ауд. 3.17</td></tr><tr><td>124</td><td>09:00-10:35 Физика ауд. 2.11</td><td>10:50-12:25 Анатомия ауд. 3.17</td></tr></table>`;
  const result=parseHtmlSchedule(html,{program:'31.05.01',course:1,source});
  assert.ok(result.events.some(e=>e.group==='123'&&e.date==='2026-10-05'&&e.subject==='Химия'));
  assert.ok(result.events.some(e=>e.group==='123'&&e.date==='2026-10-06'&&e.subject==='Биология'));
  assert.ok(result.events.some(e=>e.group==='124'&&e.date==='2026-10-05'&&e.subject==='Физика'));
  assert.equal(result.events.filter(e=>e.group==='123').length,2);
});

test('PDF coordinate adapter keeps explicit dates per day and resets previous day date',async()=>{
  const {parsePdfPages}=await import('../server/pdf-adapter.mjs');
  const source={url:'test://pdf',title:'Fixture PDF',stream:'B'};
  const pages=[{pageNo:1,items:[
    {text:'31.05.01',x:20,y:700},{text:'123',x:300,y:650},{text:'124',x:420,y:650},{text:'125',x:540,y:650},
    {text:'ПН 05.10',x:20,y:620},{text:'09:00 - 10:35',x:20,y:600},
    {text:'Химия',x:300,y:580},{text:'Биология',x:420,y:580},{text:'Физика',x:540,y:580},
    {text:'ВТ 06.10',x:20,y:560},{text:'10:50 - 12:25',x:20,y:540},
    {text:'Биология',x:300,y:520},{text:'Анатомия',x:420,y:520},{text:'Физиология',x:540,y:520}
  ]}];
  const result=parsePdfPages(pages,{program:'31.05.01',course:1,source});
  const dates=[...new Set(result.events.map(e=>e.date))];assert.deepEqual(dates.sort(),['2026-10-05','2026-10-06']);
  assert.ok(result.events.some(e=>e.group==='123'&&e.subject==='Химия'));
  assert.ok(result.events.some(e=>e.group==='124'&&e.subject==='Биология'));
});

test('XLSX merge expansion preserves aligned coordinates',async()=>{
  const {matrixWithMerges}=await import('../server/xlsx-adapter.mjs');
  const XLSX={utils:{decode_range:()=>({s:{r:0,c:0},e:{r:2,c:3}}),encode_cell:({r,c})=>String.fromCharCode(65+c)+(r+1)}};
  const ws={"!ref":'A1:D3',"!merges":[{s:{r:0,c:0},e:{r:1,c:0}},{s:{r:0,c:1},e:{r:0,c:2}}],A1:{v:'ПН'},B1:{v:'Время'},D1:{v:'101'},B2:{v:'09:00'},C2:{v:'10:35'},D2:{v:'Химия'},A3:{v:'ВТ'},B3:{v:'10:50'},C3:{v:'12:25'},D3:{v:'Физика'}};
  const grid=matrixWithMerges(ws,XLSX);assert.equal(grid[1][0],'ПН');assert.equal(grid[0][2],'Время');assert.equal(grid[1][3],'Химия');
});

test('large schedule remains filterable without accidental cross-group leakage',()=>{
  const events=Array.from({length:10000},(_,i)=>({...base,id:String(i),group:String(101+(i%35)),stream:(i%2?'B':'A'),date:'2026-10-06'}));
  const r=filterEvents(events,{program:'31.05.01',course:1,group:'123',stream:'B'},'2026-10-05','','all');
  assert.ok(r.length>0);assert.ok(r.every(e=>e.group==='123'||e.group==='ALL'));
});
