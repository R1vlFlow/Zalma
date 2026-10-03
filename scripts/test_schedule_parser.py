#!/usr/bin/env python3
"""Offline regression tests for the official schedule parser.

These tests intentionally use text patterns copied from the public Almazov PDFs;
no network access is required. The GitHub workflow runs them before publishing a
new schedule index so obvious parser regressions stop the sync.
"""
import re
from build_official_schedule import parse_lecture, split_subjects, group_header, TIME_RE, split_matrix_cell, classify_pdf


class Page:
    def __init__(self, text):
        self.text = text

    def get_text(self, kind='text'):
        return self.text


class Doc:
    def __init__(self, *pages):
        self.pages = pages

    def __iter__(self):
        return iter(self.pages)


def assert_eq(actual, expected, msg):
    if actual != expected:
        raise AssertionError(f'{msg}: expected {expected!r}, got {actual!r}')


def build_dual_clock_for_test():
    from build_official_schedule import parse_dual_location_time
    return parse_dual_location_time('9.20-10.45 (Солнечное) / 9:00-10:35 (Город)', 'Город, ауд. 1.1')


def main():
    stream, groups = group_header(
        '1 курс, поток Б\nДень недели Время 123 124 125 126 127 128 129 130 131 132 133 134 135'
    )
    assert_eq(stream, 'B', 'stream detection')
    assert_eq(groups[0], '123', 'first group')
    assert_eq(groups[-1], '135', 'last group')

    records = split_subjects(
        'Основы Российской государственности (2-9) Солнечное, лит. С, ауд. 3.20 '
        'Основы проектной деятельности (11-16) Солнечное, лит. С, ауд. 3.53'
    )
    assert_eq([r[0] for r in records], ['Основы Российской государственности', 'Основы проектной деятельности'], 'multi-record subjects')
    assert_eq(records[0][2], 'Солнечное, лит. С, ауд. 3.20', 'first record location')
    assert_eq(records[1][2], 'Солнечное, лит. С, ауд. 3.53', 'second record location')

    first_week = Doc(Page('''
СР
2.09
9:00 – 10:35 Биология
ул. Аккуратова, д. 2, лит. И, 2 эт., зал "Павлов"
ЧТ
3.09
9:00 – 10:35 История России КПК, "Коротков"
10:50 – 12:25 Основы Российской государственности
ул. Аккуратова, д. 2, лит. И, 20 эт., зал "Коротков"
'''))
    events = parse_lecture(first_week, 1, 'test', 'B')
    assert_eq(events[0]['subject'], 'Биология', 'inline first-week subject')
    assert_eq(events[0]['location'], 'ул. Аккуратова, д. 2, лит. И, 2 эт., зал "Павлов"', 'first-week location')
    assert_eq(events[0]['weekStart'], '2026-08-31', 'first-week must use Monday as weekStart')
    assert_eq(events[1]['subject'], 'История России', 'inline subject with room marker')
    assert_eq(events[1]['location'], 'КПК, "Коротков"', 'inline room marker location')
    assert_eq(events[2]['subject'], 'Основы Российской государственности', 'following first-week subject')

    semester = Doc(Page('''
ВТ
13:30 – 14:55 История России (2-16)
Солнечное, Средняя ул., д. 6, лит. П, лит. С, ауд. 1.1
15:10 – 16:35 Безопасность жизнедеятельности АСЦ (2, 3, 4) / Биология (5, 7, 9, 10, 11, 12, 13) / Сестринское дело (6, 8)
Солнечное, Средняя ул., д. 6, лит. П, лит. С, ауд. 1.1
'''))
    events = parse_lecture(semester, 1, 'test', 'B')
    assert_eq(events[0]['subject'], 'История России', 'semester subject')
    assert_eq(events[0]['weekNumber'], 2, 'semester week mapping')
    subjects={e['subject'] for e in events if e['start'] == '15:10'}
    assert_eq(subjects, {'Безопасность жизнедеятельности АСЦ', 'Биология', 'Сестринское дело'}, 'multi-subject lecture row')

    # Week-specific room changes must not leak into earlier weeks.
    from build_official_schedule import parse_weeks
    loc='Солнечное, лит. С, ауд. 3.54/55 С 11 недели - ауд. 3.1/3.2'
    change=re.search(r'\bс\s+(\d+)\s+недели\s*[-–—:]\s*(.+)$', loc, re.I)
    if not change:
        raise AssertionError('week-specific room change regex did not match')
    assert_eq((int(change.group(1)), change.group(2)), (11, 'ауд. 3.1/3.2'), 'week-specific room change')

    # Official practice rows can contain two clocks: Солнечное / Город.
    # Verify the parser's clock-selection rule independently of PDF coordinates.
    row_text='9.20-10.45 (Солнечное) / 9:00-10:35 (Город)'
    clocks=[(f'{int(m.group(1)):02d}:{m.group(2)}',f'{int(m.group(3)):02d}:{m.group(4)}') for m in TIME_RE.finditer(row_text)]
    assert_eq(clocks, [('09:20','10:45'),('09:00','10:35')], 'dual-location clocks')
    assert_eq(clocks[1], ('09:00','10:35'), 'city clock selection')


    # Coordinate-based practice table smoke test: three group columns and one
    # row with different clocks for Солнечное/Город.
    from build_official_schedule import parse_practice, classify_pdf
    class WPage:
        def __init__(self, words, text, width=500, height=700): self.words=words; self.text=text; self.rect=type("R",(),{"width":width,"height":height})()
        def get_text(self, kind="text"): return self.words if kind=="words" else self.text
    def w(x,y,t): return (x,y,x+max(8,len(t)*4),y+10,t,0,0,0)
    words=[
        w(60,40,'123'),w(160,40,'124'),w(260,40,'125'),
        w(5,90,'ПН'),w(5,115,'9.20-10.45'),w(5,115,'9:00-10:35'),
        w(165,105,'Биология'),w(165,118,'(2-16)'),w(165,132,'Город,'),w(165,145,'ауд. 1.1'),
    ]
    page=WPage(words,'День недели Время 123 124 125\nПН\n9.20-10.45 (Солнечное) / 9:00-10:35 (Город)')
    pe=parse_practice(type('D',(),{'__iter__':lambda self:iter([page])})(),1,'test','B')
    assert_eq(len(pe),15,'practice coordinate row')
    assert_eq(pe[0]['group'],'124','practice group column')
    assert_eq((pe[0]['start'],pe[0]['end']),('09:00','10:35'),'practice city clock')
    assert_eq(pe[0]['location'],'Город, ауд. 1.1','practice location')
    assert_eq(build_dual_clock_for_test(), ('09:00','10:35'), 'dual clock selection')

    # Regression: some practice PDF templates use full weekday names and split
    # the clock into separate PDF text objects. The parser must reconstruct both.
    words2=[
        w(60,40,'123'),w(160,40,'124'),w(260,40,'125'),
        w(5,90,'Понедельник'),w(5,115,'09:00'),w(40,115,'-'),w(50,115,'10:35'),
        w(165,105,'Биология'),w(165,118,'(2-16)'),w(165,132,'Город,'),w(165,145,'ауд. 1.1'),
    ]
    page2=WPage(words2,'День недели Время 123 124 125\nПонедельник\n09:00 - 10:35')
    pe2=parse_practice(type('D',(),{'__iter__':lambda self:iter([page2])})(),1,'test','B')
    assert_eq(len(pe2),15,'full weekday/split clock practice row')
    assert_eq(pe2[0]['weekday'],0,'full weekday mapping')
    assert_eq((pe2[0]['start'],pe2[0]['end']),('09:00','10:35'),'split clock reconstruction')

    assert_eq(classify_pdf('1 курс Поток Б\nЛекции','1k_b.pdf'),('1','B','lecture'),'pdf classification')
    assert_eq(classify_pdf('1 курс Поток Б\nЛечебное дело\nДень недели Время 123 124','1k_ld_b.pdf'),('1','B','practice'),'pdf practice classification')
    assert_eq(split_matrix_cell('Внутренние болезни Башня, ауд. 20.01'), ('Внутренние болезни','Башня, ауд. 20.01'), 'weekly matrix subject/location split')
    assert_eq(split_matrix_cell('Клиническая эпидемиология С использованием ДОТ'), ('Клиническая эпидемиология','С использованием ДОТ'), 'weekly matrix online location split')
    assert_eq(split_matrix_cell('Внутренние болезни ауд. 20.10'), ('Внутренние болезни','ауд. 20.10'), 'weekly matrix room-only location split')
    assert_eq(classify_pdf('6 курс Лечебное дело','6k_ld-26-27-na-sajt-1.pdf',6,None,'practice'),('6',None,'practice'),'6th-course classification')

    # Course 6 lecture PDFs use one stream (no A/B) and week-qualified subjects.
    six=Doc(Page('''ПН\n13:30 – 15:05 Фтизиатрия (2-7) / Внутренние болезни (8-10)\nКПК, "Коротков"\nВТ\n13:30 – 15:05 Организация здравоохранения и общественное здоровье (2-10)\nКПК, "Коротков"'''))
    six_events=parse_lecture(six,6,'6','')
    assert_eq(len(six_events),18,'course 6 lecture week expansion')
    assert_eq({e['stream'] for e in six_events},{''},'course 6 has no A/B stream')
    assert_eq(six_events[0]['weekNumber'],2,'course 6 first semester lecture week')

    # Matrix fallback regression: a spreadsheet text layer may preserve week
    # numbers/groups but lose the Cyrillic header glyphs. The fallback must still
    # recover weekly-block practice cells and never invent a weekday.
    import fitz
    from build_official_schedule import parse_week_matrix_text_fallback
    doc=fitz.open(); page=doc.new_page(width=900,height=500)
    page.insert_text((20,30),'4 9:00-12:25')
    page.insert_text((20,60),'Неделя')
    left=70; groupw=45; colw=45
    for n in range(1,17): page.insert_text((left+groupw+(n-1)*colw+10,60),str(n))
    for r,g in enumerate(('401','402')):
        y=110+r*80; page.insert_text((10,y),g)
        page.insert_text((left+groupw+5,y),'Внутренние болезни КПК, ауд. 2171')
        page.insert_text((left+groupw+2*colw+5,y),'Неврология Башня, ауд. 20.15')
    raw=bytes(doc.tobytes()); doc.close()
    matrix_events=parse_week_matrix_text_fallback(raw,4,'matrix-test','A')
    assert_eq(bool(matrix_events),True,'4th-course matrix text fallback produces events')
    assert_eq({e['weekday'] for e in matrix_events},{None},'4th-course matrix keeps weekday unknown')
    assert_eq({e['group'] for e in matrix_events},{'401','402'},'4th-course matrix keeps group identity')


    # Canonical clock normalization fixes verified overlays such as `9:00` to
    # the same `09:00` representation produced by the PDF parser.
    from build_official_schedule import normalize_clock, normalize_event_time, validate_course, event_sort_key
    assert_eq(normalize_clock('9:00'),'09:00','clock normalization')
    assert_eq(normalize_clock('09.20'),'09:20','dot clock normalization')
    ev={'start':'9:00','end':'10:35'}
    assert_eq(normalize_event_time(ev),True,'event clock normalization')
    assert_eq((ev['start'],ev['end']),('09:00','10:35'),'normalized event clocks')

    # Regression: weekly-block events use weekday=None. Sorting a mixed list
    # of daily and weekly-block events must never compare None with int.
    mixed=[{'weekNumber':2,'weekday':None,'start':'09:00','group':'401','subject':'Практика'},
           {'weekNumber':2,'weekday':0,'start':'09:00','group':'ALL','subject':'Лекция'}]
    mixed.sort(key=event_sort_key)
    assert_eq(mixed[0]['weekday'],0,'mixed weekday sort')
    assert_eq(mixed[1]['weekday'],None,'weekly-block sort after daily events')

    # Weekly-block events deliberately carry no weekday: the official 4–6 course
    # matrix specifies group/week/cell, not a day-of-week. The strict validator
    # must accept None while still rejecting malformed weekday values elsewhere.
    roster_a=[str(x) for x in range(401,413)]; roster_b=[str(x) for x in range(413,425)]
    weekly={'streams':{'A':roster_a,'B':roster_b},'sources':[
        {'stream':'A','kind':'lecture'},{'stream':'A','kind':'practice'},
        {'stream':'B','kind':'lecture'},{'stream':'B','kind':'practice'}],
        'events':[
        *({'stream':'A','type':'lecture'} for _ in range(3)),
        *({'stream':'A','type':'practice','group':g,'weekday':None} for g in roster_a),
        *({'stream':'B','type':'lecture'} for _ in range(3)),
        *({'stream':'B','type':'practice','group':g,'weekday':None} for g in roster_b)]}
    assert_eq(validate_course('4',weekly),[], 'weekly-block validation')

    # Regression: validation must treat streams as a dictionary, never as a set.
    good_a=[str(x) for x in range(101,123)]; good_b=[str(x) for x in range(123,136)]
    good={
        'streams': {'A':good_a, 'B':good_b},
        'sources': [
            {'stream':'A','kind':'lecture'}, {'stream':'A','kind':'practice'},
            {'stream':'B','kind':'lecture'}, {'stream':'B','kind':'practice'},
        ],
        'events': [
            *({'stream':'A','type':'lecture'} for _ in range(3)),
            *({'stream':'A','type':'practice','group':g} for g in good_a),
            *({'stream':'B','type':'lecture'} for _ in range(3)),
            *({'stream':'B','type':'practice','group':g} for g in good_b),
        ]
    }
    assert_eq(validate_course('1',good), [], 'validate_course returns no problems for well-formed data')

    # Regression: validate_course must report problems by returning them, not
    # by raising - one course with an unrecognised PDF layout (e.g. a
    # university template change) must never be able to abort the whole sync
    # and discard every other course that parsed fine.
    incomplete={'streams': {'A':['401']}, 'sources': [], 'events': []}
    problems=validate_course('4',incomplete)
    assert_eq(isinstance(problems,list), True, 'validate_course returns a list instead of raising')
    assert_eq(any('practice roster missing groups' in p for p in problems), True, 'incomplete course is reported')

    # Regression: table fallback consumes an extracted table with explicit group
    # columns, a carried weekday, a time and a week-qualified subject.
    from build_official_schedule import _add_practice_events_from_table
    class Finder:
        def __init__(self):
            self.tables=[self]
        def extract(self):
            return [
                ['123','124','125'],
                ['Понедельник','09:00-10:35',''],
                ['','',''],
                ['','Биология (2-16) Город, ауд. 1.1',''],
            ]
    class TablePage:
        def find_tables(self, strategy='lines'):
            return Finder()
    out=[]
    _add_practice_events_from_table(out,TablePage(),1,'test','B')
    assert_eq(len(out),15,'table fallback events')
    assert_eq(out[0]['group'],'124','table fallback group')
    assert_eq((out[0]['start'],out[0]['end']),('09:00','10:35'),'table fallback time')

    # Regression: all six official 5th-course source filenames classify from
    # their URL even if extracted PDF text contains unrelated abbreviations.
    five_urls = [
        'https://education.almazovcentre.ru/wp-content/uploads/2026/08/raspisanielekczij_5k_a_osen_1-nedelya.pdf',
        'https://education.almazovcentre.ru/wp-content/uploads/2026/09/raspisanielekczij_5k_a_osen-1-1.pdf',
        'https://education.almazovcentre.ru/wp-content/uploads/2026/08/raspisanielekczij_5k_b_osen_1-nedelya.pdf',
        'https://education.almazovcentre.ru/wp-content/uploads/2026/09/raspisanielekczij_5k_b_osen-1.pdf',
        'https://education.almazovcentre.ru/wp-content/uploads/2026/09/5k_ld_a-26-27_removed-1.pdf',
        'https://education.almazovcentre.ru/wp-content/uploads/2026/09/5k_ld_b-26-27_removed-1-1.pdf',
    ]
    expected=[('5','A','lecture'),('5','A','lecture'),('5','B','lecture'),
              ('5','B','lecture'),('5','A','practice'),('5','B','practice')]
    for url, want in zip(five_urls, expected):
        got=classify_pdf('КУГ / служебная информация', url, *want)
        assert_eq(got, want, f'5th-course URL classification: {url}')

    print('Parser regression tests: OK')


if __name__ == '__main__':
    main()
