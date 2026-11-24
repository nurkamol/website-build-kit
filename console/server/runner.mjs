/**
 * Runs a gate as the site's own npm script — never a reimplementation of it.
 * `npm run verify` stays the single source of truth, runnable without any of
 * this, on Windows and in CI.
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GATES, cacheDir, fingerprint, liveLogPath, readLedger, readRunning, readSite, runningPath, writeResult,
} from './state.mjs';

const MAX_OUTPUT = 200_000; // characters kept per job; the tail is what matters
const jobs = new Map();

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;

function npmRun(site, script, args, onChunk) {
  return new Promise((resolveRun) => {
    const started = Date.now();
    // npm is npm.cmd on Windows, which execFile/spawn cannot resolve without a
    // shell. CLAUDE.md: this class has shipped three times.
    const child = spawn('npm', ['run', '--silent', script, ...(args.length ? ['--', ...args] : [])], {
      cwd: site,
      shell: process.platform === 'win32',
      env: { ...process.env, FORCE_COLOR: '0', CI: 'true' },
    });
    const take = (b) => onChunk(b.toString().replace(ANSI, ''));
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    child.on('error', (e) => { onChunk(`\n${e.message}\n`); resolveRun({ code: 127, ms: Date.now() - started }); });
    child.on('close', (code) => resolveRun({ code: code ?? 1, ms: Date.now() - started }));
  });
}

/**
 * The summary is the last line that says something. Scripts in the kit end on
 * their verdict, so this is a heuristic that holds for them, not a parser.
 */
export function summarise(output, code) {
  const lines = output.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^>|^exit \d+$/.test(l));
  const last = lines.at(-1) ?? (code === 0 ? 'Exited 0 with no output' : `Exited ${code} with no output`);
  return last.length > 240 ? `${last.slice(0, 237)}…` : last;
}

/**
 * exit ≠ 0 is a failure, always. exit 0 with a warning marker is a warning —
 * check:alt and verify's orphan routes report that way on purpose.
 */
export function classify(output, code) {
  if (code !== 0) return 'fail';
  // npm's own notices are about npm, not the site. "0 warnings" — astro check's
  // clean summary — is the case a bare /warning/ gets wrong.
  const text = output.split(/\r?\n/).filter((l) => !/^\s*npm (warn|notice)\b/i.test(l)).join('\n');
  const warned = /⚠/.test(text) || /\b[1-9]\d*\s+warn(ing)?s?\b/i.test(text) || /^\s*warn(ing)?\b/im.test(text);
  return warned ? 'warn' : 'pass';
}

const URL_RE = /^https?:\/\/[^\s]+$/;

/** The npm arguments for one run, or a refusal. */
export function argsFor(script, opts = {}) {
  const def = GATES[script];
  const { url } = opts;
  if (def.params) {
    const args = [];
    for (const name of def.params) {
      const v = opts[name]?.trim();
      if (!v) return { error: `\`${script}\` needs --${name}: ${name === 'old' ? 'the site being replaced' : name === 'new' ? 'the rebuild — staging, or http://localhost:4321 beside astro dev' : 'a url'}.` };
      if (!URL_RE.test(v)) return { error: `Not an http(s) url for --${name}: ${v}` };
      args.push(`--${name}`, v);
    }
    return { args, params: Object.fromEntries(def.params.map((n) => [n, opts[n].trim()])) };
  }
  if (def.url === 'required' && !url) return { error: `\`${script}\` needs a url — the staging or production origin to check.` };
  if (url && !def.url) return { error: `\`${script}\` takes no url.` };
  if (url && !URL_RE.test(url)) return { error: `Not an http(s) url: ${url}` };
  return { args: url ? [url] : [], params: null };
}

/**
 * What match.json says, small enough to show and to hand to Claude: the
 * verdict, the worst routes, and the first failures. Read only if the run
 * wrote it — an old report from a previous run is not this run's result.
 */
export function parityFrom(site, dir, since) {
  const file = join(site, dir, 'match.json');
  try {
    if (!existsSync(file) || statSync(file).mtimeMs < since) return null;
    const r = JSON.parse(readFileSync(file, 'utf8'));
    const routes = (r.routes ?? []).map((row) => ({
      route: row.route,
      worst: Math.max(0, ...(row.viewports ?? []).flatMap((v) => (v.sections ?? []).map((x) => x.percent ?? 0))),
      text: row.text?.ratio ?? null,
      error: (row.viewports ?? []).find((v) => v.error)?.error ?? null,
    })).sort((a, b) => b.worst - a.worst);
    return {
      passed: !!r.passed,
      old: r.old,
      new: r.new,
      thresholds: r.thresholds,
      compared: routes.length,
      notCompared: r.notCompared?.length ?? 0,
      ranOutOfBudget: !!r.budget?.ranOut,
      failures: (r.failures ?? []).length,
      firstFailures: (r.failures ?? []).slice(0, 8),
      routes: routes.slice(0, 12),
    };
  } catch {
    return null;
  }
}

