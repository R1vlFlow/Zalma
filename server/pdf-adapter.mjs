import {cleanText,cleanLocation,cleanSubject,normalizeGroup,normalizeStream,timeRange,typeFrom,weekSpec} from './normalize.mjs';

const DAY_RE=/(?:^|\s)(ПН|ВТ|СР|ЧТ|ПТ|СБ|ВС)(?=\s|$|\d|[.,])/i;
const SPECIALTY_RE=/\b(31\.05\.01|31\.05\.02|37\.05\.01)\b/;
const DAY_OFFSETS={ПН:0,ВТ:1,СР:2,ЧТ:3,ПТ:4,СБ:5,ВС:6};
const ANCHOR_MONDAY='2026-08-31';

export async function extractPdfText(buffer){
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc=await pdfjs.getDocument({data:buffer}).promise;const pages=[];
  for(let pageNo=1;pageNo<=doc.numPages;pageNo++){
    const page=await doc.getPage(pageNo);const content=await page.getTextContent();
    const items=content.items.filter(i=>typeof i.str==='string').map(i=>({text:cleanText(i.str),x:i.transform?.[4]??0,y:i.transform?.[5]??0,w:i.width??0,h:i.height??0})).filter(i=>i.text);
    pages.push({pageNo,items});
  }
  return pages;
}

