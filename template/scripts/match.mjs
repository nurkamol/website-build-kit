/**
 * Measure how faithfully the new site reproduces the old one — section by
 * section in pixels, and word by word in text. Exits non-zero past a threshold.
 *
 *   npm run match -- --old https://old-site.com --new https://new.example.com
 *   npm run match -- --old … --new … --only=/pricing/       # substring match, as shots
 *   npm run match -- --old … --new … --threshold=5          # % of a section's pixels, default 3
 *   npm run match -- --old … --new … --text-threshold=0.95  # share of words kept, default 0.98
 *   npm run match -- --old … --new … --viewports=mobile,desktop
 *   npm run match -- --old … --new … --text-only            # no browser: words + headings only
 *   npm run match -- --old … --new … --report-only          # write the report, always exit 0
 *   npm run match -- --old … --new … --json                 # the result on stdout, nothing else
 *
 * Writes shots/match/index.html (old | new | diff per section, worst first)
 * and shots/match/match.json. Reads both sites; writes to neither.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * `npm run shots` produces the pairs and a person looks at them. That catches
 * the page that came out obviously worse. It does not catch the one that came
 * out 6% different — a section 40px shorter, a paragraph gone from the middle
 * of a long page, a heading reworded — because two full-page screenshots side
 * by side are compared by an eye that is skimming, and a skimmed pair passes.
 * On a "faithful rebuild" that difference is the defect the client finds after
 * launch, and it was in the pairs the whole time.
 *
 * ── WHY SECTIONS AND NOT WHOLE PAGES ───────────────────────────────────────
 * A whole-page pixel diff fails everything below the first change: one section
 * 30px taller shifts every row under it, and the report says 60% different for
 * a page that is 98% right. So each page is cut into its top-level sections —
 * header, the content blocks a builder emits (or the children of <main>), and
 * footer — and each is paired with the section in the same position on the
 * other side and measured on its own. The page height ratio is reported
 * alongside, so a section that went missing entirely still shows up.
 *
 * ── THE NUMBERS ────────────────────────────────────────────────────────────
 * A pixel differs when its colour moves more than a perceptual (YIQ) distance
 * of 0.15 — anti-aliasing noise sits well under it, a changed background
 * does not. A section fails above 3% of its pixels, measured over the TALLER of
 * the two crops, so missing height counts as difference. 3% is the default a
 * sister migration kit settled on after real rebuilds: tight enough that a
 * reworded line or a changed button fails, loose enough that the same font
 * rasterised by the same browser passes. Text fails under 0.98 of the old
 * page's distinct words present on the new one. Both are flags.
 *
 * ── THE HARNESS IS SETTLED BEFORE THE IMAGE IS MEASURED ────────────────────
 * Everything that differs between two loads of the SAME page would be measured
 * as drift: a carousel mid-slide, a lazy image not yet in, a cookie banner over
 * the footer, a chat launcher in the corner, a video on a different frame. So
 * both sides get reduced motion, frozen animations and transitions, carousels
 * pinned to their first slide, videos paused at 0, banners and chat widgets
 * hidden (never accepted — clicking "accept" sets state on a site we do not
 * own), every lazy image forced eager and decoded, and fonts awaited.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { readInventory } from './lib/inventory.mjs';
import { routesFromSitemap } from './lib/routes.mjs';
import { compareHeadings, conservation, missingContext, OVERLAYS, pageContent } from './lib/page-text.mjs';

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

const OUT = 'shots/match';
const DEFAULT_LIMIT = 40;
const DEFAULT_THRESHOLD = 3; // % of a section's pixels
const DEFAULT_TEXT = 0.98; // share of the old page's distinct words
const PIXEL_DELTA = 0.15; // YIQ distance, as pixelmatch measures it
const MAX_SECTION = 6000; // px compared per section — a 20,000px "section" is a detection failure, not a section
const MAX_SHOT = 16384; // Chrome cannot rasterise past this; shots.mjs has the trap
const HEIGHT_WARN = 0.1; // page height ratio outside 0.9–1.1 is called out

/* Not pages — same list as shots. */
const NOT_A_PAGE = /\.(pdf|xml|txt|json|zip|gz|csv|ico|png|jpe?g|gif|webp|avif|svg|mp4|webm|woff2?)$/i;

/* Identifies the fetches for what they are. A person reading the old site's
   access log should be able to tell this was a comparison, not an attack. */
const UA_TOKEN = 'website-build-kit-match (read-only comparison)';

/* ── arguments ──────────────────────────────────────────────────────────── */

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name) => {
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : undefined;
};

const USAGE =
  'usage: npm run match -- --old https://old-site.com --new https://new.example.com\n' +
  '         [--only=/path/] [--threshold=3] [--text-threshold=0.98] [--viewports=mobile,tablet,desktop]\n' +
  '         [--text-only] [--report-only] [--json] [--limit=40]';

