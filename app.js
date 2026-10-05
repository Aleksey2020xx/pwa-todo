'use strict';

/* ===== Хранилище ===== */
const LS = { tasks: 'pwa_tasks', notes: 'pwa_notes', tags: 'pwa_tags', topic: 'pwa_ntfy_topic', markers: 'pwa_markers', calmarks: 'pwa_calmarks' };
let tasks = load(LS.tasks, []);
let notes = load(LS.notes, []);
let allTags = load(LS.tags, []);
let markers = load(LS.markers, []);
let calmarks = load(LS.calmarks, {});
const activeFilters = { tasks: new Set(), notes: new Set() };

function load(key, def) { try { return JSON.parse(localStorage.getItem(key)) || def; } catch { return def; } }
function save() {
  localStorage.setItem(LS.tasks, JSON.stringify(tasks));
  localStorage.setItem(LS.notes, JSON.stringify(notes));
  localStorage.setItem(LS.tags, JSON.stringify(allTags));
  localStorage.setItem(LS.markers, JSON.stringify(markers));
  localStorage.setItem(LS.calmarks, JSON.stringify(calmarks));
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function pad(n) { return String(n).padStart(2, '0'); }
function fmtDate(iso) {
  if (!iso) return 'Без даты';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

/* ===== Push-канал (ntfy) ===== */
function getTopic() {
  let t = localStorage.getItem(LS.topic);
  if (!t) { t = 'siren-' + Math.random().toString(36).slice(2, 10); localStorage.setItem(LS.topic, t); }
  return t;
}
function schedulePush(title, body, when, clickUrl) {
  const diffSec = Math.round((when.getTime() - Date.now()) / 1000);
  if (diffSec < 10) {
    showBanner('ntfy: время уже прошло — push не запланирован (минимум 10 сек). Локальный баннер сработает.');
    return;
  }
  if (diffSec > 259200) {
    showBanner('ntfy: откладывать можно максимум на 3 дня — push для этой задачи не сработает.');
    return;
  }
  fetch('https://ntfy.sh/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topic: getTopic(),
      message: body,
      title: title,
      priority: 5,
      tags: ['alarm_clock'],
      delay: diffSec + 's',
      click: clickUrl
    })
  }).then(r => r.text().then(t => {
    if (r.ok) showBanner('Push принят сервером: ' + t.slice(0, 80));
    else showBanner('ntfy отклонил: ' + r.status + ' ' + t);
  })).catch(err => {
    showBanner('ntfy недоступен: ' + err);
  });
}

/* ===== Навигация ===== */
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});
function switchView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  if (name === 'tags') renderTagsView();
  if (name === 'calendar') renderCalendar();
}

/* ===== Попапы ===== */
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('click', e => { if (e.target === o) o.classList.add('hidden'); });
});
document.getElementById('dayModalClose').addEventListener('click', () => closeModal('dayModal'));
document.getElementById('markerModalClose').addEventListener('click', () => closeModal('markerModal'));
document.getElementById('helpCalendarBtn').addEventListener('click', () => openModal('helpModal'));
document.getElementById('helpModalClose').addEventListener('click', () => closeModal('helpModal'));


/* ===== Пикер тегов (общий) ===== */
let pickers = {};
function renderPicker(which) {
  const box = document.getElementById(which === 'task' ? 'taskTagPicker' : 'noteTagPicker');
  const selected = pickers[which] || [];
  const suggestions = allTags.filter(t => !selected.includes(t)).slice(0, 20);
  box.innerHTML =
    (suggestions.length
      ? '<div class="tag-suggest">' + suggestions.map(t =>
          '<button type="button" class="chip" data-pick="' + esc(t) + '">' + esc(t) + '</button>').join('') + '</div>'
      : '') +
    '<div class="chip-input">' +
      selected.map(t => '<span class="chip-sel">' + esc(t) + '<button type="button" data-remove="' + esc(t) + '">✕</button></span>').join('') +
      '<input type="text" placeholder="новый тег…">' +
    '</div>';
  box.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => {
    pickers[which].push(b.dataset.pick); renderPicker(which);
  }));
  box.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => {
    pickers[which] = pickers[which].filter(t => t !== b.dataset.remove); renderPicker(which);
  }));
  const inp = box.querySelector('input');
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const v = inp.value.trim().toLowerCase();
      if (v && !pickers[which].includes(v)) { pickers[which].push(v); if (!allTags.includes(v)) allTags.push(v); save(); renderPicker(which); renderAllFilters(); }
    }
  });
}

