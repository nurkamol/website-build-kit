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

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync, existsSync, readdirSync, symlinkSync, cpSync } from 'node:fs';
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
function gate(label, { script, files, env = {}, args = [], expect, contains, then, setup, from, timeout }) {
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
      /* A case that must never hang the suite says how long it may take; past it the run is killed and the case fails. */
      ...(timeout ? { timeout, killSignal: 'SIGKILL' } : {}),
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

  /*
   * ⚠ A STUB THAT DEMANDS THE FLAG IS HOW A FLAG STAYS PASSED. `wrangler secret
   *   list` prints JSON by DEFAULT, so dropping `--format json` would change
   *   nothing today and break silently the day that default moves — which is
   *   exactly the class this suite exists for. This stub refuses without it, so
   *   the passing case below is what pins the argument.
   */
  const demandsJsonFlag = npxStub(
    'case " $* " in\n' +
      '  *" --format json "*) echo \'[{"name":"BREVO_API_KEY"},{"name":"LEADS_EXPORT_TOKEN"}]\' ;;\n' +
      '  *) echo "this stub requires --format json" >&2; exit 1 ;;\n' +
      'esac',
  );

  /* Output that is not the JSON this expects — what a changed default looks like. */
  const prettyTable = npxStub(`printf 'Secret Name\\n-----------\\nBREVO_API_KEY\\n'`);

  /* A deployed worker genuinely holding nothing. Parsed, empty, and an ANSWER. */
  const noneSet = npxStub(`echo '[]'`);

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

  /* A wrangler that does not know the flag prints its usage, and the hint has to
     say so — it used to say "Usually `wrangler login`" to a session that was
     already logged in. */
  const tooOldForFlag = npxStub(
    `echo "Unknown argument: format" >&2; echo "wrangler secret list" >&2; exit 1`,
  );

  gate('an old wrangler is told what is actually wrong', {
    script: 'check-secrets.mjs',
    files: { '.dev.vars.example': EXAMPLE },
    env: { PATH: `${tooOldForFlag}:${process.env.PATH}` },
    expect: 1,
    contains: 'does not know `--format json`',
  });

  gate('passes --format json, rather than trusting the default', {
    script: 'check-secrets.mjs',
    files: { '.dev.vars.example': EXAMPLE },
    env: { PATH: `${demandsJsonFlag}:${process.env.PATH}` },
    expect: 0,
  });

  /*
   * ⚠ THE DIRECTION THAT MATTERS. Both parse fallbacks used to `return []`,
   *   which is a real answer meaning "this worker holds no secrets" — so
   *   unreadable output was reported as EVERY SECRET MISSING. The right alarm
   *   for the wrong reason: somebody goes looking for secrets that are all
   *   present, and the actual fault is that wrangler changed its output.
   */
  gate('output it cannot parse is a refusal, not "all secrets missing"', {
    script: 'check-secrets.mjs',
    files: { '.dev.vars.example': EXAMPLE },
    env: { PATH: `${prettyTable}:${process.env.PATH}` },
    expect: 1,
    contains: "could not read wrangler's answer",
    then: (_dir, out) =>
      /is not set|missing/i.test(out.replace(/[^\x20-\x7e\n]/g, '')) && !/could not read/.test(out)
        ? 'blamed the secrets instead of the output'
        : null,
  });

  /* And the other half: parsed-and-empty still MEANS no secrets are set. */
  gate('an empty array is an answer, not an unreadable one', {
    script: 'check-secrets.mjs',
    files: { '.dev.vars.example': EXAMPLE },
    env: { PATH: `${noneSet}:${process.env.PATH}` },
    expect: 1,
    contains: 'BREVO_API_KEY',
  });

  for (const d of [bothSet, oneSet, notDeployed, loggedOut, demandsJsonFlag, prettyTable, noneSet, tooOldForFlag]) {
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

const formFile = (body) => ({ 'src/components/LeadForm.astro': `<form>${body}</form>` });

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

/* A checkbox group posts every ticked box under ONE name — that is how the API
   receives several choices, so it must not read as a duplicate. */
gate('a checkbox group sharing one name passes', {
  script: 'check-form.mjs',
  files: formFile('<input type="checkbox" name="extras" value="a"><input type="checkbox" name="extras" value="b"><input type="radio" name="when" value="am"><input type="radio" name="when" value="pm">'),
  expect: 0,
});

gate('a checkbox and a text input sharing a name still fail', {
  script: 'check-form.mjs',
  files: formFile('<input type="checkbox" name="extras" value="a"><input type="text" name="extras">'),
  expect: 1,
  contains: 'overwrites the first',
});

/*
 * Since forms became data, LeadForm writes name={f.name} — an expression the
 * markup scan skips by design. Without reading forms.ts, the honeypot landmine
 * would simply have moved somewhere this gate does not look.
 */
const formsTs = (forms) => ({
  'src/components/LeadForm.astro': '<form><input name={f.name}><input name="company"></form>',
  'src/data/forms.ts':
    "import { services } from './services';\n" +
    'export const forms: Record<string, unknown> = {\n' +
    forms +
    '\n  // forms:import — imported forms are inserted above this line. Keep it.\n};\n',
});
const aForm = (key, fields, id = key) =>
  `  ${key}: { id: '${id}', page: '/contact/', anchor: '#quote', submitLabel: 'Send', success: 'Thanks', subject: 'New', nameFields: [], fields: [${fields}] },`;
const f = (name, extra = '') => `{ name: '${name}', label: '${name}', type: 'text'${extra} }`;

gate('definitions: the same name in two different forms passes', {
  script: 'check-form.mjs',
  files: formsTs(aForm('contact', `${f('email')}, ${f('message')}`) + '\n' + aForm('booking', f('email'))),
  expect: 0,
  contains: '2 form definition(s)',
});

gate('definitions: a field named company is the honeypot', {
  script: 'check-form.mjs',
  files: formsTs(aForm('contact', `${f('name')}, ${f('company')}`)),
  expect: 1,
  contains: 'HONEYPOT',
});

gate('definitions: two fields of one form sharing a name', {
  script: 'check-form.mjs',
  files: formsTs(aForm('contact', `${f('phone')}, ${f('phone')}`)),
  expect: 1,
  contains: 'used by two fields',
});

/* The quiet one: the field can never appear, so the API never requires it and
   DROPS whatever is posted for it. Every build and every submission stays green. */
gate('definitions: a showWhen naming a field that is not there', {
  script: 'check-form.mjs',
  files: formsTs(aForm('contact', f('detail', ", showWhen: { field: 'kind', anyOf: ['Other'] }"))),
  expect: 1,
  contains: 'DROPS its answer',
});

gate('definitions: a showWhen value no option can produce', {
  script: 'check-form.mjs',
  files: formsTs(
    aForm('contact', `{ name: 'kind', label: 'Kind', type: 'radio', options: ['One', 'Other'] }, ${f('detail', ", showWhen: { field: 'kind', anyOf: ['Other '] }")}`),
  ),
  expect: 1,
  contains: 'not one of its options',
});

/* Options built from an import cannot be read here; skipping beats guessing. */
gate('definitions: options built from an import are not guessed at', {
  script: 'check-form.mjs',
  files: formsTs(
    aForm('contact', `{ name: 'svc', label: 'Service', type: 'select', options: [...services.map((s) => s.title), 'Else'] }, ${f('detail', ", showWhen: { field: 'svc', anyOf: ['A real service'] }")}`),
  ),
  expect: 0,
});

gate('definitions: a key that is not the form id', {
  script: 'check-form.mjs',
  files: formsTs(aForm('booking', f('email'), 'bookings')),
  expect: 1,
  contains: 'looks a form up by id',
});

/* ────────────────────────────────────────────────────────────────────────
 * forms-import — a WordPress form plugin's export → src/data/forms.ts
 *
 * The fixtures in scripts/fixtures/forms/ are INVENTED forms written for this
 * file: no real site, no real recipient (example.com / example.org only).
 *
 * ⚠ THE "NOT CARRIED" CASES ARE THE POINT. Converting a rule the importer
 *   cannot express exactly would build a form that shows the wrong question to
 *   the wrong visitor and collects the wrong thing, behind a clean build. The
 *   cases below prove an unsupported rule is REPORTED and its field KEPT — and
 *   that a field required only while shown stops being required of everybody.
 * ──────────────────────────────────────────────────────────────────────── */

describe('forms-import');

const FORM_FIXTURES = join(KIT, 'scripts', 'fixtures', 'forms');
const fx = (name) => readFileSync(join(FORM_FIXTURES, name), 'utf8');
const fieldLine = (out, name) => out.split('\n').find((l) => l.includes(`{ name: '${name}'`)) ?? '';
const FORMS_WITH_MARKER = formsTs(aForm('contact', `${f('name')}, ${f('email')}`))['src/data/forms.ts'];

gate('Fluent: a show rule is carried, through the option VALUE to its label', {
  script: 'forms-import.mjs',
  files: { 'export.json': fx('fluent-forms.json') },
  args: ['export.json', '--print'],
  expect: 0,
  contains: "showWhen: { field: 'roomType', anyOf: ['Other'] }",
});

gate('Fluent: an unsupported operator is reported, the field kept and made optional', {
  script: 'forms-import.mjs',
  files: { 'export.json': fx('fluent-forms.json') },
  args: ['export.json', '--print'],
  expect: 0,
  contains: 'not carried: “Site access notes”',
  then: (_dir, out) => {
    const line = fieldLine(out, 'siteAccess');
    if (!line) return 'the field whose rule was not carried was DROPPED';
    if (/showWhen/.test(line)) return 'the field kept a rule that was reported as not carried';
    return /required/.test(line) ? 'a field required only while shown is now required of everybody' : null;
  },
});

gate('Fluent: "all of several answers" is not carried', {
  script: 'forms-import.mjs',
  files: { 'export.json': fx('fluent-forms.json') },
  args: ['export.json', '--print'],
  expect: 0,
  contains: 'not carried: “Decking size”',
});

/* A plugin field called company, imported as-is, becomes the honeypot. */
gate('Fluent: a field named company is renamed, never imported as the honeypot', {
  script: 'forms-import.mjs',
  files: { 'export.json': fx('fluent-forms.json') },
  args: ['export.json', '--form', '7', '--print'],
  expect: 0,
  contains: "name: 'companyName'",
  then: (_dir, out) => (/name: 'company'/.test(out) ? 'a field named company reached the snippet' : null),
});

gate('Fluent: a file upload is reported, not silently skipped', {
  script: 'forms-import.mjs',
  files: { 'export.json': fx('fluent-forms.json') },
  args: ['export.json', '--print'],
  expect: 0,
  contains: 'NOT IMPORTED: “Plans or photos”',
});

gate('Gravity: hide-when-not becomes show-when, exactly', {
  script: 'forms-import.mjs',
  files: { 'export.json': fx('gravity-forms.json') },
  args: ['export.json', '--print'],
  expect: 0,
  contains: "showWhen: { field: 'session', anyOf: ['Evening'] }",
  then: (_dir, out) =>
    out.includes("showWhen: { field: 'dietaryNeeds', anyOf: ['Other'] }") ? null : 'the plain show rule on a checkbox group was not carried',
});

gate('Gravity: a rule across two fields is not carried', {
  script: 'forms-import.mjs',
  files: { 'export.json': fx('gravity-forms.json') },
  args: ['export.json', '--print'],
  expect: 0,
  contains: 'not carried: “Access requirements”',
  then: (_dir, out) => (fieldLine(out, 'accessRequirements') ? null : 'the field was dropped with its rule'),
});

gate('Gravity: hide-when-is is not carried', {
  script: 'forms-import.mjs',
  files: { 'export.json': fx('gravity-forms.json') },
  args: ['export.json', '--print'],
  expect: 0,
  contains: 'not carried: “Who should we thank?”',
});

gate('CF7 export: Conditional Fields groups are carried', {
  script: 'forms-import.mjs',
  files: { 'export.xml': fx('contact-form-7.xml') },
  args: ['export.xml', '--print'],
  expect: 0,
  contains: "showWhen: { field: 'projectType', anyOf: ['Other'] }",
  then: (_dir, out) =>
    !out.includes("showWhen: { field: 'rooms', anyOf: ['Stairs'] }")
      ? 'the checkbox-group condition was not carried'
      : !out.includes('not carried: “Budget note”')
        ? 'a "greater than" condition was not reported'
        : null,
});

gate('CF7 template text, with text-mode conditions', {
  script: 'forms-import.mjs',
  files: { 'form.txt': fx('contact-form-7.txt') },
  args: ['form.txt', '--print'],
  expect: 0,
  contains: "showWhen: { field: 'rooms', anyOf: ['Stairs'] }",
});

/* Recipients are a business fact and personal data: printed, never committed. */
gate('writes between markers; recipients are printed, never written', {
  script: 'forms-import.mjs',
  files: { 'export.json': fx('fluent-forms.json'), 'src/data/forms.ts': FORMS_WITH_MARKER },
  args: ['export.json', '--form', '7', '--as', 'garden'],
  expect: 0,
  contains: 'enquiries@example.com',
  then: (dir) => {
    const run = () => spawnSync(process.execPath, [join(TEMPLATE_SCRIPTS, 'forms-import.mjs'), 'export.json', '--form', '7', '--as', 'garden'], { cwd: dir, encoding: 'utf8' });
    const written = readFileSync(join(dir, 'src/data/forms.ts'), 'utf8');
    if (!written.includes("  garden: {")) return 'forms.garden was not written';
    if (written.includes('enquiries@example.com')) return 'a notification recipient was written into the repo';
    const again = run();
    const twice = readFileSync(join(dir, 'src/data/forms.ts'), 'utf8');
    if (again.status !== 0) return `a rerun exited ${again.status}`;
    return (twice.match(/<forms:import key="garden">/g) ?? []).length === 1 ? null : 'a rerun added a second copy instead of replacing';
  },
});

gate('refuses to overwrite a form it did not write', {
  script: 'forms-import.mjs',
  files: { 'export.json': fx('fluent-forms.json'), 'src/data/forms.ts': FORMS_WITH_MARKER },
  args: ['export.json', '--form', '8', '--as', 'contact'],
  expect: 1,
  contains: 'not written by this command',
});

gate('malformed: form_fields that is not JSON', {
  script: 'forms-import.mjs',
  files: { 'export.json': fx('malformed-fluent.json') },
  args: ['export.json', '--print'],
  expect: 1,
  contains: 'form_fields is not valid JSON',
});

gate('malformed: a truncated export', {
  script: 'forms-import.mjs',
  files: { 'export.json': fx('truncated.json') },
  args: ['export.json', '--print'],
  expect: 1,
  contains: 'not valid JSON',
});

gate('JSON that is not a form export', {
  script: 'forms-import.mjs',
  files: { 'export.json': '{"name": "site", "version": "1.0.0"}' },
  args: ['export.json', '--print'],
  expect: 1,
  contains: 'not a Fluent Forms or Gravity Forms export',
});

gate('no file — usage', {
  script: 'forms-import.mjs',
  files: { 'placeholder.txt': '' },
  expect: 1,
  contains: 'usage',
});

gate('no forms.ts and no --print — refuses rather than guessing a path', {
  script: 'forms-import.mjs',
  files: { 'export.json': fx('gravity-forms.json') },
  args: ['export.json'],
  expect: 1,
  contains: 'run from the project root',
});

/* ────────────────────────────────────────────────────────────────────────
 * check:alt — the attribute axe proves exists and nobody reads
 *
 * ⚠ THE MUST-NOT-FIRE CASES ARE THE POINT HERE. Alt text is prose, and a check
 *   that argues with a real sentence is one people switch off — at which point
 *   its silence means nothing. Two rules were tightened while writing this, each
 *   because of a case below:
 *
 *     "Photo 2024 winners"   an unanchored camera pattern matched ordinary prose
 *     "Ada Lovelace"         a rule comparing alt to the FILENAME reported
 *                            correct alt on a well-named file as pasted
 * ──────────────────────────────────────────────────────────────────────── */
describe('check:alt');

/* `page` is taken further down this file by another gate's fixture. */
const builtPage = (body) => ({ 'dist/client/index.html': body });

for (const [label, rule, tag] of [
  ['a filename with an extension', 'a filename', '<img src="/a.webp" alt="DSC_0421.jpg">'],
  ['a camera filename', 'a filename', '<img src="/b.webp" alt="IMG_2938">'],
  ['a manifest key pasted in', 'a slug, not a sentence', '<img src="/c.webp" alt="hero-1200">'],
  ['a word that adds nothing', 'adds nothing', '<img src="/d.webp" alt="image">'],
  ['a bare "Logo"', 'adds nothing', '<img src="/e.webp" alt="Logo">'],
  ['a redundant opening', 'redundant opening', '<img src="/f.webp" alt="Photo of a kitchen">'],
]) {
  gate(`refuses ${label}`, {
    script: 'check-alt.mjs',
    files: builtPage(tag),
    args: ['--strict'],
    expect: 1,
    contains: rule,
  });
}

gate('refuses two different images sharing one description', {
  script: 'check-alt.mjs',
  files: builtPage('<img src="/h1.webp" alt="Our work"><img src="/h2.webp" alt="Our work">'),
  args: ['--strict'],
  expect: 1,
  contains: 'share this',
});

/* ── and the ones that must stay silent ─────────────────────────────────── */

for (const [label, tag] of [
  ['an empty alt is how you say "decorative"', '<img src="/d.webp" alt="">'],
  ['aria-hidden is not judged', '<img src="/h.webp" alt="image" aria-hidden="true">'],
  ['role=presentation is not judged', '<img src="/p.webp" alt="photo" role="presentation">'],
  ['"Screenshot of…" says something "Photo of…" does not', '<img src="/s.webp" alt="Screenshot of the booking dashboard">'],
  ['ONE image used twice shares its alt correctly', '<img src="/logo.svg" alt="Acme Plumbing"><img src="/logo.svg" alt="Acme Plumbing">'],
  ['a name that matches a well-chosen filename', '<img src="/ada-lovelace.webp" alt="Ada Lovelace">'],
  ['prose that happens to start with "Photo"', '<img src="/p.webp" alt="Photo 2024 winners">'],
  ['a single lowercase word is not a slug', '<img src="/b.webp" alt="bath">'],
  ['a hyphenated word inside a sentence', '<img src="/c.webp" alt="covid-19 poster">'],
  ['an alt that simply describes the picture', '<img src="/k.webp" alt="A plumber fitting a copper pipe under a kitchen sink">'],
]) {
  gate(label, {
    script: 'check-alt.mjs',
    files: builtPage(tag),
    args: ['--strict'],
    expect: 0,
    contains: 'every alt says something',
  });
}

/* Warn on staging, refuse on production — the same split as check-copy, and the
   reason the build passes one flag and not the other. */
gate('warns without --strict, so a draft can build', {
  script: 'check-alt.mjs',
  files: builtPage('<img src="/a.webp" alt="image">'),
  expect: 0,
  contains: 'tell a screen-reader user nothing',
});

gate('no dist at all refuses legibly', {
  script: 'check-alt.mjs',
  files: { 'placeholder.txt': '' },
  expect: 1,
  contains: 'no dist/',
});

/* ────────────────────────────────────────────────────────────────────────
 * check:contact — the number a visitor taps versus the number they read
 *
 * ⚠ THE UK CASE IS THE LOAD-BEARING ONE. A British number displays as
 *   `020 7946 0018` and dials as `+442079460018` — E.164 drops the domestic
 *   trunk zero — so a naive digit comparison reports every British site as
 *   broken. A check that is wrong about a whole country is a check that gets
 *   switched off, and then its silence means nothing.
 *
 * The numbers below are RESERVED FICTIONAL RANGES — `555-01xx` across the NANP,
 * `020 7946 xxxx` from Ofcom's drama range — so the provenance sweep that greps
 * `scripts` for anything phone-shaped can be answered from this comment instead
 * of by tracing a number nobody recognises.
 * ──────────────────────────────────────────────────────────────────────── */
describe('check:contact');

const contact = (body) => ({ 'src/data/business.ts': body });

const US = `const PHONE_E164 = '+14155550100';
export const business = {
  phone: { display: '(415) 555-0100', e164: PHONE_E164, href: \`tel:\${PHONE_E164}\` },
  email: { display: 'hello@example.com', href: \`mailto:\${EMAIL}\` },
} as const;
`;

gate('a number that reads as it dials passes', {
  script: 'check-contact.mjs',
  files: contact(US),
  expect: 0,
  contains: 'what the site shows is what it dials',
});

gate('a UK trunk zero is not a mismatch', {
  script: 'check-contact.mjs',
  files: contact(`const PHONE_E164 = '+442079460018';
export const business = {
  phone: { display: '020 7946 0018', e164: PHONE_E164, href: \`tel:\${PHONE_E164}\` },
} as const;
`),
  expect: 0,
});

gate('refuses a display and an e164 that are different numbers', {
  script: 'check-contact.mjs',
  files: contact(US.replace("(415) 555-0100", '(415) 555-0199')),
  expect: 1,
  contains: 'are different numbers',
});

/*
 * ⚠ RESOLVES ONE LEVEL OF INDIRECTION, and the first version did not. It read
 *   only quoted literals, so `e164: PHONE_E164` — the shape this check exists to
 *   encourage — reported as a MISSING field. A checker that only understands the
 *   form it is trying to eliminate fails on every site that took its advice.
 */
gate('reads an e164 held in a const, not only a literal', {
  script: 'check-contact.mjs',
  files: contact(US),
  expect: 0,
  /* Raw output, not `plain()` — that helper is defined further down the file, and
     a bare word does not need the colour stripped to be found. */
  then: (_dir, out) => (/missing/i.test(out) ? 'reported a const-held e164 as missing' : null),
});

gate('refuses a dial link typed out by hand', {
  script: 'check-contact.mjs',
  files: contact(US.replace('href: \`tel:\${PHONE_E164}\`', "href: 'tel:+1 (415) 555-0100'")),
  expect: 1,
  contains: 'typed out by hand',
});

gate('refuses a mailto no display field shows', {
  script: 'check-contact.mjs',
  files: contact(`export const business = {
  email: { display: 'hello@new.example.com', href: 'mailto:hello@old.example.com' },
} as const;
`),
  expect: 1,
  contains: 'no `display` field shows',
});

/* A site with no phone number is a real site, not a failure — and it says so
   rather than skipping in silence, because a renamed field looks the same. */
gate('a site with no phone block is not a failure', {
  script: 'check-contact.mjs',
  files: contact("export const business = { name: 'X' } as const;\n"),
  expect: 0,
  contains: 'nothing to compare',
});

gate('no business.ts at all refuses legibly', {
  script: 'check-contact.mjs',
  files: { 'placeholder.txt': '' },
  expect: 1,
  contains: 'not found',
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
 *   first one written. Sorted honestly, six needed a BROWSER, one needs a live
 *   zone, one submits to real search engines, and `verify.mjs` needed neither:
 *   it takes a URL, which is not the same thing as needing a deployment.
 *
 * ⚠ THEN "NEEDS A BROWSER" TURNED OUT TO BE A REASON TOO, in its second year.
 *   A browser points at localhost, and the fixture site is localhost, so all
 *   six are now covered above — two of them, `md-to-pdf` and the usage paths
 *   of `shots`, needed no server at all. The first run of those cases found
 *   `check-a11y` forcing the colour scheme with a flag Chrome does not have.
 *
 *   The lesson is the one this ledger keeps teaching: a reason nobody re-reads
 *   outlives the thing it was true about. What is left below is the two that
 *   reach a third party, and a third party cannot be pointed at localhost.
 */
const NETWORK = 'needs a live zone or a real third party';

const UNCOVERED = {
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
  /*
   * ⚠ A PORT THAT ANSWERS IS NOT PROOF IT IS OURS. Two clones of this repo ran
   *   `test:gates` at once, both counting up from the same base port, and one
   *   harness's probe got "ready" from the OTHER harness's fixture — carrying
   *   different faults. Its own fixture had died on EADDRINUSE. So each fixture
   *   echoes a token, and a port that answers with someone else's is skipped.
   */
  for (let attempt = 0; attempt < 20; attempt++) {
    const port = ++fixturePort;
    const token = `kit-${process.pid}-${port}`;
    const args = [FIXTURE_SITE, '--port', String(port), '--token', token, ...(faults ? ['--faults', faults] : [])];
    const child = spawn(process.execPath, args, { stdio: 'ignore' });
    const probe = `fetch('http://127.0.0.1:${port}/__ready').then((r) => r.text()).then((t) => process.exit(t === ${JSON.stringify(token)} ? 0 : 2)).catch(() => process.exit(1))`;
    for (let i = 0; i < 60; i++) {
      const status = spawnSync(process.execPath, ['-e', probe], { stdio: 'ignore' }).status;
      if (status === 0) return { child, origin: `http://127.0.0.1:${port}` };
      if (status === 2 || child.exitCode !== null) break; // someone else's port, or ours died on it
    }
    child.kill('SIGKILL');
  }
  throw new Error(`fixture-site did not start on any port up to ${fixturePort}`);
}

/** Strip the colour before looking for a mark, or nothing ever matches. */
const plain = (out) => out.replace(/\u001b\[[0-9;]*m/g, '');
const showsCheck = (out, mark, name) => plain(out).includes(`${mark} ${name}`);

function verifyGate(label, { faults = '', expect, mark, check, names }) {
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
      then: (_dir, out) => {
        if (!showsCheck(out, mark, check)) return `did not report ${JSON.stringify(`${mark} ${check}`)}`;
        /* `names` pins WHICH page or rule the report blamed. A check that fires
           on the right run for the wrong reason reads identically without it. */
        if (names && !plain(out).includes(names)) return `reported ${JSON.stringify(check)} without naming ${JSON.stringify(names)}`;
        return null;
      },
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
  ['a non-string field coerced into a lead', 'coerces-malformed', 'a non-string field is refused, not coerced and not a 500'],
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

/*
 * ── The inverse of the link check, and it needs BOTH marks ─────────────────
 *
 * A route nothing links to returns 200, sits in the sitemap and passes every
 * other gate. It warns rather than fails, so the exit code says nothing at all
 * here — the assertion is entirely on the mark, and the clean run beside it is
 * what separates "the check works" from "the check always fires".
 */
verifyGate('says nothing about orphans on a site where everything is linked', {
  expect: 0,
  mark: '✓',
  check: 'every route is linked from another page',
});

verifyGate('warns on a route nothing links to, and names it', {
  faults: 'orphan-route',
  expect: 0,
  mark: '!',
  check: 'every route is linked from another page',
  names: '/pricing/',
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

/* Vendors are detected by SIGNATURE, not by name. The name match reported Crisp chat on every
   WordPress block theme (`--wp--preset--shadow--crisp`) and Drift/Stripe/Clarity on ordinary
   copy. Output assertions, paired: words alone detect nothing, a loaded widget is detected. */
for (const [label, faults, check] of [
  ['does not report a vendor from words or a style preset', 'vendor-words', (md) => (/crisp|drift|stripe|clarity/i.test(md.split('## Third-party origins')[0]) ? 'reported a vendor that is not loaded' : null)],
  ['reports a vendor whose script is loaded', 'vendor-real', (md) => (/- \[ \] crisp/.test(md) ? null : 'did not report the loaded Crisp widget')],
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
      then: (dir) => {
        const file = join(dir, 'recon/integrations.md');
        if (!existsSync(file)) return 'wrote no recon/integrations.md';
        return check(readFileSync(file, 'utf8'));
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
 * The browser gates — six scripts the ledger excused, and one dead flag
 *
 * `UNCOVERED` carried six entries reading `BROWSER`, and that reason was the
 * same inherited excuse this file's header already describes: a browser points
 * at localhost perfectly well, and the fixture above is a localhost site. Two
 * of the six did not need a server at all — `md-to-pdf` renders a local file.
 *
 * ⚠ WHAT THE FIRST RUN OF THESE CASES FOUND. `check-a11y` forces the colour
 *   scheme with `--force-prefers-color-scheme`, which is NOT A CHROME SWITCH.
 *   Chrome ignores unknown flags in silence, so both passes measured whatever
 *   the machine was set to — light twice on a CI runner — while printing
 *   "clean in light and dark", and `a11y-evidence` wrote that sentence into a
 *   dated compliance document. The dark palette of every site built from this
 *   kit was unmeasured by the gate that reported measuring it.
 *
 *   It was introduced to fix a REAL escape (3.91:1 light, 4.83:1 dark, green
 *   locally and red in CI), reviewed, documented, and never once asked whether
 *   the flag did anything. Nothing it could print would have looked different.
 *
 *   The `dark-only-contrast` pair below is what makes that visible: a page that
 *   passes AA in light and fails in dark. `--only=light` must exit 0 and the
 *   two-scheme run must exit 1. Under the dead flag exactly one of those two is
 *   wrong on any given machine, whichever way it is set.
 * ──────────────────────────────────────────────────────────────────────── */
describe('browser gates — against a fixture site');

const TEMPLATE_MODULES = join(KIT, 'template', 'node_modules');

/**
 * Run a template script against a freshly started fixture site.
 *
 * `files` may be a function of the origin, because the port is not known until
 * the fixture is up and `.pa11yci.json` has to carry it.
 */
function againstFixture(label, { script, faults = '', args = [], passOrigin = true, files = {}, ...rest }) {
  let fixture;
  try {
    fixture = startFixture(faults);
  } catch (err) {
    results.push({ gate: currentGate, label, ok: false, detail: String(err.message) });
    return;
  }
  try {
    gate(label, {
      script,
      files: typeof files === 'function' ? files(fixture.origin) : files,
      args: passOrigin ? [...args, fixture.origin] : args,
      ...rest,
    });
  } finally {
    fixture.child.kill('SIGKILL');
  }
}

/* ── check-console — errors and failed requests a fetch cannot see ────────── */

againstFixture('a clean site has no console errors and no failed requests', {
  script: 'check-console.mjs',
  expect: 0,
  contains: 'no console errors and no failed requests',
});

againstFixture('refuses a script that throws', {
  script: 'check-console.mjs',
  faults: 'console-error',
  expect: 1,
  contains: 'uncaught: ReferenceError',
});

againstFixture('refuses an asset that 404s after the page is served', {
  script: 'check-console.mjs',
  faults: 'asset-404',
  expect: 1,
  contains: '/gone.png',
});

/* ── check-reflow — WCAG 1.4.10, which no status code can answer ──────────── */

againstFixture('a clean site reflows at 320px and at 200% text', {
  script: 'check-reflow.mjs',
  expect: 0,
  contains: 'no horizontal scroll',
});

/* Pinned to the OFFENDER, not just the exit code. Reporting that a page
   overflows without naming what overflowed is the difference between a fix and
   an afternoon. */
againstFixture('refuses a fixed-width element wider than a 320px viewport', {
  script: 'check-reflow.mjs',
  faults: 'overflow-320',
  expect: 1,
  contains: 'div (480px)',
});

/*
 * ── check-a11y and a11y-evidence — both need the template's dependencies ───
 *
 * They shell out to `npx pa11y-ci`, so the fixture directory gets a link to
 * template/node_modules and npx resolves it the way it would in a real site.
 * Without it npx would try to FETCH pa11y-ci from the registry, which turns a
 * gate test into a network test and passes for the wrong reason.
 *
 * `rmSync` unlinks a symlink rather than walking into it — verified before this
 * was written, because the harness deletes every fixture directory and the link
 * points at a real node_modules.
 */
const withTemplateModules = (extra) => (dir) => {
  symlinkSync(TEMPLATE_MODULES, join(dir, 'node_modules'), 'junction');
  if (extra) extra(dir);
};

const pa11yConfig = (origin) => ({
  '.pa11yci.json': JSON.stringify(
    {
      defaults: {
        standard: 'WCAG2AA',
        runners: ['axe', 'htmlcs'],
        timeout: 30000,
        concurrency: 1,
        chromeLaunchConfig: { args: ['--no-sandbox'] },
      },
      urls: [`${origin}/`],
    },
    null,
    2,
  ),
});

/*
 * Both preconditions, checked rather than assumed — and the skip says which one
 * failed. "Skipped" with no reason is how a suite quietly stops covering
 * something on one platform and nobody notices for a year.
 */
const cannotLinkModules = (() => {
  if (!existsSync(TEMPLATE_MODULES)) {
    return 'template/node_modules is absent, so npx would have to DOWNLOAD pa11y-ci — run `cd template && npm ci`';
  }
  const probe = mkdtempSync(join(tmpdir(), 'kit-link-'));
  try {
    symlinkSync(TEMPLATE_MODULES, join(probe, 'node_modules'), 'junction');
    return null;
  } catch (err) {
    return `this platform refused a directory link (${err.code}), which pa11y-ci needs to resolve`;
  } finally {
    rmSync(probe, { recursive: true, force: true });
  }
})();

if (cannotLinkModules) {
  results.push({
    gate: currentGate,
    label: 'check-a11y and a11y-evidence cases',
    ok: true,
    skipped: true,
    detail: `skipped — ${cannotLinkModules}`,
  });
} else {
  againstFixture('a clean site passes AA in both schemes', {
    script: 'check-a11y.mjs',
    passOrigin: false,
    files: pa11yConfig,
    setup: withTemplateModules(),
    expect: 0,
    contains: 'clean in light and dark',
  });

  /* ⚠ THE PAIR. Same site, same page, one scheme each way. */
  againstFixture('a dark-only contrast failure is invisible in light', {
    script: 'check-a11y.mjs',
    faults: 'dark-only-contrast',
    passOrigin: false,
    args: ['--only=light'],
    files: pa11yConfig,
    setup: withTemplateModules(),
    expect: 0,
    contains: 'only one scheme measured',
  });

  againstFixture('and the two-scheme run refuses it', {
    script: 'check-a11y.mjs',
    faults: 'dark-only-contrast',
    passOrigin: false,
    files: pa11yConfig,
    setup: withTemplateModules(),
    expect: 1,
    contains: 'dark has errors',
  });

  /*
   * The evidence pack is a DOCUMENT, so the exit code proves almost nothing —
   * it writes the file either way. The assertion is on what it wrote, and one
   * run carries both directions: light clean and dark failing, in the same
   * table, from the same page.
   *
   * `scripts/` is copied in because the pack runs `node scripts/check-reflow.mjs`
   * relative to the site root. Without it the reflow section records "did not
   * run" and nobody would notice the pack had a hole in it.
   */
  againstFixture('the evidence pack records the scheme that failed', {
    script: 'a11y-evidence.mjs',
    faults: 'dark-only-contrast',
    files: pa11yConfig,
    setup: withTemplateModules((dir) => {
      cpSync(TEMPLATE_SCRIPTS, join(dir, 'scripts'), { recursive: true });
    }),
    expect: 0,
    then: (dir) => {
      const packDir = join(dir, 'docs', 'a11y-evidence');
      if (!existsSync(packDir)) return 'wrote no evidence pack';
      const [file] = readdirSync(packDir);
      const pack = readFileSync(join(packDir, file), 'utf8');
      if (!/\|\s*light\s*\|\s*0\s*\|/.test(pack)) return 'did not record a clean light pass';
      if (!/\|\s*dark\s*\|\s*[1-9]/.test(pack)) return 'recorded no dark failure — the pack claims a pass that did not happen';
      if (!/no horizontal scroll/.test(pack)) return 'the reflow section did not run inside the pack';
      return null;
    },
  });
  /*
   * ⚠ THE NO-HOST FORM, WHICH IS WHERE THE TWO HALVES USED TO DISAGREE.
   *
   *   Without a host argument, pa11y reads `.pa11yci.json` and check-reflow used
   *   to fall back to localhost:8788 — so a config pointing anywhere else
   *   produced one dated document describing two different sites, and said
   *   nothing about it. The reflow section reporting a real result is what
   *   proves both halves were handed the same origin.
   */
  againstFixture('the pack measures ONE origin when no host is given', {
    script: 'a11y-evidence.mjs',
    passOrigin: false,
    files: pa11yConfig,
    setup: withTemplateModules((dir) => {
      cpSync(TEMPLATE_SCRIPTS, join(dir, 'scripts'), { recursive: true });
    }),
    expect: 0,
    then: (dir) => {
      const packDir = join(dir, 'docs', 'a11y-evidence');
      if (!existsSync(packDir)) return 'wrote no evidence pack';
      const pack = readFileSync(join(packDir, readdirSync(packDir)[0]), 'utf8');
      if (/No routes found/.test(pack)) return 'the reflow section ran against a different origin than pa11y did';
      if (!/no horizontal scroll/.test(pack)) return 'the reflow section produced no result';
      if (/localhost:8788/.test(pack)) return 'the pack names localhost:8788, which is not what it measured';
      return null;
    },
  });
}

/* ── shots — the visual record, and the capture it must refuse to file ────── */

againstFixture('captures a page and writes the file', {
  script: 'shots.mjs',
  args: ['--after'],
  expect: 0,
  then: (dir) => {
    const out = join(dir, 'shots', 'after');
    if (!existsSync(out)) return 'wrote no screenshots directory';
    const pngs = readdirSync(out).filter((f) => f.endsWith('.png'));
    return pngs.length ? null : 'the run reported success and wrote no PNG';
  },
});

/*
 * ⚠ AN UNSTYLED CAPTURE IS THE ONE IT MUST NOT FILE. A page whose stylesheet
 *   never arrived screenshots perfectly — it just looks like a design disaster,
 *   and filed in a handover it turns a harness problem into a design argument.
 */
againstFixture('refuses a capture whose stylesheet never arrived', {
  script: 'shots.mjs',
  faults: 'no-stylesheet',
  args: ['--after'],
  expect: 1,
  contains: 'stylesheet did not arrive',
});

/* Both reachable with no server and no browser. */
gate('shots without --before or --after is a usage error', {
  script: 'shots.mjs',
  files: {},
  args: ['http://127.0.0.1:9'],
  expect: 1,
  contains: 'Say which side this is',
});

/* ────────────────────────────────────────────────────────────────────────
 * match — a faithful rebuild, measured
 *
 * Two fixture sites at once: a clean one as the OLD side and one carrying the
 * fault as the NEW side. Every fault here is invisible on either site alone —
 * each page is valid, returns 200 and passes every per-page check — which is
 * exactly why `shots` plus a skimming eye let it through.
 *
 * ⚠ EVERY REFUSAL HAS ITS CLEAN TWIN with the same flags. A comparison that
 *   reports drift between two copies of the same page is measuring the harness,
 *   and it would "catch" every fault below for the wrong reason.
 * ──────────────────────────────────────────────────────────────────────── */
describe('match — old site against new, section by section');

const MATCH_FILES = { 'recon/urls.txt': '/\n/about/\n/retired/ # gone-on-old-site\n' };

function againstTwoSites(label, { oldFaults = '', newFaults = '', args = [], ...rest }) {
  let before;
  let after;
  try {
    before = startFixture(oldFaults);
    after = startFixture(newFaults);
  } catch (err) {
    before?.child.kill('SIGKILL');
    results.push({ gate: currentGate, label, ok: false, detail: String(err.message) });
    return;
  }
  try {
    gate(label, {
      script: 'match.mjs',
      files: MATCH_FILES,
      args: ['--old', before.origin, '--new', after.origin, ...args],
      ...rest,
    });
  } finally {
    before.child.kill('SIGKILL');
    after.child.kill('SIGKILL');
  }
}

const matchJson = (dir) => {
  const file = join(dir, 'shots', 'match', 'match.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
};

againstTwoSites('two copies of the same site match, at every width', {
  args: ['--only=/about/'],
  expect: 0,
  contains: 'every compared section within 3%',
  then: (dir) => {
    const json = matchJson(dir);
    if (!json) return 'wrote no match.json';
    if (!existsSync(join(dir, 'shots', 'match', 'index.html'))) return 'wrote no report';
    const vps = json.routes[0]?.viewports ?? [];
    if (vps.map((v) => v.name).join() !== 'mobile,tablet,desktop') return `compared ${vps.map((v) => v.name).join() || 'no viewport'}`;
    /* Zero sections compared is not a pass; it is a detector that found nothing. */
    if (vps.some((v) => v.sections.length < 3)) return 'found fewer than the three sections the page has';
    return null;
  },
});

/* Pinned to WHERE — route, viewport and section. "Something drifted" is an afternoon. */
againstTwoSites('refuses a section that changed colour and size, and names it', {
  newFaults: 'section-drift',
  args: ['--only=/about/'],
  expect: 1,
  contains: '/about/ · mobile · section 2',
});

againstTwoSites('--report-only writes the same verdict and exits 0', {
  newFaults: 'section-drift',
  args: ['--only=/about/', '--viewports=mobile', '--report-only'],
  expect: 0,
  then: (dir) => {
    const json = matchJson(dir);
    if (!json) return 'wrote no match.json';
    if (json.passed !== false) return 'recorded a pass for a page that drifted';
    return json.failures.some((f) => f.section === 'section 2') ? null : 'did not record section 2 as the failure';
  },
});

/* Text: no browser, so the words are measured on their own. */
againstTwoSites('the same words on both sides pass, without a browser', {
  args: ['--text-only'],
  expect: 0,
  then: (dir) => {
    const json = matchJson(dir);
    if (!json) return 'wrote no match.json';
    if (json.routes.some((r) => r.route === '/retired/')) return 'compared a route tagged gone-on-old-site';
    return json.routes.length === 2 && json.routes.every((r) => r.text?.ratio === 1) ? null : 'did not compare both pages in full';
  },
});

againstTwoSites('refuses a dropped paragraph, and names the missing words', {
  newFaults: 'drop-paragraph',
  args: ['--text-only'],
  expect: 1,
  contains: 'couriers, deliver, parcels',
});

/* A reworded heading costs one word of ~60, so the ratio still passes — the
   heading check is the only thing that sees it. */
againstTwoSites('refuses a renamed heading the word ratio lets through', {
  newFaults: 'rename-heading',
  args: ['--text-only'],
  expect: 1,
  contains: 'headings: missing: “Third section”',
});

againstTwoSites('refuses a page the new site no longer serves', {
  newFaults: 'route-404',
  args: ['--text-only'],
  expect: 1,
  contains: '/about/ — missing: HTTP 404 on the new site',
});

/*
 * ⚠ ONE HUNG PAGE MUST NOT FAIL EVERY ROUTE AFTER IT. On the first real pair
 *   this ran against, a capture timed out, Chrome closed the target, and every
 *   later capture failed on "Session closed" — routes that were fine, reported
 *   as errors. The home page here locks its renderer after load; it must be
 *   reported, and /about/ — next in line — must still be compared, by a
 *   relaunched browser.
 */
againstTwoSites('a page that hangs the browser fails alone; the next route is still compared', {
  newFaults: 'renderer-hang',
  args: ['--viewports=mobile', '--timeout=5'],
  expect: 1,
  contains: '/ · mobile — error',
  then: (dir) => {
    const json = matchJson(dir);
    if (!json) return 'wrote no match.json';
    const about = json.routes.find((r) => r.route === '/about/');
    if (!about?.viewports.length || about.viewports.some((v) => v.error)) return '/about/ was not compared after the hang';
    if (!json.browser?.relaunches) return 'recorded no relaunch';
    return null;
  },
});

/*
 * ⚠ VISUALLY HIDDEN TEXT IS CONTENT ON THE NEW SIDE, CHROME ON THE OLD. A
 *   rebuild that carries a decorative marquee's words once for assistive tech
 *   was reported as having lost them, on a real pair. And a WordPress
 *   `.screen-reader-text` label is UI the new site has no reason to keep.
 *   The refusal twin is `drop-paragraph` above: the same words, actually gone.
 */
againstTwoSites('words carried in a visually hidden copy on the new side are kept', {
  newFaults: 'sr-copy',
  args: ['--text-only'],
  expect: 0,
  then: (dir) => (matchJson(dir)?.routes.every((r) => r.text?.ratio === 1) ? null : 'counted hidden copy as missing'),
});

againstTwoSites("a WordPress screen-reader label on the old side is not content the new side lost", {
  oldFaults: 'sr-ui-label',
  args: ['--text-only'],
  expect: 0,
  then: (dir) => (matchJson(dir)?.routes.some((r) => r.text?.missing.includes('search')) ? 'reported a UI label as a lost word' : null),
});

/*
 * ⚠ PAIRING BY POSITION FAILS EVERYTHING AFTER ONE INSERTED SECTION. Sections
 *   are anchored by their headings first, so a section the rebuild added is
 *   reported on its own and the two after it still pair with their originals.
 */
againstTwoSites('an added section is named, and the sections after it still pair with their originals', {
  newFaults: 'insert-section',
  args: ['--only=/about/', '--viewports=desktop'],
  expect: 1,
  contains: 'only on the new site',
  then: (dir) => {
    const v = matchJson(dir)?.routes[0]?.viewports[0];
    if (!v) return 'compared nothing';
    const later = v.sections.filter((s) => /Second section|Third section/.test(s.title));
    if (later.length !== 2) return `found ${later.length} of the two later sections`;
    return later.every((s) => s.percent <= 3) ? null : `paired by position: ${later.map((s) => `${s.label} ${s.percent}%`).join(', ')}`;
  },
});

/* A wrapper of paragraphs is one section, not one per paragraph — a real legal
   page came out as 73 "sections" against the rebuild's 4. */
againstTwoSites('a page of running text is one section, not one per paragraph', {
  oldFaults: 'flat-text',
  args: ['--only=/about/', '--viewports=desktop', '--report-only'],
  expect: 0,
  then: (dir) => {
    const v = matchJson(dir)?.routes[0]?.viewports[0];
    if (!v) return 'compared nothing';
    return v.oldSections === 1 ? null : `found ${v.oldSections} sections in one wrapper of paragraphs`;
  },
});

/* Filename alt text is the defect a rebuild fixes, not copy it lost. */
againstTwoSites('alt text written from a filename is not a word the new site lost', {
  oldFaults: 'filename-alt',
  args: ['--text-only'],
  expect: 0,
});

/*
 * ⚠ THE FREEZE IS ASSERTED AGAINST MOTION, NOT AGAINST A STILL PAGE. Both
 *   sides carry a CSS marquee, a parallax layer whose inline transform a
 *   script rewrites every 50ms, an AOS-style element hidden until a script
 *   reveals it and an endless element.animate() — and the new side is the
 *   same page caught at another moment. Before the strict freeze this pair
 *   measured 33–43% different on the "Moving parts" section: a faithful
 *   rebuild could never get under the threshold, and every real difference
 *   hid in the noise. It must now measure as the same page.
 */
againstTwoSites('the same page with its motion at a different phase measures ~0% — the freeze holds', {
  oldFaults: 'motion',
  newFaults: 'motion,motion-phase',
  args: ['--only=/about/', '--no-states'],
  expect: 0,
  timeout: 300000,
  then: (dir) => {
    const json = matchJson(dir);
    if (!json) return 'wrote no match.json';
    const vps = json.routes[0]?.viewports ?? [];
    if (vps.length !== 3) return `compared ${vps.length} width(s)`;
    const moving = vps.map((v) => v.sections.find((s) => s.title === 'Moving parts'));
    if (moving.some((s) => !s)) return 'did not find the moving section at every width';
    const worst = Math.max(...vps.flatMap((v) => v.sections.map((s) => s.percent ?? 0)));
    return worst <= 0.5 ? null : `worst section ${worst}% — the motion was measured as drift`;
  },
});

/*
 * ⚠ INTERACTION STATES, BOTH DIRECTIONS. The branded fixture has a menu toggle
 *   under 900px and a hover dropdown ("Services") above it. Against itself both
 *   states must be found on each side and measure as equal; against a copy
 *   with neither, each must be reported as lost — by name, not as a crash and
 *   not as silence.
 */
againstTwoSites('the open menu and a hover dropdown are compared as states, and match themselves', {
  oldFaults: 'branded',
  newFaults: 'branded',
  args: ['--only=/about/', '--viewports=mobile,desktop'],
  expect: 0,
  timeout: 300000,
  then: (dir) => {
    const json = matchJson(dir);
    if (!json) return 'wrote no match.json';
    const vp = (n) => json.routes[0]?.viewports.find((v) => v.name === n);
    const menu = vp('mobile')?.sections.find((s) => s.label === 'state: menu open');
    const dropdown = vp('desktop')?.sections.find((s) => s.label === 'state: dropdown "Services"');
    const scrolled = vp('desktop')?.sections.find((s) => s.label === 'state: header scrolled');
    if (!menu) return 'no "state: menu open" at mobile';
    if (!dropdown) return 'no "state: dropdown "Services"" at desktop';
    if (!scrolled) return 'no "state: header scrolled" at desktop';
    for (const s of [menu, dropdown, scrolled]) if (s.percent === null || s.percent > 0.5) return `${s.label} measured ${s.percent}%`;
    return null;
  },
});

againstTwoSites('a rebuild without the menu and the dropdown is refused, state by state', {
  oldFaults: 'branded',
  newFaults: 'branded,no-menu',
  args: ['--only=/about/', '--viewports=mobile,desktop'],
  expect: 1,
  timeout: 300000,
  contains: '/about/ · mobile · state: menu open — visual: 100% different — found on the old site, not on the new one',
  then: (_dir, out) => (out.includes('/about/ · desktop · state: dropdown "Services" — visual: 100%') ? null : 'did not name the lost dropdown'),
});

/*
 * ⚠ THE OLD SIDE IS CACHED, AND A SECOND RUN MUST NOT RECAPTURE IT. Three runs
 *   in ONE project directory: the first captures, the second reuses the cache
 *   (and says so), --refresh-old captures again. Asserted on what each run
 *   prints, because a cache that is written and never read looks identical in
 *   the report.
 */
{
  const label = 'the old side is captured once, reused on the next run, recaptured with --refresh-old';
  let before;
  let after;
  let dir;
  try {
    before = startFixture('');
    after = startFixture('');
    dir = fixture(MATCH_FILES);
    const run = (extra) => {
      const r = spawnSync(
        process.execPath,
        [join(TEMPLATE_SCRIPTS, 'match.mjs'), '--old', before.origin, '--new', after.origin, '--only=/about/', '--viewports=mobile', ...extra],
        { cwd: dir, encoding: 'utf8', timeout: 180000, killSignal: 'SIGKILL' },
      );
      return { status: r.status, out: plain(`${r.stdout ?? ''}${r.stderr ?? ''}`) };
    };
    /* The first run WITH states and the others without: a cached state the second run did
       not ask for was once compared against nothing and failed a clean pair at 100%. */
    const first = run([]);
    const second = run(['--no-states']);
    const third = run(['--refresh-old', '--no-states']);
    const problem =
      first.status !== 0 ? `first run exit ${first.status}`
      : !/old: captured/.test(first.out) ? 'the first run did not capture the old side'
      : second.status !== 0 ? `second run exit ${second.status}`
      : !/old: cached \(\d+m\)/.test(second.out) ? 'the second run did not reuse the cached old side'
      : !/old side: 1 cached[^,]*, 0 captured/.test(second.out) ? 'the second run captured the old side anyway'
      : third.status !== 0 ? `--refresh-old run exit ${third.status}`
      : !/old: recaptured — asked for with --refresh-old/.test(third.out) ? '--refresh-old reused the cache'
      : null;
    results.push({ gate: currentGate, label, ok: !problem, detail: problem ?? 'exit 0' });
  } catch (err) {
    results.push({ gate: currentGate, label, ok: false, detail: String(err.message) });
  } finally {
    before?.child.kill('SIGKILL');
    after?.child.kill('SIGKILL');
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
}

/*
 * ⚠ --only, BOTH FORMS. A filter that is silently ignored compares every
 *   route and looks like a run that worked — the owner saw exactly that. The
 *   space form, the comma list, and a valueless --only (which used to mean "no
 *   filter") are each pinned. --text-only: route selection needs no browser.
 */
againstTwoSites('--only /about/ (space form) selects only that route', {
  args: ['--text-only', '--only', '/about/'],
  expect: 0,
  then: (dir) => {
    const routes = matchJson(dir)?.routes.map((r) => r.route) ?? [];
    return routes.join() === '/about/' ? null : `compared ${routes.join(' ') || 'nothing'}`;
  },
});

againstTwoSites('--only=/about/,/contact/ selects both, and nothing else', {
  files: { 'recon/urls.txt': '/\n/about/\n/contact/\n' },
  args: ['--text-only', '--only=/about/,/contact/'],
  expect: 0,
  then: (dir) => {
    const routes = matchJson(dir)?.routes.map((r) => r.route) ?? [];
    return routes.join() === '/about/,/contact/' ? null : `compared ${routes.join(' ') || 'nothing'}`;
  },
});

gate('match refuses --only with no value instead of comparing everything', {
  script: 'match.mjs',
  files: MATCH_FILES,
  args: ['--old', 'http://127.0.0.1:9', '--new', 'http://127.0.0.1:10', '--only', '--text-only'],
  expect: 1,
  contains: '--only needs a value',
});

gate('match refuses an unknown flag instead of ignoring it', {
  script: 'match.mjs',
  files: MATCH_FILES,
  args: ['--old', 'http://127.0.0.1:9', '--new', 'http://127.0.0.1:10', '--onyl=/about/'],
  expect: 1,
  contains: 'unknown flag --onyl',
});

/*
 * ⚠ A RUN MUST NEVER SILENTLY HANG. The new home page locks its renderer, and
 *   --timeout is a minute, so only the whole-run budget (6s here) can end it:
 *   it must stop, name what did not finish, still write the report — and exit
 *   1 even though nothing "failed", because an incomplete comparison is not a
 *   pass. The spawn is capped too, so a budget that does not fire fails this
 *   case instead of hanging the suite.
 */
againstTwoSites('a run past its --budget stops, names what did not finish, and exits 1', {
  newFaults: 'renderer-hang',
  args: ['--viewports=mobile', '--timeout=60', '--budget=0.1', '--no-states'],
  expect: 1,
  timeout: 120000,
  contains: 'run budget of 0.1 min used up',
  then: (dir, out) => {
    const json = matchJson(dir);
    if (!json) return 'wrote no match.json — what finished was lost';
    if (!json.budget?.ranOut) return 'match.json does not record the budget running out';
    if (json.passed) return 'recorded an incomplete run as passed';
    if (!/not compared: \//.test(plain(out))) return 'did not name the route left unfinished';
    const about = json.routes.find((r) => r.route === '/about/');
    return about?.viewports.some((v) => !v.error) ? null : '/about/, which did not hang, was not compared';
  },
});

gate('match refuses a budget that is not a number of minutes', {
  script: 'match.mjs',
  files: MATCH_FILES,
  args: ['--old', 'http://127.0.0.1:9', '--new', 'http://127.0.0.1:10', '--budget=forever'],
  expect: 1,
  contains: '--budget is minutes',
});

gate('match --watch without --only is a usage error', {
  script: 'match.mjs',
  files: MATCH_FILES,
  args: ['--old', 'http://127.0.0.1:9', '--new', 'http://127.0.0.1:10', '--watch'],
  expect: 1,
  contains: '--watch needs --only',
});

gate('match refuses a timeout that is not a number of seconds', {
  script: 'match.mjs',
  files: MATCH_FILES,
  args: ['--old', 'http://127.0.0.1:9', '--new', 'http://127.0.0.1:10', '--timeout=soon'],
  expect: 1,
  contains: '--timeout is seconds',
});

/* Usage — reachable with no server and no browser. */
gate('match without --old and --new is a usage error', {
  script: 'match.mjs',
  files: MATCH_FILES,
  args: [],
  expect: 1,
  contains: '--old is required',
});

gate('match refuses the same origin on both sides', {
  script: 'match.mjs',
  files: MATCH_FILES,
  args: ['--old', 'http://127.0.0.1:9', '--new', 'http://127.0.0.1:9/'],
  expect: 1,
  contains: 'same origin',
});

gate('match refuses a threshold that is not a percentage', {
  script: 'match.mjs',
  files: MATCH_FILES,
  args: ['--old', 'http://127.0.0.1:9', '--new', 'http://127.0.0.1:10', '--threshold=lots'],
  expect: 1,
  contains: '--threshold is a percentage',
});

/* ────────────────────────────────────────────────────────────────────────
 * design — the old site's design, measured, and written into tokens.css
 *
 * ⚠ THE CAPTURE IS ASSERTED BY VALUE, NOT BY EXIT CODE. A design capture
 *   that measured nothing still writes four files and exits 0 — the report
 *   just says "none found" in every row, which reads like a plain site. The
 *   `branded` fixture carries known faces, a known palette, known sizes and a
 *   known menu, and every case below names the value it expects back.
 *
 * ⚠ THE --apply CASE RUNS `tells` AFTERWARDS, and that is how it earned its
 *   place: the first run of it found tells testing `--unset:` against the raw
 *   file, where the header comment's own "then delete --unset:" matched — so
 *   the marker could never clear, on any project, however it was removed.
 * ──────────────────────────────────────────────────────────────────────── */
describe('design');

const TEMPLATE_TOKENS = readFileSync(join(KIT, 'template', 'src', 'styles', 'tokens.css'), 'utf8');
const DESIGN_SITE = {
  'src/styles/tokens.css': TEMPLATE_TOKENS,
  'src/pages/index.astro': '---\nconst unbuilt = true;\n---\n<p>scaffold</p>\n',
  'recon/urls.txt': '# Inventory of https://old-site.example\n/\n/about/\n',
};
const readJson = (dir, rel) => JSON.parse(readFileSync(join(dir, rel), 'utf8'));
const tokenOf = (proposal, name) => proposal.vars.find((v) => v.name === name)?.value;

gate('no URL and no --apply is a usage error', {
  script: 'design.mjs',
  files: {},
  args: [],
  expect: 1,
  contains: 'usage: npm run design',
});

gate('refuses an internal host without --allow-internal', {
  script: 'design.mjs',
  files: {},
  args: ['http://127.0.0.1:9/'],
  expect: 1,
  contains: 'blocked internal host',
});

gate('--apply with nothing captured refuses rather than writing nothing', {
  script: 'design.mjs',
  files: { 'src/styles/tokens.css': TEMPLATE_TOKENS },
  args: ['--apply'],
  expect: 1,
  contains: 'no proposal to apply',
});

/* The refusal that protects a project's decisions: a re-run must not quietly
   overwrite a tokens.css somebody already decided. */
gate('--apply refuses a tokens.css that is already decided', {
  script: 'design.mjs',
  files: {
    'src/styles/tokens.css': TEMPLATE_TOKENS.replace(/^\s*--unset:[^\n]*\n/m, ''),
    'recon/design.json': JSON.stringify({ origin: 'https://old-site.example', capturedAt: '2026-01-01', proposal: { vars: [{ name: '--brand-600', value: '#123456', why: 'test' }] } }),
  },
  args: ['--apply'],
  expect: 1,
  contains: 'already decided',
  then: (dir) => (readFileSync(join(dir, 'src/styles/tokens.css'), 'utf8').includes('#123456') ? 'it overwrote the decided file anyway' : null),
});

gate('--apply alone writes the saved proposal and keeps the file\'s shape', {
  script: 'design.mjs',
  files: {
    'src/styles/tokens.css': TEMPLATE_TOKENS,
    'recon/design.json': JSON.stringify({ origin: 'https://old-site.example', capturedAt: '2026-01-01', proposal: { vars: [{ name: '--brand-600', value: '#123456', why: 'test' }, { name: '--text', value: 'var(--ink-900)', why: 'test' }] } }),
  },
  args: ['--apply'],
  expect: 0,
  then: (dir) => {
    const css = readFileSync(join(dir, 'src/styles/tokens.css'), 'utf8');
    if (!/--brand-600: #123456;/.test(css)) return 'the value was not written';
    if (/^\s*--unset:/m.test(css)) return '--unset is still declared';
    if (!css.includes('THIS FILE SHIPS UNDECIDED ON PURPOSE')) return 'the header comment was lost';
    /* Only the :root declaration moves — .on-dark must keep inverting. */
    if (!/\.on-dark \{[\s\S]*--text: var\(--white\);/.test(css)) return '.on-dark --text was overwritten too';
    return null;
  },
});

againstFixture('measures the faces, palette, sizes and layout it was given', {
  script: 'design.mjs',
  faults: 'branded',
  args: ['--allow-internal'],
  files: DESIGN_SITE,
  expect: 0,
  then: (dir) => {
    const d = readJson(dir, 'recon/design.json');
    const pr = d.proposal;
    if (d.pages.length !== 2) return `measured ${d.pages.length} page(s), wanted the home page plus one family`;
    if (pr.fonts.display?.family !== 'Fixture Display') return `display face ${pr.fonts.display?.family}`;
    if (pr.fonts.body?.family !== 'Fixture Sans') return `body face ${pr.fonts.body?.family}`;
    const want = { ground: '#faf8f4', ink: '#222222', brand: '#145a8c', accent: '#c85028' };
    for (const [role, hex] of Object.entries(want)) if (pr.palette[role]?.hex !== hex) return `${role} ${pr.palette[role]?.hex}, wanted ${hex}`;
    const t = d.aggregate.typography;
    if (t.mobile.h1?.fontSize !== '40px' || t.desktop.h1?.fontSize !== '64px') return `h1 ${t.mobile.h1?.fontSize} → ${t.desktop.h1?.fontSize}`;
    if (t.desktop.p?.fontSize !== '18px') return `p ${t.desktop.p?.fontSize}`;
    const tokens = { '--width-max': '1152px', '--radius-unit': '0.75', '--header-h': '5rem', '--accent-500': '#c85028', '--brand-600': '#145a8c' };
    for (const [name, value] of Object.entries(tokens)) if (tokenOf(pr, name) !== value) return `${name} ${tokenOf(pr, name)}, wanted ${value}`;
    /* The restraint rule: 64px is past the 3.9rem cap, so it is capped and said. */
    if (!/3\.9rem\)$/.test(tokenOf(pr, '--step-6') ?? '')) return `--step-6 ${tokenOf(pr, '--step-6')} is not capped at 3.9rem`;
    if (!pr.warnings.some((w) => w.includes('--uncapped'))) return 'the cap was applied silently';
    const proposed = readFileSync(join(dir, 'recon/tokens.proposed.css'), 'utf8');
    if (!proposed.includes('--accent-500: #c85028;')) return 'tokens.proposed.css does not carry the accent';
    if (!proposed.includes("font-family: 'Fixture Display';")) return 'no @font-face suggestion';
    if (!/^\s*--unset:/m.test(readFileSync(join(dir, 'src/styles/tokens.css'), 'utf8'))) return 'it changed tokens.css without --apply';
    if (!existsSync(join(dir, 'recon/design.md'))) return 'wrote no design.md';
    return null;
  },
});

againstFixture('finds the menu toggle, opens it, and reads the panel and its items', {
  script: 'design.mjs',
  faults: 'branded',
  args: ['--allow-internal', '--limit=1'],
  files: DESIGN_SITE,
  expect: 0,
  then: (dir) => {
    const ix = readJson(dir, 'recon/interactions.json');
    const mobile = ix.menu.find((m) => m.viewport === 'mobile');
    if (!mobile?.found) return `no toggle found on mobile${mobile?.error ? ` (${mobile.error})` : ''}`;
    if (mobile.toggle.selector !== '.menu-toggle') return `toggle ${mobile.toggle.selector}`;
    if (mobile.panel?.type !== 'off-canvas-right') return `panel ${mobile.panel?.type}${mobile.error ? ` (${mobile.error})` : ''}`;
    const texts = mobile.items.map((i) => i.text);
    for (const want of ['About', 'Services', 'Service one', 'Work', 'Contact']) if (!texts.includes(want)) return `items ${JSON.stringify(texts)} miss ${want}`;
    if (!mobile.animations.some((a) => a.name === 'transform' && a.durationMs === 300)) return 'did not record the 300ms transform';
    if (mobile.behaviour?.escCloses !== true) return 'did not see Esc close the menu';
    if (mobile.toggle.ariaExpandedAfter !== 'true') return `aria-expanded after ${mobile.toggle.ariaExpandedAfter}`;
    const desktop = ix.menu.find((m) => m.viewport === 'desktop');
    if (desktop?.found || !desktop?.inline?.dropdown?.opensOnHover) return 'desktop should be an inline nav whose dropdown opens on hover';
    const header = ix.header.find((h) => h.viewport === 'desktop');
    if (!header?.behaviour?.transparentOverHero || !header.behaviour.sticky) return `header behaviour ${JSON.stringify(header?.behaviour)}`;
    const kinds = ix.moving.flatMap((m) => m.found.map((f) => `${f.kind}:${f.library}`));
    if (!kinds.includes('carousel:swiper')) return `no carousel found (${kinds.join(', ')})`;
    if (!kinds.some((k) => k.startsWith('marquee'))) return `no marquee found (${kinds.join(', ')})`;
    for (const f of ['mobile-menu-open.png', 'mobile-menu-closed.png', 'desktop-header-scrolled.png']) {
      if (!existsSync(join(dir, 'shots', 'design', f))) return `no screenshot ${f}`;
    }
    return null;
  },
});

againstFixture('--apply writes the measured tokens, and tells stops reporting --unset', {
  script: 'design.mjs',
  faults: 'branded',
  args: ['--allow-internal', '--limit=1', '--apply'],
  files: DESIGN_SITE,
  expect: 0,
  then: (dir) => {
    const css = readFileSync(join(dir, 'src/styles/tokens.css'), 'utf8');
    if (/^\s*--unset:/m.test(css)) return '--unset is still declared';
    if (!css.includes('--accent-500: #c85028;')) return 'the accent was not written';
    if (!css.includes("--font-display: 'Fixture Display'")) return 'the display face was not written';
    if (!css.includes('══ Decided')) return 'no note saying where the values came from';
    const tells = spawnSync(process.execPath, [join(TEMPLATE_SCRIPTS, 'tells.mjs'), '--undecided-only'], { cwd: dir, encoding: 'utf8' });
    const out = plain(`${tells.stdout}${tells.stderr}`);
    if (out.includes('--unset in tokens.css')) return 'tells still reports --unset after it was removed';
    if (!out.includes('no @font-face anywhere')) return 'tells no longer reports the missing faces — it should, until they are self-hosted';
    return null;
  },
});

/* tells' own half of that: the REAL template tokens.css, with only the
   declaration removed. Before the fix this read as half-decided forever. */
gate('tells: --unset named in a comment is not the marker', {
  script: 'tells.mjs',
  args: ['--undecided-only'],
  files: {
    'src/styles/tokens.css': TEMPLATE_TOKENS.replace(/^\s*--unset:[^\n]*\n/m, ''),
    'src/styles/fonts.css': "@font-face { font-family: 'Real'; src: url(a.woff2); }\n",
    'src/pages/index.astro': '---\nconst title = "Real";\n---\n<h1>{title}</h1>\n',
  },
  expect: 0,
  contains: 'all real',
});

/* ────────────────────────────────────────────────────────────────────────
 * md-to-pdf — which never needed a deployment at all
 *
 * Its ledger entry read "needs a deployed site (headless Chrome fetching the
 * rendered page)". It renders a LOCAL markdown file to a local PDF. The reason
 * was copied, like the rest of them, and it is the third time that has happened
 * in this file.
 *
 * `npm run handover` is this script. The one document written for the client.
 * ──────────────────────────────────────────────────────────────────────── */
describe('md-to-pdf');

gate('no input file is a usage error', {
  script: 'md-to-pdf.mjs',
  files: {},
  args: [],
  expect: 1,
  contains: 'usage:',
});

gate('renders a markdown file to a real PDF', {
  script: 'md-to-pdf.mjs',
  files: { 'docs/handover.md': '# Handover\n\nA paragraph.\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n' },
  args: ['docs/handover.md', 'docs/handover.pdf'],
  expect: 0,
  then: (dir) => {
    const pdf = join(dir, 'docs', 'handover.pdf');
    if (!existsSync(pdf)) return 'reported success and wrote no file';
    /* A zero-byte or HTML file would still "exist". Read the magic number. */
    const head = readFileSync(pdf).subarray(0, 5).toString('latin1');
    return head === '%PDF-' ? null : `wrote something that is not a PDF (${JSON.stringify(head)})`;
  },
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

/*
 * The locale-migration shape. Measured on ngbif 2026-09-02: six collections
 * moved into `en/` and `uz/` and `.pages.yml` was never updated. The path
 * still EXISTS and the item walk recurses, so every key checked out and the
 * gate reported clean — it caught only the two singletons whose paths had
 * genuinely vanished, two of six real findings.
 *
 * A warning rather than a failure on purpose: whether Pages CMS lists a
 * collection's subfolders is not something the script has verified, and the
 * config having a different shape from the content is the part that is
 * certainly true.
 */
gate('warns when a collection’s items all sit one level down', {
  script: 'check-cms.mjs',
  files: {
    ...CMS_CLEAN,
    '.pages.yml': CMS_CLEAN['.pages.yml'].replace(
      'content:\n',
      'content:\n  - name: posts\n    type: collection\n    path: src/content/posts\n' +
        '    fields:\n      - { name: title, type: string }\n',
    ),
    'src/content/posts/en/hello.json': JSON.stringify({ title: 'Hello' }),
    'src/content/posts/uz/salom.json': JSON.stringify({ title: 'Salom' }),
  },
  expect: 0,
  contains: 'underneath hold some',
});

/* …and does NOT fire when the entry points at the subdirectory itself, which
   is the fix. Without this the gate above could pass by warning on
   everything. */
gate('no subdirectory warning once the config points at the right level', {
  script: 'check-cms.mjs',
  files: {
    ...CMS_CLEAN,
    '.pages.yml': CMS_CLEAN['.pages.yml'].replace(
      'content:\n',
      'content:\n  - name: posts-en\n    type: collection\n    path: src/content/posts/en\n' +
        '    fields:\n      - { name: title, type: string }\n',
    ),
    'src/content/posts/en/hello.json': JSON.stringify({ title: 'Hello' }),
  },
  expect: 0,
  /* ⚠️ `then`, not a `lacks:` key — the runner has no such option and would
     have ignored it silently, leaving this gate passing on nothing. A gate
     that cannot fail is worse than no gate. */
  then: (_dir, out) =>
    out.includes('underneath hold some')
      ? 'warned about subdirectories even though the entry points straight at one'
      : null,
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

/** A source pointed at `input`, and a field that can store what it returns. */
const IMAGE_FIELD_CONFIG = (input) =>
  [
    'media:',
    '  - name: photos',
    `    input: ${input}`,
    '    output: /img',
    '    extensions: [webp]',
    'content:',
    '  - name: site',
    '    type: file',
    '    path: src/data/site.json',
    '    fields:',
    '      - { name: picture, type: image }',
    '',
  ].join('\n');

/*
 * ⚠ The media DIRECTION bug, which hit two of five shipped sites — but ONLY
 *   where nothing maps a picked path back to a manifest key.
 *
 *   `src/lib/image-key.ts` exists in the template precisely because a picker
 *   "returns the public path of what it found, /img/photos/hero-1200.webp",
 *   which requires the source to point AT the output. A check that failed on
 *   that unconditionally was telling people to break the feature the kit ships
 *   to make image fields usable — and it reported two delivered sites as
 *   broken when one had 386 files under public/img, 95 manifest keys and zero
 *   orphans after months of use.
 */
gate('refuses uploads pointed at generated output', {
  script: 'check-cms.mjs',
  files: {
    /* ⚠ THE FIXTURE NEEDS A `type: image` FIELD. With `content: []` the trap
       cannot bite — nothing stores what the picker returns — so a fixture
       without one passes whatever the check does, and this case would have
       gone vacuous the moment the rule gained its third condition. It did:
       the gate failed and that is how this was caught. */
    '.pages.yml': IMAGE_FIELD_CONFIG('public/img'),
    'public/img/.keep': '',
    'src/data/site.json': '{"picture":"/img/a-1200.webp"}',
  },
  expect: 1,
  contains: 'GENERATED output',
});

gate('accepts the same source once a picked path can be resolved', {
  script: 'check-cms.mjs',
  files: {
    '.pages.yml': IMAGE_FIELD_CONFIG('public/img'),
    'public/img/.keep': '',
    'src/data/site.json': '{"picture":"/img/a-1200.webp"}',
    'src/lib/image-key.ts': 'export const toImageKey = (s: string) => s;\n',
  },
  expect: 0,
  then: (_dir, out) =>
    out.includes('GENERATED output') ? 'still reported a picker the project can resolve' : null,
});

/* The mapping found by USE, not only by filename — a project may name the file
   something else, and the identifier is what proves the capability. */
/*
 * The third condition, from a site that declares two sources deliberately —
 * "Image library (published)" at public/img so an editor can see what is live,
 * and "Originals" at media/source where uploads belong — and has NO
 * `type: image` field at all: seven fields are a `select` of manifest keys, so
 * a picked path can never become a value. Nothing to resolve, nothing to break.
 */
gate('a source at the output is fine when no field stores a picked path', {
  script: 'check-cms.mjs',
  files: {
    '.pages.yml': [
      'media:',
      '  - name: library',
      '    input: public/img',
      '    output: /img',
      'components:',
      '  photoKey:',
      '    type: select',
      '    options: { values: [photos/a, photos/b] }',
      'content:',
      '  - name: site',
      '    type: file',
      '    path: src/data/site.json',
      '    fields:',
      '      - { name: picture, component: photoKey }',
      '',
    ].join('\n'),
    'public/img/.keep': '',
    'src/data/site.json': '{"picture":"photos/a"}',
  },
  expect: 0,
  then: (_dir, out) =>
    out.includes('GENERATED output') ? 'reported a browser no field can store a path from' : null,
});

gate('finds the mapping by its use, not only by that filename', {
  script: 'check-cms.mjs',
  files: {
    '.pages.yml': IMAGE_FIELD_CONFIG('public/img'),
    'public/img/.keep': '',
    'src/data/site.json': '{"picture":"/img/a-1200.webp"}',
    'src/components/Img.astro': '---\nimport { toImageKey } from "../lib/keys";\n---\n<img />\n',
  },
  expect: 0,
  then: (_dir, out) =>
    out.includes('GENERATED output') ? 'missed a mapping reached under a different filename' : null,
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

/* ⚠ Same silent class as the media direction bug: no error, no warning, the
   build does not care, and it is visible only to the person trying to choose an
   image — the one person who cannot fix it. */
gate('refuses a picker scoped to a folder that does not exist', {
  script: 'check-cms.mjs',
  files: {
    ...CMS_IMAGE,
    '.pages.yml': CMS_IMAGE['.pages.yml'].replace(
      '{ name: image, type: image, options: { media: uploads } }',
      '{ name: image, type: image, options: { media: uploads, path: public/img/gone } }',
    ),
    'src/content/services/a.md': '---\ntitle: A\nimage: /img/uploads/hero.jpg\n---\n',
  },
  expect: 1,
  contains: 'the picker opens on an empty folder',
});

gate('accepts a picker scoped to a folder that exists', {
  script: 'check-cms.mjs',
  files: {
    ...CMS_IMAGE,
    '.pages.yml': CMS_IMAGE['.pages.yml'].replace(
      '{ name: image, type: image, options: { media: uploads } }',
      '{ name: image, type: image, options: { media: uploads, path: public/img/brand } }',
    ),
    'public/img/brand/.keep': '',
    'src/content/services/a.md': '---\ntitle: A\nimage: /img/uploads/hero.jpg\n---\n',
  },
  expect: 0,
  contains: 'every key declared',
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

/*
 * ── The five 2026-09-02 failures, each pinned ─────────────────────────────
 *
 * Found by running this gate against two shipped sites and checking every
 * finding against the files instead of trusting it. FOUR of the five were
 * SILENT — the gate reported clean on real defects — which is why each gets a
 * case here rather than a line in the changelog.
 */

/* 1 · A shape borrowed from `components:` is declared. Reading only
   `field.fields` reported six phantom data-loss problems on a live site, and
   the remedy it printed would have pasted duplicate declarations into a
   config that was already right. */
gate('a key declared through a component is not reported', {
  script: 'check-cms.mjs',
  files: {
    '.pages.yml': [
      'components:',
      '  image_field:',
      '    type: object',
      '    fields:',
      '      - { name: src, type: string }',
      '      - { name: alt, type: string }',
      'content:',
      '  - name: site',
      '    type: file',
      '    path: src/data/site.json',
      '    fields:',
      '      - { name: title, type: string }',
      '      - { name: picture, component: image_field }',
      '',
    ].join('\n'),
    'src/data/site.json': JSON.stringify({ title: 'x', picture: { src: '/a.jpg', alt: 'A' } }),
  },
  expect: 0,
  contains: 'every key declared',
});

/* 2 · A `type: block` variant missing a field its SIBLING declares. The flat
   set unioned the variants, so this passed — and it is the shape that let
   PagesCMS delete card links from a live page on 2026-08-25. */
const CMS_BLOCK = {
  '.pages.yml': [
    'content:',
    '  - name: page',
    '    type: file',
    '    path: src/data/page.json',
    '    fields:',
    '      - name: sections',
    '        type: block',
    '        blockKey: _type',
    '        blocks:',
    '          - name: hero',
    '            type: object',
    '            fields:',
    '              - { name: title, type: string }',
    '              - { name: path, type: string }',
    '          - name: cards',
    '            type: object',
    '            fields:',
    '              - { name: title, type: string }',
    '',
  ].join('\n'),
};

gate('refuses a block field only a SIBLING variant declares', {
  script: 'check-cms.mjs',
  files: {
    ...CMS_BLOCK,
    'src/data/page.json': JSON.stringify({
      sections: [
        { _type: 'hero', title: 'H', path: '/h' },
        { _type: 'cards', title: 'C', path: '/c' },
      ],
    }),
  },
  expect: 1,
  contains: 'sections[type=cards].path',
});

gate('accepts a block where each variant declares what it holds', {
  script: 'check-cms.mjs',
  files: {
    ...CMS_BLOCK,
    'src/data/page.json': JSON.stringify({
      sections: [
        { _type: 'hero', title: 'H', path: '/h' },
        { _type: 'cards', title: 'C' },
      ],
    }),
  },
  expect: 0,
  contains: 'every key declared',
});

/* 3 · A collection of JSON items. Filtering to `.md`/`.mdx` meant a whole
   collection passed without one file being opened — 60 items on a live site,
   never read, reported clean. */
gate('reads JSON collection items, not only markdown', {
  script: 'check-cms.mjs',
  files: {
    '.pages.yml': [
      'content:',
      '  - name: news',
      '    type: collection',
      '    path: src/content/news',
      '    format: json',
      '    fields:',
      '      - { name: title, type: string }',
      '',
    ].join('\n'),
    'src/content/news/one.json': JSON.stringify({ title: 'One', lang: 'en' }),
  },
  expect: 1,
  contains: 'lang',
});

/* 4 · `exclude` names a file that lives in the directory but belongs to its
   own entry. Ignoring it reported six confident, wrong problems against a
   config that had already handled the case correctly. */
gate('honours exclude on a collection', {
  script: 'check-cms.mjs',
  files: {
    '.pages.yml': [
      'content:',
      '  - name: pages',
      '    type: collection',
      '    path: src/content/pages',
      '    format: json',
      "    exclude: ['home.json']",
      '    fields:',
      '      - { name: title, type: string }',
      '  - name: home',
      '    type: file',
      '    path: src/content/pages/home.json',
      '    fields:',
      '      - { name: hero, type: string }',
      '',
    ].join('\n'),
    'src/content/pages/about.json': JSON.stringify({ title: 'About' }),
    'src/content/pages/home.json': JSON.stringify({ hero: 'H' }),
  },
  expect: 0,
  contains: 'every key declared',
});

/* 5 · A picture field shaped by a component. Reading only `field.type` meant
   the unpickable-path check went quiet on exactly the fields most likely to
   have one — confirmed against a live CMS screenshot showing an empty square
   and a 404 "View on GitHub" link on a page this gate called clean. */
gate('type-checks an image field reached through a component', {
  script: 'check-cms.mjs',
  files: {
    '.pages.yml': [
      'media:',
      '  - name: uploads',
      '    input: media/source/uploads',
      '    output: /img/uploads',
      'components:',
      '  image_field:',
      '    type: object',
      '    fields:',
      '      - { name: src, type: image }',
      'content:',
      '  - name: site',
      '    type: file',
      '    path: src/data/site.json',
      '    fields:',
      '      - { name: picture, component: image_field }',
      '',
    ].join('\n'),
    'src/data/site.json': JSON.stringify({ picture: { src: '../../assets/a.jpg' } }),
    'media/source/uploads/.keep': '',
  },
  expect: 1,
  /* ⚠ ASSERT THE TYPE-CHECK MESSAGE, NOT THE FIELD PATH. Before the component
     fix this case passed for the WRONG reason: the path was reported as an
     UNDECLARED key, which is a different failure with a different remedy.
     Matching the path alone let a broken gate look green. */
  contains: 'not a path under',
});

/*
 * ── `--fix`, the declarations to paste ────────────────────────────────────
 *
 * ⚠ THE ONLY CASE THAT PROVES ANYTHING HERE IS THE ROUND TRIP. Asserting that
 *   the emitter printed some YAML proves it printed some YAML. Applying what
 *   it printed and requiring the check to then go green is what proves the
 *   YAML is right — and it is the assertion that would have caught a wrong
 *   indent, a wrong type, or a `list:` on the wrong level.
 */
const CMS_UNDECLARED = {
  '.pages.yml': [
    'content:',
    '  - name: site',
    '    type: file',
    '    path: src/data/site.json',
    '    fields:',
    '      - name: socials',
    '        type: object',
    '        fields:',
    '          - { name: facebook, type: string }',
    '',
  ].join('\n'),
  'src/data/site.json': JSON.stringify(
    {
      socials: { facebook: 'https://f/x', google: 'https://g/x' },
      businessType: 'Dentist',
      openingHours: [{ days: ['Mon', 'Tue'], opens: '09:00' }],
      seats: 12,
      closed: false,
    },
    null,
    2,
  ),
};

/** The `- …` lines the emitter printed, dedented to the sequence indent. */
const emitted = (out) =>
  out
    .replace(/\x1b\[[0-9;]*m/g, '')
    .split('\n')
    .filter((l) => /^ {6}(-|\s{2,}-|\s{2,}(type|fields|list):)/.test(l))
    .map((l) => l.slice(6));

gate('--fix prints nothing unless asked', {
  script: 'check-cms.mjs',
  files: CMS_UNDECLARED,
  expect: 1,
  then: (_dir, out) =>
    out.includes('paste into') ? 'emitted the fix without --fix, in a gate that runs in every build' : null,
});

gate('--fix infers each type from the value, not the key', {
  script: 'check-cms.mjs',
  args: ['--fix'],
  files: CMS_UNDECLARED,
  expect: 1,
  then: (_dir, out) => {
    const text = out.replace(/\x1b\[[0-9;]*m/g, '');
    const want = [
      '{ name: businessType, type: string }',
      '{ name: seats, type: number }',
      '{ name: closed, type: boolean }',
      'name: openingHours',
      'list: true',
    ];
    const missing = want.filter((w) => !text.includes(w));
    return missing.length ? `did not emit: ${missing.join(' · ')}` : null;
  },
});

/* `socials` is declared and `socials.google` is not. Emitting a second
   top-level `socials` field would give the editor two screens for one object. */
gate('--fix puts a key under the parent field that already exists', {
  script: 'check-cms.mjs',
  args: ['--fix'],
  files: CMS_UNDECLARED,
  expect: 1,
  then: (_dir, out) => {
    const text = out.replace(/\x1b\[[0-9;]*m/g, '');
    if (!text.includes("add under the existing `socials` field")) return 'did not scope socials.google to its parent';
    return /- name: socials\n\s+type: object/.test(text) ? 're-declared socials at the top level' : null;
  },
});

gate('what --fix prints, applied, makes the check pass', {
  script: 'check-cms.mjs',
  args: ['--fix'],
  files: CMS_UNDECLARED,
  expect: 1,
  then: (dir, out) => {
    const lines = emitted(out);
    if (!lines.length) return 'emitted no field declarations to apply';
    /* Everything but the nested block goes on the end of `fields:`; the
       socials child is spliced under the field it names. */
    const cut = lines.findIndex((l) => l.startsWith('- { name: google'));
    const top = cut === -1 ? lines : lines.slice(0, cut);
    const child = cut === -1 ? [] : lines.slice(cut);
    const config = readFileSync(join(dir, '.pages.yml'), 'utf8').trimEnd().split('\n');
    const at = config.findIndex((l) => l.includes('{ name: facebook'));
    config.splice(at + 1, 0, ...child.map((l) => `          ${l}`));
    const applied = [...config, ...top.map((l) => `      ${l}`)].join('\n') + '\n';
    writeFileSync(join(dir, '.pages.yml'), applied);

    const again = spawnSync(process.execPath, [join(TEMPLATE_SCRIPTS, 'check-cms.mjs')], {
      cwd: dir,
      encoding: 'utf8',
    });
    if (again.status !== 0) {
      return `applying the emitted fix left the check failing:\n${(again.stdout + again.stderr).replace(/\x1b\[[0-9;]*m/g, '').split('\n').slice(0, 8).join('\n')}`;
    }
    return null;
  },
});

/*
 * ── Inline page copy ──────────────────────────────────────────────────────
 *
 * The gap that survived every other check here: a page whose content is a
 * `const` array in its own frontmatter. Nine such blocks were found across
 * three of seven delivered sites, all of which had a working CMS the client
 * was already using — including a twelve-item FAQ about post-operative
 * medication.
 *
 * ⚠ THE EXCLUSIONS ARE WHAT NEEDS THE CASES, NOT THE DETECTION. This was
 *   wrong twice before it shipped, both times by over-reporting, and both
 *   times it looked authoritative: a name-based schema filter let a helper
 *   through, and a regex that ended at `\n];` ran past a block closing on its
 *   own line and swallowed the next declaration — reporting one item as
 *   sixteen, under the wrong variable's name.
 */
gate('warns about page copy declared inline', {
  script: 'check-cms.mjs',
  files: {
    ...CMS_CLEAN,
    'src/pages/about.astro':
      '---\nconst bands = [\n' +
      "  { title: 'One', body: 'A sentence long enough to read as real copy.' },\n" +
      "  { title: 'Two', body: 'Another sentence long enough to read as copy.' },\n" +
      '];\n---\n<h1>x</h1>\n',
  },
  expect: 0,
  contains: 'block(s) of page copy declared inline',
});

gate('does not report a JSON-LD literal as page copy', {
  script: 'check-cms.mjs',
  files: {
    ...CMS_CLEAN,
    'src/pages/about.astro':
      '---\nconst schema = [\n' +
      "  { '@type': 'Person', name: 'A name that is long enough to count as prose' },\n" +
      "  { '@type': 'Person', name: 'Another name long enough to count as prose' },\n" +
      '];\n---\n<h1>x</h1>\n',
  },
  expect: 0,
  then: (_dir, out) =>
    out.includes('page copy declared inline') ? 'reported structured data as page copy' : null,
});

/* `[breadcrumbSchema([…])]` carries no literal `@type`, so only the shape test
   excludes it — the array's direct element is a CALL, and a call is not copy. */
gate('does not report a schema built by a helper as page copy', {
  script: 'check-cms.mjs',
  files: {
    ...CMS_CLEAN,
    'src/pages/about.astro':
      '---\nconst schemas = [\n' +
      '  breadcrumbSchema([\n' +
      "    { name: 'A crumb label long enough to count as prose here', url: '/' },\n" +
      "    { name: 'Another crumb label long enough to count as prose', url: '/a/' },\n" +
      '  ]),\n];\n---\n<h1>x</h1>\n',
  },
  expect: 0,
  then: (_dir, out) =>
    out.includes('page copy declared inline') ? 'reported a helper call as page copy' : null,
});

/* The regression. `const crumbs = [{ … }];` closes on its own line; a scanner
   that misses that runs on and attributes the NEXT block's contents to it. */
gate('does not merge a one-line array into the block that follows it', {
  script: 'check-cms.mjs',
  files: {
    ...CMS_CLEAN,
    'src/pages/search.astro':
      '---\n' +
      "const crumbs = [{ name: 'Search', href: '/search/' }];\n\n" +
      'const groups = [\n' +
      "  { label: 'One', blurb: 'A sentence long enough to read as real copy.' },\n" +
      "  { label: 'Two', blurb: 'Another sentence long enough to read as copy.' },\n" +
      '];\n---\n<h1>x</h1>\n',
  },
  expect: 0,
  then: (_dir, out) =>
    out.includes('crumbs[') ? 'attributed the following block to `crumbs`' : null,
});

/*
 * ── A select of manifest keys, against the manifest ───────────────────────
 *
 * A delivered site with no picked-path mapping uses a `select` of manifest
 * keys instead: 110 photographs and 9 blog headers, written out by hand. Its
 * own config states the hazard — "a key missing here simply cannot be chosen,
 * and a key here that the manifest lost will fail the build the moment it is
 * selected" — and nothing was enforcing it. It happened to be in sync.
 */
const CMS_KEYLIST = (values, extraKeys = {}) => ({
  'src/data/image-manifest.json': JSON.stringify({
    'photos/one': { widths: [480] },
    'photos/two': { widths: [480] },
    ...extraKeys,
  }),
  'src/data/site.json': '{"picture":"photos/one"}',
  '.pages.yml': [
    'components:',
    '  photoKey:',
    '    type: select',
    `    options: { values: [${values.join(', ')}] }`,
    'content:',
    '  - name: site',
    '    type: file',
    '    path: src/data/site.json',
    '    fields:',
    '      - { name: picture, component: photoKey }',
    '',
  ].join('\n'),
});

gate('refuses a key list offering something the manifest lost', {
  script: 'check-cms.mjs',
  files: CMS_KEYLIST(['photos/one', 'photos/two', 'photos/deleted-last-week']),
  expect: 1,
  contains: 'the manifest does not have',
});

gate('warns about an image the list cannot reach', {
  script: 'check-cms.mjs',
  files: CMS_KEYLIST(['photos/one'], { 'photos/added-yesterday': { widths: [480] } }),
  expect: 0,
  then: (_dir, out) =>
    out.includes('photos/added-yesterday') ? null : 'did not name the image the editor cannot choose',
});

/* ⚠ The false-positive class: a select that is not a key list at all. Every
   project has one, and reporting them would be noise on all of them. */
gate('leaves a select that is not a key list alone', {
  script: 'check-cms.mjs',
  files: CMS_KEYLIST(['texas', 'nevada', 'arizona']),
  expect: 0,
  then: (_dir, out) =>
    out.includes('manifest') && out.includes('texas') ? 'measured a state list against the manifest' : null,
});

/* A blog header list is right to exclude the team photographs, so the unlisted
   half is scoped to prefixes the list already uses. */
gate('scopes the unlisted half to the prefixes the list already uses', {
  script: 'check-cms.mjs',
  files: CMS_KEYLIST(['blog/a'], { 'blog/a': { widths: [480] } }),
  expect: 0,
  then: (_dir, out) =>
    out.includes('photos/one') ? 'measured a blog list against every photograph on the site' : null,
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

/*
 * ── A PHOTOGRAPH FROM AN iPHONE ───────────────────────────────────────────
 *
 * ⚠ THE FAILURE: a `.heic` was dropped with no output, no warning and no
 *   manifest entry, while the libvips already shipped in this kit reads the
 *   format fine. The client uploads a photo straight off their phone and it
 *   simply is not there.
 *
 * `heic` is in the pipeline's RASTER pattern and nothing proved it. Six of
 * eight delivered sites are still behind on this and the fixed pipeline has
 * never run on any of them, so this case is the only thing standing behind it.
 *
 * ⚠ THE FIXTURE IS AV1-IN-HEIF, NOT HEVC, AND THAT IS NOT A SHORTCUT — IT IS
 *   THE ONLY THING THAT CAN BE BUILT. No prebuilt sharp can *write* HEVC:
 *   `heifsave: Unsupported compression`, on this machine and on the runners,
 *   because the encoder is patent-encumbered and excluded. So a real iPhone
 *   file cannot be generated here by anything.
 *
 *   What this therefore proves: the `.heic` EXTENSION is accepted, a HEIF
 *   container decodes, and variants plus a manifest entry come out. What it
 *   does not prove is the HEVC decode path specifically. That gap is real and
 *   is written here rather than left for someone to assume away.
 */
function heifFixture(dir, rel) {
  /* sharp is a TEMPLATE dependency and does not resolve from the kit root, so
     generate through a node run whose cwd is template/ — the same sharp the
     pipeline itself will use, rather than a second one that could differ. */
  const script = `
    const sharp = require('sharp');
    const out = process.argv[1];
    if (!sharp.format.heif?.output?.file) { console.error('NO_HEIF_ENCODER'); process.exit(2); }
    sharp({ create: { width: 1600, height: 1200, channels: 3, background: { r: 200, g: 120, b: 60 } } })
      .heif({ compression: 'av1', quality: 50 })
      .toFile(out)
      .then(() => process.exit(0), (e) => { console.error(e.message); process.exit(3); });
  `;
  const full = join(dir, rel);
  mkdirSync(dirname(full), { recursive: true });
  const run = spawnSync(process.execPath, ['-e', script, full], {
    cwd: join(KIT, 'template'),
    encoding: 'utf8',
  });
  if (run.status !== 0) {
    throw new Error(
      run.stderr.includes('NO_HEIF_ENCODER')
        ? 'sharp in template/ cannot encode HEIF, so this case cannot build its fixture'
        : `could not write the HEIF fixture: ${run.stderr.trim().split('\n')[0]}`,
    );
  }
}

gate('a .heic is converted, not silently discarded', {
  script: 'optimize-media.mjs',
  files: { 'src/data/image-manifest.json': '{}' },
  setup: (dir) => heifFixture(dir, 'media/source/photos/from-a-phone.heic'),
  expect: 0,
  then: (dir, out) => {
    if (/produced no image/.test(out) && /from-a-phone/.test(out)) return 'reported the .heic as producing nothing';
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(join(dir, 'src/data/image-manifest.json'), 'utf8'));
    } catch (err) {
      return `manifest unreadable after the run — ${err.message}`;
    }
    const key = Object.keys(manifest).find((k) => k.includes('from-a-phone'));
    if (!key) return `no manifest entry; keys were ${JSON.stringify(Object.keys(manifest))}`;
    const widths = manifest[key].widths ?? [];
    if (!widths.length) return 'manifest entry has no widths';
    /* Assert the path the manifest ITSELF advertises, rather than rebuilding a
       filename here — a second copy of the naming rule is a second thing to
       keep in step, and this check is about the file a page will request. */
    const src = String(manifest[key].src ?? '');
    if (!src.startsWith('/img/')) return `manifest src is not a servable path: ${JSON.stringify(src)}`;
    const onDisk = join(dir, 'public', src.replace(/^\//, ''));
    return existsSync(onDisk) ? null : `manifest advertises ${src}, which was not written`;
  },
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

/*
 * ⚠ AN EMPTY FILE USED TO SATISFY THIS. Both fixtures below declared
 *   `'scripts/check-contrast.mjs': ''` and passed, because the row asked
 *   whether the NAME existed. It does not any more, and these two cases failed
 *   the moment it stopped — which is how the change was checked.
 */
const KIT_CONTRAST = "console.log('text-over-photograph region(s) legible');\n";

const CURRENT_PIPELINE =
  "const FORMATS = ['avif', 'webp'];\nconst RASTER = /heic|heif/;\n" +
  "// produced no image\n// failed to process\n";

gate('a site with everything reports no drift', {
  script: 'check-drift.mjs',
  files: {
    'package.json': JSON.stringify({ name: 'x', websiteBuildKit: { version: '0.1.15' } }),
    'scripts/optimize-media.mjs': CURRENT_PIPELINE,
    'scripts/check-contrast.mjs': KIT_CONTRAST,
    'src/data/contrast.json': '{"regions":[]}',
    'src/pages/index.astro': '<p>no images</p>\n',
  },
  setup: initRepo,
  expect: 0,
  contains: 'nothing behind',
});

/*
 * ── Feature-detect by what the file IS, not by what it is called ──────────
 *
 * A delivered site has a `scripts/check-contrast.mjs` that measures CSS tokens
 * against each other. This row saw the name and reported the site as covered;
 * its hero headline had never been measured by anything. When it finally was,
 * it came back at 5.76:1 with about seven points of margin before AA.
 *
 * ⚠ A row that says "present" because of a filename is worse than one that
 *   says "missing", because nobody re-checks a tick.
 */
gate('a same-named script that is not this check is not coverage', {
  script: 'check-drift.mjs',
  files: {
    'package.json': JSON.stringify({ name: 'x', websiteBuildKit: { version: '0.1.15' } }),
    'scripts/optimize-media.mjs': CURRENT_PIPELINE,
    'scripts/check-contrast.mjs': "console.log('9 filled-control rules checked against the stylesheet.');\n",
    'src/pages/index.astro': '<p>x</p>\n',
  },
  setup: initRepo,
  expect: 0,
  contains: 'is NOT this check',
});

/* And the other half: the same check installed under a different name, which
   is what a project with that collision actually has to do. */
gate('finds the check under a name chosen to avoid a collision', {
  script: 'check-drift.mjs',
  files: {
    'package.json': JSON.stringify({ name: 'x', websiteBuildKit: { version: '0.1.15' } }),
    'scripts/optimize-media.mjs': CURRENT_PIPELINE,
    'scripts/check-contrast.mjs': "console.log('9 filled-control rules checked against the stylesheet.');\n",
    'scripts/check-photo-contrast.mjs': KIT_CONTRAST,
    'src/data/contrast.json': '{"regions":[]}',
    'src/pages/index.astro': '<p>x</p>\n',
  },
  setup: initRepo,
  expect: 0,
  then: (_dir, out) =>
    out.includes('is NOT this check') ? 'missed the check because the filename differed' : null,
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

/*
 * ── D9 · a two-scheme accessibility run that measures one scheme twice ─────
 *
 * ⚠ THE INERT STATE IS THE ONE WORTH CATCHING. A site carrying
 *   `--force-prefers-color-scheme` has the runner, the green gate and the
 *   evidence pack, and has never measured its dark palette — Chrome ignores
 *   that flag in silence because it is not a Chrome switch. Every site this kit
 *   has delivered is in that state until the two scripts are copied across.
 */
gate('a scheme flag Chrome ignores reads as drift, not as coverage', {
  script: 'check-drift.mjs',
  files: {
    'package.json': JSON.stringify({ name: 'x', websiteBuildKit: { version: '0.1.15' } }),
    'scripts/optimize-media.mjs': CURRENT_PIPELINE,
    'scripts/check-contrast.mjs': KIT_CONTRAST,
    'scripts/check-a11y.mjs': "npx('pa11y-ci', ['--force-prefers-color-scheme=' + scheme]);\n",
    'src/pages/index.astro': '<p>x</p>\n',
  },
  setup: initRepo,
  expect: 0,
  contains: 'NOT a Chrome switch',
});

gate('a run that does force the scheme is not reported', {
  script: 'check-drift.mjs',
  files: {
    'package.json': JSON.stringify({ name: 'x', websiteBuildKit: { version: '0.1.15' } }),
    'scripts/optimize-media.mjs': CURRENT_PIPELINE,
    'scripts/check-contrast.mjs': KIT_CONTRAST,
    'scripts/check-a11y.mjs': "npx('pa11y-ci', ['--blink-settings=preferredColorScheme=' + ordinal]);\n",
    'src/pages/index.astro': '<p>x</p>\n',
  },
  setup: initRepo,
  expect: 0,
  contains: 'nothing behind',
});

/* A site with no pa11y at all makes no two-scheme claim, so it is not drift.
   Reporting it would put a row nobody can act on in front of every reader. */
gate('a site with no pa11y runner is not reported as one scheme short', {
  script: 'check-drift.mjs',
  files: {
    'package.json': JSON.stringify({ name: 'x', websiteBuildKit: { version: '0.1.15' } }),
    'scripts/optimize-media.mjs': CURRENT_PIPELINE,
    'scripts/check-contrast.mjs': KIT_CONTRAST,
    'src/pages/index.astro': '<p>x</p>\n',
  },
  setup: initRepo,
  expect: 0,
  contains: 'no two-scheme claim to be wrong',
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
    'scripts/check-contrast.mjs': KIT_CONTRAST,
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
    'scripts/check-contrast.mjs': KIT_CONTRAST,
    'src/pages/index.astro': '<Img name="photos/hero" alt="a" />\n',
  },
  setup: initRepo,
  expect: 0,
  contains: 'hardcoded in pages',
});

/*
 * ⚠ AN EXPRESSION IS NOT AUTOMATICALLY SAFE. The rule that `src={photo}` came
 *   from somewhere else holds for content, and fails for the idiomatic Astro
 *   pattern where "somewhere else" is a static import in the same file. A
 *   delivered site had EIGHT of these while this check reported zero.
 */
/*
 * ⚠ THE WAY A CMS COMMIT TAKES A SITE DOWN.
 *
 *   PagesCMS writes an object for every declared object field whether or not
 *   the editor filled it in, so an untouched picture arrives as
 *   `{"isRender": false}` — the boolean has a default, the required strings do
 *   not. That is NOT a missing optional; it is a present object failing
 *   validation, so `.optional()` on the schema does not save you.
 *
 *   Found live: 45 of them in one file, written by a single save.
 */
const CMS_BLANK = {
  '.pages.yml': [
    'media:',
    '  - name: uploads',
    '    input: media/source/uploads',
    '    output: /img/uploads',
    'components:',
    '  image_field:',
    '    type: object',
    '    fields:',
    '      - { name: src, type: image }',
    '      - { name: isRender, type: boolean }',
    'content:',
    '  - name: site',
    '    type: file',
    '    path: src/data/site.json',
    '    fields:',
    '      - { name: title, type: string }',
    '      - { name: picture, component: image_field }',
    '',
  ].join('\n'),
  'media/source/uploads/.keep': '',
};

gate('refuses a blank image slot the CMS wrote', {
  script: 'check-cms.mjs',
  files: {
    ...CMS_BLANK,
    'src/data/site.json': JSON.stringify({ title: 'x', picture: { isRender: false } }),
  },
  expect: 1,
  contains: 'PARTIALLY',
});

/*
 * ⚠ ONCE PER FIELD, NOT ONCE PER IMAGE FIELD IN THE ENTRY.
 *
 *   The fixture above declares ONE image field, so a blank-slot check nested
 *   inside the per-image-field loop reports it once and looks correct. It
 *   shipped that way. On a delivered site with four image fields in an entry,
 *   the same finding printed FOUR identical lines — and this file already
 *   carries the rule that a gate which floods is a gate somebody switches off.
 *
 *   Two image fields is all it takes to see it. That is the whole case.
 */
gate('reports a blank slot once, not once per image field in the entry', {
  script: 'check-cms.mjs',
  files: {
    ...CMS_BLANK,
    '.pages.yml': CMS_BLANK['.pages.yml'].replace(
      '      - { name: picture, component: image_field }',
      '      - { name: picture, component: image_field }\n' +
        '      - { name: banner, component: image_field }',
    ),
    'src/data/site.json': JSON.stringify({
      title: 'x',
      picture: { isRender: false },
      banner: { src: '/img/uploads/b.jpg', isRender: false },
    }),
  },
  expect: 1,
  then: (_dir, out) => {
    const hits = (out.replace(/\x1b\[[0-9;]*m/g, '').match(/PARTIALLY/g) ?? []).length;
    return hits === 1 ? null : `reported the one blank slot ${hits} times`;
  },
});

/*
 * ⚠ AN OMITTED OPTIONAL FIELD IS NOT A BLANK SLOT, AND THIS IS THE CHECK'S
 *   WHOLE FALSE-POSITIVE CLASS.
 *
 *   Caught on a delivered site: a list of five videos where the first carries
 *   only its `src` and the rest also carry a `poster`. The poster is
 *   `.optional()` in the content schema, the page does `poster: v.poster ??
 *   d.image`, and the component guards on it. Nothing was wrong, and the check
 *   reported two problems on a site that had none.
 *
 *   The object the check is FOR carries no real string at all — the boolean
 *   has a default and every string is absent. An author's omission leaves the
 *   rest of the record behind; a blank slot leaves nothing.
 */
gate('a record missing only an optional picture is not a blank slot', {
  script: 'check-cms.mjs',
  files: {
    ...CMS_BLANK,
    '.pages.yml': CMS_BLANK['.pages.yml'].replace(
      '      - { name: picture, component: image_field }',
      '      - name: clips\n' +
        '        type: object\n' +
        '        list: true\n' +
        '        fields:\n' +
        '          - { name: src, type: string }\n' +
        '          - { name: poster, type: image }',
    ),
    'src/data/site.json': JSON.stringify({
      title: 'x',
      clips: [{ src: 'https://cdn/one.mp4' }, { src: 'https://cdn/two.mp4', poster: '/img/uploads/b.jpg' }],
    }),
  },
  expect: 0,
  then: (_dir, out) =>
    out.includes('PARTIALLY') ? 'reported an omitted optional picture as a blank slot' : null,
});

/* Both halves that must NOT be reported, or the check above would be noise:
   a picture properly filled in, and one genuinely absent. */
gate('accepts a picture that is filled in', {
  script: 'check-cms.mjs',
  files: {
    ...CMS_BLANK,
    'src/data/site.json': JSON.stringify({
      title: 'x',
      picture: { src: '/img/uploads/a.jpg', isRender: false },
    }),
  },
  expect: 0,
  contains: 'every key declared',
});

gate('accepts a picture that is simply absent', {
  script: 'check-cms.mjs',
  files: { ...CMS_BLANK, 'src/data/site.json': JSON.stringify({ title: 'x' }) },
  expect: 0,
  contains: 'every key declared',
});

/*
 * ⚠ A PICTURE IS OFTEN AN OBJECT REACHED THROUGH A COMPONENT, and reading
 *   `f.type` on the wrapper finds `undefined`. That reported 18 working
 *   pickers as unset text boxes on a live site, while never descending far
 *   enough to see the `type: image` field actually inside them.
 */
gate('a picker reached through a component is not a text box', {
  script: 'check-drift.mjs',
  files: {
    'package.json': JSON.stringify({ name: 'x', websiteBuildKit: { version: '0.1.15' } }),
    'scripts/optimize-media.mjs': CURRENT_PIPELINE,
    'scripts/check-contrast.mjs': KIT_CONTRAST,
    'scripts/check-cms.mjs': '',
    'docs/handover.md': '# Guide\n\nsite\n',
    '.pages.yml': [
      'components:',
      '  image_field:',
      '    type: object',
      '    fields:',
      '      - { name: src, type: image }',
      '      - { name: alt, type: string }',
      'content:',
      '  - name: site',
      '    type: file',
      '    path: src/data/site.json',
      '    fields:',
      '      - { name: image, component: image_field }',
      '',
    ].join('\n'),
  },
  setup: initRepo,
  expect: 0,
  contains: 'image fields use the picker',
});

/* The other side: a picture that really IS a bare string must still be
   reported, or the fix above would have bought silence. */
gate('still reports a picture stored as a plain string', {
  script: 'check-drift.mjs',
  files: {
    'package.json': JSON.stringify({ name: 'x', websiteBuildKit: { version: '0.1.15' } }),
    'scripts/optimize-media.mjs': CURRENT_PIPELINE,
    'scripts/check-contrast.mjs': KIT_CONTRAST,
    'scripts/check-cms.mjs': '',
    'docs/handover.md': '# Guide\n\nsite\n',
    '.pages.yml': [
      'content:',
      '  - name: site',
      '    type: file',
      '    path: src/data/site.json',
      '    fields:',
      '      - { name: image, type: string }',
      '',
    ].join('\n'),
  },
  setup: initRepo,
  expect: 0,
  contains: 'are text boxes',
});

gate('finds an image imported statically into a page', {
  script: 'check-drift.mjs',
  files: {
    'package.json': JSON.stringify({ name: 'x', websiteBuildKit: { version: '0.1.15' } }),
    'scripts/optimize-media.mjs': CURRENT_PIPELINE,
    'scripts/check-contrast.mjs': KIT_CONTRAST,
    'src/pages/index.astro':
      "---\nimport heroBg from '@/assets/hero/hero.jpg';\n---\n<Image src={heroBg} alt=\"a\" />\n",
  },
  setup: initRepo,
  expect: 0,
  contains: 'hardcoded in pages',
});

/* The other half of the same rule: an import nothing renders is a lint's
   problem, not a photograph the client cannot change. */
gate('ignores an image import the page never uses', {
  script: 'check-drift.mjs',
  files: {
    'package.json': JSON.stringify({ name: 'x', websiteBuildKit: { version: '0.1.15' } }),
    'scripts/optimize-media.mjs': CURRENT_PIPELINE,
    'scripts/check-contrast.mjs': KIT_CONTRAST,
    'src/pages/index.astro': "---\nimport unused from '@/assets/hero/hero.jpg';\n---\n<p>No image.</p>\n",
  },
  setup: initRepo,
  expect: 0,
  contains: 'no hardcoded image references',
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
 * check:redirects — the one migration artefact edited by hand, in bulk
 *
 * `redirects.mjs` proposes a map; nothing checked the map a human then edited.
 * ⚠ Every failure here is invisible at deploy: the file parses, the site
 *   builds, the pages are fine, and a URL that used to rank breaks weeks later
 *   in somebody else's analytics.
 * ──────────────────────────────────────────────────────────────────────── */
describe('check:redirects');

const redirects = (body) => ({ 'public/_redirects': body });

gate('no file is not a failure', {
  script: 'check-redirects.mjs',
  files: {},
  expect: 0,
  contains: 'nothing to validate',
});

/* ⚠ Columns in a hand-edited file are aligned with RUNS of spaces. Splitting on
   a single space reports every aligned rule as malformed, which on a real
   migration is all of them. */
gate('accepts a clean file with aligned columns', {
  script: 'check-redirects.mjs',
  files: redirects('# a comment\n/old-about      /about/     301\n/old-shop       /shop/      301\n'),
  expect: 0,
  contains: 'no duplicates, no loops',
});

gate('refuses a duplicate source', {
  script: 'check-redirects.mjs',
  files: redirects('/a  /b  301\n/a  /c  301\n'),
  expect: 1,
  contains: 'duplicate source',
});

gate('refuses a self-redirect', {
  script: 'check-redirects.mjs',
  files: redirects('/a  /a  301\n'),
  expect: 1,
  contains: 'redirects to itself',
});

/* ⚠ Written across trailing-slash forms, which is the loop nobody spots by eye. */
gate('refuses a loop spelled with and without a trailing slash', {
  script: 'check-redirects.mjs',
  files: redirects('/a  /b/  301\n/b  /a   301\n'),
  expect: 1,
  contains: 'LOOP',
});

/* ⚠ A loop must not be announced as a chain first. The first version reported
   both, wrong one first — walk the whole path before deciding what it is. */
gate('a loop is not also reported as a chain', {
  script: 'check-redirects.mjs',
  files: redirects('/a  /b/  301\n/b  /a   301\n'),
  expect: 1,
  then: (_dir, out) => (out.includes('hops') ? 'called a loop a chain' : null),
});

gate('warns about a chain without failing', {
  script: 'check-redirects.mjs',
  files: redirects('/a  /b  301\n/b  /c  301\n'),
  expect: 0,
  contains: 'hops',
});

gate('refuses a status Cloudflare does not accept', {
  script: 'check-redirects.mjs',
  files: redirects('/a  /b  399\n'),
  expect: 1,
  contains: 'not one Cloudflare accepts',
});

gate('a comments-only file is not a failure', {
  script: 'check-redirects.mjs',
  files: redirects('# nothing here yet\n\n'),
  expect: 0,
  contains: '0 redirect rule',
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
