/**
 * What changed on the OLD site since the last time you looked.
 *
 *   npm run changes -- https://old-site.com     # capture now, compare with the last capture
 *   npm run changes                             # the origin recon/urls.txt was taken from
 *   npm run changes -- https://old-site.com --json
 *
 * Keeps two captures, recon/changes/previous.json and recon/changes/latest.json,
 * and writes the difference to recon/changes.md. The first run only records a
 * baseline. Exit 0 with a report, 1 when there is nothing it could capture.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * A migration takes weeks, and the client does not stop editing WordPress
 * because a rebuild has started. A price changes, a service page is added, a
 * post is renamed, a page is deleted — and the rebuild launches with the copy
 * from the day `recon` ran. Nobody reports it: the client assumes the new site
 * has "the website" in it, and the builder never looked again. It surfaces as
 * a phone call after cutover about a page that was "definitely on the site".
 *
 * Run it weekly between recon and go-live, and once more the day before.
 *
 * ── WHAT IT READS ──────────────────────────────────────────────────────────
 *   the sitemap(s)     every URL and its <lastmod>. Works on any platform;
 *                      a path that appears or vanishes is new or deleted, a
 *                      moved <lastmod> is an edit
 *   /wp-json/wp/v2/*   WordPress's public REST API, when the site leaves it
 *                      open (most do): every page, post and public custom
 *                      type by ID with its modified date — which is what makes
 *                      a MOVE visible as a move, rather than as one page
 *                      deleted and an unrelated one added — plus the media
 *                      library's size and replaced files
 *   the home page nav  the links inside its <nav> elements, which is the
 *                      menu as a visitor sees it. WordPress's menu endpoints
 *                      need a login, so this is the public equivalent
 *
 * ── REPORTED, NEVER APPLIED ────────────────────────────────────────────────
 * Nothing here edits src/, public/_redirects or recon/urls.txt. A page deleted
 * on the old site may be a mistake, a seasonal page, or the client's decision
 * — the rebuild keeping it is a conversation, not a sync. A moved page gets a
 * proposed `_redirects` line to copy, for the same reason `redirects` only
 * proposes: a wrong 301 looks like it works.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

import { blockedReason } from './lib/hosts.mjs';
import { readInventory } from './lib/inventory.mjs';

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

const argv = process.argv.slice(2);
const json = argv.includes('--json');
const allowInternal = argv.includes('--allow-internal');
const DIR = 'recon/changes';
const REPORT = 'recon/changes.md';
const LATEST = `${DIR}/latest.json`;
const PREVIOUS = `${DIR}/previous.json`;

/* Progress goes to stderr under --json, so stdout stays one parseable object. */
const say = (...a) => (json ? console.error(...a) : console.log(...a));

const inventory = readInventory(readFileSync);
const target = argv.find((a) => !a.startsWith('--')) ?? inventory?.origin;

if (!target) {
  console.error(
    'usage: npm run changes -- https://old-site.com [--json] [--allow-internal]\n' +
      '  (with no URL it uses the origin recon/urls.txt was taken from, and there is none yet)',
  );
  process.exit(1);
}

const ORIGIN = (/^[a-z][a-z0-9+.-]*:/i.test(target) ? target : `https://${target}`).replace(/\/$/, '');
const refusal = blockedReason(ORIGIN, { allowInternal });
if (refusal) {
  console.error(`${RED}✗ ${refusal.reason}${RESET}\n  changes reads the OLD live site. --allow-internal if that host really is yours.`);
  process.exit(1);
}

/* ── Fetching — the old site is someone's live site, so gently ──────────── */

async function get(url) {
  if (blockedReason(url, { allowInternal })) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    return await fetch(url, { signal: controller.signal, headers: { accept: '*/*' } });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
const text = async (url) => {
  const r = await get(url);
  return r?.ok ? r.text() : '';
};
async function pool(items, worker, limit = 4) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const n = i++;
        out[n] = await worker(items[n]);
      }
    }),
  );
  return out;
}
const pathOf = (u) => {
  try {
    return new URL(u, `${ORIGIN}/`).pathname;
  } catch {
    return null;
  }
};

/* ── 1. Sitemaps: every URL with its lastmod ─────────────────────────────── */

