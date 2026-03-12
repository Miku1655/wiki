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

  document.getElementById('btn-paths-panel').addEventListener('click', (e) => {
    e.stopPropagation(); // zapobiegaj bubble'owaniu do #main-content → closeAll
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
          <button class="btn-small" id="btn-add-group">＋ Grupę</button>
          <button class="btn-small" id="btn-import-list" title="Wklej listę artykułów">📋 Importuj listę</button>
          <button class="btn-small" id="btn-add-article-to-path">＋ Artykuł</button>
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
        ${renderPathItems(path)}
      </div>
    </div>
  `;

  bindPathViewEvents(pathId);
  initDragDrop(pathId);
}

// ── RENDEROWANIE LISTY POZYCJI ────────────────────────────

function renderPathItems(path) {
  if (!path.items.length) {
    return `<div class="empty-state"><div class="empty-icon">📚</div>
      <p>Ta ścieżka jest pusta.<br>Dodaj artykuły lub zaimportuj listę.</p></div>`;
  }

  const parts = [];
  let articleIndex = 0; // globalny numer artykułu (nie liczymy nagłówków)

  path.items.forEach((item) => {
    if (item.type === 'group') {
      parts.push(renderGroupHeader(item));
    } else {
      articleIndex++;
      parts.push(renderPathItem(item, articleIndex, path.id));
    }
  });

  return parts.join('');
}

function renderGroupHeader(item) {
  return `
    <div class="path-group-header" data-item-key="${escAttr(item.id || item.title)}" draggable="true">
      <div class="path-item-drag" title="Przeciągnij">⠿</div>
      <span class="path-group-icon">📂</span>
      <span class="path-group-title" contenteditable="false"
            data-item-key="${escAttr(item.id || item.title)}">${escHtml(item.title)}</span>
      <div class="path-item-actions">
        <button class="path-item-btn btn-edit-group"
                data-item-key="${escAttr(item.id || item.title)}"
                title="Zmień nazwę">✎</button>
        <button class="path-item-btn btn-remove-item"
                data-id="" data-title="${escAttr(item.title)}"
                data-item-key="${escAttr(item.id || item.title)}"
                title="Usuń grupę">✕</button>
      </div>
    </div>
  `;
}

function renderPathItem(item, idx, pathId) {
  const statusIcon  = { todo: '⬜', reading: '🔄', done: '✅' }[item.status] || '⬜';
  const hasArticle  = !!item.articleId;
  const itemKey     = item.articleId || item.title;

  return `
    <div class="path-item ${item.status}"
         data-article-id="${escAttr(item.articleId || '')}"
         data-item-key="${escAttr(itemKey)}"
         draggable="true">
      <div class="path-item-drag" title="Przeciągnij aby zmienić kolejność">⠿</div>
      <div class="path-item-num">${idx}</div>
      <div class="path-item-status-btn"
           data-item-key="${escAttr(itemKey)}"
           title="Zmień status">${statusIcon}</div>
      <div class="path-item-body">
        <div class="path-item-title ${hasArticle ? 'path-item-link' : 'path-item-missing'}"
             data-id="${escAttr(item.articleId || '')}"
             data-title="${escAttr(item.title)}">
          ${escHtml(item.title)}
          ${!hasArticle ? `<span class="path-item-badge-missing">brak w kompendium</span>` : ''}
        </div>
      </div>
      <div class="path-item-actions">
        <button class="path-item-btn btn-remove-item"
                data-id="${escAttr(item.articleId || '')}"
                data-title="${escAttr(item.title)}"
                data-item-key="${escAttr(itemKey)}"
                title="Usuń z ścieżki">✕</button>
      </div>
    </div>
  `;
}

// ── DRAG & DROP (przepisany) ──────────────────────────────
//
// Problem ze starym kodem: przy dragover element był jednocześnie
// usuwany z DOM i wstawiany gdzie indziej, co powodowało utratę
// stanu drag i błędy w przeglądarce. Nowe podejście:
// - dragEl NIE jest przenoszony podczas dragover
// - używamy tylko placeholder jako wizualną wskazówkę
// - reorder wykonuje się jednorazowo przy dragend na podstawie
//   pozycji placeholdera w DOM

function initDragDrop(pathId) {
  const list = document.getElementById('path-items-list');
  if (!list) return;

  let dragEl      = null;
  let placeholder = null;
  let insertBefore = null; // element przed którym wstawimy dragEl

  const DRAGGABLE_SEL = '.path-item, .path-group-header';

  list.addEventListener('dragstart', e => {
    const item = e.target.closest(DRAGGABLE_SEL);
    if (!item) { e.preventDefault(); return; }
    dragEl = item;

    placeholder = document.createElement('div');
    placeholder.className = 'path-item-placeholder';
    placeholder.style.height = item.offsetHeight + 'px';

    // Ukryj oryginał po starcie (nie usuwaj — drag image się psuje)
    requestAnimationFrame(() => {
      if (dragEl) dragEl.style.opacity = '0.35';
    });

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.dataset.itemKey || '');
  });

  list.addEventListener('dragend', () => {
    if (!dragEl) return;

    // Wstaw dragEl w miejsce placeholdera
    if (placeholder && placeholder.parentNode) {
      placeholder.parentNode.insertBefore(dragEl, placeholder);
      placeholder.remove();
    }

    dragEl.style.opacity = '';
    dragEl.classList.remove('dragging');

    // Zapisz nową kolejność
    const allItems = [...list.querySelectorAll(DRAGGABLE_SEL)];
    const newOrder = allItems.map(el => el.dataset.itemKey);
    reorderPath(pathId, newOrder);

    // Przenumeruj artykuły (pomijaj nagłówki grup)
    let n = 0;
    list.querySelectorAll(DRAGGABLE_SEL).forEach(el => {
      if (el.classList.contains('path-item')) {
        n++;
        const numEl = el.querySelector('.path-item-num');
        if (numEl) numEl.textContent = n;
      }
    });

    dragEl = null; placeholder = null; insertBefore = null;
  });

  list.addEventListener('dragover', e => {
    e.preventDefault();
    if (!dragEl || !placeholder) return;
    e.dataTransfer.dropEffect = 'move';

    const target = e.target.closest(DRAGGABLE_SEL);
    if (!target || target === dragEl) return;

    const rect   = target.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;

    // Wstaw placeholder (tylko jeśli zmienił się cel)
    if (before) {
      if (target.previousSibling !== placeholder) target.before(placeholder);
    } else {
      if (target.nextSibling !== placeholder) target.after(placeholder);
    }
  });

  list.addEventListener('dragleave', e => {
    // Usuń placeholder tylko gdy kursor opuszcza cały list
    if (!list.contains(e.relatedTarget)) {
      placeholder?.remove();
    }
  });

  list.addEventListener('drop', e => {
    e.preventDefault();
    // dragend obsługuje faktyczne przeniesienie
  });
}

function reorderPath(pathId, newOrder) {
  const paths = JSON.parse(localStorage.getItem('kp_reading_paths') || '[]');
  const path  = paths.find(p => p.id === pathId);
  if (!path) return;

  const itemMap = {};
  path.items.forEach(i => { itemMap[i.articleId || i.id || i.title] = i; });

  path.items = newOrder
    .map(key => itemMap[key])
    .filter(Boolean);

  localStorage.setItem('kp_reading_paths', JSON.stringify(paths));
}

// ── EVENTY WIDOKU ŚCIEŻKI ─────────────────────────────────

function bindPathViewEvents(pathId) {
  const main = document.getElementById('main-content');

  main.querySelector('#btn-back-paths').addEventListener('click', () => {
    openPathsPanel();
  });

  main.querySelector('#btn-edit-path').addEventListener('click', () => showEditModal(pathId));
  main.querySelector('#btn-import-list').addEventListener('click', () => showImportModal(pathId));
  main.querySelector('#btn-add-article-to-path').addEventListener('click', () => showAddArticleModal(pathId));
  main.querySelector('#btn-add-group').addEventListener('click', () => showAddGroupModal(pathId));

  // Status toggle
  main.querySelectorAll('.path-item-status-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const path = getPath(pathId);
      const key  = btn.dataset.itemKey;
      const item = path?.items.find(i => (i.articleId || i.title) === key);
      if (!item) return;
      const next = { todo: 'reading', reading: 'done', done: 'todo' }[item.status];
      setItemStatus(pathId, item.articleId || null, next, item.title);
      const row = btn.closest('.path-item');
      if (row) {
        row.className = `path-item ${next}`;
        btn.textContent = { todo: '⬜', reading: '🔄', done: '✅' }[next];
      }
      refreshProgressBar(pathId);
    });
  });

  // Klik w tytuł artykułu (istniejący)
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

  // Usuń z ścieżki (artykuły i nagłówki grup)
  main.querySelectorAll('.btn-remove-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.itemKey || btn.dataset.id || btn.dataset.title;
      removeItemFromPathByKey(pathId, key);
      refreshProgressBar(pathId);
      // Przenumeruj
      let n = 0;
      document.querySelectorAll('.path-item').forEach(el => {
        n++;
        const numEl = el.querySelector('.path-item-num');
        if (numEl) numEl.textContent = n;
      });
      btn.closest('.path-item, .path-group-header')?.remove();
    });
  });

  // Zmień nazwę grupy
  main.querySelectorAll('.btn-edit-group').forEach(btn => {
    btn.addEventListener('click', () => {
      const key  = btn.dataset.itemKey;
      const span = main.querySelector(`.path-group-title[data-item-key="${CSS.escape(key)}"]`);
      if (!span) return;
      const oldName = span.textContent;
      const newName = prompt('Nowa nazwa grupy:', oldName);
      if (!newName?.trim() || newName.trim() === oldName) return;
      renameGroupInPath(pathId, key, newName.trim());
      span.textContent = newName.trim();
    });
  });
}

function refreshProgressBar(pathId) {
  const path = getPath(pathId);
  if (!path) return;
  const { total, done, reading, todo, pct } = getPathStats(path);
  const fill = document.querySelector('.path-progress-fill');
  if (fill) {
    fill.style.width = pct + '%';
    const span = fill.querySelector('span');
    if (span) span.textContent = pct + '%';
  }
  const statsRow = document.getElementById('path-stats-row');
  if (statsRow) statsRow.innerHTML = `
    <span class="path-stat">✅ ${done} przeczytanych</span>
    <span class="path-stat">🔄 ${reading} w trakcie</span>
    <span class="path-stat">⬜ ${todo} do przeczytania</span>
    <span class="path-stat-total">${total} łącznie</span>
  `;
}

// ── STORAGE HELPERS ───────────────────────────────────────

/** Usuwa element ze ścieżki na podstawie złożonego klucza (articleId / group id / tytuł) */
function removeItemFromPathByKey(pathId, key) {
  const paths = JSON.parse(localStorage.getItem('kp_reading_paths') || '[]');
  const path  = paths.find(p => p.id === pathId);
  if (!path) return;
  path.items = path.items.filter(i => {
    const k = i.articleId || i.id || i.title;
    return k !== key;
  });
  localStorage.setItem('kp_reading_paths', JSON.stringify(paths));
}

function renameGroupInPath(pathId, key, newName) {
  const paths = JSON.parse(localStorage.getItem('kp_reading_paths') || '[]');
  const path  = paths.find(p => p.id === pathId);
  if (!path) return;
  const item = path.items.find(i => (i.id || i.title) === key && i.type === 'group');
  if (item) item.title = newName;
  localStorage.setItem('kp_reading_paths', JSON.stringify(paths));
}

function addGroupToPath(pathId, groupName) {
  const paths = JSON.parse(localStorage.getItem('kp_reading_paths') || '[]');
  const path  = paths.find(p => p.id === pathId);
  if (!path) return;
  path.items.push({
    type:  'group',
    id:    'grp_' + Date.now().toString(36),
    title: groupName,
    addedAt: new Date().toISOString()
  });
  localStorage.setItem('kp_reading_paths', JSON.stringify(paths));
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

function showAddGroupModal(pathId) {
  const name = prompt('Nazwa grupy (nagłówka sekcji):');
  if (!name?.trim()) return;
  addGroupToPath(pathId, name.trim());
  renderPathView(pathId);
  showToast(`Dodano grupę „${name.trim()}"`);
}

function showAddArticleModal(pathId) {
  const path = getPath(pathId);
  if (!path) return;
  const existing = new Set(path.items.filter(i => i.articleId).map(i => i.articleId));

  // Pokaż picker z opcją wpisania własnego tytułu
  showArticlePickerModal(
    'Dodaj artykuł do ścieżki',
    getAllMeta().filter(a => !existing.has(a.id)),
    (article) => {
      addItemToPath(pathId, article.id || null, article.title);
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
        Artykuły istniejące w kompendium zostaną połączone automatycznie.<br>
        Pozostałe zostaną dodane jako placeholdery (do napisania później).
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
    const lines = ta.value.split('\n').map(l => l.trim()).filter(Boolean);
    const allMeta = getAllMeta();
    const matched = lines.filter(t => allMeta.some(a => a.title.toLowerCase() === t.toLowerCase())).length;
    overlay.querySelector('#import-preview-count').textContent =
      lines.length ? `${lines.length} pozycji · ${matched} znalezionych w kompendium · ${lines.length - matched} jako placeholder` : '';
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
    const placeholders = items.filter(i => !i.articleId).length;
    showToast(`Zaimportowano ${items.length} pozycji${placeholders ? ` (${placeholders} placeholder)` : ''}`);
  });
  setTimeout(() => ta.focus(), 50);
}

/**
 * Picker artykułu z możliwością wpisania dowolnego tytułu
 * (dla artykułów jeszcze nieistniejących).
 */
function showArticlePickerModal(title, articles, onSelect) {
  const overlay = document.createElement('div');
  overlay.className = 'modal';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:480px;width:95vw">
      <h2>${escHtml(title)}</h2>
      <input type="text" id="picker-search" placeholder="Szukaj lub wpisz własny tytuł…" style="
        width:100%;padding:7px 10px;border:1px solid var(--border);
        border-radius:var(--radius-sm);background:var(--bg-panel);
        color:var(--text);font-family:var(--font-ui);font-size:.9rem;outline:none"/>
      <div id="picker-custom-hint" style="font-size:.77rem;color:var(--text-faint);margin:4px 0 2px;display:none">
        ↵ Dodaj jako placeholder (artykuł jeszcze nie istnieje)
      </div>
      <div id="picker-list" style="max-height:300px;overflow-y:auto;
           border:1px solid var(--border);border-radius:var(--radius-sm);margin-top:4px"></div>
      <div class="modal-actions">
        <button class="btn-primary" id="btn-picker-add-custom" style="display:none">
          Dodaj placeholder
        </button>
        <button class="btn-ghost" id="btn-picker-cancel">Anuluj</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const input    = overlay.querySelector('#picker-search');
  const hint     = overlay.querySelector('#picker-custom-hint');
  const btnCustom = overlay.querySelector('#btn-picker-add-custom');

  const render = (q = '') => {
    const filtered = q
      ? articles.filter(a => a.title.toLowerCase().includes(q.toLowerCase()))
      : articles;
    const list = overlay.querySelector('#picker-list');

    // Pokaż opcję "dodaj jako placeholder" gdy brak dokładnego dopasowania
    const exactMatch = articles.some(a => a.title.toLowerCase() === q.toLowerCase());
    const showCustom  = q.length >= 2 && !exactMatch;
    hint.style.display    = showCustom ? '' : 'none';
    btnCustom.style.display = showCustom ? '' : 'none';
    btnCustom.textContent = `Dodaj „${q}" jako placeholder`;

    list.innerHTML = filtered.slice(0, 50).map(a =>
      `<div class="picker-item" data-id="${escAttr(a.id)}" data-title="${escAttr(a.title)}">${escHtml(a.title)}</div>`
    ).join('') || (q
      ? '<div style="padding:14px;color:var(--text-faint);font-size:.85rem">Brak wyników — możesz dodać jako placeholder ↓</div>'
      : '<div style="padding:14px;color:var(--text-faint);font-size:.85rem">Brak artykułów</div>');

    list.querySelectorAll('.picker-item').forEach(el => {
      el.addEventListener('click', () => {
        onSelect({ id: el.dataset.id, title: el.dataset.title });
        overlay.remove();
      });
    });
  };

  input.addEventListener('input', e => render(e.target.value));
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const q = input.value.trim();
      if (q.length >= 2) {
        // Jeśli jest dokładne dopasowanie, wybierz je
        const exact = articles.find(a => a.title.toLowerCase() === q.toLowerCase());
        if (exact) { onSelect({ id: exact.id, title: exact.title }); overlay.remove(); return; }
        // Inaczej dodaj placeholder
        onSelect({ id: null, title: q });
        overlay.remove();
      }
    }
    if (e.key === 'Escape') overlay.remove();
  });

  btnCustom.addEventListener('click', () => {
    const q = input.value.trim();
    if (q.length >= 2) { onSelect({ id: null, title: q }); overlay.remove(); }
  });

  overlay.querySelector('#btn-picker-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  render();
  setTimeout(() => input.focus(), 50);
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

  wrap.querySelector('#btn-add-to-path').addEventListener('click', (e) => {
    e.stopPropagation();
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
    showArticlePickerModal(
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

// ── HELPERS ───────────────────────────────────────────────

function escHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
