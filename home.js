// home.js — Strona główna

import { getAllMeta, getRecentArticles, getRandomArticle } from './articles.js';
import { getAllCategories } from './categories.js';
import { getAllTags as getTagsFromModule } from './tags.js';
import { getBookmarks, removeBookmark } from './bookmarks.js';
import { getAllPaths, getPathStats } from './reading-paths.js';
import { clearSidebarRight } from './sidebar-right.js';

let navigateFn = null;

export function initHome(navigateCallback) {
  navigateFn = navigateCallback;
}

export function renderHome() {
  clearSidebarRight();
  const main      = document.getElementById('main-content');
  const meta      = getAllMeta();
  const recent    = getRecentArticles(8);
  const cats      = getAllCategories();
  const tags      = getTagsFromModule();
  const random    = getRandomArticle();
  const bookmarks = getBookmarks();
  const paths     = getAllPaths();
  const topTags   = tags.slice(0, 8);

  main.innerHTML = buildHome({ meta, recent, cats, topTags, random, bookmarks, paths });
  bindEvents();
}

// ── BUILDER FUNCTIONS (bez zagnieżdżonych template literals) ──

function buildHome({ meta, recent, cats, topTags, random, bookmarks, paths }) {
  const parts = [];

  parts.push('<div id="view-home">');

  // Header
  parts.push(buildHeader(random));

  // Stats bar
  parts.push(buildStatsBar(meta, cats, tags, bookmarks, paths));

  // Grid
  parts.push('<div class="home-grid">');
  parts.push(buildBookmarksCard(bookmarks));
  if (paths.length) parts.push(buildPathsCard(paths, meta));
  parts.push(buildRecentCard(recent));
  if (cats.length)    parts.push(buildCatsCard(cats, meta));
  if (topTags.length) parts.push(buildTagsCard(topTags));
  parts.push('</div>'); // .home-grid

  parts.push('</div>'); // #view-home
  return parts.join('');
}

function buildHeader(random) {
  let randomCard = '';
  if (random) {
    randomCard = '<div class="random-card" id="btn-random">'
      + '<div class="random-label">✦ Losowy artykuł</div>'
      + '<div class="random-title">' + escHtml(random.title) + '</div>'
      + '</div>';
  }
  return '<div id="home-header">'
    + '<div><h1>Kompendium</h1><p class="home-subtitle">Twoja osobista baza wiedzy</p></div>'
    + randomCard
    + '</div>';
}

function buildStatsBar(meta, cats, tags, bookmarks, paths) {
  return '<div class="home-stats-bar">'
    + statPill(meta.length, 'artykułów')
    + '<div class="stat-pill-sep">·</div>'
    + statPill(cats.length, 'kategorii')
    + '<div class="stat-pill-sep">·</div>'
    + statPill(tags.length, 'tagów')
    + '<div class="stat-pill-sep">·</div>'
    + statPill(bookmarks.length, 'zakładek')
    + '<div class="stat-pill-sep">·</div>'
    + statPill(paths.length, 'ścieżek')
    + '</div>';
}

function statPill(num, label) {
  return '<div class="stat-pill">'
    + '<span class="stat-num">' + num + '</span>'
    + '<span class="stat-label">' + label + '</span>'
    + '</div>';
}

function buildBookmarksCard(bookmarks) {
  let inner;
  if (!bookmarks.length) {
    inner = '<p class="home-empty-hint">Kliknij ☆ na artykule aby dodać zakładkę.</p>';
  } else {
    const items = bookmarks.slice(0, 6).map(function(b) {
      return '<li>'
        + '<a class="recent-article" data-id="' + b.id + '">' + escHtml(b.title) + '</a>'
        + '<button class="btn-remove-bookmark" data-id="' + b.id + '" title="Usuń zakładkę">✕</button>'
        + '</li>';
    }).join('');
    const more = bookmarks.length > 6
      ? '<div style="font-size:.78rem;color:var(--text-faint);padding:6px 0">… i ' + (bookmarks.length - 6) + ' więcej</div>'
      : '';
    inner = '<ul class="recent-list">' + items + '</ul>' + more;
  }
  return '<div class="home-card home-card-bookmarks">'
    + '<div class="home-card-header"><h3>⭐ Zakładki</h3></div>'
    + inner
    + '</div>';
}

