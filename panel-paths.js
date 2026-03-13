// panel-paths.js — Panel i widok ścieżek czytania (przeprojektowany)

import {
  getAllPaths, getPath, createPath, updatePath, deletePath,
  addItemToPath, addGroupToPath, removeItemFromPath, setItemStatus,
  reorderPathItems, importPathItems, renameGroupInPath,
  getPathStats, getPathsForArticle, loadPathsData,
  resolvePlaceholders, _itemKey, onPathsChange,
} from './reading-paths.js';
import { getAllMeta } from './articles.js';
import { openPanel, closePanel, isOpen } from './panels.js';
import { showToast } from './ui.js';

let navigateFn = null;
let _currentPathId = null;

export function initPathsPanel(navigateCallback) {
  navigateFn = navigateCallback;

  document.getElementById('btn-paths-panel').addEventListener('click', (e) => {
    e.stopPropagation();
    isOpen('paths') ? closePanel('paths') : openPathsPanel();
  });
  document.getElementById('btn-close-paths-panel').addEventListener('click', () => closePanel('paths'));

  loadPathsData();

  onPathsChange(() => {
    if (isOpen('paths')) renderPathsList();
    if (_currentPathId) _refreshCurrentPathStats();
  });
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

  document.getElementById('btn-new-path').addEventListener('click', () => showPathModal(null));

  container.querySelectorAll('.path-card').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.path-card-actions')) return;
      closePanel('paths');
      navigateFn('path/' + el.dataset.id);
    });
  });

  container.querySelectorAll('.btn-path-delete').forEach(el => {
    el.addEventListener('mousedown', e => e.stopPropagation());
    el.addEventListener('click', async e => {
      e.stopPropagation();
      const path = getPath(el.dataset.id);
      if (!path) return;
      if (!confirm(`Usunąć ścieżkę „${path.name}"?`)) return;
      await deletePath(el.dataset.id);
      showToast('Ścieżka usunięta');
      renderPathsList();
    });
  });
}

