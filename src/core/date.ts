export function parseISODate(date:string):Date{const [y,m,d]=date.split('-').map(Number);return new Date(Date.UTC(y!,m!-1,d));}
export function formatDateRu(date:string):string{return new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'short'}).format(parseISODate(date)).replace(' г.','');}
export function longDateRu(date:string):string{return new Intl.DateTimeFormat('ru-RU',{weekday:'long',day:'numeric',month:'long'}).format(parseISODate(date));}
export function weekdayIndex(date:string):number{const d=parseISODate(date).getUTCDay();return d===0?6:d-1;}
export function mondayOf(date:string):string{const d=parseISODate(date),idx=weekdayIndex(date);d.setUTCDate(d.getUTCDate()-idx);return d.toISOString().slice(0,10);}
export function addDays(date:string,days:number):string{const d=parseISODate(date);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
export function weekDates(monday:string):string[]{return Array.from({length:7},(_,i)=>addDays(monday,i));}
export function weekNumberFromAnchor(date:string,anchorMonday:string):number{const a=parseISODate(anchorMonday).getTime(),d=parseISODate(mondayOf(date)).getTime();return Math.floor((d-a)/86400000/7)+1;}
export function mondayFromWeek(anchorMonday:string,week:number):string{return addDays(anchorMonday,(week-1)*7);}
export function academicWeekMap(anchorMonday='2026-08-31',count=52):Record<string,string>{const map:Record<string,string>={};for(let n=1;n<=count;n++)map[String(n)]=mondayFromWeek(anchorMonday,n);return map;}
export function sameDay(a:string,b:string):boolean{return a===b;}
export function todayISO(timeZone='Europe/Moscow'):string{return new Intl.DateTimeFormat('en-CA',{timeZone}).format(new Date());}
