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
import { literalContent } from './lib/literal-content.mjs';
import { literalImages } from './lib/literal-images.mjs';
import { routeExists, routesFromPages } from './lib/routes.mjs';

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';

const CONFIG = '.pages.yml';

/*
 * ⚠ `--fix` PRINTS. IT NEVER WRITES.
 *
 *   The name is what people reach for, and the behaviour is what keeps this
 *   safe: for every undeclared key the check already knows the exact dotted
 *   path and the value sitting at it, so it can emit the field declaration to
 *   paste. What it cannot know is whether declaring the key is the RIGHT fix —
 *   for an analytics ID it is not, and this file's own other warning says so.
 *
 *   So the fix is offered, never applied, and the one case where the other
 *   answer is usually correct is marked.
 *
 * It is off by default because this runs in `build:production`, where a gate
 * that floods is a gate somebody switches off.
 */
const SHOW_FIX = process.argv.includes('--fix');

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

/*
 * ⚠ A FIELD MAY BORROW ITS SHAPE FROM `components:`, AND MISSING THAT REPORTS
 *   DATA LOSS THAT IS NOT HAPPENING.
 *
 *   PagesCMS lets a field say `component: image_field` instead of repeating a
 *   field list. This walk used to read only `field.fields`, so every key
 *   inside a borrowed shape looked undeclared — and undeclared, in this
 *   check, means "the client's first save DELETES it".
 *
 *   Measured on a live trilingual site: six phantom problems across three
 *   home pages, every one of them `image.src` / `image.alt` / `image.isRender`
 *   reached through `component: image_field`, which declares exactly those
 *   three. The site was correct and the check was wrong — the worst direction
 *   for this particular check to fail in, because the fix it invites is
 *   pasting duplicate declarations into a config that was already right.
 */
function fieldsOf(field, seen = new Set()) {
  if (!field) return null;
  if (field.component) {
    /* A component referring to itself would otherwise recurse forever. */
    if (seen.has(field.component)) return null;
    seen.add(field.component);
    const base = (config.components ?? {})[field.component];
    /* The field's own keys win over the component's — a call site may
       override the label, or supply its own `fields` outright. */
    return base ? fieldsOf({ ...base, ...field, component: undefined }, seen) : null;
  }
  return Array.isArray(field.fields) ? field.fields : null;
}

/** Every dotted path the schema declares. Arrays reuse the parent prefix. */
function schemaPaths(fields, prefix = '') {
  const out = new Set();
  for (const field of fields ?? []) {
    if (!field?.name) continue;
    const path = prefix ? `${prefix}.${field.name}` : field.name;
    out.add(path);
    const sub = fieldsOf(field);
    if (sub) for (const p of schemaPaths(sub, path)) out.add(p);
  }
  return out;
}

/*
 * ⚠ A FLAT SET OF DECLARED PATHS IS WRONG FOR `type: block`, AND WRONG IN THE
 *   DIRECTION THAT LOSES DATA.
 *
 *   Comparing `dataPaths(data)` against `schemaPaths(fields)` unions every
 *   variant of a block: `sections[].items[].path` reads as declared as long
 *   as ANY section type declares `path`, so a variant missing it is invisible
 *   behind a sibling that has it.
 *
 *   That is the 2026-08-25 incident — PagesCMS deleted card links from a live
 *   `uz/services.json` while this check reported clean, because a different
 *   section type happened to declare the same field name.
 *
 *   So the data is walked ALONGSIDE the schema instead, and each block item
 *   is matched to its OWN variant through the discriminator. A field name
 *   declared by a sibling variant no longer covers for it.
 */
