/**
 * Measure the OLD site's design, and propose it as tokens.
 *
 *   npm run design -- https://old-site.com             # capture → recon/, propose
 *   npm run design -- https://old-site.com --apply     # ...and write src/styles/tokens.css
 *   npm run design -- --apply                          # write the proposal already in recon/
 *   npm run design -- https://old-site.com --uncapped  # keep a hero size past the restraint cap
 *   npm run design -- https://old-site.com --limit=3   # pages to measure (default 6)
 *   npm run design -- https://old-site.com --only=/about/   # re-measure one page; the rest from cache
 *   npm run design -- https://old-site.com --refresh   # ignore recon/.cache, measure everything
 *   npm run design -- https://old-site.com --concurrency=3 --budget=15   # pages at once; minutes
 *   npm run design -- http://10.0.0.5 --allow-internal # an old site on a VPN
 *
 * Writes:
 *   recon/design.json         every measurement, per page and viewport
 *   recon/design.md           the human summary of the tokens — read this one first
 *   recon/tokens.proposed.css tokens.css with the proposal written in. Diff it
 *   recon/interactions.json   the menu (every dropdown and mega panel), the header
 *                             on scroll, carousels, marquees, scroll-driven motion
 *   recon/sections.json       the blueprint: header, hero, every section, footer
 *   recon/blueprint.md        the blueprint as tables, per page — build from this
 *   recon/blueprint.proposed.css  one clamp() CSS block per section. Proposes only
 *   recon/.cache/             per page-and-width captures; --refresh ignores them
 *   shots/design/*.png        the menu open, each nav panel, the header before and after scroll
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * build.md §3 says "source real values from the original brand rather than
 * approximating", and tokens.css says the ramp must be "sampled from the brand
 * — not approximated by eye". Nothing in the kit sampled anything, so every
 * value was read off a screenshot with an eyedropper, one at a time — which is
 * the approximation both of those sentences forbid. A size, a weight or a
 * container width read that way is off by a little, invisibly, and the
 * differences add up to a site that "feels different" for no nameable reason.
 *
 * The browser already knows every one of those numbers. This asks it. The
 * measuring is ported from a sister WordPress migration tool, where it was
 * built against Salient/WPBakery sites — hence the Salient selectors.
 *
 * ── WHAT IT MEASURES ───────────────────────────────────────────────────────
 * At 390, 820 and 1440px, on the home page plus one page per template family
 * in recon/urls.txt: the faces actually used (counted by text-bearing element,
 * not by what a stylesheet declares), colours by use — text, background,
 * border — computed type per h1–h6/p/a/small with size, weight, line-height,
 * tracking and case, the buttons' computed styles (including the ones a theme
 * paints on a pseudo-element), centred container widths, the text edge, photo
 * corner radius, paragraph and list rhythm, the header, and the builder's own
 * custom properties — Elementor, Bricks and block themes publish the palette
 * there, exact.
 *
 * The blueprint, on every measured page at every width (lib/design-probes.mjs):
 * each top-level section — cut the way match.mjs cuts them — with its height,
 * padding in px and vw, background (colour, image, gradient, video, slider,
 * and the overlay over it), columns with fractions, gap and order, media boxes
 * (aspect, share of column, fit), heading/body type and decoration. The first
 * section as a hero: min-height in vh, content box position, eyebrow, headline,
 * buttons, scroll indicator, and words that rotate or type (watched and timed).
 * The footer's columns, type, bottom bar, social links, embeds and third-party
 * scripts. Scroll-driven motion, by scrolling in steps: parallax (rate per px
 * scrolled) and reveal-on-scroll (effect, duration, delay, easing, stagger,
 * trigger offset, library). Carousels' autoplay interval, loop, arrows and
 * dots, watched for up to 12s and only where there is one; marquee speed in
 * px/s and direction.
 *
 * On the home page at each width: the header at the top and after a scroll —
 * height, background, blur, border, shadow, logo variant and size, element
 * order, CTA, top bar, sticky/hide/shrink and timing. On desktop, EVERY
 * top-level menu item with children is hovered and then focused, and each
 * panel recorded — dropdown, mega or full-width, geometry against the header,
 * paint, columns, headings, images, animation, trigger, third-level flyout
 * direction — with a screenshot each. On narrower widths the toggle is opened
 * and the first closed submenu inside it expanded: accordion or drill-down.
 *
 * ── SPEED ──────────────────────────────────────────────────────────────────
 * Page-widths run three at a time (--concurrency), each its own tab, each
 * pausing after its load. A whole run has a budget (--budget, 15 minutes):
 * when it is spent the run stops, writes what it has marked partial, and exits
 * 1. Captures are cached per URL, width and probe version, so a re-run after a
 * fix measures nothing it already has. A page-width that stops answering is
 * abandoned after three minutes, and a silent spell prints what is in flight.
 *
 * ── READ-ONLY, AND POLITE ──────────────────────────────────────────────────
 * One browser, a few tabs, a pause after each load, and a user agent that
 * says what it is. Every request that is not a GET is aborted before it
 * leaves — opening a menu can fire a form or an admin-ajax POST, and this
 * never writes to a site that is not ours. Analytics collectors are aborted
 * too, so a capture is not counted as twenty-odd visits in the client's GA.
 * Consent banners are hidden, never accepted. Menu links are hovered and
 * focused, never followed; a submenu is opened only by a separate toggle or a
 * link that goes nowhere.
 *
 * ── WHAT IT CANNOT SEE ─────────────────────────────────────────────────────
 * Printed at the end: anything behind a login, a dark mode, hover states other
 * than the menu's (card lifts, image zooms), a click-to-open mega menu whose
 * trigger is a real link, motion slower than the watch (a carousel past 12s,
 * a word rotating past 8s), scroll motion that only fires on a real wheel or
 * touch event, the exact breakpoint between two measured widths (it names the
 * site's own breakpoints in that range), JS-driven easing curves (it reports
 * the timing CSS exposes), and the licence a face was bought under. And it
 * proposes; it does not design. On a redesign it is the before, not the brief.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';

import puppeteer from 'puppeteer';

import {
  fontFaceSnippet,
  isUndecided,
  mostCommonOf,
  parseColor,
  primaryFamily,
  proposeTokens,
  toHex,
  whereToGet,
  writeTokens,
} from './lib/design-tokens.mjs';
import { blueprintCss, blueprintMd, mergeSections, motionFor, pageSlug, slugOf } from './lib/design-blueprint.mjs';
import {
  BLUEPRINT,
  HEADER_STATE,
  HELPERS,
  NAV_NESTED,
  NAV_NESTED_DIR,
  NAV_PANEL,
  NAV_TREE,
  SCROLL_MOTION,
  SUBMENU_FIND,
  SUBMENU_READ,
  WATCH,
} from './lib/design-probes.mjs';
import { blockedReason } from './lib/hosts.mjs';
import { readInventory } from './lib/inventory.mjs';

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844, scale: 2, mobile: true },
  { name: 'tablet', width: 820, height: 1180, scale: 1, mobile: true },
  { name: 'desktop', width: 1440, height: 900, scale: 1, mobile: false },
];

const RECON = 'recon';
const SHOTS = 'shots/design';
const TOKENS = 'src/styles/tokens.css';
const DEFAULT_LIMIT = 6;
const PAUSE_MS = 400;
const CACHE = `${RECON}/.cache`;
/* Bump when a probe changes what it returns: a cached capture from an older
   probe would otherwise be read as a measurement it never made. */
const PROBE_VERSION = 2;
const CACHE_MAX_AGE_MS = 7 * 24 * 3600 * 1000;
const TASK_TIMEOUT_MS = 180000;

const NOT_A_PAGE = /\.(pdf|xml|txt|json|zip|gz|csv|ico|png|jpe?g|gif|webp|avif|svg|mp4|webm|woff2?)$/i;

/* Collectors, not tag scripts: the tag may draw something; the beacon only counts a visit. */
const COLLECTORS =
  /google-analytics\.com|analytics\.google\.com|\/g\/collect|googletagmanager\.com\/gtag\/js|facebook\.com\/tr|connect\.facebook\.net|doubleclick\.net|clarity\.ms|hotjar\.(?:com|io)|stats\.wp\.com|plausible\.io\/api|\/wp-json\/.*\/(?:track|log)/i;

/* Cookie banners from the common WordPress consent plugins and CMPs. Hidden so
   the menu capture sees the menu; never clicked, because accepting on the
   visitor's behalf is not something a read-only tool does. */
const CONSENT = [
  '#cookie-law-info-bar', '.cky-consent-container', '#cmplz-cookiebanner-container', '.cmplz-cookiebanner',
  '#cookie-notice', '#moove_gdpr_cookie_info_bar', '#CybotCookiebotDialog', '#onetrust-banner-sdk',
  '.iubenda-cs-container', '#BorlabsCookieBox', '.cookie-banner', '#cookie-banner', '[aria-label="cookieconsent"]',
].join(', ');

/* ── Arguments ─────────────────────────────────────────────────────────── */

const argv = process.argv.slice(2);
const target = argv.find((a) => !a.startsWith('--'));
const apply = argv.includes('--apply');
const uncapped = argv.includes('--uncapped');
const allowInternal = argv.includes('--allow-internal');
const refresh = argv.includes('--refresh');
const valueOf = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const limit = Number(valueOf('limit') ?? '') || DEFAULT_LIMIT;
const USAGE =
  'usage: npm run design -- https://old-site.com [--apply] [--uncapped] [--limit=6] [--only=/path/] [--refresh]\n' +
  '                         [--concurrency=3] [--budget=15] [--allow-internal]\n' +
  '       npm run design -- --apply      # write the proposal already in recon/design.json';

const concurrency = valueOf('concurrency') === undefined ? 3 : Number(valueOf('concurrency'));
const budgetMin = valueOf('budget') === undefined ? 15 : Number(valueOf('budget'));
const onlyRaw = valueOf('only');
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
  console.error(`${RED}✗${RESET} --concurrency is a whole number of pages at once, 1–8 (got ${valueOf('concurrency')})\n${USAGE}`);
  process.exit(1);
}
if (!Number.isFinite(budgetMin) || budgetMin <= 0) {
  console.error(`${RED}✗${RESET} --budget is minutes for the whole run, more than 0 (got ${valueOf('budget')})\n${USAGE}`);
  process.exit(1);
}
if (onlyRaw !== undefined && !onlyRaw.trim()) {
  console.error(`${RED}✗${RESET} --only needs a path, e.g. --only=/about/\n${USAGE}`);
  process.exit(1);
}
const only = onlyRaw === undefined ? null : `/${onlyRaw.trim().replace(/^https?:\/\/[^/]+/, '').replace(/^\/+/, '')}`;

if (!target && !apply) {
  console.error(USAGE);
  process.exit(1);
}

if (!target) {
  /* --apply on its own: the proposal from the last capture, reviewed first. */
  let saved;
  try {
    saved = JSON.parse(readFileSync(`${RECON}/design.json`, 'utf8'));
  } catch {
    saved = null;
  }
  if (!saved?.proposal?.vars?.length) {
    console.error(
      `${RED}✗${RESET} no proposal to apply — recon/design.json is missing or empty.\n` +
        `  Capture first: npm run design -- https://old-site.com`,
    );
    process.exit(1);
  }
  process.exit(applyProposal(saved.proposal, saved.origin, saved.capturedAt) ? 0 : 1);
}

