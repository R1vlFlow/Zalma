import json,re,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
errs=[]; warns=[]

def read(name):
    p=ROOT/name
    if not p.exists(): errs.append(f'missing file: {name}'); return ''
    return p.read_text(encoding='utf-8')

html=read('index.html'); js=read('app.js'); css=read('styles.css'); sw=read('sw.js'); manifest=read('manifest.webmanifest')
# HTML ids must be unique.
ids=re.findall(r'\bid=["\']([^"\']+)["\']',html)
if len(ids)!=len(set(ids)): errs.append('duplicate HTML id attributes: '+', '.join(sorted({x for x in ids if ids.count(x)>1})))
# Required JS DOM targets must exist in HTML.
for x in sorted(set(re.findall(r"getElementById\(['\"]([^'\"]+)['\"]\)",js))):
    if x not in ids: errs.append(f'JS references missing element id: {x}')
# data-action and page names must have handlers/sections.
actions=set(re.findall(r'data-action=["\']([^"\']+)["\']',html))
case_actions=set(re.findall(r"case ['\"]([^'\"]+)['\"]",js))
for x in sorted(actions-case_actions): errs.append(f'unhandled data-action: {x}')
pages=set(re.findall(r'data-page=["\']([^"\']+)["\']',html)) | set(re.findall(r'data-page-link=["\']([^"\']+)["\']',html))
page_sections=set(re.findall(r'id=["\']page-([^"\']+)["\']',html))
for x in sorted(pages-page_sections): errs.append(f'missing page section: {x}')
# Local asset references in HTML.
for ref in re.findall(r'(?:(?:src|href)=["\'])(?!https?://|#|mailto:|data:|javascript:|tel:)([^"\']+)',html):
    base=ref.split('?')[0].split('#')[0]
    if base and not (ROOT/base).exists(): errs.append(f'missing local asset referenced by HTML: {base}')
# External blank links must use noopener/noreferrer.
for tag in re.findall(r'<a\b[^>]*target=["\']_blank["\'][^>]*>',html,re.I):
    rel=re.search(r'\brel=["\']([^"\']+)["\']',tag,re.I)
    if not rel or not {'noopener','noreferrer'}.issubset(set(rel.group(1).lower().split())): errs.append('target=_blank link without noopener+noreferrer')
# CSS responsive contract.
for needle in ['@media(max-width:960px)','@media(min-width:961px){.schedule-mobile{display:none!important}}','@media(max-width:380px)']:
    if needle not in css: errs.append(f'missing responsive rule: {needle}')
# Manifest / service worker JSON and local shell references.
try: json.loads(manifest)
except Exception as e: errs.append(f'invalid manifest JSON: {e}')
for ref in re.findall(r"'\./([^']+)'",sw):
    if not (ROOT/ref).exists() and 'data/live-index.json' not in ref: errs.append(f'service-worker shell missing: {ref}')
# Data JSON parse.
for f in ['data/catalog.json','data/manual-specialist-schedules.json','data/kug.json','data/sources.json','version.json']:
    try: json.loads(read(f))
    except Exception as e: errs.append(f'invalid JSON {f}: {e}')
# No temporary QA artifacts should remain in release tree.
for f in ROOT.rglob('*'):
    if f.name.startswith('qa_browser_') or f.name in {'qa_runtime.html','test.html'}: errs.append(f'temporary QA file included: {f.relative_to(ROOT)}')
# Check release metadata.
try:
    v=json.loads(read('version.json')); 
    pkg=json.loads(read('package.json'))
    if v.get('version')!=pkg.get('version'): errs.append(f"version mismatch: version.json={v.get('version')} package.json={pkg.get('version')}")
except Exception: pass
# Basic action coverage statistics.
print(f'HTML ids={len(ids)} unique={len(set(ids))}')
print(f'data-actions={len(actions)} handled-cases={len(case_actions)}')
print(f'pages={sorted(page_sections)}')
print(f'local assets in HTML checked')
print(f'responsive rules: <=960 and <=380 plus desktop-only mobile schedule')
if errs:
    print('ERRORS:')
    print('\n'.join(f'ERROR {e}' for e in errs))
    sys.exit(1)
print('PASS static release QA')
