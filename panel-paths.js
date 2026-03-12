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

      <div id="path-progress-section">
        <div id="path-stats-row">
          <span class="path-stat">✅ ${done} przeczytanych</span>
          <span class="path-stat">🔄 ${reading} w trakcie</span>
          <span class="path-stat">⬜ ${todo} do przeczytania</span>
          <span class="path-stat-total">${total} łącznie</span>
        </div>
        <div class="path-progress-bar big">
          <div class="path-progress-fill" style="width:${pct}%">
            ${pct > 8 ? `<span>${pct}%</span>` : ''}
          </div>
        </div>
      </div>

      <div id="path-items-list">
        ${!path.items.length
          ? `<div class="empty-state"><div class="empty-icon">📚</div>
              <p>Ta ścieżka jest pusta.<br>Dodaj artykuły lub zaimportuj listę.</p></div>`
          : path.items.map((item, idx) => renderPathItem(item, idx, pathId)).join('')
        }
      </div>
    </div>
  `;

  bindPathViewEvents(pathId);
  initDragDrop(pathId);
}

function renderPathItem(item, idx, pathId) {
  const statusIcon  = { todo: '⬜', reading: '🔄', done: '✅' }[item.status] || '⬜';
  const hasArticle  = !!item.articleId;

  return `
    <div class="path-item ${item.status}" 
         data-article-id="${item.articleId || ''}"
         data-item-key="${item.articleId || item.title}"
         draggable="true">
      <div class="path-item-drag" title="Przeciągnij aby zmienić kolejność">⠿</div>
      <div class="path-item-num">${idx + 1}</div>
      <div class="path-item-status-btn"
           data-article-id="${item.articleId || ''}"
           data-item-key="${item.articleId || item.title}"
           title="Zmień status">${statusIcon}</div>
      <div class="path-item-body">
        <div class="path-item-title ${hasArticle ? 'path-item-link' : 'path-item-missing'}"
             data-id="${item.articleId || ''}"
             data-title="${escHtml(item.title)}">
          ${escHtml(item.title)}
          ${!hasArticle ? `<span class="path-item-badge-missing">brak w kompendium</span>` : ''}
        </div>
      </div>
      <div class="path-item-actions">
        <button class="path-item-btn btn-remove-item"
                data-id="${item.articleId || ''}"
                data-title="${escHtml(item.title)}"
                title="Usuń z ścieżki">✕</button>
      </div>
    </div>
  `;
}

// ── DRAG & DROP ───────────────────────────────────────────

function initDragDrop(pathId) {
  const list = document.getElementById('path-items-list');
  if (!list) return;

  let dragEl    = null;
  let dragOver  = null;
  let placeholder = null;

  list.addEventListener('dragstart', e => {
    const item = e.target.closest('.path-item');
    if (!item) return;
    dragEl = item;
    dragEl.classList.add('dragging');

    // Placeholder tej samej wysokości
    placeholder = document.createElement('div');
    placeholder.className = 'path-item-placeholder';
    placeholder.style.height = item.offsetHeight + 'px';

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.dataset.itemKey);
  });

  list.addEventListener('dragend', () => {
    if (!dragEl) return;
    dragEl.classList.remove('dragging');
    placeholder?.remove();

    // Zapisz nową kolejność na podstawie DOM
    const items    = [...list.querySelectorAll('.path-item')];
    const newOrder = items.map(el => el.dataset.itemKey);
    reorderPath(pathId, newOrder);
    dragEl = null; dragOver = null; placeholder = null;
  });

  list.addEventListener('dragover', e => {
    e.preventDefault();
    if (!dragEl) return;
    const target = e.target.closest('.path-item');
    if (!target || target === dragEl) return;
    if (dragOver === target) return;
    dragOver = target;

    const rect   = target.getBoundingClientRect();
    const midY   = rect.top + rect.height / 2;
    const before = e.clientY < midY;

    if (before) target.before(placeholder);
    else        target.after(placeholder);
    dragEl.remove(); // oderwij z oryginalnej pozycji
    placeholder.after(dragEl);
    // Wstaw dragEl na właściwe miejsce
    if (before) target.before(dragEl);
    else        target.after(dragEl);
  });

  list.addEventListener('drop', e => e.preventDefault());
}

function reorderPath(pathId, newOrder) {
  const paths = JSON.parse(localStorage.getItem('kp_reading_paths') || '[]');
  const path  = paths.find(p => p.id === pathId);
  if (!path) return;

  const itemMap = {};
  path.items.forEach(i => { itemMap[i.articleId || i.title] = i; });

  path.items = newOrder
    .map(key => itemMap[key])
    .filter(Boolean);

  localStorage.setItem('kp_reading_paths', JSON.stringify(paths));

  // Odśwież tylko numery (bez pełnego re-renderu = nie niszczymy drag state)
  document.querySelectorAll('.path-item').forEach((el, idx) => {
    const numEl = el.querySelector('.path-item-num');
    if (numEl) numEl.textContent = idx + 1;
  });
}

// ── EVENTY WIDOKU ŚCIEŻKI ─────────────────────────────────

function bindPathViewEvents(pathId) {
  const main = document.getElementById('main-content');

  // ← Ścieżki — otwórz panel bez nawigowania do home
  main.querySelector('#btn-back-paths').addEventListener('click', () => {
    openPathsPanel();
    // Panel nakłada się na widok ścieżki — to poprawne zachowanie
  });

  main.querySelector('#btn-edit-path').addEventListener('click', () => showEditModal(pathId));
  main.querySelector('#btn-import-list').addEventListener('click', () => showImportModal(pathId));
  main.querySelector('#btn-add-article-to-path').addEventListener('click', () => showAddArticleModal(pathId));

  // Status toggle (cyklicznie: todo → reading → done → todo)
  main.querySelectorAll('.path-item-status-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const path = getPath(pathId);
      const key  = btn.dataset.itemKey;
      const item = path?.items.find(i => (i.articleId || i.title) === key);
      if (!item) return;
      const next = { todo: 'reading', reading: 'done', done: 'todo' }[item.status];
      setItemStatus(pathId, item.articleId || null, next);
      // Zaktualizuj tylko ikonę + klasę — bez pełnego re-renderu
      const row = btn.closest('.path-item');
      if (row) {
        row.className = `path-item ${next}`;
        btn.textContent = { todo: '⬜', reading: '🔄', done: '✅' }[next];
      }
      // Odśwież pasek postępu
      refreshProgressBar(pathId);
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

  // Usuń z ścieżki
  main.querySelectorAll('.btn-remove-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.id || btn.dataset.title;
      removeItemFromPath(pathId, key);
      btn.closest('.path-item')?.remove();
      refreshProgressBar(pathId);
      // Przenumeruj
      document.querySelectorAll('.path-item').forEach((el, idx) => {
        const n = el.querySelector('.path-item-num');
        if (n) n.textContent = idx + 1;
      });
    });
  });
}

function refreshProgressBar(pathId) {
  const path = getPath(pathId);
  if (!path) return;
  const { total, done, reading, todo, pct } = getPathStats(path);
  const fill = document.querySelector('.path-progress-fill');
  if (fill) { fill.style.width = pct + '%'; if (pct > 8) fill.querySelector('span') && (fill.querySelector('span').textContent = pct + '%'); }
  const statsRow = document.getElementById('path-stats-row');
  if (statsRow) statsRow.innerHTML = `
    <span class="path-stat">✅ ${done} przeczytanych</span>
    <span class="path-stat">🔄 ${reading} w trakcie</span>
    <span class="path-stat">⬜ ${todo} do przeczytania</span>
    <span class="path-stat-total">${total} łącznie</span>
  `;
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
  const desc = (prompt('Opis:', path.description || '') ?? path.description);
  updatePath(pathId, { name: name.trim(), description: desc.trim() });
  renderPathView(pathId);
}

function showAddArticleModal(pathId) {
  const path = getPath(pathId);
  if (!path) return;
  const existing = new Set(path.items.map(i => i.articleId));
  showPickerModal(
    'Dodaj artykuł do ścieżki',
    getAllMeta().filter(a => !existing.has(a.id)),
    (article) => {
      addItemToPath(pathId, article.id, article.title);
      renderPathView(pathId);
      showToast(`Dodano „${article.title}"`);
    }
  );
}

