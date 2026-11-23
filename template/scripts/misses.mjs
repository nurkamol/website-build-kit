/**
 * After launch: the addresses visitors asked for that the new site does not
 * have, most-missed first, each with a redirect worth considering.
 *
 *   LEADS_EXPORT_TOKEN=… npm run misses -- https://example.com
 *   LEADS_EXPORT_TOKEN=… npm run misses -- https://example.com --min=3   # only paths missed 3+ times
 *   LEADS_EXPORT_TOKEN=… npm run misses -- https://example.com --json
 *
 * Reads /api/missed/ (the counts the 404 page reports — src/pages/api/missed.ts)
 * and matches each path against recon/urls.txt and the live site's routes.
 * Prints proposed lines for public/_redirects. NEVER writes them. Exit 0 with
 * a report, 1 when the counts cannot be read.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * runbook.md §4 says "Week 1: 404 log — real 404s are URLs you missed in the
 * inventory", and the template had no 404 log. Its pages are static files, so
 * nothing on the request path sees a miss, and Cloudflare's analytics show
 * status codes without the paths behind them. The URLs that matter most after
 * a migration — the ones still arriving from old backlinks, bookmarks and
 * printed material — were invisible until Search Console mailed about them
 * weeks later.
 *
 * ── HOW IT DECIDES ─────────────────────────────────────────────────────────
 *   old URL     the path is in recon/urls.txt: it existed on the old site and
 *               the redirect map missed it. Matched against the live routes
 *               with the same scorer `npm run redirects` uses
 *   own link    the latest referrer is this site itself: a broken internal
 *               link. Fix the link; a redirect would hide it
 *   new         neither. A typo, an old campaign URL, or a link someone else
 *               got wrong — a redirect only if the count says it matters
 *
 * Paths already in public/_redirects are flagged rather than proposed again:
 * a rule that exists and still 404s is a rule that does not match.
 *
 * ── IT NEVER WRITES public/_redirects ──────────────────────────────────────
 * Same reason as `redirects`: a wrong 301 looks like it works and sends people
 * to the wrong page for years; a 404 at least shows up here.
 */

import { existsSync, readFileSync } from 'node:fs';

import { readInventory } from './lib/inventory.mjs';
import { discoverRoutes } from './lib/routes.mjs';
import { HIGH, MACHINE, MUST_404, REVIEW, similarity } from './lib/path-match.mjs';
import { cleanMissedPath } from '../src/lib/missed-paths.mjs';

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

const argv = process.argv.slice(2);
const json = argv.includes('--json');
const min = Number((argv.find((a) => a.startsWith('--min=')) ?? '').slice(6)) || 1;
const target = argv.find((a) => !a.startsWith('--')) ?? process.env.PUBLIC_SITE_URL;
const token = process.env.LEADS_EXPORT_TOKEN ?? '';

if (!target || !/^https?:\/\//i.test(target)) {
  console.error(
    'usage: LEADS_EXPORT_TOKEN=… npm run misses -- https://example.com [--min=N] [--json]\n' +
      '  The token is the one /api/leads.csv takes — `wrangler secret put LEADS_EXPORT_TOKEN`.',
  );
  process.exit(1);
}
const ORIGIN = target.replace(/\/$/, '');

/* ── The counts ──────────────────────────────────────────────────────────── */

let res;
try {
  res = await fetch(`${ORIGIN}/api/missed/`, { headers: { authorization: `Bearer ${token}` } });
} catch (err) {
  console.error(`${RED}✗${RESET} ${ORIGIN} did not answer: ${err.cause?.code ?? err.message}`);
  process.exit(1);
}
if (res.status === 401) {
  console.error(`${RED}✗${RESET} unauthorized — LEADS_EXPORT_TOKEN ${token ? 'is not the one this site has' : 'is not set in this shell'}.`);
  process.exit(1);
}
if (res.status === 503) {
  console.error(
    `${RED}✗${RESET} the 404 watcher is not running on ${ORIGIN}: ${(await res.text()).trim()}\n` +
      `  Bind a MISSES KV namespace (the commented block in wrangler.jsonc) and deploy production.\n` +
      `  It counts from then on — nothing before it was recorded.`,
  );
  process.exit(1);
}
let data;
try {
  data = res.ok ? await res.json() : null;
} catch {
  data = null;
}
if (!data || !Array.isArray(data.misses)) {
  console.error(
    `${RED}✗${RESET} ${ORIGIN}/api/missed/ answered ${res.status} without the counts.\n` +
      '  A site built before the 404 watcher shipped has no such route — see check:drift.',
  );
  process.exit(1);
}

/* ── What to match against ───────────────────────────────────────────────── */

const inventory = readInventory(readFileSync);
const oldPaths = new Set([...(inventory?.live ?? []), ...(inventory?.gone ?? [])]);
const { routes, source } = await discoverRoutes(ORIGIN);
const livePaths = [...new Set(routes.map((r) => new URL(r).pathname))];

const redirected = new Set(
  existsSync('public/_redirects')
    ? readFileSync('public/_redirects', 'utf8')
        .split('\n')
        .map((l) => l.trim().split(/\s+/)[0])
        .filter((p) => p && p.startsWith('/'))
    : [],
);

