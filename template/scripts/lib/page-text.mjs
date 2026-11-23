/**
 * A page's own words and headings, with the site chrome taken out — read from
 * HTML alone, so `npm run match -- --text-only` needs no browser.
 *
 * ── WHY A PARSER AND NOT A REGEX ───────────────────────────────────────────
 * Removing "the header" means removing an element AND everything inside it,
 * chosen by id or class on a builder's minified markup. A regex cannot find
 * the matching close tag of a `<div id="header-outer">` that holds forty more
 * `<div>`s; it stops at the first `</div>` and leaves the menu behind, which
 * then counts as content on one side and not the other. So this builds a tree.
 * It is tolerant rather than spec-complete — the input is a page that already
 * renders, not hostile markup — and it needs no dependency.
 *
 * ── WHAT COUNTS AS CHROME ──────────────────────────────────────────────────
 * The question is "did the page's CONTENT survive", so anything that is the
 * same on every page, or not visible, is removed on both sides: the site
 * header, menus, footer, skip links, screen-reader-only labels, cookie banners,
 * chat launchers, popups. The header and footer are compared VISUALLY by
 * `match` instead, once per route, where a change shows up as pixels.
 *
 * Builder selectors are listed by builder because each one names its header
 * something different, and a header that is not recognised is read as content:
 * its menu labels then appear as "missing" on the new site, on every page.
 */

/* ── tokeniser ──────────────────────────────────────────────────────────── */

