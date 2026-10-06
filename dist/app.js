import { PROGRAMS, sourceFor, sourcesFor } from './data/catalog.js';
import { mondayOf, weekDates, formatDateRu, longDateRu, sameDay, addDays, todayISO } from './core/date.js';
import { filterEvents, indexByDate } from './core/filter.js';
import { loadSchedule, clearScheduleMemory } from './services/scheduleService.js';
import { addTask, readTasks, removeTask, updateTask } from './services/taskService.js';
import { cycleTheme, initTheme, themeMode } from './ui/theme.js';
import { FAQ } from './ui/faq.js';
const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const DEFAULT_PROFILE = { program: '31.05.01', course: 1, group: '123' };
const initial = readInitialProfile();
const state = { profile: initial, week: mondayOf(todayISO()), events: [], status: 'loading', message: 'Подготавливаем расписание…', search: '', type: 'all', page: 'schedule', tasks: readTasks(), theme: themeMode(), faqQuery: '' };
function $(id) { const el = document.getElementById(id); if (!el)
    throw new Error(`Missing #${id}`); return el; }
function esc(v) { return v.replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[c])); }
function streamForGroup(program, group) { if (program !== '31.05.01')
    return null; const n = Number.parseInt(group, 10); if (!Number.isFinite(n))
    return null; if (n >= 101 && n <= 122)
    return 'A'; if (n >= 123 && n <= 135)
    return 'B'; if (n >= 201 && n <= 216)
    return 'A'; if (n >= 217 && n <= 232)
    return 'B'; if (n >= 301 && n <= 312)
    return 'A'; if (n >= 313 && n <= 324)
    return 'B'; if (n >= 401 && n <= 412)
    return 'A'; if (n >= 413 && n <= 423)
    return 'B'; if (n >= 501 && n <= 512)
    return 'A'; if (n >= 513 && n <= 522)
    return 'B'; if (n >= 601 && n <= 616)
    return 'A'; return null; }
function groupsFor(program, course) {
    if (program === '31.05.01') {
        const maps = { 1: [101, 135], 2: [201, 232], 3: [301, 324], 4: [401, 423], 5: [501, 522], 6: [601, 616] };
        const [a, b] = maps[course];
        return Array.from({ length: b - a + 1 }, (_, i) => String(a + i));
    }
    if (program === '31.05.02') {
        if (course === 1)
            return Array.from({ length: 7 }, (_, i) => `${101 + i}П`);
        if (course === 2)
            return ['201П', '202П', '203П'];
        return [];
    }
    if (program === '37.05.01') {
        if (course === 1)
            return ['101КП', '102КП'];
        if (course === 2)
            return ['201КП', '202КП'];
        return [];
    }
    return [];
}
function groupOptions(program, course) { const groups = groupsFor(program, course); return groups.length ? groups : ['']; }
function ensureProfile() { const groups = groupsFor(state.profile.program, state.profile.course); if (!groups.length) {
    state.profile.group = '';
    return;
} if (!groups.includes(state.profile.group))
    state.profile.group = groups[0]; }
