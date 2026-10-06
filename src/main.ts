import { boot } from './app.js';
boot().catch((err:unknown)=>{const el=document.getElementById('fatalError');if(el){el.textContent=err instanceof Error?err.message:'Неизвестная ошибка';el.classList.add('show');}});