function usage(problem) {
  console.error(`${RED}✗${RESET} ${problem}\n\n${USAGE}`);
  process.exit(1);
}

const origin = (name) => {
  const raw = value(name);
  if (!raw) usage(`--${name} is required — match compares two sites, and needs both`);
  let u;
  try {
    u = new URL(raw);
  } catch {
    usage(`--${name} ${JSON.stringify(raw)} is not a URL`);
  }
  if (!/^https?:$/.test(u.protocol)) usage(`--${name} must be http(s), got ${u.protocol}`);
  return u.origin;
};

const OLD = origin('old');
const NEW = origin('new');
if (OLD === NEW) usage(`--old and --new are the same origin (${OLD}) — every page would match itself`);

const threshold = Number(value('threshold') ?? DEFAULT_THRESHOLD);
if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
  usage(`--threshold is a percentage of a section's pixels, 0–100 (got ${value('threshold')})`);
}
const textThreshold = Number(value('text-threshold') ?? DEFAULT_TEXT);
if (!Number.isFinite(textThreshold) || textThreshold < 0 || textThreshold > 1) {
  usage(`--text-threshold is a share of words, 0–1 (got ${value('text-threshold')})`);
}
const only = value('only') ?? '';
const limit = Number(value('limit') ?? DEFAULT_LIMIT) || DEFAULT_LIMIT;
const textOnly = flag('text-only');
const reportOnly = flag('report-only');
const asJson = flag('json');

const wanted = (value('viewports') ?? VIEWPORTS.map((v) => v.name).join(',')).split(',').map((s) => s.trim());
const unknown = wanted.filter((n) => !VIEWPORTS.some((v) => v.name === n));
if (unknown.length) usage(`unknown viewport ${unknown.join(', ')} — known: ${VIEWPORTS.map((v) => v.name).join(', ')}`);
const ACTIVE = VIEWPORTS.filter((v) => wanted.includes(v.name));

const log = asJson ? () => {} : (...a) => console.log(...a);

/* ── routes: the OLD site's inventory, as shots reads it ────────────────── */

let routes;
let routeSource;
const inventory = readInventory(readFileSync);
if (inventory) {
  routes = inventory.live.filter((p) => !NOT_A_PAGE.test(p));
  routeSource = 'recon/urls.txt — the old site, skipping lines tagged gone-on-old-site';
} else {
  /* No recon: the old site's own sitemap. NEVER the new site's — you would
     compare the pages you built and never the ones you dropped. */
  const fromSitemap = await routesFromSitemap(OLD, (u) => fetch(u, { headers: { 'user-agent': UA_TOKEN } }));
  routes = [...new Set(fromSitemap.map((u) => new URL(u).pathname))].filter((p) => !NOT_A_PAGE.test(p));
  routeSource = "the old site's sitemap (no recon/urls.txt)";
}

if (!routes.length) {
  usage(`no routes to compare — no recon/urls.txt and no sitemap on ${OLD}.\n  Run \`npm run recon -- ${OLD}\` first.`);
}

const matched = routes.filter((r) => !only || only.split(',').some((f) => r.includes(f.trim())));
if (!matched.length) usage(`no route matches --only=${only}. ${routes.length} known from ${routeSource}.`);
const ROUTES = matched.slice(0, limit);
const notCompared = matched.length - ROUTES.length;

log(`${BOLD}── Match: old → new ${'─'.repeat(40)}${RESET}`);
log(`  ${DIM}${OLD} → ${NEW}${RESET}`);
log(`  ${DIM}${ROUTES.length} route(s) from ${routeSource}${RESET}`);
log(
  textOnly
    ? `  ${DIM}text only — words kept ≥ ${textThreshold}, h1–h3 kept, one h1${RESET}`
    : `  ${DIM}${ACTIVE.map((v) => `${v.name} ${v.width}`).join(' · ')} — section fails above ${threshold}%, text under ${textThreshold}${RESET}`,
);
if (notCompared) {
  log(`  ${YELLOW}!${RESET} ${notCompared} route(s) beyond --limit=${limit} were NOT compared — a partial set that looks complete is the problem`);
}
log('');

/* ── slugs, one per path, never shared (shots has the reason) ───────────── */

const taken = new Set();
const slugFor = (route) => {
  const base = route === '/' ? 'home' : route.replace(/^\/|\/$/g, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'home';
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  taken.add(slug);
  return slug;
};

/* ?nobadge=1 on our own build only — the staging badge is on one side, and it
   would be measured as drift. On the old site it is a cache-buster. */
const newUrl = (route) => `${NEW}${route}${route.includes('?') ? '&' : '?'}nobadge=1`;
const oldUrl = (route) => `${OLD}${route}`;

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── text ───────────────────────────────────────────────────────────────── */

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA_TOKEN, accept: 'text/html' }, redirect: 'follow' });
  const html = await res.text();
  return { status: res.status, final: res.url, html };
}

