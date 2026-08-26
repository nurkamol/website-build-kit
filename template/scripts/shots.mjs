/**
 * Before/after screenshots of a migration, at a mobile and a desktop width.
 *
 *   npm run shots -- --before https://old-site.com      # the site being replaced
 *   npm run shots -- --after  https://new.example.com   # after cutover, or on staging
 *   npm run shots -- --after                            # PUBLIC_SITE_URL
 *   npm run shots -- --after --only=/pricing/           # one route, substring match
 *   npm run shots -- --after --limit=80                 # default is 40
 *
 * Writes shots/<side>/ as PNGs, a manifest per side, and shots/index.html —
 * the pairs side by side, which is the thing you actually hand over.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * `docs/runbook.md` §go-live and `stacks.md` §1d both ask for a visual record
 * of a migration, and nothing in the kit produced one. Six months later a
 * client remembers the old site as better than it was, and there is no defence
 * — plus the case that actually costs money: a page that came out WORSE and
 * nobody noticed at the time, because nobody put the two next to each other.
 *
 * ── BOTH SIDES READ THE SAME ROUTE LIST ────────────────────────────────────
 * `recon/urls.txt` — the inventory of the OLD site, which is the only list that
 * makes a pair a pair. Capturing the new site from its own sitemap would drift:
 * you would photograph the pages you built and never the ones you dropped,
 * which is exactly the failure this is for. A path that 301s is followed and
 * still filed under the OLD path, so the pair lines up.
 *
 * Greenfield builds have no recon output. There, routes come from the sitemap
 * or dist/ and only the `after` side exists — still worth having for handover.
 *
 * ── THE HARNESS IS CHECKED BEFORE THE IMAGE IS BELIEVED ────────────────────
 * `docs/traps.md` — a screenshot run against a flaky server produced dropped
 * stylesheets, nav dropdowns hanging open and images missing, none of it real,
 * and all of it plausible enough to debug for an afternoon. So every capture
 * asserts the cheap thing that proves CSS arrived, records failed requests,
 * freezes transitions, scrolls the page to force lazy images and awaits
 * `img.decode()` before the shutter. A shot that fails those is reported and
 * NOT filed, because a broken screenshot in a handover is worse than none.
 *
 * Captured with `prefers-reduced-motion: reduce` and `prefers-color-scheme:
 * light`, so two runs are comparable. A site with a dark mode needs a second
 * pass by hand; `features.md` covers why one theme's screenshots mislead.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import puppeteer from 'puppeteer';

import { discoverRoutes } from './lib/routes.mjs';
import { readInventory } from './lib/inventory.mjs';

const RESET = '[0m';
const RED = '[31m';
const GREEN = '[32m';
const YELLOW = '[33m';
const DIM = '[2m';
const BOLD = '[1m';

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844, scale: 2 },
  { name: 'desktop', width: 1440, height: 900, scale: 1 },
];

const OUT = 'shots';
const MAX_TEXTURE = 16384;
const DEFAULT_LIMIT = 40;

/* Paths in recon/urls.txt that are not pages. A PDF opens in a viewer and a
   sitemap renders as a wall of XML; neither is a screenshot of anything. */
const NOT_A_PAGE = /\.(pdf|xml|txt|json|zip|gz|csv|ico|png|jpe?g|gif|webp|avif|svg|mp4|webm|woff2?)$/i;

const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith('--only=')) ?? '').replace('--only=', '');
const limit = Number((args.find((a) => a.startsWith('--limit=')) ?? '').replace('--limit=', '')) || DEFAULT_LIMIT;
const host = args.find((a) => !a.startsWith('--'));
const side = args.includes('--before') ? 'before' : args.includes('--after') ? 'after' : null;

if (!side) {
  console.error(
    'Say which side this is: --before (the old site) or --after (the new one).\n' +
      '  npm run shots -- --before https://old-site.com\n' +
      '  npm run shots -- --after  https://new.example.com',
  );
  process.exit(1);
}

const BASE = (host ?? process.env.PUBLIC_SITE_URL ?? 'http://localhost:8788').replace(/\/$/, '');

/*
 * The old site's inventory, when there is one. Comment lines carry the counts
 * recon printed; the paths are everything else.
 */
function routesFromRecon() {
  /*
   * Parsed by lib/inventory.mjs, not here. Keeping every line starting with `/`
   * was correct only while the file held bare paths: against a real inventory
   * of ABSOLUTE URLs it found zero and this script silently reported the
   * migration as greenfield with no before side — on exactly the migration it
   * exists for, and with nothing anywhere saying so.
   *
   * Already-dead URLs are skipped. There is nothing to photograph on a page
   * that was 404 before the migration began.
   */
  const inventory = readInventory(readFileSync);
  if (!inventory) return null;
  const paths = inventory.live.filter((p) => !NOT_A_PAGE.test(p));
  return paths.length ? paths : null;
}

