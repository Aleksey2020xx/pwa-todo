// ===== Хранилище (localStorage) =====
const store = {
  get(key, def) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v === null ? def : v; }
    catch (e) { return def; }
  },
  set(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
};

let tasks   = store.get('pt_tasks', []);
let notes   = store.get('pt_notes', []);
let allTags = store.get('pt_tags', []);

function saveAll() {
  store.set('pt_tasks', tasks);
  store.set('pt_notes', notes);
  store.set('pt_tags', allTags);
}

function addTagName(tag) {
  const t = (tag || '').trim();
  if (!t) return false;
  const exists = allTags.some(x => x.toLowerCase() === t.toLowerCase());
  if (!exists) allTags.push(t);
  saveAll();
  return true;
}

// ===== Состояние =====
let currentTab = 'tasks';
const taskFilterTags = new Set();
const noteFilterTags = new Set();
let taskFormTags = [];
let noteFormTags = [];
let editingTagPickerRenderQueued = false;

// ===== Утилиты =====
const $ = (id) => document.getElementById(id);
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtDate(iso) {
  if (!iso) return 'Без даты';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return iso;
  const now = new Date();
  const opts = { day: 'numeric', month: 'long' };
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('ru-RU', opts);
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// ===== Пикер тегов =====
function renderTagPicker(containerId, selectedArr) {
  const box = $(containerId);
  if (!box) return;
  const suggestions = allTags.filter(t =>
    !selectedArr.some(s => s.toLowerCase() === t.toLowerCase())
  );
  let html = '';
  if (suggestions.length) {
    html += '<div class="tag-suggest">' + suggestions.map(t =>
      '<button type="button" class="suggest-chip" data-add="' + esc(t) + '">' + esc(t) + '</button>'
    ).join('') + '</div>';
  }
  html += '<div class="selected-chips">' + selectedArr.map((t, i) =>
    '<span class="chip">' + esc(t) + '<span class="chip-x" data-idx="' + i + '">×</span></span>'
  ).join('') + '</div>';
  html += '<div class="tag-input-wrap"><input type="text" class="tag-input" placeholder="Новый тег — Enter или запятая"></div>';
  box.innerHTML = html;

  box.querySelectorAll('.suggest-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedArr.push(btn.dataset.add);
      renderTagPicker(containerId, selectedArr);
    });
  });
  box.querySelectorAll('.chip-x').forEach(x => {
    x.addEventListener('click', () => {
      selectedArr.splice(parseInt(x.dataset.idx, 10), 1);
      renderTagPicker(containerId, selectedArr);
    });
  });
  const input = box.querySelector('.tag-input');
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const v = input.value.replace(/,/g, '').trim();
      if (v) selectedArr.push(v);
      input.value = '';
      renderTagPicker(containerId, selectedArr);
    }
  });
  input.addEventListener('input', () => {
    if (input.value.includes(',')) {
      input.value.split(',').map(s => s.trim()).filter(Boolean).forEach(v => selectedArr.push(v));
      input.value = '';
      renderTagPicker(containerId, selectedArr);
    }
  });
}

// ===== Навигация =====
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab').forEach(s => s.classList.toggle('active', s.id === 'tab-' + tab));
  if (tab === 'tags') renderTagsSection();
}

// ===== Задачи =====
$('add-task-btn').addEventListener('click', () => {
  const f = $('task-form');
  f.hidden = !f.hidden;
  if (!f.hidden) {
    $('task-date').value = new Date().toISOString().slice(0, 10);
    $('task-time').value = '';
    $('task-text').value = '';
    taskFormTags = [];
    renderTagPicker('task-tag-picker', taskFormTags);
    $('task-text').focus();
  }
});
$('task-cancel').addEventListener('click', () => { $('task-form').hidden = true; });

$('task-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('task-text').value.trim();
  if (!text) return;
  tasks.push({
    id: uid(),
    text: text,
    date: $('task-date').value || new Date().toISOString().slice(0, 10),
    time: $('task-time').value || '',
    tags: [...taskFormTags],
    done: false,
    notified: false
  });
  taskFormTags.forEach(addTagName);
  saveAll();
  $('task-form').hidden = true;
  renderTasks();
  renderTagFilterChips();
});

function taskDue(t) {
  if (!t.time) return null;
  const d = new Date(t.date + 'T' + t.time);
  return isNaN(d) ? null : d;
}

