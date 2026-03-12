// editor.js — Edytor artykułów z toolbarem i podglądem na żywo

import { getArticleFull, saveArticle, deleteArticle, getAllMeta } from './articles.js';
import { renderMarkdown, renderMarkdownWithLines } from './markdown.js';
import { getCategoryOptions } from './categories.js';
import { parseTags, formatTags } from './tags.js';
import { showToast } from './ui.js';
import { requireAuth } from './auth.js';

let navigateFn         = null;
let currentMode        = 'split';
let currentArticle     = null;
let livePreviewTimeout = null;
let isDirty            = false;
let syncScrollEnabled  = true;
let syncLock           = false; // zapobiega pętli scroll sync

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

      <div id="editor-infobox-section" class="hidden">
        <div id="infobox-pairs"></div>
        <button class="btn-small mt-8" id="btn-add-pair">+ Dodaj pole</button>
      </div>

      <div id="editor-format-toolbar">
        <div class="fmt-group">
          <button class="fmt-btn" data-action="bold"      title="Pogrubienie (Ctrl+B)"><b>B</b></button>
          <button class="fmt-btn" data-action="italic"    title="Kursywa (Ctrl+I)"><i>I</i></button>
          <button class="fmt-btn" data-action="strike"    title="Przekreślenie"><s>S</s></button>
        </div>
        <div class="fmt-sep"></div>
        <div class="fmt-group">
          <button class="fmt-btn" data-action="h2" title="Nagłówek H2">H2</button>
          <button class="fmt-btn" data-action="h3" title="Nagłówek H3">H3</button>
          <button class="fmt-btn" data-action="h4" title="Nagłówek H4">H4</button>
        </div>
        <div class="fmt-sep"></div>
        <div class="fmt-group">
          <button class="fmt-btn" data-action="ul"        title="Lista punktowana (Tab=wcięcie, Shift+Tab=odcięcie)">• —</button>
          <button class="fmt-btn" data-action="ol"        title="Lista numerowana (Tab=wcięcie, Shift+Tab=odcięcie)">1.</button>
          <button class="fmt-btn" data-action="quote"     title="Cytat">❝</button>
          <button class="fmt-btn" data-action="code"      title="Kod inline">&lt;/&gt;</button>
          <button class="fmt-btn" data-action="codeblock" title="Blok kodu">{ }</button>
        </div>
        <div class="fmt-sep"></div>
        <div class="fmt-group">
          <button class="fmt-btn" data-action="wikilink" title="Link wiki [[…]] (Ctrl+K)">[[W]]</button>
          <button class="fmt-btn" data-action="table"    title="Wstaw tabelę">⊞</button>
          <button class="fmt-btn" data-action="hr"       title="Linia pozioma">—</button>
        </div>
        <div class="fmt-sep"></div>
        <button class="fmt-btn" id="btn-scroll-sync" title="Synchronizuj scroll (tylko Split)">
          ⇅ Sync
        </button>
      </div>

      <div id="editor-body" data-mode="split">
        <div id="editor-pane">
          <textarea id="editor-textarea" spellcheck="true"
            placeholder="Treść w Markdown…&#10;&#10;## Nagłówek&#10;&#10;Tekst [[link do artykułu]]"></textarea>
          <div class="editor-bottom-bar"></div>
        </div>
        <div id="editor-divider"></div>
        <div id="preview-pane">
          <div id="preview-pane-inner" class="md-content"></div>
          <div class="editor-bottom-bar"></div>
        </div>
      </div>

    </div>
  `;

  await fillCategorySelect();
  bindEvents(articleId);
  await loadContent(articleId, prefillTitle, options);
  setMode(currentMode);
}

// ── EVENTY ────────────────────────────────────────────────

function bindEvents(articleId) {
  const textarea = document.getElementById('editor-textarea');

  // Tryby widoku
  document.getElementById('btn-edit-mode').addEventListener('click',    () => setMode('edit'));
  document.getElementById('btn-split-mode').addEventListener('click',   () => setMode('split'));
  document.getElementById('btn-preview-mode').addEventListener('click', () => setMode('preview'));

  // Infobox
  document.getElementById('editor-infobox-toggle').addEventListener('toggle', e => {
    document.getElementById('editor-infobox-section').classList.toggle('hidden', !e.target.open);
  });
  document.getElementById('btn-add-pair').addEventListener('click', () => addInfoboxPair());

  // Akcje
  document.getElementById('btn-save-article').addEventListener('click', handleSave);
  document.getElementById('btn-delete-article')?.addEventListener('click', handleDelete);
  document.getElementById('btn-cancel-editor').addEventListener('click', () => {
    if (isDirty && !confirm('Masz niezapisane zmiany. Opuścić bez zapisu?')) return;
    navigateFn(currentArticle?.id ? 'article/' + currentArticle.id : 'home');
  });

  // Toolbar — mousedown + preventDefault zachowuje fokus i selekcję w textarea
  document.getElementById('editor-format-toolbar').addEventListener('mousedown', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    e.preventDefault(); // nie przesuwaj fokusa z textarea
    applyFormat(btn.dataset.action);
  });

  // Scroll sync toggle
  const syncBtn = document.getElementById('btn-scroll-sync');
  updateSyncBtn(syncBtn);
  syncBtn.addEventListener('mousedown', e => e.preventDefault());
  syncBtn.addEventListener('click', () => {
    syncScrollEnabled = !syncScrollEnabled;
    updateSyncBtn(syncBtn);
  });

  // Scroll sync — textarea → preview
  textarea.addEventListener('scroll', () => {
    if (!syncScrollEnabled || syncLock || currentMode !== 'split') return;
    syncLock = true;
    syncEditorToPreview(textarea);
    requestAnimationFrame(() => { syncLock = false; });
  });

  // Scroll sync — preview → textarea
  document.getElementById('preview-pane').addEventListener('scroll', () => {
    if (!syncScrollEnabled || syncLock || currentMode !== 'split') return;
    syncLock = true;
    syncPreviewToEditor(textarea);
    requestAnimationFrame(() => { syncLock = false; });
  });

  // Skróty klawiszowe
  textarea.addEventListener('keydown', handleKeydown);

  // Live preview + dirty tracking
  textarea.addEventListener('input', () => {
    isDirty = true;
    setDirtyStatus();
    clearTimeout(livePreviewTimeout);
    livePreviewTimeout = setTimeout(updateLivePreview, 250);
    handleWikiAutocomplete(textarea);
  });

  textarea.addEventListener('keydown', e => {
    if (wikiAcActive()) handleWikiAcKeydown(e);
  }, true); // capture — przed handleKeydown

  textarea.addEventListener('blur', () => hideWikiAc());
  document.getElementById('editor-title').addEventListener('input', () => {
    isDirty = true;
    setDirtyStatus();
  });
}

function updateSyncBtn(btn) {
  if (!btn) return;
  if (syncScrollEnabled) {
    btn.classList.add('fmt-btn-active');
    btn.title = 'Synchronizacja scrolla włączona — kliknij aby wyłączyć';
  } else {
    btn.classList.remove('fmt-btn-active');
    btn.title = 'Włącz synchronizację scrolla (tylko Split)';
  }
}

// ── TRYBY WIDOKU ──────────────────────────────────────────

function setMode(mode) {
  currentMode = mode;
  const editPane    = document.getElementById('editor-pane');
  const previewPane = document.getElementById('preview-pane');
  const divider     = document.getElementById('editor-divider');
  const body        = document.getElementById('editor-body');

  document.getElementById('btn-edit-mode').classList.toggle('active',    mode === 'edit');
  document.getElementById('btn-split-mode').classList.toggle('active',   mode === 'split');
  document.getElementById('btn-preview-mode').classList.toggle('active', mode === 'preview');

  editPane.classList.toggle('hidden',    mode === 'preview');
  previewPane.classList.toggle('hidden', mode === 'edit');
  divider.classList.toggle('hidden',     mode !== 'split');
  body.dataset.mode = mode;

  if (mode !== 'edit') updateLivePreview();
}

function updateLivePreview() {
  const pane = document.getElementById('preview-pane-inner');
  if (!pane || currentMode === 'edit') return;
  const content = document.getElementById('editor-textarea')?.value || '';
  pane.innerHTML = renderMarkdownWithLines(content);
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

  if (e.key === 'Tab') {
    e.preventDefault();
    handleListIndent(e.target, e.shiftKey);
    return;
  }

  if (e.key === 'Enter') handleListContinue(e);
}

// ── WCIĘCIA LISTY (Tab / Shift+Tab) ──────────────────────
//
// Na linii listy:
//   Tab        → dodaje 2 spacje na początku linii (zagłębienie)
//   Shift+Tab  → usuwa 2 spacje z początku linii (wynurzenie)
// Poza listą:
//   Tab        → wstawia 2 spacje w miejscu kursora (stare zachowanie)

function handleListIndent(ta, shiftKey) {
  const val      = ta.value;
  const selStart = ta.selectionStart;
  const selEnd   = ta.selectionEnd;

  // Wyznacz zakres linii objętych zaznaczeniem
  const blockStart = val.lastIndexOf('\n', selStart - 1) + 1;
  const before     = val.slice(0, blockStart);
  const block      = val.slice(blockStart, selEnd);
  const after      = val.slice(selEnd);
  const lines      = block.split('\n');

  // Sprawdź czy którakolwiek linia to linia listy
  const isListBlock = lines.some(l => /^\s*([-*]|\d+\.) /.test(l));

  if (!isListBlock) {
    // Poza listą: tylko Tab wstawia spacje w miejscu kursora
    if (!shiftKey) insertNative(ta, '  ', '  ');
    return;
  }

  const INDENT = '  ';
  const newLines = lines.map(line => {
    if (!shiftKey) {
      return INDENT + line;
    } else {
      if (line.startsWith(INDENT)) return line.slice(INDENT.length);
      if (line.startsWith(' '))    return line.slice(1);
      return line;
    }
  });

  const newBlock   = newLines.join('\n');
  const lengthDiff = newBlock.length - block.length;

  ta.focus();
  insertNative(ta, newBlock, newBlock, blockStart, selEnd);

  // Przywróć zaznaczenie przesunięte o zmianę długości
  const newStart = Math.max(blockStart, selStart + (shiftKey ? -(lines[0].length - newLines[0].length) : INDENT.length));
  ta.setSelectionRange(newStart, Math.max(blockStart, selEnd + lengthDiff));
}

// ── KONTYNUACJA LISTY (Enter) ─────────────────────────────
//
// Naprawione błędy względem oryginału:
//   • Warunek "pusta pozycja → wyjdź z listy" był zawsze fałszywy
//     (sprawdzał zły string). Teraz działa poprawnie.
//   • Przy zagnieżdżeniu: Enter na pustej pozycji wynurza o poziom,
//     nie wychodzi od razu z całej listy.
//   • Zachowuje pełne wcięcie (indent) linii nadrzędnej.

function handleListContinue(e) {
  const ta  = e.target;
  const val = ta.value;
  const pos = ta.selectionStart;

  // Nie rób nic przy zaznaczeniu — standardowe zachowanie
  if (ta.selectionEnd !== pos) return;

  const lineStart = val.lastIndexOf('\n', pos - 1) + 1;
  const line      = val.slice(lineStart, pos);

  const ulMatch = line.match(/^(\s*)([-*])([ \t])(.*)$/);
  const olMatch = line.match(/^(\s*)(\d+)\.([ \t])(.*)$/);

  if (ulMatch) {
    e.preventDefault();
    const [, indent, marker, , content] = ulMatch;

    if (!content.trim()) {
      // Pusta pozycja listy
      if (indent.length >= 2) {
        // Wynurz o jeden poziom
        const newIndent = indent.slice(2);
        insertNative(ta, `${newIndent}${marker} `, `${newIndent}${marker} `, lineStart, pos);
        ta.setSelectionRange(lineStart + newIndent.length + 2, lineStart + newIndent.length + 2);
      } else {
        // Wyjście z listy
        insertNative(ta, '', '', lineStart, pos);
        insertNative(ta, '\n', '\n');
      }
    } else {
      // Kontynuuj na tym samym poziomie
      insertNative(ta, `\n${indent}${marker} `, `\n${indent}${marker} `);
    }

  } else if (olMatch) {
    e.preventDefault();
    const [, indent, numStr, , content] = olMatch;

    if (!content.trim()) {
      if (indent.length >= 2) {
        const newIndent = indent.slice(2);
        insertNative(ta, `${newIndent}${parseInt(numStr) + 1}. `, `${newIndent}${parseInt(numStr) + 1}. `, lineStart, pos);
      } else {
        insertNative(ta, '', '', lineStart, pos);
        insertNative(ta, '\n', '\n');
      }
    } else {
      insertNative(ta, `\n${indent}${parseInt(numStr) + 1}. `, `\n${indent}${parseInt(numStr) + 1}. `);
    }
  }
}

// ── TOOLBAR ───────────────────────────────────────────────

const FORMATS = {
  bold:      { wrap: ['**', '**'], placeholder: 'pogrubiony tekst' },
  italic:    { wrap: ['*',  '*' ], placeholder: 'kursywa' },
  strike:    { wrap: ['~~','~~' ], placeholder: 'przekreślony tekst' },
  code:      { wrap: ['`',  '`' ], placeholder: 'kod' },
  wikilink:  { wrap: ['[[',']]' ], placeholder: 'Tytuł artykułu' },
  h2:        { line: '## ' },
  h3:        { line: '### ' },
  h4:        { line: '#### ' },
  ul:        { line: '- ' },
  ol:        { line: '1. ' },
  quote:     { line: '> ' },
  codeblock: { block: '```\n', blockEnd: '\n```', placeholder: 'kod' },
  table:     { insert: '\n| Kolumna 1 | Kolumna 2 | Kolumna 3 |\n|-----------|-----------|----------|\n| Dane      | Dane      | Dane      |\n' },
  hr:        { insert: '\n---\n' },
};

function applyFormat(action) {
  const ta  = document.getElementById('editor-textarea');
  if (!ta) return;
  const fmt = FORMATS[action];
  if (!fmt) return;

  const selStart = ta.selectionStart;
  const selEnd   = ta.selectionEnd;
  const sel      = ta.value.slice(selStart, selEnd);
  const val      = ta.value;

  if (fmt.insert) {
    ta.focus();
    ta.setSelectionRange(selStart, selEnd);
    insertNative(ta, fmt.insert, fmt.insert);

  } else if (fmt.wrap) {
    const [open, close] = fmt.wrap;
    if (sel.startsWith(open) && sel.endsWith(close) && sel.length > open.length + close.length) {
      const inner = sel.slice(open.length, sel.length - close.length);
      ta.focus();
      insertNative(ta, inner, inner, selStart, selEnd);
    } else {
      const text = sel || fmt.placeholder;
      ta.focus();
      if (!sel) ta.setSelectionRange(selStart, selEnd);
      insertNative(ta, open + text + close, open + text + close, selStart, selEnd);
      ta.setSelectionRange(selStart + open.length, selStart + open.length + text.length);
    }

  } else if (fmt.line) {
    const before     = val.slice(0, selStart);
    const lineStart  = before.lastIndexOf('\n') + 1;
    const fullLines  = val.slice(lineStart, selEnd);
    const replaced   = fullLines.split('\n').map(l =>
      l.startsWith(fmt.line) ? l.slice(fmt.line.length) : fmt.line + l
    ).join('\n');
    ta.focus();
    insertNative(ta, replaced, replaced, lineStart, lineStart + fullLines.length);
    ta.setSelectionRange(lineStart + fmt.line.length, lineStart + replaced.length);

  } else if (fmt.block) {
    const text  = sel || fmt.placeholder;
    const block = fmt.block + text + (fmt.blockEnd || '');
    ta.focus();
    insertNative(ta, block, block, selStart, selEnd);
    ta.setSelectionRange(selStart + fmt.block.length, selStart + fmt.block.length + text.length);
  }
}

// ── insertNative — używa execCommand dla natywnego undo ──

function insertNative(ta, text, _unused, start, end) {
  if (start !== undefined) ta.setSelectionRange(start, end ?? start);

  const ok = document.execCommand('insertText', false, text);

  if (!ok) {
    const s = ta.selectionStart, e = ta.selectionEnd;
    const scroll = ta.scrollTop;
    ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
    ta.scrollTop = scroll;
    ta.selectionStart = ta.selectionEnd = s + text.length;
    ta.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: text, bubbles: true }));
  }
}

// ── ZAŁADOWANIE TREŚCI ────────────────────────────────────

async function loadContent(articleId, prefillTitle, options) {
  if (articleId && articleId !== 'new') {
    document.getElementById('editor-title').value = 'Ładowanie…';
    currentArticle = await getArticleFull(articleId);
    if (currentArticle) fillEditorFields(currentArticle);
    isDirty = false;
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
    showToast(`Zaimportowano „${wi.title}" z Wikipedii`);
  } else {
    currentArticle = null;
    if (prefillTitle) document.getElementById('editor-title').value = prefillTitle;
    isDirty = false;
  }
  setDirtyStatus();
  updateLivePreview();
}

