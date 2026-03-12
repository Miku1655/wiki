// editor.js — Edytor artykułów

import { getArticleFull, saveArticle, deleteArticle } from './articles.js';
import { renderMarkdown } from './markdown.js';
import { getCategoryOptions, loadCategoriesData } from './categories.js';
import { parseTags, formatTags } from './tags.js';
import { showToast } from './ui.js';
import { requireAuth } from './auth.js';

let navigateFn = null;
let currentMode = 'edit'; // 'edit' | 'preview'
let currentArticle = null;

export function initEditor(navigateCallback) {
  navigateFn = navigateCallback;
}

/** Renderuje widok edytora */
export async function renderEditor(articleId, prefillTitle = '', options = {}) {
  if (!requireAuth()) return;

  const main = document.getElementById('main-content');
  const sidebarRight = document.getElementById('sidebar-right-inner');
  sidebarRight.innerHTML = '';

  main.innerHTML = `
    <div id="view-editor">
      <div id="editor-toolbar">
        <input type="text" id="editor-title" placeholder="Tytuł artykułu…" />
        <span class="editor-toolbar-sep"></span>
        <div id="editor-mode-toggle">
          <button id="btn-edit-mode" class="active">Edycja</button>
          <button id="btn-preview-mode">Podgląd</button>
        </div>
        <span class="editor-toolbar-sep"></span>
        <button class="btn-primary" id="btn-save-article">Zapisz</button>
        ${articleId ? `<button class="btn-danger" id="btn-delete-article">Usuń</button>` : ''}
        <button class="btn-ghost" id="btn-cancel-editor">Anuluj</button>
      </div>

      <div id="editor-meta">
        <label>Kategoria
          <select id="editor-category"><option value="">— bez kategorii —</option></select>
        </label>
        <label>Tagi (przecinek)
          <input type="text" id="editor-tags" placeholder="np. historia, filozofia" />
        </label>
      </div>

      <details id="editor-infobox">
        <summary>Infobox (opcjonalny)</summary>
        <div id="infobox-pairs"></div>
        <button class="btn-small mt-8" id="btn-add-pair">+ Dodaj pole</button>
      </details>

      <div id="editor-body">
        <div id="editor-pane">
          <textarea id="editor-textarea" placeholder="Treść artykułu w Markdown…

## Nagłówek sekcji

Tekst artykułu. Możesz linkować do innych artykułów: [[Nazwa artykułu]]

| Kolumna 1 | Kolumna 2 |
|-----------|-----------|
| Dane      | Dane      |"></textarea>
        </div>
        <div id="preview-pane" class="hidden"></div>
      </div>
    </div>
  `;

  // Wypełnij kategorie
  await fillCategorySelect();

  // Tryb edycji/podglądu
  document.getElementById('btn-edit-mode').addEventListener('click', () => setMode('edit'));
  document.getElementById('btn-preview-mode').addEventListener('click', () => setMode('preview'));

  // Infobox
  document.getElementById('btn-add-pair').addEventListener('click', addInfoboxPair);

  // Zapis
  document.getElementById('btn-save-article').addEventListener('click', handleSave);

  // Usuń
  document.getElementById('btn-delete-article')?.addEventListener('click', handleDelete);

  // Anuluj
  document.getElementById('btn-cancel-editor').addEventListener('click', () => {
    if (currentArticle?.id) navigateFn('article/' + currentArticle.id);
    else navigateFn('home');
  });

  // Załaduj artykuł jeśli edytujemy istniejący
  if (articleId && articleId !== 'new') {
    main.querySelector('#editor-title').value = 'Ładowanie…';
    currentArticle = await getArticleFull(articleId);
    if (currentArticle) {
      fillEditorFields(currentArticle);
    }
  } else if (options.wikiImport && window.__wikiImport) {
    // Import z Wikipedii
    currentArticle = null;
    const wi = window.__wikiImport;
    window.__wikiImport = null;
    document.getElementById('editor-title').value = wi.title || '';
    document.getElementById('editor-textarea').value = wi.content || '';
    if (wi.infobox?.length) {
      wi.infobox.forEach(pair => addInfoboxPair(pair.key, pair.value));
      document.getElementById('editor-infobox').open = true;
    }
    showToast(`Zaimportowano „${wi.title}” z Wikipedii`);
  } else {
    currentArticle = null;
    if (prefillTitle) document.getElementById('editor-title').value = prefillTitle;
  }

  setMode('edit');
}

