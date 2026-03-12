// tabs.js — Zarządzanie kartami (zachowanie jak w przeglądarce)
//
// Zasada:
//   navigateTab(route, title)  — nawiguj w AKTYWNEJ karcie (ta sama karta)
//   openNewTab(route, title)   — zawsze otwiera NOWĄ kartę
//
// Nowa karta powstaje tylko gdy:
//   1. Nie ma żadnej aktywnej karty (pierwsza wizyta)
//   2. Jawne żądanie: przycisk "Otwórz w nowej karcie", Ctrl+klik itp.
//   3. Widoki nie-artykułowe (home, history, category…) NIE tworzą kart
//      — karta artykułu "pamięta" że jesteśmy gdzie indziej, ale zostaje

const MAX_TABS = 20;

let tabs        = [];   // [{ id, title, route }]
let activeTabId = null;

const listeners = [];
function notify() { listeners.forEach(fn => fn([...tabs], activeTabId)); }

export function onTabsChange(fn) { listeners.push(fn); }
export function getTabs()        { return tabs; }
export function getActiveTabId() { return activeTabId; }

// ── NAWIGACJA W AKTYWNEJ KARCIE ───────────────────────────

/**
 * Nawiguj w aktywnej karcie.
 * Jeśli nie ma żadnej karty → tworzy pierwszą.
 * Jeśli aktywna karta już pokazuje ten route → nic nie robi (poza notify).
 */
export function navigateTab(route, title) {
  if (!tabs.length || !activeTabId) {
    // Brak kart — utwórz pierwszą
    return _createTab(route, title);
  }

  const active = tabs.find(t => t.id === activeTabId);
  if (!active) return _createTab(route, title);

  // Zaktualizuj route i tytuł aktywnej karty
  active.route = route;
  active.title = title || active.title;
  notify();
  return activeTabId;
}

// ── OTWIERANIE NOWEJ KARTY ────────────────────────────────

/**
 * Zawsze otwiera nową kartę (lub aktywuje istniejącą z tym samym route).
 * Używaj przy jawnym żądaniu użytkownika.
 */
export function openNewTab(route, title) {
  // Jeśli taka karta już istnieje — po prostu ją aktywuj
  const existing = tabs.find(t => t.route === route);
  if (existing) {
    activeTabId = existing.id;
    notify();
    return existing.id;
  }
  return _createTab(route, title);
}

// ── ZAMYKANIE / PRZEŁĄCZANIE ──────────────────────────────

export function closeTab(id) {
  const idx = tabs.findIndex(t => t.id === id);
  if (idx === -1) return null;

  tabs.splice(idx, 1);

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

// ── PRYWATNE ─────────────────────────────────────────────

function _createTab(route, title) {
  if (tabs.length >= MAX_TABS) tabs.shift();
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
  tabs.push({ id, title: title || 'Artykuł', route });
  activeTabId = id;
  notify();
  return id;
}
