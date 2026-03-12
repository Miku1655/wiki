// tags.js — Logika tagów

import { getAllMeta } from './articles.js';

/** Zwraca wszystkie unikalne tagi ze statystykami */
export function getAllTags() {
  const counts = {};
  getAllMeta().forEach(a => {
    (a.tags || []).forEach(tag => {
      counts[tag] = (counts[tag] || 0) + 1;
    });
  });
  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

/** Parsuje string tagów wpisany przez użytkownika */
export function parseTags(input) {
  return input
    .split(',')
    .map(t => t.trim().toLowerCase())
    .filter(Boolean);
}

/** Formatuje tagi do stringa */
export function formatTags(tags) {
  return (tags || []).join(', ');
}
