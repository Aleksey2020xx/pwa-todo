'use strict';

/* ===== Хранилище и утилиты ===== */
const LS = { 
  tasks: 'pwa_tasks', 
  notes: 'pwa_notes', 
  tags: 'pwa_tags', 
  topic: 'pwa_ntfy_topic', 
  markers: 'pwa_markers', 
  calmarks: 'pwa_calmarks' 
};

let tasks = load(LS.tasks, []);
let notes = load(LS.notes, []);
let allTags = load(LS.tags, []);
let markers = load(LS.markers, []);
let calmarks = load(LS.calmarks, {});

const activeFilters = { tasks: new Set(), notes: new Set() };
let pickers = { task: [], notes: [] };

function load(key, def) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : def;
  } catch (e) {
    console.warn('Ошибка чтения localStorage:', e);
    return def;
  }
}

function save() {
  try {
    localStorage.setItem(LS.tasks, JSON.stringify(tasks));
    localStorage.setItem(LS.notes, JSON.stringify(notes));
    localStorage.setItem(LS.tags, JSON.stringify(allTags));
    localStorage.setItem(LS.markers, JSON.stringify(markers));
    localStorage.setItem(LS.calmarks, JSON.stringify(calmarks));
  } catch (e) {
    console.error('Ошибка записи localStorage (возможно, переполнено):', e);
  }
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function esc(s) { 
  if (!s) return '';
  const d = document.createElement('div'); 
  d.textContent = s; 
  return d.innerHTML; 
}
function pad(n) { return String(n).padStart(2, '0'); }

function fmtDate(iso) {
  if (!iso) return 'Без даты';
  const [y, m, d] = iso.split('-').map(Number);
  // Защита от неверных дат
  const dateObj = new Date(y, m - 1, d);
  if (isNaN(dateObj.getTime())) return iso;
  return dateObj.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

/* ===== Push-канал (ntfy) ===== */
function getTopic() {
  let t = localStorage.getItem(LS.topic);
  if (!t) { 
    t = 'siren-' + Math.random().toString(36).slice(2, 10); 
    localStorage.setItem(LS.topic, t); 
  }
  return t;
}

function schedulePush(title, body, when, clickUrl) {
  const diffSec = Math.round((when.getTime() - Date.now()) / 1000);
  
  if (diffSec < 10) {
    showBanner('ntfy: время уже прошло (минимум 10 сек). Локальный баннер сработает.');
    return;
  }
  if (diffSec > 259200) { // 3 дня
    showBanner('ntfy: максимум 3 дня. Push не сработает.');
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
  })
  .then(r => r.text().then(t => {
    if (r.ok) showBanner('Push принят: ' + t.slice(0, 80));
    else showBanner('ntfy отклонил: ' + r.status + ' ' + t);
  }))
  .catch(err => showBanner('ntfy недоступен: ' + err.message));
}

/* ===== Навигация ===== */
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

function switchView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById('view-' + name);
  if (!target) return;
  target.classList.add('active');
  
  document.querySelectorAll('.nav-btn').forEach(b => 
    b.classList.toggle('active', b.dataset.view === name)
  );

  if (name === 'tags') renderTagsView();
  if (name === 'calendar') renderCalendar();
}

/* ===== Попапы ===== */
function openModal(id) { 
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden'); 
}
function closeModal(id) { 
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden'); 
}

document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('click', e => { if (e.target === o) o.classList.add('hidden'); });
});
document.getElementById('dayModalClose')?.addEventListener('click', () => closeModal('dayModal'));
document.getElementById('markerModalClose')?.addEventListener('click', () => closeModal('markerModal'));
document.getElementById('helpCalendarBtn')?.addEventListener('click', () => openModal('helpModal'));
document.getElementById('helpModalClose')?.addEventListener('click', () => closeModal('helpModal'));

