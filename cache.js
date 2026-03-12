// cache.js — LocalStorage: cache metadanych i treści artykułów

const KEY_META    = 'kp_meta';
const KEY_CONTENT = 'kp_content_';
const KEY_CATS    = 'kp_categories';

// ── METADANE ──────────────────────────────────────────────

export function saveMeta(articles) {
  try {
    localStorage.setItem(KEY_META, JSON.stringify(articles));
  } catch(e) { console.warn('Cache meta save failed:', e); }
}

export function loadMeta() {
  try {
    const raw = localStorage.getItem(KEY_META);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// ── TREŚĆ ARTYKUŁU ────────────────────────────────────────

export function saveArticleContent(id, article) {
  try {
    localStorage.setItem(KEY_CONTENT + id, JSON.stringify(article));
  } catch(e) { console.warn('Cache content save failed:', e); }
}

export function loadArticleContent(id) {
  try {
    const raw = localStorage.getItem(KEY_CONTENT + id);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function removeArticleContent(id) {
  localStorage.removeItem(KEY_CONTENT + id);
}

// ── KATEGORIE ─────────────────────────────────────────────

export function saveCategories(cats) {
  try {
    localStorage.setItem(KEY_CATS, JSON.stringify(cats));
  } catch(e) { console.warn('Cache cats save failed:', e); }
}

export function loadCategories() {
  try {
    const raw = localStorage.getItem(KEY_CATS);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// ── CZYSZCZENIE ───────────────────────────────────────────

export function clearAll() {
  const keys = Object.keys(localStorage).filter(k => k.startsWith('kp_'));
  keys.forEach(k => localStorage.removeItem(k));
}
