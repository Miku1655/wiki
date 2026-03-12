// history.js — Historia przeglądania

import { addHistoryEntry, fetchHistory } from './storage.js';
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
      <h1>Historia przeglądania</h1>
      <div class="loading-spinner"><div class="spinner"></div> Ładowanie…</div>
    </div>
  `;

  try {
    const entries = await fetchHistory(300);
    renderHistoryList(entries);
  } catch(e) {
    document.querySelector('#view-history').innerHTML = `
      <h1>Historia przeglądania</h1>
      <div class="empty-state"><p>Nie można załadować historii. Sprawdź połączenie.</p></div>
    `;
  }
}

function renderHistoryList(entries) {
  const container = document.querySelector('#view-history');
  if (!container) return;

  if (!entries.length) {
    container.innerHTML = `
      <h1>Historia przeglądania</h1>
      <div class="empty-state"><div class="empty-icon">⏱</div><p>Historia jest pusta.</p></div>
    `;
    return;
  }

  // Grupuj po dacie
  const groups = {};
  entries.forEach(e => {
    const date = formatDate(e.viewedAt);
    if (!groups[date]) groups[date] = [];
    groups[date].push(e);
  });

  let html = '<h1>Historia przeglądania</h1><ul class="history-list">';
  Object.entries(groups).forEach(([date, items]) => {
    html += `<li class="history-date-group">${date}</li>`;
    items.forEach(e => {
      const time = formatTime(e.viewedAt);
      html += `
        <li class="history-item">
          <span class="h-time">${time}</span>
          <span class="h-title" data-id="${e.articleId}">${escHtml(e.articleTitle)}</span>
        </li>
      `;
    });
  });
  html += '</ul>';
  container.innerHTML = html;

  // Kliknięcia
  container.querySelectorAll('.h-title[data-id]').forEach(el => {
    el.addEventListener('click', () => {
      if (navigateFn) navigateFn('article/' + el.dataset.id);
    });
  });
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
