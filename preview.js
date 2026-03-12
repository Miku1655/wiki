// preview.js — Wysuwany podgląd artykułu po kliknięciu [[linku]]

import { getArticleFull, getArticleByTitle } from './articles.js';
import { renderMarkdown } from './markdown.js';

let navigateFn = null;
let currentArticleId = null;

export function initPreview(navigateCallback) {
  navigateFn = navigateCallback;

  document.getElementById('btn-close-preview').addEventListener('click', hidePreview);
  document.getElementById('btn-preview-open').addEventListener('click', () => {
    if (currentArticleId) {
      hidePreview();
      navigateFn('article/' + currentArticleId);
    }
  });
  document.getElementById('btn-preview-new-tab').addEventListener('click', () => {
    if (currentArticleId) {
      hidePreview();
      navigateFn('article/' + currentArticleId, { newTab: true });
    }
  });
}

export async function showPreview(articleId, articleTitle) {
  currentArticleId = articleId;
  const panel = document.getElementById('panel-preview');
  const overlay = document.getElementById('panel-overlay');
  const titleEl = document.getElementById('preview-title');
  const contentEl = document.getElementById('preview-content');

  titleEl.textContent = articleTitle || 'Podgląd';
  contentEl.innerHTML = '<div class="loading-spinner"><div class="spinner"></div> Ładowanie…</div>';

  // Ukryj panel kart jeśli otwarty
  const tabsPanel = document.getElementById('panel-tabs');
  if (tabsPanel.classList.contains('visible')) {
    tabsPanel.classList.remove('visible');
    setTimeout(() => tabsPanel.classList.add('hidden'), 240);
  }

  panel.classList.remove('hidden');
  requestAnimationFrame(() => panel.classList.add('visible'));
  overlay.classList.remove('hidden');

  // Pokaż przyciski tylko jeśli artykuł istnieje
  const hasId = !!articleId;
  document.getElementById('btn-preview-open').style.display = hasId ? '' : 'none';
  document.getElementById('btn-preview-new-tab').style.display = hasId ? '' : 'none';

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
    // Renderuj pierwsze ~1500 znaków jako podgląd
    const previewContent = (article.content || '').slice(0, 1500);
    const html = renderMarkdown(previewContent);
    contentEl.innerHTML = `<div class="md-content">${html}${article.content?.length > 1500 ? '<p class="text-muted">…</p>' : ''}</div>`;
    // Wiki-linki w podglądzie też działają
    contentEl.querySelectorAll('.wiki-link').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.articleId;
        const title = el.dataset.articleTitle;
        showPreview(id, title);
      });
    });
  } catch(e) {
    contentEl.innerHTML = '<div class="empty-state"><p>Błąd ładowania artykułu.</p></div>';
    console.error(e);
  }
}

export function hidePreview() {
  const panel = document.getElementById('panel-preview');
  const overlay = document.getElementById('panel-overlay');
  panel.classList.remove('visible');
  setTimeout(() => panel.classList.add('hidden'), 240);
  overlay.classList.add('hidden');
  currentArticleId = null;
}

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
