import {cleanText,cleanSubject,cleanLocation,cleanTeacher,normalizeGroupList,normalizeStream,normalizeHalf,timeRange,typeFrom,isoDate,parseWeekSpec} from './normalize.mjs';

const DAY_NAMES={пн:1,понедельник:1,вт:2,вторник:2,ср:3,среда:3,чт:4,четверг:4,пт:5,пятница:5,сб:6,суббота:6,вс:7,воскресенье:7};
const ANCHOR_MONDAY='2026-08-31';

function attrInt(tag,name){const m=tag.match(new RegExp(`${name}\\s*=\\s*["']?(\\d+)`,'i'));return Math.max(1,Number(m?.[1]??1));}
function cellText(html){return cleanText(html.replace(/<br\s*\/?\s*>/gi,' ').replace(/<[^>]+>/g,' '));}
function mondayFromWeek(week){const d=new Date(`${ANCHOR_MONDAY}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+(week-1)*7);return d.toISOString().slice(0,10);}
function addDays(date,n){const d=new Date(`${date}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function dateFromDay(day,week){return day&&week?addDays(mondayFromWeek(week),day-1):'';}
function detectDay(value){const s=cleanText(value).toLowerCase();for(const [k,v] of Object.entries(DAY_NAMES))if(new RegExp(`(?:^|\\s)${k}(?=\\s|$|\\d|[.,])`).test(s))return v;return null;}
function findDate(value){const text=cleanText(value);const full=text.match(/(?<![\d.])(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?![\d.])/);if(full)return isoDate(`${full[1]}.${full[2]}.${full[3]}`);const re=/(?<![\d.])(\d{1,2})[./](\d{1,2})(?![./\d])/g;for(const m of text.matchAll(re)){const before=text.slice(Math.max(0,(m.index??0)-12),m.index??0).toLowerCase();if(/(?:ауд|аудитория|корпус|ул\.?|каб\.?)\s*$/.test(before))continue;const day=Number(m[1]),month=Number(m[2]);if(day>31||month>12)continue;const year=month>=8?2026:2027;const result=isoDate(`${String(day).padStart(2,'0')}.${String(month).padStart(2,'0')}.${year}`);if(result)return result;}return null;}

export function parseHtmlTable(html){
  const tableRows=[...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  const grid=[];const occupancy=new Map();let maxWidth=0;
  tableRows.forEach((rm,rowIndex)=>{const row=rm[1]??'';const cells=[...row.matchAll(/<(td|th)\b([^>]*)>([\s\S]*?)<\/(?:td|th)>/gi)];let col=0;for(const cm of cells){while(occupancy.has(`${rowIndex}:${col}`))col++;const attrs=cm[2]??'',rs=attrInt(attrs,'rowspan'),cs=attrInt(attrs,'colspan'),value=cellText(cm[3]??'');for(let r=0;r<rs;r++)for(let c=0;c<cs;c++){const rr=rowIndex+r,cc=col+c;grid[rr]??=[];if(!grid[rr][cc])grid[rr][cc]=value;if(r>0||c>0)occupancy.set(`${rr}:${cc}`,value);maxWidth=Math.max(maxWidth,cc+1);}col+=cs;}});
  return grid.map(r=>Array.from({length:maxWidth},(_,i)=>r[i]??''));
}

function detectGroups(rows){
  const groups=[];for(const row of rows.slice(0,12))for(const cell of row){for(const g of normalizeGroupList(cell))if(/^\d{3,4}[А-ЯA-Z]{0,3}$/i.test(g))groups.push(g);}return [...new Set(groups)];
}
function headerContext(rows){return rows.slice(0,10).flat().join(' ');}

function expandWeeks(day,weekText,explicitDate){
  if(explicitDate)return [explicitDate];
  const weeks=parseWeekSpec(weekText);if(!day||!weeks.length)return [];
  return weeks.map(w=>dateFromDay(day,w));
}

function eventFromCell({program,course,source,group,stream,date,start,end,cell,rowText}){
  const half=normalizeHalf(cell);const locationMatch=cell.match(/(?:ауд(?:итория)?\.?\s*[\w./-]+|корпус\s*[\w./-]+|ул\.?\s*[^;|]+)/i);const teacherMatch=cell.match(/(?:преподаватель|доцент|профессор|ассистент|преп\.?)[ :]+([^;|]+)/i);const subject=cleanSubject(cell.replace(/\b\d{1,2}\s*[:.]\s*\d{2}\b/g,' ').replace(/(?:ауд(?:итория)?\.?\s*[\w./-]+|корпус\s*[\w./-]+)/ig,' ').replace(/(?:лекция|пз|практика|лабораторная|лабораторное|семинар|занятие)/ig,' ').replace(/^[\s,;:|.\-–—]+|[\s,;:|.\-–—]+$/g,''));if(!subject||subject.length<2)return null;return{program,course,group,stream,date,start,end,subject,location:cleanLocation(locationMatch?.[0]??''),teacher:cleanTeacher(teacherMatch?.[1]??''),type:typeFrom(cell,rowText),half,sourceUrl:source.url,sourceTitle:source.title,sourceKind:'official-html',confidence:.78,id:`${program}-${course}-${group}-${date}-${start}-${subject.toLowerCase()}`};}

export function parseHtmlSchedule(html,{program,course,source}){
  const rows=parseHtmlTable(html);const warnings=[];const context=headerContext(rows);const stream=normalizeStream(context)||source.stream||null;const detectedGroups=detectGroups(rows);const groupColumns=new Map();
  for(const row of rows.slice(0,10)){const found=[];row.forEach((cell,i)=>{for(const g of normalizeGroupList(cell))if(detectedGroups.includes(g)&&/^\d{3,4}[А-ЯA-Z]{0,3}$/i.test(g))found.push([i,g]);});if(found.length>=2){for(const [i,g] of found)groupColumns.set(i,g);break;}}
  if(!rows.length)warnings.push('HTML не содержит таблиц');
  if(!detectedGroups.length)warnings.push('HTML: группы не определены, используется поток/ALL только при наличии явной даты');
  const events=[];let currentDay=null,currentDate='';let currentWeekText='';
  // Layout A: groups are column headers (group -> fixed column). Layout B: groups are row labels and days are column headers.
  const firstRows=rows.slice(0,8);
  const dayColumns=new Map();
  for(const row of firstRows){for(let i=0;i<row.length;i++){const d=detectDay(row[i]);if(d)dayColumns.set(i,{day:d,date:findDate(row[i])});}}
  const rowGroupMode=dayColumns.size>=2 && rows.slice(0,8).some(r=>r.length>0 && normalizeGroupList(r[0]??'').some(g=>/^\d{3,4}[А-ЯA-Z]{0,3}$/i.test(g)));
  if(rowGroupMode){
    for(let r=0;r<rows.length;r++){
      const row=rows[r]??[];const group=normalizeGroupList(row[0]??'').find(g=>/^\d{3,4}[А-ЯA-Z]{0,3}$/i.test(g));if(!group)continue;
      for(const [col,meta] of dayColumns){const cell=row[col]??'';if(!cell)continue;const rowText=cleanText(`${cell} ${row.join(' ')}`);const found=meta.date;const dates=expandWeeks(meta.day, currentWeekText, found??'');const tr=timeRange(cell)||timeRange(rowText);if(!tr||!dates.length)continue;for(const date of dates){const event=eventFromCell({program,course,source,group,stream,date,start:tr.start,end:tr.end,cell,rowText});if(event)events.push(event);}}
    }
  } else {
    for(const row of rows){const rowText=cleanText(row.join(' '));const day=detectDay(rowText);if(day){currentDay=day;const found=findDate(rowText);currentDate=found??'';}
      const foundDate=findDate(rowText);if(foundDate)currentDate=foundDate;
      if(/(?:недел|нед\.?|week)/i.test(rowText))currentWeekText=rowText;
      const tr=timeRange(rowText);if(!tr)continue;
      const dates=expandWeeks(currentDay,currentWeekText,currentDate);
      if(groupColumns.size){for(const [col,group] of groupColumns){const cell=row[col]??'';if(!cell||cleanText(cell)===group)continue;for(const date of dates){const event=eventFromCell({program,course,source,group,stream,date,start:tr.start,end:tr.end,cell,rowText});if(event)events.push(event);}}}
      else if(dates.length){const cells=row.filter(Boolean).filter((c)=>c!==row[0]);for(const date of dates)for(const cell of cells){const event=eventFromCell({program,course,source,group:'ALL',stream,date,start:tr.start,end:tr.end,cell,rowText});if(event)events.push(event);}}
    }
  }
  if(!events.length)warnings.push('HTML parser: не удалось извлечь ни одного события с датой/неделей и временем');
  return{events,warnings,source,specialty:program};
}
