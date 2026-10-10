import { PROGRAMS, sourceFor, sourcesFor } from './data/catalog.js?v=d2156d5018346a2e';
import { groupsFor, streamForGroup } from './data/roster.js?v=d2156d5018346a2e';
import { mondayOf, weekDates, formatDateRu, longDateRu, addDays, todayISO } from './core/date.js?v=d2156d5018346a2e';
import { eventAppliesToGroup } from './core/filter.js?v=d2156d5018346a2e';
import { loadSchedule, clearScheduleMemory } from './services/scheduleService.js?v=d2156d5018346a2e';
import { addTask, readTasks, removeTask, updateTask } from './services/taskService.js?v=d2156d5018346a2e';
import { readPersonalization, updatePersonalization, setAcademicProfile, subjectColorKey } from './services/personalizationStore.js?v=d2156d5018346a2e';
import { applyTheme, cycleTheme, initTheme, themeMode } from './ui/theme.js?v=d2156d5018346a2e';
import { FAQ } from './ui/faq.js?v=d2156d5018346a2e';
import { createPersonalEvent, deletePersonalEvent, listPersonalEvents, updatePersonalEvent } from './services/eventService.js?v=d2156d5018346a2e';
import { fileToAttachment } from './services/supportService.js?v=d2156d5018346a2e';
import { createTicket, listTickets, getTicket, addTicketMessage } from './services/supportService.js?v=d2156d5018346a2e';
import { localDate, localDateTimeToUtc, localTime, userTimeZone, localDateTimeInput } from './core/time.js?v=d2156d5018346a2e';
import { scheduleToCalendarEvent } from './core/calendar.js?v=d2156d5018346a2e';
import { enhanceControls, refreshControls } from './ui/customControls.js?v=d2156d5018346a2e';
import { deleteFileMaterial, getFileMaterial, listFileMaterials, materialScope, saveFileMaterial, MAX_MATERIAL_FILE_SIZE } from './services/materialStore.js?v=d2156d5018346a2e';
const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const STATUS_LABEL = { planned: 'Запланировано', confirmed: 'Подтверждено', in_progress: 'В процессе', completed: 'Завершено', cancelled: 'Отменено' };
const VIEW_LABEL = { day: 'День', workweek: 'Рабочая неделя', week: 'Неделя', month: 'Месяц', agenda: 'Agenda', list: 'Список' };
const DEFAULT_PROFILE = { program: '31.05.01', course: 1, group: '123' };
const personalization = readPersonalization();
const initial = readInitialProfile();
let reloadSequence = 0;
const state = { profile: initial, week: mondayOf(todayISO(userTimeZone())), focusDate: todayISO(userTimeZone()), events: [], official: [], personal: [], status: 'loading', message: 'Подготавливаем расписание…', search: '', type: 'all', statusFilter: 'all', categoryFilter: 'all', page: 'schedule', tasks: readTasks(), theme: themeMode(), faqQuery: '', faqCategory: 'Все', view: 'week', scheduleMode: 'regular', timezone: readTimezone(), double1: personalization.double1, double2: personalization.double2, taskSearch: '', taskFilterStatus: 'all', taskFilterSubject: 'all', resourceSearch: '', resourceSubject: 'all', resourceCategory: 'all', resourceType: 'all', personalization, avatarPresetDraft: personalization.avatarPreset, avatarDataDraft: personalization.avatarDataUrl, fileMaterials: [], homePersonal: [], editingId: '', draft: false, undo: null, ticketList: [], ticketSelected: '', supportStatus: 'idle', kugData: null, kugStatus: 'loading' };
function $(id) { const el = document.getElementById(id); if (!el)
    throw new Error(`Missing #${id}`); return el; }
function esc(v) { return String(v).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[c])); }
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
    const centralized = readPersonalization().academicProfile;
    const programValue = params.get('program') ?? String(stored.program ?? centralized.program ?? '');
    const courseValue = params.get('course') ?? String(stored.course ?? centralized.course ?? '');
    const groupValue = params.get('group') ?? String(stored.group ?? centralized.group ?? '');
    const program = PROGRAMS.some(x => x.code === programValue) ? programValue : DEFAULT_PROFILE.program;
    const n = Number(courseValue);
    const course = Number.isInteger(n) && n >= 1 && n <= 6 ? n : DEFAULT_PROFILE.course;
    return { program, course, group: String(groupValue) };
}
catch {
    return { ...DEFAULT_PROFILE };
} }
function readTimezone() { return readPersonalization().timezone || localStorage.getItem('almazov.timezone') || userTimeZone(); }
function setTimezone(zone) { try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone }).format();
    localStorage.setItem('almazov.timezone', zone);
    state.timezone = zone;
    state.personalization = updatePersonalization({ timezone: zone });
}
catch {
    throw new Error('Некорректный часовой пояс');
} }
function startOfWeek(d) { return mondayOf(d); }
function weekdayIndex(d) { const day = new Date(`${d}T12:00:00Z`).getUTCDay(); return (day + 6) % 7; }
function weekdayLabel(d) { return DAYS[weekdayIndex(d)] ?? '—'; }
function monthStart(d) { return `${d.slice(0, 7)}-01`; }
function monthEnd(d) { const x = new Date(`${monthStart(d)}T00:00:00Z`); x.setUTCMonth(x.getUTCMonth() + 1); x.setUTCDate(0); return x.toISOString().slice(0, 10); }
function rangeDates() {
    if (state.view === 'day') {
        return { from: state.focusDate, to: state.focusDate, dates: [state.focusDate] };
    }
    if (state.view === 'workweek') {
        const m = startOfWeek(state.focusDate);
        const dates = weekDates(m).slice(0, 6);
        return { from: dates[0], to: dates[5], dates };
    }
    if (state.view === 'month') {
        const from = monthStart(state.focusDate);
        const to = monthEnd(state.focusDate);
        const first = startOfWeek(from);
        const last = addDays(startOfWeek(to), 6);
        const dates = [];
        for (let d = first; d <= last; d = addDays(d, 1))
            dates.push(d);
        return { from: first, to: last, dates };
    }
    const dates = weekDates(startOfWeek(state.focusDate));
    return { from: dates[0], to: dates[6], dates: state.view === 'agenda' || state.view === 'list' ? dates : dates };
}
function localMidnightUtc(date) { return localDateTimeToUtc(`${date}T00:00`, state.timezone); }
function getDisplayEvents() {
    if (state.scheduleMode === 'kug')
        return [];
    const selected = state.official.filter(e => eventAppliesToGroup(e, { ...state.profile, stream: streamForGroup(state.profile.program, state.profile.group) })).map(e => scheduleToCalendarEvent(e, state.timezone));
    const personal = state.personal.map(e => ({ id: e.id, kind: 'personal', title: e.title, description: e.description ?? '', category: e.category, status: e.status, startAt: e.startAt, endAt: e.endAt, timeZone: e.timeZone, allDay: e.allDay, location: e.location ?? '', meetingUrl: e.meetingUrl, attendees: e.attendees, recurrence: e.recurrence, seriesId: e.seriesId, readOnly: false }));
    const combined = [...selected, ...personal];
    return combined.filter(e => {
        if (state.search && !`${e.title ?? (('subject' in e) ? e.subject : '')} ${e.location ?? ''} ${e.teacher ?? ''} ${e.category ?? ''}`.toLowerCase().includes(state.search.toLowerCase()))
            return false;
        if (state.type !== 'all' && e.type !== state.type)
            return false;
        if (state.statusFilter !== 'all' && (e.status ?? 'planned') !== state.statusFilter)
            return false;
        if (state.categoryFilter !== 'all' && (e.category ?? 'personal') !== state.categoryFilter)
            return false;
        return true;
    }).sort((a, b) => a.startAt.localeCompare(b.startAt) || String(a.title ?? a.subject).localeCompare(String(b.title ?? b.subject), 'ru'));
}
async function reloadEvents() {
    const sequence = ++reloadSequence;
    const requestedProgram = state.profile.program, requestedCourse = state.profile.course;
    state.status = 'loading';
    state.message = 'Загружаем расписание и личные события…';
    renderShell();
    renderSchedule();
    try {
        const result = await loadSchedule(requestedProgram, requestedCourse);
        if (sequence !== reloadSequence)
            return;
        state.official = Array.isArray(result.events) ? result.events : [];
        state.status = result.status;
        state.message = result.message || 'Расписание загружено.';
    }
    catch (error) {
        if (sequence !== reloadSequence)
            return;
        state.official = [];
        state.status = 'error';
        state.message = `Не удалось загрузить расписание: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`;
    }
    try {
        const range = rangeDates();
        const from = localMidnightUtc(range.from);
        const to = localMidnightUtc(addDays(range.to, 1));
        const personal = await listPersonalEvents(from, to);
        if (sequence !== reloadSequence)
            return;
        state.personal = personal;
    }
    catch (error) {
        if (sequence !== reloadSequence)
            return;
        state.personal = [];
        state.message += ` Личные события не загружены: ${error instanceof Error ? error.message : 'ошибка'}`;
    }
    if (sequence !== reloadSequence)
        return;
    renderShell();
    renderSchedule();
}
export async function boot() { initTheme(); loadAppearance(); applyAppearance(); ensureProfile(); enhanceControls(); renderShell(); bind(); render(); void loadKugData(); await reloadEvents(); await refreshHomePersonal(); await refreshUploadedMaterials(); render(); window.setInterval(() => { if (state.page === 'home')
    renderHome(); }, 30000); }
function render() { renderShell(); renderProfileOptions(); renderSchedule(); renderTasks(); renderFaculties(); renderResources(); renderKug(); renderFaq(state.faqQuery); renderHome(); renderSupport(); renderSettings(); renderProfilePage(); refreshControls(); }
function nav(page) {
    const destination = document.getElementById(`page-${page}`);
    if (!destination?.classList.contains('page')) {
        toast('Этот раздел недоступен. Обновите приложение и повторите попытку.', 'error');
        return;
    }
    closeAllModals();
    state.page = page;
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p === destination));
    document.querySelectorAll('[data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === page));
    $('pageTitle').textContent = { home: 'Главная', schedule: 'Расписание', homework: 'Задачи', kug: 'КУГ', resources: 'Материалы', faculties: 'Факультеты', faq: 'FAQ', support: 'Поддержка', settings: 'Настройки', profilePage: 'Профиль' }[page] ?? 'Almazov';
    document.body.classList.remove('menu-open');
    if (page === 'schedule')
        renderSchedule();
    if (page === 'homework')
        renderTasks();
    if (page === 'faq')
        renderFaq(state.faqQuery);
    if (page === 'home') {
        renderHome();
        void refreshHomePersonal();
    }
    if (page === 'resources') {
        renderResources();
        void refreshUploadedMaterials();
    }
    if (page === 'support')
        loadSupport();
    if (page === 'settings')
        renderSettings();
    if (page === 'profilePage')
        renderProfilePage();
    refreshControls();
}
function renderShell() { state.personalization = readPersonalization(); const p = PROGRAMS.find(x => x.code === state.profile.program); $('profileName').textContent = state.personalization.displayName || (state.profile.group ? `Группа ${state.profile.group}` : p?.shortTitle ?? 'Профиль'); $('profileMeta').textContent = `${p?.title ?? ''} · ${state.profile.course} курс${state.profile.group ? ` · группа ${state.profile.group}` : ''}${streamForGroup(state.profile.program, state.profile.group) ? ` · поток ${streamForGroup(state.profile.program, state.profile.group)}` : ''}`; applyAppearance(); document.querySelectorAll('.avatar').forEach(a => { a.textContent = state.personalization.avatarDataUrl ? '' : state.personalization.avatarPreset || '🎓'; a.style.backgroundImage = state.personalization.avatarDataUrl ? `url("${state.personalization.avatarDataUrl}")` : ''; a.style.backgroundSize = 'cover'; a.style.backgroundPosition = 'center'; }); $('syncLabel').textContent = state.message; $('statusDot').className = `${state.status === 'live' ? 'ok' : state.status === 'cache' ? 'cache' : state.status === 'loading' ? 'loading' : 'bad'}`; }
function calendarPersonal(e) { return { id: e.id, kind: 'personal', title: e.title, description: e.description ?? '', category: e.category, status: e.status, startAt: e.startAt, endAt: e.endAt, timeZone: e.timeZone, allDay: e.allDay, location: e.location ?? '', meetingUrl: e.meetingUrl, attendees: e.attendees, recurrence: e.recurrence, seriesId: e.seriesId, readOnly: false }; }
async function refreshHomePersonal() { try {
    const today = todayISO(state.timezone);
    state.homePersonal = await listPersonalEvents(localMidnightUtc(today), localMidnightUtc(addDays(today, 1)));
}
catch {
    state.homePersonal = [];
} if (state.page === 'home')
    renderHome(); }
function countdownLabel(milliseconds) { const minutes = Math.max(0, Math.floor(Math.abs(milliseconds) / 60000)); const days = Math.floor(minutes / 1440), hours = Math.floor((minutes % 1440) / 60), mins = minutes % 60; if (days)
    return `${days} д ${hours} ч`; if (hours)
    return `${hours} ч ${mins} мин`; return `${mins} мин`; }