/* ===== Задачи ===== */
document.getElementById('addTaskBtn').addEventListener('click', () => {
  const f = document.getElementById('taskForm');
  f.classList.toggle('hidden');
  if (!f.classList.contains('hidden')) {
    pickers.task = []; renderPicker('task');
    const d = new Date(); document.getElementById('taskDate').value = d.toISOString().slice(0, 10);
  }
});
document.getElementById('saveTaskBtn').addEventListener('click', () => {
  const text = document.getElementById('taskText').value.trim();
  if (!text) return;
  askPermission();
  const date = document.getElementById('taskDate').value || null;
  const time = document.getElementById('taskTime').value || null;
  const task = {
    id: uid(), text, date, time,
    tags: [...(pickers.task || [])], done: false, notified: false
  };
  tasks.push(task);
  save();
  if (date && time) {
    const when = new Date(date + 'T' + time);
    if (!isNaN(when)) {
      schedulePush('🌸 Сирень: пора делать', text, when,
        location.origin + location.pathname + '?task=' + encodeURIComponent(task.id));
    }
  }
  document.getElementById('taskText').value = '';
  document.getElementById('taskForm').classList.add('hidden');
  renderTasks(); renderAllFilters(); renderTagsView(); renderCalendar();
});

function renderTasks() {
  const list = document.getElementById('tasksList');
  const flt = activeFilters.tasks;
  const shown = tasks.filter(t => !flt.size || t.tags.some(g => flt.has(g)));
  if (!shown.length) { list.innerHTML = '<div class="empty">' + (flt.size ? 'Под этим фильтром пусто' : 'Пока задач нет. Добавьте первую!') + '</div>'; return; }
  list.innerHTML = shown.map(t =>
    '<div class="card' + (t.done ? ' done' : '') + '" id="task-' + t.id + '">' +
      '<div class="card-top">' +
        '<button class="check' + (t.done ? ' done' : '') + '" data-check="' + t.id + '" aria-label="Готово"></button>' +
        '<div class="card-body">' +
          '<div class="card-title">' + esc(t.text) + '</div>' +
          '<div class="card-meta">' + (t.date ? esc(fmtDate(t.date)) : '') + (t.time ? ' ' + esc(t.time) : '') + '</div>' +
          (t.tags.length ? '<div class="card-tags">' + t.tags.map(g => '<span class="chip">' + esc(g) + '</span>').join('') + '</div>' : '') +
        '</div>' +
        '<button class="del" data-del="' + t.id + '">✕</button>' +
      '</div>' +
    '</div>').join('');
  list.querySelectorAll('[data-check]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    const t = tasks.find(x => x.id === b.dataset.check); t.done = !t.done; save(); renderTasks(); renderCalendar();
  }));
  list.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    tasks = tasks.filter(x => x.id !== b.dataset.del); save(); renderTasks(); renderAllFilters(); renderTagsView(); renderCalendar();
  }));
}

/* ===== Заметки ===== */
const noteArea = document.getElementById('noteText');
noteArea.addEventListener('input', () => { noteArea.style.height = 'auto'; noteArea.style.height = noteArea.scrollHeight + 'px'; });
document.getElementById('addNoteBtn').addEventListener('click', () => {
  const f = document.getElementById('noteForm');
  f.classList.toggle('hidden');
  if (!f.classList.contains('hidden')) { pickers.note = []; renderPicker('note'); noteArea.focus(); }
});
document.getElementById('saveNoteBtn').addEventListener('click', () => {
  const text = noteArea.value.trim();
  if (!text) return;
  notes.unshift({ id: uid(), text, tags: [...(pickers.note || [])], created: new Date().toISOString() });
  save();
  noteArea.value = ''; noteArea.style.height = 'auto';
  document.getElementById('noteForm').classList.add('hidden');
  renderNotes(); renderAllFilters(); renderTagsView();
});

