#!/usr/bin/env python3
"""Format-agnostic schedule ingestion layer.

The official Almazov page is treated as a *document registry*, not as a PDF
registry.  The same link can be labelled XLSX while serving PDF bytes, so the
parser always sniffs the payload before choosing a decoder.

Supported containers:
- PDF (PyMuPDF/pdfplumber; delegated to the hardened legacy engine)
- XLSX (openpyxl)
- XLS (xlrd when installed)
- ODS (odfpy when installed)
- CSV/TSV
- HTML tables
- DOCX (python-docx)
- PPTX (python-pptx)
- TXT/RTF
- images when an OCR backend is available

The output is deliberately small and canonical: rows/cells are converted into
schedule events, while confidence/provenance are retained for diagnostics.
"""
from __future__ import annotations

import csv
import io
import re
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

TIME_RE = re.compile(r"(?<!\d)(\d{1,2})\s*[:.]\s*(\d{2})\s*[-–—]\s*(\d{1,2})\s*[:.]\s*(\d{2})(?!\d)")
DAY_RE = re.compile(r"^(?:пн|вт|ср|чт|пт|сб|вс|понедельник|вторник|среда|четверг|пятница|суббота|воскресенье)\b", re.I)
GROUP_RE = re.compile(r"(?<!\d)(\d{3})(?!\d)")
WEEK_SPEC_RE = re.compile(r"\(([^()]*(?:\d)[^()]*)\)")
DAY_MAP = {
    "пн": 0, "понедельник": 0, "вт": 1, "вторник": 1,
    "ср": 2, "среда": 2, "чт": 3, "четверг": 3,
    "пт": 4, "пятница": 4, "сб": 5, "суббота": 5,
    "вс": 6, "воскресенье": 6,
}

@dataclass
class SourcePayload:
    url: str
    title: str
    content_type: str
    data: bytes
    format: str


def sniff_format(data: bytes, content_type: str = "", name: str = "") -> str:
    """Detect the real container. Extension is only a last-resort hint."""
    b = bytes(data[:8192])
    low = (content_type or "").lower()
    name_low = (name or "").lower()
    if b.startswith(b"%PDF-"):
        return "pdf"
    if b.startswith(b"PK\x03\x04"):
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                names = set(z.namelist())
                if "[Content_Types].xml" in names:
                    if any(n.startswith("xl/") for n in names): return "xlsx"
                    if any(n.startswith("word/") for n in names): return "docx"
                    if any(n.startswith("ppt/") for n in names): return "pptx"
        except Exception:
            pass
    if b.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
        # OLE compound container: could be XLS or legacy DOC. Prefer xls for
        # schedule links; callers can fall back to text extraction if needed.
        if "word" in low or name_low.endswith(".doc"):
            return "doc"
        return "xls"
    if b.startswith(b"{\\rtf") or "rtf" in low or name_low.endswith(".rtf"):
        return "rtf"
    if b.lstrip().startswith(b"<!doctype html") or b.lstrip().startswith(b"<html") or "html" in low:
        return "html"
    if "csv" in low or name_low.endswith(".csv"):
        return "csv"
    if "text/plain" in low or name_low.endswith(".txt"):
        return "txt"
    if b[:8] == b"\x89PNG\r\n\x1a\n" or b.startswith(b"\xff\xd8\xff") or b.startswith(b"RIFF"):
        return "image"
    return Path(name_low).suffix.lstrip(".") or "binary"


def _norm(v) -> str:
    return re.sub(r"\s+", " ", str(v or "").replace("\xa0", " ")).strip()


def _times(text: str):
    out=[]
    for m in TIME_RE.finditer(str(text or "")):
        out.append((f"{int(m.group(1)):02d}:{m.group(2)}", f"{int(m.group(3)):02d}:{m.group(4)}"))
    return out


def _week_numbers(text: str):
    nums=[]
    for m in WEEK_SPEC_RE.finditer(str(text or "")):
        spec=m.group(1)
        for a,b in re.findall(r"(\d+)\s*[-–—]\s*(\d+)", spec):
            nums.extend(range(int(a), int(b)+1))
        rest=re.sub(r"\d+\s*[-–—]\s*\d+", "", spec)
        nums.extend(int(x) for x in re.findall(r"\d+", rest))
    return sorted(set(n for n in nums if 1 <= n <= 52))


def _group_cols(rows, course):
    wanted = str(course)
    found = {}
    for ri,row in enumerate(rows):
        for ci,val in enumerate(row):
            m=GROUP_RE.fullmatch(_norm(val))
            if m and (not course or m.group(1).startswith(wanted)):
                found.setdefault(m.group(1), ci)
        if len(found) >= 3:
            # The first strong group header is the useful one; later room
            # numbers must not replace it.
            return found
    return found


