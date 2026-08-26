/**
 * Inventory the OLD site, before designing a single route.
 *
 *   npm run recon -- https://old-site.com
 *   npm run recon -- https://old-site.com --no-wayback     # faster, current URLs only
 *
 * Writes recon/urls.txt, recon/preserved.md and recon/integrations.md.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * "The inventory" is referenced by runbook.md §2, build.md §2, kickoff.md and
 * stacks.md §1, §1b and §1d — it is the input to the redirect map, the go-live
 * route check and week-one 404 triage. Nothing in the kit produced it. Every
 * migration rebuilt it by hand, from prose, at the point in the project where
 * getting it wrong is least visible and most expensive.
 *
 * A URL missed here is a page that 404s after cutover with its backlinks
 * pointing at nothing, and you find out from a Search Console email weeks
 * later. This is the cheapest possible moment to be thorough.
 *
 * ── WHAT IT CANNOT SEE ─────────────────────────────────────────────────────
 * Printed at the end, and it matters more here than anywhere else: an
 * integration injected by JavaScript after load, anything behind a login, a
 * tag fired only through GTM, and any page absent from both the sitemap and
 * the Wayback Machine. This narrows the interview with the client. It does not
 * replace it — see the three questions in stacks.md §1b.
 */

import { mkdirSync, writeFileSync } from 'node:fs';

import { GONE_TAG } from './lib/inventory.mjs';
import { PRESERVED } from './lib/preserved.mjs';

const RESET = '[0m';
const RED = '[31m';
const GREEN = '[32m';
const YELLOW = '[33m';
const DIM = '[2m';
const BOLD = '[1m';

const argv = process.argv.slice(2);
const target = argv.find((a) => !a.startsWith('--'));
const useWayback = !argv.includes('--no-wayback');

if (!target) {
  console.error('usage: npm run recon -- https://old-site.com [--no-wayback]');
  process.exit(1);
}

const ORIGIN = (target.startsWith('http') ? target : `https://${target}`).replace(/\/$/, '');
const HOST = new URL(ORIGIN).hostname;
const OUT = 'recon';

const section = (t) => console.log(`\n${BOLD}── ${t} ${'─'.repeat(Math.max(0, 56 - t.length))}${RESET}`);
const notes = [];

async function req(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    return await fetch(url, { redirect: 'follow', signal: controller.signal, ...options });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const text = async (url) => {
  const r = await req(url);
  return r?.ok ? await r.text() : '';
};

/** Bounded concurrency — this is someone's live site, not a load test. */
async function pool(items, worker, limit = 6) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const index = i++;
        out[index] = await worker(items[index], index);
      }
    }),
  );
  return out;
}

/* ── 1. The sitemap, and WHICH name it uses ────────────────────────────────
 *
 * robots.txt is the source of truth: it is what every crawler follows and what
 * Search Console was pointed at. The filename itself is load-bearing — Yoast
 * and Rank Math emit /sitemap_index.xml, WordPress core /wp-sitemap.xml, and
 * @astrojs/sitemap /sitemap-index.xml. Underscore to hyphen reads as identical
 * and is not, so the new build has to emit or redirect the OLD name.
 */
section('Sitemap');

const robots = await text(`${ORIGIN}/robots.txt`);
const declared = [...robots.matchAll(/^\s*Sitemap:\s*(\S+)/gim)].map((m) => m[1]);

/*
 * Probed WITHOUT following redirects. With `follow`, every alias reports 200 —
 * a site that 301s /sitemap.xml to /sitemap_index.xml looks like it serves
 * both natively, and the one fact this section exists to establish (which
 * filename is canonical) is exactly the one that gets masked.
 */
const CANDIDATES = ['/sitemap_index.xml', '/sitemap-index.xml', '/wp-sitemap.xml', '/sitemap.xml'];
const probed = await pool(CANDIDATES, async (p) => {
  const r = await req(`${ORIGIN}${p}`, { method: 'HEAD', redirect: 'manual' });
  return { path: p, status: r?.status ?? 0, location: r?.headers.get('location') ?? '' };
});

