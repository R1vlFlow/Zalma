import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = p => readFile(new URL(p, root), 'utf8');
const [app, html, css, controls, materialStore, storeSource, parser, workflow, version, pythonParser, serviceWorker] = await Promise.all([
  read('src/app.ts'), read('public/index.html'), read('public/styles.css'), read('src/ui/customControls.ts'),
  read('src/services/materialStore.ts'), read('src/services/personalizationStore.ts'), read('server/pipeline.mjs'),
  read('.github/workflows/pages.yml'), read('version.json'), read('scripts/build_official_schedule.py'), read('public/sw.js')
]);

class MemoryStorage {
  constructor(entries = {}) { this.values = new Map(Object.entries(entries)); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

test('Phase 2 build metadata and support Telegram link are defined', () => {
  const v = JSON.parse(version);
  assert.equal(v.version, '2.6.0-rc.1');
  assert.match(html, /https:\/\/t\.me\/R1vlFlow_GY/);
  assert.match(html, /@R1vlFlow_GY/);
});

test('uploaded study materials use IndexedDB, scope metadata and safe file limits', async () => {
  assert.match(materialStore, /indexedDB\.open\(DB_NAME, DB_VERSION\)/);
  assert.match(materialStore, /createIndex\('scope'/);
  assert.match(materialStore, /MAX_MATERIAL_FILE_SIZE = 25 \* 1024 \* 1024/);
  for (const ext of ['pdf','docx','xlsx','pptx','zip','jpg','jpeg','png']) assert.ok(materialStore.includes(`'${ext}'`), `missing file type ${ext}`);
  assert.match(html, /id="materialDropZone"/);
  assert.match(html, /id="fileMaterialInput" type="file"/);
  assert.match(app, /saveFileMaterial\(/);
  assert.match(app, /listFileMaterials\(materialScope/);
  assert.doesNotMatch(materialStore, /localStorage\.setItem/);
});

test('custom select/date controls support theme, keyboard, current day, weekends and homework due markers', () => {
  assert.match(controls, /data-ui-select-trigger/);
  assert.match(controls, /option\.dataset\.icon/);
  assert.match(controls, /option\.dataset\.color/);
  assert.match(controls, /data-ui-date-toggle/);
  assert.match(controls, /ArrowDown/);
  assert.match(controls, /ArrowUp/);
  assert.match(controls, /data-ui-date-day/);
  assert.match(controls, /ui-date-day.*has-tasks/);
  assert.match(controls, /dueDateSet\(\)/);
  assert.match(css, /\.ui-date-day\.has-tasks::after/);
  assert.match(css, /\.ui-select-menu\[hidden\],\.ui-date-popover\[hidden\]/);
  assert.match(css, /@media\(max-width:360px\)/);
});

test('dashboard provides upcoming class, today timeline, nearest homework deadlines and quick actions', () => {
  for (const id of ['homeHero','homeTodayTimeline','homeDeadlines']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(app, /id=\"homeCountdownValue\"/);
  assert.match(app, /function countdownLabel\(/);
  assert.match(app, /function renderHome\(/);
  assert.match(app, /const dueTasks=state\.tasks\.filter/);
  assert.match(app, /const next=events\.filter\(e=>e\.kind==='schedule'&&Date\.parse\(e\.startAt\)>now\)/);
  assert.match(app, /data-action="add-task"/);
  assert.match(html, /Карта корпуса/);
});

test('smart homework action is linked to schedule events and calculates next matching class', () => {
  assert.match(app, /data-homework-from-event/);
  assert.match(app, /function openTaskFromEvent\(id:string\)/);
  assert.match(app, /subjectColorKey\(eventSubject\(e\)\)===subjectColorKey\(subject\)/);
  assert.match(app, /openTask\(subject,next\?localDateTimeInput\(next\.startAt,state\.timezone\):''\)/);
});

test('migration safely upgrades old profile and materials without clearing legacy keys', async () => {
  globalThis.localStorage = new MemoryStorage({
    'almazov.profile': JSON.stringify({ program: '31.05.02', course: 2, group: '221', nickname: 'Legacy Nick', avatarPreset: '🩺', accentColor: '#167d6a' }),
    'almazov.appearance': JSON.stringify({ double1: '#123456', double2: '#abcdef', subjectColors: { 'фармакология': '#167d6a' } }),
    'almazov.theme': 'dark',
    'almazov.timezone': 'Europe/Zurich',
    'almazov.tasks.v2': JSON.stringify([{ id: 'old-task', subject: 'Фармакология', text: 'Старое задание', due: '2026-10-12T18:00', done: false, status: 'in_progress', priority: 'high', createdAt: '2026-10-01T12:00:00.000Z' }]),
    'almazov.materials.v1': JSON.stringify([{ id: 'old-material', title: 'Старый конспект', subject: 'Фармакология', category: 'lecture', description: 'Проверенный файл', url: 'https://example.org/notes.pdf', tags: ['важно'], createdAt: '2026-10-01T12:00:00.000Z' }])
  });
  const store = await import('../dist/services/personalizationStore.js?phase2-migration');
  const migrated = store.readPersonalization();
  assert.equal(migrated.version, 2);
  assert.deepEqual(migrated.academicProfile, { program: '31.05.02', course: 2, group: '221' });
  assert.equal(migrated.displayName, 'Legacy Nick');
  assert.equal(migrated.avatarPreset, '🩺');
  assert.equal(migrated.accentColor, '#167d6a');
  assert.equal(migrated.theme, 'dark');
  assert.equal(migrated.timezone, 'Europe/Zurich');
  assert.equal(migrated.tasks[0].id, 'old-task');
  assert.equal(migrated.tasks[0].status, 'in_progress');
  assert.equal(migrated.tasks[0].due, '2026-10-12T18:00');
  assert.equal(migrated.materials[0].id, 'old-material');
  assert.deepEqual(migrated.materials[0].tags, ['важно']);
  assert.equal(globalThis.localStorage.getItem('almazov.data.schemaVersion'), '2');
  assert.ok(globalThis.localStorage.getItem('almazov.tasks.v2'), 'legacy task key must not be deleted');
  assert.ok(globalThis.localStorage.getItem('almazov.profile'), 'legacy profile key must not be deleted');
  assert.ok(globalThis.localStorage.getItem('almazov.materials.v1'), 'legacy materials key must not be deleted');
});

test('old central personalization payload is backed up before schema upgrade', async () => {
  const original = JSON.stringify({ version: 1, academicProfile: { program: '31.05.01', course: 3, group: '321' }, displayName: 'Keep me', tasks: [{ id: 'valid', subject: 'Анатомия', text: 'Сохранить' }, { id: 'unknown-shape', legacyPayload: { keep: true } }], materials: [] });
  globalThis.localStorage = new MemoryStorage({ 'almazov.personalization.v1': original, 'almazov.data.schemaVersion': '1' });
  const store = await import('../dist/services/personalizationStore.js?phase2-central-backup');
  const migrated = store.readPersonalization();
  assert.equal(migrated.version, 2);
  assert.equal(migrated.displayName, 'Keep me');
  assert.equal(migrated.academicProfile.group, '321');
  assert.equal(globalThis.localStorage.getItem('almazov.backup.personalization.pre-v2'), original);
  assert.equal(JSON.parse(globalThis.localStorage.getItem('almazov.personalization.v1')).version, 2);
  assert.equal(globalThis.localStorage.getItem('almazov.data.schemaVersion'), '2');
});

test('double lessons are split without losing part identity and suspicious parser blocks are logged', () => {
  assert.match(parser, /export function splitDoubleTimes/);
  assert.match(parser, /doublePart:1/);
  assert.match(parser, /doublePart:2/);
  assert.match(parser, /invalid duration/);
  assert.match(parser, /long block|PARSER_ANOMALY|duration/);
  assert.match(pythonParser, /PARSER_ANOMALY/);
});

test('deploy workflow is present and data migration does not delete user-owned browser stores', () => {
  assert.match(workflow, /upload-pages-artifact/);
  assert.match(storeSource, /almazov\.data\.schemaVersion/);
  assert.match(storeSource, /Other legacy keys are never removed/);
  assert.match(storeSource, /almazov\.backup\.personalization\.pre-v2/);
  assert.doesNotMatch(storeSource, /localStorage\.clear\(/);
  assert.doesNotMatch(serviceWorker, /indexedDB\.deleteDatabase|localStorage\.clear\(/);
});
