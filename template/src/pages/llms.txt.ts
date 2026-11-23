import type { APIRoute } from 'astro';
import { business } from '../data/business';
import { nav, legalNav } from '../data/nav';
import { getLegalLinks } from '../lib/legal';

/**
 * /llms.txt — the plain-text summary AI assistants read to learn what a site is and which pages
 * matter (llmstxt.org). Built from the same business data and navigation the site renders, so it
 * cannot drift from them; add a project's own lines (services, areas) here rather than writing a
 * static file that goes stale.
 *
 * Served on staging too: robots.txt there disallows every crawler, so nothing reads it until
 * production. (An SEO audit of a staging host will say llms.txt "invites what robots.txt turns
 * away" — true, deliberate, and gone at go-live.)
 */
export const GET: APIRoute = async ({ site: siteUrl }) => {
  const url = (path: string) => new URL(path, siteUrl).href;
  const a = business.address;
  const legal = [...(await getLegalLinks()), ...legalNav];

  const body = [
    `# ${business.name}`,
    '',
    `> ${business.description}`,
    '',
    `- Address: ${[a.street, a.locality, a.region, a.postalCode].filter(Boolean).join(', ')}`,
    `- Phone: ${business.phone.display}`,
    `- Email: ${business.email.display}`,
    `- Hours: ${business.hours.display}`,
    `- Area: ${business.serviceAreaSummary}`,
    '',
    '## Pages',
    '',
    ...nav.map((item) => `- [${item.label}](${url(item.href)})`),
    '',
    '## Optional',
    '',
    ...legal.map((item) => `- [${item.label}](${url(item.href)})`),
    '',
  ].join('\n');

  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
};
