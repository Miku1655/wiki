// reading-paths.js — Ścieżki czytania z synchronizacją Firestore

import { collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const CACHE_KEY = 'kp_paths_v2';
const LEGACY_KEY = 'kp_reading_paths';

function db() {
  return window.__db;
}

function col() {
  return collection(db(), 'reading_paths');
}

// ── CACHE ──────────────────────────────────────────────────

function saveCache(paths) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(paths)); } catch {}
}

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/** Jednorazowa migracja ze starego localStorage */
function migrateLegacy() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return [];
    const old = JSON.parse(raw);
    if (!Array.isArray(old) || !old.length) return [];
    console.log(`[paths] Migracja ${old.length} ścieżek z localStorage…`);
    return old;
  } catch { return []; }
}

// ── ŁADOWANIE I SYNC ───────────────────────────────────────

export async function loadPathsData() {
  // 1. Wczytaj cache natychmiast
  const cached = loadCache();
  if (cached) {
    _paths = cached;
    _notify();
  }

  // 2. Zasubskrybuj Firestore (real-time)
  if (_unsubscribe) _unsubscribe();

  return new Promise((resolve) => {
    let resolved = false;

    _unsubscribe = onSnapshot(col(), (snap) => {
      if (snap.empty && !resolved) {
        // Może być migracja z legacy
        const legacy = migrateLegacy();
        if (legacy.length) {
          _migrateToFirestore(legacy).then(() => {
            if (!resolved) { resolved = true; resolve(_paths); }
          });
        } else {
          _paths = [];
          _notify();
          if (!resolved) { resolved = true; resolve(_paths); }
        }
        return;
      }

      _paths = snap.docs.map(d => _docToPath(d));
      _paths.sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt) : 0;
        const tb = b.createdAt ? new Date(b.createdAt) : 0;
        return tb - ta;
      });
      saveCache(_paths);
      _notify();

      if (!resolved) { resolved = true; resolve(_paths); }
    }, (err) => {
      console.warn('[paths] Firestore error, using cache:', err);
      if (!resolved) { resolved = true; resolve(_paths); }
    });
  });
}

async function _migrateToFirestore(legacyPaths) {
  for (const p of legacyPaths) {
    try {
      const { id, ...data } = p;
      data.createdAt = serverTimestamp();
      data.updatedAt = serverTimestamp();
      data.migratedFrom = 'localStorage';
      await addDoc(col(), data);
    } catch(e) {
      console.warn('[paths] Błąd migracji:', e);
    }
  }
  // Wyczyść legacy
  try { localStorage.removeItem(LEGACY_KEY); } catch {}
  console.log('[paths] Migracja zakończona');
}

function _docToPath(docSnap) {
  const d = docSnap.data();
  return {
    id:          docSnap.id,
    name:        d.name || 'Bez nazwy',
    description: d.description || '',
    color:       d.color || null,
    icon:        d.icon || null,
    items:       Array.isArray(d.items) ? d.items : [],
    createdAt:   d.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
    updatedAt:   d.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
  };
}

// ── SUBSKRYPCJA ZMIAN ──────────────────────────────────────

export function onPathsChange(fn) {
  _listeners.push(fn);
  return () => { _listeners = _listeners.filter(l => l !== fn); };
}

function _notify() {
  _listeners.forEach(fn => { try { fn(_paths); } catch {} });
}

// ── GETTERY ────────────────────────────────────────────────

export function getAllPaths()     { return _paths; }
export function getPath(id)       { return _paths.find(p => p.id === id) || null; }

export function getPathsForArticle(articleId) {
  return _paths.filter(p => p.items.some(i => i.articleId === articleId));
}

export function getPathStats(path) {
  const articles = path.items.filter(i => i.type !== 'group');
  const total    = articles.length;
  const done     = articles.filter(i => i.status === 'done').length;
  const reading  = articles.filter(i => i.status === 'reading').length;
  const todo     = articles.filter(i => !i.status || i.status === 'todo').length;
  const pct      = total ? Math.round(done / total * 100) : 0;
  return { total, done, reading, todo, pct };
}

// ── OPERACJE CRUD ──────────────────────────────────────────

