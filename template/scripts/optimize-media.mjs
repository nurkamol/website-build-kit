#!/usr/bin/env node
/**
 * media/source/  →  public/img/
 *
 *   photos/, blog/    → WebP at responsive widths
 *   certifications/   → WebP, single width (already small logos)
 *   brand/            → copied byte-for-byte (SVG logos, favicons)
 *
 * Every output is recorded in src/data/image-manifest.json with its intrinsic
 * dimensions, so <img> can always carry width/height and the page never shifts.
 *
 * Run with `npm run media`. Idempotent — skips work when the output is newer
 * than its source.
 */

import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'media/source');
const OUT = path.join(ROOT, 'public/img');
const MANIFEST = path.join(ROOT, 'src/data/image-manifest.json');

/** Widths emitted for photographic content. */
const PHOTO_WIDTHS = [480, 768, 1200, 1800];
const BLOG_WIDTHS = [480, 768, 1200];
const WEBP = { quality: 78, effort: 6 };

/*
 * ── AVIF, emitted ALONGSIDE WebP and never instead of it ───────────────────
 *
 * Measured on this pipeline, a 4096x2160 photograph at the widths below, with
 * AVIF quality chosen by RMSE parity against `webp q78` rather than by feel:
 *
 *     1800px   webp q78  154 KB          avif q55  115 KB   −26%, better quality
 *      1200px  webp q78   82 KB          avif q55   61 KB   −26%, better quality
 *
 * q55 rather than q50 on purpose. q50 is −38%, but it is marginally WORSE than
 * the WebP it replaces, and photography is the largest single determinant of
 * whether a site reads as expensive. q55 is smaller *and* better — no trade.
 * Drop to 50 if bytes matter more than the last of the quality on a given job.
 *
 * ⚠ effort 4 is deliberate; do not crank it. Measured at 1800px q55:
 *     effort 3   115.8 KB   269 ms
 *     effort 4   114.8 KB   750 ms
 *     effort 6   112.2 KB  2292 ms
 *     effort 9   114.4 KB  8155 ms   ← 30x the time, and BIGGER than effort 6
 * Encoding is incremental (see `newerThan`), so this is a one-time cost per
 * image either way, which is exactly why it is not worth 30x.
 *
 * Set FORMATS to ['webp'] to turn AVIF off for a project — nothing else needs
 * to change, and Img.astro drops the <source> on its own.
 */
const AVIF = { quality: 55, effort: 4 };
const FORMATS = ['avif', 'webp'];

const RASTER = /\.(jpe?g|png|webp|tiff?)$/i;

/*
 * ── DO NOT RESET THIS TO {} ────────────────────────────────────────────────
 * This script rebuilds the manifest by walking media/source/. Any OTHER
 * generator that writes manifest keys — scripts/og-cards.mjs writes
 * `social/og-*` — has no file in media/source/, so a fresh object silently
 * deletes everything it owns.
 *
 * That happened on a live site: running `npm run media` for an unrelated image
 * removed every social-card entry, every page fell back to the default card,
 * the build stayed green, and it was found days later by pointing a
 * share-preview tool at one URL by hand.
 *
 * Carrying those keys over means the two scripts can run in either order.
 *
 * The general rule: a generator that rewrites a shared manifest must preserve
 * the keys it does not own.
 */
const previous = await fs
  .readFile(MANIFEST, 'utf8')
  .then((raw) => JSON.parse(raw))
  .catch(() => ({}));

const manifest = Object.fromEntries(
  Object.entries(previous).filter(([k]) => k.startsWith('social/og-')),
);

