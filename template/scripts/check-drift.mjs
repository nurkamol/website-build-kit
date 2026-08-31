/**
 * What a delivered site is missing, because the kit moved on without it.
 *
 *   npm run check:drift
 *   node scripts/check-drift.mjs --json     # for CI, or for many sites at once
 *
 * ── WHY THIS IS DIFFERENT FROM EVERY OTHER CHECK HERE ──────────────────────
 * ⚠ THE TEMPLATE IS COPIED, NOT LINKED. Nothing the kit fixes afterwards
 *   reaches a site already built. Every other gate in this directory protects
 *   the next project; this one is the only thing that speaks to the ones
 *   already shipped.
 *
 * The cost is not hypothetical. A delivered site served every image about 19%
 * larger than intended for weeks after the pipeline gained AVIF, and it
 * surfaced only because somebody happened to read two trees side by side for an
 * unrelated reason. The same site still carried a source file with a literal
 * NUL — invisible to `git diff`, to `grep`, and to the provenance sweep.
 *
 * ── IT REPORTS. IT NEVER CHANGES ANYTHING. ─────────────────────────────────
 * Exit 0 whatever it finds, unless it cannot run at all. A remediation tool
 * that edits before you have read its findings is not a tool, it is a surprise.
 *
 * ── WHY IT DOES NOT RE-IMPLEMENT THE OTHER CHECKS ──────────────────────────
 * Where the current kit ships a check, drift means *not having that check*, so
 * this looks for the file rather than repeating what it does. Copying the
 * logic in would leave two implementations free to disagree — which is exactly
 * the failure this whole round of work was about.
 *
 * Where no check exists, it analyses: AVIF, binary source files, hardcoded
 * images, a pipeline that discards silently.
 *
 * ── RUNNING IT IN A SITE THAT PREDATES IT ──────────────────────────────────
 * Copy `scripts/check-drift.mjs` and `scripts/lib/` in, then run it. It reads
 * only; nothing it needs has to be installed first, except `yaml` for the two
 * CMS rows — and it says so rather than skipping them in silence.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { binarySourceFiles } from './lib/binary-files.mjs';
import { literalImages } from './lib/literal-images.mjs';

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

const json = process.argv.includes('--json');

/* `yaml` arrives with Astro, but a site old enough to drift may not resolve it.
   Two rows depend on it, and they say so rather than reporting a clean result
   they never computed. */
let parseYaml = null;
try {
  ({ parse: parseYaml } = await import('yaml'));
} catch {
  /* handled per row */
}

const read = (file) => {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
};

const findings = [];
const add = (id, title, status, detail) => findings.push({ id, title, status, detail });

/* ── which kit, if it says ────────────────────────────────────────────────── */

const pkg_ = read('package.json');
const manifest = pkg_ ? JSON.parse(pkg_) : {};
const stamp = manifest.websiteBuildKit ?? null;

/*
 * ⚠ THE TEMPLATE ITSELF IS NOT A DRIFTED SITE. It is the source, and it never
 *   carries a stamp — the scaffolder writes one into the COPY. Reporting the
 *   kit's own template as behind the kit is the kind of false positive that
 *   teaches people to ignore the whole report, and this one appeared the first
 *   time this script was run.
 */
const isTemplate = manifest.name === 'site-name';

add(
  'K',
  'Kit version recorded',
  isTemplate ? 'n/a' : stamp ? 'ok' : 'drift',
  isTemplate
    ? 'this is the kit template itself, which is stamped when it is scaffolded'
    : stamp
      ? `${stamp.version}, scaffolded ${stamp.scaffolded ?? 'unknown'}`
      : 'no stamp — this site predates the version stamp, so which kit it came from has to be worked out by hand',
);

/* ── D1 · a modern output format ──────────────────────────────────────────── */

