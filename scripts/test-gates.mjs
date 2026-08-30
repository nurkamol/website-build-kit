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
 * ── WHAT THIS DOES NOT COVER ───────────────────────────────────────────────
 * Written as prose, twice, and wrong both times. The first version justified
 * every omission as "needs a deployed site", which was untrue of
 * `staging-headers.mjs`. The second still omitted `redirects.mjs` and
 * `extract.mjs` — both entirely offline — while naming scripts that no longer
 * needed naming.
 *
 * ⚠ AN EXCLUSION LIST THAT DOES NOT DESCRIBE WHAT IS ACTUALLY EXCLUDED IS THE
 *   SAME FAILURE AS A GATE THAT DOES NOT GATE. Both read as coverage that is
 *   not there, and prose cannot be checked.
 *
 * So the ledger at the bottom of this file is mechanical: it enumerates every
 * template script that can exit 1, subtracts the ones covered here, and fails
 * if what remains is not accounted for in UNCOVERED with a reason. A new gate
 * script now cannot be silently uncovered — the same shape as `audit:docs`
 * failing on a script documented nowhere.
 */

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync, existsSync, readdirSync } from 'node:fs';
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
/* This file reads itself to find which scripts it covers, so the ledger below
   cannot disagree with the cases above. */
const s_selfSource = readFileSync(fileURLToPath(import.meta.url), 'utf8');
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
function gate(label, { script, files, env = {}, args = [], expect, contains, then, setup }) {
  const dir = fixture(files);
  try {
    /* `setup` prepares state the file map cannot express — a real git history
       with pinned commit dates, for the one script whose entire output is
       dates. */
    if (setup) setup(dir);
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
  // Adopted after running pbakaus/impeccable's detector over a real build.
  ['an overshoot easing',             '.a{transition:transform 200ms cubic-bezier(0.34,1.4,0.64,1)}', 'bounce or overshoot easing', true],
  ['anticipation, y below 0',         '.a{transition:transform 200ms cubic-bezier(0.4,-0.3,0.6,1)}',  'bounce or overshoot easing', true],
  ['a normal ease-out is excluded',   '.a{transition:transform 200ms cubic-bezier(0.22,1,0.36,1)}',   'bounce or overshoot easing', false],
  ['two cards with a side bar',       '.card{border-inline-start:3px solid red}.n{border-left:4px solid blue}', 'a thick accent bar down one side', true],
  // The exclusion IS the row: a rule beside a quotation is a convention older
  // than the web, and flagging it teaches people to skim past the check.
  ['blockquotes are excluded',        '.prose blockquote{border-inline-start:3px solid red}blockquote{border-left:4px solid blue}', 'a thick accent bar down one side', false],
  ['1px hairlines are excluded',      '.card{border-inline-start:1px solid red}.n{border-left:2px solid blue}', 'a thick accent bar down one side', false],
]) {
  gate(label, {
    script: 'tells.mjs',
    files: tellsFixture(css),
    expect: 1, // seven unrelated rows fire on a bare fixture; the row is pinned below
    then: row(name, fires),
  });
}

/* ────────────────────────────────────────────────────────────────────────
 * redirects — proposes a map, and must never write the live one
 * ──────────────────────────────────────────────────────────────────────── */

describe('redirects');

const distRoutes = {
  'dist/client/index.html': '<!doctype html><html><head></head><body></body></html>',
  'dist/client/about-us/index.html': '<!doctype html><html><head></head><body></body></html>',
  'dist/client/services/index.html': '<!doctype html><html><head></head><body></body></html>',
};

gate('no recon inventory — refuses', {
  script: 'redirects.mjs',
  files: distRoutes,
  expect: 1,
  contains: 'recon',
});

gate('no dist and no host — refuses', {
  script: 'redirects.mjs',
  files: { 'recon/urls.txt': '/about-us/\n/services/\n' },
  expect: 1,
  contains: 'Build first',
});

