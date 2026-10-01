'use strict';

/* ================== утилиты ================== */
const $ = s => document.querySelector(s);
const app = $('#app');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tk = t => t.toLowerCase();

function load(key, def) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v ?? def; }
  catch { return def; }
}

let tasks = load('todo_tasks', []);
let notes = load('todo_notes', []);
let knownTags = load('todo_tags', []);

function persist() {
  localStorage.setItem('todo_tasks', JSON.stringify(tasks));
  localStorage.setItem('todo_notes', JSON.stringify(notes));
  localStorage.setItem('todo_tags', JSON.stringify(knownTags));
}

/* ================== состояние ================== */
let view = 'tasks';
const taskFilters = new Set();
const noteFilters = new Set();
const formOpen = { tasks: false, notes: false };
const openGroups = new Set();
const expandedNotes = new Set();
const draft = {
  task: { text: '', date: '', time: '', tags: [] },
  note: { text: '', tags: [] }
};

function resetDraft(kind) {
  draft[kind].text = '';
  draft[kind].tags = [];
  if (kind === 'task') { draft.task.date = ''; draft.task.time = ''; }
}

/* ================== теги ================== */
function normTag(t) { return t.trim().replace(/^#+/, '').replace(/\s+/g, ' '); }
function rememberTags(list) {
  list.forEach(t => { if (t && !knownTags.some(k => tk(k) === tk(t))) knownTags.push(t); });
}
function hasTag(item, tag) { return item.tags.some(t => tk(t) === tk(tag)); }

/* ---------- пикер тегов (подсказки + выбранные чипы + ввод нового) ---------- */
function tagPickerHTML(selected) {
  const rest = knownTags.filter(t => !selected.some(s => tk(s) === tk(t)));
  const sugg = rest.map(t => `<button type="button" class="chip chip-off" data-add="${esc(t)}">${esc(t)}</button>`).join('');
  const chips = selected.map(t =>
    `<span class="chip chip-on">${esc(t)}<button type="button" class="chip-x" data-remove="${esc(t)}" aria-label="Убрать тег">&times;</button></span>`
  ).join('');
  return `<div class="tag-suggest">${sugg || '<span class="tag-hint">Здесь появятся подсказки тегов</span>'}</div>
    <div class="tag-chips">${chips}</div>
    <input type="text" class="tag-input" placeholder="Новый тег — Enter или запятая">`;
}

function bindTagPicker(container, selected) {
  const renderPicker = () => {
    container.innerHTML = tagPickerHTML(selected);
    const input = container.querySelector('.tag-input');
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); }
    });
    input.addEventListener('blur', () => { if (input.value.trim()) commit(); });
  };
  const commit = () => {
    const input = container.querySelector('.tag-input');
    input.value.split(',').map(normTag).filter(Boolean).forEach(t => {
      if (!selected.some(s => tk(s) === tk(t))) selected.push(t);
    });
    input.value = '';
    rememberTags(selected);
    persist();
    renderPicker();
  };
  // один делегированный обработчик на контейнер, чтобы не плодить дубликаты
  container.addEventListener('pointerdown', e => {
    const add = e.target.closest('[data-add]');
    if (add) {
      e.preventDefault(); // не даём инпуту потерять фокус
      const t = add.dataset.add;
      if (!selected.some(s => tk(s) === tk(t))) selected.push(t);
      rememberTags(selected); persist(); renderPicker();
      return;
    }
    const rem = e.target.closest('[data-remove]');
    if (rem) {
      e.preventDefault();
      const i = selected.findIndex(s => tk(s) === tk(rem.dataset.remove));
      if (i > -1) selected.splice(i, 1);
      persist(); renderPicker();
    }
  }, true);
  renderPicker();
}

/* ================== фильтр по тегам ================== */
function filterBarHTML(activeSet) {
  if (!knownTags.length) return '';
  const chips = knownTags.map(t =>
    `<button type="button" class="chip ${activeSet.has(tk(t)) ? 'chip-on' : 'chip-off'}" data-filter="${esc(t)}">${esc(t)}</button>`
  ).join('');
  return `<div class="filter-bar"><span class="filter-label">Теги:</span>${chips}</div>`;
}
function bindFilterBar(activeSet, rerender) {
  const bar = app.querySelector('.filter-bar');
  if (!bar) return;
  bar.addEventListener('click', e => {
    const c = e.target.closest('[data-filter]');
    if (!c) return;
    const key = tk(c.dataset.filter);
    activeSet.has(key) ? activeSet.delete(key) : activeSet.add(key);
    rerender();
  });
}