const native = probed.filter((p) => p.status === 200).map((p) => p.path);
const sitemapUrls = [...new Set([...declared, ...native.map((p) => ORIGIN + p)])];

if (declared.length) {
  console.log(`  ${GREEN}✓${RESET} robots.txt declares: ${declared.join(', ')}`);
} else {
  console.log(`  ${YELLOW}!${RESET} robots.txt names no sitemap`);
  notes.push('robots.txt declares no sitemap — confirm what was submitted to Search Console');
}
for (const p of probed) {
  const mark = p.status === 200 ? `${GREEN}✓${RESET}` : `${DIM}·${RESET}`;
  const via = p.location ? ` ${DIM}→ ${p.location}${RESET}` : '';
  console.log(`  ${mark} ${p.path.padEnd(22)} ${p.status || '—'}${via}`);
}

/*
 * robots.txt wins over anything probed. It is what crawlers follow and what
 * was almost certainly submitted to Search Console; a path that merely answers
 * 200 may be an alias nobody has ever pointed at.
 */
const canonicalSitemap =
  (declared[0] && new URL(declared[0]).pathname) ?? native[0] ?? null;

if (canonicalSitemap) {
  console.log(
    `\n  ${BOLD}The new build must answer on ${canonicalSitemap}${RESET}` +
      `${declared.length ? `  ${DIM}(declared in robots.txt)${RESET}` : `  ${DIM}(probed — robots.txt names none)${RESET}`}\n` +
      `  ${DIM}Search Console stores the URL that was submitted. Emit at that path, or 301 it.${RESET}`,
  );
}

/* ── 2. Every URL ──────────────────────────────────────────────────────── */
section('URLs');

const locsIn = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());

async function harvest(url, seen = new Set()) {
  if (seen.has(url)) return [];
  seen.add(url);
  const xml = await text(url);
  if (!xml) return [];

  const locs = locsIn(xml);
  const isIndex = /<sitemapindex/i.test(xml);
  if (!isIndex) return locs;

  const nested = await pool(locs, (child) => harvest(child, seen));
  return nested.flat();
}

const fromSitemap = [...new Set((await pool(sitemapUrls, (u) => harvest(u))).flat())];
console.log(`  ${fromSitemap.length} URL(s) from the sitemap`);