/* ===== Пикер тегов ===== */
function renderPicker(which) {
  const box = document.getElementById(which === 'task' ? 'taskTagPicker' : 'noteTagPicker');
  if (!box) return;

  const selected = pickers[which] || [];
  const suggestions = allTags.filter(t => !selected.includes(t));

  box.innerHTML = `
    <div class="chip-input">
      <input type="text" placeholder="новый тег…">
      <button type="button" class="tag-add-btn" title="Добавить тег">✓</button>
    </div>
    ${selected.length ? `
      <div class="picker-label">Выбрано</div>
      <div class="tag-suggest picker-selected">
        ${selected.map(t => `<span class="chip-sel">${esc(t)}<button type="button" data-remove="${esc(t)}">✕</button></span>`).join('')}
      </div>` : ''}
    ${suggestions.length ? `
      <div class="picker-label">Ваши теги</div>
      <div class="tag-suggest picker-suggest">
        ${suggestions.map(t => `<button type="button" class="chip" data-pick="${esc(t)}">${esc(t)}</button>`).join('')}
      </div>` : ''}`;

  // Перевешиваем слушатели (чтобы не дублировать)
  const removeBtns = box.querySelectorAll('[data-remove]');
  removeBtns.forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    pickers[which] = pickers[which].filter(t => t !== b.dataset.remove); 
    renderPicker(which);
  }, { once: false }));

  const pickBtns = box.querySelectorAll('[data-pick]');
  pickBtns.forEach(b => b.addEventListener('click', () => {
    pickers[which].push(b.dataset.pick); 
    renderPicker(which);
  }));

  const inp = box.querySelector('input');
  const addTag = () => {
    const v = inp.value.trim().toLowerCase();
    if (v && !pickers[which].includes(v)) {
      pickers[which].push(v);
      if (!allTags.includes(v)) allTags.push(v);
      save(); 
      renderPicker(which); 
      renderAllFilters();
    }
  };
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') { 
      e.preventDefault(); 
      addTag(); 
    }
  });
  box.querySelector('.tag-add-btn')?.addEventListener('click', addTag);
}

/* ===== Задачи ===== */
document.getElementById('addTaskBtn')?.addEventListener('click', () => {
  const f = document.getElementById('taskForm');
  if (!f) return;
  f.classList.toggle('hidden');
  if (!f.classList.contains('hidden')) {
    pickers.task = []; 
    renderPicker('task');
    const d = new Date(); 
    document.getElementById('taskDate').value = d.toISOString().slice(0, 10);
  }
});

document.getElementById('saveTaskBtn')?.addEventListener('click', () => {
  const text = document.getElementById('taskText').value.trim();
  if (!text) return;
  askPermission();
  const date = document.getElementById('taskDate').value || null;
  const time = document.getElementById('taskTime').value || null;

  const task = {
    id: uid(), 
    text, 
    date, 
    time,
    tags: [...(pickers.task || [])], 
    done: false, 
    notified: false
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
  renderTasks(); 
  renderAllFilters(); 
  renderTagsView(); 
  renderCalendar();
});

function renderTasks() {
  const list = document.getElementById('tasksList');
  if (!list) return;
  
  const flt = activeFilters.tasks;
  const shown = tasks.filter(t => !flt.size || t.tags.some(g => flt.has(g)));

  if (!shown.length) { 
    list.innerHTML = `<div class="empty">${flt.size ? 'Под этим фильтром пусто' : 'Пока задач нет. Добавьте первую!'}</div>`; 
    return; 
  }

  list.innerHTML = shown.map(t => `
    <div class="card${t.done ? ' done' : ''}" id="task-${t.id}">
      <div class="card-top">
        <button class="check${t.done ? ' done' : ''}" data-check="${t.id}" aria-label="Готово"></button>
        <div class="card-body">
          <div class="card-title">${esc(t.text)}</div>
          <div class="card-meta">${t.date ? esc(fmtDate(t.date)) : ''}${t.time ? ' ' + esc(t.time) : ''}</div>
          ${t.tags.length ? `<div class="card-tags">${t.tags.map(g => `<span class="chip">${esc(g)}</span>`).join('')}</div>` : ''}
        </div>
        <button class="del" data-del="${t.id}">✕</button>
      </div>
    </div>`).join('');

  // Слушатели событий
  list.querySelectorAll('[data-check]').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const t = tasks.find(x => x.id === b.dataset.check); 
    if (t) {
      t.done = !t.done; 
      save(); 
      renderTasks(); 
      renderCalendar(); // Обновляем точки в календаре
    }
  }, { once: false }));

  list.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    tasks = tasks.filter(x => x.id !== b.dataset.del); 
    save(); 
    renderTasks(); 
    renderAllFilters(); 
    renderTagsView(); 
    renderCalendar();
  }, { once: false }));
}