// ── STATUS ZAPISU ─────────────────────────────────────────

function setDirtyStatus() {
  const el = document.getElementById('editor-save-status');
  if (!el) return;
  el.textContent = isDirty ? 'Niezapisane zmiany' : '';
  el.className   = isDirty ? 'save-status dirty' : 'save-status';
}

// ── POLA ─────────────────────────────────────────────────

function fillEditorFields(article) {
  document.getElementById('editor-title').value    = article.title || '';
  document.getElementById('editor-textarea').value = article.content || '';
  document.getElementById('editor-tags').value     = formatTags(article.tags);
  const cat = document.getElementById('editor-category');
  if (article.category) cat.value = article.category;
  if (article.infobox?.length) article.infobox.forEach(p => addInfoboxPair(p.key, p.value));
}

async function fillCategorySelect() {
  const select = document.getElementById('editor-category');
  getCategoryOptions().forEach(opt => {
    const o = document.createElement('option');
    o.value = opt.id; o.textContent = opt.name;
    select.appendChild(o);
  });
}

// ── INFOBOX ───────────────────────────────────────────────

function addInfoboxPair(key = '', value = '') {
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
  document.getElementById('infobox-pairs').appendChild(row);
}

function collectInfobox() {
  return [...document.querySelectorAll('.infobox-pair')].map(row => ({
    key:   row.querySelector('.ib-key').value.trim(),
    value: row.querySelector('.ib-val').value.trim()
  })).filter(p => p.key || p.value);
}

