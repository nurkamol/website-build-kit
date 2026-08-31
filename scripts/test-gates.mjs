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
import { spawn, spawnSync } from 'node:child_process';
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
function gate(label, { script, files, env = {}, args = [], expect, contains, then, setup, from }) {
  const dir = fixture(files);
  try {
    /* `setup` prepares state the file map cannot express — a real git history
       with pinned commit dates, for the one script whose entire output is
       dates. */
    if (setup) setup(dir);
    /* `from` runs a KIT script instead of a template one — check:binary guards
       this repository's own provenance sweep, so it has no template copy. */
    const run = spawnSync(process.execPath, [join(from ?? TEMPLATE_SCRIPTS, script), ...args], {
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
 * check-form — two controls sharing a name, the honeypot most of all
 * ──────────────────────────────────────────────────────────────────────── */

describe('check-form');

const formFile = (body) => ({ 'src/components/ContactForm.astro': `<form>${body}</form>` });

gate('a clean form passes', {
  script: 'check-form.mjs',
  files: formFile('<input name="name"><input name="email"><input name="message">'),
  expect: 0,
});

/* The scenario: a client asks for a Company field, and the honeypot already
   owns that name. Every enquiry from a company that fills it in is discarded
   with a 200 and a thank-you page. */
gate('a real field colliding with the honeypot', {
  script: 'check-form.mjs',
  files: formFile('<div class="form__trap"><input name="company" tabindex="-1"></div><input name="company">'),
  expect: 1,
  contains: 'HONEYPOT',
});

gate('a plain duplicate, not the honeypot', {
  script: 'check-form.mjs',
  files: formFile('<input name="phone"><input name="phone">'),
  expect: 1,
  contains: 'overwrites the first',
});

/* name= on something that is not a form control must not count. */
gate('name on a non-control is ignored', {
  script: 'check-form.mjs',
  files: formFile('<meta name="x"><a name="x"></a><input name="email">'),
  expect: 0,
});

/* A name built from an expression cannot be compared; skipping beats guessing. */
gate('an expression-built name is skipped', {
  script: 'check-form.mjs',
  files: formFile('<input name={`f-${i}`}><input name={`f-${i}`}>'),
  expect: 0,
});

gate('no src — refuses', {
  script: 'check-form.mjs',
  files: { 'placeholder.txt': '' },
  expect: 1,
  contains: 'no src',
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

/*
 * ⚠ THE REASON USED TO BE WRONG FOR EVERY ENTRY, AND THAT IS WHY NOBODY
 *   REVISITED IT. All nine said "needs a deployed site" — inherited from the
 *   first one written. Sorted honestly, six need a BROWSER (which can point at
 *   localhost perfectly well), one needs a live zone, one submits to real
 *   search engines, and `verify.mjs` needed neither: it takes a URL, which is
 *   not the same thing as needing a deployment.
 *
 *   `verify.mjs` is now covered against `scripts/fixture-site.mjs`. A wrong
 *   reason in a ledger is worse than a missing entry, because it reads as a
 *   decision someone made.
 */
const BROWSER = 'drives a real browser — testable in principle, but a stub convincing enough would need more maintenance than the script';
const NETWORK = 'needs a live zone or a real third party';

const UNCOVERED = {
  'shots.mjs': BROWSER,
  'check-console.mjs': BROWSER,
  'check-reflow.mjs': BROWSER,
  'check-a11y.mjs': BROWSER,
  'a11y-evidence.mjs': BROWSER,
  'md-to-pdf.mjs': BROWSER + ' (headless Chrome fetching the rendered page)',
  'dns-snapshot.mjs': NETWORK + ' (node:dns against a real zone)',
  'indexnow.mjs': NETWORK + ' — and it submits to real search engines',
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
 * recon — the SSRF guard
 *
 * recon is otherwise untestable offline: it crawls a live site. But its
 * refusals happen BEFORE the first fetch, which makes every path that exits 1
 * reachable in a fixture — the usage error, a blocked host and a blocked
 * protocol. That is the whole of recon's exit-1 surface, which is why it is no
 * longer in UNCOVERED.
 *
 * ⚠ THE REDIRECT REFUSAL IS NOT COVERED HERE and cannot be: it needs a real
 *   server issuing a 302 to an internal address. It does not exit 1 — it
 *   returns null and adds a note — so the ledger does not demand it, but do
 *   not read this block as proof that the redirect path works.
 * ──────────────────────────────────────────────────────────────────────── */
describe('recon — SSRF guard');

gate('no target at all is a usage error', {
  script: 'recon.mjs',
  files: {},
  args: [],
  expect: 1,
  contains: 'usage:',
});

for (const [label, target] of [
  ['loopback', 'http://127.0.0.1/'],
  ['loopback, written short', 'http://127.1/'],
  ['loopback, written as an integer', 'http://2130706433/'],
  ['loopback, written in octal', 'http://0177.0.0.1/'],
  ['loopback over IPv6', 'http://[::1]/'],
  ['loopback as IPv4-mapped IPv6', 'http://[::ffff:127.0.0.1]/'],
  ['localhost by name', 'http://localhost:8080/'],
  ['the cloud metadata address', 'http://169.254.169.254/latest/meta-data/'],
  ['an RFC1918 address', 'http://10.0.5.20/'],
  ['a private 192.168 address', 'http://192.168.1.1/'],
]) {
  gate(`refuses ${label}`, {
    script: 'recon.mjs',
    files: {},
    args: [target],
    expect: 1,
    contains: 'blocked internal host',
  });
}

gate('refuses a non-http protocol', {
  script: 'recon.mjs',
  files: {},
  args: ['file:///etc/passwd'],
  expect: 1,
  contains: 'blocked protocol',
});

/* --allow-internal must NOT excuse a bad protocol — the flag is about hosts,
   and a hint offering it for a file: URL would be advice that cannot work. */
gate('--allow-internal does not excuse a bad protocol', {
  script: 'recon.mjs',
  files: {},
  args: ['file:///etc/passwd', '--allow-internal'],
  expect: 1,
  contains: 'blocked protocol',
});

/* The boundary of the RFC1918 range, in both directions. 172.15 is public and
   172.16 is not; a regex that gets this wrong looks right in every other case. */
gate('refuses 172.16, the first private address in the range', {
  script: 'recon.mjs',
  files: {},
  args: ['http://172.16.0.1/'],
  expect: 1,
  contains: 'blocked internal host',
});



/* ────────────────────────────────────────────────────────────────────────
 * verify — the go-live gate, against a local fixture site
 *
 * 1,069 lines across eleven sections, three `exit(1)` paths, and until now not
 * one case proving any of them still refuses. It was excused as "needs a
 * deployed site"; it needs a URL.
 *
 * ⚠ EVERY FAULT IS PAIRED WITH THE CLEAN RUN. The clean fixture passes all 32
 *   checks and exits 0, so a case asserting `✗ <check>` is proving that check
 *   fired for its own reason — not that verify happened to fail at something
 *   unrelated. A suite that only ever sees a broken site cannot tell "this
 *   check works" from "this check always fires".
 *
 * ⚠ THE CANONICAL CHECKS CANNOT BE COVERED FROM HERE, and that is verify being
 *   right rather than a gap to paper over. Against a localhost origin it
 *   deliberately relaxes them — "expected on a local preview of a remote
 *   build; re-run against the deployed host" — so a canonical pointing at
 *   another host passes, correctly. Covering it needs a real deployment. Do
 *   not read this block as proving the canonical section works.
 * ──────────────────────────────────────────────────────────────────────── */
describe('verify — against a fixture site');

const FIXTURE_SITE = join(KIT, 'scripts', 'fixture-site.mjs');
let fixturePort = 8330;

/* The project files verify reads from disk. The served site is the fixture;
   these are what it compares against. */
const VERIFY_FILES = {
  'src/pages/index.astro': '---\n---\n<h1>Home</h1>\n',
  'src/pages/about.astro': '---\n---\n<h1>About</h1>\n',
  'public/_redirects': '/legacy-about.html /about/ 301\n',
  'recon/preserved.md':
    '# Preserved\n\n## Present on the old site\n\n| path | status |\n| --- | --- |\n| `/legacy-about.html` | 301 |\n',
};

/**
 * Start the fixture as a SEPARATE PROCESS and block until it answers.
 *
 * ⚠ IT CANNOT BE IN-PROCESS. This harness drives scripts with `spawnSync`,
 *   which blocks the event loop — a listener in this process would never
 *   accept the connection, and every case would fail as "origin unreachable"
 *   while looking like a real verdict.
 *
 * A fresh port per case, so a socket still in TIME_WAIT from the previous one
 * cannot fail the next with EADDRINUSE.
 */
function startFixture(faults) {
  const port = ++fixturePort;
  const args = [FIXTURE_SITE, '--port', String(port), ...(faults ? ['--faults', faults] : [])];
  const child = spawn(process.execPath, args, { stdio: 'ignore' });
  const probe = `fetch('http://127.0.0.1:${port}/__ready').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))`;
  for (let i = 0; i < 60; i++) {
    if (spawnSync(process.execPath, ['-e', probe], { stdio: 'ignore' }).status === 0) {
      return { child, origin: `http://127.0.0.1:${port}` };
    }
  }
  child.kill('SIGKILL');
  throw new Error(`fixture-site did not start on ${port}`);
}

/** Strip the colour before looking for a mark, or nothing ever matches. */
const plain = (out) => out.replace(/\u001b\[[0-9;]*m/g, '');
const showsCheck = (out, mark, name) => plain(out).includes(`${mark} ${name}`);

function verifyGate(label, { faults = '', expect, mark, check }) {
  let fixture;
  try {
    fixture = startFixture(faults);
  } catch (err) {
    results.push({ gate: currentGate, label, ok: false, detail: String(err.message) });
    return;
  }
  try {
    gate(label, {
      script: 'verify.mjs',
      files: VERIFY_FILES,
      args: [fixture.origin],
      expect,
      then: (_dir, out) =>
        showsCheck(out, mark, check) ? null : `did not report ${JSON.stringify(`${mark} ${check}`)}`,
    });
  } finally {
    fixture.child.kill('SIGKILL');
  }
}

/* The control. Everything below is only meaningful because this passes. */
verifyGate('a clean site passes every check', {
  expect: 0,
  mark: '✓',
  check: 'every route returns 200',
});

for (const [label, faults, check] of [
  ['a route that 404s', 'route-404', 'every route returns 200'],
  ['two pages sharing a title', 'dup-title', 'no two pages share a title'],
  ['robots.txt naming no sitemap', 'no-sitemap-in-robots', 'production robots.txt names a sitemap'],
  ['caught spam landing on the conversion URL', 'spam-converts', 'caught spam does NOT land on the conversion URL'],
  ['an empty submission accepted', 'accepts-empty', 'empty submission is rejected'],
  ['a cross-origin submission accepted', 'allows-cross-origin', 'cross-origin submission is refused'],
]) {
  verifyGate(`refuses ${label}`, { faults, expect: 1, mark: '✗', check });
}

/*
 * ⚠ THESE TWO WARN RATHER THAN REFUSE, AND THE CASES SAY SO.
 *
 *   Writing them as `expect: 1` is how this block was first drafted, and both
 *   failed — which is the harness working. A second h1 is a `!`, and the run
 *   still exits 0. Pinning the mark rather than only the exit code is what
 *   makes that visible instead of being quietly "fixed" by loosening the
 *   assertion until it passed.
 */
verifyGate('warns on a second h1, without failing the run', {
  faults: 'two-h1',
  expect: 0,
  mark: '!',
  check: 'exactly one h1 per page',
});

/* The warning is the preserved-path check; the exit 1 comes from the redirect
   rule, which declared /about/ and got /. Same fault, two reports. */
verifyGate('warns when a preserved path lands on the homepage', {
  faults: 'preserved-to-home',
  expect: 1,
  mark: '!',
  check: 'no preserved path redirects to the homepage',
});

/*
 * recon's redirect refusal — the one path the offline cases could not reach.
 *
 * It needs a real server issuing a 302, which is exactly what the fixture is.
 * The refusal does not exit 1: it prints, adds a note, and the crawl continues
 * with an incomplete inventory. So the assertion is on the OUTPUT, and the
 * clean run is paired with it — otherwise "no refusal" and "the check is dead"
 * look identical.
 */
for (const [label, faults, wanted] of [
  ['refuses a redirect it must not follow', 'redirect-blocked', 'refused blocked protocol: file:'],
  ['does not refuse anything on a clean crawl', '', null],
]) {
  let fixture;
  try {
    fixture = startFixture(faults);
  } catch (err) {
    results.push({ gate: currentGate, label: `recon ${label}`, ok: false, detail: String(err.message) });
    continue;
  }
  try {
    gate(`recon ${label}`, {
      script: 'recon.mjs',
      files: {},
      args: [fixture.origin, '--no-wayback', '--allow-internal'],
      expect: 0,
      then: (_dir, out) => {
        const text = plain(out);
        if (wanted) return text.includes(wanted) ? null : `did not print ${JSON.stringify(wanted)}`;
        return /refused/i.test(text) ? 'refused something on a clean site' : null;
      },
    });
  } finally {
    fixture.child.kill('SIGKILL');
  }
}

/* Both reachable without a server at all. */
gate('no origin argument is a usage error', {
  script: 'verify.mjs',
  files: VERIFY_FILES,
  args: [],
  expect: 1,
  contains: 'usage:',
});

gate('a non-http argument is a usage error', {
  script: 'verify.mjs',
  files: VERIFY_FILES,
  args: ['example.com'],
  expect: 1,
  contains: 'usage:',
});

/* ⚠ A PORT NOTHING IS LISTENING ON. verify must say it cannot reach the origin
   and stop, rather than reporting a page of green checks against nothing. */
gate('an unreachable origin stops the run', {
  script: 'verify.mjs',
  files: VERIFY_FILES,
  args: ['http://127.0.0.1:9'],
  expect: 1,
  contains: 'Cannot reach',
});



/* ────────────────────────────────────────────────────────────────────────
 * check:cms — the config that silently destroys content
 *
 * Written after auditing five shipped sites. ALL FIVE failed: two were losing
 * data on the client's first save (analytics IDs, opening hours, image
 * references across three languages), two pointed uploads at the pipeline's
 * OUTPUT directory, and one dropped a frontmatter key from every news post.
 *
 * ⚠ Every one of those configs was VALID YAML with paths that all resolved.
 *   That is the whole difficulty: the config is not wrong, it is INCOMPLETE,
 *   and nothing in a build can see the difference.
 * ──────────────────────────────────────────────────────────────────────── */
describe('check:cms');

const CMS_CLEAN = {
  '.pages.yml': [
    'media:',
    '  - name: uploads',
    '    input: media/source/uploads',
    '    output: /img/uploads',
    '    extensions: [jpg, png]',
    'content:',
    '  - name: site',
    '    type: file',
    '    path: src/data/site.json',
    '    fields:',
    '      - { name: title, type: string }',
    '      - name: analytics',
    '        type: object',
    '        fields:',
    '          - { name: ga4, type: string }',
    '',
  ].join('\n'),
  'src/data/site.json': JSON.stringify({ title: 'x', analytics: { ga4: 'G-1' } }, null, 2),
  'media/source/uploads/.keep': '',
};

gate('no .pages.yml is not a failure', {
  script: 'check-cms.mjs',
  files: { 'src/data/site.json': '{}' },
  expect: 0,
  contains: 'no CMS to check',
});

gate('a config declaring every key passes', {
  script: 'check-cms.mjs',
  files: CMS_CLEAN,
  expect: 0,
  contains: 'every key declared',
});

/* The 27-keys-at-risk case, reduced. `analytics.ga4` is declared and
   `analytics.gtm` is not — so the nested check has to fire even though the
   PARENT is declared. Comparing only top-level names misses this, and that is
   the shape the real getmiohome.com config had. */
gate('refuses a nested key the schema forgot', {
  script: 'check-cms.mjs',
  files: {
    ...CMS_CLEAN,
    'src/data/site.json': JSON.stringify({ title: 'x', analytics: { ga4: 'G-1', gtm: 'GTM-9' } }, null, 2),
  },
  expect: 1,
  contains: 'analytics.gtm',
});

gate('refuses a top-level key the schema forgot', {
  script: 'check-cms.mjs',
  files: {
    ...CMS_CLEAN,
    'src/data/site.json': JSON.stringify({ title: 'x', openingHours: { opens: '09:00' }, analytics: { ga4: 'G' } }, null, 2),
  },
  expect: 1,
  contains: 'openingHours',
});

gate('refuses a collection frontmatter key the schema forgot', {
  script: 'check-cms.mjs',
  files: {
    '.pages.yml': [
      'content:',
      '  - name: news',
      '    type: collection',
      '    path: src/content/news',
      '    fields:',
      '      - { name: title, type: string }',
      '',
    ].join('\n'),
    'src/content/news/one.md': '---\ntitle: One\nlang: en\n---\n\nBody.\n',
  },
  expect: 1,
  contains: 'lang',
});

/* ⚠ The media DIRECTION bug, which hit two of five shipped sites. */
gate('refuses uploads pointed at generated output', {
  script: 'check-cms.mjs',
  files: {
    '.pages.yml': ['media:', '  - name: photos', '    input: public/img', '    extensions: [jpg]', 'content: []', ''].join('\n'),
    'public/img/.keep': '',
  },
  expect: 1,
  contains: 'GENERATED output',
});

/*
 * ⚠ THE BUG THE TOLERANT READER MADE POSSIBLE. <Img> accepts a manifest key as
 *   well as a picker path, so a field converted to `type: image` without
 *   migrating its values renders identically — green build, clean types, clean
 *   a11y, byte-identical HTML — while every picker in the CMS is an empty
 *   square. Nothing the site renders can see it.
 */
const CMS_IMAGE = {
  '.pages.yml': [
    'media:',
    '  - name: uploads',
    '    input: media/source/uploads',
    '    output: /img/uploads',
    '    extensions: [jpg]',
    'content:',
    '  - name: services',
    '    type: collection',
    '    path: src/content/services',
    '    fields:',
    '      - { name: title, type: string }',
    '      - { name: image, type: image, options: { media: uploads } }',
    '',
  ].join('\n'),
  'media/source/uploads/.keep': '',
};

gate('refuses a manifest key stored in a type: image field', {
  script: 'check-cms.mjs',
  files: { ...CMS_IMAGE, 'src/content/services/a.md': '---\ntitle: A\nimage: photos/hero\n---\n' },
  expect: 1,
  contains: 'not a path under "/img/uploads"',
});

gate('accepts the migrated picker path', {
  script: 'check-cms.mjs',
  files: {
    ...CMS_IMAGE,
    'src/content/services/a.md': '---\ntitle: A\nimage: /img/uploads/hero.jpg\n---\n',
  },
  expect: 0,
  contains: 'every key declared',
});

/* Warnings, not failures — but they must still fire, or the complaint that
   started this ("whole sections are missing") stays invisible. */
gate('warns about content no CMS entry points at', {
  script: 'check-cms.mjs',
  files: {
    ...CMS_CLEAN,
    'src/content/services/one.md': '---\ntitle: A\n---\n',
    'src/data/image-manifest.json': '{}',
  },
  expect: 0,
  contains: 'src/content/services',
  then: (_dir, out) =>
    out.includes('image-manifest.json') ? 'flagged a generated manifest as missing coverage' : null,
});

/* The guide that starts lying: written when the CMS had six entries, still
   claiming the address was not editable long after it was. */
gate('warns about a CMS section the client guide never mentions', {
  script: 'check-cms.mjs',
  files: {
    ...CMS_CLEAN,
    'docs/handover.md': '# Handover\n\n## 6. Making changes\n\nYou can edit nothing in particular.\n',
  },
  expect: 0,
  contains: 'the client guide never mentions',
});

gate('silent once the guide names the section', {
  script: 'check-cms.mjs',
  files: {
    ...CMS_CLEAN,
    'docs/handover.md': '# Handover\n\n## 6. Making changes\n\nYou can edit Site settings.\n',
  },
  expect: 0,
  then: (_dir, out) =>
    out.includes('the client guide never mentions') ? 'warned about a section the guide names' : null,
});

gate('warns when a field looks like technical configuration', {
  script: 'check-cms.mjs',
  files: {
    ...CMS_CLEAN,
    '.pages.yml': CMS_CLEAN['.pages.yml'].replace('- { name: ga4, type: string }', '- { name: apiToken, type: string }'),
    'src/data/site.json': JSON.stringify({ title: 'x', analytics: { apiToken: 't' } }),
  },
  expect: 0,
  contains: 'technical configuration',
});

/* ⚠ WHAT MAKES NAVIGATION SAFE TO PUT IN A CMS AT ALL. The rule kept nav out
   because a bad value should fail the build rather than publish; this is the
   check that lets the field exist and still keep that property. */
const NAV_FILES = {
  'src/pages/index.astro': '---\n---\n<p>home</p>\n',
  'src/pages/contact.astro': '---\n---\n<p>contact</p>\n',
  'src/pages/[slug].astro': '---\n---\n<p>legal</p>\n',
  '.pages.yml': [
    'content:',
    '  - name: navigation',
    '    type: file',
    '    path: src/data/nav.json',
    '    fields:',
    '      - name: items',
    '        type: list',
    '        fields:',
    '          - { name: label, type: string }',
    '          - { name: href, type: string }',
    '',
  ].join('\n'),
};

/* ⚠ TWO SEGMENTS, DELIBERATELY. `/prices/` would be served by the `[slug]`
   catch-all in this fixture, so asserting it broken would be asserting the
   check is WRONG. The first draft of this case did exactly that and failed —
   which is the dynamic-route handling working. */
gate('refuses a menu item pointing at a page that does not exist', {
  script: 'check-cms.mjs',
  files: {
    ...NAV_FILES,
    'src/data/nav.json': JSON.stringify({ items: [{ label: 'Prices', href: '/shop/prices/' }] }),
  },
  expect: 1,
  contains: 'point at a page this site does not serve',
});

gate('accepts a menu item pointing at a real page', {
  script: 'check-cms.mjs',
  files: {
    ...NAV_FILES,
    'src/data/nav.json': JSON.stringify({ items: [{ label: 'Contact', href: '/contact/' }] }),
  },
  expect: 0,
  contains: 'every key declared',
});

/* ⚠ A DYNAMIC ROUTE IS A PATTERN. `[slug].astro` serves every legal page, so
   treating routes as literal strings would report most of a real site as
   broken — the failure that gets a check switched off within a day. */
gate('a link through a dynamic route is not reported broken', {
  script: 'check-cms.mjs',
  files: {
    ...NAV_FILES,
    'src/data/nav.json': JSON.stringify({ items: [{ label: 'Privacy', href: '/privacy/' }] }),
  },
  expect: 0,
  contains: 'every key declared',
});

gate('an external link is left to verify, not guessed at', {
  script: 'check-cms.mjs',
  files: {
    ...NAV_FILES,
    'src/data/nav.json': JSON.stringify({
      items: [{ label: 'Book', href: 'https://booking.example.com' }, { label: 'Call', href: 'tel:+123' }],
    }),
  },
  expect: 0,
  contains: 'every key declared',
});

gate('refuses a content path that does not exist', {
  script: 'check-cms.mjs',
  files: {
    '.pages.yml': ['content:', '  - name: site', '    type: file', '    path: src/data/missing.json', ''].join('\n'),
  },
  expect: 1,
  contains: 'path does not exist',
});

gate('refuses a config that does not parse', {
  script: 'check-cms.mjs',
  files: { '.pages.yml': 'content:\n  - name: site\n   path: bad indent\n\t- tab\n' },
  expect: 1,
  contains: 'does not parse',
});

/* Nested inside a group. Getting the key wrong — `content` instead of `items` —
   reports a grouped config as having zero entries, which reads as a clean pass.
   That is how the first version of the audit missed three of the five sites. */
gate('looks inside groups, where PagesCMS nests entries', {
  script: 'check-cms.mjs',
  files: {
    '.pages.yml': [
      'content:',
      '  - name: pages',
      '    type: group',
      '    items:',
      '      - name: site',
      '        type: file',
      '        path: src/data/site.json',
      '        fields:',
      '          - { name: title, type: string }',
      '',
    ].join('\n'),
    'src/data/site.json': JSON.stringify({ title: 'x', stray: 1 }),
  },
  expect: 1,
  contains: 'stray',
});



/* ────────────────────────────────────────────────────────────────────────
 * optimize-media — it now refuses, so it needs a case that proves it
 *
 * The pipeline used to have no try/catch at all: one corrupt file threw midway,
 * AFTER outputs were written and the manifest was partly updated, so the
 * manifest described a state on disk that no longer matched it. It also
 * silently dropped anything that was not a raster — a .heic produced no output,
 * no warning and no manifest entry, and surfaced much later as <Img> throwing
 * against a file plainly sitting in the repo.
 *
 * No sharp needed here: garbage bytes named .jpg exercise the failure path, and
 * a .txt exercises the skip report.
 * ──────────────────────────────────────────────────────────────────────── */
describe('optimize-media');

gate('a file it cannot decode fails the run, by name', {
  script: 'optimize-media.mjs',
  files: {
    'media/source/photos/corrupt.jpg': 'this is definitely not a jpeg',
    'src/data/image-manifest.json': '{}',
  },
  expect: 1,
  contains: 'failed to process',
  then: (_dir, out) =>
    out.includes('corrupt.jpg') ? null : 'did not name the file that failed',
});

gate('a non-raster file is reported, not silently dropped', {
  script: 'optimize-media.mjs',
  files: {
    'media/source/notes.txt': 'a comp note, legitimately here',
    'src/data/image-manifest.json': '{}',
  },
  expect: 0,
  contains: 'produced no image',
});



/* ────────────────────────────────────────────────────────────────────────
 * check:binary — the hole that was in the provenance gate itself
 *
 * CLAUDE.md records a script that used a literal NUL as a sentinel, which made
 * it binary, which made it invisible to a provenance sweep written with
 * `grep -I` — while carrying a client's whole brand. The fix was to that one
 * file; nothing was added that would catch the next.
 *
 * ⚠ THE OBVIOUS IMPLEMENTATION IS A CHECK THAT ALWAYS PASSES.
 *   `git grep -I --files-without-match ''` reads like the answer and prints
 *   nothing either way. So these cases matter more than usual: one proves it
 *   NAMES a NUL-bearing file, one proves an empty file is not mistaken for one.
 * ──────────────────────────────────────────────────────────────────────── */
describe('check:binary');

const KIT_SCRIPTS = join(KIT, 'scripts');

/** A tiny repo, because the check asks git rather than the filesystem. */
const initRepo = (dir) => {
  const run = (...args) =>
    spawnSync('git', args, {
      cwd: dir,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_SYSTEM: '/dev/null',
        GIT_AUTHOR_NAME: 't',
        GIT_AUTHOR_EMAIL: 't@e',
        GIT_COMMITTER_NAME: 't',
        GIT_COMMITTER_EMAIL: 't@e',
      },
    });
  run('init', '-q');
  run('add', '-A');
};

gate('a tree of ordinary source files passes', {
  script: 'check-binary.mjs',
  from: KIT_SCRIPTS,
  files: { 'a.mjs': 'export const a = 1;\n', 'b.md': '# b\n' },
  setup: initRepo,
  expect: 0,
  contains: 'readable as text',
});

gate('names a source file carrying a NUL', {
  script: 'check-binary.mjs',
  from: KIT_SCRIPTS,
  files: { 'a.mjs': 'export const a = 1;\n', 'sneaky.mjs': 'const S = "a\u0000b";\n' },
  setup: initRepo,
  expect: 1,
  contains: 'sneaky.mjs',
});

/* ⚠ `git grep ''` matches LINES, and a zero-byte file has none — so the naive
   difference reports every empty file as binary. */
gate('an empty file is not mistaken for a binary one', {
  script: 'check-binary.mjs',
  from: KIT_SCRIPTS,
  files: { 'a.mjs': 'export const a = 1;\n', 'empty.md': '' },
  setup: initRepo,
  expect: 0,
  contains: 'readable as text',
});

/* A check that passes when git reports nothing has proved nothing. */
gate('refuses to pass vacuously with no tracked files', {
  script: 'check-binary.mjs',
  from: KIT_SCRIPTS,
  files: { 'note.rtf': 'not a source extension\n' },
  setup: initRepo,
  expect: 1,
  contains: 'refusing to pass vacuously',
});



/* ────────────────────────────────────────────────────────────────────────
 * check:contrast — the failure no accessibility runner can see
 *
 * axe and pa11y report a flat ~1.01:1 for text over a photograph, because
 * neither composites a transparent element over the pixels behind it. These
 * cases exist because the interesting result was counter-intuitive: on a real
 * site TWO OF THREE regions could not fail at all, their scrims being strong
 * enough that no photograph gets through. The one real exposure was a scrim
 * someone had LIGHTENED.
 *
 * So both directions are pinned: a strong scrim passing over a hostile frame,
 * and the same frame failing once the scrim is weakened.
 * ──────────────────────────────────────────────────────────────────────── */
describe('check:contrast');

/* sharp lives in template/node_modules, so the images are generated by a node
   run whose cwd is the template — the harness itself has no sharp. */
const makePhotos = (dir) =>
  spawnSync(
    process.execPath,
    [
      '-e',
      `const s=require('sharp');const d=${JSON.stringify(dir)};` +
        `Promise.all([` +
        `s({create:{width:400,height:200,channels:3,background:{r:250,g:250,b:250}}}).webp().toFile(d+'/public/img/photo-400.webp'),` +
        `]).then(()=>{});`,
    ],
    { cwd: join(KIT, 'template'), encoding: 'utf8' },
  );

const CONTRAST_FILES = (alpha) => ({
  'public/img/.keep': '',
  'src/data/image-manifest.json': JSON.stringify({
    photo: { src: '/img/photo-400.webp', srcset: '', width: 400, height: 200, widths: [400] },
  }),
  'src/data/contrast.json': JSON.stringify({
    regions: [
      {
        label: 'band',
        image: 'photo',
        box: { x: 0, y: 0, w: 1, h: 1 },
        scrim: { colour: '#1a0d05', from: alpha, to: alpha },
        text: '#ffffff',
      },
    ],
  }),
});

gate('no declaration is not a failure', {
  script: 'check-contrast.mjs',
  files: { 'src/data/image-manifest.json': '{}' },
  expect: 0,
  contains: 'no text-over-photograph regions declared',
});

gate('a strong scrim survives a hostile frame', {
  script: 'check-contrast.mjs',
  files: CONTRAST_FILES(0.82),
  setup: makePhotos,
  expect: 0,
  contains: 'legible',
});

/* ⚠ The actual finding: the danger is not the photograph, it is a weakened
   scrim. Same near-white frame, same white text, scrim dropped to 20%. */
gate('refuses the same frame once the scrim is weakened', {
  script: 'check-contrast.mjs',
  files: CONTRAST_FILES(0.2),
  setup: makePhotos,
  expect: 1,
  contains: 'below the contrast floor',
});

gate('refuses a media-picker path where a manifest key belongs', {
  script: 'check-contrast.mjs',
  files: {
    ...CONTRAST_FILES(0.82),
    'src/data/contrast.json': JSON.stringify({
      regions: [
        {
          label: 'band',
          image: '/img/photo-400.webp',
          scrim: { colour: '#1a0d05', from: 0.82, to: 0.82 },
          text: '#ffffff',
        },
      ],
    }),
  },
  setup: makePhotos,
  expect: 1,
  contains: 'media-picker path',
});



/* ────────────────────────────────────────────────────────────────────────
 * check:drift — the only check that speaks to sites already shipped
 *
 * Everything else here protects the next project. The template is copied, not
 * linked, so a delivered site never receives any of it.
 *
 * ⚠ IT REPORTS AND EXITS 0. A remediation tool that fails a build it was only
 *   asked to inspect is one nobody runs twice, and drift is not an error — it
 *   is a decision waiting to be made.
 * ──────────────────────────────────────────────────────────────────────── */
describe('check:drift');

const CURRENT_PIPELINE =
  "const FORMATS = ['avif', 'webp'];\nconst RASTER = /heic|heif/;\n" +
  "// produced no image\n// failed to process\n";

gate('a site with everything reports no drift', {
  script: 'check-drift.mjs',
  files: {
    'package.json': JSON.stringify({ name: 'x', websiteBuildKit: { version: '0.1.15' } }),
    'scripts/optimize-media.mjs': CURRENT_PIPELINE,
    'scripts/check-contrast.mjs': '',
    'src/data/contrast.json': '{"regions":[]}',
    'src/pages/index.astro': '<p>no images</p>\n',
  },
  setup: initRepo,
  expect: 0,
  contains: 'nothing behind',
});

/* ⚠ THE DECLARATION, NOT THE WORD. A pipeline with AVIF off still documents how
   to turn it on, so a bare search for "avif" reports the opposite of the truth
   on exactly the sites this exists for. */
gate('reads the FORMATS declaration, not a comment mentioning avif', {
  script: 'check-drift.mjs',
  files: {
    'package.json': JSON.stringify({ name: 'x' }),
    'scripts/optimize-media.mjs':
      "/* Set FORMATS to ['webp'] to turn 'avif' off. */\nconst FORMATS = ['webp'];\n",
    'src/pages/index.astro': '<p>x</p>\n',
  },
  setup: initRepo,
  expect: 0,
  contains: 'WebP only',
});

gate('an unstamped site is named as such', {
  script: 'check-drift.mjs',
  files: { 'package.json': JSON.stringify({ name: 'x' }), 'src/pages/index.astro': '<p>x</p>\n' },
  setup: initRepo,
  expect: 0,
  contains: 'no stamp',
});

/* The kit's own template must not report itself as behind the kit. */
gate('the template itself is not a drifted site', {
  script: 'check-drift.mjs',
  files: {
    'package.json': JSON.stringify({ name: 'site-name' }),
    'scripts/optimize-media.mjs': CURRENT_PIPELINE,
    'scripts/check-contrast.mjs': '',
    'src/pages/index.astro': '<p>x</p>\n',
  },
  setup: initRepo,
  expect: 0,
  contains: 'nothing behind',
});

gate('finds an image the client cannot change', {
  script: 'check-drift.mjs',
  files: {
    'package.json': JSON.stringify({ name: 'x', websiteBuildKit: { version: '0.1.15' } }),
    'scripts/optimize-media.mjs': CURRENT_PIPELINE,
    'scripts/check-contrast.mjs': '',
    'src/pages/index.astro': '<Img name="photos/hero" alt="a" />\n',
  },
  setup: initRepo,
  expect: 0,
  contains: 'hardcoded in pages',
});

gate('--json is machine-readable', {
  script: 'check-drift.mjs',
  from: undefined,
  args: ['--json'],
  files: { 'package.json': JSON.stringify({ name: 'x' }), 'src/pages/index.astro': '<p>x</p>\n' },
  setup: initRepo,
  expect: 0,
  then: (_dir, out) => {
    try {
      const parsed = JSON.parse(out);
      return Array.isArray(parsed.findings) && parsed.findings.length ? null : 'no findings array';
    } catch {
      return 'output is not valid JSON';
    }
  },
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
