import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import sync_official as s

def main():
    assert s.weeks('(2-4)') == [2,3,4]
    assert s.weeks('(2, 4, 6, 8, 12, 14, 15, 16)') == [2,4,6,8,12,14,15,16]
    r=s.records('Основы Российской государственности (2-10) Солнечное, лит. П, ауд. 1.2 Основы проектной деятельности (11-16) Солнечное, лит. П, ауд. 1.2')
    assert len(r)==2 and r[0][0].startswith('Основы Российской') and r[0][2]==list(range(2,11)) and r[1][2]==list(range(11,17))
    r=s.records('Биология (2-10) Солнечное, лит. С, ауд. 3.32')
    assert r[0][0]=='Биология' and r[0][1].startswith('Солнечное')
    assert s.clean_subject('Безопасность жизнидеятельност и МЧС')=='Безопасность жизнедеятельности МЧС'
    ev=s.event(1,'A',0,'09:00','10:35','Химия','ауд. 1',2,'lecture','x')
    assert ev['weekStart']=='2026-09-07'
    a=s.dedupe([ev,dict(ev)])
    assert len(a)==1
    for c in range(1,7):
        groups,streams=s.rosters(c);assert groups;assert set(sum(streams.values(),[]))==set(groups)
    print('parser regression: PASS')
if __name__=='__main__':main()
