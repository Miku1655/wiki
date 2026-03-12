// panel-tags.js — Wysuwany panel przeglądania tagów

import { getAllTags } from './tags.js';
import { openPanel, closePanel, isOpen } from './panels.js';

let navigateFn = null;

export function initTagsPanel(navigateCallback) {
  navigateFn = navigateCallback;

  document.getElementById('btn-tags-panel').addEventListener('click', () => {
    isOpen('tags') ? closePanel('tags') : showTagsPanel();
  });
  document.getElementById('btn-close-tags-panel').addEventListener('click', () => closePanel('tags'));
}

export function showTagsPanel() {
  openPanel('tags');
  renderTagsList();
}

export function hidePanel() {
  closePanel('tags');
}

function renderTagsList() {
  const container = document.getElementById('tags-panel-content');
  const tags = getAllTags();

  if (!tags.length) {
    container.innerHTML = '<div class="empty-state"><p>Brak tagów</p></div>';
    return;
  }

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
        closePanel('tags');
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