let fromWayback = [];
if (useWayback) {
  /*
   * The Wayback Machine surfaces URLs that are GONE from the current sitemap
   * but still have inbound links — deleted posts, retired service pages,
   * campaign landing pages. Those are exactly the ones that 404 after cutover
   * with nobody watching, because they are invisible to any crawl of the live
   * site. kickoff.md reaches for this when the origin is dead; it is worth as
   * much when the origin is healthy.
   */
  /*
   * ⚠ A FAILED REQUEST MUST NOT REPORT AS "0 ARCHIVED URLS".
   *
   * The CDX API is frequently slow and occasionally refuses outright. Folding
   * that into an empty result would print `0 URL(s) from the Wayback Machine`,
   * which reads as a finding — this site has no history — when it means the
   * lookup did not happen. The whole value of this step is the URLs nothing
   * else can see, so a silent zero is the one outcome that must be impossible.
   */
  const cdxUrl =
    `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(HOST)}%2F*` +
    `&output=text&fl=original&collapse=urlkey&filter=statuscode:200&limit=5000`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  let cdx = null;
  try {
    const res = await fetch(cdxUrl, { signal: controller.signal });
    cdx = res.ok ? await res.text() : null;
    if (!res.ok) notes.push(`Wayback CDX returned ${res.status} — the archive was NOT consulted`);
  } catch {
    notes.push('Wayback CDX timed out or refused — the archive was NOT consulted. Re-run, or use --no-wayback deliberately');
  } finally {
    clearTimeout(timer);
  }

  if (cdx === null) {
    console.log(
      `  ${RED}✗${RESET} Wayback Machine unreachable — this is NOT "no archived URLs".\n` +
        `      ${DIM}Deleted pages that still hold backlinks are missing from this inventory.${RESET}`,
    );
  }

  fromWayback = [...new Set((cdx ?? '').split('\n').map((l) => l.trim()).filter(Boolean))]
    .filter((u) => {
      try {
        return new URL(u).hostname.replace(/^www\./, '') === HOST.replace(/^www\./, '');
      } catch {
        return false;
      }
    })
    /* Assets are not routes. A redirect map for .jpg files is noise. */
    .filter((u) => !/\.(jpe?g|png|gif|svg|webp|css|js|ico|woff2?|ttf|pdf|zip|mp4)(\?|$)/i.test(u))
    /*
     * Neither is platform plumbing. The archive is full of /wp-includes/,
     * /cdn-cgi/ and xmlrpc.php — they were never pages, nobody links to them,
     * and a redirect map padded with them buries the URLs that matter.
     * /wp-admin/ and /wp-login.php specifically must 404 on the new site: a
     * 301 from an admin path tells a scanner the site moved.
     */
    .filter(
      (u) =>
        !/\/(cdn-cgi|wp-includes|wp-json|wp-admin|xmlrpc\.php|wp-login\.php|feed\/?$)/i.test(
          new URL(u).pathname,
        ),
    );
  if (cdx !== null) console.log(`  ${fromWayback.length} URL(s) from the Wayback Machine`);
} else {
  notes.push('--no-wayback: URLs that were deleted before this crawl are not in the inventory');
}

const paths = (urls) =>
  urls
    .map((u) => {
      try {
        return new URL(u).pathname;
      } catch {
        return null;
      }
    })
    .filter(Boolean);

const sitemapPaths = new Set(paths(fromSitemap));
const extraPaths = [...new Set(paths(fromWayback))].filter((p) => !sitemapPaths.has(p));

/* Which of the extras are actually dead now — those are the redirect map. */
const extraStatus = await pool(extraPaths.slice(0, 400), async (p) => {
  const r = await req(`${ORIGIN}${p}`, { method: 'HEAD' });
  return { path: p, status: r?.status ?? 0 };
});
const gone = new Set(extraStatus.filter((r) => r.status === 404).map((r) => r.path));
if (extraPaths.length > 400) {
  console.log(`  ${YELLOW}!${RESET} ${extraPaths.length} extra paths, only the first 400 status-checked`);
  notes.push(`${extraPaths.length - 400} Wayback paths were not status-checked — raise the cap if this is a large site`);
}

const all = [...sitemapPaths, ...extraPaths].sort();

/*
 * ⚠ TAG THE ALREADY-DEAD ONES IN THE FILE, not only in this terminal.
 *
 * `gone` was computed here from the start and printed once, so the fact died
 * with the scrollback. It matters later: `verify` now checks that every URL the
 * old site served still resolves, and a URL that was ALREADY 404 before the
 * migration began is not a page the migration lost. Without the tag that check
 * goes red on every healthy migration, and a check that goes red for a
 * non-reason is a check that gets switched off.
 *
 * Read by scripts/lib/inventory.mjs, which is the only thing that parses this
 * file. The paths stay one-per-line and still `grep '^/'` cleanly.
 */
const goneList = [...gone].sort();

mkdirSync(OUT, { recursive: true });
writeFileSync(
  `${OUT}/urls.txt`,
  `# Inventory of ${ORIGIN}\n` +
    `# ${sitemapPaths.size} live in the sitemap` +
    (useWayback ? `, ${extraPaths.length} more from the Wayback Machine (${gone.size} now 404)\n` : '\n') +
    `# Every one of these needs a 200 or a specific 301 after cutover. runbook.md §2.\n` +
    `# Lines tagged \`${GONE_TAG}\` were already 404 before the migration —\n` +
    `# redirect targets that still hold backlinks, not pages to rebuild.\n` +
    all.map((p) => (gone.has(p) ? `${p}   ${GONE_TAG}` : p)).join('\n') +
    '\n',
);

