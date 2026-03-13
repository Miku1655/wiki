// mobile.js — Mobile UI: bottom nav, drawer, touch improvements
// Import and call initMobile() from app.js after initApp()

export function initMobile(navigateFn) {
  if (!isMobileLayout()) return;

  _drawerNavigateFn = navigateFn;
  window.__mobileNavFn = navigateFn;

  injectBottomNav(navigateFn);
  injectMobileDrawer();
  patchPanelsForMobile();
  patchEditorForMobile();
  handleMobileSearch();
}

function isMobileLayout() {
  return window.innerWidth <= 640;
}

// ── BOTTOM NAV ────────────────────────────────────────────

function injectBottomNav(navigateFn) {
  const nav = document.createElement('nav');
  nav.id = 'mobile-nav';
  nav.innerHTML = `
    <button class="mobile-nav-btn" id="mobile-nav-home" title="Strona główna">
      <span class="mnb-icon">🏠</span>
      <span class="mnb-label">Główna</span>
    </button>
    <button class="mobile-nav-btn" id="mobile-nav-cats" title="Kategorie">
      <span class="mnb-icon">📁</span>
      <span class="mnb-label">Kategorie</span>
    </button>
    <button class="mobile-nav-btn" id="mobile-nav-new" title="Nowy artykuł">
      <span class="mnb-icon">✦</span>
      <span class="mnb-label">Nowy</span>
    </button>
    <button class="mobile-nav-btn" id="mobile-nav-search" title="Szukaj">
      <span class="mnb-icon">🔍</span>
      <span class="mnb-label">Szukaj</span>
    </button>
    <button class="mobile-nav-btn" id="mobile-nav-more" title="Więcej">
      <span class="mnb-icon">⋯</span>
      <span class="mnb-label">Więcej</span>
    </button>
  `;
  document.body.appendChild(nav);

  // Wire up events
  document.getElementById('mobile-nav-home').addEventListener('click', () => {
    setActiveNav('home');
    navigateFn('home');
    closeDrawer();
  });

  document.getElementById('mobile-nav-cats').addEventListener('click', () => {
    toggleDrawer();
  });

  document.getElementById('mobile-nav-new').addEventListener('click', () => {
    setActiveNav(null);
    navigateFn('editor/new');
    closeDrawer();
  });

  document.getElementById('mobile-nav-search').addEventListener('click', () => {
    const input = document.getElementById('search-input');
    input?.focus();
    input?.select();
  });

  document.getElementById('mobile-nav-more').addEventListener('click', () => {
    showMoreSheet(navigateFn);
  });

  // Mark home as active initially
  setActiveNav('home');

  // Intercept navigate to update active state
  window.__mobileNavFn = navigateFn;
}

function setActiveNav(view) {
  document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active'));
  if (view === 'home') document.getElementById('mobile-nav-home')?.classList.add('active');
  else if (view === 'cats') document.getElementById('mobile-nav-cats')?.classList.add('active');
}

// ── MOBILE DRAWER (category tree) ─────────────────────────

let _drawerNavigateFn = null;

function injectMobileDrawer() {
  const drawer = document.createElement('div');
  drawer.id = 'mobile-drawer';

  const overlay = document.createElement('div');
  overlay.id = 'mobile-drawer-overlay';

  document.body.appendChild(overlay);
  document.body.appendChild(drawer);

  overlay.addEventListener('click', closeDrawer);
}

/**
 * Build drawer content fresh each time it opens.
 * Reads category ids from window.__getAllCategories (exposed by categories.js patch),
 * with fallback to the already-rendered sidebar DOM labels.
 */