const media = read('scripts/optimize-media.mjs');
if (!media) {
  add('D1', 'Modern image format', 'n/a', 'no scripts/optimize-media.mjs — this site has no kit media pipeline');
} else {
  /* ⚠ THE DECLARATION, NOT ANY MENTION OF THE WORD. A pipeline with AVIF turned
     OFF still documents how to turn it on — `Set FORMATS to ['webp'] to turn
     AVIF off` — so a bare search for the string reports the opposite of the
     truth on exactly the sites this exists for. */
  const formats = /const\s+FORMATS\s*=\s*\[([^\]]*)\]/.exec(media);
  const avif = formats ? /['"]avif['"]/.test(formats[1]) : false;
  add(
    'D1',
    'Modern image format',
    avif ? 'ok' : 'drift',
    avif
      ? 'the pipeline emits AVIF alongside WebP'
      : 'WebP only. AVIF is about 26% smaller at matched quality — measured, but MEASURE IT HERE before quoting a number, because the saving depends on the photography',
  );

  /* ── D6 · a pipeline that discards files in silence ─────────────────────── */
  const reports = /produced no image/.test(media);
  const catches = /failed to process/.test(media);
  add(
    'D6',
    'Pipeline reports what it dropped',
    reports && catches ? 'ok' : 'drift',
    reports && catches
      ? 'names skipped files, and one bad file no longer aborts the run'
      : `${!reports ? 'a non-raster file is dropped with no output and no warning' : ''}${!reports && !catches ? '; ' : ''}${!catches ? 'one corrupt file aborts the run midway, leaving the manifest describing a state that no longer exists' : ''}`,
  );

  const heic = /heic/i.test(media);
  add(
    'D1b',
    'HEIC accepted',
    heic ? 'ok' : 'drift',
    heic
      ? 'iPhone photographs convert'
      : 'a .heic is discarded with no output and no manifest entry, while the installed libvips reads it fine',
  );
}

/* ── D2 · source files that defeat review ─────────────────────────────────── */

try {
  const { tracked, binary } = binarySourceFiles();
  add(
    'D2',
    'Source files readable as text',
    binary.length ? 'drift' : 'ok',
    binary.length
      ? `${binary.length} tracked file(s) git calls BINARY — invisible to git diff, to grep, and to the provenance sweep: ${binary.join(', ')}`
      : `${tracked.length} tracked source file(s), all readable`,
  );
} catch (err) {
  add('D2', 'Source files readable as text', 'n/a', `git unavailable — ${err.message}`);
}

/* ── D5 · images the client cannot change ─────────────────────────────────── */

const literals = literalImages();
add(
  'D5',
  'Images are fields, not literals',
  literals.length ? 'drift' : 'ok',
  literals.length
    ? `${literals.length} hardcoded in pages, e.g. ${literals
        .slice(0, 3)
        .map((l) => `${l.value} (${l.file})`)
        .join(', ')} — each is an image the client can see and cannot change`
    : 'no hardcoded image references in pages',
);

/* ── the CMS rows ─────────────────────────────────────────────────────────── */