console.log(`  ${GREEN}✓${RESET} ${all.length} path(s) → ${OUT}/urls.txt`);
if (goneList.length) {
  console.log(
    `  ${YELLOW}!${RESET} ${goneList.length} already 404 on the old site — these still hold backlinks\n` +
      `      ${DIM}${goneList.slice(0, 5).join('  ')}${goneList.length > 5 ? ` … +${goneList.length - 5}` : ''}${RESET}`,
  );
}

/* ── 3. Paths other systems point at ──────────────────────────────────── */
section('Preserved paths');

/* Manual redirects again: "serves a feed" and "301s to a feed" are different
   facts, and only the first means the path must be reproduced. */
const preserved = await pool(PRESERVED, async ([path, why]) => {
  const r = await req(`${ORIGIN}${path}`, { method: 'HEAD', redirect: 'manual' });
  return { path, why, status: r?.status ?? 0, location: r?.headers.get('location') ?? '' };
});

const present = preserved.filter((p) => p.status === 200 || (p.status >= 300 && p.status < 400));

/*
 * A machine-readable path redirected to the HOMEPAGE is a soft 404 for whatever
 * parses it: an aggregator asking for a feed gets a marketing page, and Google
 * reads the pattern as a site-wide soft 404. It is the single most common
 * migration mistake, because it looks like a tidy catch-all rule and returns a
 * perfectly healthy 301.
 */
const toHomepage = present.filter(
  (p) => p.status >= 300 && p.status < 400 && p.location && /^(https?:\/\/[^/]+)?\/$/.test(p.location),
);

for (const p of preserved) {
  const live = p.status === 200 || (p.status >= 300 && p.status < 400);
  const soft = toHomepage.includes(p);
  const mark = soft ? `${RED}✗${RESET}` : live ? `${YELLOW}!${RESET}` : `${DIM}·${RESET}`;
  const via = p.location ? ` ${DIM}→ ${p.location}${RESET}` : '';
  console.log(`  ${mark} ${p.path.padEnd(38)} ${p.status || '—'}${via}`);
}
console.log(`  ${DIM}${present.length} present — each must resolve on the new site${RESET}`);

if (toHomepage.length) {
  console.log(
    `\n  ${RED}${toHomepage.length} path(s) redirect to the homepage${RESET}\n` +
      `  ${DIM}${toHomepage.map((p) => p.path).join(', ')}${RESET}\n` +
      `  ${DIM}A feed or data file 301'd to a marketing page is a soft 404 for anything\n` +
      `  parsing it. Point each at its real equivalent, or let it 404 honestly.${RESET}`,
  );
  notes.push(`${toHomepage.length} preserved path(s) currently 301 to the homepage — see above`);
}

