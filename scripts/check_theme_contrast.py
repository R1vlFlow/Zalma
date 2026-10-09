from pathlib import Path
import re

CSS = Path('public/styles.css').read_text(encoding='utf-8')

def vars_for(pattern):
    m = re.search(pattern, CSS)
    if not m:
        raise SystemExit(f'missing theme block: {pattern}')
    return dict(re.findall(r'(--[\w-]+):(#(?:[0-9a-fA-F]{6}))', m.group(1)))

def lum(value):
    rgb=[int(value[i:i+2],16)/255 for i in (1,3,5)]
    rgb=[x/12.92 if x<=0.03928 else ((x+0.055)/1.055)**2.4 for x in rgb]
    return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]

def contrast(a,b):
    x,y=lum(a),lum(b)
    return (max(x,y)+.05)/(min(x,y)+.05)

checks=[('--text','--bg'),('--text','--surface'),('--text-2','--surface'),('--text-3','--surface')]
for label,block in [('light',r':root\{([^}]*)\}'),('dark',r'html\[data-theme=dark\]\{([^}]*)\}')]:
    vals=vars_for(block)
    for fg,bg in checks:
        ratio=contrast(vals[fg],vals[bg])
        if ratio < 4.5:
            raise SystemExit(f'{label} {fg}/{bg} contrast {ratio:.2f} < 4.5')
print('theme contrast gate: primary text combinations >= 4.5:1')