function renderNotes() {
  const list = document.getElementById('notesList');
  const flt = activeFilters.notes;
  const shown = notes.filter(n => !flt.size || n.tags.some(g => flt.has(g)));
  if (!shown.length) { list.innerHTML = '<div class="empty">' + (flt.size ? 'Под этим фильтром пусто' : 'Пока заметок нет.') + '</div>'; return; }
  list.innerHTML = shown.map(n =>
    '<div class="card" id="note-' + n.id + '">' +
      '<div class="card-top"><div class="card-body">' +
        '<div class="card-title">' + esc(n.text) + '</div>' +
        '<div class="card-note-text">' + esc(n.text) + '</div>' +
        (n.tags.length ? '<div class="card-tags">' + n.tags.map(g => '<span class="chip">' + esc(g) + '</span>').join('') + '</div>' : '') +
      '</div>' +
      '<button class="del" data-del="' + n.id + '">✕</button></div>' +
    '</div>').join('');
  list.querySelectorAll('.card').forEach(c => c.addEventListener('click', () => c.classList.toggle('expanded')));
  list.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    notes = notes.filter(x => x.id !== b.dataset.del); save(); renderNotes(); renderAllFilters(); renderTagsView();
  }));
}

/* ===== Фильтры по тегам ===== */
function renderAllFilters() {
  renderFilter('tasks', tasks.flatMap(t => t.tags));
  renderFilter('notes', notes.flatMap(n => n.tags));
}
function renderFilter(section, src) {
  const box = document.getElementById(section + 'TagFilter');
  const flt = activeFilters[section];
  const uniq = [...new Set(src)].sort();
  box.innerHTML = uniq.map(t =>
    '<button class="chip' + (flt.has(t) ? ' active' : '') + '" data-filter="' + esc(t) + '" data-section="' + section + '">#' + esc(t) + '</button>').join('');
  box.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => {
    const t = b.dataset.filter, s = b.dataset.section;
    flt.has(t) ? flt.delete(t) : flt.add(t);
    s === 'tasks' ? renderTasks() : renderNotes();
    renderFilter(s, s === 'tasks' ? tasks.flatMap(x => x.tags) : notes.flatMap(x => x.tags));
  }));
}

/* ===== Раздел «Списки»: панель push + аккордеон ===== */
function renderPushPanel() {
  const box = document.getElementById('pushPanel');
  const topic = getTopic();
  box.innerHTML =
    '<div class="card-title">Push-канал (ntfy)</div>' +
    '<div class="push-topic">' + esc(topic) + '</div>' +
    '<p class="hint" style="margin:8px 0 0">Установите приложение ntfy, добавьте подписку на эту тему — и уведомления будут приходить даже при закрытом приложении.</p>' +
    '<div style="display:flex;gap:8px;margin-top:12px">' +
      '<button class="chip" id="copyTopicBtn">Копировать тему</button>' +
      '<a class="chip" style="text-decoration:none" href="https://ntfy.sh/#/' + esc(topic) + '" target="_blank" rel="noopener">Открыть на ntfy.sh</a>' +
    '</div>';
  document.getElementById('copyTopicBtn').addEventListener('click', () => {
    navigator.clipboard && navigator.clipboard.writeText(topic);
  });
}

