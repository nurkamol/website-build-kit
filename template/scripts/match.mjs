/**
 * Measure how faithfully the new site reproduces the old one — section by
 * section in pixels, and word by word in text. Exits non-zero past a threshold.
 *
 *   npm run match -- --old https://old-site.com --new https://new.example.com
 *   npm run match -- --old … --new … --only=/pricing/       # substring match, as shots; `--only /pricing/` and `--only=/a/,/b/` too
 *   npm run match -- --old … --new … --threshold=5          # % of a section's pixels, default 3
 *   npm run match -- --old … --new … --text-threshold=0.95  # share of words kept, default 0.98
 *   npm run match -- --old … --new … --viewports=mobile,desktop
 *   npm run match -- --old … --new … --text-only            # no browser: words + headings only
 *   npm run match -- --old … --new … --report-only          # write the report, exit 0 (unless the run did not finish)
 *   npm run match -- --old … --new … --json                 # the result on stdout, nothing else
 *   npm run match -- --old … --new … --timeout=90           # s per browser call before it counts as hung
 *   npm run match -- --old … --new … --concurrency=3        # pages captured at once, 1–6, one browser
 *   npm run match -- --old … --new … --budget=20            # minutes for the whole run, then stop and say so
 *   npm run match -- --old … --new … --refresh-old          # recapture the old site instead of using the cache
 *   npm run match -- --old … --new … --no-states            # static sections only: no scrolled header, menu, dropdowns
 *
 *   The tuning loop — edit, save, see the numbers move — against `astro dev`:
 *   npm run match -- --old https://old-site.com --new http://localhost:4321 --only=/about/ --watch
 *
 * ⚠ FLAGS GO AFTER THE `--`. `npm run match --only=/about/ -- --old …` hands
 *   `--only` to npm, which keeps it for itself (it is one of npm's own options)
 *   and passes nothing on — the run then compares every route and looks fine.
 *   The header line therefore always says which routes the filter selected.
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
 * own), every lazy image forced eager and decoded, and fonts awaited. FREEZE_LIST
 * below has the part of that which is not CSS, and why it exists.
 *
 * ── INTERACTION STATES ARE PART OF THE PAGE ────────────────────────────────
 * A rebuild that matches every static section can still have a header that
 * does nothing on scroll, a menu that opens as a different panel, or a
 * dropdown that lost its mega-menu. Those are what a client touches first. So
 * on the first compared route, per viewport, both sides are also photographed
 * with the header scrolled 600px, with the menu toggle opened, and (desktop)
 * with each top-level nav item that has a submenu hovered. They are reported as
 * `state: …` sections, under the same thresholds. Each side's toggle and
 * dropdowns are found independently; a state one side has and the other does
 * not is reported, never a crash. `--no-states` skips them.
 *
 * ── WHY THE OLD SIDE IS CACHED AND THE NEW ONE NEVER IS ────────────────────
 * The old site does not change during a rebuild, and capturing it is half of
 * every run — over a real network, through a WordPress page cache, at three
 * widths. A 6-page site took long enough that it stopped being run after each
 * change, which is the only time it is useful. So each old capture (section
 * crops, their shape, the states, the rendered HTML) is kept in
 * shots/match/.cache/old/, keyed by URL, viewport and HARNESS_VERSION, and
 * reused for 7 days. `--refresh-old` recaptures. The new side is what is
 * being changed; caching it would measure the last build instead of this one.
 * Bump HARNESS_VERSION whenever capture() would photograph the same page
 * differently, or a cached old side is compared with a new side settled by
 * different rules — and that difference is measured as drift.
 *
 * ── NOTHING RUNS UNBOUNDED ─────────────────────────────────────────────────
 * Every browser call has --timeout. The whole run has --budget (20 minutes):
 * past it, captures in flight are abandoned, the report is written with what
 * finished and the rest named, and the exit code is 1 even under
 * --report-only — an incomplete comparison is not a pass. A run sat for hours
 * once with full-headless Chrome producing no frames while the display slept;
 * chrome-headless-shell fixed the cause, the budget makes sure the next cause
 * nobody has met yet is a message rather than a hang.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, watch as fsWatch, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { COLLECTORS, HEADER_SEL, TOGGLES } from './lib/capture-rules.mjs';
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
const CACHE = join(OUT, '.cache', 'old');
/* Part of every cache key. Bump it when capture() would photograph the same page differently. */
const HARNESS_VERSION = 'match-4';
const CACHE_MAX_AGE_MS = 7 * 24 * 3600 * 1000;
const DEFAULT_LIMIT = 40;
const DEFAULT_THRESHOLD = 3; // % of a section's pixels
const DEFAULT_TEXT = 0.98; // share of the old page's distinct words
const PIXEL_DELTA = 0.15; // YIQ distance, as pixelmatch measures it
const MAX_SECTION = 6000; // px compared per section — a 20,000px "section" is a detection failure, not a section
const MAX_PAGE = 30000; // px captured per page. Far taller is almost always broken: a stylesheet that failed leaves full-height backgrounds unbounded
const DEFAULT_TIMEOUT = 90; // s per browser call before it counts as hung
const DEFAULT_CONCURRENCY = 3; // pages at once. Each is a renderer; past ~6 a laptop swaps and everything gets slower
const MAX_CONCURRENCY = 6;
const DEFAULT_BUDGET = 20; // minutes for the whole run
const HEIGHT_WARN = 0.1; // page height ratio outside 0.9–1.1 is called out
const SCROLLED_BY = 600; // px — the header state after scrolling
const MAX_DROPDOWNS = 8; // top-level nav items hovered per side

/* Not pages — same list as shots. */
const NOT_A_PAGE = /\.(pdf|xml|kml|kmz|rss|atom|txt|json|zip|gz|csv|ico|png|jpe?g|gif|webp|avif|svg|mp4|webm|woff2?)$/i;

/* Identifies the fetches for what they are. A person reading the old site's
   access log should be able to tell this was a comparison, not an attack. */
const UA_TOKEN = 'website-build-kit-match (read-only comparison)';

/* ── arguments ──────────────────────────────────────────────────────────── */

const argv = process.argv.slice(2);
const VALUE_FLAGS = ['old', 'new', 'only', 'threshold', 'text-threshold', 'viewports', 'limit', 'timeout', 'concurrency', 'budget'];
const BOOL_FLAGS = ['text-only', 'report-only', 'json', 'refresh-old', 'no-states', 'watch'];

const USAGE =
  'usage: npm run match -- --old https://old-site.com --new https://new.example.com\n' +
  '         [--only=/path/[,/other/]] [--threshold=3] [--text-threshold=0.98] [--viewports=mobile,tablet,desktop]\n' +
  '         [--text-only] [--report-only] [--json] [--limit=40] [--timeout=90]\n' +
  '         [--concurrency=3] [--budget=20] [--refresh-old] [--no-states] [--watch]';

function usage(problem) {
  console.error(`${RED}✗${RESET} ${problem}\n\n${USAGE}`);
  process.exit(1);
}

/*
 * ⚠ AN UNKNOWN OR VALUELESS FLAG IS AN ERROR, NOT A NO-OP. `--only` with no
 *   value after it (`--only --watch`, or `--only` last) used to read as "no
 *   filter" and compared every route; so did a typo like `--onyl=/about/`.
 *   Both look exactly like a run that worked.
 */
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) {
    const prev = argv[i - 1] ?? '';
    if (!(prev.startsWith('--') && !prev.includes('=') && VALUE_FLAGS.includes(prev.slice(2)))) {
      usage(`unexpected argument ${JSON.stringify(a)} — flags are --name=value or --name value`);
    }
    continue;
  }
  const name = a.slice(2).split('=')[0];
  if (!VALUE_FLAGS.includes(name) && !BOOL_FLAGS.includes(name)) usage(`unknown flag --${name}`);
  if (VALUE_FLAGS.includes(name)) {
    const v = a.includes('=') ? a.slice(a.indexOf('=') + 1) : argv[i + 1];
    if (!v || (!a.includes('=') && v.startsWith('--'))) usage(`--${name} needs a value`);
  }
}

/* A flag npm swallowed because it came before the `--`. npm exports flags it
   does not know as npm_config_*, so those are recovered (and said so); npm's
   own options — `--only` is one — are not exported at all, hence the warning. */
