// panel-paths.js — Panel i widok ścieżek czytania

import {
  getAllPaths, getPath, createPath, updatePath, deletePath,
  addItemToPath, removeItemFromPath, setItemStatus, moveItem,
  importPathItems, getPathStats, getPathsForArticle
} from './reading-paths.js';
import { getAllMeta } from './articles.js';
import { openPanel, closePanel, isOpen } from './panels.js';
import { showToast } from './ui.js';

let navigateFn = null;

export function initPathsPanel(navigateCallback) {
  navigateFn = navigateCallback;

  document.getElementById('btn-paths-panel').addEventListener('click', () => {
    isOpen('paths') ? closePanel('paths') : openPathsPanel();
  });
  document.getElementById('btn-close-paths-panel').addEventListener('click', () => closePanel('paths'));
}

// ── PANEL (lista ścieżek) ─────────────────────────────────

export function openPathsPanel() {
  openPanel('paths');
  renderPathsList();
}

function renderPathsList() {
  const container = document.getElementById('paths-panel-content');
  const paths     = getAllPaths();

  container.innerHTML = `
    <div style="padding:10px 14px 8px;border-bottom:1px solid var(--border)">
      <button class="btn-primary" id="btn-new-path" style="width:100%;font-size:.85rem">
        + Nowa ścieżka czytania
      </button>
    </div>
    <div id="paths-list-inner" style="flex:1;overflow-y:auto">
      ${!paths.length ? `
        <div class="empty-state" style="padding:40px 20px">
          <div class="empty-icon">🗺</div>
          <p>Brak ścieżek czytania.<br>Utwórz pierwszą!</p>
        </div>
      ` : paths.map(p => renderPathCard(p)).join('')}
    </div>
  `;

  document.getElementById('btn-new-path').addEventListener('click', () => showCreateModal());
  container.querySelectorAll('.path-card').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.path-card-actions')) return;
      closePanel('paths');
      navigateFn('path/' + el.dataset.id);
    });
  });
  container.querySelectorAll('.btn-path-delete').forEach(el => {
    el.addEventListener('mousedown', e => e.stopPropagation());
    el.addEventListener('click', e => {
      e.stopPropagation();
      if (!confirm('Usunąć ścieżkę?')) return;
      deletePath(el.dataset.id);
      renderPathsList();
    });
  });
}

function renderPathCard(path) {
  const { total, done, pct } = getPathStats(path);
  return `
    <div class="path-card" data-id="${path.id}">
      <div class="path-card-main">
        <div class="path-card-name">${escHtml(path.name)}</div>
        ${path.description ? `<div class="path-card-desc">${escHtml(path.description)}</div>` : ''}
        <div class="path-progress-bar"><div class="path-progress-fill" style="width:${pct}%"></div></div>
        <div class="path-card-meta">${done}/${total} przeczytanych · ${pct}%</div>
      </div>
      <div class="path-card-actions">
        <button class="btn-path-delete icon-btn small" data-id="${path.id}" title="Usuń ścieżkę">✕</button>
      </div>
    </div>
  `;
}

// ── WIDOK ŚCIEŻKI ─────────────────────────────────────────

export function renderPathView(pathId) {
  const main = document.getElementById('main-content');
  const path = getPath(pathId);

  if (!path) {
    main.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><p>Ścieżka nie istnieje.</p></div>';
    return;
  }

  const { total, done, reading, todo, pct } = getPathStats(path);

  main.innerHTML = `
    <div id="view-path">

      <div id="path-header">
        <div id="path-header-left">
          <button class="btn-ghost btn-small" id="btn-back-paths">← Ścieżki</button>
          <div>
            <h1 id="path-title-display">${escHtml(path.name)}</h1>
            ${path.description ? `<p class="path-desc-display">${escHtml(path.description)}</p>` : ''}
          </div>
        </div>
        <div id="path-header-actions">
          <button class="btn-small" id="btn-edit-path">✎ Edytuj</button>
          <button class="btn-small" id="btn-import-list" title="Wklej listę artykułów (np. z AI)">📋 Importuj listę</button>
          <button class="btn-small" id="btn-add-article-to-path">+ Dodaj artykuł</button>
        </div>
      </div>

      <!-- Postęp -->
      <div id="path-progress-section">
        <div id="path-stats-row">
          <span class="path-stat path-stat-done">✅ ${done} przeczytanych</span>
          <span class="path-stat path-stat-reading">🔄 ${reading} w trakcie</span>
          <span class="path-stat path-stat-todo">⬜ ${todo} do przeczytania</span>
          <span class="path-stat-total">${total} łącznie</span>
        </div>
        <div class="path-progress-bar big">
          <div class="path-progress-fill" style="width:${pct}%">
            ${pct > 8 ? `<span>${pct}%</span>` : ''}
          </div>
        </div>
      </div>

      <!-- Lista artykułów -->
      <div id="path-items-list">
        ${!path.items.length
          ? `<div class="empty-state"><div class="empty-icon">📚</div>
              <p>Ta ścieżka jest pusta.<br>Dodaj artykuły lub zaimportuj listę.</p></div>`
          : path.items.map((item, idx) => renderPathItem(item, idx, path.items.length, pathId)).join('')
        }
      </div>

    </div>
  `;

  bindPathViewEvents(pathId);
}

