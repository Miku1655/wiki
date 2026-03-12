// panel-tabs.js — Wysuwany panel listy kart

import { getTabs, getActiveTabId, closeTab, switchTab, onTabsChange } from './tabs.js';
import { openPanel, closePanel, isOpen } from './panels.js';

let navigateFn = null;

export function initTabsPanel(navigateCallback) {
  navigateFn = navigateCallback;

  document.getElementById('btn-tabs-panel').addEventListener('click', () => {
    isOpen('tabs') ? closePanel('tabs') : showPanel();
  });
  document.getElementById('btn-close-tabs-panel').addEventListener('click', () => closePanel('tabs'));

  onTabsChange(renderTabs);
}

export function showPanel() {
  openPanel('tabs');
  renderTabs();
}

export function hidePanel() {
  closePanel('tabs');
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
        closePanel('tabs');
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
