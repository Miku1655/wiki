// home.js — Strona główna

import { getAllMeta, getRecentArticles, getRandomArticle } from './articles.js';
import { getAllCategories } from './categories.js';
import { getAllTags } from './tags.js';
import { clearSidebarRight } from './sidebar-right.js';

let navigateFn = null;

export function initHome(navigateCallback) {
  navigateFn = navigateCallback;
}

export function renderHome() {
  clearSidebarRight();
  const main = document.getElementById('main-content');
  const meta = getAllMeta();
  const recent = getRecentArticles(6);
  const cats = getAllCategories();
  const tags = getAllTags();

  const random = getRandomArticle();

  main.innerHTML = `
    <div id="view-home">
      <h1>Kompendium</h1>
      <p class="home-subtitle">Twoja osobista baza wiedzy.</p>

      <div class="home-grid">

        <!-- Statystyki -->
        <div class="home-card">
          <h3>Stan kompendium</h3>
          <div class="stat-row">
            <div class="stat-item">
              <div class="stat-num">${meta.length}</div>
              <div class="stat-label">Artykułów</div>
            </div>
            <div class="stat-item">
              <div class="stat-num">${cats.length}</div>
              <div class="stat-label">Kategorii</div>
            </div>
            <div class="stat-item">
              <div class="stat-num">${tags.length}</div>
              <div class="stat-label">Tagów</div>
            </div>
          </div>
        </div>

        <!-- Losowy artykuł -->
        ${random ? `
          <div class="random-card" id="btn-random">
            <div class="random-label">✦ Losowy artykuł</div>
            <div class="random-title">${escHtml(random.title)}</div>
          </div>
        ` : `
          <div class="home-card">
            <h3>Zacznij pisać</h3>
            <p style="font-size:.88rem;color:var(--text-muted)">Nie masz jeszcze żadnych artykułów. Kliknij ✦ w pasku na górze aby dodać pierwszy!</p>
          </div>
        `}

        <!-- Ostatnio edytowane -->
        <div class="home-card" style="grid-column: 1 / -1;">
          <h3>Ostatnio edytowane</h3>
          ${recent.length ? `
            <ul class="recent-list">
              ${recent.map(a => `
                <li>
                  <a class="recent-article" data-id="${a.id}">${escHtml(a.title)}</a>
                  <span class="recent-date">${formatRelativeDate(a.updatedAt)}</span>
                </li>
              `).join('')}
            </ul>
          ` : `<p style="font-size:.85rem;color:var(--text-faint)">Brak artykułów.</p>`}
        </div>

      </div>
    </div>
  `;

  // Eventy
  document.getElementById('btn-random')?.addEventListener('click', () => {
    const r = getRandomArticle();
    if (r) navigateFn('article/' + r.id);
  });

  document.querySelectorAll('.recent-article').forEach(el => {
    el.addEventListener('click', () => navigateFn('article/' + el.dataset.id));
  });
}

function formatRelativeDate(date) {
  if (!date) return '';
  const d = new Date(date);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'przed chwilą';
  if (diff < 3600) return `${Math.floor(diff / 60)} min temu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} godz. temu`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} dni temu`;
  return d.toLocaleDateString('pl-PL');
}

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
