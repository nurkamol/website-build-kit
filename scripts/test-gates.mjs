/**
 * Prove the gates can still fail.
 *
 *   npm run test:gates
 *
 * ── THE FAILURE THIS EXISTS FOR ────────────────────────────────────────────
 * The kit is gates. Eighteen template scripts exit non-zero to stop a bad
 * build, and until this file there was nothing checking that any of them still
 * does. Three have shipped broken:
 *
 *   recon.mjs      ReferenceError on line 302, after the whole crawl. Found by
 *                  a user, on Windows. `node --check` parses it happily.
 *   check-env.mjs  its regex still said example.com on a client project, so it
 *                  matched nothing and passed EVERY deploy for the whole build
 *   tells.mjs      counted dist CSS as well as source, so one rule counted
 *                  three times and a `> 2` threshold could never be cleared
 *
 * ⚠ A GATE THAT ALWAYS PASSES IS WORSE THAN NO GATE, because it reads as a
 *   check that ran. Every case below therefore asserts BOTH directions — the
 *   clean fixture exits 0, and a fixture with the failure deliberately present
 *   exits 1. The second half is the one that matters; the first only proves the
 *   script runs.
 *
 * Fixtures are written to a temp directory at run time rather than committed.
 * A committed fixture tree of `site.ts`, `wrangler.jsonc` and `dist/` files
 * inside this repo is indistinguishable from real config to every other sweep
 * we run over it, and the assertion reads better next to the input it asserts on.
 *
 * ── WHAT THIS DOES NOT COVER, AND WHY ──────────────────────────────────────
 * `verify`, `recon`, `shots`, `console`, `reflow`, `a11y` and `dns` all need a
 * deployed site or a live zone. Faking one is more fixture than the test is
 * worth, and a stub convincing enough to exercise them would need maintaining
 * more carefully than the scripts do. They stay covered by running them.
 *
 * `audit:docs` and `check:refs` read this whole repository, so a fixture for
 * them means a fake repository. They are also the two gates that run on every
 * commit, which is its own kind of coverage.
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE_SCRIPTS = join(KIT, 'template', 'scripts');

const results = [];
let currentGate = null;

/** Write `{ 'rel/path': 'contents' }` into a fresh temp directory. */
function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'kit-gate-'));
  for (const [rel, body] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
  return dir;
}

/**
 * Run a template gate inside a fixture and assert its exit code.
 *
 * `expect` is the whole assertion: 0 means the gate must pass on this input,
 * 1 means it must refuse. `contains` additionally pins the reason, so a gate
 * that fails for an unrelated reason is not counted as catching the bug.
 */