const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(target);
const ORIGIN = (hasScheme ? target : `https://${target}`).replace(/\/$/, '');
const refusal = blockedReason(ORIGIN, { allowInternal });
if (refusal) {
  const hint =
    refusal.kind === 'host'
      ? `  design measures the old LIVE site, so an internal address is usually a typo.\n` +
        `  If the old site really is on a VPN or a private address, pass ${BOLD}--allow-internal${RESET}.\n`
      : `  design speaks http and https. Give it the URL you would type into a browser.\n`;
  console.error(`\n${RED}✗ ${refusal.reason}${RESET}\n\n${hint}`);
  process.exit(1);
}

/* ── Which pages ───────────────────────────────────────────────────────── */

/**
 * The home page plus one page per template family. A family is the first path
 * segment of a nested URL (`/blog/a/` and `/blog/b/` are one template); every
 * single-segment page counts as the one family "page", which is what a
 * WordPress page template is. Measuring every URL would multiply the load on a
 * site that is not ours for no new information.
 */
function choosePages() {
  const inventory = readInventory(readFileSync);
  const paths = (inventory?.live ?? []).filter((p) => !NOT_A_PAGE.test(p) && !p.includes('?'));
  const families = new Map([['home', '/']]);
  for (const p of paths) {
    const parts = p.split('/').filter(Boolean);
    if (!parts.length) continue;
    const family = parts.length === 1 ? 'page' : `/${parts[0]}/*`;
    if (!families.has(family)) families.set(family, p);
  }
  const all = [...families.entries()].map(([family, path]) => ({ family, path }));
  const pages = all.slice(0, limit);
  if (only && !pages.some((p) => p.path === only)) pages.push({ family: all.find((p) => p.path === only)?.family ?? 'only', path: only });
  return {
    pages,
    dropped: Math.max(0, all.length - limit),
    source: inventory ? `recon/urls.txt — one page per template family` : 'no recon/urls.txt, so the home page only',
  };
}

const { pages: PAGES, dropped, source } = choosePages();

console.log(`${BOLD}── Design capture ${'─'.repeat(42)}${RESET}`);
console.log(`  ${DIM}${ORIGIN} — ${PAGES.length} page(s) from ${source}${RESET}`);
console.log(`  ${DIM}at ${VIEWPORTS.map((v) => `${v.width}px`).join(', ')}; read-only, ${concurrency} at a time, budget ${budgetMin} min${only ? `; measuring only ${only}` : ''}${RESET}`);
if (dropped) console.log(`  ${YELLOW}!${RESET} ${dropped} more famil(ies) beyond --limit=${limit} not measured`);
console.log('');

/* ── In-page measurement ───────────────────────────────────────────────── */

/*
 * Runs INSIDE the page — serialised by puppeteer, so it may use nothing from
 * this module's scope. Ported from a sister migration tool's audit, which
 * learned most of these the hard way on Salient and WPBakery sites.
 */
