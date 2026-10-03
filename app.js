'use strict';

/* ===== Хранилище ===== */
const LS = { tasks: 'pwa_tasks', notes: 'pwa_notes', tags: 'pwa_tags', topic: 'pwa_ntfy_topic' };
let tasks = load(LS.tasks, []);
let notes = load(LS.notes, []);
let allTags = load(LS.tags, []);
const activeFilters = { tasks: new Set(), notes: new Set() };

function load(key, def) { try { return JSON.parse(localStorage.getItem(key)) || def; } catch { return def; } }
function save() {
  localStorage.setItem(LS.tasks, JSON.stringify(tasks));
  localStorage.setItem(LS.notes, JSON.stringify(notes));
  localStorage.setItem(LS.tags, JSON.stringify(allTags));
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
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
function schedulePush(title, body, when) {
  const delayUnix = Math.floor(when.getTime() / 1000);
  fetch('https://ntfy.sh/' + getTopic(), {
    method: 'POST',
    body: JSON.stringify({
      message: body,
      title: title,
      priority: 5,
      tags: ['alarm_clock']
    }),
    headers: {
      'Content-Type': 'application/json',
      'X-Delay': String(delayUnix)
    }
  }).then(r => {
    if (!r.ok) {
      r.text().then(t => showBanner('ntfy отклонил: ' + r.status + ' ' + t));
    }
  }).catch(err => {
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
}

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
  tasks.push({
    id: uid(), text, date, time,
    tags: [...(pickers.task || [])], done: false, notified: false
  });
  save();
  if (date && time) {
    const when = new Date(date + 'T' + time);
    if (!isNaN(when)) schedulePush('Пора делать! 🔔', text, when);
  }
  resetFiltersForNew();
  document.getElementById('taskText').value = '';
  document.getElementById('taskForm').classList.add('hidden');
  renderTasks(); renderAllFilters(); renderTagsView();
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
    const t = tasks.find(x => x.id === b.dataset.check); t.done = !t.done; save(); renderTasks();
  }));
  list.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    tasks = tasks.filter(x => x.id !== b.dataset.del); save(); renderTasks(); renderAllFilters(); renderTagsView();
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
  save(); resetFiltersForNew();
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
function resetFiltersForNew() { /* новый тег обновляет плашки через renderAllFilters */ }

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

/* ===== Уведомления (локальные) ===== */
function askPermission() {
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
}
document.getElementById('testNotifBtn').addEventListener('click', () => {
  // Сначала спрашиваем разрешение, потом всё остальное
  const run = () => {
    notify('Тест', 'Уведомления работают! 🎉');
    const when = new Date(Date.now() + 20000);
    schedulePush('Тест push', 'Если видите это через 20 сек — push работает!', when);
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
    if (now >= dt) { t.notified = true; save(); const txt = t.text; showBanner(txt); notify('Пора делать!', txt); }
  });
}
function showBanner(text) {
  document.getElementById('bannerText').textContent = text;
  const b = document.getElementById('banner');
  b.classList.remove('hidden');
  if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
}
document.getElementById('bannerOk').addEventListener('click', () => document.getElementById('banner').classList.add('hidden'));

function notify(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    navigator.serviceWorker.ready.then(reg =>
      reg.showNotification(title, { body, tag: 'task-' + Date.now(), vibrate: [200, 100, 200] })
    ).catch(() => { try { new Notification(title, { body }); } catch (e) {} });
  } catch (e) { try { new Notification(title, { body }); } catch (e2) {} }
}
setInterval(checkTasks, 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkTasks(); });

/* ===== Старт ===== */
renderTasks(); renderNotes(); renderAllFilters(); renderTagsView();