function renderHome() {
    const today = todayISO(state.timezone), now = Date.now();
    const official = state.official.filter(e => eventAppliesToGroup(e, { ...state.profile, stream: streamForGroup(state.profile.program, state.profile.group) })).map(e => scheduleToCalendarEvent(e, state.timezone));
    const events = [...official, ...state.homePersonal.map(calendarPersonal)].sort((a, b) => a.startAt.localeCompare(b.startAt));
    const weekEvents = events.filter(e => { const d = localDate(e.startAt, state.timezone); return d >= startOfWeek(today) && d <= addDays(startOfWeek(today), 6); });
    const todayEvents = events.filter(e => localDate(e.startAt, state.timezone) === today || localDate(e.endAt, state.timezone) === today);
    const todayClasses = todayEvents.filter(e => e.kind === 'schedule');
    const active = todayClasses.find(e => Date.parse(e.startAt) <= now && Date.parse(e.endAt) > now);
    // Use the entire official snapshot, not only today's range, so the hero still shows tomorrow's next class.
    const next = events.filter(e => e.kind === 'schedule' && Date.parse(e.startAt) > now).sort((a, b) => a.startAt.localeCompare(b.startAt))[0];
    const focus = active ?? next;
    const focusTitle = focus ? String(focus.title ?? (('subject' in focus) ? focus.subject : '')) : '';
    $('homeContext').textContent = state.profile.group ? `${PROGRAMS.find(p => p.code === state.profile.program)?.title} · ${state.profile.course} курс · группа ${state.profile.group}` : 'Выберите группу';
    $('homeStats').innerHTML = [['Занятий сегодня', String(todayEvents.length)], ['На неделе', String(weekEvents.length)], ['Активных ДЗ', String(state.tasks.filter(t => (t.status ?? (t.done ? 'done' : 'todo')) !== 'done').length)], ['Источник', state.status === 'live' ? 'LIVE' : state.status === 'cache' ? 'CACHE' : state.status === 'partial' ? 'PARTIAL' : 'OFFLINE']].map(([a, b]) => `<div class="stat-card"><span>${a}</span><b>${b}</b></div>`).join('');
    $('homeHero').innerHTML = focus ? `<div class="home-hero-copy"><span class="eyebrow">${active ? 'Сейчас идёт пара' : 'Следующая пара'}</span><h2>${esc(focusTitle)}</h2><p>${esc(focus.location || 'Аудитория не указана')} · ${esc(focus.kind === 'schedule' ? (focus.teacher || 'Преподаватель не указан') : 'Личное событие')}</p><div class="home-hero-chips"><span>${esc(focus.kind === 'schedule' ? String(focus.type ?? 'Занятие') : 'Личное')}</span><span>${esc(localTime(focus.startAt, state.timezone))}–${esc(localTime(focus.endAt, state.timezone))}</span><span>${esc(state.timezone)}</span></div></div><div class="home-countdown"><span>${active ? 'До конца' : 'До начала'}</span><strong id="homeCountdownValue">${countdownLabel((active ? Date.parse(focus.endAt) : Date.parse(focus.startAt)) - now)}</strong><small>${esc(longDateRu(focus ? localDate(focus.startAt, state.timezone) : today))}</small></div>` : `<div class="home-hero-copy"><span class="eyebrow">Сегодня</span><h2>Занятий больше нет</h2><p>В расписании не найдено будущих пар на сегодня.</p></div><div class="home-countdown"><span>Свободное время</span><strong>—</strong><small>${esc(longDateRu(today))}</small></div>`;
    $('homeTodayTimeline').innerHTML = todayEvents.length ? todayEvents.map(e => `<article class="home-timeline-item"><span class="home-timeline-time">${e.allDay ? 'Весь день' : esc(localTime(e.startAt, state.timezone))}</span><div class="home-timeline-content"><b>${esc(String(e.title ?? (('subject' in e) ? e.subject : '')))}</b><small>${esc(e.location || 'Место не указано')}${e.kind === 'schedule' && e.teacher ? ` · ${esc(e.teacher)}` : ''}</small></div><div class="home-timeline-actions"><button class="btn small ghost" data-open-event="${esc(e.id)}">Открыть</button>${e.kind === 'schedule' ? `<button class="btn small" data-homework-from-event="${esc(e.id)}">Записать ДЗ</button>` : ''}</div></article>`).join('') : `<div class="empty-state compact"><p>На сегодня занятий нет или источник пока не содержит данных.</p><button class="btn" data-page="schedule">Открыть расписание</button></div>`;
    const dueTasks = state.tasks.filter(t => (t.status ?? (t.done ? 'done' : 'todo')) !== 'done' && t.due && Number.isFinite(Date.parse(t.due))).sort((a, b) => Date.parse(a.due) - Date.parse(b.due)).slice(0, 3);
    $('homeDeadlines').innerHTML = dueTasks.length ? dueTasks.map(t => { const late = Date.parse(t.due) < now; return `<article class="home-deadline ${late ? 'overdue' : ''}"><span class="home-deadline-mark">${late ? '!' : '◷'}</span><div><b>${esc(t.subject)}</b><p>${esc(t.text)}</p><small>${late ? 'Просрочено' : 'Сдать'} · ${esc(formatTaskDue(t.due))}</small></div><span class="priority-badge priority-${t.priority ?? 'medium'}">${priorityLabel(t.priority ?? 'medium')}</span></article>`; }).join('') : `<div class="empty-state compact"><p>Нет невыполненных заданий с установленным дедлайном.</p><button class="btn" data-action="add-task">＋ Добавить ДЗ</button></div>`;
    $('homeUpcoming').innerHTML = weekEvents.filter(e => localDate(e.startAt, state.timezone) >= today).slice(0, 5).map(e => `<article class="next-item"><div><span>${longDateRu(localDate(e.startAt, state.timezone))} · ${localTime(e.startAt, state.timezone)}</span><b>${esc(String(e.title ?? (('subject' in e) ? e.subject : '')))}</b><small>${esc(e.location || 'Без места')}</small></div><button class="btn small" data-open-event="${esc(e.id)}">Открыть</button></article>`).join('') || `<div class="empty-state compact card"><p>Ближайших событий на неделе нет.</p></div>`;
}
function renderSchedule() {
    state.tasks = readTasks();
    // Empty state is rendered dynamically, so its absence on first render is normal.
    document.getElementById('emptyState')?.remove();
    const allEvents = getDisplayEvents();
    const range = state.scheduleMode === 'kug' && state.view === 'month' ? monthRangeDates() : rangeDates();
    const events = allEvents.filter(e => { try {
        return localDate(e.startAt, state.timezone) <= range.to && localDate(e.endAt, state.timezone) >= range.from;
    }
    catch {
        return false;
    } });
    state.events = events;
    $('weekLabel').textContent = state.scheduleMode === 'kug' ? `${formatDateRu(monthStart(state.focusDate))} — ${formatDateRu(monthEnd(state.focusDate))}` : state.view === 'month' ? `${formatDateRu(monthStart(state.focusDate))} — ${formatDateRu(monthEnd(state.focusDate))}` : `${formatDateRu(range.from)} — ${formatDateRu(range.to)}`;
    $('weekSubLabel').textContent = `${PROGRAMS.find(p => p.code === state.profile.program)?.shortTitle ?? ''} · ${state.profile.course} курс${state.profile.group ? ` · группа ${state.profile.group}` : ''} · ${state.timezone}`;
    $('scheduleCount').textContent = state.scheduleMode === 'kug' ? `${activeKugPeriods().filter(p => p.start <= range.to && p.end >= range.from).length} периодов КУГ` : `${events.length} событий`;
    const strip = $('weekStrip');
    strip.hidden = state.scheduleMode === 'kug';
    document.querySelectorAll('[data-schedule-mode]').forEach(b => b.classList.toggle('active', b.dataset.scheduleMode === state.scheduleMode));
    const modeNote = document.getElementById('calendarModeNote');
    if (modeNote)
        modeNote.textContent = state.scheduleMode === 'regular' ? 'Показываются обычные занятия и личные события.' : state.scheduleMode === 'kug' ? 'Сетка дней отмечена периодами учебного года: обучение, практика, аттестация и каникулы.' : 'Обычные занятия совмещены с цветными отметками периодов КУГ.';
    document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === state.view));
    const dates = range.dates.length ? range.dates : weekDates(startOfWeek(state.focusDate));
    $('weekStrip').innerHTML = dates.slice(0, 31).map((d, i) => `<button class="day-pill ${d === todayISO(state.timezone) ? 'is-today' : ''}" data-jump-date="${d}"><span>${weekdayLabel(d)}</span><b>${d.slice(8, 10)}</b><em>${events.filter(e => localDate(e.startAt, state.timezone) === d).length}</em></button>`).join('');
    if (state.scheduleMode === 'kug' && state.kugStatus === 'loading') {
        $('desktopSchedule').innerHTML = renderSkeleton();
        $('mobileSchedule').innerHTML = renderMobileSkeleton();
    }
    else if (state.scheduleMode === 'kug' && state.kugStatus === 'error') {
        $('desktopSchedule').innerHTML = '<div class="empty-state card"><h3>КУГ временно недоступен</h3><p>Не удалось загрузить периоды. Повторите запрос.</p><button class="btn primary" data-action="kug-retry">Повторить</button></div>';
        $('mobileSchedule').innerHTML = '';
    }
    else if (state.status === 'loading' && state.scheduleMode !== 'kug') {
        $('desktopSchedule').innerHTML = renderSkeleton();
        $('mobileSchedule').innerHTML = renderMobileSkeleton();
    }
    else {
        const html = state.scheduleMode === 'kug' ? (state.view === 'agenda' || state.view === 'list' ? renderKugAgenda(range.from, range.to) : renderKugGrid(range.dates)) : state.view === 'month' ? renderMonth(events) : state.view === 'agenda' ? renderAgenda(events) : state.view === 'list' ? renderList(events) : renderCardSchedule(events, dates);
        $('desktopSchedule').innerHTML = html;
        $('mobileSchedule').innerHTML = state.scheduleMode === 'kug' || state.view === 'month' ? html : renderMobile(events, dates);
    }
    $('dataHealthTitle').textContent = state.status === 'live' ? 'Источник актуален' : state.status === 'cache' ? 'Локальный snapshot' : state.status === 'loading' ? 'Загрузка…' : state.status === 'partial' ? 'Частичные данные' : state.status === 'error' || state.status === 'unavailable' ? 'Источник недоступен' : 'Источник доступен';
    $('dataHealthText').textContent = `${state.message} Часовой пояс интерфейса: ${state.timezone}.`;
    $('sourceLink').href = sourceFor(state.profile.program, state.profile.course);
    $('statusText').textContent = state.status.toUpperCase();
    if (state.scheduleMode === 'kug') {
        const el = document.getElementById('emptyState');
        el?.remove();
        return;
    }
    if (state.status !== 'loading' && events.length === 0) {
        const failed = state.status === 'error' || state.status === 'unavailable';
        const el = document.createElement('div');
        el.id = 'emptyState';
        el.className = 'empty-state card';
        el.setAttribute('role', failed ? 'alert' : 'status');
        el.innerHTML = failed
            ? `<div class="empty-icon">!</div><h3>Не удалось получить расписание</h3><p>${esc(state.message || 'Источник временно недоступен.')}</p><div class="empty-actions"><button class="btn primary" data-action="refresh-data">Повторить загрузку</button><a class="btn" href="${sourceFor(state.profile.program, state.profile.course)}" target="_blank" rel="noopener noreferrer">Официальный источник ↗</a></div>`
            : `<div class="empty-icon">∅</div><h3>В этом периоде нет событий</h3><p>Проверьте фильтры или создайте личное событие.</p><div class="empty-actions"><button class="btn primary" data-action="new-event">Создать событие</button><a class="btn" href="${sourceFor(state.profile.program, state.profile.course)}" target="_blank" rel="noopener noreferrer">Официальный источник ↗</a></div>`;
        $('scheduleRoot').appendChild(el);
    }
}
function renderMobileSkeleton() { return `<div class="mobile-skeleton" aria-label="Загрузка расписания">${Array.from({ length: 4 }, () => '<div class="skeleton-card"></div>').join('')}</div>`; }
function renderSkeleton() { const count = state.scheduleMode === 'kug' ? 7 : rangeDates().dates.length; return `<div class="calendar-skeleton" style="grid-template-columns:repeat(${count},minmax(0,1fr))">${Array.from({ length: count }, (_, i) => `<div><span></span><i></i><i></i><i></i></div>`).join('')}</div>`; }
function monthRangeDates() { const from = startOfWeek(monthStart(state.focusDate)); const to = addDays(startOfWeek(monthEnd(state.focusDate)), 6); const dates = []; for (let d = from; d <= to; d = addDays(d, 1))
    dates.push(d); return { from, to, dates }; }
function activeKugPeriods() { return (state.kugData?.periods ?? []).filter(p => (!p.program || p.program === state.profile.program) && String(p.course) === String(state.profile.course)); }
function kugPeriodsFor(date) { return activeKugPeriods().filter(p => p.start <= date && p.end >= date); }
function kugKindLabel(kind) { return { study: 'Обучение', assessment: 'Аттестация', practice: 'Практика', vacation: 'Каникулы', session: 'Сессия' }[kind] ?? 'Учебный период'; }
function kugTags(date) { if (state.scheduleMode !== 'combined')
    return ''; return kugPeriodsFor(date).map(p => `<span class="kug-day-tag kug-${esc(p.kind)}" title="${esc(p.label)}: ${esc(kugDay(p.start))} — ${esc(kugDay(p.end))}">${esc(p.label)}</span>`).join(''); }