/* ================== даты ================== */
function fmtDate(d) {
  if (!d) return 'Без даты';
  const dt = new Date(d + 'T00:00:00');
  if (isNaN(dt)) return d;
  const opts = { day: 'numeric', month: 'long' };
  if (dt.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return dt.toLocaleDateString('ru-RU', opts);
}

/* ================== РАЗДЕЛ: ЗАДАЧИ ================== */
function visibleTasks() {
  let list = tasks.slice();
  if (taskFilters.size) list = list.filter(t => t.tags.some(x => taskFilters.has(tk(x))));
  list.sort((a, b) => {
    if (!!a.done !== !!b.done) return a.done ? 1 : -1;
    const ka = (a.date || '9999') + 'T' + (a.time || '23:59');
    const kb = (b.date || '9999') + 'T' + (b.time || '23:59');
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  return list;
}

function taskCardHTML(t) {
  const chips = t.tags.map(tag => `<span class="chip chip-mini">${esc(tag)}</span>`).join('');
  const meta = t.date ? `${fmtDate(t.date)}${t.time ? ', ' + t.time : ''}` : '';
  return `<div class="card task-card ${t.done ? 'is-done' : ''}">
    <label class="check"><input type="checkbox" data-toggle="${t.id}" ${t.done ? 'checked' : ''}></label>
    <div class="card-body">
      <div class="task-text">${esc(t.text)}</div>
      ${meta ? `<div class="task-meta">${meta}</div>` : ''}
      ${chips ? `<div class="tags-row">${chips}</div>` : ''}
    </div>
    <button class="card-del" data-del="${t.id}" aria-label="Удалить">&#128465;</button>
  </div>`;
}

function taskFormHTML() {
  return `<div class="form-card">
    <input type="text" id="f-task-text" placeholder="Что нужно сделать?" value="${esc(draft.task.text)}">
    <div class="form-row">
      <input type="date" id="f-task-date" value="${esc(draft.task.date)}">
      <input type="time" id="f-task-time" value="${esc(draft.task.time)}">
    </div>
    <div class="tag-picker" id="f-task-tags"></div>
    <div class="form-actions">
      <button class="btn btn-ghost" id="f-task-cancel">Отмена</button>
      <button class="btn btn-primary" id="f-task-save">Сохранить</button>
    </div>
  </div>`;
}

function renderTasks() {
  const open = formOpen.tasks;
  let html = `<button class="btn btn-add" id="add-btn">${open ? '&times; Свернуть' : '+ Новая задача'}</button>`;
  if (open) html += taskFormHTML();
  html += filterBarHTML(taskFilters);
  const list = visibleTasks();
  html += list.length
    ? `<div class="list">${list.map(taskCardHTML).join('')}</div>`
    : (taskFilters.size
      ? `<div class="empty">По выбранным тегам ничего не найдено</div>`
      : `<div class="empty">Пока пусто. Добавьте первую задачу 🙂</div>`);
  app.innerHTML = html;

  $('#add-btn').addEventListener('click', () => { formOpen.tasks = !formOpen.tasks; render(); });
  bindFilterBar(taskFilters, render);
  if (open) bindTaskForm();

  app.querySelectorAll('[data-toggle]').forEach(cb => cb.addEventListener('change', () => {
    const t = tasks.find(x => x.id === cb.dataset.toggle);
    if (t) { t.done = cb.checked; persist(); render(); }
  }));
  app.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    tasks = tasks.filter(x => x.id !== btn.dataset.del);
    persist(); render();
  }));
}

function bindTaskForm() {
  const text = $('#f-task-text'), date = $('#f-task-date'), time = $('#f-task-time');
  text.value = draft.task.text; date.value = draft.task.date; time.value = draft.task.time;
  text.addEventListener('input', () => draft.task.text = text.value);
  date.addEventListener('input', () => draft.task.date = date.value);
  time.addEventListener('input', () => draft.task.time = time.value);
  bindTagPicker($('#f-task-tags'), draft.task.tags);
  $('#f-task-cancel').addEventListener('click', () => { formOpen.tasks = false; resetDraft('task'); render(); });
  $('#f-task-save').addEventListener('click', () => {
    const val = draft.task.text.trim();
    if (!val) { text.focus(); return; }
    tasks.push({
      id: uid(), text: val,
      date: draft.task.date, time: draft.task.time,
      tags: draft.task.tags.slice(),
      done: false, notified: false,
      createdAt: new Date().toISOString()
    });
    rememberTags(draft.task.tags);
    formOpen.tasks = false;
    resetDraft('task');
    persist(); render();
    askPermission();
  });
}

