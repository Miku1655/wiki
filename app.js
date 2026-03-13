// app.js — Inicjalizacja aplikacji i routing

import { initTheme }        from './theme.js';
import { initAuth, onAuthChange, getUser } from './auth.js';
import { loadArticlesMeta, getArticleFull, getAllMeta, getMetaById, saveArticle } from './articles.js';
import { loadCategoriesData }  from './categories.js';
import { initSidebarLeft, renderCategoryTree } from './sidebar-left.js';
import { initSidebarRight, renderSidebarRight, clearSidebarRight } from './sidebar-right.js';
import { initTabsPanel }    from './panel-tabs.js';
import { initTagsPanel }    from './panel-tags.js';
import { initPreview, showPreview } from './preview.js';
import { initHistory, renderHistory, logView } from './history.js';
import { renderHome, initHome }  from './home.js';
import { renderEditor, initEditor } from './editor.js';
import { initUI, showToast }    from './ui.js';
import { renderMarkdown }   from './markdown.js';
import { navigateTab, openNewTab, closeTab, switchTab, getTabs, getActiveTabId, onTabsChange } from './tabs.js';
import { initPanelManager, closeAll } from './panels.js';
import { isBookmarked, toggleBookmark } from './bookmarks.js';
import { initWikipediaImport } from './wikipedia-modal.js';
import { initPathsPanel, renderPathView, renderArticlePathWidget } from './panel-paths.js';
import { initMobile, initSwipeBack } from './mobile.js';

// ── INICJALIZACJA ─────────────────────────────────────────

export async function initApp() {
  initTheme();
  initAuth();
  initSidebarLeft(navigate);
  initSidebarRight(navigate);
  initTabsPanel(navigate);
  initTagsPanel(navigate);
  initPanelManager();
  initPreview(navigate);
  initHistory(navigate);
  initHome(navigate);
  initEditor(navigate);
  initUI(navigate);
  initWikipediaImport(navigate);
  initPathsPanel(navigate);
  initMobile(navigate);
  initSwipeBack(navigate);

  document.getElementById('logo').addEventListener('click', e => {
    e.preventDefault();
    navigate('home');
  });

  onAuthChange(async user => {
    if (user) {
      await loadData();
      navigate('home');
    } else {
      document.getElementById('modal-auth').classList.remove('hidden');
    }
  });
}

async function loadData() {
  try {
    await Promise.all([
      loadArticlesMeta(),
      loadCategoriesData()
    ]);
    renderCategoryTree();
  } catch(e) {
    console.error('Błąd ładowania danych:', e);
    showToast('Błąd połączenia z bazą danych');
  }
}

// ── ROUTING ───────────────────────────────────────────────

let _navigatingFromArticle = false;

export function navigateFromArticle(route, options = {}) {
  _navigatingFromArticle = true;
  return navigate(route, options);
}

export async function navigate(route, options = {}) {
  const [baseRoute, hash] = route.split('#');
  route = baseRoute;

  const parts = route.split('/');
  const view  = parts[0];
  const param = parts.slice(1).join('/');

  if (view !== 'preview') closeAll();

  if (view === 'article') {
    const title = getMetaById(param)?.title || 'Artykuł';
    if (options.newTab) {
      openNewTab(route, title);
    } else if (_navigatingFromArticle || options.fromPreview) {
      navigateTab(route, title);
    } else {
      openNewTab(route, title);
    }
  }
  _navigatingFromArticle = false;

  switch(view) {
    case 'home':
      renderHome();
      clearSidebarRight();
      break;

    case 'article':
      await renderArticle(param, hash);
      break;

    case 'editor':
      await renderEditor(param === 'new' ? null : param, options.prefillTitle, options);
      break;

    case 'history':
      await renderHistory();
      clearSidebarRight();
      break;

    case 'category':
      renderCategoryView(param);
      break;

    case 'all-articles':
      renderAllArticlesView();
      break;

    case 'tag':
      renderTagView(param);
      break;

    case 'path':
      renderPathView(param);
      import('./sidebar-right.js').then(m => m.clearSidebarRight());
      break;

    case 'tags-manage':
      renderTagsManageView();
      break;

    default:
      renderHome();
  }
}

