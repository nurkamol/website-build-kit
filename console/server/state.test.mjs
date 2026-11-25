/**
 * The console's claims, each tested by the case that should refuse.
 * A status server that only ever says "pass" looks exactly like a working one.
 *
 *   npm test        (in console/)
 */
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { request } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { cacheDir, kitStatus, parseBuildState, runningPath } from './state.mjs';
import { classify, startGate, waitFor } from './runner.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const kit = join(here, '..', '..');

describe('parseBuildState', () => {
  // The worked example in build.md §3 — the format builders are told to copy.
  const example = readFileSync(join(kit, 'skills/website-build/references/build.md'), 'utf8')
    .split('### Keep the state in the repo')[1].split('```')[1];

  it('reads the phase, the gates passed and the blockers from the build.md example', () => {
    const s = parseBuildState(example);
    assert.equal(s.phase, 4);
    assert.deepEqual(s.gatesPassed, [0, 1, 2, 3]);
    assert.deepEqual(s.blockers.map((b) => b.kind), ['blocking', 'question']);
    assert.match(s.next, /services/);
  });

  it('gives every integration line exactly one of verified, dropped or open', () => {
    const s = parseBuildState(example);
    const by = Object.fromEntries(s.integrations.map((i) => [i.name, i.state]));
    assert.deepEqual(by, { GA4: 'verified', Calendly: 'verified', Mailchimp: 'open', 'Meta Pixel': 'open', Trustpilot: 'dropped' });
  });

  it('refuses an undated drop — it stays open', () => {
    const s = parseBuildState('## Integrations\n- [x] Pixel · dropped, client said so\n');
    assert.equal(s.integrations[0].state, 'open');
  });

  it('reports the shipped stub as unfilled, never as data', () => {
    const s = parseBuildState(readFileSync(join(kit, 'template/BUILD-STATE.md'), 'utf8'));
    assert.equal(s.integrations.length, 0);
    assert.equal(s.blockers.length, 0);
    assert.ok(s.unfilled > 0);
  });
});

describe('classify', () => {
  it('fails any non-zero exit, whatever it printed', () => assert.equal(classify('all good ✓', 1), 'fail'));
  it('does not read "0 warnings" as a warning', () => assert.equal(classify('- 0 errors\n- 0 warnings\n', 0), 'pass'));
  it("does not read npm's own notices as the site's", () => assert.equal(classify('npm warn config foo\nclean\n', 0), 'pass'));
  it('reads a ⚠ line as a warning', () => assert.equal(classify('⚠ orphan /x/\n', 0), 'warn'));
  it('reads "3 warnings" as a warning', () => assert.equal(classify('3 warnings', 0), 'warn'));
});

