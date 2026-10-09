import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const app = await readFile(new URL('../src/app.ts', import.meta.url), 'utf8');
const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
const storeSource = await readFile(new URL('../src/services/personalizationStore.ts', import.meta.url), 'utf8');
const kug = JSON.parse(await readFile(new URL('../dist/data/kug.json', import.meta.url), 'utf8'));

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

test('central personalization store persists profile, theme, subject colors, homework and materials', async () => {
  globalThis.localStorage = new MemoryStorage();
  const store = await import('../dist/services/personalizationStore.js?feature-test');
  const initial = store.readPersonalization();
  const next = store.updatePersonalization({
    displayName: 'Анна Н.', avatarPreset: '🩺', accentColor: '#7c4dff', theme: 'dark',
    academicProfile: { program: '31.05.02', course: 2, group: '221' },
    subjectColors: { [store.subjectColorKey('Фармакология')]: '#167d6a' },
    tasks: [{ id: 't1', subject: 'Фармакология', text: 'Подготовить конспект', due: '2026-10-11T18:00', done: false, status: 'in_progress', priority: 'high', link: 'https://example.org/task', attachmentName: 'task.pdf', attachmentData: 'data:application/pdf;base64,JVBERi0xLjQ=', program: '31.05.02', course: 2, group: '221', createdAt: '2026-10-09T10:00:00.000Z' }],
    materials: [{ id: 'm1', title: 'Лекция', subject: 'Фармакология', category: 'lecture', description: 'Основной материал', url: 'https://example.org/lecture.pdf', tags: ['экзамен', 'конспект'], helpfulness: 5, createdAt: '2026-10-09T10:00:00.000Z' }]
  });
  assert.equal(next.displayName, 'Анна Н.');
  assert.equal(next.academicProfile.group, '221');
  assert.equal(next.theme, 'dark');
  assert.equal(next.subjectColors[store.subjectColorKey('Фармакология')], '#167d6a');
  assert.equal(next.tasks[0].status, 'in_progress');
  assert.equal(next.tasks[0].priority, 'high');
  assert.equal(next.tasks[0].attachmentData, 'data:application/pdf;base64,JVBERi0xLjQ=');
  assert.equal(next.materials[0].category, 'lecture');
  assert.deepEqual(next.materials[0].tags, ['экзамен', 'конспект']);
  assert.equal(next.materials[0].helpfulness, 5);
  assert.ok(globalThis.localStorage.getItem('almazov.personalization.v1'));
  assert.equal(initial.version, 2);
});

test('weekly workweek explicitly includes Monday through Saturday', () => {
  assert.match(app, /if\(state\.view==='workweek'\)\{const m=startOfWeek\(state\.focusDate\);const dates=weekDates\(m\)\.slice\(0,6\)/);
  assert.match(app, /const DAYS=\['Пн','Вт','Ср','Чт','Пт','Сб','Вс'\]/);
  assert.match(app, /from:dates\[0\]!,to:dates\[5\]!,dates/);
  assert.match(app, /function weekdayLabel\(d:string\)/);
  assert.match(app, /<header><span>\$\{weekdayLabel\(date\)\}/);
  assert.match(app, /<span>\$\{weekdayLabel\(d\)\}<\/span>/);
});

test('schedule mode selector and KUG overlays are wired to calendar rendering', () => {
  for (const mode of ['regular', 'kug', 'combined']) assert.match(html, new RegExp(`data-schedule-mode="${mode}"`));
  assert.match(app, /if\(state\.scheduleMode==='kug'\)return \[\]/);
  assert.match(app, /function kugPeriodsFor\(date:string\)/);
  assert.match(app, /function kugTags\(date:string\)/);
  assert.match(app, /function renderKugGrid\(dates:string\[\]\)/);
  assert.match(app, /function renderKugAgenda\(from:string,to:string\)/);
  assert.match(app, /state\.scheduleMode==='kug'&&state\.view==='month'\?monthRangeDates\(\):rangeDates\(\)/);
  assert.match(app, /state\.view==='agenda'\|\|state\.view==='list'\?renderKugAgenda/);
  assert.match(app, /state\.scheduleMode==='combined'\?dates\.map/);
  assert.ok(kug.periods.some(x => x.kind === 'assessment'));
  assert.ok(kug.periods.some(x => x.kind === 'practice'));
});

test('homework form and list support due dates, priorities, statuses, links and files', () => {
  for (const id of ['taskSubject', 'taskDate', 'taskPriority', 'taskText', 'taskLink', 'taskAttachment', 'taskStatusFilter', 'taskSubjectFilter']) assert.match(html, new RegExp(`id="${id}"`));
  for (const status of ['todo', 'in_progress', 'done']) assert.ok(app.includes(`value="${status}"`));
  for (const priority of ['low', 'medium', 'high']) assert.ok(html.includes(`value="${priority}"`));
  assert.match(app, /\.sort\(\(a,b\)=>\{const ad=a\.due\?/);
  assert.match(app, /function taskBadge\(subject:string\)/);
  assert.match(app, /data-task-status=/);
  assert.match(storeSource, /attachmentData: typeof value\.attachmentData === 'string'.*data:/);
});

test('profile form exposes persisted nickname, avatar, group, timezone and accent', () => {
  for (const id of ['profileNickname', 'avatarUpload', 'avatarPresets', 'profileAccent', 'modalProgram', 'modalCourse', 'modalGroup', 'modalTimezone']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(app, /async function saveProfile\(\)/);
  assert.match(app, /cropAvatar\(file:File\)/);
  assert.match(app, /updatePersonalization\(\{displayName:nickname,accentColor:/);
  assert.match(app, /setAcademicProfile\(state\.profile\)/);
  assert.match(app, /function applyAppearance\(\)/);
});

test('subject color uses the same normalized key in calendar, homework, resources and settings', () => {
  assert.match(app, /function subjectColor\(e:CalendarEvent\)/);
  assert.match(app, /subjectColorKey\(t\.subject\)/);
  assert.match(app, /subjectColorKey\(item\.subject\)/);
  assert.match(app, /data-subject-setting=/);
  assert.match(css, /--task-subject-color/);
  assert.match(css, /--resource-subject-color/);
});

test('materials provide knowledge-base search, grouping and category/type filters', () => {
  for (const id of ['resourceSearch', 'resourceSubjectFilter', 'resourceCategoryFilter', 'resourceTypeFilter', 'resourceList', 'materialTags', 'materialHelpfulness']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(app, /function getResourceItems\(\)/);
  assert.match(app, /function resourceCategoryFor\(title:string\)/);
  assert.match(app, /const groups=new Map<string,typeof filtered>/);
  assert.match(app, /function saveMaterial\(\)/);
  assert.match(storeSource, /materials: PersonalMaterial\[\]/);
  assert.match(app, /resource-rating/);
  assert.match(app, /resource-tag/);
});

test('responsive styles cover compact phones and keep content from causing page-wide overflow', () => {
  assert.match(css, /@media\(max-width:430px\)/);
  assert.match(css, /@media\(max-width:360px\)/);
  assert.match(css, /body\{overflow-x:clip\}/);
  assert.match(css, /\.task-row\{grid-template-columns:32px minmax\(0,1fr\)/);
  assert.match(css, /\.resource-card\{grid-template-columns:36px minmax\(0,1fr\)/);
  assert.match(css, /overflow-wrap:anywhere/);
});
