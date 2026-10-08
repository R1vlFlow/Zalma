export type ProgramCode = '31.05.01' | '31.05.02' | '37.05.01';
export type Course = 1 | 2 | 3 | 4 | 5 | 6;
export type LessonType = 'lecture' | 'practice' | 'lab' | 'assessment' | 'other';
export type Stream = 'A' | 'B' | null;
export type ThemeMode = 'dark' | 'light' | 'system';
export type LoadStatus = 'loading' | 'live' | 'cache' | 'unavailable' | 'partial' | 'error';

export interface Program {
  code: ProgramCode;
  title: string;
  shortTitle: string;
  faculty: string;
  scheduleCourses: Course[];
  publishedCourses: Course[];
  officialStudentUrl: string;
}

export interface GroupRef {
  program: ProgramCode;
  course: Course;
  group: string;
  stream?: Stream;
}

export interface ScheduleEvent {
  id: string;
  program: ProgramCode;
  course: Course;
  group: string;
  stream: Stream;
  date: string;
  start: string;
  end: string;
  subject: string;
  location: string;
  teacher: string;
  type: LessonType;
  half?: '1/2' | '2/2';
  double?: boolean;
  doublePart?: 1 | 2;
  doubleOf?: string;
  durationMinutes?: number;
  weeks?: string;
  sourceUrl?: string;
  sourceTitle?: string;
  sourceKind?: 'live-json' | 'official-pdf' | 'official-xlsx' | 'official-html' | 'manual';
  confidence?: number;
}

export interface ScheduleIndex {
  schemaVersion: number;
  generatedAt: string;
  sourcePage: string;
  specialty: ProgramCode;
  courses: Record<string, {
    specialty: ProgramCode;
    groups: string[];
    streams?: Record<string, string[]>;
    events?: unknown[];
    sources?: Array<{kind:string; stream?:string; title:string; url:string; events?:number}>;
  }>;
}

export interface SourceDescriptor {
  id: string;
  program: ProgramCode;
  course: Course;
  kind: 'live-json' | 'official-pdf' | 'official-xlsx' | 'official-html' | 'unpublished';
  title: string;
  url: string;
  status: 'verified' | 'published' | 'unpublished' | 'quarantined';
  expectedSpecialty?: ProgramCode;
  stream?: Stream;
  notes?: string;
}

export interface CourseAvailability {
  program: ProgramCode;
  course: Course;
  status: 'published' | 'partial' | 'unpublished';
  sourceCount: number;
  message: string;
}

export interface ScheduleLoadResult {
  status: LoadStatus;
  events: ScheduleEvent[];
  generatedAt?: string;
  sourceUrl?: string;
  sourceName?: string;
  issues: string[];
  message: string;
}

export interface UserProfile {
  program: ProgramCode;
  course: Course;
  group: string;
}

export interface Task {
  id: string;
  subject: string;
  text: string;
  due?: string;
  done: boolean;
  program: ProgramCode;
  course: Course;
  group: string;
  createdAt: string;
}

export interface ParsedTable {
  rows: string[][];
  headers: string[];
  source?: string;
  warnings: string[];
}
