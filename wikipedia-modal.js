// wikipedia-modal.js — Modal importu z Wikipedii

import { searchWikipedia, fetchWikipediaArticle, convertWikitextToMarkdown } from './wikipedia.js';

let navigateFn = null;
let searchTimeout = null;
let selectedResult = null; // { title, lang }

export function initWikipediaImport(navigateCallback) {
  navigateFn = navigateCallback;

  // Otwórz modal przyciskiem
  document.getElementById('btn-import-wikipedia').addEventListener('click', openModal);

  // Zamknij
  document.getElementById('btn-wiki-import-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-wikipedia').addEventListener('click', e => {
    if (e.target.id === 'modal-wikipedia') closeModal();
  });

  // Wyszukiwanie na bieżąco
  document.getElementById('wiki-search-input').addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const q = document.getElementById('wiki-search-input').value.trim();
    if (q.length < 2) {
      clearResults();
      return;
    }
    setStatus('Szukam…');
    searchTimeout = setTimeout(() => runSearch(q), 350);
  });

  // Enter w polu wyszukiwania
  document.getElementById('wiki-search-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      clearTimeout(searchTimeout);
      const q = document.getElementById('wiki-search-input').value.trim();
      if (q.length >= 2) runSearch(q);
    }
    if (e.key === 'Escape') closeModal();
  });

  // Przycisk importu
  document.getElementById('btn-wiki-import-confirm').addEventListener('click', doImport);
}

// ── MODAL ─────────────────────────────────────────────────

function openModal() {
  document.getElementById('modal-wikipedia').classList.remove('hidden');
  document.getElementById('wiki-search-input').value = '';
  clearResults();
  clearPreview();
  setStatus('');
  selectedResult = null;
  setImportEnabled(false);
  setTimeout(() => document.getElementById('wiki-search-input').focus(), 50);
}

function closeModal() {
  document.getElementById('modal-wikipedia').classList.add('hidden');
  clearTimeout(searchTimeout);
}

// ── WYSZUKIWANIE ──────────────────────────────────────────

async function runSearch(query) {
  // Wykryj język: jeśli zapytanie zawiera nielatynskie znaki, spróbuj pl; w p. p. en
  const lang = detectLang(query);
  try {
    const results = await searchWikipedia(query, lang);
    renderResults(results, lang);
    setStatus(results.length ? `${results.length} wyników (${lang}.wikipedia.org)` : 'Brak wyników');
  } catch(e) {
    setStatus('Błąd połączenia z Wikipedią');
  }
}

function detectLang(query) {
  // Jeśli zawiera polskie znaki — pl; inaczej en
  // Użytkownik może też wpisać np. "en:Article Title" żeby wymusić język
  const langPrefix = query.match(/^([a-z]{2}):/);
  if (langPrefix) return langPrefix[1];
  if (/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(query)) return 'pl';
  return 'pl'; // domyślnie polska Wikipedia
}

function renderResults(results, lang) {
  const list = document.getElementById('wiki-results-list');
  if (!results.length) {
    list.innerHTML = '<div class="wiki-no-results">Brak wyników</div>';
    return;
  }

  list.innerHTML = results.map(r => `
    <div class="wiki-result-item" data-title="${escHtml(r.title)}" data-lang="${lang}">
      <div class="wiki-result-title">${escHtml(r.title)}</div>
      <div class="wiki-result-snippet">${stripHtml(r.snippet)}…</div>
    </div>
  `).join('');

  list.querySelectorAll('.wiki-result-item').forEach(el => {
    el.addEventListener('click', () => selectResult(el.dataset.title, el.dataset.lang));
  });
}

function clearResults() {
  document.getElementById('wiki-results-list').innerHTML = '';
}

// ── WYBÓR WYNIKU ──────────────────────────────────────────

