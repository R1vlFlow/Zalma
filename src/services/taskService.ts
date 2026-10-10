import type { Task } from '../core/types.js';
import { readPersonalization, updatePersonalization, type HomeworkTask, type HomeworkStatus } from './personalizationStore.js';

export function readTasks(): HomeworkTask[] { return readPersonalization().tasks.map(t => ({ ...t, status: t.status ?? (t.done ? 'done' : 'todo'), done: (t.status ?? (t.done ? 'done' : 'todo')) === 'done' })); }
export function writeTasks(tasks: Task[]) { updatePersonalization({ tasks: tasks.map(t => ({ ...t, status: ((t as Partial<HomeworkTask>).status ?? (t.done ? 'done' : 'todo')) as HomeworkStatus, priority: (t as Partial<HomeworkTask>).priority ?? 'medium', done: ((t as Partial<HomeworkTask>).status ?? (t.done ? 'done' : 'todo')) === 'done' })) as HomeworkTask[] }); }
export function addTask(task: Task | HomeworkTask) { const tasks = readTasks(); const enriched = { ...task, status: ('status' in task ? task.status : task.done ? 'done' : 'todo') ?? 'todo', priority: ('priority' in task ? task.priority : undefined) ?? 'medium', done: ('status' in task ? task.status : task.done ? 'done' : 'todo') === 'done' } as HomeworkTask; writeTasks([...tasks, enriched]); }
export function updateTask(id: string, patch: Partial<HomeworkTask>) { writeTasks(readTasks().map(t => t.id === id ? { ...t, ...patch, done: (patch.status ?? t.status) === 'done' } : t)); }
export function removeTask(id: string) { writeTasks(readTasks().filter(t => t.id !== id)); }
