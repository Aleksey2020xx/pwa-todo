const $ = s => document.querySelector(s);

const LS = { tasks: 'todo_tasks_v3', notes: 'note_notes_v3', tags: 'note_tags_v3' };
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
let tasks = load(LS.tasks, []);
let notes = load(LS.notes, []);
let tags  = load(LS.tags, []);
let currentTags = [];

const save = () => {
  localStorage.setItem(LS.tasks, JSON.stringify(tasks));
  localStorage.setItem(LS.notes, JSON.stringify(notes));
  localStorage.setItem(LS.tags, JSON.stringify(tags));
};

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 2200);
}

function ensurePermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

/* ---------- Навигация ---------- */
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    $('#view-' + btn.dataset.view).classList.add('active');
  });
});

/* ---------- Задачи ---------- */
$('#add-task-btn').addEventListener('click', () => {
  const f = $('#task-form');
  f.classList.toggle('hidden');
  if (!f.classList.contains('hidden')) {
    const d = new Date();
    $('#task-date').value = d.toISOString().slice(0, 10);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    $('#task-time').value = h + ':' + m;
    $('#task-text').focus();
  }
});

$('#task-form').addEventListener('submit', e => {
  e.preventDefault();
  tasks.push({
    id: Date.now(),
    text: $('#task-text').value.trim(),
    date: $('#task-date').value,
    time: $('#task-time').value,
    done: false,
    notified: false
  });
  save();
  $('#task-form').reset();
  $('#task-form').classList.add('hidden');
  renderTasks();
  ensurePermission();
  toast('Задача добавлена');
});

function fmtMeta(t) {
  const [y, mo, d] = t.date.split('-');
  return t.time + ' · ' + d + '.' + mo;
}

function renderTasks() {
  const ul = $('#task-list');
  ul.innerHTML = '';
  const sorted = [...tasks].sort((a, b) =>
    (a.done - b.done) || ((a.date + a.time) < (b.date + b.time) ? -1 : 1));
  if (!sorted.length) {
    ul.innerHTML = '<div class="empty">Пока пусто. Добавьте первую задачу 👆</div>';
    return;
  }
  sorted.forEach(t => {
    const li = document.createElement('li');
    li.className = 'item' + (t.done ? ' done' : '');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'check';
    cb.checked = t.done;
    cb.addEventListener('change', () => { t.done = cb.checked; save(); renderTasks(); });
    const body = document.createElement('div');
    body.className = 'body';
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = t.text;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = fmtMeta(t);
    body.append(title, meta);
    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '✕';
    del.addEventListener('click', () => {
      tasks = tasks.filter(x => x.id !== t.id);
      save();
      renderTasks();
    });
    li.append(cb, body, del);
    ul.appendChild(li);
  });
}

/* ---------- Заметки ---------- */
const ta = $('#note-text');
ta.addEventListener('input', () => {
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 240) + 'px';
});

$('#add-note-btn').addEventListener('click', () => {
  const f = $('#note-form');
  f.classList.toggle('hidden');
  if (!f.classList.contains('hidden')) {
    ta.focus();
    renderSuggest();
  }
});

function renderCurrentTags() {
  const box = $('#tag-chips');
  box.innerHTML = '';
  currentTags.forEach(tag => {
    const c = document.createElement('button');
    c.type = 'button';
    c.className = 'chip';
    c.innerHTML = tag + ' <span class="x">×</span>';
    c.addEventListener('click', () => {
      currentTags = currentTags.filter(t => t !== tag);
      renderCurrentTags();
      renderSuggest();
    });
    box.appendChild(c);
  });
}

function renderSuggest() {
  const box = $('#tag-suggest');
  const avail = tags.filter(t => !currentTags.includes(t));
  if (!avail.length) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  box.innerHTML = '';
  avail.forEach(tag => {
    const c = document.createElement('button');
    c.type = 'button';
    c.className = 'chip';
    c.textContent = tag;
    c.addEventListener('click', () => {
      currentTags.push(tag);
      renderCurrentTags();
      renderSuggest();
    });
    box.appendChild(c);
  });
}