function gate(label, { script, files, env = {}, args = [], expect, contains }) {
  const dir = fixture(files);
  try {
    const run = spawnSync(process.execPath, [join(TEMPLATE_SCRIPTS, script), ...args], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, ...env },
    });
    const out = `${run.stdout ?? ''}${run.stderr ?? ''}`;
    const codeOk = run.status === expect;
    const textOk = !contains || out.includes(contains);
    results.push({
      gate: currentGate,
      label,
      ok: codeOk && textOk,
      detail: !codeOk
        ? `exit ${run.status}, wanted ${expect}`
        : !textOk
          ? `exit ${expect} but did not mention ${JSON.stringify(contains)}`
          : `exit ${expect}`,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function describe(name) {
  currentGate = name;
}

/* ────────────────────────────────────────────────────────────────────────
 * check-env — the guard that spent a whole project matching nothing
 * ──────────────────────────────────────────────────────────────────────── */

const siteTs = (hosts) =>
  `export const PRODUCTION_HOSTS = [${hosts.map((h) => `'${h}'`).join(', ')}] as const;\n`;
const wrangler = (patterns) =>
  JSON.stringify({ routes: patterns.map((p) => ({ pattern: p })) }, null, 2);

const PROD = ['example.com', 'www.example.com'];

describe('check-env');

gate('staging build, staging-only route', {
  script: 'check-env.mjs',
  files: { 'src/data/site.ts': siteTs(PROD), 'wrangler.jsonc': wrangler(['new.example.com']) },
  env: { PUBLIC_SITE_ENV: 'staging' },
  expect: 0,
});

gate('production build, staging-only route — must refuse', {
  script: 'check-env.mjs',
  files: { 'src/data/site.ts': siteTs(PROD), 'wrangler.jsonc': wrangler(['new.example.com']) },
  env: { PUBLIC_SITE_ENV: 'production' },
  expect: 1,
  contains: 'only routes',
});

gate('production build, production routes with a path', {
  script: 'check-env.mjs',
  files: {
    'src/data/site.ts': siteTs(PROD),
    'wrangler.jsonc': wrangler(['example.com/*', 'www.example.com/*']),
  },
  env: { PUBLIC_SITE_ENV: 'production' },
  expect: 0,
});

gate('staging build, production routes — must refuse', {
  script: 'check-env.mjs',
  files: { 'src/data/site.ts': siteTs(PROD), 'wrangler.jsonc': wrangler(['example.com/*']) },
  env: { PUBLIC_SITE_ENV: 'staging' },
  expect: 1,
  contains: 'PRODUCTION domain',
});

gate('new.example.com does NOT count as production', {
  script: 'check-env.mjs',
  files: { 'src/data/site.ts': siteTs(PROD), 'wrangler.jsonc': wrangler(['new.example.com']) },
  env: { PUBLIC_SITE_ENV: 'production' },
  expect: 1,
});

gate('PRODUCTION_HOSTS missing — refuses, does not pass', {
  script: 'check-env.mjs',
  files: { 'src/data/site.ts': 'export const SOMETHING_ELSE = 1;\n', 'wrangler.jsonc': wrangler([]) },
  env: { PUBLIC_SITE_ENV: 'staging' },
  expect: 1,
  contains: 'cannot read PRODUCTION_HOSTS',
});

gate('PRODUCTION_HOSTS empty — refuses, does not pass', {
  script: 'check-env.mjs',
  files: { 'src/data/site.ts': siteTs([]), 'wrangler.jsonc': wrangler([]) },
  env: { PUBLIC_SITE_ENV: 'staging' },
  expect: 1,
  contains: 'is empty',
});

gate('site.ts absent — refuses legibly, no ENOENT stack', {
  script: 'check-env.mjs',
  files: { 'wrangler.jsonc': wrangler([]) },
  env: { PUBLIC_SITE_ENV: 'staging' },
  expect: 1,
  contains: 'not found',
});

/* ────────────────────────────────────────────────────────────────────────
 * check-secrets — needs `wrangler`, so it gets a stub on PATH
 * ──────────────────────────────────────────────────────────────────────── */

const EXAMPLE = 'BREVO_API_KEY="xkeysib-..."\nLEADS_EXPORT_TOKEN="a long random string"\n';

/**
 * A fake `npx` on PATH, so the comparison logic is tested without a network,
 * an account, or a deployed worker. Cannot work on Windows, where npx is
 * npx.cmd and PATH shims behave differently — those cases are skipped and said
 * to be skipped rather than silently counted as passing.
 */
function npxStub(body) {
  const dir = mkdtempSync(join(tmpdir(), 'kit-npx-'));
  const path = join(dir, 'npx');
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
  return dir;
}

describe('check-secrets');

if (process.platform === 'win32') {
  results.push({
    gate: 'check-secrets',
    label: 'stubbed wrangler cases',
    ok: true,
    skipped: true,
    detail: 'skipped on Windows — npx is npx.cmd and a PATH shim will not stand in',
  });
} else {
  const bothSet = npxStub(`echo '[{"name":"BREVO_API_KEY"},{"name":"LEADS_EXPORT_TOKEN"}]'`);
  const oneSet = npxStub(`echo '[{"name":"LEADS_EXPORT_TOKEN"}]'`);
  const notDeployed = npxStub(`echo "workers.api.error.script_not_found" >&2; exit 1`);
  const loggedOut = npxStub(`echo "You are not authenticated. Run wrangler login." >&2; exit 1`);

  gate('every declared secret is set', {
    script: 'check-secrets.mjs',
    files: { '.dev.vars.example': EXAMPLE },
    env: { PATH: `${bothSet}:${process.env.PATH}` },
    expect: 0,
  });

  gate('one secret missing — must refuse', {
    script: 'check-secrets.mjs',
    files: { '.dev.vars.example': EXAMPLE },
    env: { PATH: `${oneSet}:${process.env.PATH}` },
    expect: 1,
    contains: 'BREVO_API_KEY',
  });

  gate('worker not deployed — nothing to check, not everything missing', {
    script: 'check-secrets.mjs',
    files: { '.dev.vars.example': EXAMPLE },
    env: { PATH: `${notDeployed}:${process.env.PATH}` },
    expect: 0,
    contains: 'not deployed yet',
  });

  gate('logged out — refuses rather than assume the secrets are fine', {
    script: 'check-secrets.mjs',
    files: { '.dev.vars.example': EXAMPLE },
    env: { PATH: `${loggedOut}:${process.env.PATH}` },
    expect: 1,
    contains: 'could not read',
  });

  gate('.dev.vars.example absent — refuses', {
    script: 'check-secrets.mjs',
    files: { 'placeholder.txt': '' },
    env: { PATH: `${bothSet}:${process.env.PATH}` },
    expect: 1,
    contains: 'not found',
  });

  for (const d of [bothSet, oneSet, notDeployed, loggedOut]) {
    rmSync(d, { recursive: true, force: true });
  }
}

/* ────────────────────────────────────────────────────────────────────────
 * check-sitemap — a URL both listed and noindex
 * ──────────────────────────────────────────────────────────────────────── */

const sitemapXml = (paths) =>
  `<?xml version="1.0" encoding="UTF-8"?><urlset>${paths
    .map((p) => `<url><loc>https://example.com${p}</loc></url>`)
    .join('')}</urlset>`;

const page = (robots) =>
  `<!doctype html><html><head>${
    robots ? `<meta name="robots" content="${robots}">` : ''
  }</head><body><p>hello</p></body></html>`;

describe('check-sitemap');

gate('no dist — refuses', {
  script: 'check-sitemap.mjs',
  files: { 'placeholder.txt': '' },
  expect: 1,
  contains: 'no dist',
});

gate('no sitemap — staging build, nothing to check', {
  script: 'check-sitemap.mjs',
  files: { 'dist/client/index.html': page(null) },
  expect: 0,
});

gate('sitemap and noindex agree', {
  script: 'check-sitemap.mjs',
  files: {
    'dist/client/sitemap-0.xml': sitemapXml(['/', '/about/']),
    'dist/client/index.html': page(null),
    'dist/client/about/index.html': page(null),
  },
  expect: 0,
});

gate('a listed URL serving noindex — must refuse', {
  script: 'check-sitemap.mjs',
  files: {
    'dist/client/sitemap-0.xml': sitemapXml(['/', '/about/']),
    'dist/client/index.html': page(null),
    'dist/client/about/index.html': page('noindex, nofollow'),
  },
  expect: 1,
  contains: '/about/',
});

gate('the word "noindex" in prose is NOT a noindex page', {
  script: 'check-sitemap.mjs',
  files: {
    'dist/client/sitemap-0.xml': sitemapXml(['/accessibility/']),
    'dist/client/accessibility/index.html':
      '<!doctype html><html><head></head><body><p>We use noindex on staging.</p></body></html>',
  },
  expect: 0,
});

/* ────────────────────────────────────────────────────────────────────────
 * tells --undecided-only — the half-decided template
 * ──────────────────────────────────────────────────────────────────────── */

describe('tells --undecided-only');

const FRESH = {
  'src/styles/tokens.css': ':root { --unset: red; }\n',
  'src/pages/index.astro': '---\nconst unbuilt = true;\n---\n<p>scaffold</p>\n',
};

gate('fresh template — all three placeholders, allowed', {
  script: 'tells.mjs',
  args: ['--undecided-only'],
  files: FRESH,
  expect: 0,
  contains: 'fresh template',
});

gate('fully decided — no placeholders, allowed', {
  script: 'tells.mjs',
  args: ['--undecided-only'],
  files: {
    'src/styles/tokens.css': ':root { --brand-600: #123456; }\n',
    'src/styles/fonts.css': "@font-face { font-family: 'Real'; src: url(a.woff2); }\n",
    'src/pages/index.astro': '---\nconst title = "Real";\n---\n<h1>{title}</h1>\n',
  },
  expect: 0,
  contains: 'all real',
});

gate('half-decided — brand set, no typeface — must refuse', {
  script: 'tells.mjs',
  args: ['--undecided-only'],
  files: {
    'src/styles/tokens.css': ':root { --brand-600: #123456; }\n',
    'src/pages/index.astro': '---\nconst title = "Real";\n---\n<h1>{title}</h1>\n',
  },
  expect: 1,
  contains: 'half-decided',
});

/* ────────────────────────────────────────────────────────────────────────
 * Report
 * ──────────────────────────────────────────────────────────────────────── */

console.log(`\n${BOLD}── Gates, in both directions ──────────────────────────────${RESET}`);

let lastGate = null;
for (const r of results) {
  if (r.gate !== lastGate) {
    console.log(`\n  ${DIM}${r.gate}${RESET}`);
    lastGate = r.gate;
  }
  const mark = r.skipped ? `${DIM}·${RESET}` : r.ok ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
  console.log(`    ${mark} ${r.label}`);
  if (!r.ok || r.skipped) console.log(`      ${DIM}${r.detail}${RESET}`);
}

const failed = results.filter((r) => !r.ok);
const skipped = results.filter((r) => r.skipped);
const refusals = results.filter((r) => r.ok && !r.skipped && r.detail === 'exit 1').length;

console.log('');
if (failed.length) {
  console.error(
    `${RED}✗ ${failed.length} of ${results.length} case(s) failed${RESET}\n\n` +
      '  A case that wanted exit 1 and got 0 is the serious one: that gate is\n' +
      '  inert, and every build it has passed since was unchecked.\n',
  );
  process.exit(1);
}

console.log(
  `${GREEN}✓${RESET} ${results.length - skipped.length} case(s) across ` +
    `${new Set(results.map((r) => r.gate)).size} gate(s) — ` +
    `${DIM}${refusals} of them proving a gate still refuses${RESET}` +
    (skipped.length ? `\n${DIM}  ${skipped.length} skipped${RESET}` : ''),
);
