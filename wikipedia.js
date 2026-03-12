// wikipedia.js — Import artykułów z Wikipedii
// Używa Wikipedia REST API + konwersja wikitext → Markdown

/**
 * Wyszukuje artykuły na Wikipedii pasujące do frazy.
 */
export async function searchWikipedia(query, lang = 'pl') {
  const url = `https://${lang}.wikipedia.org/w/api.php?` + new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: query,
    srlimit: 8,
    format: 'json',
    origin: '*'
  });
  const res = await fetch(url);
  const data = await res.json();
  return data.query?.search || [];
}

/**
 * Pobiera pełny wikitext artykułu po tytule.
 */
export async function fetchWikipediaArticle(title, lang = 'pl') {
  const url = `https://${lang}.wikipedia.org/w/api.php?` + new URLSearchParams({
    action: 'query',
    prop: 'revisions|categories',
    rvprop: 'content',
    rvslots: 'main',
    titles: title,
    format: 'json',
    origin: '*'
  });
  const res = await fetch(url);
  const data = await res.json();
  const pages = data.query?.pages || {};
  const page = Object.values(pages)[0];
  if (!page || page.missing !== undefined) return null;
  const wikitext = page.revisions?.[0]?.slots?.main?.['*'] || '';
  return { title: page.title, wikitext };
}

/**
 * Konwertuje wikitext na Markdown + wyciąga infobox.
 * Zwraca { title, markdown, infobox: [{key, value}] }
 */
export function convertWikitextToMarkdown(title, wikitext) {
  let text = wikitext;

  // ── 1. Wyciągnij infobox ──────────────────────────────
  const infobox = extractInfobox(text);
  // Usuń infobox z tekstu
  text = removeTemplates(text);

  // ── 2. Usuń niepożądane bloki ─────────────────────────
  text = text.replace(/\[\[Kategoria:[^\]]*\]\]/gi, '');
  text = text.replace(/\[\[Category:[^\]]*\]\]/gi, '');
  text = text.replace(/\[\[Plik:[^\]]*\]\]/gi, '');
  text = text.replace(/\[\[File:[^\]]*\]\]/gi, '');
  text = text.replace(/\[\[Image:[^\]]*\]\]/gi, '');
  text = text.replace(/\[\[Grafika:[^\]]*\]\]/gi, '');
  text = text.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '');
  text = text.replace(/<ref[^>]*\/>/gi, '');
  text = text.replace(/<gallery[^>]*>[\s\S]*?<\/gallery>/gi, '');
  text = text.replace(/<math[^>]*>[\s\S]*?<\/math>/gi, '');
  text = text.replace(/<score[^>]*>[\s\S]*?<\/score>/gi, '');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  text = text.replace(/^__[A-Z]+__$/gm, '');

  // ── 3. Nagłówki ───────────────────────────────────────
  text = text.replace(/^======\s*(.+?)\s*======$/gm, '###### $1');
  text = text.replace(/^=====\s*(.+?)\s*=====$/gm,  '##### $1');
  text = text.replace(/^====\s*(.+?)\s*====$/gm,    '#### $1');
  text = text.replace(/^===\s*(.+?)\s*===$/gm,      '### $1');
  text = text.replace(/^==\s*(.+?)\s*==$/gm,        '## $1');

  // ── 4. Formatowanie tekstu ────────────────────────────
  text = text.replace(/'{5}(.+?)'{5}/g, '***$1***');
  text = text.replace(/'{3}(.+?)'{3}/g, '**$1**');
  text = text.replace(/'{2}(.+?)'{2}/g, '*$1*');

  // ── 5. Linki wewnętrzne ───────────────────────────────
  // Kolejność ma znaczenie:

  // a) [[Tytuł|alias]] → [[Tytuł|alias]] (zachowaj alias)
  text = text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '[[$1|$2]]');

  // b) [[Tytuł]]końcówka → [[Tytuł|Tytułkońcówka]]  (odmiana fleksyjna, np. [[Konfucjusz]]owi)
  text = text.replace(/\[\[([^\]|]+)\]\]([a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]+)/g,
    (_, title, suffix) => `[[${title}|${title}${suffix}]]`
  );

  // c) [[Tytuł]] bez końcówki → [[Tytuł]]
  text = text.replace(/\[\[([^\]|]+)\]\]/g, '[[$1]]');

  // ── 6. Linki zewnętrzne ───────────────────────────────
  text = text.replace(/\[https?:\/\/[^\s\]]+\s([^\]]+)\]/g, '$1');
  text = text.replace(/\[https?:\/\/[^\s\]]+\]/g, '');

  // ── 7. Tabele ─────────────────────────────────────────
  text = convertWikiTables(text);

  // ── 8. Listy ──────────────────────────────────────────
  // NAPRAWIONE: obsługa dowolnej głębokości zagnieżdżenia
  text = convertWikiLists(text);

  // ── 9. Sprzątanie ─────────────────────────────────────
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.trim();

  return { title, markdown: text, infobox };
}

