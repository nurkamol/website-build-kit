/**
 * Alt text, read as TEXT.
 *
 *   node scripts/check-alt.mjs            # warn
 *   node scripts/check-alt.mjs --strict   # exit 1 on any finding
 *
 * Runs after the build, on `dist/`. `build:production` runs it strict and
 * `build:staging` runs it as a warning — the same split as `check-copy` and
 * `tells --undecided-only`, because a placeholder alt is normal WHILE building
 * and unacceptable at go-live.
 *
 * ── THE GAP THIS FILLS ─────────────────────────────────────────────────────
 * axe and htmlcs check that an `<img>` HAS an alt attribute. `Img.astro` makes
 * it a required prop, so a missing one cannot ship at all. **Nothing anywhere
 * reads what it says.**
 *
 * So all of these pass every gate the kit has, and every one of them is useless
 * to the person the attribute exists for:
 *
 *     alt="DSC_0421.jpg"        the camera's filename
 *     alt="hero-1200.webp"      the pipeline's filename
 *     alt="image"               a word that adds nothing to "image"
 *     alt="Photo of a kitchen"  a screen reader already said "image"
 *     nine photographs, all alt="Our work"
 *
 * ── WHY IT READS dist/ AND NOT src/ ────────────────────────────────────────
 * Because the alt text that matters is usually not in `src/`. It is typed by the
 * client, into a CMS field that `check:cms` made sure exists — which is exactly
 * why the value is weak. Markdown images, content collections, `.astro` files
 * and CMS data all arrive at the same place in the end, as one `<img>` tag in a
 * built page, so the built page is the only place to read all of them at once.
 *
 * ── THE RULES ARE DELIBERATELY FEW ─────────────────────────────────────────
 * Alt text is prose, and a check that argues with prose gets switched off. Each
 * rule below is a shape that is wrong regardless of the sentence around it, and
 * the ones that need judgement are deliberately absent: alt matching the page's
 * h1 can be correct on a product page, "screenshot of" conveys a real fact that
 * "image of" does not, and how long is too long depends on the picture.
 *
 * ⚠ `alt=""` IS NEVER A FINDING. An empty alt is how you say "this picture adds
 *   nothing, skip it", and it is the right answer for decoration. The same goes
 *   for `aria-hidden` and `role="presentation"`.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

const strict = process.argv.includes('--strict');

const root = ['dist/client', 'dist'].find((d) => existsSync(d));
if (!root) {
  console.error('check-alt: no dist/ — run a build first.');
  process.exit(1);
}

const walk = (dir) =>
  readdirSync(dir).flatMap((e) => {
    const full = join(dir, e);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

/** Lowercase, collapsed whitespace, no punctuation — for comparing wording. */
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/*
 * A word that is already implied by the element. A screen reader announces an
 * image as an image, so `alt="image"` says it twice and nothing else.
 */
const GENERIC = new Set([
  'image', 'images', 'img', 'photo', 'photos', 'photograph', 'picture', 'pictures',
  'graphic', 'graphics', 'icon', 'logo', 'banner', 'hero', 'thumbnail', 'untitled',
  'placeholder', 'alt', 'alt text',
]);

/*
 * A camera named this file, not a person.
 *
 * ⚠ ANCHORED AT BOTH ENDS, and the first draft was not. Unanchored, `photo` plus
 *   digits matched `alt="Photo 2024 winners"` — ordinary prose about a
 *   photograph — and a check that argues with a real sentence is one people
 *   switch off. It has to be the WHOLE alt to be a filename.
 */
const CAMERA = /^(dsc|img|imgp|pxl|dcim|gopr|p|photo)[-_ ]?\d{3,}([-_ ]?\d+)?$/i;
const HAS_EXTENSION = /\.(jpe?g|png|gif|webp|avif|svg|heic|heif|tiff?|bmp)$/i;

/*
 * A slug, not a sentence: all lowercase, no spaces, at least one hyphen or
 * underscore. `hero-1200` is a manifest key pasted into the field; prose has
 * capitals and spaces and cannot match this.
 *
 * ⚠ THIS REPLACED A RULE THAT COMPARED THE ALT TO THE FILE'S OWN NAME, which
 *   was a false positive waiting to happen: a well-run pipeline has DESCRIPTIVE
 *   filenames, so `ada-lovelace.webp` with `alt="Ada Lovelace"` — correct alt,
 *   good filename — was reported as pasted. The shape of the string is the
 *   evidence, not its resemblance to a path.
 */