function renderPathItem(item, idx, total, pathId) {
  const statusIcon  = { todo: '⬜', reading: '🔄', done: '✅' }[item.status] || '⬜';
  const statusClass = item.status;
  const hasArticle  = !!item.articleId;

  return `
    <div class="path-item ${statusClass}" data-article-id="${item.articleId || ''}" data-path-id="${pathId}">
      <div class="path-item-num">${idx + 1}</div>

      <div class="path-item-status-btn" data-article-id="${item.articleId || ''}" data-title="${escHtml(item.title)}"
           title="Zmień status">${statusIcon}</div>

      <div class="path-item-body">
        <div class="path-item-title ${hasArticle ? 'path-item-link' : 'path-item-missing'}"
             data-id="${item.articleId || ''}" data-title="${escHtml(item.title)}">
          ${escHtml(item.title)}
          ${!hasArticle ? `<span class="path-item-badge-missing" title="Artykuł nie istnieje w kompendium">brak w kompendium</span>` : ''}
        </div>
      </div>

      <div class="path-item-actions">
        <button class="path-item-btn btn-move-up"   data-id="${item.articleId || item.title}" title="Przesuń w górę"   ${idx === 0 ? 'disabled' : ''}>↑</button>
        <button class="path-item-btn btn-move-down"  data-id="${item.articleId || item.title}" title="Przesuń w dół"   ${idx === total - 1 ? 'disabled' : ''}>↓</button>
        <button class="path-item-btn btn-remove-item" data-id="${item.articleId || ''}" data-title="${escHtml(item.title)}" title="Usuń z ścieżki">✕</button>
      </div>
    </div>
  `;
}

function bindPathViewEvents(pathId) {
  const main = document.getElementById('main-content');

  document.getElementById('btn-back-paths').addEventListener('click', () => {
    openPathsPanel();
  });

  document.getElementById('btn-edit-path').addEventListener('click', () => showEditModal(pathId));
  document.getElementById('btn-import-list').addEventListener('click', () => showImportModal(pathId));
  document.getElementById('btn-add-article-to-path').addEventListener('click', () => showAddArticleModal(pathId));

  // Status toggle (cyklicznie: todo → reading → done → todo)
  main.querySelectorAll('.path-item-status-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const artId = btn.dataset.articleId;
      const path  = getPath(pathId);
      const item  = path?.items.find(i => (i.articleId || i.title) === (artId || btn.dataset.title));
      if (!item) return;
      const next = { todo: 'reading', reading: 'done', done: 'todo' }[item.status];
      setItemStatus(pathId, item.articleId, next);
      renderPathView(pathId);
    });
  });

  // Klik w tytuł → otwórz artykuł
  main.querySelectorAll('.path-item-link').forEach(el => {
    el.addEventListener('click', () => {
      if (el.dataset.id) { closePanel('paths'); navigateFn('article/' + el.dataset.id); }
    });
  });

  // Klik w "brak w kompendium" → edytor z prefill
  main.querySelectorAll('.path-item-missing').forEach(el => {
    el.addEventListener('click', () => {
      if (el.dataset.title) { closePanel('paths'); navigateFn('editor/new', { prefillTitle: el.dataset.title }); }
    });
  });

  // Przesuń w górę/dół
  main.querySelectorAll('.btn-move-up').forEach(btn => {
    btn.addEventListener('click', () => { moveItem(pathId, btn.dataset.id, 'up'); renderPathView(pathId); });
  });
  main.querySelectorAll('.btn-move-down').forEach(btn => {
    btn.addEventListener('click', () => { moveItem(pathId, btn.dataset.id, 'down'); renderPathView(pathId); });
  });

  // Usuń z ścieżki
  main.querySelectorAll('.btn-remove-item').forEach(btn => {
    btn.addEventListener('click', () => {
      removeItemFromPath(pathId, btn.dataset.id || btn.dataset.title);
      renderPathView(pathId);
    });
  });
}

