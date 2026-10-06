export function parseISODate(date) { const [y, m, d] = date.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
export function formatDateRu(date) { return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(parseISODate(date)).replace(' г.', ''); }
export function longDateRu(date) { return new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(parseISODate(date)); }
export function weekdayIndex(date) { const d = parseISODate(date).getUTCDay(); return d === 0 ? 6 : d - 1; }
export function mondayOf(date) { const d = parseISODate(date), idx = weekdayIndex(date); d.setUTCDate(d.getUTCDate() - idx); return d.toISOString().slice(0, 10); }
export function addDays(date, days) { const d = parseISODate(date); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
export function weekDates(monday) { return Array.from({ length: 7 }, (_, i) => addDays(monday, i)); }
export function weekNumberFromAnchor(date, anchorMonday) { const a = parseISODate(anchorMonday).getTime(), d = parseISODate(mondayOf(date)).getTime(); return Math.floor((d - a) / 86400000 / 7) + 1; }
export function mondayFromWeek(anchorMonday, week) { return addDays(anchorMonday, (week - 1) * 7); }
export function academicWeekMap(anchorMonday = '2026-08-31', count = 52) { const map = {}; for (let n = 1; n <= count; n++)
    map[String(n)] = mondayFromWeek(anchorMonday, n); return map; }
export function sameDay(a, b) { return a === b; }
export function todayISO(timeZone = 'Europe/Moscow') { return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date()); }