/* ===== Заметки ===== */
const noteArea = document.getElementById('noteText');
if (noteArea) {
  noteArea.addEventListener('input', () => { 
    noteArea.style.height = 'auto'; 
    noteArea.style.height = noteArea.scrollHeight + 'px'; 
  });
}

document.getElementById('addNoteBtn')?.addEventListener('click', () => {
  const f = document.getElementById('noteForm');
  if (!f) return;
  f.classList.toggle('hidden');
  if (!f.classList.contains('hidden')) { 
    pickers.note = []; 
    renderPicker('note'); 
    noteArea?.focus(); 
  }
});

document.getElementById('saveNoteBtn')?.addEventListener('click', () => {
  const text = noteArea?.value.trim() || '';
  if (!text) return;
  notes.unshift({ id: uid(), text, tags: [...(pickers.note || [])], created: new Date().toISOString() });
  save();
  noteArea.value = ''; 
  noteArea.style.height = 'auto';
  document.getElementById('noteForm').classList.add('hidden');
  renderNotes(); 
  renderAllFilters(); 
  renderTagsView();
});

function renderNotes() {
  const list = document.getElementById('notesList');
  if (!list) return;

  const flt = activeFilters.notes;
  const shown = notes.filter(n => !flt.size || n.tags.some(g => flt.has(g)));

  if (!shown.length) { 
    list.innerHTML = `<div class="empty">${flt.size ? 'Под этим фильтром пусто' : 'Пока заметок нет.'}</div>`; 
    return; 
  }

  list.innerHTML = shown.map(n => `
    <div class="card" id="note-${n.id}">
      <div class="card-top"><div class="card-body">
        <div class="card-title">${esc(n.text)}</div>
        <div class="card-note-text">${esc(n.text)}</div>
        ${n.tags.length ? `<div class="card-tags">${n.tags.map(g => `<span class="chip">${esc(g)}</span>`).join('')}</div>` : ''}
      </div>
      <button class="del" data-del="${n.id}">✕</button></div>
    </div>`).join('');

    list.querySelectorAll('.card').forEach(c => c.addEventListener('click', () => {
    c.classList.toggle('expanded');
  }));

  list.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    notes = notes.filter(x => x.id !== b.dataset.del);
    save();
    renderNotes();
    renderAllFilters();
    renderTagsView();
  }, { once: false }));
}

/* ===== Фильтры по тегам ===== */
function renderAllFilters() {
  renderFilter('tasks', tasks.flatMap(t => t.tags));
  renderFilter('notes', notes.flatMap(n => n.tags));
}

function renderFilter(section, src) {
  const box = document.getElementById(section + 'TagFilter');
  if (!box) return;

  const flt = activeFilters[section];
  const uniq = [...new Set(src)].sort();

  box.innerHTML = uniq.map(t => `
    <button class="chip${flt.has(t) ? ' active' : ''}"
            data-filter="${esc(t)}"
            data-section="${section}">
      #${esc(t)}
    </button>`).join('');

  // Перевешиваем слушатели
  box.querySelectorAll('[data-filter]').forEach(b => {
    b.addEventListener('click', () => {
      const t = b.dataset.filter;
      const s = b.dataset.section;
      if (flt.has(t)) flt.delete(t);
      else flt.add(t);

      if (s === 'tasks') renderTasks();
      else renderNotes();

      renderFilter(s, s === 'tasks'
        ? tasks.flatMap(x => x.tags)
        : notes.flatMap(x => x.tags));
    }, { once: false });
  });
}