function renderTagsView() {
  renderPushPanel();
  const box = document.getElementById('tagsAccordion');
  const groups = {};
  tasks.forEach(t => t.tags.forEach(g => addGroup(groups, g, { type: 'task', item: t })));
  notes.forEach(n => n.tags.forEach(g => addGroup(groups, g, { type: 'note', item: n })));
  const keys = Object.keys(groups).sort((a, b) => groups[b].items.length - groups[a].items.length);
  if (!keys.length) { box.innerHTML = '<div class="empty">Теги появятся здесь, как только вы что-то добавите.</div>'; return; }
  box.innerHTML = keys.map(g => {
    const items = groups[g].items
      .map(x => ({ ...x, sortDate: x.type === 'task' ? (x.item.date || '9999') : (x.item.created || '').slice(0, 10) }))
      .sort((a, b) => a.sortDate.localeCompare(b.sortDate));
    const byDate = {};
    items.forEach(x => { const d = x.type === 'task' ? (x.item.date || '9999') : (x.item.created || '').slice(0, 10); (byDate[d] = byDate[d] || []).push(x); });
    const inner = Object.keys(byDate).map(d =>
      '<div class="date-head">' + esc(fmtDate(d === '9999' ? null : d)) + '</div>' +
      byDate[d].map(x =>
        '<a class="acc-item" href="#' + (x.type === 'task' ? 'task-' : 'note-') + x.item.id + '"' +
        ' data-type="' + x.type + '" data-id="' + x.item.id + '">' +
        esc((x.type === 'task' ? x.item.text : x.item.text.split('\n')[0]).slice(0, 60)) +
        '<span class="badge">' + (x.type === 'task' ? 'задача' : 'заметка') + '</span>' +
        (x.type === 'task' && x.item.time ? ' <small>' + esc(x.item.time) + '</small>' : '') +
        '</a>').join('')
    ).join('');
    return '<div class="acc"><button class="acc-head">#' + esc(g) + ' <span class="arrow">›</span></button>' +
      '<div class="acc-body"><div class="acc-inner">' + inner + '</div></div></div>';
  }).join('');
  box.querySelectorAll('.acc-head').forEach(h => h.addEventListener('click', () => h.parentElement.classList.toggle('open')));
  box.querySelectorAll('.acc-item').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    const target = a.getAttribute('href').slice(1);
    switchView(a.dataset.type === 'task' ? 'tasks' : 'notes');
    activeFilters.tasks.clear(); activeFilters.notes.clear();
    a.dataset.type === 'task' ? renderTasks() : renderNotes();
    setTimeout(() => {
      const el = document.getElementById(target);
      if (!el) return;
      if (a.dataset.type === 'note') el.classList.add('expanded');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('highlight');
      setTimeout(() => el.classList.remove('highlight'), 2200);
    }, 80);
  }));
}
function addGroup(groups, g, entry) { (groups[g] = groups[g] || { items: [] }).items.push(entry); }

/* ===== Переход по push / ссылке на задачу ===== */
function focusTask(id) {
  switchView('tasks');
  activeFilters.tasks.clear();
  renderTasks();
  setTimeout(() => {
    const el = document.getElementById('task-' + id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('highlight');
    setTimeout(() => el.classList.remove('highlight'), 2200);
  }, 80);
}
(function handleTaskParam() {
  const params = new URLSearchParams(location.search);
  const taskId = params.get('task');
  if (taskId) {
    history.replaceState(null, '', location.pathname);
    setTimeout(() => focusTask(taskId), 200);
  }
})();

/* ===== Уведомления (локальные) ===== */
function askPermission() {
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
}
document.getElementById('testNotifBtn').addEventListener('click', () => {
  const run = () => {
    notify('Тест', 'Уведомления работают! 🎉');
    const when = new Date(Date.now() + 20000);
    schedulePush('Тест push', 'Если видите это через 20 сек — push работает!', when,
      location.origin + location.pathname);
    showBanner('Тест отправлен: локальное уведомление + push через 20 сек');
  };
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().then(p => { if (p === 'granted') run(); else showBanner('Разрешение на уведомления не дано'); });
  } else {
    run();
  }
});

function checkTasks() {
  const now = new Date();
  tasks.forEach(t => {
    if (t.done || t.notified || !t.date || !t.time) return;
    const dt = new Date(t.date + 'T' + t.time);
    if (now >= dt) { t.notified = true; save(); showBanner(t.text); notify('🌸 Сирень: пора делать', t.text, t.id); }
  });
}
function showBanner(text) {
  document.getElementById('bannerText').textContent = text;
  const b = document.getElementById('banner');
  b.classList.remove('hidden');
  if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
}
document.getElementById('bannerOk').addEventListener('click', () => document.getElementById('banner').classList.add('hidden'));

function notify(title, body, taskId) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const opts = {
    body,
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    vibrate: [150, 80, 150, 80, 300],
    tag: 'task-' + Date.now(),
    data: { url: './?task=' + encodeURIComponent(taskId || '') }
  };
  try {
    navigator.serviceWorker.ready.then(reg =>
      reg.showNotification(title, opts)
    ).catch(() => { try { new Notification(title, opts); } catch (e) {} });
  } catch (e) { try { new Notification(title, opts); } catch (e2) {} }
}
setInterval(checkTasks, 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkTasks(); });

