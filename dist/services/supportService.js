async function request(path, options = {}) { const id = getClientId(); const headers = new Headers(options.headers); headers.set('x-user-id', id); if (options.body && !headers.has('content-type'))
    headers.set('content-type', 'application/json'); const r = await fetch(path, { ...options, headers, signal: options.signal ?? AbortSignal.timeout(8000) }); if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try {
        const p = await r.json();
        if (typeof p?.error === 'string')
            msg = p.error;
    }
    catch { }
    const e = new Error(msg);
    e.status = r.status;
    throw e;
} return r; }
const KEY = 'almazov.client.id';
function getClientId() { let id = localStorage.getItem(KEY); if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
} return id; }
export async function listTickets() { const r = await request('./api/support/tickets'); return (await r.json()).tickets; }
export async function getTicket(id) { const r = await request(`./api/support/tickets/${encodeURIComponent(id)}`); return (await r.json()).ticket; }
export async function createTicket(input) { const r = await request('./api/support/tickets', { method: 'POST', body: JSON.stringify(input) }); return (await r.json()).ticket; }
export async function addTicketMessage(id, body) { const r = await request(`./api/support/tickets/${encodeURIComponent(id)}/messages`, { method: 'POST', body: JSON.stringify({ body }) }); return (await r.json()).ticket; }
export async function fileToAttachment(file) { if (file.size > 3 * 1024 * 1024)
    throw new Error('Размер одного файла не должен превышать 3 МБ.'); const data = await file.arrayBuffer(); const bytes = new Uint8Array(data); let binary = ''; const chunk = 0x8000; for (let i = 0; i < bytes.length; i += chunk)
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk)); return { name: file.name, type: file.type || 'application/octet-stream', size: file.size, dataBase64: btoa(binary) }; }
