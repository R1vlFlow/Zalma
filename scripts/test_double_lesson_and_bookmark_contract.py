from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
text=(ROOT/'src/core/types.ts').read_text(encoding='utf8')
app=(ROOT/'src/app.ts').read_text(encoding='utf8')
assert 'doublePart?: 1 | 2' in text
assert 'doubleOf?: string' in text
assert 'function eventHalfLabel(e:CalendarEvent)' in app
assert "if(e.doublePart===1)return '1/2'" in app
assert "if(e.doublePart===2)return '2/2'" in app
for renderer in ('eventHtml','renderMobile','renderMonth','renderAgenda','renderList'):
    start=app.index(f'function {renderer}(')
    end=app.find('\nfunction ',start+10)
    body=app[start:end if end>=0 else None]
    assert ('eventTitleRow(' if renderer == 'eventHtml' else 'eventHalfMarkup(') in body, f'{renderer} does not render double-part labels'
print('DOUBLE LESSON CONTRACT: PASS (data + all six views)')