// ── WIDOK ARTYKUŁU ────────────────────────────────────────

async function renderArticle(id, hash = '') {
  const main = document.getElementById('main-content');
  main.innerHTML = '<div class="loading-spinner"><div class="spinner"></div> Ładowanie artykułu…</div>';
  clearSidebarRight();

  let article;
  try {
    article = await getArticleFull(id);
  } catch(e) {
    main.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><p>Nie można załadować artykułu.</p></div>';
    return;
  }

  if (!article) {
    main.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><p>Artykuł nie istnieje.</p></div>';
    return;
  }

  logView(id, article.title);

  const html = renderMarkdown(article.content || '');
  const bookmarked = isBookmarked(id);

  main.innerHTML = `
    <div id="article-actions">
      <button class="btn-small" id="btn-edit-article">✎ Edytuj</button>
      <button class="btn-small" id="btn-article-new-tab">↗ Nowa karta</button>
      <button class="btn-small ${bookmarked ? 'btn-bookmarked' : ''}" id="btn-bookmark-article"
        title="${bookmarked ? 'Usuń zakładkę' : 'Dodaj do zakładek'}">
        ${bookmarked ? '⭐' : '☆'} Zakładka
      </button>
      <span class="spacer"></span>
      <span style="font-size:.78rem;color:var(--text-faint)">
        ${article.updatedAt?.toDate ? formatDate(article.updatedAt.toDate()) : ''}
      </span>
    </div>
    <div id="view-article">
      <h1>${escHtml(article.title)}</h1>
      <div class="article-meta">
        ${article.category ? `<span>📁 ${escHtml(getCatName(article.category))}</span>` : ''}
        ${(article.tags||[]).map(t => `<span>#${escHtml(t)}</span>`).join('')}
      </div>
      <div class="md-content">${html}</div>
    </div>
  `;

  document.getElementById('btn-edit-article').addEventListener('click', () => {
    navigate('editor/' + id);
  });
  document.getElementById('btn-article-new-tab').addEventListener('click', () => {
    navigate('article/' + id, { newTab: true });
    showToast('Otwarto w nowej karcie');
  });
  document.getElementById('btn-bookmark-article').addEventListener('click', () => {
    const added = toggleBookmark(id, article.title);
    const btn = document.getElementById('btn-bookmark-article');
    btn.innerHTML = added ? '⭐ Zakładka' : '☆ Zakładka';
    btn.classList.toggle('btn-bookmarked', added);
    btn.title = added ? 'Usuń zakładkę' : 'Dodaj do zakładek';
    showToast(added ? 'Dodano do zakładek ⭐' : 'Usunięto zakładkę');
  });

  document.querySelectorAll('.wiki-link').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (el.dataset.articleId) navigate('article/' + el.dataset.articleId, { newTab: true });
        return;
      }
      showPreview(el.dataset.articleId || null, el.dataset.articleTitle);
    });
  });

  renderSidebarRight(article);

  const pathWidget = renderArticlePathWidget(id, article.title);
  document.getElementById('article-actions').appendChild(pathWidget);

  if (hash) {
    setTimeout(() => {
      const heading = document.querySelector(`#view-article [id="${CSS.escape(decodeURIComponent(hash))}"]`);
      if (heading) heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }
}

// ── WIDOK WSZYSTKICH ARTYKUŁÓW ────────────────────────────

function getArticleCacheSize(id) {
  try {
    const raw = localStorage.getItem('kp_content_' + id);
    if (!raw) return '';
    return formatBytes(raw.length * 2);
  } catch { return ''; }
}
 
