export const STUDENT_PAGE='https://education.almazovcentre.ru/about_institute/programm/specialist_programme/student/';
export const LIVE_LD_JSON='https://raw.githubusercontent.com/R1vlFlow/Zalma/main/data/official-schedules.json';
export const SOURCES=[
  {id:'ld-live',program:'31.05.01',course:1,kind:'live-json',url:LIVE_LD_JSON,title:'LD live snapshot',status:'verified'},
  {id:'ld1-a-practice',program:'31.05.01',course:1,kind:'official-pdf',url:'https://education.almazovcentre.ru/wp-content/uploads/2026/09/1k_ld_a-26-27-na-sajt.pdf',title:'ЛД 1 курс ПЗ A',status:'published',stream:'A'},
  {id:'ld1-b-practice',program:'31.05.01',course:1,kind:'official-pdf',url:'https://education.almazovcentre.ru/wp-content/uploads/2026/09/1k_ld_b-26-27-na-sajt.pdf',title:'ЛД 1 курс ПЗ Б',status:'published',stream:'B'},
  {id:'ld2-a-practice',program:'31.05.01',course:2,kind:'official-pdf',url:'https://education.almazovcentre.ru/wp-content/uploads/2026/09/2k_ld_a-26-27-na-sajt.pdf',title:'ЛД 2 курс ПЗ A',status:'published',stream:'A'},
  {id:'ld2-b-practice',program:'31.05.01',course:2,kind:'official-pdf',url:'https://education.almazovcentre.ru/wp-content/uploads/2026/09/2k_ld_b-26-27-na-sajt.pdf',title:'ЛД 2 курс ПЗ Б',status:'published',stream:'B'},
  {id:'ld3-a-practice',program:'31.05.01',course:3,kind:'official-pdf',url:'https://education.almazovcentre.ru/wp-content/uploads/2026/09/3k_ld_a-26-27-na-sajt.pdf',title:'ЛД 3 курс ПЗ A',status:'published',stream:'A'},
  {id:'ld3-b-practice',program:'31.05.01',course:3,kind:'official-pdf',url:'https://education.almazovcentre.ru/wp-content/uploads/2026/09/3k_ld_b-26-27-na-sajt.pdf',title:'ЛД 3 курс ПЗ Б',status:'published',stream:'B'},
  {id:'ld4-a-lecture',program:'31.05.01',course:4,kind:'official-pdf',url:'https://education.almazovcentre.ru/wp-content/uploads/2026/08/raspisanielekczij_4k_a_osen_1-nedelya.pdf',title:'ЛД 4 курс лекции A',status:'published',stream:'A'},
  {id:'ld4-b-lecture',program:'31.05.01',course:4,kind:'official-pdf',url:'https://education.almazovcentre.ru/wp-content/uploads/2026/08/raspisanielekczij_4k_b_osen_1-nedelya.pdf',title:'ЛД 4 курс лекции Б',status:'published',stream:'B'},
  {id:'ld4-a-practice',program:'31.05.01',course:4,kind:'official-pdf',url:'https://education.almazovcentre.ru/wp-content/uploads/2026/10/4k_ld_a-26-27-na-sajt.pdf',title:'ЛД 4 курс ПЗ A',status:'published',stream:'A'},
  {id:'ld4-b-practice',program:'31.05.01',course:4,kind:'official-pdf',url:'https://education.almazovcentre.ru/wp-content/uploads/2026/09/4k_ld_b-26-27-na-sajt.pdf',title:'ЛД 4 курс ПЗ Б',status:'published',stream:'B'},
  {id:'ld5-a-lecture',program:'31.05.01',course:5,kind:'official-pdf',url:'https://education.almazovcentre.ru/wp-content/uploads/2026/09/raspisanielekczij_5k_a_osen-1-1.pdf',title:'ЛД 5 курс лекции A',status:'published',stream:'A'},
  {id:'ld5-b-lecture',program:'31.05.01',course:5,kind:'official-pdf',url:'https://education.almazovcentre.ru/wp-content/uploads/2026/09/raspisanielekczij_5k_b_osen-1.pdf',title:'ЛД 5 курс лекции Б',status:'published',stream:'B'},
  {id:'ld5-a-practice',program:'31.05.01',course:5,kind:'official-pdf',url:'https://education.almazovcentre.ru/wp-content/uploads/2026/09/5k_ld_a-26-27-na-sajt.pdf',title:'ЛД 5 курс ПЗ A',status:'published',stream:'A'},
  {id:'ld6-lecture-first',program:'31.05.01',course:6,kind:'official-pdf',url:'https://education.almazovcentre.ru/wp-content/uploads/2026/09/raspisanielekczij_6k_osen_1-nedelya.pdf',title:'ЛД 6 курс лекции 1 неделя',status:'published'},
  {id:'ld6-lecture-autumn',program:'31.05.01',course:6,kind:'official-pdf',url:'https://education.almazovcentre.ru/wp-content/uploads/2026/09/raspisanielekczij_6k_osen.pdf',title:'ЛД 6 курс лекции осень',status:'published'},
  {id:'ld6-practice',program:'31.05.01',course:6,kind:'official-pdf',url:'https://education.almazovcentre.ru/wp-content/uploads/2026/09/6k_ld-26-27-na-sajt-1.pdf',title:'ЛД 6 курс ПЗ',status:'published'},
  {id:'peds1-lecture',program:'31.05.02',course:1,kind:'official-pdf',url:'https://education.almazovcentre.ru/wp-content/uploads/2026/09/raspisanielekczij_1k_pediatry_osen.pdf',title:'Педиатрия 1 курс лекции',status:'published'},
  {id:'peds1-practice',program:'31.05.02',course:1,kind:'official-pdf',url:'https://education.almazovcentre.ru/wp-content/uploads/2026/09/1k_pediatriya-26-27-na-sajt.pdf',title:'Педиатрия 1 курс ПЗ',status:'published'},
  {id:'peds2-lecture',program:'31.05.02',course:2,kind:'official-pdf',url:'https://education.almazovcentre.ru/wp-content/uploads/2026/09/raspisanielekczij_2k_pediatry-osen-1.pdf',title:'Педиатрия 2 курс лекции',status:'quarantined'},
  {id:'peds2-practice',program:'31.05.02',course:2,kind:'official-pdf',url:'https://education.almazovcentre.ru/wp-content/uploads/2026/09/2k_pediatriya-26-27-na-sajt.pdf',title:'Педиатрия 2 курс ПЗ',status:'published'},
  {id:'psych1-lecture',program:'37.05.01',course:1,kind:'official-pdf',url:'https://education.almazovcentre.ru/wp-content/uploads/2026/09/raspisanielekczij_1k_klin_psih_osen.pdf',title:'Клиническая психология 1 курс лекции',status:'published'},
  {id:'psych1-seminars',program:'37.05.01',course:1,kind:'official-pdf',url:'https://education.almazovcentre.ru/wp-content/uploads/2026/09/1k_klin_psih_26-27-na-sajt.pdf',title:'Клиническая психология 1 курс семинары',status:'published'},
  {id:'psych2-lecture',program:'37.05.01',course:2,kind:'official-pdf',url:'https://education.almazovcentre.ru/wp-content/uploads/2026/09/raspisanielekczij_2k_klin_psih_osen.pdf',title:'Клиническая психология 2 курс лекции',status:'published'},
  {id:'psych2-seminars',program:'37.05.01',course:2,kind:'official-pdf',url:'https://education.almazovcentre.ru/wp-content/uploads/2026/09/2k_klin_psih_26-27-na-sajt.pdf',title:'Клиническая психология 2 курс семинары',status:'published'}
];
export const programNames={'31.05.01':'Лечебное дело','31.05.02':'Педиатрия','37.05.01':'Клиническая психология'};
