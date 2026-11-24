/**
 * The state a build is in, read from the site rather than remembered.
 *
 * Everything here is read-only against the site's repository. The only file
 * this module writes is the gate ledger, under node_modules/.cache — ignored
 * by every site's .gitignore, per-machine by nature, and gone with a clean
 * install, which is the honest outcome: a result nobody can reproduce is
 * reported as "never run", not as a pass.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// ── The gates ────────────────────────────────────────────────────────────────
//
// An allowlist, never "any npm script". Excluded on purpose: deploy:* (ships),
// indexnow (submits to real search engines), dns, recon, shots, seo, changes
// (long crawls of a live site that write a client's material to disk), and
// anything that needs wrangler credentials.
//
// `phase` is the build.md §3 phase whose gate the script belongs to.
// `readsDist` means the script measures dist/, which git cannot fingerprint —
// so the result only counts if a staging build ran on the same tree first.
// `url` is 'required', 'optional' or absent.
export const GATES = {
  tells: { phase: 3, readsDist: true },
  check: { phase: 4 },
  'build:staging': { phase: 4 },
  'check:contact': { phase: 4 },
  'check:form': { phase: 4, readsDist: true },
  'check:cms': { phase: 4 },
  'check:copy': { phase: 4, readsDist: true },
  'check:alt': { phase: 5, readsDist: true },
  'check:contrast': { phase: 5 },
  'check:redirects': { phase: 7 },
  'check:sitemap': { phase: 7, readsDist: true },
  verify: { phase: 7, url: 'required' },
  a11y: { phase: 8, url: 'optional' },
  reflow: { phase: 8, url: 'optional' },
  console: { phase: 8, url: 'optional' },
  'a11y:evidence': { phase: 9 },
};

export const PHASES = [
  'Recon', 'Extraction', 'Content model', 'Design system', 'Build',
  'Media', 'Integrations', 'SEO parity', 'Deploy and go live', 'Handover',
];

// ── git ──────────────────────────────────────────────────────────────────────

function git(site, args) {
  try {
    return execFileSync('git', args, { cwd: site, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

/**
 * HEAD alone does not identify what a gate measured: a run on uncommitted edits
 * is not "at HEAD", and a pass recorded before an edit must not survive it.
 * The fingerprint is HEAD plus the content of every changed or untracked file
 * under the site — read-only (no `git add`, so nothing is written to .git).
 */