async function walk(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

async function newerThan(target, source) {
  try {
    const [t, s] = await Promise.all([fs.stat(target), fs.stat(source)]);
    return t.mtimeMs >= s.mtimeMs;
  } catch {
    return false;
  }
}

/** Brand assets are copied, never re-encoded — logos are tiny and lossless matters. */
async function copyBrand(files) {
  for (const file of files) {
    const rel = path.relative(SRC, file);
    const dest = path.join(OUT, rel);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    if (await newerThan(dest, file)) continue;
    await fs.copyFile(file, dest);
    console.log(`  copy   ${rel}`);
  }
}

async function emitResponsive(file, widths) {
  const rel = path.relative(SRC, file);
  const dir = path.dirname(rel);
  const name = path.basename(rel, path.extname(rel));
  const image = sharp(file, { failOn: 'none' }).rotate();
  const meta = await image.metadata();
  const key = `${dir}/${name}`;

  const sources = [];
  for (const w of widths) {
    // Never upscale — a 900px source has no business claiming a 1800px variant.
    if (meta.width && w > meta.width && sources.length) continue;
    const target = Math.min(w, meta.width ?? w);
    const variant = {};
    for (const fmt of FORMATS) {
      const dest = path.join(OUT, dir, `${name}-${w}.${fmt}`);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      if (!(await newerThan(dest, file))) {
        const resized = image.clone().resize({ width: target, withoutEnlargement: true });
        await (fmt === 'avif' ? resized.avif(AVIF) : resized.webp(WEBP)).toFile(dest);
      }
      variant[fmt] = `/img/${dir}/${name}-${w}.${fmt}`;
    }
    /* Dimensions come from the WebP, which is always emitted — it is the
       fallback every browser can read, and the one <img> points at. */
    const info = await sharp(path.join(OUT, dir, `${name}-${w}.webp`)).metadata();
    sources.push({ width: info.width, height: info.height, src: variant.webp, avif: variant.avif });
  }

  const largest = sources[sources.length - 1];
  manifest[key] = {
    src: largest.src,
    width: largest.width,
    height: largest.height,
    aspect: +(largest.width / largest.height).toFixed(4),
    srcset: sources.map((s) => `${s.src} ${s.width}w`).join(', '),
    /* Null when AVIF is off for this project, and Img.astro then emits a plain
       <img> exactly as before. Never the only srcset — WebP stays the floor. */
    avifSrcset: sources.every((s) => s.avif)
      ? sources.map((s) => `${s.avif} ${s.width}w`).join(', ')
      : null,
    widths: sources.map((s) => s.width),
  };
  console.log(`  webp   ${key}  ${sources.map((s) => s.width).join('/')}`);
}

async function emitSingle(file) {
  const rel = path.relative(SRC, file);
  const dir = path.dirname(rel);
  const name = path.basename(rel, path.extname(rel));
  const key = `${dir}/${name}`;
  const dest = path.join(OUT, dir, `${name}.webp`);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  if (!(await newerThan(dest, file))) {
    await sharp(file, { failOn: 'none' }).webp({ ...WEBP, quality: 88 }).toFile(dest);
  }
  const info = await sharp(dest).metadata();
  manifest[key] = {
    src: `/img/${dir}/${name}.webp`,
    width: info.width,
    height: info.height,
    aspect: +(info.width / info.height).toFixed(4),
    srcset: `/img/${dir}/${name}.webp ${info.width}w`,
    widths: [info.width],
  };
  console.log(`  webp   ${key}  ${info.width}`);
}

/**
 * Social cards stay JPEG on purpose. Facebook, LinkedIn and X still do not
 * reliably render WebP og:image, and a card that fails to unfurl is worse than
 * a slightly larger file nobody downloads on the site itself.
 *
 * The card is branded artwork with centred type, so it is passed through at its
 * native 1200x675 rather than cropped to 1200x630. Cropping — especially with
 * `position: 'attention'`, which picks the highest-entropy region — shifts off
 * centre and clips the logo. Every major scraper accepts 16:9 happily.
 */
async function emitSocialCard() {
  const source = path.join(SRC, 'brand/og-default.jpg');
  if (!(await fs.access(source).then(() => true).catch(() => false))) {
    console.log('  skip   social card — add media/source/brand/og-default.jpg (1200x630 or 16:9)');
    return;
  }
  const dest = path.join(OUT, 'social/og-default.jpg');
  await fs.mkdir(path.dirname(dest), { recursive: true });
  // Skip the *encode* when the output is current — but never skip the manifest
  // entry, or a warm rebuild ships a page with no og:image at all.
  if (!(await newerThan(dest, source))) {
    await sharp(source)
      .resize({ width: 1200, withoutEnlargement: true })
      .jpeg({ quality: 88, mozjpeg: true })
      .toFile(dest);
  }
  const info = await sharp(dest).metadata();
  manifest['social/og-default'] = {
    src: '/img/social/og-default.jpg',
    width: info.width,
    height: info.height,
    aspect: +(info.width / info.height).toFixed(4),
    srcset: `/img/social/og-default.jpg ${info.width}w`,
    widths: [info.width],
  };
  console.log(`  jpeg   social/og-default (${info.width}x${info.height}, JPEG for scraper compatibility)`);
}

/**
 * JPEG twins for og:image — and only for images actually used as one.
 *
 * Every image the *site* serves is WebP. But Facebook and LinkedIn still fail
 * to render a WebP og:image, so a shared post would unfurl with no picture at
 * all. These files are never fetched by a browser rendering a page; only by a
 * scraper following a meta tag.
 *
 * Because nothing on-page loads them, they are cropped to the 1.91:1 card
 * ratio at modest quality — a preview thumbnail, not a full-size asset.
 */
async function emitSocialTwins() {
  // Read which images posts actually declare, rather than twinning everything
  // in media/source/blog — inline body images never become an og:image.
  /*
   * `.catch(() => [])` because a site with no blog has no src/content/blog, and
   * an unguarded readdir threw ENOENT here — AFTER every variant had been
   * written to public/img/ and BEFORE the manifest was saved. The images were
   * on disk, so it looked like the run had worked, and the next build failed
   * with "no manifest entry" for an image that visibly existed.
   *
   * Found by adding the first photograph to a fresh template, which is the one
   * moment this path had never been exercised.
   */
  const postsDir = path.join(ROOT, 'src/content/blog');
  const used = new Set();
  for (const entry of await fs.readdir(postsDir).catch(() => [])) {
    if (!entry.endsWith('.md')) continue;
    const body = await fs.readFile(path.join(postsDir, entry), 'utf8');
    const declared = /^image:\s*"([^"]+)"/m.exec(body)?.[1];
    const name = declared && /\/img\/[^/]+\/(.+?)(?:-\d+)?\.webp$/.exec(declared)?.[1];
    if (name) used.add(name);
  }

  const sources = (await walk(path.join(SRC, 'blog')).catch(() => [])).filter((file) =>
    used.has(path.basename(file, path.extname(file))),
  );

  for (const file of sources) {
    const name = path.basename(file, path.extname(file));
    const dest = path.join(OUT, 'social', `${name}.jpg`);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    if (!(await newerThan(dest, file))) {
      await sharp(file, { failOn: 'none' })
        .rotate()
        .resize(1200, 630, { fit: 'cover', position: 'centre', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 76, mozjpeg: true })
        .toFile(dest);
    }
    const info = await sharp(dest).metadata();
    manifest[`social/${name}`] = {
      src: `/img/social/${name}.jpg`,
      width: info.width,
      height: info.height,
      aspect: +(info.width / info.height).toFixed(4),
      srcset: `/img/social/${name}.jpg ${info.width}w`,
      widths: [info.width],
    };
  }
  console.log(`  jpeg   ${sources.length} social twins (og:image only — never loaded on-page)`);
}

