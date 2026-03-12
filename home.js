// home.js — Strona główna

import { getAllMeta, getRecentArticles, getRandomArticle } from './articles.js';
import { getAllCategories } from './categories.js';
import { getAllTags } from './tags.js';
import { getBookmarks, removeBookmark } from './bookmarks.js';
import { clearSidebarRight } from './sidebar-right.js';

let navigateFn = null;

export function initHome(navigateCallback) {
  navigateFn = navigateCallback;
}

export function renderHome() {
  clearSidebarRight();
  const main   = document.getElementById('main-content');
  const meta   = getAllMeta();
  const recent = getRecentArticles(8);
  const cats   = getAllCategories();
  const tags   = getAllTags();
  const random = getRandomArticle();
  const bookmarks = getBookmarks();

  // Top 5 tagów
  const topTags = tags.slice(0, 8);

  main.innerHTML = `
    <div id="view-home">
      <div id="home-header">
        <div>
          <h1>Kompendium</h1>
          <p class="home-subtitle">Twoja osobista baza wiedzy</p>
        </div>
        ${random ? `
          <div class="random-card" id="btn-random">
            <div class="random-label">✦ Losowy artykuł</div>
            <div class="random-title">${escHtml(random.title)}</div>
          </div>
        ` : ''}
      </div>

      <!-- Statystyki -->
      <div class="home-stats-bar">
        <div class="stat-pill" data-route="home">
          <span class="stat-num">${meta.length}</span>
          <span class="stat-label">artykułów</span>
        </div>
        <div class="stat-pill-sep">·</div>
        <div class="stat-pill">
          <span class="stat-num">${cats.length}</span>
          <span class="stat-label">kategorii</span>
        </div>
        <div class="stat-pill-sep">·</div>
        <div class="stat-pill">
          <span class="stat-num">${tags.length}</span>
          <span class="stat-label">tagów</span>
        </div>
        <div class="stat-pill-sep">·</div>
        <div class="stat-pill">
          <span class="stat-num">${bookmarks.length}</span>
          <span class="stat-label">zakładek</span>
        </div>
      </div>

      <div class="home-grid">

        <!-- Zakładki -->
        <div class="home-card home-card-bookmarks">
          <div class="home-card-header">
            <h3>⭐ Zakładki</h3>
          </div>
          ${bookmarks.length ? `
            <ul class="recent-list">
              ${bookmarks.slice(0, 6).map(b => `
                <li>
                  <a class="recent-article" data-id="${b.id}">${escHtml(b.title)}</a>
                  <button class="btn-remove-bookmark" data-id="${b.id}" title="Usuń zakładkę">✕</button>
                </li>
              `).join('')}
            </ul>
            ${bookmarks.length > 6 ? `<div style="font-size:.78rem;color:var(--text-faint);padding:6px 0">… i ${bookmarks.length - 6} więcej</div>` : ''}
          ` : `<p class="home-empty-hint">Kliknij ⭐ na artykule aby dodać zakładkę.</p>`}
        </div>

        <!-- Ostatnio edytowane -->
        <div class="home-card">
          <div class="home-card-header">
            <h3>🕐 Ostatnio edytowane</h3>
          </div>
          ${recent.length ? `
            <ul class="recent-list">
              ${recent.map(a => `
                <li>
                  <a class="recent-article" data-id="${a.id}">${escHtml(a.title)}</a>
                  <span class="recent-date">${formatRelativeDate(a.updatedAt)}</span>
                </li>
              `).join('')}
            </ul>
          ` : `<p class="home-empty-hint">Brak artykułów.</p>`}
        </div>

        <!-- Kategorie -->
        ${cats.length ? `
          <div class="home-card">
            <div class="home-card-header">
              <h3>📁 Kategorie</h3>
            </div>
            <div class="home-cats-grid">
              ${cats.slice(0, 10).map(c => {
                const count = meta.filter(a => a.category === c.id).length;
                return `<div class="home-cat-chip cat-nav" data-id="${c.id}">
                  ${escHtml(c.name)}
                  <span class="home-cat-count">${count}</span>
                </div>`;
              }).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Tagi -->
        ${topTags.length ? `
          <div class="home-card">
            <div class="home-card-header">
              <h3>🏷 Popularne tagi</h3>
            </div>
            <div class="home-tags-cloud">
              ${topTags.map(t => `
                <span class="tag-chip home-tag" data-tag="${escHtml(t.name)}">
                  #${escHtml(t.name)}
                  <span class="tag-count">${t.count}</span>
                </span>
              `).join('')}
            </div>
          </div>
        ` : ''}

      </div>
    </div>
  `;

  // Eventy
  document.getElementById('btn-random')?.addEventListener('click', () => {
    const r = getRandomArticle();
    if (r) navigateFn('article/' + r.id);
  });

  document.querySelectorAll('.recent-article').forEach(el =>
    el.addEventListener('click', () => navigateFn('article/' + el.dataset.id)));

  document.querySelectorAll('.cat-nav').forEach(el =>
    el.addEventListener('click', () => navigateFn('category/' + el.dataset.id)));

  document.querySelectorAll('.home-tag').forEach(el =>
    el.addEventListener('click', () => navigateFn('tag/' + el.dataset.tag)));

  document.querySelectorAll('.btn-remove-bookmark').forEach(el =>
    el.addEventListener('click', e => {
      e.stopPropagation();
      removeBookmark(el.dataset.id);
      renderHome(); // odśwież
    }));
}

// ── HELPERS ───────────────────────────────────────────────

function formatRelativeDate(date) {
  if (!date) return '';
  const d    = new Date(date);
  const now  = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60)     return 'przed chwilą';
  if (diff < 3600)   return `${Math.floor(diff/60)} min temu`;
  if (diff < 86400)  return `${Math.floor(diff/3600)} godz. temu`;
  if (diff < 604800) return `${Math.floor(diff/86400)} dni temu`;
  return d.toLocaleDateString('pl-PL');
}

function escHtml(str) {
  return (str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
