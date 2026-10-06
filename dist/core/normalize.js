export const cleanText = (value) => String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
export const cleanSubject = (value) => cleanText(value)
    .replace(/[–—−]/g, '-')
    .replace(/\s*\*+\s*$/g, '')
    .replace(/^дисциплина\s*[:.-]?\s*/i, '')
    .replace(/\b(?:лекция|практическое занятие|практика|пз|лабораторная работа|лабораторная|семинар(?:ское занятие)?)\b/ig, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,.;:|/\-–—]+|[\s,.;:|/\-–—]+$/g, '')
    .trim();
export const cleanTeacher = (value) => cleanText(value)
    .replace(/^(преподаватель|преп\.|доцент|профессор|ассистент|старший преподаватель)\s*:?[ ]*/i, '')
    .replace(/\s*[,;|]+\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
export const cleanLocation = (value) => cleanText(value)
    .replace(/\bаудитория\s*/i, 'ауд. ')
    .replace(/(?:^|\s)ауд(?:итория)?\.?\s*/i, 'ауд. ')
    .replace(/\s*,\s*,+/g, ',')
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\bлит\.?\s*/i, 'лит. ');
export function normalizeGroup(value) {
    const raw = cleanText(value)
        .replace(/^группа\s*/i, '')
        .replace(/^учебная\s+группа\s*/i, '');
    return raw.toUpperCase().replace(/\s+/g, '');
}
export function normalizeGroupList(value) {
    const raw = cleanText(value).replace(/[–—−]/g, '-');
    if (!raw)
        return [];
    const chunks = raw.split(/[,;/|]+/).flatMap((x) => x.trim() ? [x.trim()] : []);
    const out = [];
    for (const chunk of chunks) {
        const range = chunk.match(/^(\d{3,4}[А-ЯA-Z]{0,3})\s*-\s*(\d{3,4}[А-ЯA-Z]{0,3})$/i);
        if (!range) {
            const tokens = [...chunk.matchAll(/(?:^|[^0-9А-ЯA-Zа-яa-z])([0-9]{3,4}[А-ЯA-ZА-Я]{0,3})(?=$|[^0-9А-ЯA-Zа-яa-z])/gi)].map(m => normalizeGroup(m[1]));
            if (tokens.length) {
                out.push(...tokens);
                continue;
            }
            const normalized = normalizeGroup(chunk);
            if (/^\d{3,4}[А-ЯA-Z]{0,3}$/i.test(normalized))
                out.push(normalized);
            continue;
        }
        const a = range[1].match(/\d+/)[0];
        const b = range[2].match(/\d+/)[0];
        const suffixA = range[1].replace(a, '').toUpperCase();
        const suffixB = range[2].replace(b, '').toUpperCase();
        const from = Number(a), to = Number(b);
        if (!Number.isInteger(from) || !Number.isInteger(to) || from > to || (to - from) > 200) {
            out.push(normalizeGroup(chunk));
            continue;
        }
        const suffix = suffixA === suffixB ? suffixA : '';
        for (let n = from; n <= to; n++)
            out.push(`${n}${suffix}`);
    }
    return [...new Set(out.filter(Boolean))];
}
export function normalizeStream(value) {
    const s = cleanText(value).toUpperCase()
        .replace(/Ё/g, 'Е')
        .replace(/А/g, 'A')
        .replace(/Б/g, 'B');
    if (/^(?:ПОТОК\s*)?A$/.test(s) || /ПОТОК\s*A/.test(s))
        return 'A';
    if (/^(?:ПОТОК\s*)?B$/.test(s) || /ПОТОК\s*B/.test(s))
        return 'B';
    return null;
}
export function normalizeHalf(value) {
    const s = cleanText(value).toLowerCase();
    if (/1\s*\/\s*2|числител/.test(s))
        return '1/2';
    if (/2\s*\/\s*2|знаменател/.test(s))
        return '2/2';
    return undefined;
}
export function normalizeCourse(value) {
    const n = Number(cleanText(value).match(/\b([1-6])\b/)?.[1] ?? '');
    return n >= 1 && n <= 6 ? n : null;
}
export function normalizeType(value, subject = '') {
    const s = `${cleanText(value)} ${cleanText(subject)}`.toLowerCase();
    if (/лекц/.test(s))
        return 'lecture';
    if (/лаб(?:оратор)?/.test(s))
        return 'lab';
    if (/экзам|зач[её]т|аттест|контрол|коллоквиум|дифференц/.test(s))
        return 'assessment';
    if (/пз|практи|семинар|занятия семинарского/.test(s))
        return 'practice';
    return 'other';
}
export function normalizeTime(value) {
    const matches = [...cleanText(value).matchAll(/(^|\D)(\d{1,2})\s*[:.]\s*(\d{2})/g)];
    if (!matches.length)
        return null;
    const h = Number(matches[0][2]), m = Number(matches[0][3]);
    if (h > 23 || m > 59)
        return null;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
export function normalizeTimeRange(value) {
    const s = cleanText(value).replace(/[–—−]/g, '-');
    const tokenPattern = /(\d{1,2})\s*[:.]\s*(\d{2})/g;
    const matches = [...s.matchAll(tokenPattern)];
    if (matches.length < 2)
        return null;
    const hasExplicitRangeSeparator = /(\d{1,2})\s*[:.]\s*(\d{2})\s*(?:-|до)\s*(\d{1,2})\s*[:.]\s*(\d{2})/i.test(s);
    const hasColonTime = matches.slice(0, 2).some((m) => m[0]?.includes(':'));
    if (!hasExplicitRangeSeparator && !hasColonTime)
        return null;
    const h1 = Number(matches[0][1]), m1 = Number(matches[0][2]);
    const h2 = Number(matches[1][1]), m2 = Number(matches[1][2]);
    if ([h1, m1, h2, m2].some((n) => Number.isNaN(n)) || h1 > 23 || h2 > 23 || m1 > 59 || m2 > 59)
        return null;
    const start = `${String(h1).padStart(2, '0')}:${String(m1).padStart(2, '0')}`;
    const end = `${String(h2).padStart(2, '0')}:${String(m2).padStart(2, '0')}`;
    return start < end ? { start, end } : null;
}
export function isoDate(value) {
    const s = cleanText(value).replace(/[–—−]/g, '-');
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m)
        return validDate(Number(m[1]), Number(m[2]), Number(m[3])) ? s : null;
    m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (m)
        return validDate(Number(m[3]), Number(m[2]), Number(m[1]))
            ? `${m[3]}-${String(Number(m[2])).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}` : null;
    return null;
}
export function normalizeDateRange(value) {
    const s = cleanText(value).replace(/[–—−]/g, '-');
    const ds = [...s.matchAll(/(\d{1,2}[.]\d{1,2}[.]\d{4}|\d{4}-\d{2}-\d{2})/g)].map(m => isoDate(m[1]));
    return ds.length >= 2 && ds[0] && ds[1] ? { from: ds[0], to: ds[1] } : null;
}
export function parseWeekSpec(value) {
    const s = cleanText(value).replace(/[–—−]/g, '-').replace(/\b[12]\s*\/\s*2\b/g, ' ');
    const out = [];
    for (const range of [...s.matchAll(/\b(\d{1,2})\s*-\s*(\d{1,2})\b/g)]) {
        const a = Number(range[1]), b = Number(range[2]);
        if (a > 0 && b >= a && b - a <= 30)
            for (let n = a; n <= b; n++)
                out.push(n);
    }
    for (const m of s.matchAll(/\b\d{1,2}\b/g))
        out.push(Number(m[0]));
    return [...new Set(out.filter(n => n >= 1 && n <= 52))].sort((a, b) => a - b);
}
function validDate(y, m, d) { const dt = new Date(Date.UTC(y, m - 1, d)); return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d; }
