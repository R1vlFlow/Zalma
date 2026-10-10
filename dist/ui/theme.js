import { readPersonalization, updatePersonalization } from '../services/personalizationStore.js?v=d2156d5018346a2e';
const KEY = 'almazov.theme';
export function themeMode() { const stored = readPersonalization().theme; const v = stored ?? localStorage.getItem(KEY); return v === 'light' || v === 'dark' || v === 'system' ? v : 'system'; }
export function applyTheme(mode, save = true) { const actual = mode === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : mode; document.documentElement.dataset.theme = actual; document.documentElement.dataset.themePreference = mode; document.documentElement.style.colorScheme = actual; if (save) {
    localStorage.setItem(KEY, mode);
    updatePersonalization({ theme: mode });
} syncThemeButton(mode); }
function syncThemeButton(mode) { document.querySelectorAll('[data-action="theme"]').forEach(b => { b.dataset.mode = mode; b.textContent = mode === 'dark' ? '☾' : mode === 'light' ? '☼' : '◐'; b.title = `Тема: ${mode === 'dark' ? 'тёмная' : mode === 'light' ? 'светлая' : 'системная'}. Нажмите для смены`; b.setAttribute('aria-label', b.title); }); }
export function initTheme() { const current = themeMode(); applyTheme(current, false); const mq = matchMedia('(prefers-color-scheme: light)'); mq.addEventListener?.('change', () => { if (themeMode() === 'system')
    applyTheme('system', false); }); }
export function cycleTheme() { const current = themeMode(); applyTheme(current === 'dark' ? 'light' : current === 'light' ? 'system' : 'dark'); }
