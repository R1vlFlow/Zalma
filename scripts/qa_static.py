import json, re, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
errs=[]

def read(rel):
    p=ROOT/rel
    if not p.exists(): errs.append(f'missing file: {rel}'); return ''
    return p.read_text(encoding='utf-8')

html=read('public/index.html'); css=read('public/styles.css'); sw=read('public/sw.js'); manifest=read('public/manifest.webmanifest'); app=read('src/app.ts')
ids=re.findall(r'\bid=["\']([^"\']+)["\']',html)
if len(ids)!=len(set(ids)): errs.append('duplicate public HTML ids')
for x in sorted(set(re.findall(r"\$\('([^']+)'\)",app))):
    if x not in ids and x not in {'emptyState','themeMeta'}: errs.append(f'src/app.ts references missing public id: {x}')
pages=set(re.findall(r'data-page=["\']([^"\']+)',html)); sections=set(re.findall(r'id=["\']page-([^"\']+)',html))
if pages-sections: errs.append('missing page sections: '+','.join(sorted(pages-sections)))
for ref in re.findall(r'(?:(?:src|href)=["\'])(?!https?://|#|mailto:|data:|javascript:|tel:)([^"\']+)',html):
    base=ref.split('?')[0].split('#')[0]
    # main.js is generated into dist, not public; all other local HTML assets must exist in public.
    if base not in {'./main.js','main.js'} and not (ROOT/'public'/base.lstrip('./')).exists(): errs.append(f'missing public asset: {base}')
try: json.loads(manifest)
except Exception as e: errs.append(f'invalid manifest: {e}')
for rel in ['package.json','version.json','data/official-schedules.json','data/official-roster-contract.json']:
    try: json.loads(read(rel))
    except Exception as e: errs.append(f'invalid JSON {rel}: {e}')
try:
    pkg=json.loads(read('package.json')); v=json.loads(read('version.json'))
    if pkg.get('version')!=v.get('version'): errs.append('package/version mismatch')
except Exception: pass
for rel in ['.github/workflows/pages.yml','.github/workflows/qa.yml']:
    if not (ROOT/rel).exists(): errs.append('missing GitHub workflow: '+rel)
for needle in [':root{','--bg:','--text:','--double1:','--double2:','@media(max-width:680px)']:
    if needle not in css: errs.append('missing CSS token/responsive rule: '+needle)
if errs:
    print('ERRORS:\n'+'\n'.join('ERROR '+e for e in errs)); sys.exit(1)
print(f'PASS static project QA — ids={len(ids)}, pages={len(sections)}, version={json.loads(read("version.json"))["version"]}')