/* The two trailing-slash spellings of an address are one row. */
const key = (p) => (p.length > 1 ? p.replace(/\/+$/, '') : p);
const grouped = new Map();
let dropped = 0;
for (const m of data.misses) {
  if (!cleanMissedPath(m.path) || MUST_404.test(m.path)) {
    dropped++;
    continue;
  }
  const k = key(m.path);
  const g = grouped.get(k) ?? { path: m.path, hits: 0, last: '', from: {} };
  g.hits += Number(m.hits) || 0;
  if (m.last > g.last) g.last = m.last;
  for (const [h, n] of Object.entries(m.from ?? {})) g.from[h] = (g.from[h] ?? 0) + n;
  grouped.set(k, g);
}

const siteHost = new URL(ORIGIN).hostname.replace(/^www\./, '');
const rows = [...grouped.values()]
  .filter((r) => r.hits >= min)
  .sort((a, b) => b.hits - a.hits || a.path.localeCompare(b.path))
  .map((r) => {
    const own = Object.keys(r.from).some((h) => h === siteHost);
    const old = oldPaths.has(r.path) || oldPaths.has(key(r.path)) || oldPaths.has(`${key(r.path)}/`);
    const already = redirected.has(r.path) || redirected.has(key(r.path)) || redirected.has(`${key(r.path)}/`);
    let best = null;
    let score = 0;
    if (!MACHINE.test(r.path)) {
      for (const c of livePaths) {
        /* Never the homepage for a specific page — a mass of deep URLs landing
           on `/` reads to Google as a site-wide soft 404. */
        if (c === '/' || key(c) === key(r.path)) continue;
        const s = similarity(r.path, c);
        if (s > score) {
          score = s;
          best = c;
        }
      }
    }
    return { ...r, kind: own ? 'own link' : old ? 'old URL' : 'new', already, best: score >= REVIEW ? best : null, score };
  });

if (json) {
  console.log(JSON.stringify({ origin: ORIGIN, retentionDays: data.retentionDays, routesFrom: source, misses: rows, dropped }, null, 2));
  process.exit(0);
}

/* ── Report ──────────────────────────────────────────────────────────────── */

const pct = (n) => `${Math.round(n * 100)}%`;
console.log(`${BOLD}── Missed on ${ORIGIN} ${'─'.repeat(Math.max(0, 45 - ORIGIN.length))}${RESET}`);
console.log(
  `  ${DIM}${rows.length} address(es)${min > 1 ? ` missed ${min}+ times` : ''} over the last ${data.retentionDays ?? '?'} days · ` +
    `${livePaths.length} live route(s) from ${source}${inventory ? ` · ${oldPaths.size} old URL(s) in recon/urls.txt` : ' · no recon/urls.txt'}${RESET}`,
);
if (dropped) console.log(`  ${DIM}${dropped} bot probe(s) and junk path(s) left out (wp-login.php, .env and similar)${RESET}`);

if (!rows.length) {
  console.log(`\n${GREEN}✓${RESET} nothing missed${min > 1 ? ` ${min}+ times` : ''} — no visitor has hit a dead end that is still being counted\n`);
  process.exit(0);
}

console.log('');
for (const r of rows.slice(0, 50)) {
  const mark = r.already ? `${RED}✗${RESET}` : r.kind === 'own link' ? `${RED}!${RESET}` : r.kind === 'old URL' ? `${YELLOW}!${RESET}` : `${DIM}·${RESET}`;
  const from = Object.keys(r.from).length ? `  ${DIM}from ${Object.keys(r.from).slice(0, 3).join(', ')}${RESET}` : '';
  console.log(`  ${mark} ${String(r.hits).padStart(5)}×  ${r.path}  ${DIM}${r.kind}, last ${r.last}${RESET}${from}`);
  if (r.already) console.log(`           ${RED}already in public/_redirects and still a 404 — that rule does not match${RESET}`);
  else if (r.kind === 'own link') console.log(`           ${DIM}a link on this site points here — fix the link, not the address${RESET}`);
}
if (rows.length > 50) console.log(`  ${DIM}… ${rows.length - 50} more (--json for all)${RESET}`);

const proposals = rows.filter((r) => !r.already && r.kind !== 'own link' && r.best);
const sure = proposals.filter((r) => r.score >= HIGH);
const unsure = proposals.filter((r) => r.score < HIGH);
if (proposals.length) {
  console.log(`\n  ${BOLD}Proposed for public/_redirects — not written. Open both pages before pasting.${RESET}`);
  for (const r of sure) console.log(`    ${r.path.padEnd(44)} ${r.best.padEnd(36)} 301   # ${pct(r.score)}, ${r.hits}×`);
  for (const r of unsure) console.log(`    # ⚠ ${pct(r.score)}  ${r.path.padEnd(40)} ${r.best.padEnd(36)} 301`);
}
const none = rows.filter((r) => !r.already && r.kind !== 'own link' && !r.best);
if (none.length) {
  console.log(
    `\n  ${DIM}${none.length} with no candidate. Gone is a legitimate answer — never send them to the\n` +
      `  homepage to make the list shorter.${RESET}`,
  );
}
console.log(`\n  ${DIM}Nothing was written. After pasting, deploy and run \`npm run verify -- ${ORIGIN}\`.${RESET}\n`);