function buildPathsCard(paths, meta) {
  const cards = paths.slice(0, 4).map(function(p) {
    const st = getPathStats(p);
    return '<div class="home-path-card path-nav" data-id="' + p.id + '">'
      + '<div class="home-path-name">' + escHtml(p.name) + '</div>'
      + '<div class="path-progress-bar" style="margin:6px 0 4px">'
      + '<div class="path-progress-fill" style="width:' + st.pct + '%"></div>'
      + '</div>'
      + '<div class="home-path-meta">' + st.done + '/' + st.total + ' · ' + st.pct + '%</div>'
      + '</div>';
  }).join('');

  return '<div class="home-card" style="grid-column:1/-1">'
    + '<div class="home-card-header">'
    + '<h3>🗺 Ścieżki czytania</h3>'
    + '<button class="btn-small" id="btn-open-paths-home">Wszystkie</button>'
    + '</div>'
    + '<div class="home-paths-row">' + cards + '</div>'
    + '</div>';
}

function buildRecentCard(recent) {
  let inner;
  if (!recent.length) {
    inner = '<p class="home-empty-hint">Brak artykułów.</p>';
  } else {
    const items = recent.map(function(a) {
      return '<li>'
        + '<a class="recent-article" data-id="' + a.id + '">' + escHtml(a.title) + '</a>'
        + '<span class="recent-date">' + formatRelativeDate(a.updatedAt) + '</span>'
        + '</li>';
    }).join('');
    inner = '<ul class="recent-list">' + items + '</ul>';
  }
  return '<div class="home-card">'
    + '<div class="home-card-header"><h3>🕐 Ostatnio edytowane</h3></div>'
    + inner
    + '</div>';
}

function buildCatsCard(cats, meta) {
  const chips = cats.slice(0, 10).map(function(c) {
    const count = meta.filter(function(a) { return a.category === c.id; }).length;
    return '<div class="home-cat-chip cat-nav" data-id="' + c.id + '">'
      + escHtml(c.name)
      + '<span class="home-cat-count">' + count + '</span>'
      + '</div>';
  }).join('');
  return '<div class="home-card">'
    + '<div class="home-card-header"><h3>📁 Kategorie</h3></div>'
    + '<div class="home-cats-grid">' + chips + '</div>'
    + '</div>';
}

function buildTagsCard(topTags) {
  const chips = topTags.map(function(t) {
    return '<span class="tag-chip home-tag" data-tag="' + escHtml(t.name) + '">'
      + '#' + escHtml(t.name)
      + '<span class="tag-count">' + t.count + '</span>'
      + '</span>';
  }).join('');
  return '<div class="home-card">'
    + '<div class="home-card-header"><h3>🏷 Popularne tagi</h3></div>'
    + '<div class="home-tags-cloud">' + chips + '</div>'
    + '</div>';
}

// ── EVENTY ────────────────────────────────────────────────

function bindEvents() {
  document.getElementById('btn-random')?.addEventListener('click', function() {
    const r = getRandomArticle();
    if (r) navigateFn('article/' + r.id);
  });

  document.getElementById('btn-open-paths-home')?.addEventListener('click', function() {
    import('./panel-paths.js').then(function(m) { m.openPathsPanel(); });
  });

  document.querySelectorAll('.path-nav').forEach(function(el) {
    el.addEventListener('click', function() { navigateFn('path/' + el.dataset.id); });
  });

  document.querySelectorAll('.recent-article').forEach(function(el) {
    el.addEventListener('click', function() { navigateFn('article/' + el.dataset.id); });
  });

  document.querySelectorAll('.cat-nav').forEach(function(el) {
    el.addEventListener('click', function() { navigateFn('category/' + el.dataset.id); });
  });

  document.querySelectorAll('.home-tag').forEach(function(el) {
    el.addEventListener('click', function() { navigateFn('tag/' + el.dataset.tag); });
  });

  document.querySelectorAll('.btn-remove-bookmark').forEach(function(el) {
    el.addEventListener('click', function(e) {
      e.stopPropagation();
      removeBookmark(el.dataset.id);
      renderHome();
    });
  });
}

// ── HELPERS ───────────────────────────────────────────────

function formatRelativeDate(date) {
  if (!date) return '';
  const d    = date.toDate ? date.toDate() : new Date(date);
  const now  = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60)     return 'przed chwilą';
  if (diff < 3600)   return Math.floor(diff / 60) + ' min temu';
  if (diff < 86400)  return Math.floor(diff / 3600) + ' godz. temu';
  if (diff < 604800) return Math.floor(diff / 86400) + ' dni temu';
  return d.toLocaleDateString('pl-PL');
}

function escHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