function readInitialProfile() { try {
    const params = new URLSearchParams(location.search);
    const raw = JSON.parse(localStorage.getItem('almazov.profile') ?? 'null');
    const stored = raw && typeof raw === 'object' ? raw : {};
    const programValue = params.get('program') ?? String(stored.program ?? '');
    const courseValue = params.get('course') ?? String(stored.course ?? '');
    const groupValue = params.get('group') ?? String(stored.group ?? '');
    const program = PROGRAMS.some(x => x.code === programValue) ? programValue : DEFAULT_PROFILE.program;
    const n = Number(courseValue);
    const course = Number.isInteger(n) && n >= 1 && n <= 6 ? n : DEFAULT_PROFILE.course;
    return { program, course, group: String(groupValue) };
}
catch {
    return { ...DEFAULT_PROFILE };
} }
export async function boot() { initTheme(); ensureProfile(); renderShell(); bind(); render(); await loadCurrent(); render(); }
async function loadCurrent() { state.status = 'loading'; state.message = 'Загружаем и проверяем источник…'; renderSchedule(); const result = await loadSchedule(state.profile.program, state.profile.course); state.events = result.events; state.status = result.status; state.message = result.message; }
function renderShell() { const p = PROGRAMS.find(x => x.code === state.profile.program); $('profileName').textContent = state.profile.group ? `Группа ${state.profile.group}` : p?.shortTitle ?? 'Профиль'; $('profileMeta').textContent = `${p?.title ?? ''} · ${state.profile.course} курс${streamForGroup(state.profile.program, state.profile.group) ? ` · поток ${streamForGroup(state.profile.program, state.profile.group)}` : ''}`; $('syncLabel').textContent = state.message; $('statusDot').className = `${state.status === 'live' ? 'ok' : state.status === 'cache' ? 'cache' : state.status === 'loading' ? 'loading' : 'bad'}`; }
function render() { renderShell(); renderProfileOptions(); renderSchedule(); renderTasks(); renderFaculties(); renderResources(); renderKug(); renderFaq(state.faqQuery); renderHome(); }
function nav(page) { state.page = page; document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === `page-${page}`)); document.querySelectorAll('[data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === page)); $('pageTitle').textContent = { home: 'Главная', schedule: 'Расписание', homework: 'ДЗ и задачи', kug: 'КУГ', resources: 'Материалы', faculties: 'Факультеты', faq: 'Справка' }[page] ?? 'Almazov'; document.body.classList.remove('menu-open'); if (page === 'schedule')
    renderSchedule(); if (page === 'homework')
    renderTasks(); if (page === 'faq')
    renderFaq(state.faqQuery); if (page === 'home')
    renderHome(); }