/* ================== РАЗДЕЛ: ЗАМЕТКИ ================== */
function visibleNotes() {
  let list = notes.slice();
  if (noteFilters.size) list = list.filter(n => n.tags.some(x => noteFilters.has(tk(x))));
  return list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

function noteCardHTML(n) {
  const open = expandedNotes.has(n.id);
  const chips = n.tags.map(t => `<span class="chip chip-mini">${esc(t)}</span>`).join('');
  return `<div class="card note-card" data-note="${n.id}">
    <div class="card-body">
      <div class="note-text ${open ? 'note-open' : 'note-clip'}">${esc(n.text)}</div>
      ${chips ? `<div class="tags-row">${chips}</div>` : ''}
    </div>
    <button class="card-del" data-del-note="${n.id}" aria-label="Удалить">&#128465;</button>
  </div>`;
}

function noteFormHTML() {
  return `<div class="form-card">
    <textarea id="f-note-text" placeholder="Текст заметки&hellip;" rows="1">${esc(draft.note.text)}</textarea>
    <div class="tag-picker" id="f-note-tags"></div>
    <div class="form-actions">
      <button class="btn btn-ghost" id="f-note-cancel">Отмена</button>
      <button class="btn btn-primary" id="f-note-save">Сохранить</button>
    </div>
  </div>`;
}

function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

function renderNotes() {
  const open = formOpen.notes;
  let html = `<button class="btn btn-add" id="add-btn">${open ? '&times; Свернуть' : '+ Новая заметка'}</button>`;
  if (open) html += noteFormHTML();
  html += filterBarHTML(noteFilters);
  const list = visibleNotes();
  html += list.length
    ? `<div class="list">${list.map(noteCardHTML).join('')}</div>`
    : (noteFilters.size
      ? `<div class="empty">По выбранным тегам ничего не найдено</div>`
      : `<div class="empty">Пока пусто. Создайте первую заметку 📝</div>`);
  app.innerHTML = html;

  $('#add-btn').addEventListener('click', () => { formOpen.notes = !formOpen.notes; render(); });
  bindFilterBar(noteFilters, render);
  if (open) bindNoteForm();

  app.querySelectorAll('[data-note]').forEach(card => card.addEventListener('click', e => {
    if (e.target.closest('[data-del-note]')) return;
    const id = card.dataset.note;
    expandedNotes.has(id) ? expandedNotes.delete(id) : expandedNotes.add(id);
    render();
  }));
  app.querySelectorAll('[data-del-note]').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    notes = notes.filter(x => x.id !== btn.dataset.delNote);
    expandedNotes.delete(btn.dataset.delNote);
    persist(); render();
  }));
}

function bindNoteForm() {
  const ta = $('#f-note-text');
  ta.value = draft.note.text;
  autoGrow(ta);
  ta.addEventListener('input', () => { draft.note.text = ta.value; autoGrow(ta); });
  bindTagPicker($('#f-note-tags'), draft.note.tags);
  $('#f-note-cancel').addEventListener('click', () => { formOpen.notes = false; resetDraft('note'); render(); });
  $('#f-note-save').addEventListener('click', () => {
    const val = draft.note.text.trim();
    if (!val) { ta.focus(); return; }
    notes.push({
      id: uid(), text: val,
      tags: draft.note.tags.slice(),
      createdAt: new Date().toISOString()
    });
    rememberTags(draft.note.tags);
    formOpen.notes = false;
    resetDraft('note');
    persist(); render();
  });
}

/* ================== РАЗДЕЛ: ТЕГИ (аккордеон) ================== */
function entriesForTag(tag) {
  const map = new Map();
  const push = (date, entry) => {
    if (!map.has(date)) map.set(date, []);
    map.get(date).push(entry);
  };
  tasks.forEach(t => {
    if (hasTag(t, tag)) push(t.date || '—', { type: 'task', time: t.time || '', text: t.text });
  });
  notes.forEach(n => {
    if (hasTag(n, tag)) push((n.createdAt || '').slice(0, 10) || '—', { type: 'note', time: (n.createdAt || '').slice(11, 16), text: n.text });
  });
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, arr]) => ({
      date,
      items: arr.sort((x, y) => (y.time || '').localeCompare(x.time || ''))
    }));
}