function CAPTURE() {
  const CHROME = 'header, footer, nav, #header-outer, #footer-outer, [role=dialog], [role=banner], [role=contentinfo]';
  const tally = (m, k, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
  const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  const paint = (c) => c && c !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(c) && !/\/\s*0\)$/.test(c);
  const visible = (e) => e.offsetWidth > 0 && e.offsetHeight > 0;

  const fonts = new Map();
  const weights = new Map();
  const text = new Map();
  const bg = new Map();
  const border = new Map();
  const widths = new Map();
  const els = Array.from(document.querySelectorAll('body *')).filter(visible).slice(0, 8000);
  for (const el of els) {
    const cs = getComputedStyle(el);
    const ownText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
    if (ownText) {
      tally(fonts, cs.fontFamily);
      tally(text, cs.color);
      const fam = cs.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '').toLowerCase();
      if (!weights.has(fam)) weights.set(fam, new Set());
      weights.get(fam).add(cs.fontWeight);
    }
    if (paint(cs.backgroundColor)) tally(bg, cs.backgroundColor);
    if (parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none') tally(border, cs.borderTopColor);
    /* A centred container: a px max-width with equal side margins. Its CONTENT
       width is what --width-max means (global.css adds the gutter back). */
    if (cs.maxWidth !== 'none' && cs.maxWidth.endsWith('px') && cs.marginLeft === cs.marginRight) {
      const max = parseFloat(cs.maxWidth);
      if (max >= 480 && el.offsetWidth >= Math.min(max, window.innerWidth) - 2) {
        const pad = cs.boxSizing === 'border-box' ? parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) : 0;
        tally(widths, Math.round(max - pad));
      }
    }
  }

  /* The usual style of a tag: its most common size among visible ones,
     skipping one-off sizes set on a single element (split headings, inline
     font-size). Each distinct text counts once — a marquee repeats one line. */
  const pick = (sel) => {
    const all = Array.from(document.querySelectorAll(sel)).filter(visible);
    const plain = all.filter((e) => !e.closest("[data-custom-font-size='true'], [class*='font_size_'], [style*='font-size']"));
    const pool = plain.length ? plain : all;
    const sizes = new Map();
    for (const e of pool) {
      const k = getComputedStyle(e).fontSize;
      const texts = sizes.get(k) ?? new Map();
      const t = (e.textContent ?? '').trim().slice(0, 80);
      if (!texts.has(t)) texts.set(t, e);
      sizes.set(k, texts);
    }
    const best = [...sizes.values()].sort((a, b) => b.size - a.size)[0];
    if (!best) return null;
    /* The colour most of them share, not the first one's: the first paragraph
       on a page is usually in the hero, white on a photograph. */
    const size = getComputedStyle([...best.values()][0]).fontSize;
    const colours = new Map();
    for (const e of pool) if (getComputedStyle(e).fontSize === size) tally(colours, getComputedStyle(e).color);
    const colour = [...colours.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const el = [...best.values()].find((e) => getComputedStyle(e).color === colour) ?? [...best.values()][0];
    const cs = getComputedStyle(el);
    return {
      count: best.size,
      ...(plain.length ? {} : { custom: true }),
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      lineHeight: cs.lineHeight,
      letterSpacing: cs.letterSpacing,
      textTransform: cs.textTransform,
      color: colour,
    };
  };
  const typography = {};
  for (const sel of ['body', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'li', 'blockquote', 'small']) typography[sel] = pick(sel);

  /* Buttons: anything clickable that is filled or outlined. Salient and others
     paint the shape on ::before/::after, so the element itself is transparent. */
  const buttons = [];
  const seen = new Set();
  for (const el of Array.from(document.querySelectorAll('a, button, input[type=submit]'))) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    const pseudo = ['::before', '::after'].map((p) => getComputedStyle(el, p)).find((p) => p.content !== 'none' && paint(p.backgroundColor));
    const filled = paint(cs.backgroundColor) || !!pseudo;
    const bordered = parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none';
    if (!filled && !bordered) continue;
    const styles = {
      background: paint(cs.backgroundColor) ? cs.backgroundColor : pseudo?.backgroundColor ?? cs.backgroundColor,
      paintedBy: paint(cs.backgroundColor) ? 'element' : pseudo ? 'pseudo-element' : 'border',
      color: cs.color,
      borderRadius: pseudo && cs.borderRadius === '0px' ? pseudo.borderRadius : cs.borderRadius,
      border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
      padding: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`,
      height: el.offsetHeight,
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      letterSpacing: cs.letterSpacing,
      textTransform: cs.textTransform,
      boxShadow: cs.boxShadow,
      transition: cs.transition,
      inHeader: !!el.closest('header, nav, #header-outer, [role=dialog]'),
    };
    const sig = JSON.stringify({ ...styles, height: 0 });
    if (seen.has(sig)) continue;
    seen.add(sig);
    buttons.push({ tag: el.tagName.toLowerCase(), text: (el.innerText || el.value || '').trim().slice(0, 40), styles });
    if (buttons.length >= 8) break;
  }

  const breakpoints = new Set();
  const fontFaces = [];
  const imports = [];
  const walkRules = (rules, href) => {
    for (const r of Array.from(rules ?? [])) {
      if (r instanceof CSSMediaRule) {
        for (const m of r.conditionText.matchAll(/(min|max)-width:\s*([\d.]+)px/g)) breakpoints.add(Math.round(Number(m[2])));
        walkRules(r.cssRules, href);
      } else if (r instanceof CSSFontFaceRule) {
        fontFaces.push({
          family: r.style.getPropertyValue('font-family').replace(/["']/g, '').trim(),
          src: r.style.getPropertyValue('src').slice(0, 300),
          weight: r.style.getPropertyValue('font-weight'),
          sheet: href,
        });
      } else if (r instanceof CSSImportRule) {
        imports.push(r.href);
        try {
          walkRules(r.styleSheet?.cssRules, r.styleSheet?.href ?? href);
        } catch {
          /* cross-origin import: the href is the evidence */
        }
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      walkRules(sheet.cssRules, sheet.href ?? location.href);
    } catch {
      /* cross-origin sheet without CORS — its href is recorded below */
    }
  }
  const fontLinks = [
    ...Array.from(document.querySelectorAll('link[rel~=stylesheet], link[rel=preload][as=style]')).map((l) => l.href),
    ...imports,
  ].filter((h) => /fonts\.googleapis\.com|use\.typekit\.net|p\.typekit\.net|fonts\.bunny\.net|fonts\.cdnfonts\.com|use\.fontawesome/i.test(h));
  const fontResources = performance
    .getEntriesByType('resource')
    .map((e) => e.name)
    .filter((n) => /\.(woff2?|ttf|otf)(\?|$)/i.test(n))
    .slice(0, 40);

  const firstVisible = (sel) => Array.from(document.querySelectorAll(sel)).find((e) => e.offsetHeight > 0 && e.getBoundingClientRect().top < 40);
  const header = firstVisible('#header-outer, header, .site-header, #masthead, #main-header, #brx-header, .elementor-location-header, [role=banner]');
  const footer = Array.from(document.querySelectorAll('#footer-outer, footer, .site-footer, #colophon, #main-footer, #brx-footer')).find((e) => e.offsetHeight > 0);
  let pageBackground;
  for (let el = document.querySelector('main, #ajax-content-wrap .container-wrap, .container-wrap, #content, .site-content, #page, #main-content, #brx-content') ?? document.body; el; el = el.parentElement) {
    const c = getComputedStyle(el).backgroundColor;
    if (paint(c)) {
      pageBackground = c;
      break;
    }
  }

  const mostCommon = (m, minCount) => {
    const best = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    return best && best[1] >= minCount ? best[0] : undefined;
  };

  /* The text edge: where most body text starts, outside the chrome, within the
     first fifth of the screen. On a phone that is the gutter. */
  const lefts = new Map();
  for (const el of Array.from(document.querySelectorAll('p, h1, h2, h3, h4, li'))) {
    if (el.closest(CHROME)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height === 0 || r.left < 4 || r.left > window.innerWidth / 5) continue;
    tally(lefts, Math.round(r.left));
  }

  /* Photo corners: a large picture's own radius, or a clipping ancestor's. */
  const radii = new Map();
  for (const el of Array.from(document.querySelectorAll("img, [style*='background-image'], .row-bg, .column-image-bg"))) {
    if (el.closest(CHROME)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 200 || r.height < 150) continue;
    if (el.tagName !== 'IMG' && getComputedStyle(el).backgroundImage.indexOf('url(') < 0) continue;
    let radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
    let up = el.parentElement;
    for (let i = 0; i < 3 && up && !radius; i++, up = up.parentElement) {
      const cs = getComputedStyle(up);
      if (cs.overflow !== 'visible') radius = parseFloat(cs.borderTopLeftRadius) || 0;
    }
    tally(radii, Math.round(radius));
  }

  /* Paragraph rhythm — margin on some themes, padding-bottom on others. */
  const gaps = new Map();
  for (const el of Array.from(document.querySelectorAll('p + p'))) {
    if (el.closest(CHROME)) continue;
    const prev = el.previousElementSibling;
    if (!prev?.offsetHeight || !el.offsetHeight || !prev.textContent.trim() || !el.textContent.trim()) continue;
    const a = prev.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    const gap = Math.round(b.top + parseFloat(getComputedStyle(el).paddingTop) - (a.bottom - parseFloat(getComputedStyle(prev).paddingBottom)));
    if (gap >= 0 && gap <= 120) tally(gaps, gap);
  }
  const listGaps = new Map();
  for (const li of Array.from(document.querySelectorAll('ul > li + li, ol > li + li'))) {
    if (li.closest(`${CHROME}, .menu, [class*=menu]`)) continue;
    const prev = li.previousElementSibling;
    if (!prev?.offsetHeight || !li.offsetHeight || !li.textContent.trim()) continue;
    const gap = Math.round(li.getBoundingClientRect().top - prev.getBoundingClientRect().bottom);
    if (gap >= 0 && gap <= 60) tally(listGaps, gap);
  }

  /* The builder's own palette and sizes, published as custom properties. */
  const rootVariables = {};
  const rootCs = getComputedStyle(document.documentElement);
  for (let i = 0; i < rootCs.length && Object.keys(rootVariables).length < 400; i++) {
    const name = rootCs[i];
    if (name.startsWith('--')) rootVariables[name] = rootCs.getPropertyValue(name).trim().slice(0, 200);
  }

  const has = (sel) => !!document.querySelector(sel);
  const builder =
    has('#header-outer, .nectar-global-section, [class*="nectar-"]') ? 'Salient (WPBakery)'
      : has('.vc_row, .wpb_row, [class*="vc_"]') ? 'WPBakery'
        : has('[class*="elementor-"]') ? 'Elementor'
          : has('[class*="et_pb_"]') ? 'Divi'
            : has('[class*="brxe-"]') ? 'Bricks'
              : has('[class*="wp-block-"]') ? 'Gutenberg'
                : has('meta[name=generator][content*="WordPress" i]') ? 'WordPress (classic theme)'
                  : 'not WordPress, or not recognised';

  return {
    builder,
    fonts: top(fonts, 10).map(([family, count]) => ({ family, count })),
    fontWeights: Object.fromEntries([...weights.entries()].map(([k, v]) => [k, [...v]])),
    fontFaces: fontFaces.slice(0, 60),
    fontLinks,
    fontResources,
    colors: [
      ...top(text, 12).map(([value, count]) => ({ value, count, usage: 'text' })),
      ...top(bg, 12).map(([value, count]) => ({ value, count, usage: 'background' })),
      ...top(border, 6).map(([value, count]) => ({ value, count, usage: 'border' })),
    ],
    typography,
    buttons,
    containerWidths: top(widths, 6).map(([width, count]) => ({ width, count })),
    gutter: mostCommon(lefts, 3),
    mediaRadius: mostCommon(radii, 2),
    paragraphGap: mostCommon(gaps, 2),
    listItemGap: mostCommon(listGaps, 3),
    breakpoints: [...breakpoints].sort((a, b) => a - b),
    header: header
      ? { height: header.offsetHeight, position: getComputedStyle(header).position, background: getComputedStyle(header).backgroundColor }
      : null,
    footer: footer ? { height: footer.offsetHeight, background: getComputedStyle(footer).backgroundColor, color: getComputedStyle(footer).color } : null,
    pageBackground,
    rootVariables,
  };
}

const TOGGLES = [
  '.slide-out-widget-area-toggle a',
  '.slide-out-widget-area-toggle',
  '#mobile-toggle',
  '.wp-block-navigation__responsive-container-open',
  '.elementor-menu-toggle',
  '.bricks-mobile-menu-toggle',
  'button.brxe-toggle[aria-expanded]',
  '.et_mobile_nav_menu .mobile_menu_bar',
  '.mobile_menu_bar_toggle',
  '.ast-mobile-menu-trigger-minimal',
  '.menu-toggle',
  '.mobile-menu-toggle',
  'button[aria-controls][aria-expanded]',
  '[aria-controls][aria-expanded]',
  '.hamburger, [class*="hamburger"]',
  '[class*="burger"]',
  'a[aria-label*="menu" i], button[aria-label*="menu" i]',
];

const HEADER_SEL = '#header-outer, header, .site-header, #masthead, #main-header, #brx-header, .elementor-location-header, [role=banner]';

/* ── Browser helpers ───────────────────────────────────────────────────── */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/*
 * A screenshot is evidence, the measurement is the point. On a loaded machine
 * Chrome's capture can time out, and letting that throw discarded a menu that
 * had been found, opened and read — reported as "no toggle". Returns the path,
 * or null with the reason kept.
 */
const shotErrors = [];
let shotsStalled = false;
async function shot(page, path, options = {}) {
  /* One timeout means the browser is not producing frames (see launch());
     every later capture would wait out the same timeout for nothing. */
  if (shotsStalled) return null;
  try {
    await page.screenshot({ path, ...options });
    return path;
  } catch (err) {
    shotErrors.push(`${path}: ${err.message.split('\n')[0]}`);
    if (/timed out/i.test(err.message)) shotsStalled = true;
    return null;
  }
}

/* The old settle() walk, kept for when the scroll-motion probe fails: lazy
   images and reveal-on-scroll content still have to arrive before measuring. */
async function walk(page) {
  await page
    .evaluate(async () => {
      const step = Math.max(200, Math.floor(innerHeight * 0.8));
      for (let y = 0; y < document.documentElement.scrollHeight && y < 30000; y += step) {
        window.scrollTo({ top: y, behavior: 'instant' });
        await new Promise((r) => setTimeout(r, 100));
      }
      window.scrollTo({ top: 0, behavior: 'instant' });
      await document.fonts?.ready;
    })
    .catch(() => {});
  await sleep(300);
}

/* Wait for every finite animation on the page to finish, or `ms`. */
const animationsDone = (page, ms = 1200) =>
  page
    .evaluate(
      (limit) =>
        Promise.race([
          Promise.all(
            document
              .getAnimations()
              .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
              .map((a) => a.finished.catch(() => null)),
          ).then(() => true),
          new Promise((r) => setTimeout(() => r(false), limit)),
        ]),
      ms,
    )
    .catch(() => false);

/** The header at the top, after a scroll down, and after a scroll back up. */
async function captureHeader(page, vp) {
  const state = () => page.evaluate(HEADER_STATE, HEADER_SEL).catch(() => null);
  await animationsDone(page, 1500);

  const at = await state();
  if (!at) return { viewport: vp.name, found: false };
  const clip = (h) => ({ x: 0, y: 0, width: vp.width, height: Math.min(vp.height, Math.max(120, h + 40)) });
  const files = { top: `${SHOTS}/${vp.name}-header-top.png`, scrolled: `${SHOTS}/${vp.name}-header-scrolled.png` };
  files.top = await shot(page, files.top, { clip: clip(at.height + (at.topBar?.height ?? 0)) });
  await page.mouse.move(vp.width / 2, vp.height / 2);
  await page.mouse.wheel({ deltaY: 900 });
  await sleep(1000);
  const down = (await state()) ?? at;
  files.scrolled = await shot(page, files.scrolled, { clip: clip(Math.max(down.height, 0)) });
  await page.mouse.wheel({ deltaY: -300 });
  await sleep(1000);
  const up = (await state()) ?? down;
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await sleep(500);

  const transparent = (c) => !c || c === 'transparent' || /rgba\([^)]*,\s*0(\.0\d*)?\)$/.test(c);
  const keys = ['height', 'position', 'background', 'boxShadow', 'transform', 'color', 'logoHeight', 'backdrop', 'borderBottom'];
  const changes = keys.filter((k) => at[k] !== down[k]).map((k) => `${k}: ${at[k]} → ${down[k]}`);
  if (at.logo?.src !== down.logo?.src) changes.push(`logo: ${at.logo?.src ?? at.logo?.kind} → ${down.logo?.src ?? down.logo?.kind}`);
  const hidden = down.bottom <= 0;
  return {
    viewport: vp.name,
    found: true,
    top: at,
    scrolledDown: down,
    scrolledUp: up,
    behaviour: {
      sticky: !hidden && down.top <= 1 && ['fixed', 'sticky'].includes(down.position),
      hidesOnScrollDown: hidden && ['fixed', 'sticky'].includes(down.position),
      revealsOnScrollUp: hidden && up.bottom > 0,
      scrollsAway: hidden && !['fixed', 'sticky'].includes(down.position),
      transparentOverHero: transparent(at.background) && (['absolute', 'fixed'].includes(at.position) || at.contentStartsUnder),
      turnsSolid: transparent(at.background) && !transparent(down.background),
      shrinks: !hidden && down.height < at.height - 3,
      swapsLogo: !!(at.logo?.src && down.logo?.src && at.logo.src !== down.logo.src),
      changesOnScroll: changes.length > 0,
    },
    changes,
    files,
  };
}

/** Find the menu toggle, open it, and record what opened and how. */
async function captureMenu(page, vp) {
  const result = { viewport: vp.name, found: false, items: [], animations: [], files: {} };

  /* Salient keeps its menu style, easing and durations on <body> as data-*. */
  result.themeSettings = await page.evaluate(() =>
    Object.fromEntries(Object.entries(document.body.dataset).slice(0, 40).map(([k, v]) => [k, String(v).slice(0, 80)])),
  );

  const toggle = await page.evaluate((selectors) => {
    for (const sel of selectors) {
      for (const el of Array.from(document.querySelectorAll(sel)).slice(0, 10)) {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        /* In the top band of the page: an accordion lower down also carries
           aria-expanded, and is not the menu. */
        const btn = el.closest('button, a, [role=button]') ?? el;
        /* Block themes reuse the menu-toggle class for the SEARCH overlay on
           desktop, and a cart or close button carries aria-expanded too. */
        const named = `${el.innerText ?? ''} ${el.getAttribute('aria-label') ?? ''} ${btn.getAttribute('aria-label') ?? ''}`;
        if (/search|cart|basket|close|account|language/i.test(named)) continue;
        if (r.width > 0 && r.height > 0 && r.top < 260 && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05) {
          el.setAttribute('data-wbk-toggle', '1');
          return {
            selector: sel,
            label: (el.innerText || el.getAttribute('aria-label') || btn.getAttribute('aria-label') || '').trim().slice(0, 40),
            rect: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
            ariaExpanded: btn.getAttribute('aria-expanded'),
            ariaControls: btn.getAttribute('aria-controls'),
            isButton: btn.tagName === 'BUTTON' || btn.getAttribute('role') === 'button',
          };
        }
      }
    }
    return null;
  }, TOGGLES);

  if (!toggle) return { ...result, ...(await captureInlineNav(page, vp)) };
  result.found = true;
  result.toggle = toggle;

  await page.evaluate(() => {
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05) el.setAttribute('data-wbk-before', '1');
    }
  });
  result.files.closed = await shot(page, `${SHOTS}/${vp.name}-menu-closed.png`);

  const t0 = Date.now();
  try {
    await page.click('[data-wbk-toggle]');
  } catch (err) {
    /* A real pointer click can fail on a slow machine or an element that
       moves as it settles; a DOM click still runs the theme's handler. */
    const clicked = await page.evaluate(() => {
      const el = document.querySelector('[data-wbk-toggle]');
      el?.click();
      return !!el;
    }).catch(() => false);
    if (!clicked) {
      result.error = `could not click the toggle: ${err.message.split('\n')[0]}`;
      return result;
    }
    result.clickFallback = `pointer click failed (${err.message.split('\n')[0]}); used a DOM click`;
  }
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  result.animations = await page.evaluate(() => {
    const describe = (el) => {
      if (!el) return '?';
      const id = el.id ? `#${el.id}` : '';
      const cls = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).slice(0, 3).map((c) => `.${c}`).join('');
      return `${el.tagName.toLowerCase()}${id}${cls}`;
    };
    return document
      .getAnimations()
      .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
      .map((a) => {
        const timing = a.effect?.getComputedTiming();
        return {
          target: describe(a.effect?.target),
          kind: a.transitionProperty ? 'transition' : a.animationName ? 'animation' : 'other',
          name: a.transitionProperty ?? a.animationName ?? '',
          durationMs: Math.round(Number(timing?.duration ?? 0)),
          delayMs: Math.round(Number(timing?.delay ?? 0)),
          easing: window.__wbk?.easing ? window.__wbk.easing(a) : String(a.effect?.getTiming().easing ?? 'linear'),
        };
      })
      .filter((a) => a.durationMs > 0)
      .slice(0, 40);
  });
  const finished = await page.evaluate(() =>
    Promise.race([
      Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
          .map((a) => a.finished.catch(() => null)),
      ).then(() => true),
      new Promise((r) => setTimeout(() => r(false), 4000)),
    ]),
  );
  result.openDurationMs = finished ? Date.now() - t0 : null;
  await sleep(200);
  result.files.open = await shot(page, `${SHOTS}/${vp.name}-menu-open.png`);

  const open = await page.evaluate(() => {
    const describe = (el) => {
      const id = el.id ? `#${el.id}` : '';
      const cls = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).slice(0, 3).map((c) => `.${c}`).join('');
      return `${el.tagName.toLowerCase()}${id}${cls}`;
    };
    const vw = innerWidth;
    const vh = innerHeight;
    const shown = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && r.right > 0 && r.left < vw && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05;
    };
    const appeared = Array.from(document.querySelectorAll('body *')).filter((el) => !el.hasAttribute('data-wbk-before') && shown(el));
    const positioned = (el) => ['fixed', 'absolute'].includes(getComputedStyle(el).position);
    const area = (el) => el.getBoundingClientRect().width * el.getBoundingClientRect().height;
    let panel = appeared.filter((el) => positioned(el) && el.querySelector('a')).sort((a, b) => area(b) - area(a))[0];
    /* Some themes keep the panel visible-but-offscreen and slide it in. */
    panel ??= Array.from(document.querySelectorAll('body *')).find((el) => {
      const r = el.getBoundingClientRect();
      return getComputedStyle(el).position === 'fixed' && el.querySelector('a') && r.width > vw * 0.4 && r.height > vh * 0.5 && r.x >= -2 && r.x < vw;
    });
    /* A dropdown that pushes content down is static, not positioned. */
    panel ??= appeared.filter((el) => el.querySelectorAll('a').length >= 2).sort((a, b) => area(b) - area(a))[0];
    const overlay = appeared.find((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return el !== panel && cs.position === 'fixed' && r.width >= vw * 0.95 && r.height >= vh * 0.95 && !el.querySelector('a') && cs.backgroundColor !== 'rgba(0, 0, 0, 0)';
    });
    if (!panel) return { panel: null, items: [] };
    panel.setAttribute('data-wbk-panel', '1');
    const r = panel.getBoundingClientRect();
    const cs = getComputedStyle(panel);
    const type =
      r.width >= vw * 0.9 && r.height >= vh * 0.9
        ? 'fullscreen'
        : r.height >= vh * 0.8
          ? r.x + r.width / 2 > vw / 2
            ? 'off-canvas-right'
            : 'off-canvas-left'
          : r.y < vh * 0.4
            ? 'dropdown'
            : 'unknown';
    const linkText = (a) => (a.textContent ?? '').trim().replace(/\s+/g, ' ');
    const links = Array.from(panel.querySelectorAll('a')).filter((a) => a.offsetWidth > 0 && linkText(a));
    const items = links.map((a) => {
      let depth = 0;
      for (let p = a.parentElement; p && p !== panel; p = p.parentElement) if (p.tagName === 'UL' || p.tagName === 'OL') depth++;
      return { text: linkText(a).slice(0, 60), href: a.getAttribute('href') ?? '', depth: Math.max(0, depth - 1) };
    });
    const first = links[0] ? getComputedStyle(links[0]) : null;
    const locked = (el) => {
      const s = getComputedStyle(el);
      return s.overflow === 'hidden' || s.overflowY === 'hidden' || s.position === 'fixed';
    };
    return {
      panel: {
        selector: describe(panel),
        type,
        rect: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
        background: cs.backgroundColor,
        zIndex: cs.zIndex,
      },
      overlay: overlay ? { selector: describe(overlay), background: getComputedStyle(overlay).backgroundColor } : null,
      items,
      itemStyle: first
        ? { fontFamily: first.fontFamily, fontSize: first.fontSize, fontWeight: first.fontWeight, color: first.color, letterSpacing: first.letterSpacing, textTransform: first.textTransform }
        : null,
      bodyScrollLocked: locked(document.body) || locked(document.documentElement),
      focusMovedIntoPanel: !!(document.activeElement && panel.contains(document.activeElement)),
      hasCloseButton: Array.from(panel.querySelectorAll('button, a')).some((b) => /close|×|✕/i.test(`${b.innerText} ${b.getAttribute('aria-label') ?? ''} ${b.getAttribute('class') ?? ''}`)),
    };
  });
  Object.assign(result, {
    panel: open.panel,
    overlay: open.overlay,
    items: open.items,
    itemStyle: open.itemStyle,
    behaviour: {
      bodyScrollLocked: !!open.bodyScrollLocked,
      focusMovedIntoPanel: !!open.focusMovedIntoPanel,
      hasCloseButton: !!open.hasCloseButton,
    },
  });
  result.toggle.ariaExpandedAfter = await page.evaluate(() => {
    const el = document.querySelector('[data-wbk-toggle]');
    return (el?.closest('button, a, [role=button]') ?? el)?.getAttribute('aria-expanded') ?? null;
  });

  /* How a submenu opens inside the panel: the first closed one, by its own toggle. */
  if (open.panel) {
    await page.evaluate(HELPERS).catch(() => {});
    const found = await page.evaluate(SUBMENU_FIND).catch((e) => ({ found: false, reason: e.message.split('\n')[0] }));
    if (found.found) {
      try {
        await page.click('[data-wbk-subtoggle]');
      } catch {
        await page.evaluate(() => document.querySelector('[data-wbk-subtoggle]')?.click()).catch(() => {});
      }
      await sleep(60);
      const anims = await page.evaluate(() => window.__wbk.anims(document.querySelector('[data-wbk-panel]'))).catch(() => []);
      await animationsDone(page, 1200);
      const read = await page.evaluate(SUBMENU_READ, found).catch(() => ({ behaviour: 'unknown' }));
      const file = await shot(page, `${SHOTS}/${vp.name}-submenu-open.png`);
      result.submenu = { viewport: vp.name, ...found, ...read, animations: read.animations?.length ? read.animations : anims, file };
    } else {
      result.submenu = { viewport: vp.name, ...found };
    }
  }

  const panelVisible = () =>
    page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('body *')).filter((el) => !el.hasAttribute('data-wbk-before'));
      return items.some((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return el.querySelector?.('a') && r.width > 0 && r.height > 0 && r.right > 0 && r.left < innerWidth && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05;
      });
    });
  await page.keyboard.press('Escape');
  await sleep(800);
  result.behaviour.escCloses = open.panel ? !(await panelVisible()) : null;
  if (open.panel && !result.behaviour.escCloses) {
    await page.click('[data-wbk-toggle]').catch(() => {});
    await sleep(800);
    result.behaviour.toggleCloses = !(await panelVisible());
  }
  return result;
}

