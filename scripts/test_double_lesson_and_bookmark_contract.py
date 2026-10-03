#!/usr/bin/env python3
from pathlib import Path
import re, sys
ROOT=Path(__file__).resolve().parents[1]
idx=(ROOT/'index.html').read_text(encoding='utf-8')
b=(ROOT/'scripts'/'build_official_schedule.py').read_text(encoding='utf-8')
assert 'expand_double_lesson_events' in b
assert 'toggleEventBookmark' in idx
assert 'data.bookmarks' in idx
assert 'Закладка' in idx
assert 'sourceFormat' in b
print('DOUBLE LESSON + BOOKMARK CONTRACT: PASS')
