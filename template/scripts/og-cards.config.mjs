/**
 * ⚠ PROJECT CONFIG for `npm run cards`. The template ships this as a STUB.
 *
 * Everything a designer chooses lives here. scripts/og-cards.mjs holds only the
 * machinery — the crop-safe box, the contrast measurement, the composite order —
 * and none of it renders until this file is filled in.
 *
 * That split is deliberate. A social card is the one image the whole internet
 * sees before it sees the site, so it has to carry the project's identity and
 * not the kit's. A generator that shipped with a palette and a type scale would
 * give every site built from this kit the same card.
 *
 * Fill this in AFTER the design exists — you need the real ramp, the two faces
 * in public/fonts/, and a wordmark. `npm run cards` refuses until then, with a
 * message saying which of them is missing.
 *
 * Prerequisites for the generator itself: ImageMagick, rsvg-convert, and
 * python3 with fontTools. See docs/runbook.md §1.
 */

/**
 * Colours, as hex. MIRROR src/styles/tokens.css — do not invent values here.
 * ImageMagick cannot read CSS custom properties, which is the only reason these
 * are duplicated at all. Two copies drift; check them when the ramp changes.
 *
 *   ink     the plain card's ground, for legal and utility pages
 *   veil    the wash laid over a photograph so type has something to sit on.
 *           Usually the darkest ink in the ramp
 *   fg      title and footer over a photograph. Usually the lightest
 *   accent  eyebrow and footer on the PLAIN card only. A mid tone has nothing
 *           left to give once a photograph is underneath — see og-cards.mjs
 */
export const PALETTE = null;
// export const PALETTE = { ink: '#…', veil: '#…', fg: '#…', accent: '#…' };

/**
 * The project's own two faces, as paths to the woff2 the SITE serves.
 *
 * Converted to TTF at run time rather than committed as a second copy: one
 * source of truth, and a card that cannot drift from what the page renders.
 * Keep in step with the @font-face block in src/styles/global.css.
 */
export const FONTS = null;
// export const FONTS = {
//   title:   'public/fonts/display.woff2',
//   eyebrow: 'public/fonts/display.woff2',   // a second face here if there is one
// };

/**
 * The logo, read from the component that already draws it — never committed as
 * a second copy of the artwork. A shared link that unfurls with different
 * branding reads as a different business, and two copies drift.
 *
 *   source  a file containing one <svg> with a viewBox and <path d="…">
 *   width   drawn width in px. Roughly a quarter of the 1200px card reads at
 *           the size a timeline actually renders it
 *
 * Set to null for cards with no logo. If the project has no wordmark component,
 * point `source` at a static SVG — but keep it generated from ONE source.
 */
export const WORDMARK = null;
// export const WORDMARK = { source: 'src/components/Wordmark.astro', width: 300 };

/**
 * Type scale, in px. The title size is picked by line count, so a long headline
 * shrinks rather than overflowing.
 */
export const TYPE = {
  title: { 1: 94, 2: 82, 3: 72 },
  eyebrow: 54,
  footer: 23,
};

/**
 * The footer line, on every card. Keep it short — it is set small, and it is
 * the first thing a hard crop takes.
 *
 * Read it from src/data/business.ts rather than typing it twice, if you prefer;
 * this file is plain JavaScript and can import.
 */
export const FOOTER = '';
// export const FOOTER = 'Town, State   ·   example.com';

/**
 * One row per page. Adding a page means adding a row and re-running — Seo.astro
 * resolves the card from the canonical path, so there is nothing to wire.
 *
 *   route    the URL this card belongs to. '/' becomes og-home.jpg
 *   slug     optional name override. Only the fallback needs one
 *   title    the headline. NOT the <title> tag — that carries "| Business Name"
 *            for search, which is wasted space on a card that already shows the
 *            name. `\n` is a deliberate line break
 *   eyebrow  small line in the second face above the title, or null
 *   photo    manifest key for the background, or null for the plain card
 *
 * Legal and utility pages take the plain card: a photograph on a privacy policy
 * is decoration pretending to be information.
 *
 * ── THE FALLBACK ROW IS NOT OPTIONAL ──────────────────────────────────────
 * The last row, with `slug: 'default'` and no route, is the card every page
 * without one of its own gets. Generate it; never hand-make it.
 *
 * A hand-made og-default.jpg goes stale silently. On one site the artwork
 * predated a rebrand by two days and went on serving the old wordmark from a
 * live site — the file existed, the manifest entry was valid, the build was
 * green, and the only page using it was one nobody opens. Generating it means
 * changing the type or the ink changes the fallback too.
 */
export const CARDS = [];
// export const CARDS = [
//   { route: '/',         title: 'A headline for\nthe home page.', eyebrow: 'Welcome',   photo: 'photos/hero' },
//   { route: '/contact/', title: 'Contact us',                     eyebrow: 'Say hello', photo: null },
//   { slug: 'default', route: null, title: 'A one-line\ndescription.', eyebrow: null, photo: 'photos/hero' },
// ];