/** No toggle at this width: the nav is inline. Record it, and hover the first dropdown. */
async function captureInlineNav(page, vp) {
  const nav = await page.evaluate((sel) => {
    const header = Array.from(document.querySelectorAll(sel)).find((e) => e.offsetHeight > 0);
    const scope = header?.querySelector('nav') ?? document.querySelector('nav') ?? header;
    if (!scope) return null;
    const links = Array.from(scope.querySelectorAll('a')).filter((a) => a.offsetWidth > 0 && a.textContent.trim());
    const parent = Array.from(scope.querySelectorAll('li')).find((li) => {
      const sub = li.querySelector('ul, .sub-menu, [class*="dropdown"]');
      return sub && li.offsetWidth > 0 && (sub.offsetHeight === 0 || getComputedStyle(sub).visibility === 'hidden' || Number(getComputedStyle(sub).opacity) < 0.05);
    });
    parent?.querySelector('a')?.setAttribute('data-wbk-hover', '1');
    const first = links[0] ? getComputedStyle(links[0]) : null;
    return {
      items: links.slice(0, 30).map((a) => {
        let depth = 0;
        for (let p = a.parentElement; p && p !== scope; p = p.parentElement) if (p.tagName === 'UL' || p.tagName === 'OL') depth++;
        return { text: a.textContent.trim().replace(/\s+/g, ' ').slice(0, 60), href: a.getAttribute('href') ?? '', depth: Math.max(0, depth - 1) };
      }),
      itemStyle: first ? { fontFamily: first.fontFamily, fontSize: first.fontSize, fontWeight: first.fontWeight, color: first.color, letterSpacing: first.letterSpacing, textTransform: first.textTransform } : null,
      hasDropdown: !!parent,
    };
  }, HEADER_SEL);
  if (!nav?.items.length) return { inline: null };

  /* Every top-level item with children: hover, then focus, then (only for a
     toggle or a link to nowhere) click. Each open panel measured and shot. */
  await page.evaluate(HELPERS).catch(() => {});
  const tree = await page.evaluate(NAV_TREE, HEADER_SEL).catch(() => null);
  const panels = [];
  const slugs = new Set();
  const away = async () => {
    await page.evaluate(() => document.activeElement?.blur?.()).catch(() => {});
    await page.mouse.move(vp.width - 2, vp.height - 2);
    await sleep(60);
    await animationsDone(page, 1000);
  };
  for (const parent of (tree?.parents ?? []).slice(0, 12)) {
    let slug = slugOf(parent.text);
    while (slugs.has(slug)) slug += '-2';
    slugs.add(slug);
    const probe = { index: parent.index, sel: HEADER_SEL };
    const readPanel = () => page.evaluate(NAV_PANEL, probe).catch((e) => ({ open: false, error: e.message.split('\n')[0] }));
    const shootPanel = async (panel) => {
      const u = panel.unionWithHeader;
      if (!u) return null;
      const x = Math.max(0, u.x);
      const y = Math.max(0, u.y);
      const width = Math.min(vp.width, u.right) - x;
      const height = Math.min(vp.height, u.bottom + 16) - y;
      return width > 0 && height > 0 ? shot(page, `${SHOTS}/nav-${slug}.png`, { clip: { x, y, width, height } }) : null;
    };
    await away();
    let trigger = null;
    let animations = [];
    let file = null;
    let nested = null;
    await page.hover(`[data-wbk-nav="${parent.index}"]`).catch(() => {});
    await sleep(50);
    animations = await page.evaluate((i) => window.__wbk.anims(document.querySelector(`[data-wbk-nav-li="${i}"]`)), parent.index).catch(() => []);
    await animationsDone(page, 1200);
    let panel = await readPanel();
    if (panel.open) {
      trigger = 'hover';
      file = await shootPanel(panel);
      const n = await page.evaluate(NAV_NESTED, parent.index).catch(() => null);
      if (n?.alwaysShown) nested = { item: n.text, direction: 'inline (always shown)' };
      else if (n) {
        await page.hover('[data-wbk-nested]').catch(() => {});
        await sleep(80);
        await animationsDone(page, 1000);
        nested = { item: n.text, ...((await page.evaluate(NAV_NESTED_DIR).catch(() => null)) ?? { opens: false }) };
      }
    }
    /* Focus, separately: a panel that opens on hover only is unreachable by keyboard. */
    await away();
    await page.evaluate((i) => document.querySelector(`[data-wbk-nav="${i}"]`)?.focus(), parent.index).catch(() => {});
    await sleep(80);
    const focusAnims = await page.evaluate((i) => window.__wbk.anims(document.querySelector(`[data-wbk-nav-li="${i}"]`)), parent.index).catch(() => []);
    await animationsDone(page, 1000);
    const focused = await readPanel();
    if (!panel.open && focused.open) {
      panel = focused;
      trigger = 'focus';
      animations = focusAnims;
      file = await shootPanel(panel);
    }
    if (!panel.open && (parent.hasToggle || ['#', ''].includes(parent.href))) {
      await away();
      const sel = parent.hasToggle ? `[data-wbk-nav-li="${parent.index}"] > button, [data-wbk-nav-li="${parent.index}"] > [aria-expanded]:not(a)` : `[data-wbk-nav="${parent.index}"]`;
      await page.click(sel).catch(() => {});
      await sleep(50);
      animations = await page.evaluate((i) => window.__wbk.anims(document.querySelector(`[data-wbk-nav-li="${i}"]`)), parent.index).catch(() => []);
      await animationsDone(page, 1200);
      panel = await readPanel();
      if (panel.open) {
        trigger = 'click';
        file = await shootPanel(panel);
      }
      await page.keyboard.press('Escape').catch(() => {});
    }
    const { unionWithHeader, ...measured } = panel;
    panels.push({ item: parent.text, slug, trigger: trigger ?? 'did not open', opensOnHover: trigger === 'hover', opensOnFocus: !!focused.open, animations, ...measured, nested, file });
  }
  await away();

  /* The first dropdown, in the shape earlier captures recorded it. */
  const first = panels[0];
  const dropdown = first
    ? { opensOnHover: first.opensOnHover, animations: first.animations.map((x) => ({ name: x.property, durationMs: x.durationMs, easing: x.easing })), file: first.file }
    : null;
  return { inline: { items: nav.items, itemStyle: nav.itemStyle, dropdown, tree: tree?.tree ?? [], panels } };
}