function renderKugGrid(dates) { const month = state.view === 'month'; const columns = month ? 7 : Math.max(1, dates.length); const heads = month ? DAYS : dates.map(weekdayLabel); return `<div class="kug-calendar-grid" style="--kug-columns:${columns}">${heads.map(d => `<div class="month-head">${d}</div>`).join('')}${dates.map(d => { const periods = kugPeriodsFor(d); return `<article class="kug-calendar-cell ${d.slice(0, 7) !== state.focusDate.slice(0, 7) ? 'muted-month' : ''} ${d === todayISO(state.timezone) ? 'today' : ''}"><span class="kug-day-number">${d.slice(8, 10)}</span><div class="kug-calendar-tags">${periods.map(p => `<span class="kug-day-tag kug-${esc(p.kind)}" title="${esc(p.label)} · ${esc(kugDay(p.start))} — ${esc(kugDay(p.end))}">${esc(p.label)}</span>`).join('') || '<span class="kug-no-period">—</span>'}</div></article>`; }).join('')}</div>`; }
function renderKugAgenda(from, to) { const periods = activeKugPeriods().filter(p => p.start <= to && p.end >= from).sort((a, b) => a.start.localeCompare(b.start)); return `<div class="agenda-list kug-agenda-list">${periods.map(p => `<article class="agenda-item card kug-agenda-period kug-${esc(p.kind)}"><time>${esc(kugDay(p.start))}<br><b>${esc(kugDay(p.end))}</b></time><div><span class="eyebrow">${esc(kugKindLabel(p.kind))}</span><h3>${esc(p.label)}</h3><p>${esc(p.program ?? state.profile.program)} · ${esc(String(p.course))} курс</p></div>${p.sourceUrl ? `<a class="btn small" href="${esc(p.sourceUrl)}" target="_blank" rel="noopener noreferrer">Источник ↗</a>` : ''}</article>`).join('') || '<div class="empty-state card"><h3>Периодов КУГ нет</h3><p>В выбранном диапазоне не найдено периодов.</p></div>'}</div>`; }
function visibleSegments(events, date) { return events.filter(e => { const s = localDate(e.startAt, state.timezone), end = localDate(e.endAt, state.timezone); return s <= date && end >= date; }); }
function renderCardSchedule(events, dates) {
    const today = todayISO(state.timezone);
    const columns = Math.max(1, dates.length);
    return `<div class="schedule-card-grid ${columns === 1 ? 'single-day' : ''}" style="--schedule-days:${columns}">${dates.map(date => {
        const dayEvents = visibleSegments(events, date).sort((a, b) => a.startAt.localeCompare(b.startAt) || eventSubject(a).localeCompare(eventSubject(b), 'ru'));
        const labels = dayEvents.length === 1 ? '1 занятие' : `${dayEvents.length} событий`;
        return `<section class="schedule-day-card ${date === today ? 'today' : ''}" data-drop-date="${date}">
      <header class="schedule-day-head"><div><span>${weekdayLabel(date)}${date === today ? ' · Сегодня' : ''}</span><h3>${esc(longDateRu(date))}</h3><small>${labels}</small></div><button class="schedule-day-add" type="button" data-action="new-event" data-jump-date="${date}" aria-label="Создать событие ${esc(longDateRu(date))}">＋</button></header>
      ${kugTags(date) ? `<div class="schedule-day-kug">${kugTags(date)}</div>` : ''}
      <div class="schedule-event-stack">${dayEvents.map(e => {
            const title = eventSubject(e), startDate = localDate(e.startAt, state.timezone), endDate = localDate(e.endAt, state.timezone);
            const time = e.allDay ? 'Весь день' : startDate < date ? (endDate === date ? `Продолжается · до ${localTime(e.endAt, state.timezone)}` : 'Продолжается') : endDate > date ? `${localTime(e.startAt, state.timezone)} · продолжается` : `${localTime(e.startAt, state.timezone)}–${localTime(e.endAt, state.timezone)}`;
            const status = e.status ?? 'planned', personal = e.kind === 'personal';
            return `<article class="calendar-event schedule-event-card ${personal ? 'personal' : 'official'} status-${status}" data-event-id="${esc(e.id)}" data-event-kind="${e.kind}" ${personal ? 'draggable="true"' : ''} style="${subjectColor(e) ? `--subject-color:${subjectColor(e)};` : ''}">
          <div class="schedule-event-head"><span class="event-time">${esc(time)}</span><span class="status-badge">${esc(STATUS_LABEL[status])}</span></div>
          <button type="button" class="schedule-event-open" data-open-event="${esc(e.id)}" aria-label="Открыть ${esc(title)}"><span class="schedule-event-title">${eventHalfMarkup(e, true)}<strong>${esc(title)}</strong>${taskBadge(title)}</span><span class="schedule-event-meta">${esc(personal ? (e.category || 'Личное') : (e.type === 'practice' ? 'Практика' : e.type === 'lecture' ? 'Лекция' : e.type === 'lab' ? 'Лабораторная' : 'Занятие'))}${e.location ? ` · ${esc(e.location)}` : ''}</span>${e.kind === 'schedule' && e.teacher ? `<span class="schedule-event-meta">${esc(e.teacher)}</span>` : ''}</button>
          <div class="schedule-event-actions">${e.kind === 'schedule' ? `<button type="button" class="event-homework-link" data-homework-from-event="${esc(e.id)}">＋ Записать ДЗ</button>` : ''}${personal ? `${subjectColorControl(e)}<button class="duration-adjust" type="button" data-duration-adjust="-15" aria-label="Сократить длительность на 15 минут">−15 мин</button><button class="duration-adjust" type="button" data-duration-adjust="15" aria-label="Увеличить длительность на 15 минут">＋15 мин</button>` : ''}</div>
        </article>`;
        }).join('') || `<div class="schedule-day-empty"><span>Свободный день</span><button type="button" data-action="new-event" data-jump-date="${date}">＋ Добавить событие</button></div>`}</div>
    </section>`;
    }).join('')}</div>`;
}
function eventHalfLabel(e) {
    if (e.half === '1/2' || e.half === '2/2')
        return e.half;
    if (e.doublePart === 1)
        return '1/2';
    if (e.doublePart === 2)
        return '2/2';
    return '';
}
function eventHalfMarkup(e, compact = false) { const half = eventHalfLabel(e); if (!half)
    return ''; const part = half === '1/2' ? 'part-1' : 'part-2'; return `<span class="event-half ${part}${compact ? ' compact' : ''}" aria-label="Часть пары ${half}">${half}</span>`; }
function eventSubject(e) { return String(e.title ?? (('subject' in e) ? e.subject : '')); }
function subjectColor(e) { return state.personalization.subjectColors[subjectColorKey(eventSubject(e))] || ''; }
function subjectColorControl(e) { if (e.kind !== 'schedule')
    return ''; const key = subjectColorKey(eventSubject(e)); const c = subjectColor(e) || '#7892bf'; return `<button type="button" class="subject-color-trigger" data-subject-color-trigger="${esc(key)}" title="Изменить цвет предмета" aria-label="Изменить цвет предмета ${esc(eventSubject(e))}" style="--subject-swatch:${c}">●</button>`; }
function taskBadge(subject) { const key = subjectColorKey(subject); const n = state.tasks.filter(t => t.status !== 'done' && subjectColorKey(t.subject) === key).length; return n ? `<span class="homework-badge" title="Активных заданий: ${n}">ДЗ ${n}</span>` : ''; }
function renderMobile(events, dates) { return `<div class="mobile-days">${dates.map(d => `<section class="mobile-day ${d === todayISO(state.timezone) ? 'today' : ''}" data-drop-date="${d}"><header><div><span>${weekdayLabel(d)}</span><h3>${longDateRu(d)}</h3></div><b>${visibleSegments(events, d).length}</b></header>${kugTags(d) ? `<div class="kug-mobile-day-tags">${kugTags(d)}</div>` : ''}<div class="mobile-event-list">${visibleSegments(events, d).map(e => { const st = e.allDay ? 'Весь день' : localDate(e.startAt, state.timezone) === d ? localTime(e.startAt, state.timezone) : '00:00'; const en = e.allDay ? '' : localDate(e.endAt, state.timezone) === d ? localTime(e.endAt, state.timezone) : '24:00'; const title = e.title ?? (('subject' in e) ? e.subject : ''); return `<div class="mobile-event-wrap"><button class="mobile-event ${e.kind === 'personal' ? 'personal' : 'official'}" data-open-event="${esc(e.id)}" style="${subjectColor(e) ? `--subject-color:${subjectColor(e)};` : ''}"><span class="mobile-event-time">${e.allDay ? 'Весь день' : `${st}–${en}`}</span><span class="mobile-event-title">${eventHalfMarkup(e, true)}<strong>${esc(String(title))}</strong>${taskBadge(String(title))}</span><small>${esc(e.location || '')} ${e.kind === 'personal' ? '· личное' : '· официальное'}</small></button>${e.kind === 'schedule' ? `<button type="button" class="mobile-homework-link" data-homework-from-event="${esc(e.id)}">＋ Записать ДЗ</button>` : ''}</div>`; }).join('') || '<div class="day-empty">Свободный день</div>'}</div></section>`).join('')}</div>`; }
function renderMonth(events) { const from = startOfWeek(monthStart(state.focusDate)); const to = addDays(startOfWeek(monthEnd(state.focusDate)), 6); const dates = []; for (let d = from; d <= to; d = addDays(d, 1))
    dates.push(d); return `<div class="month-grid">${DAYS.map(d => `<div class="month-head">${d}</div>`).join('')}${dates.map(d => `<button class="month-cell ${d.slice(0, 7) !== state.focusDate.slice(0, 7) ? 'muted-month' : ''} ${d === todayISO(state.timezone) ? 'today' : ''}" data-jump-date="${d}"><span>${d.slice(8, 10)}</span><div class="month-kug-tags">${kugTags(d)}</div><div>${visibleSegments(events, d).slice(0, 4).map(e => `<em class="month-event ${e.kind === 'personal' ? 'personal' : ''}" style="${subjectColor(e) ? `--subject-color:${subjectColor(e)};` : ''}">${eventHalfMarkup(e, true)}${e.allDay ? 'Весь день' : localTime(e.startAt, state.timezone)} ${esc(String(e.title ?? (('subject' in e) ? e.subject : '')))} ${taskBadge(eventSubject(e))}</em>`).join('')}</div>${visibleSegments(events, d).length > 4 ? `<small>+${visibleSegments(events, d).length - 4}</small>` : ''}</button>`).join('')}</div>`; }
function renderAgenda(events) { const dates = rangeDates().dates; return `<div class="agenda-list">${state.scheduleMode === 'combined' ? dates.map(d => kugTags(d) ? `<div class="kug-agenda-day"><b>${esc(longDateRu(d))}</b>${kugTags(d)}</div>` : '').join('') : ''}${dates.flatMap(d => visibleSegments(events, d).map(e => ({ d, e }))).sort((a, b) => a.e.startAt.localeCompare(b.e.startAt)).map(({ d, e }) => `<article class="agenda-item card" data-open-event="${esc(e.id)}" role="button" tabindex="0" style="${subjectColor(e) ? `--subject-color:${subjectColor(e)};` : ''}"><time>${esc(longDateRu(d))}<br><b>${e.allDay ? 'Весь день' : localTime(e.startAt, state.timezone)}</b></time><div><span class="eyebrow">${e.kind === 'personal' ? 'Личное' : 'Официальное'}</span><h3>${eventHalfMarkup(e, true)}${esc(String(e.title ?? (('subject' in e) ? e.subject : '')))} ${taskBadge(eventSubject(e))}</h3><p>${esc(e.location || 'Без места')} · ${e.category ? esc(e.category) : e.type}</p>${e.kind === 'schedule' ? `<button class="btn small event-homework-link" data-homework-from-event="${esc(e.id)}">＋ Записать ДЗ</button>` : ''}</div><div><span class="status-badge">${STATUS_LABEL[e.status ?? 'planned']}</span></div></article>`).join('') || '<div class="empty-state card"><h3>Пустая повестка</h3><p>В выбранном периоде нет событий.</p></div>'}</div>`; }
function renderList(events) { return `<div class="event-table card"><div class="table-head"><span>Дата</span><span>Время</span><span>Событие</span><span>Тип</span><span>Статус</span></div>${events.map(e => `<div class="table-row" data-open-event="${esc(e.id)}" role="button" tabindex="0" style="${subjectColor(e) ? `--subject-color:${subjectColor(e)};` : ''}"><span>${esc(localDate(e.startAt, state.timezone))}${state.scheduleMode === 'combined' && kugTags(localDate(e.startAt, state.timezone)) ? `<small class="list-kug-tags">${kugTags(localDate(e.startAt, state.timezone))}</small>` : ''}</span><span>${e.allDay ? 'Весь день' : `${esc(localTime(e.startAt, state.timezone))}–${esc(localTime(e.endAt, state.timezone))}`}</span><strong class="list-event-title">${eventHalfMarkup(e, true)}${esc(String(e.title ?? (('subject' in e) ? e.subject : '')))}${e.kind === 'schedule' ? `<button type="button" class="event-homework-link" data-homework-from-event="${esc(e.id)}">＋ ДЗ</button>` : ''}</strong><span>${e.kind === 'personal' ? 'Личное' : e.type}</span><span>${STATUS_LABEL[e.status ?? 'planned']}</span></div>`).join('') || '<div class="empty-table">Нет событий</div>'}</div>`; }
function taskStatusLabel(status) { return status === 'todo' ? 'К выполнению' : status === 'in_progress' ? 'В процессе' : 'Завершено'; }
function priorityLabel(priority) { return priority === 'high' ? 'Высокий' : priority === 'low' ? 'Низкий' : 'Средний'; }
function formatTaskDue(value) { if (!value)
    return 'Без дедлайна'; const d = new Date(value); return Number.isNaN(d.getTime()) ? value : new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: value.includes('T') ? 'short' : undefined }).format(d); }