function setMode(mode) {
  currentMode = mode;
  const editPane    = document.getElementById('editor-pane');
  const previewPane = document.getElementById('preview-pane');
  const btnEdit     = document.getElementById('btn-edit-mode');
  const btnPreview  = document.getElementById('btn-preview-mode');

  if (mode === 'edit') {
    editPane.classList.remove('hidden');
    previewPane.classList.add('hidden');
    btnEdit.classList.add('active');
    btnPreview.classList.remove('active');
  } else {
    const content = document.getElementById('editor-textarea').value;
    previewPane.innerHTML = `<div class="md-content">${renderMarkdown(content)}</div>`;
    editPane.classList.add('hidden');
    previewPane.classList.remove('hidden');
    btnEdit.classList.remove('active');
    btnPreview.classList.add('active');
  }
}

function fillEditorFields(article) {
  document.getElementById('editor-title').value   = article.title || '';
  document.getElementById('editor-textarea').value = article.content || '';
  document.getElementById('editor-tags').value     = formatTags(article.tags);

  const catSelect = document.getElementById('editor-category');
  if (article.category) {
    catSelect.value = article.category;
  }

  // Infobox
  if (article.infobox?.length) {
    article.infobox.forEach(pair => addInfoboxPair(pair.key, pair.value));
  }
}

async function fillCategorySelect() {
  const select = document.getElementById('editor-category');
  const options = getCategoryOptions();
  options.forEach(opt => {
    const o = document.createElement('option');
    o.value = opt.id;
    o.textContent = opt.name;
    select.appendChild(o);
  });
}

function addInfoboxPair(key = '', value = '') {
  const container = document.getElementById('infobox-pairs');
  const row = document.createElement('div');
  row.className = 'infobox-pair';
  row.innerHTML = `
    <input type="text" placeholder="Klucz (np. Urodzony)" value="${escHtml(typeof key === 'string' ? key : '')}" class="ib-key" />
    <input type="text" placeholder="Wartość (np. 1452)" value="${escHtml(typeof value === 'string' ? value : '')}" class="ib-val" />
    <button class="btn-remove-pair" title="Usuń pole">✕</button>
  `;
  row.querySelector('.btn-remove-pair').addEventListener('click', () => row.remove());
  container.appendChild(row);
}

function collectInfobox() {
  return [...document.querySelectorAll('.infobox-pair')].map(row => ({
    key:   row.querySelector('.ib-key').value.trim(),
    value: row.querySelector('.ib-val').value.trim()
  })).filter(p => p.key || p.value);
}

async function handleSave() {
  const title   = document.getElementById('editor-title').value.trim();
  const content = document.getElementById('editor-textarea').value;
  const tags    = parseTags(document.getElementById('editor-tags').value);
  const category = document.getElementById('editor-category').value;
  const infobox = collectInfobox();

  if (!title) {
    showToast('Podaj tytuł artykułu');
    document.getElementById('editor-title').focus();
    return;
  }

  const btn = document.getElementById('btn-save-article');
  btn.textContent = 'Zapisywanie…';
  btn.disabled = true;

  try {
    const id = await saveArticle({
      id: currentArticle?.id,
      title, content, tags, category, infobox,
      createdAt: currentArticle?.createdAt
    });
    showToast('Artykuł zapisany ✓');
    navigateFn('article/' + id);
  } catch(e) {
    console.error(e);
    showToast('Błąd zapisu: ' + e.message);
    btn.textContent = 'Zapisz';
    btn.disabled = false;
  }
}

async function handleDelete() {
  if (!currentArticle?.id) return;
  if (!confirm(`Usunąć artykuł „${currentArticle.title}"? Tej operacji nie można cofnąć.`)) return;
  try {
    await deleteArticle(currentArticle.id);
    showToast('Artykuł usunięty');
    navigateFn('home');
  } catch(e) {
    showToast('Błąd usuwania');
  }
}

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
