// bookmarks.js — Zakładki (localStorage)

const KEY = 'kp_bookmarks';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
  catch { return []; }
}
function save(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {}
}

export function getBookmarks() { return load(); }

export function isBookmarked(id) {
  return load().some(b => b.id === id);
}

export function toggleBookmark(id, title) {
  const list = load();
  const idx  = list.findIndex(b => b.id === id);
  if (idx >= 0) {
    list.splice(idx, 1);
    save(list);
    return false; // usunięto
  } else {
    list.unshift({ id, title, addedAt: new Date().toISOString() });
    save(list);
    return true; // dodano
  }
}

export function removeBookmark(id) {
  save(load().filter(b => b.id !== id));
}