/* ── Capture ───────────────────────────────────────────────────────────── */

mkdirSync(RECON, { recursive: true });
mkdirSync(SHOTS, { recursive: true });
mkdirSync(CACHE, { recursive: true });

const runStart = Date.now();
const phases = [];
const phase = (name, since) => phases.push(`${name} ${secs(Date.now() - since)}`);
function secs(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

const failures = [];
const refused = new Set();
let abortedWrites = 0;
const results = [];
const unfinished = [];
const fromCache = [];
const notMeasured = [];

/* ── The cache: one file per URL, width and probe version ── */
const cacheFile = (url, vp) => `${CACHE}/${createHash('sha1').update(`${PROBE_VERSION}|${url}|${vp.name}|${vp.width}x${vp.height}`).digest('hex').slice(0, 20)}.json`;
function readCache(url, vp) {
  const file = cacheFile(url, vp);
  try {
    if (Date.now() - statSync(file).mtimeMs > CACHE_MAX_AGE_MS) return null;
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    return saved.version === PROBE_VERSION && saved.url === url ? saved.result : null;
  } catch {
    return null;
  }
}
const writeCache = (url, vp, result) => {
  try {
    writeFileSync(cacheFile(url, vp), JSON.stringify({ version: PROBE_VERSION, url, viewport: vp.name, savedAt: new Date().toISOString(), result }));
  } catch {
    /* a cache that cannot be written costs a re-measure next time, nothing more */
  }
};

const tasks = [];
for (const { path, family } of PAGES) {
  for (const vp of VIEWPORTS) {
    const url = ORIGIN + path;
    const label = `${vp.name.padEnd(7)} ${path}`;
    const measureThis = only ? path === only : true;
    const cached = (only ? path !== only : !refresh) ? readCache(url, vp) : null;
    if (cached) {
      results.push(cached);
      fromCache.push(label.trim());
      console.log(`  ${GREEN}✓${RESET} ${label}  ${DIM}${family} · from recon/.cache${RESET}`);
    } else if (measureThis) {
      tasks.push({ path, family, vp, url, label });
    } else {
      notMeasured.push(label.trim());
    }
  }
}
if (notMeasured.length) console.log(`  ${YELLOW}!${RESET} not in the cache and not --only, so not measured: ${notMeasured.join(', ')}`);

/*
 * ⚠ chrome-headless-shell FIRST, and the reason is not speed. Full headless
 *   Chrome produces frames in step with the machine's display: with the display
 *   asleep — a long unattended run, a closed lid — `captureScreenshot` never
 *   returns, on any page. A gate run of this script sat 24 minutes on its first
 *   screenshot that way. Puppeteer installs both; fall back if the shell is
 *   absent. The protocol timeout turns any remaining stall into an error that
 *   shot() survives, instead of a hang.
 *
 * ⚠ AND THE BACKGROUNDING FLAGS, because tabs run side by side. A tab Chrome
 *   thinks is in the background has its timers throttled to once a second,
 *   which turns a 1s carousel into a "4s" one and a 600ms reveal into nothing
 *   at all — wrong numbers, not an error.
 */
async function launch() {
  const opts = {
    args: ['--no-sandbox', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
    protocolTimeout: 60000,
  };
  try {
    return { browser: await puppeteer.launch({ ...opts, headless: 'shell' }), engine: 'chrome-headless-shell' };
  } catch {
    return { browser: await puppeteer.launch(opts), engine: 'chrome (full headless — screenshots stall while the display sleeps)' };
  }
}

let browser = null;
let UA = '';

async function openPage(vp) {
  const page = await browser.newPage();
  await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: vp.scale, isMobile: vp.mobile, hasTouch: vp.mobile });
  await page.setUserAgent(UA);
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (req.isInterceptResolutionHandled()) return;
    const url = req.url();
    if (/^(data|blob):/.test(url)) return req.continue();
    /* ⚠ READ-ONLY IS ENFORCED HERE, NOT HOPED FOR. Opening a menu, hovering
       a dropdown or a script on load can POST — a form, admin-ajax, a
       tracking endpoint. None of it leaves this browser. */
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) {
      abortedWrites++;
      return req.abort('blockedbyclient');
    }
    if (COLLECTORS.test(url)) return req.abort('blockedbyclient');
    if (req.isNavigationRequest() && req.frame() === page.mainFrame()) {
      const why = blockedReason(url, { allowInternal });
      if (why) {
        refused.add(`${why.reason} — the old site redirected there`);
        return req.abort('blockedbyclient');
      }
    }
    return req.continue();
  });
  return page;
}

const firstLine = (e) => String(e?.message ?? e).split('\n')[0];

/** One page at one width: everything this script knows how to measure. */
async function measure({ path, family, vp, url }) {
  const page = await openPage(vp);
  const started = Date.now();
  try {
    const res = await page.goto(url, { waitUntil: 'load', timeout: 45000 });
    const status = res?.status() ?? 0;
    if (status >= 400) throw new Error(`HTTP ${status}`);
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 8000 }).catch(() => {});
    await page.addStyleTag({ content: `${CONSENT} { display: none !important; }` }).catch(() => {});
    await page.evaluate(HELPERS);
    const out = { path, family, viewport: vp.name, width: vp.width, url };

    /* Movement first, at rest: a scroll moves everything. */
    if (vp.name === 'desktop' || path === '/') {
      out.watch = await page.evaluate(WATCH, { baseMs: 1500, maxMs: 12000 }).catch((e) => ({ found: [], rotating: [], error: firstLine(e) }));
    }
    /* Then scroll in steps — which is also the walk that loads lazy content. */
    out.scroll = await page.evaluate(SCROLL_MOTION, {}).catch((e) => ({ error: firstLine(e), libraries: [], reveals: [], parallax: [] }));
    if (out.scroll.error) await walk(page);
    /* Back at the top, a header that changes on scroll is still transitioning back. */
    await animationsDone(page, 1500);
    await page.evaluate(() => document.fonts?.ready).catch(() => {});
    await sleep(150);
    out.data = await page.evaluate(CAPTURE);
    out.blueprint = await page.evaluate(BLUEPRINT).catch((e) => ({ error: firstLine(e), sections: [] }));

    if (path === '/') {
      out.header = await captureHeader(page, vp).catch((e) => ({ viewport: vp.name, found: false, error: firstLine(e) }));
      out.menu = await captureMenu(page, vp).catch((e) => ({ viewport: vp.name, found: false, error: firstLine(e) }));
    }
    out.elapsedMs = Date.now() - started;
    out.measuredAt = new Date().toISOString();
    /* Polite: a pause after each load, per tab. */
    await sleep(PAUSE_MS);
    return out;
  } finally {
    await page.close().catch(() => {});
  }
}

let budgetHit = false;
let lastLine = Date.now();
const say = (line) => {
  console.log(line);
  lastLine = Date.now();
};

if (tasks.length) {
  const t = Date.now();
  const launched = await launch();
  browser = launched.browser;
  say(`  ${DIM}browser: ${launched.engine}${RESET}\n`);
  /* Says what it is. A real browser's string plus a name and a purpose, so an
     operator reading their logs can tell this was a read-only capture. */
  UA = `${await browser.userAgent()} website-build-kit-design/1 (read-only design capture)`;
  phase('launch', t);

  const t1 = Date.now();
  const deadline = runStart + budgetMin * 60000;
  let budgetTimer;
  const budgetGate = new Promise((resolve) => {
    budgetTimer = setTimeout(() => {
      budgetHit = true;
      resolve();
    }, Math.max(0, deadline - Date.now()));
  });
  const inflight = new Map();
  /* A run must never go quiet: every 15s of silence names what is still running. */
  const heartbeat = setInterval(() => {
    if (inflight.size && Date.now() - lastLine > 15000) {
      say(`  ${DIM}… still measuring ${[...inflight.entries()].map(([k, at]) => `${k.trim()} (${secs(Date.now() - at)})`).join(', ')}${RESET}`);
    }
  }, 5000);

  const queue = [...tasks];
  const worker = async () => {
    while (queue.length && !budgetHit) {
      const task = queue.shift();
      inflight.set(task.label, Date.now());
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`no answer in ${TASK_TIMEOUT_MS / 1000}s — abandoned`)), TASK_TIMEOUT_MS);
      });
      const outOfBudget = budgetGate.then(() => {
        throw new Error('budget');
      });
      try {
        const out = await Promise.race([measure(task), timeout, outOfBudget]);
        results.push(out);
        writeCache(task.url, task.vp, out);
        say(`  ${GREEN}✓${RESET} ${task.label}  ${DIM}${task.family} · ${secs(out.elapsedMs)}${RESET}`);
      } catch (err) {
        if (budgetHit) unfinished.push(task.label.trim());
        else {
          failures.push({ path: task.path, viewport: task.vp.name, reason: firstLine(err) });
          say(`  ${RED}✗${RESET} ${task.label}  ${DIM}${firstLine(err)}${RESET}`);
        }
      } finally {
        clearTimeout(timer);
        inflight.delete(task.label);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  clearInterval(heartbeat);
  clearTimeout(budgetTimer);
  for (const task of queue) unfinished.push(task.label.trim());
  phase(`capture (${tasks.length} page-width(s), ${Math.min(concurrency, tasks.length)} at a time)`, t1);
  /* A browser stuck mid-evaluate can make close() wait for ever too. */
  await Promise.race([browser.close().catch(() => {}), sleep(5000)]);
}