const CONFIG = '.pages.yml';
if (!existsSync(CONFIG)) {
  for (const [id, title] of [
    ['D3', 'CMS image fields are pickers'],
    ['D4', 'CMS cannot delete undeclared keys'],
    ['D8', 'Client guide matches the CMS'],
  ]) {
    add(id, title, 'n/a', 'no .pages.yml — this site has no CMS');
  }
} else if (!parseYaml) {
  for (const [id, title] of [
    ['D3', 'CMS image fields are pickers'],
    ['D4', 'CMS cannot delete undeclared keys'],
    ['D8', 'Client guide matches the CMS'],
  ]) {
    add(id, title, 'n/a', 'yaml is not installed here, so the CMS config could not be read — `npm i -D yaml`');
  }
} else {
  /* D3 is analysed because no shipped check covers it. */
  let config = null;
  try {
    config = parseYaml(readFileSync(CONFIG, 'utf8')) ?? {};
  } catch (err) {
    config = null;
    add('D3', 'CMS image fields are pickers', 'n/a', `${CONFIG} does not parse — ${err.message}`);
  }

  if (config) {
    const flatten = (list) =>
      (list ?? []).flatMap((e) => (e?.type === 'group' ? flatten(e.items ?? e.content ?? []) : [e]));
    const textBoxes = [];
    const walkFields = (fields, entry, prefix = '') => {
      for (const f of fields ?? []) {
        if (!f?.name) continue;
        const path = prefix ? `${prefix}.${f.name}` : f.name;
        if (/^(image|photo|poster|picture|cover|thumbnail)$/i.test(f.name) && f.type !== 'image') {
          textBoxes.push(`${entry}.${path} (type: ${f.type ?? 'unset'})`);
        }
        if (Array.isArray(f.fields)) walkFields(f.fields, entry, path);
      }
    };
    for (const entry of flatten(config.content)) walkFields(entry?.fields, entry?.name ?? '?');
    add(
      'D3',
      'CMS image fields are pickers',
      textBoxes.length ? 'drift' : 'ok',
      textBoxes.length
        ? `${textBoxes.length} image field(s) are text boxes, so the editor must type a key from memory: ${textBoxes.slice(0, 4).join(', ')}`
        : 'image fields use the picker',
    );
  }

  /* D4 and D8 have a shipped check. Drift means not having it. */
  const hasCms = existsSync(join('scripts', 'check-cms.mjs'));
  add(
    'D4',
    'CMS cannot delete undeclared keys',
    hasCms ? 'ok' : 'drift',
    hasCms
      ? 'scripts/check-cms.mjs is present — run it'
      : '⚠ no check-cms.mjs. A CMS rewrites the whole file from its schema, so any key it does not declare is DELETED on the client\'s first save. Five audited sites, five failures, two losing data',
  );
  add(
    'D8',
    'Client guide matches the CMS',
    hasCms && existsSync(join('docs', 'handover.md')) ? 'ok' : 'drift',
    !existsSync(join('docs', 'handover.md'))
      ? 'no docs/handover.md — the client has a CMS and no instructions for it'
      : hasCms
        ? 'check-cms.mjs cross-references the guide against the config'
        : 'nothing checks the guide against the config; a guide that has gone stale does not read as stale, it reads as true',
  );
}

/* ── D7 · text over photographs ───────────────────────────────────────────── */

const hasContrast = existsSync(join('scripts', 'check-contrast.mjs'));
const declares = existsSync(join('src', 'data', 'contrast.json'));
add(
  'D7',
  'Text over photographs is measured',
  hasContrast ? (declares ? 'ok' : 'n/a') : 'drift',
  hasContrast
    ? declares
      ? 'regions declared and measured in build:production'
      : 'the check is present and this site declares no regions — correct if no text sits on a photograph'
    : 'no check-contrast.mjs. axe and pa11y report a flat ~1.01:1 for text on an image, so a photograph that makes the navigation unreadable passes every gate',
);

/* ── report ───────────────────────────────────────────────────────────────── */

if (json) {
  console.log(JSON.stringify({ findings }, null, 2));
  process.exit(0);
}

const mark = { ok: `${GREEN}✓${RESET}`, drift: `${YELLOW}!${RESET}`, 'n/a': `${DIM}·${RESET}` };
const drifted = findings.filter((f) => f.status === 'drift');

console.log(`\n${BOLD}── Drift from the current kit ${'─'.repeat(28)}${RESET}\n`);
for (const f of findings) {
  console.log(`  ${mark[f.status]} ${f.title}`);
  console.log(`      ${DIM}${f.detail}${RESET}`);
}

console.log('');
if (!drifted.length) {
  console.log(`${GREEN}✓${RESET} nothing behind that this can see\n`);
} else {
  console.log(
    `${YELLOW}!${RESET} ${drifted.length} of ${findings.length} behind the current kit\n\n` +
      `  ${DIM}Nothing has been changed. Decide what is worth doing before doing any of it —\n` +
      `  some of these are invisible to visitors and some are a client unable to edit\n` +
      `  their own photographs, and they are not the same job.${RESET}\n`,
  );
}
