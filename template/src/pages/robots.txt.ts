import type { APIRoute } from 'astro';
import { site } from '../data/site';

/**
 * Generated, not a static file — so staging is disallow-all without anyone
 * having to remember to swap a file at go-live.
 */
export const GET: APIRoute = ({ site: siteUrl }) => {
  const body = site.indexable
    ? [
        'User-agent: *',
        'Allow: /',
        'Disallow: /api/',
        '',
        `Sitemap: ${new URL('/sitemap-index.xml', siteUrl).href}`,
        '',
      ].join('\n')
    : [
        '# Staging — not for indexing.',
        '#',
        '# ⚠ Disallow is a CRAWLING instruction, not an indexing one. Blocking the',
        '# crawler means it never fetches the page and never reads the `noindex`',
        '# every page here carries — so a staging URL that gets linked anywhere can',
        '# still be indexed as a bare URL competing with production.',
        '#',
        '# Put staging behind Cloudflare Access. That is the actual answer, it is free',
        '# at this scale, and it makes this file irrelevant. If staging must stay',
        '# public, delete the Disallow below so the noindex is actually read.',
        '# See docs/traps.md.',
        'User-agent: *',
        'Disallow: /',
        '',
      ].join('\n');

  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
};
