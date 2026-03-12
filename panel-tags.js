// panel-tags.js — Wysuwany panel przeglądania tagów

import { getAllTags } from './tags.js';

let navigateFn = null;

export function initTagsPanel(navigateCallback) {
  navigateFn = navigateCallback;

  const btnOpen  = document.getElementById('btn-tags-panel');
  const btnClose = document.getElementById('btn-close-tags-panel');
  const overlay  = document.getElementById('panel-overlay');

  btnOpen.addEventListener('click', () => togglePanel());
  btnClose.addEventListener('click', () => hidePanel());
  overlay.addEventListener('click', () => hidePanel());
}

export function showTagsPanel() {
  const panel = document.getElementById('panel-tags-list');
  const overlay = document.getElementById('panel-overlay');
  panel.classList.remove('hidden');
  requestAnimationFrame(() => panel.classList.add('visible'));
  overlay.classList.remove('hidden');
  renderTagsList();
}

export function hidePanel() {
  const panel = document.getElementById('panel-tags-list');
  const overlay = document.getElementById('panel-overlay');
  panel.classList.remove('visible');
  setTimeout(() => panel.classList.add('hidden'), 240);
  overlay.classList.add('hidden');
}

function togglePanel() {
  const panel = document.getElementById('panel-tags-list');
  if (panel.classList.contains('hidden') || !panel.classList.contains('visible')) {
    showTagsPanel();
  } else {
    hidePanel();
  }
}

function renderTagsList() {
  const container = document.getElementById('tags-panel-content');
  const tags = getAllTags();

  if (!tags.length) {
    container.innerHTML = '<div class="empty-state"><p>Brak tagów</p></div>';
    return;
  }

  // Pole wyszukiwania
  container.innerHTML = `
    <div style="padding:10px 14px 6px">
      <input type="text" id="tags-panel-search" placeholder="Filtruj tagi…"
        style="width:100%;padding:6px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);
               background:var(--bg-panel);color:var(--text);font-family:var(--font-ui);font-size:.85rem;outline:none"/>
    </div>
    <div id="tags-panel-list"></div>
  `;

  const input = container.querySelector('#tags-panel-search');
  const listEl = container.querySelector('#tags-panel-list');

  const renderList = (filter = '') => {
    const filtered = tags.filter(t => t.name.toLowerCase().includes(filter.toLowerCase()));
    listEl.innerHTML = filtered.map(t => `
      <div class="tag-panel-item" data-tag="${escHtml(t.name)}">
        <span class="tag-panel-name">#${escHtml(t.name)}</span>
        <span class="tag-panel-count">${t.count}</span>
      </div>
    `).join('');

    listEl.querySelectorAll('.tag-panel-item').forEach(el => {
      el.addEventListener('click', () => {
        hidePanel();
        navigateFn('tag/' + el.dataset.tag);
      });
    });
  };

  input.addEventListener('input', () => renderList(input.value));
  renderList();
}

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
