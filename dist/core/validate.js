import { cleanLocation, cleanSubject, cleanTeacher, isoDate, normalizeCourse, normalizeGroup, normalizeHalf, normalizeStream, normalizeTime, normalizeTimeRange, normalizeType } from './normalize.js';
const VALID_PROGRAMS = new Set(['31.05.01', '31.05.02', '37.05.01']);
export function validateScheduleIndex(payload) {
    const issues = [];
    if (!payload || typeof payload !== 'object') {
        return { ok: false, issues: [{ level: 'error', index: -1, message: 'Ответ источника не является объектом' }] };
    }
    const p = payload;
    if (typeof p.schemaVersion !== 'number')
        issues.push({ level: 'error', index: -1, message: 'Нет schemaVersion' });
    if (typeof p.generatedAt !== 'string')
        issues.push({ level: 'error', index: -1, message: 'Нет generatedAt' });
    if (!p.courses || typeof p.courses !== 'object')
        issues.push({ level: 'error', index: -1, message: 'Нет courses' });
    if (p.specialty && !VALID_PROGRAMS.has(p.specialty))
        issues.push({ level: 'error', index: -1, message: `Неподдерживаемое направление: ${p.specialty}` });
    for (const [key, courseData] of Object.entries((p.courses ?? {}))) {
        if (!normalizeCourse(key))
            issues.push({ level: 'warning', index: -1, message: `Пропущен некорректный курс ${key}` });
        if (courseData && !VALID_PROGRAMS.has(courseData.specialty))
            issues.push({ level: 'warning', index: -1, message: `Курс ${key}: некорректная specialty` });
    }
    return { ok: !issues.some(i => i.level === 'error'), issues };
}
export function normalizeLiveEvents(payload) {
    const result = [];
    const p = payload;
    for (const [courseKey, courseData] of Object.entries(p?.courses ?? {})) {
        const course = normalizeCourse(courseKey);
        if (!course)
            continue;
        const rawEvents = Array.isArray(courseData?.events) ? courseData.events : [];
        for (const [index, raw] of rawEvents.entries()) {
            const date = isoDate(raw?.date ?? raw?.dateHint ?? raw?.weekDate);
            const time = normalizeTimeRange(`${raw?.start ?? ''} ${raw?.end ?? ''}`) ?? normalizeTimeRange(raw?.time);
            const subject = cleanSubject(raw?.subject ?? raw?.discipline ?? raw?.name);
            const group = normalizeGroup(raw?.group ?? raw?.groups ?? '');
            const program = raw?.program ?? courseData?.specialty ?? p?.specialty;
            if (!date || !time || !subject || !VALID_PROGRAMS.has(program))
                continue;
            result.push({ id: String(raw?.id ?? `${program}-${course}-${date}-${time.start}-${time.end}-${subject}-${index}`), program, course: course, group, stream: normalizeStream(raw?.stream), date, start: time.start, end: time.end, subject, location: cleanLocation(raw?.location), teacher: cleanTeacher(raw?.teacher), type: normalizeType(raw?.type, subject), half: normalizeHalf(raw?.half), weeks: raw?.weekNumber ? `нед. ${raw.weekNumber}` : undefined, sourceUrl: raw?.sourceUrl, sourceTitle: raw?.sourceTitle, sourceKind: 'live-json', confidence: 1 });
        }
    }
    return dedupe(result);
}
export function dedupe(events) {
    const map = new Map();
    for (const e of events) {
        const key = [e.program, e.course, normalizeGroup(e.group), e.stream ?? '', e.date, e.start, e.end, cleanSubject(e.subject).toLowerCase(), cleanLocation(e.location).toLowerCase(), cleanTeacher(e.teacher).toLowerCase(), e.type, e.half ?? ''].join('|');
        if (!map.has(key)) {
            map.set(key, e);
            continue;
        }
        const prev = map.get(key);
        if ((e.confidence ?? 0) > (prev.confidence ?? 0))
            map.set(key, e);
    }
    return [...map.values()];
}
export function validateEvents(events) {
    const issues = [];
    const seen = new Set();
    events.forEach((e, index) => {
        if (!VALID_PROGRAMS.has(e.program))
            issues.push({ level: 'error', index, message: 'Неизвестная программа' });
        if (!isoDate(e.date))
            issues.push({ level: 'error', index, message: `Некорректная дата ${e.date}`, field: 'date' });
        if (!normalizeTime(e.start) || !normalizeTime(e.end))
            issues.push({ level: 'error', index, message: 'Некорректное время', field: 'time' });
        if (!e.subject)
            issues.push({ level: 'error', index, message: 'Пустая дисциплина', field: 'subject' });
        const key = [e.program, e.course, normalizeGroup(e.group), e.stream ?? '', e.date, e.start, e.end, e.subject.toLowerCase(), e.type, e.half ?? ''].join('|');
        if (seen.has(key))
            issues.push({ level: 'warning', index, message: 'Дубликат события' });
        seen.add(key);
    });
    return issues;
}