/* Verification tokens live in the homepage <head> and vanish silently. */
const home = await text(`${ORIGIN}/`);
const metas = [
  ...home.matchAll(/<meta[^>]+name=["'](google-site-verification|msvalidate\.01|facebook-domain-verification|yandex-verification)["'][^>]*content=["']([^"']+)/gi),
].map((m) => [m[1], m[2]]);

const googleHtml = [...home.matchAll(/google[0-9a-f]{16}\.html/gi)].map((m) => m[0]);

if (metas.length) {
  console.log(`\n  ${BOLD}Verification tokens in <head> — carry these across:${RESET}`);
  for (const [name, content] of metas) console.log(`    ${name.padEnd(32)} ${content}`);
} else {
  notes.push('No verification <meta> on the homepage — check for HTML-file or DNS TXT verification instead');
}

writeFileSync(
  `${OUT}/preserved.md`,
  `# Paths and identifiers that must not change\n\n` +
    `From \`${ORIGIN}\`. See stacks.md §1d — losing one of these is silent.\n\n` +
    `## Sitemap\n\n` +
    (canonicalSitemap
      ? `The old site's canonical sitemap is **${canonicalSitemap}**` +
        (native.filter((n) => n !== canonicalSitemap).length
          ? ` (aliases also answering 200: ${native.filter((n) => n !== canonicalSitemap).join(', ')})`
          : '') +
        `. The new build must emit at that path or 301 to it.\n` +
        `\`@astrojs/sitemap\` emits \`/sitemap-index.xml\` — underscore becomes a hyphen, which reads as identical.\n\n`
      : `No sitemap found. Confirm with the client what was submitted to Search Console.\n\n`) +
    (declared.length ? `robots.txt declares: ${declared.map((d) => `\`${d}\``).join(', ')}\n\n` : '') +
    `## Present on the old site\n\n` +
    (present.length
      ? '| Path | Now | Why it matters |\n| --- | --- | --- |\n' +
        present.map((p) => `| \`${p.path}\` | ${p.status}${p.location ? ` → \`${p.location}\`` : ''} | ${p.why} |`).join('\n') + '\n\n'
      : '_None of the usual ones respond._\n\n') +
    `## Verification\n\n` +
    (metas.length
      ? '| Method | Token |\n| --- | --- |\n' +
        metas.map(([n, c]) => `| \`${n}\` | \`${c}\` |`).join('\n') + '\n\n'
      : '_No verification meta on the homepage._\n\n') +
    (googleHtml.length ? `HTML-file verification referenced: ${googleHtml.join(', ')}\n\n` : '') +
    `> Verification drops the moment the file or tag stops resolving, and losing it loses the\n` +
    `> property's data access. Carry it byte-for-byte, or move to DNS TXT and confirm BEFORE launch.\n`,
);
console.log(`  ${GREEN}✓${RESET} ${OUT}/preserved.md`);

/* ── 4. What is bolted on ─────────────────────────────────────────────── */
section('Integrations');

/* Sample rather than crawl everything: a contact page carries the form and the
   spam vendor, the homepage carries the tags. Anything JS-injected after load
   is invisible here by construction — that is what the client interview is for. */
const sample = [
  '/',
  ...['/contact/', '/contact-us/', '/about/', '/blog/', '/services/'].filter(() => true),
].filter((p, i, a) => a.indexOf(p) === i);

const pages = await pool(sample, async (p) => ({ path: p, html: await text(`${ORIGIN}${p}`) }));
const corpus = pages.map((p) => p.html).join('\n');

const ids = [...new Set([...corpus.matchAll(/\b(G-[A-Z0-9]{8,}|GTM-[A-Z0-9]{6,}|AW-[0-9]{9,}|UA-[0-9]{4,}-[0-9]+)\b/g)].map((m) => m[1]))];

const VENDORS = [
  'calendly', 'cal.com', 'hubspot', 'klaviyo', 'mailchimp', 'intercom', 'crisp', 'tawk',
  'drift', 'zendesk', 'trustpilot', 'birdeye', 'yotpo', 'stripe', 'paypal', 'recaptcha',
  'turnstile', 'hotjar', 'clarity', 'typeform', 'jotform', 'acuity', 'housecallpro',
  'jobber', 'servicetitan', 'momence', 'wellnessliving', 'glofox', 'pike13', 'cookieyes', 'cookiebot', 'complianz', 'algolia', 'mindbody',
  'squarespace', 'wix', 'shopify', 'woocommerce', 'memberpress',
];
const vendors = VENDORS.filter((v) => new RegExp(v.replace('.', '\\.'), 'i').test(corpus));

const origins = [...new Set([...corpus.matchAll(/(?:src|href)=["']https?:\/\/([^"'/]+)/g)].map((m) => m[1]))]
  .filter((h) => !h.endsWith(HOST.replace(/^www\./, '')))
  .sort();

const formActions = [...new Set([...corpus.matchAll(/<form[^>]+action=["']([^"']+)/gi)].map((m) => m[1]))];

const headRes = await req(`${ORIGIN}/`, { method: 'HEAD' });
const fingerprint = ['server', 'x-powered-by', 'x-pingback', 'x-generator']
  .map((h) => [h, headRes?.headers.get(h)])
  .filter(([, v]) => v);
const generator = /<meta[^>]+name=["']generator["'][^>]*content=["']([^"']+)/i.exec(home)?.[1];

for (const [label, list] of [
  ['Analytics IDs', ids],
  ['Vendors in markup', vendors],
  ['Third-party origins', origins.slice(0, 12)],
  ['Form actions', formActions],
]) {
  console.log(`  ${BOLD}${label}${RESET} ${list.length ? '' : `${DIM}none found${RESET}`}`);
  for (const item of list) console.log(`    ${item}`);
}
if (generator) console.log(`  ${BOLD}Generator${RESET}\n    ${generator}`);
for (const [h, v] of fingerprint) console.log(`    ${h}: ${v}`);

writeFileSync(
  `${OUT}/integrations.md`,
  `# Integration inventory — ${ORIGIN}\n\n` +
    `Detected from markup. **Detect first, ask second** — stacks.md §1b.\n\n` +
    `Every line below becomes a roadmap line that ends in a verified state or an explicit\n` +
    `drop with a date. No third state.\n\n` +
    `## Roadmap lines\n\n` +
    (ids.length || vendors.length
      ? [
          ...ids.map((id) => `- [ ] ${id.startsWith('GTM') ? 'Tag Manager' : id.startsWith('AW') ? 'Google Ads' : id.startsWith('UA') ? 'Universal Analytics (dead — do not port)' : 'GA4'} · \`${id}\` · not ported · ⚠ confirm the client owns this account`),
          ...vendors.map((v) => `- [ ] ${v} · detected in markup · not ported · ⚠ owner unknown`),
        ].join('\n') + '\n\n'
      : '_Nothing detected in the sampled pages._\n\n') +
    `## Third-party origins\n\n` +
    (origins.length ? origins.map((o) => `- \`${o}\``).join('\n') + '\n\n' : '_None._\n\n') +
    `## Where forms post\n\n` +
    (formActions.length ? formActions.map((a) => `- \`${a}\``).join('\n') + '\n\n' : '_No forms in the sampled pages._\n\n') +
    `## Ask the client — markup cannot answer these\n\n` +
    `1. **Who owns the account** — the client, a previous agency, or someone unreachable?\n` +
    `   An unreachable owner on a GA4 property or a registrar blocks go-live, not launch day.\n` +
    `2. **Does it need to keep working**, or was it inherited and forgotten?\n` +
    `3. **Where does its data live**, and does anything need exporting before the old site dies?\n\n` +
    `The list of what was **deliberately dropped** matters as much as what was carried — it is\n` +
    `the difference between a decision and an omission.\n`,
);
console.log(`\n  ${GREEN}✓${RESET} ${OUT}/integrations.md`);

/* ── What this cannot see ─────────────────────────────────────────────── */
console.log(`\n${BOLD}── What this cannot see ${'─'.repeat(34)}${RESET}`);
for (const line of [
  'Anything injected by JavaScript after load — including most GTM tags',
  'Anything behind a login, a paywall or a members area',
  'Pages in neither the sitemap nor the Wayback Machine',
  'Whether a detected vendor is still in use, or just left in the theme',
  ...notes,
]) {
  console.log(`  ${DIM}·${RESET} ${DIM}${line}${RESET}`);
}

console.log(
  `\n${GREEN}✓${RESET} inventory written to ${OUT}/ — ${all.length} URL(s), ` +
    `${present.length} preserved path(s), ${ids.length + vendors.length} integration(s)\n` +
    `${DIM}  Next: the redirect map in public/_redirects, then stacks.md §1b's three questions.${RESET}\n`,
);