/* ===== КАЛЕНДАРЬ ===== */
let calYear, calMonth, selectedDay = null, editingMarkerId = null, selectedMarkerId = null;
(function initCal() { const d = new Date(); calYear = d.getFullYear(); calMonth = d.getMonth(); })();
function isoOf(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }

document.getElementById('calPrev').addEventListener('click', () => { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCalendar(); });
document.getElementById('calNext').addEventListener('click', () => { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCalendar(); });

/* --- Лента маркеров и режим назначения --- */
function renderMarkerStrip() {
  const strip = document.getElementById('markerStrip');
  const hint = document.getElementById('calHint');
  if (!markers.length) {
    strip.innerHTML = '<span class="hint" style="padding:10px 4px">Маркеров пока нет — нажмите ✏️, чтобы создать.</span>';
  } else {
    strip.innerHTML = markers.map(m =>
      '<button class="chip' + (selectedMarkerId === m.id ? ' active' : '') + '" data-mselect="' + m.id + '">' +
      '<span class="chip-dot" style="background:' + m.color + '"></span>' + esc(m.name) + '</button>').join('');
    strip.querySelectorAll('[data-mselect]').forEach(b => b.addEventListener('click', () => {
      selectedMarkerId = selectedMarkerId === b.dataset.mselect ? null : b.dataset.mselect;
      renderMarkerStrip();
    }));
  }
  const m = markers.find(x => x.id === selectedMarkerId);
  if (m) {
    hint.textContent = 'Выбран «' + m.name + '» — тапайте по дням календаря, чтобы отметить или снять. Повторный тап по маркеру завершает выбор.';
    hint.classList.add('show');
  } else {
    hint.classList.remove('show');
  }
}