describe('a site on disk', () => {
  const dirs = [];
  after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true, maxRetries: 5 })));

  function site({ scripts = {} } = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'kit-console-'));
    dirs.push(dir);
    const ok = 'node -e "console.log(\'clean\')"';
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'fixture-site',
      websiteBuildKit: { version: '0.0.0-test' },
      scripts: { tells: ok, verify: ok, check: ok, 'build:staging': ok, ...scripts },
    }));
    writeFileSync(join(dir, '.gitignore'), 'node_modules/\n');
    writeFileSync(join(dir, 'BUILD-STATE.md'), '## Phase 4 · Build  [in progress]\n\nGates passed   0 recon ✅  1 extract ✅  2 model ✅  3 tokens ✅\n');
    const g = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
    g('init', '-q');
    g('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'add', '-A');
    g('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-qm', 'one');
    return { dir, commit: (m) => { g('add', '-A'); g('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-qm', m); } };
  }

  async function run(dir, script, opts) {
    const s = startGate(dir, script, opts);
    assert.ok(!s.error, s.error);
    const { job } = await waitFor(s.job.id, 50);
    assert.equal(job.state, 'done');
    return job;
  }
  const gate = (dir, script) => kitStatus(dir).gates.find((g) => g.script === script);

  it('reports a gate nobody has run as never, and the phase gate as not ready', () => {
    const { dir } = site();
    assert.equal(gate(dir, 'check').status.key, 'never');
    const s = kitStatus(dir);
    assert.equal(s.phaseGate.ready, false);
    assert.equal(s.site.kitVersion, '0.0.0-test');
  });

  it('a pass goes stale the moment the tree changes — uncommitted edits included', async () => {
    const { dir, commit } = site();
    await run(dir, 'check');
    assert.equal(gate(dir, 'check').status.key, 'pass');

    writeFileSync(join(dir, 'page.md'), 'an edit nobody committed');
    assert.equal(gate(dir, 'check').status.key, 'stale', 'an untracked edit must invalidate the pass');

    commit('two');
    const g = gate(dir, 'check');
    assert.equal(g.status.key, 'stale');
    assert.equal(g.status.behind, 1);
  });

  it('a commit outside the site directory does not stale the site', async () => {
    const { dir, commit } = site();
    const inner = join(dir, 'site');
    mkdirSync(inner);
    writeFileSync(join(inner, 'package.json'), readFileSync(join(dir, 'package.json')));
    writeFileSync(join(inner, '.gitignore'), 'node_modules/\n');
    commit('nest the site');
    await run(inner, 'check');
    writeFileSync(join(dir, 'sibling.md'), 'not part of the site');
    commit('sibling only');
    assert.equal(gate(inner, 'check').status.key, 'pass');
    writeFileSync(join(inner, 'page.md'), 'part of the site');
    commit('site change');
    assert.equal(gate(inner, 'check').status.key, 'stale');
  });

  it('a failure stays a failure on a newer tree — it is never laundered into stale', async () => {
    const { dir } = site({ scripts: { check: 'node -e "process.exit(1)"' } });
    await run(dir, 'check');
    writeFileSync(join(dir, 'page.md'), 'edit');
    assert.equal(gate(dir, 'check').status.key, 'fail');
  });

  it('builds before a dist-reading gate when dist/ is not from this tree', async () => {
    const { dir } = site();
    const job = await run(dir, 'tells');
    assert.deepEqual(job.steps, ['build:staging', 'tells']);
    const again = await run(dir, 'tells');
    assert.deepEqual(again.steps, ['tells'], 'a fresh build must not be repeated');
  });

  it('does not run a dist-reading gate on a failed build', async () => {
    const { dir } = site({ scripts: { 'build:staging': 'node -e "process.exit(1)"' } });
    const job = await run(dir, 'tells');
    assert.deepEqual(job.steps, ['build:staging']);
    assert.equal(gate(dir, 'tells').status.key, 'never');
  });

  it('refuses a script that is not a gate, and verify without a url', () => {
    const { dir } = site({ scripts: { 'deploy:production': 'echo no' } });
    assert.match(startGate(dir, 'deploy:production').error, /not a gate/);
    assert.match(startGate(dir, 'verify').error, /needs a url/);
    assert.match(startGate(dir, 'verify', 'file:///etc/passwd').error, /Not an http/);
  });

  it('does not report a phase with no script gate as ready', () => {
    const { dir } = site();
    writeFileSync(join(dir, 'BUILD-STATE.md'), '## Phase 0 · Recon  [in progress]\n');
    const g = kitStatus(dir).phaseGate;
    assert.equal(g.ready, null);
    assert.match(g.note, /judgement/);
  });

  it('refuses match without both sites, and anything that is not http(s)', () => {
    const { dir } = site({ scripts: { match: 'echo' } });
    assert.match(startGate(dir, 'match', {}).error, /needs --old/);
    assert.match(startGate(dir, 'match', { old: 'https://old.example.com' }).error, /needs --new/);
    assert.match(startGate(dir, 'match', { old: 'https://old.example.com', new: 'javascript:alert(1)' }).error, /Not an http/);
  });

  // A stand-in match: writes match.json the way the real one does, then exits.
  // A file, not `node -e`: npm appends `--old …`, which node would take as its own flag.
  const fakeMatch = (dir, passed) => {
    writeFileSync(join(dir, 'fake-match.cjs'), `
      const f = require('fs');
      const a = process.argv;
      f.mkdirSync('shots/match', { recursive: true });
      f.writeFileSync('shots/match/match.json', JSON.stringify({
        passed: ${passed}, old: a[a.indexOf('--old') + 1], new: a[a.indexOf('--new') + 1],
        thresholds: { sectionPercent: 3, textRatio: 0.98 },
        failures: ${passed} ? [] : [{ route: '/about/', viewport: 'desktop', section: 'hero', kind: 'pixels', detail: '7.4%' }],
        routes: [
          { route: '/', viewports: [{ sections: [{ percent: 1.2 }] }], text: { ratio: 0.99 } },
          { route: '/about/', viewports: [{ sections: [{ percent: 7.4 }, { percent: 0.3 }] }], text: { ratio: 0.97 } },
        ],
      }));
      process.exit(${passed} ? 0 : 1);`);
    return 'node fake-match.cjs';
  };

  it('passes --old and --new through, and reads the parity the run wrote', async () => {
    const { dir, commit } = site({ scripts: { match: 'node fake-match.cjs' } });
    fakeMatch(dir, false);
    writeFileSync(join(dir, '.gitignore'), 'node_modules/\nshots/\n');
    commit('stand-in match');
    const job = await run(dir, 'match', { old: 'https://old.example.com', new: 'http://localhost:4321' });
    const p = job.result.parity;
    assert.equal(job.result.result, 'fail');
    assert.deepEqual(job.result.args, ['--old', 'https://old.example.com', '--new', 'http://localhost:4321']);
    assert.equal(p.passed, false);
    assert.equal(p.routes[0].route, '/about/', 'worst route first');
    assert.equal(p.routes[0].worst, 7.4);
    assert.equal(p.failures, 1);
    assert.deepEqual(gate(dir, 'match').lastParams, { old: 'https://old.example.com', new: 'http://localhost:4321' });
  });

  it('does not present a report from an earlier run as this run\'s result', async () => {
    const { dir } = site({ scripts: { match: 'node -e "process.exit(1)"' } });
    mkdirSync(join(dir, 'shots/match'), { recursive: true });
    writeFileSync(join(dir, 'shots/match/match.json'), JSON.stringify({ passed: true, routes: [] }));
    const past = new Date(Date.now() - 60_000);
    const { utimesSync } = await import('node:fs');
    utimesSync(join(dir, 'shots/match/match.json'), past, past);
    const job = await run(dir, 'match', { old: 'https://old.example.com', new: 'https://new.example.com' });
    assert.equal(job.result.parity, null);
  });

  it('refuses to start a gate while another process is running one', () => {
    const { dir } = site();
    mkdirSync(cacheDir(dir), { recursive: true });
    // This process is alive, so its lock is live.
    writeFileSync(runningPath(dir), JSON.stringify({ script: 'verify', by: 'Claude Code', pid: process.pid }));
    assert.match(startGate(dir, 'check').error, /running from Claude Code/);
    assert.equal(kitStatus(dir).running.script, 'verify');
  });

  it('ignores a lock left by a process that died mid-run', async () => {
    const { dir } = site();
    mkdirSync(cacheDir(dir), { recursive: true });
    writeFileSync(runningPath(dir), JSON.stringify({ script: 'verify', by: 'Claude Code', pid: 2 ** 22 + 7 }));
    assert.equal(kitStatus(dir).running, null);
    await run(dir, 'check');
    assert.equal(gate(dir, 'check').status.key, 'pass');
  });

  it('releases the lock when a run ends, failed or not', async () => {
    const { dir } = site({ scripts: { check: 'node -e "process.exit(1)"' } });
    await run(dir, 'check');
    assert.equal(kitStatus(dir).running, null);
  });

  it('refuses a directory that is not a kit site', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kit-console-'));
    dirs.push(dir);
    writeFileSync(join(dir, 'package.json'), '{"name":"x","scripts":{}}');
    assert.match(kitStatus(dir).error, /does not look like a site/);
  });

  // Desktop's Site folder is often chosen before anything is scaffolded into it. That folder must
  // read as "make one here", not as a wrong pick — and a folder with other things in it, never so.
  it('tells an empty folder how to become a site, Finder junk included', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kit-console-'));
    dirs.push(dir);
    writeFileSync(join(dir, '.DS_Store'), '');
    const { error } = kitStatus(dir);
    assert.match(error, /is empty/);
    assert.match(error, /npm create website-build-kit@latest \./);
  });

  it('does not call a folder with someone else\'s files in it empty', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kit-console-'));
    dirs.push(dir);
    writeFileSync(join(dir, 'notes.txt'), 'x');
    const { error } = kitStatus(dir);
    assert.doesNotMatch(error, /is empty/);
    assert.match(error, /BUILD-STATE\.md/);
  });
});

