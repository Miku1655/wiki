// reading-paths.js — Ścieżki czytania

const KEY = 'kp_reading_paths';

// ── STORAGE ───────────────────────────────────────────────

function loadAll() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
  catch { return []; }
}
function saveAll(paths) {
  try { localStorage.setItem(KEY, JSON.stringify(paths)); } catch {}
}
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// ── API ───────────────────────────────────────────────────

export function getAllPaths() { return loadAll(); }

export function getPath(id) { return loadAll().find(p => p.id === id) || null; }

export function createPath(name, description = '') {
  const paths = loadAll();
  const path  = { id: genId(), name, description, items: [], createdAt: new Date().toISOString() };
  paths.push(path);
  saveAll(paths);
  return path;
}

export function updatePath(id, changes) {
  const paths = loadAll();
  const idx   = paths.findIndex(p => p.id === id);
  if (idx < 0) return;
  paths[idx] = { ...paths[idx], ...changes };
  saveAll(paths);
}

export function deletePath(id) {
  saveAll(loadAll().filter(p => p.id !== id));
}

/**
 * Dodaje artykuł do ścieżki.
 * articleId może być null — wtedy element jest placeholderem
 * (artykuł jeszcze nie istnieje w kompendium).
 */
export function addItemToPath(pathId, articleId, articleTitle) {
  const paths = loadAll();
  const path  = paths.find(p => p.id === pathId);
  if (!path) return;
  // Nie dodawaj duplikatów (tylko dla prawdziwych artykułów)
  if (articleId && path.items.some(i => i.articleId === articleId)) return;
  path.items.push({
    articleId: articleId || null,
    title:     articleTitle,
    status:    'todo',
    addedAt:   new Date().toISOString()
  });
  saveAll(paths);
}

export function removeItemFromPath(pathId, articleId) {
  const paths = loadAll();
  const path  = paths.find(p => p.id === pathId);
  if (!path) return;
  path.items = path.items.filter(i => i.articleId !== articleId);
  saveAll(paths);
}

/**
 * Zmień status artykułu: 'todo' | 'reading' | 'done'
 * Obsługuje zarówno wyszukiwanie po articleId jak i po tytule
 * (dla placeholderów bez articleId).
 */
export function setItemStatus(pathId, articleId, status, fallbackTitle) {
  const paths = loadAll();
  const path  = paths.find(p => p.id === pathId);
  if (!path) return;
  const item = articleId
    ? path.items.find(i => i.articleId === articleId)
    : path.items.find(i => !i.articleId && i.title === fallbackTitle);
  if (item) item.status = status;
  saveAll(paths);
}

/** Przesuń pozycję w górę/dół */
export function moveItem(pathId, articleId, direction) {
  const paths = loadAll();
  const path  = paths.find(p => p.id === pathId);
  if (!path) return;
  const idx = path.items.findIndex(i => i.articleId === articleId);
  if (idx < 0) return;
  const newIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (newIdx < 0 || newIdx >= path.items.length) return;
  [path.items[idx], path.items[newIdx]] = [path.items[newIdx], path.items[idx]];
  saveAll(paths);
}

/** Importuje listę artykułów (np. wygenerowaną przez AI).
 *  Akceptuje zarówno artykuły z id jak i placeholdery (articleId: null). */
export function importPathItems(pathId, items) {
  const paths = loadAll();
  const path  = paths.find(p => p.id === pathId);
  if (!path) return;
  items.forEach(item => {
    // Nie dodawaj duplikatów artykułów z id
    if (item.articleId && path.items.some(i => i.articleId === item.articleId)) return;
    path.items.push({
      articleId: item.articleId || null,
      title:     item.title,
      status:    'todo',
      addedAt:   new Date().toISOString()
    });
  });
  saveAll(paths);
}

/**
 * Statystyki ścieżki — nagłówki grup (type: 'group') nie wliczają się
 * do liczby artykułów ani postępu.
 */
export function getPathStats(path) {
  const articleItems = path.items.filter(i => i.type !== 'group');
  const total   = articleItems.length;
  const done    = articleItems.filter(i => i.status === 'done').length;
  const reading = articleItems.filter(i => i.status === 'reading').length;
  const todo    = total - done - reading;
  const pct     = total ? Math.round((done / total) * 100) : 0;
  return { total, done, reading, todo, pct };
}

/** Zwraca ścieżki zawierające dany artykuł */
export function getPathsForArticle(articleId) {
  return loadAll().filter(p => p.items.some(i => i.articleId === articleId));
}
