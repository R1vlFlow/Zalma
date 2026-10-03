from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_official_schedule as b

class Page:
    def __init__(self,text): self.text=text
    def get_text(self,mode='text'): return self.text

first='''
РАСПИСАНИЕ занятий лекционного типа на первую неделю осеннего семестра 2026/2027 учебного года
6 курс, Лечебный факультет, специальность 31.05.01 Лечебное дело
СР
13:30 – 15:05 Внутренние болезни
КПК, "Коротков"
15:20 – 16:55 Инфекционные болезни
КПК, "Коротков"
ЧТ
13:30 – 15:05 Организация здравоохранения и общественное здоровье
КПК, "Коротков"
15:20 – 16:55 Хирургические болезни КПК, "Коротков"
ПТ
13:30 – 15:05 Инфекционные болезни
КПК, "Коротков"
15:20 – 16:55 Анестезиология, реаниматология и интенсивная терапия
КПК, "Коротков"
Заведующий Отделом организации учебного процесса
'''
semester='''
РАСПИСАНИЕ занятий лекционного типа на осенний семестр 2026/2027 учебного года
6 курс, Лечебный факультет, специальность 31.05.01 Лечебное дело
ПН
13:30 – 15:05 Фтизиатрия (2-7) / Внутренние болезни (8-10)
КПК, "Коротков"
15:20 – 16:55 Судебная медицина (2-7) / Клиническая диетология (8-10)
КПК, "Коротков"
ВТ
13:30 – 15:05 Организация здравоохранения и общественное здоровье (2-10)
КПК, "Коротков"
15:20 – 16:55 Детская хирургия (2-7) / Хирургические болезни (8, 9) / Клиническая диетология (10)
КПК, "Коротков"
'''
first_events=b.parse_lecture([Page(first)],6,'https://education.almazovcentre.ru/wp-content/uploads/2026/09/raspisanielekczij_6k_osen_1-nedelya.pdf','')
assert len(first_events)==6, first_events
assert all(e['weekNumber']==1 and e['group']=='ALL' and e['stream']=='' for e in first_events)
assert not any('Заведующий' in e.get('location','') for e in first_events)
sem_events=b.parse_lecture([Page(semester)],6,'https://education.almazovcentre.ru/wp-content/uploads/2026/09/raspisanielekczij_6k_osen.pdf','')
assert len(sem_events)==36, len(sem_events)
assert any(e['subject']=='Фтизиатрия' and e['weekNumber']==2 for e in sem_events)
assert any(e['subject']=='Внутренние болезни' and e['weekNumber']==10 for e in sem_events)
assert all(e['group']=='ALL' and e['stream']=='' for e in sem_events)
print('6K LECTURE REGRESSION: PASS — first-week and semester lecture formats preserved.')
