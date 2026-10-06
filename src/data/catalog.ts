import type { Course, Program, ProgramCode, SourceDescriptor } from '../core/types.js';
export const STUDENT_PAGE='https://education.almazovcentre.ru/about_institute/programm/specialist_programme/student/';
export const ELECTRONIC_SCHEDULE='https://education.almazovcentre.ru/elektronnoe-raspisanie/';
export const LIVE_LD_JSON='https://raw.githubusercontent.com/R1vlFlow/Zalma/main/data/official-schedules.json';

export const PROGRAMS:Program[]=[
 {code:'31.05.01',title:'Лечебное дело',shortTitle:'ЛД',faculty:'Лечебный факультет',scheduleCourses:[1,2,3,4,5,6],publishedCourses:[1,2,3,4,5,6],officialStudentUrl:STUDENT_PAGE},
 {code:'31.05.02',title:'Педиатрия',shortTitle:'Педиатрия',faculty:'Педиатрический факультет',scheduleCourses:[1,2,3,4,5,6],publishedCourses:[1,2],officialStudentUrl:STUDENT_PAGE},
 {code:'37.05.01',title:'Клиническая психология',shortTitle:'Клин. психология',faculty:'Факультет психологии',scheduleCourses:[1,2,3,4,5,6],publishedCourses:[1,2],officialStudentUrl:STUDENT_PAGE}
];

