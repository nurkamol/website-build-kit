#!/usr/bin/env node
/**
 * npm create website-build-kit@latest my-site
 *
 * Scaffolds the Astro + Cloudflare Workers template, then gets out of the way.
 *
 * ── WHAT IT REFUSES TO DO ──────────────────────────────────────────────────
 * It will not write into a directory that already has files, and it will not
 * proceed on a Node it knows Astro rejects. Both are failures that otherwise
 * surface much later as something that reads like a different problem: Astro on
 * Node 20 dies with a version notice buried in a build log, and scaffolding
 * over an existing project is unrecoverable without git.
 *
 * No dependencies, deliberately. `npm create` downloads this before it can do
 * anything, so every dependency here is latency on the first command a new user
 * ever runs.
 */

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const target = argv.find((a) => !a.startsWith('-'));

if (flag('help') || flag('h')) {
  console.log(`
${BOLD}create-website-build-kit${RESET}

  npm create website-build-kit@latest ${DIM}<directory>${RESET}

  ${DIM}--no-install${RESET}   skip npm install
  ${DIM}--no-git${RESET}       skip git init
  ${DIM}--force${RESET}        write into a non-empty directory
`);
  process.exit(0);
}

/*
 * Astro's floor is 22.12. On anything older the build dies with a version
 * notice inside a wall of build output, which is a confusing way to learn it —
 * so it is checked before a single file is written.
 */
const MIN = [22, 12];
const current = process.versions.node.split('.').map(Number);
if (current[0] < MIN[0] || (current[0] === MIN[0] && current[1] < MIN[1])) {
  console.error(
    `\n${RED}✗${RESET} Node ${process.versions.node} is too old — Astro needs ${MIN.join('.')}+.\n` +
      `  ${DIM}nvm install 24 && nvm use 24${RESET}\n`,
  );
  process.exit(1);
}

console.log(`\n${BOLD}Website Build Kit${RESET}${DIM} — Astro on Cloudflare Workers${RESET}\n`);

let dir = target;
if (!dir) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  dir = (await rl.question(`  Directory ${DIM}(my-site)${RESET}: `)).trim() || 'my-site';
  rl.close();
}

const dest = resolve(process.cwd(), dir);
const name = dest.split('/').pop();

if (existsSync(dest) && readdirSync(dest).length && !flag('force')) {
  console.error(
    `\n${RED}✗${RESET} ${dir} is not empty.\n` +
      `  ${DIM}Scaffolding over an existing project cannot be undone without git.\n` +
      `  Pick another directory, or pass --force if you are sure.${RESET}\n`,
  );
  process.exit(1);
}

const src = join(dirname(fileURLToPath(import.meta.url)), 'template');
if (!existsSync(src)) {
  console.error(`\n${RED}✗${RESET} the template is missing from this package — please report it.\n`);
  process.exit(1);
}

mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });

/*
 * npm strips .gitignore from published packages, so it ships as `gitignore`.
 * Restoring it is not cosmetic: it is what keeps .dev.vars — which holds
 * BREVO_API_KEY and the leads export token — out of the repository.
 */
const shipped = join(dest, 'gitignore');
if (existsSync(shipped)) renameSync(shipped, join(dest, '.gitignore'));

if (!existsSync(join(dest, '.gitignore'))) {
  console.error(`\n${RED}✗${RESET} no .gitignore was written. Stopping — .dev.vars would be committable.\n`);
  process.exit(1);
}

/* The site's own name, so package.json is not "site-name" forever. */
const pkgPath = join(dest, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
pkg.name = name.replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'site';
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

console.log(`  ${GREEN}✓${RESET} template → ${dir}/`);

const run = (cmd, args, label) => {
  const r = spawnSync(cmd, args, { cwd: dest, stdio: 'ignore', shell: process.platform === 'win32' });
  console.log(r.status === 0 ? `  ${GREEN}✓${RESET} ${label}` : `  ${YELLOW}!${RESET} ${label} — skipped`);
  return r.status === 0;
};

if (!flag('no-git')) {
  if (run('git', ['init', '-q'], 'git initialised')) {
    run('git', ['add', '-A'], 'files staged');
  }
}

let installed = false;
if (!flag('no-install')) {
  console.log(`  ${DIM}installing…${RESET}`);
  installed = run('npm', ['install', '--silent'], 'dependencies installed');
}

console.log(`
${BOLD}Next${RESET}

  ${DIM}cd${RESET} ${dir}${installed ? '' : `\n  ${DIM}npm install${RESET}`}

  ${BOLD}1.${RESET} Fill in ${BOLD}src/data/business.ts${RESET} — everything reads from it, and the
     defaults are deliberately neutral rather than correct.
  ${BOLD}2.${RESET} ${DIM}npm run tells${RESET} — says what is still undecided. ${DIM}build:production${RESET}
     refuses until the palette, the two typefaces and the home page are yours.
  ${BOLD}3.${RESET} Migrating? ${DIM}npm run recon -- https://old-site.com${RESET} first, before you
     design routes. Then ${DIM}npm run extract${RESET}.

  ${DIM}docs/runbook.md §1 is the fill-in order. It builds green right now:${RESET}
  ${DIM}npm run build:staging${RESET}

${DIM}The method, and the traps: https://github.com/nurkamol/website-build-kit${RESET}
`);