gate('proposes a map from the inventory', {
  script: 'redirects.mjs',
  files: { ...distRoutes, 'recon/urls.txt': '/about-us/\n/services/\n/gone/\n' },
  expect: 0,
  then: (dir) => {
    const out = join(dir, 'recon/redirects.proposed');
    if (!existsSync(out)) return 'wrote no proposal';
    const body = readFileSync(out, 'utf8');
    /* /about-us/ and /services/ exist as new routes, so they correctly need no
       redirect. /gone/ is the one with no candidate — and the one that loses
       traffic silently if nobody decides about it, so it must be named. */
    if (!/\/gone\//.test(body)) return 'the path with no candidate is not named in the proposal';
    if (!/not applied|never/i.test(body)) return 'the proposal does not say it was not applied';
    return null;
  },
});

/*
 * The script's stated design: it NEVER writes public/_redirects, because slug
 * similarity is a guess and a wrong 301 is worse than a 404 — the 404 shows up
 * in the log and gets fixed, the wrong redirect looks like it works and sends
 * people to the wrong page for years.
 *
 * That guarantee is one refactor away from being lost, and nothing else checks
 * it. A pre-existing file is left byte-identical.
 */
gate('never writes public/_redirects', {
  script: 'redirects.mjs',
  files: {
    ...distRoutes,
    'recon/urls.txt': '/about-us/\n/services/\n',
    'public/_redirects': '# hand-written, do not touch\n/old/  /new/  301\n',
  },
  expect: 0,
  then: (dir) => {
    const live = readFileSync(join(dir, 'public/_redirects'), 'utf8');
    return live === '# hand-written, do not touch\n/old/  /new/  301\n'
      ? null
      : 'it modified public/_redirects, which it promises never to do';
  },
});

/* ────────────────────────────────────────────────────────────────────────
 * extract — captured HTML to markdown
 * ──────────────────────────────────────────────────────────────────────── */

describe('extract');

const capture = (body) =>
  `<!doctype html><html><head><title>About us</title></head><body>${body}</body></html>`;

gate('no capture directory — refuses', {
  script: 'extract.mjs',
  files: { 'placeholder.txt': '' },
  expect: 1,
  contains: 'recon',
});

gate('a capture directory with no HTML — refuses', {
  script: 'extract.mjs',
  files: { 'recon/html/notes.txt': 'not html' },
  expect: 1,
  contains: 'no .html',
});

gate('turns captured HTML into markdown', {
  script: 'extract.mjs',
  files: { 'recon/html/about.html': capture('<h1>About us</h1><p>We fix things.</p>') },
  expect: 0,
  then: (dir) => {
    const out = join(dir, 'recon/extracted/about.md');
    if (!existsSync(out)) return 'wrote no markdown';
    const md = readFileSync(out, 'utf8');
    if (!/We fix things\./.test(md)) return 'the body text did not survive extraction';
    if (/<p>|<h1>/.test(md)) return 'raw HTML tags survived into the markdown';
    return null;
  },
});

/* ────────────────────────────────────────────────────────────────────────
 * lastmod — per-route content dates for the sitemap
 *
 * Previously excused as "needs a git history with real commit dates; a
 * fixture repo would assert its own mtimes". That was wrong on both halves:
 * `GIT_COMMITTER_DATE` pins a commit date exactly, and the script reads
 * `git log`, never an mtime. A script whose whole output is dates is a poor
 * thing to leave untested because dates seemed hard.
 * ──────────────────────────────────────────────────────────────────────── */

const git = (dir, args, env = {}) =>
  spawnSync('git', args, {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', ...env },
  });

/** A repository with one commit, made at an exact instant. */
const repoAt = (iso) => (dir) => {
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'user.name', 'Test']);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'first'], { GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso });
};

const PAGES = {
  'src/pages/index.astro': '---\nconst t = 1;\n---\n<h1>Home</h1>\n',
  'src/pages/about.astro': '---\nconst t = 1;\n---\n<h1>About</h1>\n',
};

const lastmodOf = (dir, route) => {
  const f = join(dir, 'src/data/lastmod.json');
  if (!existsSync(f)) return null;
  return JSON.parse(readFileSync(f, 'utf8'))[route] ?? null;
};

describe('lastmod');

gate('a shallow clone — refuses rather than dating everything the same', {
  script: 'lastmod.mjs',
  files: PAGES,
  setup: (dir) => {
    repoAt('2024-03-05T12:00:00+00:00')(dir);
    /* `git rev-parse --is-shallow-repository` keys off this file existing. */
    writeFileSync(join(dir, '.git/shallow'), '');
  },
  expect: 1,
  contains: 'shallow',
});

gate('a committed page takes its commit date', {
  script: 'lastmod.mjs',
  files: PAGES,
  setup: repoAt('2024-03-05T12:00:00+00:00'),
  expect: 0,
  then: (dir) => {
    const d = lastmodOf(dir, '/about/');
    if (!d) return 'no date written for /about/';
    return d.startsWith('2024-03-05') ? null : `dated ${d}, wanted the commit date 2024-03-05`;
  },
});

