import type { APIRoute } from 'astro';
import { site } from '../../data/site';
import { kv } from '../../lib/runtime';
import { refuseWithoutToken } from '../../lib/export-token';
import { cleanMissedPath, cleanReferrerHost } from '../../lib/missed-paths.mjs';

export const prerender = false;

/**
 * The after-launch 404 watcher: which addresses visitors asked for that this
 * site does not have. Read with `npm run misses`.
 *
 * ── WHY THE 404 PAGE REPORTS ITSELF ────────────────────────────────────────
 * The 404 page is prerendered: a file, rendered once at build time, so none of
 * its code runs when a visitor hits it, and the template has no middleware to
 * notice. Rather than add server code to the request path to see a miss, the
 * page sends a beacon with its own path and this endpoint counts it. A side
 * effect is a feature: a scanner fetching wp-login.php runs no JavaScript and
 * is never counted, so the list is close to "people who hit a dead end"
 * rather than the internet's noise.
 *
 * Checked in `wrangler dev` with a local KV namespace: an unknown path answers
 * 404 with this page, a beacon POST is counted (204), a POST from another
 * origin is refused (403), and GET without the token is 401. ⚠ Astro's own
 * origin check (`security.checkOrigin`) refuses a text/plain POST that carries
 * NO Origin header before this code runs — browsers always send one on a
 * beacon, so real visitors are counted, but a curl test without `-H origin:`
 * is not, and that is Astro, not this endpoint.
 *
 * ── WHAT IS KEPT, AND FOR HOW LONG ─────────────────────────────────────────
 * Per path: a count, the day it was last seen, and the HOSTS that referred to
 * it (at most five) — the host only, decided in the browser, so the full
 * referring address never leaves it. No IP, no user agent, no query string,
 * no cookie, nothing per visit. Paths that look like they carry a person (an
 * `@`, a long number) are dropped — see lib/missed-paths.mjs.
 *
 * Every write resets a KV `expirationTtl` of `site.missRetentionDays`, so a
 * path nobody has missed for that long disappears by itself, the same way
 * leads do. The count is approximate on purpose: KV is read-then-write with no
 * transaction, two misses in the same second can count once, and a write KV
 * refuses (the free plan's 1,000 writes a day) is dropped in silence — the
 * visitor's 404 page never waits on this.
 *
 * ── OFF UNTIL ASKED FOR ────────────────────────────────────────────────────
 * Needs a `MISSES` KV binding (wrangler.jsonc has the block, commented out).
 * Without it every POST is a 204 no-op and GET says it is not configured —
 * the same "absent binding is a no-op" shape as the rest of runtime.ts.
 * Production builds only: staging 404s are the builder's own typos.
 */

/** KV metadata is capped at 1,024 bytes; this stays far under it. */
type Miss = { n: number; d: string; r?: Record<string, number> };

const noContent = () => new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });

/* Same rule as the contact form, and the same honest limit: it stops another
   site's page posting into this store, not a script that omits the header. */
const sameOrigin = (request: Request) => {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
};

export const POST: APIRoute = async ({ request }) => {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  const store = kv('MISSES');
  if (!store || site.env !== 'production') return noContent();

  /* sendBeacon posts text/plain, so the body is parsed by hand, and capped
     before it is: nothing legitimate here is more than a few hundred bytes. */
  const raw = await request.text().catch(() => '');
  if (raw.length > 1024) return noContent();
  let body: { p?: unknown; r?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return noContent();
  }

  const path = cleanMissedPath(body.p);
  if (!path) return noContent();
  const host = cleanReferrerHost(body.r);

  try {
    const key = `miss:${path}`;
    const { metadata } = await store.getWithMetadata<Miss>(key);
    const r = { ...(metadata?.r ?? {}) };
    if (host) r[host] = (r[host] ?? 0) + 1;
    /* The five busiest referrers, so the metadata cannot grow without bound. */
    const top = Object.fromEntries(Object.entries(r).sort((a, b) => b[1] - a[1]).slice(0, 5));
    const next: Miss = { n: (metadata?.n ?? 0) + 1, d: new Date().toISOString().slice(0, 10), ...(host || metadata?.r ? { r: top } : {}) };
    await store.put(key, '', { metadata: next, expirationTtl: site.missRetentionDays * 24 * 60 * 60 });
  } catch {
    /* A refused write (rate limit, daily quota) costs one count, never the visitor anything. */
  }
  return noContent();
};

/**
 * Every recorded miss, for `npm run misses`. Owner only, with the export token.
 * The counts live in KV METADATA, so one `list()` returns them — no read per
 * path, which would hit the per-request limit on a busy site.
 */
export const GET: APIRoute = async ({ request }) => {
  const refused = refuseWithoutToken(request, 'misses');
  if (refused) return refused;
  const store = kv('MISSES');
  if (!store) return new Response('The 404 watcher is not bound: no MISSES KV namespace.\n', { status: 503 });

  const misses: { path: string; hits: number; last: string; from: Record<string, number> }[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const listed = await store.list<Miss>({ prefix: 'miss:', cursor, limit: 1000 });
    for (const k of listed.keys) {
      if (!k.metadata) continue;
      misses.push({ path: k.name.slice(5), hits: k.metadata.n, last: k.metadata.d, from: k.metadata.r ?? {} });
    }
    if (listed.list_complete) break;
    cursor = listed.cursor;
  }

  return new Response(JSON.stringify({ retentionDays: site.missRetentionDays, misses }), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
};
