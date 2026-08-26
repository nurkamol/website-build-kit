/**
 * Self-hosted fonts to preload.
 *
 * Empty on purpose. The template ships no typeface — the display/body pairing
 * is the single largest premium lever there is, and a typeface that arrives
 * with the starter is one nobody chose.
 *
 * To add one:
 *   1. put the variable woff2 in `public/fonts/` (subset — see docs/design.md)
 *   2. add the `@font-face` block to `src/styles/global.css`
 *   3. name the family in `--font-display` / `--font-body` in `tokens.css`
 *   4. add the file here, so Base.astro emits the preload
 *
 * Only preload faces used above the fold — a preload for a face first needed
 * at the footer competes with the LCP image for bandwidth and costs more than
 * it saves. Two entries is normally the whole list.
 *
 * Same-origin means the preload is the whole story: no DNS lookup, no TLS
 * handshake, no third-party round trip on the critical path.
 */

export const preloadFonts: string[] = [
  // '/fonts/display.woff2',
  // '/fonts/body.woff2',
];