function renderPathCard(path) {
  const { total, done, pct } = getPathStats(path);
  const colorStyle = path.color ? `border-left:3px solid ${path.color}` : '';
  return `
    <div class="path-card" data-id="${path.id}" style="${colorStyle}">
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
  _currentPathId = pathId;
  const main = document.getElementById('main-content');
  const path = getPath(pathId);

  if (!path) {
    main.innerHTML = '<div class="loading-spinner"><div class="spinner"></div> Ładowanie ścieżki…</div>';
    const unsub = onPathsChange(() => {
      const p = getPath(pathId);
      if (p) { unsub(); renderPathView(pathId); }
    });
    setTimeout(() => {
      if (!getPath(pathId))
        main.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><p>Ścieżka nie istnieje.</p></div>';
    }, 5000);
    return;
  }

  const { total, done, reading, todo, pct } = getPathStats(path);
  const sections = _getSections(path);

  main.innerHTML = `
    <div id="view-path">
      <div id="path-layout">

        <nav id="path-nav-sidebar" ${sections.length < 2 ? 'style="display:none"' : ''}>
          <div id="path-nav-header">Sekcje</div>
          <ul id="path-nav-list">
            ${sections.map(s => `
              <li class="path-nav-item" data-section="${escAttr(s.id)}">
                <span class="path-nav-label">${escHtml(s.title)}</span>
                <span class="path-nav-badge">${s.done}/${s.total}</span>
              </li>
            `).join('')}
          </ul>
        </nav>

        <div id="path-main-col">

          <div id="path-header">
            <div id="path-header-left">
              ${path.color ? `<div class="path-color-dot" style="background:${path.color}"></div>` : ''}
              <div>
                <h1 id="path-title-display">${escHtml(path.name)}</h1>
                ${path.description ? `<p class="path-desc-display">${escHtml(path.description)}</p>` : ''}
              </div>
            </div>
            <div id="path-header-actions">
              <button class="btn-small" id="btn-edit-path">✎ Edytuj</button>
              <button class="btn-small" id="btn-add-group">＋ Sekcję</button>
              <button class="btn-small" id="btn-import-list">📋 Importuj</button>
              <button class="btn-small" id="btn-add-article-to-path">＋ Artykuł</button>
            </div>
          </div>

          <div id="path-progress-section">
            <div id="path-stats-row">
              <span class="path-stat path-stat-done">✅ <strong>${done}</strong> przeczytanych</span>
              <span class="path-stat path-stat-reading">🔄 <strong>${reading}</strong> w trakcie</span>
              <span class="path-stat path-stat-todo">⬜ <strong>${todo}</strong> do przeczytania</span>
              <span class="path-stat-total">${total} łącznie</span>
            </div>
            <div class="path-progress-bar big">
              <div class="path-progress-fill" style="width:${pct}%">
                ${pct > 8 ? `<span>${pct}%</span>` : ''}
              </div>
            </div>
          </div>

          <div id="path-items-list">
            ${_renderPathItems(path)}
          </div>

        </div>
      </div>
    </div>
  `;

  _bindPathViewEvents(pathId);
  _initDragDrop(pathId);
  _bindNavSidebar();
}

// ── SIDEBAR NAWIGACYJNY ───────────────────────────────────

function _getSections(path) {
  const sections = [];
  let current = { id: '__start__', title: path.name, items: [], done: 0, total: 0 };

  path.items.forEach(item => {
    if (item.type === 'group') {
      sections.push(current);
      current = { id: _itemKey(item), title: item.title, items: [], done: 0, total: 0 };
    } else {
      current.items.push(item);
      current.total++;
      if (item.status === 'done') current.done++;
    }
  });
  sections.push(current);
  return sections.filter(s => s.total > 0);
}

function _bindNavSidebar() {
  document.querySelectorAll('.path-nav-item').forEach(el => {
    el.addEventListener('click', () => {
      const sectionId = el.dataset.section;
      const target = sectionId === '__start__'
        ? document.getElementById('path-items-list')?.firstElementChild
        : document.querySelector(`.path-group-header[data-section-id="${CSS.escape(sectionId)}"]`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.querySelectorAll('.path-nav-item').forEach(n => n.classList.remove('active'));
      el.classList.add('active');
    });
  });
}

// ── RENDEROWANIE LISTY POZYCJI ────────────────────────────

function _renderPathItems(path) {
  if (!path.items.length) {
    return `<div class="path-empty-state">
      <div class="path-empty-icon">📚</div>
      <p>Ta ścieżka jest pusta.</p>
      <p class="path-empty-hint">Dodaj artykuły lub <button class="btn-link" id="btn-empty-import">importuj listę z AI</button></p>
    </div>`;
  }

  const parts = [];
  let articleIndex = 0;

  path.items.forEach(item => {
    if (item.type === 'group') {
      parts.push(_renderGroupHeader(item));
    } else {
      articleIndex++;
      parts.push(_renderPathItem(item, articleIndex));
    }
  });

  return parts.join('');
}

function _renderGroupHeader(item) {
  const key = _itemKey(item);
  return `
    <div class="path-group-header" data-item-key="${escAttr(key)}" data-section-id="${escAttr(key)}" draggable="true">
      <div class="path-item-drag">⠿</div>
      <span class="path-group-icon">▸</span>
      <span class="path-group-title">${escHtml(item.title)}</span>
      <div class="path-item-actions">
        <button class="path-item-btn btn-edit-group" data-item-key="${escAttr(key)}" title="Zmień nazwę">✎</button>
        <button class="path-item-btn btn-remove-item" data-item-key="${escAttr(key)}" title="Usuń sekcję">✕</button>
      </div>
    </div>
  `;
}

function _renderPathItem(item, idx) {
  const key        = _itemKey(item);
  const hasArticle = !!item.articleId;
  const status     = item.status || 'todo';
  const statusIcon = { todo: '○', reading: '◑', done: '●' }[status];
  const nextStatus = { todo: 'reading', reading: 'done', done: 'todo' };
  const statusLabel = { todo: 'Do przeczytania', reading: 'W trakcie', done: 'Przeczytane' };

  return `
    <div class="path-item path-item-${status}"
         data-item-key="${escAttr(key)}"
         data-article-id="${escAttr(item.articleId||'')}"
         draggable="true">
      <div class="path-item-drag" title="Przeciągnij">⠿</div>
      <div class="path-item-num">${idx}</div>

      <button class="path-item-status path-status-${status}"
              data-item-key="${escAttr(key)}"
              data-next="${nextStatus[status]}"
              title="${statusLabel[status]} → kliknij aby zmienić">
        ${statusIcon}
      </button>

      <div class="path-item-body">
        <div class="path-item-title ${hasArticle ? 'path-item-link' : 'path-item-missing'}"
             data-id="${escAttr(item.articleId||'')}"
             data-title="${escAttr(item.title)}">
          ${escHtml(item.title)}
        </div>
        ${!hasArticle ? `<span class="path-item-badge-missing">brak w kompendium — kliknij aby napisać</span>` : ''}
      </div>

      <div class="path-item-actions">
        ${hasArticle && status !== 'reading' ? `
          <button class="path-item-btn btn-read-now"
                  data-id="${escAttr(item.articleId)}"
                  data-item-key="${escAttr(key)}"
                  title="Czytaj teraz">▶</button>
        ` : ''}
        <button class="path-item-btn btn-remove-item"
                data-item-key="${escAttr(key)}"
                title="Usuń z ścieżki">✕</button>
      </div>
    </div>
  `;
}

// ── EVENTY WIDOKU ─────────────────────────────────────────

function _bindPathViewEvents(pathId) {
  const main = document.getElementById('main-content');

  main.querySelector('#btn-edit-path').addEventListener('click', () => showPathModal(pathId));
  main.querySelector('#btn-import-list').addEventListener('click', () => showImportModal(pathId));
  main.querySelector('#btn-add-article-to-path').addEventListener('click', () => showAddArticleModal(pathId));
  main.querySelector('#btn-add-group').addEventListener('click', () => showAddGroupModal(pathId));
  main.querySelector('#btn-empty-import')?.addEventListener('click', () => showImportModal(pathId));

  main.querySelectorAll('.path-item-status').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key  = btn.dataset.itemKey;
      const next = btn.dataset.next;
      await setItemStatus(pathId, key, next);

      const row = btn.closest('.path-item');
      if (row) {
        const icons  = { todo: '○', reading: '◑', done: '●' };
        const labels = { todo: 'Do przeczytania', reading: 'W trakcie', done: 'Przeczytane' };
        const nexts  = { todo: 'reading', reading: 'done', done: 'todo' };

        row.className = `path-item path-item-${next}`;
        btn.className = `path-item-status path-status-${next}`;
        btn.textContent = icons[next];
        btn.dataset.next = nexts[next];
        btn.title = labels[next] + ' → kliknij aby zmienić';

        const actionsDiv = row.querySelector('.path-item-actions');
        const existingRead = actionsDiv?.querySelector('.btn-read-now');
        if (next !== 'reading' && row.dataset.articleId && !existingRead && actionsDiv) {
          const readBtn = document.createElement('button');
          readBtn.className = 'path-item-btn btn-read-now';
          readBtn.dataset.id = row.dataset.articleId;
          readBtn.dataset.itemKey = key;
          readBtn.title = 'Czytaj teraz';
          readBtn.textContent = '▶';
          actionsDiv.prepend(readBtn);
          readBtn.addEventListener('click', () => _readNow(pathId, row.dataset.articleId, key));
        } else if (next === 'reading' && existingRead) {
          existingRead.remove();
        }
      }
      _refreshCurrentPathStats();
      _refreshNavSidebar(pathId);
    });
  });

  main.querySelectorAll('.btn-read-now').forEach(btn => {
    btn.addEventListener('click', () => _readNow(pathId, btn.dataset.id, btn.dataset.itemKey));
  });

  main.querySelectorAll('.path-item-link').forEach(el => {
    el.addEventListener('click', () => { if (el.dataset.id) navigateFn('article/' + el.dataset.id); });
  });

  main.querySelectorAll('.path-item-missing').forEach(el => {
    el.addEventListener('click', () => {
      if (el.dataset.title) navigateFn('editor/new', { prefillTitle: el.dataset.title });
    });
  });

  main.querySelectorAll('.btn-remove-item').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.itemKey;
      await removeItemFromPath(pathId, key);
      btn.closest('.path-item, .path-group-header')?.remove();
      _renumberItems();
      _refreshCurrentPathStats();
      _refreshNavSidebar(pathId);
    });
  });

  main.querySelectorAll('.btn-edit-group').forEach(btn => {
    btn.addEventListener('click', () => showRenameGroupModal(pathId, btn.dataset.itemKey));
  });
}

async function _readNow(pathId, articleId, itemKey) {
  await setItemStatus(pathId, itemKey, 'reading');
  navigateFn('article/' + articleId);
}

function _renumberItems() {
  let n = 0;
  document.querySelectorAll('.path-item').forEach(el => {
    n++;
    const numEl = el.querySelector('.path-item-num');
    if (numEl) numEl.textContent = n;
  });
}

function _refreshCurrentPathStats() {
  const path = getPath(_currentPathId);
  if (!path) return;
  const { total, done, reading, todo, pct } = getPathStats(path);

  const fill = document.querySelector('#path-progress-section .path-progress-fill');
  if (fill) {
    fill.style.width = pct + '%';
    if (pct > 8) fill.innerHTML = `<span>${pct}%</span>`;
    else fill.innerHTML = '';
  }

  const statsRow = document.getElementById('path-stats-row');
  if (statsRow) statsRow.innerHTML = `
    <span class="path-stat path-stat-done">✅ <strong>${done}</strong> przeczytanych</span>
    <span class="path-stat path-stat-reading">🔄 <strong>${reading}</strong> w trakcie</span>
    <span class="path-stat path-stat-todo">⬜ <strong>${todo}</strong> do przeczytania</span>
    <span class="path-stat-total">${total} łącznie</span>
  `;
}

function _refreshNavSidebar(pathId) {
  const path = getPath(pathId);
  if (!path) return;
  const sections = _getSections(path);
  const navList  = document.getElementById('path-nav-list');
  if (!navList) return;
  navList.innerHTML = sections.map(s => `
    <li class="path-nav-item" data-section="${escAttr(s.id)}">
      <span class="path-nav-label">${escHtml(s.title)}</span>
      <span class="path-nav-badge">${s.done}/${s.total}</span>
    </li>
  `).join('');
  _bindNavSidebar();
}

// ── DRAG & DROP ───────────────────────────────────────────

function _initDragDrop(pathId) {
  const list = document.getElementById('path-items-list');
  if (!list) return;

  let dragEl = null, placeholder = null;
  const SEL  = '.path-item, .path-group-header';

  list.addEventListener('dragstart', e => {
    const item = e.target.closest(SEL);
    if (!item) { e.preventDefault(); return; }
    dragEl = item;
    placeholder = document.createElement('div');
    placeholder.className = 'path-item-placeholder';
    placeholder.style.height = item.offsetHeight + 'px';
    requestAnimationFrame(() => { if (dragEl) dragEl.style.opacity = '0.3'; });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.dataset.itemKey || '');
  });

  list.addEventListener('dragend', async () => {
    if (!dragEl) return;
    if (placeholder?.parentNode) { placeholder.parentNode.insertBefore(dragEl, placeholder); placeholder.remove(); }
    dragEl.style.opacity = '';
    const newOrder = [...list.querySelectorAll(SEL)].map(el => el.dataset.itemKey);
    await reorderPathItems(pathId, newOrder);
    _renumberItems();
    _refreshNavSidebar(pathId);
    dragEl = null; placeholder = null;
  });

  list.addEventListener('dragover', e => {
    e.preventDefault();
    if (!dragEl || !placeholder) return;
    const target = e.target.closest(SEL);
    if (!target || target === dragEl) return;
    const rect = target.getBoundingClientRect();
    if (e.clientY < rect.top + rect.height / 2) { if (target.previousSibling !== placeholder) target.before(placeholder); }
    else { if (target.nextSibling !== placeholder) target.after(placeholder); }
  });

  list.addEventListener('drop', e => e.preventDefault());
}

// ── MODALS ────────────────────────────────────────────────

function showPathModal(pathId) {
  const existing = pathId ? getPath(pathId) : null;
  const COLORS   = ['#e74c3c','#e67e22','#f1c40f','#2ecc71','#1abc9c','#3498db','#9b59b6','#e91e63','#607d8b'];

  const overlay = document.createElement('div');
  overlay.className = 'modal';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:480px;width:95vw">
      <h2>${existing ? '✎ Edytuj ścieżkę' : '＋ Nowa ścieżka czytania'}</h2>

      <div class="form-field">
        <label class="form-label">Nazwa</label>
        <input type="text" id="path-modal-name" class="form-input"
          placeholder="np. Filozofia chińska" value="${escAttr(existing?.name||'')}" />
      </div>

      <div class="form-field">
        <label class="form-label">Opis <span style="color:var(--text-faint)">(opcjonalnie)</span></label>
        <textarea id="path-modal-desc" class="form-input" rows="2"
          placeholder="Krótki opis tematu lub celu nauki…" style="resize:vertical">${escHtml(existing?.description||'')}</textarea>
      </div>

      <div class="form-field">
        <label class="form-label">Kolor</label>
        <div id="path-modal-colors" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">
          <button class="path-color-btn ${!existing?.color ? 'selected' : ''}" data-color=""
            style="width:26px;height:26px;border-radius:50%;background:var(--border);border:2px solid ${!existing?.color ? 'white' : 'var(--border)'}">✕</button>
          ${COLORS.map(c => `
            <button class="path-color-btn ${existing?.color === c ? 'selected' : ''}" data-color="${c}"
              style="width:26px;height:26px;border-radius:50%;background:${c};border:2px solid ${existing?.color === c ? 'white' : c}"></button>
          `).join('')}
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn-primary" id="btn-path-modal-save">
          ${existing ? 'Zapisz zmiany' : 'Utwórz ścieżkę'}
        </button>
        <button class="btn-ghost" id="btn-path-modal-cancel">Anuluj</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  let selectedColor = existing?.color || null;

  overlay.querySelectorAll('.path-color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      overlay.querySelectorAll('.path-color-btn').forEach(b => {
        b.style.border = `2px solid ${b.dataset.color || 'var(--border)'}`;
      });
      btn.style.border = '2px solid white';
      selectedColor = btn.dataset.color || null;
    });
  });

  const nameInput = overlay.querySelector('#path-modal-name');
  nameInput.focus();
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });

  async function save() {
    const name = nameInput.value.trim();
    const desc = overlay.querySelector('#path-modal-desc').value.trim();
    if (!name) { nameInput.focus(); return; }
    const btn  = overlay.querySelector('#btn-path-modal-save');
    btn.textContent = 'Zapisuję…'; btn.disabled = true;
    try {
      if (existing) {
        await updatePath(pathId, { name, description: desc, color: selectedColor });
        overlay.remove();
        renderPathView(pathId);
        showToast('Ścieżka zaktualizowana');
      } else {
        const p = await createPath(name, desc, selectedColor);
        overlay.remove();
        closePanel('paths');
        navigateFn('path/' + p.id);
      }
    } catch(e) {
      showToast('Błąd: ' + e.message);
      btn.textContent = existing ? 'Zapisz zmiany' : 'Utwórz ścieżkę';
      btn.disabled = false;
    }
  }

  overlay.querySelector('#btn-path-modal-save').addEventListener('click', save);
  overlay.querySelector('#btn-path-modal-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

function showAddGroupModal(pathId) {
  showSimpleModal('Nazwa sekcji', 'np. Starożytna Grecja', async (name) => {
    await addGroupToPath(pathId, name);
    renderPathView(pathId);
    showToast(`Dodano sekcję „${name}"`);
  });
}

