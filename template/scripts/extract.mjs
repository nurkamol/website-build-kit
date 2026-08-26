/**
 * Turn the captured HTML in recon/html/ into clean markdown, one file per page.
 *
 *   npm run extract                       # every page recon captured
 *   npm run extract -- --only=about       # one, substring match on the slug
 *   npm run extract -- --dir=recon/html   # a different capture directory
 *
 * Writes recon/extracted/<slug>.md — frontmatter plus body — and prints a table
 * of what came out, with the pages worth re-reading flagged.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * `recon` captured the rendered HTML and NOTHING CONSUMED IT. `build.md` phase
 * 1 said "pull copy, media and metadata into structured files" and named no
 * tool, so every migration hand-rolled an extractor at the point in the project
 * where there is least time to write one carefully.
 *
 * On one build that left 18 pages of captured HTML sitting in recon/html/ while
 * the site shipped with a home page and nothing else.
 *
 * ── IT DOES NOT DECIDE THE CONTENT MODEL ───────────────────────────────────
 * Output goes to recon/extracted/, not src/content/. What the collections are,
 * which pages collapse into template + data, and which of these should exist at
 * all are phase-2 decisions and project-shaped — `build.md` §2. This produces
 * reviewable markdown; a person places it.
 *
 * ── WHY A DEPENDENCY ───────────────────────────────────────────────────────
 * `traps.md` has the entry: `html.replace(/<[^>]+>/g, '')` glues the text
 * either side of every tag it removes, so a heading runs into its paragraph and
 * a sentence into its link — but only where the source markup had no newline
 * between the tags, which is every page builder's minified output. So the
 * hand-rolled version is right on the pretty-printed pages and wrong on the
 * rest, and it reads as a content problem rather than a converter one.
 *
 * Getting whitespace, nesting and list indentation right is the entire job, and
 * turndown already does. It is 30 KB with no dependencies of its own. This is
 * the dependency `build.md` §2 means by "reach for the heavy option when the
 * task needs it".
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

import TurndownService from 'turndown';

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith('--only=')) ?? '').replace('--only=', '');
const SRC = (args.find((a) => a.startsWith('--dir=')) ?? '').replace('--dir=', '') || 'recon/html';
const OUT = 'recon/extracted';

if (!existsSync(SRC)) {
  console.error(
    `${RED}✗${RESET} ${SRC} not found.\n` +
      '  Run `npm run recon -- https://old-site.com` first — that is what captures the HTML.',
  );
  process.exit(1);
}

/*
 * Remove an element and everything inside it, innermost first.
 *
 * A single non-greedy regex stops at the FIRST closing tag, so a <nav> holding
 * a nested <nav> leaves the outer half behind — visible as a stray fragment of
 * menu at the top of the extracted copy. Matching only spans that contain no
 * further opening tag of the same name, repeatedly, unwinds nesting correctly.
 */