function renderHome() { const events = filterEvents(state.events, { ...state.profile, stream: streamForGroup(state.profile.program, state.profile.group) }, state.week, '', 'all'); const today = todayISO(); const upcoming = events.filter(e => e.date >= today).slice(0, 4); $('homeContext').textContent = state.profile.group ? `${PROGRAMS.find(p => p.code === state.profile.program)?.title} · ${state.profile.course} курс · группа ${state.profile.group}` : 'Выберите группу'; $('homeStats').innerHTML = [['На неделе', String(events.length)], ['Сегодня', String(events.filter(e => e.date === today).length)], ['Курс', String(state.profile.course)], ['Источник', state.status === 'live' ? 'live' : state.status === 'cache' ? 'cache' : 'offline']].map(([a, b]) => `<div class="stat-card"><span>${a}</span><b>${b}</b></div>`).join(''); $('homeUpcoming').innerHTML = upcoming.length ? upcoming.map(e => `<article class="next-item"><div><span>${longDateRu(e.date)} · ${e.start}</span><b>${esc(e.subject)}</b><small>${esc(e.location || 'Аудитория не указана')}</small></div><button class="btn small" data-jump-date="${e.date}">Открыть</button></article>`).join('') : `<div class="empty-state compact card"><div class="empty-icon">◷</div><h3>Ближайших занятий нет</h3><p>Откройте расписание или выберите другую неделю.</p></div>`; }
function renderSchedule() {
    $('emptyState')?.remove();
    const events = filterEvents(state.events, { ...state.profile, stream: streamForGroup(state.profile.program, state.profile.group) }, state.week, state.search, state.type);
    const dateMap = indexByDate(events);
    const dates = weekDates(state.week);
    const p = PROGRAMS.find(x => x.code === state.profile.program);
    $('weekLabel').textContent = `${formatDateRu(state.week)} — ${formatDateRu(addDays(state.week, 6))}`;
    $('weekSubLabel').textContent = `${p?.shortTitle ?? ''} · ${state.profile.course} курс${state.profile.group ? ` · группа ${state.profile.group}` : ''}`;
    $('scheduleCount').textContent = `${events.length} ${plural(events.length, 'пара', 'пары', 'пар')}`;
    $('weekStrip').innerHTML = dates.map((d, i) => `<button class="day-pill ${sameDay(d, todayISO()) ? 'is-today' : ''}" data-jump-date="${d}"><span>${DAYS[i]}</span><b>${d.slice(8, 10)}</b><em>${dateMap.get(d)?.length ?? 0}</em></button>`).join('');
    $('desktopSchedule').innerHTML = `<div class="agenda-grid">${dates.map((d, i) => dayColumn(d, i, dateMap.get(d) ?? [])).join('')}</div>`;
    $('mobileSchedule').innerHTML = dates.map((d, i) => mobileDay(d, i, dateMap.get(d) ?? [])).join('');
    document.querySelectorAll('.desktop-schedule .day-column').forEach((el, i) => { el.id = `day-${dates[i]}`; });
    document.querySelectorAll('.mobile-schedule .mobile-day').forEach((el, i) => { el.id = `mobile-day-${dates[i]}`; });
    $('dataHealthTitle').textContent = state.status === 'live' ? 'Источник актуален' : state.status === 'cache' ? 'Локальный snapshot' : state.status === 'loading' ? 'Загрузка…' : state.status === 'partial' ? 'Частичные данные' : 'Источник недоступен';
    $('dataHealthText').textContent = state.message;
    $('sourceLink').href = sourceFor(state.profile.program, state.profile.course);
    $('statusText').textContent = state.status === 'live' ? 'LIVE' : state.status === 'cache' ? 'CACHE' : state.status === 'loading' ? 'LOAD' : 'CHECK';
    if (state.status === 'loading') {
        $('desktopSchedule').innerHTML = renderSkeleton(true);
        $('mobileSchedule').innerHTML = renderSkeleton(false);
    }
    else if (!events.length) {
        const el = document.createElement('div');
        el.id = 'emptyState';
        el.className = 'empty-state card';
        const noPublished = !PROGRAMS.find(x => x.code === state.profile.program)?.publishedCourses.includes(state.profile.course);
        el.innerHTML = `<div class="empty-icon">${state.status === 'unavailable' ? '!' : '∅'}</div><h3>${noPublished ? 'Официальное расписание не опубликовано' : state.status === 'error' ? 'Не удалось загрузить расписание' : 'На выбранной неделе занятий нет'}</h3><p>${esc(state.message)}</p><div class="empty-actions"><a class="btn primary" href="${sourceFor(state.profile.program, state.profile.course)}" target="_blank" rel="noopener noreferrer">Официальный источник ↗</a><button class="btn" data-action="refresh-data">Повторить</button></div>`;
        $('scheduleRoot').appendChild(el);
    }
    else {
        $('emptyState')?.remove();
    }
}
function renderSkeleton(desktop) { const cols = desktop ? 7 : 2; return `<div class="skeleton-grid">${Array.from({ length: cols }, () => `<div class="skeleton-day"><i></i><i></i><i></i></div>`).join('')}</div>`; }
function dayColumn(date, index, list) { return `<section class="day-column ${date === todayISO() ? 'today' : ''}"><header><div><span>${DAYS[index]}</span><b>${date.slice(8, 10)} ${new Intl.DateTimeFormat('ru-RU', { month: 'short' }).format(new Date(`${date}T12:00:00Z`)).replace('.', '')}</b></div><strong>${list.length || '—'}</strong></header><div class="day-list">${list.length ? list.map(lessonCard).join('') : `<div class="day-empty">Свободный день</div>`}</div></section>`; }
function mobileDay(date, index, list) { return `<section class="mobile-day ${date === todayISO() ? 'today' : ''}"><header><div><span>${DAYS[index]}</span><h3>${longDateRu(date)}</h3></div><b>${list.length}</b></header><div class="day-list">${list.length ? list.map(lessonCard).join('') : `<div class="day-empty">Свободный день</div>`}</div></section>`; }
function lessonCard(e) { const label = { lecture: 'Лекция', practice: 'ПЗ', lab: 'Lab', assessment: 'Контроль', other: 'Занятие' }[e.type]; return `<article class="lesson ${e.type}" tabindex="0" aria-label="${esc(`${e.start}–${e.end} · ${label} · ${e.subject}`)}"><div class="lesson-top"><span class="time">${esc(e.start)}–${esc(e.end)}</span><span class="type">${label}</span>${e.half ? `<span class="half ${e.half === '1/2' ? 'num' : 'den'}">${e.half}</span>` : ''}${e.stream ? `<span class="stream">Поток ${e.stream}</span>` : ''}</div><h4>${esc(e.subject)}</h4>${e.location ? `<p>⌖ ${esc(e.location)}</p>` : ''}${e.teacher ? `<p>◌ ${esc(e.teacher)}</p>` : ''}${e.weeks ? `<span class="weeks">${esc(e.weeks)}</span>` : ''}</article>`; }
function plural(n, a, b, c) { const m = n % 10, k = n % 100; if (m === 1 && k !== 11)
    return a; if (m >= 2 && m <= 4 && (k < 12 || k > 14))
    return b; return c; }
