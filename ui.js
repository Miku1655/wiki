// ui.js — Wspólne elementy UI: toast, wyszukiwarka, narzędzia

import { search } from './search.js';
import { getCategoryName } from './categories.js';

let navigateFn = null;
let searchTimeout = null;

export function initUI(navigateCallback) {
  navigateFn = navigateCallback;
  initSearch();
  initNewArticleBtn();
}

// ── TOAST ─────────────────────────────────────────────────

export function showToast(message, duration = 2800) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.classList.add('hidden'), 200);
  }, duration);
}

// ── WYSZUKIWARKA ──────────────────────────────────────────

function initSearch() {
  const input   = document.getElementById('search-input');
  const results = document.getElementById('search-results');

  input.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const q = input.value.trim();
    if (q.length < 2) {
      hideSearchResults();
      return;
    }
    searchTimeout = setTimeout(() => runSearch(q), 220);
  });

  input.addEventListener('focus', () => {
    if (input.value.trim().length >= 2) runSearch(input.value.trim());
  });

  // Zamknij po kliknięciu poza
  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !results.contains(e.target)) {
      hideSearchResults();
    }
  });

  // Klawiatura: Escape
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { hideSearchResults(); input.blur(); }
  });
}

async function runSearch(q) {
  const results = document.getElementById('search-results');
  results.classList.remove('hidden');
  results.innerHTML = '<div class="loading-spinner" style="padding:14px"><div class="spinner"></div></div>';

  const { articles, sections } = await search(q);

  if (!articles.length && !sections.length) {
    results.innerHTML = '<div class="search-result-item"><span class="result-title" style="color:var(--text-faint)">Brak wyników</span></div>';
    return;
  }

  let html = '';

  if (articles.length) {
    html += '<div class="search-section-label">Artykuły</div>';
    articles.forEach(a => {
      html += `
        <div class="search-result-item" data-route="article/${a.id}">
          <div class="result-title">${highlightQuery(a.title, q)}</div>
          <div class="result-meta">
            ${a.category ? getCategoryName(a.category) : ''}
            ${(a.tags || []).slice(0,3).map(t => `<span style="color:var(--accent)">#${t}</span>`).join(' ')}
          </div>
          ${a.snippet ? `<div class="result-snippet">${a.snippet}</div>` : ''}
        </div>
      `;
    });
  }

  if (sections.length) {
    html += '<div class="search-section-label">Sekcje</div>';
    sections.forEach(s => {
      html += `
        <div class="search-result-item" data-route="article/${s.articleId}#${encodeURIComponent(s.sectionId)}">
          <div class="result-title" style="font-size:.83rem">${escHtml(s.articleTitle)} <span style="color:var(--text-faint)">›</span> ${escHtml(s.sectionText)}</div>
          <div class="result-meta">Sekcja</div>
        </div>
      `;
    });
  }

  results.innerHTML = html;

  results.querySelectorAll('.search-result-item[data-route]').forEach(el => {
    el.addEventListener('click', () => {
      hideSearchResults();
      document.getElementById('search-input').value = '';
      navigateFn(el.dataset.route);
    });
  });
}

function hideSearchResults() {
  document.getElementById('search-results').classList.add('hidden');
}

function highlightQuery(text, q) {
  const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return escHtml(text).replace(re, '<mark>$1</mark>');
}

// ── NOWY ARTYKUŁ ──────────────────────────────────────────

function initNewArticleBtn() {
  document.getElementById('btn-new-article').addEventListener('click', () => {
    navigateFn('editor/new');
  });
}

// ── HELPERS ───────────────────────────────────────────────

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