function showRenameGroupModal(pathId, itemKey) {
  const path = getPath(pathId);
  const item = path?.items.find(i => _itemKey(i) === itemKey);
  if (!item) return;
  showSimpleModal('Nowa nazwa sekcji', item.title, async (name) => {
    await renameGroupInPath(pathId, itemKey, name);
    const header = document.querySelector(`.path-group-header[data-item-key="${CSS.escape(itemKey)}"]`);
    if (header) { const t = header.querySelector('.path-group-title'); if (t) t.textContent = name; }
    _refreshNavSidebar(pathId);
    showToast('Sekcja zmieniona');
  }, item.title);
}

function showSimpleModal(label, placeholder, onConfirm, defaultValue = '') {
  const overlay = document.createElement('div');
  overlay.className = 'modal';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:360px;width:95vw">
      <div class="form-field">
        <label class="form-label">${escHtml(label)}</label>
        <input type="text" id="simple-modal-input" class="form-input"
          placeholder="${escAttr(placeholder)}" value="${escAttr(defaultValue)}" />
      </div>
      <div class="modal-actions">
        <button class="btn-primary" id="btn-simple-confirm">OK</button>
        <button class="btn-ghost"   id="btn-simple-cancel">Anuluj</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const input = overlay.querySelector('#simple-modal-input');
  input.focus(); input.select();

  async function confirm() {
    const val = input.value.trim();
    if (!val) { input.focus(); return; }
    overlay.remove();
    await onConfirm(val);
  }

  input.addEventListener('keydown', e => { if (e.key === 'Enter') confirm(); if (e.key === 'Escape') overlay.remove(); });
  overlay.querySelector('#btn-simple-confirm').addEventListener('click', confirm);
  overlay.querySelector('#btn-simple-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

function showAddArticleModal(pathId) {
  const path = getPath(pathId);
  if (!path) return;
  const existing = new Set(path.items.filter(i => i.articleId).map(i => i.articleId));
  _showArticlePickerModal(
    'Dodaj artykuł do ścieżki',
    getAllMeta().filter(a => !existing.has(a.id)),
    async (article) => {
      await addItemToPath(pathId, article.id || null, article.title);
      renderPathView(pathId);
      showToast(`Dodano „${article.title}"`);
    }
  );
}

// ── IMPORT Z AI ───────────────────────────────────────────

const AI_PROMPT_TEMPLATE = `Przygotuj mi listę zagadnień/artykułów do nauki tematu: [TWÓJ TEMAT]

Odpowiedz TYLKO w tym formacie — nic więcej:

# Nazwa sekcji 1
- Tytuł artykułu 1
- Tytuł artykułu 2
- Tytuł artykułu 3

# Nazwa sekcji 2
- Tytuł artykułu 4
- Tytuł artykułu 5

Zasady:
- Tytuły powinny odpowiadać nazwom artykułów na Wikipedii
- Kolejność od podstawowych do bardziej zaawansowanych
- 3–6 sekcji tematycznych
- 4–8 artykułów na sekcję
- Żadnych opisów, tylko tytuły
- Linie zaczynające się od # to nagłówki sekcji
- Linie zaczynające się od - to artykuły`;

function showImportModal(pathId) {
  const overlay = document.createElement('div');
  overlay.className = 'modal';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:580px;width:95vw">
      <h2>📋 Importuj listę z AI</h2>

      <div class="import-prompt-section">
        <div class="import-prompt-header">
          <span class="import-prompt-label">💡 Gotowy prompt do skopiowania</span>
          <button class="btn-small" id="btn-copy-prompt">📋 Kopiuj prompt</button>
        </div>
        <pre class="import-prompt-box" id="import-prompt-box">${escHtml(AI_PROMPT_TEMPLATE)}</pre>
        <p class="import-prompt-hint">
          Skopiuj prompt, wklej do dowolnego czatu AI (ChatGPT, Claude, Gemini…),
          zastąp <code>[TWÓJ TEMAT]</code> tematem i wklej wynik poniżej.
        </p>
      </div>

      <div style="margin:16px 0 6px;font-size:.85rem;color:var(--text-muted);font-weight:500">
        Wklej odpowiedź AI:
      </div>
      <textarea id="import-list-textarea" rows="10" class="form-input" style="
        font-family:var(--font-mono);font-size:.82rem;resize:vertical;line-height:1.6
      " placeholder="# Starożytna Grecja&#10;- Platon&#10;- Arystoteles&#10;&#10;# Filozofia wschodnia&#10;- Konfucjusz&#10;- Laozi"></textarea>

      <div id="import-preview" style="font-size:.78rem;color:var(--text-faint);margin:6px 0;min-height:1em"></div>

      <div class="modal-actions">
        <button class="btn-primary" id="btn-import-confirm">Importuj</button>
        <button class="btn-ghost"   id="btn-import-cancel">Anuluj</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#btn-copy-prompt').addEventListener('click', () => {
    navigator.clipboard.writeText(AI_PROMPT_TEMPLATE).then(() => {
      showToast('Prompt skopiowany 📋');
      const btn = overlay.querySelector('#btn-copy-prompt');
      btn.textContent = '✓ Skopiowano';
      setTimeout(() => { if (btn.isConnected) btn.textContent = '📋 Kopiuj prompt'; }, 2000);
    }).catch(() => {
      const range = document.createRange();
      range.selectNodeContents(overlay.querySelector('#import-prompt-box'));
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
    });
  });

  const ta      = overlay.querySelector('#import-list-textarea');
  const preview = overlay.querySelector('#import-preview');

  ta.addEventListener('input', () => {
    const parsed   = _parseImportText(ta.value);
    const articles = parsed.filter(i => i.type === 'article');
    const groups   = parsed.filter(i => i.type === 'group');
    const allMeta  = getAllMeta();
    const matched  = articles.filter(i => allMeta.some(a => a.title.toLowerCase() === i.title.toLowerCase())).length;
    if (!articles.length) { preview.textContent = ''; return; }
    preview.textContent = `${articles.length} artykułów · ${groups.length} sekcji · ${matched} znalezionych w kompendium · ${articles.length - matched} jako placeholder`;
  });

  overlay.querySelector('#btn-import-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#btn-import-confirm').addEventListener('click', async () => {
    const parsed = _parseImportText(ta.value);
    if (!parsed.length) return;
    const allMeta = getAllMeta();

    const newItems = parsed.map(p => {
      if (p.type === 'group') {
        return { type: 'group', id: 'grp_' + Date.now().toString(36) + Math.random().toString(36).slice(2,5), title: p.title, addedAt: new Date().toISOString() };
      }
      const found = allMeta.find(a => a.title.toLowerCase() === p.title.toLowerCase());
      return { type: 'article', articleId: found?.id || null, title: found?.title || p.title, status: 'todo', addedAt: new Date().toISOString() };
    });

    const btn = overlay.querySelector('#btn-import-confirm');
    btn.textContent = 'Importuję…'; btn.disabled = true;

    try {
      const path = getPath(pathId);
      await updatePath(pathId, { items: [...(path?.items || []), ...newItems] });
      overlay.remove();
      renderPathView(pathId);
      const arts = newItems.filter(i => i.type === 'article');
      const ph   = arts.filter(i => !i.articleId).length;
      showToast(`Zaimportowano ${arts.length} artykułów, ${newItems.filter(i=>i.type==='group').length} sekcji${ph ? ` (${ph} placeholder)` : ''}`);
    } catch(e) {
      showToast('Błąd importu: ' + e.message);
      btn.textContent = 'Importuj'; btn.disabled = false;
    }
  });

  setTimeout(() => ta.focus(), 50);
}

