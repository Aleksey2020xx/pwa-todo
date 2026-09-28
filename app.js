const STORAGE_KEY = 'pwa-todo-tasks';
let tasks = [];

// ── Загрузка из localStorage ──
function loadTasks() {
  try {
    tasks = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    tasks = [];
  }
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

// ── Уведомления ──
async function ensureNotificationPermission() {
  if (!('Notification' in window)) {
    alert('Уведомления не поддерживаются на этом устройстве');
    return false;
  }
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') {
    alert('Уведомления заблокированы. Разрешите их в настройках браузера.');
    return false;
  }
  const result = await Notification.requestPermission();
  return result === 'granted';
}

function showNotification(task) {
  const timeStr = formatDateTime(task.date, task.time);
  const body = `${task.text}\n${timeStr}`;

  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then(reg => {
      reg.showNotification('⏰ Напоминание', {
        body: body,
        icon: 'icon-192.png',
        badge: 'icon-192.png',
        tag: String(task.id),
        vibrate: [200, 100, 200, 100, 200],
        requireInteraction: true,
        actions: [{ action: 'done', title: 'Выполнено' }]
      });
    });
  } else {
    new Notification('⏰ Напоминание', {
      body: body,
      icon: 'icon-192.png',
      tag: String(task.id),
      vibrate: [200, 100, 200, 100, 200],
      requireInteraction: true
    });
  }
}

// ── Проверка времени задач ──
function checkTasks() {
  const now = new Date();
  tasks.forEach(task => {
    if (task.done || task.notified) return;
    const taskTime = new Date(`${task.date}T${task.time}`);
    if (taskTime <= now) {
      showNotification(task);
      task.notified = true;
      saveTasks();
      render();
    }
  });
}

// ── Форматирование ──
function formatDateTime(date, time) {
  const d = new Date(`${date}T${time}`);
  const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} — ${time}`;
}

function isOverdue(task) {
  if (task.done) return false;
  return new Date(`${task.date}T${task.time}`) < new Date();
}

// ── Рендер ──
function render() {
  const list = document.getElementById('taskList');
  const empty = document.getElementById('emptyState');
  list.innerHTML = '';

  const sorted = [...tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`);
  });

  if (sorted.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  sorted.forEach(task => {
    const card = document.createElement('div');
    card.className = 'task-card' + (task.done ? ' done' : '');

    const overdue = isOverdue(task) ? ' overdue' : '';

    card.innerHTML = `
      <div class="task-check ${task.done ? 'done' : ''}" data-id="${task.id}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <div class="task-body">
        <div class="task-text">${escapeHtml(task.text)}</div>
        <div class="task-time${overdue}">🕐 ${formatDateTime(task.date, task.time)}</div>
      </div>
      <button class="task-delete" data-id="${task.id}">×</button>
    `;

    list.appendChild(card);
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ── Действия ──
function addTask(text, date, time) {
  tasks.push({
    id: Date.now(),
    text,
    date,
    time,
    done: false,
    notified: false
  });
  saveTasks();
  render();
}

function toggleTask(id) {
  const task = tasks.find(t => t.id === id);
  if (task) {
    task.done = !task.done;
    saveTasks();
    render();
  }
}

function deleteTask(id) {
  tasks = tasks.filter(t => t.id !== id);
  saveTasks();
  render();
}

// ── События ──
document.getElementById('taskForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = document.getElementById('taskInput').value.trim();
  const date = document.getElementById('dateInput').value;
  const time = document.getElementById('timeInput').value;
  if (!text || !date || !time) return;

  // Запрашиваем разрешение на уведомления при первой задаче
  await ensureNotificationPermission();
  updateNotifyBtn();

  addTask(text, date, time);
  document.getElementById('taskInput').value = '';
  document.getElementById('taskInput').focus();
});

document.getElementById('taskList').addEventListener('click', (e) => {
  const check = e.target.closest('.task-check');
  if (check) {
    toggleTask(Number(check.dataset.id));
    return;
  }
  const del = e.target.closest('.task-delete');
  if (del) {
    deleteTask(Number(del.dataset.id));
  }
});

function updateNotifyBtn() {
  const btn = document.getElementById('notifyBtn');
  if ('Notification' in window && Notification.permission === 'granted') {
    btn.classList.add('active');
  } else {
    btn.classList.remove('active');
  }
}

document.getElementById('notifyBtn').addEventListener('click', async () => {
  const granted = await ensureNotificationPermission();
  updateNotifyBtn();
  if (granted) {
    new Notification('✅ Уведомления включены', {
      body: 'Теперь вы будете получать напоминания о задачах.',
      icon: 'icon-192.png'
    });
  }
});

// ── Service Worker ──
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(err => console.log('SW error:', err));
}

// ── Установка значений по умолчанию ──
function setDefaultDateTime() {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  document.getElementById('dateInput').value = dateStr;
  document.getElementById('timeInput').value = timeStr;
}

// ── Инициализация ──
loadTasks();
render();
updateNotifyBtn();
setDefaultDateTime();
checkTasks();
setInterval(checkTasks, 30000); // проверяем каждые 30 секунд