const order = (r) => PAGES.findIndex((p) => p.path === r.path) * 10 + VIEWPORTS.findIndex((v) => v.name === r.viewport);
results.sort((x, y) => order(x) - order(y));
const captures = results.filter((r) => r.data).map((r) => ({ path: r.path, family: r.family, viewport: r.viewport, width: r.width, data: r.data }));
const headers = results.filter((r) => r.header).map((r) => r.header);
const menus = results.filter((r) => r.menu).map((r) => r.menu);
const moving = results.filter((r) => r.watch?.found?.length).map((r) => ({ path: r.path, viewport: r.viewport, found: r.watch.found }));
const partial = budgetHit ? `the ${budgetMin}-minute budget ran out with ${unfinished.length} page-width(s) unmeasured: ${unfinished.join(', ')}` : null;

if (!captures.length) {
  if (budgetHit) {
    writeFileSync(`${RECON}/design.json`, JSON.stringify({ origin: ORIGIN, capturedAt: new Date().toISOString(), partial, run: { budgetMinutes: budgetMin, unfinished } }, null, 2) + '\n');
    console.error(`\n${RED}✗ budget spent${RESET} — ${partial}. Nothing finished; raise --budget or measure fewer pages (--limit, --only).`);
    process.exit(1);
  }
  console.error(`\n${RED}✗ nothing captured${RESET} — ${failures[0]?.reason ?? 'no page loaded'}. Is ${ORIGIN} reachable?`);
  process.exit(1);
}

/* ── Aggregate ─────────────────────────────────────────────────────────── */

const hexOf = (value) => {
  const c = parseColor(value);
  return c && c.a >= 0.5 ? toHex(c) : null;
};

