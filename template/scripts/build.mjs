/**
 * Run a build for one environment.
 *
 *   node scripts/build.mjs staging
 *   node scripts/build.mjs production
 *
 * `npm run build:staging` and `npm run build:production` are one-line aliases
 * for these.
 *
 * ── WHY A SCRIPT AND NOT INLINE ENV IN package.json ────────────────────────
 * ⚠ `PUBLIC_SITE_ENV=staging astro build` IS POSIX SHELL SYNTAX, AND npm ON
 *   WINDOWS RUNS SCRIPTS THROUGH cmd.exe. There it is not an assignment, it is
 *   a command name, and the build dies immediately with
 *
 *     'PUBLIC_SITE_ENV' is not recognized as an internal or external command
 *
 *   So the two most important commands in the kit did not work at all on a
 *   platform the kit says it supports. Nothing caught it because every CI job
 *   ran on ubuntu.
 *
 * ── AND WHY IT IS SAFER EVEN WHERE THE SHELL SYNTAX WORKS ──────────────────
 * The production line repeated `PUBLIC_SITE_ENV=production` four times, once
 * per command. Miss one and that step runs as `development` while the others
 * do not: `astro check` types a different environment than the one that gets
 * built, or `check-env` validates an environment nobody deployed.
 *
 * A mixed-environment build is precisely what `check-env.mjs` exists to catch,
 * and it is the sort of thing that survives review because every line looks
 * right on its own. Setting it once removes the class.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';

const env = process.argv[2];

if (env !== 'staging' && env !== 'production') {
  console.error(
    `\n${RED}✗ usage: node scripts/build.mjs <staging|production>${RESET}\n\n` +
      '  The environment is not optional. A build that does not declare one\n' +
      '  emits localhost canonical URLs — cleanly, and wrong.\n',
  );
  process.exit(1);
}

/*
 * The site URL per environment. Read from package.json rather than restated
 * here, so there is one place a project sets its hostnames.
 *
 * ⚠ Kept OUT of src/data/site.ts on purpose: astro.config.mjs needs the value
 *   before any TypeScript is loaded, and site.ts imports `import.meta.env`.
 */
const SITE_URLS = {
  staging: 'https://new.example.com',
  production: 'https://example.com',
};

/**
 * Run one step with the environment already set, and stop the build if it
 * fails. `shell: true` on Windows because `npx`-style shims are .cmd files
 * that execFile cannot resolve — the same reason the a11y scripts need it.
 */
function step(command, args) {
  const run = spawnSync(command, args, {
    stdio: 'inherit',
    env: { ...process.env, PUBLIC_SITE_ENV: env, PUBLIC_SITE_URL: SITE_URLS[env] },
    shell: process.platform === 'win32',
  });
  if (run.status !== 0) {
    console.error(`\n${RED}✗ build failed at:${RESET} ${command} ${args.join(' ')}\n`);
    process.exit(run.status ?? 1);
  }
}

/* astro is a local binary; go through the package's own bin rather than a
   global `astro`, which may not exist and would be the wrong version if it did. */
const astro = ['node_modules/astro/astro.js'];
const hasLocalAstro = existsSync('node_modules/astro/astro.js');

const run = (args) =>
  hasLocalAstro
    ? step(process.execPath, [...astro, ...args])
    : step('npx', ['--no-install', 'astro', ...args]);

console.log(`${DIM}building ${env} → ${SITE_URLS[env]}${RESET}\n`);

if (env === 'production') {
  /* Refuse a production build of a template that has not been designed yet.
     Before anything else, because it is the cheapest check and the most
     embarrassing thing to deploy. */
  step(process.execPath, ['scripts/tells.mjs', '--undecided-only']);
  run(['check']);
}

/* Before the build, not after: a duplicate field name is a source bug, and
   there is no reason to spend a build discovering it. Fails in BOTH
   environments — nobody ever meant two controls to share a name. */
step(process.execPath, ['scripts/check-form.mjs']);

/* Same reasoning, and the same timing: a CMS config that does not declare every
   key in the file it edits will delete content the first time the client saves.
   That is a source bug, it is invisible in a build, and it costs nothing to
   check. A no-op on projects with no `.pages.yml`. */
step(process.execPath, ['scripts/check-cms.mjs']);

run(['build']);

if (env === 'staging') {
  step(process.execPath, ['scripts/staging-headers.mjs']);
}

/* Warn on staging, refuse on production. A note in the copy is normal WHILE
   building and unacceptable at go-live — the same split as
   `tells --undecided-only`. */
step(process.execPath, ['scripts/check-copy.mjs', ...(env === 'production' ? ['--strict'] : [])]);

step(process.execPath, ['scripts/check-env.mjs']);

if (env === 'production') {
  step(process.execPath, ['scripts/check-sitemap.mjs']);
  /* A redirect map is the one migration artefact edited by hand, in bulk, about
     URLs nobody can see any more. Every failure it has is invisible at deploy. */
  step(process.execPath, ['scripts/check-redirects.mjs']);
  /* Production only: it measures the GENERATED images, and a staging build is
     often run before `npm run media` has caught up. A no-op until a project
     declares regions — the template has no design and therefore none. */
  step(process.execPath, ['scripts/check-contrast.mjs']);

  /*
   * Advisory: it exits 0 whatever it finds, because drift is a decision and not
   * an error. It runs here because a site is current on the day it is scaffolded
   * and behind some months later — and the build is the only moment anybody is
   * reliably looking. A check nobody remembers to run is the failure it exists
   * to catch, applied to itself.
   */
  step(process.execPath, ['scripts/check-drift.mjs']);
}

/* A sanity line, so the log says which environment actually ran rather than
   which one was asked for. They are the same now; they were not always. */
const pkg = existsSync('package.json') ? JSON.parse(readFileSync('package.json', 'utf8')) : {};
console.log(`\n${DIM}${pkg.name ?? 'site'} built as ${env}${RESET}`);
