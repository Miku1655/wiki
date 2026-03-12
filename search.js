// search.js — Wyszukiwarka: pełnotekstowa, tagi, kategorie, sekcje

import { getAllMeta, getArticleFull } from './articles.js';
import { getCategoryName } from './categories.js';
import { highlightSnippet, extractHeadings } from './markdown.js';
import { loadArticleContent } from './cache.js';

/**
 * Główna funkcja wyszukiwania.
 * Zwraca pogrupowane wyniki: artykuły, sekcje.
 */
export async function search(rawQuery) {
  const q = rawQuery.trim().toLowerCase();
  if (q.length < 2) return { articles: [], sections: [] };

  const meta = getAllMeta();
  const articleResults = [];
  const sectionResults = [];

  for (const article of meta) {
    const titleMatch  = article.title.toLowerCase().includes(q);
    const tagMatch    = (article.tags || []).some(t => t.toLowerCase().includes(q));
    const catMatch    = getCategoryName(article.category).toLowerCase().includes(q);
    const excerptMatch = (article.excerpt || '').toLowerCase().includes(q);

    // Pełna treść z cache jeśli dostępna
    const cached = loadArticleContent(article.id);
    const content = cached?.content || article.excerpt || '';
    const contentMatch = content.toLowerCase().includes(q);

    if (titleMatch || tagMatch || catMatch || excerptMatch || contentMatch) {
      const score = (titleMatch ? 10 : 0) + (tagMatch ? 5 : 0) + (catMatch ? 3 : 0) + (contentMatch ? 1 : 0);
      articleResults.push({
        ...article,
        score,
        snippet: highlightSnippet(content, rawQuery.trim())
      });
    }

    // Wyszukiwanie w sekcjach (nagłówkach)
    if (cached?.content) {
      const headings = extractHeadings(cached.content);
      headings.forEach(h => {
        if (h.text.toLowerCase().includes(q)) {
          sectionResults.push({
            articleId: article.id,
            articleTitle: article.title,
            sectionText: h.text,
            sectionId: h.id,
            level: h.level
          });
        }
      });
    }
  }

  articleResults.sort((a, b) => b.score - a.score);

  return {
    articles: articleResults.slice(0, 15),
    sections: sectionResults.slice(0, 8)
  };
}

/** Filtruje artykuły po tagu */
export function filterByTag(tag) {
  return getAllMeta().filter(a => (a.tags || []).includes(tag));
}

/** Filtruje artykuły po kategorii */
export function filterByCategory(categoryId) {
  return getAllMeta().filter(a => a.category === categoryId);
}