function _parseImportText(text) {
  const items = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.startsWith('#')) {
      const title = line.replace(/^#+\s*/, '').trim();
      if (title) items.push({ type: 'group', title });
    } else {
      const title = line.replace(/^[-*•]\s*/, '').replace(/^\d+\.\s*/, '').trim();
      if (title) items.push({ type: 'article', title });
    }
  }
  return items;
}

// ── ARTICLE PICKER ────────────────────────────────────────

function _showArticlePickerModal(title, articles, onSelect) {
  const overlay = document.createElement('div');
  overlay.className = 'modal';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:480px;width:95vw">
      <h2>${escHtml(title)}</h2>
      <input type="text" id="picker-search" class="form-input" placeholder="Szukaj lub wpisz własny tytuł…" style="margin-bottom:6px"/>
      <div id="picker-custom-hint" style="font-size:.77rem;color:var(--text-faint);margin:2px 0;display:none">
        ↵ Dodaj jako placeholder
      </div>
      <div id="picker-list" style="max-height:300px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm)"></div>
      <div class="modal-actions">
        <button class="btn-primary" id="btn-picker-add-custom" style="display:none">Dodaj placeholder</button>
        <button class="btn-ghost"   id="btn-picker-cancel">Anuluj</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = overlay.querySelector('#picker-search');
  const hint  = overlay.querySelector('#picker-custom-hint');
  const btnC  = overlay.querySelector('#btn-picker-add-custom');

  const render = (q = '') => {
    const filtered   = q ? articles.filter(a => a.title.toLowerCase().includes(q.toLowerCase())) : articles;
    const exactMatch = articles.some(a => a.title.toLowerCase() === q.toLowerCase());
    const show       = q.length >= 2 && !exactMatch;
    hint.style.display = show ? '' : 'none';
    btnC.style.display = show ? '' : 'none';
    btnC.textContent   = `Dodaj „${q}" jako placeholder`;

    const list = overlay.querySelector('#picker-list');
    list.innerHTML = filtered.slice(0,50).map(a =>
      `<div class="picker-item" data-id="${escAttr(a.id)}" data-title="${escAttr(a.title)}">${escHtml(a.title)}</div>`
    ).join('') || `<div style="padding:14px;color:var(--text-faint);font-size:.85rem">${q ? 'Brak wyników' : 'Brak artykułów'}</div>`;

    list.querySelectorAll('.picker-item').forEach(el =>
      el.addEventListener('click', () => { onSelect({ id: el.dataset.id, title: el.dataset.title }); overlay.remove(); })
    );
  };

  input.addEventListener('input', e => render(e.target.value));
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const q = input.value.trim();
      if (q.length >= 2) {
        const exact = articles.find(a => a.title.toLowerCase() === q.toLowerCase());
        onSelect(exact ? { id: exact.id, title: exact.title } : { id: null, title: q });
        overlay.remove();
      }
    }
    if (e.key === 'Escape') overlay.remove();
  });

  btnC.addEventListener('click', () => {
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
        const statusIcon = { todo: '○', reading: '◑', done: '●' }[item?.status||'todo'];
        return `<span class="article-path-chip path-status-${item?.status||'todo'}" data-path-id="${p.id}">
          ${statusIcon} ${escHtml(p.name)}
          <span style="opacity:.5;font-size:.7rem">${done}/${total}</span>
        </span>`;
      }).join('')}
      <button class="btn-small" id="btn-add-to-path">＋ Ścieżka</button>
    </div>
  `;

  wrap.querySelectorAll('.article-path-chip').forEach(chip =>
    chip.addEventListener('click', () => navigateFn('path/' + chip.dataset.pathId))
  );

  wrap.querySelector('#btn-add-to-path').addEventListener('click', (e) => {
    e.stopPropagation();
    const available = allPaths.filter(p => !p.items.some(i => i.articleId === articleId));
    if (!allPaths.length) { showPathModal(null); return; }
    if (!available.length) { showToast('Artykuł jest już we wszystkich ścieżkach'); return; }
    _showQuickPathDropdown(e.currentTarget, available, async (path) => {
      await addItemToPath(path.id, articleId, articleTitle);
      showToast(`Dodano do „${path.name}"`);
      const old = document.getElementById('article-path-widget');
      if (old) old.replaceWith(renderArticlePathWidget(articleId, articleTitle));
    });
  });

  return wrap;
}

