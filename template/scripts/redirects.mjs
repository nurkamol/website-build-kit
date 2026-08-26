/**
 * Propose a redirect map from the old site's URLs to the new site's routes.
 *
 *   npm run redirects                             # new routes from dist/
 *   npm run redirects -- https://new.example.com  # new routes from a deployed sitemap
 *
 * Reads recon/urls.txt (from `npm run recon`) and writes recon/redirects.proposed.
 *
 * ── IT NEVER WRITES public/_redirects ──────────────────────────────────────
 * Deliberately, and this is the whole design. Slug similarity is a guess. A
 * generator that edited the live map would turn a guess into a decision nobody
 * made, and a wrong 301 is worse than a 404: the 404 shows up in the log and
 * gets fixed, while the wrong redirect looks like it works and quietly sends
 * people and link equity to the wrong page for years.
 *
 * You copy the lines you agree with. That is the point.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * The redirect map is the highest-traffic-risk step of a migration and it was
 * built by hand, late, from a list of a few hundred URLs. A missed one is a
 * page that 404s with its backlinks pointing at nothing.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { discoverRoutes } from './lib/routes.mjs';
import { readInventory } from './lib/inventory.mjs';

const RESET = '[0m';
const RED = '[31m';
const GREEN = '[32m';
const YELLOW = '[33m';
const DIM = '[2m';
const BOLD = '[1m';

const origin = process.argv.slice(2).find((a) => a.startsWith('http'))?.replace(/\/$/, '');

const INVENTORY = 'recon/urls.txt';
const OUT = 'recon/redirects.proposed';

if (!existsSync(INVENTORY)) {
  console.error(
    `${RED}✗${RESET} ${INVENTORY} not found.\n` +
      '  Run `npm run recon -- https://old-site.com` first — that is what builds the inventory.',
  );
  process.exit(1);
}

/*
 * Parsed by lib/inventory.mjs, not here. This used to keep every line that was
 * not blank or a comment, which is correct only while the file holds bare
 * paths — a real inventory of ABSOLUTE URLs made it compare
 * `https://site.com/about/` against `/about/`, match nothing, and propose an
 * empty map with no complaint.
 *
 * Already-dead URLs are included deliberately: a path that was 404 on the old
 * site still holds backlinks, so it is exactly the kind of thing that wants a
 * redirect. They are the best candidates here, not noise.
 */
const inventory = readInventory(readFileSync, INVENTORY);
const oldPaths = inventory ? [...inventory.live, ...inventory.gone] : [];

/* ── The new site's routes ─────────────────────────────────────────────── */

const base = origin ?? 'http://localhost';
const { routes, source } = await discoverRoutes(base);
const newPaths = [...new Set(routes.map((r) => new URL(r).pathname))];

if (!newPaths.length) {
  console.error(
    `${RED}✗${RESET} no routes for the new site.\n` +
      '  Build first (`npm run build:staging`), or pass a deployed host.',
  );
  process.exit(1);
}

console.log(`${BOLD}── Matching ${'─'.repeat(46)}${RESET}`);
console.log(`  ${DIM}${oldPaths.length} old path(s) · ${newPaths.length} new route(s) from ${source}${RESET}\n`);

/* ── Similarity ────────────────────────────────────────────────────────────
 *
 * Compares the SLUG, not the whole path, because a migration usually reshapes
 * the directory structure and keeps the leaf: /blog/2019/duct-cleaning-tips/
 * becomes /blog/duct-cleaning-tips/. Comparing full paths scores that pair low
 * for a difference nobody cares about.
 */

/*
 * Words that carry no meaning in a slug.
 *
 * `us` and `we` matter more than they look: without them `/about-us/` scores
 * 54% against `/about/` and lands in the needs-a-human pile — a pair anyone
 * would take instantly. A reviewer handed two hundred obvious lines to confirm
 * stops reading them, which defeats the whole point of the pile.
 */
const NOISE = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'for', 'to', 'in', 'on',
  'your', 'our', 'us', 'we',
]);

const tokens = (path) =>
  path
    .toLowerCase()
    .replace(/\.(html?|php|aspx?)$/, '')
    .split('/')
    .filter(Boolean)
    .pop()
    ?.split(/[-_.]+/)
    .filter((t) => t && !NOISE.has(t) && !/^\d{4}$/.test(t)) ?? [];

function levenshtein(a, b) {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = tmp;
    }
  }
  return prev[b.length];
}

/**
 * 0..1. Token overlap carries most of it — word order changes constantly and
 * should not cost anything — with edit distance breaking ties and rescuing
 * near-misses like `sevices` for `services`.
 */
function similarity(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return 0;

  const setA = new Set(ta);
  const setB = new Set(tb);
  const shared = [...setA].filter((t) => setB.has(t)).length;
  const jaccard = shared / new Set([...setA, ...setB]).size;

  const strA = ta.join('-');
  const strB = tb.join('-');
  const edit = 1 - levenshtein(strA, strB) / Math.max(strA.length, strB.length);

  return jaccard * 0.7 + Math.max(0, edit) * 0.3;
}

/* ── Classify every old path ───────────────────────────────────────────── */

const HIGH = 0.85;
const REVIEW = 0.5;

/*
 * Admin paths must 404, never 301. A redirect from an admin path tells a
 * scanner the site MOVED rather than that the path is gone — free
 * reconnaissance, and it invites the follow-up scan. stacks.md §1d.
 */
