import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readJson = async p => JSON.parse(await readFile(p, 'utf8'));
const specialist = await readJson('dist/data/program-schedules.json');
const peds1 = await readJson('dist/data/schedules/31.05.02/1.json');
const psych2 = await readJson('dist/data/schedules/37.05.01/2.json');
const ld2 = await readJson('dist/data/schedules/31.05.01/2.json');

if (specialist.dataState === 'local-recovery-snapshot') {
  assert.equal(peds1.status, 'partial');
  assert.match(peds1.message, /восстановительный локальный снимок/i);
  assert.match(peds1.message, /SHA-256/i);
  assert.ok(peds1.issues.includes('NOT_FOR_PRODUCTION'));
  assert.ok(psych2.issues.includes('NOT_FOR_PRODUCTION'));
  assert.equal(ld2.status, 'partial');
  assert.match(ld2.message, /требуют синхронизации с официальным источником/i);
  for (const program of Object.values(specialist.programs)) {
    for (const course of Object.values(program.courses ?? {})) {
      for (const source of course.sources ?? []) {
        if (source.status !== 'published') assert.equal(source.sha256 ?? null, null, 'recovery source must not invent a content hash');
      }
    }
  }
}
for (const doc of [peds1, psych2, ld2]) {
  assert.ok(Array.isArray(doc.events));
  assert.ok(Array.isArray(doc.issues));
  assert.ok(!doc.events.some(e => String(e.sourceUrl ?? '').startsWith('fixture://')), 'fixture events must not ship');
}
console.log('RECOVERY SNAPSHOT UI CONTRACT: PASS — local recovery is visibly partial and never labelled as official/live.');
