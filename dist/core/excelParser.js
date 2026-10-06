import { cleanText } from './normalize.js';
export function parseExcelWithSheetJS(data, XLSX) {
    const wb = XLSX.read(data, { type: 'array' });
    return wb.SheetNames.map(name => {
        const ws = wb.Sheets[name], range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1'), rows = [];
        for (let r = range.s.r; r <= range.e.r; r++) {
            const row = [];
            for (let c = range.s.c; c <= range.e.c; c++) {
                const ref = XLSX.utils.encode_cell({ r, c });
                row.push(cleanText(ws[ref]?.w ?? ws[ref]?.v ?? ''));
            }
            rows.push(row);
        }
        const warnings = [];
        for (const merge of (ws['!merges'] ?? [])) {
            const top = XLSX.utils.encode_cell({ r: merge.s.r, c: merge.s.c }), value = cleanText(ws[top]?.w ?? ws[top]?.v ?? '');
            for (let r = merge.s.r; r <= merge.e.r; r++)
                for (let c = merge.s.c; c <= merge.e.c; c++) {
                    const ref = XLSX.utils.encode_cell({ r, c });
                    const cell = ws[ref];
                    if (!cell || !String(cell.v ?? '').trim())
                        rows[r - range.s.r][c - range.s.c] = value;
                }
        }
        if (!rows.length)
            warnings.push('Лист пуст');
        return { name, rows, warnings };
    });
}
