from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
text=(ROOT/'src/core/types.ts').read_text(encoding='utf8')
assert 'doublePart?: 1 | 2' in text
assert 'doubleOf?: string' in text
app=(ROOT/'src/app.ts').read_text(encoding='utf8')
assert "doublePart===1?'1/2'" in app
print('DOUBLE LESSON CONTRACT: PASS')
