const KEY = 'almazov.personalization.v1';
const MIGRATION_KEY = 'almazov.data.schemaVersion';
const MIGRATION_BACKUP_KEY = 'almazov.backup.personalization.pre-v2';
let migrationWriteSafe = true;
const INITIAL = {
    version: 2,
    academicProfile: { program: '31.05.01', course: 1, group: '123' },
    displayName: '', avatarPreset: '🎓', avatarDataUrl: '', accentColor: '#315fce',
    theme: 'system', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow',
    double1: '#315fce', double2: '#1f9073', subjectColors: {}, tasks: [], materials: []
};
let cache = null;
const color = (v, fallback) => typeof v === 'string' && /^#[\da-f]{6}$/i.test(v) ? v : fallback;
const plain = (v) => Boolean(v && typeof v === 'object' && !Array.isArray(v));
function normalizeTask(value) {
    if (!plain(value) || typeof value.id !== 'string' || typeof value.subject !== 'string' || typeof value.text !== 'string')
        return null;
    const status = value.status === 'todo' || value.status === 'in_progress' || value.status === 'done' ? value.status : value.done === true ? 'done' : 'todo';
    const priority = value.priority === 'low' || value.priority === 'high' || value.priority === 'medium' ? value.priority : 'medium';
    const validUrl = typeof value.link === 'string' && /^https?:\/\//i.test(value.link) ? value.link : undefined;
    return {
        ...value,
        id: value.id, subject: value.subject.slice(0, 180), text: value.text.slice(0, 4000), due: typeof value.due === 'string' ? value.due : undefined,
        done: status === 'done', status, priority, link: validUrl,
        attachmentName: typeof value.attachmentName === 'string' ? value.attachmentName.slice(0, 180) : undefined,
        attachmentData: typeof value.attachmentData === 'string' && value.attachmentData.length < 1_200_000 && /^data:[a-z0-9.+/-]+;base64,[a-z\d+/=]+$/i.test(value.attachmentData) ? value.attachmentData : undefined,
        program: (['31.05.01', '31.05.02', '37.05.01'].includes(String(value.program)) ? value.program : '31.05.01'),
        course: (Number.isInteger(value.course) && Number(value.course) >= 1 && Number(value.course) <= 6 ? Number(value.course) : 1),
        group: typeof value.group === 'string' ? value.group.slice(0, 40) : '',
        createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date(0).toISOString()
    };
}
function normalizeMaterial(value) {
    if (!plain(value) || typeof value.id !== 'string' || typeof value.title !== 'string' || typeof value.url !== 'string' || !/^https?:\/\//i.test(value.url))
        return null;
    const category = ['lecture', 'practice', 'lab', 'book', 'link'].includes(String(value.category)) ? value.category : 'link';
    const tags = Array.isArray(value.tags) ? value.tags.filter((tag) => typeof tag === 'string').map(tag => tag.trim().slice(0, 32)).filter(Boolean).slice(0, 8) : [];
    const helpfulness = Number.isInteger(value.helpfulness) && Number(value.helpfulness) >= 1 && Number(value.helpfulness) <= 5 ? Number(value.helpfulness) : undefined;
    return { ...value, id: value.id, title: value.title.slice(0, 180), subject: typeof value.subject === 'string' ? value.subject.slice(0, 180) : 'Без предмета', category, description: typeof value.description === 'string' ? value.description.slice(0, 500) : '', url: value.url, tags, helpfulness, createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString() };
}
function normalize(raw) {
    if (!plain(raw))
        return { ...INITIAL, academicProfile: { ...INITIAL.academicProfile }, subjectColors: {}, tasks: [], materials: [] };
    const ap = plain(raw.academicProfile) ? raw.academicProfile : {};
    const theme = raw.theme === 'light' || raw.theme === 'dark' || raw.theme === 'system' ? raw.theme : INITIAL.theme;
    const taskRaw = Array.isArray(raw.tasks) ? raw.tasks : [];
    const materialRaw = Array.isArray(raw.materials) ? raw.materials : [];
    const colors = {};
    if (plain(raw.subjectColors))
        for (const [key, value] of Object.entries(raw.subjectColors)) {
            const c = color(value, '');
            const normalizedKey = subjectColorKey(key);
            if (c && normalizedKey)
                colors[normalizedKey] = c;
        }
    const normalizedTasks = taskRaw.map(normalizeTask).filter((x) => x !== null);
    const normalizedMaterials = materialRaw.map(normalizeMaterial).filter((x) => x !== null);
    const swatches = ['#5478d4', '#138a72', '#bc674d', '#8567be', '#b18120', '#247eae', '#b14d7d', '#657c4e'];
    for (const subject of [...normalizedTasks.map(t => t.subject), ...normalizedMaterials.map(m => m.subject)]) {
        const key = subjectColorKey(subject);
        if (key && !colors[key]) {
            let seed = 0;
            for (const ch of key)
                seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
            colors[key] = swatches[seed % swatches.length];
        }
    }
    return {
        ...raw,
        version: 2,
        academicProfile: {
            program: (['31.05.01', '31.05.02', '37.05.01'].includes(String(ap.program)) ? ap.program : INITIAL.academicProfile.program),
            course: (Number.isInteger(ap.course) && Number(ap.course) >= 1 && Number(ap.course) <= 6 ? Number(ap.course) : INITIAL.academicProfile.course),
            group: typeof ap.group === 'string' ? ap.group.slice(0, 40) : INITIAL.academicProfile.group
        },
        displayName: typeof raw.displayName === 'string' ? raw.displayName.slice(0, 36) : '',
        avatarPreset: typeof raw.avatarPreset === 'string' && raw.avatarPreset.length < 16 ? raw.avatarPreset : INITIAL.avatarPreset,
        avatarDataUrl: typeof raw.avatarDataUrl === 'string' && /^data:image\/(?:webp|png|jpeg);base64,[a-z\d+/=]+$/i.test(raw.avatarDataUrl) && raw.avatarDataUrl.length < 160_000 ? raw.avatarDataUrl : '',
        accentColor: color(raw.accentColor, INITIAL.accentColor), theme,
        timezone: typeof raw.timezone === 'string' && raw.timezone.length < 80 ? raw.timezone : INITIAL.timezone,
        double1: color(raw.double1, INITIAL.double1), double2: color(raw.double2, INITIAL.double2),
        subjectColors: colors, tasks: normalizedTasks, materials: normalizedMaterials
    };
}
function migrateLegacy() {
    const base = { ...INITIAL, academicProfile: { ...INITIAL.academicProfile }, subjectColors: {}, tasks: [], materials: [] };
    try {
        const profile = JSON.parse(localStorage.getItem('almazov.profile') ?? 'null');
        if (plain(profile)) {
            base.academicProfile = { program: profile.program || base.academicProfile.program, course: (Number(profile.course) || 1), group: String(profile.group ?? base.academicProfile.group) };
            base.displayName = typeof profile.displayName === 'string' ? profile.displayName.slice(0, 36) : typeof profile.nickname === 'string' ? profile.nickname.slice(0, 36) : typeof profile.name === 'string' ? profile.name.slice(0, 36) : base.displayName;
            base.avatarPreset = typeof profile.avatarPreset === 'string' && profile.avatarPreset.length < 16 ? profile.avatarPreset : base.avatarPreset;
            base.avatarDataUrl = typeof profile.avatarDataUrl === 'string' && /^data:image\/(?:webp|png|jpeg);base64,[a-z\d+/=]+$/i.test(profile.avatarDataUrl) && profile.avatarDataUrl.length < 160_000 ? profile.avatarDataUrl : base.avatarDataUrl;
            base.accentColor = color(profile.accentColor, base.accentColor);
        }
    }
    catch { /* ignore corrupt previous data */ }
    try {
        const appearance = JSON.parse(localStorage.getItem('almazov.appearance') ?? 'null');
        if (plain(appearance)) {
            base.double1 = color(appearance.double1, base.double1);
            base.double2 = color(appearance.double2, base.double2);
            base.accentColor = color(appearance.accentColor, base.accentColor);
            if (plain(appearance.subjectColors))
                base.subjectColors = Object.fromEntries(Object.entries(appearance.subjectColors).filter((entry) => typeof entry[1] === 'string' && /^#[\da-f]{6}$/i.test(entry[1])).slice(0, 500));
        }
    }
    catch { /* ignore */ }
    const theme = localStorage.getItem('almazov.theme');
    if (theme === 'light' || theme === 'dark' || theme === 'system')
        base.theme = theme;
    base.timezone = localStorage.getItem('almazov.timezone') || base.timezone;
    try {
        const tasks = JSON.parse(localStorage.getItem('almazov.tasks.v2') ?? '[]');
        if (Array.isArray(tasks))
            base.tasks = tasks.map(normalizeTask).filter((x) => x !== null);
    }
    catch { /* ignore */ }
    try {
        const legacyMaterials = JSON.parse(localStorage.getItem('almazov.materials.v1') ?? localStorage.getItem('almazov.materials') ?? '[]');
        if (Array.isArray(legacyMaterials))
            base.materials = legacyMaterials.map(normalizeMaterial).filter((x) => x !== null);
    }
    catch { /* ignore malformed legacy materials; preserve the original key */ }
    return normalize(base);
}
export function readPersonalization() {
    if (cache)
        return cache;
    try {
        const raw = localStorage.getItem(KEY);
        if (raw) {
            // Back up the complete pre-v2 payload before normalization can discard malformed fields.
            // If quota prevents backup, keep the original key untouched rather than risking data loss.
            if (localStorage.getItem(MIGRATION_KEY) !== '2' && !localStorage.getItem(MIGRATION_BACKUP_KEY)) {
                try {
                    localStorage.setItem(MIGRATION_BACKUP_KEY, raw);
                }
                catch {
                    migrationWriteSafe = false;
                }
            }
            const parsed = JSON.parse(raw);
            cache = plain(parsed) ? normalize(parsed) : migrateLegacy();
        }
        else {
            cache = migrateLegacy();
        }
    }
    catch {
        cache = migrateLegacy();
    }
    if (migrationWriteSafe) {
        try {
            // Upgrade in place only after the old payload is backed up. Other legacy keys are never removed.
            localStorage.setItem(KEY, JSON.stringify(cache));
            localStorage.setItem(MIGRATION_KEY, '2');
        }
        catch (error) {
            console.warn('Personalization settings could not be persisted', error);
        }
    }
    else {
        console.warn('Personalization migration paused: the original data could not be backed up, so the source key was preserved.');
    }
    return cache;
}
export function savePersonalization(next) {
    if (!migrationWriteSafe)
        throw new Error('Данные старого профиля сохранены без изменений: не удалось создать резервную копию. Освободите место в хранилище браузера и перезагрузите страницу.');
    cache = normalize(next);
    try {
        localStorage.setItem(KEY, JSON.stringify(cache));
        localStorage.setItem(MIGRATION_KEY, '2');
    }
    catch (error) {
        throw new Error('Не удалось сохранить персонализацию. Уменьшите размер вложения или аватара.');
    }
    return cache;
}
export function updatePersonalization(patch) {
    return savePersonalization({ ...readPersonalization(), ...patch });
}
export function setAcademicProfile(profile) { updatePersonalization({ academicProfile: profile }); }
export function subjectColorKey(subject) { return subject.trim().normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/\s+/g, ' ').slice(0, 180); }
