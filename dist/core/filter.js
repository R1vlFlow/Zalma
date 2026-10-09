import { cleanText, normalizeGroup, normalizeStream } from './normalize.js?v=8b54ecbe24579506';
import { addDays } from './date.js?v=8b54ecbe24579506';
export function eventAppliesToGroup(event, group) {
    if (event.program !== group.program || event.course !== group.course)
        return false;
    const eg = normalizeGroup(event.group), gg = normalizeGroup(group.group);
    const common = eg === 'ALL' || eg === '*' || eg === 'ОБЩИЕ' || eg === 'ОБЩАЯ' || eg === 'ВСЕ';
    if (!common && eg !== gg)
        return false;
    const es = event.stream ?? normalizeStream(event.stream), gs = group.stream ?? null;
    if (es && gs && es !== gs)
        return false;
    if (common)
        return !es || !gs || es === gs;
    return true;
}
export function filterEvents(events, group, monday, search, type) {
    const q = cleanText(search).toLowerCase(), to = addDays(monday, 6);
    return events.filter(e => eventAppliesToGroup(e, group))
        .filter(e => e.date >= monday && e.date <= to)
        .filter(e => type === 'all' || e.type === type)
        .filter(e => !q || `${e.subject} ${e.location} ${e.teacher} ${e.stream ?? ''} ${e.weeks ?? ''}`.toLowerCase().includes(q))
        .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || a.subject.localeCompare(b.subject, 'ru'));
}
export function indexByDate(events) { const map = new Map(); for (const e of events) {
    const arr = map.get(e.date) ?? [];
    arr.push(e);
    map.set(e.date, arr);
} return map; }
