// editor.js — Edytor artykułów z toolbarem i podglądem na żywo

import { getArticleFull, saveArticle, deleteArticle } from './articles.js';
import { renderMarkdown } from './markdown.js';
import { getCategoryOptions } from './categories.js';
import { parseTags, formatTags } from './tags.js';
import { showToast } from './ui.js';
import { requireAuth } from './auth.js';

let navigateFn   = null;
let currentMode  = 'split'; // 'edit' | 'split' | 'preview'
let currentArticle = null;
let livePreviewTimeout = null;
let isDirty = false; // niezapisane zmiany

export function initEditor(navigateCallback) {
  navigateFn = navigateCallback;
}

// ── RENDER ────────────────────────────────────────────────

export async function renderEditor(articleId, prefillTitle = '', options = {}) {
  if (!requireAuth()) return;
  isDirty = false;

  const main = document.getElementById('main-content');
  document.getElementById('sidebar-right-inner').innerHTML = '';

  main.innerHTML = `
    <div id="view-editor">

      <!-- Pasek górny: tytuł + akcje -->
      <div id="editor-topbar">
        <input type="text" id="editor-title" placeholder="Tytuł artykułu…" />
        <div id="editor-actions">
          <div id="editor-mode-toggle">
            <button id="btn-edit-mode"    title="Tylko edytor (Alt+1)">✎</button>
            <button id="btn-split-mode"   title="Edytor i podgląd (Alt+2)" class="active">⊞</button>
            <button id="btn-preview-mode" title="Tylko podgląd (Alt+3)">👁</button>
          </div>
          <span class="editor-toolbar-sep"></span>
          <span id="editor-save-status"></span>
          <button class="btn-primary" id="btn-save-article">Zapisz <kbd>Ctrl+S</kbd></button>
          ${articleId ? `<button class="btn-danger" id="btn-delete-article">Usuń</button>` : ''}
          <button class="btn-ghost" id="btn-cancel-editor">Anuluj</button>
        </div>
      </div>

      <!-- Pasek meta: kategoria, tagi -->
      <div id="editor-meta">
        <label>Kategoria
          <select id="editor-category"><option value="">— bez kategorii —</option></select>
        </label>
        <label>Tagi (przecinek)
          <input type="text" id="editor-tags" placeholder="np. historia, filozofia" />
        </label>
        <details id="editor-infobox-toggle">
          <summary>Infobox</summary>
        </details>
      </div>

      <!-- Infobox (osobna sekcja, collapsible) -->
      <div id="editor-infobox-section" class="hidden">
        <div id="infobox-pairs"></div>
        <button class="btn-small mt-8" id="btn-add-pair">+ Dodaj pole</button>
      </div>

      <!-- Toolbar formatowania -->
      <div id="editor-format-toolbar">
        <div class="fmt-group">
          <button class="fmt-btn" data-action="bold"      title="Pogrubienie (Ctrl+B)"><b>B</b></button>
          <button class="fmt-btn" data-action="italic"    title="Kursywa (Ctrl+I)"><i>I</i></button>
          <button class="fmt-btn" data-action="strike"    title="Przekreślenie"><s>S</s></button>
        </div>
        <div class="fmt-sep"></div>
        <div class="fmt-group">
          <button class="fmt-btn" data-action="h2"   title="Nagłówek H2">H2</button>
          <button class="fmt-btn" data-action="h3"   title="Nagłówek H3">H3</button>
          <button class="fmt-btn" data-action="h4"   title="Nagłówek H4">H4</button>
        </div>
        <div class="fmt-sep"></div>
        <div class="fmt-group">
          <button class="fmt-btn" data-action="ul"     title="Lista punktowana">• —</button>
          <button class="fmt-btn" data-action="ol"     title="Lista numerowana">1.</button>
          <button class="fmt-btn" data-action="quote"  title="Cytat">❝</button>
          <button class="fmt-btn" data-action="code"   title="Kod inline">&lt;/&gt;</button>
          <button class="fmt-btn" data-action="codeblock" title="Blok kodu">{ }</button>
        </div>
        <div class="fmt-sep"></div>
        <div class="fmt-group">
          <button class="fmt-btn" data-action="wikilink" title="Link wiki [[…]] (Ctrl+K)">[[W]]</button>
          <button class="fmt-btn" data-action="table"    title="Wstaw tabelę">⊞</button>
          <button class="fmt-btn" data-action="hr"       title="Linia pozioma">—</button>
        </div>
      </div>

      <!-- Ciało edytora: textarea + podgląd -->
      <div id="editor-body">
        <div id="editor-pane">
          <textarea id="editor-textarea" spellcheck="true"
            placeholder="Treść w Markdown…&#10;&#10;## Nagłówek&#10;&#10;Tekst [[link do artykułu]]&#10;&#10;| Kolumna 1 | Kolumna 2 |&#10;|-----------|-----------|&#10;| Dane      | Dane      |"></textarea>
        </div>
        <div id="editor-divider"></div>
        <div id="preview-pane">
          <div id="preview-pane-inner" class="md-content"></div>
        </div>
      </div>

    </div>
  `;

  await fillCategorySelect();
  bindEvents(articleId);
  loadContent(articleId, prefillTitle, options);
  setMode(currentMode);
}

