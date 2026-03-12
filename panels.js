// panels.js — Centralny menedżer paneli wysuwanych
// Zapewnia że tylko jeden panel jest otwarty naraz,
// i zamyka wszystkie przy kliknięciu poza nimi lub nawigacji.

const PANELS = {
  tabs:    { panel: 'panel-tabs',      overlay: true  },
  tags:    { panel: 'panel-tags-list', overlay: true  },
  preview: { panel: 'panel-preview',   overlay: true  },
  paths:   { panel: 'panel-paths',     overlay: true  },
};

let currentPanel = null;

// ── PUBLICZNE API ─────────────────────────────────────────

export function openPanel(name) {
  // Zamknij aktualnie otwarty (jeśli inny)
  if (currentPanel && currentPanel !== name) {
    _hide(currentPanel, false);
  }
  currentPanel = name;
  const cfg = PANELS[name];
  const el = document.getElementById(cfg.panel);
  el.classList.remove('hidden');
  requestAnimationFrame(() => el.classList.add('visible'));
  _setOverlay(true);
}

export function closePanel(name) {
  if (name && currentPanel !== name) return;
  if (!name) name = currentPanel;
  if (!name) return;
  _hide(name, true);
  currentPanel = null;
}

export function closeAll() {
  Object.keys(PANELS).forEach(name => _hide(name, false));
  _setOverlay(false);
  currentPanel = null;
}

export function isOpen(name) {
  return currentPanel === name;
}

export function initPanelManager() {
  // Overlay click → zamknij wszystko
  document.getElementById('panel-overlay').addEventListener('click', () => closeAll());

  // Kliknięcie w główną treść → zamknij wszystko
  document.getElementById('main-content').addEventListener('click', (e) => {
    // Nie zamykaj jeśli kliknięto w wiki-link (otwiera preview)
    if (e.target.closest('.wiki-link')) return;
    closeAll();
  });
}

// ── PRYWATNE ─────────────────────────────────────────────

function _hide(name, hideOverlay = true) {
  const cfg = PANELS[name];
  if (!cfg) return;
  const el = document.getElementById(cfg.panel);
  if (!el) return;
  el.classList.remove('visible');
  setTimeout(() => el.classList.add('hidden'), 240);
  if (hideOverlay) _setOverlay(false);
}

function _setOverlay(visible) {
  const overlay = document.getElementById('panel-overlay');
  if (visible) overlay.classList.remove('hidden');
  else overlay.classList.add('hidden');
}
