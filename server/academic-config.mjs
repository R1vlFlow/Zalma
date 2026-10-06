const DEFAULT_ANCHOR = '2026-08-31';
const DEFAULT_TZ = 'Europe/Moscow';

function validISODate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return d.toISOString().slice(0, 10) === value;
}

export function academicAnchorMonday(value = process.env.ACADEMIC_ANCHOR_MONDAY ?? DEFAULT_ANCHOR) {
  return validISODate(value) ? value : DEFAULT_ANCHOR;
}

export function academicTimezone() {
  return process.env.ACADEMIC_TIMEZONE || DEFAULT_TZ;
}

export function addDays(date, count) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + count);
  return d.toISOString().slice(0, 10);
}

export function mondayFromWeek(week, anchor = academicAnchorMonday()) {
  const n = Number(week);
  if (!Number.isInteger(n) || n < 1 || n > 52) return null;
  return addDays(anchor, (n - 1) * 7);
}