/*
 * An uncommitted change means the real "last modified" is now, not the last
 * commit. Getting this backwards understates freshness on the page you just
 * edited — the one most worth recrawling.
 */
gate('an uncommitted page is dated today, not its last commit', {
  script: 'lastmod.mjs',
  files: PAGES,
  setup: (dir) => {
    repoAt('2024-03-05T12:00:00+00:00')(dir);
    writeFileSync(join(dir, 'src/pages/about.astro'), '---\nconst t = 2;\n---\n<h1>About, edited</h1>\n');
  },
  expect: 0,
  then: (dir) => {
    const d = lastmodOf(dir, '/about/');
    if (!d) return 'no date written for /about/';
    if (d.startsWith('2024-03-05')) return 'an edited file kept its old commit date';
    const home = lastmodOf(dir, '/');
    return home && home.startsWith('2024-03-05')
      ? null
      : `the untouched page should have kept 2024-03-05, got ${home}`;
  },
});

/* ────────────────────────────────────────────────────────────────────────
 * og-cards — refuses on the stub config, before it looks for a binary
 * ──────────────────────────────────────────────────────────────────────── */

describe('og-cards');

/*
 * The config guard runs BEFORE the python3/ImageMagick checks, so the refusal
 * that matters most is reachable with no tooling at all: a fresh template must
 * not generate social cards, because the design does not exist yet and the
 * cards would bake in the placeholder ramp.
 *
 * The paths past it — missing binary, missing fontTools, a FONTS path that does
 * not resolve — need a CONFIGURED project and the toolchain, so they are not
 * reachable from a fixture. That is a smaller gap than it sounds: it is one
 * `existsSync` per path, and the guard above is the one that fires on a real
 * build.
 */
gate('the stub config — refuses before generating anything', {
  script: 'og-cards.mjs',
  files: { 'src/pages/index.astro': '---\n---\n<h1>Home</h1>\n' },
  expect: 1,
  contains: 'still the stub',
});

/* ────────────────────────────────────────────────────────────────────────
 * build — the wrapper that exists because inline env is POSIX-only
 *
 * A full run needs an installed Astro project, so what is covered here is
 * the argument gate: the environment is not optional, and a build that does
 * not declare one emits localhost canonicals cleanly and wrongly.
 * ──────────────────────────────────────────────────────────────────────── */

describe('build');

gate('no environment — refuses', {
  script: 'build.mjs',
  files: { 'package.json': '{ "name": "fixture" }\n' },
  expect: 1,
  contains: 'staging|production',
});

gate('a misspelled environment — refuses rather than defaulting', {
  script: 'build.mjs',
  args: ['prodction'],
  files: { 'package.json': '{ "name": "fixture" }\n' },
  expect: 1,
  contains: 'staging|production',
  then: (dir) => (existsSync(join(dir, 'dist')) ? 'it started building anyway' : null),
});

/* ────────────────────────────────────────────────────────────────────────
 * check-copy — author notes that reached the rendered page
 *
 * Every case here is really about the exclusions. Firing on "TODO" is
 * trivial; not firing on "please confirm your email address" is what makes
 * the check survive contact with a real site.
 * ──────────────────────────────────────────────────────────────────────── */

describe('check-copy');

const copyPage = (body) => ({ 'dist/client/index.html': `<!doctype html><html><body>${body}</body></html>` });