/* ===== Раздел «Списки»: панель push + аккордеон тегов ===== */
function renderPushPanel() {
  const box = document.getElementById('pushPanel');
  if (!box) return;

  const topic = getTopic();
  box.innerHTML = `
    <div class="card-title">Push-канал (ntfy)</div>
    <div class="push-topic">${esc(topic)}</div>
    <p class="hint" style="margin:8px 0 0">
      Установите приложение ntfy, добавьте подписку на эту тему — и уведомления будут приходить даже при закрытом приложении.
    </p>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="chip" id="copyTopicBtn">Копировать тему</button>
      <a class="chip" style="text-decoration:none"
         href="https://ntfy.sh/#/${esc(topic)}"
         target="_blank" rel="noopener">Открыть на ntfy.sh</a>
    </div>`;

  document.getElementById('copyTopicBtn')?.addEventListener('click', () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(topic).then(() => {
        showBanner('Тема скопирована!');
      }).catch(() => {
        showBanner('Не удалось скопировать тему');
      });
    }
  });
}

function renderTagsView() {
  renderPushPanel();
  const box = document.getElementById('tagsAccordion');
  if (!box) return;

  const groups = {};

  function addGroup(gObj, tag, item) {
    gObj[tag] = gObj[tag] || { items: [] };
    gObj[tag].items.push(item);
  }

  tasks.forEach(t => t.tags.forEach(g => addGroup(groups, g, { type: 'task', item: t })));
  notes.forEach(n => n.tags.forEach(g => addGroup(groups, g, { type: 'note', item: n })));

  const keys = Object.keys(groups).sort((a, b) =>
    groups[b].items.length - groups[a].items.length
  );

  if (!keys.length) {
    box.innerHTML = '<div class="empty">Теги появятся здесь, как только вы что-то добавите.</div>';
    return;
  }

  box.innerHTML = keys.map(g => {
    const items = groups[g].items
      .map(x => ({
        ...x,
        sortDate: x.type === 'task'
          ? (x.item.date || '9999')
          : (x.item.created || '').slice(0, 10)
      }))
      .sort((a, b) => a.sortDate.localeCompare(b.sortDate));

    const byDate = {};
    items.forEach(x => {
      const d = x.type === 'task'
        ? (x.item.date || '9999')
        : (x.item.created || '').slice(0, 10);
      (byDate[d] = byDate[d] || []).push(x);
    });

    const inner = Object.keys(byDate).map(d => {
      return `<div class="date-head">${esc(fmtDate(d === '9999' ? null : d))}</div>
        ${byDate[d].map(x => `
          <a class="acc-item"
             href="#${x.type === 'task' ? 'task-' : 'note-'}${x.item.id}"
             data-type="${x.type}"
             data-id="${x.item.id}">
            ${esc((x.type === 'task'
              ? x.item.text
              : x.item.text.split('\n')[0]).slice(0, 60))}
            <span class="badge">${x.type === 'task' ? 'задача' : 'заметка'}</span>
            ${x.type === 'task' && x.item.time ? ` <small>${esc(x.item.time)}</small>` : ''}
          </a>`).join('')}`;
    }).join('');

    return `<div class="acc">
      <button class="acc-head">#${esc(g)} <span class="arrow">›</span></button>
      <div class="acc-body"><div class="acc-inner">${inner}</div></div>
    </div>`;
  }).join('');

  box.querySelectorAll('.acc-head').forEach(h => {
    h.addEventListener('click', () => {
      h.parentElement.classList.toggle('open');
    }, { once: false });
  });

  box.querySelectorAll('.acc-item').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = a.getAttribute('href').slice(1);
      const type = a.dataset.type;

      // Переключаем вид
      switchView(type === 'task' ? 'tasks' : 'notes');

      // Сбрасываем фильтры (чтобы видеть все по этому тегу)
      activeFilters.tasks.clear();
      activeFilters.notes.clear();

      // Принудительно перерисовываем списки
      if (type === 'task') renderTasks();
      else renderNotes();

      setTimeout(() => {
        const el = document.getElementById(targetId);
        if (!el) return;
        // Подсветка карточки (для «Сирени»)
        el.classList.add('highlight');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Убираем подсветку через 2 секунды
        setTimeout(() => el.classList.remove('highlight'), 2000);

        if (type === 'note') el.classList.add('expanded');
      }, 150);
    }, { once: false });
  });
}