const fromRecon = routesFromRecon();
let routes = fromRecon;
let source = 'recon/urls.txt — the old site, so both sides match';

if (!routes) {
  const discovered = await discoverRoutes(BASE);
  routes = discovered.routes.map((u) => new URL(u).pathname);
  source = `${discovered.source}; no recon/urls.txt, so this is a greenfield build with no before side`;
}

const matched = routes.filter((r) => !only || only.split(',').some((f) => r.includes(f.trim())));

if (!matched.length) {
  console.error(
    only
      ? `No route matches --only=${only}. ${routes.length} known from ${source}.`
      : `No routes for ${BASE}.\n  Run \`npm run recon -- https://old-site.com\` first, or build.`,
  );
  process.exit(1);
}

const ROUTES = matched.slice(0, limit);
const dropped = matched.length - ROUTES.length;

console.log(`${BOLD}── Screenshots: ${side} ${'─'.repeat(Math.max(0, 43 - side.length))}${RESET}`);
console.log(`  ${DIM}${ROUTES.length} route(s) from ${source}${RESET}`);
console.log(`  ${DIM}against ${BASE}, at ${VIEWPORTS.map((v) => `${v.width}px`).join(' and ')}${RESET}`);
if (dropped) {
  console.log(
    `  ${YELLOW}!${RESET} ${dropped} route(s) beyond --limit=${limit} were NOT captured` +
      `\n  ${DIM}raise it, or narrow with --only= — a partial set that looks complete is the problem${RESET}`,
  );
}
console.log('');

/* One slug per path, and never two paths sharing one. `/a/b/` and `/a-b/`
   flatten to the same string, which would silently overwrite a pair. */