function renderTasks() {
    state.tasks = readTasks();
    const all = state.tasks.slice();
    const subjects = Array.from(new Set(all.map(t => t.subject))).sort((a, b) => a.localeCompare(b, 'ru'));
    const subjectFilter = $('taskSubjectFilter');
    const keep = state.taskFilterSubject;
    subjectFilter.innerHTML = '<option value="all">Все предметы</option>' + subjects.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
    subjectFilter.value = subjects.includes(keep) ? keep : 'all';
    const query = state.taskSearch.trim().toLocaleLowerCase('ru-RU');
    const filtered = all.filter(t => (state.taskFilterStatus === 'all' || (t.status ?? (t.done ? 'done' : 'todo')) === state.taskFilterStatus) && (state.taskFilterSubject === 'all' || t.subject === state.taskFilterSubject) && (!query || `${t.subject} ${t.text} ${t.link ?? ''}`.toLocaleLowerCase('ru-RU').includes(query))).sort((a, b) => { const ad = a.due ? new Date(a.due).getTime() : Number.MAX_SAFE_INTEGER, bd = b.due ? new Date(b.due).getTime() : Number.MAX_SAFE_INTEGER; return ad - bd || b.createdAt.localeCompare(a.createdAt); });
    $('taskCount').textContent = String(all.filter(x => (x.status ?? (x.done ? 'done' : 'todo')) !== 'done').length);
    $('taskList').innerHTML = filtered.length ? filtered.map(t => { const status = (t.status ?? (t.done ? 'done' : 'todo')); return `<article class="task-row ${status === 'done' ? 'done' : ''}" data-task-id="${esc(t.id)}" style="--task-subject-color:${state.personalization.subjectColors[subjectColorKey(t.subject)] || 'var(--accent)'}"><button class="task-check" data-task-toggle="${esc(t.id)}" aria-label="Отметить выполненным">${status === 'done' ? '✓' : status === 'in_progress' ? '…' : ''}</button><div class="task-body"><div class="task-title-line"><b>${esc(t.subject)}</b><span class="priority-badge priority-${t.priority ?? 'medium'}">Приоритет: ${priorityLabel(t.priority ?? 'medium').toLowerCase()}</span></div><p>${esc(t.text)}</p><div class="task-meta"><span>${t.due ? `Дедлайн: ${esc(formatTaskDue(t.due))}` : 'Без дедлайна'}</span>${t.link ? `<a href="${esc(t.link)}" target="_blank" rel="noopener noreferrer">Открыть ссылку ↗</a>` : ''}${t.attachmentName ? `<button class="text-link" data-task-attachment="${esc(t.id)}">Файл: ${esc(t.attachmentName)} ↓</button>` : ''}</div><small class="task-created">${esc(state.profile.group || '')} · создано ${esc(formatTaskDue(t.createdAt))}</small></div><div class="task-actions"><label class="task-status-control"><span>Статус</span><select data-task-status="${esc(t.id)}" aria-label="Статус задания ${esc(t.subject)}"><option value="todo" ${status === 'todo' ? 'selected' : ''}>К выполнению</option><option value="in_progress" ${status === 'in_progress' ? 'selected' : ''}>В процессе</option><option value="done" ${status === 'done' ? 'selected' : ''}>Завершено</option></select></label><button class="btn small danger" data-task-delete="${esc(t.id)}">Удалить</button></div></article>`; }).join('') : `<div class="empty-state card"><div class="empty-icon">✓</div><h3>${all.length ? 'Нет заданий по этим фильтрам' : 'Заданий пока нет'}</h3><p>${all.length ? 'Измените статус, предмет или поисковый запрос.' : 'Создайте первое ДЗ по предмету из расписания.'}</p><button class="btn primary" data-action="add-task">＋ Создать ДЗ</button></div>`;
}
function renderFaculties() { $('facultyGrid').innerHTML = PROGRAMS.map(p => { const published = p.publishedCourses.length; return `<article class="faculty-card card"><span class="eyebrow">${p.code}</span><h3>${esc(p.title)}</h3><p>${esc(p.faculty)}</p><div class="faculty-tags"><span>1–6 курсы</span><span>${published}/6 опубликовано</span></div><button class="btn small primary" data-pick-program="${p.code}">Открыть расписание</button></article>`; }).join(''); }
function resourceCategoryFor(title) { const s = title.toLocaleLowerCase('ru-RU'); if (/лекц|lecture/.test(s))
    return 'lecture'; if (/практик|семинар|\bpз\b|practice/.test(s))
    return 'practice'; if (/лаборатор|lab/.test(s))
    return 'lab'; if (/учебник|книг|book/.test(s))
    return 'book'; return 'link'; }
