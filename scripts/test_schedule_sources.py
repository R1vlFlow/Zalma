#!/usr/bin/env python3
from pathlib import Path
import re
s=Path('scripts/build_official_schedule.py').read_text(encoding='utf-8')
expected={
 '1':['1k_ld_a-26-27-na-sajt.pdf','1k_ld_b-26-27-na-sajt.pdf'],
 '2':['2k_ld_a-26-27-na-sajt.pdf','2k_ld_b-26-27-na-sajt.pdf'],
 '3':['3k_ld_a-26-27-na-sajt.pdf','3k_ld_b-26-27-na-sajt.pdf'],
 '4':['4k_ld_a-26-27-na-sajt.pdf','4k_ld_b-26-27-na-sajt.pdf'],
 '5':['5k_ld_a-26-27-na-sajt.pdf','5k_ld_b-26-27-na-sajt.pdf'],
 '6':['6k_ld-26-27-na-sajt-1.pdf'],
}
for c,names in expected.items():
 for name in names:
  assert name in s, f'missing practice source {c}: {name}'
assert "'6','','practice'" in s
assert "'6','','lecture'" in s
assert "'4','A','practice'" in s and "'4','B','practice'" in s
assert "'5','A','practice'" in s and "'5','B','practice'" in s
print('SOURCE MANIFEST TESTS: OK — official practice/lecture source roles for courses 1–6 are present')
