// wikipedia.js — Import artykułów z Wikipedii
// Używa Wikipedia REST API + konwersja wikitext → Markdown

/**
 * Wyszukuje artykuły na Wikipedii pasujące do frazy.
 * Wykrywa język z domeny (pl/en/de itp.) lub używa domyślnego.
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

  // ── 2. Usuń nieporządane bloki ────────────────────────
  // Kategorie, pliki, szablony nawigacyjne, itp.
  text = text.replace(/\[\[Kategoria:[^\]]*\]\]/gi, '');
  text = text.replace(/\[\[Category:[^\]]*\]\]/gi, '');
  text = text.replace(/\[\[Plik:[^\]]*\]\]/gi, '');
  text = text.replace(/\[\[File:[^\]]*\]\]/gi, '');
  text = text.replace(/\[\[Image:[^\]]*\]\]/gi, '');
  text = text.replace(/\[\[Grafika:[^\]]*\]\]/gi, '');
  // Tagi HTML (ref, gallery, math itp.)
  text = text.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '');
  text = text.replace(/<ref[^>]*\/>/gi, '');
  text = text.replace(/<gallery[^>]*>[\s\S]*?<\/gallery>/gi, '');
  text = text.replace(/<math[^>]*>[\s\S]*?<\/math>/gi, '');
  text = text.replace(/<score[^>]*>[\s\S]*?<\/score>/gi, '');
  text = text.replace(/<[^>]+>/g, '');
  // Komentarze HTML
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  // Linie __TOC__ __NOTOC__ itp.
  text = text.replace(/^__[A-Z]+__$/gm, '');

  // ── 3. Nagłówki ───────────────────────────────────────
  text = text.replace(/^======\s*(.+?)\s*======$/gm, '###### $1');
  text = text.replace(/^=====\s*(.+?)\s*=====$/gm,  '##### $1');
  text = text.replace(/^====\s*(.+?)\s*====$/gm,    '#### $1');
  text = text.replace(/^===\s*(.+?)\s*===$/gm,      '### $1');
  text = text.replace(/^==\s*(.+?)\s*==$/gm,        '## $1');

  // ── 4. Formatowanie tekstu ────────────────────────────
  text = text.replace(/'{5}(.+?)'{5}/g, '***$1***');  // bold+italic
  text = text.replace(/'{3}(.+?)'{3}/g, '**$1**');    // bold
  text = text.replace(/'{2}(.+?)'{2}/g, '*$1*');      // italic

  // ── 5. Linki wewnętrzne [[Tytuł]] i [[Tytuł|tekst]] ──
  text = text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '[[$1|$2]]');
  text = text.replace(/\[\[([^\]]+)\]\]/g, '[[$1]]');

  // ── 6. Linki zewnętrzne [url tekst] ──────────────────
  text = text.replace(/\[https?:\/\/[^\s\]]+\s([^\]]+)\]/g, '$1');
  text = text.replace(/\[https?:\/\/[^\s\]]+\]/g, '');

  // ── 7. Tabele ─────────────────────────────────────────
  text = convertWikiTables(text);

  // ── 8. Listy ──────────────────────────────────────────
  // Zachowaj * i # jako markdown listy
  text = text.replace(/^\*{2}\s*/gm, '    - ');   // zagnieżdżone
  text = text.replace(/^\*\s*/gm, '- ');
  text = text.replace(/^#{2}\s*/gm, '    1. ');
  text = text.replace(/^#\s*/gm, '1. ');
  // Definicje ; i :
  text = text.replace(/^;\s*(.+)$/gm, '**$1**');
  text = text.replace(/^:\s*/gm, '> ');

  // ── 9. Sekcja "Zobacz też" i podobne — zostaw ─────────
  // (użytkownik może usunąć w edytorze)

  // ── 10. Sprzątanie ────────────────────────────────────
  // Wielokrotne puste linie → jedna
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.trim();

  return { title, markdown: text, infobox };
}

// ── INFOBOX ───────────────────────────────────────────────

function extractInfobox(wikitext) {
  // Znajdź pierwszy szablon który wygląda jak infobox
  const infoboxMatch = wikitext.match(/\{\{[^\|{}\n]*(?:infobox|Infobox|szablon|Miasto|Gmina|Osoba|Person|Taxobox|Chembox|Country|Państwo)[^}]*(?:\{\{[^}]*\}\}[^}]*)*/i);

  // Ogólne podejście — szukaj szablonu z wieloma parametrami w stylu | klucz = wartość
  const templateRegex = /\{\{([^{|}\n]+)\n([\s\S]*?)\n\}\}/;
  const match = wikitext.match(templateRegex);
  if (!match) return [];

  const body = match[2];
  const pairs = [];

  // Parsuj | klucz = wartość
  const lines = body.split('\n');
  for (const line of lines) {
    const m = line.match(/^\|\s*([^=|{}\[\]]+?)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    let value = m[2].trim();

    // Wyczyść wartość z wikitekstu
    value = value.replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, '$1'); // [[X|Y]] → Y
    value = value.replace(/\[\[([^\]]+)\]\]/g, '$1');           // [[X]] → X
    value = value.replace(/'{2,3}(.+?)'{2,3}/g, '$1');          // bold/italic
    value = value.replace(/<[^>]+>/g, '');                      // tagi HTML
    value = value.replace(/\{\{[^}]+\}\}/g, '');                // zagnieżdżone szablony
    value = value.replace(/<!--.*?-->/g, '');
    value = value.trim();

    // Pomiń puste, techniczne, multimedialne
    if (!value) continue;
    if (/^(image|zdjęcie|herb|flaga|mapa|logo|grafika|plik|file|caption|alt|width|height|size|color|colour|style|class|map_caption)/i.test(key)) continue;
    if (/\.(jpg|jpeg|png|gif|svg|webp)/i.test(value)) continue;

    pairs.push({ key, value });
  }

  return pairs.slice(0, 20); // maks 20 pól
}

