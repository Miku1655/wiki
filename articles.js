// articles.js — Stan i logika artykułów (in-memory index)

import { fetchAllArticlesMeta, fetchArticle, saveArticle as storageSave, deleteArticle as storageDelete } from './storage.js';
import { saveMeta, loadMeta, saveArticleContent, loadArticleContent, removeArticleContent } from './cache.js';

// In-memory index metadanych artykułów
let metaIndex = [];

/**
 * Odwrócony indeks linków: tytuł (lowercase) → Set<articleId>
 *
 * Zamiast skanować treść każdego artykułu przy każdym wywołaniu
 * getRelatedArticles(), budujemy raz indeks i aktualizujemy go
 * przy zapisie/usunięciu artykułu. Koszt zapytania: O(1).
 *
 * Indeks jest budowany lazy (przy pierwszym użyciu) i inwalidowany
 * przy zmianach w metaIndex / treściach artykułów.
 */
let _linkIndex = null;   // Map<title_lower, Set<articleId>> | null

function getLinkIndex() {
  if (_linkIndex) return _linkIndex;
  _linkIndex = new Map();

  for (const article of metaIndex) {
    const cached = loadArticleContent(article.id);
    if (!cached?.content) continue;
    _registerLinks(article.id, cached.content);
  }
  return _linkIndex;
}

/** Rejestruje wszystkie [[wiki-linki]] z treści artykułu w indeksie */
function _registerLinks(articleId, content) {
  if (!_linkIndex) _linkIndex = new Map();
  const re = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const key = m[1].trim().toLowerCase();
    if (!_linkIndex.has(key)) _linkIndex.set(key, new Set());
    _linkIndex.get(key).add(articleId);
  }
}

/** Usuwa z indeksu wszystkie linki wychodzące z danego artykułu */
function _unregisterLinks(articleId) {
  if (!_linkIndex) return;
  for (const [, sources] of _linkIndex) {
    sources.delete(articleId);
  }
}

/** Inwaliduje cały indeks (np. po pełnym reload metadanych) */
function _invalidateLinkIndex() {
  _linkIndex = null;
}

// ── INICJALIZACJA ─────────────────────────────────────────

/**
 * Ładuje metadane wszystkich artykułów.
 * Najpierw sprawdza cache, potem Firebase.
 */
export async function loadArticlesMeta() {
  const cached = loadMeta();
  if (cached) {
    metaIndex = cached;
  }
  try {
    const fresh = await fetchAllArticlesMeta();
    metaIndex = fresh;
    saveMeta(fresh);
    _invalidateLinkIndex();   // nowe meta → indeks nieaktualny
  } catch(e) {
    console.warn('Nie można pobrać metadanych z Firebase:', e);
    if (!metaIndex.length) throw e;
  }
  return metaIndex;
}

// ── INDEX ─────────────────────────────────────────────────

export function getAllMeta() { return metaIndex; }

export function getMetaById(id) {
  return metaIndex.find(a => a.id === id) || null;
}

export function getArticleByTitle(title) {
  const lower = title.toLowerCase();
  return metaIndex.find(a => a.title.toLowerCase() === lower) || null;
}

export function getRecentArticles(n = 8) {
  return [...metaIndex]
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, n);
}

export function getRandomArticle() {
  if (!metaIndex.length) return null;
  return metaIndex[Math.floor(Math.random() * metaIndex.length)];
}

export function getArticlesByCategory(categoryId) {
  return metaIndex.filter(a => a.category === categoryId);
}

export function getArticlesByTag(tag) {
  return metaIndex.filter(a => a.tags?.includes(tag));
}

/**
 * Zwraca artykuły, które linkują do artykułu o danym tytule.
 *
 * OPTYMALIZACJA: zamiast O(n) skanowania treści wszystkich artykułów,
 * używamy odwróconego indeksu linków (O(1) lookup).
 * Indeks jest budowany lazy przy pierwszym wywołaniu i inwalidowany
 * przy zmianach treści (saveArticle / deleteArticle).
 */
export function getRelatedArticles(title) {
  const index   = getLinkIndex();
  const key     = title.toLowerCase();
  const sources = index.get(key);
  if (!sources || !sources.size) return [];

  return [...sources]
    .map(id => metaIndex.find(a => a.id === id))
    .filter(Boolean)
    .slice(0, 10);
}

// ── POBIERANIE TREŚCI ─────────────────────────────────────

/**
 * Pobiera pełny artykuł z cache lub Firebase.
 */
export async function getArticleFull(id) {
  const cached = loadArticleContent(id);
  if (cached) {
    // Odśwież w tle i zaktualizuj indeks linków
    fetchArticle(id).then(fresh => {
      if (fresh) {
        _unregisterLinks(id);
        saveArticleContent(id, fresh);
        if (fresh.content) _registerLinks(id, fresh.content);
      }
    }).catch(() => {});
    return cached;
  }
  const article = await fetchArticle(id);
  if (article) {
    saveArticleContent(id, article);
    if (article.content) _registerLinks(id, article.content);
  }
  return article;
}

// ── ZAPIS / USUWANIE ──────────────────────────────────────

export async function saveArticle(article) {
  const id = await storageSave(article);

  // Zaktualizuj indeks linków dla tego artykułu
  _unregisterLinks(id);
  if (article.content) _registerLinks(id, article.content);

  // Zaktualizuj local cache treści
  saveArticleContent(id, { ...article, id });

  // Zaktualizuj index metadanych
  const meta = {
    id,
    title: article.title || 'Bez tytułu',
    category: article.category || '',
    tags: article.tags || [],
    updatedAt: new Date(),
    excerpt: (article.content || '').replace(/[#*_\[\]`>]/g, '').slice(0, 200)
  };
  const existing = metaIndex.findIndex(a => a.id === id);
  if (existing >= 0) metaIndex[existing] = meta;
  else metaIndex.push(meta);
  saveMeta(metaIndex);
  return id;
}

export async function deleteArticle(id) {
  await storageDelete(id);
  _unregisterLinks(id);
  metaIndex = metaIndex.filter(a => a.id !== id);
  saveMeta(metaIndex);
  removeArticleContent(id);
}
