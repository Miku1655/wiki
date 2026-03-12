// tabs.js — Zarządzanie kartami (otwarte artykuły)

const MAX_TABS = 20;
let tabs = [];        // [{ id, title, route }]
let activeTabId = null;

const listeners = [];

function notify() {
  listeners.forEach(fn => fn(tabs, activeTabId));
}

export function onTabsChange(fn) {
  listeners.push(fn);
}

export function openTab(route, title) {
  // Sprawdź czy już otwarta
  const existing = tabs.find(t => t.route === route);
  if (existing) {
    activeTabId = existing.id;
    notify();
    return existing.id;
  }
  // Ogranicz liczbę kart
  if (tabs.length >= MAX_TABS) {
    tabs.shift(); // usuń najstarszą
  }
  const id = Date.now().toString();
  tabs.push({ id, title, route });
  activeTabId = id;
  notify();
  return id;
}

export function closeTab(id) {
  const idx = tabs.findIndex(t => t.id === id);
  if (idx === -1) return null;
  tabs.splice(idx, 1);
  // Jeśli zamknięto aktywną — aktywuj sąsiednią
  if (activeTabId === id) {
    if (tabs.length) {
      activeTabId = tabs[Math.max(0, idx - 1)].id;
      notify();
      return tabs[Math.max(0, idx - 1)].route;
    } else {
      activeTabId = null;
      notify();
      return 'home';
    }
  }
  notify();
  return null;
}

export function switchTab(id) {
  const tab = tabs.find(t => t.id === id);
  if (!tab) return null;
  activeTabId = id;
  notify();
  return tab.route;
}

export function updateTabTitle(route, title) {
  const tab = tabs.find(t => t.route === route);
  if (tab) { tab.title = title; notify(); }
}

export function getTabs() { return tabs; }
export function getActiveTabId() { return activeTabId; }
