import { readPersonalization, updatePersonalization } from './personalizationStore.js?v=d2156d5018346a2e';
export function readTasks() { return readPersonalization().tasks.map(t => ({ ...t, status: t.status ?? (t.done ? 'done' : 'todo'), done: (t.status ?? (t.done ? 'done' : 'todo')) === 'done' })); }
export function writeTasks(tasks) { updatePersonalization({ tasks: tasks.map(t => ({ ...t, status: (t.status ?? (t.done ? 'done' : 'todo')), priority: t.priority ?? 'medium', done: (t.status ?? (t.done ? 'done' : 'todo')) === 'done' })) }); }
export function addTask(task) { const tasks = readTasks(); const enriched = { ...task, status: ('status' in task ? task.status : task.done ? 'done' : 'todo') ?? 'todo', priority: ('priority' in task ? task.priority : undefined) ?? 'medium', done: ('status' in task ? task.status : task.done ? 'done' : 'todo') === 'done' }; writeTasks([...tasks, enriched]); }
export function updateTask(id, patch) { writeTasks(readTasks().map(t => t.id === id ? { ...t, ...patch, done: (patch.status ?? t.status) === 'done' } : t)); }
export function removeTask(id) { writeTasks(readTasks().filter(t => t.id !== id)); }
