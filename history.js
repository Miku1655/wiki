// history.js — Historia przeglądania

import { addHistoryEntry, fetchHistory, deleteHistoryEntry, updateHistoryEntry } from './storage.js';
import { getUser } from './auth.js';

let navigateFn = null;

// In-memory cache ostatnio zalogowanych wpisów (articleId → entryId)
// żeby nie odpytywać Firestore przy każdym otwarciu artykułu
let _recentCache = null;   // Map<articleId, {id, viewedAt}>
let _cacheLoadedAt = null; // timestamp załadowania cache

const CACHE_TTL = 5 * 60 * 1000; // 5 minut

export function initHistory(navigateCallback) {
  navigateFn = navigateCallback;
  document.getElementById('btn-history').addEventListener('click', () => {
    navigateFn('history');
  });
}

/**
 * Loguje otwarcie artykułu.
 * Jeśli ten sam artykuł był już oglądany DZIŚ — aktualizuje timestamp
 * zamiast dodawać nowy dokument (brak duplikatów w historii dziennej).
 */
export async function logView(articleId, articleTitle) {
  if (!getUser()) return;
  try {
    await _deduplicatedLog(articleId, articleTitle);
  } catch(e) {
    console.warn('Nie można zapisać historii:', e);
  }
}

async function _deduplicatedLog(articleId, articleTitle) {
  // Załaduj cache jeśli nieaktualny
  if (!_recentCache || Date.now() - _cacheLoadedAt > CACHE_TTL) {
    await _refreshCache();
  }

  const existing = _recentCache.get(articleId);

  if (existing) {
    // Artykuł już był dziś oglądany — zaktualizuj timestamp
    await updateHistoryEntry(existing.id, articleTitle);
    existing.viewedAt = new Date();
  } else {
    // Nowy wpis
    const newId = await addHistoryEntry(articleId, articleTitle);
    if (newId) {
      _recentCache.set(articleId, { id: newId, viewedAt: new Date() });
    }
  }
}

async function _refreshCache() {
  _recentCache = new Map();
  _cacheLoadedAt = Date.now();

  try {
    // Pobierz tylko dzisiejsze wpisy (ostatnie 24h wystarczy)
    const entries = await fetchHistory(200);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Zbuduj mapę: articleId → najnowszy wpis z dzisiaj
    // Przy okazji wykryj i usuń starsze duplikaty z tego samego dnia
    const seenToday = new Map(); // articleId → entry (najnowszy)

    for (const e of entries) {
      const d = new Date(e.viewedAt);
      if (d < today) continue; // starszy niż dziś — pomijamy

      if (seenToday.has(e.articleId)) {
        // Duplikat z dzisiaj — usuń starszy
        const prev = seenToday.get(e.articleId);
        const prevDate = new Date(prev.viewedAt);
        if (d > prevDate) {
          // Ten wpis jest nowszy — usuń poprzedni
          deleteHistoryEntry(prev.id).catch(() => {});
          seenToday.set(e.articleId, e);
        } else {
          // Ten wpis jest starszy — usuń bieżący
          deleteHistoryEntry(e.id).catch(() => {});
        }
      } else {
        seenToday.set(e.articleId, e);
      }
    }

    _recentCache = seenToday;
  } catch(e) {
    // Cache nieudany — nie blokuj zapisu
    _recentCache = new Map();
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
      _recentCache = new Map();
      renderHistory();
    } catch(e) {
      console.error(e);
    }
  });

  try {
    const entries = await fetchHistory(300);
    renderHistoryList(deduplicate(entries));
  } catch(e) {
    document.querySelector('#view-history').innerHTML += `
      <div class="empty-state"><p>Nie można załadować historii. Sprawdź połączenie.</p></div>
    `;
  }
}

/**
 * Deduplikuje listę wpisów na potrzeby wyświetlenia:
 * dla każdego articleId zachowuje tylko najnowszy wpis.
 * Nie usuwa nic z bazy — tylko filtruje widok.
 */
function deduplicate(entries) {
  const seen = new Map(); // articleId → entry
  for (const e of entries) {
    if (!seen.has(e.articleId)) {
      seen.set(e.articleId, e);
    }
    // Wpisy są posortowane malejąco (najnowsze pierwsze),
    // więc pierwszy napotkany dla danego articleId jest najnowszy.
  }
  return [...seen.values()];
}

function renderHistoryList(entries) {
  const container = document.querySelector('#view-history');
  if (!container) return;

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
          // Usuń też z cache
          if (_recentCache?.get(e.articleId)?.id === e.id) {
            _recentCache.delete(e.articleId);
          }
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