function renderCalendar() {
  renderMarkerStrip();
  document.getElementById('calTitle').textContent =
    new Date(calYear, calMonth, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  const grid = document.getElementById('calGrid');
  const firstDow = (new Date(calYear, calMonth, 1).getDay() + 6) % 7; // Пн = 0
  const dim = new Date(calYear, calMonth + 1, 0).getDate();
  const prevDim = new Date(calYear, calMonth, 0).getDate();
  const totalCells = Math.ceil((firstDow + dim) / 7) * 7;
  const now = new Date();
  const todayIso = isoOf(now.getFullYear(), now.getMonth(), now.getDate());
  let html = '';
  for (let i = 0; i < totalCells; i++) {
    let dayNum, iso, other = false;
    if (i < firstDow) { dayNum = prevDim - firstDow + 1 + i; other = true; }
    else if (i < firstDow + dim) { dayNum = i - firstDow + 1; iso = isoOf(calYear, calMonth, dayNum); }
    else { dayNum = i - (firstDow + dim) + 1; other = true; }
    if (other) { html += '<div class="cal-day other"><div class="num">' + dayNum + '</div></div>'; continue; }
    const dayMarks = calmarks[iso] || [];
    const dots = dayMarks.map(id => {
      const m = markers.find(x => x.id === id);
      return m ? '<span class="cal-dot" style="background:' + m.color + '"></span>' : '';
    }).join('');
    const cnt = tasks.filter(t => t.date === iso).length;
    html += '<div class="cal-day' + (iso === todayIso ? ' today' : '') + '" data-day="' + iso + '">' +
      '<div class="num">' + dayNum + '</div>' +
      (dots ? '<div class="cal-dots">' + dots + '</div>' : '') +
      (cnt ? '<div class="cal-count">' + cnt + '</div>' : '') +
      '</div>';
  }
  grid.innerHTML = html;
  grid.querySelectorAll('[data-day]').forEach(c => c.addEventListener('click', () => {
    if (selectedMarkerId) {
      // Режим массового назначения: тап по дню переключает выбранный маркер
      const iso = c.dataset.day;
      const arr = calmarks[iso] || [];
      const i = arr.indexOf(selectedMarkerId);
      if (i >= 0) arr.splice(i, 1); else arr.push(selectedMarkerId);
      if (arr.length) calmarks[iso] = arr; else delete calmarks[iso];
      save(); renderCalendar();
    } else {
      openDayModal(c.dataset.day);
    }
  }));
  renderCalStats();
}

function renderCalStats() {
  const box = document.getElementById('calStats');
  const prefix = calYear + '-' + pad(calMonth + 1) + '-';
  const rows = markers.map(m => {
    let days = 0;
    Object.keys(calmarks).forEach(k => {
      if (k.indexOf(prefix) === 0 && calmarks[k].includes(m.id)) days++;
    });
    return { m, days, hours: days * (Number(m.hours) || 0) };
  }).filter(r => r.days > 0).sort((a, b) => b.hours - a.hours);
  const total = rows.reduce((s, r) => s + r.hours, 0);
  if (!rows.length) {
    box.innerHTML = '<div class="empty" style="padding:16px">Отметьте дни маркерами — здесь появится статистика.</div>';
    return;
  }
  box.innerHTML = rows.map(r =>
    '<div class="stat-row"><span class="stat-swatch" style="background:' + r.m.color + '"></span>' +
    '<span class="stat-name">' + esc(r.m.name) + '</span>' +
    '<span class="stat-val">' + r.days + ' дн · ' + r.hours + ' ч</span></div>').join('') +
    '<div class="stat-row stat-total"><span class="stat-name">Итого</span><span class="stat-val">' + total + ' ч</span></div>';
}

/* --- Попап маркеров --- */
const PALETTE = ['#7b5ea7', '#a48cc8', '#c9b6e4', '#5b4a86', '#3d3154',
                 '#6db3a1', '#5f86d9', '#d98b5f', '#d95f6f', '#d9b65f'];
function renderPalette() {
  const row = document.getElementById('paletteRow');
  const cur = document.getElementById('markerColor').value;
  row.innerHTML = PALETTE.map(c =>
    '<button type="button" class="pal' + (c === cur ? ' active' : '') +
    '" style="background:' + c + '" data-pal="' + c + '" aria-label="' + c + '"></button>').join('');
  row.querySelectorAll('[data-pal]').forEach(b => b.addEventListener('click', () => {
    document.getElementById('markerColor').value = b.dataset.pal;
    renderPalette();
  }));
}
document.getElementById('editMarkersBtn').addEventListener('click', () => {
  editingMarkerId = null;
  document.getElementById('markerName').value = '';
  document.getElementById('markerHours').value = '';
  document.getElementById('markerColor').value = '#7b5ea7';
  document.getElementById('markerFormTitle').textContent = 'Новый маркер';
  document.getElementById('saveMarkerBtn').textContent = 'Добавить маркер';
  renderMarkerModal();
  renderPalette();
  openModal('markerModal');
});
function renderMarkerModal() {
  const list = document.getElementById('markerList');
  list.innerHTML = markers.length ? markers.map(m =>
    '<div class="marker-row">' +
    '<span class="stat-swatch" style="background:' + m.color + '"></span>' +
    '<span class="stat-name">' + esc(m.name) + '</span>' +
    '<span class="stat-val">' + m.hours + ' ч/день</span>' +
    '<button class="del" data-med="' + m.id + '" title="Изменить">✏️</button>' +
    '<button class="del" data-mdel="' + m.id + '" title="Удалить">✕</button></div>').join('')
    : '<div class="empty" style="padding:12px">Маркеров пока нет — создайте первый ниже.</div>';
  list.querySelectorAll('[data-med]').forEach(b => b.addEventListener('click', () => {
    const m = markers.find(x => x.id === b.dataset.med);
    editingMarkerId = m.id;
    document.getElementById('markerName').value = m.name;
    document.getElementById('markerColor').value = m.color;
    document.getElementById('markerHours').value = m.hours;
    document.getElementById('markerFormTitle').textContent = 'Изменение маркера';
    document.getElementById('saveMarkerBtn').textContent = 'Сохранить изменения';
    renderPalette();
  }));
  list.querySelectorAll('[data-mdel]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.mdel;
    markers = markers.filter(x => x.id !== id);
    if (selectedMarkerId === id) selectedMarkerId = null;
    Object.keys(calmarks).forEach(k => {
      calmarks[k] = calmarks[k].filter(x => x !== id);
      if (!calmarks[k].length) delete calmarks[k];
    });
    save(); renderMarkerModal(); renderCalendar();
  }));
}
document.getElementById('saveMarkerBtn').addEventListener('click', () => {
  const name = document.getElementById('markerName').value.trim();
  if (!name) return;
  const color = document.getElementById('markerColor').value;
  const hours = Number(document.getElementById('markerHours').value) || 0;
  if (editingMarkerId) {
    const m = markers.find(x => x.id === editingMarkerId);
    m.name = name; m.color = color; m.hours = hours;
  } else {
    markers.push({ id: uid(), name, color, hours });
  }
  editingMarkerId = null;
  document.getElementById('markerName').value = '';
  document.getElementById('markerHours').value = '';
  document.getElementById('markerFormTitle').textContent = 'Новый маркер';
  document.getElementById('saveMarkerBtn').textContent = 'Добавить маркер';
  save(); renderMarkerModal(); renderCalendar();
});


