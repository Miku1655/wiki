// storage.js — Firebase Firestore: zapis i odczyt danych

import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc,
  query, orderBy, limit, serverTimestamp, where, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const db = () => window.__db;

// ── ARTYKUŁY ──────────────────────────────────────────────

/** Zwraca metadane wszystkich artykułów (bez treści) */
export async function fetchAllArticlesMeta() {
  const snap = await getDocs(collection(db(), 'articles'));
  return snap.docs.map(d => {
    const data = d.data();
    return {
      id: d.id,
      title: data.title,
      category: data.category || '',
      tags: data.tags || [],
      updatedAt: data.updatedAt?.toDate?.() || null,
      excerpt: data.excerpt || ''
    };
  });
}

/** Pobiera pełny artykuł (z treścią) */
export async function fetchArticle(id) {
  const snap = await getDoc(doc(db(), 'articles', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/** Zapisuje artykuł (nowy lub edytowany) */
export async function saveArticle(article) {
  const ref = article.id
    ? doc(db(), 'articles', article.id)
    : doc(collection(db(), 'articles'));

  const data = {
    title: article.title || 'Bez tytułu',
    content: article.content || '',
    category: article.category || '',
    tags: article.tags || [],
    infobox: article.infobox || [],
    excerpt: (article.content || '').replace(/[#*_\[\]`>]/g, '').slice(0, 200),
    updatedAt: serverTimestamp(),
    createdAt: article.createdAt || serverTimestamp()
  };

  await setDoc(ref, data, { merge: true });
  return ref.id;
}

/** Usuwa artykuł */
export async function deleteArticle(id) {
  await deleteDoc(doc(db(), 'articles', id));
}

// ── KATEGORIE ─────────────────────────────────────────────

/** Pobiera wszystkie kategorie */
export async function fetchCategories() {
  const snap = await getDocs(collection(db(), 'categories'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Zapisuje kategorię */
export async function saveCategory(cat) {
  const ref = cat.id
    ? doc(db(), 'categories', cat.id)
    : doc(collection(db(), 'categories'));
  await setDoc(ref, { name: cat.name, parentId: cat.parentId || null }, { merge: true });
  return ref.id;
}

/** Usuwa kategorię */
export async function deleteCategory(id) {
  await deleteDoc(doc(db(), 'categories', id));
}

// ── HISTORIA ──────────────────────────────────────────────

/**
 * Dodaje wpis do historii przeglądania.
 * Zwraca id nowo utworzonego dokumentu.
 */
export async function addHistoryEntry(articleId, articleTitle) {
  const ref = doc(collection(db(), 'history'));
  await setDoc(ref, {
    articleId,
    articleTitle,
    viewedAt: serverTimestamp()
  });
  return ref.id;
}

/**
 * Aktualizuje timestamp i tytuł istniejącego wpisu historii.
 * Używane do deduplikacji — zamiast nowego dokumentu odświeżamy stary.
 */
export async function updateHistoryEntry(id, articleTitle) {
  const ref = doc(db(), 'history', id);
  await updateDoc(ref, {
    articleTitle,
    viewedAt: serverTimestamp()
  });
}

/** Usuwa pojedynczy wpis z historii */
export async function deleteHistoryEntry(id) {
  await deleteDoc(doc(db(), 'history', id));
}

/** Pobiera historię przeglądania (ostatnie N wpisów) */
export async function fetchHistory(limitN = 200) {
  const q = query(
    collection(db(), 'history'),
    orderBy('viewedAt', 'desc'),
    limit(limitN)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({
    id: d.id,
    ...d.data(),
    viewedAt: d.data().viewedAt?.toDate?.() || new Date()
  }));
}
