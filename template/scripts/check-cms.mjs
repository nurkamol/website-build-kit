/**
 * Refuse a CMS config that will silently destroy content.
 *
 *   npm run check:cms
 *
 * A no-op when the project has no `.pages.yml` — the kit ships no CMS, and a
 * check that cannot run says so rather than printing a tick it did not earn.
 *
 * ── THE FAILURE THIS EXISTS FOR ────────────────────────────────────────────
 * ⚠ A CMS REWRITES THE WHOLE FILE FROM ITS SCHEMA. Any key the schema does not
 *   declare is absent from what it writes back — not merged, not flagged. The
 *   editor changes one field, hits save, and everything the config forgot is
 *   gone from the repo. In the diff it reads as an ordinary content commit.
 *
 * This is not hypothetical. Audited across five shipped sites, two were losing
 * data on the client's first save:
 *
 *   site.json      analytics.ga4MeasurementId, analytics.gtmId,
 *                  analytics.googleTagId, analytics.cloudflareToken,
 *                  businessType, openingHours, socials.google
 *   home_{en,ru,uz}.json   cta.image.src/alt/isRender,
 *                          quote.image.src/alt/isRender
 *
 * Read the first one again: the moment the client opens Site Settings and saves,
 * every analytics ID is deleted. Tracking stops, opening hours vanish from the
 * JSON-LD, and nobody is told. On the multilingual site, all three homepages
 * lose their CTA and quote images at once.
 *
 * 27 keys were at risk across those two projects. Every one was invisible to
 * `astro check`, to the build, and to a reviewer reading the config — because
 * the config is *valid*. It just describes less than the file contains.
 *
 * ── AND MEDIA POINTED THE WRONG WAY ────────────────────────────────────────
 * Two of the five declared their upload directory as `public/img`, which is
 * where `optimize-media.mjs` WRITES. An upload there is servable but has no
 * variants, no width/height and no manifest entry, so `<Img>` throws and the
 * client's own edit turns the build red. Uploads belong in the pipeline's
 * INPUT — `media/source/` — and the direction is the whole bug.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parse } from 'yaml';

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';

const CONFIG = '.pages.yml';

if (!existsSync(CONFIG)) {
  console.log(`${DIM}·${RESET} no ${CONFIG} — no CMS to check`);
  process.exit(0);
}

let config;
try {
  config = parse(readFileSync(CONFIG, 'utf8')) ?? {};
} catch (err) {
  console.error(`\n${RED}✗ ${CONFIG} does not parse${RESET}\n\n  ${err.message}\n`);
  process.exit(1);
}

const problems = [];
const warnings = [];

/* PagesCMS nests with `items`, not `content`. Getting this wrong reports every
   grouped config as having zero entries — which looks like a clean pass. */
const flatten = (entries) =>
  (entries ?? []).flatMap((entry) =>
    entry?.type === 'group' ? flatten(entry.items ?? entry.content ?? []) : [entry],
  );

/** Every dotted path the schema declares. Arrays reuse the parent prefix. */
function schemaPaths(fields, prefix = '') {
  const out = new Set();
  for (const field of fields ?? []) {
    if (!field?.name) continue;
    const path = prefix ? `${prefix}.${field.name}` : field.name;
    out.add(path);
    if (Array.isArray(field.fields)) for (const p of schemaPaths(field.fields, path)) out.add(p);
  }
  return out;
}

/** Every dotted path the DATA contains. An array's items sit at its own prefix. */
function dataPaths(value, prefix = '') {
  const out = new Set();
  if (Array.isArray(value)) {
    for (const item of value) for (const p of dataPaths(item, prefix)) out.add(p);
  } else if (value && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key;
      out.add(path);
      for (const p of dataPaths(inner, path)) out.add(p);
    }
  }
  return out;
}

