// sidebar-right.js — Prawy panel: infobox, spis treści, tagi, powiązane

import { extractHeadings } from './markdown.js';
import { getRelatedArticles, getAllMeta } from './articles.js';
import { getCategoryName } from './categories.js';

let navigateFn = null;
let tocObserver = null;

export function initSidebarRight(navigateCallback) {
  navigateFn = navigateCallback;
}

/** Wypełnia prawy panel dla danego artykułu */
export function renderSidebarRight(article) {
  const container = document.getElementById('sidebar-right-inner');
  container.innerHTML = '';

  if (!article) {
    container.innerHTML = '<div class="empty-state" style="padding:20px 0"><p class="text-muted" style="font-size:.82rem">Otwórz artykuł aby zobaczyć szczegóły.</p></div>';
    return;
  }

  // 1. Infobox
  if (article.infobox?.length) {
    const section = makeSRSection('sr-infobox', 'Informacje');
    const table = document.createElement('table');
    article.infobox.forEach(pair => {
      if (!pair.key && !pair.value) return;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${escHtml(pair.key)}</td><td>${escHtml(pair.value)}</td>`;
      table.appendChild(tr);
    });
    section.querySelector('div').appendChild(table);
    container.appendChild(section);
  }

  // 2. Spis treści
  // extractHeadings() zwraca teraz slug spójny z renderMarkdown (slugify()).
  // CSS.escape() poprawnie obsługuje polskie litery i myślniki w selektorach.
  const headings = extractHeadings(article.content || '');
  if (headings.length) {
    const section = makeSRSection('sr-toc', 'Spis treści');
    headings.forEach(h => {
      const a = document.createElement('a');
      a.className = `toc-item toc-h${h.level}`;
      a.textContent = h.text;
      a.dataset.headingId = h.id;   // slug (bez #)
      a.addEventListener('click', () => scrollToHeading(h.id));
      section.querySelector('div').appendChild(a);
    });
    container.appendChild(section);
    setupTocObserver(headings);
  }

  // 3. Tagi
  if (article.tags?.length) {
    const section = makeSRSection('sr-tags', 'Tagi');
    const wrap = section.querySelector('div');
    wrap.id = 'sr-tags';
    article.tags.forEach(tag => {
      const chip = document.createElement('span');
      chip.className = 'tag-chip';
      chip.textContent = tag;
      chip.addEventListener('click', () => navigateFn && navigateFn('tag/' + tag));
      wrap.appendChild(chip);
    });
    container.appendChild(section);
  }

  // 4. Powiązane artykuły
  const related = getRelatedArticles(article.title);
  if (related.length) {
    const section = makeSRSection('sr-related', 'Powiązane artykuły');
    related.forEach(rel => {
      const a = document.createElement('a');
      a.className = 'related-link';
      a.textContent = rel.title;
      a.addEventListener('click', () => navigateFn && navigateFn('article/' + rel.id));
      section.querySelector('div').appendChild(a);
    });
    container.appendChild(section);
  }
}

/** Czyści prawy panel */
export function clearSidebarRight() {
  const container = document.getElementById('sidebar-right-inner');
  container.innerHTML = '';
  if (tocObserver) { tocObserver.disconnect(); tocObserver = null; }
}

// ── HELPERS ───────────────────────────────────────────────

function makeSRSection(id, title) {
  const wrap = document.createElement('div');
  wrap.id = id;
  const label = document.createElement('div');
  label.className = 'sr-section-title';
  label.textContent = title;
  const content = document.createElement('div');
  wrap.appendChild(label);
  wrap.appendChild(content);
  return wrap;
}

/**
 * Scrolluje do nagłówka w treści artykułu.
 * Używa CSS.escape() aby bezpiecznie użyć slug jako CSS selector.
 */
function scrollToHeading(slug) {
  const heading = document.querySelector(`#main-content [id="${CSS.escape(slug)}"]`);
  if (heading) heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setupTocObserver(headings) {
  if (tocObserver) tocObserver.disconnect();

  tocObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute('id');
        document.querySelectorAll('.toc-item').forEach(a => {
          a.classList.toggle('active', a.dataset.headingId === id);
        });
      }
    });
  }, { rootMargin: '-20% 0px -70% 0px' });

  headings.forEach(h => {
    // CSS.escape() na slug zamiast h.text — spójne z renderMarkdown
    const el = document.querySelector(`#main-content [id="${CSS.escape(h.id)}"]`);
    if (el) tocObserver.observe(el);
  });
}

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