const SLUG = /^[a-z0-9]+[-_][a-z0-9._-]*$/;

/*
 * "Image of a kitchen" — the role is announced already, so the first two words
 * are spent saying nothing. Narrow on purpose: "screenshot of the dashboard"
 * conveys a fact that "image of" does not, and is not matched.
 */
const REDUNDANT = /^(an?\s+)?(image|images|photo|photograph|picture|graphic)\s+(of|showing)\b/i;

const VERBOSE = 250;

const findings = [];
const pages = walk(root).filter((f) => f.endsWith('.html'));

for (const file of pages) {
  const html = readFileSync(file, 'utf8');
  const where = relative(root, file);
  /** alt text → the srcs that use it, for the duplicate rule. */
  const byAlt = new Map();

  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    const alt = /\salt=["']([^"']*)["']/i.exec(tag)?.[1];
    if (alt === undefined) continue; // axe's finding, not this one
    const src = /\ssrc=["']([^"']*)["']/i.exec(tag)?.[1] ?? '';

    /* Decorative, and said so. Never a finding. */
    if (alt.trim() === '') continue;
    if (/\saria-hidden=["']true["']/i.test(tag)) continue;
    if (/\srole=["'](presentation|none)["']/i.test(tag)) continue;

    const say = (rule, why) => findings.push({ where, rule, why, alt, src });

    if (HAS_EXTENSION.test(alt.trim())) {
      say('a filename', 'it ends in an image extension, so it was pasted rather than written');
    } else if (CAMERA.test(alt.trim())) {
      say('a filename', 'a camera or the media pipeline named this, not a person');
    } else if (SLUG.test(alt.trim())) {
      say('a slug, not a sentence', 'this is a filename or a manifest key, pasted into the field');
    } else if (GENERIC.has(norm(alt))) {
      say('a word that adds nothing', 'a screen reader already announces this as an image');
    } else if (REDUNDANT.test(alt)) {
      say('a redundant opening', 'the role is announced already — describe the picture, not its medium');
    } else if (alt.length > VERBOSE) {
      say(`${alt.length} characters`, 'too long to hear in one breath — this wants a caption, or text on the page');
    }

    if (!byAlt.has(alt)) byAlt.set(alt, new Set());
    byAlt.get(alt).add(src);
  }

  /*
   * ⚠ ONLY WHEN THE SOURCES DIFFER. The same logo in a header and a footer
   *   shares one alt correctly — it is one image, described once, twice. Two
   *   DIFFERENT pictures sharing a description is the finding: a gallery where
   *   every photograph is "Our work" tells a screen-reader user nothing about
   *   any of them.
   */
  for (const [alt, srcs] of byAlt) {
    if (srcs.size > 1) {
      findings.push({
        where,
        rule: `${srcs.size} different images share this`,
        why: 'each picture needs its own description, or an empty alt if it adds nothing',
        alt,
        src: [...srcs].join(' · '),
      });
    }
  }
}

console.log(`${BOLD}── Alt text ${'─'.repeat(48)}${RESET}`);
console.log(`  ${DIM}${pages.length} built page(s)${RESET}`);

if (!findings.length) {
  console.log(`${GREEN}✓${RESET} every alt says something\n`);
  process.exit(0);
}

const mark = strict ? `${RED}✗${RESET}` : `${YELLOW}!${RESET}`;
console.log('');
for (const f of findings) {
  console.log(`  ${mark} ${f.where}  ${DIM}${f.rule}${RESET}`);
  console.log(`      alt="${f.alt.length > 90 ? `${f.alt.slice(0, 90)}…` : f.alt}"`);
  console.log(`      ${DIM}${f.why}${RESET}`);
}

console.log(
  `\n${mark} ${findings.length} alt attribute(s) that pass axe and tell a screen-reader user nothing.\n` +
    `  ${DIM}An empty alt is the right answer whenever the picture adds nothing to the page.${RESET}\n`,
);

process.exit(strict ? 1 : 0);
