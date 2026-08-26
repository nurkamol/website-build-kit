/**
 * Paths other systems point at, which must keep resolving after a migration.
 *
 * Shared by `recon` (which finds them on the OLD site) and `verify` (which
 * confirms they still resolve on the NEW one). Those were two separate lists
 * until they were not: recon reported that `/feed/` had to survive and nothing
 * ever checked whether it had. A list in one file cannot drift from itself.
 *
 * `build.md` §7 names this as a definition-of-done row. See `stacks.md` §1d for
 * why each one is silent when it breaks.
 */

export const PRESERVED = [
  ['/robots.txt', 'The Sitemap: line is the discovery route for every crawler'],
  ['/ads.txt', 'Programmatic revenue stops without it, with no error anywhere'],
  ['/app-ads.txt', 'Same, for apps'],
  ['/BingSiteAuth.xml', 'Bing ownership verification'],
  ['/feed/', 'Subscribers and syndication partners — 301, never drop'],
  ['/comments/feed/', 'Same'],
  ['/rss.xml', 'Same'],
  ['/.well-known/security.txt', 'Copy the .well-known directory wholesale'],
  ['/.well-known/apple-app-site-association', 'App deep links break silently'],
  ['/favicon.ico', 'Referenced by things that never re-read your HTML'],
];

/**
 * Read back what `recon` actually found on the old site, so `verify` checks
 * the paths that MATTERED for this migration rather than the generic list.
 *
 * Returns null when there is no recon output — a greenfield build has no old
 * site, and inventing an expectation there would be noise.
 */
export function preservedFromRecon(readFileSync) {
  try {
    const md = readFileSync('recon/preserved.md', 'utf8');
    const section = md.split('## Present on the old site')[1]?.split('##')[0] ?? '';
    const paths = [...section.matchAll(/^\|\s*`([^`]+)`/gm)].map((m) => m[1]);
    return paths.length ? paths : null;
  } catch {
    return null;
  }
}