function renderKug() { const p = PROGRAMS.find(x => x.code === state.profile.program); $('kugContext').textContent = state.profile.group ? `${p?.title ?? ''} · ${state.profile.course} курс · ${state.profile.group}` : `${p?.title ?? ''} · ${state.profile.course} курс`; }
function renderResources() { const grouped = PROGRAMS.flatMap(p => p.scheduleCourses.map(course => ({ p, course, sources: sourcesFor(p.code, course) }))); $('resourceList').innerHTML = grouped.map(({ p, course, sources }) => { const published = sources.filter(s => s.status === 'published' || s.status === 'verified'); const status = !p.publishedCourses.includes(course) ? 'Не опубликовано' : published.length ? 'Источник доступен' : 'Требуется серверный импорт'; return `<article class="resource-card card"><div class="meta"><span class="eyebrow">${p.code} · ${course} курс</span><b>${p.title}</b><p>${published.length ? published.map(s => esc(s.title)).join(' · ') : 'Официальная страница / parser adapter'}</p></div><div><span class="resource-status">${status}</span><div style="height:6px"></div><a class="btn small" href="${sourceFor(p.code, course)}" target="_blank" rel="noopener noreferrer">Источник ↗</a></div></article>`; }).join(''); }
function syncProfileSelects() { const program = $('programSelect'), course = $('courseSelect'), group = $('groupSelect'); program.value = state.profile.program; course.value = String(state.profile.course); group.value = state.profile.group; }
function fillModalOptions(program, course, group) { const ps = $('modalProgram'), cs = $('modalCourse'), gs = $('modalGroup'); ps.innerHTML = PROGRAMS.map(p => `<option value="${p.code}">${p.title} · ${p.code}</option>`).join(''); cs.innerHTML = [1, 2, 3, 4, 5, 6].map(c => `<option value="${c}">${c} курс</option>`).join(''); const groups = groupOptions(program, course); gs.innerHTML = groups.map(g => g ? `<option value="${g}">${g}</option>` : `<option value="">— группы не опубликованы —</option>`).join(''); ps.value = program; cs.value = String(course); gs.value = group; }
function renderTasks() { const tasks = state.tasks.filter(t => t.program === state.profile.program && t.course === state.profile.course && t.group === state.profile.group); $('taskCount').textContent = String(tasks.filter(t => !t.done).length); $('taskList').innerHTML = tasks.length ? tasks.sort((a, b) => Number(a.done) - Number(b.done) || (a.due ?? '9999').localeCompare(b.due ?? '9999')).map(t => `<article class="task-row ${t.done ? 'done' : ''}"><div class="task-check">${t.done ? '✓' : '○'}</div><div class="task-body"><b>${esc(t.subject)}</b><p>${esc(t.text)}</p>${t.due ? `<small>до ${esc(t.due)}</small>` : ''}</div><div class="task-actions"><button class="btn small" data-task-toggle="${t.id}">${t.done ? 'Вернуть' : 'Готово'}</button><button class="btn small danger" data-task-delete="${t.id}">Удалить</button></div></article>`).join('') : `<div class="empty-state compact card"><div class="empty-icon">✓</div><h3>Задач пока нет</h3><p>Добавьте домашнее задание и привяжите его к выбранной группе.</p></div>`; }
function renderFaculties() { $('facultyGrid').innerHTML = PROGRAMS.map(p => { const published = p.publishedCourses.length; return `<article class="faculty-card card"><span class="eyebrow">${p.code}</span><h3>${p.title}</h3><p>${p.faculty}</p><div class="faculty-tags"><span>1–6 курсы</span><span>${published}/6 опубликовано</span></div><button class="btn small primary" data-pick-program="${p.code}">Открыть расписание</button></article>`; }).join(''); }
function renderFaq(filter = '') { const q = filter.trim().toLowerCase(); $('faqList').innerHTML = FAQ.filter(([a, b]) => `${a} ${b}`.toLowerCase().includes(q)).map(([a, b]) => `<details><summary>${esc(a)}<span>+</span></summary><p>${esc(b)}</p></details>`).join('') || `<div class="empty-state compact card"><h3>Ничего не найдено</h3></div>`; }
function renderProfileOptions() { const ps = $('programSelect'), cs = $('courseSelect'), gs = $('groupSelect'); ps.innerHTML = PROGRAMS.map(p => `<option value="${p.code}">${p.title} · ${p.code}</option>`).join(''); cs.innerHTML = [1, 2, 3, 4, 5, 6].map(c => `<option value="${c}">${c} курс</option>`).join(''); const groups = groupOptions(state.profile.program, state.profile.course); gs.innerHTML = groups.map(g => g ? `<option value="${g}">${g}</option>` : `<option value="">— группы не опубликованы —</option>`).join(''); syncProfileSelects(); fillModalOptions(state.profile.program, state.profile.course, state.profile.group); }
function applySelectProfile() { const p = $('programSelect'), c = $('courseSelect'), g = $('groupSelect'); state.profile = { program: p.value, course: Number(c.value), group: g.value || '' }; ensureProfile(); localStorage.setItem('almazov.profile', JSON.stringify(state.profile)); state.week = mondayOf(todayISO()); state.events = []; state.status = 'loading'; state.message = 'Подготавливаем новое расписание…'; clearScheduleMemory(); render(); return loadCurrent().then(render); }
function bind() {
    $('themeMeta')?.addEventListener('click', () => { });
    document.addEventListener('click', async (e) => {
        const t = e.target.closest('[data-action],[data-page],[data-pick-program],[data-task-delete],[data-task-toggle],[data-jump-date]');
        if (!t)
            return;
        const action = t.dataset.action;
        if (t.dataset.page) {
            nav(t.dataset.page);
            return;
        }
        if (action === 'toggle-menu') {
            document.body.classList.toggle('menu-open');
            return;
        }
        if (action === 'theme') {
            cycleTheme();
            state.theme = themeMode();
            return;
        }
        if (action === 'today') {
            state.week = mondayOf(todayISO());
            renderSchedule();
            return;
        }
        if (action === 'prev-week') {
            state.week = addDays(state.week, -7);
            renderSchedule();
            return;
        }
        if (action === 'next-week') {
            state.week = addDays(state.week, 7);
            renderSchedule();
            return;
        }
        if (action === 'refresh-data') {
            clearScheduleMemory();
            await loadCurrent();
            render();
            return;
        }
        if (action === 'profile') {
            openModal('profileModal');
            return;
        }
        if (action === 'close-modal') {
            closeModal('profileModal');
            return;
        }
        if (action === 'save-profile') {
            await saveProfile();
            return;
        }
        if (action === 'add-task') {
            openTask();
            return;
        }
        if (action === 'close-task') {
            closeModal('taskModal');
            return;
        }
        if (action === 'save-task') {
            saveTask();
            return;
        }
        if (action === 'share-week') {
            await shareLink();
            return;
        }
        if (action === 'export-ics') {
            exportICS();
            return;
        }
        if (action === 'print-schedule') {
            window.print();
            return;
        }
        if (t.dataset.pickProgram) {
            state.profile.program = t.dataset.pickProgram;
            state.profile.course = 1;
            state.profile.group = groupsFor(state.profile.program, 1)[0] ?? '';
            localStorage.setItem('almazov.profile', JSON.stringify(state.profile));
            state.week = mondayOf(todayISO());
            state.events = [];
            state.status = 'loading';
            state.message = 'Подготавливаем новое расписание…';
            clearScheduleMemory();
            nav('schedule');
            await loadCurrent();
            render();
            return;
        }
        if (t.dataset.taskDelete) {
            removeTask(t.dataset.taskDelete);
            state.tasks = readTasks();
            renderTasks();
            return;
        }
        if (t.dataset.taskToggle) {
            const tt = readTasks().find(x => x.id === t.dataset.taskToggle);
            if (tt)
                updateTask(tt.id, { done: !tt.done });
            state.tasks = readTasks();
            renderTasks();
            return;
        }
        if (t.dataset.jumpDate) {
            const date = t.dataset.jumpDate;
            document.getElementById(`day-${date}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            document.getElementById(`mobile-day-${date}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }
    });
    for (const id of ['programSelect', 'courseSelect', 'groupSelect'])
        $(id).addEventListener('change', () => { if (id === 'programSelect' || id === 'courseSelect')
            renderProfileOptions(); applySelectProfile(); });
    $('scheduleSearch').addEventListener('input', () => { state.search = $('scheduleSearch').value; renderSchedule(); });
    document.querySelectorAll('#typeFilter [data-type]').forEach(b => b.addEventListener('click', () => { state.type = b.dataset.type ?? 'all'; document.querySelectorAll('#typeFilter [data-type]').forEach(x => x.classList.remove('active')); b.classList.add('active'); renderSchedule(); }));
    $('faqSearch').addEventListener('input', () => { state.faqQuery = $('faqSearch').value; renderFaq(state.faqQuery); });
    $('modalProgram').addEventListener('change', () => { const p = $('modalProgram').value; const c = Number($('modalCourse').value); fillModalOptions(p, c, groupsFor(p, c)[0] ?? ''); });
    $('modalCourse').addEventListener('change', () => { const p = $('modalProgram').value; const c = Number($('modalCourse').value); fillModalOptions(p, c, groupsFor(p, c)[0] ?? ''); });
    window.addEventListener('storage', () => { state.tasks = readTasks(); renderTasks(); });
}
function openModal(id) { $(id).classList.add('open'); $(id).setAttribute('aria-hidden', 'false'); document.body.classList.add('modal-open'); const focus = $(id).querySelector('button,select,input,textarea'); focus?.focus(); }
function closeModal(id) { $(id).classList.remove('open'); $(id).setAttribute('aria-hidden', 'true'); document.body.classList.remove('modal-open'); }
async function saveProfile() { const p = $('modalProgram').value, c = Number($('modalCourse').value), g = $('modalGroup').value; state.profile = { program: p, course: c, group: g }; ensureProfile(); localStorage.setItem('almazov.profile', JSON.stringify(state.profile)); closeModal('profileModal'); state.week = mondayOf(todayISO()); state.events = []; state.status = 'loading'; state.message = 'Подготавливаем новое расписание…'; clearScheduleMemory(); render(); await loadCurrent(); render(); }
function openTask() { $('taskSubject').value = ''; $('taskText').value = ''; $('taskDate').value = ''; $('taskNotice').textContent = ''; openModal('taskModal'); }
function saveTask() { const subject = $('taskSubject').value.trim(), text = $('taskText').value.trim(); if (!subject || !text) {
    $('taskNotice').textContent = 'Заполните предмет и задание.';
    return;
} addTask({ id: crypto.randomUUID(), subject, text, due: $('taskDate').value || undefined, done: false, ...state.profile, createdAt: new Date().toISOString() }); state.tasks = readTasks(); closeModal('taskModal'); renderTasks(); }
async function shareLink() { const url = new URL(location.href); url.search = ''; url.searchParams.set('program', state.profile.program); url.searchParams.set('course', String(state.profile.course)); if (state.profile.group)
    url.searchParams.set('group', state.profile.group); try {
    await navigator.clipboard.writeText(url.toString());
    state.message = 'Ссылка с выбранным профилем скопирована.';
}
catch {
    state.message = url.toString();
} renderSchedule(); }
function exportICS() { const events = filterEvents(state.events, { ...state.profile, stream: streamForGroup(state.profile.program, state.profile.group) }, state.week, '', 'all'); const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Almazov Schedule Hub//RU', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Almazov Schedule', 'X-WR-TIMEZONE:Europe/Moscow', 'BEGIN:VTIMEZONE', 'TZID:Europe/Moscow', 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:+0300', 'TZOFFSETTO:+0300', 'END:STANDARD', 'END:VTIMEZONE']; for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.id}@almazov-hub`, `DTSTART;TZID=Europe/Moscow:${e.date.replaceAll('-', '')}T${e.start.replace(':', '')}00`, `DTEND;TZID=Europe/Moscow:${e.date.replaceAll('-', '')}T${e.end.replace(':', '')}00`, `SUMMARY:${escapeICS(e.subject)}`, `LOCATION:${escapeICS(e.location)}`, `DESCRIPTION:${escapeICS([e.teacher, e.weeks, e.half].filter(Boolean).join(' · '))}`, 'END:VEVENT');
} lines.push('END:VCALENDAR'); const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `almazov-${state.profile.group || 'group'}-${state.week}.ics`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
function escapeICS(v) { return v.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n'); }