async function selectResult(title, lang) {
  // Podświetl wybrany
  document.querySelectorAll('.wiki-result-item').forEach(el => {
    el.classList.toggle('selected', el.dataset.title === title);
  });

  selectedResult = { title, lang };
  setImportEnabled(false);
  showPreviewLoading(title);

  try {
    const article = await fetchWikipediaArticle(title, lang);
    if (!article) {
      showPreviewError('Nie można pobrać artykułu.');
      return;
    }
    const { markdown, infobox } = convertWikitextToMarkdown(article.title, article.wikitext);
    selectedResult.markdown = markdown;
    selectedResult.infobox  = infobox;
    selectedResult.finalTitle = article.title;
    showPreviewContent(article.title, markdown, infobox);
    setImportEnabled(true);
  } catch(e) {
    showPreviewError('Błąd pobierania: ' + e.message);
  }
}

// ── PODGLĄD ───────────────────────────────────────────────

function showPreviewLoading(title) {
  document.getElementById('wiki-preview-area').innerHTML = `
    <div class="wiki-preview-loading">
      <div class="spinner"></div>
      Pobieranie „${escHtml(title)}"…
    </div>
  `;
}

function showPreviewError(msg) {
  document.getElementById('wiki-preview-area').innerHTML = `
    <div class="wiki-preview-error">⚠️ ${escHtml(msg)}</div>
  `;
}

function showPreviewContent(title, markdown, infobox) {
  const wordCount = markdown.split(/\s+/).length;
  const sectionCount = (markdown.match(/^#{1,4} /gm) || []).length;

  document.getElementById('wiki-preview-area').innerHTML = `
    <div class="wiki-preview-meta">
      <strong>${escHtml(title)}</strong>
      <span>~${wordCount.toLocaleString()} słów</span>
      <span>${sectionCount} sekcji</span>
      ${infobox.length ? `<span>${infobox.length} pól infobox</span>` : ''}
    </div>
    <div class="wiki-preview-sections">
      ${(markdown.match(/^#{1,4} .+$/gm) || []).slice(0, 12).map(h =>
        `<span class="wiki-section-pill">${escHtml(h.replace(/^#+\s/, ''))}</span>`
      ).join('')}
      ${(markdown.match(/^#{1,4} .+$/gm) || []).length > 12
        ? `<span class="wiki-section-pill wiki-section-more">+${(markdown.match(/^#{1,4} .+$/gm)||[]).length - 12} więcej</span>`
        : ''}
    </div>
    ${infobox.length ? `
      <div class="wiki-preview-infobox">
        <div class="wiki-preview-infobox-title">Infobox (${infobox.length} pól)</div>
        <table>
          ${infobox.slice(0, 6).map(p => `
            <tr><td>${escHtml(p.key)}</td><td>${escHtml(p.value)}</td></tr>
          `).join('')}
          ${infobox.length > 6 ? `<tr><td colspan="2" style="color:var(--text-faint);font-size:.78rem">… i ${infobox.length - 6} więcej</td></tr>` : ''}
        </table>
      </div>
    ` : ''}
    <div class="wiki-preview-notice">
      Treść zostanie otwarta w edytorze — możesz ją przejrzeć przed zapisem.
    </div>
  `;
}

function clearPreview() {
  document.getElementById('wiki-preview-area').innerHTML =
    '<div class="wiki-preview-placeholder">← Wybierz artykuł z listy, aby zobaczyć podgląd</div>';
}

// ── IMPORT ────────────────────────────────────────────────

async function doImport() {
  if (!selectedResult?.markdown) return;

  const btn = document.getElementById('btn-wiki-import-confirm');
  btn.textContent = 'Importowanie…';
  btn.disabled = true;

  closeModal();

  // Przekaż dane do edytora przez globalny stan tymczasowy
  window.__wikiImport = {
    title:   selectedResult.finalTitle || selectedResult.title,
    content: selectedResult.markdown,
    infobox: selectedResult.infobox || [],
    tags:    [],
  };

  navigateFn('editor/new', { wikiImport: true });

  btn.textContent = 'Importuj do edytora';
  btn.disabled = false;
}

// ── HELPERS ───────────────────────────────────────────────

function setStatus(msg) {
  document.getElementById('wiki-search-status').textContent = msg;
}

function setImportEnabled(enabled) {
  const btn = document.getElementById('btn-wiki-import-confirm');
  btn.disabled = !enabled;
  btn.style.opacity = enabled ? '1' : '0.45';
}

function stripHtml(html) {
  return html.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#\d+;/g, '');
}

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