function compareText(oldHtml, newHtml, source) {
  const a = pageContent(oldHtml);
  const b = pageContent(newHtml);
  const c = conservation(a.text, b.text);
  const headings = compareHeadings(a, b);
  return {
    source,
    ratio: Number(c.ratio.toFixed(4)),
    words: c.words,
    missing: c.missing,
    context: missingContext(a.text, c.missing),
    headings,
  };
}

/* ── the browser half ───────────────────────────────────────────────────── */

const FREEZE = `
*, *::before, *::after {
  animation-duration: 0s !important; animation-delay: 0s !important; animation-iteration-count: 1 !important;
  transition-duration: 0s !important; transition-delay: 0s !important;
  caret-color: transparent !important; scroll-behavior: auto !important;
}
/* Carousels pinned to their first slide on both sides. A slider mid-move is the harness, not the site. */
.swiper-wrapper, .slick-track, .flickity-slider, .splide__list, .owl-stage, .glide__slides, .carousel-inner {
  transform: none !important; transition: none !important;
}
${OVERLAYS.join(', ')} { display: none !important; }`;

/* Runs in the page. Walks it to fire lazy loading, then settles everything that moves. */
async function settleInPage() {
  for (const img of document.images) if (img.loading === 'lazy') img.loading = 'eager';
  const step = Math.max(200, Math.floor(window.innerHeight * 0.8));
  for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 100));
  }
  window.scrollTo(0, 0);
  await document.fonts?.ready;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline && [...document.images].some((i) => i.getAttribute('src') && !i.complete)) {
    await new Promise((r) => setTimeout(r, 200));
  }
  await Promise.all([...document.images].map((i) => (i.complete && i.naturalWidth ? i.decode().catch(() => {}) : null)));
  for (const v of document.querySelectorAll('video')) {
    v.pause();
    try {
      v.currentTime = 0;
    } catch {}
  }
  for (const m of document.querySelectorAll('marquee')) m.stop?.();
  await new Promise((r) => setTimeout(r, 300));
}

/*
 * Runs in the page. The top-level sections, in order, with page coordinates.
 *
 * Builder markup first, because a builder says where its rows are and the
 * children of a wrapper div do not. If the builder's rows cover too little of
 * the page — Gutenberg puts plain paragraphs between its groups — the generic
 * reading wins: the visible children of <main>, unwrapping single wrappers.
 */