function undeclaredPaths(data, fields, prefix = '', out = new Set()) {
  if (data === null || data === undefined) return out;
  /* A list's items share their parent's prefix — `items[0].x` and
     `items[1].x` are the same declared path. */
  if (Array.isArray(data)) {
    for (const item of data) undeclaredPaths(item, fields, prefix, out);
    return out;
  }
  if (typeof data !== 'object') return out;
  if (!fields) return out;

  const byName = new Map(fields.filter((f) => f?.name).map((f) => [f.name, f]));

  for (const [key, value] of Object.entries(data)) {
    const here = prefix ? `${prefix}.${key}` : key;
    const field = byName.get(key);
    if (!field) {
      out.add(here);
      continue;
    }

    if (field.type === 'block') {
      const discriminator = field.blockKey ?? '_block';
      for (const item of Array.isArray(value) ? value : [value]) {
        if (!item || typeof item !== 'object') continue;
        const variant = (field.blocks ?? []).find((b) => b?.name === item[discriminator]);
        if (!variant) {
          /* An item whose type matches no declared variant has NO schema at
             all, so every key in it would be dropped. */
          out.add(`${here}[] (no block type "${item[discriminator]}")`);
          continue;
        }
        const variantFields = fieldsOf(variant) ?? [];
        for (const [k, v] of Object.entries(item)) {
          if (k === discriminator) continue;
          const vf = variantFields.find((x) => x?.name === k);
          if (!vf) {
            out.add(`${here}[type=${item[discriminator]}].${k}`);
            continue;
          }
          undeclaredPaths(v, fieldsOf(vf), `${here}[type=${item[discriminator]}].${k}`, out);
        }
      }
      continue;
    }

    undeclaredPaths(value, fieldsOf(field), here, out);
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

/** The same walk as `dataPaths`, keeping one sample value per path. */
function pathValues(value, prefix = '', out = new Map()) {
  if (Array.isArray(value)) {
    for (const item of value) pathValues(item, prefix, out);
  } else if (value && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key;
      /* First writer wins: across a collection the first document with a key is
         as good a sample as any, and later ones must not overwrite a rich value
         with a null from a document that happens to omit it. */
      if (!out.has(path)) out.set(path, inner);
      pathValues(inner, path, out);
    }
  }
  return out;
}

/** Frontmatter keys actually used across a collection, as dotted paths. */
function collectionPaths(dir, values = new Map(), fields = null, exclude = []) {
  const out = new Set();
  /*
   * ⚠ `exclude` MUST BE HONOURED, or a file that legitimately sits inside a
   *   collection's directory is checked against the wrong schema.
   *
   *   The real case: a home page living at `pages/ru/home.json` with its own
   *   `type: file` entry and its own fields, while `pages/ru` is a collection
   *   of interior pages. Reading it as a collection item reports every home
   *   page key as undeclared — six confident, wrong data-loss problems on a
   *   config that already handled this correctly by declaring
   *   `exclude: [home.json]`.
   *
   *   A check that cries wolf gets switched off, so this is not cosmetic.
   */
  const excluded = new Set((exclude ?? []).map((e) => String(e)));
  const walk = (d) =>
    readdirSync(d).flatMap((e) => {
      const full = join(d, e);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });
  /*
   * ⚠ `.json` IS NOT OPTIONAL HERE, AND OMITTING IT SKIPS WHOLE COLLECTIONS
   *   IN SILENCE.
   *
   *   This read only `.md`/`.mdx` and took the absence of frontmatter as
   *   "nothing to check". A collection whose items are JSON therefore passed
   *   without a single file being opened — no warning, no count, just a tick.
   *
   *   Measured on a live site: 60 JSON items across six collections, none of
   *   them ever read, while the check reported clean. Astro content
   *   collections take JSON as readily as Markdown, so this is a normal shape
   *   and not an exotic one.
   */
  const withinCollection = (f) => relative(dir, f).split(sep).join('/');
  for (const file of walk(dir).filter(
    (f) => /\.(mdx?|json)$/.test(f) && !excluded.has(withinCollection(f)),
  )) {
    const raw = readFileSync(file, 'utf8');
    let match = null;
    if (/\.json$/.test(file)) {
      match = ['', raw];
    } else {
      match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
    }
    if (!match) continue;
    try {
      const data = (/\.json$/.test(file) ? JSON.parse(match[1]) : parse(match[1])) ?? {};
      /* With `fields`, report only what the schema cannot round-trip — walked
         per file so a block variant is matched to itself. Without it, fall
         back to every path, which is what the callers that only want values
         expect. */
      for (const p of fields ? undeclaredPaths(data, fields) : dataPaths(data)) out.add(p);
      pathValues(data, '', values);
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
    const values = new Map();
    const undeclared = [...collectionPaths(path, values, entry.fields, entry.exclude)];
    if (undeclared.length) {
      problems.push({
        label,
        why: `frontmatter keys the schema does not declare`,
        keys: undeclared,
        path,
        values,
        declared,
      });
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
    const undeclared = [...undeclaredPaths(data, entry.fields)];
    if (undeclared.length) {
      problems.push({
        label,
        why: 'keys in the file the schema does not declare',
        keys: undeclared,
        path,
        values: pathValues(data),
        declared,
      });
    }
  }
}

/* ── media ───────────────────────────────────────────────────────────────── */

/* Declared here, not beside the image checks that read it: the media loop below
   fills it, and a `const` used above its own declaration is a TDZ
   ReferenceError that `node --check` cannot see. This file shipped that way for
   exactly one run. */
const mediaByName = new Map();

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
  if (typeof source === 'object' && source.name) mediaByName.set(source.name, source);
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

/* ── image fields: is the stored VALUE the shape the field type needs? ───── */

/*
 * ⚠ THIS IS THE CHECK THE TOLERANT READER MADE NECESSARY.
 *
 *   `<Img>` accepts a manifest key OR a picker path, which is what lets an
 *   image field be a real picker. But a reader that accepts two formats will
 *   never tell you which one you stored — so converting a field to
 *   `type: image` without migrating its values leaves a site where:
 *
 *     the build is green, astro check is clean, pa11y is clean, and the
 *     rendered HTML is BYTE-IDENTICAL — and every picker in the CMS is broken.
 *
 *   That happened on a real site: eighteen grey squares in the editor and a
 *   GitHub link 404ing, while every automated check said the site was fine.
 *   Nothing rendered by the site can see it, because the CMS is not a page.
 *
 *   `type: image` is built around the PATH — the picker returns one, the
 *   thumbnail loads one, the repo link resolves one. So the value has to start
 *   with that media source's `output`. Convert the field and migrate the data
 *   in the same change.
 */
/** Dotted field path → the `options.path` it is scoped to, when it declares one. */
const scopedPaths = new Map();

function imageFields(fields, prefix = '') {
  const out = [];
  for (const field of fields ?? []) {
    if (!field?.name) continue;
    const path = prefix ? `${prefix}.${field.name}` : field.name;
    /* ⚠ RESOLVE THE COMPONENT FIRST. A picture field is very often a shared
       `component: image_field`, and reading only `field.type` misses every
       one of them — so the check that catches an unpickable path went quiet
       on exactly the fields most likely to have one. Observed live: a home
       page whose picture showed an empty square in the CMS and whose "View on
       GitHub" link 404'd, while this check reported the page clean. */
    const effectiveType =
      field.type ?? (config.components ?? {})[field.component]?.type;
    if (effectiveType === 'image') {
      out.push({ path, media: field.options?.media });
      if (field.options?.path) scopedPaths.set(path, String(field.options.path).replace(/^\.?\//, ''));
    }
    const sub = fieldsOf(field);
    if (sub) out.push(...imageFields(sub, path));
  }
  return out;
}

/** Every value stored at a dotted path, walking through arrays. */
function valuesAt(value, parts) {
  if (value == null) return [];
  if (!parts.length) return Array.isArray(value) ? value : [value];
  if (Array.isArray(value)) return value.flatMap((v) => valuesAt(v, parts));
  if (typeof value !== 'object') return [];
  const [head, ...rest] = parts;
  return valuesAt(value[head], rest);
}

for (const entry of entries) {
  const fields = imageFields(entry?.fields);
  if (!fields.length || !existsSync(entry.path ?? '')) continue;

  const documents = [];
  if (entry.type === 'collection') {
    /* Frontmatter only; a body image is markdown, not a field. */
    const walk = (d) =>
      readdirSync(d).flatMap((e) => {
        const full = join(d, e);
        return statSync(full).isDirectory() ? walk(full) : [full];
      });
    /* JSON items count too — see the note on `collectionPaths`. Filtering to
       markdown here meant image fields in a JSON collection were never
       type-checked at all. */
    for (const file of walk(entry.path).filter((f) => /\.(mdx?|json)$/.test(f))) {
      const raw = readFileSync(file, 'utf8');
      try {
        if (/\.json$/.test(file)) {
          documents.push({ where: rel(file), data: JSON.parse(raw) ?? {} });
        } else {
          const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
          if (m) documents.push({ where: rel(file), data: parse(m[1]) ?? {} });
        }
      } catch {
        /* astro check reports unparseable content properly. */
      }
    }
  } else if (/\.json$/.test(entry.path)) {
    try {
      documents.push({ where: rel(entry.path), data: JSON.parse(readFileSync(entry.path, 'utf8')) });
    } catch {
      /* Already reported above. */
    }
  }

  for (const { path: fieldPath, media: mediaName } of fields) {
    const source =
      (mediaName && mediaByName.get(mediaName)) ?? (media.length === 1 ? media[0] : null);

    /*
     * ⚠ A PICKER SCOPED TO A FOLDER THAT DOES NOT EXIST OPENS ON NOTHING.
     *   `options.path` narrows which directory the media browser shows. Point it
     *   at `public/img/brand` when the files live in `brand-v2/` and the editor
     *   gets an empty folder — no error, no warning, and the build does not
     *   care. It is visible only to the person trying to choose an image, which
     *   is the one person who cannot fix it.
     */
    if (fieldPath && typeof entry.fields === 'object') {
      const scoped = scopedPaths.get(fieldPath);
      if (scoped && !existsSync(scoped)) {
        problems.push({
          label: `${entry.name ?? entry.label} → ${fieldPath}`,
          why: `\`options.path\` is ${JSON.stringify(scoped)}, which does not exist — the picker opens on an empty folder`,
        });
      }
    }

  const output = typeof source === 'object' ? source?.output : null;
    if (!output) continue; // nothing declared to measure against
    /* `output: /` makes "starts with the output" true of every absolute path, so
       it only distinguishes a path from a non-path. Still worth reporting — a
       `type: image` field holding a bare word is a picker showing nothing — but
       do not pretend the test was stronger than it was. */

    /* ⚠ ONE PROBLEM PER FIELD, NOT PER VALUE. A collection of thirty items with
       one bad field produced thirty identical lines on a real project — 78 in
       total for three fields. A gate that floods is a gate that gets switched
       off, and the fix is always the same edit for the whole field. */
    const wrong = [];
    for (const doc of documents) {
      for (const value of valuesAt(doc.data, fieldPath.split('.'))) {
        if (typeof value !== 'string' || !value) continue;
        if (value.startsWith(output)) continue;
        wrong.push({ value, where: doc.where });
      }
    }
    if (wrong.length) {
      const samples = [...new Set(wrong.map((w) => w.value))].slice(0, 3);
      problems.push({
        label: `${entry.name ?? entry.label} → ${fieldPath}`,
        why:
          `is \`type: image\` but ${wrong.length} value(s) are not a path under ${JSON.stringify(output)}` +
          ` — e.g. ${samples.map((v) => JSON.stringify(v)).join(', ')}`,
        picker: true,
        path: wrong[0].where,
      });
    }
  }

  /*
   * ⚠ A BLANK IMAGE SLOT THE CMS WROTE, WHICH BREAKS THE BUILD ON SAVE.
   *
   *   PagesCMS writes an object for every declared object field whether or not
   *   the editor filled it in. A picture left empty therefore arrives as
   *   `{ "isRender": false }` — the boolean has a default, the required
   *   strings do not — and that is NOT a missing optional. It is a present
   *   object failing validation, so `.optional()` on the schema does not save
   *   you.
   *
   *   Observed: the first save by a non-developer broke a production deploy
   *   this way, and the client saw only a failed build in a log they cannot
   *   read. It is the single most likely way a CMS commit takes a site down.
   *
   *   The durable fix is in the SCHEMA, not here — strip a src-less object
   *   before validating:
   *
   *     z.preprocess(
   *       (v) => (v && typeof v === 'object' && !('src' in v) ? undefined : v),
   *       imageObject.optional(),
   *     )
   *
   *   This reports the state so it is caught before the deploy rather than by
   *   the client.
   */
  for (const { path: fieldPath } of fields) {
    if (!fieldPath.includes('.')) continue; // a bare image field has no wrapper
    const parts = fieldPath.split('.');
    const key = parts.pop();
    const blanks = [];
    for (const doc of documents) {
      for (const parent of valuesAt(doc.data, parts)) {
        if (!parent || typeof parent !== 'object' || Array.isArray(parent)) continue;
        if (key in parent) continue;
        /*
         * ⚠ AN OMITTED OPTIONAL FIELD LOOKS EXACTLY LIKE A BLANK SLOT, AND
         *   REPORTING IT IS THIS CHECK'S WHOLE FALSE-POSITIVE CLASS.
         *
         *   Caught on a delivered site: a video list where the first item is
         *   `{ src: 'a-video.mp4' }` and the others also carry a `poster`. The
         *   poster is `.optional()` in the content schema, the page does
         *   `poster: v.poster ?? d.image`, and the component guards on it.
         *   Nothing is wrong, and this reported two problems on a clean site.
         *
         *   What the check is actually for is the object the CMS WROTE with
         *   nothing in it - `{ isRender: false }`, where the boolean has a
         *   default and every string is absent. The signal that separates
         *   them is whether the object carries any real string at all: a
         *   blank slot carries none, an author's omission carries the rest of
         *   the record.
         */
        const substance = Object.values(parent).some(
          (v) => typeof v === 'string' && v.trim() !== '',
        );
        if (substance) continue;
        blanks.push(doc.where);
      }
    }
    if (blanks.length) {
      problems.push({
        label: `${entry.name ?? entry.label} → ${parts.join('.')}`,
        why:
          `is an image slot the CMS filled in PARTIALLY — the object exists but has no \`${key}\`, ` +
          `so it is a present object that fails validation rather than a missing optional. ` +
          `${blanks.length} file(s), e.g. ${blanks[0]}`,
      });
    }
  }
}

/* ── internal links a client can type ────────────────────────────────────── */

/*
 * ⚠ THIS IS WHAT MAKES NAVIGATION SAFE TO PUT IN A CMS.
 *
 *   `stacks.md` kept nav out of the CMS for a good reason — a bad value should
 *   fail the build, not publish. A typo'd path gives a menu item leading to a
 *   404: the page renders, nothing errors, and only a visitor finds it.
 *
 *   But navigation was missing from all five audited sites, so every client had
 *   to ask for a menu change. That is not a rule being respected, it is a gap
 *   the rule creates. The answer is not to forbid the field, it is to verify
 *   it — before the build, while somebody is still looking at the config.
 *
 * ⚠ A DYNAMIC ROUTE IS A PATTERN. `[slug].astro` serves every legal page, so
 *   treating routes as literal strings would report most of a site as broken.
 *   `routesFromPages` returns patterns for those and `routeExists` matches them.
 *
 * External links, `mailto:`, `tel:` and bare anchors are somebody else's
 * problem — `verify` checks those against the deployed site, where they can
 * actually be resolved.
 */
const LINKISH = /(^|\.)(href|url|link|to|target|destination)$/i;
const routes = routesFromPages();
const brokenLinks = [];

if (routes.static.size || routes.dynamic.length) {
  for (const entry of entries) {
    const documents = [];
    if (entry?.type === 'collection' && existsSync(entry.path ?? '')) {
      const walk = (d) =>
        readdirSync(d).flatMap((e) => {
          const full = join(d, e);
          return statSync(full).isDirectory() ? walk(full) : [full];
        });
      for (const file of walk(entry.path).filter((f) => /\.mdx?$/.test(f))) {
        const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(file, 'utf8'));
        if (!m) continue;
        try {
          documents.push({ where: rel(file), data: parse(m[1]) ?? {} });
        } catch {
          /* reported elsewhere */
        }
      }
    } else if (/\.json$/.test(entry?.path ?? '') && existsSync(entry.path)) {
      try {
        documents.push({ where: rel(entry.path), data: JSON.parse(readFileSync(entry.path, 'utf8')) });
      } catch {
        /* reported above */
      }
    }

    for (const doc of documents) {
      const visit = (value, path) => {
        if (Array.isArray(value)) return value.forEach((v) => visit(v, path));
        if (value && typeof value === 'object') {
          for (const [k, v] of Object.entries(value)) visit(v, path ? `${path}.${k}` : k);
          return;
        }
        if (typeof value !== 'string' || !LINKISH.test(path)) return;
        if (!value.startsWith('/')) return; // external, mailto:, tel:, #anchor
        if (routeExists(value, routes)) return;
        brokenLinks.push({ where: doc.where, path, value });
      };
      visit(doc.data, '');
    }
  }
}

if (brokenLinks.length) {
  problems.push({
    label: 'internal links',
    why: `${brokenLinks.length} point at a page this site does not serve`,
    links: brokenLinks,
  });
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
 * ⚠ A CLIENT GUIDE DOES NOT GO OUT OF DATE GRACEFULLY. IT STARTS LYING.
 *
 *   `docs/handover.md` is the only document written for the client. One
 *   project's was written when the CMS had six entries; it had thirteen by the
 *   time anyone looked, and nothing noticed. That is the mild half.
 *
 *   The serious half is that it still said the address and phone number "are
 *   not editable" — which stopped being true the day those moved into the CMS.
 *   A client reading that either asks you to do something she can do herself,
 *   or assumes her address updates everywhere on its own because the document
 *   told her the site owned it.
 *
 *   Only the client ever finds out. So: every entry the CMS shows should be
 *   named in the guide. A warning, not a failure — what the guide says is a
 *   judgement, and a section deliberately left out is a decision.
 */
const GUIDE = join('docs', 'handover.md');

if (existsSync(GUIDE) && entries.length) {
  const guide = readFileSync(GUIDE, 'utf8').toLowerCase();
  const unmentioned = entries
    .map((e) => e?.label ?? e?.name)
    .filter(Boolean)
    .filter((label) => !guide.includes(String(label).toLowerCase()));
  if (unmentioned.length) {
    warnings.push(
      `${unmentioned.length} CMS section(s) the client guide never mentions: ` +
        `${unmentioned.join(', ')}.\n` +
        `      ${GUIDE} is the only document written for the client. A section it omits is one ` +
        `they will not know they can edit — and a claim it makes that the CMS has since ` +
        `contradicted is worse, because they will believe it.`,
    );
  }
}

/*
 * ⚠ A SENTENCE SAYING "PHOTOGRAPHS ARE CHOSEN IN CODE" COVERS THE FIELDS THAT
 *   EXIST AND EXCUSES THE ONES THAT DO NOT.
 *
 *   On a real build that left a header band, four class tiles and a gift-card
 *   picture as string literals in `.astro`, while the config claimed images
 *   were deliberately developer-controlled. The client opened the page, saw a
 *   photograph, and had no way to change it. Nothing was broken; the only
 *   symptom was someone looking for a field that was never there.
 *
 *   A warning, because a fixed image IS sometimes right — a logo, an
 *   illustration that belongs to the layout. The rule is that it must be a
 *   decision, not an oversight.
 */
const literals = literalImages();
if (literals.length) {
  warnings.push(
    `${literals.length} image(s) hardcoded in pages, which the CMS cannot change:\n` +
      literals
        .slice(0, 10)
        .map((l) => `      ${l.file}  ${l.value}`)
        .join('\n') +
      (literals.length > 10 ? `\n      …and ${literals.length - 10} more` : '') +
      `\n      Each is a field the client does not have. Either give it one, or write down ` +
      `why it is fixed — "chosen in code" stops being true the moment the next one is added.`,
  );
}

/*
 * ⚠ AND THE SAME FAILURE ONE LEVEL IN: THE COPY ITSELF.
 *
 *   A page whose content is a `const` array in its own frontmatter renders
 *   correctly, types correctly, and has no field anywhere. Measured across
 *   seven delivered sites that all had a working CMS the client was using:
 *   nine such blocks on three of them, including a twelve-item FAQ about
 *   post-operative medication and a page of seven treatments with their
 *   patient-facing copy.
 *
 *   A warning for the same reason as the images above — an inline list is
 *   sometimes right. It must be a decision, not an oversight.
 */
const inline = literalContent();
if (inline.length) {
  const strings = inline.reduce((n, b) => n + b.strings, 0);
  warnings.push(
    `${inline.length} block(s) of page copy declared inline, holding ${strings} sentence(s) ` +
      `the CMS cannot reach:\n` +
      inline
        .slice(0, 8)
        .map((b) => `      ${b.file}  ${b.name}[${b.items}]  ${b.strings} sentences  "${b.sample}…"`)
        .join('\n') +
      (inline.length > 8 ? `\n      …and ${inline.length - 8} more` : '') +
      `\n      This is what "required sections cannot be edited" looks like in the source. ` +
      `Each block is either deliberately fixed or a page the client cannot touch.`,
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

/*
 * ── The field declarations to paste, built from the data itself ────────────
 *
 * ⚠ THE TYPE COMES FROM THE VALUE, NOT FROM THE NAME. `openingHours` is an
 *   array of objects on one site and a string on another, and guessing from
 *   the key is how a generator produces confident nonsense. Every type below
 *   is read off the value actually sitting at that path.
 *
 * PagesCMS spells a repeated field `list: true` on the field itself rather
 * than as a distinct type, so an array becomes its element's type plus that
 * flag. An empty array cannot say what it holds, and is emitted as a string
 * list with a comment rather than silently picking one.
 */
function fieldType(value) {
  if (Array.isArray(value)) {
    const sample = value.find((v) => v != null);
    if (sample === undefined) return { type: 'string', list: true, unknown: true };
    return { ...fieldType(sample), list: true };
  }
  if (value === null) return { type: 'string', unknown: true };
  if (typeof value === 'number') return { type: 'number' };
  if (typeof value === 'boolean') return { type: 'boolean' };
  if (typeof value === 'object') return { type: 'object' };
  /* A long string is a textarea; a short one is an input. The threshold is the
     point past which a single-line box stops being usable, not a rule. */
  return { type: String(value).length > 80 ? 'text' : 'string' };
}

/** Nest a flat list of dotted paths back into a tree. */
function tree(paths) {
  const root = new Map();
  for (const path of paths) {
    let node = root;
    for (const part of path.split('.')) {
      if (!node.has(part)) node.set(part, new Map());
      node = node.get(part);
    }
  }
  return root;
}

function emitFields(node, values, prefix, indent) {
  const pad = ' '.repeat(indent);
  const lines = [];
  for (const [name, children] of node) {
    const path = prefix ? `${prefix}.${name}` : name;
    const { type, list, unknown } = fieldType(values.get(path));
    const note = unknown ? '   # value was null or empty — check this one' : '';
    if (children.size) {
      lines.push(`${pad}- name: ${name}`);
      lines.push(`${pad}  type: object`);
      if (list) lines.push(`${pad}  list: true`);
      lines.push(`${pad}  fields:`);
      lines.push(...emitFields(children, values, path, indent + 4));
    } else if (list) {
      lines.push(`${pad}- name: ${name}`);
      lines.push(`${pad}  type: ${type}`);
      lines.push(`${pad}  list: true${note}`);
    } else {
      lines.push(`${pad}- { name: ${name}, type: ${type} }${note}`);
    }
  }
  return lines;
}

/**
 * The fix for one undeclared-keys problem, as lines to print.
 *
 * ⚠ A KEY WHOSE PARENT IS ALREADY DECLARED CANNOT BE PASTED AT THE TOP LEVEL.
 *   `analytics` declared and `analytics.gtmId` missing means the field exists
 *   and its `fields:` is short — emitting a second `analytics` field would
 *   give the editor two screens for one object. Those are reported separately,
 *   naming the field to open.
 */
function fixFor(problem) {
  const { keys, values, declared, label, path } = problem;
  const roots = [];
  const nested = new Map();

  for (const key of keys) {
    const parent = key.slice(0, key.lastIndexOf('.'));
    if (key.includes('.') && declared.has(parent)) {
      if (!nested.has(parent)) nested.set(parent, []);
      nested.get(parent).push(key);
    } else if (!keys.some((k) => k !== key && key.startsWith(`${k}.`))) {
      roots.push(key);
    }
  }

  const out = [];
  if (roots.length) {
    const own = keys.filter((k) => roots.some((r) => k === r || k.startsWith(`${r}.`)));
    out.push(`      ${DIM}── paste into \`fields:\` for \`${label}\` ${'─'.repeat(30)}${RESET}`);
    out.push(...emitFields(tree(own), values, '', 6).map((l) => `${DIM}${l}${RESET}`));
  }
  for (const [parent, children] of nested) {
    out.push('');
    out.push(`      ${DIM}── add under the existing \`${parent}\` field's \`fields:\` ──${RESET}`);
    const relative_ = children.map((c) => c.slice(parent.length + 1));
    const scoped = new Map(children.map((c) => [c.slice(parent.length + 1), values.get(c)]));
    out.push(...emitFields(tree(relative_), scoped, '', 6).map((l) => `${DIM}${l}${RESET}`));
  }

  const risky = keys.filter((k) => SECRET_SHAPED.test(k));
  if (risky.length) {
    out.push('');
    out.push(
      `      ${YELLOW}⚠${RESET} ${DIM}${risky.slice(0, 4).join(', ')}${risky.length > 4 ? ', …' : ''} ` +
        `look like technical configuration.\n` +
        `        Moving them OUT of ${rel(path)} is usually the better fix — a client\n` +
        `        cannot diagnose what breaks when one is changed, and it fails silently.${RESET}`,
    );
  }
  return out;
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
    if (!SHOW_FIX) {
      console.error(
        `      ${DIM}Run \`npm run check:cms -- --fix\` to print the field declarations\n` +
          `      to paste, with each type read off the value actually stored there.${RESET}`,
      );
    }
    if (SHOW_FIX) {
      console.error('');
      for (const line of fixFor(p)) console.error(line);
      console.error('');
    }
  }
  if (p.links) {
    for (const l of p.links.slice(0, 8)) {
      console.error(`      ${DIM}${l.where}  ${l.path} = ${JSON.stringify(l.value)}${RESET}`);
    }
    console.error(
      `      ${DIM}A menu item pointing at a missing page renders perfectly and 404s only\n` +
        `      for a visitor. This is what lets navigation be a CMS field at all: the\n` +
        `      value is checked before the build rather than trusted.${RESET}`,
    );
  }
  if (p.picker) {
    console.error(
      `      ${DIM}The site still renders this: <Img> accepts a manifest key as well as a\n` +
        `      picker path. The CMS does not — \`type: image\` is built around the path, so\n` +
        `      the picker shows an empty square and the repo link 404s, while the build,\n` +
        `      the types and the rendered HTML all stay clean.\n\n` +
        `      A reader that accepts two formats cannot tell you which one you stored.\n` +
        `      Convert the field and migrate the values in the same change.${RESET}`,
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
