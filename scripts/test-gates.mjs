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
 * That list once read as though it covered everything uncovered. It did not:
 * `staging-headers.mjs` is entirely offline, has three refusal paths, and had
 * simply been missed. An exclusion list that does not describe what is actually
 * excluded is the same failure as a gate that does not gate.
 *
 * `audit:docs` and `check:refs` read this whole repository, so a fixture for
 * them means a fake repository. They are also the two gates that run on every
 * commit, which is its own kind of coverage.
 */

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync } from 'node:fs';
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
function gate(label, { script, files, env = {}, args = [], expect, contains, then }) {
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
    /* `then` inspects what the script WROTE. Two of staging-headers' shipped
       bugs — a duplicate `/*` block that dropped the CSP, and a `#` comment
       that became part of the header value — were invisible in the exit code
       and in a casual read of the file. Only an assertion on the result
       catches them. It also receives the output, because `tells` reports a
       per-row verdict while exiting 1 for the total — so the exit code cannot
       tell you WHICH row fired. Returns null when satisfied, else why not. */
    const thenErr = codeOk && textOk && then ? then(dir, out) : null;
    results.push({
      gate: currentGate,
      label,
      ok: codeOk && textOk && !thenErr,
      detail: !codeOk
        ? `exit ${run.status}, wanted ${expect}`
        : !textOk
          ? `exit ${expect} but did not mention ${JSON.stringify(contains)}`
          : thenErr
            ? `exit ${expect}, but ${thenErr}`
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
 * staging-headers — writes X-Robots-Tag into _headers on a NON-production
 * build. Entirely offline, three refusal paths, and two of its own bugs are
 * only visible in the file it leaves behind.
 * ──────────────────────────────────────────────────────────────────────── */

const STAR = '/' + '*';

/** What the adapter plus public/_headers actually leave in dist. */
const headersFile = [
  STAR,
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '  Permissions-Policy: geolocation=(), camera=()',
  "  Content-Security-Policy: default-src 'self'",
  '',
  '/_astro/' + '*',
  '  Cache-Control: public, max-age=31536000, immutable',
  '',
].join('\n');

const readHeaders = (dir, rel = 'dist/client/_headers') =>
  readFileSync(join(dir, rel), 'utf8');

describe('staging-headers');

gate('production build — refuses, and writes NOTHING', {
  script: 'staging-headers.mjs',
  files: { 'dist/client/_headers': headersFile },
  env: { PUBLIC_SITE_ENV: 'production' },
  expect: 1,
  contains: 'refusing to write noindex',
  then: (dir) =>
    readHeaders(dir) === headersFile ? null : 'it modified _headers on a production build',
});

gate('no _headers yet — refuses', {
  script: 'staging-headers.mjs',
  files: { 'dist/client/index.html': '<!doctype html>' },
  env: { PUBLIC_SITE_ENV: 'staging' },
  expect: 1,
  contains: 'no _headers',
});

gate('no ' + STAR + ' block to merge into — refuses', {
  script: 'staging-headers.mjs',
  files: { 'dist/client/_headers': '/_astro/' + '*\n  Cache-Control: immutable\n' },
  env: { PUBLIC_SITE_ENV: 'staging' },
  expect: 1,
  contains: 'merge into',
});

gate('staging — writes the header', {
  script: 'staging-headers.mjs',
  files: { 'dist/client/_headers': headersFile },
  env: { PUBLIC_SITE_ENV: 'staging' },
  expect: 0,
  then: (dir) =>
    /X-Robots-Tag:\s*noindex/.test(readHeaders(dir)) ? null : 'no X-Robots-Tag was written',
});

// The shipped bug: appending a SECOND block for the same path silently replaced
// the first, dropping Referrer-Policy, Permissions-Policy and the CSP from every
// response — while the file still visibly contained them all.
gate('merges into the existing block — security headers survive', {
  script: 'staging-headers.mjs',
  files: { 'dist/client/_headers': headersFile },
  env: { PUBLIC_SITE_ENV: 'staging' },
  expect: 0,
  then: (dir) => {
    const out = readHeaders(dir);
    const blocks = out.split('\n').filter((l) => l.trim() === STAR).length;
    if (blocks !== 1) return `left ${blocks} ${STAR} blocks — a later one REPLACES the earlier`;
    for (const h of ['Referrer-Policy', 'Permissions-Policy', 'Content-Security-Policy']) {
      if (!out.includes(h)) return `${h} was dropped`;
    }
    return null;
  },
});

// The other shipped bug: _headers does not strip an inline `#`, so a trailing
// comment is sent as part of the header VALUE. Crawlers received
// "noindex, nofollow, noarchive   # staging only …" for two builds.
gate('the note is its own line, never inline on the value', {
  script: 'staging-headers.mjs',
  files: { 'dist/client/_headers': headersFile },
  env: { PUBLIC_SITE_ENV: 'staging' },
  expect: 0,
  then: (dir) => {
    const line = readHeaders(dir)
      .split('\n')
      .find((l) => l.includes('X-Robots-Tag'));
    if (!line) return 'no X-Robots-Tag line';
    return line.includes('#') ? `the value carries a comment: ${JSON.stringify(line.trim())}` : null;
  },
});

gate('already present — idempotent, exits 0 without a second copy', {
  script: 'staging-headers.mjs',
  files: {
    'dist/client/_headers': headersFile.replace(
      '  Referrer-Policy',
      '  X-Robots-Tag: noindex, nofollow, noarchive\n  Referrer-Policy',
    ),
  },
  env: { PUBLIC_SITE_ENV: 'staging' },
  expect: 0,
  contains: 'already present',
  then: (dir) => {
    const n = readHeaders(dir).split('\n').filter((l) => l.includes('X-Robots-Tag')).length;
    return n === 1 ? null : `${n} X-Robots-Tag lines after a second run`;
  },
});

gate('dist/_headers, without a client/ subdirectory', {
  script: 'staging-headers.mjs',
  files: { 'dist/_headers': headersFile },
  env: { PUBLIC_SITE_ENV: 'staging' },
  expect: 0,
  then: (dir) =>
    /X-Robots-Tag/.test(readHeaders(dir, 'dist/_headers')) ? null : 'nothing written to dist/_headers',
});

/* ────────────────────────────────────────────────────────────────────────
 * tells — the generated-site rows. Counting checks with exclusions, where
 * the exclusion is the whole reason the row is usable: a pill radius and a
 * focus ring are correct design, and a row that flagged them would be
 * switched off within a day.
 *
 * `tells` exits 1 on three or more tells in total, and a minimal fixture
 * trips seven unrelated rows. So the exit code says nothing about WHICH row
 * fired — every case here pins the row by its own line in the output.
 * ──────────────────────────────────────────────────────────────────────── */

/*
 * ⚠ NO SEMICOLON IN tokens.css, DELIBERATELY.
 *
 * `tells` concatenates every stylesheet before matching. A regex written as
 * `box-shadow:[^;]+;` — requiring a terminator — then runs past the `}`, past
 * the newline, and finds the semicolon in the NEXT FILE, so it matches anyway
 * and the bug is invisible. Removing the only other semicolon is what makes
 * "the declaration has no terminator" actually testable.
 *
 * Found by mutation: restoring that exact regex changed nothing until this line
 * did.
 */
const tellsFixture = (css) => ({
  'src/styles/project.css': css,
  'src/styles/tokens.css': ':root { --brand: #123456 }\n',
  'src/pages/index.astro': '---\nconst t = 1;\n---\n<p>x</p>\n',
});

/** Assert one named row fired (or did not), by its verdict line. */
const row = (name, shouldFire) => (_dir, out) => {
  const clean = out.replace(/\x1b\[[0-9;]*m/g, '');
  const fired = new RegExp(`^✗ ${name}`, 'm').test(clean);
  const quiet = new RegExp(`^✓ ${name}`, 'm').test(clean);
  if (!fired && !quiet) return `the row "${name}" was not reported at all`;
  if (fired !== shouldFire) return `"${name}" ${fired ? 'fired' : 'stayed quiet'}, wanted the opposite`;
  return null;
};

describe('tells — generated-site rows');

for (const [label, css, name, fires] of [
  ['two frosted surfaces',            '.a{backdrop-filter:blur(12px)} .b{backdrop-filter:blur(8px)}', 'frosted glass on more than one surface', true],
  ['one frosted header is allowed',   '.hdr{backdrop-filter:blur(12px)}',                             'frosted glass on more than one surface', false],
  ['three radii at 24px and up',      '.a{border-radius:28px}.b{border-radius:2rem}.c{border-radius:32px}', 'border radii of 24px and up, repeatedly', true],
  ['pills and circles are excluded',  '.a{border-radius:9999px}.b{border-radius:9999px}.c{border-radius:9999px}.d{border-radius:50%}', 'border radii of 24px and up, repeatedly', false],
  ['ordinary 8-12px radii',           '.a{border-radius:8px}.b{border-radius:12px}.c{border-radius:6px}',    'border radii of 24px and up, repeatedly', false],
  ['a zero-offset glow',              '.a{box-shadow:0 0 40px rgba(120,80,255,.6)}',                  'glow shadows', true],
  ['a glow as the last declaration',  '.a{color:red;box-shadow:0 0 32px #7c5cff}',                    'glow shadows', true],
  ['a focus ring is excluded',        '.a:focus-visible{box-shadow:0 0 0 3px #8a3324}',               'glow shadows', false],
  ['an offset shadow is excluded',    '.a{box-shadow:0 8px 24px rgba(0,0,0,.12)}',                    'glow shadows', false],
]) {
  gate(label, {
    script: 'tells.mjs',
    files: tellsFixture(css),
    expect: 1, // seven unrelated rows fire on a bare fixture; the row is pinned below
    then: row(name, fires),
  });
}

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