/** Frontmatter keys actually used across a collection, as dotted paths. */
function collectionPaths(dir) {
  const out = new Set();
  const walk = (d) =>
    readdirSync(d).flatMap((e) => {
      const full = join(d, e);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });
  for (const file of walk(dir).filter((f) => /\.mdx?$/.test(f))) {
    const raw = readFileSync(file, 'utf8');
    const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
    if (!match) continue;
    try {
      for (const p of dataPaths(parse(match[1]) ?? {})) out.add(p);
    } catch {
      /* A collection item with unparseable frontmatter is the content
         collection's problem, and astro check reports it properly. */
    }
  }
  return out;
}

const rel = (p) => relative(process.cwd(), p).split(sep).join('/');

/* ── content entries ─────────────────────────────────────────────────────── */

const entries = flatten(config.content);

if (!entries.length) {
  warnings.push(`${CONFIG} declares no content entries — the editor sees an empty CMS`);
}

for (const entry of entries) {
  const label = entry?.name ?? entry?.label ?? '(unnamed)';
  const path = entry?.path;
  if (!path) {
    problems.push({ label, why: 'has no `path`' });
    continue;
  }
  if (!existsSync(path)) {
    problems.push({ label, why: `path does not exist: ${path}` });
    continue;
  }

  const declared = schemaPaths(entry.fields);

  if (entry.type === 'collection') {
    const used = collectionPaths(path);
    const undeclared = [...used].filter((p) => !declared.has(p));
    if (undeclared.length) {
      problems.push({ label, why: `frontmatter keys the schema does not declare`, keys: undeclared, path });
    }
    continue;
  }

  if (/\.json$/.test(path)) {
    let data;
    try {
      data = JSON.parse(readFileSync(path, 'utf8'));
    } catch (err) {
      problems.push({ label, why: `${path} is not valid JSON — ${err.message}` });
      continue;
    }
    const undeclared = [...dataPaths(data)].filter((p) => !declared.has(p));
    if (undeclared.length) {
      problems.push({ label, why: 'keys in the file the schema does not declare', keys: undeclared, path });
    }
  }
}

/* ── media ───────────────────────────────────────────────────────────────── */

/* Where optimize-media.mjs writes. An upload here is not an input, it is a
   file dropped into generated output. */
const GENERATED = ['public/img', 'dist', '.astro'];

const media = config.media ? (Array.isArray(config.media) ? config.media : [config.media]) : [];

