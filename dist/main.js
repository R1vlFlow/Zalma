import { boot } from './app.js?v=8b54ecbe24579506';
boot().catch((err) => { const el = document.getElementById('fatalError'); if (el) {
    el.textContent = err instanceof Error ? err.message : 'Неизвестная ошибка';
    el.classList.add('show');
} });