// ── ZAPIS / USUWANIE ─────────────────────────────────────

async function handleSave() {
  const title    = document.getElementById('editor-title').value.trim();
  const content  = document.getElementById('editor-textarea').value;
  const tags     = parseTags(document.getElementById('editor-tags').value);
  const category = document.getElementById('editor-category').value;
  const infobox  = collectInfobox();

  if (!title) { showToast('Podaj tytuł artykułu'); document.getElementById('editor-title').focus(); return; }

  const btn = document.getElementById('btn-save-article');
  btn.textContent = 'Zapisywanie…'; btn.disabled = true;

  try {
    const id = await saveArticle({ id: currentArticle?.id, title, content, tags, category, infobox, createdAt: currentArticle?.createdAt });
    isDirty = false; setDirtyStatus();
    showToast('Artykuł zapisany ✓');
    navigateFn('article/' + id);
  } catch(e) {
    console.error(e);
    showToast('Błąd zapisu: ' + e.message);
    btn.textContent = 'Zapisz'; btn.disabled = false;
  }
}

async function handleDelete() {
  if (!currentArticle?.id) return;
  if (!confirm(`Usunąć artykuł „${currentArticle.title}"?`)) return;
  try {
    await deleteArticle(currentArticle.id);
    showToast('Artykuł usunięty');
    navigateFn('home');
  } catch(e) { showToast('Błąd usuwania'); }
}