function sectionsInPage() {
  const HEADER = 'header, [role=banner], #header-outer, #masthead, .site-header, #brx-header, .elementor-location-header, #main-header, .et-l--header';
  const FOOTER = 'footer, [role=contentinfo], #footer-outer, #colophon, .site-footer, #brx-footer, .elementor-location-footer, #main-footer, .et-l--footer';
  const BUILDERS = [
    '.wpb_row', // WPBakery / Salient
    '.et_pb_section', // Divi
    '.elementor-top-section, .e-con.e-parent', // Elementor
    '#brx-content > [class*="brxe-"]', // Bricks
    '.entry-content > .alignfull, .entry-content > .wp-block-group, .entry-content > .wp-block-cover', // Gutenberg
  ];
  const sy = window.scrollY;
  const shown = (el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && r.height >= 8 && r.width > 0;
  };
  const inContent = (el) => !!el.parentElement?.closest('main, article');
  const outermost = (sel) => {
    const all = [...document.querySelectorAll(sel)].filter((el) => shown(el) && !inContent(el));
    return all.find((el) => !all.some((o) => o !== el && o.contains(el))) ?? null;
  };
  const header = outermost(HEADER);
  const footers = [...document.querySelectorAll(FOOTER)].filter((el) => shown(el) && !inContent(el));
  const footer = footers.filter((el) => !footers.some((o) => o !== el && o.contains(el))).pop() ?? null;
  const chrome = (el) => (header && (el === header || header.contains(el))) || (footer && (el === footer || footer.contains(el)));

  const title = (el) => {
    const h = el.querySelector('h1, h2, h3, h4');
    return (h?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 48);
  };
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { y: Math.round(r.top + sy), height: Math.round(r.height), title: title(el) };
  };

  const root = document.querySelector('main, [role=main]') ?? document.body;
  const rootHeight = root.getBoundingClientRect().height || 1;

  let method = 'builder';
  let content = BUILDERS.flatMap((sel) => [...document.querySelectorAll(sel)]).filter((el) => shown(el) && !chrome(el));
  content = content.filter((el) => !content.some((o) => o !== el && o.contains(el)));
  const covered = content.reduce((n, el) => n + el.getBoundingClientRect().height, 0);
  if (!content.length || covered < rootHeight * 0.6) {
    method = 'generic';
    const SKIP = new Set(['SCRIPT', 'STYLE', 'LINK', 'NOSCRIPT', 'TEMPLATE', 'META']);
    const expand = (el) =>
      [...el.children].flatMap((c) => {
        if (SKIP.has(c.tagName) || !shown(c)) return [];
        if (c === header || c === footer) return [];
        if ((header && c.contains(header)) || (footer && c.contains(footer))) return expand(c);
        return [c];
      });
    let level = expand(root);
    /* A single wrapper is not a section; its children are. */
    while (level.length === 1 && level[0].children.length > 1) {
      const inner = expand(level[0]);
      if (!inner.length) break;
      level = inner;
    }
    content = level.filter((el) => getComputedStyle(el).position !== 'fixed');
  }
  content.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));

  const out = [];
  if (header) out.push({ key: 'header', label: 'header', ...box(header) });
  content.forEach((el, i) => out.push({ key: `s${i + 1}`, label: `section ${i + 1}`, ...box(el) }));
  if (footer) out.push({ key: 'footer', label: 'footer', ...box(footer) });

  /* Sideways scroll, and the outermost element causing it — "it overflows" without a culprit is an afternoon. */
  const edge = document.documentElement.clientWidth;
  const overflowX = Math.max(0, document.documentElement.scrollWidth - edge);
  let overflowBy = '';
  if (overflowX > 1) {
    const name = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${[...el.classList].slice(0, 2).map((c) => `.${c}`).join('')}`;
    const find = (el) => {
      for (const c of el.children) {
        if (!shown(c)) continue;
        if (c.getBoundingClientRect().right - edge > 1) return c;
        const inner = find(c);
        if (inner) return inner;
      }
      return null;
    };
    const hit = find(document.body);
    if (hit) overflowBy = `${name(hit)} +${Math.round(hit.getBoundingClientRect().right - edge)}px`;
  }

  return {
    method,
    sections: out.filter((s) => s.height > 0),
    height: document.documentElement.scrollHeight,
    overflowX,
    overflowBy,
    background: getComputedStyle(document.body).backgroundColor,
  };
}

async function capture(page, url, viewport, wantHtml) {
  await page.setViewport({
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    isMobile: viewport.name === 'mobile',
    hasTouch: viewport.name === 'mobile',
  });
  const res = await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  const status = res?.status() ?? 0;
  if (status >= 400) return { status, final: page.url() };
  await page.addStyleTag({ content: FREEZE });
  await page.evaluate(settleInPage);
  const shape = await page.evaluate(sectionsInPage);
  const height = Math.min(shape.height, MAX_SHOT);
  const png = await page.screenshot(
    shape.height <= MAX_SHOT
      ? { fullPage: true, type: 'png' }
      : { clip: { x: 0, y: 0, width: viewport.width, height }, captureBeyondViewport: true, type: 'png' },
  );
  const html = wantHtml ? await page.content() : null;
  return { status, final: page.url(), png, html, truncated: shape.height > MAX_SHOT, ...shape };
}

/* ── pixels ─────────────────────────────────────────────────────────────── */

let sharp;
async function raw(png) {
  sharp ??= (await import('sharp')).default;
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Rows y..y+h of an RGB image, at a given width (cropped or rescaled to it). */
async function cut(img, y, h, width) {
  const top = Math.max(0, Math.min(y, img.height));
  const rows = Math.max(0, Math.min(h, img.height - top));
  const w = Math.min(img.width, width);
  const out = Buffer.alloc(w * rows * 3);
  for (let r = 0; r < rows; r++) img.data.copy(out, r * w * 3, ((top + r) * img.width) * 3, ((top + r) * img.width + w) * 3);
  if (w === width || !rows) return { data: out, width: w, height: rows };
  /* Different widths: rescale to the common one so a column lines up with a column. */
  const scaled = await sharp(out, { raw: { width: w, height: rows, channels: 3 } })
    .resize({ width })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: scaled.data, width: scaled.info.width, height: scaled.info.height };
}

const MAX_DELTA = 35215 * PIXEL_DELTA * PIXEL_DELTA;
function differs(a, i, b, j) {
  const dr = a[i] - b[j];
  const dg = a[i + 1] - b[j + 1];
  const db = a[i + 2] - b[j + 2];
  if (!dr && !dg && !db) return false;
  const y = dr * 0.29889531 + dg * 0.58662247 + db * 0.11448223;
  const iq = dr * 0.59597799 - dg * 0.2741761 - db * 0.32180189;
  const q = dr * 0.21147017 - dg * 0.52261711 + db * 0.31114694;
  return 0.5053 * y * y + 0.299 * iq * iq + 0.1957 * q * q > MAX_DELTA;
}

/**
 * Compare two crops over the taller of the two, so a section that lost height
 * is different by exactly the rows it lost. Returns the mismatch and a diff
 * image: differing pixels red, the rest a faded copy of the old side.
 */
function diff(a, b) {
  const w = Math.min(a.width, b.width);
  const h = Math.min(Math.max(a.height, b.height), MAX_SECTION);
  const out = Buffer.alloc(w * h * 3);
  let n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3;
      const inA = y < a.height;
      const inB = y < b.height;
      const ia = (y * a.width + x) * 3;
      const ib = (y * b.width + x) * 3;
      const bad = inA !== inB || (inA && differs(a.data, ia, b.data, ib));
      if (bad) {
        n++;
        out[o] = 230;
        out[o + 1] = 0;
        out[o + 2] = 0;
      } else {
        const src = inA ? a.data : b.data;
        const at = inA ? ia : ib;
        const lum = src[at] * 0.299 + src[at + 1] * 0.587 + src[at + 2] * 0.114;
        const faded = Math.round(255 - (255 - lum) * 0.25);
        out[o] = out[o + 1] = out[o + 2] = faded;
      }
    }
  }
  return { percent: w * h ? (n / (w * h)) * 100 : 0, image: { data: out, width: w, height: h } };
}

async function writePng(img, file) {
  if (!img.width || !img.height) return null;
  await sharp(img.data, { raw: { width: img.width, height: img.height, channels: 3 } }).png().toFile(join(OUT, file));
  return file;
}

/** Pair sections by role and position: header↔header, section n↔section n, footer↔footer. */
function pairSections(oldShape, newShape) {
  const keys = [...new Set([...oldShape.sections, ...newShape.sections].map((s) => s.key))];
  const order = (k) => (k === 'header' ? -1 : k === 'footer' ? 1e6 : Number(k.slice(1)));
  return keys
    .sort((x, y) => order(x) - order(y))
    .map((k) => ({ key: k, old: oldShape.sections.find((s) => s.key === k), new: newShape.sections.find((s) => s.key === k) }));
}

async function compareViewport(slug, viewport, a, b) {
  const imgA = await raw(a.png);
  const imgB = await raw(b.png);
  const width = Math.min(imgA.width, imgB.width);
  /* No sections found on either side: the whole page is the one section. A
     comparison that silently compared nothing would read as a pass. */
  const shapeA = a.sections.length ? a : { ...a, sections: [{ key: 's1', label: 'whole page', y: 0, height: imgA.height, title: '' }] };
  const shapeB = b.sections.length ? b : { ...b, sections: [{ key: 's1', label: 'whole page', y: 0, height: imgB.height, title: '' }] };
  const sections = [];
  let k = 0;
  for (const pair of pairSections(shapeA, shapeB)) {
    const label = (pair.old ?? pair.new).label;
    const title = pair.old?.title || pair.new?.title || '';
    if (!pair.old || !pair.new) {
      sections.push({
        label,
        title,
        percent: 100,
        oldHeight: pair.old?.height ?? 0,
        newHeight: pair.new?.height ?? 0,
        note: pair.old ? 'not found on the new site' : 'only on the new site',
      });
      continue;
    }
    const ca = await cut(imgA, pair.old.y, Math.min(pair.old.height, MAX_SECTION), width);
    const cb = await cut(imgB, pair.new.y, Math.min(pair.new.height, MAX_SECTION), width);
    const d = diff(ca, cb);
    const base = `${slug}/${viewport.name}/${String(++k).padStart(2, '0')}`;
    mkdirSync(join(OUT, slug, viewport.name), { recursive: true });
    sections.push({
      label,
      title,
      percent: Number(d.percent.toFixed(2)),
      oldHeight: pair.old.height,
      newHeight: pair.new.height,
      files: {
        old: await writePng(ca, `${base}-old.png`),
        new: await writePng(cb, `${base}-new.png`),
        diff: await writePng(d.image, `${base}-diff.png`),
      },
    });
  }
  sections.sort((x, y) => y.percent - x.percent);
  return {
    name: viewport.name,
    width: viewport.width,
    oldHeight: a.height,
    newHeight: b.height,
    heightRatio: Number((b.height / (a.height || 1)).toFixed(3)),
    oldSections: a.sections.length,
    newSections: b.sections.length,
    method: { old: a.method, new: b.method },
    overflowX: b.overflowX,
    overflowBy: b.overflowBy,
    truncated: a.truncated || b.truncated,
    sections,
  };
}

/* ── run ────────────────────────────────────────────────────────────────── */

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const results = [];
const failures = [];
const fail = (route, viewport, section, kind, detail) => failures.push({ route, viewport, section, kind, detail });

let browser = null;
let page = null;
if (!textOnly) {
  const puppeteer = (await import('puppeteer')).default;
  browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  page = await browser.newPage();
  await page.setBypassCSP(true); // the freeze stylesheet is inline, and a strict CSP would refuse it
  await page.setUserAgent(`${await browser.userAgent()} ${UA_TOKEN}`);
  await page.emulateMediaFeatures([
    { name: 'prefers-reduced-motion', value: 'reduce' },
    { name: 'prefers-color-scheme', value: 'light' },
  ]);
}

try {
  for (const route of ROUTES) {
    const slug = slugFor(route);
    const row = { route, slug, viewports: [], text: null };
    results.push(row);

    if (textOnly) {
      try {
        const a = await fetchHtml(oldUrl(route));
        await pause(250);
        const b = await fetchHtml(newUrl(route));
        Object.assign(row, { oldStatus: a.status, newStatus: b.status, oldFinal: a.final, newFinal: b.final.replace(/[?&]nobadge=1/, '') });
        if (a.status >= 400) {
          row.skipped = `HTTP ${a.status} on the old site`;
        } else if (b.status >= 400) {
          fail(route, null, null, 'missing', `HTTP ${b.status} on the new site`);
        } else {
          row.text = compareText(a.html, b.html, 'fetched HTML');
        }
      } catch (e) {
        fail(route, null, null, 'error', e.message);
      }
    } else {
      let htmlPair = null;
      for (const viewport of ACTIVE) {
        try {
          await pause(250);
          const a = await capture(page, oldUrl(route), viewport, !htmlPair);
          row.oldStatus = a.status;
          row.oldFinal = a.final;
          if (a.status >= 400) {
            row.skipped = `HTTP ${a.status} on the old site`;
            break;
          }
          const b = await capture(page, newUrl(route), viewport, !htmlPair);
          row.newStatus = b.status;
          row.newFinal = b.final.replace(/[?&]nobadge=1/, '');
          if (b.status >= 400) {
            fail(route, null, null, 'missing', `HTTP ${b.status} on the new site`);
            break;
          }
          /* The same refusal shots makes: an unstyled capture measures the
             harness, and filed as a 90% drift it becomes a design argument. */
          for (const [side, s] of [['old', a], ['new', b]]) {
            if (s.background === 'rgba(0, 0, 0, 0)') throw new Error(`${side} side: body has no background — stylesheet did not arrive`);
          }
          if (!htmlPair) htmlPair = [a.html, b.html];
          row.viewports.push(await compareViewport(slug, viewport, a, b));
        } catch (e) {
          row.viewports.push({ name: viewport.name, width: viewport.width, error: e.message, sections: [] });
          fail(route, viewport.name, null, 'error', e.message);
        }
      }
      if (htmlPair) row.text = compareText(htmlPair[0], htmlPair[1], 'rendered DOM');
    }

    /* ── verdicts for this route ── */
    for (const v of row.viewports) {
      if (v.error) continue;
      for (const s of v.sections) {
        if (s.percent > threshold) {
          fail(route, v.name, s.label, 'visual', `${s.percent}% different${s.note ? ` — ${s.note}` : ''}${s.title ? ` “${s.title}”` : ''}`);
        }
      }
      if (v.overflowX > 1) fail(route, v.name, null, 'overflow', `scrolls sideways by ${v.overflowX}px${v.overflowBy ? ` (${v.overflowBy})` : ''}`);
    }
    if (row.text) {
      const t = row.text;
      if (t.ratio < textThreshold) {
        fail(route, null, null, 'text', `${(t.ratio * 100).toFixed(1)}% of words kept — missing: ${t.missing.slice(0, 12).join(', ')}`);
      }
      if (t.headings.missing.length) fail(route, null, null, 'headings', `missing: ${t.headings.missing.map((h) => `“${h}”`).join(', ')}`);
      if (t.headings.h1Count !== 1) fail(route, null, null, 'headings', `${t.headings.h1Count} <h1> on the new page — wanted exactly one`);
    }

    const mine = failures.filter((f) => f.route === route);
    const mark = row.skipped ? `${YELLOW}–${RESET}` : mine.length ? `${RED}✗${RESET}` : `${GREEN}✓${RESET}`;
    const worst = row.viewports.flatMap((v) => v.sections ?? []).reduce((m, s) => Math.max(m, s.percent), 0);
    const bits = [
      row.skipped ?? '',
      row.text ? `text ${(row.text.ratio * 100).toFixed(1)}%` : '',
      row.viewports.length ? `worst section ${worst.toFixed(1)}%` : '',
    ].filter(Boolean);
    log(`  ${mark} ${route}  ${DIM}${bits.join(' · ')}${RESET}`);
  }
} finally {
  await browser?.close();
}

/* ── report ─────────────────────────────────────────────────────────────── */

const passed = failures.length === 0;
const result = {
  old: OLD,
  new: NEW,
  ranAt: new Date().toISOString(),
  mode: textOnly ? 'text-only' : 'visual+text',
  thresholds: { sectionPercent: threshold, textRatio: textThreshold, pixelDelta: PIXEL_DELTA },
  viewports: textOnly ? [] : ACTIVE,
  routeSource,
  notCompared,
  passed,
  failures,
  routes: results,
};

writeFileSync(join(OUT, 'match.json'), JSON.stringify(result, null, 2) + '\n');
writeFileSync(join(OUT, 'index.html'), report(result));

if (asJson) {
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} else {
  const skipped = results.filter((r) => r.skipped);
  if (skipped.length) {
    log(`\n  ${YELLOW}!${RESET} ${skipped.length} route(s) not compared — the old site did not serve a page:`);
    for (const r of skipped) log(`      ${DIM}${r.route} (${r.skipped})${RESET}`);
  }
  if (failures.length) {
    log(`\n${RED}✗ ${failures.length} difference(s) past the threshold${RESET}`);
    for (const f of failures) {
      const where = [f.route, f.viewport, f.section].filter(Boolean).join(' · ');
      log(`  ${RED}✗${RESET} ${where} — ${f.kind}: ${f.detail}`);
    }
    for (const r of results.filter((x) => x.text?.context.length)) {
      log(`\n  ${DIM}${r.route} — where the missing words were on the old page:${RESET}`);
      for (const c of r.text.context) log(`      ${DIM}${c.word}: ${c.context}${RESET}`);
    }
    log(`\n  ${DIM}report: ${OUT}/index.html${reportOnly ? ' · --report-only, so exiting 0' : ''}${RESET}\n`);
  } else {
    log(`\n${GREEN}✓ every compared section within ${threshold}% and every page's text kept${RESET}`);
    log(`  ${DIM}report: ${OUT}/index.html${RESET}\n`);
  }
}