// ── EVENTY ────────────────────────────────────────────────

function bindEvents(articleId) {
  const textarea = document.getElementById('editor-textarea');

  // Tryby widoku
  document.getElementById('btn-edit-mode').addEventListener('click',    () => setMode('edit'));
  document.getElementById('btn-split-mode').addEventListener('click',   () => setMode('split'));
  document.getElementById('btn-preview-mode').addEventListener('click', () => setMode('preview'));

  // Infobox toggle
  document.getElementById('editor-infobox-toggle').addEventListener('toggle', e => {
    document.getElementById('editor-infobox-section')
      .classList.toggle('hidden', !e.target.open);
  });
  document.getElementById('btn-add-pair').addEventListener('click', () => addInfoboxPair());

  // Zapis / usuń / anuluj
  document.getElementById('btn-save-article').addEventListener('click', handleSave);
  document.getElementById('btn-delete-article')?.addEventListener('click', handleDelete);
  document.getElementById('btn-cancel-editor').addEventListener('click', () => {
    if (isDirty && !confirm('Masz niezapisane zmiany. Opuścić bez zapisu?')) return;
    navigateFn(currentArticle?.id ? 'article/' + currentArticle.id : 'home');
  });

  // Toolbar formatowania
  document.getElementById('editor-format-toolbar').addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (btn) applyFormat(btn.dataset.action);
  });

  // Skróty klawiszowe
  textarea.addEventListener('keydown', handleKeydown);

  // Live preview + dirty tracking
  textarea.addEventListener('input', () => {
    isDirty = true;
    setDirtyStatus();
    clearTimeout(livePreviewTimeout);
    livePreviewTimeout = setTimeout(updateLivePreview, 300);
  });
  document.getElementById('editor-title').addEventListener('input', () => {
    isDirty = true;
    setDirtyStatus();
  });

  // Tab w textarea → wstaw spacje zamiast przeskakiwać fokus
  textarea.addEventListener('keydown', e => {
    if (e.key === 'Tab') {
      e.preventDefault();
      insertAt(textarea, '  ');
    }
  });
}

// ── TRYBY WIDOKU ──────────────────────────────────────────

function setMode(mode) {
  currentMode = mode;
  const editPane    = document.getElementById('editor-pane');
  const previewPane = document.getElementById('preview-pane');
  const divider     = document.getElementById('editor-divider');

  document.getElementById('btn-edit-mode').classList.toggle('active',    mode === 'edit');
  document.getElementById('btn-split-mode').classList.toggle('active',   mode === 'split');
  document.getElementById('btn-preview-mode').classList.toggle('active', mode === 'preview');

  editPane.classList.toggle('hidden',    mode === 'preview');
  previewPane.classList.toggle('hidden', mode === 'edit');
  divider.classList.toggle('hidden',     mode !== 'split');

  // W trybie split oba panele dzielą przestrzeń
  const body = document.getElementById('editor-body');
  body.dataset.mode = mode;

  if (mode !== 'edit') updateLivePreview();
}

function updateLivePreview() {
  const pane = document.getElementById('preview-pane-inner');
  if (!pane || currentMode === 'edit') return;
  const content = document.getElementById('editor-textarea')?.value || '';
  pane.innerHTML = renderMarkdown(content);
  // Wiki-linki w podglądzie — tylko wizualnie, bez interakcji
}

// ── SKRÓTY KLAWISZOWE ─────────────────────────────────────