export async function createPath(name, description = '', color = null) {
  const docRef = await addDoc(col(), {
    name,
    description,
    color,
    items:     [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  // Zwróć obiekt natychmiast (Firestore listener uaktualni _paths)
  const newPath = { id: docRef.id, name, description, color, items: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  _paths.unshift(newPath);
  saveCache(_paths);
  _notify();
  return newPath;
}

export async function updatePath(id, changes) {
  await updateDoc(doc(db(), 'reading_paths', id), {
    ...changes,
    updatedAt: serverTimestamp(),
  });
  const idx = _paths.findIndex(p => p.id === id);
  if (idx >= 0) {
    _paths[idx] = { ..._paths[idx], ...changes, updatedAt: new Date().toISOString() };
    saveCache(_paths);
    _notify();
  }
}

export async function deletePath(id) {
  await deleteDoc(doc(db(), 'reading_paths', id));
  _paths = _paths.filter(p => p.id !== id);
  saveCache(_paths);
  _notify();
}

// ── OPERACJE NA POZYCJACH ──────────────────────────────────

async function _saveItems(pathId, items) {
  await updateDoc(doc(db(), 'reading_paths', pathId), {
    items,
    updatedAt: serverTimestamp(),
  });
  const idx = _paths.findIndex(p => p.id === pathId);
  if (idx >= 0) {
    _paths[idx] = { ..._paths[idx], items, updatedAt: new Date().toISOString() };
    saveCache(_paths);
    _notify();
  }
}

export async function addItemToPath(pathId, articleId, title) {
  const path = getPath(pathId);
  if (!path) return;
  const newItem = {
    type:      'article',
    articleId: articleId || null,
    title,
    status:    'todo',
    addedAt:   new Date().toISOString(),
  };
  await _saveItems(pathId, [...path.items, newItem]);
  return newItem;
}

export async function addGroupToPath(pathId, groupTitle) {
  const path = getPath(pathId);
  if (!path) return;
  const newGroup = {
    type:    'group',
    id:      'grp_' + Date.now().toString(36),
    title:   groupTitle,
    addedAt: new Date().toISOString(),
  };
  await _saveItems(pathId, [...path.items, newGroup]);
  return newGroup;
}

export async function removeItemFromPath(pathId, itemKey) {
  const path = getPath(pathId);
  if (!path) return;
  const items = path.items.filter(i => _itemKey(i) !== itemKey);
  await _saveItems(pathId, items);
}

export async function setItemStatus(pathId, itemKey, status) {
  const path = getPath(pathId);
  if (!path) return;
  const items = path.items.map(i =>
    _itemKey(i) === itemKey ? { ...i, status, doneAt: status === 'done' ? new Date().toISOString() : (i.doneAt || null) } : i
  );
  await _saveItems(pathId, items);
}

export async function reorderPathItems(pathId, newOrder) {
  const path = getPath(pathId);
  if (!path) return;
  const map = {};
  path.items.forEach(i => { map[_itemKey(i)] = i; });
  const items = newOrder.map(k => map[k]).filter(Boolean);
  await _saveItems(pathId, items);
}

export async function importPathItems(pathId, items) {
  const path = getPath(pathId);
  if (!path) return;
  const newItems = items.map(i => ({
    type:      'article',
    articleId: i.articleId || null,
    title:     i.title,
    status:    'todo',
    addedAt:   new Date().toISOString(),
  }));
  await _saveItems(pathId, [...path.items, ...newItems]);
}

export async function renameGroupInPath(pathId, itemKey, newTitle) {
  const path = getPath(pathId);
  if (!path) return;
  const items = path.items.map(i =>
    _itemKey(i) === itemKey ? { ...i, title: newTitle } : i
  );
  await _saveItems(pathId, items);
}

/**
 * Próbuje połączyć placeholdery z artykułami o pasującym tytule.
 * Wywoływane po zapisaniu nowego artykułu.
 */
export async function resolvePlaceholders(allArticleMeta) {
  const titleMap = {};
  allArticleMeta.forEach(a => { titleMap[a.title.toLowerCase()] = a; });

  for (const path of _paths) {
    let changed = false;
    const items = path.items.map(i => {
      if (i.type === 'article' && !i.articleId) {
        const match = titleMap[i.title.toLowerCase()];
        if (match) {
          changed = true;
          return { ...i, articleId: match.id, title: match.title };
        }
      }
      return i;
    });
    if (changed) {
      try { await _saveItems(path.id, items); } catch {}
    }
  }
}

// ── HELPERS ────────────────────────────────────────────────

export function _itemKey(item) {
  return item.articleId || item.id || item.title;
}