async function captureSitemap() {
  const robots = await text(`${ORIGIN}/robots.txt`);
  const declared = [...robots.matchAll(/^\s*Sitemap:\s*(\S+)/gim)].map((m) => m[1]);
  const roots = declared.length
    ? declared
    : ['/sitemap_index.xml', '/sitemap-index.xml', '/wp-sitemap.xml', '/sitemap.xml'].map((p) => ORIGIN + p);
  const out = {};
  const seen = new Set();
  const walk = async (url) => {
    if (seen.has(url) || seen.size > 200) return;
    seen.add(url);
    const xml = await text(url);
    if (!xml) return;
    const entries = [...xml.matchAll(/<(url|sitemap)>([\s\S]*?)<\/\1>/g)].map((m) => ({
      kind: m[1],
      loc: /<loc>\s*([^<\s]+)\s*<\/loc>/.exec(m[2])?.[1]?.replace(/&amp;/g, '&'),
      lastmod: /<lastmod>\s*([^<\s]+)\s*<\/lastmod>/.exec(m[2])?.[1] ?? '',
    }));
    for (const e of entries.filter((x) => x.kind === 'url' && x.loc)) {
      const p = pathOf(e.loc);
      if (p) out[p] = e.lastmod;
    }
    await pool(entries.filter((x) => x.kind === 'sitemap' && x.loc).map((x) => x.loc), walk);
  };
  for (const root of roots) {
    await walk(root);
    /* Probed names are alternatives, not a set: stop at the first that answers. */
    if (!declared.length && Object.keys(out).length) break;
  }
  return out;
}

/* ── 2. WordPress, when its REST API is public ───────────────────────────── */

/* Types that are not pages a visitor reads. `wp_*` covers blocks, templates,
   navigation, global styles and fonts. */
const NOT_CONTENT = /^(?:attachment|nav_menu_item|wp_.*|elementor_library|e-landing-page|ct_template|bricks_template|fl-builder-template|et_pb_layout|oembed_cache|user_request|custom_css|customize_changeset)$/;
const MAX_PAGES = 30; // × 100 per type — 3,000 entries is a big marketing site

async function listAll(base, fields) {
  const items = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = await get(`${base}${base.includes('?') ? '&' : '?'}per_page=100&page=${page}&_fields=${fields}`);
    if (!r?.ok) return page === 1 ? null : items;
    let batch;
    try {
      batch = await r.json();
    } catch {
      return page === 1 ? null : items;
    }
    if (!Array.isArray(batch)) return page === 1 ? null : items;
    items.push(...batch);
    const total = Number(r.headers.get('x-wp-totalpages') ?? 0);
    if (batch.length < 100 || (total && page >= total)) break;
  }
  return items;
}

async function captureWordPress() {
  const r = await get(`${ORIGIN}/wp-json/wp/v2/types`);
  let types;
  try {
    types = r?.ok ? await r.json() : null;
  } catch {
    types = null;
  }
  if (!types || typeof types !== 'object' || Array.isArray(types)) return null;

  const content = {};
  for (const [slug, t] of Object.entries(types)) {
    if (NOT_CONTENT.test(slug) || !t?.rest_base) continue;
    const ns = t.rest_namespace || 'wp/v2';
    const list = await listAll(`${ORIGIN}/wp-json/${ns}/${t.rest_base}`, 'id,link,modified_gmt,status,title');
    if (!list) continue; // a type the API will not list without a login
    for (const it of list) {
      const path = pathOf(it.link ?? '');
      if (!path || typeof it.id !== 'number') continue;
      content[`${slug}:${it.id}`] = {
        type: slug,
        path,
        title: String(it.title?.rendered ?? it.title ?? '').replace(/<[^>]+>/g, '').slice(0, 120),
        modified: it.modified_gmt ?? '',
        status: it.status ?? '',
      };
    }
  }
  const media = {};
  for (const m of (await listAll(`${ORIGIN}/wp-json/wp/v2/media`, 'id,source_url,modified_gmt')) ?? []) {
    if (typeof m.id === 'number') media[m.id] = `${pathOf(m.source_url ?? '') ?? ''}|${m.modified_gmt ?? ''}`;
  }
  return { content, media };
}

/* ── 3. The menu, as the home page renders it ────────────────────────────── */

async function captureNav() {
  const html = await text(`${ORIGIN}/`);
  const links = new Set();
  for (const nav of html.matchAll(/<nav\b[^>]*>([\s\S]*?)<\/nav>/gi)) {
    for (const a of nav[1].matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const label = a[2].replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#?\w+;/g, ' ').replace(/\s+/g, ' ').trim();
      const href = a[1].startsWith('#') ? a[1] : (pathOf(a[1]) ?? a[1]);
      if (label) links.add(`${label} → ${href}`);
    }
  }
  return [...links];
}

