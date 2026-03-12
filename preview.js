// preview.js — Wysuwany podgląd artykułu po kliknięciu [[linku]]

import { getArticleFull, getArticleByTitle } from './articles.js';
import { renderMarkdown } from './markdown.js';
import { openPanel, closePanel } from './panels.js';

let navigateFn = null;
let currentArticleId = null;

export function initPreview(navigateCallback) {
  navigateFn = navigateCallback;

  document.getElementById('btn-close-preview').addEventListener('click', hidePreview);

  document.getElementById('btn-preview-open').addEventListener('click', () => {
    const id = currentArticleId;
    // Otwórz w tej samej karcie — nawigacja z podglądu traktowana jak wiki-link
    if (id) { hidePreview(); navigateFn('article/' + id, { fromPreview: true }); }
  });

  document.getElementById('btn-preview-new-tab').addEventListener('click', () => {
    const id = currentArticleId;
    if (id) { hidePreview(); navigateFn('article/' + id, { newTab: true }); }
  });
}

export async function showPreview(articleId, articleTitle) {
  articleId = articleId || null;

  if (!articleId && articleTitle) {
    const found = getArticleByTitle(articleTitle);
    if (found) articleId = found.id;
  }

  currentArticleId = articleId;

  const titleEl   = document.getElementById('preview-title');
  const contentEl = document.getElementById('preview-content');

  titleEl.textContent = articleTitle || 'Podgląd';
  contentEl.innerHTML = '<div class="loading-spinner"><div class="spinner"></div> Ładowanie…</div>';

  openPanel('preview');

  document.getElementById('btn-preview-open').style.display    = articleId ? '' : 'none';
  document.getElementById('btn-preview-new-tab').style.display = articleId ? '' : 'none';

  if (!articleId) {
    contentEl.innerHTML = `<div class="empty-state">
      <div class="empty-icon">📄</div>
      <p>Artykuł „${escHtml(articleTitle)}" nie istnieje jeszcze.</p>
      <button class="btn-primary mt-8" id="btn-preview-create">Utwórz artykuł</button>
    </div>`;
    document.getElementById('btn-preview-create')?.addEventListener('click', () => {
      hidePreview();
      navigateFn('editor/new', { prefillTitle: articleTitle });
    });
    return;
  }

  try {
    const article = await getArticleFull(articleId);
    if (!article) {
      contentEl.innerHTML = '<div class="empty-state"><p>Nie znaleziono artykułu.</p></div>';
      return;
    }
    const previewContent = (article.content || '').slice(0, 1500);
    const html = renderMarkdown(previewContent);
    contentEl.innerHTML = `<div class="md-content">${html}${article.content?.length > 1500 ? '<p class="text-muted">…</p>' : ''}</div>`;
    contentEl.querySelectorAll('.wiki-link').forEach(el => {
      el.addEventListener('click', e => {
        e.stopPropagation();
        showPreview(el.dataset.articleId || null, el.dataset.articleTitle);
      });
    });
  } catch(e) {
    contentEl.innerHTML = '<div class="empty-state"><p>Błąd ładowania artykułu.</p></div>';
    console.error(e);
  }
}

export function hidePreview() {
  closePanel('preview');
  currentArticleId = null;
}

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
