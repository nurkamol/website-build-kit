/**
 * Turn a public image PATH back into the manifest KEY it came from.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * `<Img>` resolves a manifest key — `photos/hero`. A CMS image picker cannot
 * return one: it browses files and returns the public path of what it found,
 * `/img/photos/hero-1200.webp`, because it has no idea a manifest exists.
 *
 * Without this, every image field in a CMS-managed site has to be a plain
 * string with a description asking a non-technical editor to type a key from
 * memory. That is not an editable field, it is a quiz — and it is why image
 * editing was the part of the CMS that clients could never actually use.
 *
 * The two can meet because `optimize-media.mjs` writes exactly one shape:
 *
 *     /img/  +  <key>  -<width>.<ext>
 *
 * so the mapping back is exact rather than a guess.
 *
 * ── THREE PROPERTIES THAT MAKE IT SAFE ─────────────────────────────────────
 * 1. **Which variant the editor clicks does not matter.** `-480` and `-1800`
 *    normalise to the same key and render the identical full srcset.
 * 2. **A key ending in a digit survives.** The width strip is anchored to the
 *    extension, so `photos/gift-card-slider-1`, reached via `…-1-480.webp`,
 *    comes back whole. An unanchored `-\d+` would eat the `-1`.
 * 3. ⚠ **It must not assume `.webp`.** The kit emits AVIF alongside WebP and
 *    social cards are `.jpg`, so the extension strip stays generic.
 */

/**
 * `/img/photos/hero-1200.webp` → `photos/hero`. Anything else is returned as-is.
 *
 * ⚠ A SOURCE NAME ENDING IN `-<number>` IS NOT A WIDTH. A CMS whose media input is
 *   `media/source/` returns the SOURCE path — `/img/photos/social-01.jpg` — and the width strip
 *   turned that into `photos/social`: a different photo, or a build failure, depending on what
 *   else was uploaded. Pass the manifest as `known` and an exact key wins before anything is
 *   stripped. (Found on a real Pages CMS build, where every numbered photo resolved wrong.)
 */
export const toImageKey = (nameOrPath: string, known?: Record<string, unknown>): string => {
  if (!isPickerPath(nameOrPath)) return nameOrPath;
  const path = nameOrPath.replace(/^\/img\//, '');
  const exact = path.replace(/\.[a-z0-9]+$/i, '');
  if (known && exact in known) return exact;
  return path.replace(/-\d+(?=\.[a-z0-9]+$)/i, '').replace(/\.[a-z0-9]+$/i, '');
};

/**
 * Did this come from a media picker rather than being a manifest key?
 *
 * Used to tell an editor what actually went wrong. `/img/` is where the
 * pipeline WRITES, so a value pointing there is either a processed variant
 * (fine — `toImageKey` handles it) or a file uploaded straight into the output
 * directory, which has no variants and no manifest entry at all.
 */
export const isPickerPath = (nameOrPath: string): boolean => nameOrPath.startsWith('/img/');
