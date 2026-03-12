// articles.js — Stan i logika artykułów (in-memory index)

import { fetchAllArticlesMeta, fetchArticle, saveArticle as storageSave, deleteArticle as storageDelete } from './storage.js';
import { saveMeta, loadMeta, saveArticleContent, loadArticleContent, removeArticleContent } from './cache.js';

// In-memory index metadanych artykułów
let metaIndex = [];

// ── INICJALIZACJA ─────────────────────────────────────────

/**
 * Ładuje metadane wszystkich artykułów.
 * Najpierw sprawdza cache, potem Firebase.
 */
export async function loadArticlesMeta() {
  // Spróbuj cache
  const cached = loadMeta();
  if (cached) {
    metaIndex = cached;
  }
  // Zawsze odświeżaj z Firebase w tle
  try {
    const fresh = await fetchAllArticlesMeta();
    metaIndex = fresh;
    saveMeta(fresh);
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

/** Zwraca artykuły, które zawierają link do danego artykułu */
export function getRelatedArticles(title) {
  const lower = title.toLowerCase();
  return metaIndex.filter(a => {
    const content = loadArticleContent(a.id)?.content || '';
    return content.toLowerCase().includes(`[[${lower}]]`);
  }).slice(0, 10);
}

// ── POBIERANIE TREŚCI ─────────────────────────────────────

/**
 * Pobiera pełny artykuł z cache lub Firebase.
 */
export async function getArticleFull(id) {
  // Sprawdź cache
  const cached = loadArticleContent(id);
  if (cached) {
    // Odśwież w tle
    fetchArticle(id).then(fresh => {
      if (fresh) saveArticleContent(id, fresh);
    }).catch(() => {});
    return cached;
  }
  // Pobierz z Firebase
  const article = await fetchArticle(id);
  if (article) saveArticleContent(id, article);
  return article;
}

// ── ZAPIS / USUWANIE ──────────────────────────────────────

export async function saveArticle(article) {
  const id = await storageSave(article);
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
  metaIndex = metaIndex.filter(a => a.id !== id);
  saveMeta(metaIndex);
  removeArticleContent(id);
}