def _expand_merged_rows(rows, merges=None):
    rows=[list(r) for r in rows]
    if not merges:
        return rows
    for r0,r1,c0,c1 in merges:
        value=rows[r0][c0] if r0 < len(rows) and c0 < len(rows[r0]) else ""
        for r in range(r0,r1+1):
            while len(rows[r]) <= c1: rows[r].append("")
            for c in range(c0,c1+1):
                if not _norm(rows[r][c]): rows[r][c]=value
    return rows


def _parse_cell_records(text):
    """Parse `Subject (weeks) location` sequences without a subject catalogue."""
    text=_norm(text)
    if not text: return []
    matches=list(WEEK_SPEC_RE.finditer(text))
    if not matches:
        return [(text, [], "")]
    records=[]
    for i,m in enumerate(matches):
        before=_norm(text[:m.start()])
        # For later week specs, a subject appears only after a recognisable
        # location marker. Otherwise it is another week range for the same
        # subject.
        subject=before
        if i and not subject:
            subject=records[-1][0]
        elif i and records:
            loc_markers=list(re.finditer(r"(?:ауд\.?|каб\.?|зал\b|ЦДТИ|АСЦ|ШКОЛА|Башня|Солнечное|Пархоменко)", before, re.I))
            if loc_markers:
                suffix=_norm(before[loc_markers[-1].end():])
                if suffix: subject=suffix
                else: subject=records[-1][0]
            else:
                subject=records[-1][0]
        end=matches[i+1].start() if i+1<len(matches) else len(text)
        tail=_norm(text[m.end():end])
        location=tail
        records.append((subject or "Занятие", _week_numbers(text[m.start():m.end()]), location))
    return records


def parse_rows(rows, course, stream, kind, url, week_start_fn=None):
    """Parse arbitrary spreadsheet-like rows.

    This deliberately uses semantic anchors (group/time/day/week) rather than
    fixed row/column numbers. It therefore tolerates title rows, blank rows,
    inserted columns and reordered group columns.
    """
    rows=_expand_merged_rows(rows)
    if not rows: return []
    gcols=_group_cols(rows,course) if kind=="practice" else {}
    events=[]; current_day=None
    for row in rows:
        vals=[_norm(v) for v in row]
        joined=_norm(" | ".join(v for v in vals if v))
        if not joined: continue
        day_match=DAY_RE.match(vals[0] if vals else "") or DAY_RE.match(joined)
        if day_match:
            token=day_match.group(0).lower().rstrip(".,:")
            current_day=DAY_MAP.get(token,current_day)
        ranges=_times(joined)
        if not ranges or current_day is None: continue
        # Prefer an explicit time cell; otherwise use all discovered ranges.
        time_ranges=ranges
        if len(time_ranges)>4: time_ranges=time_ranges[:4]
        if kind=="practice" and gcols:
            for group,ci in gcols.items():
                if ci>=len(vals): continue
                cell=vals[ci]
                if not cell: continue
                records=_parse_cell_records(cell)
                for start,end in time_ranges:
                    for subject,weeks,location in records:
                        if not subject: continue
                        if not weeks: weeks=[None]
                        for wk in weeks:
                            e={"weekday":current_day,"start":start,"end":end,"subject":subject,"location":location,"group":group,"stream":stream or "","type":"practice","sourceUrl":url,"parser":"universal-table-v1"}
                            if wk is not None:
                                e["weekNumber"]=wk
                                if week_start_fn:e["weekStart"]=week_start_fn(wk)
                            events.append(e)
        else:
            # Lecture/general schedule: one event per semantic subject chunk.
            body=[]
            for v in vals:
                if TIME_RE.search(v):
                    v=TIME_RE.sub("",v).strip(" /|")
                if v and not GROUP_RE.fullmatch(v): body.append(v)
            text=_norm(" ".join(body))
            # If week ranges are embedded, split them; otherwise keep the row
            # as one subject. Lecture events are intentionally group-wide.
            records=_parse_cell_records(text)
            if not records: records=[(text,[],"")]
            for start,end in time_ranges:
                for subject,weeks,location in records:
                    if not subject or len(subject)<2: continue
                    if not weeks: weeks=[None]
                    for wk in weeks:
                        e={"weekday":current_day,"start":start,"end":end,"subject":subject,"location":location,"group":"ALL","stream":stream or "","type":"lecture","sourceUrl":url,"parser":"universal-table-v1"}
                        if wk is not None:
                            e["weekNumber"]=wk
                            if week_start_fn:e["weekStart"]=week_start_fn(wk)
                        events.append(e)
    return events


