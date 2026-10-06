import type { Task } from '../core/types.js';
const KEY='almazov.tasks.v2';
export function readTasks():Task[]{try{const raw=localStorage.getItem(KEY);const parsed=raw?JSON.parse(raw):[];return Array.isArray(parsed)?parsed:[];}catch{return[];}}
export function writeTasks(tasks:Task[]){localStorage.setItem(KEY,JSON.stringify(tasks));}
export function addTask(task:Task){const tasks=readTasks();tasks.push(task);writeTasks(tasks);}
export function updateTask(id:string,patch:Partial<Task>){writeTasks(readTasks().map(t=>t.id===id?{...t,...patch}:t));}
export function removeTask(id:string){writeTasks(readTasks().filter(t=>t.id!==id));}
