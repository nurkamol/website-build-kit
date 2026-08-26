/**
 * Regenerate src/data/lastmod.json — per-route content dates for the sitemap.
 *
 *   npm run lastmod        # then commit the JSON alongside your change
 *
 * ── WHY A COMMITTED FILE AND NOT git AT BUILD TIME ────────────────────────
 * The first implementation read `git log` during the Astro build. It worked
 * locally and emitted NOTHING in production, because Cloudflare Workers Builds
 * shallow-clones: `git log` returns one grafted commit for every file, so the
 * module's own guard correctly refused to stamp 23 identical dates.
 *
 * That guard was right and the design was wrong. A build should not depend on
 * repository history it may not have been given. So the dates are computed
 * here, by a human running a script with a full clone, and committed as data —
 * which is how every other fact in this project is handled.
 *
 * ── UNCOMMITTED WORK COUNTS AS TODAY ──────────────────────────────────────
 * If a page's source is modified but not yet committed, its last commit date
 * is the PREVIOUS edit — so running this before committing would record a date
 * that is already stale. Modified files are therefore dated today, so the
 * normal flow works:
 *
 *     edit a page → npm run lastmod → commit both together
 *
 * ── WHAT MOVES A DATE, AND WHAT DELIBERATELY DOES NOT ─────────────────────
 * A route's own page file and content file move it. Layout, nav and stylesheet
 * changes do NOT — see the long note in src/lib/lastmod.mjs. Google asks for
 * the last SIGNIFICANT content change and says not to bump for boilerplate;
 * treating a footer edit as a change to all 23 pages collapses every date to
 * the same day and destroys the only signal the field carries.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';

const OUT = 'src/data/lastmod.json';

const git = (args) =>
  execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

if (git(['rev-parse', '--is-shallow-repository']) === 'true') {
  console.error(
    'This is a shallow clone — per-file history is not available, so the dates\n' +
      'would all be identical. Run `git fetch --unshallow` first.',
  );
  process.exit(1);
}

/** Files with uncommitted changes. Their real "last modified" is now, not their last commit. */
const dirty = new Set(
  git(['status', '--porcelain'])
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(3).trim()),
);

const today = new Date().toISOString().slice(0, 10);

function newest(files) {
  const present = files.filter((f) => existsSync(f));
  if (!present.length) return null;
  if (present.some((f) => dirty.has(f))) return today;
  try {
    const out = git(['log', '-1', '--format=%cI', '--', ...present]);
    return out ? out.slice(0, 10) : null;
  } catch {
    return null;
  }
}

/**
 * ⚠ PROJECT CONFIG. Routes whose content comes from somewhere other than a
 * same-named page file — a data file, a shared component, an API route.
 *
 * A route's date is the newest commit touching its own page file plus anything
 * listed here. Omitting a real source UNDERSTATES a page's freshness, which is
 * the safer direction to be wrong in: a crawler re-crawls later than ideal,
 * rather than being told something false.
 *
 * ⚠ Deliberately NOT here: layouts, nav and stylesheets. Adding them is
 * literally correct — a footer link does change every document — and it
 * collapses every route to the same date, which is indistinguishable from
 * stamping the build time and carries no prioritisation signal at all. Google
 * asks for the last SIGNIFICANT content change and says explicitly not to bump
 * for navigation or boilerplate.
 *
 *   '/pricing/': ['src/data/pricing.json'],
 *   '/contact/': ['src/pages/api/contact.ts'],
 */
const EXTRA_SOURCES = {};

const sources = new Map();

const walk = (dir, prefix = '') => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name !== 'api') walk(full, `${prefix}${entry.name}/`);
      continue;
    }
    if (!entry.name.endsWith('.astro') || entry.name.startsWith('[')) continue;
    const base = entry.name.replace(/\.astro$/, '');
    sources.set(base === 'index' ? `/${prefix}` : `/${prefix}${base}/`, [full]);
  }
};
walk('src/pages');

/*
 * ⚠ PROJECT CONFIG — content collections rendered through a dynamic route.
 *
 * The markdown is what actually changed, so it leads; the template is a
 * secondary source. Each directory is optional: a project without the
 * collection simply skips it rather than crashing, because a kit script that
 * assumes a directory exists only works on the project it was written for.
 *
 *   { dir: 'src/content/legal', template: 'src/pages/[slug].astro', prefix: '' }
 */
const COLLECTIONS = [
  { dir: 'src/content/legal', template: 'src/pages/[slug].astro', prefix: '' },
];

for (const { dir, template, prefix } of COLLECTIONS) {
  if (!existsSync(dir)) continue;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.md')) continue;
    sources.set(`/${prefix}${file.replace(/\.md$/, '')}/`, [`${dir}/${file}`, template]);
  }
}

/* Routes the sitemap never contains. Dating them is harmless but misleading. */
/* Routes the sitemap never contains — keep in step with the filter in
   astro.config.mjs. Dating them is harmless but misleading. */
const EXCLUDED = new Set(['/404/', '/search/', '/thank-you/']);

const out = {};
for (const [route, files] of [...sources].sort()) {
  if (EXCLUDED.has(route)) continue;
  const date = newest([...files, ...(EXTRA_SOURCES[route] ?? [])]);
  if (date) out[route] = date;
}

writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');

const spread = Object.values(out).reduce((m, d) => m.set(d, (m.get(d) ?? 0) + 1), new Map());
console.log(`${Object.keys(out).length} routes written to ${OUT}`);
for (const [date, n] of [...spread].sort()) console.log(`  ${date}  ${n} page${n > 1 ? 's' : ''}`);
if (dirty.size) console.log(`\n${dirty.size} uncommitted file(s) dated today — commit the JSON with them.`);