function aggregate() {
  const at = (vp) => captures.filter((c) => c.viewport === vp);
  const desktop = at('desktop');
  const home = (vp) => captures.find((c) => c.viewport === vp && c.path === '/');

  const colours = new Map();
  for (const c of captures) {
    for (const { value, count, usage } of c.data.colors) {
      const hex = hexOf(value);
      if (!hex) continue;
      const row = colours.get(hex) ?? { hex, text: 0, background: 0, border: 0 };
      row[usage] += count;
      colours.set(hex, row);
    }
  }

  /* Per viewport and tag, the record whose size most pages agree on. */
  const typography = {};
  for (const vp of VIEWPORTS.map((v) => v.name)) {
    typography[vp] = {};
    for (const tag of ['body', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'li', 'blockquote', 'small']) {
      const recs = at(vp).map((c) => c.data.typography[tag]).filter(Boolean);
      const size = mostCommonOf(recs.map((r) => r.fontSize));
      typography[vp][tag] = recs.find((r) => r.fontSize === size) ?? null;
    }
  }

  const stacks = (tags) => desktop.flatMap((c) => tags.map((t) => c.data.typography[t]?.fontFamily)).filter(Boolean);
  const displayStack = mostCommonOf(stacks(['h1', 'h2', 'h3'])) ?? null;
  const bodyStack = mostCommonOf(stacks(['p', 'body'])) ?? null;

  const fontWeights = {};
  for (const c of captures) {
    for (const [fam, ws] of Object.entries(c.data.fontWeights)) fontWeights[fam] = [...new Set([...(fontWeights[fam] ?? []), ...ws])];
  }

  const fontSources = {};
  const faces = captures.flatMap((c) => c.data.fontFaces);
  const links = [...new Set(captures.flatMap((c) => c.data.fontLinks))];
  const resources = [...new Set(captures.flatMap((c) => c.data.fontResources))];
  const families = [...new Set(captures.flatMap((c) => c.data.fonts.map((f) => primaryFamily(f.family))))];
  for (const family of families) {
    const key = family.toLowerCase();
    const google = links.find((l) => /fonts\.googleapis\.com/.test(l) && decodeURIComponent(l).replace(/\+/g, ' ').toLowerCase().includes(`family=${key}`));
    const face = faces.find((f) => f.family.toLowerCase() === key);
    const srcUrl = face ? /url\(["']?([^"')]+)/.exec(face.src)?.[1] : null;
    let abs = null;
    try {
      abs = srcUrl ? new URL(srcUrl, face.sheet || ORIGIN) : null;
    } catch {
      abs = null;
    }
    if (google) fontSources[key] = { kind: 'google-fonts', where: 'fonts.googleapis.com' };
    else if (abs && /fonts\.gstatic\.com/.test(abs.host)) fontSources[key] = { kind: 'google-fonts', where: 'fonts.gstatic.com' };
    else if (abs && /typekit/.test(abs.host)) fontSources[key] = { kind: 'adobe-fonts', where: abs.host };
    else if (abs && abs.origin === new URL(ORIGIN).origin) fontSources[key] = { kind: 'self-hosted', where: abs.pathname };
    else if (abs) fontSources[key] = { kind: 'other-cdn', where: abs.host };
    else if (links.some((l) => /typekit/.test(l))) fontSources[key] = { kind: 'adobe-fonts', where: 'use.typekit.net (inferred: no readable @font-face, and the page loads Typekit)' };
    else fontSources[key] = { kind: 'unknown' };
  }

  const widths = new Map();
  for (const c of desktop) for (const { width, count } of c.data.containerWidths) widths.set(width, (widths.get(width) ?? 0) + count);
  const bestWidth = [...widths.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const gutter = Object.fromEntries(VIEWPORTS.map((v) => [v.name, mostCommonOf(at(v.name).map((c) => c.data.gutter))]));
  let containerWidth = bestWidth ?? null;
  let containerWhy = bestWidth ? `the most common centred container on desktop: ${bestWidth}px of content` : '';
  if (!containerWidth && gutter.desktop && gutter.mobile && gutter.desktop > gutter.mobile * 2) {
    containerWidth = 1440 - gutter.desktop * 2;
    containerWhy = `inferred from the desktop text edge (${gutter.desktop}px each side at 1440)`;
  }

  const mediaRadius = mostCommonOf(desktop.map((c) => c.data.mediaRadius));
  const buttonRadius = mostCommonOf(
    desktop
      .flatMap((c) => c.data.buttons)
      .map((b) => ({ r: parseFloat(b.styles.borderRadius), h: b.styles.height }))
      .filter((b) => Number.isFinite(b.r) && b.r < b.h / 2 - 1)
      .map((b) => Math.round(b.r)),
  );
  const radius =
    mediaRadius !== undefined
      ? { value: mediaRadius, reference: 16, why: 'photo corners, against --radius-m' }
      : buttonRadius !== undefined
        ? { value: buttonRadius, reference: 10, why: 'button corners, against --radius-s' }
        : null;

  const headerRows = VIEWPORTS.map((v) => ({ vp: v.name, h: home(v.name)?.data.header?.height ?? 0 })).filter((r) => r.h > 0 && r.h < 400);
  const tallest = headerRows.sort((a, b) => b.h - a.h)[0];

  return {
    colours: [...colours.values()],
    pageBackground: hexOf(home('desktop')?.data.pageBackground ?? desktop[0]?.data.pageBackground) ?? null,
    bodyColour: hexOf(typography.desktop.p?.color ?? typography.desktop.body?.color) ?? null,
    linkColour: hexOf(typography.desktop.a?.color) ?? null,
    buttonFills: desktop.flatMap((c) => c.data.buttons).filter((b) => b.styles.paintedBy !== 'border').map((b) => hexOf(b.styles.background)).filter(Boolean),
    displayStack,
    bodyStack,
    fontWeights,
    fontSources,
    typography,
    containerWidth,
    containerWhy,
    gutter,
    radius,
    headerHeight: tallest?.h ?? null,
    headerWhere: tallest?.vp ?? '',
  };
}

const agg = aggregate();
const proposal = proposeTokens(agg, { uncapped });
const snippet = fontFaceSnippet(proposal.fonts);
const capturedAt = new Date().toISOString();

/* ── Write ─────────────────────────────────────────────────────────────── */

const tWrite = Date.now();
const run = {
  measured: results.filter((r) => !fromCache.includes(`${r.viewport.padEnd(7)} ${r.path}`.trim())).map((r) => `${r.viewport} ${r.path}`),
  fromCache,
  notMeasured,
  unfinished,
  concurrency,
  budgetMinutes: budgetMin,
  only,
  probeVersion: PROBE_VERSION,
};

writeFileSync(
  `${RECON}/design.json`,
  JSON.stringify({ origin: ORIGIN, capturedAt, ...(partial ? { partial } : {}), run, pages: PAGES, viewports: VIEWPORTS, failures, aggregate: agg, proposal, captures }, null, 2) + '\n',
);

/* ── The blueprint ── */
const vpList = VIEWPORTS.map((v) => ({ name: v.name, width: v.width }));
const siteBreakpoints = [...new Set(captures.flatMap((c) => c.data.breakpoints))].sort((a, b) => a - b);
const desktopMenu = menus.find((m) => m.viewport === 'desktop');
const nav = {
  desktop: desktopMenu?.inline ? { tree: desktopMenu.inline.tree ?? [], panels: desktopMenu.inline.panels ?? [] } : null,
  submenus: menus.filter((m) => m.submenu).map((m) => m.submenu),
};
const bpPages = PAGES.map(({ path, family }) => {
  const at = (vp) => results.find((r) => r.path === path && r.viewport === vp);
  const byVp = Object.fromEntries(VIEWPORTS.map((v) => [v.name, at(v.name)?.blueprint]).filter(([, b]) => b && !b.error));
  if (!Object.keys(byVp).length) return null;
  const sections = mergeSections(byVp);
  const heroOf = Object.fromEntries(Object.entries(byVp).filter(([, b]) => b.hero).map(([v, b]) => [v, b.hero]));
  const scroll = Object.fromEntries(VIEWPORTS.map((v) => [v.name, at(v.name)?.scroll]).filter(([, x]) => x));
  for (const row of sections) {
    row.motion = Object.fromEntries(Object.entries(row.vp).map(([v, sec]) => [v, motionFor(sec, scroll[v])]));
  }
  return {
    path,
    family,
    slug: pageSlug(path),
    method: Object.values(byVp)[0].method,
    hero: Object.keys(heroOf).length ? heroOf : null,
    rotating: Object.fromEntries(VIEWPORTS.map((v) => [v.name, at(v.name)?.watch?.rotating]).filter(([, x]) => x?.length)),
    sections,
    footer: Object.fromEntries(Object.entries(byVp).filter(([, b]) => b.footer).map(([v, b]) => [v, b.footer])),
    scroll,
    thirdPartyScripts: [...new Set(Object.values(byVp).flatMap((b) => b.thirdPartyScripts ?? []))],
  };
}).filter(Boolean);
const bp = { origin: ORIGIN, capturedAt, partial, viewports: vpList, siteBreakpoints, header: headers, nav, pages: bpPages };

writeFileSync(
  `${RECON}/interactions.json`,
  JSON.stringify(
    {
      origin: ORIGIN,
      capturedAt,
      menu: menus,
      nav,
      header: headers,
      moving,
      rotating: results.filter((r) => r.watch?.rotating?.length).map((r) => ({ path: r.path, viewport: r.viewport, rotating: r.watch.rotating })),
      scroll: results.filter((r) => r.scroll).map((r) => ({ path: r.path, viewport: r.viewport, ...r.scroll })),
    },
    null,
    2,
  ) + '\n',
);
writeFileSync(
  `${RECON}/sections.json`,
  JSON.stringify(
    {
      origin: ORIGIN,
      capturedAt,
      ...(partial ? { partial } : {}),
      note: 'Per page: hero, every top-level section (merged across widths), footer. Sizes in px at each viewport; recon/blueprint.proposed.css has them as clamp() CSS.',
      viewports: vpList,
      siteBreakpoints,
      pages: bpPages.map(({ scroll, ...rest }) => ({ ...rest, scroll: Object.fromEntries(Object.entries(scroll).map(([v, x]) => [v, { libraries: x.libraries, reveals: x.reveals, parallax: x.parallax }])) })),
    },
    null,
    2,
  ) + '\n',
);
writeFileSync(`${RECON}/blueprint.md`, blueprintMd(bp));
writeFileSync(`${RECON}/blueprint.proposed.css`, blueprintCss(bp));

const note = `Sampled from ${ORIGIN} by \`npm run design\` on ${capturedAt.slice(0, 10)}.`;
const base = existsSync(TOKENS) ? readFileSync(TOKENS, 'utf8') : `:root {\n${proposal.vars.map((v) => `  ${v.name}: initial;`).join('\n')}\n}\n`;
const proposed = writeTokens(base, proposal.vars, { decide: true, note });
writeFileSync(
  `${RECON}/tokens.proposed.css`,
  `/* PROPOSED — not applied. ${note}\n` +
    `   This is ${TOKENS} with the measured values written in. Diff it against\n` +
    `   the real file; \`npm run design -- --apply\` writes exactly this.\n` +
    `   recon/design.md explains every value and lists what was left alone. */\n\n` +
    proposed.css +
    (snippet.css
      ? `\n/* ── Suggested @font-face for src/styles/global.css — NOT part of tokens.css.\n` +
        `   Then add ${snippet.preload.map((p) => `'${p}'`).join(' and ')} to preloadFonts in src/data/fonts.ts.\n\n` +
        snippet.css.replace(/\*\//g, '*\\/').replace(/^/gm, '   ') +
        `\n   ─────────────────────────────────────────────────────────────────────── */\n`
      : ''),
);

writeFileSync(`${RECON}/design.md`, report());
phase('reports', tWrite);

/* ── Print ─────────────────────────────────────────────────────────────── */

const p = proposal.palette;
console.log(`\n${BOLD}── Proposed ${'─'.repeat(48)}${RESET}`);
console.log(`  ground  ${p.ground.hex}   ink ${p.ink.hex}   brand ${p.brand?.hex ?? '—'}   accent ${p.accent?.hex ?? '—'}`);
console.log(`  faces   ${proposal.fonts.display?.family ?? '—'} / ${proposal.fonts.body?.family ?? '—'}`);
console.log(`  ${proposal.vars.length} token(s) decided, ${proposal.kept.length} left at the template value`);
for (const w of proposal.warnings) console.log(`  ${YELLOW}!${RESET} ${w}`);
const menuLine = menus.map((m) => `${m.viewport}: ${m.found ? m.panel?.type ?? 'toggle, no panel found' : m.inline ? 'inline nav' : 'none'}`).join('  ');
console.log(`  menu    ${menuLine}`);
if (nav.desktop?.panels.length) console.log(`  nav     ${nav.desktop.panels.map((x) => `${x.item}: ${x.open ? `${x.type}${x.columns > 1 ? ` ×${x.columns}` : ''} on ${x.trigger}` : 'did not open'}`).join(' · ')}`);
const movingCount = moving.reduce((n, m) => n + m.found.length, 0);
if (movingCount) console.log(`  motion  ${movingCount} carousel/marquee instance(s) — recon/interactions.json`);
const reveals = results.reduce((n, r) => n + (r.scroll?.reveals?.length ?? 0), 0);
const layers = results.reduce((n, r) => n + (r.scroll?.parallax?.length ?? 0), 0);
if (reveals || layers) console.log(`  scroll  ${reveals} reveal group(s), ${layers} parallax layer(s)`);
console.log(`  blocks  ${bpPages.reduce((n, pg) => n + pg.sections.length, 0)} section(s) on ${bpPages.length} page(s) — recon/blueprint.md`);
if (failures.length) console.log(`  ${YELLOW}!${RESET} ${failures.length} capture(s) failed: ${failures.map((f) => `${f.path} @${f.viewport}`).join(', ')}`);
for (const r of refused) console.log(`  ${YELLOW}refused${RESET} ${r}`);
if (shotErrors.length) console.log(`  ${YELLOW}!${RESET} ${shotErrors.length} screenshot(s) not taken (measurements kept): ${shotErrors[0]}`);
if (abortedWrites) console.log(`  ${DIM}${abortedWrites} non-GET request(s) aborted before they left — read-only${RESET}`);
console.log(`  ${DIM}time    ${[...phases, `total ${secs(Date.now() - runStart)}`].join(' · ')}${fromCache.length ? ` · ${fromCache.length} from cache (--refresh to re-measure)` : ''}${RESET}`);
console.log(`\n  ${GREEN}✓${RESET} ${RECON}/design.md · design.json · interactions.json · tokens.proposed.css · sections.json · blueprint.md · blueprint.proposed.css · ${SHOTS}/`);

if (partial) {
  console.error(`\n${RED}✗ budget spent${RESET} — ${partial}.\n  The reports above are PARTIAL. Re-run: what finished is cached, so the next run starts where this stopped.`);
  process.exit(1);
}
if (apply) {
  process.exit(applyProposal(proposal, ORIGIN, capturedAt) ? 0 : 1);
}
console.log(`  ${DIM}Read recon/design.md and recon/blueprint.md, then: npm run design -- --apply${RESET}\n`);
process.exit(0);

/* ── --apply ───────────────────────────────────────────────────────────── */

function applyProposal(prop, origin, when) {
  if (!existsSync(TOKENS)) {
    console.error(`${RED}✗${RESET} no ${TOKENS} here — run this from the site's root.`);
    return false;
  }
  const css = readFileSync(TOKENS, 'utf8');
  /* ⚠ ONLY OVER AN UNDECIDED FILE. Once --unset is gone somebody has made
     decisions in this file, and a capture re-run must not quietly overwrite
     them. The proposal is still in recon/ to diff by hand. */
  if (!isUndecided(css)) {
    console.error(
      `${RED}✗${RESET} ${TOKENS} is already decided (no --unset), so --apply will not overwrite it.\n` +
        `  Diff recon/tokens.proposed.css against it and take what you want by hand.`,
    );
    return false;
  }
  const out = writeTokens(css, prop.vars, { decide: true, note: `Sampled from ${origin} by \`npm run design\` on ${String(when).slice(0, 10)}.` });
  writeFileSync(TOKENS, out.css);
  console.log(`\n  ${GREEN}✓${RESET} ${out.applied.length} token(s) written to ${TOKENS}; --unset removed`);
  if (out.missing.length) console.log(`  ${YELLOW}!${RESET} not in this tokens.css, skipped: ${out.missing.join(', ')}`);
  console.log(
    `  ${DIM}Next: self-host the faces (recon/design.md §Faces has the @font-face and where to get them),\n` +
      `  list them in src/data/fonts.ts, build the home page. \`npm run tells\` reports half-decided until\n` +
      `  all three are real — that is the gate working, not a fault in what was written.${RESET}\n`,
  );
  return true;
}

/* ── recon/design.md ───────────────────────────────────────────────────── */

function report() {
  const prop = proposal;
  const t = agg.typography;
  const vpNames = VIEWPORTS.map((v) => v.name);
  const home = captures.find((c) => c.path === '/' && c.viewport === 'desktop') ?? captures[0];
  const lines = [];
  const L = (s = '') => lines.push(s);

  L(`# Design capture — ${ORIGIN}`);
  L();
  L(`Captured ${capturedAt.slice(0, 10)} by \`npm run design\`, at ${VIEWPORTS.map((v) => `${v.width}px`).join(' / ')}. Builder: **${home.data.builder}**.`);
  L(`Pages: ${PAGES.map((pg) => `\`${pg.path}\` (${pg.family})`).join(', ')}.${dropped ? ` ${dropped} more famil(ies) not measured (--limit).` : ''}`);
  if (failures.length) L(`\n⚠ Failed: ${failures.map((f) => `\`${f.path}\` @${f.viewport} — ${f.reason}`).join('; ')}`);
  L();
  L('**Faithful migration:** `npm run design -- --apply` writes the proposal into `src/styles/tokens.css`. **Redesign:** read this as the *before* — what the brand already owns — and decide in Round 3; do not apply it.');
  L();

  L('## Palette');
  L();
  L('| role | value | from |');
  L('| --- | --- | --- |');
  for (const role of ['ground', 'ink', 'brand', 'accent']) {
    const c = prop.palette[role];
    L(`| ${role} | ${c ? `\`${c.hex}\`` : '—'} | ${c?.why ?? 'none found'} |`);
  }
  L();
  L('Colours by use, all pages and widths (element counts):');
  L();
  L('| colour | text | background | border |');
  L('| --- | ---: | ---: | ---: |');
  for (const c of [...agg.colours].sort((a, b) => b.text + b.background + b.border - (a.text + a.background + a.border)).slice(0, 16)) {
    L(`| \`${c.hex}\` | ${c.text || ''} | ${c.background || ''} | ${c.border || ''} |`);
  }
  const vars = Object.entries(home.data.rootVariables).filter(([k, v]) => parseColor(v) || /color|colour|palette|primary|secondary|accent/i.test(k));
  if (vars.length) {
    L();
    L(`The builder's own colour variables on \`:root\` (${vars.length}; exact values, the theme's palette):`);
    L();
    for (const [k, v] of vars.slice(0, 30)) L(`- \`${k}\`: \`${v}\``);
  }
  L();

  L('## Faces');
  L();
  L('| family | text elements | source | weights used |');
  L('| --- | ---: | --- | --- |');
  const famCounts = new Map();
  for (const c of captures.filter((x) => x.viewport === 'desktop')) {
    for (const f of c.data.fonts) {
      const fam = primaryFamily(f.family);
      famCounts.set(fam, (famCounts.get(fam) ?? 0) + f.count);
    }
  }
  for (const [fam, n] of [...famCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    const src = agg.fontSources[fam.toLowerCase()];
    L(`| ${fam} | ${n} | ${src?.kind ?? '?'}${src?.where ? ` — ${src.where}` : ''} | ${(agg.fontWeights[fam.toLowerCase()] ?? []).sort().join(', ')} |`);
  }
  L();
  for (const role of ['display', 'body']) {
    const f = prop.fonts[role];
    if (f) L(`- **${role}: ${f.family}** — ${whereToGet(f)}`);
  }
  if (snippet.css) {
    L();
    L('Suggested `@font-face` for `src/styles/global.css` (a suggestion — the files do not exist yet):');
    L();
    L('```css');
    L(snippet.css);
    L('```');
    L();
    L(`Then \`preloadFonts\` in \`src/data/fonts.ts\`: ${snippet.preload.map((x) => `\`'${x}'\``).join(', ')}.`);
  }
  L();

  L('## Type');
  L();
  L(`| tag | ${vpNames.join(' | ')} | weight | line-height | tracking | case |`);
  L(`| --- | ${vpNames.map(() => '---').join(' | ')} | --- | --- | --- | --- |`);
  for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'small']) {
    const d = t.desktop[tag];
    if (!vpNames.some((v) => t[v][tag])) continue;
    L(`| ${tag}${d?.custom ? ' ⚠' : ''} | ${vpNames.map((v) => t[v][tag]?.fontSize ?? '—').join(' | ')} | ${d?.fontWeight ?? ''} | ${d?.lineHeight ?? ''} | ${d?.letterSpacing ?? ''} | ${d?.textTransform ?? ''} |`);
  }
  L();
  L('⚠ = every visible instance had an element-level size, so that row is a one-off, not the theme\'s style.');
  L();

  L('## Buttons');
  L();
  const btns = captures.filter((c) => c.viewport === 'desktop').flatMap((c) => c.data.buttons);
  const seenBtn = new Set();
  for (const b of btns) {
    const key = `${b.styles.background}|${b.styles.color}|${b.styles.borderRadius}|${b.styles.border}`;
    if (seenBtn.has(key) || seenBtn.size >= 6) continue;
    seenBtn.add(key);
    const s = b.styles;
    L(`- "${b.text}" — fill \`${hexOf(s.background) ?? s.background}\` (${s.paintedBy}), text \`${hexOf(s.color) ?? s.color}\`, radius ${s.borderRadius}, border ${s.border}, padding ${s.padding}, ${s.fontSize}/${s.fontWeight}${s.textTransform !== 'none' ? ` ${s.textTransform}` : ''}${s.letterSpacing !== 'normal' ? `, tracking ${s.letterSpacing}` : ''}${s.inHeader ? ' · in the header' : ''}`);
  }
  if (!seenBtn.size) L('_No filled or outlined buttons found._');
  L();

  L('## Layout');
  L();
  L(`- Container: ${agg.containerWidth ? `${agg.containerWidth}px — ${agg.containerWhy}` : 'none found'}`);
  L(`- Text edge (gutter): ${vpNames.map((v) => `${v} ${agg.gutter[v] ?? '—'}px`).join(', ')}`);
  L(`- Corner radius: ${agg.radius ? `${agg.radius.value}px (${agg.radius.why})` : 'none measured'}`);
  L(`- Paragraph gap: ${mostCommonOf(captures.map((c) => c.data.paragraphGap)) ?? '—'}px · list item gap: ${mostCommonOf(captures.map((c) => c.data.listItemGap)) ?? '—'}px`);
  L(`- Header: ${vpNames.map((v) => {
    const h = captures.find((c) => c.path === '/' && c.viewport === v)?.data.header;
    return `${v} ${h ? `${h.height}px ${h.position}` : '—'}`;
  }).join(', ')}`);
  const bps = [...new Set(captures.flatMap((c) => c.data.breakpoints))].sort((a, b) => a - b);
  L(`- Breakpoints in the CSS: ${bps.slice(0, 20).join(', ') || '—'}${bps.length > 20 ? ' …' : ''}`);
  L();

  L('## Interactions');
  L();
  for (const m of menus) {
    if (m.found) {
      L(`- **${m.viewport}** — toggle \`${m.toggle.selector}\`${m.toggle.label ? ` ("${m.toggle.label}")` : ''}, ${m.toggle.isButton ? 'a button' : '⚠ not a button'}, aria-expanded ${m.toggle.ariaExpanded ?? 'absent'} → ${m.toggle.ariaExpandedAfter ?? 'absent'}.`);
      L(`  Opens **${m.panel?.type ?? 'nothing the capture could find'}**${m.panel ? ` (\`${m.panel.selector}\`, ${m.panel.rect.width}×${m.panel.rect.height})` : ''}${m.openDurationMs ? ` in ${m.openDurationMs}ms` : ''}${m.overlay ? ', with an overlay' : ''}.`);
      const timing = [...new Map(m.animations.map((a) => [`${a.name}|${a.durationMs}|${a.easing}`, a])).values()].slice(0, 5);
      if (timing.length) L(`  Motion: ${timing.map((a) => `${a.name || a.kind} ${a.durationMs}ms${a.delayMs ? ` +${a.delayMs}ms` : ''} ${a.easing}`).join('; ')}.`);
      if (m.behaviour) L(`  Esc closes: ${m.behaviour.escCloses === null ? 'n/a' : m.behaviour.escCloses ? 'yes' : '**no**'} · focus moves in: ${m.behaviour.focusMovedIntoPanel ? 'yes' : 'no'} · scroll locked: ${m.behaviour.bodyScrollLocked ? 'yes' : 'no'} · close button: ${m.behaviour.hasCloseButton ? 'yes' : 'no'}`);
      if (m.items.length) L(`  Items (${m.items.length}): ${m.items.map((i) => `${'  '.repeat(i.depth)}${i.text}`).join(' · ')}`);
      if (m.submenu) L(`  Submenus inside it: **${m.submenu.behaviour ?? 'unknown'}**${m.submenu.item ? ` ("${m.submenu.item}")` : ''}${m.submenu.reason ? ` — ${m.submenu.reason}` : ''}.`);
      if (m.files.open || m.files.closed) L(`  Screenshots: ${[m.files.closed, m.files.open].filter(Boolean).map((f) => `\`${f}\``).join(', ')}`);
    } else if (m.inline) {
      L(`- **${m.viewport}** — inline nav, ${m.inline.items.length} links: ${m.inline.items.map((i) => `${i.depth ? '↳ ' : ''}${i.text}`).join(' · ')}.`);
      if (m.inline.dropdown) L(`  First dropdown ${m.inline.dropdown.opensOnHover ? 'opens on hover' : 'did not open on hover'}${m.inline.dropdown.animations.length ? ` — ${m.inline.dropdown.animations.map((a) => `${a.name} ${a.durationMs}ms ${a.easing}`).join('; ')}` : ''}.`);
      for (const pn of m.inline.panels ?? []) L(`  - ${pn.item}: ${pn.open ? `${pn.type}${pn.columns > 1 ? `, ${pn.columns} columns` : ''}, ${pn.geometry.width}×${pn.geometry.height} at ${pn.geometry.x},${pn.geometry.y} from the header, on ${pn.trigger}${pn.opensOnFocus ? '' : ' (⚠ not on keyboard focus)'}` : 'did not open on hover, focus or click'}${pn.file ? ` — \`${pn.file}\`` : ''}`);
    } else {
      L(`- **${m.viewport}** — no menu toggle and no inline nav found${m.error ? ` (${m.error})` : ''}.`);
    }
  }
  L();
  for (const h of headers) {
    if (!h.found) {
      L(`- Header @${h.viewport}: not found${h.error ? ` (${h.error})` : ''}.`);
      continue;
    }
    const b = h.behaviour;
    const traits = [
      b.sticky && 'sticky',
      b.hidesOnScrollDown && 'hides on scroll down',
      b.revealsOnScrollUp && 'reveals on scroll up',
      b.scrollsAway && 'scrolls away with the page',
      b.transparentOverHero && 'transparent over the hero',
    ].filter(Boolean);
    L(`- Header @${h.viewport}: ${traits.join(', ') || 'static'}${h.changes.length ? `; on scroll ${h.changes.join('; ')}` : ''}${h.top.transition ? ` (transition ${h.top.transition})` : ''}.`);
  }
  L();
  if (moving.length) {
    L('Carousels and moving text:');
    L();
    for (const m of moving) {
      for (const f of m.found) {
        L(
          f.kind === 'carousel'
            ? `- \`${m.path}\` @${m.viewport} — carousel (${f.library}), ${f.slides} slide(s), ${f.autoplay ? `autoplays${f.intervalMs ? ` every ${f.intervalMs}ms` : ''}` : 'did not move while watched'}${f.loop === true ? ', loops' : f.loop === false ? ', does not loop' : ''}${f.transition ? `, ${f.transition}` : ''}${f.arrows?.length ? `, ${f.arrows.length} arrow(s)` : ''}${f.dots ? `, ${f.dots.count} dots` : ''} — \`${f.selector}\``
            : `- \`${m.path}\` @${m.viewport} — moving text (${f.library})${f.speedPxPerS ? `, ${f.speedPxPerS}px/s ${f.direction}` : ''}${f.durationMs ? `, ${f.durationMs}ms per loop` : ''}: "${f.text}" — \`${f.selector}\``,
        );
      }
    }
    L();
    L('Anything that moves on its own needs a pause control under WCAG 2.2.2 if it runs past five seconds — `compliance.md`. The old site\'s motion is a fact to reproduce *or* fix, not an instruction.');
  } else {
    L('No carousels or moving text found.');
  }
  L();

  const scrolls = results.filter((r) => r.viewport === 'desktop' && (r.scroll?.reveals?.length || r.scroll?.parallax?.length));
  if (scrolls.length) {
    L('Scroll-driven motion (desktop):');
    L();
    for (const r of scrolls) {
      for (const g of r.scroll.reveals) L(`- \`${r.path}\` — reveal ${g.effect}, ${g.durationMs ?? '?'}ms${g.delayMs ? ` +${g.delayMs}ms` : ''} ${g.easing ?? ''}${g.staggerMs ? `, stagger ${g.staggerMs}ms` : ''}, ×${g.count} (${g.library})`);
      for (const x of r.scroll.parallax) L(`- \`${r.path}\` — parallax ${x.kind}, rate ${x.rate} — \`${x.selector}\``);
    }
    L();
  }
  L('The full blueprint — header, every nav panel, hero, each section and the footer at each width — is in `recon/blueprint.md`, with clamp() CSS in `recon/blueprint.proposed.css`.');
  L();

  L('## Proposed tokens');
  L();
  L('Written to `recon/tokens.proposed.css`; `npm run design -- --apply` writes the same into `src/styles/tokens.css`.');
  L();
  L('| token | value | why |');
  L('| --- | --- | --- |');
  for (const v of prop.vars) L(`| \`${v.name}\` | \`${v.value}\` | ${v.why} |`);
  if (prop.kept.length) {
    L();
    L('Left at the template value:');
    L();
    for (const k of prop.kept) L(`- \`${k.name}\` — ${k.why}`);
  }
  if (prop.warnings.length) {
    L();
    L('Read before applying:');
    L();
    for (const w of prop.warnings) L(`- ⚠ ${w}`);
  }
  L();

  L('## What this cannot see');
  L();
  L('- Anything behind a login, a dark mode, and hover states outside the menu (card lifts, image zooms)');
  L('- A mega menu opened by clicking a real link (it is never followed), and motion slower than the watch — a carousel past 12s, a word past 8s');
  L('- Scroll motion that only fires on a real wheel or touch event, and JS easing curves CSS does not expose');
  L('- The exact breakpoint between two measured widths: the blueprint names the site\'s own breakpoints in that range');
  L('- The licence a face was bought under. "Self-hosted" means the old site serves the file, not that you may');
  L('- Whether the old design was any good. It is measured, not endorsed: contrast failures above are the old site\'s');
  L();
  return lines.join('\n');
}
