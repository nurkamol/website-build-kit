/**
 * Refuse a redirect map that is silently wrong.
 *
 *   npm run check:redirects
 *
 * Runs in `build:production`. A no-op when there is no `public/_redirects`.
 *
 * ── WHY THIS IS ITS OWN CHECK ──────────────────────────────────────────────
 * `redirects.mjs` PROPOSES a map from the old site's inventory. Nothing has
 * ever checked the map that a human then edited — and the editing is where the
 * mistakes are, because a redirect file is the one artefact in a migration
 * that is written by hand, in bulk, under time pressure, about URLs nobody can
 * see any more.
 *
 * ⚠ EVERY FAILURE BELOW IS INVISIBLE AT DEPLOY. The file parses, the site
 *   builds, the pages are fine. What breaks is a URL that used to rank, weeks
 *   later, in somebody else's analytics.
 *
 * ── WHAT IT CATCHES, AND WHY EACH ONE MATTERS ──────────────────────────────
 * **A duplicate source.** Cloudflare takes the FIRST match and ignores the
 * rest, silently. So the second rule — usually the one somebody added later,
 * on purpose, to fix something — never fires at all, and the fix appears not
 * to work for reasons nothing explains.
 *
 * **A self-redirect.** `/a → /a` is a loop the browser stops after ~20 hops
 * with ERR_TOO_MANY_REDIRECTS. The page is simply gone, and it is gone only in
 * production, because nobody clicks the old URL in development.
 *
 * **A loop.** `/a → /b → /a`. The same, with an extra step to hide it.
 *
 * **A chain.** `/a → /b → /c` costs a redundant round trip on every visit and
 * leaks a little PageRank at each hop. Cloudflare resolves only one hop per
 * request, so a chain is also slower than it looks.
 *
 * **An unsupported status.** Cloudflare `_redirects` accepts only
 * 200/301/302/303/307/308. Anything else makes the platform reject the rule —
 * see `traps.md`, where a trailing comment rejected the whole FILE.
 */

import { existsSync, readFileSync } from 'node:fs';

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';

const FILE = 'public/_redirects';
const ALLOWED = new Set([200, 301, 302, 303, 307, 308]);

if (!existsSync(FILE)) {
  console.log(`${DIM}·${RESET} no ${FILE} — nothing to validate`);
  process.exit(0);
}

const problems = [];
const warnings = [];
const rules = [];

const lines = readFileSync(FILE, 'utf8').split('\n');

lines.forEach((raw, index) => {
  const line = raw.trim();
  if (!line || line.startsWith('#')) return;

  /* ⚠ SPLIT ON WHITESPACE, NOT ON A SINGLE SPACE. Columns in a hand-edited
     file are aligned with runs of spaces, and a naive split reports every
     aligned rule as malformed — which on a real migration is all of them. */
  const parts = line.split(/\s+/);
  const [from, to, status] = parts;

  if (!from || !to) {
    problems.push({ line: index + 1, why: `is not a rule: ${JSON.stringify(line)}`, raw: line });
    return;
  }

  const code = status === undefined ? 301 : Number(status);
  if (!Number.isInteger(code) || !ALLOWED.has(code)) {
    problems.push({
      line: index + 1,
      why: `status ${JSON.stringify(status)} is not one Cloudflare accepts (200, 301, 302, 303, 307, 308)`,
      raw: line,
    });
    return;
  }

  rules.push({ line: index + 1, from, to, code, raw: line });
});

/* ── a duplicate source ───────────────────────────────────────────────────── */

const bySource = new Map();
for (const rule of rules) {
  const key = rule.from;
  if (bySource.has(key)) {
    problems.push({
      line: rule.line,
      why: `duplicate source ${key} — first declared on line ${bySource.get(key).line}. Cloudflare takes the FIRST match, so this rule never fires`,
      raw: rule.raw,
    });
  } else {
    bySource.set(key, rule);
  }
}

/* ── self-redirects, loops and chains ─────────────────────────────────────── */

/* Compare with and without a trailing slash: `/a` and `/a/` are the same page
   to a reader and to Cloudflare's matcher, and a loop written across the two
   forms is the one nobody spots by eye. */
const norm = (p) => (p.length > 1 ? p.replace(/\/+$/, '') : p);

for (const rule of rules) {
  if (norm(rule.from) === norm(rule.to)) {
    problems.push({
      line: rule.line,
      why: `redirects to itself — a browser stops after about twenty hops and the page is simply gone`,
      raw: rule.raw,
    });
  }
}

const target = new Map(rules.map((r) => [norm(r.from), r]));

/*
 * ⚠ WALK FIRST, THEN DECIDE. Reporting a hop as a chain the moment it is seen
 *   means a LOOP is announced as a chain and then as a loop — two messages, the
 *   first of them wrong, and the wrong one arrives first. Collect the walk, and
 *   only call it a chain if it actually terminates.
 */
for (const rule of rules) {
  if (norm(rule.from) === norm(rule.to)) continue; // already reported

  const path = [norm(rule.from)];
  const hops = [];
  let cursor = target.get(norm(rule.to));
  let looped = false;

  while (cursor && hops.length < 20) {
    const here = norm(cursor.from);
    if (path.includes(here)) {
      looped = true;
      path.push(here);
      break;
    }
    path.push(here);
    hops.push(cursor);
    cursor = target.get(norm(cursor.to));
  }

  if (looped) {
    problems.push({
      line: rule.line,
      why: `is part of a redirect LOOP: ${path.join(' → ')}`,
      raw: rule.raw,
    });
  } else if (hops.length) {
    const last = hops[hops.length - 1];
    warnings.push(
      `line ${rule.line}: ${rule.from} reaches ${last.to} in ${hops.length + 1} hops. ` +
        `Cloudflare resolves one per request, so point this rule straight at ${last.to}`,
    );
  }
}

/* ── report ──────────────────────────────────────────────────────────────── */

const unique = [...new Set(warnings)];
for (const w of unique) console.log(`  ${YELLOW}!${RESET} ${w}`);

if (!problems.length) {
  console.log(
    `${GREEN}✓${RESET} ${rules.length} redirect rule(s): no duplicates, no loops, every status supported`,
  );
  process.exit(0);
}

console.error(`\n${RED}✗ ${problems.length} problem(s) in ${FILE}${RESET}\n`);
for (const p of problems) {
  console.error(`    line ${p.line}  ${p.why}`);
  console.error(`      ${DIM}${p.raw}${RESET}`);
}
console.error(
  `\n  ${DIM}None of these stop the file parsing or the site building. They break a URL\n` +
    `  that used to rank, weeks later, in somebody else's analytics.${RESET}\n`,
);
process.exit(1);
