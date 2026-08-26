/**
 * pa11y-ci at WCAG 2.2 AA, in BOTH colour schemes.
 *
 *   npm run a11y                                # every URL in .pa11yci.json
 *   npm run a11y -- --only=light                # one scheme
 *
 * ── WHY NOT JUST `pa11y-ci --config .pa11yci.json` ─────────────────────────
 * Because that measures whichever scheme the machine happens to be in. See
 * scripts/lib/schemes.mjs — the kit's own landing page passed a local run in
 * dark mode and failed CI in light on a genuine 3.91:1 contrast pair.
 *
 * ── ONE SOURCE FOR THE URLS ────────────────────────────────────────────────
 * `.pa11yci.json` stays the only place the URL list lives. The scheme is
 * injected into a copy at run time rather than kept as a second config file,
 * because two config files is two URL lists and one of them goes stale.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SCHEMES, configForScheme } from './lib/schemes.mjs';

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

const CONFIG = '.pa11yci.json';
if (!existsSync(CONFIG)) {
  console.error(`${RED}✗${RESET} ${CONFIG} not found — run this from the site root.`);
  process.exit(1);
}

const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith('--only=')) ?? '').replace('--only=', '');
const schemes = only ? SCHEMES.filter((s) => s === only) : SCHEMES;

if (!schemes.length) {
  console.error(`${RED}✗${RESET} --only=${only} is not a scheme. Try: ${SCHEMES.join(', ')}`);
  process.exit(1);
}

const base = JSON.parse(readFileSync(CONFIG, 'utf8'));
const urlCount = (base.urls ?? []).length;
const dir = mkdtempSync(join(tmpdir(), 'a11y-'));

console.log(`${BOLD}── Accessibility · WCAG2AA ${'─'.repeat(33)}${RESET}`);
console.log(`  ${DIM}${urlCount} URL(s) × ${schemes.length} scheme(s)${RESET}\n`);

let failed = 0;

for (const scheme of schemes) {
  const file = join(dir, `${scheme}.json`);
  writeFileSync(file, JSON.stringify(configForScheme(base, scheme), null, 2));

  console.log(`${BOLD}${scheme}${RESET}`);
  try {
    execFileSync('npx', ['pa11y-ci', '--config', file], { stdio: 'inherit' });
    console.log(`  ${GREEN}✓${RESET} ${scheme} clean\n`);
  } catch {
    failed++;
    console.log(`  ${RED}✗${RESET} ${scheme} has errors\n`);
  }
}

if (failed) {
  console.error(`${RED}✗ ${failed} of ${schemes.length} scheme(s) failed${RESET}\n`);
  process.exit(1);
}

console.log(
  `${GREEN}✓ clean in ${schemes.join(' and ')}${RESET}` +
    (schemes.length === 1 ? `\n  ${DIM}only one scheme measured — the other is untested${RESET}` : '') +
    '\n',
);