const taken = new Set();
const slugFor = (route) => {
  const base = route === '/' ? 'home' : route.replace(/^\/|\/$/g, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  let slug = base || 'home';
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  taken.add(slug);
  return slug;
};

/*
 * Every route gets its slug BEFORE anything is captured. Assigning them inside
 * the viewport loop made the name depend on whether the mobile pass succeeded:
 * one failed capture and the desktop shot of the same page filed itself under
 * `-2`, which unpairs it from the other side without failing anything.
 */
const SLUGS = new Map(ROUTES.map((route) => [route, slugFor(route)]));

const dir = `${OUT}/${side}`;
mkdirSync(dir, { recursive: true });

/* Freeze anything that moves. A carousel mid-slide or a fade half-run makes two
   captures of the same page differ, and then the diff is the harness. */
const FREEZE = `*, *::before, *::after {
  animation-duration: 0s !important; animation-delay: 0s !important;
  transition-duration: 0s !important; transition-delay: 0s !important;
  caret-color: transparent !important; scroll-behavior: auto !important;
}`;

/* Lazy images load on approach, so a fullPage shot of a page never scrolled
   catches them blank. Walk it, then come back. */
const SETTLE = async () => {
  await new Promise((resolve) => {
    let y = 0;
    const step = () => {
      window.scrollTo(0, y);
      y += window.innerHeight;
      if (y < document.body.scrollHeight + window.innerHeight) setTimeout(step, 120);
      else {
        window.scrollTo(0, 0);
        setTimeout(resolve, 400);
      }
    };
    step();
  });
  await Promise.all([...document.images].map((img) => img.decode().catch(() => {})));
  return {
    background: getComputedStyle(document.body).backgroundColor,
    height: document.documentElement.scrollHeight,
  };
};

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const captured = [];
const failures = [];
const skipped = [];
const downscaled = [];

try {
  for (const viewport of VIEWPORTS) {
    const page = await browser.newPage();
    const vp = {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: viewport.scale,
      isMobile: viewport.name === 'mobile',
      hasTouch: viewport.name === 'mobile',
    };
    await page.setViewport(vp);
    await page.emulateMediaFeatures([
      { name: 'prefers-reduced-motion', value: 'reduce' },
      { name: 'prefers-color-scheme', value: 'light' },
    ]);

    for (const route of ROUTES) {
      const slug = SLUGS.get(route);
      const file = `${slug}--${viewport.name}.png`;
      const broken = [];

      const onFailed = (req) => {
        const reason = req.failure()?.errorText ?? '';
        if (!/ERR_ABORTED/.test(reason)) broken.push(`${reason} ${req.url()}`);
      };
      const onResponse = (res) => {
        if (res.status() >= 400) broken.push(`${res.status()} ${res.url()}`);
      };
      page.on('requestfailed', onFailed);
      page.on('response', onResponse);

      try {
        /* ?nobadge=1 only on our own build — runbook.md §staging badge. On the
           old site it is a cache-busting query string and nothing else. */
        const url = BASE + route + (side === 'after' ? '?nobadge=1' : '');
        const res = await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
        const status = res?.status() ?? 0;

        /*
         * A 4xx is a fact about the site, not a failed capture. recon lists
         * Wayback paths that were ALREADY dead on the old site, so failing the
         * run on those makes a before-pass go red on a migration where nothing
         * is wrong — and a check that goes red for a non-reason gets switched
         * off. Reported, never filed, never the exit code.
         */
        if (status >= 400) {
          skipped.push({ route, viewport: viewport.name, status });
          console.log(`  ${YELLOW}–${RESET} ${viewport.name.padEnd(7)} ${route}  ${DIM}HTTP ${status}${RESET}`);
          page.off('requestfailed', onFailed);
          page.off('response', onResponse);
          continue;
        }

        const state = await page.evaluate(SETTLE);

        /*
         * The cheap assertion that proves the stylesheet arrived. A transparent
         * body means the page rendered unstyled, and an unstyled screenshot
         * filed as evidence is how a harness problem becomes a design problem.
         */
        if (state.background === 'rgba(0, 0, 0, 0)') {
          throw new Error('body has no background — stylesheet did not arrive');
        }

        /*
         * Chrome cannot rasterise past ~16384 device pixels. Past it a fullPage
         * capture comes back CUT OFF or blank, with no error and a plausible
         * file size — a long page silently missing its footer. Drop to 1x for
         * that page rather than filing a truncated one, and say so.
         */
        let scale = viewport.scale;
        if (state.height * scale > MAX_TEXTURE) {
          scale = 1;
          downscaled.push(`${route} (${viewport.name}, ${state.height}px)`);
          await page.setViewport({ ...vp, deviceScaleFactor: 1 });
        }

        await page.screenshot({ path: `${dir}/${file}`, fullPage: true });
        if (scale !== viewport.scale) await page.setViewport(vp);
        captured.push({ route, slug, viewport: viewport.name, file, status, height: state.height, scale, broken });

        const note = broken.length ? `  ${YELLOW}${broken.length} failed request(s)${RESET}` : '';
        console.log(`  ${GREEN}✓${RESET} ${viewport.name.padEnd(7)} ${route}${note}`);
      } catch (e) {
        failures.push({ route, viewport: viewport.name, reason: e.message });
        console.log(`  ${RED}✗${RESET} ${viewport.name.padEnd(7)} ${route}  ${DIM}${e.message}${RESET}`);
      }

      page.off('requestfailed', onFailed);
      page.off('response', onResponse);
    }

    await page.close();
  }
} finally {
  await browser.close();
}

writeFileSync(
  `${dir}/manifest.json`,
  JSON.stringify(
    {
      side,
      origin: BASE,
      capturedAt: new Date().toISOString(),
      routeSource: source,
      viewports: VIEWPORTS,
      captured,
      failures,
      skipped,
      notCaptured: dropped,
    },
    null,
    2,
  ) + '\n',
);

writeSheet();

if (skipped.length) {
  const routes = [...new Set(skipped.map((s) => `${s.route} (${s.status})`))];
  console.log(`\n  ${YELLOW}!${RESET} ${routes.length} route(s) did not respond with a page:`);
  for (const r of routes) console.log(`      ${DIM}${r}${RESET}`);
  console.log(
    side === 'after'
      ? `  ${DIM}On the new site that means the URL did not survive. \`npm run verify\` is the gate for it.${RESET}`
      : `  ${DIM}Expected on a before pass — recon lists paths that were already dead. They still hold backlinks.${RESET}`,
  );
}

if (downscaled.length) {
  console.log(
    `\n  ${YELLOW}!${RESET} ${downscaled.length} page(s) too tall for a 2x capture, taken at 1x:` +
      downscaled.map((d) => `\n      ${DIM}${d}${RESET}`).join(''),
  );
}

const withBroken = captured.filter((c) => c.broken.length).length;
if (withBroken) {
  const urls = [...new Set(captured.flatMap((c) => c.broken))].slice(0, 5);
  console.log(`\n  ${YELLOW}!${RESET} ${withBroken} capture(s) had failed requests — the image may be missing an asset:`);
  for (const u of urls) {
    /* Browsers request /favicon.ico unprompted when no icon is declared. Say
       what it means rather than leaving someone hunting for the reference. */
    const hint = /\/favicon\.ico$/.test(u) ? '  ← the browser asks for this by itself' : '';
    console.log(`      ${DIM}${u}${hint}${RESET}`);
  }
  console.log(`  ${DIM}\`npm run console\` reports all of them.${RESET}`);
}

console.log(
  failures.length
    ? `\n${RED}✗ ${failures.length} capture(s) failed${RESET} — ${captured.length} written to ${dir}/\n`
    : `\n${GREEN}✓ ${captured.length} screenshot(s) → ${dir}/${RESET}\n  ${DIM}pairs: ${OUT}/index.html${RESET}\n`,
);

process.exit(failures.length ? 1 : 0);

/*
 * The contact sheet. Reads whichever manifests exist, so running one side
 * produces a usable page and running the second fills in the other column.
 *
 * Deliberately plain: this is a working artefact, not a page the site ships,
 * and a styled one would be a design decision living in the template.
 */
function writeSheet() {
  const load = (s) => {
    try {
      return JSON.parse(readFileSync(`${OUT}/${s}/manifest.json`, 'utf8'));
    } catch {
      return null;
    }
  };

  const before = load('before');
  const after = load('after');
  const sides = [before, after].filter(Boolean);
  /* Skipped routes belong in the sheet. A page that 404s on the new site is
     the single most important row there is, and leaving it out because nothing
     was captured would hide exactly what the sheet is for. */
  const routes = [
    ...new Set(sides.flatMap((m) => [...m.captured, ...(m.skipped ?? [])].map((c) => c.route))),
  ].sort();

  const cell = (manifest, side, route, viewport) => {
    const shot = manifest?.captured.find((c) => c.route === route && c.viewport === viewport);
    if (shot) return `<a href="${side}/${shot.file}"><img src="${side}/${shot.file}" alt="${side}, ${route}, ${viewport}"></a>`;
    const gone = manifest?.skipped?.find((f) => f.route === route && f.viewport === viewport);
    if (gone) return `<p class="none">HTTP ${gone.status} — no page here</p>`;
    const failed = manifest?.failures.find((f) => f.route === route && f.viewport === viewport);
    return `<p class="none">${failed ? `not captured — ${failed.reason}` : 'not captured'}</p>`;
  };

  const rows = routes
    .map((route) => {
      const shots = VIEWPORTS.map(
        (v) => `<div class="pair" style="--shot: ${v.width}px">
          <h3>${v.name} · ${v.width}px</h3>
          <div class="two">
            <figure><figcaption>before</figcaption>${cell(before, 'before', route, v.name)}</figure>
            <figure><figcaption>after</figcaption>${cell(after, 'after', route, v.name)}</figure>
          </div>
        </div>`,
      ).join('\n');
      return `<section><h2><code>${route}</code></h2>${shots}</section>`;
    })
    .join('\n');

  const origins = sides
    .map((m) => `${m.side}: ${m.origin} — ${m.capturedAt.slice(0, 10)}, ${m.captured.length} shot(s)`)
    .join('<br>');

  writeFileSync(
    `${OUT}/index.html`,
    `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Before / after</title>
<style>
  body { font: 15px/1.5 system-ui, sans-serif; margin: 0 auto; padding: 2rem 1rem; max-width: 80rem; color: #1a1a1a; background: #fff; }
  header p { color: #555; }
  section { border-top: 1px solid #ddd; padding-top: 1.5rem; margin-top: 2.5rem; }
  h2 { font-size: 1rem; }
  h3 { font-size: .8rem; text-transform: uppercase; letter-spacing: .05em; color: #666; font-weight: 600; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; align-items: start; }
  figure { margin: 0; }
  figcaption { font-size: .75rem; color: #666; margin-bottom: .35rem; }
  /* Cap each shot at the width it was taken. A 390px capture stretched across
     a 600px column stops reading as a phone, which is half of what the pair is
     for. */
  img { width: 100%; max-width: var(--shot); height: auto; border: 1px solid #ddd; display: block; }
  .none { border: 1px dashed #ccc; color: #888; padding: 2rem 1rem; text-align: center; font-size: .8rem; margin: 0; }
  @media (max-width: 40rem) { .two { grid-template-columns: 1fr; } }
</style></head><body>
<header>
  <h1>Before / after</h1>
  <p>${origins || 'nothing captured yet'}</p>
  <p>Full-page, animations frozen, captured in light mode with reduced motion. Click any shot for the full-size PNG.</p>
</header>
${rows}
</body></html>
`,
  );
}