function resourceCategoryLabel(category) { return { lecture: 'Лекции', practice: 'Практика', lab: 'Лабораторные', book: 'Учебники / книги', link: 'Полезные ссылки' }[category] ?? 'Полезные ссылки'; }
function resourceTypeFromName(name, url = '') { const n = (name || url).toLowerCase().split(/[?#]/)[0] ?? ''; if (/\.pdf$/.test(n))
    return 'pdf'; if (/\.docx?$/.test(n))
    return 'docx'; if (/\.xlsx?$/.test(n))
    return 'xlsx'; if (/\.pptx?$/.test(n))
    return 'pptx'; if (/\.zip$/.test(n))
    return 'zip'; if (/\.(?:jpg|jpeg|png)$/.test(n))
    return 'image'; return 'link'; }
function resourceTypeLabel(type) { return { pdf: 'PDF', docx: 'DOCX', xlsx: 'XLSX', pptx: 'PPTX', zip: 'ZIP', image: 'JPG / PNG', link: 'Ссылка' }[type] ?? type.toUpperCase(); }
async function refreshUploadedMaterials() { try {
    state.fileMaterials = await listFileMaterials(materialScope(state.profile.program, state.profile.course, state.profile.group));
    if (navigator.storage?.persist)
        void navigator.storage.persist().catch(() => false);
}
catch (error) {
    state.fileMaterials = [];
    console.warn('IndexedDB materials unavailable', error);
} if (state.page === 'resources')
    renderResources(); }
function subjectChoices() { return Array.from(new Set([...state.official.map(e => e.subject), ...readTasks().map(t => t.subject), ...state.personalization.materials.map(m => m.subject), ...state.fileMaterials.map(m => m.subject), ...PROGRAMS.flatMap(p => p.scheduleCourses.map(c => `${p.shortTitle} · ${c} курс`))].filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ru')); }
function getResourceItems() {
    const official = PROGRAMS.flatMap(p => p.scheduleCourses.flatMap(course => sourcesFor(p.code, course).filter(s => s.status === 'published' || s.status === 'verified').map(s => ({ id: `official:${s.id}`, title: s.title, subject: `${p.shortTitle} · ${course} курс`, category: resourceCategoryFor(s.title), description: s.notes || 'Официальный документ или источник учебного расписания.', url: s.url, tags: [resourceCategoryLabel(resourceCategoryFor(s.title)), 'Официальный'], helpfulness: undefined, type: resourceTypeFromName('', s.url), official: true, fileMaterial: false }))));
    const personal = state.personalization.materials.map(m => ({ ...m, tags: m.tags ?? [], type: resourceTypeFromName('', m.url), official: false, fileMaterial: false }));
    const uploaded = state.fileMaterials.map(m => ({ id: m.id, title: m.title, subject: m.subject, category: m.category, description: m.description, url: '', tags: m.tags, type: resourceTypeFromName(m.fileName), official: false, fileMaterial: true, fileName: m.fileName, size: m.size, createdAt: m.createdAt }));
    return [...official, ...personal, ...uploaded];
}
function renderResources() {
    const items = getResourceItems();
    const subjects = Array.from(new Set(items.map(x => x.subject))).sort((a, b) => a.localeCompare(b, 'ru'));
    const subjectSel = $('resourceSubjectFilter');
    const chosen = state.resourceSubject;
    subjectSel.innerHTML = '<option value="all">Все предметы и курсы</option>' + subjects.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
    subjectSel.value = subjects.includes(chosen) ? chosen : 'all';
    const q = state.resourceSearch.trim().toLocaleLowerCase('ru-RU');
    const filtered = items.filter(x => (state.resourceSubject === 'all' || x.subject === state.resourceSubject) && (state.resourceCategory === 'all' || x.category === state.resourceCategory) && (state.resourceType === 'all' || x.type === state.resourceType) && (!q || `${x.title} ${x.description} ${x.subject} ${x.category} ${(x.tags ?? []).join(' ')} ${x.fileName ?? ''}`.toLocaleLowerCase('ru-RU').includes(q)));
    const groups = new Map();
    for (const item of filtered) {
        const group = groups.get(item.subject) ?? [];
        group.push(item);
        groups.set(item.subject, group);
    }
    $('resourceList').innerHTML = filtered.length ? Array.from(groups.entries()).map(([subject, rows]) => `<section class="resource-subject-group"><header><div><p class="eyebrow">Предмет / курс</p><h2>${esc(subject)}</h2></div><span class="chip">${rows.length} материалов</span></header><div class="resource-card-grid">${rows.map(item => `<article class="resource-card card ${item.fileMaterial ? 'uploaded-resource' : ''}" style="--resource-subject-color:${state.personalization.subjectColors[subjectColorKey(item.subject)] || 'var(--accent)'}"><div class="resource-icon ${item.type === 'pdf' ? 'pdf' : item.fileMaterial ? 'file' : 'link'}">${esc(resourceTypeLabel(item.type))}</div><div class="resource-main"><div class="resource-card-tags"><span class="resource-category">${resourceCategoryLabel(item.category)}</span><span class="resource-type">${esc(resourceTypeLabel(item.type))}</span>${item.official ? '<span class="resource-origin">Официальный источник</span>' : item.fileMaterial ? '<span class="resource-origin personal-resource">Файл на устройстве</span>' : '<span class="resource-origin personal-resource">Моя ссылка</span>'}${(item.tags ?? []).map(tag => `<span class="resource-tag">${esc(tag)}</span>`).join('')}${item.helpfulness ? `<span class="resource-rating" aria-label="Полезность ${item.helpfulness} из 5">★ ${item.helpfulness}/5</span>` : ''}</div><h3>${esc(item.title)}</h3><p>${esc(item.description || 'Описание не добавлено.')}</p><small>${esc(item.fileName ? `${item.fileName} · ${formatBytes(item.size ?? 0)}` : item.subject)}</small></div><div class="resource-card-actions">${item.fileMaterial ? `<button class="btn small primary" data-material-download="${esc(item.id)}">Скачать ↓</button><button class="btn small" data-material-open="${esc(item.id)}">Открыть ↗</button><button class="btn small danger" data-material-delete="${esc(item.id)}">Удалить</button>` : `<a class="btn small primary" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${item.type === 'pdf' ? 'Открыть PDF ↗' : 'Открыть ↗'}</a>${item.type === 'pdf' ? `<a class="btn small" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer" download>Скачать</a>` : ''}${!item.official ? `<button class="btn small danger" data-material-delete="${esc(item.id)}">Удалить</button>` : ''}`}</div></article>`).join('')}</div></section>`).join('') : `<div class="empty-state card"><div class="empty-icon">▤</div><h3>Материалы не найдены</h3><p>Поменяйте фильтры, добавьте ссылку или загрузите файл в локальную базу знаний.</p><div class="empty-actions"><button class="btn" data-action="new-material">＋ Добавить ссылку</button><button class="btn primary" data-action="upload-material">⇧ Загрузить материал</button></div></div>`;
    refreshControls();
}
function formatBytes(bytes) { if (bytes < 1024)
    return `${bytes} Б`; if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(0)} КБ`; return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`; }
function kugDay(value) { const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value); return match ? `${match[3]}.${match[2]}.${match[1]}` : value; }
function kugSourceStatus(status) { return status === 'verified-bootstrap' ? 'Базовый график · проверьте актуальный документ' : status === 'source-linked-pending-sync' ? 'Документ найден · данные ожидают синхронизации' : status === 'published' ? 'Опубликовано · источник доступен' : 'Статус источника не подтверждён'; }
function renderKug() {
    $('kugContext').textContent = `${state.profile.course} курс · ${state.profile.group || 'группа не выбрана'}`;
    const statusEl = $('kugDataStatus');
    const periodsEl = $('kugPeriods');
    const sourcesEl = $('kugSources');
    if (state.kugStatus === 'loading') {
        statusEl.innerHTML = '<span class="status-dot loading"></span> Загружаем официальный календарный учебный график…';
        periodsEl.innerHTML = renderSkeletonCards(2);
        sourcesEl.innerHTML = '<div class="skeleton-card"></div>';
        return;
    }
    if (state.kugStatus === 'error' || !state.kugData) {
        statusEl.innerHTML = '<span class="status-dot bad"></span> Не удалось загрузить данные КУГ. Пары и даты аттестации не будут придуманы.';
        periodsEl.innerHTML = '<div class="empty-state compact"><h3>Данные временно недоступны</h3><p>Проверь соединение с сетью и повтори запрос.</p><button class="btn primary" data-action="kug-retry">Повторить</button></div>';
        sourcesEl.innerHTML = '<p class="muted">Официальные документы доступны на сайте института.</p>';
        return;
    }
    const course = String(state.profile.course);
    const periods = state.kugData.periods.filter(x => (!x.program || x.program === state.profile.program) && String(x.course) === course).slice().sort((a, b) => a.start.localeCompare(b.start));
    const sources = state.kugData.sources.filter(x => (!x.program || x.program === state.profile.program) && String(x.course) === course);
    const updated = state.kugData.generatedAt ? new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(state.kugData.generatedAt)) : 'дата обновления неизвестна';
    statusEl.innerHTML = `<span class="status-dot ok"></span> Данные источника · обновление ${esc(updated)} · ${periods.length} периодов`;
    periodsEl.innerHTML = periods.length ? periods.map(x => `<article class="kug-period kug-${esc(x.kind)}"><div class="kug-period-mark">${x.kind === 'assessment' ? 'А' : x.kind === 'vacation' ? 'К' : x.kind === 'practice' ? 'П' : 'У'}</div><div class="kug-period-main"><b>${esc(x.label || 'Учебный период')}</b><span>${esc(kugDay(x.start))} — ${esc(kugDay(x.end))}${x.semester ? ` · семестр ${x.semester}` : ''}</span></div>${x.sourceUrl ? `<a class="btn small" href="${esc(x.sourceUrl)}" target="_blank" rel="noopener noreferrer">Источник ↗</a>` : ''}</article>`).join('') : '<div class="empty-state compact"><h3>Периоды не опубликованы</h3><p>В доступном официальном источнике пока нет подтверждённых периодов для выбранного курса. Проверьте PDF по ссылке справа.</p></div>';
    sourcesEl.innerHTML = sources.length ? sources.map(x => `<article class="kug-source"><div><b>${esc(x.title)}</b><small>${esc(kugSourceStatus(x.status))} · периодов в данных: ${x.periods}</small></div><a class="btn small" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${x.status === 'verified-bootstrap' ? 'Все документы ↗' : 'Открыть источник ↗'}</a></article>`).join('') : '<div class="empty-state compact"><h3>Источник не найден</h3><p>Для выбранного курса не найден отдельный PDF в текущем snapshot.</p><a class="btn" href="https://education.almazovcentre.ru/about_institute/programm/specialist_programme/student/" target="_blank" rel="noopener noreferrer">Все официальные документы ↗</a></div>';
}
async function loadKugData() {
    state.kugStatus = 'loading';
    renderKug();
    try {
        const response = await fetch('./data/kug.json', { cache: 'no-store', signal: AbortSignal.timeout(6000) });
        if (!response.ok)
            throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        if (!payload || !Array.isArray(payload.sources) || !Array.isArray(payload.periods))
            throw new Error('Неверная структура данных КУГ');
        state.kugData = payload;
        state.kugStatus = 'ready';
    }
    catch {
        state.kugStatus = 'error';
    }
    renderKug();
}
function renderFaq(filter = '') { const q = filter.trim().toLowerCase(); const items = FAQ.filter(x => (state.faqCategory === 'Все' || x.category === state.faqCategory) && (`${x.question} ${x.answer}`).toLowerCase().includes(q)); $('faqCategories').innerHTML = ['Все', ...Array.from(new Set(FAQ.map(x => x.category)))].map(c => `<button class="chip-button ${c === state.faqCategory ? 'active' : ''}" data-faq-category="${esc(c)}">${esc(c)}</button>`).join(''); $('faqPopular').innerHTML = FAQ.filter(x => x.popular).slice(0, 4).map(x => `<button class="faq-popular" data-faq-open="${esc(x.id)}"><b>${esc(x.question)}</b><small>${esc(x.category)}</small></button>`).join(''); $('faqList').innerHTML = items.length ? items.map(x => `<details id="faq-${esc(x.id)}"><summary>${esc(x.question)}<span>+</span></summary><p>${esc(x.answer)}</p></details>`).join('') : `<div class="empty-state compact card"><h3>Ничего не найдено</h3><p>Попробуйте изменить запрос или категорию.</p><button class="btn" data-page="support">Обратиться в поддержку</button></div>`; }
function renderSettings() {
    const tz = $('settingsTimezone');
    if (tz) {
        const common = ['Europe/Zurich', 'Europe/Moscow', 'Europe/London', 'Europe/Berlin', 'Asia/Tokyo', 'America/New_York', 'America/Los_Angeles', 'UTC'];
        tz.innerHTML = Array.from(new Set([...common, state.timezone])).map(z => `<option value="${esc(z)}">${esc(z)}</option>`).join('');
        tz.value = state.timezone;
    }
    const theme = $('settingsTheme');
    if (theme)
        theme.value = themeMode();
    const colors = $('subjectColorSettings');
    if (colors) {
        const subjects = Array.from(new Set(state.official.filter(e => eventAppliesToGroup(e, { ...state.profile, stream: streamForGroup(state.profile.program, state.profile.group) })).map(e => e.subject))).sort((a, b) => a.localeCompare(b, 'ru'));
        colors.innerHTML = subjects.length ? subjects.map(subject => { const key = subjectColorKey(subject), value = state.personalization.subjectColors[key] || '#7892bf'; return `<label class="subject-setting-row"><span><i style="background:${value}"></i><b>${esc(subject)}</b></span><input type="color" data-subject-setting="${esc(key)}" value="${value}" aria-label="Цвет предмета ${esc(subject)}"></label>`; }).join('') : '<p class="muted">Загрузите расписание выбранной группы, чтобы настроить цвета предметов.</p>';
    }
}
function renderProfilePage() {
    const p = PROGRAMS.find(x => x.code === state.profile.program);
    const avatar = state.personalization.avatarDataUrl ? `<div class="avatar large" style="background-image:url('${state.personalization.avatarDataUrl}');background-size:cover;background-position:center"></div>` : `<div class="avatar large">${esc(state.personalization.avatarPreset || '🎓')}</div>`;
    $('profileSummary').innerHTML = `<div class="profile-large">${avatar}<div><h2>${esc(state.personalization.displayName || 'Профиль студента')}</h2><p>${esc(p?.title ?? '')} · ${state.profile.course} курс · группа ${esc(state.profile.group || 'не выбрана')}</p><small>Часовой пояс календаря: ${esc(state.timezone)} · Акцент: ${state.personalization.accentColor}</small></div><button class="btn primary" data-action="profile">Редактировать</button></div><div class="profile-grid"><div class="card profile-stat"><span>Программа</span><b>${esc(p?.shortTitle ?? state.profile.program)}</b></div><div class="card profile-stat"><span>Группа</span><b>${esc(state.profile.group || '—')}</b></div><div class="card profile-stat"><span>Активные ДЗ</span><b>${readTasks().filter(t => (t.status ?? 'todo') !== 'done').length}</b></div><div class="card profile-stat"><span>Источник расписания</span><b>${state.status.toUpperCase()}</b></div></div>`;
}
async function loadSupport() { if (state.supportStatus === 'loading')
    return; state.supportStatus = 'loading'; renderSupport(); try {
    state.ticketList = await listTickets();
    state.supportStatus = 'ready';
    if (state.ticketSelected)
        await loadTicketDetail(state.ticketSelected);
}
catch {
    state.supportStatus = 'error';
} renderSupport(); }
async function loadTicketDetail(id) { try {
    const t = await getTicket(id);
    state.ticketList = [...state.ticketList.filter(x => x.id !== id), t];
    state.ticketSelected = id;
}
catch {
    state.ticketSelected = '';
} }
function renderSupport() { const list = $('ticketList'); const selected = state.ticketList.find(x => x.id === state.ticketSelected); if (state.supportStatus === 'loading') {
    list.innerHTML = renderSkeletonCards(3);
    $('ticketDetail').innerHTML = '<div class="empty-state card"><p>Загружаем обращения…</p></div>';
}
else if (state.supportStatus === 'error') {
    list.innerHTML = '<div class="empty-state card"><h3>Не удалось загрузить обращения</h3><button class="btn" data-action="support-retry">Повторить</button></div>';
    $('ticketDetail').innerHTML = '';
}
else {
    list.innerHTML = state.ticketList.length ? state.ticketList.map(t => `<button class="ticket-row ${t.id === state.ticketSelected ? 'active' : ''}" data-ticket="${esc(t.id)}"><span>${esc(t.number)}</span><b>${esc(t.subject)}</b><small>${ticketStatusLabel(t.status)} · ${new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' }).format(new Date(t.updatedAt))}</small></button>`).join('') : '<div class="empty-state compact"><h3>Обращений пока нет</h3><p>Создайте тикет, если FAQ не помог.</p></div>';
    if (selected) {
        $('ticketDetail').innerHTML = `<article class="ticket-detail card"><div class="ticket-head"><div><span class="eyebrow">${esc(selected.number)}</span><h2>${esc(selected.subject)}</h2><p>${ticketStatusLabel(selected.status)} · ${esc(selected.priority)}</p></div><button class="btn small" data-action="support-close">Закрыть</button></div><div class="message-list">${(selected.messages ?? []).map(m => `<div class="message ${m.authorType === 'support' ? 'support' : ''}"><b>${m.authorType === 'support' ? 'Поддержка' : 'Вы'}</b><p>${esc(m.body)}</p><small>${new Date(m.createdAt).toLocaleString('ru-RU')}</small></div>`).join('')}</div><form id="ticketReplyForm" class="reply-form"><textarea id="ticketReply" rows="4" placeholder="Добавить сообщение…" aria-label="Ответ по тикету"></textarea><button class="btn primary" type="submit">Отправить</button></form></article>`;
    }
    else
        $('ticketDetail').innerHTML = '<div class="empty-state card"><h3>Выберите обращение</h3><p>Или создайте новое.</p></div>';
} }
function ticketStatusLabel(s) { return { new: 'Новое', in_progress: 'В работе', waiting_user: 'Ожидает ответа', resolved: 'Решено', closed: 'Закрыто' }[s] ?? s; }
function renderSkeletonCards(n) { return `<div class="skeleton-stack">${Array.from({ length: n }, () => '<div class="skeleton-card"></div>').join('')}</div>`; }
function openModal(id) { const modal = $(id); closeAllModals(); refreshControls(); modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false'); document.body.classList.add('modal-open'); const focus = modal.querySelector('.ui-select-trigger,.ui-date-trigger,button:not([disabled]),input:not([type=hidden]),textarea'); focus?.focus(); }
function closeModal(id) { const modal = document.getElementById(id); if (!modal)
    return; modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); if (!document.querySelector('.modal-backdrop.open'))
    document.body.classList.remove('modal-open'); }
function closeAllModals() { document.querySelectorAll('.modal-backdrop.open').forEach(modal => { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); }); document.body.classList.remove('modal-open'); }
function loadAppearance() { state.personalization = readPersonalization(); state.double1 = state.personalization.double1; state.double2 = state.personalization.double2; }
function luminance(hex) { const values = hex.replace('#', '').match(/.{2}/g)?.map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4)) ?? [0, 0, 0]; return .2126 * values[0] + .7152 * values[1] + .0722 * values[2]; }
function applyAppearance() { state.personalization = readPersonalization(); const accent = state.personalization.accentColor; document.documentElement.style.setProperty('--accent', accent); document.documentElement.style.setProperty('--accent-hover', accent); document.documentElement.style.setProperty('--focus', accent); document.documentElement.style.setProperty('--accent-foreground', luminance(accent) > .42 ? '#111827' : '#ffffff'); document.documentElement.style.setProperty('--double1', state.personalization.double1 || state.double1); document.documentElement.style.setProperty('--double2', state.personalization.double2 || state.double2); }
function saveAppearance() { state.personalization = updatePersonalization({ double1: state.double1, double2: state.double2 }); applyAppearance(); }
function renderProfileOptions() { const ps = $('programSelect'), cs = $('courseSelect'), gs = $('groupSelect'); ps.innerHTML = PROGRAMS.map(p => `<option value="${p.code}">${esc(p.title)} · ${p.code}</option>`).join(''); cs.innerHTML = [1, 2, 3, 4, 5, 6].map(c => `<option value="${c}">${c} курс</option>`).join(''); gs.innerHTML = groupOptions(state.profile.program, state.profile.course).map(g => g ? `<option value="${esc(g)}">${esc(g)}</option>` : `<option value="">— группы не опубликованы —</option>`).join(''); ps.value = state.profile.program; cs.value = String(state.profile.course); gs.value = state.profile.group; fillModalOptions(state.profile.program, state.profile.course, state.profile.group); }
function fillModalOptions(program, course, group) { const p = $('modalProgram'), c = $('modalCourse'), g = $('modalGroup'); p.innerHTML = PROGRAMS.map(x => `<option value="${x.code}">${esc(x.title)}</option>`).join(''); c.innerHTML = [1, 2, 3, 4, 5, 6].map(x => `<option value="${x}">${x} курс</option>`).join(''); g.innerHTML = groupOptions(program, course).map(x => `<option value="${esc(x)}">${esc(x || '—')}</option>`).join(''); p.value = program; c.value = String(course); g.value = group; }
function openProfileModal() {
    state.personalization = readPersonalization();
    state.avatarPresetDraft = state.personalization.avatarPreset;
    state.avatarDataDraft = state.personalization.avatarDataUrl;
    fillModalOptions(state.profile.program, state.profile.course, state.profile.group);
    const name = $('profileNickname');
    name.value = state.personalization.displayName;
    $('profileAccent').value = state.personalization.accentColor;
    $('avatarPreview').textContent = state.personalization.avatarDataUrl ? '' : state.personalization.avatarPreset;
    $('avatarPreview').style.backgroundImage = state.personalization.avatarDataUrl ? `url("${state.personalization.avatarDataUrl}")` : '';
    const tz = $('modalTimezone');
    const common = ['Europe/Zurich', 'Europe/Moscow', 'Europe/London', 'Europe/Berlin', 'Asia/Tokyo', 'America/New_York', 'UTC'];
    tz.innerHTML = Array.from(new Set([...common, state.timezone])).map(z => `<option value="${esc(z)}">${esc(z)}</option>`).join('');
    tz.value = state.timezone;
    openModal('profileModal');
}
async function saveProfile() {
    const nickname = $('profileNickname').value.trim();
    if (nickname && !/^[\p{L}\p{N}_. -]{2,36}$/u.test(nickname)) {
        toast('Имя должно содержать 2–36 букв, цифр, пробелов, точек, дефисов или подчёркиваний.', 'error');
        return;
    }
    const p = $('modalProgram').value, c = Number($('modalCourse').value), g = $('modalGroup').value;
    state.profile = { program: p, course: c, group: g };
    ensureProfile();
    localStorage.setItem('almazov.profile', JSON.stringify(state.profile));
    setAcademicProfile(state.profile);
    setTimezone($('modalTimezone').value);
    state.personalization = updatePersonalization({ displayName: nickname, accentColor: $('profileAccent').value, avatarPreset: state.avatarPresetDraft || state.personalization.avatarPreset, avatarDataUrl: state.avatarDataDraft || '' });
    saveAppearance();
    closeModal('profileModal');
    state.week = mondayOf(state.focusDate);
    clearScheduleMemory();
    render();
    await reloadEvents();
    await refreshUploadedMaterials();
    await refreshHomePersonal();
    render();
}
async function cropAvatar(file) { if (file.size > 8 * 1024 * 1024)
    throw new Error('Изображение должно быть меньше 8 МБ.'); if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('Поддерживаются JPG, PNG и WebP.'); const url = URL.createObjectURL(file); try {
    const img = new Image();
    img.src = url;
    await new Promise((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('Не удалось открыть изображение.')); });
    const size = Math.min(img.naturalWidth, img.naturalHeight);
    if (!size)
        throw new Error('Изображение пустое.');
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx)
        throw new Error('Кадрирование недоступно в этом браузере.');
    ctx.drawImage(img, (img.naturalWidth - size) / 2, (img.naturalHeight - size) / 2, size, size, 0, 0, 256, 256);
    return canvas.toDataURL('image/webp', 0.82);
}
finally {
    URL.revokeObjectURL(url);
} }
function prepareTaskSubjectOptions() { const subjects = Array.from(new Set([...state.official.map(e => e.subject), ...readTasks().map(t => t.subject)].filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ru')); $('taskSubjectOptions').innerHTML = subjects.map(x => `<option value="${esc(x)}"></option>`).join(''); }
function openTask(subjectPrefill = '', duePrefill = '') { $('taskSubject').value = subjectPrefill; $('taskText').value = ''; $('taskDate').value = duePrefill; $('taskPriority').value = 'medium'; $('taskLink').value = ''; $('taskAttachment').value = ''; $('taskNotice').textContent = subjectPrefill ? (duePrefill ? `Предмет выбран автоматически. Дедлайн подставлен по следующему занятию: ${formatTaskDue(duePrefill)}.` : 'Предмет выбран автоматически. Следующее занятие не найдено — задайте дедлайн вручную.') : ''; $('taskModalTitle').textContent = subjectPrefill ? `Записать ДЗ · ${subjectPrefill}` : 'Новое задание'; prepareTaskSubjectOptions(); refreshControls(); openModal('taskModal'); }
function openTaskFromEvent(id) { const clicked = state.events.find(e => e.id === id) || getDisplayEvents().find(e => e.id === id); if (!clicked || clicked.kind !== 'schedule')
    return; const subject = eventSubject(clicked), now = Date.now(), threshold = Math.max(now, Date.parse(clicked.startAt) + 1000); const next = getDisplayEvents().filter(e => e.kind === 'schedule' && subjectColorKey(eventSubject(e)) === subjectColorKey(subject) && Date.parse(e.startAt) >= threshold).sort((a, b) => a.startAt.localeCompare(b.startAt))[0]; openTask(subject, next ? localDateTimeInput(next.startAt, state.timezone) : ''); }
function fileAsDataUrl(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error('Не удалось прочитать файл.')); reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Неверный формат файла.')); reader.readAsDataURL(file); }); }
async function saveTask() {
    const subject = $('taskSubject').value.trim(), text = $('taskText').value.trim(), link = $('taskLink').value.trim(), file = ($('taskAttachment').files ?? [])[0];
    if (!subject || !text) {
        $('taskNotice').textContent = 'Выберите предмет и заполните текст задания.';
        return;
    }
    if (link && !/^https?:\/\//i.test(link)) {
        $('taskNotice').textContent = 'Ссылка должна начинаться с http:// или https://.';
        return;
    }
    if (file && file.size > 850 * 1024) {
        $('taskNotice').textContent = 'Файл больше 850 КБ. Добавьте ссылку на крупный файл вместо загрузки.';
        return;
    }
    try {
        const attachmentData = file ? await fileAsDataUrl(file) : undefined;
        const task = { id: crypto.randomUUID(), subject, text, due: $('taskDate').value || undefined, done: false, status: 'todo', priority: $('taskPriority').value, link: link || undefined, attachmentName: file?.name, attachmentData, ...state.profile, createdAt: new Date().toISOString() };
        addTask(task);
        state.tasks = readTasks();
        closeModal('taskModal');
        renderTasks();
        renderSchedule();
        toast('Домашнее задание сохранено');
    }
    catch (error) {
        $('taskNotice').textContent = error instanceof Error ? error.message : 'Не удалось сохранить задание.';
    }
}
function openMaterial() {
    const sel = $('materialSubject');
    const subjects = Array.from(new Set([...state.official.map(e => e.subject), ...PROGRAMS.flatMap(p => p.scheduleCourses.map(c => `${p.shortTitle} · ${c} курс`)), ...state.personalization.materials.map(m => m.subject)].filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ru'));
    sel.innerHTML = subjects.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
    sel.value = `${PROGRAMS.find(p => p.code === state.profile.program)?.shortTitle ?? 'ЛД'} · ${state.profile.course} курс`;
    for (const id of ['materialTitle', 'materialUrl', 'materialDescription', 'materialTags'])
        $(id).value = '';
    $('materialCategory').value = 'link';
    $('materialHelpfulness').value = '';
    $('materialNotice').textContent = '';
    openModal('materialModal');
}
function saveMaterial() { const title = $('materialTitle').value.trim(), subject = $('materialSubject').value, category = $('materialCategory').value, url = $('materialUrl').value.trim(), description = $('materialDescription').value.trim(), tags = $('materialTags').value.split(',').map(x => x.trim()).filter(Boolean).slice(0, 8).map(x => x.slice(0, 32)), rating = Number($('materialHelpfulness').value); if (title.length < 2) {
    $('materialNotice').textContent = 'Введите название материала.';
    return;
} if (!/^https?:\/\//i.test(url)) {
    $('materialNotice').textContent = 'Укажите корректный URL, начинающийся с http:// или https://.';
    return;
} const material = { id: crypto.randomUUID(), title, subject, category, description, url, tags, helpfulness: rating >= 1 && rating <= 5 ? rating : undefined, createdAt: new Date().toISOString() }; state.personalization = updatePersonalization({ materials: [...state.personalization.materials, material] }); closeModal('materialModal'); renderResources(); toast('Материал добавлен в базу знаний'); }
function openMaterialUpload() {
    const sel = $('fileMaterialSubject');
    sel.innerHTML = subjectChoices().map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
    const current = `${PROGRAMS.find(p => p.code === state.profile.program)?.shortTitle ?? 'ЛД'} · ${state.profile.course} курс`;
    sel.value = subjectChoices().includes(current) ? current : subjectChoices()[0] ?? '';
    for (const id of ['fileMaterialTitle', 'fileMaterialDescription', 'fileMaterialTags'])
        $(id).value = '';
    $('fileMaterialCategory').value = 'lecture';
    $('fileMaterialInput').value = '';
    $('fileMaterialSelected').textContent = 'Файл не выбран.';
    $('fileMaterialNotice').textContent = '';
    openModal('materialUploadModal');
}
function updateSelectedFile(file) { const input = $('fileMaterialInput'); if (file && (!file.name.includes('.') || !/^.{1,240}$/.test(file.name))) {
    $('fileMaterialNotice').textContent = 'Проверьте имя файла.';
    return;
} if (file && file.size > MAX_MATERIAL_FILE_SIZE) {
    $('fileMaterialNotice').textContent = 'Файл больше 25 МБ. Выберите файл меньшего размера.';
    input.value = '';
    return;
} if (file) {
    $('fileMaterialSelected').textContent = `${file.name} · ${formatBytes(file.size)}`;
    const title = $('fileMaterialTitle');
    if (!title.value.trim())
        title.value = file.name.replace(/\.[^.]+$/, '');
    $('fileMaterialNotice').textContent = '';
} }
async function saveUploadedMaterial() { const file = ($('fileMaterialInput').files ?? [])[0]; const title = $('fileMaterialTitle').value.trim(); const subject = $('fileMaterialSubject').value; const category = $('fileMaterialCategory').value; const description = $('fileMaterialDescription').value.trim(); const tags = $('fileMaterialTags').value.split(',').map(x => x.trim()).filter(Boolean).slice(0, 12); if (!file) {
    $('fileMaterialNotice').textContent = 'Выберите файл или перетащите его в область загрузки.';
    return;
} if (title.length < 2 || !subject) {
    $('fileMaterialNotice').textContent = 'Укажите название и предмет.';
    return;
} try {
    await saveFileMaterial({ file, title, subject, category, description, tags, program: state.profile.program, course: state.profile.course, group: state.profile.group, scope: materialScope(state.profile.program, state.profile.course, state.profile.group) });
    closeModal('materialUploadModal');
    await refreshUploadedMaterials();
    renderResources();
    toast('Материал сохранён в IndexedDB этого устройства.');
}
catch (error) {
    $('fileMaterialNotice').textContent = error instanceof Error ? error.message : 'Не удалось сохранить файл.';
} }
async function downloadUploadedMaterial(id, open = false) { try {
    const item = await getFileMaterial(id);
    if (!item)
        throw new Error('Файл не найден в локальном хранилище.');
    const url = URL.createObjectURL(item.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    if (!open)
        anchor.download = item.fileName;
    else
        anchor.removeAttribute('download');
    anchor.target = open ? '_blank' : '_self';
    anchor.rel = 'noopener noreferrer';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}
catch (error) {
    toast(error instanceof Error ? error.message : 'Не удалось открыть файл.', 'error');
} }
function readEventForm() { const title = $('eventTitle').value.trim(), start = $('eventStart').value, end = $('eventEnd').value, tz = $('eventTimezone').value; if (!title) {
    setEventNotice('Введите название события.');
    return null;
} if (!start || !end) {
    setEventNotice('Укажите начало и окончание.');
    return null;
} try {
    const startAt = localDateTimeToUtc(start, tz), endAt = localDateTimeToUtc(end, tz);
    if (Date.parse(endAt) <= Date.parse(startAt)) {
        setEventNotice('Окончание должно быть позже начала.');
        return null;
    }
    const freq = $('eventRepeat').value;
    const recurrence = freq === 'none' ? null : { frequency: freq, interval: Number($('eventInterval').value || 1), until: ($('eventUntil').value) || null, weekdays: Array.from(document.querySelectorAll('[data-weekday]:checked')).map(x => Number(x.dataset.weekday)) };
    return { title, description: $('eventDescription').value.trim(), category: $('eventCategory').value, status: $('eventStatus').value, startAt, endAt, timeZone: tz, allDay: $('eventAllDay').checked, location: $('eventLocation').value.trim(), meetingUrl: $('eventMeeting').value.trim(), attendees: $('eventAttendees').value.split(',').map(x => x.trim()).filter(Boolean), privacy: $('eventPrivacy').value, recurrence };
}
catch (error) {
    setEventNotice(error instanceof Error ? error.message : 'Некорректные данные');
    return null;
} }
function setEventNotice(msg) { $('eventNotice').textContent = msg; }
function saveDraft() { const ids = ['eventTitle', 'eventStart', 'eventEnd', 'eventTimezone', 'eventRepeat', 'eventInterval', 'eventUntil', 'eventCategory', 'eventStatus', 'eventLocation', 'eventMeeting', 'eventAttendees', 'eventPrivacy', 'eventDescription', 'eventAllDay']; const obj = {}; for (const id of ids) {
    const el = document.getElementById(id);
    if (el)
        obj[id] = el instanceof HTMLInputElement && el.type === 'checkbox' ? el.checked : el.value;
} localStorage.setItem('almazov.event.draft', JSON.stringify(obj)); }
function restoreDraft() { try {
    const raw = JSON.parse(localStorage.getItem('almazov.event.draft') ?? '{}');
    for (const [id, v] of Object.entries(raw)) {
        const el = document.getElementById(id);
        if (!el)
            continue;
        if (el instanceof HTMLInputElement && el.type === 'checkbox')
            el.checked = v === true;
        else
            el.value = String(v ?? '');
    }
}
catch { } }
function clearDraft() { localStorage.removeItem('almazov.event.draft'); }
function fillEventModal(e, date) { const tz = $('eventTimezone'); const scopeWrap = $('eventEditScopeWrap'); const scope = $('eventEditScope'); tz.innerHTML = [state.timezone, 'Europe/Moscow', 'UTC', 'Europe/Berlin', 'America/New_York', 'Asia/Tokyo'].filter((x, i, a) => a.indexOf(x) === i).map(x => `<option value="${x}">${x}</option>`).join(''); state.editingId = e?.kind === 'personal' ? e.id : ''; state.draft = !e; scopeWrap.hidden = !(e?.kind === 'personal' && !!e.recurrence); scope.value = 'series'; if (e) {
    $('eventTitle').value = e.title ?? (('subject' in e) ? e.subject : '');
    $('eventStart').value = localDateTimeInput(e.startAt, e.timeZone || state.timezone);
    $('eventEnd').value = localDateTimeInput(e.endAt, e.timeZone || state.timezone);
    tz.value = e.timeZone || state.timezone;
    $('eventDescription').value = e.description ?? '';
    $('eventCategory').value = e.category ?? 'personal';
    $('eventStatus').value = e.status ?? 'planned';
    $('eventLocation').value = e.location ?? '';
    $('eventMeeting').value = e.meetingUrl ?? '';
    $('eventAttendees').value = (e.attendees ?? []).join(', ');
    $('eventPrivacy').value = e.privacy ?? 'private';
    $('eventAllDay').checked = !!e.allDay;
    $('eventRepeat').value = e.recurrence?.frequency ?? 'none';
    $('eventInterval').value = String(e.recurrence?.interval ?? 1);
    $('eventUntil').value = e.recurrence?.until ?? '';
    scopeWrap.hidden = !e.recurrence;
}
else {
    const start = date ? `${date}T09:00` : state.focusDate + 'T09:00';
    const end = date ? `${date}T10:00` : state.focusDate + 'T10:00';
    $('eventTitle').value = '';
    $('eventStart').value = start;
    $('eventEnd').value = end;
    tz.value = state.timezone;
    $('eventDescription').value = '';
    $('eventCategory').value = 'personal';
    $('eventStatus').value = 'planned';
    $('eventLocation').value = '';
    $('eventMeeting').value = '';
    $('eventAttendees').value = '';
    $('eventPrivacy').value = 'private';
    $('eventAllDay').checked = false;
    $('eventRepeat').value = 'none';
    $('eventInterval').value = '1';
    $('eventUntil').value = '';
    restoreDraft();
} setEventNotice(''); $('eventModalTitle').textContent = e ? 'Редактировать событие' : 'Новое событие'; openModal('eventModal'); }
function detectConflict(input, ignoreId = '') { return getDisplayEvents().filter(e => e.kind === 'schedule' || e.id !== ignoreId).some(e => Date.parse(input.endAt) > Date.parse(e.startAt) && Date.parse(input.startAt) < Date.parse(e.endAt)); }
async function saveEvent() { const input = readEventForm(); if (!input)
    return; if (detectConflict(input, state.editingId)) {
    const ok = confirm('Событие пересекается с другим событием. Всё равно сохранить?');
    if (!ok)
        return;
} try {
    const wasEditing = !!state.editingId;
    if (state.editingId) {
        const current = state.personal.find(x => x.id === state.editingId);
        const before = current ? toInput(current) : input;
        const scope = (document.getElementById('eventEditScope')?.value ?? 'series');
        const updated = await updatePersonalEvent(state.editingId, input, scope);
        state.undo = { id: updated.id, before, scope, kind: 'update' };
    }
    else {
        await createPersonalEvent(input);
    }
    clearDraft();
    closeModal('eventModal');
    state.editingId = '';
    await reloadEvents();
    render();
    showUndo(wasEditing ? 'Изменение сохранено' : 'Событие создано');
}
catch (error) {
    setEventNotice(error instanceof Error ? error.message : 'Не удалось сохранить событие.');
} }
function toInput(e) { return { title: e.title, description: e.description, category: e.category, status: e.status, startAt: e.startAt, endAt: e.endAt, timeZone: e.timeZone, allDay: e.allDay, location: e.location, meetingUrl: e.meetingUrl, attendees: e.attendees, privacy: e.privacy, recurrence: e.recurrence ?? null }; }
async function deleteSelected(id) { const e = state.personal.find(x => x.id === id); if (!e)
    return; if (!confirm('Удалить личное событие?'))
    return; const before = toInput(e); try {
    await deletePersonalEvent(id, e.seriesId ? 'series' : 'single');
    state.undo = { id, before, scope: e.seriesId ? 'series' : 'single', kind: 'delete' };
    await reloadEvents();
    render();
    showUndo('Событие удалено');
}
catch (error) {
    toast(error instanceof Error ? error.message : 'Не удалось удалить событие', 'error');
} }
let undoTimer;
function showUndo(text) { const root = document.getElementById('toastRoot'); if (!root)
    return; root.innerHTML = `<div class="toast"><span>${esc(text)}</span><button class="btn small" data-action="undo">Отменить</button></div>`; if (undoTimer)
    window.clearTimeout(undoTimer); undoTimer = window.setTimeout(() => { root.innerHTML = ''; state.undo = null; }, 7000); }
async function undo() { const u = state.undo; if (!u)
    return; try {
    if (u.kind === 'delete') {
        const created = await createPersonalEvent(u.before);
        state.undo = { ...u, id: created.id };
    }
    else
        await updatePersonalEvent(u.id, u.before, 'series');
    state.undo = null;
    if (undoTimer)
        window.clearTimeout(undoTimer);
    $('toastRoot').innerHTML = '';
    await reloadEvents();
    render();
}
catch (error) {
    toast(error instanceof Error ? error.message : 'Не удалось отменить действие', 'error');
} }
function toast(text, kind = 'success') { $('toastRoot').innerHTML = `<div class="toast ${kind}">${esc(text)}</div>`; window.setTimeout(() => { $('toastRoot').innerHTML = ''; }, 5000); }
function openEventById(id) { const e = state.events.find(x => x.id === id); if (!e)
    return; if (e.kind === 'personal') {
    fillEventModal(e);
}
else {
    openEventDetail(e);
} }
function openEventDetail(e) { $('detailTitle').textContent = String(e.title ?? (('subject' in e) ? e.subject : '')); $('detailBody').innerHTML = `<div class="detail-grid"><span>Дата</span><b>${esc(longDateRu(localDate(e.startAt, state.timezone)))}</b><span>Время</span><b>${esc(e.allDay ? 'Весь день' : `${localTime(e.startAt, state.timezone)}–${localTime(e.endAt, state.timezone)}`)}</b><span>Часовой пояс</span><b>${esc(state.timezone)}</b><span>Тип</span><b>${esc(e.kind === 'personal' ? 'Личное' : String(e.type ?? 'Занятие'))}</b><span>Место</span><b>${esc(e.location || '—')}</b><span>Статус</span><b>${esc(STATUS_LABEL[e.status ?? 'planned'])}</b><span>Описание</span><p>${esc(e.description || '—')}</p></div>${e.kind === 'personal' ? '<div class="detail-actions"><button class="btn primary" data-action="edit-opened">Изменить</button><button class="btn danger" data-action="delete-opened">Удалить</button></div>' : `<div class="detail-actions"><button class="btn primary" data-homework-from-event="${esc(e.id)}">＋ Записать ДЗ</button></div>`}`; state.editingId = e.kind === 'personal' ? e.id : ''; openModal('eventDetailModal'); }
async function handleSupportSubmit(form) { const subject = $('ticketSubject').value.trim(), description = $('ticketDescription').value.trim(); if (subject.length < 3 || description.length < 5) {
    $('ticketNotice').textContent = 'Заполните тему и подробное описание.';
    return;
} const files = Array.from($('ticketFiles').files ?? []); try {
    const attachments = await Promise.all(files.slice(0, 5).map(fileToAttachment));
    const t = await createTicket({ subject, description, category: $('ticketCategory').value, priority: $('ticketPriority').value, attachments });
    state.ticketList = [t, ...state.ticketList.filter(x => x.id !== t.id)];
    state.ticketSelected = t.id;
    form.reset();
    $('ticketNotice').textContent = '';
    renderSupport();
    toast(`Обращение ${t.number} создано`);
}
catch (error) {
    $('ticketNotice').textContent = error instanceof Error ? error.message : 'Не удалось создать тикет.';
} }
function bind() {
    document.addEventListener('click', async (e) => {
        const origin = e.target instanceof Element ? e.target : null;
        if (origin?.classList.contains('modal-backdrop')) {
            const backdrop = origin;
            if (backdrop.classList.contains('open'))
                closeModal(backdrop.id);
            return;
        }
        const target = origin?.closest('[data-action],[data-page],[data-view],[data-schedule-mode],[data-pick-program],[data-task-delete],[data-task-toggle],[data-task-status],[data-task-attachment],[data-jump-date],[data-open-event],[data-homework-from-event],[data-ticket],[data-faq-category],[data-faq-open],[data-subject-color-trigger],[data-duration-adjust],[data-avatar-preset],[data-material-delete],[data-material-open],[data-material-download]');
        if (!target)
            return;
        const action = target.dataset.action;
        if (target.dataset.page) {
            nav(target.dataset.page);
            return;
        }
        if (target.dataset.homeworkFromEvent) {
            openTaskFromEvent(target.dataset.homeworkFromEvent);
            return;
        }
        if (target.dataset.materialDownload) {
            void downloadUploadedMaterial(target.dataset.materialDownload, false);
            return;
        }
        if (target.dataset.materialOpen) {
            void downloadUploadedMaterial(target.dataset.materialOpen, true);
            return;
        }
        if (target.dataset.scheduleMode) {
            state.scheduleMode = target.dataset.scheduleMode;
            if (state.scheduleMode === 'kug')
                state.view = 'month';
            renderSchedule();
            renderSettings();
            return;
        }
        if (target.dataset.durationAdjust) {
            const card = target.closest('.calendar-event');
            const id = card?.dataset.eventId;
            const ev = id ? state.personal.find(x => x.id === id) : undefined;
            if (!id || !ev)
                return;
            const before = toInput(ev);
            const delta = Number(target.dataset.durationAdjust);
            const nextEnd = new Date(Date.parse(ev.endAt) + delta * 60000);
            if (!Number.isFinite(nextEnd.getTime()) || nextEnd.getTime() <= Date.parse(ev.startAt)) {
                toast('Длительность не может быть меньше 15 минут', 'error');
                return;
            }
            try {
                await updatePersonalEvent(id, { ...before, endAt: nextEnd.toISOString() }, 'single');
                state.undo = { id, before, scope: 'single', kind: 'update' };
                await reloadEvents();
                render();
                showUndo('Длительность изменена');
            }
            catch (error) {
                toast(error instanceof Error ? error.message : 'Не удалось изменить длительность', 'error');
            }
            return;
        }
        if (target.dataset.subjectColorTrigger) {
            const key = target.dataset.subjectColorTrigger;
            const input = document.createElement('input');
            input.type = 'color';
            input.value = state.personalization.subjectColors[key] || '#7892bf';
            input.setAttribute('aria-label', 'Цвет предмета');
            input.style.position = 'fixed';
            input.style.left = '-10000px';
            input.addEventListener('input', () => { const colors = { ...readPersonalization().subjectColors, [key]: input.value }; state.personalization = updatePersonalization({ subjectColors: colors }); renderSchedule(); renderSettings(); });
            input.addEventListener('change', () => input.remove());
            document.body.appendChild(input);
            input.click();
            return;
        }
        if (target.dataset.avatarPreset) {
            state.avatarPresetDraft = target.dataset.avatarPreset;
            state.avatarDataDraft = '';
            const preview = $('avatarPreview');
            preview.textContent = state.avatarPresetDraft;
            preview.style.backgroundImage = '';
            return;
        }
        if (target.dataset.materialDelete) {
            const id = target.dataset.materialDelete;
            if (id.startsWith('file-')) {
                try {
                    await deleteFileMaterial(id);
                    state.fileMaterials = state.fileMaterials.filter(m => m.id !== id);
                    renderResources();
                    toast('Файл удалён из локальной базы');
                }
                catch (error) {
                    toast(error instanceof Error ? error.message : 'Не удалось удалить файл', 'error');
                }
            }
            else {
                state.personalization = updatePersonalization({ materials: state.personalization.materials.filter(m => m.id !== id) });
                renderResources();
                toast('Ссылка удалена');
            }
            return;
        }
        if (target.dataset.view) {
            state.view = target.dataset.view;
            renderSchedule();
            await reloadEvents();
            render();
            return;
        }
        if (target.dataset.faqCategory) {
            state.faqCategory = target.dataset.faqCategory;
            renderFaq(state.faqQuery);
            return;
        }
        if (target.dataset.faqOpen) {
            document.getElementById(`faq-${target.dataset.faqOpen}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            document.getElementById(`faq-${target.dataset.faqOpen}`)?.setAttribute('open', '');
            return;
        }
        if (target.dataset.ticket) {
            state.ticketSelected = target.dataset.ticket;
            await loadTicketDetail(state.ticketSelected);
            renderSupport();
            return;
        }
        if (target.dataset.openEvent) {
            openEventById(target.dataset.openEvent);
            return;
        }
        if (action === 'kug-retry') {
            void loadKugData();
            return;
        }
        if (action === 'upload-material') {
            openMaterialUpload();
            return;
        }
        if (action === 'save-uploaded-material') {
            void saveUploadedMaterial();
            return;
        }
        if (action === 'toggle-menu') {
            document.body.classList.toggle('menu-open');
            return;
        }
        if (action === 'check-updates') {
            window.dispatchEvent(new Event('app:check-update'));
            toast('Проверяем опубликованную версию…');
            return;
        }
        if (action === 'theme') {
            cycleTheme();
            state.theme = themeMode();
            renderSettings();
            return;
        }
        if (action === 'today') {
            state.focusDate = todayISO(state.timezone);
            state.week = mondayOf(state.focusDate);
            await reloadEvents();
            render();
            return;
        }
        if (action === 'prev-period') {
            state.focusDate = state.view === 'month' ? addDays(state.focusDate, -30) : addDays(state.focusDate, state.view === 'day' ? -1 : -7);
            state.week = mondayOf(state.focusDate);
            await reloadEvents();
            render();
            return;
        }
        if (action === 'next-period') {
            state.focusDate = state.view === 'month' ? addDays(state.focusDate, 30) : addDays(state.focusDate, state.view === 'day' ? 1 : 7);
            state.week = mondayOf(state.focusDate);
            await reloadEvents();
            render();
            return;
        }
        if (action === 'refresh-data') {
            clearScheduleMemory();
            await reloadEvents();
            render();
            return;
        }
        if (action === 'new-event') {
            fillEventModal(undefined, target.dataset.jumpDate);
            return;
        }
        if (action === 'save-event') {
            await saveEvent();
            return;
        }
        if (action === 'close-modal') {
            closeAllModals();
            return;
        }
        if (action === 'profile') {
            openProfileModal();
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
            await saveTask();
            return;
        }
        if (action === 'new-material') {
            openMaterial();
            return;
        }
        if (action === 'save-material') {
            saveMaterial();
            return;
        }
        if (action === 'reset-task-filters') {
            state.taskSearch = '';
            state.taskFilterStatus = 'all';
            state.taskFilterSubject = 'all';
            $('taskSearch').value = '';
            $('taskStatusFilter').value = 'all';
            renderTasks();
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
        if (action === 'undo') {
            await undo();
            return;
        }
        if (action === 'edit-opened') {
            const e = state.personal.find(x => x.id === state.editingId);
            closeModal('eventDetailModal');
            if (e)
                fillEventModal(e);
            return;
        }
        if (action === 'delete-opened') {
            const id = state.editingId;
            closeModal('eventDetailModal');
            await deleteSelected(id);
            return;
        }
        if (action === 'support-new') {
            openModal('ticketModal');
            return;
        }
        if (action === 'support-retry') {
            state.supportStatus = 'idle';
            await loadSupport();
            return;
        }
        if (action === 'support-close') {
            state.ticketSelected = '';
            renderSupport();
            return;
        }
        if (action === 'save-settings') {
            try {
                setTimezone($('settingsTimezone').value);
                applyTheme($('settingsTheme').value);
                toast('Настройки сохранены');
                await reloadEvents();
                render();
            }
            catch (error) {
                toast(error instanceof Error ? error.message : 'Не удалось сохранить настройки', 'error');
            }
            return;
        }
        if (target.dataset.pickProgram) {
            state.profile.program = target.dataset.pickProgram;
            state.profile.course = 1;
            state.profile.group = groupsFor(state.profile.program, 1)[0] ?? '';
            localStorage.setItem('almazov.profile', JSON.stringify(state.profile));
            setAcademicProfile(state.profile);
            state.focusDate = todayISO(state.timezone);
            state.week = mondayOf(state.focusDate);
            clearScheduleMemory();
            nav('schedule');
            await reloadEvents();
            render();
            return;
        }
        if (target.dataset.taskDelete) {
            removeTask(target.dataset.taskDelete);
            state.tasks = readTasks();
            renderTasks();
            renderSchedule();
            return;
        }
        if (target.dataset.taskToggle) {
            const tt = readTasks().find(x => x.id === target.dataset.taskToggle);
            if (tt)
                updateTask(tt.id, { status: (tt.status ?? (tt.done ? 'done' : 'todo')) === 'done' ? 'todo' : 'done' });
            state.tasks = readTasks();
            renderTasks();
            renderSchedule();
            return;
        }
        if (target.dataset.taskAttachment) {
            const tt = readTasks().find(x => x.id === target.dataset.taskAttachment);
            if (tt?.attachmentData) {
                const a = document.createElement('a');
                a.href = tt.attachmentData;
                a.download = tt.attachmentName || 'homework-attachment';
                a.click();
            }
            return;
        }
        if (target.dataset.jumpDate) {
            state.focusDate = target.dataset.jumpDate;
            state.week = mondayOf(state.focusDate);
            if (state.view === 'month') { }
            else
                state.view = 'day';
            renderSchedule();
            await reloadEvents();
            render();
            return;
        }
    });
    const uploadInput = $('fileMaterialInput');
    uploadInput.addEventListener('change', () => updateSelectedFile(uploadInput.files?.[0]));
    const dropZone = $('materialDropZone');
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('drag-over'); const file = e.dataTransfer?.files?.[0]; if (!file)
        return; const transfer = new DataTransfer(); transfer.items.add(file); uploadInput.files = transfer.files; updateSelectedFile(file); });
    document.addEventListener('submit', async (e) => { if (e.target instanceof HTMLFormElement) {
        if (e.target.id === 'ticketForm') {
            e.preventDefault();
            await handleSupportSubmit(e.target);
        }
        if (e.target.id === 'ticketReplyForm') {
            e.preventDefault();
            const id = state.ticketSelected;
            const body = $('ticketReply').value.trim();
            if (id && body) {
                const t = await addTicketMessage(id, body);
                state.ticketList = state.ticketList.map(x => x.id === id ? t : x);
                renderSupport();
            }
        }
    } });
    document.addEventListener('input', e => { const t = e.target; if (t.closest('#eventModal')) {
        saveDraft();
    } if (t.id === 'scheduleSearch') {
        state.search = t.value;
        renderSchedule();
    } if (t.id === 'faqSearch') {
        state.faqQuery = t.value;
        renderFaq(t.value);
    } if (t.id === 'taskSearch') {
        state.taskSearch = t.value;
        renderTasks();
    } if (t.id === 'resourceSearch') {
        state.resourceSearch = t.value;
        renderResources();
    } if (t.id === 'double1') {
        state.double1 = t.value;
        saveAppearance();
    } if (t.id === 'double2') {
        state.double2 = t.value;
        saveAppearance();
    } });
    ['programSelect', 'courseSelect', 'groupSelect'].forEach(id => $(id).addEventListener('change', async () => { if (id === 'programSelect' || id === 'courseSelect')
        renderProfileOptions(); applySelectProfile(); }));
    $('modalProgram').addEventListener('change', () => { const p = $('modalProgram').value; const c = Number($('modalCourse').value); const old = $('modalGroup').value; const g = $('modalGroup'); g.innerHTML = groupOptions(p, c).map(x => `<option value="${esc(x)}">${esc(x || '—')}</option>`).join(''); g.value = groupOptions(p, c).includes(old) ? old : groupOptions(p, c)[0] ?? ''; });
    $('modalCourse').addEventListener('change', () => { const p = $('modalProgram').value; const c = Number($('modalCourse').value); const g = $('modalGroup'); g.innerHTML = groupOptions(p, c).map(x => `<option value="${esc(x)}">${esc(x || '—')}</option>`).join(''); g.value = groupOptions(p, c)[0] ?? ''; });
    document.querySelectorAll('#typeFilter [data-type]').forEach(b => b.addEventListener('click', () => { state.type = b.dataset.type ?? 'all'; document.querySelectorAll('#typeFilter [data-type]').forEach(x => x.classList.remove('active')); b.classList.add('active'); renderSchedule(); }));
    $('statusFilter').addEventListener('change', e => { state.statusFilter = e.target.value; renderSchedule(); });
    $('categoryFilter').addEventListener('change', e => { state.categoryFilter = e.target.value; renderSchedule(); });
    $('taskStatusFilter').addEventListener('change', e => { state.taskFilterStatus = e.target.value; renderTasks(); });
    $('taskSubjectFilter').addEventListener('change', e => { state.taskFilterSubject = e.target.value; renderTasks(); });
    $('resourceSubjectFilter').addEventListener('change', e => { state.resourceSubject = e.target.value; renderResources(); });
    $('resourceCategoryFilter').addEventListener('change', e => { state.resourceCategory = e.target.value; renderResources(); });
    $('resourceTypeFilter').addEventListener('change', e => { state.resourceType = e.target.value; renderResources(); });
    document.addEventListener('change', e => { const target = e.target; if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement))
        return; if (target.dataset.taskStatus) {
        const id = target.dataset.taskStatus;
        updateTask(id, { status: target.value });
        state.tasks = readTasks();
        renderTasks();
        renderSchedule();
    } if (target.dataset.subjectSetting) {
        const colors = { ...readPersonalization().subjectColors, [target.dataset.subjectSetting]: target.value };
        state.personalization = updatePersonalization({ subjectColors: colors });
        renderSchedule();
        renderSettings();
    } });
    $('avatarUpload').addEventListener('change', async () => { const input = $('avatarUpload'); const file = input.files?.[0]; if (!file)
        return; try {
        state.avatarDataDraft = await cropAvatar(file);
        state.avatarPresetDraft = '';
        const preview = $('avatarPreview');
        preview.textContent = '';
        preview.style.backgroundImage = `url("${state.avatarDataDraft}")`;
        preview.style.backgroundSize = 'cover';
        preview.style.backgroundPosition = 'center';
    }
    catch (error) {
        toast(error instanceof Error ? error.message : 'Не удалось обработать аватар', 'error');
    } });
    ['eventStart', 'eventEnd', 'eventTimezone'].forEach(id => $(id).addEventListener('change', () => { const tz = $('eventTimezone').value; if (id === 'eventTimezone') {
        const s = $('eventStart'), en = $('eventEnd');
        if (s.value && en.value) { /* values remain in selected zone by design */ }
    } setEventNotice(''); }));
    document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        $('scheduleSearch').focus();
    } if (e.key === 'Escape') {
        closeAllModals();
        return;
    } if (e.key !== 'Enter' && e.key !== ' ')
        return; const target = e.target; if (!(target instanceof HTMLElement) || !target.matches('[data-open-event][role=button]'))
        return; e.preventDefault(); openEventById(target.dataset.openEvent); });
    document.addEventListener('dragstart', e => { const t = e.target.closest('.calendar-event'); if (t?.dataset.eventKind === 'personal' && e.dataTransfer) {
        e.dataTransfer.setData('text/event-id', t.dataset.eventId ?? '');
        e.dataTransfer.effectAllowed = 'move';
    } });
    document.addEventListener('dragover', e => { const t = e.target.closest('[data-drop-date]'); if (t)
        e.preventDefault(); });
    document.addEventListener('drop', async (e) => { const t = e.target.closest('[data-drop-date]'); if (!t)
        return; e.preventDefault(); const id = e.dataTransfer?.getData('text/event-id'); if (!id)
        return; const ev = state.personal.find(x => x.id === id); if (!ev)
        return; const old = toInput(ev); const date = t.dataset.dropDate; const startInput = localDateTimeInput(ev.startAt, ev.timeZone); const endInput = localDateTimeInput(ev.endAt, ev.timeZone); const ns = localDateTimeToUtc(`${date}T${startInput.slice(11)}`, ev.timeZone), ne = localDateTimeToUtc(`${date}T${endInput.slice(11)}`, ev.timeZone); const next = { ...old, startAt: ns, endAt: ne }; try {
        await updatePersonalEvent(id, next, 'single');
        state.undo = { id, before: old, scope: 'single', kind: 'update' };
        await reloadEvents();
        render();
        showUndo('Событие перенесено');
    }
    catch (error) {
        toast(error instanceof Error ? error.message : 'Не удалось перенести событие', 'error');
    } });
}
async function applySelectProfile() { const p = $('programSelect'), c = $('courseSelect'), g = $('groupSelect'); state.profile = { program: p.value, course: Number(c.value), group: g.value || '' }; ensureProfile(); localStorage.setItem('almazov.profile', JSON.stringify(state.profile)); setAcademicProfile(state.profile); state.focusDate = todayISO(state.timezone); state.week = mondayOf(state.focusDate); state.events = []; state.status = 'loading'; clearScheduleMemory(); render(); await reloadEvents(); await refreshUploadedMaterials(); await refreshHomePersonal(); render(); }
async function shareLink() { const url = new URL(location.href); url.search = ''; url.searchParams.set('program', state.profile.program); url.searchParams.set('course', String(state.profile.course)); if (state.profile.group)
    url.searchParams.set('group', state.profile.group); try {
    await navigator.clipboard.writeText(url.toString());
    toast('Ссылка скопирована');
}
catch {
    toast(url.toString());
} }
function exportICS() { const events = getDisplayEvents(); const tz = state.timezone; const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Almazov Schedule Hub//RU', 'CALSCALE:GREGORIAN']; for (const e of events) {
    const start = new Date(e.startAt).toISOString().replaceAll('-', '').replaceAll(':', '').replace(/\.\d{3}Z$/, 'Z');
    const end = new Date(e.endAt).toISOString().replaceAll('-', '').replaceAll(':', '').replace(/\.\d{3}Z$/, 'Z');
    lines.push('BEGIN:VEVENT', `UID:${escapeICS(e.id)}@almazov-hub`, `DTSTART:${start}`, `DTEND:${end}`, `SUMMARY:${escapeICS(String(e.title ?? (('subject' in e) ? e.subject : '')))}`, `DESCRIPTION:${escapeICS(e.description ?? '')}`, `LOCATION:${escapeICS(e.location ?? '')}`, 'END:VEVENT');
} lines.push('END:VCALENDAR'); const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `almazov-${state.profile.group || 'group'}-${state.focusDate}-${tz.replaceAll('/', '_')}.ics`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
function escapeICS(v) { return v.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n'); }