function renderTasks() {
  const list = $('task-list');
  const items = tasks.filter(t =>
    taskFilterTags.size === 0 || t.tags.some(tg => taskFilterTags.has(tg.toLowerCase()))
  );
  items.sort((a, b) => {
    const da = taskDue(a) || new Date(8640000000000000);
    const db = taskDue(b) || new Date(8640000000000000);
    return da - db;
  });
  $('task-empty').hidden = tasks.length > 0;
  list.innerHTML = items.map(t => {
    const due = taskDue(t);
    const meta = fmtDate(t.date) + (t.time ? ', ' + t.time : '') + (due && due < new Date() && !t.done ? ' · просрочено' : '');
    return '<div class="card task-card' + (t.done ? ' done-card' : '') + '">' +
      '<div class="item-top">' +
        '<button class="check' + (t.done ? ' done' : '') + '" data-id="' + t.id + '">✓</button>' +
        '<div class="item-main"><div class="item-text">' + esc(t.text) + '</div>' +
        '<div class="item-meta">' + meta + '</div></div>' +
        '<button class="del-btn" data-del="' + t.id + '">🗑</button>' +
      '</div>' +
      (t.tags.length ? '<div class="item-tags">' + t.tags.map(tg => '<span class="chip">' + esc(tg) + '</span>').join('') + '</div>' : '') +
    '</div>';
  }).join('');

  list.querySelectorAll('.check').forEach(c => c.addEventListener('click', () => {
    const t = tasks.find(x => x.id === c.dataset.id);
    if (t) { t.done = !t.done; if (t.done) t.notified = true; saveAll(); renderTasks(); }
  }));
  list.querySelectorAll('.del-btn').forEach(d => d.addEventListener('click', () => {
    tasks = tasks.filter(x => x.id !== d.dataset.del);
    saveAll(); renderTasks(); renderTagFilterChips();
  }));
}

// ===== Заметки =====
$('add-note-btn').addEventListener('click', () => {
  const f = $('note-form');
  f.hidden = !f.hidden;
  if (!f.hidden) {
    $('note-text').value = '';
    noteFormTags = [];
    renderTagPicker('note-tag-picker', noteFormTags);
    autoGrow($('note-text'));
    $('note-text').focus();
  }
});
$('note-cancel').addEventListener('click', () => { $('note-form').hidden = true; });

$('note-text').addEventListener('input', () => autoGrow($('note-text')));
function autoGrow(el) { el.style.height = 'auto'; el.style.height = (el.scrollHeight + 2) + 'px'; }

$('note-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('note-text').value.trim();
  if (!text) return;
  notes.push({ id: uid(), text: text, createdAt: new Date().toISOString().slice(0, 10), tags: [...noteFormTags] });
  noteFormTags.forEach(addTagName);
  saveAll();
  $('note-form').hidden = true;
  renderNotes();
  renderTagFilterChips();
});

function renderNotes() {
  const list = $('note-list');
  const items = notes.filter(n =>
    noteFilterTags.size === 0 || n.tags.some(tg => noteFilterTags.has(tg.toLowerCase()))
  );
  items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  $('note-empty').hidden = notes.length > 0;
  list.innerHTML = items.map(n =>
    '<div class="card note-card" data-note="' + n.id + '">' +
      '<div class="item-top"><div class="item-main">' +
        '<div class="note-preview note-toggle">' + esc(n.text) + '</div>' +
        '<div class="item-meta">' + fmtDate(n.createdAt) + '</div>' +
      '</div>' +
      '<button class="del-btn" data-del-note="' + n.id + '">🗑</button></div>' +
      (n.tags.length ? '<div class="item-tags">' + n.tags.map(tg => '<span class="chip">' + esc(tg) + '</span>').join('') + '</div>' : '') +
    '</div>'
  ).join('');

  list.querySelectorAll('.note-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.del-btn') || e.target.closest('.chip')) return;
      const n = notes.find(x => x.id === card.dataset.note);
      if (!n) return;
      const body = card.querySelector('.note-preview');
      if (body.classList.contains('note-preview')) {
        const div = document.createElement('div');
        div.className = 'note-full';
        div.textContent = n.text;
        body.replaceWith(div);
      } else {
        const div = document.createElement('div');
        div.className = 'note-preview note-toggle';
        div.textContent = n.text;
        body.replaceWith(div);
      }
    });
  });
  list.querySelectorAll('.del-btn').forEach(d => d.addEventListener('click', () => {
    notes = notes.filter(x => x.id !== d.dataset.delNote);
    saveAll(); renderNotes(); renderTagFilterChips();
  }));
}