const MUST_404 = /^\/(wp-admin|wp-login\.php|xmlrpc\.php|wp-json|wp-includes|administrator|admin)\b/i;

/*
 * A machine-readable path needs the FORMAT at that path, not a redirect to
 * HTML. A directory that fetches and parses a feed gets a marketing page.
 */
const MACHINE = /\.(xml|json|txt|kml|rss|atom|csv)$/i;

const kept = [];
const exact = [];
const high = [];
const review = [];
const none = [];
const must404 = [];
const machine = [];

const newSet = new Set(newPaths);

for (const path of oldPaths) {
  if (newSet.has(path)) {
    kept.push(path);
    continue;
  }
  if (MUST_404.test(path)) {
    must404.push(path);
    continue;
  }
  if (MACHINE.test(path)) {
    machine.push(path);
    continue;
  }

  let best = null;
  let bestScore = 0;
  for (const candidate of newPaths) {
    /* Never propose the homepage for a specific page. Google reads a mass of
       deep URLs landing on `/` as a soft 404 across the whole site, and it is
       the single most common bad redirect map. */
    if (candidate === '/') continue;
    const score = similarity(path, candidate);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  const row = { path, best, score: bestScore };
  if (bestScore >= HIGH) (path.replace(/\/$/, '') === best?.replace(/\/$/, '') ? exact : high).push(row);
  else if (bestScore >= REVIEW) review.push(row);
  else none.push(row);
}

const pct = (n) => `${(n * 100).toFixed(0)}%`;

console.log(`  ${GREEN}✓${RESET} ${kept.length.toString().padStart(4)}  already exist — no redirect needed`);
console.log(`  ${GREEN}✓${RESET} ${high.length.toString().padStart(4)}  high confidence`);
console.log(`  ${YELLOW}!${RESET} ${review.length.toString().padStart(4)}  need a human`);
console.log(`  ${RED}✗${RESET} ${none.length.toString().padStart(4)}  no candidate`);
if (must404.length) console.log(`  ${DIM}·${RESET} ${must404.length.toString().padStart(4)}  admin paths — must 404, never redirect`);
if (machine.length) console.log(`  ${DIM}·${RESET} ${machine.length.toString().padStart(4)}  machine-readable — regenerate, do not redirect`);

/* ── Write the proposal ────────────────────────────────────────────────── */

const lines = [
  '# PROPOSED redirects — not applied. Copy the lines you agree with into',
  '# public/_redirects. Nothing here has been written to the live map.',
  '#',
  '# Matched on slug similarity, which is a guess. A wrong 301 is worse than a',
  '# 404: the 404 shows up in the log and gets fixed, the wrong redirect looks',
  '# like it works and sends people to the wrong page for years.',
  '#',
  `# ${oldPaths.length} old paths against ${newPaths.length} new routes.`,
  '',
];

if (high.length) {
  lines.push(`# ── High confidence (>= ${pct(HIGH)}) — read them, then paste them ────────────`, '');
  for (const r of high) lines.push(`${r.path.padEnd(48)} ${r.best.padEnd(40)} 301   # ${pct(r.score)}`);
  lines.push('');
}

if (review.length) {
  lines.push(
    `# ── NEEDS A HUMAN (${pct(REVIEW)}–${pct(HIGH)}) ─────────────────────────────────────`,
    '# Commented out on purpose. Uncomment only after opening both pages.',
    '',
  );
  for (const r of review) lines.push(`# ⚠ ${pct(r.score)}  ${r.path.padEnd(44)} ${r.best}   301`);
  lines.push('');
}

if (none.length) {
  lines.push(
    '# ── No candidate ───────────────────────────────────────────────────────',
    '# Decide each one: is there an equivalent page, or is this content gone?',
    '# Gone is a legitimate answer — 410 says so honestly. Never send these to',
    '# the homepage to make the list shorter.',
    '',
  );
  for (const r of none) lines.push(`# ⚠ no candidate   ${r.path}`);
  lines.push('');
}

if (must404.length) {
  lines.push(
    '# ── Do NOT redirect: admin paths ───────────────────────────────────────',
    '# These must return a real 404. A 301 from an admin path tells a scanner',
    '# the site moved rather than that the path is gone.',
    '',
  );
  for (const p of must404) lines.push(`#   ${p}`);
  lines.push('');
}

if (machine.length) {
  lines.push(
    '# ── Do NOT redirect: machine-readable ──────────────────────────────────',
    '# Whatever fetches these expects the FORMAT, not a redirect to HTML.',
    '# Regenerate them at the same path. stacks.md §1d.',
    '',
  );
  for (const p of machine) lines.push(`#   ${p}`);
  lines.push('');
}

mkdirSync('recon', { recursive: true });
writeFileSync(OUT, lines.join('\n'));

console.log(`\n${GREEN}✓${RESET} ${OUT}`);
console.log(
  `${DIM}  Nothing was written to public/_redirects. Read the file, paste what you agree\n` +
    `  with, and verify after deploying: \`npm run verify -- https://…\` checks that every\n` +
    `  rule returns its declared status AND that its target actually resolves.${RESET}`,
);

if (review.length || none.length) {
  console.log(
    `\n${YELLOW}⚠${RESET} ${review.length + none.length} path(s) need a decision. ` +
      `${DIM}They are the ones that lose traffic silently.${RESET}`,
  );
}