/* ===== Календарь ===== */
function renderCalendar() {
  const cal = document.getElementById('calendarGrid');
  if (!cal) return;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0–11

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = firstDay.getDay(); // 0=вс, 1=пн, ...
  const totalDays = lastDay.getDate();

  const markersByDate = {};
  markers.forEach(m => {
    if (!m.date) return;
    markersByDate[m.date] = markersByDate[m.date] || [];
    markersByDate[m.date].push(m);
  });

  const calmarksByDate = calmarks; // уже объект по датам

  let html = '';
  // Дни недели
  const weekDays = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  html += '<div class="cal-header">' + weekDays.map(wd => `<div class="cal-cell">${wd}</div>`).join('') + '</div>';

  // Пустые ячейки до 1-го числа
  for (let i = 0; i < startOffset; i++) {
    html += '<div class="cal-cell other"></div>';
  }

  // Дни месяца
  for (let d = 1; d <= totalDays; d++) {
    const iso = `${year}-${pad(month + 1)}-${pad(d)}`;

    // Считаем задачи и заметки на этот день
    const tasksToday = tasks.filter(t => t.date === iso && !t.done).length;
    const notesToday = notes.filter(n => {
      const nDate = (n.created || '').slice(0, 10);
      return nDate === iso;
    }).length;

    // Маркеры
    const marks = [...(markersByDate[iso] || [])];
    const customMarks = calmarksByDate[iso] || [];

    let markHtml = '';
    marks.concat(customMarks).forEach(m => {
      markHtml += `<div class="cal-marker" style="--color:${m.color || '#aaa'}">●</div>`;
    });

    html += `
      <div class="cal-cell" data-date="${iso}">
        <div class="cal-day-num">${d}</div>
        ${markHtml ? `<div class="cal-marks">${markHtml}</div>` : ''}
        ${tasksToday || notesToday
          ? `<div class="cal-count">${tasksToday ? tasksToday : ''}${notesToday ? ' • ' + notesToday : ''}</div>`
          : ''}
      </div>`;
  }

  cal.innerHTML = html;

  // Обработка клика по дню — открытие попапа дня
  cal.querySelectorAll('.cal-cell:not(.other)').forEach(cell => {
    cell.addEventListener('click', () => {
      const date = cell.getAttribute('data-date');
      document.getElementById('dayDateInput').value = date;
      openModal('dayModal');
    }, { once: false });
  });
}

/* ===== Маркеры (кастомные) ===== */
document.getElementById('saveMarkerBtn')?.addEventListener('click', () => {
  const name = document.getElementById('markerName').value.trim();
  const color = document.getElementById('markerColor').value;
  if (!name) return;
  markers.push({ id: uid(), name, color });
  save();
  closeModal('markerModal');
  renderCalendar();
});

/* ===== Вспомогательные ===== */
// Если есть баннер-функция — она должна быть объявлена где-то в main.js или index.html
// Здесь просто заглушка, чтобы не было ошибки, если её нет
if (typeof showBanner === 'undefined') {
  window.showBanner = (msg) => {
    console.log('[banner]', msg);
    // Можно раскомментировать, если нужен простой алерт:
    // alert(msg);
  };
}

// Если есть askPermission — тоже заглушка
if (typeof askPermission === 'undefined') {
  window.askPermission = () => { /* ничего не делаем, если нет реализации */ };
}

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
  renderTasks();
  renderNotes();
  renderAllFilters();
  renderTagsView();
  renderCalendar();
  // Подсветка по URL (переход по ?task=...)
  const params = new URLSearchParams(location.search);
  const taskId = params.get('task');
  const noteId = params.get('note');
  if (taskId) {
    setTimeout(() => {
      const el = document.getElementById(`task-${taskId}`);
      if (el) {
        switchView('tasks');
        el.classList.add('highlight');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => el.classList.remove('highlight'), 2000);
      }
    }, 100);
  } else if (noteId) {
    setTimeout(() => {
      const el = document.getElementById(`note-${noteId}`);
      if (el) {
        switchView('notes');
        el.classList.add('highlight');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('expanded');
        setTimeout(() => el.classList.remove('highlight'), 2000);
      }
    }, 100);
  }
});