function buildDrawerContent(navigateFn) {
  const drawer = document.getElementById('mobile-drawer');
  if (!drawer) return;
  drawer.innerHTML = '';

  // Header row
  const header = document.createElement('div');
  header.style.cssText = [
    'padding:14px 16px 10px',
    'font-size:.72rem',
    'font-weight:500',
    'text-transform:uppercase',
    'letter-spacing:.08em',
    'color:var(--text-faint)',
    'border-bottom:1px solid var(--border)',
  ].join(';');
  header.textContent = 'Kategorie';
  drawer.appendChild(header);

  // Get categories — prefer the global exposed by categories.js, fall back to DOM
  const cats = window.__getAllCategories ? window.__getAllCategories() : [];

  if (cats.length > 0) {
    // Build from data — guaranteed to have correct ids
    const map = {};
    cats.forEach(c => { map[c.id] = { ...c, children: [] }; });
    const roots = [];
    cats.forEach(c => {
      if (c.parentId && map[c.parentId]) map[c.parentId].children.push(map[c.id]);
      else roots.push(map[c.id]);
    });

    function renderCat(node, depth) {
      const row = document.createElement('div');
      row.className = 'tree-node-row';
      row.style.paddingLeft = (14 + depth * 14) + 'px';
      row.innerHTML = [
        `<span class="tree-toggle" style="width:16px"></span>`,
        `<span class="tree-icon" style="font-size:.75rem;color:var(--text-faint)">${node.children.length ? '📁' : '📂'}</span>`,
        `<span class="tree-label">${escDrawer(node.name)}</span>`,
      ].join('');
      row.addEventListener('click', () => {
        navigateFn('category/' + node.id);
        closeDrawer();
      });
      drawer.appendChild(row);
      node.children.forEach(child => renderCat(child, depth + 1));
    }
    roots.forEach(root => renderCat(root, 0));
  } else {
    // Fallback: read from sidebar DOM labels and match by name
    const sidebarInner = document.getElementById('sidebar-left-inner');
    const allRows = sidebarInner ? sidebarInner.querySelectorAll('.tree-node-row') : [];
    allRows.forEach(row => {
      const label = row.querySelector('.tree-label')?.textContent?.trim() || '';
      if (!label) return;

      const newRow = document.createElement('div');
      newRow.className = 'tree-node-row';
      newRow.style.cssText = row.style.cssText;
      newRow.innerHTML = row.innerHTML;

      newRow.addEventListener('click', () => {
        if (label === 'Nieposegregowane') { navigateFn('category/__uncategorized__'); closeDrawer(); return; }
        if (label === 'Wszystkie artykuły') { navigateFn('all-articles'); closeDrawer(); return; }
        // Match against cats if available
        const match = cats.find(c => c.name === label);
        if (match) { navigateFn('category/' + match.id); closeDrawer(); return; }
        navigateFn('home'); closeDrawer();
      });
      drawer.appendChild(newRow);
    });
  }

  // Always add Nieposegregowane + Wszystkie artykuły at the bottom
  const specialRows = [
    { label: 'Nieposegregowane', icon: '📋', route: 'category/__uncategorized__' },
    { label: 'Wszystkie artykuły', icon: '📄', route: 'all-articles' },
  ];
  const sep = document.createElement('div');
  sep.style.cssText = 'height:1px;background:var(--border-light);margin:4px 0';
  drawer.appendChild(sep);

  specialRows.forEach(({ label, icon, route }) => {
    const row = document.createElement('div');
    row.className = 'tree-node-row';
    row.style.paddingLeft = '14px';
    row.innerHTML = [
      `<span class="tree-toggle" style="width:16px"></span>`,
      `<span class="tree-icon" style="font-size:.75rem;color:var(--text-faint)">${icon}</span>`,
      `<span class="tree-label" style="color:var(--text-muted)">${label}</span>`,
    ].join('');
    row.addEventListener('click', () => { navigateFn(route); closeDrawer(); });
    drawer.appendChild(row);
  });
}