function itemHTML(it) {
  const badge = it.type === 'task'
    ? '<span class="badge badge-task">задача</span>'
    : '<span class="badge badge-note">заметка</span>';
  const time = it.time ? `<span class="item-time">${esc(it.time)}</span>` : '';
  return `<div class="tag-item">${badge}${time}<span class="item-text">${esc(it.text)}</span></div>`;
}

function dateGroupHTML(g) {
  return `<div class="date-group">
    <div class="date-label">${g.date === '—' ? 'Без даты' : esc(fmtDate(g.date))}</div>
    ${g.items.map(itemHTML).join('')}
  </div>`;
}

function renderTagsView() {
  if (!knownTags.length) {
    app.innerHTML = `<div class="empty">Тегов пока нет.<br>Создайте их в заметках или задачах —<br>и они появятся здесь.</div>`;
    return;
  }
  const groups = knownTags.slice().sort((a, b) => a.localeCompare(b, 'ru')).map(t => {
    const items = entriesForTag(t);
    const count = items.reduce((s, g) => s + g.items.length, 0);
    const open = openGroups.has(tk(t));
    return `<div class="tag-group ${open ? 'is-open' : ''}">
      <button type="button" class="tag-header" data-tag-group="${esc(t)}">
        <span class="tag-name">#${esc(t)}</span>
        <span class="tag-count">${count}</span>
        <span class="chev">&lsaquo;</span>
      </button>
      <div class="tag-body"><div class="tag-body-inner">
        ${items.length
          ? items.map(dateGroupHTML).join('')
          : `<div class="date-group"><div class="date-label">Пока ничего нет</div></div>`}
      </div></div>
    </div>`;
  }).join('');
  app.innerHTML = `<div class="tag-groups">${groups}</div>`;

  app.querySelectorAll('[data-tag-group]').forEach(h => h.addEventListener('click', () => {
    const key = tk(h.dataset.tagGroup);
    openGroups.has(key) ? openGroups.delete(key) : openGroups.add(key);
    render();
  }));
}

/* ================== роутер ================== */
function render() {
  $('#view-title').textContent = { tasks: 'Задачи', notes: 'Заметки', tags: 'Теги' }[view];
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  if (view === 'tasks') renderTasks();
  else if (view === 'notes') renderNotes();
  else renderTagsView();
}

/* ================== уведомления ================== */
function askPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') Notification.requestPermission();
}

function showBanner(t) {
  $('#banner-text').textContent = t.text;
  $('#banner-meta').textContent = [t.date ? fmtDate(t.date) : '', t.time || ''].filter(Boolean).join(', ');
  $('#banner').classList.remove('hidden');
  if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]);
}

function sendSystemNotification(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
    navigator.serviceWorker.getRegistration().then(reg => {
      if (reg) reg.showNotification(title, { body, tag: 'todo-' + Date.now() });
      else new Notification(title, { body });
    }).catch(() => { try { new Notification(title, { body }); } catch (e) {} });
  } else {
    try { new Notification(title, { body }); } catch (e) {}
  }
}

function checkDue() {
  const now = new Date();
  tasks.forEach(t => {
    if (t.notified || t.done || !t.date || !t.time) return;
    const due = new Date(t.date + 'T' + t.time);
    if (!isNaN(due) && now >= due) {
      t.notified = true;
      persist();
      showBanner(t);
      sendSystemNotification('⏰ ' + fmtDate(t.date) + ', ' + t.time, t.text);
    }
  });
}

$('#banner-ok').addEventListener('click', () => $('#banner').classList.add('hidden'));
$('#banner').addEventListener('click', e => { if (e.target === $('#banner')) $('#banner').classList.add('hidden'); });

$('#test-notif').addEventListener('click', async () => {
  if (!('Notification' in window)) { alert('Уведомления не поддерживаются этим браузером'); return; }
  let p = Notification.permission;
  if (p === 'default') p = await Notification.requestPermission();
  if (p !== 'granted') { alert('Разрешение не выдано. Проверьте настройки сайта в браузере.'); return; }
  showBanner({ text: 'Тестовое уведомление — всё работает!', date: '', time: '' });
  sendSystemNotification('🔔 Тест уведомлений', 'Если вы это видите — уведомления работают');
});

/* ================== запуск ================== */
document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => {
  view = b.dataset.view;
  window.scrollTo(0, 0);
  render();
}));

render();
checkDue();
setInterval(checkDue, 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDue(); });

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    if (!sessionStorage.getItem('sw-reloaded')) {
      sessionStorage.setItem('sw-reloaded', '1');
      location.reload();
    }
  });
}
