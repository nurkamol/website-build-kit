/**
 * Generate one Open Graph card per page.
 *
 *   npm run cards
 *
 * Writes 1200x630 JPEGs to public/img/social/og-<slug>.jpg and registers them
 * in src/data/image-manifest.json. Seo.astro picks the card up automatically
 * from the canonical path, so a new page gets one by adding a row to CARDS in
 * scripts/og-cards.config.mjs and re-running.
 *
 * ── THIS FILE HOLDS NO DESIGN ──────────────────────────────────────────────
 * Every colour, face, size, string and card lives in og-cards.config.mjs, which
 * ships as a stub. What is here is the machinery: the crop-safe box, the
 * contrast measurement, and the composite ordering — each of which was got
 * wrong once, silently, on a real build.
 *
 * ── WHY JPEG AND NOT WEBP/SVG ──────────────────────────────────────────────
 * Facebook and LinkedIn still fail to render a WebP og:image, and no scraper
 * accepts SVG. A shared post would unfurl with no picture at all. This is the
 * one place in the build where JPEG is the correct answer.
 *
 * ── REQUIREMENTS ───────────────────────────────────────────────────────────
 * ImageMagick (`magick`), `rsvg-convert`, and python3 with fontTools. None are
 * npm packages, so preflight() checks for them by hand and names the missing
 * one — an `npm run` that only works on its author's machine is worse than no
 * script at all. See docs/runbook.md §1.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { PALETTE, FONTS, WORDMARK, TYPE, FOOTER, CARDS } from './og-cards.config.mjs';

const OUT = 'public/img/social';
const TMP = '.og-tmp';
const W = 1200;
const H = 630;

/*
 * Layout, derived from how platforms CROP a card rather than from taste.
 *
 * X/Twitter renders a 2:1 slice of this 1.91:1 card, and iMessage and WhatsApp
 * crop harder still. `MARGIN` is the visual gutter; `SAFE_TOP` is the stricter
 * box that anything load-bearing stays inside, so a crop never takes a word or
 * clips the logo. Type sizes are a design choice and live in the config.
 */
const MARGIN = 76;
const SAFE_TOP = 92;

/* ── Preflight ─────────────────────────────────────────────────────────────
 *
 * Every check here failed on a real machine at least once. The Buffer dump an
 * uncaught execFileSync produces is not a diagnosis, so nothing below is
 * allowed to reach one.
 */

