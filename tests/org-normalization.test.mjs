import test from 'node:test';
import assert from 'node:assert/strict';

const { normalizeLiveEvents } = await import('../dist/core/validate.js');
const { normalizeOfficialCoursePayload } = await import('../server/pipeline.mjs');

const org = {
  id: 'org-merged', group: '123', groups: ['123'], stream: 'A', date: '2026-10-06',
  start: '09:00', end: '12:25', subject: 'Основы Российской государственности (ОРГ)',
  location: 'ауд. 1', teacher: 'Иванов И.И.', type: 'lecture', orgMerged: true,
  double: true, durationMinutes: 205, doubleMergeReason: 'ORG consecutive slots'
};
const payload = {
  schemaVersion: 7, generatedAt: '2026-10-01T00:00:00Z', specialty: '31.05.01',
  courses: { '1': { specialty: '31.05.01', groups: ['123'], events: [org] } }
};

test('frontend event normalization preserves merged ORG as one continuous event', () => {
  const events = normalizeLiveEvents(payload);
  assert.equal(events.length, 1);
  assert.equal(events[0].start, '09:00');
  assert.equal(events[0].end, '12:25');
  assert.equal(events[0].orgMerged, true);
  assert.equal(events[0].double, true);
  assert.equal(events[0].doublePart, undefined);
});

test('backend API schedule normalization preserves merged ORG as one continuous event', () => {
  const events = normalizeOfficialCoursePayload(payload, '31.05.01', 1, 'https://example.test/schedule.pdf');
  assert.equal(events.length, 1);
  assert.equal(events[0].start, '09:00');
  assert.equal(events[0].end, '12:25');
  assert.equal(events[0].orgMerged, true);
  assert.equal(events[0].doublePart, undefined);
});

test('non-ORG blocks retain the existing split into 1/2 and 2/2', () => {
  const other = { ...org, id: 'biology-long', subject: 'Биология', orgMerged: false, doubleMergeReason: undefined };
  const input = { ...payload, courses: { '1': { specialty: '31.05.01', groups: ['123'], events: [other] } } };
  const events = normalizeLiveEvents(input);
  assert.equal(events.length, 2);
  assert.deepEqual(events.map(event => event.doublePart), [1, 2]);
});