function formatBytes(bytes) {
  if (bytes < 1024)        return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// Dostępne opcje sortowania dla listy artykułów
const SORT_OPTIONS = [
  { value: 'title-asc',   label: 'Tytuł A–Z' },
  { value: 'title-desc',  label: 'Tytuł Z–A' },
  { value: 'date-desc',   label: 'Najnowsze' },
  { value: 'date-asc',    label: 'Najstarsze' },
];

function sortArticles(articles, sortKey) {
  const arr = [...articles];
  switch (sortKey) {
    case 'title-asc':
      return arr.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'pl'));
    case 'title-desc':
      return arr.sort((a, b) => (b.title || '').localeCompare(a.title || '', 'pl'));
    case 'date-desc':
      return arr.sort((a, b) => {
        const da = a.updatedAt ? new Date(a.updatedAt) : new Date(0);
        const db = b.updatedAt ? new Date(b.updatedAt) : new Date(0);
        return db - da;
      });
    case 'date-asc':
      return arr.sort((a, b) => {
        const da = a.updatedAt ? new Date(a.updatedAt) : new Date(0);
        const db = b.updatedAt ? new Date(b.updatedAt) : new Date(0);
        return da - db;
      });
    default:
      return arr;
  }
}

function renderAllArticlesView() {
  const main = document.getElementById('main-content');
  clearSidebarRight();

  const savedSort = localStorage.getItem('kp_sort_all') || 'title-asc';
  const allArticles = getAllMeta();
  const articles = sortArticles(allArticles, savedSort);

  let totalBytes = 0;
  for (const a of allArticles) {
    try {
      const raw = localStorage.getItem('kp_content_' + a.id);
      if (raw) totalBytes += raw.length * 2;
    } catch {}
  }
  const totalSize  = totalBytes ? ' · ' + formatBytes(totalBytes) + ' łącznie' : '';

  main.innerHTML = `
    <div id="view-home" style="padding:36px 48px;max-width:860px">
      <h1 style="font-family:var(--font-heading);font-size:1.7rem;margin-bottom:20px">📄 Wszystkie artykuły</h1>
      <div style="margin-bottom:16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <input type="text" id="all-articles-search" placeholder="Filtruj…"
          style="padding:6px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);
                 background:var(--bg-panel);color:var(--text);font-family:var(--font-ui);
                 font-size:.88rem;outline:none;min-width:200px"/>
        <select id="all-articles-sort"
          style="padding:6px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);
                 background:var(--bg-panel);color:var(--text);font-family:var(--font-ui);
                 font-size:.85rem;outline:none;cursor:pointer">
          ${SORT_OPTIONS.map(o => `<option value="${o.value}" ${o.value === savedSort ? 'selected' : ''}>${o.label}</option>`).join('')}
        </select>
        <span id="all-articles-count" style="font-size:.8rem;color:var(--text-faint)">
          ${allArticles.length} artykułów${totalSize}
        </span>
      </div>
      ${articles.length ? `
        <ul class="recent-list" id="all-articles-list">
          ${articles.map(a => {
            const size = getArticleCacheSize(a.id);
            const sizeBadge = size
              ? `<span class="article-size-badge" title="Rozmiar w pamięci podręcznej">${size}</span>`
              : '';
            const tags = (a.tags || []).map(t => `#${t}`).join(' ');
            return `
              <li>
                <a class="all-article-link" data-id="${a.id}">${escHtml(a.title)}</a>
                <span class="recent-date">${sizeBadge}${tags}</span>
              </li>`;
          }).join('')}
        </ul>
      ` : `<div class="empty-state"><div class="empty-icon">📄</div><p>Brak artykułów.</p></div>`}
    </div>
  `;

  document.querySelectorAll('.all-article-link').forEach(el =>
    el.addEventListener('click', () => navigate('article/' + el.dataset.id))
  );

  // Sortowanie
  document.getElementById('all-articles-sort').addEventListener('change', e => {
    localStorage.setItem('kp_sort_all', e.target.value);
    renderAllArticlesView();
  });

  // Live filter
  const searchInput = document.getElementById('all-articles-search');
  const countEl     = document.getElementById('all-articles-count');
  searchInput?.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    let visible = 0;
    let visibleBytes = 0;
    document.querySelectorAll('#all-articles-list li').forEach(li => {
      const link = li.querySelector('.all-article-link');
      const match = !q || link.textContent.toLowerCase().includes(q);
      li.style.display = match ? '' : 'none';
      if (match) {
        visible++;
        try {
          const raw = localStorage.getItem('kp_content_' + link.dataset.id);
          if (raw) visibleBytes += raw.length * 2;
        } catch {}
      }
    });
    const sizeInfo = visibleBytes ? ' · ' + formatBytes(visibleBytes) : '';
    countEl.textContent = q
      ? `${visible} z ${allArticles.length}${sizeInfo}`
      : `${allArticles.length} artykułów${totalSize}`;
  });
}