// ── MODALS ────────────────────────────────────────────────

function showCreateModal() {
  const name = prompt('Nazwa ścieżki czytania:');
  if (!name?.trim()) return;
  const desc = prompt('Opis (opcjonalnie):') || '';
  const path = createPath(name.trim(), desc.trim());
  closePanel('paths');
  navigateFn('path/' + path.id);
}

function showEditModal(pathId) {
  const path = getPath(pathId);
  if (!path) return;
  const name = prompt('Nazwa ścieżki:', path.name);
  if (!name?.trim()) return;
  const desc = prompt('Opis:', path.description || '') ?? path.description;
  updatePath(pathId, { name: name.trim(), description: desc.trim() });
  renderPathView(pathId);
}

function showAddArticleModal(pathId) {
  const articles = getAllMeta();
  const path     = getPath(pathId);
  if (!path) return;
  const existing = new Set(path.items.map(i => i.articleId));

  // Popup z listą artykułów
  showPickerModal(
    'Dodaj artykuł do ścieżki',
    articles.filter(a => !existing.has(a.id)),
    (article) => {
      addItemToPath(pathId, article.id, article.title);
      renderPathView(pathId);
      showToast(`Dodano „${article.title}"`);
    }
  );
}

/** Import listy tytułów — np. wklejona lista od AI */
function showImportModal(pathId) {
  showImportListModal(pathId);
}

function showImportListModal(pathId) {
  // Utwórz modal dynamicznie
  const overlay = document.createElement('div');
  overlay.className = 'modal';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:520px;width:95vw">
      <h2>📋 Importuj listę artykułów</h2>
      <p style="font-size:.84rem;color:var(--text-muted);margin-top:-6px">
        Wklej listę tytułów artykułów — jeden tytuł na linię.<br>
        Artykuły które już istnieją w kompendium zostaną połączone automatycznie.
        Pozostałe zostaną dodane jako pozycje „brak w kompendium" — kliknięcie w nie otworzy edytor.
      </p>
      <textarea id="import-list-textarea" rows="12" style="
        width:100%;font-family:var(--font-mono);font-size:.83rem;
        border:1px solid var(--border);border-radius:var(--radius-sm);
        background:var(--bg-panel);color:var(--text);padding:10px 12px;
        outline:none;resize:vertical;line-height:1.6
      " placeholder="Konfucjusz&#10;Laozi&#10;Taoizm&#10;Filozofia buddyjska&#10;Mozi&#10;…"></textarea>
      <div style="font-size:.75rem;color:var(--text-faint)" id="import-preview-count"></div>
      <div class="modal-actions">
        <button class="btn-primary" id="btn-import-confirm">Importuj</button>
        <button class="btn-ghost"   id="btn-import-cancel">Anuluj</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const ta      = overlay.querySelector('#import-list-textarea');
  const counter = overlay.querySelector('#import-preview-count');

  ta.addEventListener('input', () => {
    const lines = ta.value.split('\n').map(l => l.trim()).filter(Boolean);
    counter.textContent = lines.length ? `${lines.length} pozycji` : '';
  });

  overlay.querySelector('#btn-import-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#btn-import-confirm').addEventListener('click', () => {
    const lines = ta.value.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;

    const allMeta = getAllMeta();
    const items = lines.map(title => {
      // Dopasuj do istniejącego artykułu (case-insensitive)
      const found = allMeta.find(a => a.title.toLowerCase() === title.toLowerCase());
      return found ? { articleId: found.id, title: found.title } : { articleId: null, title };
    });

    importPathItems(pathId, items);
    overlay.remove();
    renderPathView(pathId);
    showToast(`Zaimportowano ${items.length} pozycji`);
  });

  ta.focus();
}

