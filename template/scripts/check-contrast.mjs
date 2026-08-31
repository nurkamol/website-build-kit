/**
 * Contrast of text sitting on a photograph, measured off the real pixels.
 *
 *   npm run check:contrast
 *
 * Runs in `build:production`. A failure is a red build, so the last good deploy
 * stays live — which is the correct outcome for a photograph that has made the
 * navigation unreadable.
 *
 * ── THE GAP THIS FILLS ─────────────────────────────────────────────────────
 * ⚠ NO ACCESSIBILITY RUNNER CAN SEE THIS. axe and pa11y report a flat ~1.01:1
 *   for every text-over-image case, because neither composites a transparent
 *   element over the pixels behind it. So the failure is invisible to `a11y`,
 *   invisible to the build, and invisible to the client who swapped the photo.
 *
 * That gap is what forces a bad choice: either let a client change a header
 * photograph and risk breaking the nav, or refuse to let them choose at all.
 * It is a false choice. Let them choose, and measure what they chose.
 *
 * ── WHAT MEASURING IT ACTUALLY TAUGHT ──────────────────────────────────────
 * Fed a deliberately hostile frame, on a real site with three such regions:
 *
 *   band header, 82% ink scrim    near-white photo →  9.66:1   cannot fail
 *   tile label,  72% ink scrim    near-white photo →  6.76:1   cannot fail
 *   script text, 62% cream scrim  near-black photo →  2.86:1   ✗ rejected
 *
 * ⚠ TWO OF THE THREE COULD NOT FAIL. Those scrims were strong enough that no
 *   photograph gets through them — which is what "guarantee the ground instead
 *   of hoping for it" is for. The pattern had already solved the problem and
 *   everyone was still behaving as though it had not.
 *
 *   The one real exposure was a scrim that had been LIGHTENED, from 92% to 62%,
 *   so a client's new photography could show its colour. **The danger is never
 *   the photograph. It is a weakened scrim** — and this check is what makes
 *   weakening one safe to do.
 *
 * ── WHY THE REGIONS ARE DECLARED AND NOT DETECTED ──────────────────────────
 * A region is a box, a scrim strength and a text colour. All three belong to a
 * project's design, and ⚠ **this template has no design** — so the kit ships
 * the measurement and the declaration format, never the regions. With none
 * declared this exits 0 and says so, rather than printing a tick it has not
 * earned.
 *
 * Declare them in `src/data/contrast.json`:
 *
 *   {
 *     "regions": [
 *       {
 *         "label": "header band",
 *         "image": "photos/hero-band",
 *         "box":   { "x": 0, "y": 0, "w": 1, "h": 0.4 },
 *         "scrim": { "colour": "#1a0d05", "from": 0.82, "to": 0.82 },
 *         "text":  "#ffffff"
 *       }
 *     ]
 *   }
 *
 * `box` is fractions of the image. `scrim.from`/`to` are alpha at the top and
 * bottom of the box, so a gradient is expressible. `image` is a manifest key.
 */

import { existsSync, readFileSync } from 'node:fs';
import sharp from 'sharp';

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';

const DECL = 'src/data/contrast.json';
const MANIFEST = 'src/data/image-manifest.json';
const AA = 4.5;

if (!existsSync(DECL)) {
  console.log(`${DIM}·${RESET} no ${DECL} — no text-over-photograph regions declared`);
  process.exit(0);
}

const fail = (msg) => {
  console.error(`\n${RED}✗ ${msg}${RESET}\n`);
  process.exit(1);
};

let regions;
try {
  regions = JSON.parse(readFileSync(DECL, 'utf8')).regions;
} catch (err) {
  fail(`${DECL} is not valid JSON — ${err.message}`);
}
if (!Array.isArray(regions) || !regions.length) {
  fail(`${DECL} declares no regions. Delete the file, or describe what to measure.`);
}

const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};

const hex = (value) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(value ?? ''));
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/* sRGB relative luminance, per WCAG. */
const lum = ([r, g, b]) => {
  const c = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};

const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/** Source-over: the scrim colour at `alpha` laid on the pixel beneath. */
const over = (pixel, scrim, alpha) => pixel.map((p, i) => scrim[i] * alpha + p * (1 - alpha));

const problems = [];
const measured = [];