export function validate(site, script, opts = {}) {
  const def = GATES[script];
  if (!def) {
    return `\`${script}\` is not a gate this server runs. Allowed: ${Object.keys(GATES).join(', ')}. ` +
      'Deploys, indexnow, dns and the crawls that copy a client\'s site to disk (recon, shots, changes) are excluded on purpose — run those yourself.';
  }
  const { pkg, error } = readSite(site);
  if (error) return error;
  if (!pkg.scripts[script]) return `This site's package.json has no \`${script}\` script — it predates it. \`npm run check:drift\` reports what else is missing.`;
  return argsFor(script, opts).error ?? null;
}

/**
 * opts: { url } for verify and the browser gates, { old, new } for match.
 * A bare string is taken as { url }, which is what every caller used to pass.
 */
export function startGate(site, script, opts = {}, by = 'unknown') {
  if (typeof opts === 'string' || opts === undefined) opts = { url: opts };
  const problem = validate(site, script, opts);
  if (problem) return { error: problem };
  const { args, params } = argsFor(script, opts);
  const url = opts.url ?? null;

  for (const job of jobs.values()) {
    if (job.site === site && job.state === 'running') {
      return { error: `\`${job.script}\` is still running (job ${job.id}). One gate at a time — two builds in one dist/ measure each other.` };
    }
  }
  const other = readRunning(site);
  if (other) {
    return { error: `\`${other.script}\` is running from ${other.by} (pid ${other.pid}). One gate at a time — two builds in one dist/ measure each other.` };
  }

  const job = { id: randomUUID().slice(0, 8), site, script, url, params, by, state: 'running', output: '', startedAt: new Date().toISOString(), steps: [] };
  mkdirSync(cacheDir(site), { recursive: true });
  writeFileSync(runningPath(site), JSON.stringify({ job: job.id, script, by, pid: process.pid, startedAt: job.startedAt }));
  writeFileSync(liveLogPath(site), '');
  const append = (s) => {
    job.output = (job.output + s).slice(-MAX_OUTPUT);
    try { appendFileSync(liveLogPath(site), s); } catch { /* the log is a view; the ledger is the record */ }
  };
  jobs.set(job.id, job);

  job.done = (async () => {
    // A dist-reading gate measured against a dist/ built from some other tree
    // reports on code that no longer exists. Build first unless the ledger
    // shows a passing staging build on exactly this tree.
    if (GATES[script].readsDist) {
      const fp = fingerprint(site);
      const build = readLedger(site)['build:staging'];
      if (!build || build.result === 'fail' || build.fingerprint !== fp?.id) {
        append('› dist/ was not built from this tree — running build:staging first\n\n');
        job.steps.push('build:staging');
        const r = await record(site, 'build:staging', [], append);
        if (r.result === 'fail') {
          job.state = 'done';
          job.result = { script, result: 'fail', summary: 'build:staging failed, so the gate did not run', blockedBy: 'build:staging' };
          return;
        }
        append(`\n› ${script}\n\n`);
      }
    }
    job.steps.push(script);
    job.result = await record(site, script, args, append, params);
    job.state = 'done';
  })().finally(() => {
    job.state = 'done';
    rmSync(runningPath(site), { force: true });
  });

  return { job };
}

async function record(site, script, args, append, params = null) {
  const before = fingerprint(site);
  const started = Date.now();
  let output = '';
  const { code, ms } = await npmRun(site, script, args, (s) => { output += s; append(s); });
  const after = fingerprint(site);
  const rec = {
    script,
    result: classify(output, code),
    exitCode: code,
    summary: summarise(output, code),
    sha: after?.head ?? null,
    fingerprint: after?.id ?? null,
    dirty: after?.dirty ?? null,
    at: new Date().toISOString(),
    durationMs: ms,
    args,
    params,
    parity: GATES[script].report ? parityFrom(site, GATES[script].report, started) : null,
    // A gate that edits tracked files has measured a tree that no longer exists.
    changedTree: !!before && !!after && before.id !== after.id,
    outputTail: output.slice(-4000),
  };
  writeResult(site, rec);
  return rec;
}

export async function waitFor(id, seconds) {
  const job = jobs.get(id);
  if (!job) return { error: `No job ${id}. Jobs live in the server's memory and end with it — rerun the gate.` };
  if (job.state === 'running' && seconds > 0) {
    let timer;
    await Promise.race([job.done, new Promise((r) => { timer = setTimeout(r, seconds * 1000); })]);
    clearTimeout(timer); // a live timer holds the process open after the job has ended
  }
  return { job };
}

export function view(job, { tail = 3000 } = {}) {
  return {
    job: job.id,
    script: job.script,
    state: job.state,
    steps: job.steps,
    startedAt: job.startedAt,
    ...(job.result ? { result: { ...job.result, outputTail: undefined } } : {}),
    output: job.output.slice(-tail),
  };
}
