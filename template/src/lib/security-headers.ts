/**
 * The security headers every response carries.
 *
 * ⚠ TWO PLACES SEND THEM, AND THIS IS THE ONE THAT MUST MATCH public/_headers. `_headers` covers
 *   everything served as a file — every prerendered page, every image. It NEVER reaches a page the
 *   Worker renders per request (the contact page: `prerender = false`) or /api/*: those went out
 *   with no security headers at all, and on staging without the X-Robots-Tag noindex the rest of
 *   the site carried — found on a real launch by an SEO audit, not by any check here. So
 *   src/middleware.ts adds this list to every response the Worker renders. Change one, change the
 *   other; `test:gates` compares them.
 *
 * HSTS deliberately without includeSubDomains or preload: it covers this host only, so it cannot
 * affect the client's other subdomains (mail, a booking system a provider set up), and it can be
 * withdrawn. A zone that sets its own HSTS overrides this one — fine either way.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  'Content-Security-Policy': "frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Strict-Transport-Security': 'max-age=31536000',
};

/** The value scripts/staging-headers.mjs writes into _headers on a non-production build. */
export const STAGING_ROBOTS = 'noindex, nofollow, noarchive';