for (const region of regions) {
  const label = region?.label ?? '(unlabelled)';
  const text = hex(region?.text);
  const scrimColour = hex(region?.scrim?.colour);
  if (!text) fail(`region "${label}": \`text\` must be a #rrggbb colour`);
  if (!scrimColour) fail(`region "${label}": \`scrim.colour\` must be a #rrggbb colour`);

  const from = Number(region?.scrim?.from ?? 0);
  const to = Number(region?.scrim?.to ?? from);
  const min = Number(region?.min ?? AA);

  /*
   * ⚠ A MANIFEST KEY, NOT A PICKER PATH — and deliberately not normalised here.
   *   `toImageKey` lives in `src/lib/image-key.ts`, which a plain .mjs script
   *   cannot import; copying it in would leave two implementations of the same
   *   mapping free to drift, which is the failure this whole round was about.
   *   This file is written by a developer, not by a CMS, so it can simply ask
   *   for the key and say so when it gets a path.
   */
  const key = String(region?.image ?? '');
  const entry = manifest[key];
  if (!entry) {
    fail(
      key.startsWith('/img/')
        ? `region "${label}": \`image\` is "${key}", which is a media-picker path.\n` +
          `  Declare the manifest key instead — the part between /img/ and the -width suffix.`
        : `region "${label}": no manifest entry for "${key}".\n` +
          `  Run \`npm run media\` first — this measures the generated image, not the source.`,
    );
  }

  /* The widest generated variant: the most pixels, so the least sampling luck. */
  const widest = (entry.widths ?? []).length ? Math.max(...entry.widths) : null;
  const file = widest ? `public/img/${key}-${widest}.webp` : null;
  if (!file || !existsSync(file)) {
    fail(`region "${label}": ${file ?? 'no variant'} is missing. Run \`npm run media\`.`);
  }

  const box = region?.box ?? { x: 0, y: 0, w: 1, h: 1 };
  const image = sharp(file);
  const meta = await image.metadata();
  const left = Math.max(0, Math.round((box.x ?? 0) * meta.width));
  const top = Math.max(0, Math.round((box.y ?? 0) * meta.height));
  const width = Math.max(1, Math.min(meta.width - left, Math.round((box.w ?? 1) * meta.width)));
  const height = Math.max(1, Math.min(meta.height - top, Math.round((box.h ?? 1) * meta.height)));

  const { data } = await image
    .extract({ left, top, width, height })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  /*
   * ⚠ PER-CHANNEL EXTREMES, NOT THE AVERAGE. An average hides exactly the
   *   highlight that breaks a word — the brightest pixel under the type is what
   *   a reader's eye lands on. Both extremes are taken because light text fails
   *   against a bright pixel and dark text fails against a dark one, and a
   *   check that only knows one of those is half a check.
   */
  const brightest = [0, 0, 0];
  const darkest = [255, 255, 255];
  for (let i = 0; i < data.length; i += 3) {
    const y = Math.floor(i / 3 / width);
    const alpha = from + (to - from) * (height > 1 ? y / (height - 1) : 0);
    const composited = over([data[i], data[i + 1], data[i + 2]], scrimColour, alpha);
    for (let c = 0; c < 3; c++) {
      if (composited[c] > brightest[c]) brightest[c] = composited[c];
      if (composited[c] < darkest[c]) darkest[c] = composited[c];
    }
  }

  const worst = Math.min(ratio(text, brightest), ratio(text, darkest));
  measured.push({ label, worst, min });
  if (worst < min) problems.push({ label, worst, min, image: region?.image });
}

for (const m of measured) {
  const mark = m.worst < m.min ? `${RED}✗${RESET}` : `${GREEN}✓${RESET}`;
  console.log(`  ${mark} ${m.label}  ${m.worst.toFixed(2)}:1  ${DIM}(needs ${m.min}:1)${RESET}`);
}

if (!problems.length) {
  console.log(`${GREEN}✓${RESET} ${measured.length} text-over-photograph region(s) legible`);
  process.exit(0);
}

console.error(`\n${RED}✗ ${problems.length} region(s) below the contrast floor${RESET}\n`);
for (const p of problems) {
  console.error(`    ${p.label}  ${p.worst.toFixed(2)}:1  needs ${p.min}:1  ${DIM}${p.image}${RESET}`);
}
console.error(
  `\n  ${DIM}The photograph is rarely the problem. Check whether this region's scrim has\n` +
    `  been lightened — that is what turns a guarantee into a hope. Strengthen the\n` +
    `  scrim, or choose a photograph without a bright area under the type.${RESET}\n`,
);
process.exit(1);
