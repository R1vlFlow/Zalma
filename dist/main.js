import { boot } from './app.js?v=3e057c0da2aed0ed';
boot().catch((err) => { const el = document.getElementById('fatalError'); if (el) {
    el.textContent = err instanceof Error ? err.message : 'Неизвестная ошибка';
    el.classList.add('show');
} });