function showImportModal(pathId) { showImportListModal(pathId); }

function showImportListModal(pathId) {
  const overlay = document.createElement('div');
  overlay.className = 'modal';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:520px;width:95vw">
      <h2>📋 Importuj listę artykułów</h2>
      <p style="font-size:.84rem;color:var(--text-muted);margin-top:-6px">
        Wklej listę tytułów — jeden tytuł na linię.<br>
        Artykuły istniejące w kompendium zostaną połączone automatycznie.
      </p>
      <textarea id="import-list-textarea" rows="12" style="
        width:100%;font-family:var(--font-mono);font-size:.83rem;
        border:1px solid var(--border);border-radius:var(--radius-sm);
        background:var(--bg-panel);color:var(--text);padding:10px 12px;
        outline:none;resize:vertical;line-height:1.6
      " placeholder="Konfucjusz&#10;Laozi&#10;Taoizm&#10;Filozofia buddyjska&#10;…"></textarea>
      <div style="font-size:.75rem;color:var(--text-faint)" id="import-preview-count"></div>
      <div class="modal-actions">
        <button class="btn-primary" id="btn-import-confirm">Importuj</button>
        <button class="btn-ghost"   id="btn-import-cancel">Anuluj</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const ta = overlay.querySelector('#import-list-textarea');
  ta.addEventListener('input', () => {
    const n = ta.value.split('\n').map(l => l.trim()).filter(Boolean).length;
    overlay.querySelector('#import-preview-count').textContent = n ? `${n} pozycji` : '';
  });
  overlay.querySelector('#btn-import-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#btn-import-confirm').addEventListener('click', () => {
    const lines = ta.value.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;
    const allMeta = getAllMeta();
    const items = lines.map(title => {
      const found = allMeta.find(a => a.title.toLowerCase() === title.toLowerCase());
      return found ? { articleId: found.id, title: found.title } : { articleId: null, title };
    });
    importPathItems(pathId, items);
    overlay.remove();
    renderPathView(pathId);
    showToast(`Zaimportowano ${items.length} pozycji`);
  });
  setTimeout(() => ta.focus(), 50);
}