/** Minimalistyczny picker artykułów */
function showPickerModal(title, articles, onSelect) {
  const overlay = document.createElement('div');
  overlay.className = 'modal';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:480px;width:95vw">
      <h2>${title}</h2>
      <input type="text" id="picker-search" placeholder="Szukaj artykułu…"
        style="width:100%;padding:7px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);
               background:var(--bg-panel);color:var(--text);font-family:var(--font-ui);font-size:.9rem;outline:none"/>
      <div id="picker-list" style="max-height:340px;overflow-y:auto;border:1px solid var(--border);
           border-radius:var(--radius-sm);margin-top:4px"></div>
      <div class="modal-actions">
        <button class="btn-ghost" id="btn-picker-cancel">Anuluj</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const render = (q = '') => {
    const filtered = q
      ? articles.filter(a => a.title.toLowerCase().includes(q.toLowerCase()))
      : articles;
    const list = overlay.querySelector('#picker-list');
    list.innerHTML = filtered.slice(0, 50).map(a => `
      <div class="picker-item" data-id="${a.id}" data-title="${escHtml(a.title)}">
        ${escHtml(a.title)}
      </div>
    `).join('') || '<div style="padding:14px;color:var(--text-faint);font-size:.85rem">Brak wyników</div>';
    list.querySelectorAll('.picker-item').forEach(el => {
      el.addEventListener('click', () => {
        onSelect({ id: el.dataset.id, title: el.dataset.title });
        overlay.remove();
      });
    });
  };

  overlay.querySelector('#picker-search').addEventListener('input', e => render(e.target.value));
  overlay.querySelector('#btn-picker-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  render();
  setTimeout(() => overlay.querySelector('#picker-search').focus(), 50);
}

// ── WIDGET NA STRONIE ARTYKUŁU ────────────────────────────

/** Renderuje sekcję "Ścieżki czytania" w akcjach artykułu */
export function renderArticlePathWidget(articleId, articleTitle) {
  const paths    = getPathsForArticle(articleId);
  const allPaths = getAllPaths();

  const wrap = document.createElement('div');
  wrap.id = 'article-path-widget';
  wrap.innerHTML = `
    <div class="article-path-widget-inner">
      ${paths.length ? paths.map(p => {
        const item = p.items.find(i => i.articleId === articleId);
        const { total, done } = getPathStats(p);
        const statusIcon = { todo: '⬜', reading: '🔄', done: '✅' }[item?.status] || '⬜';
        return `<span class="article-path-chip" data-path-id="${p.id}">
          ${statusIcon} ${escHtml(p.name)}
          <span style="opacity:.5;font-size:.7rem">${done}/${total}</span>
        </span>`;
      }).join('') : ''}
      <button class="btn-small" id="btn-add-to-path" title="Dodaj do ścieżki czytania">＋ Ścieżka</button>
    </div>
  `;

  wrap.querySelectorAll('.article-path-chip').forEach(chip => {
    chip.addEventListener('click', () => navigateFn('path/' + chip.dataset.pathId));
  });

  wrap.querySelector('#btn-add-to-path').addEventListener('click', () => {
    if (!allPaths.length) {
      if (confirm('Nie masz jeszcze żadnej ścieżki czytania. Utworzyć nową?')) {
        const name = prompt('Nazwa ścieżki:');
        if (name?.trim()) {
          const p = createPath(name.trim());
          addItemToPath(p.id, articleId, articleTitle);
          showToast(`Dodano do „${p.name}"`);
          navigateFn('path/' + p.id);
        }
      }
      return;
    }
    showPickerModal(
      'Dodaj do ścieżki czytania',
      allPaths.filter(p => !p.items.some(i => i.articleId === articleId)),
      (path) => {
        addItemToPath(path.id, articleId, articleTitle);
        showToast(`Dodano do „${path.title}"`);
        // Odśwież widget
        const old = document.getElementById('article-path-widget');
        if (old) old.replaceWith(renderArticlePathWidget(articleId, articleTitle));
      }
    );
  });

  return wrap;
}

// ── HELPER ────────────────────────────────────────────────

function escHtml(str) {
  return (str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
