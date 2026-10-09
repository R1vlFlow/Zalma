import { LIVE_LD_JSON, PROGRAMS, sourceFor, sourcesFor } from '../data/catalog.js?v=3e057c0da2aed0ed';
import { validateScheduleIndex, normalizeLiveEvents } from '../core/validate.js?v=3e057c0da2aed0ed';
import { saveCache, readCache } from './cache.js?v=3e057c0da2aed0ed';
const API_BASE = './api/schedule';
const memory = new Map();
export async function loadSchedule(program, course) {
    const key = `${program}:${course}`;
    const cachedResult = memory.get(key);
    if (cachedResult && cachedResult.status !== 'error')
        return cachedResult;
    try {
        const api = await fetch(`${API_BASE}?program=${encodeURIComponent(program)}&course=${course}`, { cache: 'no-store' });
        if (api.ok) {
            const payload = await api.json();
            const status = ['partial', 'cache', 'unavailable', 'error', 'live'].includes(payload.status ?? '') ? payload.status : 'live';
            const result = { status, events: Array.isArray(payload.events) ? payload.events : [], generatedAt: payload.generatedAt, sourceUrl: payload.sourceUrl, sourceName: payload.sourceName, issues: Array.isArray(payload.issues) ? payload.issues : [], message: payload.message ?? 'Расписание получено от сервера.' };
            memory.set(key, result);
            return result;
        }
    }
    catch { /* static/offline fallback below */ }
    const staticResult = await loadStaticSnapshot(program, course);
    if (staticResult) {
        memory.set(key, staticResult);
        return staticResult;
    }
    if (program === '31.05.01')
        return loadLdRemote(program, course, key);
    const source = sourcesFor(program, course).find(s => s.status === 'published') ?? sourcesFor(program, course)[0];
    const cached = await readSnapshot(key);
    if (cached) {
        const result = { status: 'cache', events: cached.events ?? [], generatedAt: cached.generatedAt, message: `Показан последний проверенный snapshot. ${source?.title ?? ''}`, issues: [], sourceUrl: source?.url };
        memory.set(key, result);
        return result;
    }
    const pub = PROGRAMS.find(p => p.code === program)?.publishedCourses.includes(course);
    const result = { status: 'unavailable', events: [], sourceUrl: sourceFor(program, course), issues: [], message: pub ? `Официальный источник опубликован, но серверный snapshot сейчас недоступен. Нажмите «Обновить» или откройте официальный источник.` : `Официальное расписание ${PROGRAMS.find(p => p.code === program)?.title ?? program}, ${course} курса, сейчас не опубликовано на странице кабинета студента.` };
    memory.set(key, result);
    return result;
}
async function loadStaticSnapshot(program, course) {
    try {
        const res = await fetch(`./data/schedules/${encodeURIComponent(program)}/${course}.json`, { cache: 'no-store' });
        if (!res.ok)
            return null;
        const payload = await res.json();
        if (!Array.isArray(payload.events) || payload.events.length === 0)
            return null;
        const status = (payload.status === 'partial' ? 'partial' : 'live');
        return { status, events: payload.events, generatedAt: payload.generatedAt, sourceUrl: payload.sourceUrl, sourceName: payload.sourceName, issues: Array.isArray(payload.issues) ? payload.issues : [], message: payload.message ?? `Static snapshot · ${payload.events.length} событий` };
    }
    catch {
        return null;
    }
}
async function loadLdRemote(program, course, key) {
    try {
        const res = await fetch(LIVE_LD_JSON, { cache: 'no-store' });
        if (!res.ok)
            throw new Error(`HTTP ${res.status}`);
        const payload = await res.json();
        const validation = validateScheduleIndex(payload);
        if (!validation.ok)
            throw new Error(validation.issues.filter(i => i.level === 'error').map(i => i.message).join('; '));
        const events = normalizeLiveEvents(payload).filter(e => e.program === program && e.course === course);
        const result = { status: 'live', events, generatedAt: payload.generatedAt, sourceUrl: LIVE_LD_JSON, sourceName: 'official-schedules.json', issues: validation.issues.map(i => i.message), message: `Live snapshot ${formatInstant(payload.generatedAt)} · ${events.length} событий` };
        await saveCache(`raw:${program}`, payload);
        memory.set(key, result);
        return result;
    }
    catch (error) {
        const raw = await readCache(`raw:${program}`);
        const payload = raw?.payload ?? raw;
        if (payload) {
            const events = normalizeLiveEvents(payload).filter(e => e.program === program && e.course === course);
            const result = { status: 'cache', events, generatedAt: payload.generatedAt, sourceUrl: LIVE_LD_JSON, sourceName: 'last verified snapshot', issues: [], message: `Сеть недоступна. Показан последний проверенный snapshot · ${events.length} событий` };
            memory.set(key, result);
            return result;
        }
        const result = { status: 'error', events: [], sourceUrl: LIVE_LD_JSON, issues: [error instanceof Error ? error.message : 'Неизвестная ошибка'], message: 'Не удалось загрузить источник расписания. Проверьте интернет и официальный источник.' };
        memory.set(key, result);
        return result;
    }
}
async function readSnapshot(key) { const raw = await readCache(`snapshot:${key}`); const payload = raw && 'payload' in raw ? raw.payload : raw; if (payload && Array.isArray(payload.events))
    return payload; return null; }
function formatInstant(value) { if (!value)
    return 'время источника неизвестно'; const d = new Date(value); return Number.isNaN(d.getTime()) ? 'время источника неизвестно' : new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Moscow' }).format(d); }
export { sourceFor };
export function clearScheduleMemory() { memory.clear(); }