describe('the page server', () => {
  const dirs = [];
  let child;
  const port = 43000 + Math.floor(Math.random() * 2000);
  after(() => { child?.kill(); dirs.forEach((d) => rmSync(d, { recursive: true, force: true, maxRetries: 5 })); });

  const ask = (path, { method = 'GET', headers = {} } = {}) => new Promise((ok, bad) => {
    const req = request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => ok({ code: res.statusCode, body: b }));
    });
    req.on('error', bad);
    req.end(method === 'POST' ? JSON.stringify({ script: 'check' }) : undefined);
  });

  it('starts', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kit-console-'));
    dirs.push(dir);
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 's', scripts: { tells: 'echo', verify: 'echo', check: 'echo' } }));
    child = spawn(process.execPath, [join(here, 'http.mjs'), '--site', dir, '--port', String(port)], { stdio: ['ignore', 'pipe', 'inherit'] });
    await new Promise((ok) => child.stdout.once('data', ok));
  });

  it('answers a loopback Host', async () => {
    assert.equal((await ask('/api/status')).code, 200);
  });

  it('refuses any other Host — a rebound DNS name is not loopback', async () => {
    assert.equal((await ask('/api/status', { headers: { host: 'attacker.example:4319' } })).code, 421);
  });

  it('refuses a POST without the console header — what a drive-by form or fetch would send', async () => {
    const r = await ask('/api/run', { method: 'POST', headers: { 'content-type': 'application/json' } });
    assert.equal(r.code, 403);
  });
});