// ── HELPERS ───────────────────────────────────────────────

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── SCROLL SYNC ───────────────────────────────────────────

function syncEditorToPreview(ta) {
  const preview = document.getElementById('preview-pane');
  if (!preview) return;
  const maxTa      = ta.scrollHeight - ta.clientHeight;
  const maxPreview = preview.scrollHeight - preview.clientHeight;
  if (maxTa <= 0 || maxPreview <= 0) return;
  preview.scrollTop = (ta.scrollTop / maxTa) * maxPreview;
}

function syncPreviewToEditor(ta) {
  const preview = document.getElementById('preview-pane');
  if (!preview) return;
  const maxTa      = ta.scrollHeight - ta.clientHeight;
  const maxPreview = preview.scrollHeight - preview.clientHeight;
  if (maxTa <= 0 || maxPreview <= 0) return;
  ta.scrollTop = (preview.scrollTop / maxPreview) * maxTa;
}

// ── WIKI-LINK AUTOCOMPLETE ────────────────────────────────

let acDropdown = null;
let acSelected = -1;
let acItems    = [];
let acBracketIdx = -1;

export function wikiAcActive() { return acDropdown && acDropdown.style.display !== 'none'; }

function handleWikiAutocomplete(ta) {
  const pos    = ta.selectionStart;
  const before = ta.value.slice(0, pos);

  const bracketIdx = before.lastIndexOf('[[');
  if (bracketIdx === -1) { hideWikiAc(); return; }
  const afterBracket = before.slice(bracketIdx + 2);
  if (afterBracket.includes(']]') || afterBracket.includes('\n') || afterBracket.includes('|')) {
    hideWikiAc(); return;
  }

  const query = afterBracket;
  if (!query) { hideWikiAc(); return; }

  const q = query.toLowerCase();
  acItems = getAllMeta().filter(a => a.title.toLowerCase().includes(q)).slice(0, 8);
  if (!acItems.length) { hideWikiAc(); return; }

  acBracketIdx = bracketIdx;
  showWikiAc(ta, acItems);
}