/* --- Попап дня --- */
function openDayModal(iso) {
  selectedDay = iso;
  renderDayModal();
  openModal('dayModal');
}
function renderDayModal() {
  const [y, m, d] = selectedDay.split('-').map(Number);
  document.getElementById('dayModalTitle').textContent =
    new Date(y, m - 1, d).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  // Маркеры дня
  const dm = document.getElementById('dayMarkers');
  const cur = calmarks[selectedDay] || [];
  dm.innerHTML = markers.length
    ? '<div class="modal-sub">Маркеры дня</div><div class="tag-suggest">' + markers.map(m =>
        '<button class="chip' + (cur.includes(m.id) ? ' active' : '') + '" data-dmark="' + m.id + '">' +
        '<span class="chip-dot" style="background:' + m.color + '"></span>' + esc(m.name) + '</button>').join('') + '</div>'
    : '<div class="empty" style="padding:10px">Создайте маркеры через ✏️ над календарём.</div>';
  dm.querySelectorAll('[data-dmark]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.dmark;
    const arr = calmarks[selectedDay] || [];
    const i = arr.indexOf(id);
    if (i >= 0) arr.splice(i, 1); else arr.push(id);
    if (arr.length) calmarks[selectedDay] = arr; else delete calmarks[selectedDay];
    save(); renderDayModal(); renderCalendar();
  }));
  // Задачи дня
  const dt2 = document.getElementById('dayTasks');
  const dayTasks = tasks.filter(t => t.date === selectedDay);
  dt2.innerHTML = '<div class="modal-sub">Задачи на этот день</div>' + (dayTasks.length
    ? dayTasks.map(t =>
        '<div class="day-task' + (t.done ? ' done' : '') + '">' +
        '<button class="check' + (t.done ? ' done' : '') + '" data-dcheck="' + t.id + '"></button>' +
        '<span class="day-task-text">' + esc(t.text) + (t.time ? ' <small>' + esc(t.time) + '</small>' : '') + '</span>' +
        '<button class="del" data-ddel="' + t.id + '">✕</button></div>').join('')
    : '<div class="empty" style="padding:10px">Задач на этот день нет.</div>');
  dt2.querySelectorAll('[data-dcheck]').forEach(b => b.addEventListener('click', () => {
    const t = tasks.find(x => x.id === b.dataset.dcheck); t.done = !t.done; save();
    renderDayModal(); renderTasks(); renderTagsView(); renderCalendar();
  }));
  dt2.querySelectorAll('[data-ddel]').forEach(b => b.addEventListener('click', () => {
    tasks = tasks.filter(x => x.id !== b.dataset.ddel); save();
    renderDayModal(); renderTasks(); renderAllFilters(); renderTagsView(); renderCalendar();
  }));
  document.getElementById('dayTaskText').value = '';
  document.getElementById('dayTaskTime').value = '';
}
document.getElementById('saveDayTaskBtn').addEventListener('click', () => {
  const text = document.getElementById('dayTaskText').value.trim();
  if (!text || !selectedDay) return;
  askPermission();
  const time = document.getElementById('dayTaskTime').value || null;
  const task = { id: uid(), text, date: selectedDay, time, tags: [...(pickers.task || [])], done: false, notified: false };
  tasks.push(task); save();
  if (time) {
    const when = new Date(selectedDay + 'T' + time);
    if (!isNaN(when)) schedulePush('🌸 Сирень: пора делать', text, when,
      location.origin + location.pathname + '?task=' + encodeURIComponent(task.id));
  }
  renderDayModal(); renderTasks(); renderAllFilters(); renderTagsView(); renderCalendar();
});

/* ===== Старт ===== */
renderTasks(); renderNotes(); renderAllFilters(); renderTagsView(); renderCalendar();
