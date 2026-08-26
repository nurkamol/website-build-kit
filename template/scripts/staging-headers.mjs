/**
 * Add `X-Robots-Tag: noindex` to every response on a NON-PRODUCTION build.
 *
 * Runs inside `build:staging`, after the adapter has written `_headers`.
 *
 * ── WHY A HEADER AND NOT JUST THE META TAG ─────────────────────────────────
 * `<meta name="robots">` lives in `<head>`. A PDF has no head. Nor does an
 * image, a CSV export, an `.ics` file or anything else the site serves that is
 * not HTML — so on staging every one of those was indexable while the pages
 * around them were not. The header is the only one of the three controls that
 * covers a whole response regardless of its type.
 *
 * ── IT DOES NOT REPLACE ACCESS CONTROL ─────────────────────────────────────
 * A crawler still has to FETCH the response to read a header, exactly as it has
 * to fetch a page to read the meta tag. So this closes the non-HTML gap and
 * changes nothing about the larger point: `Disallow: /` stops the fetch, which
 * stops both. The only thing that reliably keeps staging out of an index is not
 * letting anyone reach it — Cloudflare Access. See docs/runbook.md §1.
 *
 * ── WHY IT REFUSES ON PRODUCTION ───────────────────────────────────────────
 * Writing `noindex` into a production deploy is the single most expensive
 * mistake this kit can make, and it is silent: the site builds, deploys, looks
 * perfect, and quietly leaves the index over the following weeks. So this reads
 * the environment itself rather than trusting the script it is called from.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const RESET = '[0m';
const RED = '[31m';
const GREEN = '[32m';
const DIM = '[2m';

const env = process.env.PUBLIC_SITE_ENV ?? 'development';

if (env === 'production') {
  console.error(
    `${RED}✗${RESET} refusing to write noindex headers into a PRODUCTION build.\n` +
      '  This script is for staging only. Nothing was written.',
  );
  process.exit(1);
}

const file = ['dist/client/_headers', 'dist/_headers'].find(existsSync);

if (!file) {
  console.error(
    `${RED}✗${RESET} no _headers in dist/. Run this after \`astro build\`, not before —\n` +
      '  the Cloudflare adapter writes that file during the build.',
  );
  process.exit(1);
}

if (readFileSync(file, 'utf8').includes('X-Robots-Tag')) {
  console.log(`${DIM}· X-Robots-Tag already present in ${file}${RESET}`);
  process.exit(0);
}

/*
 * ⚠ MERGED INTO THE EXISTING `/*` BLOCK, NEVER APPENDED AS A SECOND ONE.
 *
 * A duplicate path in `_headers` does not combine — the later block REPLACES
 * the earlier. Appending `/*` with only X-Robots-Tag therefore silently dropped
 * Referrer-Policy, Permissions-Policy and the CSP from every response, while
 * the build still reported "Parsed 5 valid header rules" and the file still
 * visibly contained all of them.
 *
 * `npm run verify` caught it: three header checks that had been green went red.
 * Nothing else would have.
 *
 * noarchive as well as noindex, so a cached copy is not shown even where the
 * URL is already known; nofollow so a crawler that does reach staging does not
 * walk it and find the rest.
 */
const lines = readFileSync(file, 'utf8').split('\n');
const at = lines.findIndex((l) => l.trim() === '/*');

if (at === -1) {
  console.error(
    `${RED}✗${RESET} no \`/*\` block in ${file} to merge into.\n` +
      '  public/_headers should carry the security headers under `/*`.',
  );
  process.exit(1);
}

/* The note goes on its own line. `_headers` does not strip an inline `#`, so a
   trailing comment is sent as part of the header VALUE — the first version of
   this shipped `noindex, nofollow, noarchive   # staging only …` to every
   crawler. Only visible by reading the response, never by reading the file. */
lines.splice(
  at + 1,
  0,
  '  # staging only — added by scripts/staging-headers.mjs',
  '  X-Robots-Tag: noindex, nofollow, noarchive',
);
writeFileSync(file, lines.join('\n'));

console.log(`${GREEN}✓${RESET} X-Robots-Tag: noindex on every response (${env} build)`);
console.log(
  `${DIM}  Covers non-HTML, which the meta tag cannot. It is not access control —\n` +
    `  a crawler still has to fetch the response to read it. See runbook.md §1.${RESET}`,
);
