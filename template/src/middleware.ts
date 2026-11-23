import { defineMiddleware } from 'astro:middleware';
import { site } from './data/site';
import { SECURITY_HEADERS, STAGING_ROBOTS } from './lib/security-headers';

/**
 * Headers for the responses the Worker renders per request — the form page(s) with
 * `prerender = false` and /api/*. Everything prerendered is a file and gets them from
 * public/_headers instead (see src/lib/security-headers.ts for why both exist). A header the route
 * already set is left alone.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  if (context.isPrerendered) return response;

  /* A fresh Response: one made by Response.redirect() has immutable headers, and setting one
     throws — which would turn every no-JavaScript form redirect into a 500. */
  const out = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!out.headers.has(name)) out.headers.set(name, value);
  }
  if (!site.indexable && !out.headers.has('X-Robots-Tag')) out.headers.set('X-Robots-Tag', STAGING_ROBOTS);
  return out;
});
