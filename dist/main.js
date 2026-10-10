import { boot } from './app.js?v=d2156d5018346a2e';
boot().catch((err) => { const el = document.getElementById('fatalError'); if (el) {
    el.textContent = err instanceof Error ? err.message : 'Неизвестная ошибка';
    el.classList.add('show');
} });
