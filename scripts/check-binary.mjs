/**
 * Refuse a tracked source file that git and grep treat as binary.
 *
 *   npm run check:binary
 *
 * The detection lives in `template/scripts/lib/binary-files.mjs` so that
 * `check-drift.mjs`, which runs inside a delivered project, uses the same one.
 * Two implementations would be free to disagree about which files count, and
 * this is a check whose whole value is that it does not miss.
 *
 * Why it exists at all is in that file: the kit's provenance sweep is written
 * with `grep -I`, so the one file able to defeat it is the one file it cannot
 * see.
 */

import { binarySourceFiles } from '../template/scripts/lib/binary-files.mjs';

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';

let tracked;
let binary;
try {
  ({ tracked, binary } = binarySourceFiles());
} catch (err) {
  console.error(`\n${RED}✗ check:binary could not ask git${RESET}\n\n  ${err.message}\n`);
  process.exit(1);
}

if (!tracked.length) {
  console.error(`\n${RED}✗ git reports no tracked source files — refusing to pass vacuously${RESET}\n`);
  process.exit(1);
}

if (!binary.length) {
  console.log(`${GREEN}✓${RESET} ${tracked.length} tracked source file(s), all readable as text`);
  process.exit(0);
}

console.error(`\n${RED}✗ ${binary.length} tracked source file(s) that git treats as BINARY${RESET}\n`);
for (const file of binary) console.error(`    ${file}`);
console.error(
  `\n  ${DIM}Your review process cannot see into these. \`git diff\` shows only\n` +
    `  "Binary files differ", \`grep\` returns nothing and exits 1 exactly as it\n` +
    `  does for no-match, and the provenance sweep's own \`grep -I\` skips them.\n\n` +
    `  Almost always a literal NUL used as a sentinel. Find it with:\n` +
    `      LC_ALL=C grep -c $'\\\\0' <file>\n` +
    `  and replace it with an escape the source can show.${RESET}\n`,
);
process.exit(1);
