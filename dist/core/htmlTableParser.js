import { cleanText } from './normalize.js?v=3e057c0da2aed0ed';
function attrInt(tag, name) { const m = tag.match(new RegExp(`${name}\\s*=\\s*["']?(\\d+)`, 'i')); return Math.max(1, Number(m?.[1] ?? 1)); }
function cellText(html) { return cleanText(html.replace(/<br\s*\/?\s*>/gi, ' ').replace(/<[^>]+>/g, ' ')); }
export function parseHtmlTable(html) {
    const tableRows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
    const grid = [];
    const occupancy = new Map();
    let maxWidth = 0;
    tableRows.forEach((rm, rowIndex) => {
        const row = rm[1] ?? '';
        const cells = [...row.matchAll(/<(td|th)\b([^>]*)>([\s\S]*?)<\/(?:td|th)>/gi)];
        let col = 0;
        grid[rowIndex] ??= [];
        for (const cm of cells) {
            while (occupancy.has(`${rowIndex}:${col}`))
                col++;
            const attrs = cm[2] ?? '', rs = attrInt(attrs, 'rowspan'), cs = attrInt(attrs, 'colspan'), text = cellText(cm[3] ?? '');
            for (let r = 0; r < rs; r++)
                for (let c = 0; c < cs; c++) {
                    const rr = rowIndex + r, cc = col + c;
                    grid[rr] ??= [];
                    grid[rr][cc] = text;
                    if (r > 0 || c > 0)
                        occupancy.set(`${rr}:${cc}`, text);
                    maxWidth = Math.max(maxWidth, cc + 1);
                }
            col += cs;
        }
    });
    return grid.map(r => Array.from({ length: maxWidth }, (_, i) => r[i] ?? ''));
}
export function detectHeaders(rows) {
    const score = (row) => row.filter(c => /день|недел|время|групп|дисцип|предмет|место|ауд|препод/i.test(c)).length;
    return [...rows].slice(0, 8).sort((a, b) => score(b) - score(a))[0] ?? [];
}
export function parseHtmlSchedule(html) {
    const rows = parseHtmlTable(html);
    const warnings = [];
    if (!rows.length)
        warnings.push('HTML не содержит таблиц');
    const headers = detectHeaders(rows);
    if (rows.length && headers.every(x => !x))
        warnings.push('Не удалось уверенно определить строку заголовков');
    return { rows, headers, warnings, source: 'html' };
}
