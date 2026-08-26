/**
 * Submit URLs to IndexNow — Bing, Yandex, Seznam, Naver.
 *
 *   node scripts/indexnow.mjs                      # every URL in the live sitemap
 *   node scripts/indexnow.mjs /about/ /contact/    # just these routes
 *
 * Run it AFTER a deploy has finished, never before. See the key check below.
 *
 * ── GOOGLE DOES NOT PARTICIPATE ────────────────────────────────────────────
 * It is printed on every run, deliberately. IndexNow is Bing, Yandex, Seznam
 * and Naver; Google has repeatedly declined to join. A green result here is not
 * "submitted to search engines", and reading it that way is how a site goes
 * weeks without anyone checking why Google has not picked something up.
 *
 * For Google, use Search Console — the URL Inspection tool for one page, or a
 * sitemap resubmission for a batch.
 *
 * ── SETUP ──────────────────────────────────────────────────────────────────
 * 1. Invent a key: 8–128 hex characters. `openssl rand -hex 16` is fine.
 * 2. Put it in a file whose NAME is the key: public/<key>.txt, containing the
 *    key and nothing else.
 * 3. Deploy, so the file is live.
 * 4. export INDEXNOW_KEY=<key>
 */

import { readFileSync, existsSync } from 'node:fs';

const RESET = '[0m';
const RED = '[31m';
const GREEN = '[32m';
const YELLOW = '[33m';
const DIM = '[2m';

const key = process.env.INDEXNOW_KEY;
if (!key) {
  console.error(
    `${RED}✗${RESET} INDEXNOW_KEY is not set.\n` +
      '  Invent one with `openssl rand -hex 16`, save it as public/<key>.txt\n' +
      '  containing the key, deploy, then export INDEXNOW_KEY=<key>.',
  );
  process.exit(1);
}
if (!/^[a-fA-F0-9]{8,128}$/.test(key)) {
  console.error(`${RED}✗${RESET} INDEXNOW_KEY must be 8–128 hex characters.`);
  process.exit(1);
}

/* The production host. Read from the same place the build reads it, so this
   cannot be pointed at staging by accident — submitting a noindex staging host
   is a waste at best. */
const SITE = (process.env.PUBLIC_SITE_URL ?? '').replace(/\/$/, '');
if (!SITE || !SITE.startsWith('https://')) {
  console.error(
    `${RED}✗${RESET} PUBLIC_SITE_URL must be the https production origin.\n` +
      '  e.g. PUBLIC_SITE_URL=https://example.com node scripts/indexnow.mjs',
  );
  process.exit(1);
}
const host = new URL(SITE).hostname;

if (!existsSync(`public/${key}.txt`)) {
  console.warn(
    `${YELLOW}!${RESET} public/${key}.txt is not in this repo. It must be, or the\n` +
      '  next deploy removes the key file and every later submission is rejected.',
  );
}

/**
 * ── VERIFY THE KEY FILE IS REACHABLE BEFORE POSTING ────────────────────────
 *
 * IndexNow validates ownership by fetching https://<host>/<key>.txt at the
 * moment of submission. Submit before the deploy carrying that file has
 * finished and the whole batch is rejected with a 403 — and because the API
 * answers 200 for an accepted batch and says nothing else useful, a script that
 * skipped this check would print success for a submission that never happened.
 *
 * A script that reports someone else's success is worse than no script.
 */
const keyUrl = `${SITE}/${key}.txt`;
const probe = await fetch(keyUrl).catch(() => null);
if (!probe?.ok) {
  console.error(
    `${RED}✗${RESET} ${keyUrl} is not reachable (${probe ? probe.status : 'no response'}).\n` +
      '  IndexNow fetches this to verify ownership. Deploy first, then submit.',
  );
  process.exit(1);
}
const served = (await probe.text()).trim();
if (served !== key) {
  console.error(
    `${RED}✗${RESET} ${keyUrl} does not contain the key.\n` +
      `  Served: ${JSON.stringify(served.slice(0, 40))}\n  Expected: ${key}`,
  );
  process.exit(1);
}

/* URLs: either the routes given as arguments, or the live sitemap. */
const args = process.argv.slice(2);
let urls;

if (args.length) {
  urls = args.map((r) => new URL(r, SITE + '/').href);
} else {
  const res = await fetch(`${SITE}/sitemap-index.xml`).catch(() => null);
  const indexXml = res?.ok ? await res.text() : '';
  const maps = [...indexXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const sources = maps.length ? maps : [`${SITE}/sitemap-0.xml`];

  urls = [];
  for (const map of sources) {
    const r = await fetch(map).catch(() => null);
    if (!r?.ok) continue;
    const xml = await r.text();
    urls.push(...[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
  }
  urls = [...new Set(urls)];
}

if (!urls.length) {
  console.error(
    `${RED}✗${RESET} No URLs to submit. The sitemap is empty or unreachable —\n` +
      '  note that staging builds emit no sitemap, deliberately.',
  );
  process.exit(1);
}

/* The API caps a batch at 10,000. Well above any site this kit builds, but a
   silent truncation would read as a full submission. */
if (urls.length > 10000) {
  console.error(`${RED}✗${RESET} ${urls.length} URLs exceeds the 10,000 batch limit.`);
  process.exit(1);
}

const response = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host, key, keyLocation: keyUrl, urlList: urls }),
});

/* 200 accepted, 202 accepted but key still validating. Anything else is a
   refusal and the URLs were NOT submitted. */
if (response.status !== 200 && response.status !== 202) {
  console.error(
    `${RED}✗${RESET} IndexNow refused the batch: ${response.status} ${response.statusText}\n` +
      `  ${(await response.text().catch(() => '')).slice(0, 300)}`,
  );
  process.exit(1);
}

console.log(`${GREEN}✓${RESET} ${urls.length} URL(s) submitted for ${host} (${response.status}).`);
console.log(
  `${DIM}  Bing, Yandex, Seznam and Naver. Google does NOT participate in IndexNow —\n` +
    `  for Google use Search Console: URL Inspection, or resubmit the sitemap.${RESET}`,
);