const pdf=(id:string,program:ProgramCode,course:Course,title:string,url:string,status:SourceDescriptor['status'],stream?:'A'|'B',notes?:string):SourceDescriptor=>({id,program,course,kind:'official-pdf',title,url,status,expectedSpecialty:program,stream:stream??null,notes});
export const SOURCES:SourceDescriptor[]=[

 ...([1,2,3,4,5,6] as Course[]).map(course=>({id:`ld-live-${course}`,program:'31.05.01' as ProgramCode,course,kind:'live-json' as const,title:`ЛД · ${course} курс · официальный live snapshot`,url:LIVE_LD_JSON,status:'verified' as const,expectedSpecialty:'31.05.01' as ProgramCode} as SourceDescriptor)),
 pdf('ld1-a-lecture', '31.05.01',1,'ЛД · 1 курс · лекции · поток A','https://education.almazovcentre.ru/wp-content/uploads/2026/09/raspisanielekczij_1k_a_osen_1-nedelya.pdf','published','A'),
 pdf('ld1-b-lecture','31.05.01',1,'ЛД · 1 курс · лекции · поток Б','https://education.almazovcentre.ru/wp-content/uploads/2026/09/raspisanielekczij_1k_b_osen_1-nedelya.pdf','published','B'),
 pdf('ld1-a-practice','31.05.01',1,'ЛД · 1 курс · ПЗ · поток A','https://education.almazovcentre.ru/wp-content/uploads/2026/09/1k_ld_a-26-27-na-sajt.pdf','published','A'),
 pdf('ld1-b-practice','31.05.01',1,'ЛД · 1 курс · ПЗ · поток Б','https://education.almazovcentre.ru/wp-content/uploads/2026/09/1k_ld_b-26-27-na-sajt.pdf','published','B'),
 pdf('ld2-a-practice','31.05.01',2,'ЛД · 2 курс · ПЗ · поток A','https://education.almazovcentre.ru/wp-content/uploads/2026/09/2k_ld_a-26-27-na-sajt.pdf','published','A'),
 pdf('ld2-b-practice','31.05.01',2,'ЛД · 2 курс · ПЗ · поток Б','https://education.almazovcentre.ru/wp-content/uploads/2026/09/2k_ld_b-26-27-na-sajt.pdf','published','B'),
 pdf('ld3-a-practice','31.05.01',3,'ЛД · 3 курс · ПЗ · поток A','https://education.almazovcentre.ru/wp-content/uploads/2026/09/3k_ld_a-26-27-na-sajt.pdf','published','A'),
 pdf('ld3-b-practice','31.05.01',3,'ЛД · 3 курс · ПЗ · поток Б','https://education.almazovcentre.ru/wp-content/uploads/2026/09/3k_ld_b-26-27-na-sajt.pdf','published','B'),
 pdf('ld4-a-lecture','31.05.01',4,'ЛД · 4 курс · лекции · поток A','https://education.almazovcentre.ru/wp-content/uploads/2026/08/raspisanielekczij_4k_a_osen_1-nedelya.pdf','published','A'),
 pdf('ld4-b-lecture','31.05.01',4,'ЛД · 4 курс · лекции · поток Б','https://education.almazovcentre.ru/wp-content/uploads/2026/08/raspisanielekczij_4k_b_osen_1-nedelya.pdf','published','B'),
 pdf('ld4-a-practice','31.05.01',4,'ЛД · 4 курс · ПЗ · поток A','https://education.almazovcentre.ru/wp-content/uploads/2026/10/4k_ld_a-26-27-na-sajt.pdf','published','A'),
 pdf('ld4-b-practice','31.05.01',4,'ЛД · 4 курс · ПЗ · поток Б','https://education.almazovcentre.ru/wp-content/uploads/2026/09/4k_ld_b-26-27-na-sajt.pdf','published','B'),
 pdf('ld5-a-lecture','31.05.01',5,'ЛД · 5 курс · лекции · поток A','https://education.almazovcentre.ru/wp-content/uploads/2026/09/raspisanielekczij_5k_a_osen-1-1.pdf','published','A'),
 pdf('ld5-b-lecture','31.05.01',5,'ЛД · 5 курс · лекции · поток Б','https://education.almazovcentre.ru/wp-content/uploads/2026/09/raspisanielekczij_5k_b_osen-1.pdf','published','B'),
 pdf('ld5-a-practice','31.05.01',5,'ЛД · 5 курс · ПЗ · поток A','https://education.almazovcentre.ru/wp-content/uploads/2026/09/5k_ld_a-26-27-na-sajt.pdf','published','A'),
 pdf('ld6-lecture-first','31.05.01',6,'ЛД · 6 курс · лекции · 1 неделя','https://education.almazovcentre.ru/wp-content/uploads/2026/09/raspisanielekczij_6k_osen_1-nedelya.pdf','published'),
 pdf('ld6-lecture-autumn','31.05.01',6,'ЛД · 6 курс · лекции · осень','https://education.almazovcentre.ru/wp-content/uploads/2026/09/raspisanielekczij_6k_osen.pdf','published'),
 pdf('ld6-practice','31.05.01',6,'ЛД · 6 курс · ПЗ','https://education.almazovcentre.ru/wp-content/uploads/2026/09/6k_ld-26-27-na-sajt-1.pdf','published'),
 pdf('peds1-lecture','31.05.02',1,'Педиатрия · 1 курс · лекции','https://education.almazovcentre.ru/wp-content/uploads/2026/09/raspisanielekczij_1k_pediatry_osen.pdf','published'),
 pdf('peds1-practice','31.05.02',1,'Педиатрия · 1 курс · практика','https://education.almazovcentre.ru/wp-content/uploads/2026/09/1k_pediatriya-26-27-na-sajt.pdf','published'),
 pdf('peds2-lecture','31.05.02',2,'Педиатрия · 2 курс · лекции','https://education.almazovcentre.ru/wp-content/uploads/2026/09/raspisanielekczij_2k_pediatry-osen-1.pdf','quarantined',undefined,'Источник должен проходить проверку специальности перед публикацией.'),
 pdf('peds2-practice','31.05.02',2,'Педиатрия · 2 курс · практика','https://education.almazovcentre.ru/wp-content/uploads/2026/09/2k_pediatriya-26-27-na-sajt.pdf','published'),
 pdf('psych1-lecture','37.05.01',1,'Клиническая психология · 1 курс · лекции','https://education.almazovcentre.ru/wp-content/uploads/2026/09/raspisanielekczij_1k_klin_psih_osen.pdf','published'),
 pdf('psych1-seminars','37.05.01',1,'Клиническая психология · 1 курс · семинары','https://education.almazovcentre.ru/wp-content/uploads/2026/09/1k_klin_psih_26-27-na-sajt.pdf','published'),
 pdf('psych2-lecture','37.05.01',2,'Клиническая психология · 2 курс · лекции','https://education.almazovcentre.ru/wp-content/uploads/2026/09/raspisanielekczij_2k_klin_psih_osen.pdf','published'),
 pdf('psych2-seminars','37.05.01',2,'Клиническая психология · 2 курс · семинары','https://education.almazovcentre.ru/wp-content/uploads/2026/09/2k_klin_psih_26-27-na-sajt.pdf','published')
];
for(const program of PROGRAMS){for(let c=1;c<=6;c++){if(program.code!=='31.05.01'&&c>2)SOURCES.push({id:`${program.code}-c${c}-unpublished`,program:program.code,course:c as Course,kind:'unpublished',title:`${program.title} · ${c} курс · расписание`,url:STUDENT_PAGE,status:'unpublished',notes:'Официальная страница на текущую дату не публикует расписание этого курса.'});}}
export function programByCode(code:ProgramCode):Program{return PROGRAMS.find(p=>p.code===code)!;}
export function sourcesFor(program:ProgramCode,course:Course):SourceDescriptor[]{return SOURCES.filter(s=>s.program===program&&s.course===course);}
export function sourceFor(program:ProgramCode,course:Course):string{return sourcesFor(program,course).find(s=>s.status==='published'||s.status==='verified')?.url??STUDENT_PAGE;}
