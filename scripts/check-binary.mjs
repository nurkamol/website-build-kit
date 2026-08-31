/**
 * Refuse a tracked source file that git and grep treat as binary.
 *
 *   npm run check:binary
 *
 * ── THE HOLE THIS CLOSES IS IN THE PROVENANCE GATE ITSELF ──────────────────
 * `CLAUDE.md` already records the failure: one script used a literal NUL as a
 * string sentinel, which made it binary, which made it **invisible to the
 * provenance sweep** — while containing a client's entire brand, both
 * typefaces and a base64 palette. It sat there for two commits.
 *
 * ⚠ THE FIX WAS TO THAT ONE FILE. Nothing was added that would catch the next
 *   one, and the sweep is still written with `grep -I`, which skips binary
 *   files by definition. The one file that defeats the gate remains the one
 *   file the gate cannot see.
 *
 * It is worth catching because the tools lie *quietly* rather than loudly:
 *
 *   - `grep` returns nothing and exits 1 — exactly as it does for "no match"
 *   - `git diff` renders it as `Binary files differ`, so changes never appear
 *     in review
 *   - the provenance sweep's own `grep -I` skips it in silence
 *
 * ── HOW IT WORKS, AND THE VERSION THAT DOES NOT ────────────────────────────
 * Ask git which files it tracks, ask git again which of those it can read as
 * text, and take the difference.
 *
 * ⚠ `git grep -I --files-without-match ''` READS LIKE THE ANSWER AND IS NOT.
 *   It prints nothing either way, so it would ship as a check that always
 *   passes — the exact shape `test:gates` exists to catch. This file was
 *   verified in both directions before it was trusted: silent on a clean tree,
 *   and naming the file when one carries a NUL.
 *
 * ⚠ AN EMPTY FILE IS NOT A BINARY FILE. `git grep ''` matches lines, and a
 *   zero-byte file has none — so it never appears in the "readable as text"
 *   list and would be reported as binary. Excluded by size, not by guessing.
 */

import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';

/* The extensions a human reviews. A `.png` is legitimately binary; a `.mjs` is
   not, and the point is files whose *review* is silently defeated. */
const GLOBS = [
  '*.mjs',
  '*.js',
  '*.cjs',
  '*.ts',
  '*.tsx',
  '*.astro',
  '*.css',
  '*.md',
  '*.json',
  '*.jsonc',
  '*.yml',
  '*.yaml',
  '*.html',
  '*.txt',
  '*.sh',
];

const git = (...args) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      .split('\n')
      .filter(Boolean);
  } catch (err) {
    /* `git grep` exits 1 when nothing matches, which is not an error here. */
    if (err.status === 1 && typeof err.stdout === 'string') {
      return err.stdout.split('\n').filter(Boolean);
    }
    throw err;
  }
};

let tracked;
let textual;
try {
  tracked = git('ls-files', '--', ...GLOBS);
  textual = new Set(git('grep', '-I', '-l', '', '--', ...GLOBS));
} catch (err) {
  console.error(`\n${RED}✗ check:binary could not ask git${RESET}\n\n  ${err.message}\n`);
  process.exit(1);
}

if (!tracked.length) {
  console.error(`\n${RED}✗ git reports no tracked source files — refusing to pass vacuously${RESET}\n`);
  process.exit(1);
}

const suspect = tracked.filter((file) => {
  if (textual.has(file)) return false;
  try {
    return statSync(file).size > 0; // an empty file has no lines to match
  } catch {
    return false; // deleted but still indexed
  }
});

if (!suspect.length) {
  console.log(`${GREEN}✓${RESET} ${tracked.length} tracked source file(s), all readable as text`);
  process.exit(0);
}

console.error(`\n${RED}✗ ${suspect.length} tracked source file(s) that git treats as BINARY${RESET}\n`);
for (const file of suspect) console.error(`    ${file}`);
console.error(
  `\n  ${DIM}Your review process cannot see into these. \`git diff\` shows only\n` +
    `  "Binary files differ", \`grep\` returns nothing and exits 1 exactly as it\n` +
    `  does for no-match, and the provenance sweep's own \`grep -I\` skips them.\n\n` +
    `  Almost always a literal NUL used as a sentinel. Find it with:\n` +
    `      LC_ALL=C grep -c $'\\\\0' <file>\n` +
    `  and replace it with an escape the source can show.${RESET}\n`,
);
process.exit(1);
