/**
 * WCAG 2.2 §1.4.10 Reflow and §1.4.4 Resize Text, against the DEPLOYED site.
 *
 *   npm run reflow                                 # every route, staging
 *   npm run reflow -- --only=/pricing/             # one route, substring match
 *   npm run reflow -- https://example.com          # a different host
 *
 * Reflow: content must work at a 320 CSS-pixel width without a second scroll
 * axis. Resize: text to 200% without loss of content or function.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * `/accessibility/` states that both were tested and passed. On one build that
 * was true when written and false a day later, because a redesign rebuilt every
 * route. A published accessibility statement had been carrying a specific
 * testing claim about a site that no longer existed, and nothing anywhere would
 * have caught it.
 *
 * So this is not really a test, it is the thing that keeps a sentence on a legal
 * page honest. Re-run it whenever layout moves, and update the `reviewed` date
 * in src/pages/accessibility.astro when you do.
 *
 * ── ROUTES ARE DISCOVERED, NEVER LISTED ────────────────────────────────────
 * An earlier version carried a hardcoded array. It was one project's routes,
 * and it shipped inside this template — passing happily while testing pages
 * that did not exist. See scripts/lib/routes.mjs.
 */

import puppeteer from 'puppeteer';
import { discoverRoutes } from './lib/routes.mjs';

const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith('--only=')) ?? '').replace('--only=', '');
const host = args.find((a) => !a.startsWith('--'));
const BASE = (host ?? process.env.PUBLIC_SITE_URL ?? 'http://localhost:8788').replace(/\/$/, '');

/*
 * ⚠ PROJECT CONFIG — selectors for fixed-position third-party overlays.
 *
 * A chat bubble or cookie banner pinned to the viewport is not layout, but it
 * is measured as if it were, so a widget hanging off the right edge reports as
 * a reflow failure on every route at once. Removing it before measuring is
 * correct; removing anything of your own is cheating.
 *
 * Empty by default — add only what a vendor injects, e.g. '[id*=chat-widget]'.
 */
const VENDOR_OVERLAYS = [];

const { routes: discovered, source } = await discoverRoutes(BASE);

const ROUTES = discovered
  .map((url) => new URL(url).pathname)
  .filter((r) => !only || only.split(',').some((frag) => r.includes(frag.trim())));

if (!discovered.length) {
  console.error(
    `No routes found for ${BASE}.\n` +
      '  Build first (`npm run build:staging`), or pass a host that serves a sitemap.',
  );
  process.exit(1);
}
if (!ROUTES.length) {
  console.error(`No route matches --only=${only}. Discovered ${discovered.length} from ${source}.`);
  process.exit(1);
}

console.log(`${ROUTES.length} route(s) from ${source}, against ${BASE}`);

/*
 * The check runs in the page. `scrollWidth - clientWidth` on the documentElement
 * is the only reliable measure of a second scroll axis; a per-element sweep then
 * NAMES the widest offender, so one overflowing table is identifiable rather
 * than the page simply being "broken".
 */
const CHECK = () => {
  const d = document.documentElement;
  const over = d.scrollWidth - d.clientWidth;
  const wide = [];
  if (over > 1) {
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width > d.clientWidth + 1 && r.height > 0) {
        const cls =
          typeof el.className === 'string' && el.className.trim()
            ? '.' + el.className.trim().split(/\s+/)[0]
            : '';
        const sel = el.tagName.toLowerCase() + cls;
        if (!wide.some((w) => w.sel === sel)) wide.push({ sel, w: Math.round(r.width) });
      }
    }
  }
  return { over, wide: wide.slice(0, 3) };
};

const CASES = [
  { label: 'reflow — 320px wide', w: 320, h: 640, scale: null },
  { label: 'resize text — 200%', w: 1280, h: 900, scale: '200%' },
];

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
let failures = 0;

try {
  for (const c of CASES) {
    console.log(`\n── ${c.label} ${'─'.repeat(Math.max(0, 46 - c.label.length))}`);
    const page = await browser.newPage();
    await page.setViewport({ width: c.w, height: c.h });

    for (const route of ROUTES) {
      try {
        await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await new Promise((r) => setTimeout(r, 1400));

        if (VENDOR_OVERLAYS.length) {
          await page.evaluate((selectors) => {
            for (const s of selectors) document.querySelectorAll(s).forEach((e) => e.remove());
          }, VENDOR_OVERLAYS);
        }

        if (c.scale) {
          await page.evaluate((s) => {
            document.documentElement.style.fontSize = s;
          }, c.scale);
          await new Promise((r) => setTimeout(r, 700));
        }

        const res = await page.evaluate(CHECK);
        if (res.over > 1) {
          failures++;
          const named = res.wide.map((x) => `${x.sel} (${x.w}px)`).join(', ');
          console.log(`  FAIL ${route.padEnd(34)} overflow ${res.over}px  ${named}`);
        }
      } catch (e) {
        failures++;
        console.log(`  ERROR ${route.padEnd(33)} ${e.name}`);
      }
    }
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(
  failures === 0
    ? `\n✓ no horizontal scroll at 320px or at 200% text, across ${ROUTES.length} route(s)`
    : `\n✗ ${failures} failure(s)`,
);
process.exit(failures === 0 ? 0 : 1);
