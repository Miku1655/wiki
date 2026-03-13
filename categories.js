// categories.js — Hierarchia kategorii

import { fetchCategories, saveCategory as storageSave, deleteCategory as storageDelete } from './storage.js';
import { saveCategories, loadCategories } from './cache.js';

let categories = [];

// ── ŁADOWANIE ─────────────────────────────────────────────

export async function loadCategoriesData() {
  const cached = loadCategories();
  if (cached) categories = cached;
  try {
    const fresh = await fetchCategories();
    // Zachowaj kolejność z localStorage jeśli istnieje
    const cached2 = loadCategories();
    if (cached2 && cached2.length) {
      const orderMap = {};
      cached2.forEach(c => { if (c.order !== undefined) orderMap[c.id] = c.order; });
      fresh.forEach(c => { if (orderMap[c.id] !== undefined) c.order = orderMap[c.id]; });
    }
    categories = fresh;
    saveCategories(fresh);
  } catch(e) {
    console.warn('Nie można pobrać kategorii:', e);
  }
  return categories;
}

export function getAllCategories() { return categories; }

export function getCategoryById(id) {
  return categories.find(c => c.id === id) || null;
}

export function getCategoryName(id) {
  return getCategoryById(id)?.name || id || '—';
}

/** Buduje drzewo z płaskiej listy, uwzględniając kolejność */
export function buildCategoryTree(cats = categories) {
  const map = {};
  cats.forEach(c => { map[c.id] = { ...c, children: [] }; });
  const roots = [];
  cats.forEach(c => {
    if (c.parentId && map[c.parentId]) {
      map[c.parentId].children.push(map[c.id]);
    } else {
      roots.push(map[c.id]);
    }
  });
  // Sortuj po polu order
  const sortByOrder = nodes => {
    nodes.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    nodes.forEach(n => { if (n.children?.length) sortByOrder(n.children); });
  };
  sortByOrder(roots);
  return roots;
}

/** Zwraca ścieżkę breadcrumb dla kategorii */
export function getCategoryPath(id) {
  const path = [];
  let current = getCategoryById(id);
  while (current) {
    path.unshift(current);
    current = current.parentId ? getCategoryById(current.parentId) : null;
  }
  return path;
}

// ── ZAPIS / USUWANIE ──────────────────────────────────────

export async function saveCategoryToStore(cat) {
  const id = await storageSave(cat);
  const updated = { ...cat, id };
  const existing = categories.findIndex(c => c.id === id);
  if (existing >= 0) categories[existing] = updated;
  else categories.push(updated);
  saveCategories(categories);
  return id;
}

export async function deleteCategoryFromStore(id) {
  await storageDelete(id);
  categories = categories.filter(c => c.id !== id);
  saveCategories(categories);
}

/** Zapisuje nową kolejność kategorii (tylko w localStorage) */
export function saveCategoryOrder(orderedIds, parentId = null) {
  orderedIds.forEach((id, idx) => {
    const cat = categories.find(c => c.id === id);
    if (cat) cat.order = idx;
  });
  saveCategories(categories);
}

/** Opcja wyboru kategorii — zwraca spłaszczoną listę z wcięciami */
export function getCategoryOptions(tree = buildCategoryTree(), depth = 0) {
  const result = [];
  for (const node of tree) {
    result.push({ id: node.id, name: '　'.repeat(depth) + node.name });
    if (node.children?.length) {
      result.push(...getCategoryOptions(node.children, depth + 1));
    }
  }
  return result;
}

if (typeof window !== 'undefined') {
  window.__getAllCategories = getAllCategories;
}
