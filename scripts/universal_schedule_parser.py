#!/usr/bin/env python3
"""Universal, layout-adaptive schedule parser orchestrator.

The parser does not contain course-specific layouts.  It observes a PDF and
builds a structural fingerprint first: course/stream hints, group headers,
academic-week headers, weekday/time signals, vector grid density and table
signals.  It then chooses the least-assumptive parsing strategy and preserves
uncertainty instead of inventing missing weekdays.

The low-level extractors live in build_official_schedule.py for backwards
compatibility.  This module is deliberately the *orchestrator*: future PDF
layouts can be handled by adding another layout detector/extractor without
adding a new branch such as `if course == 5`.
"""
from __future__ import annotations
from dataclasses import dataclass, asdict
import io
import re
from collections import Counter
from pathlib import Path


DAY_WORDS = {
    'пн','вт','ср','чт','пт','сб','вс',
    'понедельник','вторник','среда','четверг','пятница','суббота','воскресенье'
}
CLOCK_RE = re.compile(r'(?<!\d)\d{1,2}\s*[:.]\s*\d{2}\s*[-–—]\s*\d{1,2}\s*[:.]\s*\d{2}(?!\d)')
GROUP_RE = re.compile(r'(?<!\d)(\d{3})(?!\d)')
WEEK_RE = re.compile(r'(?<!\d)(?:[1-9]|[1-4]\d|5[0-2])(?!\d)')


@dataclass
class LayoutProfile:
    course: int | None
    stream: str | None
    kind: str | None
    groups: list[str]
    week_labels: list[int]
    weekday_count: int
    clock_count: int
    vector_score: float
    grid_score: float
    layout: str
    confidence: float
    reasons: list[str]

    def to_dict(self):
        return asdict(self)


