// app.js — Inicjalizacja aplikacji i routing

import { initTheme }        from './theme.js';
import { initAuth, onAuthChange, getUser } from './auth.js';
import { loadArticlesMeta, getArticleFull, getAllMeta, getMetaById } from './articles.js';
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

  // Logo → strona główna
  document.getElementById('logo').addEventListener('click', e => {
    e.preventDefault();
    navigate('home');
  });

  // Reaguj na logowanie
  onAuthChange(async user => {
    if (user) {
      await loadData();
      navigate('home');
    } else {
      // Pokaż modal logowania
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

/**
 * Nawigacja po aplikacji.
 * route: 'home' | 'article/:id' | 'editor/:id' | 'history' | 'category/:id' | 'tag/:name'
 * options: { newTab, prefillTitle }
 */
// Czy nawigacja pochodzi z wnętrza artykułu (wiki-link)?
// true  → nawiguj w tej samej karcie
// false → otwórz nową kartę (nawigacja z zewnątrz: sidebar, search, home…)
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

  // ── Logika kart ──────────────────────────────────────────
  // Artykuł otwierany z zewnątrz (sidebar, home, search) → nowa karta
  // Artykuł otwierany przez wiki-link wewnątrz artykułu  → ta sama karta
  // Jawne "nowa karta" (przycisk ↗)                       → zawsze nowa
  if (view === 'article') {
    const title = getMetaById(param)?.title || 'Artykuł';
    if (options.newTab) {
      openNewTab(route, title);                 // jawna nowa karta
    } else if (_navigatingFromArticle || options.fromPreview) {
      navigateTab(route, title);                // ta sama karta (wiki-link lub podgląd → otwórz)
    } else {
      openNewTab(route, title);                 // nowa karta (z zewnątrz)
    }
  }
  _navigatingFromArticle = false; // reset po użyciu

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

    case 'tag':
      renderTagView(param);
      break;

    case 'path':
      renderPathView(param);
      import('./sidebar-right.js').then(m => m.clearSidebarRight());
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

  // Loguj w historii
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

  // Akcje
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

  // Wiki-linki → podgląd (lewy klik) lub nawigacja w tej samej karcie (Ctrl+klik)
  document.querySelectorAll('.wiki-link').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey) {
        // Ctrl+klik → nowa karta
        if (el.dataset.articleId) navigate('article/' + el.dataset.articleId, { newTab: true });
        return;
      }
      showPreview(el.dataset.articleId || null, el.dataset.articleTitle);
    });
  });

  // Renderuj prawy panel
  renderSidebarRight(article);

  // Widget ścieżek czytania w action barze
  const pathWidget = renderArticlePathWidget(id, article.title);
  document.getElementById('article-actions').appendChild(pathWidget);

  // Przewiń do sekcji jeśli jest hash
  if (hash) {
    setTimeout(() => {
      const heading = document.querySelector(`#view-article [id="${CSS.escape(decodeURIComponent(hash))}"]`);
      if (heading) heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }
}

// ── WIDOK KATEGORII ───────────────────────────────────────

function renderCategoryView(categoryId) {
  const main = document.getElementById('main-content');
  clearSidebarRight();

  const isUncategorized = categoryId === '__uncategorized__';

  import('./categories.js').then(({ getCategoryName, getAllCategories }) => {
    const articles = isUncategorized
      ? getAllMeta().filter(a => !a.category)
      : getAllMeta().filter(a => a.category === categoryId);

    // Podkategorie (tylko dla prawdziwych kategorii)
    const subcats = isUncategorized
      ? []
      : getAllCategories().filter(c => c.parentId === categoryId);

    const catName = isUncategorized ? 'Nieposegregowane' : getCategoryName(categoryId);
    const icon    = isUncategorized ? '📋' : '📁';

    // Breadcrumb — ścieżka do bieżącej kategorii
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

    main.innerHTML = `
      <div id="view-home" style="padding:36px 48px;max-width:860px">
        ${buildBreadcrumb(categoryId)}
        <h1 style="font-family:var(--font-heading);font-size:1.7rem;margin-bottom:20px">${icon} ${escHtml(catName)}</h1>

        ${subcats.length ? `
          <h3 style="font-family:var(--font-heading);font-size:1rem;font-weight:400;font-style:italic;
                     color:var(--text-muted);margin-bottom:10px">Podkategorie</h3>
          <div class="subcat-grid">
            ${subcats.map(c => `
              <div class="subcat-card cat-nav" data-id="${c.id}">
                <span class="subcat-icon">📁</span>
                <span class="subcat-name">${escHtml(c.name)}</span>
                <span class="subcat-count">${getAllMeta().filter(a => a.category === c.id).length} art.</span>
              </div>
            `).join('')}
          </div>
          <div style="height:24px"></div>
        ` : ''}

        ${articles.length ? `
          <h3 style="font-family:var(--font-heading);font-size:1rem;font-weight:400;font-style:italic;
                     color:var(--text-muted);margin-bottom:10px">
            Artykuły (${articles.length})
          </h3>
          <ul class="recent-list">
            ${articles.map(a => `
              <li>
                <a class="cat-article" data-id="${a.id}">${escHtml(a.title)}</a>
                <span class="recent-date">${(a.tags||[]).map(t=>`#${t}`).join(' ')}</span>
              </li>
            `).join('')}
          </ul>
        ` : subcats.length ? '' : `<div class="empty-state"><div class="empty-icon">📂</div>
            <p>Brak artykułów${isUncategorized ? ' bez kategorii' : ' w tej kategorii'}.</p></div>`}
      </div>
    `;

    document.querySelectorAll('.cat-article').forEach(el =>
      el.addEventListener('click', () => navigate('article/' + el.dataset.id)));
    document.querySelectorAll('.cat-nav').forEach(el =>
      el.addEventListener('click', () => navigate('category/' + el.dataset.id)));
    document.querySelectorAll('.cat-bc-link').forEach(el =>
      el.addEventListener('click', () => navigate('category/' + el.dataset.id)));
  });
}

// ── WIDOK TAGU ────────────────────────────────────────────

function renderTagView(tag) {
  const articles = getAllMeta().filter(a => (a.tags||[]).includes(tag));
  const main = document.getElementById('main-content');
  clearSidebarRight();

  main.innerHTML = `
    <div id="view-home" style="padding:36px 48px">
      <h1 style="font-family:var(--font-heading);font-size:1.7rem;margin-bottom:20px">#${escHtml(tag)}</h1>
      ${articles.length ? `
        <ul class="recent-list">
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
}

// ── HELPERS ───────────────────────────────────────────────

function getCatName(id) {
  // Synchroniczny dostęp z cache kategorii
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
