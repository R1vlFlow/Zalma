import { boot } from './app.js?v=e20ab0a42137613c';
boot().catch((err) => { const el = document.getElementById('fatalError'); if (el) {
    el.textContent = err instanceof Error ? err.message : 'Неизвестная ошибка';
    el.classList.add('show');
} });
