/**
 * The old site's URL inventory — one reader, one format.
 *
 * `recon` writes `recon/urls.txt` and SKILL.md calls it "the inventory every
 * later step reads". Three things read it — `redirects`, `shots` and the
 * coverage check in `verify` — and until this module they each parsed it
 * themselves, differently:
 *
 *   redirects  kept every line that was not blank or a `#` comment
 *   shots      kept every line starting with `/`
 *
 * Which is fine until a real inventory turns up that does not match. One did:
 * a file of ABSOLUTE URLs (`https://site.com/about/`) rather than paths,
 * hand-made rather than written by `recon`. `redirects` then compared
 * `https://site.com/about/` against `/about/` and matched nothing, proposing an
 * empty map; `shots` found zero paths and silently reported the migration as
 * greenfield with no before side. Neither said anything was wrong.
 *
 * So: both forms are accepted here, once, and every consumer gets the same
 * answer. Same reason `lib/routes.mjs` and `lib/preserved.mjs` exist.
 *
 * ── ALREADY-DEAD URLS ARE MARKED, NOT DROPPED ─────────────────────────────
 * `recon` pulls URLs from the Wayback Machine, and some of them were ALREADY
 * 404 on the old site. They belong in the inventory — they still hold
 * backlinks, so they are redirect targets — but they are not pages the
 * migration lost. A coverage check that failed on them would go red on every
 * healthy migration, and a check that goes red for a non-reason gets switched
 * off. recon tags them; this reports them separately.
 */

/** Lines tagged with this were 404 on the OLD site before the migration began. */
export const GONE_TAG = '# gone-on-old-site';

/**
 * Parse an inventory file's contents.
 *
 * Returns `{ live, gone, origin }` — `live` and `gone` are arrays of paths.
 * Accepts paths and absolute URLs interchangeably.
 */
export function parseInventory(text) {
  const live = [];
  const gone = [];
  let origin = '';

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith('#')) {
      /* `# Inventory of https://old-site.com` — the only header worth keeping. */
      const found = /Inventory of\s+(https?:\/\/\S+)/i.exec(line);
      if (found) origin = found[1].replace(/\/$/, '');
      continue;
    }

    const isGone = line.includes(GONE_TAG);
    const value = line.split('#')[0].trim();
    if (!value) continue;

    /*
     * Absolute or relative, the answer is the path. A hand-made inventory of
     * absolute URLs is the case that broke two scripts silently.
     */
    let path;
    if (/^https?:\/\//i.test(value)) {
      try {
        const u = new URL(value);
        path = u.pathname + u.search;
        if (!origin) origin = u.origin;
      } catch {
        continue;
      }
    } else if (value.startsWith('/')) {
      path = value;
    } else {
      continue; // not a path or a URL — prose, or a stray line
    }

    (isGone ? gone : live).push(path);
  }

  return {
    live: [...new Set(live)].sort(),
    gone: [...new Set(gone)].sort(),
    origin,
  };
}

/**
 * Read the inventory from disk, or null when there is none.
 *
 * Null is the normal greenfield answer, not an error: there is no old site, so
 * there is nothing to have lost. Callers report it rather than failing.
 */
export function readInventory(readFileSync, file = 'recon/urls.txt') {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const parsed = parseInventory(text);
  return parsed.live.length || parsed.gone.length ? parsed : null;
}