process.exit(failures.length && !reportOnly ? 1 : 0);

/*
 * The report. Self-contained: inline styles, images beside it in shots/match/,
 * nothing fetched. Deliberately plain — a working artefact, not a page the site
 * ships, and a styled one would be a design decision living in the template.
 */
function report(r) {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const pct = (n) => `${Number(n).toFixed(2)}%`;
  const over = (s) => s.percent > r.thresholds.sectionPercent;

  const failList = r.failures.length
    ? `<ul class="fails">${r.failures
        .map((f) => `<li><a href="#${esc(slugOf(f.route))}">${esc([f.route, f.viewport, f.section].filter(Boolean).join(' · '))}</a> — ${esc(f.kind)}: ${esc(f.detail)}</li>`)
        .join('')}</ul>`
    : '<p class="ok">Nothing past the thresholds.</p>';

  function slugOf(route) {
    return r.routes.find((x) => x.route === route)?.slug ?? '';
  }

  const textBlock = (t) => {
    if (!t) return '';
    const bad = t.ratio < r.thresholds.textRatio;
    return `<div class="text ${bad ? 'bad' : ''}">
      <h3>Text — ${(t.ratio * 100).toFixed(1)}% of ${t.words} distinct words kept <small>(${esc(t.source)}, chrome removed)</small></h3>
      ${t.missing.length ? `<p>Missing (${t.missing.length}): ${t.missing.slice(0, 60).map((w) => `<code>${esc(w)}</code>`).join(' ')}</p>` : ''}
      ${t.context.length ? `<ul>${t.context.map((c) => `<li><b>${esc(c.word)}</b> ${esc(c.context)}</li>`).join('')}</ul>` : ''}
      <p>Headings: ${t.headings.missing.length ? `missing ${t.headings.missing.map((h) => `“${esc(h)}”`).join(', ')}` : 'every old h1–h3 present'} · ${t.headings.h1Count} &lt;h1&gt; on the new page</p>
    </div>`;
  };

  const sectionRow = (s) => `<figure class="sec ${over(s) ? 'bad' : ''}">
      <figcaption><b>${esc(s.label)}</b>${s.title ? ` “${esc(s.title)}”` : ''} — <b>${pct(s.percent)}</b> · ${s.oldHeight}px → ${s.newHeight}px${s.note ? ` · ${esc(s.note)}` : ''}</figcaption>
      ${s.files ? `<div class="three">
        <a href="${esc(s.files.old)}"><img loading="lazy" src="${esc(s.files.old)}" alt="old: ${esc(s.label)}"></a>
        <a href="${esc(s.files.new)}"><img loading="lazy" src="${esc(s.files.new)}" alt="new: ${esc(s.label)}"></a>
        <a href="${esc(s.files.diff)}"><img loading="lazy" src="${esc(s.files.diff)}" alt="difference: ${esc(s.label)}"></a>
      </div>` : ''}
    </figure>`;

  const viewportBlock = (v) => {
    if (v.error) return `<div class="vp bad"><h3>${esc(v.name)} · ${v.width}px</h3><p>Not compared — ${esc(v.error)}</p></div>`;
    const off = Math.abs(1 - v.heightRatio) > HEIGHT_WARN;
    const worst = v.sections.some(over);
    return `<details class="vp" ${worst || v.overflowX > 1 ? 'open' : ''}>
      <summary><b>${esc(v.name)} · ${v.width}px</b> — worst ${pct(v.sections[0]?.percent ?? 0)} ·
        height ${v.oldHeight}px → ${v.newHeight}px (<span class="${off ? 'warn' : ''}">×${v.heightRatio}</span>) ·
        sections ${v.oldSections} → ${v.newSections}${v.overflowX > 1 ? ` · <span class="warn">scrolls sideways ${v.overflowX}px ${esc(v.overflowBy)}</span>` : ''}${v.truncated ? ' · capped at 16384px' : ''}</summary>
      <p class="cols"><span>old</span><span>new</span><span>difference</span></p>
      ${v.sections.map(sectionRow).join('\n')}
    </details>`;
  };

  const routeBlock = (x) => `<section id="${esc(x.slug)}">
    <h2><code>${esc(x.route)}</code>${x.skipped ? ` <small>— ${esc(x.skipped)}</small>` : ''}</h2>
    ${x.newFinal && new URL(x.newFinal).pathname !== x.route ? `<p class="note">new site redirected to ${esc(new URL(x.newFinal).pathname)}</p>` : ''}
    ${textBlock(x.text)}
    ${x.viewports.map(viewportBlock).join('\n')}
  </section>`;

  /* Worst routes first, so the report is read in the order it should be fixed. */
  const score = (x) => (x.skipped ? -1 : Math.max(0, ...x.viewports.flatMap((v) => (v.sections ?? []).map((s) => s.percent))) + (x.text ? (1 - x.text.ratio) * 100 : 0));
  const ordered = [...r.routes].sort((a, b) => score(b) - score(a));

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Match report</title>
<style>
  body { font: 15px/1.5 system-ui, sans-serif; margin: 0 auto; padding: 2rem 1rem; max-width: 90rem; color: rgb(26, 26, 26); background: rgb(255, 255, 255); }
  header p, small, .note { color: rgb(85, 85, 85); }
  section { border-top: 1px solid rgb(221, 221, 221); padding-top: 1.5rem; margin-top: 2.5rem; }
  h2 { font-size: 1.05rem; } h3 { font-size: .9rem; margin: .5rem 0; }
  .bad > h3, .bad figcaption b:last-of-type, .fails li, .warn { color: rgb(180, 0, 0); }
  .ok { color: rgb(0, 110, 0); }
  details.vp { margin: 1rem 0; } summary { cursor: pointer; }
  .cols, .three { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .75rem; align-items: start; }
  .cols { font-size: .75rem; color: rgb(102, 102, 102); text-transform: uppercase; letter-spacing: .05em; margin: .5rem 0 0; }
  figure.sec { margin: 1rem 0; }
  figcaption { font-size: .85rem; margin-bottom: .35rem; }
  img { width: 100%; height: auto; border: 1px solid rgb(221, 221, 221); display: block; }
  code { background: rgb(242, 242, 242); padding: 0 .25rem; }
  @media (max-width: 40rem) { .cols { display: none; } .three { grid-template-columns: 1fr; } }
</style></head><body>
<header>
  <h1>Match report</h1>
  <p><b>old</b> ${esc(r.old)} → <b>new</b> ${esc(r.new)} · ${esc(r.ranAt.slice(0, 16).replace('T', ' '))} UTC · ${esc(r.mode)}</p>
  <p>Section fails above ${r.thresholds.sectionPercent}% of its pixels (YIQ distance ${r.thresholds.pixelDelta}); text fails under ${r.thresholds.textRatio} of the old page's distinct words.
     Routes from ${esc(r.routeSource)}${r.notCompared ? ` — <b>${r.notCompared} route(s) beyond --limit not compared</b>` : ''}.
     Animations frozen, carousels on their first slide, cookie banners and chat widgets hidden, light scheme, reduced motion.</p>
  <h2>${r.passed ? 'Passed' : `${r.failures.length} difference(s) past the threshold`}</h2>
  ${failList}
</header>
${ordered.map(routeBlock).join('\n')}
</body></html>
`;
}
