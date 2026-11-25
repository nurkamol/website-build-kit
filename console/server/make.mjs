/**
 * make_site: scaffold a new site into the configured folder, so Claude Desktop needs no terminal.
 *
 * It runs the published scaffolder — `npm create`'s own package — never a copy of it. One
 * scaffolder, one set of refusals, and the .gitignore restore that keeps .dev.vars out of git.
 *
 * ⚠ ONLY INTO AN EMPTY FOLDER. Desktop's Site folder is a setting someone chose once; if it points
 *   at real work, writing a template over it cannot be undone without git. Emptiness is checked
 *   here, before anything runs, with the OS leftovers (.DS_Store and friends) not counting.
 *
 * ⚠ PINNED TO THIS SERVER'S VERSION, NEVER @latest. The console reads the site's gates by name;
 *   a site from a newer template than the console that reads it is drift on day one. The console,
 *   the plugin and the scaffolder are released together at one version, so the pin always exists.
 *
 * ⚠ THE INSTALL TAKES MINUTES — workerd alone is ~127 MB — and an MCP call does not get minutes.
 *   So it runs in the background and a second make_site call reports on it, the way run_gate
 *   hands back a job.
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { isEmptyFolder, readSite } from './state.mjs';

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;
let job = null;

/**
 * spec: the package to run — `create-website-build-kit@<version>`. A path to a packed or unpacked
 * scaffolder works too, which is how the tests run it offline.
 */
export function makeSite(site, { spec, install = true } = {}) {
  if (job?.site === site && job.state === 'running') return { job };
  if (job?.site === site && job.state === 'done') {
    // Reported once, then forgotten: after a success the folder is a site and the next call says
    // so; after a failure the next call is a retry rather than the same failure forever.
    const done = job;
    job = null;
    return { job: done };
  }
  if (!readSite(site).error) {
    return { error: `${site} is already a site built from the kit. Nothing to make — kit_status reads it.` };
  }
  if (!isEmptyFolder(site)) {
    return {
      error:
        `${site} is not empty, so nothing was written. A new site goes into an empty folder, so a template can never ` +
        `land on top of someone's work. Choose an empty folder (Claude Desktop: Settings → Extensions → the kit → Configure), ` +
        `or the folder of an existing site.`,
    };
  }

  mkdirSync(site, { recursive: true });
  /* --force: this file has just checked the folder holds nothing but OS leftovers. A scaffolder
     older than the one that learned to ignore .DS_Store would otherwise refuse a Finder folder. */
  /* --package names what to fetch and the bin names what to run: a bare path to a tarball is read
     as a command, and the shell refuses to execute it. */
  const args = ['--yes', '--package', spec, 'create-website-build-kit', '.', '--force', ...(install ? [] : ['--no-install'])];
  const started = Date.now();
  const current = { site, state: 'running', output: `› npx ${args.join(' ')}\n\n`, startedAt: new Date().toISOString() };
  job = current;
  current.done = new Promise((resolveDone) => {
    const child = spawn('npx', args, {
      cwd: site,
      shell: process.platform === 'win32', // npx is npx.cmd there — CLAUDE.md, three times
      env: { ...process.env, FORCE_COLOR: '0', npm_config_yes: 'true' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const take = (b) => { current.output = (current.output + b.toString().replace(ANSI, '')).slice(-20_000); };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    const finish = (code) => {
      current.state = 'done';
      current.code = code;
      current.seconds = Math.round((Date.now() - started) / 1000);
      current.made = !readSite(site).error;
      resolveDone();
    };
    child.on('error', (e) => { take(`\n${e.message}\n`); finish(127); });
    child.on('close', (code) => finish(code ?? 1));
  });
  return { job: current };
}

export async function waitMake(made, seconds) {
  if (made.state === 'running' && seconds > 0) {
    let timer;
    await Promise.race([made.done, new Promise((r) => { timer = setTimeout(r, seconds * 1000); })]);
    clearTimeout(timer);
  }
  return made;
}

export function viewMake(made) {
  const out = {
    state: made.state,
    startedAt: made.startedAt,
    output: made.output.slice(-3000),
  };
  if (made.state === 'running') {
    out.next = 'Still scaffolding or installing. Call make_site again to wait for it — it does not start a second one.';
  } else if (made.made) {
    out.result = `Made in ${made.seconds}s. Call kit_status for where it stands; docs/runbook.md §1 in the site is the fill-in order.`;
  } else {
    out.result = `Failed (exit ${made.code}). The output above says why — most often Node older than 22.19, or npm not installed.`;
  }
  return out;
}