/**
 * Favicons, from the single 512px brand mark.
 *
 * The .ico is a real ICO container rather than a PNG with the extension
 * changed. Browsers sniff content and would have accepted the fake, but
 * crawlers and older clients that request /favicon.ico unconditionally do not
 * all sniff — and writing the header is 15 lines, not a dependency.
 */
async function emitFavicons() {
  // A fresh project has no brand assets yet. Skip rather than fail the build.
  const haveSvg = await fs.access(path.join(SRC, 'brand/favicon.svg')).then(() => true).catch(() => false);
  const havePng = await fs.access(path.join(SRC, 'brand/favicon.png')).then(() => true).catch(() => false);
  if (!haveSvg && !havePng) {
    console.log('  skip   favicons — add media/source/brand/favicon.svg (or .png)');
    return;
  }
  // Prefer the vector. Rendering each size from the SVG at its native
  // resolution is sharper than downscaling one 512px raster — the difference
  // is very visible at 16px, which is the size that actually appears in a tab.
  const svg = path.join(SRC, 'brand/favicon.svg');
  const png512 = path.join(SRC, 'brand/favicon.png');
  const source = (await fs.access(svg).then(() => true).catch(() => false)) ? svg : png512;

  const png = (size) =>
    sharp(source, { density: Math.max(72, Math.ceil((size / 512) * 72 * 8)) })
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

  const targets = [
    ['apple-touch-icon.png', 180],
    ['icon-192.png', 192],
    ['icon-512.png', 512],
  ];
  for (const [name, size] of targets) {
    await fs.writeFile(path.join(ROOT, 'public', name), await png(size));
  }

  // ICO directory with PNG-compressed entries (supported since Vista / OS X).
  const sizes = [16, 32, 48];
  const images = await Promise.all(sizes.map(png));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(sizes.length, 4);

  let offset = 6 + sizes.length * 16;
  const entries = sizes.map((size, i) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0);
    entry.writeUInt8(size === 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(images[i].length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += images[i].length;
    return entry;
  });

  await fs.writeFile(path.join(ROOT, 'public/favicon.ico'), Buffer.concat([header, ...entries, ...images]));
  console.log(`  icon   favicon.ico (${sizes.join('/')}) + apple-touch-icon + 192/512 from ${path.basename(source)}`);
}

const bytes = async (dir) => {
  let total = 0;
  for (const f of await walk(dir).catch(() => [])) total += (await fs.stat(f)).size;
  return total;
};
const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;

const files = await walk(SRC).catch(() => []);
const before = await bytes(SRC);

console.log('optimizing media…');
await copyBrand(files.filter((f) => f.includes(`${path.sep}brand${path.sep}`)));

for (const file of files.filter((f) => RASTER.test(f))) {
  if (file.includes(`${path.sep}brand${path.sep}`)) continue;
  if (file.includes(`${path.sep}certifications${path.sep}`)) await emitSingle(file);
  else if (file.includes(`${path.sep}blog${path.sep}`)) await emitResponsive(file, BLOG_WIDTHS);
  else await emitResponsive(file, PHOTO_WIDTHS);
}

await emitFavicons();
await emitSocialCard();
await emitSocialTwins();

await fs.writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');

const after = await bytes(OUT);
console.log(`\nsource ${mb(before)}  →  dist ${mb(after)}  (${Math.round((1 - after / before) * 100)}% smaller)`);
console.log(`${Object.keys(manifest).length} images in manifest`);