// ── LISTY WIKI → MARKDOWN ─────────────────────────────────
//
// Oryginalne podejście (seria regexpów) działało tylko dla poziomów 1-2
// i generowało błędne wcięcia przy mieszaniu * i #.
//
// Nowe podejście: przetwarzamy linie po kolei i przeliczamy wcięcie
// na podstawie liczby znaków prefiksu (*, **, ***, # itd.).
//
// Wikitext:        Markdown:
//   * A              - A
//   ** B               - B
//   *** C                - C
//   ** D               - D
//   * E              - E
//   # X              1. X
//   ## Y               1. Y
//   ; Termin         **Termin**
//   : Opis             Opis

function convertWikiLists(text) {
  const lines = text.split('\n');
  const out   = [];

  for (const line of lines) {

    // Lista nieuporządkowana: *, **, ***, itd.
    const ulMatch = line.match(/^(\*+)\s*(.*)/);
    if (ulMatch) {
      const depth  = ulMatch[1].length;
      const indent = '  '.repeat(depth - 1);
      out.push(`${indent}- ${ulMatch[2]}`);
      continue;
    }

    // Lista uporządkowana: #, ##, ###, itd.
    // Uwaga: po konwersji nagłówków mamy już "## Tytuł" (ze spacją),
    // więc regex dla list numerowanych dopasowuje TYLKO linie bez spacji po #.
    const olMatch = line.match(/^(#+)([^\s#=].*|$)/);
    if (olMatch) {
      const depth  = olMatch[1].length;
      const indent = '  '.repeat(depth - 1);
      out.push(`${indent}1. ${olMatch[2]}`);
      continue;
    }

    // Definicja — termin (;) i opis (:)
    const defTerm = line.match(/^;\s*(.*)/);
    if (defTerm) {
      out.push(`**${defTerm[1]}**`);
      continue;
    }

    const defDesc = line.match(/^:\s*(.*)/);
    if (defDesc) {
      out.push(`  ${defDesc[1]}`);
      continue;
    }

    out.push(line);
  }

  return out.join('\n');
}

// ── INFOBOX ───────────────────────────────────────────────
//
// NAPRAWIONE względem oryginału:
//   • Szuka szablonu po nazwie (lista ~15 wariantów PL/EN) zamiast
//     łapania pierwszego szablonu z wieloma parametrami.
//   • Jeśli nie znajdzie po nazwie — fallback do szablonu z ≥5 parametrami.
//   • Ekstrakcja ciała szablonu uwzględnia zagnieżdżone {{ }} (balansowanie).
//   • Parser parametrów działa poprawnie dla wartości wieloliniowych
//     i zagnieżdżonych szablonów w wartościach (np. {{flaga|Polska}}).

function extractInfobox(wikitext) {
  // ── Krok 1: znajdź pozycję początku szablonu infobox ─────────────────────
  const INFOBOX_NAMES = [
    'infobox', 'Infobox',
    'Miasto', 'Gmina', 'Dzielnica', 'Osoba', 'Osoba infobox',
    'Person', 'Państwo', 'Country', 'Region',
    'Taxobox', 'Chembox', 'Drugbox', 'drugbox',
    'Speciesbox', 'speciesbox', 'Geobox', 'geobox',
    'military person', 'officeholder', 'Polityk',
  ];

  let templateStart = -1;

  for (const name of INFOBOX_NAMES) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const idx = wikitext.search(new RegExp(`\\{\\{\\s*${escaped}`, 'i'));
    if (idx !== -1) {
      templateStart = idx;
      break;
    }
  }

  // Fallback: pierwszy szablon wieloliniowy z ≥5 parametrami
  if (templateStart === -1) {
    const re = /\{\{([^\n|{}]+)\n/g;
    let m;
    while ((m = re.exec(wikitext)) !== null) {
      const afterName = wikitext.slice(m.index);
      const paramCount = (afterName.match(/^\s*\|/gm) || []).length;
      if (paramCount >= 5) {
        templateStart = m.index;
        break;
      }
    }
  }

  if (templateStart === -1) return [];

  // ── Krok 2: wyekstrahuj ciało szablonu (balansowanie nawiasów) ────────────
  let depth = 0;
  let i     = templateStart;
  let end   = -1;

  while (i < wikitext.length - 1) {
    if (wikitext[i] === '{' && wikitext[i + 1] === '{') {
      depth++; i += 2;
    } else if (wikitext[i] === '}' && wikitext[i + 1] === '}') {
      depth--;
      if (depth === 0) { end = i + 2; break; }
      i += 2;
    } else {
      i++;
    }
  }

  if (end === -1) return [];

  const templateBody = wikitext.slice(templateStart + 2, end - 2);

  // ── Krok 3: podziel na parametry z uwzględnieniem zagnieżdżeń ────────────
  const params = splitTemplateParams(templateBody);
  const pairs  = [];

  for (const param of params) {
    const eqIdx = param.indexOf('=');
    if (eqIdx === -1) continue;

    const key   = param.slice(0, eqIdx).trim().replace(/^\|/, '').trim();
    let   value = param.slice(eqIdx + 1).trim();

    if (!key || /^\d+$/.test(key)) continue;

    // Pomiń klucze obrazkowe/techniczne
    if (/^(image|zdjęcie|herb|flaga|mapa|logo|grafika|plik|file|caption|alt|width|height|size|color|colour|style|class|map_caption|flag_caption|image_caption|border)/i.test(key)) continue;

    // Wyczyść wartość
    value = value.replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, '$1');
    value = value.replace(/\[\[([^\]]+)\]\]/g, '$1');
    value = value.replace(/'{2,5}(.+?)'{2,5}/g, '$1');
    value = value.replace(/\{\{[^{}]*\}\}/g, '');
    value = value.replace(/<[^>]+>/g, '');
    value = value.replace(/<!--.*?-->/gs, '');
    value = value.replace(/\s+/g, ' ').trim();

    if (!value) continue;
    if (/\.(jpg|jpeg|png|gif|svg|webp)/i.test(value)) continue;

    pairs.push({ key, value });
  }

  return pairs.slice(0, 25);
}

// Dzieli ciało szablonu na parametry z uwzględnieniem zagnieżdżeń {{ }} i [[ ]]
function splitTemplateParams(body) {
  const params = [];
  let   depth  = 0;
  let   start  = 0;

  for (let i = 0; i < body.length - 1; i++) {
    const ch  = body[i];
    const ch2 = body[i + 1];

    if ((ch === '{' && ch2 === '{') || (ch === '[' && ch2 === '[')) {
      depth++; i++;
    } else if ((ch === '}' && ch2 === '}') || (ch === ']' && ch2 === ']')) {
      depth--; i++;
    } else if (ch === '|' && depth === 0) {
      params.push(body.slice(start, i));
      start = i + 1;
    }
  }
  params.push(body.slice(start));

  return params.map(p => p.trim()).filter(Boolean);
}

function removeTemplates(text) {
  let prev = '';
  let iterations = 0;
  while (prev !== text && iterations < 20) {
    prev = text;
    text = text.replace(/\{\{[^{}]*\}\}/g, '');
    iterations++;
  }
  text = text.replace(/\{\{[\s\S]*?\}\}/g, '');
  return text;
}

// ── TABELE WIKI → MARKDOWN ────────────────────────────────

function convertWikiTables(text) {
  return text.replace(/\{\|[\s\S]*?\|\}/g, (table) => {
    const rows = [];
    const lines = table.split('\n');
    let currentRow = [];
    let isHeader = false;
    let headerRow = null;

    for (const line of lines) {
      const t = line.trim();
      if (t.startsWith('{|') || t.startsWith('|+') || t.startsWith('|-')) {
        if (currentRow.length) {
          if (isHeader) headerRow = currentRow;
          else rows.push(currentRow);
          currentRow = [];
          isHeader = false;
        }
        continue;
      }
      if (t.startsWith('|}')) {
        if (currentRow.length) rows.push(currentRow);
        break;
      }
      if (t.startsWith('!')) {
        isHeader = true;
        const cells = t.slice(1).split('!!').map(c => {
          const pipeIdx = c.lastIndexOf('|');
          return pipeIdx !== -1 ? c.slice(pipeIdx + 1).trim() : c.trim();
        });
        currentRow.push(...cells);
        continue;
      }
      if (t.startsWith('|')) {
        const cells = t.slice(1).split('||').map(c => {
          const pipeIdx = c.lastIndexOf('|');
          return pipeIdx !== -1 ? c.slice(pipeIdx + 1).trim() : c.trim();
        });
        currentRow.push(...cells);
        continue;
      }
    }

    if (!headerRow && !rows.length) return '';

    // Jeśli brak nagłówka, użyj pierwszego wiersza danych jako nagłówka
    const hRow    = headerRow || rows.shift() || [];
    const sep     = hRow.map(() => '---');
    const mdRows  = [hRow, sep, ...rows];

    return '\n' + mdRows.map(r => '| ' + r.join(' | ') + ' |').join('\n') + '\n';
  });
}
