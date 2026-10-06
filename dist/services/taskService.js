const KEY = 'almazov.tasks.v2';
export function readTasks() { try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
}
catch {
    return [];
} }
export function writeTasks(tasks) { localStorage.setItem(KEY, JSON.stringify(tasks)); }
export function addTask(task) { const tasks = readTasks(); tasks.push(task); writeTasks(tasks); }
export function updateTask(id, patch) { writeTasks(readTasks().map(t => t.id === id ? { ...t, ...patch } : t)); }
export function removeTask(id) { writeTasks(readTasks().filter(t => t.id !== id)); }
