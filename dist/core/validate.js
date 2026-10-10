import { cleanLocation, cleanSubject, cleanTeacher, isoDate, normalizeCourse, normalizeGroup, normalizeHalf, normalizeStream, normalizeTime, normalizeTimeRange, normalizeType } from './normalize.js?v=2d9a28b1af854a53';
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
function splitDoubleTimes(start, end) {
    const [shs, sms] = start.split(':');
    const [ehs, ems] = end.split(':');
    const sh = Number(shs ?? 0), sm = Number(sms ?? 0), eh = Number(ehs ?? 0), em = Number(ems ?? 0);
    const a = sh * 60 + sm, b = eh * 60 + em, d = b - a;
    if (![185, 205].includes(d))
        return [{ start, end, double: false, durationMinutes: d }];
    const slot = (d - 15) / 2;
    const firstEnd = a + slot;
    const secondStart = firstEnd + 15;
    const fmt = (v) => `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
    return [{ start: fmt(a), end: fmt(firstEnd), double: true, doublePart: 1, durationMinutes: slot }, { start: fmt(secondStart), end: fmt(b), double: true, doublePart: 2, durationMinutes: slot }];
}
export function normalizeWeeklyBlocks(payload, programFilter, courseFilter) {
    const out = [];
    const p = payload;
    for (const [courseKey, courseData] of Object.entries(p?.courses ?? {})) {
        const course = normalizeCourse(courseKey);
        if (!course || (courseFilter !== undefined && course !== courseFilter))
            continue;
        const rawEvents = Array.isArray(courseData?.events) ? courseData.events : [];
        for (const [index, raw] of rawEvents.entries()) {
            if (raw?.scheduleMode !== 'weekly-block' || isoDate(raw?.date ?? raw?.dateHint ?? raw?.weekDate))
                continue;
            const sourceUrl = String(raw?.sourceUrl ?? '');
            if (sourceUrl.startsWith('fixture://') || raw?.sourceKind === 'practice-fallback-fixture' || raw?.parser === 'fixture')
                continue;
            const program = raw?.program ?? courseData?.specialty ?? p?.specialty;
            if (!VALID_PROGRAMS.has(program) || (programFilter !== undefined && program !== programFilter))
                continue;
            const weekStart = isoDate(raw?.weekStart);
            const weekNumber = Number(raw?.weekNumber);
            const time = normalizeTimeRange(`${raw?.start ?? ''} ${raw?.end ?? ''}`) ?? normalizeTimeRange(raw?.time);
            const subject = cleanSubject(raw?.subject ?? raw?.discipline ?? raw?.name);
            if (!weekStart || !Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > 60 || !time || !subject)
                continue;
            const stream = normalizeStream(raw?.stream);
            const rawGroups = Array.isArray(raw?.groups) ? raw.groups : (raw?.group != null ? [raw.group] : []);
            const groups = rawGroups.map(normalizeGroup).filter(Boolean);
            // An unscoped row must not be made visible to every student.
            if (!groups.length)
                continue;
            for (const group of groups) {
                out.push({ id: String(raw?.id ?? `${program}-${course}-${group}-${weekNumber}-${time.start}-${time.end}-${subject}-${index}`), program, course, group, stream, weekNumber, weekStart, weekRangeStart: isoDate(raw?.weekRangeStart) || undefined, weekRangeEnd: isoDate(raw?.weekRangeEnd) || undefined, start: time.start, end: time.end, subject, location: cleanLocation(raw?.location), teacher: cleanTeacher(raw?.teacher), type: normalizeType([raw?.type, raw?.classType, raw?.lessonType, raw?.sessionType].filter(Boolean).join(' '), raw?.subject ?? raw?.discipline ?? raw?.name ?? subject), sourceUrl: sourceUrl || undefined, sourceTitle: typeof raw?.sourceTitle === 'string' ? raw.sourceTitle : undefined });
            }
        }
    }
    const unique = new Map();
    for (const e of out) {
        const key = [e.program, e.course, e.group, e.stream ?? '', e.weekNumber, e.weekStart, e.start, e.end, e.subject.toLocaleLowerCase('ru-RU'), e.location.toLocaleLowerCase('ru-RU')].join('|');
        if (!unique.has(key))
            unique.set(key, e);
    }
    return [...unique.values()].sort((a, b) => a.weekNumber - b.weekNumber || a.group.localeCompare(b.group, 'ru') || a.start.localeCompare(b.start) || a.subject.localeCompare(b.subject, 'ru'));
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
            // Fixture/test schedules are never production timetable data. Fail closed even if a stale or
            // misconfigured remote manifest accidentally includes them.
            const sourceUrl = String(raw?.sourceUrl ?? '');
            const sourceKind = String(raw?.sourceKind ?? '');
            if (sourceUrl.startsWith('fixture://') || sourceKind === 'practice-fallback-fixture' || String(raw?.parser ?? '') === 'fixture')
                continue;
            const directDate = isoDate(raw?.date ?? raw?.dateHint ?? raw?.weekDate);
            // Weekly rotation-matrix columns are not weekday identifiers. Never turn matrixSlots
            // into calendar dates; those assignments are emitted by normalizeWeeklyBlocks instead.
            const weekStart = isoDate(raw?.weekStart);
            const blockDates = directDate ? [directDate] : [];
            const time = normalizeTimeRange(`${raw?.start ?? ''} ${raw?.end ?? ''}`) ?? normalizeTimeRange(raw?.time);
            const subject = cleanSubject(raw?.subject ?? raw?.discipline ?? raw?.name);
            const stream = normalizeStream(raw?.stream);
            const groupValues = Array.isArray(raw?.groups) ? raw.groups : (raw?.group != null ? [raw.group] : []);
            const groups = groupValues.map(normalizeGroup).filter(Boolean);
            const safeGroups = groups.length ? groups : [(stream ? 'ALL' : '')];
            const program = raw?.program ?? courseData?.specialty ?? p?.specialty;
            if (!blockDates.length || !time || !subject || !VALID_PROGRAMS.has(program))
                continue;
            const rawDuration = Number(time.end.slice(0, 2)) * 60 + Number(time.end.slice(3)) - Number(time.start.slice(0, 2)) * 60 - Number(time.start.slice(3));
            const doubleSlots = raw?.doubleIndex === 1 || raw?.doubleIndex === 2
                ? [{ start: time.start, end: time.end, double: true, doublePart: raw.doubleIndex, durationMinutes: Number(raw?.durationMinutes ?? 0) || undefined, doubleOf: raw?.doubleOf }]
                : (raw?.orgMerged === true || raw?.mergedConsecutive === true)
                    ? [{ start: time.start, end: time.end, double: true, durationMinutes: Number(raw?.durationMinutes ?? 0) || rawDuration, doubleOf: raw?.doubleOf }]
                    : splitDoubleTimes(time.start, time.end).map(x => ({ ...x, doubleOf: typeof raw?.doubleOf === 'string' ? raw.doubleOf : (x.doublePart ? `auto:${program}:${course}:${weekStart ?? ''}:${subject}:${time.start}-${time.end}` : undefined) }));
            for (const date of blockDates)
                for (const group of safeGroups) {
                    if (!group)
                        continue;
                    for (const slot of doubleSlots) {
                        result.push({ id: String(raw?.id ? `${raw.id}-${date}-${slot.doublePart ?? 0}` : `${program}-${course}-${group}-${date}-${slot.start}-${slot.end}-${subject}-${index}-${slot.doublePart ?? 0}`), program, course, group, stream, date, start: slot.start, end: slot.end, subject, location: cleanLocation(raw?.location), teacher: cleanTeacher(raw?.teacher), type: normalizeType([raw?.type, raw?.classType, raw?.lessonType, raw?.sessionType].filter(Boolean).join(' '), raw?.subject ?? raw?.discipline ?? raw?.name ?? subject), half: normalizeHalf(raw?.half), double: slot.double, orgMerged: raw?.orgMerged === true || undefined, mergedConsecutive: raw?.mergedConsecutive === true || undefined, doublePart: slot.doublePart, doubleOf: slot.doubleOf, durationMinutes: slot.durationMinutes, weeks: raw?.weekNumber ? `нед. ${Array.isArray(raw.weekNumber) ? raw.weekNumber.join(', ') : String(raw.weekNumber)}` : undefined, sourceUrl: raw?.sourceUrl, sourceTitle: raw?.sourceTitle, sourceKind: 'live-json', confidence: 1 });
                    }
                }
        }
    }
    return mergeAutoSplitDoubleSlots(dedupe(result));
}
function mergeAutoSplitDoubleSlots(events) {
    const ordered = [...events].sort((a, b) => [a.program, a.course, a.group, a.stream ?? '', a.date, a.subject, a.location, a.teacher, a.type, a.half ?? '', a.start].join('|').localeCompare([b.program, b.course, b.group, b.stream ?? '', b.date, b.subject, b.location, b.teacher, b.type, b.half ?? '', b.start].join('|')));
    const out = [];
    let i = 0;
    const identity = (e) => [e.program, e.course, e.group, e.stream ?? '', e.date, e.subject.toLocaleLowerCase('ru-RU'), e.location.toLocaleLowerCase('ru-RU'), e.teacher.toLocaleLowerCase('ru-RU'), e.type, e.half ?? '', e.doubleOf ?? ''].join('|');
    const mins = (v) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3));
    while (i < ordered.length) {
        const first = ordered[i];
        if (!first) {
            i += 1;
            continue;
        }
        const second = ordered[i + 1];
        if (second && typeof first.doubleOf === 'string' && first.doubleOf.startsWith('auto:') && first.doubleOf === second.doubleOf && first.doublePart === 1 && second.doublePart === 2 && identity(first) === identity(second)) {
            const gap = mins(second.start) - mins(first.end);
            if (gap >= 0 && gap <= 20 && mins(second.end) > mins(first.start)) {
                const joined = { ...first, end: second.end, double: true, mergedConsecutive: true, durationMinutes: mins(second.end) - mins(first.start), doublePart: undefined };
                if (/\bОРГ\b|основы\s+российской\s+государственности/i.test(first.subject)) {
                    joined.orgMerged = true;
                    joined.mergedConsecutive = undefined;
                }
                joined.id = first.id.replace(/-1$/, '');
                out.push(joined);
                i += 2;
                continue;
            }
        }
        out.push(first);
        i += 1;
    }
    return out;
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