// ── WIDOK KATEGORII ───────────────────────────────────────

function renderCategoryView(categoryId) {
  const main = document.getElementById('main-content');
  clearSidebarRight();

  const isUncategorized = categoryId === '__uncategorized__';
  const savedSort = localStorage.getItem('kp_sort_cat_' + categoryId) || 'title-asc';

  import('./categories.js').then(({ getCategoryName, getAllCategories }) => {
    const allArticlesRaw = getAllMeta();
    const articlesRaw = isUncategorized
      ? allArticlesRaw.filter(a => !a.category)
      : allArticlesRaw.filter(a => a.category === categoryId);

    const articles = sortArticles(articlesRaw, savedSort);

    const subcats = isUncategorized
      ? []
      : getAllCategories().filter(c => c.parentId === categoryId);

    const catName = isUncategorized ? 'Nieposegregowane' : getCategoryName(categoryId);
    const icon    = isUncategorized ? '📋' : '📁';

    const buildBreadcrumb = (id) => {
      if (!id || isUncategorized) return '';
      const path = [];
      let cur = getAllCategories().find(c => c.id === id);
      while (cur) {
        path.unshift(cur);
        cur = cur.parentId ? getAllCategories().find(c => c.id === cur.parentId) : null;
      }
      if (path.length <= 1) return '';
      return `<div class="cat-breadcrumb">
        ${path.map((c, i) => i < path.length - 1
          ? `<span class="cat-bc-link" data-id="${c.id}">${escHtml(c.name)}</span> <span class="cat-bc-sep">›</span>`
          : `<span>${escHtml(c.name)}</span>`
        ).join(' ')}
      </div>`;
    };

    const bulkToolbarHtml = `
      <div id="bulk-toolbar" class="bulk-toolbar hidden">
        <span id="bulk-count">0 zaznaczonych</span>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <label style="font-size:.8rem;color:var(--text-muted)">Kategoria:
            <select id="bulk-category-select" style="margin-left:4px;font-size:.8rem;
              border:1px solid var(--border);border-radius:var(--radius-sm);
              background:var(--bg-panel);color:var(--text);padding:3px 6px;outline:none">
              <option value="">— bez zmian —</option>
              <option value="__clear__">— usuń kategorię —</option>
            </select>
          </label>
          <label style="font-size:.8rem;color:var(--text-muted)">Dodaj tagi:
            <input type="text" id="bulk-tags-input" placeholder="tag1, tag2"
              style="margin-left:4px;font-size:.8rem;border:1px solid var(--border);
                     border-radius:var(--radius-sm);background:var(--bg-panel);
                     color:var(--text);padding:3px 8px;outline:none;width:140px"/>
          </label>
          <button class="btn-primary" id="btn-bulk-apply" style="font-size:.8rem;padding:5px 14px">Zastosuj</button>
          <button class="btn-ghost"   id="btn-bulk-cancel" style="font-size:.8rem;padding:5px 10px">Anuluj</button>
        </div>
      </div>
    `;

    main.innerHTML = `
      <div id="view-home" style="padding:36px 48px;max-width:860px">
        ${buildBreadcrumb(categoryId)}
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;gap:12px;flex-wrap:wrap">
          <h1 style="font-family:var(--font-heading);font-size:1.7rem">${icon} ${escHtml(catName)}</h1>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            ${articles.length >= 2 ? `<button class="btn-small" id="btn-toggle-bulk">☑ Zaznacz wiele</button>` : ''}
          </div>
        </div>

        ${bulkToolbarHtml}

        ${subcats.length ? `
          <h3 style="font-family:var(--font-heading);font-size:1rem;font-weight:400;font-style:italic;
                     color:var(--text-muted);margin-bottom:10px">Podkategorie</h3>
          <div class="subcat-grid">
            ${subcats.map(c => `
              <div class="subcat-card cat-nav" data-id="${c.id}">
                <span class="subcat-icon">📁</span>
                <span class="subcat-name">${escHtml(c.name)}</span>
                <span class="subcat-count">${allArticlesRaw.filter(a => a.category === c.id).length} art.</span>
              </div>
            `).join('')}
          </div>
          <div style="height:24px"></div>
        ` : ''}

        ${articles.length ? `
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;gap:8px;flex-wrap:wrap">
            <h3 style="font-family:var(--font-heading);font-size:1rem;font-weight:400;font-style:italic;
                       color:var(--text-muted)">
              Artykuły (${articles.length})
            </h3>
            <div style="display:flex;align-items:center;gap:8px">
              <select id="cat-articles-sort"
                style="padding:4px 8px;border:1px solid var(--border);border-radius:var(--radius-sm);
                       background:var(--bg-panel);color:var(--text);font-family:var(--font-ui);
                       font-size:.8rem;outline:none;cursor:pointer">
                ${SORT_OPTIONS.map(o => `<option value="${o.value}" ${o.value === savedSort ? 'selected' : ''}>${o.label}</option>`).join('')}
              </select>
            </div>
          </div>
          <ul class="recent-list" id="cat-articles-list">
            ${articles.map(a => `
              <li data-article-id="${a.id}">
                <label class="bulk-checkbox-wrap hidden">
                  <input type="checkbox" class="bulk-checkbox" data-id="${a.id}" />
                </label>
                <a class="cat-article" data-id="${a.id}">${escHtml(a.title)}</a>
                <span class="recent-date">${(a.tags||[]).map(t=>`#${t}`).join(' ')}</span>
              </li>
            `).join('')}
          </ul>
        ` : subcats.length ? '' : `<div class="empty-state"><div class="empty-icon">📂</div>
            <p>Brak artykułów${isUncategorized ? ' bez kategorii' : ' w tej kategorii'}.</p></div>`}
      </div>
    `;

    // Wypełnij select kategorii
    import('./categories.js').then(({ getCategoryOptions }) => {
      const sel = document.getElementById('bulk-category-select');
      if (!sel) return;
      getCategoryOptions().forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.id; o.textContent = opt.name;
        sel.appendChild(o);
      });
    });

    // Sortowanie artykułów w kategorii
    document.getElementById('cat-articles-sort')?.addEventListener('change', e => {
      localStorage.setItem('kp_sort_cat_' + categoryId, e.target.value);
      renderCategoryView(categoryId);
    });

    // Klik w artykuł
    document.querySelectorAll('.cat-article').forEach(el =>
      el.addEventListener('click', () => navigate('article/' + el.dataset.id)));
    document.querySelectorAll('.cat-nav').forEach(el =>
      el.addEventListener('click', () => navigate('category/' + el.dataset.id)));
    document.querySelectorAll('.cat-bc-link').forEach(el =>
      el.addEventListener('click', () => navigate('category/' + el.dataset.id)));

    // ── Bulk-edit logic ───────────────────────────────────

    let bulkMode = false;

    const bulkToolbar  = document.getElementById('bulk-toolbar');
    const bulkCountEl  = document.getElementById('bulk-count');
    const btnToggle    = document.getElementById('btn-toggle-bulk');

    function updateBulkCount() {
      const n = document.querySelectorAll('.bulk-checkbox:checked').length;
      if (bulkCountEl) bulkCountEl.textContent = `${n} zaznaczonych`;
      if (bulkToolbar) bulkToolbar.classList.toggle('hidden', n === 0);
    }

    btnToggle?.addEventListener('click', () => {
      bulkMode = !bulkMode;
      btnToggle.textContent = bulkMode ? '✕ Anuluj zaznaczanie' : '☑ Zaznacz wiele';
      document.querySelectorAll('.bulk-checkbox-wrap').forEach(el =>
        el.classList.toggle('hidden', !bulkMode));
      if (!bulkMode) {
        document.querySelectorAll('.bulk-checkbox').forEach(cb => cb.checked = false);
        if (bulkToolbar) bulkToolbar.classList.add('hidden');
      }
    });

    document.querySelectorAll('.bulk-checkbox').forEach(cb =>
      cb.addEventListener('change', updateBulkCount));

    document.getElementById('btn-bulk-cancel')?.addEventListener('click', () => {
      document.querySelectorAll('.bulk-checkbox').forEach(cb => cb.checked = false);
      updateBulkCount();
    });

    document.getElementById('btn-bulk-apply')?.addEventListener('click', async () => {
      const checked = [...document.querySelectorAll('.bulk-checkbox:checked')];
      if (!checked.length) return;

      const newCatRaw = document.getElementById('bulk-category-select')?.value;
      const newCat    = newCatRaw === '__clear__' ? '' : (newCatRaw || null);
      const tagsRaw   = document.getElementById('bulk-tags-input')?.value || '';
      const addTags   = tagsRaw.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);

      const ids = checked.map(cb => cb.dataset.id);

      const btn = document.getElementById('btn-bulk-apply');
      btn.textContent = 'Zapisuję…'; btn.disabled = true;

      try {
        await Promise.all(ids.map(async id => {
          const full = await getArticleFull(id);
          if (!full) return;
          const updatedTags = addTags.length
            ? [...new Set([...(full.tags || []), ...addTags])]
            : full.tags || [];
          const updatedCat = newCat !== null ? newCat : full.category;
          await saveArticle({ ...full, category: updatedCat, tags: updatedTags });
        }));
        showToast(`Zaktualizowano ${ids.length} artykułów ✓`);
        renderCategoryView(categoryId);
      } catch(e) {
        showToast('Błąd zapisu: ' + e.message);
        btn.textContent = 'Zastosuj'; btn.disabled = false;
      }
    });
  });
}

// ── WIDOK TAGU ────────────────────────────────────────────

function renderTagView(tag) {
  const savedSort = localStorage.getItem('kp_sort_tag_' + tag) || 'title-asc';
  const rawArticles = getAllMeta().filter(a => (a.tags||[]).includes(tag));
  const articles = sortArticles(rawArticles, savedSort);
  const main = document.getElementById('main-content');
  clearSidebarRight();

  main.innerHTML = `
    <div id="view-home" style="padding:36px 48px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;gap:12px;flex-wrap:wrap">
        <h1 style="font-family:var(--font-heading);font-size:1.7rem">#${escHtml(tag)}</h1>
        <div style="display:flex;align-items:center;gap:8px">
          ${articles.length >= 2 ? `
            <select id="tag-articles-sort"
              style="padding:4px 8px;border:1px solid var(--border);border-radius:var(--radius-sm);
                     background:var(--bg-panel);color:var(--text);font-family:var(--font-ui);
                     font-size:.8rem;outline:none;cursor:pointer">
              ${SORT_OPTIONS.map(o => `<option value="${o.value}" ${o.value === savedSort ? 'selected' : ''}>${o.label}</option>`).join('')}
            </select>
          ` : ''}
          <button class="btn-small" id="btn-manage-tag" title="Zarządzaj tagiem">⚙ Zarządzaj</button>
        </div>
      </div>
      ${articles.length ? `
        <ul class="recent-list" id="tag-articles-list">
          ${articles.map(a => `
            <li>
              <a class="tag-article" data-id="${a.id}">${escHtml(a.title)}</a>
            </li>
          `).join('')}
        </ul>
      ` : `<div class="empty-state"><div class="empty-icon">🏷️</div><p>Brak artykułów z tym tagiem.</p></div>`}
    </div>
  `;

  document.querySelectorAll('.tag-article').forEach(el => {
    el.addEventListener('click', () => navigate('article/' + el.dataset.id));
  });

  document.getElementById('tag-articles-sort')?.addEventListener('change', e => {
    localStorage.setItem('kp_sort_tag_' + tag, e.target.value);
    renderTagView(tag);
  });

  document.getElementById('btn-manage-tag')?.addEventListener('click', () => {
    showTagManageModal(tag);
  });
}

// ── ZARZĄDZANIE TAGAMI ─────────────────────────────────────

function renderTagsManageView() {
  const main = document.getElementById('main-content');
  clearSidebarRight();

  import('./tags.js').then(({ getAllTags }) => {
    const tags = getAllTags();
    const allArticles = getAllMeta();

    main.innerHTML = `
      <div id="view-home" style="padding:36px 48px;max-width:860px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px">
          <h1 style="font-family:var(--font-heading);font-size:1.7rem">🏷 Zarządzanie tagami</h1>
        </div>
        <div style="margin-bottom:16px">
          <input type="text" id="tags-manage-search" placeholder="Filtruj tagi…"
            style="padding:6px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);
                   background:var(--bg-panel);color:var(--text);font-family:var(--font-ui);
                   font-size:.88rem;outline:none;min-width:200px"/>
        </div>
        ${tags.length ? `
          <table class="tags-manage-table" style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="border-bottom:2px solid var(--border);font-size:.8rem;color:var(--text-faint);text-transform:uppercase;letter-spacing:.06em">
                <th style="text-align:left;padding:6px 10px;font-weight:500">Tag</th>
                <th style="text-align:center;padding:6px 10px;font-weight:500">Artykuły</th>
                <th style="text-align:right;padding:6px 10px;font-weight:500">Akcje</th>
              </tr>
            </thead>
            <tbody id="tags-manage-list">
              ${tags.map(t => `
                <tr class="tags-manage-row" data-tag="${escHtml(t.name)}"
                  style="border-bottom:1px solid var(--border-light);transition:background var(--transition)">
                  <td style="padding:8px 10px">
                    <span class="tag-chip" data-nav-tag="${escHtml(t.name)}" style="cursor:pointer">#${escHtml(t.name)}</span>
                  </td>
                  <td style="padding:8px 10px;text-align:center;font-size:.85rem;color:var(--text-muted)">${t.count}</td>
                  <td style="padding:8px 10px;text-align:right">
                    <button class="btn-small btn-rename-tag" data-tag="${escHtml(t.name)}" style="margin-right:4px">✎ Zmień nazwę</button>
                    <button class="btn-small btn-delete-tag" data-tag="${escHtml(t.name)}"
                      style="border-color:var(--danger,#e55);color:var(--danger,#c0392b)">✕ Usuń</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : `<div class="empty-state"><div class="empty-icon">🏷️</div><p>Brak tagów.</p></div>`}
      </div>
    `;

    // Nawigacja do widoku tagu
    document.querySelectorAll('.tag-chip[data-nav-tag]').forEach(el => {
      el.addEventListener('click', () => navigate('tag/' + el.dataset.navTag));
    });

    // Filtrowanie
    document.getElementById('tags-manage-search')?.addEventListener('input', e => {
      const q = e.target.value.trim().toLowerCase();
      document.querySelectorAll('.tags-manage-row').forEach(row => {
        row.style.display = !q || row.dataset.tag.toLowerCase().includes(q) ? '' : 'none';
      });
    });

    // Zmień nazwę tagu
    document.querySelectorAll('.btn-rename-tag').forEach(btn => {
      btn.addEventListener('click', () => showTagRenameModal(btn.dataset.tag, () => renderTagsManageView()));
    });

    // Usuń tag
    document.querySelectorAll('.btn-delete-tag').forEach(btn => {
      btn.addEventListener('click', () => showTagDeleteModal(btn.dataset.tag, () => renderTagsManageView()));
    });
  });
}

/** Modal zarządzania tagiem (z poziomu widoku tagu) */
function showTagManageModal(tag) {
  const overlay = document.createElement('div');
  overlay.className = 'modal';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:360px">
      <h2>🏷 Tag: #${escHtml(tag)}</h2>
      <div class="modal-actions" style="flex-direction:column;gap:8px;align-items:stretch">
        <button class="btn-primary" id="btn-tmod-rename">✎ Zmień nazwę tagu</button>
        <button class="btn-ghost"   id="btn-tmod-manage">📋 Wszystkie tagi</button>
        <button class="btn-danger"  id="btn-tmod-delete">✕ Usuń tag ze wszystkich artykułów</button>
        <button class="btn-ghost"   id="btn-tmod-close">Anuluj</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.getElementById('btn-tmod-close').addEventListener('click', () => overlay.remove());
  document.getElementById('btn-tmod-manage').addEventListener('click', () => {
    overlay.remove();
    navigate('tags-manage');
  });
  document.getElementById('btn-tmod-rename').addEventListener('click', () => {
    overlay.remove();
    showTagRenameModal(tag, () => renderTagView(tag));
  });
  document.getElementById('btn-tmod-delete').addEventListener('click', () => {
    overlay.remove();
    showTagDeleteModal(tag, () => navigate('home'));
  });
}

/** Zmiana nazwy tagu we wszystkich artykułach */
async function showTagRenameModal(tag, onDone) {
  const newName = prompt(`Nowa nazwa tagu (obecna: "${tag}"):`, tag);
  if (!newName?.trim() || newName.trim() === tag) return;
  const normalized = newName.trim().toLowerCase().replace(/\s+/g, '-');

  const articles = getAllMeta().filter(a => (a.tags||[]).includes(tag));
  if (!articles.length) { showToast('Brak artykułów z tym tagiem'); return; }

  if (!confirm(`Zmienić tag "${tag}" → "${normalized}" w ${articles.length} artykułach?`)) return;

  try {
    await Promise.all(articles.map(async meta => {
      const full = await getArticleFull(meta.id);
      if (!full) return;
      const tags = (full.tags || []).map(t => t === tag ? normalized : t);
      await saveArticle({ ...full, tags });
    }));
    showToast(`Tag zmieniony: "${tag}" → "${normalized}" w ${articles.length} artykułach`);
    onDone?.();
  } catch(e) {
    showToast('Błąd: ' + e.message);
  }
}

/** Usunięcie tagu ze wszystkich artykułów */
async function showTagDeleteModal(tag, onDone) {
  const articles = getAllMeta().filter(a => (a.tags||[]).includes(tag));
  if (!confirm(`Usunąć tag "${tag}" z ${articles.length} artykułów?`)) return;

  try {
    await Promise.all(articles.map(async meta => {
      const full = await getArticleFull(meta.id);
      if (!full) return;
      const tags = (full.tags || []).filter(t => t !== tag);
      await saveArticle({ ...full, tags });
    }));
    showToast(`Usunięto tag "${tag}" z ${articles.length} artykułów`);
    onDone?.();
  } catch(e) {
    showToast('Błąd: ' + e.message);
  }
}

// ── HELPERS ───────────────────────────────────────────────

function getCatName(id) {
  try {
    const cats = JSON.parse(localStorage.getItem('kp_categories') || '[]');
    return cats.find(c => c.id === id)?.name || id;
  } catch { return id; }
}

function formatDate(date) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
}

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