export function fingerprint(site) {
  const head = git(site, ['rev-parse', 'HEAD']);
  if (!head) return null;
  const top = git(site, ['rev-parse', '--show-toplevel']);
  const status = git(site, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', '.']) ?? '';
  const hash = createHash('sha256').update(head);
  const entries = status.split('\0').filter(Boolean);
  for (let i = 0; i < entries.length; i++) {
    const code = entries[i].slice(0, 2);
    const path = entries[i].slice(3);
    if (code[0] === 'R' || code[0] === 'C') i++; // the next entry is the rename source
    hash.update(`\0${code}\0${path}\0`);
    const abs = join(top, path);
    try {
      const st = statSync(abs);
      if (!st.isFile()) continue;
      // Large media: size and mtime. Hashing a 40 MB video on every status
      // call is the cost; an edit that keeps size AND mtime is the miss.
      if (st.size > 5 * 1024 * 1024) hash.update(`${st.size}:${st.mtimeMs}`);
      else hash.update(readFileSync(abs));
    } catch {
      hash.update('deleted');
    }
  }
  return { head: head.slice(0, 7), dirty: entries.length > 0, id: hash.digest('hex').slice(0, 16) };
}

export function commitsBehind(site, sha) {
  if (!sha) return null;
  const n = git(site, ['rev-list', '--count', `${sha}..HEAD`]);
  return n === null ? null : Number(n); // null: the commit is gone — rebased or amended away
}

// ── The ledger ───────────────────────────────────────────────────────────────

export function ledgerPath(site) {
  return join(site, 'node_modules', '.cache', 'website-build-kit', 'gates.json');
}

export function readLedger(site) {
  try {
    return JSON.parse(readFileSync(ledgerPath(site), 'utf8'));
  } catch {
    return {};
  }
}

export function writeResult(site, record) {
  const path = ledgerPath(site);
  mkdirSync(dirname(path), { recursive: true });
  const ledger = readLedger(site);
  ledger[record.script] = record;
  writeFileSync(path, JSON.stringify(ledger, null, 2));
}

/**
 * A result is only as good as the tree it ran on.
 *   fail  — the last run failed. Stays failed until a run passes; a newer
 *           tree does not launder it into "stale".
 *   stale — passed, but on a different tree, or measured a dist/ that was
 *           not built from the tree it ran on.
 */
export function statusOf(record, fp, site) {
  if (!record) return { key: 'never', behind: null, fresh: false };
  const behind = commitsBehind(site, record.sha);
  const fresh = !!fp && record.fingerprint === fp.id && record.distFresh !== false;
  if (record.result === 'fail') return { key: 'fail', behind, fresh };
  if (!fresh) return { key: 'stale', behind, fresh };
  return { key: record.result, behind, fresh };
}

// ── BUILD-STATE.md ───────────────────────────────────────────────────────────
//
// Read leniently: the file is hand-written at every gate, and a parser that
// throws on a stray line would be a console that shows nothing. Lines still
// carrying the stub's ⚠ placeholder are reported as unfilled, never as data.

export function parseBuildState(text) {
  const out = { exists: true, phase: null, phaseState: null, gatesPassed: [], next: null, blockers: [], integrations: [], preserve: [], unfilled: 0 };
  let section = null;
  let openBlock = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (/^```/.test(line)) continue;

    const phase = line.match(/^##\s*Phase\s+(\d+)\s*·\s*([^\[]+?)\s*\[([^\]]+)\]/i);
    if (phase) {
      section = 'phase';
      out.phase = Number(phase[1]);
      out.phaseState = phase[3].trim();
      continue;
    }
    const heading = line.match(/^##\s+(.+?)(\s+←.*)?$/);
    if (heading) {
      section = heading[1].toLowerCase().startsWith('integrations') ? 'integrations'
        : heading[1].toLowerCase().startsWith('preserve') ? 'preserve' : 'other';
      openBlock = false;
      continue;
    }

    if (section === 'phase') {
      const field = line.match(/^(Gates passed|Open|Next)\s{2,}(.*)$/);
      if (field) openBlock = field[1] === 'Open';
      else if (/^\S/.test(line)) openBlock = false;
      const value = field ? field[2] : openBlock ? line.trim() : null;
      if (field?.[1] === 'Gates passed') {
        out.gatesPassed = [...value.matchAll(/(\d+)\s+[^\s✅]*\s*✅/g)].map((m) => Number(m[1]));
      } else if (field?.[1] === 'Next') {
        out.next = value.includes('⚠') ? null : value;
      } else if (openBlock && value) {
        if (value.includes('⚠')) { out.unfilled++; continue; }
        const b = value.match(/^([!?])\s*(.+)$/);
        if (b) out.blockers.push({ kind: b[1] === '!' ? 'blocking' : 'question', text: b[2] });
      }
      continue;
    }

    if (section === 'integrations' || section === 'preserve') {
      const item = line.match(/^-\s*\[( |x|X)\]\s*(.+)$/);
      if (!item) continue;
      const body = item[2].replace(/\s+←.*$/, '');
      if (body.startsWith('⚠')) { out.unfilled++; continue; }
      const parts = body.split(/\s+·\s+/);
      const ticked = item[1] !== ' ';
      const dropped = /\bdropped\b/i.test(body);
      const date = body.match(/\b(\d{4}-\d{2}-\d{2}|\d{1,2} [A-Z][a-z]{2,8}(?: \d{4})?)\b/)?.[1] ?? null;
      const entry = {
        name: parts[0],
        detail: parts.slice(1).join(' · '),
        // No third state: ticked-and-not-dropped is verified, a drop counts only
        // with a date on it, and everything else is open.
        state: dropped ? (date ? 'dropped' : 'open') : ticked ? 'verified' : 'open',
        date,
        raw: body,
      };
      (section === 'integrations' ? out.integrations : out.preserve).push(entry);
    }
  }
  return out;
}

// ── Putting it together ──────────────────────────────────────────────────────

export function readSite(site) {
  site = resolve(site);
  const pkgPath = join(site, 'package.json');
  if (!existsSync(pkgPath)) return { error: `No package.json in ${site}. Point the server at a site built from the kit (--site <dir>).` };
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (!pkg.scripts?.tells || !pkg.scripts?.verify) {
    return { error: `${site} does not look like a site built from the kit — no \`tells\` or \`verify\` script.` };
  }
  return { site, pkg };
}

