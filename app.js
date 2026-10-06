const APP = {
  catalog: null,
  manual: null,
  kug: null,
  sources: null,
  live: null,
  state: {
    page: 'dashboard',
    program: '31.05.01',
    course: '1',
    group: '',
    type: 'all',
    scheduleSearch: '',
    weekOffset: 0,
    tasks: [],
    taskFilter: 'all',
    editingTaskId: '',
    double1: '#4b81da',
    double2: '#73e0c4',
    theme: 'dark'
  },
  days: ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'],
  monthFmt: new Intl.DateTimeFormat('ru-RU', {day:'numeric', month:'long'}),
  dateFmt: new Intl.DateTimeFormat('ru-RU', {weekday:'long', day:'numeric', month:'long'}),

  async init() {
    try {
      const [catalog, manual, kug, sources] = await Promise.all([
        this.fetchJson('data/catalog.json'),
        this.fetchJson('data/manual-specialist-schedules.json'),
        this.fetchJson('data/kug.json'),
        this.fetchJson('data/sources.json')
      ]);
      this.catalog = catalog;
      this.manual = manual;
      this.kug = kug;
      this.sources = sources;
      this.state.tasks = this.loadTasks();
      this.loadProfile();
      this.applyAppearance();
      this.hydrateSelectors();
      this.bind();
      this.goto(this.state.page || 'dashboard', true);
      this.setScheduleLoading(true);
      await this.loadLive(false);
      this.refreshCourseSelectors();
      this.setScheduleLoading(false);
      this.renderAll();
    } catch (err) {
      document.body.innerHTML = `<main class="fatal"><h1>Не удалось запустить Schedule Hub</h1><p>Проверьте, что файлы <code>data/*.json</code> доступны.</p><code>${this.esc(String(err))}</code></main>`;
      console.error(err);
    }
  },

  setScheduleLoading(active){
    const target=document.getElementById('desktopSchedule');
    const mobile=document.getElementById('mobileSchedule');
    [target,mobile].forEach(el=>{if(!el)return;el.setAttribute('aria-busy',String(!!active));if(active)el.innerHTML='<div class="schedule-loading"><span class="loading-spinner"></span><div><b>Проверяем расписание…</b><small>Подтягиваем свежий источник и сверяем группу, поток и дату.</small></div></div>';});
  },

  async fetchJson(url, timeout = 9000) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout) : null;
    try {
      const r = await fetch(url, {cache:'no-store', signal: ctrl?.signal});
      if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
      return await r.json();
    } finally {
      if (timer) clearTimeout(timer);
    }
  },

  async loadLive(forceRemote=false) {
    this.live = null;
    this.liveIndex = null;
    this.liveMode = '';
    const localUrl='data/live-index.json';
    const remoteUrl='https://raw.githubusercontent.com/R1vlFlow/Zalma/main/data/official-schedules.json';
    let localCandidate=null;

    const accept=(j,mode)=>{
      if(!this.isValidLive(j)) return false;
      this.live=j;this.liveMode=mode;this.buildLiveIndex();return true;
    };

    // Manual refresh: use the network first, but never lose a known-good snapshot.
    if(forceRemote){
      try{
        const remote=await this.fetchJson(remoteUrl,8500);
        if(accept(remote,'remote')){await this.saveLiveCache(remote);return remote;}
      }catch(_){ }
    }

    // CI/deployed local snapshot. Fresh snapshots are preferred for fast startup.
    try{
      const local=await this.fetchJson(localUrl,5000);
      if(this.isValidLive(local)){
        const generated=local.generatedAt?Date.parse(local.generatedAt):NaN;
        const fresh=Number.isFinite(generated)&&(Date.now()-generated)<8*3600000;
        if(fresh && accept(local,'local')) return local;
        localCandidate=local;
      }
    }catch(_){ }

    // Persistent cache is the next-best offline source.
    try{
      const cached=await this.readLiveCache();
      const payload=cached?.payload||cached;
      if(this.isValidLive(payload)){
        if(accept(payload,'idb-cache')) return payload;
      }
    }catch(_){ }

    // Stale local snapshot is safer than showing no schedule at all.
    if(localCandidate && accept(localCandidate,'local-stale')) return localCandidate;

    // Last network fallback for first install when no snapshot exists.
    try{
      const remote=await this.fetchJson(remoteUrl,7000);
      if(accept(remote,'remote')){await this.saveLiveCache(remote);return remote;}
    }catch(_){ }
    return null;
  },

  async saveLiveCache(j) {
    try {
      if(!('indexedDB' in window)) return;
      await new Promise((resolve,reject)=>{
        const req=indexedDB.open('almazov-schedule-cache-v2',1);
        req.onupgradeneeded=()=>req.result.createObjectStore('kv');
        req.onsuccess=()=>{
          const db=req.result,tx=db.transaction('kv','readwrite');
          tx.objectStore('kv').put({payload:j,savedAt:Date.now()},'live');
          tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};
        };
        req.onerror=()=>reject(req.error);
      });
    }catch(_){ }
  },

  async readLiveCache() {
    try {
      if(!('indexedDB' in window)) return null;
      return await new Promise((resolve,reject)=>{
        const req=indexedDB.open('almazov-schedule-cache-v2',1);
        req.onupgradeneeded=()=>req.result.createObjectStore('kv');
        req.onsuccess=()=>{
          const db=req.result,tx=db.transaction('kv','readonly'),get=tx.objectStore('kv').get('live');
          get.onsuccess=()=>{db.close();resolve(get.result||null);};get.onerror=()=>{db.close();reject(get.error);};
        };
        req.onerror=()=>reject(req.error);
      });
    }catch(_){return null;}
  },

  isValidLive(j) {
    if(!j || Number(j.schemaVersion)!==7 || !j.courses || typeof j.courses!=='object') return false;
    return Object.values(j.courses).every(c=>c && Array.isArray(c.groups) && Array.isArray(c.events));
  },

  esc(v) {
    return String(v ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  },

  safeUrl(v,fallback='#'){const raw=String(v||'').trim();try{const u=new URL(raw,typeof location!=='undefined'?location.href:'https://almazov.local/');if(!['http:','https:'].includes(u.protocol))return fallback;return u.href;}catch(_){return fallback;}},

  loadTasks() {
    try {
      const j = JSON.parse(localStorage.getItem('almazov_hub_tasks_v3') || '[]');
      return Array.isArray(j) ? j.filter(t => t && typeof t === 'object' && t.id) : [];
    } catch (_) { return []; }
  },
  saveTasks() { localStorage.setItem('almazov_hub_tasks_v3', JSON.stringify(this.state.tasks)); },

  loadProfile() {
    try {
      const saved = JSON.parse(localStorage.getItem('almazov_hub_profile_v3') || localStorage.getItem('almazov_hub_profile_v2') || '{}');
      if (saved && typeof saved === 'object') {
        const allowed = ['program','course','group','double1','double2','theme'];
        for (const k of allowed) if (saved[k] != null) this.state[k] = String(saved[k]);
      }
    } catch (_) {}
    const theme = localStorage.getItem('almazov_hub_theme');
    if (theme === 'light' || theme === 'dark') this.state.theme = theme;
  },

  saveProfile() {
    localStorage.setItem('almazov_hub_profile_v3', JSON.stringify({
      program:this.state.program, course:this.state.course, group:this.state.group,
      double1:this.safeColor(this.state.double1, '#4b81da'),
      double2:this.safeColor(this.state.double2, '#73e0c4'), theme:this.state.theme
    }));
  },
  safeColor(v, fallback) { return /^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v) : fallback; },

  getProgram() { return this.catalog?.programs?.find(p => p.id === this.state.program) || null; },
  getCourseData() {
    const p = this.getProgram();
    if (!p) return null;
    if (p.id === '31.05.01') return this.live?.courses?.[String(this.state.course)] || null;
    return this.manual?.programs?.[p.id]?.courses?.[String(this.state.course)] || null;
  },
  getGroups() { return this.getCourseData()?.groups || []; },
  groupMatches(candidate, selected) {
    const a=this.groupToken(candidate),b=this.groupToken(selected);
    if(!a||!b)return false;
    return a===b||a==='ALL'||a==='*';
  },

  normalizeStream(v){
    let s=String(v??'').trim().toUpperCase().replace(/\s+/g,'');
    s=s.replace(/^ПОТОК|^STREAM|^FLOW/,'').replace(/Б/g,'B').replace(/А/g,'A');
    return s.replace(/[^A-Z0-9А-ЯЁ]/g,'');
  },
  groupToken(v){
    return String(v??'').trim().toUpperCase().replace(/^ГРУППА/,'').replace(/\s+/g,'').replace(/КП$/,'');
  },
  selectedStream(c, group=this.state.group){
    const target=String(group||'').trim();
    if(!target || !c?.streams || typeof c.streams!=='object') return '';
    const matches=[];
    for(const [stream, rawGroups] of Object.entries(c.streams)){
      const groups=Array.isArray(rawGroups)?rawGroups:(rawGroups?.groups||[]);
      if(groups.some(g=>this.groupMatches(g,target))) matches.push(this.normalizeStream(stream));
    }
    return matches.length===1?matches[0]:'';
  },
  eventBelongsToGroup(e,c){
    const selected=this.state.group;
    if(!selected) return false;
    const candidates=this.eventCandidates(e);
    const unscoped=candidates.length===0;
    const globalEvent=unscoped && (e.audience==='ALL'||e.scope==='all'||e.forAll===true);
    const groupOk=globalEvent || candidates.some(g=>this.groupMatches(g,selected));
    if(!groupOk) return false;
    const stream=this.selectedStream(c,selected);
    const eventStream=this.normalizeStream(e.stream??e.streamCode??e.flow??'');
    const streamRegistry=!!(c?.streams && typeof c.streams==='object' && Object.keys(c.streams).length);
    if(eventStream && streamRegistry && !stream) return false;
    if(eventStream && stream && eventStream!==stream) return false;
    if(eventStream && candidates.length && candidates.every(g=>['ALL','*',''].includes(String(g).trim().toUpperCase())) && stream && eventStream!==stream) return false;
    return true;
  },
  normalizeType(v){
    const raw=String(v??'').trim().toLowerCase();
    if(['lecture','lect','лекция','лекционный','лекции'].includes(raw) || raw.includes('лекц')) return 'lecture';
    if(['practice','пз','практика','практическое','семинар','seminar','practiceclass'].includes(raw) || raw.includes('практик') || raw.includes('семинар')) return 'practice';
    if(['exam','зачет','зачёт','экзамен','контроль','аттестация','test','credit'].includes(raw) || raw.includes('экзам') || raw.includes('зачет') || raw.includes('зачёт') || raw.includes('контрол') || raw.includes('аттест')) return 'assessment';
    return '';
  },

  hydrateSelectors() {
    const ids = ['31.05.01','31.05.02','37.05.01'];
    const programs = this.catalog.programs.filter(p => ids.includes(p.id));
    const html = programs.map(p => `<option value="${this.esc(p.id)}">${this.esc(p.name)} · ${this.esc(p.id)}</option>`).join('');
    for (const id of ['programSelect','modalProgram']) document.getElementById(id).innerHTML = html;
    if (!programs.some(p => p.id === this.state.program)) this.state.program = programs[0].id;
    document.getElementById('programSelect').value = this.state.program;
    document.getElementById('modalProgram').value = this.state.program;
    this.refreshCourseSelectors();
  },

  refreshCourseSelectors() {
    const p = this.getProgram();
    const years = Number(p?.years || 6);
    const courseOpts = Array.from({length:years}, (_,i) => String(i+1)).map(c => {
      const available = p?.id === '31.05.01' ? !!this.live?.courses?.[c] : !!this.manual?.programs?.[p.id]?.courses?.[c];
      return `<option value="${c}" ${available ? '' : 'data-unavailable="1"'}>${c} курс${available ? '' : ' · нет данных в snapshot'}</option>`;
    }).join('');
    for (const id of ['courseSelect','modalCourse']) document.getElementById(id).innerHTML = courseOpts;
    if (!Array.from({length:years},(_,i)=>String(i+1)).includes(String(this.state.course))) this.state.course='1';
    for (const id of ['courseSelect','modalCourse']) document.getElementById(id).value=this.state.course;
    this.refreshGroups();
  },

  refreshGroups() {
    const groups = this.getGroups();
    const placeholder = groups.length ? 'Выберите группу' : 'Нет опубликованного списка групп';
    const html = `<option value="">${placeholder}</option>` + groups.map(g => `<option value="${this.esc(g)}">${this.esc(g)}</option>`).join('');
    for (const id of ['groupSelect','modalGroup']) document.getElementById(id).innerHTML=html;
    if (!groups.includes(this.state.group)) this.state.group='';
    for (const id of ['groupSelect','modalGroup']) document.getElementById(id).value=this.state.group;
    this.updateSyncLabel();
  },

  updateSyncLabel() {
    const p=this.getProgram();
    const el=document.getElementById('syncLabel');
    const dot=document.querySelector('.status-dot');
    if (!el) return;
    if (p?.id==='31.05.01' && this.live) {
      const labels={remote:'live',local:'snapshot', 'local-stale':'старый snapshot','idb-cache':'кэш'};
      el.textContent=`ЛД · ${labels[this.liveMode]||'проверено'} ${this.live.generatedAt?.slice(0,10) || 'проверено'}`;
      if (dot) dot.classList.toggle('warning', this.liveMode==='idb-cache'||this.liveMode==='local-stale');
    } else if (p?.id==='31.05.02' && this.state.course==='2') {
      el.textContent='Педиатрия · ПЗ опубликованы · лекции на проверке';
      dot?.classList.add('warning');
    } else {
      el.textContent=`${p?.short || 'Официальный слой'} · snapshot`;
      dot?.classList.remove('warning');
    }
  },

  bind() {
    document.getElementById('mainNav').addEventListener('click', e => { const b=e.target.closest('button[data-page]'); if (b) this.goto(b.dataset.page); });
    document.addEventListener('click', e => {
      const page=e.target.closest('[data-page-link]'); if(page){e.preventDefault();this.goto(page.dataset.pageLink);return;}
      const a=e.target.closest('[data-action]'); if(a){this.action(a.dataset.action,a);return;}
      const task=e.target.closest('[data-task-id]'); if(task && !e.target.closest('button')) return;
    });
    document.getElementById('programSelect').onchange=e=>this.changeContext('program',e.target.value);
    document.getElementById('courseSelect').onchange=e=>this.changeContext('course',e.target.value);
    document.getElementById('groupSelect').onchange=e=>this.changeContext('group',e.target.value);
    document.getElementById('modalProgram').onchange=e=>{this.state.program=e.target.value;this.state.course='1';this.state.group='';this.refreshCourseSelectors();};
    document.getElementById('modalCourse').onchange=e=>{this.state.course=e.target.value;this.state.group='';this.refreshGroups();};
    document.getElementById('modalGroup').onchange=e=>{this.state.group=e.target.value;};
    document.getElementById('double1').oninput=e=>{this.state.double1=this.safeColor(e.target.value,'#4b81da');this.applyAppearance();};
    document.getElementById('double2').oninput=e=>{this.state.double2=this.safeColor(e.target.value,'#73e0c4');this.applyAppearance();};
    document.getElementById('typeFilter').addEventListener('click',e=>{const b=e.target.closest('button[data-type]');if(!b)return;this.state.type=b.dataset.type;document.querySelectorAll('#typeFilter button').forEach(x=>x.classList.toggle('active',x===b));this.renderSchedule();});
    document.getElementById('scheduleSearch')?.addEventListener('input',e=>{this.state.scheduleSearch=e.target.value;this.renderSchedule();});
    document.getElementById('weekStrip')?.addEventListener('click',e=>{const b=e.target.closest('[data-scroll-day]');if(!b)return;document.getElementById(`agenda-${b.dataset.scrollDay}`)?.scrollIntoView({behavior:'smooth',block:'start'});});
    document.getElementById('taskFilter').addEventListener('click',e=>{const b=e.target.closest('button[data-task-filter]');if(!b)return;this.state.taskFilter=b.dataset.taskFilter;document.querySelectorAll('#taskFilter button').forEach(x=>x.classList.toggle('active',x===b));this.renderTasks();});
    window.addEventListener('keydown',e=>{if(e.key==='Escape'){this.closeModal('profileModal');this.closeModal('taskModal');}});
    for (const id of ['profileModal','taskModal']) document.getElementById(id).addEventListener('click',e=>{if(e.target.id===id)this.closeModal(id);});
    const file=document.getElementById('taskImport'); file?.addEventListener('change',e=>this.importTasks(e.target.files?.[0]));
  },

  applyAppearance() {
    document.documentElement.dataset.theme=this.state.theme==='light'?'light':'dark';
    document.documentElement.style.setProperty('--double1',this.safeColor(this.state.double1,'#4b81da'));
    document.documentElement.style.setProperty('--double2',this.safeColor(this.state.double2,'#73e0c4'));
    const d1=document.getElementById('double1'),d2=document.getElementById('double2');
    if(d1)d1.value=this.safeColor(this.state.double1,'#4b81da');
    if(d2)d2.value=this.safeColor(this.state.double2,'#73e0c4');
  },

  async changeContext(k,v) {
    this.state[k]=v;
    if(k==='program'){this.state.course='1';this.state.group='';this.refreshCourseSelectors();}
    if(k==='course'){this.state.group='';this.refreshGroups();}
    if(k==='group') this.refreshGroups();
    this.state.weekOffset=0; this.state.scheduleSearch=''; const q=document.getElementById('scheduleSearch');if(q)q.value=''; this.saveProfile(); this.renderAll();
  },

  goto(page,initial=false){
    this.state.page=page;
    document.querySelectorAll('.page').forEach(x=>x.classList.toggle('active',x.id===`page-${page}`));
    document.querySelectorAll('#mainNav button').forEach(x=>x.classList.toggle('active',x.dataset.page===page));
    const titles={dashboard:['Главная','Обзор'],schedule:['Расписание','Учебная неделя'],homework:['ДЗ и задачи','Личный контур'],kug:['КУГ','Календарный график'],resources:['Материалы','Источники'],faculties:['Факультеты','Структура ИМО']};
    document.getElementById('pageCrumb').textContent=titles[page]?.[0]||page;
    document.getElementById('pageTitle').textContent=titles[page]?.[1]||'';
    if(!initial)document.querySelector('.sidebar')?.classList.remove('open');
    this.renderAll();
  },

  action(a,el){
    switch(a){
      case 'toggle-menu':{const side=document.querySelector('.sidebar'),btn=document.querySelector('.mobile-menu');const open=side.classList.toggle('open');btn?.setAttribute('aria-expanded',String(open));break;}
      case 'today':this.state.weekOffset=0;this.goto('schedule');break;
      case 'prev-week':this.state.weekOffset--;this.renderSchedule();break;
      case 'next-week':this.state.weekOffset++;this.renderSchedule();break;
      case 'profile':this.openModal('profileModal');break;
      case 'settings':this.openModal('profileModal');break;
      case 'theme':this.state.theme=this.state.theme==='dark'?'light':'dark';localStorage.setItem('almazov_hub_theme',this.state.theme);this.applyAppearance();this.saveProfile();break;
      case 'close-modal':this.closeModal('profileModal');break;
      case 'close-task':this.closeModal('taskModal');break;
      case 'save-profile':this.saveProfile();this.closeModal('profileModal');this.renderAll();break;
      case 'add-task':this.openTask();break;
      case 'save-task':this.saveTask();break;
      case 'print-schedule':window.print();break;
      case 'export-ics':this.exportIcs();break;
      case 'share-week':this.shareWeek();break;
      case 'refresh-data':this.refreshData();break;
      case 'export-tasks':this.exportTasks();break;
      case 'import-tasks':document.getElementById('taskImport')?.click();break;
      case 'edit-task':this.openTask(el?.dataset.taskId || '');break;
      case 'delete-task':this.deleteTask(el?.dataset.taskId || '');break;
      case 'toggle-task':this.toggleTask(el?.dataset.taskId || '');break;
      case 'pick-program':this.state.program=el?.dataset.program||this.state.program;this.state.course='1';this.state.group='';this.refreshCourseSelectors();this.saveProfile();this.goto('schedule');break;
    }
  },

  async refreshData(){
    const btn=document.querySelector('[data-action="refresh-data"]');
    if(btn){btn.disabled=true;btn.classList.add('loading');}
    await this.loadLive(true); this.updateSyncLabel(); this.renderAll();
    if(btn){btn.disabled=false;btn.classList.remove('loading');}
  },

  openModal(id){const m=document.getElementById(id);if(!m)return;m.classList.add('open');m.setAttribute('aria-hidden','false');setTimeout(()=>m.querySelector('select,input,textarea,button')?.focus(),0);},
  closeModal(id){const m=document.getElementById(id);if(!m)return;m.classList.remove('open');m.setAttribute('aria-hidden','true');},

  openTask(id=''){
    this.state.editingTaskId=id;
    const t=id?this.state.tasks.find(x=>x.id===id):null;
    document.getElementById('taskModalTitle').textContent=t?'Редактировать задание':'Новое задание';
    document.getElementById('taskSubject').value=t?.subject||'';
    document.getElementById('taskText').value=t?.text||'';
    document.getElementById('taskDate').value=t?.due||this.dateKey(new Date());
    document.getElementById('taskNotice').textContent='';
    this.openModal('taskModal');
  },
  saveTask(){
    const subject=document.getElementById('taskSubject').value.trim();
    const text=document.getElementById('taskText').value.trim();
    const due=this.normalizeDate(document.getElementById('taskDate').value);
    const notice=document.getElementById('taskNotice');
    if(!subject||!text||!due){notice.textContent='Заполните предмет, задание и дедлайн.';return;}
    const id=this.state.editingTaskId;
    if(id){
      const t=this.state.tasks.find(x=>x.id===id); if(t)Object.assign(t,{subject,text,due});
    } else {
      this.state.tasks.unshift({id:`t_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,program:this.state.program,course:this.state.course,group:this.state.group,subject,text,due,done:false,createdAt:new Date().toISOString()});
    }
    this.saveTasks();this.closeModal('taskModal');this.renderTasks();
  },
  toggleTask(id){const t=this.state.tasks.find(x=>x.id===id);if(t){t.done=!t.done;this.saveTasks();this.renderTasks();}},
  deleteTask(id){const t=this.state.tasks.find(x=>x.id===id);if(!t)return;if(!window.confirm(`Удалить «${t.subject}»?`))return;this.state.tasks=this.state.tasks.filter(x=>x.id!==id);this.saveTasks();this.renderTasks();},

  exportTasks(){
    const blob=new Blob([JSON.stringify(this.state.tasks,null,2)],{type:'application/json'});
    this.downloadBlob(blob,'almazov-dz-backup.json');
  },
  importTasks(file){
    const input=document.getElementById('taskImport');
    if(!file)return;
    const reader=new FileReader();
    reader.onload=()=>{
      try{
        const parsed=JSON.parse(reader.result);
        if(!Array.isArray(parsed))throw new Error('Ожидается массив заданий');
        const valid=parsed.filter(t=>t&&t.id&&t.subject&&t.text&&this.normalizeDate(t.due)).map(t=>({id:String(t.id),program:String(t.program||this.state.program),course:String(t.course||this.state.course),group:String(t.group||''),subject:String(t.subject),text:String(t.text),due:String(t.due),done:Boolean(t.done)}));
        const map=new Map(this.state.tasks.map(t=>[String(t.id),t]));
        valid.forEach(t=>map.set(t.id,t));
        this.state.tasks=[...map.values()];this.saveTasks();this.renderTasks();
      }catch(err){window.alert(`Не удалось импортировать ДЗ: ${err.message}`);}
      finally{if(input)input.value='';}
    };
    reader.readAsText(file);
  },
  downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);},

  dateKey(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;},
  monday(d){const x=new Date(d);x.setHours(12,0,0,0);const day=(x.getDay()+6)%7;x.setDate(x.getDate()-day+this.state.weekOffset*7);return x;},
  weekNumberForDate(d){const start=new Date(2026,7,31,12);const x=new Date(d);x.setHours(12,0,0,0);return Math.floor((x-start)/604800000)+1;},
  expandWeeks(spec){
    const out=[];for(const raw of String(spec||'').replace(/[–—]/g,'-').split(',')){const s=raw.trim();if(!s)continue;if(/^\d+\s*-\s*\d+$/.test(s)){let [a,b]=s.split('-').map(v=>Number(v.trim()));if(a>b)[a,b]=[b,a];for(let i=a;i<=b;i++)out.push(i);}else if(/^\d+$/.test(s))out.push(Number(s));}
    return [...new Set(out)].filter(n=>n>=1&&n<=52).sort((a,b)=>a-b);
  },
  normalizeDate(v){const s=String(v||'');return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';},
  dateForWeek(weekStart,weekNumber,weekday0){
    if(this.normalizeDate(weekStart)){const d=new Date(`${weekStart}T12:00:00`);d.setDate(d.getDate()+Number(weekday0||0));return this.dateKey(d);}
    const wn=Number(weekNumber);if(!Number.isInteger(wn)||wn<1||wn>52)return '';
    const d=new Date(2026,7,31,12);d.setDate(d.getDate()+(wn-1)*7+Number(weekday0||0));return this.dateKey(d);
  },
  normalizeTime(v){const m=/^(\d{1,2})[:.](\d{2})$/.exec(String(v??'').trim());if(!m)return '';const h=Number(m[1]),min=Number(m[2]);return h>=0&&h<=23&&min>=0&&min<=59?`${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`:'';},
  timeToMin(v){const n=this.normalizeTime(v);if(!n)return -1;const [h,m]=n.split(':').map(Number);return h*60+m;},

  manualRuleEvents(){
    const c=this.getCourseData();if(!c||!this.state.group)return [];
    const rules=[...(c.lectureRules||[]),...(c.practiceRules||[])];const out=[];
    for(const r of rules){
      const groups=r.groups||c.groups||[];
      if(!groups.some(g=>this.groupMatches(g,this.state.group)))continue;
      const weekdayRaw=Number(r.weekday);
      if(!Number.isInteger(weekdayRaw)||weekdayRaw<1||weekdayRaw>7)continue;
      const weekday0=weekdayRaw-1;
      for(const week of this.expandWeeks(r.weeks)){
        const date=this.dateForWeek('',week,weekday0);if(!date)continue;
        out.push({id:`manual:${this.state.program}:${this.state.course}:${this.state.group}:${weekday0}:${r.start}:${r.end}:${week}:${r.subject}`,date,weekday:weekday0,start:this.normalizeTime(r.start),end:this.normalizeTime(r.end),subject:r.subject,location:r.location||'',lessonType:r.lessonType==='lecture'?'lecture':'practice',weekNumber:week,doubleIndex:r.doubleIndex||'',doubleOf:r.doubleOf||'',sourceUrl:c.sources?.[r.lessonType==='lecture'?'lecture':'practice']||''});
      }
    }
    return this.dedupeEvents(out);
  },

  eventCandidates(e){
    if(Array.isArray(e.groups)&&e.groups.length)return [...new Set(e.groups.flatMap(v=>String(v).split(/[,;]+/).map(x=>x.trim()).filter(Boolean)))];
    const raw=String(e.group??e.groupName??'');
    return raw? [...new Set(raw.split(/[,;]+/).map(x=>x.trim()).filter(Boolean))]:[];
  },
  buildLiveIndex(){
    this.liveIndex={};
    for(const [courseId,c] of Object.entries(this.live?.courses||{})){
      const byGroup=new Map(),byStream=new Map(),generic=[];
      const add=(map,key,e)=>{if(!key)return;const arr=map.get(key)||[];arr.push(e);map.set(key,arr);};
      for(const e of (c.events||[])){
        const candidates=this.eventCandidates(e);
        const wild=candidates.length===0||candidates.every(g=>['ALL','*',''].includes(String(g).trim().toUpperCase()));
        const stream=this.normalizeStream(e.stream??e.streamCode??e.flow??'');
        if(!wild){for(const g of candidates){const token=this.groupToken(g);if(token&&!['ALL','*'].includes(token))add(byGroup,token,e);}}
        else if(stream)add(byStream,stream,e);
        else generic.push(e);
      }
      this.liveIndex[courseId]={byGroup,byStream,generic};
    }
  },
  rawLiveCandidates(c){
    const idx=this.liveIndex?.[String(this.state.course)];
    if(!idx)return c?.events||[];
    const out=[];const seen=new Set();const push=(arr)=>{for(const e of (arr||[])){const key=e.id||e.eventId||JSON.stringify([e.date,e.start,e.end,e.subject,e.group,e.stream]);if(seen.has(key))continue;seen.add(key);out.push(e);}};
    push(idx.byGroup.get(this.groupToken(this.state.group)));
    const stream=this.selectedStream(c,this.state.group);if(stream)push(idx.byStream.get(stream));
    push(idx.generic.filter(e=>e?.audience==='ALL'||e?.scope==='all'||e?.forAll===true));
    return out;
  },

  liveEvents(){
    const p=this.getProgram(),c=this.getCourseData();if(!p||!c||!this.state.group)return [];
    const raw=this.rawLiveCandidates(c).filter(e=>this.eventBelongsToGroup(e,c) && String(e.course??this.state.course)===String(this.state.course));
    return this.dedupeEvents(raw.map(e=>{
      const date=this.normalizeDate(e.date)||this.dateForWeek(e.weekStart,e.weekNumber,Number(e.weekday)||0);
      const weekday=this.dateToWeekday(date,Number(e.weekday)||0);
      const lessonType=this.normalizeType(e.type??e.lessonType);
      const computedWeek=date?this.weekNumberForDate(new Date(`${date}T12:00:00`)):0;
      return {id:e.id||e.eventId||'',date,weekday,start:this.normalizeTime(e.start||e.timeStart||''),end:this.normalizeTime(e.end||e.timeEnd||''),subject:String(e.subject||e.name||'Без названия').trim(),location:String(e.location||e.room||'').trim(),lessonType,weekNumber:computedWeek>0?computedWeek:(Number(e.weekNumber)||0),doubleIndex:e.doubleIndex||e.split||e.part||'',doubleOf:e.doubleOf||'',stream:this.normalizeStream(e.stream??e.streamCode??e.flow??''),sourceUrl:e.sourceUrl||p?.liveIndex||''};
    }));
  },

  dateToWeekday(date,fallback=0){if(!this.normalizeDate(date))return Math.max(0,Math.min(6,Number(fallback)||0));const d=new Date(`${date}T12:00:00`);return (d.getDay()+6)%7;},
  eventIsValid(e){return this.normalizeDate(e.date)&&Number.isInteger(e.weekday)&&e.weekday>=0&&e.weekday<=6&&['lecture','practice','assessment'].includes(e.lessonType)&&this.timeToMin(e.start)>=0&&this.timeToMin(e.end)>this.timeToMin(e.start)&&String(e.subject||'').trim();},
  semanticText(v){return String(v??'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');},
  dedupeEvents(events){
    const seen=new Set();
    return events.filter(e=>{
      if(!this.eventIsValid(e))return false;
      const semantic=[e.date,e.start,e.end,this.semanticText(e.subject),this.semanticText(e.location),e.lessonType,e.doubleIndex||'',e.doubleOf||''].join('|');
      if(seen.has(semantic))return false;seen.add(semantic);return true;
    }).sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start)||a.lessonType.localeCompare(b.lessonType)||a.subject.localeCompare(b.subject,'ru'));
  },
  eventsForCurrentGroup(){const p=this.getProgram();return !p||!this.state.group?[]:this.dedupeEvents(p.id==='31.05.01'?this.liveEvents():this.manualRuleEvents());},
  filterWeek(events){
    const monday=this.monday(new Date());
    const startKey=this.dateKey(monday),endDate=new Date(monday);endDate.setDate(endDate.getDate()+6);
    const endKey=this.dateKey(endDate);
    const q=String(this.state.scheduleSearch||'').trim().toLocaleLowerCase('ru-RU');
    return events.filter(e=>e.date>=startKey&&e.date<=endKey&&(this.state.type==='all'||e.lessonType===this.state.type)&&(!q||[e.subject,e.location,e.stream].some(v=>String(v||'').toLocaleLowerCase('ru-RU').includes(q))));
  },

  syncSelectorValues(){for(const id of ['programSelect','courseSelect','groupSelect','modalProgram','modalCourse','modalGroup']){const el=document.getElementById(id);if(el)el.value=this.state[id==='programSelect'||id==='modalProgram'?'program':id==='courseSelect'||id==='modalCourse'?'course':'group'];}} ,
  renderAll(){this.syncSelectorValues();this.renderContext();this.renderCoverage();this.renderDashboard();this.renderSchedule();this.renderTasks();this.renderKug();this.renderResources();this.renderFaculties();this.updateSyncLabel();},
  renderContext(){
    const p=this.getProgram(),f=this.catalog?.faculties?.find(x=>x.id===p?.faculty);
    document.getElementById('ctxProgram').textContent=p?.name||'—';document.getElementById('ctxCourse').textContent=this.state.course?`${this.state.course} курс`:'—';document.getElementById('ctxGroup').textContent=this.state.group||'—';document.getElementById('ctxFaculty').textContent=f?.name||'—';
    document.getElementById('selectionTitle').textContent=this.state.group?`${p.name} · ${this.state.group}`:'Группа не выбрана';
    document.getElementById('selectionSource').textContent=p?.id==='31.05.01'&&this.live?'LIVE':'OFFICIAL SNAPSHOT';
    document.getElementById('profileAvatar').textContent=(this.state.group||'И')[0];document.getElementById('profileName').textContent=this.state.group?`Группа ${this.state.group}`:'Студент';document.getElementById('profileMeta').textContent=p?`${p.short} · ${this.state.course} курс${this.selectedStream(this.getCourseData(),this.state.group)?` · поток ${this.selectedStream(this.getCourseData(),this.state.group)}`:''}`:'Настройте группу';
  },
  renderCoverage(){
    const programs=this.catalog.programs.filter(p=>['31.05.01','31.05.02','37.05.01'].includes(p.id));
    document.getElementById('coverageGrid').innerHTML=programs.map(p=>{const c=p.coverage||{};return `<article class="coverage-card"><div class="coverage-code">${this.esc(p.id)}</div><h3>${this.esc(p.name)}</h3><p>${p.id==='31.05.01'&&this.live?'Live JSON · schema 7':this.esc(c.note||'Официальные PDF-источники')}</p><div class="coverage-meta"><span>${this.esc(c.courses||'—')} курсы</span><span class="coverage-status ${c.mode==='live'?'ok':'snapshot'}">${c.mode==='live'?'LIVE':'SNAPSHOT'}</span></div></article>`;}).join('');
  },
  renderDashboard(){
    const monday=this.monday(new Date()),today=new Date(),current=this.eventsForCurrentGroup(),ev=current.filter(e=>e.date===this.dateKey(today));
    document.getElementById('dashTodayTitle').textContent=this.dateFmt.format(today).replace(/^./,c=>c.toUpperCase());document.getElementById('dashCount').textContent=`${ev.length} ${ev.length===1?'пара':'пар'}`;
    document.getElementById('dashLessons').innerHTML=ev.length?ev.map(e=>this.lessonHtml(e)).join(''):`<div class="empty-panel"><b>${this.state.group?'Сегодня занятий нет':'Сначала выберите группу'}</b><span>${this.state.group?'Откройте всю неделю для проверки.':'Сервис не подставляет группу автоматически.'}</span></div>`;
    document.getElementById('dashWeekTitle').textContent=`${this.monthFmt.format(monday)} — ${this.monthFmt.format(new Date(monday.getTime()+6*86400000))}`;
    const mini=[];for(let i=0;i<7;i++){const d=new Date(monday);d.setDate(d.getDate()+i);const key=this.dateKey(d),n=current.filter(e=>e.date===key).length;mini.push(`<button class="mini-day ${key===this.dateKey(today)?'current':''}" data-page-link="schedule" aria-label="${this.days[i]}, ${key}"><b>${this.days[i]}</b><span>${n?`${n} пар`:'—'}</span></button>`);}document.getElementById('miniWeek').innerHTML=mini.join('');
  },
  lessonHtml(e){const split=e.doubleIndex?`<span class="split-badge split-${this.esc(String(e.doubleIndex).replace('/','-'))}">${this.esc(e.doubleIndex)}</span>`:'';const type=e.lessonType==='lecture'?'Лекция':e.lessonType==='assessment'?'Контроль':'ПЗ';return `<div class="lesson"><div class="lesson-time">${this.esc(e.start)}<small>${this.esc(e.end)}</small></div><div class="lesson-main"><b>${this.esc(e.subject)}</b><small>${this.esc(e.location||'Аудитория уточняется')}</small></div><div class="lesson-meta">${split}<span class="lesson-type">${type}</span></div></div>`;},

  renderSchedule(){
    const p=this.getProgram(),c=this.getCourseData(),allEvents=this.eventsForCurrentGroup(),events=this.filterWeek(allEvents),monday=this.monday(new Date()),weekN=this.weekNumberForDate(monday),todayKey=this.dateKey(new Date());
    document.getElementById('weekLabel').textContent=`${this.monthFmt.format(monday)} — ${this.monthFmt.format(new Date(monday.getTime()+6*86400000))}`;
    const stream=this.selectedStream(c,this.state.group);
    document.getElementById('weekSubLabel').textContent=`Учебная неделя №${weekN} · ${p?.name||''} · ${this.state.group||'группа не выбрана'}${stream?` · поток ${stream}`:''}`;
    const desktop=document.getElementById('desktopSchedule'),mobile=document.getElementById('mobileSchedule');
    const countEl=document.getElementById('scheduleCount');if(countEl)countEl.textContent=`${events.length} ${events.length===1?'пара':'пар'}`;
    const empty=!this.state.group?'no-group':(!c||!allEvents.length?'no-events':(!events.length?'no-filter':''));
    if(empty){
      const data=empty==='no-group'?['⌕','Выберите группу','Сначала укажите программу, курс и группу. Чужое расписание никогда не подставляется автоматически.']:empty==='no-filter'?['⌕','Ничего не найдено','Снимите фильтр типа или измените поисковый запрос.']:empty==='no-events'?['✓','Занятий не найдено','Для этой группы в проверенном источнике нет занятий на выбранной неделе. Проверьте соседние недели или официальный источник.']:['○','Для этого курса нет проверенного расписания','Курс остаётся в каталоге, но сервис не создаёт выдуманные пары.'];
      const source=this.safeUrl(c?.sources?.practice||c?.sources?.lecture||p?.source||'#');
      const html=`<div class="schedule-empty"><div class="empty-icon">${data[0]}</div><h3>${data[1]}</h3><p>${data[2]}</p>${empty==='no-group'?'<button class="btn primary" data-action="profile">Выбрать группу</button>':`<a class="btn ghost" href="${this.esc(source)}" target="_blank" rel="noopener noreferrer">Проверить источник ↗</a>`}</div>`;
      desktop.innerHTML=html;mobile.innerHTML=html;
      this.renderWeekStrip(events,monday);
    }else{
      const html=this.agendaBoardHtml(events,monday,todayKey);
      desktop.innerHTML=html;mobile.innerHTML=html;
      this.renderWeekStrip(events,monday);
    }
    const source=c?.sources?.practice||c?.sources?.lecture||p?.liveIndex||p?.source||'#';document.getElementById('sourceLink').href=this.safeUrl(source,'#');
    const warning=c?.sourceWarnings?.length?c.sourceWarnings.join(' '):'';const notice=document.querySelector('.schedule-notice');if(notice)notice.classList.toggle('warning',!!warning || this.liveMode==='idb-cache' || this.liveMode==='local-stale');
    if(p?.id==='31.05.01'&&this.live){
      const mode=this.liveMode==='idb-cache'?'Офлайн-кэш':this.liveMode==='local-stale'?'Локальный снимок (обновите)':'Проверенный live-index';
      document.getElementById('dataHealthTitle').textContent=`${mode} · ${this.live.generatedAt?.slice(0,10)||'—'}`;
      const courseCount=Object.keys(this.live.courses||{}).length;
      document.getElementById('dataHealthText').textContent=`${courseCount} курсов · ${allEvents.length} событий для группы после фильтра программы/курса/группы/потока · дата и дубликаты проверены${this.liveMode==='idb-cache'?' · интернет недоступен, показан последний кэш':''}.`;
    }else if(c){document.getElementById('dataHealthTitle').textContent=warning?'Источник требует внимания':'Официальный snapshot';document.getElementById('dataHealthText').textContent=warning||'Лекции и ПЗ хранятся раздельно. Неподтверждённые события не смешиваются с проверенными.';}
    else {document.getElementById('dataHealthTitle').textContent='Курс без проверенного набора событий';document.getElementById('dataHealthText').textContent='Чужие или непроверенные пары не подставляются автоматически.';}
  },
  renderWeekStrip(events,monday){
    const strip=document.getElementById('weekStrip');if(!strip)return;
    const today=this.dateKey(new Date());
    let html='';
    for(let i=0;i<7;i++){
      const d=new Date(monday);d.setDate(d.getDate()+i);const key=this.dateKey(d);
      const n=events.filter(e=>e.date===key).length;
      html+=`<button class=\"week-day-chip ${key===today?'current':''}\" data-scroll-day=\"${key}\" aria-label=\"Перейти к ${this.days[i]} ${d.getDate()}\"><span>${this.days[i]}</span><b>${String(d.getDate()).padStart(2,'0')}</b><em>${n}</em></button>`;
    }
    strip.innerHTML=html;
  },

  agendaBoardHtml(events,monday,todayKey){
    let html='<div class="agenda-board" role="list">';
    for(let i=0;i<7;i++){
      const d=new Date(monday);d.setDate(d.getDate()+i);const key=this.dateKey(d),list=events.filter(e=>e.date===key).sort((a,b)=>a.start.localeCompare(b.start)||a.end.localeCompare(b.end)||a.subject.localeCompare(b.subject,'ru'));
      const month=new Intl.DateTimeFormat('ru-RU',{month:'short'}).format(d).replace('.','');
      html+=`<section id="agenda-${key}" class="agenda-day ${key===todayKey?'today-day':''}" data-day="${key}" aria-label="${this.days[i]} ${d.getDate()}"><header class="agenda-day-head"><div><span>${this.days[i]}</span><b>${String(d.getDate()).padStart(2,'0')} <em>${this.esc(month)}</em></b></div><strong>${list.length}</strong></header><div class="agenda-day-events">`;
      if(!list.length) html+='<div class="agenda-empty"><span>—</span><small>Нет занятий</small></div>';
      else html+=list.map(e=>this.eventCardHtml(e)).join('');
      html+='</div></section>';
    }
    return html+'</div>';
  },
  eventCardHtml(e){
    const split=e.doubleIndex?`<span class="split-badge split-${this.esc(String(e.doubleIndex).replace('/','-'))}">${this.esc(e.doubleIndex)}</span>`:'';
    const src=e.sourceUrl?`<a class="event-source" href="${this.esc(this.safeUrl(e.sourceUrl))}" target="_blank" rel="noopener noreferrer" title="Открыть источник">↗</a>`:'';
    const stream=e.stream?`<span class="stream-badge">поток ${this.esc(e.stream)}</span>`:'';
    const type=e.lessonType==='lecture'?'ЛЕКЦИЯ':e.lessonType==='assessment'?'КОНТРОЛЬ':'ПЗ';
    return `<article class="agenda-event ${e.lessonType}" role="listitem"><div class="agenda-time"><b>${this.esc(e.start)}</b><span>${this.esc(e.end)}</span></div><div class="agenda-body"><div class="agenda-topline"><span class="lesson-type">${type}</span>${split}${stream}${src}</div><h3>${this.esc(e.subject)}</h3><p class="agenda-location">${this.esc(e.location||'Аудитория уточняется')}</p><div class="agenda-meta"><span>нед. ${this.esc(e.weekNumber||'—')}</span>${e.doubleOf?`<span>серия ${this.esc(e.doubleOf)}</span>`:''}</div></div></article>`;
  },
  shareWeek(){
    const url=new URL(location.href);url.searchParams.set('page','schedule');url.searchParams.set('program',this.state.program);url.searchParams.set('course',this.state.course);if(this.state.group)url.searchParams.set('group',this.state.group);else url.searchParams.delete('group');
    const value=url.toString();
    const done=()=>{const b=document.querySelector('[data-action="share-week"]');if(!b)return;const old=b.textContent;b.textContent='Ссылка скопирована';setTimeout(()=>b.textContent=old,1400);};
    if(navigator.clipboard?.writeText)navigator.clipboard.writeText(value).then(done).catch(()=>window.prompt('Скопируйте ссылку',value));else window.prompt('Скопируйте ссылку',value);
  },

  renderTasks(){
    const context=this.state.tasks.filter(t=>t.program===this.state.program&&String(t.course)===String(this.state.course)&&(!t.group||t.group===this.state.group));
    const tasks=context.filter(t=>this.state.taskFilter==='all'||(this.state.taskFilter==='open'&&!t.done)||(this.state.taskFilter==='done'&&t.done)).sort((a,b)=>a.due.localeCompare(b.due));
    const open=context.filter(t=>!t.done).sort((a,b)=>a.due.localeCompare(b.due)),next=open[0];
    document.getElementById('nextDeadline').textContent=next?`${next.subject} · ${this.prettyDate(next.due)}`:'Нет дедлайнов';document.getElementById('taskOpenCount').textContent=`${open.length} открытых`;
    document.getElementById('homeworkList').innerHTML=tasks.slice(0,5).map(t=>this.taskHtml(t)).join('')||`<div class="empty-panel"><b>Пока пусто</b><span>Добавьте ДЗ для текущего учебного контекста.</span></div>`;
    const stats={};context.filter(t=>!t.done).forEach(t=>stats[t.subject]=(stats[t.subject]||0)+1);document.getElementById('subjectStats').innerHTML=Object.entries(stats).length?Object.entries(stats).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([s,n])=>`<div class="subject-bar"><span title="${this.esc(s)}">${this.esc(s)}</span><i style="--w:${Math.min(100,n*22)}%"></i><em>${n}</em></div>`).join(''):`<p class="muted">Статистика появится после добавления заданий.</p>`;
    document.getElementById('taskTable').innerHTML=tasks.length?tasks.map(t=>`<div class="table-row ${t.done?'done':''}"><b>${this.esc(t.subject)}</b><span>${this.esc(t.text)}</span><span class="task-date ${this.taskDateClass(t)}">${this.prettyDate(t.due)}</span><span class="task-actions"><button class="icon-btn inline" data-action="toggle-task" data-task-id="${this.esc(t.id)}" title="${t.done?'Вернуть в работу':'Отметить выполненным'}">✓</button><button class="icon-btn inline" data-action="edit-task" data-task-id="${this.esc(t.id)}" title="Изменить">✎</button><button class="icon-btn inline danger" data-action="delete-task" data-task-id="${this.esc(t.id)}" title="Удалить">×</button></span></div>`).join(''):`<div class="empty-panel"><b>Нет заданий в выбранном фильтре</b><span>Выберите «Все», «Открытые» или «Готово».</span></div>`;
  },
  taskHtml(t){return `<div class="task-item ${t.done?'done':''}"><div class="task-item-top"><b>${this.esc(t.subject)}</b><span class="chip ${this.taskDateClass(t)}">${this.prettyDate(t.due)}</span></div><small>${this.esc(t.text)}</small><div class="task-item-actions"><button class="btn" data-action="toggle-task" data-task-id="${this.esc(t.id)}">${t.done?'Вернуть в работу':'Отметить выполненным'}</button><button class="btn" data-action="edit-task" data-task-id="${this.esc(t.id)}">Изменить</button><button class="btn danger-btn" data-action="delete-task" data-task-id="${this.esc(t.id)}">Удалить</button></div></div>`;},
  taskDateClass(t){if(t.done)return'done-date';const k=this.dateKey(new Date()),d=String(t.due||'');if(d<k)return'overdue';if(d===k)return'due-today';return '';},
  prettyDate(k){const d=new Date(`${this.normalizeDate(k)}T12:00:00`);return this.normalizeDate(k)&&!Number.isNaN(d.getTime())?new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short'}).format(d):String(k||'—');},

  renderKug(){const p=this.getProgram(),items=this.kug?.[p?.id]?.[String(this.state.course)]||[];document.getElementById('kugTitle').textContent=`${p?.name||'—'} · ${this.state.course} курс`;document.getElementById('kugTimeline').innerHTML=items.length?items.map(x=>`<div class="kug-item ${this.esc(x.kind)}"><i class="kug-line"></i><div><b>${this.prettyDate(x.from)} — ${this.prettyDate(x.to)}</b><small>${this.esc(x.label)}</small></div><span>${x.kind==='study'?'Учёба':x.kind==='assessment'?'Аттестация':x.kind==='practice'?'Практика':'Каникулы'}</span></div>`).join(''):`<div class="empty-panel"><b>КУГ для этого курса не добавлен</b><span>Это не означает, что его нет у ИМО.</span></div>`;document.getElementById('kugSource').href=this.safeUrl(this.getCourseData()?.sources?.kug||p?.source||'#','#');},
  renderResources(){const list=this.sources?.sources||[],labels={hub:'Кабинет','live-ui':'Электронное расписание','week-calendar':'Учебные недели',catalog:'Каталог',structure:'Структура',portal:'Портал','live-json':'JSON',kug:'КУГ',lecture:'Лекции',practice:'ПЗ'};document.getElementById('resourceGrid').innerHTML=list.map(s=>`<article class="resource-card"><div class="resource-kicker">${this.esc(labels[s.kind]||s.kind)}</div><h3>${this.esc(s.title)}</h3><p>${this.esc(s.warning||((s.program||'')+(s.course?` · ${s.course} курс`:''))||'Официальный источник')}</p><div class="resource-links"><a href="${this.esc(this.safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">Открыть ↗</a></div></article>`).join('');},
  renderFaculties(){
    document.getElementById('facultyGrid').innerHTML=this.catalog.faculties.map(f=>{
      const programs=this.catalog.programs.filter(p=>p.faculty===f.id);
      const programHtml=programs.length?`<div class="faculty-programs">${programs.map(p=>{const supported=['31.05.01','31.05.02','37.05.01'].includes(p.id);return `<button class="program-link ${supported?'supported':''}" data-action="pick-program" data-program="${this.esc(p.id)}"><span>${this.esc(p.name)}</span><em>${supported?'Расписание':'Каталог'}</em></button>`;}).join('')}</div>`:'';
      return `<article class="faculty-card"><div class="resource-kicker">Факультет</div><h3>${this.esc(f.name)}</h3><p>${f.units.length?`${f.units.length} структурных позиций в каталоге.`:'Без перечня кафедр на текущей странице.'}</p>${programHtml}<div class="unit-list">${f.units.map(u=>`<span>${this.esc(u)}</span>`).join('')}</div></article>`;
    }).join('');
  },

  exportIcs(){
    const events=this.filterWeek(this.eventsForCurrentGroup());if(!events.length){window.alert('Для экспорта в этой неделе нет занятий.');return;}
    const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Almazov Schedule Hub//RU','CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VTIMEZONE','TZID:Europe/Moscow','BEGIN:STANDARD','DTSTART:19700101T000000','TZOFFSETFROM:+0300','TZOFFSETTO:+0300','TZNAME:MSK','END:STANDARD','END:VTIMEZONE'];
    for(const e of events){const start=e.date.replace(/-/g,'')+'T'+e.start.replace(':','')+'00';const end=e.date.replace(/-/g,'')+'T'+e.end.replace(':','')+'00';const uid=String(e.id||`${e.date}-${e.start}-${e.subject}`).replace(/[^A-Za-z0-9_.-]+/g,'-');lines.push('BEGIN:VEVENT',`UID:${uid}@almazov-hub`,`DTSTART;TZID=Europe/Moscow:${start}`,`DTEND;TZID=Europe/Moscow:${end}`,`SUMMARY:${this.icsEsc(e.subject+' · '+(e.lessonType==='lecture'?'Лекция':e.lessonType==='assessment'?'Контроль':'ПЗ'))}`,`LOCATION:${this.icsEsc(e.location||'')}`,`DESCRIPTION:${this.icsEsc('Учебная неделя №'+(e.weekNumber||'—'))}`,'END:VEVENT');}
    lines.push('END:VCALENDAR');this.downloadBlob(new Blob([lines.join('\r\n')],{type:'text/calendar;charset=utf-8'}),`almazov-${this.state.group||'group'}-week-${this.weekNumberForDate(this.monday(new Date()))}.ics`);
  },
  icsEsc(v){return String(v||'').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\r?\n/g,'\\n');}
};

try{const saved=JSON.parse(localStorage.getItem('almazov_hub_profile_v3')||localStorage.getItem('almazov_hub_profile_v2')||'{}');if(saved&&typeof saved==='object')Object.assign(APP.state, saved);}catch(_){ }
const urlParams=typeof location!=='undefined'?new URLSearchParams(location.search):null;if(urlParams?.get('program'))APP.state.program=urlParams.get('program');if(urlParams?.get('course'))APP.state.course=urlParams.get('course');if(urlParams?.get('group'))APP.state.group=urlParams.get('group');if(['dashboard','schedule','homework','kug','resources','faculties'].includes(urlParams?.get('page')))APP.state.page=urlParams.get('page');
window.APP=APP;APP.init();