function handleKeydown(e) {
  const ctrl = e.ctrlKey || e.metaKey;

  if (ctrl && e.key === 's') { e.preventDefault(); handleSave(); return; }
  if (ctrl && e.key === 'b') { e.preventDefault(); applyFormat('bold'); return; }
  if (ctrl && e.key === 'i') { e.preventDefault(); applyFormat('italic'); return; }
  if (ctrl && e.key === 'k') { e.preventDefault(); applyFormat('wikilink'); return; }

  if (e.altKey && e.key === '1') { e.preventDefault(); setMode('edit'); return; }
  if (e.altKey && e.key === '2') { e.preventDefault(); setMode('split'); return; }
  if (e.altKey && e.key === '3') { e.preventDefault(); setMode('preview'); return; }

  // Enter w liście — kontynuuj listę
  if (e.key === 'Enter') handleListContinue(e);
}

function handleListContinue(e) {
  const ta = e.target;
  const val = ta.value;
  const pos = ta.selectionStart;
  const lineStart = val.lastIndexOf('\n', pos - 1) + 1;
  const line = val.slice(lineStart, pos);

  const ulMatch = line.match(/^(\s*)([-*])\s/);
  const olMatch = line.match(/^(\s*)(\d+)\.\s/);

  if (ulMatch) {
    // Pusta pozycja listy → zakończ listę
    if (line.trim() === ulMatch[2]) {
      e.preventDefault();
      const newVal = val.slice(0, lineStart) + '\n' + val.slice(pos);
      ta.value = newVal;
      ta.selectionStart = ta.selectionEnd = lineStart + 1;
    } else {
      e.preventDefault();
      insertAt(ta, `\n${ulMatch[1]}${ulMatch[2]} `);
    }
  } else if (olMatch) {
    if (line.trim() === `${olMatch[2]}.`) {
      e.preventDefault();
      const newVal = val.slice(0, lineStart) + '\n' + val.slice(pos);
      ta.value = newVal;
      ta.selectionStart = ta.selectionEnd = lineStart + 1;
    } else {
      e.preventDefault();
      insertAt(ta, `\n${olMatch[1]}${parseInt(olMatch[2]) + 1}. `);
    }
  }
}

// ── TOOLBAR FORMATOWANIA ──────────────────────────────────

const FORMATS = {
  bold:      { wrap: ['**', '**'],     placeholder: 'pogrubiony tekst' },
  italic:    { wrap: ['*', '*'],       placeholder: 'kursywa' },
  strike:    { wrap: ['~~', '~~'],     placeholder: 'przekreślony tekst' },
  code:      { wrap: ['`', '`'],       placeholder: 'kod' },
  wikilink:  { wrap: ['[[', ']]'],     placeholder: 'Tytuł artykułu' },
  h2:        { line: '## ',            placeholder: 'Nagłówek' },
  h3:        { line: '### ',           placeholder: 'Nagłówek' },
  h4:        { line: '#### ',          placeholder: 'Nagłówek' },
  ul:        { line: '- ',             placeholder: 'element listy' },
  ol:        { line: '1. ',            placeholder: 'element listy' },
  quote:     { line: '> ',             placeholder: 'cytat' },
  codeblock: { block: '```\n',         placeholder: 'kod', blockEnd: '\n```' },
  table:     { insert: '\n| Kolumna 1 | Kolumna 2 | Kolumna 3 |\n|-----------|-----------|----------|\n| Dane      | Dane      | Dane      |\n' },
  hr:        { insert: '\n---\n' },
};

function applyFormat(action) {
  const ta = document.getElementById('editor-textarea');
  const fmt = FORMATS[action];
  if (!fmt) return;

  const start  = ta.selectionStart;
  const end    = ta.selectionEnd;
  const sel    = ta.value.slice(start, end);
  const before = ta.value.slice(0, start);
  const after  = ta.value.slice(end);

  let newVal, newStart, newEnd;

  if (fmt.insert) {
    // Wstaw gotowy tekst
    newVal = before + fmt.insert + after;
    newStart = newEnd = start + fmt.insert.length;

  } else if (fmt.wrap) {
    const [open, close] = fmt.wrap;
    // Jeśli zaznaczenie jest już opakowane — zdejmij
    if (sel.startsWith(open) && sel.endsWith(close)) {
      const inner = sel.slice(open.length, sel.length - close.length);
      newVal = before + inner + after;
      newStart = start;
      newEnd = start + inner.length;
    } else {
      const text = sel || fmt.placeholder;
      newVal = before + open + text + close + after;
      newStart = start + open.length;
      newEnd   = newStart + text.length;
    }

  } else if (fmt.line) {
    // Prefix linii — działa na każdą zaznaczoną linię
    const lineStart = before.lastIndexOf('\n') + 1;
    const fullLines = ta.value.slice(lineStart, end);
    const replaced = fullLines.split('\n').map(l => {
      if (l.startsWith(fmt.line)) return l.slice(fmt.line.length); // toggle
      return fmt.line + l;
    }).join('\n');
    newVal = ta.value.slice(0, lineStart) + replaced + after;
    newStart = lineStart + fmt.line.length;
    newEnd   = lineStart + replaced.length;

  } else if (fmt.block) {
    const text = sel || fmt.placeholder;
    const block = fmt.block + text + (fmt.blockEnd || '');
    newVal = before + block + after;
    newStart = start + fmt.block.length;
    newEnd   = newStart + text.length;
  }

  ta.value = newVal;
  ta.focus();
  ta.selectionStart = newStart;
  ta.selectionEnd   = newEnd;

  isDirty = true;
  setDirtyStatus();
  clearTimeout(livePreviewTimeout);
  livePreviewTimeout = setTimeout(updateLivePreview, 150);
}

