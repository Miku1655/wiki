// panel-tabs.js — Wysuwany panel listy kart

import { getTabs, getActiveTabId, closeTab, switchTab, onTabsChange } from './tabs.js';

let navigateFn = null;

export function initTabsPanel(navigateCallback) {
  navigateFn = navigateCallback;

  const btnOpen  = document.getElementById('btn-tabs-panel');
  const btnClose = document.getElementById('btn-close-tabs-panel');
  const panel    = document.getElementById('panel-tabs');
  const overlay  = document.getElementById('panel-overlay');

  btnOpen.addEventListener('click', () => togglePanel());
  btnClose.addEventListener('click', () => hidePanel());
  overlay.addEventListener('click', () => hidePanel());

  // Aktualizuj listę przy każdej zmianie kart
  onTabsChange(renderTabs);
}

export function showPanel() {
  const panel = document.getElementById('panel-tabs');
  const overlay = document.getElementById('panel-overlay');
  panel.classList.remove('hidden');
  requestAnimationFrame(() => panel.classList.add('visible'));
  overlay.classList.remove('hidden');
  renderTabs();
}

export function hidePanel() {
  const panel = document.getElementById('panel-tabs');
  const overlay = document.getElementById('panel-overlay');
  panel.classList.remove('visible');
  setTimeout(() => panel.classList.add('hidden'), 240);
  overlay.classList.add('hidden');
}

function togglePanel() {
  const panel = document.getElementById('panel-tabs');
  if (panel.classList.contains('hidden') || !panel.classList.contains('visible')) {
    showPanel();
  } else {
    hidePanel();
  }
}

function renderTabs() {
  const list = document.getElementById('tabs-list');
  const tabs = getTabs();
  const activeId = getActiveTabId();

  if (!tabs.length) {
    list.innerHTML = '<div class="empty-state"><p>Brak otwartych kart</p></div>';
    return;
  }

  list.innerHTML = tabs.map(tab => `
    <div class="tab-item ${tab.id === activeId ? 'active' : ''}" data-id="${tab.id}">
      <span class="tab-title">${escHtml(tab.title)}</span>
      <button class="tab-close" data-close="${tab.id}" title="Zamknij">✕</button>
    </div>
  `).join('');

  list.querySelectorAll('.tab-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.dataset.close) return;
      const route = switchTab(el.dataset.id);
      if (route && navigateFn) {
        navigateFn(route);
        hidePanel();
      }
    });
  });

  list.querySelectorAll('.tab-close').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const newRoute = closeTab(btn.dataset.close);
      if (newRoute && navigateFn) navigateFn(newRoute);
    });
  });
}

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
