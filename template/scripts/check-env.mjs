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
 * decides which domains answer. Nothing connects the two — this script is the
 * only thing that does, so it needs no per-project editing to work.
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
 * The production hostnames come from src/data/site.ts — the same list the site
 * itself uses to decide indexability, canonicals and which KV namespace leads
 * land in. NOT a copy of it.
 *
 * ── WHY THIS IS NOT A CONSTANT HERE ────────────────────────────────────────
 * It used to be one, with a comment saying to keep it in step with site.ts.
 * On the first real project it was not: site.ts had the client's domain, this
 * file still had the template's example.com. So the guard matched nothing,
 * called every deploy fine, and passed for the whole build — a guard that
 * always passes is worse than none, because it reads as a check that ran.
 *
 * The drift WAS the failure this script exists to catch, reproduced inside the
 * script. One source of truth is the only fix that holds; a sterner comment
 * would not have survived the same afternoon.
 *
 * site.ts is TypeScript and imports `import.meta.env`, so node cannot import
 * it. Read the literal out instead — same reasoning as stripping comments from
 * wrangler.jsonc above rather than adding a parser.
 */
function readProductionHosts() {
  let src;
  try {
    src = readFileSync('src/data/site.ts', 'utf8');
  } catch {
    /* An ENOENT stack trace is not an answer to someone mid-deploy. It also
       usually means the script is being run from the wrong directory. */
    console.error(
      `\n${RED}✗ src/data/site.ts not found${RESET}\n\n` +
        '  This guard reads the production hostnames from it. Run it from the\n' +
        '  project root — `npm run build:staging` and `build:production` do.\n',
    );
    process.exit(1);
  }
  const m = /export const PRODUCTION_HOSTS\s*=\s*\[([^\]]*)\]/.exec(src);
  /* A guard that cannot find its own input must FAIL, never pass quietly —
     that is the whole lesson above, and it applies to this branch too. */
  if (!m) {
    console.error(
      `\n${RED}✗ cannot read PRODUCTION_HOSTS from src/data/site.ts${RESET}\n\n` +
        '  This guard derives the production hostnames from that export. Without it\n' +
        '  it cannot tell a production deploy from a staging one, so it refuses to\n' +
        '  pass rather than wave the build through.\n\n' +
        "  Expected a line like:  export const PRODUCTION_HOSTS = ['example.com'] as const;\n",
    );
    process.exit(1);
  }
  const hosts = [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((h) => h[1].toLowerCase());
  if (!hosts.length) {
    console.error(
      `\n${RED}✗ PRODUCTION_HOSTS in src/data/site.ts is empty${RESET}\n\n` +
        '  Every deploy would read as staging, including the production one.\n',
    );
    process.exit(1);
  }
  return hosts;
}

/* Exact membership, never a suffix match — `new.example.com` ends in
   `example.com` and is NOT production. Same rule as isProductionHost(). */
const PRODUCTION_HOSTS = readProductionHosts();

const isProdHost = (p) => PRODUCTION_HOSTS.includes(hostOf(p).toLowerCase());
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
