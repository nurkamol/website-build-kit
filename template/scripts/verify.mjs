/**
 * Verify a DEPLOYED site. Exits non-zero if any check fails.
 *
 *   npm run verify -- https://new.example.com      # staging, after deploy
 *   npm run verify -- https://example.com          # production, after cutover
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * A green build proves the bundler ran. Every regression this kit documents
 * was green: the environment mismatch, the sitemap/noindex pair, the manifest
 * one generator deleted, the fallback card that went stale, the honeypot
 * landing on the conversion URL. All of them are visible from outside, over
 * HTTP, in about twenty seconds.
 *
 * docs/runbook.md §2 has carried these as curl commands since the beginning,
 * with the instruction "every row, every time — the rows people skip are the
 * rows that fail". That instruction is an admission. Go-live is the moment
 * someone is tired, and a checklist run by hand at 11pm is not a check.
 *
 * ── NOTHING HERE CREATES DATA ──────────────────────────────────────────────
 * The form checks are deliberately limited to the three submissions the API
 * REFUSES: a honeypot hit (accepted, never stored), an empty body (422) and a
 * cross-origin post (403). A valid submission would write a real lead and send
 * a real notification, so this script never sends one. Test that by hand, once,
 * and watch it arrive.
 *
 * ── WHAT IT CANNOT SEE ─────────────────────────────────────────────────────
 * Printed at the end, deliberately. A check that stays silent about its blind
 * spots reads as "everything is fine" when it means "everything I looked at".
 */

import { readFileSync, existsSync } from 'node:fs';

import { discoverRoutes } from './lib/routes.mjs';
import { PRESERVED, preservedFromRecon } from './lib/preserved.mjs';
import { readInventory } from './lib/inventory.mjs';

const RESET = '[0m';
const RED = '[31m';
const GREEN = '[32m';
const YELLOW = '[33m';
const DIM = '[2m';
const BOLD = '[1m';

const origin = (process.argv[2] ?? '').replace(/\/$/, '');
if (!origin || !/^https?:\/\//.test(origin)) {
  console.error(
    'usage: npm run verify -- https://example.com\n' +
      '       node scripts/verify.mjs http://localhost:8788',
  );
  process.exit(1);
}

const results = [];
const notes = [];

function record(name, ok, detail = '', { warn = false } = {}) {
  results.push({ name, ok, detail, warn });
  const mark = ok ? `${GREEN}✓${RESET}` : warn ? `${YELLOW}!${RESET}` : `${RED}✗${RESET}`;
  console.log(`  ${mark} ${name}${detail ? `\n      ${DIM}${detail}${RESET}` : ''}`);
}

const TIMEOUT = 15000;

