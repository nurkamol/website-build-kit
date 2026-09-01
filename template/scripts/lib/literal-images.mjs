/**
 * Images a page renders from a hardcoded string, which no editor can change.
 *
 * ── THE FAILURE THIS FINDS ─────────────────────────────────────────────────
 * After wiring five image fields into a CMS, someone wrote in the config that
 * "photographs are chosen in code, not here". That sentence was true of the
 * five fields that existed and quietly excused the eight that did not — a
 * header band, four class tiles, a gift-card picture and three more, all
 * `name="photos/x"` literals sitting in `.astro` files.
 *
 * ⚠ THE CLIENT OPENED THE PAGE, SAW A PHOTOGRAPH, AND HAD NO WAY TO CHANGE IT.
 *   Nothing was broken. The build was green, the page was correct, and the
 *   only symptom was a person looking for a field that was never there.
 *
 * The rule it enforces: an image a page renders is **a field, or a deliberate
 * exception somebody wrote down** — never an oversight dressed as a principle.
 *
 * ── WHY A LIB AND NOT A SCRIPT ─────────────────────────────────────────────
 * Two callers need it and they run in different worlds: `check-cms.mjs` in a
 * project that has a CMS, and `check-drift.mjs` in a delivered site that may
 * have neither. A second copy is two implementations free to disagree, which
 * is the failure the whole media round was about.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/*
 * ⚠ ONLY THE ATTRIBUTES THAT NAME AN IMAGE, AND ONLY QUOTED VALUES.
 *
 *   An earlier attempt in the source project matched every `name="…"` and
 *   returned form fields, icon names and `<meta name="viewport">` — fifteen
 *   hits where the truth was zero. A check that cries wolf on a form field
 *   gets switched off before it ever finds a photograph.
 *
 *   `name=` is therefore accepted only on an element whose tag looks like an
 *   image component, while `image=` and `poster=` are unambiguous anywhere.
 *   An expression — name={photo} — has no quotes and never matches, which is
 *   exactly right: that value came from somewhere else, which is the point.
 */
const IMAGE_COMPONENT = /<(Img|Image|Picture|BandHeader|Hero)\b[^>]*?\bname=["']([^"']+)["']/gis;
const IMAGE_ATTR = /\b(?:image|poster|photo|bgImage|backgroundImage)=["']([^"']+)["']/gis;

/*
 * ⚠ AN EXPRESSION IS NOT AUTOMATICALLY SAFE, AND ASSUMING SO MISSES THE
 *   IDIOMATIC ASTRO CASE ENTIRELY.
 *
 *   The rule above — that `name={photo}` has no quotes and so "came from
 *   somewhere else" — holds when the value comes from content. It does NOT
 *   hold when "somewhere else" is a static import at the top of the same
 *   file:
 *
 *     import heroBg from '@/assets/hero/forum-hero-silk-road.jpg';
 *     <Image src={heroBg} />
 *
 *   That is the standard way to use Astro's image pipeline, the build
 *   optimises it properly, and the client still cannot change the photograph.
 *   Measured on a delivered site: EIGHT such imports across its pages while
 *   this check reported zero.
 *
 *   Only counted when the identifier is used somewhere other than its own
 *   import line — an unused import renders nothing and is a lint's problem.
 */
const IMAGE_IMPORT =
  /^[ \t]*import\s+([A-Za-z_$][\w$]*)\s+from\s+["']([^"']+\.(?:jpe?g|png|webp|avif|gif))["']/gim;

/** Values that are never a photograph a client would want to change. */
const NOT_A_PHOTO = /^(#|https?:|data:|\/|\.\.?\/)|\.(svg|ico)$/i;

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

/**
 * Every hardcoded image reference under `root`.
 *
 * Returns `[{ file, value }]`, deduplicated per file+value, with paths in
 * forward slashes so a Windows run reports what a Linux one does.
 */
export function literalImages(root = 'src/pages') {
  const out = [];
  const seen = new Set();

  let files;
  try {
    files = walk(root).filter((f) => /\.(astro|mdx)$/.test(f));
  } catch {
    return out; // no pages directory is not this check's problem
  }

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const rel = relative(process.cwd(), file).split(sep).join('/');

    /* Astro comments are `{/* … *\/}` and HTML comments render; neither should
       contribute a finding, so strip both before matching. */
    const body = source.replace(/<!--[\s\S]*?-->/g, ' ');

    IMAGE_IMPORT.lastIndex = 0;
    for (const match of source.matchAll(IMAGE_IMPORT)) {
      const [line, identifier, specifier] = match;
      /* Used anywhere but its own import statement? */
      const elsewhere = source.replace(line, ' ');
      if (!new RegExp(`\\b${identifier}\\b`).test(elsewhere)) continue;
      const key = `${rel}::${specifier}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ file: rel, value: specifier });
    }

    for (const [regex, group] of [
      [IMAGE_COMPONENT, 2],
      [IMAGE_ATTR, 1],
    ]) {
      regex.lastIndex = 0;
      for (const match of body.matchAll(regex)) {
        const value = match[group];
        if (!value || NOT_A_PHOTO.test(value)) continue;
        const key = `${rel}::${value}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ file: rel, value });
      }
    }
  }

  return out.sort((a, b) => a.file.localeCompare(b.file) || a.value.localeCompare(b.value));
}