function _showQuickPathDropdown(anchor, paths, onSelect) {
  document.querySelector('.quick-path-dropdown')?.remove();
  const drop = document.createElement('div');
  drop.className = 'quick-path-dropdown';
  const rect = anchor.getBoundingClientRect();
  drop.style.cssText = `position:fixed;top:${rect.bottom+4}px;left:${rect.left}px;z-index:9999;
    background:var(--bg-panel);border:1px solid var(--border);border-radius:var(--radius);
    box-shadow:var(--shadow-lg);min-width:200px;max-width:300px;overflow:hidden`;

  drop.innerHTML = paths.map(p => `
    <div class="quick-path-item" data-id="${p.id}" style="padding:9px 14px;cursor:pointer;font-size:.88rem;
      display:flex;align-items:center;gap:8px">
      ${p.color ? `<span style="width:8px;height:8px;border-radius:50%;background:${p.color};flex-shrink:0"></span>` : ''}
      ${escHtml(p.name)}
    </div>
  `).join('');

  document.body.appendChild(drop);
  drop.querySelectorAll('.quick-path-item').forEach(el => {
    el.addEventListener('mouseenter', () => el.style.background = 'var(--bg-hover)');
    el.addEventListener('mouseleave', () => el.style.background = '');
    el.addEventListener('click', () => {
      onSelect(paths.find(p => p.id === el.dataset.id));
      drop.remove();
    });
  });
  setTimeout(() => document.addEventListener('click', () => drop.remove(), { once: true }), 10);
}

// ── RESOLVE PLACEHOLDERS ──────────────────────────────────

export async function tryResolvePlaceholders() {
  await resolvePlaceholders(getAllMeta());
}

// ── HELPERS ───────────────────────────────────────────────

function escHtml(str) {
  return (str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function escAttr(str) {
  return (str||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
