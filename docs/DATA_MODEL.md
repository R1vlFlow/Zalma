# Normalized schedule data model

An event is the single atomic UI unit.

```ts
interface ScheduleEvent {
  id: string;
  program: '31.05.01' | '31.05.02' | '37.05.01';
  course: 1 | 2 | 3 | 4 | 5 | 6;
  group: string;          // exact group or ALL
  stream: 'A' | 'B' | null;
  date: 'YYYY-MM-DD';
  start: 'HH:MM';
  end: 'HH:MM';
  subject: string;
  location: string;
  teacher: string;
  type: 'lecture' | 'practice' | 'lab' | 'assessment' | 'other';
  half?: '1/2' | '2/2';
  weeks?: string;
  sourceUrl?: string;
  sourceTitle?: string;
  sourceKind?: string;
  confidence?: number;
}
```

The UI only receives valid events. Raw tables never reach rendering.