function showWikiAc(ta, items) {
  if (!acDropdown) {
    acDropdown = document.createElement('div');
    acDropdown.id = 'wiki-ac-dropdown';
    document.body.appendChild(acDropdown);
  }
  acSelected = 0;
  acDropdown.innerHTML = items.map((a, i) =>
    `<div class="wiki-ac-item${i === 0 ? ' selected' : ''}" data-idx="${i}">${escHtml(a.title)}</div>`
  ).join('');
  acDropdown.querySelectorAll('.wiki-ac-item').forEach(el => {
    el.addEventListener('mousedown', e => { e.preventDefault(); acceptWikiAc(ta, parseInt(el.dataset.idx)); });
    el.addEventListener('mouseover', () => { acSelected = parseInt(el.dataset.idx); updateAcSelection(); });
  });
  positionAcDropdown(ta);
  acDropdown.style.display = 'block';
}

function positionAcDropdown(ta) {
  if (!acDropdown) return;
  const rect = ta.getBoundingClientRect();
  const coords = getCaretCoords(ta);
  if (coords) {
    let left = rect.left + coords.left;
    let top  = rect.top  + coords.top + 22;
    acDropdown.style.display = 'block';
    const ddW = acDropdown.offsetWidth || 260;
    if (left + ddW > window.innerWidth - 8) left = window.innerWidth - ddW - 8;
    acDropdown.style.left = left + 'px';
    acDropdown.style.top  = top  + 'px';
  } else {
    acDropdown.style.left = (rect.left + 40) + 'px';
    acDropdown.style.top  = (rect.top + 60) + 'px';
  }
}

