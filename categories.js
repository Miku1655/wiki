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

/** Buduje drzewo z płaskiej listy */
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

/**
 * Jedyna funkcja zapisu kategorii — przez storage.js do Firebase,
 * następnie aktualizuje in-memory cache i localStorage.
 *
 * Wcześniej istniały trzy duplikaty tej samej logiki:
 *   saveCategory / saveCategoryData / saveCategoryToStore
 * — wszystkie zostały zastąpione tą jedną funkcją.
 */
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
