import type { Course, ProgramCode, Stream } from '../core/types.js';

const LD_ROSTER: Record<Course, { A: number[]; B: number[] }> = {
  1: { A: [101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122], B: [123,124,125,126,127,128,129,130,131,132,133,134,135] },
  2: { A: [201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216], B: [217,218,219,220,221,222,223,224,225,226,227,228,229] },
  3: { A: [301,302,303,304,305,306,307,308,309,310,311,312], B: [313,314,315,316,317,318,319,320,321,322] },
  4: { A: [401,402,403,404,405,406,407,408,409,410,411,412], B: [413,414,415,416,417,418,419,420,421,422,423,424] },
  5: { A: [501,502,503,504,505,506,507,508,509,510,511,512], B: [513,514,515,516,517,518,519,520,521,522] },
  6: { A: [601,602,603,604,605,606,607,608,609,610,611,612,613,614,615,616,617,618], B: [] },
};

export function groupsFor(program: ProgramCode, course: Course): string[] {
  if (program === '31.05.01') {
    const roster = LD_ROSTER[course];
    return [...roster.A, ...roster.B].map(String);
  }
  if (program === '31.05.02') {
    if (course === 1) return Array.from({ length: 7 }, (_, i) => `${101 + i}П`);
    if (course === 2) return ['201П', '202П', '203П'];
    return [];
  }
  if (program === '37.05.01') {
    if (course === 1) return ['101КП', '102КП'];
    if (course === 2) return ['201КП', '202КП'];
    return [];
  }
  return [];
}

export function streamForGroup(program: ProgramCode, group: string): Stream {
  if (program !== '31.05.01') return null;
  const n = Number.parseInt(group, 10);
  if (!Number.isFinite(n)) return null;
  const course = Math.floor(n / 100) as Course;
  if (!(course in LD_ROSTER)) return null;
  // Course 6 is an explicit no-stream track in the official roster.
  if (course === 6) return null;
  const roster = LD_ROSTER[course];
  if (roster.A.includes(n)) return 'A';
  if (roster.B.includes(n)) return 'B';
  return null;
}

export function rosterFor(program: ProgramCode, course: Course): Record<string, Stream> {
  return Object.fromEntries(groupsFor(program, course).map(group => [group, streamForGroup(program, group)])) as Record<string, Stream>;
}
