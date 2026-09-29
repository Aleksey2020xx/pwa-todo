const LS_KEY = 'todo_tasks_v2';
const GRACE_MS = 10 * 60 * 1000; // не напоминать о задачах старше 10 минут

let tasks = [];

// ---------- Хранилище ----------
function loadTasks() {
  try { tasks = JSON.parse(localStorage.getItem(LS_KEY)) || []; }
  catch (e) { tasks = []; }
}
function saveTasks() {
  localStorage.setItem(LS_KEY, JSON.stringify(tasks));
}

// ---------- Service Worker ----------
async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try { await navigator.serviceWorker.register('sw.js'); }
  catch (e) { console.warn('SW не зарегистрирован:', e); }
}

// ---------- Разрешение на уведомления ----------
function notificationsSupported() {
  return 'Notification' in window;
}

function requestPermission() {
  if (!notificationsSupported()) return Promise.resolve('unsupported');
  if (Notification.permission === 'granted') return Promise.resolve('granted');
  return Notification.requestPermission().then(p => {
    updatePermBanner();
    if (p === 'granted') registerSW();
    return p;
  });
}

function updatePermBanner() {
  const banner = document.getElementById('permBanner');
  if (!notificationsSupported() || Notification.permission === 'granted') {
    banner.classList.add('hidden');
  } else {
    banner.classList.remove('hidden');
  }
}

// ---------- Показ уведомления ----------
async function showNotification(t) {
  const title = '\u23F0 Пора делать!';
  const body = t.text;
  const options = { body, tag: t.id, vibrate: [300, 150, 300, 150, 300] };

  // Сначала пробуем через Service Worker (надёжнее для установленных PWA)
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) { await reg.showNotification(title, options); return; }
    }
  } catch (e) { /* падаем ниже */ }

  // Запасной путь — обычный конструктор (работает на открытом экране)
  if (notificationsSupported() && Notification.permission === 'granted') {
    try { new Notification(title, options); return; } catch (e) { /* падаем ниже */ }
  }

  // Если системное уведомление не получилось — показать баннер внутри приложения
  showAlarmBanner(t);
}

// ---------- Назойливый баннер внутри приложения ----------
function showAlarmBanner(t) {
  const alarm = document.getElementById('alarm');
  document.getElementById('alarmText').textContent = t.text;
  alarm.classList.remove('hidden');
  if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]);
}

// ---------- Проверка времени: тикает каждые 15 секунд ----------
function checkDue() {
  const now = Date.now();
  let changed = false;

  for (const t of tasks) {
    if (t.done || t.notified) continue;
    const due = new Date(t.date + 'T' + t.time + ':00').getTime();
    if (now >= due && now - due < GRACE_MS) {
      t.notified = true;
      changed = true;
      showNotification(t);
      // Баннер показываем всегда — это гарантированная «назойливость» на открытом экране
      showAlarmBanner(t);
    }
  }
  if (changed) { saveTasks(); render(); }
}

// ---------- Рендер ----------
function fmtMeta(t) {
  const d = new Date(t.date + 'T00:00:00');
  const days = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const today = new Date();
  const isToday = t.date === today.toISOString().slice(0, 10);
  const base = (isToday ? 'сегодня' : days[d.getDay()] + ', ' + d.getDate() + ' ' + months[d.getMonth()]);
  return base + ' \u00B7 ' + t.time;
}

function render() {
  const list = document.getElementById('list');
  const empty = document.getElementById('empty');
  list.innerHTML = '';

  const sorted = [...tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return new Date(a.date + 'T' + a.time) - new Date(b.date + 'T' + b.time);
  });

  sorted.forEach(t => {
    const li = document.createElement('li');
    li.className = t.done ? 'done' : '';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'task-check';
    cb.checked = t.done;
    cb.addEventListener('change', () => {
      t.done = cb.checked;
      saveTasks();
      render();
    });

    const body = document.createElement('div');
    body.className = 'task-body';
    const txt = document.createElement('div');
    txt.className = 'task-text';
    txt.textContent = t.text;
    const meta = document.createElement('div');
    meta.className = 'task-meta';
    meta.textContent = fmtMeta(t);
    body.appendChild(txt);
    body.appendChild(meta);

    const due = document.createElement('div');
    due.className = 'task-due';
    due.textContent = t.time;

    const del = document.createElement('button');
    del.className = 'del-btn';
    del.textContent = '\u2715';
    del.addEventListener('click', () => {
      tasks = tasks.filter(x => x.id !== t.id);
      saveTasks();
      render();
    });

    li.appendChild(cb);
    li.appendChild(body);
    li.appendChild(due);
    li.appendChild(del);
    list.appendChild(li);
  });

  empty.classList.toggle('hidden', tasks.length > 0);
}

// ---------- События ----------
document.getElementById('addForm').addEventListener('submit', e => {
  e.preventDefault();
  const text = document.getElementById('taskInput').value.trim();
  const date = document.getElementById('dateInput').value;
  const time = document.getElementById('timeInput').value;
  if (!text || !date || !time) return;

  tasks.push({
    id: Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    text, date, time,
    done: false,
    notified: false
  });
  saveTasks();
  render();

  document.getElementById('taskInput').value = '';
  requestPermission(); // просим разрешение при первой задаче и дальше при каждой
});

document.getElementById('permBtn').addEventListener('click', requestPermission);

document.getElementById('alarmOk').addEventListener('click', () => {
  document.getElementById('alarm').classList.add('hidden');
  if (navigator.vibrate) navigator.vibrate(0);
});

// Кнопка-колокольчик: проверить уведомление прямо сейчас
document.getElementById('testBtn').addEventListener('click', () => {
  requestPermission().then(p => {
    if (p === 'granted') {
      showNotification({ id: 'test', text: 'Тестовое уведомление \u2014 всё работает!' });
      showAlarmBanner({ id: 'test', text: 'Тестовое уведомление \u2014 всё работает!' });
    } else if (p === 'denied') {
      alert('Уведомления заблокированы в настройках браузера. Разрешите их для этого сайта.');
    } else {
      alert('Ваш браузер не поддерживает уведомления. Попробуйте Chrome.');
    }
  });
});

// ---------- Старт ----------
loadTasks();
render();
updatePermBanner();
registerSW().then(() => checkDue());
setInterval(checkDue, 15000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) checkDue(); // мгновенная проверка при возврате в приложение
});
