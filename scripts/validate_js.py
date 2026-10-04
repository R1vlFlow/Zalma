#!/usr/bin/env python3
import re,subprocess,sys,tempfile
from pathlib import Path
s=Path('index.html').read_text(errors='ignore')
blocks=re.findall(r'<script(?:\s[^>]*)?>([\s\S]*?)</script>',s,re.I)
errors=[]
for i,b in enumerate(blocks):
 if not b.strip():continue
 f=Path(tempfile.gettempdir())/f'almazov-{i}.js';f.write_text(b)
 p=subprocess.run(['node','--check',str(f)],capture_output=True,text=True)
 if p.returncode:errors.append((i,p.stderr.strip()))
 if f.exists():f.unlink()
if errors:
 for i,e in errors:print(f'SCRIPT {i}:\n{e}')
 sys.exit(1)
print(f'js syntax: PASS ({len(blocks)} script blocks)')
