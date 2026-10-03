#!/usr/bin/env python3
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).parent))
from universal_schedule_ingest import sniff_format
raw=Path(Path(__file__).resolve().parents[1]/'tests/fixtures/4k_ld_b_2026_2027.pdf').read_bytes()
assert sniff_format(raw,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','4К_ЛД_Б.xlsx')=='pdf'
print('SOURCE FORMAT MISMATCH: PASS — PDF payload wins over .xlsx name/content-type')