for (const source of media) {
  const input = typeof source === 'string' ? source : source?.input;
  const name = (typeof source === 'object' && source?.name) || input || '(unnamed)';
  if (!input) {
    problems.push({ label: `media ${name}`, why: 'has no `input`' });
    continue;
  }
  const normalised = input.replace(/^\.?\//, '').replace(/\/$/, '');
  if (GENERATED.some((g) => normalised === g || normalised.startsWith(`${g}/`))) {
    problems.push({
      label: `media ${name}`,
      why: `uploads into ${input}, which is GENERATED output`,
      direction: true,
    });
    continue;
  }
  if (!existsSync(input)) {
    problems.push({ label: `media ${name}`, why: `input directory does not exist: ${input}` });
    continue;
  }
  if (typeof source === 'object' && !source.extensions) {
    warnings.push(
      `media "${name}" declares no \`extensions\` — a bad format is accepted in the UI and ` +
        `fails the build twenty minutes later instead of being refused at the door`,
    );
  }
}

/* ── coverage, and secrets ───────────────────────────────────────────────── */

/*
 * ⚠ WARNINGS, NEVER FAILURES. What belongs in a CMS is a judgement — a single
 *   -location business has no business needing a Locations collection, and a
 *   gate that insists otherwise gets switched off. But "the client says whole
 *   sections are missing" was the actual complaint from five delivered sites,
 *   and it is checkable: content exists in the repo that no CMS entry points at.
 *
 *   Audited across those five, navigation was absent from ALL FIVE, and
 *   testimonials from four. Nothing reported it, because nothing looked.
 */
const covered = new Set(
  entries.map((e) => (e?.path ?? '').replace(/^\.?\//, '').replace(/\/$/, '')).filter(Boolean),
);

/*
 * Generated files — a CMS editing these would be editing build output.
 *
 * ⚠ MATCHED BY SHAPE, NOT BY NAME. This began as a two-name list and
 *   immediately produced a false positive on a real project's
 *   `media-manifest.json`, which is the denylist problem in miniature: it knows
 *   only the files already thought of. Anything `*manifest.json` is written by
 *   a build step, and `lastmod.json` is named because dates are generated too.
 */
const isGenerated = (file) => /manifest\.json$/.test(file) || file === 'lastmod.json';

const uncovered = [];

if (existsSync('src/content')) {
  for (const dir of readdirSync('src/content', { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const path = `src/content/${dir.name}`;
    if (![...covered].some((c) => c === path || c.startsWith(`${path}/`))) uncovered.push(path);
  }
}

if (existsSync('src/data')) {
  for (const file of readdirSync('src/data')) {
    if (!file.endsWith('.json') || isGenerated(file)) continue;
    const path = `src/data/${file}`;
    if (!covered.has(path)) uncovered.push(path);
  }
}

if (uncovered.length) {
  warnings.push(
    `${uncovered.length} content source(s) exist that no CMS entry points at — the client cannot ` +
      `edit them, and "whole sections are missing" is how that gets reported:\n` +
      uncovered.map((u) => `      ${u}`).join('\n') +
      `\n      Each is either a deliberate developer-controlled file or a gap. Decide which.`,
  );
}

/*
 * ⚠ A SECRET IN A CMS IS A SECRET THE CLIENT CAN READ AND CHANGE. Analytics
 *   IDs, tokens and keys are technical configuration: their failure mode is
 *   silent (tracking stops, mail stops) and no editor can diagnose it.
 */
const SECRET_SHAPED = /(^|[._-])(api|secret|token|key|password|credential|apikey)([._-]|$)|(ga4|gtm|analytics|measurement)/i;

for (const entry of entries) {
  const risky = [...schemaPaths(entry?.fields)].filter((f) => SECRET_SHAPED.test(f));
  if (risky.length) {
    warnings.push(
      `"${entry?.name ?? entry?.label}" exposes field(s) that look like technical configuration ` +
        `rather than content: ${risky.join(', ')}. A client cannot diagnose what breaks when one ` +
        `is changed, and the failure is silent.`,
    );
  }
}

/* ── report ──────────────────────────────────────────────────────────────── */

for (const w of warnings) console.log(`  ${YELLOW}!${RESET} ${w}`);

if (!problems.length) {
  console.log(
    `${GREEN}✓${RESET} ${CONFIG}: ${entries.length} entrie(s), every key declared` +
      (media.length ? `, ${media.length} media source(s)` : ''),
  );
  process.exit(0);
}

console.error(`\n${RED}✗ ${problems.length} problem(s) in ${CONFIG}${RESET}\n`);

for (const p of problems) {
  console.error(`    ${p.label}  —  ${p.why}`);
  if (p.keys) {
    for (const k of p.keys.slice(0, 12)) console.error(`      ${DIM}${k}${RESET}`);
    if (p.keys.length > 12) console.error(`      ${DIM}…and ${p.keys.length - 12} more${RESET}`);
    console.error(
      `      ${DIM}These exist in ${rel(p.path)} and are NOT in the schema, so the first\n` +
        `      save from this screen DELETES them. Declare every key — including ones\n` +
        `      the client will never touch — or move them out of a CMS-managed file.${RESET}`,
    );
  }
  if (p.direction) {
    console.error(
      `      ${DIM}The direction is the bug. optimize-media.mjs READS media/source/ and\n` +
        `      WRITES public/img/. An upload into the output has no variants, no\n` +
        `      width/height and no manifest entry, so <Img> throws and the client's\n` +
        `      own edit turns the build red.\n\n` +
        `      input:  media/source/uploads    what the pipeline reads\n` +
        `      output: /img/uploads            what it writes, once processed${RESET}`,
    );
  }
  console.error('');
}

process.exit(1);