const swallowed = [];
const fromNpm = (name) => {
  const v = process.env[`npm_config_${name.replace(/-/g, '_')}`];
  if (v !== undefined && v !== '') swallowed.push(name);
  return v;
};
const flag = (name) => argv.includes(`--${name}`) || fromNpm(name) === 'true';
const value = (name) => {
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = argv.indexOf(`--${name}`);
  if (i !== -1) return argv[i + 1];
  return name === 'old' || name === 'new' ? undefined : fromNpm(name);
};

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
/* Comma or whitespace separated: `--only=/a/,/b/`, `--only "/a/ /b/"`. */
const onlyRaw = value('only') ?? '';
const onlyList = onlyRaw.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
const limit = Number(value('limit') ?? DEFAULT_LIMIT) || DEFAULT_LIMIT;
const timeoutSec = Number(value('timeout') ?? DEFAULT_TIMEOUT);
if (!Number.isFinite(timeoutSec) || timeoutSec <= 0) usage(`--timeout is seconds per browser call (got ${value('timeout')})`);
const concurrency = Number(value('concurrency') ?? DEFAULT_CONCURRENCY);
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > MAX_CONCURRENCY) {
  usage(`--concurrency is pages captured at once, 1–${MAX_CONCURRENCY} (got ${value('concurrency')})`);
}
const budgetMin = Number(value('budget') ?? DEFAULT_BUDGET);
if (!Number.isFinite(budgetMin) || budgetMin <= 0) usage(`--budget is minutes for the whole run (got ${value('budget')})`);
const textOnly = flag('text-only');
const reportOnly = flag('report-only');
const asJson = flag('json');
const refreshOld = flag('refresh-old');
const withStates = !flag('no-states') && !textOnly;
const watchMode = flag('watch');
if (watchMode && !onlyList.length) usage('--watch needs --only — it re-runs on every save, so it should be the one or two pages being tuned');
if (watchMode && textOnly) usage('--watch compares pixels; it has nothing to re-run with --text-only');
if (watchMode && asJson) usage('--watch prints a table on every save; it cannot also be --json');

const wanted = (value('viewports') ?? VIEWPORTS.map((v) => v.name).join(',')).split(',').map((s) => s.trim());
const unknown = wanted.filter((n) => !VIEWPORTS.some((v) => v.name === n));
if (unknown.length) usage(`unknown viewport ${unknown.join(', ')} — known: ${VIEWPORTS.map((v) => v.name).join(', ')}`);
const ACTIVE = VIEWPORTS.filter((v) => wanted.includes(v.name));

const log = asJson ? () => {} : (...a) => console.log(...a);

/* ── timing ─────────────────────────────────────────────────────────────── */

const T0 = performance.now();
const phases = {};
const addTime = (phase, ms) => (phases[phase] = (phases[phase] ?? 0) + ms);
async function timed(phase, fn) {
  const t = performance.now();
  try {
    return await fn();
  } finally {
    addTime(phase, performance.now() - t);
  }
}
const secs = (ms) => (ms >= 60000 ? `${Math.floor(ms / 60000)}m${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}s` : `${(ms / 1000).toFixed(1)}s`);
const age = (ms) => (ms < 3600000 ? `${Math.max(1, Math.round(ms / 60000))}m` : ms < 86400000 ? `${Math.round(ms / 3600000)}h` : `${Math.round(ms / 86400000)}d`);

/* ── routes: the OLD site's inventory, as shots reads it ────────────────── */

let routes;
let routeSource;
const tRoutes = performance.now();
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
addTime('routes', performance.now() - tRoutes);

if (!routes.length) {
  usage(`no routes to compare — no recon/urls.txt and no sitemap on ${OLD}.\n  Run \`npm run recon -- ${OLD}\` first.`);
}

const matched = routes.filter((r) => !onlyList.length || onlyList.some((f) => r.includes(f)));
if (!matched.length) usage(`no route matches --only=${onlyRaw}. ${routes.length} known from ${routeSource}.`);
const ROUTES = matched.slice(0, limit);
const notCompared = matched.length - ROUTES.length;
/* The interaction states are site chrome — the same header and menu on every
   page — so they are captured once, on the first route compared. */
const STATE_ROUTE = withStates ? ROUTES[0] : null;

log(`${BOLD}── Match: old → new ${'─'.repeat(40)}${RESET}`);
log(`  ${DIM}${OLD} → ${NEW}${RESET}`);
log(`  ${DIM}${ROUTES.length} route(s) from ${routeSource}${RESET}`);
log(
  onlyList.length
    ? `  ${DIM}--only ${onlyList.join(', ')} → ${matched.length} of ${routes.length} route(s): ${ROUTES.slice(0, 6).join(' ')}${ROUTES.length > 6 ? ' …' : ''}${RESET}`
    : `  ${DIM}no --only: all ${routes.length} route(s)${RESET}`,
);
log(
  textOnly
    ? `  ${DIM}text only — words kept ≥ ${textThreshold}, h1–h3 kept, one h1${RESET}`
    : `  ${DIM}${ACTIVE.map((v) => `${v.name} ${v.width}`).join(' · ')} — section fails above ${threshold}%, text under ${textThreshold}${RESET}`,
);
if (!textOnly) {
  log(
    `  ${DIM}${concurrency} at once · budget ${budgetMin} min · old side ${refreshOld ? 'recaptured (--refresh-old)' : 'from cache when under 7 days old'}${STATE_ROUTE ? ` · states on ${STATE_ROUTE}` : ' · no states'}${RESET}`,
  );
}
if (swallowed.length) {
  log(`  ${YELLOW}!${RESET} npm took --${[...new Set(swallowed)].join(', --')} before the \`--\`; recovered from npm_config_*. Put flags after \`--\` — npm keeps its own (--only is one) and passes nothing on.`);
}
if (notCompared) {
  log(`  ${YELLOW}!${RESET} ${notCompared} route(s) beyond --limit=${limit} were NOT compared — a partial set that looks complete is the problem`);
}
log('');

/* ── slugs, one per path, never shared (shots has the reason) ───────────── */

const SLUGS = new Map();
{
  const taken = new Set();
  for (const route of ROUTES) {
    const base = route === '/' ? 'home' : route.replace(/^\/|\/$/g, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'home';
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
    taken.add(slug);
    SLUGS.set(route, slug);
  }
}

/* ?nobadge=1 on our own build only — the staging badge is on one side, and it
   would be measured as drift. On the old site it is a cache-buster. */
const newUrl = (route) => `${NEW}${route}${route.includes('?') ? '&' : '?'}nobadge=1`;
const oldUrl = (route) => `${OLD}${route}`;

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── text ───────────────────────────────────────────────────────────────── */

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA_TOKEN, accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(timeoutSec * 1000) });
  const html = await res.text();
  return { status: res.status, final: res.url, html, type: res.headers.get('content-type') ?? '' };
}

