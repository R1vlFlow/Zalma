#!/usr/bin/env python3
"""Common provenance and academic-year diagnostics for official schedule sources."""
from __future__ import annotations
import hashlib
import re
from datetime import datetime, timezone

DATE_LABEL_RE = re.compile(r'(?<!\d)(\d{1,2})[./](\d{1,2})[./](\d{2,4})(?!\d)')
YEAR_PAIR_RE = re.compile(r'(?<!\d)(20\d{2})\s*[/–-]\s*(20\d{2})(?!\d)')


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def academic_year_from_text(text: str) -> str | None:
    matches = YEAR_PAIR_RE.findall(text or '')
    for start, end in matches:
        if int(end) == int(start) + 1:
            return f'{start}/{end}'
    return None


def date_label_audit(text: str, academic_year_start: int = 2026) -> dict:
    """Detect dates printed inside tables without assuming they are authoritative."""
    years: list[int] = []
    labels: list[str] = []
    for m in DATE_LABEL_RE.finditer(text or ''):
        d, month, raw_year = int(m.group(1)), int(m.group(2)), m.group(3)
        year = int(raw_year)
        if len(raw_year) == 2:
            year += 2000
        if not (1 <= d <= 31 and 1 <= month <= 12):
            continue
        years.append(year)
        if len(labels) < 40:
            labels.append(m.group(0))
    unique_years = sorted(set(years))
    conflicts = [year for year in unique_years if year < academic_year_start or year > academic_year_start + 1]
    return {
        'embeddedDateYears': unique_years,
        'conflictingDateYears': conflicts,
        'sampleDateLabels': labels,
        'dateLabelCount': len(years),
    }


def source_provenance(data: bytes, text: str, url: str, *, checked_at: str | None = None) -> dict:
    checked_at = checked_at or datetime.now(timezone.utc).isoformat()
    return {
        'sha256': sha256_bytes(data),
        'contentBytes': len(data),
        'checkedAt': checked_at,
        'academicYearInDocument': academic_year_from_text(text),
        'dateLabelAudit': date_label_audit(text),
        'url': url,
    }