function showPickerModal(title, articles, onSelect) {
  const overlay = document.createElement('div');
  overlay.className = 'modal';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:480px;width:95vw">
      <h2>${title}</h2>
      <input type="text" id="picker-search" placeholder="Szukaj artykułu…" style="
        width:100%;padding:7px 10px;border:1px solid var(--border);
        border-radius:var(--radius-sm);background:var(--bg-panel);
        color:var(--text);font-family:var(--font-ui);font-size:.9rem;outline:none"/>
      <div id="picker-list" style="max-height:340px;overflow-y:auto;
           border:1px solid var(--border);border-radius:var(--radius-sm);margin-top:4px"></div>
      <div class="modal-actions">
        <button class="btn-ghost" id="btn-picker-cancel">Anuluj</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const render = (q = '') => {
    const filtered = q ? articles.filter(a => a.title.toLowerCase().includes(q.toLowerCase())) : articles;
    const list = overlay.querySelector('#picker-list');
    list.innerHTML = filtered.slice(0, 50).map(a =>
      `<div class="picker-item" data-id="${a.id}" data-title="${escHtml(a.title)}">${escHtml(a.title)}</div>`
    ).join('') || '<div style="padding:14px;color:var(--text-faint);font-size:.85rem">Brak wyników</div>';
    list.querySelectorAll('.picker-item').forEach(el => {
      el.addEventListener('click', () => { onSelect({ id: el.dataset.id, title: el.dataset.title }); overlay.remove(); });
    });
  };

  overlay.querySelector('#picker-search').addEventListener('input', e => render(e.target.value));
  overlay.querySelector('#btn-picker-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  render();
  setTimeout(() => overlay.querySelector('#picker-search').focus(), 50);
}

// ── WIDGET NA STRONIE ARTYKUŁU ────────────────────────────

export function renderArticlePathWidget(articleId, articleTitle) {
  const paths    = getPathsForArticle(articleId);
  const allPaths = getAllPaths();

  const wrap = document.createElement('div');
  wrap.id = 'article-path-widget';
  wrap.innerHTML = `
    <div class="article-path-widget-inner">
      ${paths.map(p => {
        const item = p.items.find(i => i.articleId === articleId);
        const { total, done } = getPathStats(p);
        const icon = { todo: '⬜', reading: '🔄', done: '✅' }[item?.status] || '⬜';
        return `<span class="article-path-chip" data-path-id="${p.id}">
          ${icon} ${escHtml(p.name)}
          <span style="opacity:.5;font-size:.7rem">${done}/${total}</span>
        </span>`;
      }).join('')}
      <button class="btn-small" id="btn-add-to-path" title="Dodaj do ścieżki czytania">＋ Ścieżka</button>
    </div>
  `;

  wrap.querySelectorAll('.article-path-chip').forEach(chip => {
    chip.addEventListener('click', () => navigateFn('path/' + chip.dataset.pathId));
  });

  wrap.querySelector('#btn-add-to-path').addEventListener('click', () => {
    const available = allPaths.filter(p => !p.items.some(i => i.articleId === articleId));
    if (!allPaths.length) {
      if (confirm('Nie masz jeszcze żadnej ścieżki. Utworzyć nową?')) {
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
      available.map(p => ({ id: p.id, title: p.name })),
      (picked) => {
        addItemToPath(picked.id, articleId, articleTitle);
        showToast(`Dodano do „${picked.title}"`);
        const old = document.getElementById('article-path-widget');
        if (old) old.replaceWith(renderArticlePathWidget(articleId, articleTitle));
      }
    );
  });

  return wrap;
}

function escHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