function escDrawer(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function toggleDrawer() {
  const drawer = document.getElementById('mobile-drawer');
  const overlay = document.getElementById('mobile-drawer-overlay');
  if (!drawer) return;
  const isOpen = drawer.classList.contains('open');
  if (isOpen) {
    closeDrawer();
  } else {
    openDrawer();
  }
}

function openDrawer() {
  const drawer = document.getElementById('mobile-drawer');
  const overlay = document.getElementById('mobile-drawer-overlay');
  // Build fresh content with working click handlers
  buildDrawerContent(_drawerNavigateFn || window.__mobileNavFn);
  drawer?.classList.add('open');
  overlay?.classList.add('visible');
  document.getElementById('mobile-nav-cats')?.classList.add('active');
}

function closeDrawer() {
  document.getElementById('mobile-drawer')?.classList.remove('open');
  document.getElementById('mobile-drawer-overlay')?.classList.remove('visible');
  document.getElementById('mobile-nav-cats')?.classList.remove('active');
}

// ── MORE SHEET ────────────────────────────────────────────

function showMoreSheet(navigateFn) {
  // Remove existing sheet
  document.getElementById('mobile-more-sheet')?.remove();
  document.getElementById('mobile-more-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'mobile-more-overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,.4);
    z-index:350;backdrop-filter:blur(2px);
  `;

  const sheet = document.createElement('div');
  sheet.id = 'mobile-more-sheet';
  sheet.style.cssText = `
    position:fixed;bottom:64px;left:0;right:0;
    background:var(--bg-card);
    border-top:1px solid var(--border);
    border-radius:14px 14px 0 0;
    z-index:360;
    padding:8px 0 16px;
    box-shadow:0 -4px 24px rgba(0,0,0,.15);
  `;

  const items = [
    { icon: '⏱', label: 'Historia', action: () => navigateFn('history') },
    { icon: '🏷', label: 'Tagi', action: () => { closeMoreSheet(); document.getElementById('btn-tags-panel')?.click(); } },
    { icon: '🗺', label: 'Ścieżki czytania', action: () => { closeMoreSheet(); document.getElementById('btn-paths-panel')?.click(); } },
    { icon: '⬇', label: 'Importuj z Wikipedii', action: () => { closeMoreSheet(); document.getElementById('btn-import-wikipedia')?.click(); } },
    { icon: '▣', label: 'Karty', action: () => { closeMoreSheet(); document.getElementById('btn-tabs-panel')?.click(); } },
    { icon: '◑', label: 'Zmień motyw', action: () => { closeMoreSheet(); document.getElementById('btn-theme')?.click(); } },
    { icon: '👤', label: 'Konto', action: () => { closeMoreSheet(); document.getElementById('btn-auth')?.click(); } },
  ];

  // Drag handle
  const handle = document.createElement('div');
  handle.style.cssText = `
    width:36px;height:4px;background:var(--border);
    border-radius:2px;margin:8px auto 14px;
  `;
  sheet.appendChild(handle);

  items.forEach(item => {
    const btn = document.createElement('button');
    btn.style.cssText = `
      display:flex;align-items:center;gap:14px;
      width:100%;padding:13px 20px;
      border:none;background:transparent;
      color:var(--text);font-family:var(--font-ui);
      font-size:.95rem;cursor:pointer;text-align:left;
      transition:background var(--transition);
      -webkit-tap-highlight-color:transparent;
    `;
    btn.innerHTML = `<span style="font-size:1.15rem;width:24px;text-align:center">${item.icon}</span>${item.label}`;
    btn.addEventListener('click', () => {
      closeMoreSheet();
      item.action();
    });
    btn.addEventListener('touchstart', () => {
      btn.style.background = 'var(--bg-hover)';
    }, { passive: true });
    btn.addEventListener('touchend', () => {
      btn.style.background = '';
    }, { passive: true });
    sheet.appendChild(btn);
  });

  overlay.addEventListener('click', closeMoreSheet);
  document.body.appendChild(overlay);
  document.body.appendChild(sheet);

  // Slide up animation
  sheet.style.transform = 'translateY(100%)';
  requestAnimationFrame(() => {
    sheet.style.transition = 'transform 220ms cubic-bezier(.4,0,.2,1)';
    sheet.style.transform = 'translateY(0)';
  });
}

function closeMoreSheet() {
  const sheet = document.getElementById('mobile-more-sheet');
  const overlay = document.getElementById('mobile-more-overlay');
  if (sheet) {
    sheet.style.transform = 'translateY(100%)';
    setTimeout(() => { sheet.remove(); overlay?.remove(); }, 220);
  } else {
    overlay?.remove();
  }
}

// ── PATCH PANELS FOR MOBILE ───────────────────────────────

function patchPanelsForMobile() {
  // Make panels swipeable to close
  document.querySelectorAll('.side-panel').forEach(panel => {
    addSwipeToClose(panel);
  });
}

function addSwipeToClose(el) {
  let startY = 0;
  let currentY = 0;
  let isDragging = false;

  el.addEventListener('touchstart', (e) => {
    // Only trigger from the header area
    if (!e.target.closest('.side-panel-header')) return;
    startY = e.touches[0].clientY;
    isDragging = true;
  }, { passive: true });

  el.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    currentY = e.touches[0].clientY;
    const delta = currentY - startY;
    if (delta > 0) {
      el.style.transform = `translateY(${delta}px)`;
    }
  }, { passive: true });

  el.addEventListener('touchend', () => {
    if (!isDragging) return;
    isDragging = false;
    const delta = currentY - startY;
    if (delta > 80) {
      // Close the panel
      el.style.transition = 'transform 220ms ease';
      el.style.transform = 'translateY(100%)';
      setTimeout(() => {
        el.style.transform = '';
        el.style.transition = '';
        el.classList.remove('visible');
        setTimeout(() => el.classList.add('hidden'), 10);
        document.getElementById('panel-overlay')?.classList.add('hidden');
      }, 220);
    } else {
      el.style.transition = 'transform 180ms ease';
      el.style.transform = '';
      setTimeout(() => { el.style.transition = ''; }, 180);
    }
  });
}

// ── PATCH EDITOR FOR MOBILE ───────────────────────────────

function patchEditorForMobile() {
  // Force edit-only mode on mobile (no split)
  const observer = new MutationObserver(() => {
    const body = document.getElementById('editor-body');
    if (body && body.dataset.mode === 'split') {
      body.dataset.mode = 'edit';
      document.getElementById('btn-edit-mode')?.classList.add('active');
      document.getElementById('btn-split-mode')?.classList.remove('active');
    }
  });

  const editorContainer = document.getElementById('main-content');
  if (editorContainer) {
    observer.observe(editorContainer, { childList: true, subtree: false });
  }

  // Watch for editor rendering
  const bodyObserver = new MutationObserver(() => {
    const body = document.getElementById('editor-body');
    if (body && isMobileLayout()) {
      // Switch to edit mode
      if (body.dataset.mode === 'split') {
        body.dataset.mode = 'edit';
        const editBtn = document.getElementById('btn-edit-mode');
        const splitBtn = document.getElementById('btn-split-mode');
        const previewBtn = document.getElementById('btn-preview-mode');
        editBtn?.classList.add('active');
        splitBtn?.classList.remove('active');
        previewBtn?.classList.remove('active');
        document.getElementById('editor-pane')?.classList.remove('hidden');
        document.getElementById('preview-pane')?.classList.add('hidden');
      }
    }
  });
  bodyObserver.observe(document.getElementById('main-content') || document.body, {
    childList: true
  });
}

// ── MOBILE SEARCH ─────────────────────────────────────────

function handleMobileSearch() {
  const searchInput = document.getElementById('search-input');
  if (!searchInput) return;

  // On mobile, make search full-screen friendly
  searchInput.addEventListener('focus', () => {
    document.getElementById('topbar')?.classList.add('search-focused');
  });

  searchInput.addEventListener('blur', () => {
    setTimeout(() => {
      document.getElementById('topbar')?.classList.remove('search-focused');
    }, 200);
  });
}

// ── SWIPE BACK GESTURE (articles) ────────────────────────

export function initSwipeBack(navigateFn) {
  if (!isMobileLayout()) return;

  let startX = 0;
  let startY = 0;

  document.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const dx = endX - startX;
    const dy = Math.abs(endY - startY);

    // Swipe right from left edge → go back
    if (startX < 30 && dx > 80 && dy < 60) {
      navigateFn('home');
    }
  }, { passive: true });
}