function removeTemplates(text) {
  // Usuń szablony wielolinijkowe ({{...}}) iteracyjnie (od środka)
  let prev = '';
  let iterations = 0;
  while (prev !== text && iterations < 20) {
    prev = text;
    text = text.replace(/\{\{[^{}]*\}\}/g, '');
    iterations++;
  }
  // Usuń pozostałości
  text = text.replace(/\{\{[\s\S]*?\}\}/g, '');
  return text;
}

// ── TABELE WIKI ───────────────────────────────────────────

function convertWikiTables(text) {
  // Zastąp każdą tabelę wiki jej odpowiednikiem markdown
  // Tabela zaczyna się od {| a kończy |}
  return text.replace(/\{\|[\s\S]*?\|\}/g, (table) => {
    const rows = [];
    const lines = table.split('\n');
    let currentRow = [];
    let isHeader = false;
    let headerRow = null;

    for (const line of lines) {
      const t = line.trim();
      if (t.startsWith('{|') || t.startsWith('|+') || t.startsWith('|-')) {
        // Nowy wiersz — zapisz poprzedni
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
      // Komórki nagłówkowe !
      if (t.startsWith('!')) {
        isHeader = true;
        const cells = t.slice(1).split('!!').map(c => cleanCell(c));
        currentRow.push(...cells);
        continue;
      }
      // Komórki danych |
      if (t.startsWith('|')) {
        const cells = t.slice(1).split('||').map(c => cleanCell(c));
        currentRow.push(...cells);
        continue;
      }
      // Kontynuacja komórki
      if (currentRow.length && t) {
        currentRow[currentRow.length - 1] += ' ' + cleanCell(t);
      }
    }

    if (!rows.length && !headerRow) return '';

    // Buduj tabelę Markdown
    const allRows = headerRow ? [headerRow, ...rows] : rows;
    if (!allRows.length) return '';

    const colCount = Math.max(...allRows.map(r => r.length));
    const md = [];

    const header = allRows[0];
    md.push('| ' + padRow(header, colCount).join(' | ') + ' |');
    md.push('| ' + Array(colCount).fill('---').join(' | ') + ' |');

    for (let i = 1; i < allRows.length; i++) {
      md.push('| ' + padRow(allRows[i], colCount).join(' | ') + ' |');
    }

    return '\n' + md.join('\n') + '\n';
  });
}

function cleanCell(cell) {
  // Usuń atrybuty stylu (komórka może mieć "styl | treść")
  cell = cell.replace(/^[^|]*\|([^|].*)$/, '$1');
  cell = cell.replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, '$1');
  cell = cell.replace(/\[\[([^\]]+)\]\]/g, '$1');
  cell = cell.replace(/'{2,3}(.+?)'{2,3}/g, '$1');
  cell = cell.replace(/<[^>]+>/g, '');
  cell = cell.replace(/\{\{[^}]*\}\}/g, '');
  return cell.trim().replace(/\n/g, ' ');
}

function padRow(row, colCount) {
  const padded = [...row];
  while (padded.length < colCount) padded.push('');
  return padded.map(c => c || ' ');
}