function compareText(oldHtml, newHtmls, source) {
  /* Visually hidden text counts on the new side and not the old — lib/page-text.mjs has why. */
  const a = pageContent(oldHtml, { side: 'old' });
  /*
   * ⚠ THE NEW SIDE IS READ TWICE, RENDERED AND AS SERVED, AND A WORD IN EITHER
   *   COUNTS. A progressively enhanced form ships every option in its HTML and
   *   lets JavaScript set `hidden` on the conditional ones — so the rendered DOM
   *   alone reported eleven room names and twelve months "missing" from a form
   *   that carries all of them. Served HTML is what works with JavaScript off;
   *   rendered is what a JS-built page shows. A word in either is on the page.
   */
  const views = [].concat(newHtmls).filter(Boolean).map((h) => pageContent(h, { side: 'new' }));
  const b = {
    text: views.map((v) => v.text).join(' \n '),
    headings: views.flatMap((v) => v.headings),
    h1Count: views[0].h1Count,
  };
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

/* ── the browser half: the freeze ───────────────────────────────────────── */

/*
 * ── WHY A STRICT FREEZE ────────────────────────────────────────────────────
 * Two loads of the same page are only the same picture if nothing on it is
 * moving. CSS animations and transitions are the easy half: one stylesheet
 * zeroes them. The other half is JavaScript, which a stylesheet does not
 * reach — a parallax script writes `transform: translate3d(…)` into a style
 * attribute on every scroll, a scroll-driven marquee does the same, a
 * reveal-on-scroll library leaves everything below the fold at opacity 0
 * until it decides otherwise, and a rotating headline is on whichever word the
 * clock says. Measured, each of those is a section 5–40% "different" between
 * two captures of the SAME page — and on a rebuild, which reimplements that
 * motion differently, the number is noise that hides the real differences.
 * Nobody can tune a section to an exact match against a moving target.
 *
 * So both sides are put in the same still state before anything is measured:
 *
 *   still       an inline transform written by a scroll script is cleared,
 *               and kept cleared by a stylesheet rule that outranks the
 *               attribute (and a MutationObserver marking elements that get
 *               one later)
 *   reveal      reveal-on-scroll content is forced to its final, visible
 *               state — the library's own "animated" class added where it has
 *               one, opacity/visibility/transform forced either way
 *   first-word  rotating and typed headlines are stopped on their first word
 *   hide        typing cursors are hidden (they blink on their own clock)
 *
 * The list is data so it can grow: when a builder's motion shows up as a
 * noisy section, add its selector here with what it is, and bump
 * HARNESS_VERSION so cached old captures are retaken under the new rules.
 * Carousels are pinned to slide 1 by FREEZE below; menus and dropdowns are
 * never touched here — opening them is the states step's job.
 */
const FREEZE_LIST = [
  /* JS-driven motion — only elements that carry an INLINE transform are touched. */
  { what: 'Salient scrolling text (scroll-driven marquee)', selector: '.nectar-scrolling-text, .nectar-scrolling-text *', action: 'still' },
  { what: 'Salient / WPBakery row background parallax', selector: '.row-bg.using-image, .row-bg-wrap, .row-bg-wrap *, [data-parallax], [data-parallax] > *', action: 'still' },
  { what: 'Elementor motion effects', selector: '.elementor-motion-effects-element, .elementor-motion-effects-container, .elementor-motion-effects-layer', action: 'still' },
  { what: 'Rellax', selector: '[data-rellax], .rellax, [data-rellax-speed]', action: 'still' },
  { what: 'jarallax / parallax.js / Stellar', selector: '[data-jarallax], .jarallax, .jarallax-container, .jarallax-container *, [data-parallax-speed], [data-stellar-ratio]', action: 'still' },
  { what: 'anything named parallax, marquee, ticker or scrolling text', selector: '[class*="parallax"], [class*="parallax"] > *, [class*="marquee"], [class*="marquee"] > *, [class*="ticker"], [class*="scrolling-text"]', action: 'still' },

  /* Reveal-on-scroll — forced to the final, visible state. */
  { what: 'AOS', selector: '[data-aos]', action: 'reveal', addClass: 'aos-animate' },
  { what: 'Elementor entrance animations', selector: '.elementor-invisible', action: 'reveal', removeClass: 'elementor-invisible' },
  { what: 'WOW.js / animate.css', selector: '.wow', action: 'reveal', addClass: 'animated' },
  { what: 'Salient element and column animations', selector: '.has-animation, [data-animation]:not([data-animation="none"]):not([data-animation=""])', action: 'reveal', addClass: 'animated-in' },
  { what: 'Salient split-heading line reveal', selector: '.nectar-split-heading', action: 'reveal', addClass: 'animated-in' },
  { what: 'Salient split-heading lines', selector: '.nectar-split-heading .heading-line > *, .nectar-split-heading .inner', action: 'reveal' },
  { what: 'GSAP / ScrollReveal / sal.js conventions', selector: '[data-sal], [data-scroll], .reveal, .gs_reveal, [data-sr-id]', action: 'reveal', addClass: 'sal-animate' },
  /* Anything else that is invisible AND was going to animate in: opacity 0 with
     a transition or an animation, outside menus, carousels and dialogs. */
  { what: 'generic: opacity 0 with a transition, not in a menu/carousel/dialog', generic: true, action: 'reveal' },

  /* Rotating words and typing — stopped on the first word. */
  { what: 'rotating headline words', selector: '.nectar-rotating-words-title .dynamic-words, .elementor-headline-dynamic-wrapper, .cd-words-wrapper, [class*="rotating-words"], [class*="text-rotator"], [class*="word-rotator"]', action: 'first-word' },
  { what: 'typing cursors', selector: '.typed-cursor, .elementor-headline-cursor, [class*="typing-cursor"]', action: 'hide' },
];

/* Never revealed by the generic rule: these are hidden on purpose until someone interacts. */
const NOT_A_REVEAL = [
  HEADER_SEL, 'nav', '[role=navigation]', '[role=dialog]', '[role=tooltip]', '[role=tabpanel]', '[aria-hidden=true]', '[hidden]',
  '[class*="menu"]', '[class*="dropdown"]', '[class*="modal"]', '[class*="popup"]', '[class*="overlay"]', '[class*="tooltip"]',
  '[class*="slider"]', '[class*="carousel"]', '[class*="swiper"]', '[class*="slick"]', '[class*="splide"]', '[class*="owl-"]', '[class*="glide"]', '[class*="flickity"]',
  '[class*="tab-pane"]', '[class*="accordion"]', '[class*="lightbox"]', '[class*="search"]',
].join(', ');

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
/* FREEZE_LIST, applied by freezeInPage() through these attributes. */
[data-wbk-still] { transform: none !important; translate: none !important; }
[data-wbk-reveal] { opacity: 1 !important; visibility: visible !important; clip-path: none !important; }
[data-wbk-reveal]:not([data-wbk-reveal="fade"]) { transform: none !important; translate: none !important; }
[data-wbk-first] > * { display: none !important; }
[data-wbk-first] > :first-child { display: inline-block !important; opacity: 1 !important; visibility: visible !important; transform: none !important; position: relative !important; clip-path: none !important; }
[data-wbk-hide] { visibility: hidden !important; }
/* astro dev's toolbar is on one side only — the new one, under --watch. */
astro-dev-toolbar { display: none !important; }
${OVERLAYS.join(', ')} { display: none !important; }`;

/*
 * Runs in the page, twice: 'before' the FREEZE stylesheet (the generic reveal
 * rule needs the page's own transition durations, which FREEZE zeroes) and
 * 'after' the settle scroll (elements a script created or moved meanwhile).
 */
function freezeInPage(list, notAReveal, when) {
  const inlineMotion = (el) => {
    const s = el.style;
    if (!s) return false;
    return !!(s.transform && s.transform !== 'none') || !!(s.translate && s.translate !== 'none') || /matrix|translate/i.test(s.cssText);
  };
  const apply = (el, rule) => {
    if (rule.action === 'still') {
      if (inlineMotion(el)) el.setAttribute('data-wbk-still', '');
    } else if (rule.action === 'reveal') {
      if (rule.addClass) el.classList.add(rule.addClass);
      if (rule.removeClass) el.classList.remove(rule.removeClass);
      el.setAttribute('data-wbk-reveal', '');
    } else if (rule.action === 'first-word') {
      el.setAttribute('data-wbk-first', '');
    } else if (rule.action === 'hide') {
      el.setAttribute('data-wbk-hide', '');
    }
  };
  for (const rule of list) {
    if (rule.generic) continue;
    try {
      for (const el of document.querySelectorAll(rule.selector)) apply(el, rule);
    } catch {}
  }
  const generic = list.find((r) => r.generic);
  if (generic && when === 'before') {
    let n = 0;
    for (const el of document.body.querySelectorAll('*')) {
      if (n > 800) break;
      const cs = getComputedStyle(el);
      if (Number(cs.opacity) > 0.05 || cs.display === 'none') continue;
      const moves = cs.transitionDuration.split(',').some((d) => parseFloat(d) > 0) || cs.animationName !== 'none';
      if (!moves) continue;
      if (el.closest(notAReveal)) continue;
      if (!el.textContent.trim() && !el.querySelector('img, svg, video, picture')) continue;
      apply(el, generic);
      /*
       * ⚠ A FADE KEEPS ITS TRANSFORM. When only opacity is transitioned, the
       *   element's transform is layout — Salient centres its scrolling text
       *   with translateY(-50%) and fades it in — and clearing it moved that
       *   text half its height down on the old side only, measured as drift.
       *   Only a reveal that animates movement has its transform reset.
       */
      const props = cs.transitionProperty.split(',').map((t) => t.trim());
      const movesToo = cs.animationName !== 'none' || props.some((t) => t === 'all' || t === 'transform' || t === 'translate');
      if (!movesToo) el.setAttribute('data-wbk-reveal', 'fade');
      n++;
    }
  }
  if (when === 'before' && !window.__wbkObserver) {
    /* A scroll script that writes its first transform after this ran is caught here. */
    const still = list.filter((r) => r.action === 'still').map((r) => r.selector).join(', ');
    window.__wbkObserver = new MutationObserver((records) => {
      for (const r of records) {
        const el = r.target;
        if (el.nodeType === 1 && !el.hasAttribute('data-wbk-still') && inlineMotion(el)) {
          try {
            if (el.matches(still)) el.setAttribute('data-wbk-still', '');
          } catch {}
        }
      }
    });
    window.__wbkObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'], subtree: true });
  }
  if (when === 'after') {
    /* Web Animations started from script (element.animate) ignore CSS: finish
       the finite ones, park the endless ones on their first frame. */
    for (const a of document.getAnimations()) {
      try {
        const t = a.effect?.getComputedTiming();
        if (t && t.iterations !== Infinity) a.finish();
        else {
          a.pause();
          a.currentTime = 0;
        }
      } catch {}
    }
  }
}

/* Runs in the page. Walks it to fire lazy loading, then settles everything that moves. */
async function settleInPage() {
  for (const img of document.images) if (img.loading === 'lazy') img.loading = 'eager';
  const step = Math.max(200, Math.floor(window.innerHeight * 0.8));
  for (let y = 0; y < document.documentElement.scrollHeight && y < 30000; y += step) {
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
    let container = root;
    /* A single wrapper is not a section; its children are. */
    while (level.length === 1 && level[0].children.length > 1) {
      const inner = expand(level[0]);
      if (!inner.length) break;
      container = level[0];
      level = inner;
    }
    /*
     * ⚠ BUT PARAGRAPHS ARE NOT SECTIONS. A legal page is one wrapper of <h2>s
     *   and <p>s; unwrapped, it became 73 "sections" against the rebuild's 4,
     *   and every one of them failed at 100% by position. When most of what
     *   is left is running text, the wrapper holding it is the section.
     */
    const TEXT = /^(P|H[1-6]|UL|OL|LI|DL|BLOCKQUOTE|TABLE|PRE|FIGURE|IMG|PICTURE|A|SPAN|BR|HR|STRONG|EM|B|I|ADDRESS)$/;
    if (level.length > 2 && level.filter((el) => TEXT.test(el.tagName)).length >= level.length * 0.6) {
      level = [container];
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

/* ── the browser half: interaction states ───────────────────────────────── */

/* Runs in the page. The visible menu toggle in the top band, marked for a click. */
function findToggleInPage(selectors) {
  for (const sel of selectors) {
    for (const el of Array.from(document.querySelectorAll(sel)).slice(0, 10)) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const btn = el.closest('button, a, [role=button]') ?? el;
      /* Block themes reuse the menu-toggle class for the SEARCH overlay, and a
         cart or close button carries aria-expanded too. */
      const named = `${el.innerText ?? ''} ${el.getAttribute('aria-label') ?? ''} ${btn.getAttribute('aria-label') ?? ''}`;
      if (/search|cart|basket|close|account|language/i.test(named)) continue;
      /* In the top band: an accordion lower down also carries aria-expanded, and is not the menu. */
      if (r.width > 0 && r.height > 0 && r.top < 260 && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05) {
        el.setAttribute('data-wbk-toggle', '');
        return { selector: sel, label: (el.innerText || el.getAttribute('aria-label') || btn.getAttribute('aria-label') || '').trim().slice(0, 40) };
      }
    }
  }
  return null;
}

/* Runs in the page. Top-level nav items that own a submenu, each trigger marked. */
function findDropdownsInPage(headerSel, max) {
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const header = [...document.querySelectorAll(headerSel)].find(shown);
  const scope = header ?? document.querySelector('nav');
  if (!scope) return [];
  const SUB = ':scope > ul, :scope > .sub-menu, :scope > [class*="sub-menu"], :scope > [class*="submenu"], :scope > [class*="dropdown"], :scope > [class*="mega"]';
  const out = [];
  for (const li of scope.querySelectorAll('li')) {
    if (out.length >= max) break;
    if (li.parentElement?.closest('li') && scope.contains(li.parentElement.closest('li'))) continue; // not top level
    if (!shown(li) || !li.querySelector(SUB)) continue;
    const trigger = li.querySelector(':scope > a, :scope > button, :scope > span > a, :scope > div > a') ?? li.querySelector('a, button');
    if (!trigger || !shown(trigger)) continue;
    const label = (trigger.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!label) continue;
    trigger.setAttribute('data-wbk-dd', String(out.length));
    out.push({ label });
  }
  return out;
}

/* Runs in the page. The header plus the hovered item's open panel, as one rect clamped to the viewport. */
function dropdownRectInPage(headerSel, index) {
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
  };
  const trigger = document.querySelector(`[data-wbk-dd="${index}"]`);
  const li = trigger?.closest('li');
  const header = [...document.querySelectorAll(headerSel)].find(shown);
  const SUB = ':scope > ul, :scope > .sub-menu, :scope > [class*="sub-menu"], :scope > [class*="submenu"], :scope > [class*="dropdown"], :scope > [class*="mega"]';
  const panel = li?.querySelector(SUB);
  const open = !!panel && shown(panel);
  const rects = [header, open ? panel : li].filter(Boolean).map((el) => el.getBoundingClientRect());
  if (!rects.length) return null;
  const top = Math.max(0, Math.min(...rects.map((r) => r.top)));
  const bottom = Math.min(innerHeight, Math.max(...rects.map((r) => r.bottom)));
  return { open, y: Math.floor(top), height: Math.max(1, Math.ceil(bottom - top)) };
}

/* Runs in the page. Resolves when the running finite animations end, or after `ms`. */
function animationsDoneInPage(ms) {
  return Promise.race([
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => null)),
    ).then(() => true),
    new Promise((r) => setTimeout(() => r(false), ms)),
  ]);
}

const stateKey = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/*
 * The interaction states, after the static sections, on the same page. Ordered
 * least destructive first: scrolling is undone by scrolling back, a hover by
 * moving away, and an opened menu is left open — the page is closed next.
 */
async function captureStates(page, viewport) {
  const states = [];
  const shoot = (clip) => page.screenshot({ type: 'png', captureBeyondViewport: false, ...(clip ? { clip } : {}) });
  const settled = async (ms = 400) => {
    await page.evaluate(animationsDoneInPage, 3000).catch(() => {});
    await pause(ms);
  };
  const failed = (key, label, e) => states.push({ key, label, error: e.message.split('\n')[0] });

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.move(viewport.width - 2, viewport.height - 2).catch(() => {});
  await pause(150);

  /* (a) the header after scrolling — sticky, shrunk, recoloured or gone. */
  try {
    await page.evaluate((y) => window.scrollTo(0, y), SCROLLED_BY);
    await settled();
    states.push({ key: 'header-scrolled', label: 'state: header scrolled', png: await shoot(), height: viewport.height });
    await page.evaluate(() => window.scrollTo(0, 0));
    await settled(300);
  } catch (e) {
    failed('header-scrolled', 'state: header scrolled', e);
  }

  /* (c) desktop: every top-level item with a submenu, hovered. */
  if (viewport.name === 'desktop') {
    const items = await page.evaluate(findDropdownsInPage, HEADER_SEL, MAX_DROPDOWNS).catch(() => []);
    for (const [i, item] of items.entries()) {
      const key = `dropdown:${stateKey(item.label)}`;
      const label = `state: dropdown "${item.label}"`;
      try {
        await page.hover(`[data-wbk-dd="${i}"]`);
        await settled(500);
        const rect = await page.evaluate(dropdownRectInPage, HEADER_SEL, i);
        if (!rect) continue;
        const png = await shoot({ x: 0, y: rect.y, width: viewport.width, height: rect.height });
        states.push({ key, label, png, height: rect.height, note: rect.open ? '' : 'its panel did not open on hover' });
      } catch (e) {
        failed(key, label, e);
      }
      await page.mouse.move(viewport.width - 2, viewport.height - 2).catch(() => {});
      await pause(250);
    }
  }

  /* (b) the menu, opened — last, because nothing reliably closes every theme's menu. */
  const toggle = await page.evaluate(findToggleInPage, TOGGLES).catch(() => null);
  if (toggle) {
    try {
      try {
        await page.click('[data-wbk-toggle]');
      } catch {
        /* A pointer click fails on an element that moves as it settles; a DOM click still runs the handler. */
        await page.evaluate(() => document.querySelector('[data-wbk-toggle]')?.click());
      }
      await settled(500);
      states.push({ key: 'menu-open', label: 'state: menu open', png: await shoot(), height: viewport.height, note: '' });
    } catch (e) {
      failed('menu-open', 'state: menu open', e);
    }
  }
  return states;
}

/* ── the browser half: one capture ──────────────────────────────────────── */

/*
 * One capture: a FRESH page, settled, measured, and each section photographed
 * by its own clip — never one full-page bitmap.
 *
 * ⚠ ONE PAGE REUSED ACROSS A RUN IS ONE FAILURE AWAY FROM FAILING EVERY ROUTE
 *   AFTER IT. On the first real pair this ran against, a capture timed out on a
 *   16,000px legal page; Chrome closed the target, and every later capture
 *   failed on "Session closed" — two good routes reported as errors because of
 *   one bad one. Hence a page (in its own browser context) per capture, closed
 *   afterwards, and a browser that is relaunched when it stops answering
 *   (`captureSafe` below).
 */
async function capture(page, url, viewport, states) {
  await page.setViewport({
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    isMobile: viewport.name === 'mobile',
    hasTouch: viewport.name === 'mobile',
  });
  const res = await page.goto(url, { waitUntil: 'networkidle2', timeout: timeoutSec * 1000 });
  const status = res?.status() ?? 0;
  const type = res?.headers()['content-type'] ?? '';
  if (status >= 400) return { status, final: page.url() };
  /* A KML file, a feed or a sitemap is served 200 and is not a page. Settling
     one hung the browser until the protocol timed out. */
  if (type && !/html/i.test(type)) return { status, final: page.url(), notHtml: type.split(';')[0] };
  await page.evaluate(freezeInPage, FREEZE_LIST, NOT_A_REVEAL, 'before');
  await page.addStyleTag({ content: FREEZE });
  await page.evaluate(settleInPage);
  await page.evaluate(freezeInPage, FREEZE_LIST, NOT_A_REVEAL, 'after');
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const shape = await page.evaluate(sectionsInPage);
  if (!shape.sections.length) {
    /* No sections found: the page, top to bottom, is the one section. A
       comparison that compared nothing would read as a pass. */
    shape.sections = [{ key: 's1', label: 'whole page', y: 0, height: shape.height, title: '' }];
  }
  for (const s of shape.sections) {
    if (s.y >= MAX_PAGE) {
      s.beyondCap = true;
      continue;
    }
    const height = Math.max(1, Math.min(s.height, MAX_SECTION, MAX_PAGE - s.y));
    s.png = await page.screenshot({
      clip: { x: 0, y: s.y, width: viewport.width, height },
      captureBeyondViewport: true,
      type: 'png',
    });
  }
  const html = await page.content();
  let stateShots = null;
  if (states) {
    const t = performance.now();
    stateShots = await captureStates(page, viewport);
    addTime('states', performance.now() - t);
  }
  return { status, final: page.url(), html, truncated: shape.height > MAX_PAGE, ...shape, states: stateShots };
}

let puppeteer;
let browser = null;
let engine = '';
let relaunches = 0;
let generation = 0;
let launching = null;
let stopping = false; // the budget ran out: start nothing new, abandon what is in flight
let abortedWrites = 0;

/*
 * ⚠ chrome-headless-shell FIRST, and the reason is not speed. The full
 *   headless Chrome produces frames in step with the machine's display: with the
 *   display asleep — a long unattended run, a closed lid — `captureScreenshot`
 *   never returns, on any page, including `data:text/html,<h1>hi</h1>`. Measured
 *   on macOS: full headless timed out on every capture; the shell captured the
 *   same page in 0.6s. Puppeteer installs both; fall back if the shell is absent.
 */
async function launch() {
  puppeteer ??= (await import('puppeteer')).default;
  const opts = { args: ['--no-sandbox'], protocolTimeout: timeoutSec * 1000 };
  try {
    browser = await puppeteer.launch({ ...opts, headless: 'shell' });
    engine = 'chrome-headless-shell';
  } catch {
    browser = await puppeteer.launch(opts);
    engine = 'chrome (full headless — capture stalls while the display sleeps)';
  }
}

const connected = () => browser && (browser.connected ?? browser.isConnected?.());

/* Kill without asking: close() waits on a browser that may be the thing that stopped answering. */
function killBrowser() {
  const b = browser;
  browser = null;
  try {
    b?.process()?.kill('SIGKILL');
  } catch {}
  b?.close().catch(() => {});
}

/*
 * One relaunch per broken browser, however many captures notice. With pages
 * in flight in parallel, every one of them fails when the browser goes; only
 * the first relaunches, and the rest retry on the new one without spending
 * their retry — the failure was not theirs.
 */
async function relaunch(fromGeneration) {
  if (stopping) throw new Error('run budget used up');
  if (launching) return launching;
  if (fromGeneration !== generation && connected()) return;
  launching = (async () => {
    killBrowser();
    await timed('launch', launch);
    generation++;
    relaunches++;
  })().finally(() => (launching = null));
  return launching;
}

async function captureSafe(url, viewport, states) {
  for (let attempt = 1, tries = 0; ; tries++) {
    if (stopping) throw new Error('run budget used up');
    if (launching) await launching;
    if (!connected()) await relaunch(generation);
    const gen = generation;
    let context = null;
    try {
      context = await browser.createBrowserContext();
      const page = await context.newPage();
      await page.setBypassCSP(true); // the freeze stylesheet is inline, and a strict CSP would refuse it
      await page.setUserAgent(`${await browser.userAgent()} ${UA_TOKEN}`);
      await page.emulateMediaFeatures([
        { name: 'prefers-reduced-motion', value: 'reduce' },
        { name: 'prefers-color-scheme', value: 'light' },
      ]);
      /*
       * ⚠ READ-ONLY IS ENFORCED HERE, NOT HOPED FOR. Opening a menu, hovering
       *   a dropdown or a script on load can POST — a form, admin-ajax, a
       *   tracking endpoint. None of it leaves this browser. Analytics
       *   collectors are aborted too: a comparison is not a visit.
       */
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        if (req.isInterceptResolutionHandled()) return;
        if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) {
          abortedWrites++;
          return req.abort('blockedbyclient').catch(() => {});
        }
        if (COLLECTORS.test(req.url())) return req.abort('blockedbyclient').catch(() => {});
        return req.continue().catch(() => {});
      });
      return await capture(page, url, viewport, states);
    } catch (e) {
      if (stopping) throw new Error('run budget used up');
      /* A hung or crashed renderer poisons the browser for whatever runs next.
         Throw it away, start a new one, and try this capture once more. */
      const broken = !connected() || /Target closed|Session closed|detached|timed out|timeout|crashed|Protocol error|Connection closed/i.test(e.message);
      const notMine = gen !== generation; // someone else's failure relaunched it under us
      if (broken) await relaunch(gen);
      if (!broken || (!notMine && attempt >= 2) || tries >= 4) throw e;
      if (!notMine) attempt++;
    } finally {
      await context?.close().catch(() => {});
    }
  }
}

/* ── the old-side cache ─────────────────────────────────────────────────── */

const cacheDir = (url, viewport) =>
  join(CACHE, createHash('sha1').update(`${HARNESS_VERSION}\n${url}\n${viewport.name}:${viewport.width}x${viewport.height}`).digest('hex').slice(0, 20));

/*
 * ⚠ "THE OLD SITE DOES NOT CHANGE" IS USUALLY TRUE, AND CHECKED ANYWAY. The
 *   client edits a page on the live site mid-rebuild, or --old is pointed at a
 *   different site on the same address (a local copy, a fixture on a reused
 *   port) — and a cache keyed by URL alone compares the rebuild against a page
 *   that no longer exists, failing it for matching the real one. So each entry
 *   carries a fingerprint of the old page AS SERVED: its words (chrome removed,
 *   the same reading the text check uses) and its image paths. One plain fetch
 *   per route, no browser; a page whose words changed is recaptured, and says
 *   so. Words, not bytes: WordPress HTML carries nonces and timestamps that
 *   change on every load and would make the cache never hit.
 */
const fingerprints = new Map();
function oldFingerprint(route) {
  if (!fingerprints.has(route)) {
    fingerprints.set(
      route,
      fetchHtml(oldUrl(route))
        .then(({ status, html }) => {
          const images = [...html.matchAll(/<img\b[^>]*?\s(?:data-)?src=["']([^"'?#]+)/gi)].map((m) => m[1]).sort();
          return createHash('sha1').update(`${status}\n${pageContent(html, { side: 'old' }).text}\n${images.join('\n')}`).digest('hex').slice(0, 16);
        })
        .catch(() => null), // unreachable: the cached capture is the best evidence there is
    );
  }
  return fingerprints.get(route);
}

/** A cached capture younger than 7 days, of the same page, with the states when they are wanted — else why not. */
function readCache(url, viewport, needStates, fingerprint) {
  const dir = cacheDir(url, viewport);
  try {
    const meta = JSON.parse(readFileSync(join(dir, 'capture.json'), 'utf8'));
    const ms = Date.now() - Date.parse(meta.capturedAt);
    if (meta.harness !== HARNESS_VERSION || meta.url !== url) return null;
    if (!(ms >= 0 && ms < CACHE_MAX_AGE_MS)) return { miss: 'cache older than 7 days' };
    if (fingerprint && fingerprint !== meta.fingerprint) return { miss: 'the old page changed since it was cached' };
    if (needStates && !meta.states) return { miss: 'cached without the interaction states' };
    const load = (f) => (f ? readFileSync(join(dir, f)) : undefined);
    return {
      ...meta,
      html: readFileSync(join(dir, 'page.html'), 'utf8'),
      sections: meta.sections.map((s) => ({ ...s, png: load(s.file) })),
      states: meta.states ? meta.states.map((s) => ({ ...s, png: load(s.file) })) : null,
      cachedAgeMs: ms,
    };
  } catch {
    return null;
  }
}

/** Only a capture worth reusing: a page that answered 200-ish with HTML. Errors are retried next run. */
function writeCache(url, viewport, cap, fingerprint) {
  if (cap.status >= 400 || cap.notHtml || !cap.html) return;
  const dir = cacheDir(url, viewport);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const strip = (list, prefix) =>
    list.map((s, i) => {
      const { png, ...rest } = s;
      if (!png) return rest;
      const file = `${prefix}-${String(i).padStart(2, '0')}.png`;
      writeFileSync(join(dir, file), png);
      return { ...rest, file };
    });
  const { html, sections, states, ...rest } = cap;
  writeFileSync(join(dir, 'page.html'), html);
  writeFileSync(
    join(dir, 'capture.json'),
    JSON.stringify({ ...rest, harness: HARNESS_VERSION, url, fingerprint, viewport: viewport.name, capturedAt: new Date().toISOString(), sections: strip(sections, 'section'), states: states ? strip(states, 'state') : null }, null, 1),
  );
}

async function oldCapture(route, viewport, states, refresh) {
  const url = oldUrl(route);
  const fingerprint = await timed('old fingerprint', () => oldFingerprint(route));
  let why = refresh ? 'asked for with --refresh-old' : '';
  if (!refresh) {
    const hit = readCache(url, viewport, states, fingerprint);
    /* States cached by an earlier run are not compared on a run that did not ask for them —
       the new side has none, and each would read as an interaction the rebuild lost. */
    if (hit && !hit.miss) return states ? hit : { ...hit, states: null };
    why = hit?.miss ?? '';
  }
  const t = performance.now();
  const cap = await captureSafe(url, viewport, states);
  addTime('old capture', performance.now() - t);
  writeCache(url, viewport, cap, fingerprint);
  return { ...cap, recaptured: why };
}

/* ── pixels ─────────────────────────────────────────────────────────────── */

let sharp;
async function raw(png) {
  sharp ??= (await import('sharp')).default;
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
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

/**
 * Pair sections: header↔header, footer↔footer, and the content sections by
 * their headings first, by position between those.
 *
 * Position alone breaks on the first section added or removed: every section
 * after it is compared with its neighbour and fails at 50–100%, which reads as
 * a rebuild that got everything wrong when it changed one thing. So the longest
 * run of matching section titles anchors the pairing (an LCS), and only the
 * sections between two anchors are paired by position — which still pairs a
 * heading whose typo the rebuild fixed.
 */
function pairSections(oldShape, newShape) {
  const role = (shape, k) => shape.sections.find((s) => s.key === k);
  const content = (shape) => shape.sections.filter((s) => s.key !== 'header' && s.key !== 'footer');
  const A = content(oldShape);
  const B = content(newShape);
  const key = (s) => (s.title ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

  const L = Array.from({ length: A.length + 1 }, () => new Array(B.length + 1).fill(0));
  for (let i = A.length - 1; i >= 0; i--) {
    for (let j = B.length - 1; j >= 0; j--) {
      L[i][j] = key(A[i]) && key(A[i]) === key(B[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    }
  }
  const anchors = [];
  for (let i = 0, j = 0; i < A.length && j < B.length; ) {
    if (key(A[i]) && key(A[i]) === key(B[j])) anchors.push([i++, j++]);
    else if (L[i + 1][j] >= L[i][j + 1]) i++;
    else j++;
  }
  anchors.push([A.length, B.length]);

  const pairs = [];
  const pair = (o, n) => pairs.push({ old: o, new: n, label: o && n && o.label !== n.label ? `${o.label} ↔ new ${n.label.replace('section ', '')}` : (o ?? n).label });
  if (role(oldShape, 'header') || role(newShape, 'header')) pair(role(oldShape, 'header'), role(newShape, 'header'));
  let pi = 0;
  let pj = 0;
  for (const [i, j] of anchors) {
    const gap = Math.max(i - pi, j - pj);
    for (let g = 0; g < gap; g++) pair(A[pi + g] && pi + g < i ? A[pi + g] : undefined, B[pj + g] && pj + g < j ? B[pj + g] : undefined);
    if (i < A.length) pair(A[i], B[j]);
    pi = i + 1;
    pj = j + 1;
  }
  if (role(oldShape, 'footer') || role(newShape, 'footer')) pair(role(oldShape, 'footer'), role(newShape, 'footer'));
  return pairs;
}

/** States pair by what they are — the scrolled header, the open menu, the dropdown with this label. */
function pairStates(oldStates, newStates) {
  if (!oldStates && !newStates) return [];
  const a = oldStates ?? [];
  const b = newStates ?? [];
  const keys = [...new Set([...a.map((s) => s.key), ...b.map((s) => s.key)])];
  return keys.map((k) => {
    const o = a.find((s) => s.key === k);
    const n = b.find((s) => s.key === k);
    return { old: o, new: n, label: (o ?? n).label, state: true };
  });
}

/** Decode one clip to RGB, rescaled to the common width when the two sides differ. */
async function decode(png, width) {
  const img = await raw(png);
  if (img.width === width) return img;
  const scaled = await sharp(img.data, { raw: { width: img.width, height: img.height, channels: 3 } })
    .resize({ width })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: scaled.data, width: scaled.info.width, height: scaled.info.height };
}

async function compareViewport(slug, viewport, a, b) {
  const sections = [];
  let k = 0;
  for (const pair of [...pairSections(a, b), ...pairStates(a.states, b.states)]) {
    const label = pair.label;
    const title = pair.old?.title || pair.new?.title || '';
    const oldHeight = pair.old?.height ?? 0;
    const newHeight = pair.new?.height ?? 0;
    const base = { label, title, oldHeight, newHeight, ...(pair.state ? { state: true } : {}) };
    if (pair.old?.beyondCap || pair.new?.beyondCap) {
      /* Reported, never a failure and never a pass: it was not measured. */
      sections.push({ ...base, percent: null, note: `starts below the ${MAX_PAGE}px capture cap — not compared` });
      continue;
    }
    if (pair.old?.error || pair.new?.error) {
      sections.push({ ...base, percent: null, note: `could not be captured on the ${pair.old?.error ? 'old' : 'new'} site — ${pair.old?.error ?? pair.new?.error}` });
      continue;
    }
    if (!pair.old || !pair.new) {
      if (pair.state) {
        /* The rebuild lost an interaction the old site had: measured as fully different.
           One only the rebuild has is not a regression; it is named, not scored. */
        sections.push(
          pair.old
            ? { ...base, percent: 100, note: 'found on the old site, not on the new one — if it exists, it is not where match looks (lib/capture-rules.mjs)' }
            : { ...base, percent: null, note: 'only on the new site — not compared' },
        );
      } else {
        sections.push({ ...base, percent: 100, note: pair.old ? 'not found on the new site' : 'only on the new site' });
      }
      continue;
    }
    const width = viewport.width;
    const ca = await decode(pair.old.png, width);
    const cb = await decode(pair.new.png, width);
    const d = diff(ca, cb);
    const file = `${slug}/${viewport.name}/${String(++k).padStart(2, '0')}${pair.state ? '-state' : ''}`;
    mkdirSync(join(OUT, slug, viewport.name), { recursive: true });
    sections.push({
      ...base,
      percent: Number(d.percent.toFixed(2)),
      ...(pair.old.note || pair.new.note ? { note: [pair.old.note && `old: ${pair.old.note}`, pair.new.note && `new: ${pair.new.note}`].filter(Boolean).join(' · ') } : {}),
      files: {
        old: await writePng(ca, `${file}-old.png`),
        new: await writePng(cb, `${file}-new.png`),
        diff: await writePng(d.image, `${file}-diff.png`),
      },
    });
  }
  sections.sort((x, y) => (y.percent ?? -1) - (x.percent ?? -1));
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

/* Everything in shots/match except the old-side cache. */
function clearOut() {
  mkdirSync(OUT, { recursive: true });
  for (const entry of readdirSync(OUT)) if (entry !== '.cache') rmSync(join(OUT, entry), { recursive: true, force: true });
}

/** Run `worker` over `items`, at most `n` at once, starting nothing new once the budget is gone. */
async function pool(items, n, worker) {
  let next = 0;
  const lane = async () => {
    while (!stopping && next < items.length) {
      const i = next++;
      await worker(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, lane));
}

const slim = ({ status, final, html, cachedAgeMs, recaptured }) => ({ status, final, html, cachedAgeMs, recaptured });

/** One route at one width: old (cache or capture), new, diff. Never throws. */
async function compareTask(route, viewport, refresh) {
  const states = route === STATE_ROUTE;
  try {
    const a = await oldCapture(route, viewport, states, refresh);
    if (a.status >= 400 || a.notHtml) return { kind: 'skip', a, why: a.notHtml ? `not a page (${a.notHtml})` : `HTTP ${a.status} on the old site` };
    const b = await timed('new capture', () => captureSafe(newUrl(route), viewport, states));
    if (b.status >= 400) return { kind: 'missing', a: slim(a), b: slim(b) };
    /* The same refusal shots makes: an unstyled capture measures the
       harness, and filed as a 90% drift it becomes a design argument. */
    for (const [side, s] of [['old', a], ['new', b]]) {
      if (s.background === 'rgba(0, 0, 0, 0)') throw new Error(`${side} side: body has no background — stylesheet did not arrive`);
    }
    const v = await timed('diff', () => compareViewport(SLUGS.get(route), viewport, a, b));
    /* The crops are on disk now. Holding every route's PNGs until the run ends
       is what makes a 40-route run need gigabytes; keep only what the route needs. */
    return { kind: 'ok', a: slim(a), b: slim(b), v };
  } catch (e) {
    return { kind: stopping ? 'unfinished' : 'error', message: e.message.split('\n')[0] };
  }
}

/** One full comparison. Returns the result object; prints a line per route as each finishes. */
async function runOnce({ refresh }) {
  clearOut();
  const results = [];
  const failures = [];
  const fail = (route, viewport, section, kind, detail) => failures.push({ route, viewport, section, kind, detail });
  const oldStats = { cached: 0, captured: 0, oldest: 0 };

  const finishRoute = async (route, tasks) => {
    const row = { route, slug: SLUGS.get(route), viewports: [], text: null };
    results.push(row);
    if (textOnly) {
      try {
        const a = await fetchHtml(oldUrl(route));
        await pause(250);
        const b = await fetchHtml(newUrl(route));
        Object.assign(row, { oldStatus: a.status, newStatus: b.status, oldFinal: a.final, newFinal: b.final.replace(/[?&]nobadge=1/, '') });
        if (a.status >= 400) row.skipped = `HTTP ${a.status} on the old site`;
        else if (!/html/i.test(a.type)) row.skipped = `not a page (${a.type.split(';')[0]})`;
        else if (b.status >= 400) fail(route, null, null, 'missing', `HTTP ${b.status} on the new site`);
        else row.text = timedSync('text', () => compareText(a.html, b.html, 'served HTML'));
      } catch (e) {
        fail(route, null, null, 'error', e.message);
      }
    } else {
      let htmlPair = null;
      const oldFrom = new Set();
      for (const [i, viewport] of ACTIVE.entries()) {
        const t = tasks[i];
        if (!t) {
          row.viewports.push({ name: viewport.name, width: viewport.width, error: 'not compared — the run budget ran out first', unfinished: true, sections: [] });
          continue;
        }
        if (t.a) {
          row.oldStatus = t.a.status;
          row.oldFinal = t.a.final;
          if (t.a.cachedAgeMs !== undefined) {
            oldStats.cached++;
            oldStats.oldest = Math.max(oldStats.oldest, t.a.cachedAgeMs);
            oldFrom.add(`cached (${age(t.a.cachedAgeMs)})`);
          } else {
            oldStats.captured++;
            oldFrom.add(t.a.recaptured ? `recaptured — ${t.a.recaptured}` : 'captured');
          }
        }
        if (t.b) {
          row.newStatus = t.b.status;
          row.newFinal = t.b.final.replace(/[?&]nobadge=1/, '');
        }
        if (t.kind === 'skip') {
          row.skipped = t.why;
          row.viewports = [];
          break;
        }
        if (t.kind === 'missing') {
          if (!failures.some((f) => f.route === route && f.kind === 'missing')) fail(route, null, null, 'missing', `HTTP ${t.b.status} on the new site`);
          continue;
        }
        if (t.kind === 'error' || t.kind === 'unfinished') {
          const error = t.kind === 'unfinished' ? 'not compared — the run budget ran out first' : t.message;
          row.viewports.push({ name: viewport.name, width: viewport.width, error, ...(t.kind === 'unfinished' ? { unfinished: true } : {}), sections: [] });
          if (t.kind === 'error') fail(route, viewport.name, null, 'error', t.message);
          continue;
        }
        htmlPair ??= [t.a.html, t.b.html];
        row.viewports.push(t.v);
      }
      row.old = [...oldFrom].join(', ');
      if (htmlPair && !stopping) {
        const served = await fetchHtml(newUrl(route)).catch(() => null);
        row.text = timedSync('text', () => compareText(htmlPair[0], [htmlPair[1], served?.status === 200 ? served.html : null], 'old rendered; new rendered + served'));
      }
    }

    /* ── verdicts for this route ── */
    for (const v of row.viewports) {
      if (v.error) continue;
      for (const s of v.sections) {
        if (s.percent !== null && s.percent > threshold) {
          fail(route, v.name, s.label, 'visual', `${s.percent}% different${s.note ? ` — ${s.note}` : ''}${s.title ? ` “${s.title}”` : ''}`);
        }
      }
      if (v.truncated) log(`  ${YELLOW}!${RESET} ${route} · ${v.name}: taller than ${MAX_PAGE}px — sections below the cap not compared`);
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
    const unfinished = row.viewports.some((v) => v.unfinished);
    const mark = row.skipped || unfinished ? `${YELLOW}–${RESET}` : mine.length ? `${RED}✗${RESET}` : `${GREEN}✓${RESET}`;
    const worst = row.viewports.flatMap((v) => v.sections ?? []).reduce((m, s) => Math.max(m, s.percent ?? 0), 0);
    const bits = [
      row.skipped ?? '',
      unfinished ? 'unfinished — budget' : '',
      row.text ? `text ${(row.text.ratio * 100).toFixed(1)}%` : '',
      row.viewports.some((v) => !v.error) ? `worst section ${worst.toFixed(1)}%` : '',
      row.old ? `old: ${row.old}` : '',
    ].filter(Boolean);
    log(`  ${mark} ${route}  ${DIM}${bits.join(' · ')}${RESET}`);
  };

  if (textOnly) {
    for (const route of ROUTES) await finishRoute(route, []);
  } else {
    /* Every route × width is one task; a route is reported when its last width is in. */
    const tasks = ROUTES.flatMap((route) => ACTIVE.map((viewport, vi) => ({ route, viewport, vi })));
    const done = new Map(ROUTES.map((r) => [r, { left: ACTIVE.length, out: [] }]));
    const finishing = [];
    await pool(tasks, concurrency, async ({ route, viewport, vi }) => {
      const t = await compareTask(route, viewport, refresh);
      const entry = done.get(route);
      entry.out[vi] = t;
      if (--entry.left === 0) finishing.push(finishRoute(route, entry.out));
    });
    await Promise.all(finishing);
    /* Routes the budget never reached are still listed — as not compared. */
    for (const route of ROUTES) if (done.get(route).left > 0) await finishRoute(route, done.get(route).out);
  }
  results.sort((x, y) => ROUTES.indexOf(x.route) - ROUTES.indexOf(y.route));
  return { results, failures, oldStats };
}

function timedSync(phase, fn) {
  const t = performance.now();
  try {
    return fn();
  } finally {
    addTime(phase, performance.now() - t);
  }
}

/* The budget: past it, nothing new starts, what is in flight is abandoned, and the run says so. */
let budgetTimers = [];
function armBudget() {
  for (const t of budgetTimers) clearTimeout(t);
  const ms = budgetMin * 60000;
  budgetTimers = [
    setTimeout(() => {
      stopping = true;
      log(`\n  ${RED}✗${RESET} run budget of ${budgetMin} min used up — abandoning the captures in flight and writing what finished`);
      killBrowser();
    }, ms),
    /* And if even that does not come back, leave anyway — a message, never a hang. */
    setTimeout(() => {
      console.error(`${RED}✗ match: still not finished 60s after the ${budgetMin} min budget — exiting without a report${RESET}`);
      process.exit(1);
    }, ms + 60000),
  ];
  for (const t of budgetTimers) t.unref();
}

function buildResult({ results, failures }) {
  return {
    old: OLD,
    new: NEW,
    ranAt: new Date().toISOString(),
    mode: textOnly ? 'text-only' : 'visual+text',
    thresholds: { sectionPercent: threshold, textRatio: textThreshold, pixelDelta: PIXEL_DELTA },
    viewports: textOnly ? [] : ACTIVE,
    routeSource,
    only: onlyList,
    notCompared,
    budget: { minutes: budgetMin, ranOut: stopping },
    browser: textOnly
      ? null
      : { engine, relaunches, timeoutSeconds: timeoutSec, pageCapPx: MAX_PAGE, concurrency, harness: HARNESS_VERSION, abortedWrites },
    states: STATE_ROUTE ? { route: STATE_ROUTE } : null,
    passed: failures.length === 0 && !stopping,
    failures,
    routes: results,
  };
}

function printTimings(oldStats) {
  const order = ['routes', 'launch', 'old fingerprint', 'old capture', 'new capture', 'states', 'diff', 'text', 'report'];
  const parts = order.filter((p) => phases[p] >= 50).map((p) => `${p} ${secs(phases[p])}`);
  log(`  ${DIM}time: ${secs(performance.now() - T0)} total${parts.length ? ` · ${parts.join(' · ')}` : ''}${RESET}`);
  if (!textOnly) {
    log(
      `  ${DIM}old side: ${oldStats.cached} cached${oldStats.cached ? ` (oldest ${age(oldStats.oldest)})` : ''}, ${oldStats.captured} captured${
        concurrency > 1 ? ` · capture, states and diff times are summed over ${concurrency} parallel pages` : ''
      } · states are inside the capture times${RESET}`,
    );
  }
}

const results0 = await (async () => {
  if (!textOnly) await timed('launch', launch);
  armBudget();
  try {
    return await runOnce({ refresh: refreshOld });
  } finally {
    if (!watchMode) killBrowser();
  }
})();

const tReport = performance.now();
let result = buildResult(results0);
writeFileSync(join(OUT, 'match.json'), JSON.stringify(result, null, 2) + '\n');
writeFileSync(join(OUT, 'index.html'), report(result));
addTime('report', performance.now() - tReport);

if (asJson) {
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} else {
  summarise(result);
  printTimings(results0.oldStats);
  log('');
}

if (!watchMode) process.exit(stopping ? 1 : result.failures.length && !reportOnly ? 1 : 0);

/* ── --watch: the tuning loop ───────────────────────────────────────────── */

function sectionPercents(r) {
  const m = new Map();
  for (const row of r.routes) for (const v of row.viewports) for (const s of v.sections ?? []) m.set(`${row.route} · ${v.name} · ${s.label}`, s.percent);
  return m;
}

function printTable(now, before) {
  const all = [...now.entries()].sort((a, b) => (b[1] ?? -1) - (a[1] ?? -1));
  /* Sections at 0% that did not move are the bulk of a tuned page; one line says so. */
  const still = ([k, p]) => p === 0 && (!before?.has(k) || before.get(k) === 0);
  const rows = all.filter((r) => !still(r));
  const quiet = all.length - rows.length;
  const w = Math.min(70, Math.max(...rows.map(([k]) => k.length), 10));
  if (quiet) log(`  ${DIM}${quiet} section(s) at 0.00%${before ? ', unchanged' : ''}${RESET}`);
  for (const [k, p] of rows) {
    const prev = before?.get(k);
    const delta = p === null || prev === undefined || prev === null ? '' : p - prev;
    const d = delta === '' ? '' : Math.abs(delta) < 0.005 ? `${DIM}  ±0${RESET}` : delta < 0 ? `${GREEN}${delta.toFixed(2).padStart(6)}${RESET}` : `${RED}${('+' + delta.toFixed(2)).padStart(6)}${RESET}`;
    const pct = p === null ? '   n/a' : `${p.toFixed(2).padStart(6)}%`;
    const mark = p !== null && p > threshold ? RED : '';
    log(`  ${k.slice(0, w).padEnd(w)}  ${mark}${pct}${mark ? RESET : ''}  ${d}`);
  }
}

const dirs = ['src', 'public'].filter((d) => existsSync(d) && statSync(d).isDirectory());
if (!dirs.length) {
  console.error(`${RED}✗${RESET} --watch watches src/ and public/, and neither is here — run it from the project root`);
  killBrowser();
  process.exit(1);
}
let previous = sectionPercents(result);
log(`${BOLD}── watching ${dirs.join('/, ')}/ — save to re-measure the new side (old side from cache), Ctrl-C to stop${RESET}\n`);
printTable(previous, null);

let running = false;
let again = false;
let debounce = null;
const rerun = async () => {
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    for (const k of Object.keys(phases)) delete phases[k];
    const t = performance.now();
    stopping = false;
    armBudget();
    log(`\n${DIM}── change seen, re-measuring ${new Date().toLocaleTimeString()} ──${RESET}`);
    const r = await runOnce({ refresh: false });
    result = buildResult(r);
    writeFileSync(join(OUT, 'match.json'), JSON.stringify(result, null, 2) + '\n');
    writeFileSync(join(OUT, 'index.html'), report(result));
    const now = sectionPercents(result);
    printTable(now, previous);
    previous = now;
    log(`  ${DIM}${result.failures.length ? `${result.failures.length} past the threshold` : 'all within the threshold'} · ${secs(performance.now() - t)} · report ${OUT}/index.html${RESET}`);
  } catch (e) {
    log(`  ${RED}✗${RESET} ${e.message}`);
  } finally {
    for (const t of budgetTimers) clearTimeout(t);
    running = false;
    if (again) {
      again = false;
      rerun();
    }
  }
};
for (const d of dirs) {
  fsWatch(d, { recursive: true }, () => {
    clearTimeout(debounce);
    debounce = setTimeout(rerun, 500);
  });
}
for (const t of budgetTimers) clearTimeout(t);
process.on('SIGINT', () => {
  killBrowser();
  log('');
  process.exit(0);
});

/* ── output ─────────────────────────────────────────────────────────────── */

function summarise(r) {
  const skipped = r.routes.filter((x) => x.skipped);
  if (skipped.length) {
    log(`\n  ${YELLOW}!${RESET} ${skipped.length} route(s) not compared — the old site did not serve a page:`);
    for (const x of skipped) log(`      ${DIM}${x.route} (${x.skipped})${RESET}`);
  }
  if (relaunches) log(`\n  ${YELLOW}!${RESET} the browser stopped answering and was relaunched ${relaunches} time(s) — the routes after it were still compared`);
  if (abortedWrites) log(`  ${DIM}${abortedWrites} non-GET request(s) aborted before they left — read-only${RESET}`);
  if (r.budget.ranOut) {
    const unfinished = r.routes.filter((x) => x.viewports.some((v) => v.unfinished)).map((x) => x.route);
    log(`\n${RED}✗ run budget of ${r.budget.minutes} min used up — ${r.routes.length - unfinished.length} of ${r.routes.length} route(s) finished; not compared: ${unfinished.join(' ') || '—'}${RESET}`);
    log(`  ${DIM}raise it with --budget=<minutes>, narrow it with --only, or look at why a capture stalled (--timeout is per browser call)${RESET}`);
  }
  if (r.failures.length) {
    log(`\n${RED}✗ ${r.failures.length} difference(s) past the threshold${RESET}`);
    for (const f of r.failures) {
      const where = [f.route, f.viewport, f.section].filter(Boolean).join(' · ');
      log(`  ${RED}✗${RESET} ${where} — ${f.kind}: ${f.detail}`);
    }
    for (const x of r.routes.filter((y) => y.text?.context.length)) {
      log(`\n  ${DIM}${x.route} — where the missing words were on the old page:${RESET}`);
      for (const c of x.text.context) log(`      ${DIM}${c.word}: ${c.context}${RESET}`);
    }
    log(`\n  ${DIM}report: ${OUT}/index.html${reportOnly && !r.budget.ranOut ? ' · --report-only, so exiting 0' : ''}${RESET}`);
  } else if (!r.budget.ranOut) {
    log(`\n${GREEN}✓ every compared section within ${threshold}% and every page's text kept${RESET}`);
    log(`  ${DIM}report: ${OUT}/index.html${RESET}`);
  }
}

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
    : r.budget.ranOut
      ? ''
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
      <figcaption><b>${esc(s.label)}</b>${s.title ? ` “${esc(s.title)}”` : ''} — <b>${s.percent === null ? 'not compared' : pct(s.percent)}</b> · ${s.oldHeight}px → ${s.newHeight}px${s.note ? ` · ${esc(s.note)}` : ''}</figcaption>
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
        sections ${v.oldSections} → ${v.newSections}${v.overflowX > 1 ? ` · <span class="warn">scrolls sideways ${v.overflowX}px ${esc(v.overflowBy)}</span>` : ''}${v.truncated ? ` · taller than ${MAX_PAGE}px, captured to the cap` : ''}</summary>
      <p class="cols"><span>old</span><span>new</span><span>difference</span></p>
      ${v.sections.map(sectionRow).join('\n')}
    </details>`;
  };

  const routeBlock = (x) => `<section id="${esc(x.slug)}">
    <h2><code>${esc(x.route)}</code>${x.skipped ? ` <small>— ${esc(x.skipped)}</small>` : ''}${x.old ? ` <small>old side ${esc(x.old)}</small>` : ''}</h2>
    ${x.newFinal && new URL(x.newFinal).pathname !== x.route ? `<p class="note">new site redirected to ${esc(new URL(x.newFinal).pathname)}</p>` : ''}
    ${textBlock(x.text)}
    ${x.viewports.map(viewportBlock).join('\n')}
  </section>`;

  /* Worst routes first, so the report is read in the order it should be fixed. */
  const score = (x) => (x.skipped ? -1 : Math.max(0, ...x.viewports.flatMap((v) => (v.sections ?? []).map((s) => s.percent ?? 0))) + (x.text ? (1 - x.text.ratio) * 100 : 0));
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
     Routes from ${esc(r.routeSource)}${r.only.length ? ` — <b>--only ${esc(r.only.join(', '))}</b>` : ''}${r.notCompared ? ` — <b>${r.notCompared} route(s) beyond --limit not compared</b>` : ''}.
     Animations frozen, scroll-driven motion stilled, reveal-on-scroll content shown, carousels on their first slide, rotating words on their first, cookie banners and chat widgets hidden, light scheme, reduced motion.
     ${r.states ? `Interaction states (scrolled header, open menu, desktop dropdowns) compared on ${esc(r.states.route)}.` : ''}
     ${r.browser ? `Captured with ${esc(r.browser.engine)}, ${r.browser.concurrency} at once, each section by its own clip, pages capped at ${r.browser.pageCapPx}px${r.browser.relaunches ? ` — <b>the browser was relaunched ${r.browser.relaunches} time(s)</b> after it stopped answering` : ''}.` : ''}</p>
  ${r.budget.ranOut ? `<h2 class="warn">Not finished — the ${r.budget.minutes} min run budget ran out. Routes marked “not compared” were not measured.</h2>` : ''}
  <h2>${r.passed ? 'Passed' : r.failures.length ? `${r.failures.length} difference(s) past the threshold` : 'Incomplete'}</h2>
  ${failList}
</header>
${ordered.map(routeBlock).join('\n')}
</body></html>
`;
}
