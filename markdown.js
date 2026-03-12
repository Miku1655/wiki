// markdown.js — Parser Markdown z obsługą [[linków]], tabel, obrazów

import { getArticleByTitle } from './articles.js';

// ── HELPERS ───────────────────────────────────────────────

/**
 * Generuje bezpieczny slug HTML id z tekstu nagłówka.
 * Usuwa znaki specjalne, zostawia alfanumeryczne, spacje → myślniki.
 * Zachowuje polskie litery (nie zamienia ą→a itp.) — CSS.escape() w
 * konsumentach (sidebar-right, app) poradzi sobie z nimi poprawnie.
 */
function slugify(text) {
  return text
    .trim()
    .replace(/[&<>"'`=\/]/g, '')   // usuń znaki niebezpieczne dla HTML attr
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Renderuje Markdown do HTML.
 * Obsługuje: nagłówki, bold, italic, code, linki, obrazy,
 * tabele, cytaty, listy, [[wiki-linki]]
 */
export function renderMarkdown(text, onLinkClick) {
  if (!text) return '';

  let html = text;

  // Escape HTML (bezpieczeństwo) — musi być PIERWSZA operacja
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Bloki kodu (``` ... ```) — przetwarzaj przed resztą
  const codeBlocks = [];
  html = html.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code>${code.trim()}</code></pre>`);
    return `%%CODEBLOCK_${idx}%%`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Obrazy ![alt](url)
  // alt jest już po escape'owaniu, url sanitizujemy — tylko http/https
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => {
    const safeUrl = /^https?:\/\//i.test(url.trim()) ? url.trim() : '';
    if (!safeUrl) return escHtml(alt);
    return `<img src="${safeUrl}" alt="${alt}" loading="lazy" />`;
  });

  // [[Wiki-linki]] z opcjonalnym aliasem [[Cel|wyświetlany tekst]]
  html = html.replace(/\[\[([^\]]+)\]\]/g, (_, inner) => {
    const [titlePart, aliasPart] = inner.split('|');
    const title   = titlePart.trim();
    const display = aliasPart ? aliasPart.trim() : title;
    const article = getArticleByTitle(title);
    const cls = article ? 'wiki-link' : 'wiki-link missing';
    const id  = article ? article.id : '';
    const tip = article ? '' : ' title="Artykuł nie istnieje"';
    // display i title są już po html-escape bo przetwarzamy post-escape tekst
    return `<span class="${cls}" data-article-id="${id}" data-article-title="${escAttr(title)}"${tip}>${display}</span>`;
  });

  // Linki [text](url)
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Nagłówki — POPRAWKA: slug generujemy z surowego tekstu (przed escape),
  // ale ponieważ operujemy już na html-escaped stringu, najpierw unescape
  // fragment naghłówka, slugify, i ponownie escape dla atrybutu id.
  html = html.replace(/^#### (.+)$/gm, (_, raw) => {
    const slug = slugify(unescapeHtml(raw));
    return `<h4 id="${escAttr(slug)}">${raw}</h4>`;
  });
  html = html.replace(/^### (.+)$/gm, (_, raw) => {
    const slug = slugify(unescapeHtml(raw));
    return `<h3 id="${escAttr(slug)}">${raw}</h3>`;
  });
  html = html.replace(/^## (.+)$/gm, (_, raw) => {
    const slug = slugify(unescapeHtml(raw));
    return `<h2 id="${escAttr(slug)}">${raw}</h2>`;
  });
  html = html.replace(/^# (.+)$/gm, (_, raw) => {
    const slug = slugify(unescapeHtml(raw));
    return `<h1 id="${escAttr(slug)}">${raw}</h1>`;
  });

  // Linie poziome
  html = html.replace(/^(-{3,}|\*{3,})$/gm, '<hr />');

  // Bold i italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
  html = html.replace(/_(.+?)_/g, '<em>$1</em>');

  // Tabele
  html = parseMarkdownTables(html);

  // Cytaty
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/<\/blockquote>\n<blockquote>/g, '\n');

  // Listy nieuporządkowane
  html = html.replace(/^[\*\-] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`);

  // Listy uporządkowane
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Akapity — linie oddzielone pustą linią
  html = html.split(/\n\n+/).map(block => {
    block = block.trim();
    if (!block) return '';
    if (/^<(h[1-6]|ul|ol|li|blockquote|pre|table|hr)/.test(block)) return block;
    if (block.startsWith('%%CODEBLOCK')) return block;
    return `<p>${block.replace(/\n/g, '<br />')}</p>`;
  }).join('\n');

  // Przywróć bloki kodu
  codeBlocks.forEach((code, i) => {
    html = html.replace(`%%CODEBLOCK_${i}%%`, code);
  });

  return html;
}

/** Parser tabel Markdown */
function parseMarkdownTables(text) {
  const tableRegex = /(\|.+\|\n)([\|\-: ]+\|\n)((\|.+\|\n?)*)/g;
  return text.replace(tableRegex, (match, header, separator, body) => {
    const headers = header.trim().split('|').filter(Boolean).map(h => `<th>${h.trim()}</th>`).join('');
    const rows = body.trim().split('\n').filter(Boolean).map(row => {
      const cells = row.trim().split('|').filter(Boolean).map(c => `<td>${c.trim()}</td>`).join('');
      return `<tr>${cells}</tr>`;
    }).join('');
    return `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
  });
}

/**
 * Wersja renderMarkdown z adnotacjami data-line na każdym bloku —
 * używana przez edytor do precyzyjnego scroll sync.
 */
export function renderMarkdownWithLines(text) {
  if (!text) return '';

  const lines = text.split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('```')) {
      const start = i;
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) i++;
      blocks.push({ startLine: start, endLine: i, raw: lines.slice(start, i + 1).join('\n') });
      i++;
      continue;
    }

    if (!line.trim()) { i++; continue; }

    const start = i;
    while (i < lines.length && lines[i].trim()) i++;
    blocks.push({ startLine: start, endLine: i - 1, raw: lines.slice(start, i).join('\n') });
  }

  return blocks.map(b => {
    const html = renderMarkdown(b.raw);
    if (!html.trim()) return '';
    return html.replace(/^(<\w+)/, `$1 data-line="${b.startLine}"`);
  }).join('\n');
}

/** Wyciąga nagłówki z tekstu Markdown do spisu treści */
export function extractHeadings(text) {
  if (!text) return [];
  const headings = [];
  const lines = text.split('\n');
  for (const line of lines) {
    const m = line.match(/^(#{2,4})\s+(.+)$/);
    if (m) {
      const rawText = m[2].trim();
      headings.push({
        level: m[1].length,
        text:  rawText,
        id:    slugify(rawText),   // slug spójny z tym co generuje renderMarkdown
      });
    }
  }
  return headings;
}

/** Szuka tekstu w treści i zwraca snippet z podświetleniem */
export function highlightSnippet(content, query, maxLen = 140) {
  if (!content || !query) return '';
  const lower = content.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return content.slice(0, maxLen) + '…';
  const start = Math.max(0, idx - 40);
  const end   = Math.min(content.length, idx + query.length + 80);
  let snippet = (start > 0 ? '…' : '') + content.slice(start, end) + (end < content.length ? '…' : '');
  const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  snippet = snippet.replace(re, '<mark>$1</mark>');
  return snippet;
}

// ── HELPERS ───────────────────────────────────────────────

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/** Escape wartości atrybutu HTML (cudzysłów i apostrofy) */
function escAttr(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Odwraca minimalny html-escape (tylko &amp; &lt; &gt;) */
function unescapeHtml(str) {
  return (str || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
