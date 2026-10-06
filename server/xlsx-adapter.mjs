import { normalizeGroupList, cleanText, cleanSubject, cleanLocation, cleanTeacher, normalizeStream, timeRange, typeFrom, parseWeekSpec, normalizeHalf, isoDate } from './normalize.mjs';
import { academicAnchorMonday, mondayFromWeek, addDays } from './academic-config.mjs';

const DAYS={пн:1,понедельник:1,вт:2,вторник:2,ср:3,среда:3,чт:4,четверг:4,пт:5,пятница:5,сб:6,суббота:6,вс:7,воскресенье:7};
const GROUP_RE=/^\d{3,4}[А-ЯA-Z]{0,3}$/i;

function dayFromText(value){const s=cleanText(value).toLowerCase();for(const [k,v] of Object.entries(DAYS))if(new RegExp(`(?:^|\\s)${k}(?=\\s|$|\\d|[.,])`).test(s))return v;return null;}
function dateFromText(value){const s=cleanText(value);const full=s.match(/(?:^|\D)(\d{1,2})[./](\d{1,2})[./](\d{4})(?:\D|$)/);return full?isoDate(`${full[1]}.${full[2]}.${full[3]}`):isoDate(s);}
function expandDates(day,weeks,date){if(date)return[date];if(!day||!weeks.length)return[];return weeks.map(w=>addDays(mondayFromWeek(w,academicAnchorMonday()),day-1));}

export function matrixWithMerges(ws,XLSX){
  const range=XLSX.utils.decode_range(ws['!ref']??'A1');
  const grid=[];
  for(let r=range.s.r;r<=range.e.r;r++){
    const row=[];
    for(let c=range.s.c;c<=range.e.c;c++){
      const cell=ws[XLSX.utils.encode_cell({r,c})];
      row.push(cleanText(cell?.w??cell?.v??''));
    }
    grid.push(row);
  }
  for(const merge of (ws['!merges']??[])){
    const top=ws[XLSX.utils.encode_cell({r:merge.s.r,c:merge.s.c})];
    const value=cleanText(top?.w??top?.v??'');
    for(let r=merge.s.r;r<=merge.e.r;r++)for(let c=merge.s.c;c<=merge.e.c;c++){
      const rr=r-range.s.r,cc=c-range.s.c;
      if(grid[rr] && !grid[rr][cc])grid[rr][cc]=value;
    }
  }
  return grid;
}

function detectGroupColumns(grid){
  const cols=new Map();
  for(let r=0;r<Math.min(12,grid.length);r++)for(let c=0;c<(grid[r]?.length??0);c++){
    const groups=normalizeGroupList(grid[r][c]).filter(g=>GROUP_RE.test(g));
    if(groups.length){const list=cols.get(c)??[];for(const g of groups)if(!list.includes(g))list.push(g);cols.set(c,list);}
  }
  return cols;
}
function detectDayColumns(grid){
  const cols=new Map();
  for(let r=0;r<Math.min(12,grid.length);r++)for(let c=0;c<(grid[r]?.length??0);c++){
    const cell=grid[r][c]??'';const day=dayFromText(cell);if(day)cols.set(c,{day,date:dateFromText(cell)??''});
  }
  return cols;
}
function isGroupLabel(value){return normalizeGroupList(value).some(g=>GROUP_RE.test(g));}
function makeEvent({program,course,source,group,stream,date,tr,cell,rowText,idx}){
  const locationMatch=cell.match(/(?:ауд(?:итория)?\.?\s*[\w./-]+|корпус\s*[\w./-]+|ул\.?\s*[^;|]+)/i);
  const teacherMatch=cell.match(/(?:преподаватель|доцент|профессор|ассистент|преп\.?)[ :]+([^;|]+)/i);
  const subject=cleanSubject(cell
    .replace(/\b\d{1,2}\s*[:.]\s*\d{2}\b/g,' ')
    .replace(/(?:ауд(?:итория)?\.?\s*[\w./-]+|корпус\s*[\w./-]+)/ig,' ')
    .replace(/\b(?:лекция|пз|практика|лабораторная|семинар)\b/ig,' '));
  if(!subject||subject.length<2)return null;
  const weeks=parseWeekSpec(cell);
  return {id:`${program}-${course}-${group}-${date}-${tr.start}-${idx}`,program,course,group,stream,date,start:tr.start,end:tr.end,subject,location:cleanLocation(locationMatch?.[0]??''),teacher:cleanTeacher(teacherMatch?.[1]??''),type:typeFrom(cell,rowText),half:normalizeHalf(cell),weeks:weeks.length?`нед. ${weeks.join(', ')}`:undefined,sourceUrl:source.url,sourceTitle:source.title,sourceKind:'official-xlsx',confidence:.74};
}

export async function parseOfficialXlsx(buffer,{program,course,source}){
  const XLSX=await import('xlsx');
  const wb=XLSX.read(buffer,{type:'buffer',cellDates:true,cellNF:true,cellStyles:false});
  const events=[],warnings=[];
  for(const name of wb.SheetNames){
    const grid=matrixWithMerges(wb.Sheets[name],XLSX);
    if(!grid.length){warnings.push(`${name}: пустой лист`);continue;}
    const header=grid.slice(0,12).flat().join(' ');const stream=normalizeStream(header)||source.stream||null;
    const dayColumns=detectDayColumns(grid);
    const rowGroupMode=dayColumns.size>=2 && grid.slice(0,10).some(row=>isGroupLabel(row?.[0]??''));
    const groupCols=detectGroupColumns(grid);
    if(!groupCols.size&&!rowGroupMode)warnings.push(`${name}: группа/колонки групп не определены`);
    let currentDay=null,currentDate='',currentWeeks=[];
    for(let r=0;r<grid.length;r++){
      const row=grid[r]??[];const rowText=cleanText(row.join(' '));
      const day=dayFromText(rowText);
      if(day){currentDay=day;currentDate=dateFromText(rowText)??'';currentWeeks=[];}
      else{const date=dateFromText(rowText);if(date)currentDate=date;}
      if(/(?:недел|нед\.?|week)/i.test(rowText)){const ws=parseWeekSpec(rowText);if(ws.length)currentWeeks=ws;}

      if(rowGroupMode){
        const groups=normalizeGroupList(row[0]??'').filter(g=>GROUP_RE.test(g));if(!groups.length)continue;
        for(const [col,meta] of dayColumns){
          const cell=row[col]??'';if(!cell)continue;const tr=timeRange(cell)||timeRange(rowText);if(!tr)continue;
          const dates=expandDates(meta.day,currentWeeks,meta.date);if(!dates.length)continue;
          for(const group of groups)for(const d of dates){const e=makeEvent({program,course,source,group,stream,date:d,tr,cell,rowText,idx:events.length});if(e)events.push(e);}
        }
        continue;
      }

      const tr=timeRange(rowText);if(!tr||!currentDay)continue;const dates=expandDates(currentDay,currentWeeks,currentDate);if(!dates.length)continue;
      if(groupCols.size){
        for(const [col,groups] of groupCols){const cell=row[col]??'';if(!cell||groups.includes(cleanText(cell)))continue;for(const group of groups)for(const d of dates){const e=makeEvent({program,course,source,group,stream,date:d,tr,cell,rowText,idx:events.length});if(e)events.push(e);}}
      } else {
        warnings.push(`${name}:${r+1}: группы не привязаны к колонкам; строки без явной группы пропущены`);
      }
    }
  }
  if(!events.length)warnings.push('XLSX parser: не удалось извлечь безопасных событий');
  return {events,warnings,specialty:program,source};
}
