/**
 * Discover the site's routes, without a list anyone has to maintain.
 *
 * A hardcoded route array in a script is a second source of truth for what the
 * site contains. It goes stale silently — the script keeps passing while
 * testing pages that no longer exist and skipping the ones that do — and it is
 * how one project's routes ended up shipped inside this template.
 *
 * Production: the deployed sitemap, which is what a crawler sees.
 * Staging or local: dist/, because staging emits no sitemap by design.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Routes this build emitted, as absolute paths. 404 is excluded — it is not a route. */
export function routesFromDist() {
  const root = ['dist/client', 'dist'].find((d) => existsSync(d));
  if (!root) return [];

  const walk = (dir) =>
    readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });

  return walk(root)
    .filter((f) => f.endsWith('.html') && !f.endsWith('404.html'))
    /* ⚠ SEPARATORS NORMALISED — `relative()` RETURNS BACKSLASHES ON WINDOWS.
       A URL path is always `/`. Without this the map produced `/about\\` for
       `about\\index.html`, which matched nothing: check-sitemap's contradiction
       check silently passed a site that listed a noindexed URL in its sitemap, and
       Search Console reports that as an error against the whole submission. */
    .map((f) => '/' + relative(root, f).split(sep).join('/')
          .replace(/index\.html$/, '').replace(/\.html$/, '/'))
    .map((p) => (p.endsWith('/') ? p : `${p}/`))
    .sort();
}

/**
 * Every `<loc>` in the deployed sitemap, following the index to its children.
 * Returns [] when there is no sitemap, which is the normal staging case.
 */
export async function routesFromSitemap(origin, fetcher = fetch) {
  const get = async (url) => {
    try {
      const res = await fetcher(url);
      return res.status === 200 ? await res.text() : '';
    } catch {
      return '';
    }
  };

  const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

  /*
   * A sitemap index lists its children as ABSOLUTE URLs at the host the build
   * was made for. Following them literally means a local preview of a
   * production build fetches example.com's sitemap, gets nothing, and silently
   * falls back to dist/ — reporting fewer routes than the site has, with no
   * error. Re-root onto the origin being asked about; a no-op when they match.
   */
  const reroot = (url) => {
    try {
      const u = new URL(url);
      return u.origin === new URL(origin).origin ? url : new URL(u.pathname + u.search, origin).href;
    } catch {
      return url;
    }
  };

  const index = await get(`${origin}/sitemap-index.xml`);
  const maps = index ? locs(index).map(reroot) : [`${origin}/sitemap-0.xml`];

  const out = [];
  for (const map of maps) out.push(...locs(await get(map)));
  return [...new Set(out.map(reroot))].sort();
}

/**
 * Sitemap first, dist/ as the fallback. Returns absolute URLs plus a `source`
 * string, so a caller can say where its list came from — a route list of
 * unclear origin is the thing this module exists to prevent.
 */
export async function discoverRoutes(origin, fetcher = fetch) {
  const fromSitemap = await routesFromSitemap(origin, fetcher);
  if (fromSitemap.length) return { routes: fromSitemap, source: 'the deployed sitemap' };

  const fromDist = routesFromDist();
  if (fromDist.length) {
    return {
      routes: fromDist.map((p) => origin + p),
      source: 'dist/ (no sitemap — expected on staging)',
    };
  }

  return { routes: [], source: 'nothing — no sitemap and no dist/' };
}

/**
 * Routes derived from `src/pages`, without building anything.
 *
 * ── WHY NOT routesFromDist ─────────────────────────────────────────────────
 * `check-cms.mjs` runs BEFORE the build, so `dist/` does not exist yet. The
 * point of checking a navigation target early is to fail while somebody is
 * still looking at the config, not after a deploy.
 *
 * Returns `{ static: Set<string>, dynamic: RegExp[] }`.
 *
 * ⚠ A DYNAMIC ROUTE IS A PATTERN, NOT A ROUTE. `[slug].astro` serves every
 *   legal page and `[...path].astro` serves any depth. Treating those as
 *   literal strings would report every real link through them as broken, which
 *   on a site with a `[slug]` catch-all is *most of the site* — a check that
 *   confident and that wrong gets switched off within a day.
 *
 * ⚠ ENDPOINTS ARE NOT PAGES. `robots.txt.ts` and `api/contact.ts` produce
 *   responses, never navigable pages, so they are excluded — nobody puts them
 *   in a menu and reporting them as available would be noise.
 */
export function routesFromPages(dir = 'src/pages') {
  const out = { static: new Set(), dynamic: [] };
  if (!existsSync(dir)) return out;

  const walk = (d) =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) => {
      const full = join(d, e.name);
      return e.isDirectory() ? walk(full) : [full];
    });

  for (const file of walk(dir)) {
    const rel = relative(dir, file).split(sep).join('/');
    /* `_` prefixed files and directories are not routed by Astro. */
    if (rel.split('/').some((part) => part.startsWith('_'))) continue;
    if (!/\.(astro|md|mdx)$/.test(rel)) continue; // .ts endpoints are not pages

    const path =
      '/' +
      rel
        .replace(/\.(astro|md|mdx)$/, '')
        .replace(/(^|\/)index$/, '$1')
        .replace(/\/$/, '');
    const route = path === '/' ? '/' : `${path}/`.replace(/\/+/g, '/');

    if (route.includes('[')) {
      /* [...rest] matches any depth; [slug] matches one segment. */
      const pattern = route
        .replace(/[.*+?^${}()|\\]/g, '\\$&')
        .replace(/\[\.\.\.[^\]]+\]/g, '.+')
        .replace(/\[[^\]]+\]/g, '[^/]+');
      out.dynamic.push(new RegExp(`^${pattern}$`));
    } else {
      out.static.add(route);
    }
  }

  return out;
}

/** Does `href` correspond to a page this site serves? */
export function routeExists(href, routes) {
  const path = href.split('#')[0].split('?')[0];
  const normalised = path.endsWith('/') || path === '' ? path || '/' : `${path}/`;
  if (routes.static.has(normalised)) return true;
  return routes.dynamic.some((re) => re.test(normalised));
}
