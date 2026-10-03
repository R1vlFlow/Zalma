from pathlib import Path
import json,re,subprocess,sys,zipfile
ROOT=Path(__file__).resolve().parents[1]
HTML=(ROOT/'index.html').read_text(encoding='utf-8')
WF=(ROOT/'.github/workflows/sync-official-schedules.yml').read_text(encoding='utf-8')
V=json.loads((ROOT/'version.json').read_text(encoding='utf-8'))
checks=[]
def c(name,ok):
    checks.append((name,ok))
# Inline JS syntax, excluding non-JS template/script artifacts.
blocks=re.findall(r'<script(?:\\s[^>]*)?>(.*?)</script>',HTML,re.S)
for i,b in enumerate(blocks):
    if not b.strip(): continue
    p=ROOT/f'.audit_js_{i}.js';p.write_text(b,encoding='utf-8')
    r=subprocess.run(['node','--check',str(p)],capture_output=True,text=True)
    p.unlink(missing_ok=True)
    c(f'JS block {i} syntax',r.returncode==0)
# IDs
ids=re.findall(r'\bid=["\']([^"\']+)["\']',HTML)
c('no duplicate DOM ids',len(ids)==len(set(ids)))
# Function duplicates at top-level-ish declarations.
funcs=re.findall(r'(?m)^function\s+([A-Za-z_$][\w$]*)\s*\(',HTML)
c('no duplicate function declarations',len(funcs)==len(set(funcs)))
# Release identity.
c('UI version is PRE-RELEASE 2.0','PRE-RELEASE 2.0' in HTML and '4.0 BETA' not in HTML)
c('engine version consistent',V.get('version')=='4.3.0-pre5' and '4.3.0-pre5' in WF)
# Workflow includes required gates.
for needle in ['test_kug_grid_contract.py','final_static_audit.py','deep_schedule_audit.py','validate_generated_index.py','validate_schedule_data.py']:
    c('workflow gate '+needle,needle in WF)
# Critical files.
for rel in ['index.html','sw.js','version.json','data/official-schedules.json','scripts/build_official_schedule.py','.github/workflows/sync-official-schedules.yml']:
    c('file '+rel,(ROOT/rel).is_file() and (ROOT/rel).stat().st_size>0)
# KUG source/data consistency.
data=json.loads((ROOT/'data/official-schedules.json').read_text(encoding='utf-8'))
sources={x.get('url') for x in data.get('kugSources',[])}
c('KUG sources cover 1-6',set(str(x.get('course')) for x in data.get('kugSources',[]))==set('123456'))
c('assessment URLs are official KUG sources',all(x.get('sourceUrl') in sources for x in data.get('assessmentPeriods',[])))
failed=[n for n,ok in checks if not ok]
for n,ok in checks: print(('PASS' if ok else 'FAIL')+' — '+n)
print(f'FINAL STATIC AUDIT: {len(checks)-len(failed)}/{len(checks)} passed')
if failed: sys.exit(1)