class UniversalScheduleParser:
    """Adaptive parser facade.

    `legacy` is the already-tested build module.  The universal layer decides
    *which* extractor is appropriate from observed structure; it never selects
    an extractor because of a hard-coded course number.
    """

    def __init__(self, legacy_module):
        self.m = legacy_module

    @staticmethod
    def _doc_from_bytes(raw):
        import fitz
        return fitz.open(stream=raw, filetype='pdf')

    @staticmethod
    def _raw_bytes(source):
        if isinstance(source, (bytes, bytearray)):
            return bytes(source)
        if hasattr(source, 'tobytes'):
            try:
                return bytes(source.tobytes())
            except Exception:
                pass
        return None

    def _text_words(self, source):
        raw = self._raw_bytes(source)
        if raw is not None:
            doc = self._doc_from_bytes(raw)
            close = True
        else:
            doc = source
            close = False
        texts=[]; words=[]; drawings=[]
        try:
            for page in doc:
                texts.append(page.get_text('text') or '')
                try:
                    words.extend(page.get_text('words') or [])
                except Exception:
                    pass
                try:
                    drawings.extend(page.get_drawings() or [])
                except Exception:
                    pass
        finally:
            if close:
                doc.close()
        return '\n'.join(texts), words, drawings

    @staticmethod
    def _infer_course(text, url=''):
        url = url or ''
        candidates=[]
        for m in re.finditer(r'(?<!\d)(\d{1,2})\s*курс', text, re.I):
            candidates.append(int(m.group(1)))
        if candidates:
            return Counter(candidates).most_common(1)[0][0]
        m=re.search(r'(?<!\d)(\d{1,2})k(?:[_\-.]|$)', url or '', re.I)
        return int(m.group(1)) if m else None

    @staticmethod
    def _infer_stream(text, url=''):
        url = url or ''
        # Prefer explicit document title/header over filename.
        if re.search(r'поток\s*[БB]\b', text, re.I): return 'B'
        if re.search(r'поток\s*[АA]\b', text, re.I): return 'A'
        m=re.search(r'[_-]([ab])(?:[_\-.]|$)', url, re.I)
        return m.group(1).upper() if m else None

    @staticmethod
    def _infer_kind(text, url=''):
        url = url or ''
        low=(text+' '+url).lower()
        if 'занятий семинарского типа' in low or 'лечебное дело' in low and '_ld' in url.lower():
            return 'practice'
        if 'занятий лекционного типа' in low or 'лекц' in low or 'raspisanielekczij' in url.lower():
            return 'lecture'
        return None

    @staticmethod
    def _group_candidates(words, course):
        vals=[]
        for w in words:
            if len(w)<5: continue
            t=str(w[4]).strip()
            if not GROUP_RE.fullmatch(t): continue
            n=int(t)
            # If course is known, use it only as semantic disambiguation, not as
            # a layout selector. This prevents room numbers from becoming groups.
            if course is not None and n//100 != int(course): continue
            vals.append((t,float(w[0]),float(w[1]),float(w[2]),float(w[3])))
        return sorted(set(x[0] for x in vals), key=int)

    @staticmethod
    def _numeric_week_bands(words):
        nums=[]
        for w in words:
            t=str(w[4]).strip()
            if re.fullmatch(r'(?:[1-9]|[1-4]\d|5[0-2])',t):
                nums.append((int(t),float(w[0]),float(w[1]),float(w[2]),float(w[3])))
        by_y={}
        for n,x0,y0,x1,y1 in nums:
            key=round(((y0+y1)/2)/5)*5
            by_y.setdefault(key,[]).append((n,(x0+x1)/2))
        candidates=[]
        for arr in by_y.values():
            d={n:x for n,x in arr}
            if len(d)>=8:
                candidates.append(d)
        return max(candidates,key=len) if candidates else {}

    @staticmethod
    def _vector_score(drawings):
        if not drawings: return 0.0
        lines=rects=0
        for d in drawings:
            for item in d.get('items',[]):
                if item[0]=='l': lines+=1
                elif item[0]=='re': rects+=1
        return min(1.0,(lines+rects*4)/120.0)

    def analyze(self, source, url='', hinted_course=None, hinted_stream=None, hinted_kind=None):
        text,words,drawings=self._text_words(source)
        course=self._infer_course(text,url) or hinted_course
        stream=self._infer_stream(text,url) or hinted_stream
        kind=self._infer_kind(text,url) or hinted_kind
        groups=self._group_candidates(words,course)
        week_map=self._numeric_week_bands(words)
        text_low=text.lower()
        weekday_count=sum(1 for token in re.findall(r'(?<![а-яёa-z])[а-яёa-z]+',text_low) if token in DAY_WORDS)
        clock_count=len(CLOCK_RE.findall(text))
        vector=self._vector_score(drawings)
        week_score=min(1.0,len(week_map)/15.0)
        day_score=min(1.0,weekday_count/5.0)
        group_score=min(1.0,len(groups)/8.0)
        grid_score=min(1.0,0.45*week_score+0.35*group_score+0.20*vector)
        reasons=[]
        if len(groups)>=2: reasons.append(f'{len(groups)} group labels detected')
        if len(week_map)>=8: reasons.append(f'{len(week_map)} academic-week labels detected')
        if weekday_count: reasons.append(f'{weekday_count} weekday labels detected')
        if clock_count: reasons.append(f'{clock_count} clock ranges detected')
        if vector>=0.35: reasons.append('vector grid/merged-cell geometry detected')
        if grid_score>=0.58 and len(week_map)>=8:
            layout='weekly-matrix'
            confidence=min(0.99,0.55+0.35*week_score+0.10*group_score)
            reasons.append('matrix layout selected without course-specific rule')
        elif weekday_count and clock_count and len(groups)>=2:
            layout='daily-grid'
            confidence=min(0.97,0.55+0.25*day_score+0.20*group_score)
            reasons.append('day/time grid layout selected from document geometry')
        elif weekday_count and clock_count:
            layout='daily-list'
            confidence=0.78
            reasons.append('day/time list layout selected')
        else:
            layout='unknown'
            confidence=0.35
            reasons.append('insufficient structural signals; fallback chain will run')
        return LayoutProfile(course,stream,kind,groups,sorted(week_map),weekday_count,clock_count,vector,grid_score,layout,confidence,reasons)

    @staticmethod
    def _acceptable_practice_events(events, profile):
        """Reject structurally partial extractor output before accepting it.

        A parser backend can technically return a non-empty list after losing a
        merged row, one group, or an entire page. Publishing that partial list
        is worse than trying the next extractor. The final builder still performs
        the authoritative roster validation; this check only controls fallback.
        """
        if not events:
            return False
        groups={str(e.get('group')) for e in events if re.fullmatch(r'\d{3}',str(e.get('group','')))}
        expected=set(profile.groups)
        if expected and not expected.issubset(groups):
            return False
        if profile.layout=='weekly-matrix':
            if any(e.get('weekday') is not None for e in events):
                return False
            if any(e.get('scheduleMode')!='weekly-block' for e in events):
                return False
        return all(e.get('subject') and e.get('start') and e.get('end') for e in events)

    def parse_practice(self, source, course, url, stream):
        profile=self.analyze(source,url,course,stream,'practice')
        raw=self._raw_bytes(source)
        events=[]

        if profile.layout=='weekly-matrix' and raw is not None:
            # Matrix extractor is geometry-driven. It does not care whether the
            # source is 4B, 5A, 5B, a future course, etc. A partial result is
            # rejected so the next extractor gets a chance to recover it.
            try:
                candidate=self.m.parse_week_matrix_coordinate(raw,course,url,stream)
                if self._acceptable_practice_events(candidate,profile): events=candidate
            except Exception:
                events=[]
            if not events:
                try:
                    candidate=self.m.parse_week_matrix_text_fallback(raw,course,url,stream)
                    if self._acceptable_practice_events(candidate,profile): events=candidate
                except Exception:
                    events=[]
            if not events:
                try:
                    candidate=self.m.parse_week_matrix_tables(raw,course,url,stream)
                    if self._acceptable_practice_events(candidate,profile): events=candidate
                except Exception:
                    events=[]

        # Daily tables and any unknown future layout use the legacy extractor
        # chain as a compatibility engine. The universal layer decides this from
        # observed structure rather than from course number.
        if not events:
            if raw is not None:
                try:
                    doc=self._doc_from_bytes(raw)
                    for page in doc:
                        self.m._add_practice_events_from_table(events,page,course,url,stream)
                    if len(events)<3:
                        for page in doc:
                            self.m._add_practice_events_from_words_fallback(events,page,course,url,stream)
                    doc.close()
                except Exception:
                    events=[]
            else:
                try:
                    for page in source:
                        self.m._add_practice_events_from_table(events,page,course,url,stream)
                    if len(events)<3:
                        for page in source:
                            self.m._add_practice_events_from_words_fallback(events,page,course,url,stream)
                except Exception:
                    events=[]

        # Attach a machine-readable provenance marker to every event. The UI can
        # ignore it; diagnostics and future parsers can use it.
        for e in events:
            e.setdefault('parser','universal-schedule-parser-v1')
            e['layoutProfile']=profile.layout
            e['parseConfidence']=round(profile.confidence,3)
        return events,profile