$('#tag-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const v = $('#tag-input').value.trim().replace(/,+$/, '');
    if (v && !currentTags.includes(v)) {
      currentTags.push(v);
      renderCurrentTags();
      renderSuggest();
    }
    $('#tag-input').value = '';
  }
});

$('#note-form').addEventListener('submit', e => {
  e.preventDefault();
  const text = ta.value.trim();
  if (!text) return;
  notes.unshift({ id: Date.now(), text, tags: [...currentTags] });
  currentTags.forEach(t => { if (!tags.includes(t)) tags.push(t); });
  save();
  currentTags = [];
  ta.value = '';
  ta.style.height = 'auto';
  $('#tag-input').value = '';
  renderCurrentTags();
  renderSuggest();
  $('#note-form').classList.add('hidden');
  renderNotes();
  toast('Заметка сохранена');
});

function renderNotes() {
  const ul = $('#note-list');
  ul.innerHTML = '';
  if (!notes.length) {
    ul.innerHTML = '<div class="empty">Заметок пока нет. Создайте первую 👆</div>';
    return;
  }
  notes.forEach(n => {
    const li = document.createElement('li');
    li.className = 'item';
    const body = document.createElement('div');
    body.className = 'body';
    const prev = document.createElement('div');
    prev.className = 'note-preview';
    prev.textContent = n.text;
    prev.addEventListener('click', () => li.classList.toggle('expanded'));
    const full = document.createElement('div');
    full.className = 'note-full';
    full.textContent = n.text;
    body.append(prev, full);
    if (n.tags.length) {
      const tw = document.createElement('div');
      tw.className = 'note-tags';
      n.tags.forEach(tag => {
        const c = document.createElement('span');
        c.className = 'chip';
        c.textContent = tag;
        tw.appendChild(c);
      });
      body.appendChild(tw);
    }
    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '✕';
    del.addEventListener('click', () => {
      notes = notes.filter(x => x.id !== n.id);
      save();
      renderNotes();
    });
    li.append(body, del);
    ul.appendChild(li);
  });
}

/* ---------- Проверка времени и уведомления ---------- */
function checkDue() {
  const now = new Date();
  let changed = false;
  tasks.forEach(t => {
    if (!t.done && !t.notified) {
      const dt = new Date(t.date + 'T' + t.time);
      if (dt <= now) {
        t.notified = true;
        changed = true;
        showBanner(t);
        notify(t);
      }
    }
  });
  if (changed) save();
}

function showBanner(t) {
  $('#banner-text').textContent = t.time + ' — ' + t.text;
  $('#banner').classList.remove('hidden');
  if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]);
}

$('#banner-ok').addEventListener('click', () => $('#banner').classList.add('hidden'));

function notify(t) {
  const title = '⏰ ' + t.time + ' — пора!';
  const body = t.text;
  const opts = { body, vibrate: [300, 150, 300, 150, 300] };
  if ('serviceWorker' in navigator && 'Notification' in window) {
    navigator.serviceWorker.getRegistration().then(reg => {
      if (reg && Notification.permission === 'granted') {
        reg.showNotification(title, opts).catch(() => plainNotify(title, body, opts));
      } else {
        plainNotify(title, body, opts);
      }
    });
  } else {
    plainNotify(title, body, opts);
  }
}

function plainNotify(title, body, opts) {
  if ('Notification' in window && Notification.permission === 'granted') {
    try { new Notification(title, opts); } catch (e) {}
  }
}

$('#bell').addEventListener('click', () => {
  if (!('Notification' in window)) { toast('Уведомления не поддерживаются'); return; }
  if (Notification.permission === 'denied') {
    toast('Уведомления заблокированы в настройках браузера');
    return;
  }
  ensurePermission();
  setTimeout(() => {
    if (Notification.permission === 'granted') {
      notify({ time: 'Тест', text: 'Уведомления работают! 🔔' });
      showBanner({ time: 'Тест', text: 'Уведомления работают! 🔔' });
    } else {
      toast('Разрешение ещё не выдано');
    }
  }, 300);
});

setInterval(checkDue, 15000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { checkDue(); renderTasks(); }
});

renderTasks();
renderNotes();
