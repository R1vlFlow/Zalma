import { boot } from './app.js?v=90bfa026bc22b4d4';
boot().catch((err) => { const el = document.getElementById('fatalError'); if (el) {
    el.textContent = err instanceof Error ? err.message : 'Неизвестная ошибка';
    el.classList.add('show');
} });