/* ── Capture ─────────────────────────────────────────────────────────────── */

say(`${BOLD}── Changes on ${ORIGIN} ${'─'.repeat(Math.max(0, 44 - ORIGIN.length))}${RESET}`);
const [sitemap, wp, nav] = await Promise.all([captureSitemap(), captureWordPress(), captureNav()]);
const capture = { version: 1, origin: ORIGIN, capturedAt: new Date().toISOString(), sitemap, wp, nav };

const counts = `${Object.keys(sitemap).length} sitemap URL(s)` +
  (wp ? `, ${Object.keys(wp.content).length} WordPress entr${Object.keys(wp.content).length === 1 ? 'y' : 'ies'}, ${Object.keys(wp.media).length} media file(s)` : '') +
  `, ${nav.length} menu link(s)`;

if (!Object.keys(sitemap).length && !wp && !nav.length) {
  console.error(
    `${RED}✗${RESET} nothing to capture from ${ORIGIN}: no sitemap, no public WordPress REST API and no <nav> on the home page.\n` +
      '  Check the URL. Nothing was written, and the previous capture is untouched.',
  );
  process.exit(1);
}

mkdirSync(DIR, { recursive: true });
const before = existsSync(LATEST) ? JSON.parse(readFileSync(LATEST, 'utf8')) : null;
if (before) renameSync(LATEST, PREVIOUS);
writeFileSync(LATEST, JSON.stringify(capture, null, 2) + '\n');

say(`  ${DIM}${counts}${RESET}`);
if (!wp) {
  say(
    `  ${YELLOW}!${RESET} no public WordPress REST API — edits come from sitemap <lastmod> only, and a moved\n` +
      `    page shows as one deleted and one new`,
  );
}

if (!before) {
  if (json) console.log(JSON.stringify({ baseline: true, capturedAt: capture.capturedAt, origin: ORIGIN }));
  say(`\n${GREEN}✓${RESET} baseline captured → ${LATEST}\n  ${DIM}Run it again later — weekly until go-live — to see what the client changed.${RESET}\n`);
  process.exit(0);
}

const host = (o) => new URL(o).hostname.replace(/^www\./, '');
if (host(before.origin) !== host(ORIGIN)) {
  say(`  ${YELLOW}!${RESET} the previous capture was of ${before.origin} — comparing paths anyway`);
}

/* ── Compare ─────────────────────────────────────────────────────────────── */

const added = [];
const edited = [];
const moved = [];
const deleted = [];

const label = (e) => `${e.path}${e.title ? `  "${e.title}"` : ''}${e.type && e.type !== 'page' ? `  [${e.type}]` : ''}`;

/* WordPress entries by ID, when both captures have them. */
const wpPaths = new Set();
if (before.wp && wp) {
  for (const [id, e] of Object.entries(wp.content)) {
    wpPaths.add(e.path);
    const old = before.wp.content[id];
    if (!old) added.push({ ...e, how: 'wordpress' });
    else {
      if (old.path !== e.path) moved.push({ ...e, from: old.path });
      if (old.modified !== e.modified) edited.push({ ...e, how: 'modified' });
    }
  }
  for (const [id, e] of Object.entries(before.wp.content)) {
    wpPaths.add(e.path);
    if (!wp.content[id]) deleted.push(e);
  }
}

/* Everything the sitemap knows that WordPress did not already explain —
   taxonomy archives, a non-WordPress site, or a site whose API is closed. */
for (const [path, lastmod] of Object.entries(sitemap)) {
  if (wpPaths.has(path)) continue;
  if (!(path in before.sitemap)) added.push({ path, how: 'sitemap' });
  else if (lastmod && before.sitemap[path] && lastmod !== before.sitemap[path]) edited.push({ path, how: 'lastmod' });
}
for (const path of Object.keys(before.sitemap)) {
  if (!wpPaths.has(path) && !(path in sitemap)) deleted.push({ path });
}

const navAdded = nav.filter((l) => !before.nav.includes(l));
const navRemoved = before.nav.filter((l) => !nav.includes(l));

let media = null;
if (before.wp && wp) {
  const m = { before: Object.keys(before.wp.media).length, after: Object.keys(wp.media).length, added: 0, removed: 0, replaced: 0 };
  for (const [id, v] of Object.entries(wp.media)) {
    if (!(id in before.wp.media)) m.added++;
    else if (before.wp.media[id] !== v) m.replaced++;
  }
  for (const id of Object.keys(before.wp.media)) if (!(id in wp.media)) m.removed++;
  if (m.added || m.removed || m.replaced) media = m;
}

