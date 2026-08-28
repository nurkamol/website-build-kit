/**
 * A URL cannot be in the sitemap AND serve `noindex`.
 *
 *   node scripts/check-sitemap.mjs        # after a production build
 *
 * Runs at the end of `build:production`, against dist/ — so the contradiction
 * is caught before the deploy rather than after, which is the only part
 * `npm run verify` cannot do.
 *
 * ── THE FAILURE THIS EXISTS FOR ────────────────────────────────────────────
 * A URL in the sitemap is a request to index it. The same URL serving
 * `noindex` is a refusal. Search Console reports the pair as **"Submitted URL
 * marked 'noindex'" — an error, not a warning**, counted against the whole
 * submission, so one contradictory page devalues the file every other page is
 * listed in.
 *
 * Seen on a live site: a `/search/` page sat in the sitemap and served
 * `noindex` from the day it was built. Nothing compares the two lists, so it
 * stayed invisible until the sitemap was actually submitted, weeks later.
 *
 * ── WHY A CHECK AND NOT A FIX ──────────────────────────────────────────────
 * The obvious fix is to make the sitemap derive from the pages' own `noindex`.
 * It cannot: `@astrojs/sitemap` decides inclusion in astro.config.mjs, which is
 * evaluated before any page renders, so at that moment nothing knows which
 * routes will emit the tag. The exclusion list in the config and the pages
 * themselves are two sources of truth by construction — this is what keeps them
 * honest.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const RESET = '[0m';
const RED = '[31m';
const GREEN = '[32m';
const DIM = '[2m';

const root = ['dist/client', 'dist'].find((d) => existsSync(d));
if (!root) {
  console.error('check-sitemap: no dist/ — run a build first.');
  process.exit(1);
}

/* Staging emits no sitemap, deliberately. Nothing to contradict. */
const sitemaps = readdirSync(root).filter((f) => /^sitemap.*\.xml$/.test(f));
if (!sitemaps.length) {
  console.log(`${DIM}· no sitemap in ${root}/ — staging build, nothing to check${RESET}`);
  process.exit(0);
}

const listed = new Set();
for (const file of sitemaps) {
  const xml = readFileSync(join(root, file), 'utf8');
  for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const loc = m[1].trim();
    if (/sitemap.*\.xml$/i.test(loc)) continue; // an index pointing at its children
    try {
      listed.add(new URL(loc).pathname);
    } catch {
      /* ignore a malformed loc — the build would have failed elsewhere */
    }
  }
}

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

/*
 * Match the META TAG, not the word. The accessibility page explains what
 * `noindex` means in prose, and a substring search reports it as noindex —
 * a false positive that would train someone to ignore this check.
 */
const ROBOTS_META = /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*\bnoindex\b/i;

const noindexed = walk(root)
  .filter((f) => f.endsWith('.html'))
  .filter((f) => ROBOTS_META.test(readFileSync(f, 'utf8')))
/* ⚠ SEPARATORS NORMALISED — `relative()` RETURNS BACKSLASHES ON WINDOWS.
   A URL path is always `/`. Without this the map produced `/about\\` for
   `about\\index.html`, which matched nothing: check-sitemap's contradiction
   check silently passed a site that listed a noindexed URL in its sitemap, and
   Search Console reports that as an error against the whole submission. */
  .map((f) => '/' + relative(root, f).split(sep).join('/')
      .replace(/index\.html$/, '').replace(/\.html$/, '/'))
  .map((p) => (p.endsWith('/') ? p : `${p}/`));

const contradictions = noindexed.filter((p) => listed.has(p));

if (!contradictions.length) {
  console.log(
    `${GREEN}✓${RESET} sitemap and noindex agree ` +
      `${DIM}(${listed.size} listed, ${noindexed.length} noindex, no overlap)${RESET}`,
  );
  process.exit(0);
}

console.error(`\n${RED}✗ ${contradictions.length} URL(s) are in the sitemap AND serve noindex${RESET}\n`);
for (const p of contradictions) console.error(`    ${p}`);

console.error(
  `\n  Search Console reports this as "Submitted URL marked 'noindex'" — an ERROR,\n` +
    `  counted against the whole submission, not just these pages.\n\n` +
    `  Fix ONE of the two, never leave both:\n` +
    `    · exclude the route in the sitemap \`filter\` in astro.config.mjs, or\n` +
    `    · stop the page emitting noindex\n`,
);

if (contradictions.includes('/')) {
  console.error(
    `  ${DIM}'/' is here because the scaffold home page sets noindex while \`unbuilt\`\n` +
      `  is true. Replace src/pages/index.astro with the real page — a production\n` +
      `  build of the template skeleton is not a thing to deploy.${RESET}\n`,
  );
}

process.exit(1);
