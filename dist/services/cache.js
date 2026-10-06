const DB_NAME = 'almazov-hub-cache';
const STORE = 'schedule';
const VERSION = 1;
const memory = new Map();
function openDb() { return new Promise((resolve, reject) => { if (typeof indexedDB === 'undefined') {
    reject(new Error('IndexedDB unavailable'));
    return;
} const req = indexedDB.open(DB_NAME, VERSION); req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE))
    req.result.createObjectStore(STORE, { keyPath: 'key' }); }; req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
export async function saveCache(key, payload) { const item = { key, savedAt: Date.now(), payload }; memory.set(key, item); try {
    const db = await openDb();
    await new Promise((resolve, reject) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(item); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
}
catch {
    try {
        localStorage.setItem(`cache:${key}`, JSON.stringify(item));
    }
    catch { /* quota: memory cache remains available */ }
} }
export async function readCache(key, maxAgeMs = 1000 * 60 * 60 * 24 * 14) { const mem = memory.get(key); if (mem && Date.now() - mem.savedAt <= maxAgeMs)
    return mem; try {
    const db = await openDb();
    const item = await new Promise((resolve, reject) => { const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key); req.onsuccess = () => resolve(req.result ?? null); req.onerror = () => reject(req.error); });
    if (item) {
        memory.set(key, item);
        return item;
    }
}
catch { /* fallback */ } try {
    const raw = localStorage.getItem(`cache:${key}`);
    if (raw) {
        const item = JSON.parse(raw);
        if (Date.now() - item.savedAt <= maxAgeMs) {
            memory.set(key, item);
            return item;
        }
    }
}
catch { /* malformed cache is ignored */ } return null; }
export function clearMemoryCache() { memory.clear(); }
