const KEY = 'almazov.personal.events.v3';
const USER_KEY = 'almazov.client.id';
let apiAvailable = true;
export function clientId() { let id = localStorage.getItem(USER_KEY); if (id)
    return id; id = crypto.randomUUID(); localStorage.setItem(USER_KEY, id); return id; }
function localRead() { try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw) ? raw : [];
}
catch {
    return [];
} }
function localWrite(events) { localStorage.setItem(KEY, JSON.stringify(events)); }
async function request(path, options = {}) { const headers = new Headers(options.headers); headers.set('x-user-id', clientId()); if (options.body && !headers.has('content-type'))
    headers.set('content-type', 'application/json'); let response; try {
    response = await fetch(path, { ...options, headers, signal: options.signal ?? AbortSignal.timeout(8000) });
}
catch (error) {
    const networkError = new Error('Сервер недоступен или соединение потеряно.');
    networkError.status = 0;
    throw networkError;
} if (!response.ok) {
    let msg = `HTTP ${response.status}`;
    try {
        const p = await response.json();
        if (typeof p?.error === 'string')
            msg = p.error;
    }
    catch { }
    const error = new Error(msg);
    error.status = response.status;
    throw error;
} return response; }
function isLegacyApiMiss(err) { const status = err.status; return status === 404 || status === 405; }
function isNetworkError(err) { return err.status === 0; }
export async function listPersonalEvents(fromUtc, toUtc) {
    if (apiAvailable) {
        try {
            const res = await request(`./api/events?from=${encodeURIComponent(fromUtc)}&to=${encodeURIComponent(toUtc)}`);
            const payload = await res.json();
            return Array.isArray(payload.events) ? payload.events : [];
        }
        catch (err) {
            if (isLegacyApiMiss(err) || isNetworkError(err)) {
                apiAvailable = false;
            }
            else {
                throw err;
            }
        }
    }
    const from = Date.parse(fromUtc), to = Date.parse(toUtc);
    return localRead().filter(e => Date.parse(e.endAt) > from && Date.parse(e.startAt) < to).sort((a, b) => a.startAt.localeCompare(b.startAt));
}
export async function createPersonalEvent(input) {
    if (apiAvailable) {
        try {
            const res = await request('./api/events', { method: 'POST', body: JSON.stringify(input) });
            const p = await res.json();
            return p.event;
        }
        catch (err) {
            if (!isLegacyApiMiss(err) && !isNetworkError(err))
                throw err;
            apiAvailable = false;
        }
    }
    const event = { ...input, id: crypto.randomUUID(), kind: 'personal', readOnly: false };
    const arr = localRead();
    arr.push(event);
    localWrite(arr);
    return event;
}
export async function updatePersonalEvent(id, input, scope = 'series') {
    if (apiAvailable) {
        try {
            const res = await request(`./api/events/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ ...input, scope }) });
            const p = await res.json();
            return p.event;
        }
        catch (err) {
            if (!isLegacyApiMiss(err) && !isNetworkError(err))
                throw err;
            apiAvailable = false;
        }
    }
    const arr = localRead();
    const idx = arr.findIndex(x => x.id === id);
    if (idx < 0)
        throw new Error('Событие не найдено');
    const next = { ...arr[idx], ...input, id: arr[idx].id, kind: 'personal', readOnly: false };
    arr[idx] = next;
    localWrite(arr);
    return next;
}
export async function deletePersonalEvent(id, scope = 'series') {
    if (apiAvailable) {
        try {
            await request(`./api/events/${encodeURIComponent(id)}?scope=${encodeURIComponent(scope)}`, { method: 'DELETE' });
            return;
        }
        catch (err) {
            if (!isLegacyApiMiss(err) && !isNetworkError(err))
                throw err;
            apiAvailable = false;
        }
    }
    const arr = localRead();
    const target = arr.find(x => x.id === id);
    if (!target)
        throw new Error('Событие не найдено');
    if (scope === 'single')
        localWrite(arr.filter(x => x.id !== id));
    else if (scope === 'series' && target.seriesId)
        localWrite(arr.filter(x => x.seriesId !== target.seriesId));
    else if (scope === 'following' && target.seriesId)
        localWrite(arr.filter(x => x.seriesId !== target.seriesId || Date.parse(x.startAt) < Date.parse(target.startAt)));
    else
        localWrite(arr.filter(x => x.id !== id));
}
