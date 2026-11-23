/**
 * How alike two URL paths are — the one matcher behind every redirect the kit
 * proposes: `redirects` (old inventory → new routes, before launch) and
 * `misses` (what visitors actually asked for, after it).
 *
 * Moved out of redirects.mjs when `misses` became the second caller. Two
 * copies of a scoring function agree until the first time one is tuned, and
 * then the same old URL gets two different answers depending on which command
 * you ran.
 */

/* ── Similarity ────────────────────────────────────────────────────────────
 *
 * Compares the SLUG, not the whole path, because a migration usually reshapes
 * the directory structure and keeps the leaf: /blog/2019/duct-cleaning-tips/
 * becomes /blog/duct-cleaning-tips/. Comparing full paths scores that pair low
 * for a difference nobody cares about.
 */

/*
 * Words that carry no meaning in a slug.
 *
 * `us` and `we` matter more than they look: without them `/about-us/` scores
 * 54% against `/about/` and lands in the needs-a-human pile — a pair anyone
 * would take instantly. A reviewer handed two hundred obvious lines to confirm
 * stops reading them, which defeats the whole point of the pile.
 */
export const NOISE = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'for', 'to', 'in', 'on',
  'your', 'our', 'us', 'we',
]);

const tokens = (path) =>
  path
    .toLowerCase()
    .replace(/\.(html?|php|aspx?)$/, '')
    .split('/')
    .filter(Boolean)
    .pop()
    ?.split(/[-_.]+/)
    .filter((t) => t && !NOISE.has(t) && !/^\d{4}$/.test(t)) ?? [];

function levenshtein(a, b) {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = tmp;
    }
  }
  return prev[b.length];
}

/**
 * 0..1. Token overlap carries most of it — word order changes constantly and
 * should not cost anything — with edit distance breaking ties and rescuing
 * near-misses like `sevices` for `services`.
 */
export function similarity(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return 0;

  const setA = new Set(ta);
  const setB = new Set(tb);
  const shared = [...setA].filter((t) => setB.has(t)).length;
  const jaccard = shared / new Set([...setA, ...setB]).size;

  const strA = ta.join('-');
  const strB = tb.join('-');
  const edit = 1 - levenshtein(strA, strB) / Math.max(strA.length, strB.length);

  return jaccard * 0.7 + Math.max(0, edit) * 0.3;
}

export const HIGH = 0.85;
export const REVIEW = 0.5;

/*
 * Admin paths must 404, never 301. A redirect from an admin path tells a
 * scanner the site MOVED rather than that the path is gone — free
 * reconnaissance, and it invites the follow-up scan. stacks.md §1d.
 */
export const MUST_404 = /^\/(wp-admin|wp-login\.php|xmlrpc\.php|wp-json|wp-includes|administrator|admin)\b/i;

/*
 * A machine-readable path needs the FORMAT at that path, not a redirect to
 * HTML. A directory that fetches and parses a feed gets a marketing page.
 */
export const MACHINE = /\.(xml|json|txt|kml|rss|atom|csv)$/i;
