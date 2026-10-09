const KEY = 'almazov.personalization.v1';
const INITIAL = {
    version: 1,
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
    return { id: value.id, title: value.title.slice(0, 180), subject: typeof value.subject === 'string' ? value.subject.slice(0, 180) : 'Без предмета', category, description: typeof value.description === 'string' ? value.description.slice(0, 500) : '', url: value.url, tags, helpfulness, createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString() };
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
            if (c && key.length <= 180)
                colors[key] = c;
        }
    return {
        version: 1,
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
        subjectColors: colors, tasks: taskRaw.map(normalizeTask).filter((x) => x !== null), materials: materialRaw.map(normalizeMaterial).filter((x) => x !== null)
    };
}
function migrateLegacy() {
    const base = { ...INITIAL, academicProfile: { ...INITIAL.academicProfile }, subjectColors: {}, tasks: [], materials: [] };
    try {
        const profile = JSON.parse(localStorage.getItem('almazov.profile') ?? 'null');
        if (plain(profile))
            base.academicProfile = { program: profile.program || base.academicProfile.program, course: (Number(profile.course) || 1), group: String(profile.group ?? base.academicProfile.group) };
    }
    catch { /* ignore corrupt previous data */ }
    try {
        const appearance = JSON.parse(localStorage.getItem('almazov.appearance') ?? 'null');
        if (plain(appearance)) {
            base.double1 = color(appearance.double1, base.double1);
            base.double2 = color(appearance.double2, base.double2);
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
    return base;
}
export function readPersonalization() {
    if (cache)
        return cache;
    try {
        const raw = localStorage.getItem(KEY);
        cache = raw ? normalize(JSON.parse(raw)) : migrateLegacy();
    }
    catch {
        cache = migrateLegacy();
    }
    try {
        localStorage.setItem(KEY, JSON.stringify(cache));
    }
    catch (error) {
        console.warn('Personalization settings could not be persisted', error);
    }
    return cache;
}
export function savePersonalization(next) {
    cache = normalize(next);
    try {
        localStorage.setItem(KEY, JSON.stringify(cache));
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