function stripElement(html, tag) {
  const inner = new RegExp(`<${tag}\\b[^>]*>(?:(?!<${tag}\\b)[\\s\\S])*?<\\/${tag}>`, 'gi');
  let out = html;
  for (let pass = 0; pass < 20; pass++) {
    const next = out.replace(inner, '');
    if (next === out) break;
    out = next;
  }
  /* Self-closing and unclosed leftovers. */
  return out.replace(new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi'), '');
}

/** Chrome, not content. Removed before the region is chosen and after. */
const FURNITURE = ['script', 'style', 'noscript', 'svg', 'nav', 'header', 'footer', 'aside', 'form', 'iframe'];

const attr = (html, re) => re.exec(html)?.[1]?.trim() ?? '';
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const decode = (s) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&rsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–');

/*
 * The content region. <main> is the answer when a theme emits one; <article> is
 * the fallback; <body> is the last resort and is reported, because a page
 * extracted from <body> has usually kept some chrome and wants a human.
 */
function contentRegion(html) {
  for (const [tag, label] of [['main', '<main>'], ['article', '<article>']]) {
    const m = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*)<\\/${tag}>`, 'i').exec(html);
    if (m && text(m[1]).length > 200) return { region: m[1], from: label };
  }
  const body = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(html);
  return { region: body?.[1] ?? html, from: '<body> — check for leftover chrome' };
}

/*
 * Portable image references, per build.md §2: content stores a path, never an
 * infrastructure URL. WordPress's generated `-300x200` sizes and Elementor's
 * thumbnail crops both point at derivatives — you want the original, and
 * `npm run media` will regenerate the sizes.
 */
function portableSrc(src) {
  let out = src.trim();
  try {
    out = new URL(out, 'https://placeholder.invalid').pathname;
  } catch {
    /* leave a relative path alone */
  }
  return out
    .replace(/\/uploads\/elementor\/thumbs\//, '/uploads/')
    .replace(/-\d{2,4}x\d{2,4}(?=\.[a-z]{3,4}$)/i, '')
    .replace(/-scaled(?=\.[a-z]{3,4}$)/i, '');
}

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
});

/* A builder wraps everything in divs and spans; they carry no meaning here. */
turndown.addRule('unwrap', {
  filter: ['div', 'span', 'section', 'figure'],
  replacement: (content) => content,
});

const files = readdirSync(SRC)
  .filter((f) => f.endsWith('.html'))
  .filter((f) => !only || f.includes(only))
  .sort();

if (!files.length) {
  console.error(`${RED}✗${RESET} no .html in ${SRC}${only ? ` matching --only=${only}` : ''}`);
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });

console.log(`${BOLD}── Extract ${'─'.repeat(48)}${RESET}`);
console.log(`  ${DIM}${files.length} page(s) from ${SRC}/ → ${OUT}/${RESET}\n`);

const rows = [];

for (const file of files) {
  const slug = file.replace(/\.html$/, '');
  const raw = readFileSync(`${SRC}/${file}`, 'utf8');
  const flags = [];

  const seoTitle = decode(text(attr(raw, /<title[^>]*>([\s\S]*?)<\/title>/i)));
  const description = decode(
    attr(raw, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i),
  );
  const canonical = attr(raw, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  const ogImage = attr(raw, /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);

  let { region, from } = contentRegion(raw);
  if (from.startsWith('<body>')) flags.push('region');

  for (const tag of FURNITURE) region = stripElement(region, tag);
  region = region.replace(/<!--[\s\S]*?-->/g, '');

  const h1 = decode(text(attr(region, /<h1[^>]*>([\s\S]*?)<\/h1>/i))) ||
    decode(text(attr(raw, /<h1[^>]*>([\s\S]*?)<\/h1>/i)));
  if (!h1) flags.push('no-h1');

  /*
   * Lazy-load placeholders: the real file is in data-src and `src` holds a
   * transparent gif or a base64 blur. Taking `src` migrates the placeholder,
   * which looks like a broken image on a page that built perfectly.
   */
  const images = [];
  region = region.replace(/<img\b[^>]*>/gi, (tag) => {
    const lazy = attr(tag, /\sdata-(?:src|lazy-src|original)=["']([^"']+)["']/i);
    const plain = attr(tag, /\ssrc=["']([^"']+)["']/i);
    const chosen = lazy || plain;
    if (!chosen || /^data:/i.test(chosen)) return '';
    const src = portableSrc(chosen);
    const alt = decode(attr(tag, /\salt=["']([^"']*)["']/i));
    /*
     * Empty alt is the obvious failure. The commoner one is alt text the CMS
     * generated FROM THE FILENAME — "pic 11", "service-maintenance-worker-
     * repairing" — which passes every automated check, reads as described, and
     * tells a screen-reader user nothing. Seen on every page of a real capture.
     */
    if (!alt) flags.push('img-alt');
    else if (alt.replace(/[\s-]+/g, '-').toLowerCase() === src.split('/').pop().replace(/\.[a-z]+$/i, '').replace(/[\s-]+/g, '-').toLowerCase().slice(0, alt.length + 8).replace(/-+$/, '')) {
      flags.push('alt-filename');
    }
    images.push({ src, alt });
    return `<img src="${src}" alt="${alt}">`;
  });

  /* srcset points at generated sizes that will not exist on the new site. */
  region = region.replace(/\ssrcset=["'][^"']*["']/gi, '').replace(/\ssizes=["'][^"']*["']/gi, '');

  let body = turndown.turndown(region);
  body = decode(body)
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+$/gm, '')
    .trim();

  const words = body.split(/\s+/).filter(Boolean).length;
  if (words < 80) flags.push('thin');

  /*
   * ⚠ PAGE BUILDERS USE HEADING TAGS AS TYPE STYLES. On a real capture the
   * lede paragraph was an <h5> and every section title an <h6>, chosen because
   * they looked right in the builder's preview — so the extracted markdown
   * carries a hierarchy that jumps h1 → h5 and never uses h2 at all.
   *
   * It survives every automated check (`verify` counts h1s, and there is
   * exactly one), reads correctly to a sighted visitor, and is both an
   * accessibility failure and the outline Google reads. build.md phase 1 says
   * "normalise heading levels" — this is what it is asking you to look at.
   */
  const levels = [...body.matchAll(/^(#{1,6})\s/gm)].map((m) => m[1].length);
  const jumps = levels.some((l, i) => i > 0 && l - levels[i - 1] > 1);
  const deepOnly = levels.length > 2 && !levels.includes(2) && levels.some((l) => l >= 4);
  if (jumps || deepOnly) flags.push('headings');

  /*
   * The script checks its own output for the failure it exists to prevent.
   * traps.md has the entry; turndown does not create these, but a source page
   * that genuinely lacked the space will carry it through, and either way it is
   * a line somebody has to read.
   */
  const prose = body
    /* A link TARGET is not prose. `goo.gl/uQxkSHWN…` matched the pattern on
       every page of a real capture — the detector was reading URL slugs. */
    .replace(/\]\([^)]*\)/g, ']')
    .replace(/https?:\/\/\S+/g, '')
    /* Nor is a code span, which is where identifiers legitimately live. */
    .replace(/`[^`]*`/g, '');

  const glued = [...prose.matchAll(/[a-z](?:https?:\/\/|[A-Z][a-z]{2,})/g)]
    .map((m) => m[0])
    .filter((s) => !/iPhone|YouTube|JavaScript|WordPress|PayPal|eBay|iPad|macOS/i.test(s));
  if (glued.length) flags.push(`glued:${glued.length}`);

  const yaml = [
    '---',
    `source: ${canonical || `/${slug === 'index' ? '' : slug + '/'}`}`,
    `title: ${JSON.stringify(h1 || seoTitle || slug)}`,
    seoTitle && seoTitle !== h1 ? `seoTitle: ${JSON.stringify(seoTitle)}` : null,
    `description: ${JSON.stringify(description)}`,
    ogImage ? `ogImage: ${JSON.stringify(portableSrc(ogImage))}` : null,
    images.length ? 'images:' : null,
    ...images.map((i) => `  - src: ${JSON.stringify(i.src)}\n    alt: ${JSON.stringify(i.alt)}`),
    '---',
    '',
  ].filter((l) => l !== null);

  writeFileSync(`${OUT}/${slug}.md`, `${yaml.join('\n')}\n${body}\n`);
  rows.push({ slug, words, images: images.length, from, flags });
}

/* ── Report ─────────────────────────────────────────────────────────────── */

const pad = Math.max(...rows.map((r) => r.slug.length));
for (const r of rows) {
  const mark = r.flags.length ? `${YELLOW}!${RESET}` : `${GREEN}✓${RESET}`;
  /* One flag per kind, with a count. Four images with filename alt text is one
     thing to fix, not four things to read. */
  const counted = [...r.flags.reduce((m, f) => m.set(f, (m.get(f) ?? 0) + 1), new Map())]
    .map(([f, n]) => (n > 1 ? `${f}×${n}` : f))
    .join(' ');
  console.log(
    `  ${mark} ${r.slug.padEnd(pad)}  ${String(r.words).padStart(5)} words  ` +
      `${String(r.images).padStart(3)} img  ${DIM}${counted}${RESET}`,
  );
}

const legend = {
  region: 'no <main> or <article> — extracted from <body>, check for leftover chrome',
  'no-h1': 'no <h1> found — the title fell back to <title> or the slug',
  thin: 'under 80 words — the page may be mostly a builder layout, or the capture is partial',
  'img-alt': 'at least one image had no alt text — write it, do not copy the filename',
  'alt-filename': 'alt text derived from the filename ("pic 11") — reads as described, says nothing',
  headings: 'heading levels jump or start deep — the builder used them as type styles, not structure',
  glued: 'run-together words, e.g. "AreasWe". traps.md has the entry — read these',
};
const seen = new Set(rows.flatMap((r) => r.flags.map((f) => f.split(':')[0])));
if (seen.size) {
  console.log(`\n  ${DIM}${'─'.repeat(56)}${RESET}`);
  for (const key of seen) if (legend[key]) console.log(`  ${DIM}${key.padEnd(8)} ${legend[key]}${RESET}`);
}

console.log(
  `\n${GREEN}✓${RESET} ${rows.length} page(s) → ${OUT}/  ` +
    `${DIM}${rows.reduce((n, r) => n + r.words, 0).toLocaleString()} words, ` +
    `${rows.reduce((n, r) => n + r.images, 0)} image(s)${RESET}`,
);
console.log(
  `  ${DIM}Not placed in src/content/ deliberately — what the collections are is a phase-2\n` +
    `  decision. Read these, then move what survives. build.md §2.${RESET}\n`,
);
