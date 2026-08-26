/**
 * Console errors and failed requests, on the DEPLOYED site.
 *
 *   npm run console                                # every route, localhost:8788
 *   npm run console -- https://new.example.com     # a deployed host
 *   npm run console -- --only=/contact/            # one route, substring match
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * `build.md` §7 has carried this as a definition-of-done row from the start —
 * *"zero console errors and zero failed requests on the deployed site"* — and
 * the row says why nothing else can do it: **a blocked third-party script or a
 * 404 asset is invisible to a status-code check.** The page returns 200. The
 * HTML is correct. Something inside it failed after the response was complete.
 *
 * `npm run verify` deliberately uses only `fetch`, so it can never see this.
 * That is the gap this closes, and it is why this is a separate script rather
 * than another section there.
 *
 * ── WHAT COUNTS AS A FAILURE ───────────────────────────────────────────────
 * Console *errors* and *failed requests* fail the run. Warnings are printed and
 * do not, because third-party embeds produce warnings constantly and a check
 * that goes red on someone else's deprecation notice gets switched off.
 */

import puppeteer from 'puppeteer';

import { discoverRoutes } from './lib/routes.mjs';

const RESET = '[0m';
const RED = '[31m';
const GREEN = '[32m';
const YELLOW = '[33m';
const DIM = '[2m';
const BOLD = '[1m';

const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith('--only=')) ?? '').replace('--only=', '');
const host = args.find((a) => !a.startsWith('--'));
const BASE = (host ?? process.env.PUBLIC_SITE_URL ?? 'http://localhost:8788').replace(/\/$/, '');

const { routes: discovered, source } = await discoverRoutes(BASE);
const ROUTES = discovered
  .map((url) => new URL(url).pathname)
  .filter((r) => !only || only.split(',').some((f) => r.includes(f.trim())));

if (!ROUTES.length) {
  console.error(
    `No routes for ${BASE}.\n  Build first (\`npm run build:staging\`), or pass a host that serves a sitemap.`,
  );
  process.exit(1);
}

console.log(`${BOLD}── Console and network ${'─'.repeat(36)}${RESET}`);
console.log(`  ${DIM}${ROUTES.length} route(s) from ${source}, against ${BASE}${RESET}\n`);

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const findings = [];
let warnings = 0;

try {
  for (const route of ROUTES) {
    const page = await browser.newPage();
    const errors = [];
    const failed = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text().slice(0, 200));
      else if (msg.type() === 'warning') warnings++;
    });
    page.on('pageerror', (err) => errors.push(`uncaught: ${String(err).slice(0, 200)}`));
    page.on('requestfailed', (req) => {
      /* An aborted request is usually the navigation itself being replaced, not
         a broken asset. Only report what actually could not be retrieved. */
      const reason = req.failure()?.errorText ?? '';
      if (/ERR_ABORTED/.test(reason)) return;
      failed.push(`${reason}  ${req.url()}`);
    });
    page.on('response', (res) => {
      if (res.status() >= 400) failed.push(`${res.status()}  ${res.url()}`);
    });

    try {
      await page.goto(BASE + route, { waitUntil: 'networkidle0', timeout: 45000 });
    } catch (e) {
      errors.push(`navigation: ${e.name}`);
    }

    if (errors.length || failed.length) {
      findings.push({ route, errors, failed });
      console.log(`  ${RED}✗${RESET} ${route}`);
      for (const e of errors) console.log(`      ${DIM}console  ${e}${RESET}`);
      for (const f of failed) {
        /* Browsers request /favicon.ico on their own when no icon is declared.
           No markup causes it, so say what it actually means rather than
           leaving someone hunting for the reference. */
        const hint = /\/favicon\.ico$/.test(f)
          ? '  ← the browser asks for this by itself; declare `icons` in src/data/site.ts'
          : '';
        console.log(`      ${DIM}request  ${f}${hint}${RESET}`);
      }
    } else {
      console.log(`  ${GREEN}✓${RESET} ${route}`);
    }

    await page.close();
  }
} finally {
  await browser.close();
}

if (warnings) {
  console.log(`\n  ${YELLOW}!${RESET} ${warnings} console warning(s) — printed, not failed.`);
  console.log(
    `  ${DIM}Third-party embeds warn constantly. A check that goes red on someone else's\n` +
      `  deprecation notice is a check that gets switched off.${RESET}`,
  );
}

console.log(
  findings.length
    ? `\n${RED}✗ ${findings.length} route(s) with errors or failed requests${RESET}\n`
    : `\n${GREEN}✓ no console errors and no failed requests across ${ROUTES.length} route(s)${RESET}\n`,
);

process.exit(findings.length ? 1 : 0);