for (const [label, body, fires, args] of [
  ['the note that shipped: ⚠ CONFIRM in body copy', '<p>Yoga is good. ⚠ CONFIRM: does the 9am class continue?</p>', true, []],
  ['a bare TODO in a paragraph',                     '<p>TODO: write the pricing section.</p>', true, []],
  ['Lorem ipsum',                                    '<p>Lorem ipsum dolor sit amet.</p>', true, []],
  ['an unrendered template placeholder',             '<p>Call us on {{ business.phone }}.</p>', true, []],
  ['a marker inside JSON-LD',                        '<script type="application/ld+json">{"name":"TODO"}</script>', true, []],
  // The exclusions. Each one is a sentence a real site says.
  ['TODO inside an HTML comment',                    '<!-- TODO: revisit --><p>Real copy.</p>', false, []],
  ['TODO inside a script',                           '<script>const x = "TODO: refactor";</script><p>Real copy.</p>', false, []],
  ['"confirm your email address"',                   '<p>Please confirm your email address to continue.</p>', false, []],
  ['lowercase todo, a word in other languages',      '<p>Escribimos todo en espanol.</p>', false, []],
  ['acronyms containing TK',                         '<p>We use the ATKINS method and TKR surgery.</p>', false, []],
]) {
  gate(label, {
    script: 'check-copy.mjs',
    files: copyPage(body),
    args,
    expect: 0, // warn mode never blocks; the verdict is in the output
    then: (_dir, out) => {
      const fired = /author marker/.test(out.replace(/\x1b\[[0-9;]*m/g, ''));
      return fired === fires ? null : `${fired ? 'fired' : 'stayed quiet'}, wanted the opposite`;
    },
  });
}

/* The whole point of the two modes: normal while building, fatal at go-live. */
gate('warn mode exits 0 with a marker present', {
  script: 'check-copy.mjs',
  files: copyPage('<p>TODO: fix</p>'),
  expect: 0,
});

gate('--strict refuses the same page', {
  script: 'check-copy.mjs',
  files: copyPage('<p>TODO: fix</p>'),
  args: ['--strict'],
  expect: 1,
  contains: 'author marker',
});

gate('no dist — refuses', {
  script: 'check-copy.mjs',
  files: { 'placeholder.txt': '' },
  expect: 1,
  contains: 'no dist',
});

/* ────────────────────────────────────────────────────────────────────────
 * The coverage ledger
 *
 * Every template script that can exit 1 is either covered above or listed
 * here with a reason. A new one that is neither FAILS THIS SUITE.
 *
 * ⚠ THIS EXISTS BECAUSE THE PROSE VERSION WAS WRONG TWICE. First it claimed
 *   everything uncovered "needs a deployed site", which was untrue of
 *   staging-headers.mjs. Then, after that was fixed, it still omitted
 *   redirects.mjs and extract.mjs — both entirely offline — and named neither
 *   indexnow nor md-to-pdf. A sentence cannot be checked; a list compared
 *   against the filesystem can.
 * ──────────────────────────────────────────────────────────────────────── */

const NETWORK = 'needs a deployed site or a live zone';

const UNCOVERED = {
  'verify.mjs': NETWORK,
  'recon.mjs': NETWORK,
  'shots.mjs': NETWORK,
  'check-console.mjs': NETWORK,
  'check-reflow.mjs': NETWORK,
  'check-a11y.mjs': NETWORK,
  'a11y-evidence.mjs': NETWORK,
  'dns-snapshot.mjs': NETWORK + ' (node:dns against a real zone)',
  'indexnow.mjs': NETWORK + ' — and it submits to real search engines',
  'md-to-pdf.mjs': NETWORK + ' (headless Chrome fetching the rendered page)',
};

{
  const dir = join(TEMPLATE_SCRIPTS);
  const scripts = readdirSync(dir)
    .filter((f) => f.endsWith('.mjs') && !f.endsWith('.config.mjs'))
    .filter((f) => /process\.exit\((?:1|failed \? 1 : 0)\)/.test(readFileSync(join(dir, f), 'utf8')));

  const covered = new Set(
    [...s_selfSource.matchAll(/script: '([^']+)'/g)].map((m) => m[1]),
  );

  const unaccounted = scripts.filter((f) => !covered.has(f) && !(f in UNCOVERED));
  const stale = Object.keys(UNCOVERED).filter((f) => !scripts.includes(f) || covered.has(f));

  for (const f of unaccounted) {
    results.push({
      gate: 'coverage ledger',
      label: `${f} can exit 1 and is neither covered nor accounted for`,
      ok: false,
      detail: 'add a case above, or an entry in UNCOVERED saying why not',
    });
  }
  for (const f of stale) {
    results.push({
      gate: 'coverage ledger',
      label: `${f} is listed in UNCOVERED but ${covered.has(f) ? 'IS covered' : 'no longer exists'}`,
      ok: false,
      detail: 'the ledger has drifted from the filesystem',
    });
  }
  if (!unaccounted.length && !stale.length) {
    results.push({
      gate: 'coverage ledger',
      label: `${scripts.length} scripts can exit 1 — ${scripts.length - Object.keys(UNCOVERED).length} covered, ${Object.keys(UNCOVERED).length} accounted for`,
      ok: true,
      detail: 'exit 0',
    });
  }
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