const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr',
]);
/* Contents are text up to the matching close tag, never markup. */
const RAW = new Set(['script', 'style', 'textarea', 'title', 'noscript', 'xmp', 'iframe']);

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  lsquo: "'", rsquo: "'", ldquo: '"', rdquo: '"', hellip: '…', copy: '©', reg: '®', trade: '™',
  euro: '€', pound: '£', middot: '·', bull: '•', laquo: '«', raquo: '»',
};

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try {
        return String.fromCodePoint(code);
      } catch {
        return m;
      }
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function parseAttrs(src) {
  const attrs = {};
  for (const m of src.matchAll(/([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

/** Parse HTML into `{ tag, attrs, children, parent }` nodes; text nodes are `{ text }`. */
function parseHtml(html) {
  const root = { tag: '#root', attrs: {}, children: [], parent: null };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  const re = /<!--[\s\S]*?-->|<![^>]*>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let last = 0;
  let m;
  while ((m = re.exec(html))) {
    if (m.index > last) top().children.push({ text: html.slice(last, m.index) });
    last = re.lastIndex;
    if (m[1]) {
      const tag = m[1].toLowerCase();
      const at = stack.map((n) => n.tag).lastIndexOf(tag);
      if (at > 0) stack.length = at; // close it and anything left open inside it
      continue;
    }
    if (!m[2]) continue; // comment or doctype
    const tag = m[2].toLowerCase();
    const node = { tag, attrs: parseAttrs(m[3] ?? ''), children: [], parent: top() };
    top().children.push(node);
    if (RAW.has(tag)) {
      const close = new RegExp(`</${tag}\\s*>`, 'ig');
      close.lastIndex = last;
      const end = close.exec(html);
      const stop = end ? end.index : html.length;
      node.children.push({ text: html.slice(last, stop) });
      last = re.lastIndex = end ? close.lastIndex : html.length;
      continue;
    }
    if (VOID.has(tag) || /\/\s*$/.test(m[3] ?? '')) continue;
    stack.push(node);
  }
  if (last < html.length) top().children.push({ text: html.slice(last) });
  return root;
}

/* ── selectors: compound + descendant, comma lists ──────────────────────── */

function compileCompound(src) {
  const parts = { tag: null, id: null, classes: [], attrs: [] };
  const re = /([a-zA-Z][\w-]*)|#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:([*^$]?=)["']?([^"'\]]*)["']?)?(?:\s+i)?\]/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[1]) parts.tag = m[1].toLowerCase();
    else if (m[2]) parts.id = m[2];
    else if (m[3]) parts.classes.push(m[3]);
    else parts.attrs.push({ name: m[4].toLowerCase(), op: m[5], value: (m[6] ?? '').toLowerCase() });
  }
  return parts;
}

function matchesCompound(node, c) {
  if (!node.tag || node.tag === '#root') return false;
  if (c.tag && node.tag !== c.tag) return false;
  if (c.id && node.attrs.id !== c.id) return false;
  if (c.classes.length) {
    const have = new Set((node.attrs.class ?? '').split(/\s+/));
    if (!c.classes.every((k) => have.has(k))) return false;
  }
  for (const a of c.attrs) {
    const v = node.attrs[a.name];
    if (v === undefined) return false;
    const lv = v.toLowerCase();
    if (a.op === '=' && lv !== a.value) return false;
    if (a.op === '*=' && !lv.includes(a.value)) return false;
    if (a.op === '^=' && !lv.startsWith(a.value)) return false;
    if (a.op === '$=' && !lv.endsWith(a.value)) return false;
  }
  return true;
}

function compileSelector(selector) {
  const alternatives = selector.split(',').map((s) => s.trim().split(/\s+/).map(compileCompound));
  return (node) =>
    alternatives.some((chain) => {
      if (!matchesCompound(node, chain[chain.length - 1])) return false;
      let i = chain.length - 2;
      for (let p = node.parent; p && i >= 0; p = p.parent) if (matchesCompound(p, chain[i])) i--;
      return i < 0;
    });
}

function walk(node, fn) {
  for (const child of [...(node.children ?? [])]) {
    if (child.tag && fn(child) === false) continue;
    if (child.tag) walk(child, fn);
  }
}

function remove(node) {
  const siblings = node.parent?.children;
  if (siblings) siblings.splice(siblings.indexOf(node), 1);
}

/* ── chrome ─────────────────────────────────────────────────────────────── */

/** Never content, on any site. */
const NEVER = 'script, style, noscript, template, svg, iframe, object, canvas, head, title, [hidden], [aria-hidden=true]';

/** Cookie banners and chat launchers — the same list `match` hides before a screenshot. */
export const OVERLAYS = [
  '#onetrust-banner-sdk', '#onetrust-consent-sdk', '#CybotCookiebotDialog', '.cky-consent-container',
  '#cookie-law-info-bar', '#cmplz-cookiebanner-container', '.cmplz-cookiebanner', '#cookie-notice',
  '#moove_gdpr_cookie_info_bar', '.iubenda-cs-container', '#BorlabsCookieBox', '#usercentrics-root',
  '#truste-consent-track', '.cc-window', '#cookieConsent', '.cookie-consent', '#cookie-banner',
  '.cookie-banner', '[data-cookie-banner]', '[data-consent-banner]',
  '#intercom-container', '.intercom-lightweight-app', '#hubspot-messages-iframe-container',
  '.crisp-client', '#tidio-chat', '#drift-widget-container', '#drift-frame-controller', '#fc_frame',
  '#chat-widget-container', '#beacon-container', '.zsiq_floatmain', '#trengo-web-widget', '#launcher',
  '.tawk-min-container', '#livechat-compact-container',
];

/** Site chrome by builder. Each line is something a real theme calls its header, footer or menu. */
const CHROME = [
  /* generic, any CMS */
  '[role=banner]', '[role=navigation]', '[role=contentinfo]', 'nav', 'dialog',
  '.skip-link', '.skip-to-content', 'a[href^="#"].screen-reader-text',
  '#masthead', '#colophon', '.site-header', '.site-footer', '#site-navigation', '#wpadminbar', '.pum-overlay',
  /* Salient */
  '#header-outer', '#header-space', '#search-outer', '#slide-out-widget-area', '#slide-out-widget-area-bg',
  '.nectar-skip-to-content', '#mobile-menu', '#footer-outer',
  /* Elementor */
  '.elementor-location-header', '.elementor-location-footer', '.elementor-location-popup',
  /* Divi */
  '#main-header', '#top-header', '.et-l--header', '#main-footer', '.et-l--footer',
  /* Bricks */
  '#brx-header', '#brx-footer', '.brx-popup',
  /* Gutenberg block themes */
  'header.wp-block-template-part', 'footer.wp-block-template-part',
  /* Date-picker widgets a form plugin injects: a month list and a grid of day
     numbers, read as "january … montuewedthu…" lost from a rebuilt form. */
  '.flatpickr-calendar', '.ui-datepicker', '#ui-datepicker-div', '.pika-single', '.daterangepicker',
  ...OVERLAYS,
];

const isNever = compileSelector(NEVER);
const isChrome = compileSelector(CHROME.join(', '));

/*
 * ── VISUALLY HIDDEN TEXT: CONTENT ON THE NEW SIDE, CHROME ON THE OLD ───────
 *
 * Text a screen reader reads and a sighted visitor does not. Which it is
 * depends on who wrote it, so the two sides are treated differently:
 *
 *   NEW side — KEPT. A rebuild that does this properly puts a decorative
 *     marquee in an `aria-hidden` track and its words once in a
 *     `.visually-hidden` copy, or keeps a rotating headline's full phrase in a
 *     hidden span. That IS the content, carried the accessible way. Stripping it
 *     reported "More Than Moments" missing from a page that carried it, on the
 *     first real pair this ran against.
 *   OLD side — STRIPPED. On a WordPress theme `.screen-reader-text` is almost
 *     always UI: "Search for:", "Open menu", "Close search", "(opens in a new
 *     tab)". Counted, those become words the new site is accused of losing.
 *
 * The asymmetry is safe because only old → new missing words fail. Keeping
 * hidden text on the new side can only ADD words there; stripping it on the old
 * side can only take UI labels out of the denominator. What it cannot catch is
 * a rebuild that moved visible copy into hidden text — that is what the visual
 * half of `match` measures. Skip links are chrome on both sides.
 */
const SCREEN_READER_ONLY = compileSelector(
  '.screen-reader-text, .sr-only, .visually-hidden, .screen-reader-only, .elementor-screen-only, .sr-only-focusable',
);
const isInContent = (node) => {
  for (let p = node.parent; p; p = p.parent) if (p.tag === 'main' || p.tag === 'article') return true;
  return false;
};
const isHiddenInline = (node) => /display\s*:\s*none|visibility\s*:\s*hidden/i.test(node.attrs.style ?? '');

/**
 * Remove chrome in place. A `<header>` or `<footer>` INSIDE `<main>` or
 * `<article>` is a post's title block or byline, not the site's — removing
 * every `<header>` would take a blog post's `<h1>` with it.
 */
function stripChrome(root, { keepScreenReaderText = false } = {}) {
  walk(root, (node) => {
    const pageChrome = (node.tag === 'header' || node.tag === 'footer') && !isInContent(node);
    const hiddenUi = !keepScreenReaderText && SCREEN_READER_ONLY(node);
    if (isNever(node) || isChrome(node) || pageChrome || hiddenUi || isHiddenInline(node)) {
      remove(node);
      return false;
    }
    /* An animated counter ships its START value and counts up in the browser;
       the visitor reads the end value, which is what a rebuild carries. */
    if (node.attrs['data-to-value'] !== undefined) node.children = [{ text: node.attrs['data-to-value'] }];
    return true;
  });
  return root;
}

/* Block-level boundaries start and end a word: `<span>Contact us</span><div>Your name`
   is two phrases, not "usYour". traps.md has the entry for the regex version. */
const BLOCK = new Set([
  'p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br', 'td', 'th', 'tr', 'section', 'article', 'header',
  'footer', 'aside', 'main', 'figure', 'figcaption', 'blockquote', 'dt', 'dd', 'ul', 'ol', 'table', 'form',
  'fieldset', 'legend', 'label', 'option', 'select', 'button', 'a', 'hr', 'pre', 'address', 'details', 'summary',
]);

/* No spaces and three or more digits, or a camera's own prefix. */
const FILENAME_ALT = /^(?:[^\s]*\d[^\s]*\d[^\s]*\d[^\s]*|(?:img|dsc|dscn|pxl|vid|photo|image)[\s_-]*\d[\w\s-]*)$/i;

function textOf(node) {
  if (node.text !== undefined) return decodeEntities(node.text);
  const inner = node.children.map(textOf).join('');
  /* An image's alt text is content a visitor reads, and a rebuild must keep —
     unless the CMS wrote it from the filename. "gallery00001" and
     "IMG 20231028 133434" are the defect `extract` flags as alt-filename; a
     rebuild that replaced them with descriptions fixed something, and on a
     real gallery page they were 52 of the 57 words reported "lost". */
  const alt = node.tag === 'img' && node.attrs.alt && !FILENAME_ALT.test(node.attrs.alt.trim()) ? ` ${node.attrs.alt} ` : '';
  return BLOCK.has(node.tag) ? ` ${inner}${alt} ` : inner + alt;
}

const norm = (s) => s.replace(/\s+/g, ' ').trim();

/**
 * The page's content: its words with chrome removed, its h1–h6 outline with
 * chrome removed, and the number of `<h1>`s on the WHOLE page — a second h1 in
 * the header is a real second h1, even though its text is not content.
 */
export function pageContent(html, { side = 'old' } = {}) {
  const doc = parseHtml(html);
  let h1Count = 0;
  walk(doc, (n) => {
    if (isNever(n)) return false;
    if (n.tag === 'h1') h1Count++;
    return true;
  });
  stripChrome(doc, { keepScreenReaderText: side === 'new' });
  const headings = [];
  walk(doc, (n) => {
    const level = /^h([1-6])$/.exec(n.tag)?.[1];
    if (level) {
      const text = norm(textOf(n));
      if (text) headings.push({ level: Number(level), text });
      return false;
    }
    return true;
  });
  const body = (() => {
    let found = null;
    walk(doc, (n) => {
      if (found) return false;
      if (n.tag === 'body') found = n;
      return !found;
    });
    return found ?? doc;
  })();
  return { text: norm(textOf(body)), headings, h1Count };
}

/* ── comparison ─────────────────────────────────────────────────────────── */

/** Words, the way a person would count them: case-folded, quotes unified, single letters dropped unless numeric. */
export function wordTokens(text) {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .split(/[^\p{L}\p{N}$€£'@.]+/u)
    .map((t) => t.replace(/^[.'@]+|[.'@]+$/g, ''))
    .filter((t) => t.length > 1 || /\d/.test(t));
}

/** Share of the old page's DISTINCT words present on the new page, and which are missing. */
export function conservation(oldText, newText) {
  const src = new Set(wordTokens(oldText));
  const have = new Set(wordTokens(newText));
  const missing = [...src].filter((w) => !have.has(w));
  return { ratio: src.size ? 1 - missing.length / src.size : 1, words: src.size, missing };
}

/** A few words either side of each missing word, from the OLD page, so a person can find it. */
export function missingContext(oldText, missing, max = 8) {
  const flat = oldText.replace(/\s+/g, ' ');
  const lower = flat.toLowerCase();
  const out = [];
  for (const w of missing.slice(0, max)) {
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}\\p{N}])`, 'u');
    const hit = re.exec(lower);
    if (!hit) continue;
    const i = hit.index + hit[1].length;
    out.push({ word: w, context: `…${flat.slice(Math.max(0, i - 40), i + w.length + 40).trim()}…` });
  }
  return out;
}

/**
 * Every h1–h3 on the old page must exist on the new one, at ANY level — `build.md`
 * phase 1 asks for heading levels to be normalised, so an old `<h3>` that became
 * an `<h2>` is the fix, not a loss. And the new page must have exactly one h1.
 */
export function compareHeadings(oldPage, newPage) {
  const key = (s) => norm(s).toLowerCase().replace(/[’‘]/g, "'");
  const have = new Set(newPage.headings.map((h) => key(h.text)));
  /* Contained counts too: an old heading split across two elements, or a new
     one that carries a hidden full phrase after the visible words, is still the
     same heading. */
  const newTexts = [...have];
  const missing = [...new Set(oldPage.headings.filter((h) => h.level <= 3).map((h) => norm(h.text)))].filter(
    (t) => !have.has(key(t)) && !newTexts.some((n) => n.includes(key(t))),
  );
  return { missing, h1Count: newPage.h1Count, ok: missing.length === 0 && newPage.h1Count === 1 };
}
