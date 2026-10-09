const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
let installed = false;
let bodyObserver = null;
const observers = new WeakMap();
function esc(value) { return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c])); }
function pad(n) { return String(n).padStart(2, '0'); }
function dateValue(value) { return value.split('T')[0] ?? ''; }
function timeValue(value) { return value.includes('T') ? value.split('T')[1]?.slice(0, 5) || '09:00' : '09:00'; }
function toDate(value) { const parts = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(value); return parts ? new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]), 12) : new Date(); }
function isoLocalDate(date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
function formatDate(value, type) {
    if (!value)
        return type === 'datetime-local' ? 'Выбрать дату и время' : 'Выбрать дату';
    const parts = dateValue(value).split('-').map(Number);
    if (parts.length !== 3 || !parts.every(Number.isFinite))
        return value;
    const d = new Date(parts[0], parts[1] - 1, parts[2], 12);
    const text = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
    return type === 'datetime-local' ? `${text} · ${timeValue(value)}` : text;
}
function selectMarkup(select) {
    const value = select.value;
    const options = Array.from(select.options).filter(o => !o.disabled).map((option, index) => {
        const selected = option.value === value;
        const icon = option.dataset.icon ? `<span class="ui-select-option-icon" aria-hidden="true">${esc(option.dataset.icon)}</span>` : '';
        const color = /^#[\da-f]{6}$/i.test(option.dataset.color ?? '') ? option.dataset.color : '';
        const swatch = color ? `<i class="ui-select-option-swatch" style="--option-color:${color}" aria-hidden="true"></i>` : '';
        return `<button type="button" role="option" class="ui-select-option ${selected ? 'selected' : ''}" aria-selected="${selected}" data-ui-select-option="${esc(option.value)}" data-ui-select-index="${index}" ${option.disabled ? 'disabled' : ''}><span class="ui-select-option-content">${icon}${swatch}<span>${esc(option.textContent ?? option.value)}</span></span>${selected ? '<span aria-hidden="true">✓</span>' : ''}</button>`;
    }).join('');
    const current = select.selectedOptions[0]?.textContent ?? 'Выберите…';
    const accessible = select.getAttribute('aria-label') || select.closest('label')?.textContent?.trim().split('\n')[0]?.trim() || 'Выбор';
    return `<button type="button" class="ui-select-trigger" data-ui-select-trigger aria-haspopup="listbox" aria-expanded="false" aria-label="${esc(accessible)}"> <span class="ui-select-value">${esc(current)}</span><span class="ui-select-chevron" aria-hidden="true">⌄</span></button><div class="ui-select-menu" role="listbox" aria-label="${esc(accessible)}" hidden>${options || '<span class="ui-select-empty">Нет вариантов</span>'}</div>`;
}
function updateSelect(select) {
    const wrapper = select.closest('[data-ui-select-wrapper]');
    if (!wrapper)
        return;
    const oldMenu = wrapper.querySelector('.ui-select-menu');
    const newHtml = selectMarkup(select);
    const temp = document.createElement('div');
    temp.innerHTML = newHtml;
    const currentTrigger = wrapper.querySelector('.ui-select-trigger');
    const newTrigger = temp.querySelector('.ui-select-trigger');
    const isOpen = currentTrigger?.getAttribute('aria-expanded') === 'true';
    if (currentTrigger && newTrigger)
        currentTrigger.replaceWith(newTrigger);
    if (oldMenu)
        oldMenu.replaceWith(temp.querySelector('.ui-select-menu'));
    const menu = wrapper.querySelector('.ui-select-menu');
    if (menu && isOpen) {
        menu.hidden = false;
        wrapper.querySelector('.ui-select-trigger')?.setAttribute('aria-expanded', 'true');
    }
    const trigger = wrapper.querySelector('.ui-select-trigger');
    if (trigger)
        trigger.disabled = select.disabled;
}
function enhanceSelect(select) {
    if (select.dataset.uiManaged === 'true')
        return;
    const labelText = select.getAttribute('aria-label') || select.closest('label')?.textContent?.trim() || 'Выбор';
    const wrapper = document.createElement('span');
    wrapper.className = 'ui-select-control';
    wrapper.dataset.uiSelectWrapper = 'true';
    select.dataset.uiManaged = 'true';
    select.classList.add('ui-select-native');
    select.insertAdjacentElement('beforebegin', wrapper);
    wrapper.append(select);
    const holder = document.createElement('div');
    holder.innerHTML = selectMarkup(select);
    wrapper.append(...Array.from(holder.childNodes));
    const observer = new MutationObserver(() => updateSelect(select));
    observer.observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'selected', 'label', 'value'] });
    observers.set(select, observer);
    wrapper.setAttribute('data-ui-label', labelText.slice(0, 120));
}
function dueDateSet() {
    const due = new Set();
    try {
        const raw = localStorage.getItem('almazov.personalization.v1');
        const parsed = raw ? JSON.parse(raw) : null;
        for (const task of parsed?.tasks ?? [])
            if (typeof task.due === 'string' && task.due.length >= 10 && task.status !== 'done' && task.done !== true)
                due.add(task.due.slice(0, 10));
        const legacy = JSON.parse(localStorage.getItem('almazov.tasks.v2') ?? '[]');
        for (const task of Array.isArray(legacy) ? legacy : [])
            if (typeof task.due === 'string' && task.due.length >= 10 && task.status !== 'done' && task.done !== true)
                due.add(task.due.slice(0, 10));
    }
    catch { /* a damaged legacy record must not prevent the picker from opening */ }
    return due;
}
function calendarMarkup(input, open = false) {
    const selectedValue = dateValue(input.value);
    const selected = selectedValue ? toDate(selectedValue) : new Date();
    const month = Number(input.dataset.uiMonth ?? selected.getMonth());
    const year = Number(input.dataset.uiYear ?? selected.getFullYear());
    const first = new Date(year, month, 1, 12);
    const monthName = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(first);
    const mondayOffset = (first.getDay() + 6) % 7;
    const count = new Date(year, month + 1, 0, 12).getDate();
    const today = isoLocalDate(new Date());
    const dueDates = dueDateSet();
    const cells = Array.from({ length: Math.ceil((mondayOffset + count) / 7) * 7 }, (_, index) => {
        const day = index - mondayOffset + 1;
        if (day < 1 || day > count)
            return '<span class="ui-date-empty" aria-hidden="true"></span>';
        const value = `${year}-${pad(month + 1)}-${pad(day)}`;
        const weekday = new Date(year, month, day, 12).getDay();
        const weekend = weekday === 0 || weekday === 6;
        return `<button type="button" class="ui-date-day ${value === selectedValue ? 'selected' : ''} ${value === today ? 'today' : ''} ${weekend ? 'weekend' : ''} ${dueDates.has(value) ? 'has-tasks' : ''}" data-ui-date-day="${value}" aria-pressed="${value === selectedValue}" aria-label="${day} ${monthName}${dueDates.has(value) ? ', есть невыполненные задания' : ''}">${day}</button>`;
    }).join('');
    const time = input.type === 'datetime-local' ? `<label class="ui-date-time">Время <input type="time" data-ui-date-time value="${esc(timeValue(input.value))}"></label>` : '';
    return `<button type="button" class="ui-date-trigger" data-ui-date-toggle aria-expanded="${open}" aria-haspopup="dialog">${esc(formatDate(input.value, input.type))}<span aria-hidden="true">▦</span></button><div class="ui-date-popover" role="dialog" aria-label="Выбор даты" ${open ? '' : 'hidden'}><header class="ui-date-header"><button type="button" data-ui-date-nav="-1" aria-label="Предыдущий месяц">‹</button><b>${esc(monthName)}</b><button type="button" data-ui-date-nav="1" aria-label="Следующий месяц">›</button></header><div class="ui-date-weekdays">${WEEKDAYS.map(x => `<span>${x}</span>`).join('')}</div><div class="ui-date-grid">${cells}</div>${time}<footer><button type="button" class="ui-date-clear" data-ui-date-clear>Очистить</button><button type="button" class="ui-date-done" data-ui-date-done>Готово</button></footer></div>`;
}
function updateDate(input) {
    const wrapper = input.closest('[data-ui-date-wrapper]');
    if (!wrapper)
        return;
    const open = wrapper.querySelector('.ui-date-popover')?.hasAttribute('data-open') === true || wrapper.querySelector('.ui-date-popover:not([hidden])') !== null;
    const holder = document.createElement('div');
    holder.innerHTML = calendarMarkup(input, open);
    const currentTrigger = wrapper.querySelector('.ui-date-trigger');
    const nextTrigger = holder.querySelector('.ui-date-trigger');
    if (currentTrigger && nextTrigger)
        currentTrigger.replaceWith(nextTrigger);
    else if (!currentTrigger && nextTrigger)
        wrapper.append(nextTrigger);
    const currentPopover = wrapper.querySelector('.ui-date-popover');
    const nextPopover = holder.querySelector('.ui-date-popover');
    if (currentPopover && nextPopover)
        currentPopover.replaceWith(nextPopover);
    else if (nextPopover)
        wrapper.append(nextPopover);
}
function enhanceDate(input) {
    if (input.dataset.uiManaged === 'true')
        return;
    const wrapper = document.createElement('span');
    wrapper.className = 'ui-date-control';
    wrapper.dataset.uiDateWrapper = 'true';
    input.dataset.uiManaged = 'true';
    input.classList.add('ui-date-native');
    input.insertAdjacentElement('beforebegin', wrapper);
    wrapper.append(input);
    const holder = document.createElement('div');
    holder.innerHTML = calendarMarkup(input);
    wrapper.append(...Array.from(holder.childNodes));
}
function closeAllSelectMenus(except) {
    document.querySelectorAll('[data-ui-select-wrapper]').forEach(wrapper => {
        if (wrapper === except)
            return;
        const menu = wrapper.querySelector('.ui-select-menu');
        const trigger = wrapper.querySelector('.ui-select-trigger');
        if (menu)
            menu.hidden = true;
        trigger?.setAttribute('aria-expanded', 'false');
    });
    document.querySelectorAll('.ui-date-popover:not([hidden])').forEach(popover => {
        if (except && popover.closest('[data-ui-date-wrapper]') === except)
            return;
        popover.hidden = true;
        popover.closest('[data-ui-date-wrapper]')?.querySelector('.ui-date-trigger')?.setAttribute('aria-expanded', 'false');
    });
}
function commitDate(input, nextDate) {
    const next = !nextDate ? '' : input.type === 'datetime-local' ? `${nextDate}T${timeValue(input.value)}` : nextDate;
    input.value = next;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    updateDate(input);
}
function installEvents() {
    if (installed)
        return;
    installed = true;
    document.addEventListener('click', event => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target)
            return;
        const selectTrigger = target.closest('[data-ui-select-trigger]');
        if (selectTrigger) {
            event.preventDefault();
            event.stopPropagation();
            const wrapper = selectTrigger.closest('[data-ui-select-wrapper]');
            if (!wrapper)
                return;
            const menu = wrapper.querySelector('.ui-select-menu');
            const show = selectTrigger.getAttribute('aria-expanded') !== 'true';
            closeAllSelectMenus(wrapper);
            if (menu)
                menu.hidden = !show;
            selectTrigger.setAttribute('aria-expanded', String(show));
            return;
        }
        const option = target.closest('[data-ui-select-option]');
        if (option) {
            event.preventDefault();
            event.stopPropagation();
            const wrapper = option.closest('[data-ui-select-wrapper]');
            const select = wrapper?.querySelector('select');
            if (!select || option.disabled)
                return;
            select.value = option.dataset.uiSelectOption ?? '';
            select.dispatchEvent(new Event('input', { bubbles: true }));
            select.dispatchEvent(new Event('change', { bubbles: true }));
            updateSelect(select);
            closeAllSelectMenus();
            wrapper?.querySelector('.ui-select-trigger')?.focus();
            return;
        }
        const dateToggle = target.closest('[data-ui-date-toggle]');
        if (dateToggle) {
            event.preventDefault();
            event.stopPropagation();
            const wrapper = dateToggle.closest('[data-ui-date-wrapper]');
            const input = wrapper?.querySelector('input.ui-date-native');
            if (!wrapper || !input)
                return;
            const popover = wrapper.querySelector('.ui-date-popover');
            const show = popover?.hidden ?? true;
            closeAllSelectMenus(wrapper);
            if (show) {
                const selectedDate = dateValue(input.value) ? toDate(dateValue(input.value)) : new Date();
                input.dataset.uiYear = String(selectedDate.getFullYear());
                input.dataset.uiMonth = String(selectedDate.getMonth());
                updateDate(input);
                wrapper.querySelector('.ui-date-popover').hidden = false;
                wrapper.querySelector('.ui-date-trigger')?.setAttribute('aria-expanded', 'true');
            }
            else {
                if (popover)
                    popover.hidden = true;
                dateToggle.setAttribute('aria-expanded', 'false');
            }
            return;
        }
        const navButton = target.closest('[data-ui-date-nav]');
        if (navButton) {
            event.preventDefault();
            const wrapper = navButton.closest('[data-ui-date-wrapper]');
            const input = wrapper?.querySelector('input.ui-date-native');
            if (!input)
                return;
            const selected = dateValue(input.value) ? toDate(dateValue(input.value)) : new Date();
            const month = Number(input.dataset.uiMonth ?? selected.getMonth()), year = Number(input.dataset.uiYear ?? selected.getFullYear());
            const next = new Date(year, month + Number(navButton.dataset.uiDateNav), 1, 12);
            input.dataset.uiMonth = String(next.getMonth());
            input.dataset.uiYear = String(next.getFullYear());
            updateDate(input);
            wrapper?.querySelector('.ui-date-popover')?.removeAttribute('hidden');
            wrapper?.querySelector('.ui-date-trigger')?.setAttribute('aria-expanded', 'true');
            return;
        }
        const dayButton = target.closest('[data-ui-date-day]');
        if (dayButton) {
            event.preventDefault();
            const wrapper = dayButton.closest('[data-ui-date-wrapper]');
            const input = wrapper?.querySelector('input.ui-date-native');
            if (!input)
                return;
            commitDate(input, dayButton.dataset.uiDateDay ?? '');
            input.dataset.uiYear = (dayButton.dataset.uiDateDay ?? '').slice(0, 4);
            input.dataset.uiMonth = String(Number((dayButton.dataset.uiDateDay ?? '').slice(5, 7)) - 1);
            wrapper?.querySelector('.ui-date-popover')?.setAttribute('hidden', '');
            wrapper?.querySelector('.ui-date-trigger')?.setAttribute('aria-expanded', 'false');
            return;
        }
        if (target.closest('[data-ui-date-clear]')) {
            const wrapper = target.closest('[data-ui-date-wrapper]');
            const input = wrapper?.querySelector('input.ui-date-native');
            if (input)
                commitDate(input, '');
            wrapper?.querySelector('.ui-date-popover')?.setAttribute('hidden', '');
            wrapper?.querySelector('.ui-date-trigger')?.setAttribute('aria-expanded', 'false');
            return;
        }
        if (target.closest('[data-ui-date-done]')) {
            const wrapper = target.closest('[data-ui-date-wrapper]');
            wrapper?.querySelector('.ui-date-popover')?.setAttribute('hidden', '');
            wrapper?.querySelector('.ui-date-trigger')?.setAttribute('aria-expanded', 'false');
            return;
        }
        if (!target.closest('[data-ui-select-wrapper],[data-ui-date-wrapper]'))
            closeAllSelectMenus();
    });
    document.addEventListener('change', event => {
        const target = event.target instanceof HTMLInputElement ? event.target : null;
        if (target?.matches('[data-ui-date-time]')) {
            const wrapper = target.closest('[data-ui-date-wrapper]');
            const input = wrapper?.querySelector('input.ui-date-native');
            if (input && dateValue(input.value)) {
                input.value = `${dateValue(input.value)}T${target.value || '09:00'}`;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                updateDate(input);
            }
        }
    });
    document.addEventListener('keydown', event => {
        const target = event.target instanceof HTMLElement ? event.target : null;
        if (!target)
            return;
        if (event.key === 'Escape') {
            const selectWrapper = target.closest('[data-ui-select-wrapper]');
            const dateWrapper = target.closest('[data-ui-date-wrapper]');
            closeAllSelectMenus();
            (selectWrapper?.querySelector('.ui-select-trigger') ?? dateWrapper?.querySelector('.ui-date-trigger'))?.focus();
            return;
        }
        if (target.matches('[data-ui-select-trigger]') && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
            event.preventDefault();
            const trigger = target;
            trigger.click();
            const wrapper = trigger.closest('[data-ui-select-wrapper]');
            const options = Array.from(wrapper?.querySelectorAll('[data-ui-select-option]') ?? []);
            const select = wrapper?.querySelector('select');
            const selected = options.findIndex(option => option.dataset.uiSelectOption === select?.value);
            options[Math.max(0, selected >= 0 ? selected : 0)]?.focus();
            return;
        }
        if (target.matches('[data-ui-select-option]')) {
            const options = Array.from(target.closest('[role="listbox"]')?.querySelectorAll('[data-ui-select-option]') ?? []);
            const index = options.indexOf(target);
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                options[(index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length]?.focus();
            }
            else if (event.key === 'Home') {
                event.preventDefault();
                options[0]?.focus();
            }
            else if (event.key === 'End') {
                event.preventDefault();
                options.at(-1)?.focus();
            }
            else if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                target.click();
            }
        }
    });
}
function scanControls(root) {
    if (root instanceof HTMLSelectElement && !root.matches('[data-ui-opt-out]'))
        enhanceSelect(root);
    if (root instanceof HTMLInputElement && root.matches('input[type="date"],input[type="datetime-local"]'))
        enhanceDate(root);
    root.querySelectorAll('select:not([data-ui-opt-out])').forEach(enhanceSelect);
    root.querySelectorAll('input[type="date"],input[type="datetime-local"]').forEach(enhanceDate);
}
export function enhanceControls(root = document) {
    installEvents();
    scanControls(root);
    if (!bodyObserver && typeof MutationObserver !== 'undefined' && document.body) {
        bodyObserver = new MutationObserver(records => { for (const record of records)
            for (const node of Array.from(record.addedNodes))
                if (node instanceof Element)
                    scanControls(node); });
        bodyObserver.observe(document.body, { childList: true, subtree: true });
    }
}
export function refreshControls(root = document) {
    root.querySelectorAll('select[data-ui-managed="true"]').forEach(updateSelect);
    root.querySelectorAll('input.ui-date-native').forEach(updateDate);
}