function getCaretCoords(ta) {
  try {
    const div   = document.createElement('div');
    const style = window.getComputedStyle(ta);
    ['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing',
     'paddingTop','paddingLeft','paddingRight','paddingBottom',
     'borderTopWidth','borderLeftWidth','whiteSpace','wordWrap',
     'overflowWrap','width','boxSizing'].forEach(p => { div.style[p] = style[p]; });
    div.style.position   = 'absolute';
    div.style.visibility = 'hidden';
    div.style.whiteSpace = 'pre-wrap';
    div.style.wordBreak  = 'break-word';
    div.style.height     = 'auto';
    const pre  = document.createTextNode(ta.value.slice(0, ta.selectionStart));
    const span = document.createElement('span');
    span.textContent = '|';
    div.appendChild(pre);
    div.appendChild(span);
    document.body.appendChild(div);
    const coords = {
      left: span.offsetLeft - ta.scrollLeft,
      top:  span.offsetTop  - ta.scrollTop
    };
    div.remove();
    return coords;
  } catch { return null; }
}

function handleWikiAcKeydown(e) {
  if (e.key === 'ArrowDown')  { e.preventDefault(); e.stopPropagation(); acSelected = Math.min(acSelected + 1, acItems.length - 1); updateAcSelection(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); acSelected = Math.max(acSelected - 1, 0); updateAcSelection(); }
  else if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault(); e.stopPropagation();
    const ta = document.getElementById('editor-textarea');
    if (ta && acSelected >= 0) acceptWikiAc(ta, acSelected);
  }
  else if (e.key === 'Escape') { e.preventDefault(); hideWikiAc(); }
}

function updateAcSelection() {
  if (!acDropdown) return;
  acDropdown.querySelectorAll('.wiki-ac-item').forEach((el, i) =>
    el.classList.toggle('selected', i === acSelected));
  acDropdown.querySelector('.wiki-ac-item.selected')?.scrollIntoView({ block: 'nearest' });
}

function acceptWikiAc(ta, idx) {
  const item = acItems[idx];
  if (!item) return;
  const pos    = ta.selectionStart;
  const before = ta.value.slice(0, acBracketIdx);
  const after  = ta.value.slice(pos);
  const insert = `[[${item.title}]]`;
  ta.value = before + insert + after;
  const newPos = acBracketIdx + insert.length;
  ta.setSelectionRange(newPos, newPos);
  ta.focus();
  hideWikiAc();
  isDirty = true; setDirtyStatus();
  clearTimeout(livePreviewTimeout);
  livePreviewTimeout = setTimeout(updateLivePreview, 150);
}

function hideWikiAc() {
  if (acDropdown) acDropdown.style.display = 'none';
  acSelected = -1; acItems = []; acBracketIdx = -1;
}