function have(bin, args = ['--version']) {
  try {
    execFileSync(bin, args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** The install line for the platform this is actually running on. */
const hint = (brew, winget, apt) =>
  process.platform === 'win32'
    ? `winget install ${winget}`
    : process.platform === 'linux'
      ? `sudo apt install ${apt}`
      : `brew install ${brew}`;

function preflight() {
  const missing = [];

  if (!PALETTE) missing.push('PALETTE');
  if (!FONTS) missing.push('FONTS');
  if (!CARDS.length) missing.push('CARDS');

  if (missing.length) {
    console.error(
      `\nog-cards: scripts/og-cards.config.mjs is still the stub.\n` +
        `  Not set: ${missing.join(', ')}.\n\n` +
        `  Social cards need the design to exist first — the real ramp, the two\n` +
        `  faces in public/fonts/, and a wordmark. Run \`npm run tells\` to see\n` +
        `  what is still undecided.\n`,
    );
    process.exit(1);
  }

  const tools = [
    /* Per-platform. "brew install" on Windows is not a hint, it is a dead
       end — and this preflight exists precisely so a missing tool names its
       own fix. */
    ['magick', ['-version'], 'ImageMagick', hint('imagemagick', 'ImageMagick.ImageMagick', 'imagemagick')],
    ['rsvg-convert', ['--version'], 'rsvg-convert', hint('librsvg', 'GNOME.Librsvg', 'librsvg2-bin')],
    ['python3', ['--version'], 'Python 3', hint('python', 'Python.Python.3.12', 'python3')],
  ];
  for (const [bin, args, label, install] of tools) {
    if (!have(bin, args)) {
      console.error(`\nog-cards: ${label} not found (\`${bin}\`).\n  Install: ${install}\n`);
      process.exit(1);
    }
  }

  try {
    execFileSync('python3', ['-c', 'import fontTools, brotli'], { stdio: 'ignore' });
  } catch {
    console.error(
      '\nog-cards: python3 has fontTools or brotli missing.\n' +
        '  Install: python3 -m pip install fonttools brotli\n' +
        '  (both are needed — fontTools decompresses woff2 through brotli)\n',
    );
    process.exit(1);
  }

  for (const [role, path] of Object.entries(FONTS)) {
    if (!existsSync(path)) {
      console.error(
        `\nog-cards: FONTS.${role} points at ${path}, which does not exist.\n` +
          '  The template ships no typefaces on purpose. Add the project\'s own\n' +
          '  to public/fonts/ first — the cards are converted from the same files\n' +
          '  the site serves, so they cannot drift from the page.\n',
      );
      process.exit(1);
    }
  }

  if (WORDMARK && !existsSync(WORDMARK.source)) {
    console.error(
      `\nog-cards: WORDMARK.source is ${WORDMARK.source}, which does not exist.\n` +
        '  Point it at the component holding the logo paths, or set WORDMARK to\n' +
        '  null for cards without one.\n',
    );
    process.exit(1);
  }

  if (!FOOTER) {
    console.warn('og-cards: FOOTER is empty — cards will carry no footer line.');
  }
}

/* ── Fonts ─────────────────────────────────────────────────────────────── */

function woff2ToTtf(src, dest) {
  execFileSync('python3', [
    '-c',
    `from fontTools.ttLib.woff2 import decompress; decompress(${JSON.stringify(src)}, ${JSON.stringify(dest)})`,
  ]);
}

/* ── Contrast ──────────────────────────────────────────────────────────── */

const srgb = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const relLum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);

function ratio(fg, bg) {
  const [hi, lo] = [relLum(fg), relLum(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

/**
 * Worst-case contrast of a text colour over a REGION OF THE BACKGROUND.
 *
 * Measured on the base image, before any type is composited. Measuring the
 * finished card samples the glyphs themselves and reports text-against-text —
 * about 1:1 — which looks like catastrophic failure and means nothing. That
 * mistake was made once here already; it is the same reason automated tools
 * cannot judge text over a photograph.
 *
 * Per-channel maxima, so the brightest thing anywhere in the band decides, not
 * the average. Averages hide exactly the highlight that breaks a word.
 */
function worstContrast(image, fgHex, [x, y, w, h]) {
  const out = execFileSync('magick', [
    image, '-crop', `${w}x${h}+${x}+${y}`, '+repage',
    '-format', '%[fx:maxima.r] %[fx:maxima.g] %[fx:maxima.b]', 'info:',
  ]).toString().trim().split(/\s+/).map(Number);
  return ratio(hexToRgb(fgHex), out);
}

/* ── Drawing ───────────────────────────────────────────────────────────── */

const manifest = JSON.parse(readFileSync('src/data/image-manifest.json', 'utf8'));

/**
 * Render one text run as its own transparent layer.
 *
 * `-annotate` positions against a gravity box and the result shifts with the
 * string's own ascenders and descenders, which is how the first attempt put the
 * footer row through the middle of the title. A `label:` composited at an
 * explicit x,y is deterministic: the same coordinates put the same pixel in the
 * same place regardless of what the text says.
 */
function textLayer(tmp, name, { text, font, size, fill, spacing }) {
  const file = join(tmp, `${name}.png`);
  const body = spacing ? text.toUpperCase().split('').join(spacing) : text;
  execFileSync('magick', [
    '-background', 'none',
    '-fill', fill,
    '-font', font,
    '-pointsize', String(size),
    `label:${body}`,
    file,
  ]);
  const [w, h] = execFileSync('magick', ['identify', '-format', '%w %h', file])
    .toString().split(' ').map(Number);
  return { file, w, h };
}

function buildCard(card, fonts, mark) {
  /*
   * `card.slug` overrides the route-derived name. Only the fallback uses it —
   * it is the card for any page without one of its own, so it has no route to
   * derive from.
   */
  const slug =
    card.slug ?? (card.route === '/' ? 'home' : card.route.replace(/^\/|\/$/g, '').replace(/\//g, '-'));
  const out = join(OUT, `og-${slug}.jpg`);
  const base = join(TMP, `${slug}-base.png`);

  /* 1. Background. */
  if (card.photo) {
    const entry = manifest[card.photo];
    if (!entry) throw new Error(`${card.route ?? slug}: no manifest entry for "${card.photo}"`);
    const file = join('public', entry.src);
    if (!existsSync(file)) throw new Error(`${card.route ?? slug}: missing file ${file}`);

    const photo = join(TMP, `${slug}-p.png`);
    const veil = join(TMP, `${slug}-v.png`);

    execFileSync('magick', [
      file, '-resize', `${W}x${H}^`, '-gravity', 'center', '-extent', `${W}x${H}`, photo,
    ]);

    /*
     * A veil that is heavy on the left and light on the right.
     *
     * Every word sits in the left two-thirds, so that is where it has to
     * guarantee contrast whatever the photograph does; the right stays open so
     * the picture still reads as a picture. A flat veil dark enough for the
     * worst photo makes every card look like a dark rectangle — which is
     * exactly what the first attempt produced.
     */
    execFileSync('magick', [
      '-size', `${W}x${H}`, `xc:${PALETTE.veil}`,
      '(', '-size', `${W}x${H}`, '-define', 'gradient:direction=east', 'gradient:gray90-gray30', ')',
      '-alpha', 'off', '-compose', 'copy_opacity', '-composite', veil,
    ]);

    /*
     * A second veil running bottom-up, for the footer row.
     *
     * The horizontal gradient deliberately lets the photograph through on the
     * right, and on a bright frame the footer line washed out completely. This
     * band gives the whole row a floor without darkening the picture above it.
     *
     * It is a 170px band, NOT a gradient across the whole card. A full-height
     * gradient is only about 14% opaque by the time it reaches the footer
     * baseline, which measured 2.7:1 on the brightest frames. The fix is not a
     * darker gradient — that greys out the photograph — it is a shorter one, so
     * the ink is where the small text is and nowhere else.
     */
    const FOOT_H = 170;
    const foot = join(TMP, `${slug}-f.png`);
    execFileSync('magick', [
      '-size', `${W}x${FOOT_H}`, `xc:${PALETTE.veil}`,
      '(', '-size', `${W}x${FOOT_H}`, '-define', 'gradient:direction=south', 'gradient:gray0-gray80', ')',
      '-alpha', 'off', '-compose', 'copy_opacity', '-composite', foot,
    ]);

    /*
     * Three separate calls, not one chained command. Chaining two composites in
     * a single invocation silently dropped the first veil — titles measured
     * 7.1:1 before and 2.5:1 after, with no error and a plausible-looking
     * image. Each step is verifiable on its own.
     */
    const step1 = join(TMP, `${slug}-s1.png`);
    execFileSync('magick', [photo, veil, '-compose', 'over', '-composite', step1]);
    execFileSync('magick', [
      step1, foot,
      '-gravity', 'southwest', '-geometry', '+0+0',
      '-compose', 'over', '-composite', base,
    ]);
  } else {
    execFileSync('magick', ['-size', `${W}x${H}`, `xc:${PALETTE.ink}`, base]);
  }

  /*
   * 2. Type, on one coordinate system measured from the top-left.
   *
   * The title is anchored to the FOOTER and grows upward, so a one-line and a
   * three-line card share a baseline instead of drifting apart.
   */
  const FOOTER_Y = H - MARGIN - 24;
  const lines = card.title.split('\n');
  const size = TYPE.title[Math.min(lines.length, 3)] ?? TYPE.title[3];
  const lead = Math.round(size * 1.14);

  const layers = [];

  /*
   * The wordmark sits at MARGIN/SAFE_TOP — inside the safe box on both axes, so
   * no platform crop can clip it. Its height follows its width through the
   * artwork's own aspect rather than being set independently.
   */
  if (mark) layers.push({ ...mark, x: MARGIN, y: SAFE_TOP });

  const titleTop = FOOTER_Y - 58 - lines.length * lead;
  lines.forEach((line, i) => {
    const l = textLayer(TMP, `${slug}-t${i}`, {
      text: line, font: fonts.title, size, fill: PALETTE.fg,
    });
    layers.push({ ...l, fg: PALETTE.fg, label: `title line ${i + 1}`, x: MARGIN, y: titleTop + i * lead });
  });

  /*
   * The lighter colour only on the PLAIN card.
   *
   * An accent is a mid tone, so its ceiling against a solid dark ground is
   * around 7:1 and it has nothing left to give once a photograph is underneath.
   * Over a photo, everything takes the foreground colour.
   */
  const overPhoto = Boolean(card.photo);
  const accentFill = overPhoto ? PALETTE.fg : PALETTE.accent;

  if (card.eyebrow) {
    const e = textLayer(TMP, `${slug}-e`, {
      text: card.eyebrow, font: fonts.eyebrow, size: TYPE.eyebrow, fill: accentFill,
    });
    layers.push({ ...e, fg: accentFill, label: 'eyebrow', x: MARGIN, y: titleTop - e.h - 6 });
  }

  /*
   * One left-aligned footer line, not a left/right pair.
   *
   * The right-hand end of the card is where the veil is deliberately lightest,
   * so the photograph still reads — which is exactly the wrong place for 23px
   * text. Right-aligned it measured 1.7:1 to 3.2:1 across a set of cards and no
   * amount of gradient fixed it without greying out every photograph. Left
   * puts every word in the strongest third of the card.
   */
  if (FOOTER) {
    const foot = textLayer(TMP, `${slug}-f1`, {
      text: FOOTER, font: fonts.title, size: TYPE.footer, fill: accentFill, spacing: ' ',
    });
    layers.push({ ...foot, fg: accentFill, label: 'footer', x: MARGIN, y: FOOTER_Y });
  }

  /*
   * Measure BEFORE compositing type, over each layer's OWN box.
   *
   * An earlier pass measured fixed bands 860px wide. The glyphs are nowhere
   * near that wide, so the check was sampling bright photograph the text never
   * touches and reporting 2.5:1 on cards that are actually fine. Measuring the
   * rendered box — the exact pixels the type will cover, plus a few px of bleed
   * — is the only number that means anything.
   */
  const PAD = 6;
  const measured = layers
    .filter((l) => l.fg)
    .map((l) => [
      l.label,
      worstContrast(base, l.fg, [
        Math.max(0, l.x - PAD),
        Math.max(0, l.y - PAD),
        Math.min(W - Math.max(0, l.x - PAD), l.w + PAD * 2),
        Math.min(H - Math.max(0, l.y - PAD), l.h + PAD * 2),
      ]),
    ]);

  const args = [base];
  for (const l of layers) {
    args.push('(', l.file, '-resize', `${l.w}x${l.h}`, ')',
      '-gravity', 'northwest', '-geometry', `+${l.x}+${l.y}`, '-compose', 'over', '-composite');
  }
  args.push('-quality', '86', out);
  execFileSync('magick', args);

  return { slug, out, measured };
}

/**
 * Rasterise the wordmark at 3x for a clean downscale.
 *
 * Read from the component that already draws it rather than committed as a
 * second copy of the artwork — the same reason the fonts are converted from
 * public/fonts at run time. The card cannot drift from what the header renders.
 *
 * The aspect comes from the artwork's OWN viewBox, so replacing the logo with
 * one of a different shape needs no edit here.
 */
function renderWordmark() {
  if (!WORDMARK) return null;

  const svg = readFileSync(WORDMARK.source, 'utf8');
  const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1];
  const paths = [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);

  if (!viewBox || !paths.length) {
    console.error(
      `\nog-cards: no <svg viewBox> with <path d="…"> found in ${WORDMARK.source}.\n` +
        '  WORDMARK.source must point at a file containing the logo as SVG paths.\n',
    );
    process.exit(1);
  }

  const [, , vbW, vbH] = viewBox.split(/[\s,]+/).map(Number);
  const w = WORDMARK.width;
  const h = Math.round(w / (vbW / vbH));

  /*
   * fill-rule="evenodd" is not decoration. A traced logo expresses holes — the
   * gaps inside a letter, the rings of a spiral — as inner contours, and the
   * default nonzero rule fills them in solid. The artwork then looks nothing
   * like the file it came from.
   */
  writeFileSync(
    join(TMP, 'mark.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="${PALETTE.fg}" fill-rule="evenodd">` +
      paths.map((d) => `<path d="${d}"/>`).join('') +
      `</svg>`,
  );
  execFileSync('rsvg-convert', ['-w', String(w * 3), join(TMP, 'mark.svg'), '-o', join(TMP, 'mark.png')]);

  return { file: join(TMP, 'mark.png'), w, h };
}

/* ── Run ───────────────────────────────────────────────────────────────── */

function main() {
  preflight();

  mkdirSync(TMP, { recursive: true });
  mkdirSync(OUT, { recursive: true });

  const fonts = { title: join(TMP, 'title.ttf'), eyebrow: join(TMP, 'eyebrow.ttf') };
  woff2ToTtf(FONTS.title, fonts.title);
  woff2ToTtf(FONTS.eyebrow ?? FONTS.title, fonts.eyebrow);

  const mark = renderWordmark();

  const made = [];
  const failures = [];
  for (const card of CARDS) {
    const r = buildCard(card, fonts, mark);
    made.push(r);
    const worst = Math.min(...r.measured.map(([, v]) => v));
    const bad = r.measured.filter(([, v]) => v < 4.5);
    if (bad.length) failures.push([r.slug, bad]);
    console.log(
      `  ${r.slug.padEnd(30)} worst ${worst.toFixed(2)}:1  ` +
        r.measured.map(([n, v]) => `${n.split(' ')[0]} ${v.toFixed(1)}`).join('  '),
    );
  }

  if (failures.length) {
    console.error('\n  Text below 4.5:1 on its own background:');
    for (const [slug, bad] of failures) {
      console.error(`    ${slug}: ` + bad.map(([n, v]) => `${n} ${v.toFixed(2)}:1`).join(', '));
    }
    console.error('  Darken the veil for those photographs, or choose a darker frame.\n');
    process.exitCode = 1;
  }

  /* Register every card in the manifest so Seo.astro can resolve it. */
  const m = JSON.parse(readFileSync('src/data/image-manifest.json', 'utf8'));
  for (const { slug } of made) {
    /*
     * Same shape as every other manifest entry, including `srcset` and
     * `widths`, even though a social card is only ever served at one size. A
     * heterogeneous manifest breaks the type Img.astro asserts over it —
     * `astro check` fails on the cast, not on any line that uses these.
     *
     * They are not referenced by <Img>: og:image is emitted by Seo.astro as a
     * plain URL, because no social scraper reads srcset.
     */
    const src = `/img/social/og-${slug}.jpg`;
    m[`social/og-${slug}`] = {
      src,
      width: W,
      height: H,
      aspect: Number((W / H).toFixed(4)),
      srcset: `${src} ${W}w`,
      widths: [W],
    };
  }
  writeFileSync('src/data/image-manifest.json', JSON.stringify(m, null, 2) + '\n');

  rmSync(TMP, { recursive: true, force: true });
  console.log(`${made.length} cards written to ${OUT} and registered in the manifest.`);
}

main();
