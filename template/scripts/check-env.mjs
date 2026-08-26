/**
 * Refuse to ship a build whose environment does not match the domains it will
 * be served on.
 *
 *   node scripts/check-env.mjs
 *
 * Runs at the end of `build:staging` and `build:production`, so it cannot be
 * forgotten — including on Cloudflare Workers Builds, where the build command
 * is typed once into a settings dialog and then never looked at again.
 *
 * ── THE FAILURE THIS EXISTS FOR ────────────────────────────────────────────
 * `PUBLIC_SITE_ENV` decides indexability, canonical host, which KV namespace
 * leads land in, and whether analytics is emitted at all. `wrangler.jsonc`
 * decides which domains answer. Nothing connects the two.
 *
 * At go-live, two edits have to happen together: the routes gain
 * example.com, and the build command becomes `build:production`. Do
 * the first and forget the second and the live site ships with `noindex` on
 * every page, canonicals pointing at the staging host, leads written to
 * LEADS_STAGING, and no analytics.
 *
 * It would look perfect. It would be invisible to Google, and every enquiry
 * would go to the wrong place. Nothing in a build log or a page would say so.
 *
 * The reverse — a production build served only on the staging host — is the
 * other half: an indexable duplicate of the real site.
 */

import { readFileSync } from 'node:fs';

const RESET = '[0m';
const RED = '[31m';
const GREEN = '[32m';

/** wrangler.jsonc is JSON with comments; strip them rather than add a parser. */
function readWrangler() {
  const raw = readFileSync('wrangler.jsonc', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'])\/\/.*$/gm, '$1')
    .replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(raw);
}

const env = process.env.PUBLIC_SITE_ENV ?? 'development';
const wrangler = readWrangler();
const patterns = (wrangler.routes ?? []).map((r) => (typeof r === 'string' ? r : r.pattern));

/* The production host is the apex, or www — NOT the staging subdomain, which
   also ends in the same string. Matching on `.includes()` alone would treat
   new.example.com as production.

   A custom domain is a bare hostname ("new.example.com"); a ROUTE
   carries a path ("example.com/*"). Go-live uses routes, so the path
   is stripped before matching — without this the guard would look at
   "example.com/*", fail to match, and conclude a production build
   was pointed at staging-only routes. It would have blocked the cutover. */
const hostOf = (p) => String(p).split('/')[0];
/*
 * ⚠ SET THIS PER PROJECT. It must match the production apex, with or without
 *   `www.` — and must NOT match the staging subdomain, which ends in the same
 *   string. Keep it in step with `PRODUCTION_HOSTS` in src/data/site.ts; those
 *   two disagreeing is the failure this whole script exists to catch.
 */
const PRODUCTION_HOST = /^(www\.)?example\.com$/;

const isProdHost = (p) => PRODUCTION_HOST.test(hostOf(p));
const routesProduction = patterns.some(isProdHost);
const routesStagingOnly = patterns.length > 0 && !routesProduction;

const problems = [];

if (routesProduction && env !== 'production') {
  problems.push(
    `wrangler.jsonc routes the PRODUCTION domain (${patterns.filter(isProdHost).join(', ')}) ` +
      `but this build is PUBLIC_SITE_ENV=${env}.\n` +
      `    That ships noindex on every page, canonicals pointing at the staging host,\n` +
      `    leads written to LEADS_STAGING, and no analytics — on the live site.\n` +
      `    Fix: build with \`npm run build:production\`.`,
  );
}

if (routesStagingOnly && env === 'production') {
  problems.push(
    `This is a PRODUCTION build, but wrangler.jsonc only routes ${patterns.join(', ')}.\n` +
      `    An indexable production build answering on the staging host is a duplicate\n` +
      `    of the real site. Fix: add the production routes, or build with\n` +
      `    \`npm run build:staging\`.`,
  );
}

if (problems.length) {
  console.error(`\n${RED}✗ environment does not match the deploy target${RESET}\n`);
  for (const p of problems) console.error(`  ${p}\n`);
  process.exit(1);
}

console.log(
  `${GREEN}✓${RESET} PUBLIC_SITE_ENV=${env} matches routes: ${patterns.join(', ') || '(none)'}`,
);