// ── ZAŁADOWANIE TREŚCI ────────────────────────────────────

async function loadContent(articleId, prefillTitle, options) {
  if (articleId && articleId !== 'new') {
    document.getElementById('editor-title').value = 'Ładowanie…';
    currentArticle = await getArticleFull(articleId);
    if (currentArticle) fillEditorFields(currentArticle);
    isDirty = false;
    setDirtyStatus();
  } else if (options.wikiImport && window.__wikiImport) {
    currentArticle = null;
    const wi = window.__wikiImport;
    window.__wikiImport = null;
    document.getElementById('editor-title').value    = wi.title || '';
    document.getElementById('editor-textarea').value = wi.content || '';
    if (wi.infobox?.length) {
      wi.infobox.forEach(p => addInfoboxPair(p.key, p.value));
      document.getElementById('editor-infobox-toggle').open = true;
      document.getElementById('editor-infobox-section').classList.remove('hidden');
    }
    isDirty = true;
    setDirtyStatus();
    updateLivePreview();
    showToast(`Zaimportowano „${wi.title}" z Wikipedii`);
  } else {
    currentArticle = null;
    if (prefillTitle) document.getElementById('editor-title').value = prefillTitle;
    isDirty = false;
    setDirtyStatus();
  }
  updateLivePreview();
}

// ── STATUS ZAPISU ─────────────────────────────────────────

function setDirtyStatus() {
  const el = document.getElementById('editor-save-status');
  if (!el) return;
  if (isDirty) {
    el.textContent = 'Niezapisane zmiany';
    el.className = 'save-status dirty';
  } else {
    el.textContent = '';
    el.className = 'save-status';
  }
}

// ── WYPEŁNIANIE PÓL ───────────────────────────────────────

function fillEditorFields(article) {
  document.getElementById('editor-title').value    = article.title || '';
  document.getElementById('editor-textarea').value = article.content || '';
  document.getElementById('editor-tags').value     = formatTags(article.tags);
  const catSelect = document.getElementById('editor-category');
  if (article.category) catSelect.value = article.category;
  if (article.infobox?.length) {
    article.infobox.forEach(p => addInfoboxPair(p.key, p.value));
  }
}

async function fillCategorySelect() {
  const select = document.getElementById('editor-category');
  getCategoryOptions().forEach(opt => {
    const o = document.createElement('option');
    o.value = opt.id;
    o.textContent = opt.name;
    select.appendChild(o);
  });
}

// ── INFOBOX ───────────────────────────────────────────────

function addInfoboxPair(key = '', value = '') {
  const container = document.getElementById('infobox-pairs');
  const row = document.createElement('div');
  row.className = 'infobox-pair';
  row.innerHTML = `
    <input type="text" placeholder="Klucz (np. Urodzony)"
      value="${escHtml(typeof key === 'string' ? key : '')}" class="ib-key" />
    <input type="text" placeholder="Wartość (np. 1452)"
      value="${escHtml(typeof value === 'string' ? value : '')}" class="ib-val" />
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

// ── ZAPIS / USUWANIE ──────────────────────────────────────

async function handleSave() {
  const title    = document.getElementById('editor-title').value.trim();
  const content  = document.getElementById('editor-textarea').value;
  const tags     = parseTags(document.getElementById('editor-tags').value);
  const category = document.getElementById('editor-category').value;
  const infobox  = collectInfobox();

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
    isDirty = false;
    setDirtyStatus();
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

// ── HELPERS ───────────────────────────────────────────────

function insertAt(ta, text) {
  const start = ta.selectionStart;
  const end   = ta.selectionEnd;
  ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
  ta.selectionStart = ta.selectionEnd = start + text.length;
  ta.dispatchEvent(new Event('input'));
}

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