/* New pages the inventory does not hold are pages verify and redirects will
   never check — the inventory is what every later step reads. */
const known = new Set([...(inventory?.live ?? []), ...(inventory?.gone ?? [])]);
const notInInventory = inventory ? added.filter((a) => !known.has(a.path)).map((a) => a.path) : [];

const total = added.length + edited.length + moved.length + deleted.length + navAdded.length + navRemoved.length + (media ? 1 : 0);
const sort = (l) => l.sort((a, b) => a.path.localeCompare(b.path));
[added, edited, moved, deleted].forEach(sort);

if (json) {
  console.log(
    JSON.stringify(
      { from: before.capturedAt, to: capture.capturedAt, origin: ORIGIN, total, added, edited, moved, deleted, menu: { added: navAdded, removed: navRemoved }, media, notInInventory },
      null,
      2,
    ),
  );
}

/* ── Report ──────────────────────────────────────────────────────────────── */

const span = `${before.capturedAt.slice(0, 16).replace('T', ' ')} → ${capture.capturedAt.slice(0, 16).replace('T', ' ')} UTC`;
const md = [`# Changes on ${ORIGIN}`, '', `${span}. Reported, never applied — every line is a decision for a person.`, ''];
const group = (title, list, line, advice) => {
  if (!list.length) return;
  say(`\n  ${BOLD}${title}${RESET} (${list.length})`);
  for (const x of list.slice(0, 20)) say(`    ${line(x)}`);
  if (list.length > 20) say(`    ${DIM}… ${list.length - 20} more in ${REPORT}${RESET}`);
  md.push(`## ${title} (${list.length})`, '', advice, '', ...list.map((x) => `- ${line(x)}`), '');
};

say(`  ${DIM}${span}${RESET}`);
if (!total) {
  say(`\n${GREEN}✓${RESET} no changes since the previous capture`);
  md.push('No changes.', '');
}

group('New', added, label, 'Not in the rebuild yet. Build or deliberately leave out each one — and re-run `npm run recon` so the inventory holds it.');
group('Edited', edited, (e) => `${label(e)}${e.how === 'lastmod' ? '  (sitemap lastmod)' : ''}`, 'The copy in the rebuild is from before this edit. Re-read the live page and carry the change across.');
group('Moved', moved, (e) => `${e.from} → ${e.path}${e.title ? `  "${e.title}"` : ''}`, 'Both addresses now need to resolve on the new site. Proposed `public/_redirects` lines are below — copy the ones you agree with.');
group('Deleted on the old site', deleted, label, 'Kept in the rebuild until someone decides otherwise. Ask whether it was deliberate; if the page goes, its URL still needs a redirect or an honest 404.');
group('Menu: links added', navAdded, (l) => l, 'The old site’s menu (the links inside <nav> on its home page) gained these.');
group('Menu: links removed', navRemoved, (l) => l, 'The old site’s menu lost these.');

if (media) {
  const line = `${media.before} → ${media.after} file(s): ${media.added} new, ${media.replaced} replaced, ${media.removed} removed`;
  say(`\n  ${BOLD}Media library${RESET}\n    ${line}`);
  md.push('## Media library', '', line, '', 'A replaced file keeps its ID and changes its file or date — the rebuild may still carry the old image.', '');
}

if (moved.length) {
  const lines = moved.map((m) => `${m.from.padEnd(40)} ${m.path.padEnd(40)} 301`);
  say(`\n  ${DIM}proposed for public/_redirects — not written:${RESET}`);
  for (const l of lines) say(`    ${l}`);
  md.push('## Proposed redirects — not applied', '', '```', ...lines, '```', '');
}

if (notInInventory.length) {
  say(`\n  ${YELLOW}!${RESET} ${notInInventory.length} new page(s) are not in recon/urls.txt — re-run recon, or redirects and verify never check them`);
  md.push('## Not in recon/urls.txt', '', ...notInInventory.map((p) => `- ${p}`), '');
}

writeFileSync(REPORT, md.join('\n'));
say(`\n${total ? `${YELLOW}!${RESET} ${total} change(s)` : `${GREEN}✓${RESET} nothing changed`} — ${REPORT}\n  ${DIM}Nothing in src/, public/_redirects or recon/urls.txt was touched.${RESET}\n`);
