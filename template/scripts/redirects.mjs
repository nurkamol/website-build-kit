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
import { HIGH, MACHINE, MUST_404, REVIEW, similarity } from './lib/path-match.mjs';

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

/* ── Classify every old path ───────────────────────────────────────────── */

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