// ===== Плашки фильтров =====
function renderTagFilterChips() {
  const conf = [
    { el: 'task-filter', tags: taskFilterTags },
    { el: 'note-filter', tags: noteFilterTags }
  ];
  conf.forEach(c => {
    const box = $(c.el);
    if (!allTags.length) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = allTags.map(t => {
      const sel = c.tags.has(t.toLowerCase());
      return '<button class="filter-chip' + (sel ? ' selected' : '') + '" data-ftag="' + esc(t) + '">' + esc(t) + '</button>';
    }).join('');
    box.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const key = chip.dataset.ftag.toLowerCase();
        if (c.tags.has(key)) c.tags.delete(key); else c.tags.add(key);
        renderTagFilterChips();
        renderTasks();
        renderNotes();
      });
    });
  });
}

// ===== Раздел тегов (аккордеон) =====
function renderTagsSection() {
  const box = $('tag-accordion');
  $('tags-empty').hidden = allTags.length > 0;
  const sorted = [...allTags].sort((a, b) => a.localeCompare(b, 'ru'));

  box.innerHTML = sorted.map(tag => {
    const key = tag.toLowerCase();
    const tItems = tasks.filter(t => t.tags.some(x => x.toLowerCase() === key));
    const nItems = notes.filter(n => n.tags.some(x => x.toLowerCase() === key));
    const total = tItems.length + nItems.length;
    if (total === 0) return '';

    // группировка по датам
    const groups = new Map();
    tItems.forEach(t => {
      const k = t.date || 'Без даты';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push({ type: 'task', obj: t });
    });
    nItems.forEach(n => {
      const k = n.createdAt || 'Без даты';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push({ type: 'note', obj: n });
    });
    const groupKeys = [...groups.keys()].sort();
    const groupsHtml = groupKeys.map(k => {
      const rows = groups.get(k).map(it => {
        const isTask = it.type === 'task';
        const badge = isTask ? '<span class="badge">задача</span>' : '<span class="badge" style="background:#e9e4f6">заметка</span>';
        const time = isTask && it.obj.time ? '<span class="badge time">' + it.obj.time + '</span>' : '';
        return '<div class="tag-item-row"><div class="tag-item-top">' + badge + time +
          '<span class="tag-item-text">' + esc(it.obj.text) + '</span></div></div>';
      }).join('');
      return '<div class="date-head">' + esc(fmtDate(k)) + '</div>' + rows;
    }).join('');

    return '<div class="acc-item">' +
      '<button class="acc-head" data-tag="' + esc(tag) + '">' +
        '<span>' + esc(tag) + '<span class="acc-count">' + total + '</span></span>' +
        '<span class="acc-arrow">▸</span>' +
      '</button>' +
      '<div class="acc-body"><div class="acc-inner"><div class="acc-content">' + groupsHtml + '</div></div></div>' +
    '</div>';
  }).join('');

  box.querySelectorAll('.acc-head').forEach(head => {
    head.addEventListener('click', () => head.parentElement.classList.toggle('open'));
  });
}

// ===== Уведомления =====
function showBanner(text) {
  $('banner-text').textContent = text;
  $('banner').hidden = false;
  if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 300]);
}
$('banner-ok').addEventListener('click', () => { $('banner').hidden = true; });

async function sendSystemNotification(title, body) {
  if (!('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;
  try {
    if (navigator.serviceWorker) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, { body: body, icon: 'icon-192.png', tag: 'pt-' + Date.now() });
      return true;
    }
  } catch (e) { /* пробуем без SW */ }
  try { new Notification(title, { body: body }); return true; } catch (e2) { return false; }
}

async function requestPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const r = await Notification.requestPermission();
  return r === 'granted';
}

$('bell-btn').addEventListener('click', async () => {
  const ok = await requestPermission();
  if (!ok) {
    showBanner('Уведомления заблокированы. Разрешите их в настройках браузера.');
    return;
  }
  showBanner('Тестовое уведомление — всё работает!');
  const sent = await sendSystemNotification('Проверка', 'Уведомления включены ✓');
  if (!sent) showBanner('Системное уведомление не прошло — но баннер в приложении работает.');
});

// Проверка наступивших задач — каждые 15 секунд + при возврате во вкладку
function checkDue() {
  const now = Date.now();
  tasks.forEach(t => {
    if (t.done || t.notified) return;
    const due = taskDue(t);
    if (due && due.getTime() <= now) {
      t.notified = true;
      saveAll();
      showBanner(t.text);
      sendSystemNotification('Пора делать!', t.text);
    }
  });
  renderTasks();
}
setInterval(checkDue, 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDue(); });

// ===== Service Worker с автообновлением =====
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      if (nw) nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          location.reload();
        }
      });
    });
  }).catch(() => {});
}

// ===== Первый запуск =====
renderTagPicker('task-tag-picker', taskFormTags);
renderTagPicker('note-tag-picker', noteFormTags);
renderTasks();
renderNotes();
renderTagFilterChips();