async function req(path, options = {}) {
  const url = path.startsWith('http') ? path : `${origin}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    return await fetch(url, { redirect: 'manual', signal: controller.signal, ...options });
  } catch (error) {
    return { status: 0, headers: new Headers(), error: String(error), text: async () => '' };
  } finally {
    clearTimeout(timer);
  }
}

/** Bounded concurrency — a verification run should not look like an attack. */
async function pool(items, worker, limit = 8) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const index = i++;
        out[index] = await worker(items[index], index);
      }
    }),
  );
  return out;
}

const section = (title) => console.log(`\n${BOLD}── ${title} ${'─'.repeat(Math.max(0, 58 - title.length))}${RESET}`);

/* ── Which environment is this? ────────────────────────────────────────────
 *
 * Asked of the SITE, not of a local variable. The whole point is to compare
 * what was deployed against what was intended, so reading our own build
 * environment here would compare a value to itself.
 */
section('Environment');

const homeRes = await req('/');
const home = homeRes.status ? await homeRes.text() : '';

if (!homeRes.status) {
  record('origin reachable', false, homeRes.error ?? 'no response');
  console.error(`\n${RED}Cannot reach ${origin}. Nothing else can be checked.${RESET}\n`);
  process.exit(1);
}
record('origin reachable', homeRes.status === 200, `GET / → ${homeRes.status}`);

const hasNoindex = /<meta[^>]+name=["']robots["'][^>]+noindex/i.test(home);
const env = hasNoindex ? 'staging' : 'production';
console.log(`  ${DIM}reading as ${BOLD}${env}${RESET}${DIM} (noindex ${hasNoindex ? 'present' : 'absent'} on /)${RESET}`);

const analyticsRefs = (home.match(/googletagmanager\.com|gtag\(|GTM-[A-Z0-9]+|G-[A-Z0-9]{8,}/g) ?? []).length;
if (env === 'staging') {
  record('staging carries zero analytics references', analyticsRefs === 0,
    analyticsRefs ? `found ${analyticsRefs} reference(s) — staging must emit no tag at all` : '');
} else {
  notes.push(`analytics references on production: ${analyticsRefs} (0 is valid — IDs may be unset)`);
}

const robotsRes = await req('/robots.txt');
const robots = robotsRes.status === 200 ? await robotsRes.text() : '';
if (env === 'staging') {
  const disallowAll = /^\s*Disallow:\s*\/\s*$/m.test(robots);
  record('staging robots.txt is disallow-all', disallowAll,
    robots ? '' : `GET /robots.txt → ${robotsRes.status}`);

  /*
   * Disallow-all AND noindex is self-defeating: a blocked crawler never fetches
   * the page, so it never reads the noindex, and a linked staging URL can still
   * be indexed as a bare URL. Behind Cloudflare Access this does not matter,
   * which is why it is a note and not a failure — verify cannot tell whether
   * Access is in front of it, because it is being run from inside.
   */
  if (disallowAll && hasNoindex) {
    notes.push(
      'staging serves BOTH Disallow: / and noindex — the crawler never reads the noindex. ' +
        'Fine behind Cloudflare Access, a real gap without it. See docs/traps.md',
    );
  }
} else {
  record('production robots.txt names a sitemap', /^\s*Sitemap:\s*http/im.test(robots),
    'nothing else discovers the sitemap without it');
}

/* A local preview serves a build made for another host, so the canonical
   SHOULD differ and comparing them proves nothing. Warn rather than fail —
   silently skipping would hide the check that catches a staging build shipped
   to the production domain, which is the whole reason it exists. */
const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])/.test(new URL(origin).host);
const canonical = /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i.exec(home)?.[1];
if (canonical) {
  const canonicalHost = new URL(canonical).host;
  const matches = canonicalHost === new URL(origin).host;
  record('canonical points at this host', matches,
    isLocal
      ? `canonical ${canonicalHost} — expected on a local preview of a remote build; re-run against the deployed host`
      : `canonical ${canonicalHost}, requested ${new URL(origin).host}` +
        (matches ? '' : ' — a staging build on the production domain looks exactly like this'),
    { warn: isLocal });
}

/* ── Routes ────────────────────────────────────────────────────────────────
 *
 * From the deployed sitemap where there is one. Staging emits none by design,
 * so fall back to the routes this build actually emitted.
 */
section('Routes');

const smIndex = await req('/sitemap-index.xml');
const { routes: discoveredRoutes, source: routeSource } = await discoverRoutes(origin, (url) =>
  req(url),
);

/*
 * Re-root every discovered route onto the origin under test.
 *
 * A sitemap holds ABSOLUTE URLs at the host the build was made for — it has to,
 * that is what a crawler consumes. Fetching them literally means a local
 * preview of a production build verifies example.com instead of localhost, and
 * the route check passes because example.com really does return 200. It reports
 * green having tested somebody else's website.
 *
 * Same correction as the canonical and og:image checks: no-op when the origins
 * already match, which is every real run against a deployed site.
 */
const routes = discoveredRoutes.map((url) => {
  try {
    const u = new URL(url);
    return u.origin === new URL(origin).origin ? url : new URL(u.pathname + u.search, origin).href;
  } catch {
    return url;
  }
});

if (routes.some((r, i) => r !== discoveredRoutes[i])) {
  notes.push(
    `routes came from a sitemap written for another host and were re-rooted onto ${origin} — ` +
      'against the real deployed host they are checked exactly as published',
  );
}

if (!routes.length) {
  record('routes discovered', false, 'no sitemap and no dist/ — build first, or check the origin');
} else {
  console.log(`  ${DIM}${routes.length} route(s) from ${routeSource}${RESET}`);
  const statuses = await pool(routes, async (url) => ({ url, status: (await req(url)).status }));
  const bad = statuses.filter((r) => r.status !== 200);
  record('every route returns 200', bad.length === 0,
    bad.map((b) => `${b.status || 'ERR'}  ${b.url}`).join('\n      '));
}

const missing = await req(`/definitely-not-a-real-page-${Date.now().toString(36)}/`);
record('unknown path returns a real 404', missing.status === 404,
  `got ${missing.status}` + (missing.status === 200 ? ' — a pretty 404 page served as 200 is indexable' : ''));

/* ── Links inside the pages ────────────────────────────────────────────────
 *
 * Everything above checks URLs somebody ELSE points at — the sitemap, the
 * redirect map, the inventory. None of it follows a link a visitor can
 * actually click.
 *
 * That is the gap a rebuild falls into. Routes all return 200, redirects all
 * resolve, and a nav change three weeks ago left `/pricing/` linked from three
 * pages and existing on none. Nothing in a build, a sitemap or a status sweep
 * sees it, because the broken thing is the href, not the route.
 */
section('Links');

const LINK_PAGE_CAP = 150;
const pagesToScan = routes.slice(0, LINK_PAGE_CAP);
if (routes.length > LINK_PAGE_CAP) {
  notes.push(
    `link check read the first ${LINK_PAGE_CAP} of ${routes.length} pages — raise LINK_PAGE_CAP for a full sweep`,
  );
}

/** target URL → the pages that link to it. Deduped, so each target is fetched once. */
const targets = new Map();
const ogImages = new Map();
/* Collected in the same pass — the HTML is already in memory, so the whole
   meta sweep below costs one regex per page rather than a second crawl. */
const meta = new Map();
/* Weight and render-blocking, from the same HTML. See the Weight section. */
const perf = new Map();
const assetUrls = new Set();
let scanned = 0;

await pool(pagesToScan, async (pageUrl) => {
  const res = await req(pageUrl);
  if (res.status !== 200) return;
  const html = await res.text();
  scanned++;

  const add = (raw) => {
    if (!raw) return;
    const href = raw.trim();
    /* Not links to a page: protocol handlers, data URIs, and pure fragments. */
    if (/^(mailto:|tel:|sms:|javascript:|data:|#)/i.test(href)) return;
    let abs;
    try {
      abs = new URL(href, pageUrl);
    } catch {
      return;
    }
    if (abs.origin !== new URL(origin).origin) return; // external is not ours to fix
    abs.hash = '';
    const key = abs.href;
    if (!targets.has(key)) targets.set(key, new Set());
    targets.get(key).add(new URL(pageUrl).pathname);
  };

  for (const m of html.matchAll(/<a\b[^>]*\shref=["']([^"']+)["']/gi)) add(m[1]);
  for (const m of html.matchAll(/<img\b[^>]*\ssrc=["']([^"']+)["']/gi)) add(m[1]);

  const og = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1];
  if (og) ogImages.set(new URL(pageUrl).pathname, og);

  /*
   * Render-blocking, counted from the markup rather than from a browser.
   * `build.md` §2 is explicit that a hand-rolled PerformanceObserver against
   * one machine produces a confident number that disagrees with Lighthouse and
   * nothing tells you it is wrong. So nothing here is a timing: these are
   * counts and byte totals, which are the same on every machine and every
   * connection, and Lighthouse remains the tool for how fast it feels.
   */
  const head = /<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(html)?.[1] ?? '';

  const blockingStyles = [...head.matchAll(/<link\b[^>]*>/gi)]
    .filter((m) => /rel=["']stylesheet["']/i.test(m[0]))
    /* media="print" and a non-matching media query do not block render. */
    .filter((m) => {
      const media = /\smedia=["']([^"']+)["']/i.exec(m[0])?.[1];
      return !media || /^(all|screen)$/i.test(media.trim());
    })
    .map((m) => /\shref=["']([^"']+)["']/i.exec(m[0])?.[1])
    .filter(Boolean);

  /* A classic <script src> in <head> blocks the parser. `defer`, `async` and
     type="module" (deferred by definition) do not. */
  const blockingScripts = [...head.matchAll(/<script\b[^>]*\ssrc=["']([^"']+)["'][^>]*>/gi)]
    .filter((m) => !/\s(defer|async)[\s>=]/i.test(m[0]) && !/type=["']module["']/i.test(m[0]))
    .map((m) => m[1]);

  const images = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => ({
    src: /\ssrc=["']([^"']+)["']/i.exec(m[0])?.[1] ?? '',
    lazy: /\sloading=["']lazy["']/i.test(m[0]),
  })).filter((i) => i.src);

  const sub = [...blockingStyles, ...blockingScripts, ...images.map((i) => i.src)];
  for (const raw of sub) {
    try {
      const abs = new URL(raw, pageUrl);
      if (abs.origin === new URL(origin).origin) assetUrls.add(abs.href);
    } catch {
      /* an unparseable src is the link check's finding, not this one's */
    }
  }

  perf.set(new URL(pageUrl).pathname, {
    htmlBytes: Buffer.byteLength(html),
    blockingStyles,
    blockingScripts,
    images,
  });

  meta.set(new URL(pageUrl).pathname, {
    title: /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? '',
    description:
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i.exec(html)?.[1]?.trim() ?? '',
    canonical: /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i.exec(html)?.[1] ?? '',
    h1Count: (html.match(/<h1[\s>]/gi) ?? []).length,
    noindex: /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*\bnoindex\b/i.test(html),
  });
});

console.log(`  ${DIM}${targets.size} unique internal target(s) across ${scanned} page(s)${RESET}`);

const linkResults = await pool([...targets.keys()], async (url) => {
  const res = await req(url, { method: 'HEAD' });
  /* Some hosts refuse HEAD on dynamic routes; confirm with GET before calling
     it broken, or the report is full of pages that work perfectly in a browser. */
  if (res.status === 405 || res.status === 501 || res.status === 0) {
    const get = await req(url);
    return { url, status: get.status, location: get.headers.get('location') ?? '' };
  }
  return { url, status: res.status, location: res.headers.get('location') ?? '' };
});

const sourcesOf = (url) => [...(targets.get(url) ?? [])].sort();

const dead = linkResults.filter((r) => r.status >= 400 || r.status === 0);
record(
  'every internal link resolves',
  dead.length === 0,
  dead
    .map(
      (r) =>
        `${String(r.status || 'ERR').padEnd(3)} ${new URL(r.url).pathname}\n` +
        `          linked from: ${sourcesOf(r.url).join(', ')}`,
    )
    .join('\n      '),
);

/*
 * An internal link that redirects is not broken, but it is a stale href: it
 * costs every visitor a round trip and it is usually the last trace of a route
 * that moved. Cheap to fix while you know why it happened.
 */
const hops = linkResults.filter((r) => r.status >= 300 && r.status < 400);
record(
  'no internal link goes through a redirect',
  hops.length === 0,
  hops
    .map(
      (r) =>
        `${new URL(r.url).pathname} → ${r.location}\n` +
        `          linked from: ${sourcesOf(r.url).join(', ')}`,
    )
    .join('\n      '),
  { warn: true },
);

/*
 * og:image is the one asset nobody opens. A card pointing at a moved file
 * unfurls blank in every share, and the page itself is perfect.
 */
if (ogImages.size) {
  /*
   * og:image is emitted ABSOLUTE, against the host the build was made for —
   * that is required, since a scraper has no base URL to resolve against. So
   * on a local preview of a staging build it points at the staging host, and
   * fetching it literally reports every card as broken.
   *
   * Re-root it on the origin under test, but only when it is the site's own
   * host (it matches the canonical). A card genuinely served from a CDN keeps
   * its own URL, because that one really does need to resolve where it says.
   */
  const canonicalOrigin = canonical ? new URL(canonical).origin : null;
  const cards = await pool([...new Set(ogImages.values())], async (src) => {
    const declared = new URL(src, origin);
    const ownHost = canonicalOrigin && declared.origin === canonicalOrigin;
    const tested = ownHost ? new URL(declared.pathname + declared.search, origin) : declared;
    const status = (await req(tested.href, { method: 'HEAD' })).status;
    return { src, tested: tested.href, rerooted: ownHost && declared.origin !== tested.origin, status };
  });
  const badCards = cards.filter((c) => c.status !== 200);
  const rerooted = cards.some((c) => c.rerooted);
  record(
    `og:image resolves on ${ogImages.size} page(s)`,
    badCards.length === 0,
    badCards.map((c) => `${c.status || 'ERR'}  ${c.tested}`).join('\n      '),
  );
  if (rerooted) {
    notes.push(
      'og:image is absolute against the build host and was re-rooted onto the origin under test — ' +
        'against the real deployed host it is checked exactly as a scraper would see it',
    );
  }

  /*
   * How many pages share ONE card.
   *
   * "All cards unique" is the check people write, and it passes while exactly
   * one page sits on the stale default — which is the failure that actually
   * happened. Count pages on the most-shared card instead: on a site with
   * per-page cards, anything above one is a page that never got its own.
   *
   * A site that deliberately uses a single card for everything is fine and
   * says so by having one card and one group — hence the warning, not a fail.
   */
  const byCard = new Map();
  for (const [path, src] of ogImages) {
    if (!byCard.has(src)) byCard.set(src, []);
    byCard.get(src).push(path);
  }
  const shared = [...byCard.entries()].filter(([, paths]) => paths.length > 1);
  if (byCard.size > 1 && shared.length) {
    record(
      'no page is left on a shared social card',
      false,
      shared
        .map(([src, paths]) => `${paths.length} pages share ${src.split('/').pop()}\n          ${paths.join(', ')}`)
        .join('\n      '),
      { warn: true },
    );
  } else if (byCard.size === 1 && ogImages.size > 1) {
    notes.push(`all ${ogImages.size} pages share one og:image — deliberate, or nobody generated per-page cards`);
  }
}

/* ── Meta ──────────────────────────────────────────────────────────────────
 *
 * Costs one pass over HTML the link check already pulled — no extra requests.
 *
 * These are the SEO regressions a rebuild produces silently. Nothing about a
 * missing description is visible on the page; it surfaces weeks later as a
 * Search Console list nobody opens, or as a SERP snippet Google wrote itself.
 *
 * ⚠ It checks that the fields EXIST, are UNIQUE and are the right SHAPE. It
 * cannot tell you whether a description is any good. On a migration the real
 * baseline is the old site's per-URL titles and descriptions from the SEO
 * plugin export — see stacks.md §1.
 */
section('Meta');

const indexable = [...meta.entries()].filter(([, m]) => !m.noindex);

if (!indexable.length) {
  console.log(`  ${DIM}every scanned page is noindex — nothing to check${RESET}`);
} else {
  console.log(`  ${DIM}${indexable.length} indexable page(s) of ${meta.size} scanned${RESET}`);

  const missingTitle = indexable.filter(([, m]) => !m.title);
  record('every page has a title', missingTitle.length === 0,
    missingTitle.map(([p]) => p).join(', '));

  const missingDesc = indexable.filter(([, m]) => !m.description);
  record('every page has a meta description', missingDesc.length === 0,
    missingDesc.map(([p]) => p).join(', ') +
      (missingDesc.length ? ' — Google writes its own snippet when this is absent' : ''));

  /*
   * Duplicates are the migration failure. A template that forgets to override
   * the default gives twenty pages one description, and each one looks correct
   * in isolation — which is why this compares across pages rather than per page.
   */
  const dupes = (field) => {
    const byValue = new Map();
    for (const [path, m] of indexable) {
      const v = m[field];
      if (!v) continue;
      if (!byValue.has(v)) byValue.set(v, []);
      byValue.get(v).push(path);
    }
    return [...byValue.entries()].filter(([, paths]) => paths.length > 1);
  };

  for (const field of ['title', 'description']) {
    const d = dupes(field);
    record(`no two pages share a ${field}`, d.length === 0,
      d.map(([v, paths]) => `${paths.join(', ')}\n          "${v.slice(0, 70)}${v.length > 70 ? '…' : ''}"`)
        .join('\n      '));
  }

  /*
   * Length is a WARNING, never a failure. The limits are pixel-width based and
   * Google rewrites snippets anyway, so a long title is a judgement call and
   * not a defect — but a 12-character title is usually a bug.
   */
  const longTitles = indexable.filter(([, m]) => m.title.length > 60);
  const shortTitles = indexable.filter(([, m]) => m.title && m.title.length < 15);
  record('titles are a sensible length', longTitles.length === 0 && shortTitles.length === 0,
    [...longTitles.map(([p, m]) => `${p} — ${m.title.length} chars, truncates in the SERP`),
     ...shortTitles.map(([p, m]) => `${p} — ${m.title.length} chars, probably unfinished`)].join('\n      '),
    { warn: true });

  const longDesc = indexable.filter(([, m]) => m.description.length > 165);
  record('descriptions are a sensible length', longDesc.length === 0,
    longDesc.map(([p, m]) => `${p} — ${m.description.length} chars`).join('\n      '),
    { warn: true });

  /*
   * A canonical that points somewhere else is how a page removes itself from
   * the index while looking perfectly healthy. Self-referential is the rule;
   * the exception is a deliberate duplicate, which should be rare enough to
   * read every hit.
   */
  const badCanonical = indexable.filter(([path, m]) => {
    if (!m.canonical) return true;
    try {
      return new URL(m.canonical).pathname !== path;
    } catch {
      return true;
    }
  });
  record('every canonical is self-referential', badCanonical.length === 0,
    badCanonical
      .map(([p, m]) => `${p} → ${m.canonical || '(none)'}`)
      .join('\n      '));

  const badH1 = indexable.filter(([, m]) => m.h1Count !== 1);
  record('exactly one h1 per page', badH1.length === 0,
    badH1.map(([p, m]) => `${p} — ${m.h1Count} h1(s)`).join('\n      '), { warn: true });
}

/* ── Weight and render-blocking ────────────────────────────────────────────
 *
 * `build.md` §2 says measure before defending a design opinion, and gives no
 * tool, so nobody measured until a client asked why the site felt slow.
 *
 * ⚠ NOTHING HERE IS A TIMING, DELIBERATELY. The same section of build.md warns
 * against hand-rolling a PerformanceObserver against one machine: it produces a
 * confident number that disagrees with Lighthouse and there is nothing to tell
 * you it is wrong. Bytes and counts do not have that problem — they are
 * identical on every machine and every connection, they are the inputs a
 * timing is made of, and they are the half a script can own honestly.
 *
 * Lighthouse on the deployed URL, mobile, simulated throttling, two samples per
 * variant, remains the tool for how fast it FEELS. This tells you what it is
 * carrying. Printed under "what this cannot see" so the two never get confused.
 *
 * ── THE BUDGETS ARE CHOSEN, NOT MEASURED ───────────────────────────────────
 * A budget is a decision, so these are stated rather than derived: they are
 * where a marketing site with one hero photograph normally lands, and the
 * point of them is to notice the day a page doubles. Move them for the project
 * and say why in the commit — a budget nobody edited is a budget nobody read.
 */
const WEIGHT_BUDGET_KB = 1600; // whole page, uncompressed, including images
const BLOCKING_STYLE_BUDGET = 2;
const ASSET_CAP = 250;

section('Weight and render-blocking');

if (!perf.size) {
  console.log(`  ${DIM}no pages scanned — nothing to weigh${RESET}`);
} else {
  /*
   * Sizes come from HEAD with `accept-encoding: identity`, so the number is the
   * UNCOMPRESSED byte count. That is the stable one: it does not move when a CDN
   * changes its compression, and for images and fonts — which are already
   * compressed and are most of the weight — it is the transfer size anyway.
   * Only CSS and JS differ, and those are covered by the compression check below.
   */
  const assets = [...assetUrls].slice(0, ASSET_CAP);
  if (assetUrls.size > ASSET_CAP) {
    notes.push(`weight read the first ${ASSET_CAP} of ${assetUrls.size} assets — raise ASSET_CAP for a full total`);
  }

  /*
   * ⚠ HEAD IS NOT ENOUGH, AND THE OBVIOUS FALLBACK IS A TRAP. Real CDNs
   * routinely answer HEAD with no content-length at all — Cloudflare and
   * Netlify both do — so a HEAD-then-GET fallback quietly downloads every image
   * on the site on every run, turning a twenty-second check into tens of
   * megabytes. Measured against a live CDN: HEAD returned null, GET returned
   * the length in its headers.
   *
   * So: GET, read the header, and CANCEL THE BODY before it transfers. That is
   * 11ms for a 1.6 MB image instead of the whole file. Range requests were the
   * other candidate and are not reliable — the hosts tested answered 200 with
   * no content-range rather than 206.
   */
  const sizes = new Map();
  await pool(assets, async (url) => {
    const head = await req(url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'accept-encoding': 'identity' },
    });
    const declared = Number(head.headers?.get('content-length') ?? 0);
    if (declared > 0) {
      sizes.set(url, declared);
      return;
    }

    const res = await req(url, { redirect: 'follow', headers: { 'accept-encoding': 'identity' } });
    if (res.status !== 200) return;

    const len = Number(res.headers?.get('content-length') ?? 0);
    if (len > 0) {
      await res.body?.cancel().catch(() => {});
      sizes.set(url, len);
      return;
    }

    /* Chunked, so the length is only knowable by reading it. Last resort. */
    if (res.arrayBuffer) sizes.set(url, (await res.arrayBuffer()).byteLength);
  });

  const unmeasured = assets.length - sizes.size;
  if (unmeasured > 0) {
    notes.push(`${unmeasured} of ${assets.length} asset(s) had no measurable size — the weight totals are floors, not totals`);
  }

  const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;
  const sizeOf = (page, raw) => {
    try {
      return sizes.get(new URL(raw, `${origin}${page}`).href) ?? 0;
    } catch {
      return 0;
    }
  };

  const weights = [...perf.entries()]
    .map(([path, p]) => {
      const refs = [...p.blockingStyles, ...p.blockingScripts, ...p.images.map((i) => i.src)];
      const unique = [...new Set(refs)];
      return {
        path,
        total: p.htmlBytes + unique.reduce((sum, r) => sum + sizeOf(path, r), 0),
        html: p.htmlBytes,
      };
    })
    .sort((a, b) => b.total - a.total);

  const heaviest = weights[0];
  const over = weights.filter((w) => w.total > WEIGHT_BUDGET_KB * 1024);

  /* A warning, not a failure. The right weight is a design decision — a
     photography-led site is legitimately heavier — and a gate that fails on a
     judgement call is a gate somebody deletes rather than argues with. */
  record(`every page under ${WEIGHT_BUDGET_KB} KB`, over.length === 0,
    over.length
      ? over.slice(0, 5).map((w) => `${w.path} — ${kb(w.total)}`).join('\n      ')
      : `heaviest: ${heaviest.path} at ${kb(heaviest.total)} (HTML ${kb(heaviest.html)})`,
    { warn: true });

  /*
   * The heaviest image on the page, named. On a marketing site this is almost
   * always the LCP element, and naming it is actionable without claiming a
   * millisecond: it is the one asset where a better crop or an AVIF pays for
   * itself. Marked `loading="lazy"` it is a genuine, silent regression —
   * lazy defers the fetch until layout, so the largest paint waits for it.
   */
  const allImages = [...perf.entries()].flatMap(([path, p]) =>
    p.images.map((i) => ({ path, ...i, bytes: sizeOf(path, i.src) })),
  );
  const biggest = allImages.sort((a, b) => b.bytes - a.bytes)[0];

  if (biggest?.bytes) {
    console.log(`  ${DIM}heaviest image: ${biggest.src} — ${kb(biggest.bytes)} on ${biggest.path}${RESET}`);

    /*
     * DOCUMENT ORDER, NOT SIZE. Ranking by size and flagging the biggest was
     * the first version and it was wrong in a way that would have got the check
     * deleted: on a page with a modest hero and a large photograph near the
     * bottom, the heaviest image is the gallery one and lazy is exactly right
     * there. The first SUBSTANTIAL image in the markup is the better proxy for
     * the one painted first — a logo or icon sits under the threshold, a hero
     * does not.
     *
     * A warning, because without a browser this cannot know what is actually
     * above the fold: an article whose first photograph sits halfway down is a
     * legitimate hit. Read it, do not obey it.
     */
    const HERO_MIN_BYTES = 20 * 1024;
    const lazyLeaders = [...perf.entries()]
      .map(([path, p]) => {
        const first = p.images
          .map((i) => ({ ...i, bytes: sizeOf(path, i.src) }))
          .find((i) => i.bytes >= HERO_MIN_BYTES);
        return { path, first };
      })
      .filter((r) => r.first?.lazy);

    record('the first substantial image is not lazy-loaded', lazyLeaders.length === 0,
      lazyLeaders.length
        ? lazyLeaders.map((r) => `${r.path} — ${r.first.src} (${kb(r.first.bytes)})`).join('\n      ') +
          '\n      lazy defers the fetch until layout, so the largest paint waits for it.' +
          '\n      Correct if it is genuinely below the fold — this cannot tell.'
        : `first image over ${Math.round(HERO_MIN_BYTES / 1024)} KB on each page loads eagerly`,
      { warn: true });
  } else {
    notes.push('no images found with a measurable size — the heaviest-image check had nothing to rank');
  }

  const styleHeavy = [...perf.entries()].filter(([, p]) => p.blockingStyles.length > BLOCKING_STYLE_BUDGET);
  record(`at most ${BLOCKING_STYLE_BUDGET} render-blocking stylesheet(s)`, styleHeavy.length === 0,
    styleHeavy.map(([path, p]) => `${path} — ${p.blockingStyles.length}`).join('\n      '),
    { warn: true });

  /*
   * A blocking <script src> in <head> is the one that costs the most and gets
   * added the most casually — a chat widget or a tag manager pasted where the
   * vendor's snippet said to. A warning rather than a failure because a consent
   * script sometimes genuinely has to run first, and that is the client's call.
   */
  const scriptBlocked = [...perf.entries()].filter(([, p]) => p.blockingScripts.length);
  record('no render-blocking script in <head>', scriptBlocked.length === 0,
    scriptBlocked
      .slice(0, 5)
      .map(([path, p]) => `${path} — ${p.blockingScripts.join(', ')}`)
      .join('\n      ') + (scriptBlocked.length ? '\n      add defer, or move it to the end of <body>' : ''),
    { warn: true });

  /*
   * Text served uncompressed is a configuration failure rather than a design
   * one, so it fails. It is invisible from every other angle: the page looks
   * identical, and the only symptom is that CSS and JS arrive three to four
   * times larger than they need to.
   */
  const textAsset = [...sizes.keys()].find((u) => /\.(css|js)(\?|$)/i.test(u));
  if (!textAsset) {
    notes.push('no CSS or JS asset found to test compression against');
  } else if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(origin)) {
    notes.push('compression not checked — a local dev server does not compress, and the CDN is what serves it');
  } else {
    const res = await req(textAsset, { method: 'HEAD', headers: { 'accept-encoding': 'gzip, br' } });
    const encoding = res.headers?.get('content-encoding') ?? '';
    record('text assets are served compressed', /gzip|br|zstd|deflate/i.test(encoding),
      `${textAsset} → content-encoding: ${encoding || '(none)'}`);
  }
}

/* ── Coverage: did the migration keep every page? ─────────────────────────
 *
 * ⚠ THE CHECK THIS KIT WAS MISSING, AND IT IS THE ONE THAT MATTERS MOST.
 *
 * `SKILL.md`'s first non-negotiable is **"Preserve every URL. Inventory before
 * designing routes."** `recon` builds that inventory. Nothing ever compared it
 * against what the new site actually serves.
 *
 * Every check above asks whether what EXISTS resolves. The Routes section
 * confirms every route the new site emits returns 200 — and a build with three
 * pages where the old site had eighteen passes it cleanly, because all three of
 * them do. Preserved paths does not cover it either: that list is `/feed/`,
 * `robots.txt`, `ads.txt` and `/.well-known/*`, not pages.
 *
 * Found on a real migration. recon had inventoried 18 URLs, the build emitted
 * 3, and verify reported green. The only thing reading the inventory was
 * `redirects`, which proposes and never gates, and only if somebody runs it.
 *
 * A dropped page is unambiguous, so this FAILS rather than warns. The two
 * things that would make it cry wolf are handled: URLs already 404 before the
 * migration are tagged by `recon` and skipped, and a path that 301s to a real
 * page counts as kept — a redirect is a decision, not a loss.
 */
section('Coverage');

const inventory = readInventory(readFileSync);

if (!inventory) {
  console.log(`  ${DIM}no recon/urls.txt — greenfield build, so there is no old site to have lost${RESET}`);
  notes.push('coverage was not checked — run `npm run recon` on a migration and this becomes a gate');
} else {
  const COVERAGE_CAP = 300;
  const toCheck = inventory.live.slice(0, COVERAGE_CAP);
  if (inventory.live.length > COVERAGE_CAP) {
    notes.push(
      `coverage checked the first ${COVERAGE_CAP} of ${inventory.live.length} inventoried URL(s) — ` +
        'raise COVERAGE_CAP for a full sweep',
    );
  }

  console.log(
    `  ${DIM}${toCheck.length} URL(s) the old site served` +
      (inventory.gone.length
        ? `, plus ${inventory.gone.length} already 404 before the migration (skipped)`
        : '') +
      `${RESET}`,
  );

  /*
   * Follow redirects rather than accepting any 3xx. A 301 pointing at a page
   * that itself 404s is a loss wearing a redirect's clothes, and the question
   * here is whether the CONTENT survived, not whether a rule exists.
   */
  const coverage = await pool(toCheck, async (path) => {
    let res = await req(path, { method: 'HEAD', redirect: 'follow' });
    if (res.status === 405 || res.status === 501 || res.status === 0) {
      res = await req(path, { redirect: 'follow' });
    }
    return { path, status: res.status ?? 0, landed: res.url ?? '' };
  });

  const lost = coverage.filter((r) => r.status !== 200);
  record('every page the old site served still resolves', lost.length === 0,
    lost.slice(0, 20).map((r) => `${r.status || 'ERR'}  ${r.path}`).join('\n      ') +
      (lost.length
        ? `\n          ${lost.length} of ${toCheck.length} inventoried URL(s) do not resolve here.` +
          '\n          Either the page was never built, or it needs a 301 in public/_redirects.'
        : ''));

  /*
   * Landing on the homepage is the failure SKILL.md names explicitly: never
   * redirect a legacy URL to the homepage when a specific equivalent exists,
   * because search engines read it as a soft 404. It RESOLVES, so the check
   * above passes it — which is exactly why it needs a line of its own.
   */
  const landedHome = coverage.filter((r) => {
    if (r.path === '/' || r.status !== 200 || !r.landed) return false;
    try {
      return new URL(r.landed).pathname === '/';
    } catch {
      return false;
    }
  });
  record('no old URL lands on the homepage', landedHome.length === 0,
    landedHome.slice(0, 10).map((r) => `${r.path} → /`).join('\n      ') +
      (landedHome.length ? '\n          a legacy URL pointed at the homepage reads as a soft 404' : ''),
    { warn: true });
}

/* ── Preserved paths ───────────────────────────────────────────────────────
 *
 * `recon` reported which of these the OLD site served. Nothing ever confirmed
 * they survived — the inventory said `/feed/` had to keep working and the only
 * thing that would notice it had not was a subscriber, silently.
 *
 * Where recon output is present, check exactly what that migration had. A
 * greenfield build has no old site, so fall back to probing the generic list
 * and report it as information rather than a failure.
 */
section('Preserved paths');

const fromRecon = preservedFromRecon(readFileSync);
const toCheck = fromRecon ?? PRESERVED.map(([p]) => p);

const preservedResults = await pool(toCheck, async (path) => {
  const r = await req(path, { method: 'HEAD' });
  return { path, status: r.status ?? 0, location: r.headers.get('location') ?? '' };
});

const resolves = (r) => r.status === 200 || (r.status >= 300 && r.status < 400);

if (fromRecon) {
  console.log(`  ${DIM}${toCheck.length} path(s) the old site served, from recon/preserved.md${RESET}`);
  const lost = preservedResults.filter((r) => !resolves(r));
  record('every preserved path still resolves', lost.length === 0,
    lost.map((r) => `${r.status || 'ERR'}  ${r.path}`).join('\n      ') +
      (lost.length ? '\n          each of these worked on the old site and does not here' : ''));

  /* A preserved path 301'd to the homepage is a soft 404 for whatever parses
     it — same rule recon applies to the old site. */
  const toHome = preservedResults.filter(
    (r) => r.status >= 300 && r.status < 400 && /^(https?:\/\/[^/]+)?\/$/.test(r.location),
  );
  record('no preserved path redirects to the homepage', toHome.length === 0,
    toHome.map((r) => `${r.path} → ${r.location}`).join('\n      '), { warn: true });
} else {
  const present = preservedResults.filter(resolves);
  console.log(
    `  ${DIM}no recon output — probed the generic list, ${present.length} of ${toCheck.length} present${RESET}`,
  );
  notes.push('preserved paths were checked against the generic list; run `npm run recon` on a migration for the real one');
}

/* ── Redirects ─────────────────────────────────────────────────────────────
 *
 * Parsed from public/_redirects, so the check cannot drift from the rules.
 * A migration's traffic lives here: a rule that silently stopped matching
 * looks identical to one that was never written.
 */
section('Redirects');

if (!existsSync('public/_redirects')) {
  record('public/_redirects present', false, 'no redirect map — expected on a migration');
} else {
  const rules = readFileSync('public/_redirects', 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/\s+/))
    .filter((p) => p.length >= 2 && p[0].startsWith('/'))
    /* Splats and placeholders need a concrete example to test; skip them
       rather than request a literal '*' and report a false failure. */
    .filter((p) => !p[0].includes('*') && !p[0].includes(':'));

  console.log(`  ${DIM}${rules.length} literal rule(s) — splat and placeholder rules are not testable without an example${RESET}`);

  const checked = await pool(rules, async ([from, to, code]) => {
    const expect = Number(code ?? 301);
    const res = await req(from);
    const location = res.headers.get('location') ?? '';
    return { from, to, expect, status: res.status, location };
  });

  const wrongStatus = checked.filter((r) => r.status !== r.expect);
  record('every rule returns its declared status', wrongStatus.length === 0,
    wrongStatus.map((r) => `${r.from} → expected ${r.expect}, got ${r.status || 'ERR'}`).join('\n      '));

  const wrongTarget = checked.filter(
    (r) => r.status === r.expect && !r.location.replace(origin, '').startsWith(r.to.split(/[?#]/)[0].replace(/\*$/, '')),
  );
  record('every rule lands on its declared target', wrongTarget.length === 0,
    wrongTarget.map((r) => `${r.from} → ${r.location || '(no Location)'}, expected ${r.to}`).join('\n      '));

  /* A 301 to a 404 is worse than no redirect: it spends the crawl and loses
     the signal, and reads as working in every status-only check.
     Staging emits no sitemap deliberately, so a rule pointing at one is
     expected to 404 there and only counts on production. */
  const targets = [...new Set(checked.filter((r) => r.status === r.expect).map((r) => r.to))]
    .filter((t) => !(env === 'staging' && /sitemap.*\.xml$/i.test(t)));
  const deadTargets = (
    await pool(targets, async (t) => ({ t, status: (await req(t)).status }))
  ).filter((r) => r.status !== 200 && r.status !== 301 && r.status !== 308);
  record('every redirect target resolves', deadTargets.length === 0,
    deadTargets.map((d) => `${d.t} → ${d.status || 'ERR'}`).join('\n      '));
}

/* ── Headers ───────────────────────────────────────────────────────────── */
section('Headers');

const h = homeRes.headers;
for (const [name, why] of [
  ['referrer-policy', 'from public/_headers'],
  ['permissions-policy', 'from public/_headers'],
  ['content-security-policy', 'from public/_headers — frame-ancestors, base-uri, form-action, object-src'],
]) {
  record(`${name} present`, Boolean(h.get(name)), h.get(name) ? '' : why);
}

/* HSTS and X-Content-Type-Options arrive from the Cloudflare zone, not the
   repo. Nothing in this project would notice them disappearing — which is
   exactly why they are checked here and only warned about, since a local
   wrangler dev has no zone in front of it. */
for (const name of ['strict-transport-security', 'x-content-type-options']) {
  const present = Boolean(h.get(name));
  record(`${name} present`, present,
    present ? '' : 'set at the Cloudflare zone, not in this repo — re-check after any SSL/TLS change',
    { warn: true });
}

const fontRes = await req('/fonts/');
if (fontRes.status !== 404) {
  notes.push('checked /fonts/ for an immutable rule — verify a real font URL by hand');
}

/* ── Form ──────────────────────────────────────────────────────────────────
 *
 * Only the submissions the API refuses. See the header of this file.
 */
section('Form (non-destructive submissions only)');

const formBody = (extra) =>
  new URLSearchParams({ name: 'Verify', email: 'verify@example.com', phone: '5555550123', message: 'verification', ...extra });

const honeypot = await req('/api/contact/', {
  method: 'POST',
  headers: { origin, accept: 'text/html', 'content-type': 'application/x-www-form-urlencoded' },
  body: formBody({ company: 'filled' }),
});
const honeypotLocation = honeypot.headers.get('location') ?? '';
record('caught spam does NOT land on the conversion URL',
  !/[?&]sent=/.test(honeypotLocation),
  `Location: ${honeypotLocation || '(none)'}` +
    (/[?&]sent=/.test(honeypotLocation)
      ? ' — any bot running JavaScript can now inflate the only conversion the site owns'
      : ''));

const empty = await req('/api/contact/', {
  method: 'POST',
  headers: { origin, accept: 'application/json', 'content-type': 'application/json' },
  body: '{}',
});
record('empty submission is rejected', empty.status === 422, `got ${empty.status}, expected 422`);

const crossOrigin = await req('/api/contact/', {
  method: 'POST',
  headers: { origin: 'https://not-this-site.example', accept: 'application/json', 'content-type': 'application/json' },
  body: JSON.stringify({ name: 'x', email: 'x@example.com', phone: '5555550123', message: 'x' }),
});
record('cross-origin submission is refused', crossOrigin.status === 403, `got ${crossOrigin.status}, expected 403`);

/* ── Sitemap quality ───────────────────────────────────────────────────── */
if (env === 'production' && smIndex.status === 200) {
  section('Sitemap');

  const dates = [];
  const noindexed = [];
  await pool(routes.slice(0, 60), async (url) => {
    const res = await req(url);
    if (res.status !== 200) return;
    const body = await res.text();
    if (/<meta[^>]+name=["']robots["'][^>]+noindex/i.test(body)) noindexed.push(url);
  });

  /* A URL in the sitemap is a request to index it; the same URL serving
     noindex is a refusal. Search Console reports the pair as an ERROR against
     the whole submission, and nothing else compares the two lists. */
  record('no sitemap URL serves noindex', noindexed.length === 0,
    noindexed.join('\n      '));

  const smXml = await smIndex.text();
  for (const map of [...smXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])) {
    const r = await req(map);
    if (r.status !== 200) continue;
    const body = await r.text();
    dates.push(...[...body.matchAll(/<lastmod>([^<]{10})/g)].map((m) => m[1]));
  }
  if (dates.length) {
    const distinct = new Set(dates).size;
    /* One date for everything is the failure mode, not a pass: it is what a
       build timestamp or a layout-as-source bug produces, and Google discounts
       lastmod on sites whose values are not consistently accurate. */
    record('lastmod values vary', distinct > 1 || dates.length === 1,
      `${distinct} distinct date(s) across ${dates.length} URL(s)` +
        (distinct === 1 && dates.length > 1 ? ' — one date for every page carries no signal' : ''));
  } else {
    notes.push('no <lastmod> in the sitemap — run `npm run lastmod` and commit src/data/lastmod.json');
  }
}

/* ── Summary ───────────────────────────────────────────────────────────── */
const failed = results.filter((r) => !r.ok && !r.warn);
const warned = results.filter((r) => !r.ok && r.warn);

console.log(`\n${BOLD}── What this cannot see ${'─'.repeat(36)}${RESET}`);
for (const line of [
  'One pageview per visit — a double-count is only visible in Realtime',
  'That a valid submission stores AND emails — send one by hand, once (`npm run check:secrets` covers whether the key is even set)',
  'Whether the analytics container is the client\'s own — fetch it and read it',
  'Whether a redirect target is the RIGHT page, only that it resolves',
  'How fast it FEELS — weight and blocking counts are the inputs, never a timing. ' +
    'Lighthouse on the deployed URL, mobile, simulated throttling, 2+ samples per variant',
  ...notes,
]) {
  console.log(`  ${DIM}·${RESET} ${DIM}${line}${RESET}`);
}

console.log('');
if (failed.length) {
  console.error(`${RED}✗ ${failed.length} check(s) failed${RESET}${warned.length ? `, ${warned.length} warning(s)` : ''} against ${origin}\n`);
  process.exit(1);
}
console.log(`${GREEN}✓ ${results.length - warned.length} check(s) passed${RESET}${warned.length ? `, ${YELLOW}${warned.length} warning(s)${RESET}` : ''} against ${origin}\n`);