def decode_rows(data: bytes, fmt: str):
    """Return (rows, merges) for table-like formats."""
    if fmt=="xlsx":
        from openpyxl import load_workbook
        wb=load_workbook(io.BytesIO(data),data_only=True,read_only=False)
        ws=max(wb.worksheets,key=lambda s:s.max_row*s.max_column)
        rows=[[c.value for c in row] for row in ws.iter_rows()]
        merges=[]
        for mr in ws.merged_cells.ranges:
            merges.append((mr.min_row-1,mr.max_row-1,mr.min_col-1,mr.max_col-1))
        return _expand_merged_rows(rows,merges)
    if fmt=="xls":
        import xlrd
        book=xlrd.open_workbook(file_contents=data,on_demand=True)
        ws=max(book.sheets(),key=lambda s:s.nrows*s.ncols)
        return [[ws.cell_value(r,c) for c in range(ws.ncols)] for r in range(ws.nrows)]
    if fmt=="ods":
        from odf.opendocument import load
        from odf.table import Table, TableRow, TableCell
        from odf import teletype
        doc=load(io.BytesIO(data)); tables=doc.spreadsheet.getElementsByType(Table)
        t=max(tables,key=lambda x:len(x.getElementsByType(TableRow)))
        out=[]
        for tr in t.getElementsByType(TableRow):
            row=[]
            for tc in tr.getElementsByType(TableCell):
                txt=teletype.extractText(tc)
                repeat=int(tc.getAttribute("numbercolumnsrepeated") or 1)
                row.extend([txt]*repeat)
            out.append(row)
        return out
    if fmt in {"csv","tsv"}:
        text=data.decode("utf-8-sig",errors="replace")
        delim="\t" if fmt=="tsv" else None
        if delim is None:
            try: delim=csv.Sniffer().sniff(text[:4096],",;\t").delimiter
            except Exception: delim="," 
        return list(csv.reader(io.StringIO(text),delimiter=delim))
    if fmt=="html":
        from bs4 import BeautifulSoup
        soup=BeautifulSoup(data,"html.parser")
        tables=soup.find_all("table")
        if not tables:return []
        table=max(tables,key=lambda t:len(t.find_all("tr")))
        return [[_norm(c.get_text(" ",strip=True)) for c in tr.find_all(["th","td"])] for tr in table.find_all("tr")]
    return []


def decode_text(data: bytes, fmt: str) -> str:
    if fmt=="rtf":
        text=data.decode("utf-8",errors="ignore")
        text=re.sub(r"\\'[0-9a-fA-F]{2}","",text)
        text=re.sub(r"\\[a-zA-Z]+-?\d* ?", " ", text)
        return re.sub(r"[{}]","",text)
    return data.decode("utf-8-sig",errors="replace")


def parse_source_bytes(data, fmt, course, stream, kind, url, legacy):
    """Unified entry point. PDF remains delegated to the proven engine."""
    if fmt=="pdf":
        doc=legacy.fitz.open(stream=data,filetype="pdf")
        if kind=="lecture": events=legacy.parse_lecture(doc,int(course),url,stream or "")
        else: events=legacy.parse_practice(data,int(course),url,stream or "")
        return events
    if fmt in {"xlsx","xls","ods","csv","tsv","html"}:
        rows=decode_rows(data,fmt)
        return parse_rows(rows,course,stream,kind,url,legacy.week_start)
    if fmt=="docx":
        from docx import Document
        doc=Document(io.BytesIO(data))
        rows=[]
        for t in doc.tables:
            for r in t.rows: rows.append([c.text for c in r.cells])
        if rows:return parse_rows(rows,course,stream,kind,url,legacy.week_start)
        text="\n".join(p.text for p in doc.paragraphs)
        return legacy.make_text_schedule(text,Path(url).name).get("weeks",[])
    if fmt=="pptx":
        from pptx import Presentation
        prs=Presentation(io.BytesIO(data)); rows=[]
        for slide in prs.slides:
            for shape in slide.shapes:
                if getattr(shape,"has_table",False):
                    for r in shape.table.rows: rows.append([c.text for c in r.cells])
                elif hasattr(shape,"text") and shape.text.strip(): rows.append([shape.text])
        return parse_rows(rows,course,stream,kind,url,legacy.week_start)
    if fmt in {"txt","rtf"}:
        return legacy.make_text_schedule(decode_text(data,fmt),Path(url).name).get("weeks",[])
    if fmt=="image":
        # Optional OCR path. CI does not fail if OCR is unavailable; source
        # validation will reject a non-parsable image rather than publishing
        # fabricated events.
        try:
            import pytesseract
            from PIL import Image
            txt=pytesseract.image_to_string(Image.open(io.BytesIO(data)),lang="rus+eng")
            return legacy.make_text_schedule(txt,Path(url).name).get("weeks",[])
        except Exception as exc:
            raise RuntimeError(f"OCR backend unavailable: {exc}")
    raise RuntimeError(f"unsupported source format: {fmt}")