export function kitStatus(siteDir) {
  const { site, pkg, error } = readSite(siteDir);
  if (error) return { error };

  const fp = fingerprint(site);
  const ledger = readLedger(site);
  const statePath = join(site, 'BUILD-STATE.md');
  const state = existsSync(statePath) ? parseBuildState(readFileSync(statePath, 'utf8')) : { exists: false, phase: null, gatesPassed: [], blockers: [], integrations: [], preserve: [], unfilled: 0 };

  const gates = Object.entries(GATES).map(([script, def]) => {
    const record = ledger[script];
    if (!pkg.scripts[script]) return { script, phase: def.phase, result: 'missing', status: { key: 'missing', behind: null, fresh: false }, summary: 'Not in this site\'s package.json — predates the script, or was removed' };
    return {
      script,
      phase: def.phase,
      result: record?.result ?? 'never',
      sha: record?.sha ?? null,
      at: record?.at ?? null,
      durationMs: record?.durationMs ?? null,
      summary: record?.summary ?? 'Never run',
      status: statusOf(record, fp, site),
    };
  });

  const current = state.phase;
  const phases = PHASES.map((label, i) => ({
    id: i,
    label,
    state: state.gatesPassed.includes(i) ? 'done' : i === current ? 'active' : 'pending',
  }));

  // The gate for the current phase needs its own gates and every earlier one's,
  // green on the tree as it is now.
  const due = current === null ? [] : gates.filter((g) => g.phase <= current && g.status.key !== 'missing');
  const notReady = due.filter((g) => !['pass', 'warn'].includes(g.status.key));

  const subject = git(site, ['log', '-1', '--format=%s']);
  return {
    site: {
      name: pkg.name,
      path: site,
      kitVersion: pkg.websiteBuildKit?.version ?? null,
      head: fp ? { sha: fp.head, subject, dirty: fp.dirty } : null,
    },
    buildState: {
      exists: state.exists,
      phase: current,
      phaseState: state.phaseState ?? null,
      next: state.next ?? null,
      unfilled: state.unfilled,
    },
    phases,
    // No mechanical gate is not a green gate. Recon, extraction and the
    // content model close on a judgement build.md describes; say so rather
    // than report an empty list as "ready".
    phaseGate: current === null ? null : due.length === 0 ? {
      phase: current,
      ready: null,
      waitingOn: [],
      note: `No script gates phase ${current} (${PHASES[current] ?? '?'}). Its gate in build.md §3 is a judgement — read it there.`,
    } : {
      phase: current,
      ready: notReady.length === 0,
      waitingOn: notReady.map((g) => `${g.script} (${g.status.key})`),
    },
    gates,
    blockers: state.blockers,
    integrations: state.integrations,
    preserve: state.preserve,
    ledger: ledgerPath(site),
  };
}