function linesFromPage(page){
  const sorted=[...page.items].sort((a,b)=>b.y-a.y||a.x-b.x);const groups=[];
  for(const item of sorted){const last=groups[groups.length-1];if(last&&Math.abs(last.y-item.y)<=3.2)last.items.push(item);else groups.push({y:item.y,items:[item]});}
  return groups.map(g=>{const items=[...g.items].sort((a,b)=>a.x-b.x);return{y:g.y,items,text:cleanText(items.map(x=>x.text).join(' '))};});
}
function groupHeader(lines){
  for(const line of lines.slice(0,18)){
    const matches=[];for(const item of line.items){if(/^\d{3,4}[А-ЯA-Z]{0,3}$/i.test(item.text)){matches.push({group:normalizeGroup(item.text),x:item.x});}}
    if(matches.length>=3)return [...new Map(matches.map(x=>[x.group,x])).values()].sort((a,b)=>a.x-b.x);
  }
  return [];
}
function weekDate(week,day){const d=new Date(`${ANCHOR_MONDAY}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+(week-1)*7+(DAY_OFFSETS[day]??0));return d.toISOString().slice(0,10);}
function academicYearForMonth(month){return month>=8?2026:2027;}
function explicitDateFromLine(text){const m=text.match(/\b(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?\b/);if(!m)return null;const day=Number(m[1]),month=Number(m[2]);let year;if(m[3]){year=Number(m[3].length===2?'20'+m[3]:m[3]);if(year<2025||year>2029)return null;}else year=academicYearForMonth(month);if(day<1||day>31||month<1||month>12)return null;const dt=new Date(Date.UTC(year,month-1,day));return dt.getUTCFullYear()===year&&dt.getUTCMonth()===month-1&&dt.getUTCDate()===day?`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`:null;}
function columnForX(x,columns){if(!columns.length)return null;let bestIndex=0,dist=Math.abs(x-columns[0].x);for(let i=1;i<columns.length;i++){const d=Math.abs(x-columns[i].x);if(d<dist){bestIndex=i;dist=d;}}const best=columns[bestIndex];const left=bestIndex===0?best.x-40:(columns[bestIndex-1].x+best.x)/2;const right=bestIndex===columns.length-1?best.x+40:(best.x+columns[bestIndex+1].x)/2;return x>=left&&x<=right?best.group:null;}
function parseCell(text){const raw=cleanText(text);if(!raw||/^[-–—]+$/.test(raw))return null;const withoutMarkers=raw.replace(/\b(?:поток\s*[ABБ])\b/ig,'');const weekMatches=withoutMarkers.match(/\([^)]*\)/g)??[];const weeks=weekMatches.flatMap(x=>weekSpec(x));let body=withoutMarkers.replace(/\([^)]*\)/g,' ').trim();const locMatch=body.search(/\b(?:ауд\.?|аудитория|ул\.|пр\.|корпус|лит\.|башня|солнечное|кпк|цдти|лрк|мнтк|база|длрк)\b/i);let location='';if(locMatch>=0){location=cleanLocation(body.slice(locMatch));body=body.slice(0,locMatch).trim();}const subjects=body.split(/\s+\/\s+|(?<=\S)\s*\|\s*/).map(cleanSubject).filter(Boolean);if(!subjects.length)return null;return{subjects,weeks,location};}
function buildDates(explicitDate,day,weeks){if(explicitDate)return[explicitDate];return[...new Set(weeks.map(w=>weekDate(w,day)))];}

export function parsePdfPages(pages,{program,course,source}){
  const allText=pages.flatMap(p=>p.items.map(i=>i.text)).join(' ');const specialty=allText.match(SPECIALTY_RE)?.[1]??null;
  if(specialty&&specialty!==program)throw new Error(`Источник «${source.title}» содержит специальность ${specialty}, ожидалась ${program}`);
  const events=[];const warnings=[];
  for(const page of pages){
    const lines=linesFromPage(page);const columns=groupHeader(lines);const header=lines.slice(0,18).map(l=>l.text).join(' ');const stream=normalizeStream(header)||source.stream||null;
    let day=null,explicitDate=null;
    for(let i=0;i<lines.length;i++){
      const line=lines[i];const dayMatch=line.text.match(DAY_RE);
      if(dayMatch){day=dayMatch[1].toUpperCase();explicitDate=explicitDateFromLine(line.text);}
      const lineDate=explicitDateFromLine(line.text);if(lineDate)explicitDate=lineDate;
      const tm=timeRange(line.text);if(!tm)continue;
      const bufferByGroup=new Map();const flat=[];
      for(let j=i+1;j<lines.length;j++){
        if(DAY_RE.test(lines[j].text)||timeRange(lines[j].text))break;
        for(const item of lines[j].items){const group=columns.length>=3?columnForX(item.x,columns):'ALL';if(!group)continue;const arr=bufferByGroup.get(group)??[];arr.push(item.text);bufferByGroup.set(group,arr);flat.push(item.text);}
      }
      if(!day)continue;
      if(columns.length>=3){
        for(const col of columns){const cell=parseCell((bufferByGroup.get(col.group)??[]).join(' '));if(!cell)continue;const dates=buildDates(explicitDate,day,cell.weeks);if(!dates.length){warnings.push(`${source.title}: ${col.group} ${day} ${tm.start} имеет занятие без даты/недель`);continue;}for(const date of dates)for(const subject of cell.subjects)events.push({id:`${program}-${course}-${col.group}-${date}-${tm.start}-${subject}`,program,course,group:normalizeGroup(col.group),stream:stream??null,date,start:tm.start,end:tm.end,subject,location:cell.location,teacher:'',type:typeFrom(source.title,subject),weeks:cell.weeks.length?`нед. ${cell.weeks.join(', ')}`:undefined,sourceUrl:source.url,sourceTitle:source.title,sourceKind:'official-pdf',confidence:.92});}
      }else{
        const cell=parseCell(flat.join(' '));if(!cell)continue;const dates=buildDates(explicitDate,day,cell.weeks);if(!dates.length){warnings.push(`${source.title}: ${day} ${tm.start} имеет занятие без даты/недель`);continue;}for(const date of dates)for(const subject of cell.subjects)events.push({id:`${program}-${course}-${stream??'ALL'}-${date}-${tm.start}-${subject}`,program,course,group:'ALL',stream:stream??null,date,start:tm.start,end:tm.end,subject,location:cell.location,teacher:'',type:typeFrom(source.title,subject),weeks:cell.weeks.length?`нед. ${cell.weeks.join(', ')}`:undefined,sourceUrl:source.url,sourceTitle:source.title,sourceKind:'official-pdf',confidence:.84});
      }
      i+=1;
    }
  }
  if(!events.length)warnings.push(`${source.title}: не найдено ни одного безопасного события`);
  return{events,warnings,specialty,source};
}

export async function parseOfficialPdf(buffer,args){return parsePdfPages(await extractPdfText(buffer),args);}

