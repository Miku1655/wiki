// history.js — Historia przeglądania

import { addHistoryEntry, fetchHistory, deleteHistoryEntry, deleteHistoryRange } from './storage.js';
import { getUser } from './auth.js';

let navigateFn = null;

export function initHistory(navigateCallback) {
  navigateFn = navigateCallback;
  document.getElementById('btn-history').addEventListener('click', () => {
    navigateFn('history');
  });
}

/** Loguje otwarcie artykułu do Firebase */
export async function logView(articleId, articleTitle) {
  if (!getUser()) return;
  try {
    await addHistoryEntry(articleId, articleTitle);
  } catch(e) {
    console.warn('Nie można zapisać historii:', e);
  }
}

/** Renderuje widok historii przeglądania */
export async function renderHistory() {
  const main = document.getElementById('main-content');
  main.innerHTML = `
    <div id="view-history">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
        <h1>Historia przeglądania</h1>
        <button class="btn-danger" id="btn-clear-all-history" style="font-size:.8rem;padding:6px 14px">Wyczyść wszystko</button>
      </div>
      <div class="loading-spinner"><div class="spinner"></div> Ładowanie…</div>
    </div>
  `;

  document.getElementById('btn-clear-all-history').addEventListener('click', async () => {
    if (!confirm('Usunąć całą historię przeglądania?')) return;
    try {
      const entries = await fetchHistory(1000);
      await Promise.all(entries.map(e => deleteHistoryEntry(e.id)));
      renderHistory();
    } catch(e) {
      console.error(e);
    }
  });

  try {
    const entries = await fetchHistory(300);
    renderHistoryList(entries);
  } catch(e) {
    document.querySelector('#view-history').innerHTML += `
      <div class="empty-state"><p>Nie można załadować historii. Sprawdź połączenie.</p></div>
    `;
  }
}

function renderHistoryList(entries) {
  const container = document.querySelector('#view-history');
  if (!container) return;

  // Usuń spinner
  container.querySelector('.loading-spinner')?.remove();

  if (!entries.length) {
    container.insertAdjacentHTML('beforeend',
      '<div class="empty-state"><div class="empty-icon">⏱</div><p>Historia jest pusta.</p></div>'
    );
    return;
  }

  // Grupuj po dacie
  const groups = {};
  entries.forEach(e => {
    const date = formatDate(e.viewedAt);
    if (!groups[date]) groups[date] = [];
    groups[date].push(e);
  });

  const list = document.createElement('ul');
  list.className = 'history-list';

  Object.entries(groups).forEach(([date, items]) => {
    // Nagłówek daty z przyciskiem usunięcia całego dnia
    const dateItem = document.createElement('li');
    dateItem.className = 'history-date-group';
    dateItem.innerHTML = `
      <span>${date}</span>
      <button class="btn-delete-day" data-date="${date}" title="Usuń ten dzień">✕</button>
    `;
    dateItem.querySelector('.btn-delete-day').addEventListener('click', async () => {
      if (!confirm(`Usunąć historię z dnia „${date}"?`)) return;
      try {
        await Promise.all(items.map(e => deleteHistoryEntry(e.id)));
        renderHistory();
      } catch(err) { console.error(err); }
    });
    list.appendChild(dateItem);

    items.forEach(e => {
      const li = document.createElement('li');
      li.className = 'history-item';
      li.innerHTML = `
        <span class="h-time">${formatTime(e.viewedAt)}</span>
        <span class="h-title" data-id="${e.articleId}">${escHtml(e.articleTitle)}</span>
        <button class="h-delete" data-entry-id="${e.id}" title="Usuń wpis">✕</button>
      `;
      li.querySelector('.h-title').addEventListener('click', () => {
        if (navigateFn) navigateFn('article/' + e.articleId);
      });
      li.querySelector('.h-delete').addEventListener('click', async () => {
        try {
          await deleteHistoryEntry(e.id);
          li.remove();
        } catch(err) { console.error(err); }
      });
      list.appendChild(li);
    });
  });

  container.appendChild(list);
}

// ── Formatowanie dat ──────────────────────────────────────

function formatDate(date) {
  if (!date) return '—';
  const d = new Date(date);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (isSameDay(d, today)) return 'Dzisiaj';
  if (isSameDay(d, yesterday)) return 'Wczoraj';
  return d.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatTime(date) {
  if (!date) return '';
  return new Date(date).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth() === b.getMonth() &&
         a.getDate() === b.getDate();
}

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
