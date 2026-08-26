/**
 * A script that uses a lib export without importing it.
 *
 *   node scripts/check-refs.mjs        # or: npm run check:refs
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * `npm run recon` — the first command in the documented workflow — shipped
 * broken. `recon.mjs` read `PRESERVED` and never imported it, so a real
 * migration died with `ReferenceError: PRESERVED is not defined` AFTER doing
 * all its network work, at the last section of the file.
 *
 * Nothing could have caught it:
 *
 *   node --check     parses only. An undefined identifier is valid syntax.
 *   astro check      types .astro and .ts, not the standalone .mjs scripts.
 *   CI               runs the build; recon needs a live site, so it never ran.
 *   smoke-running    the failure is on line 302, reached only after the crawl.
 *                    Tested: a load-check passes the broken file.
 *
 * ── WHY IT ONLY LOOKS AT lib/ EXPORTS ──────────────────────────────────────
 * The obvious version — flag every SCREAMING_CASE identifier that is never
 * bound — was written first and produced seven false positives on a clean
 * tree: `WCAG` and `CAA` in prose, `ERR_ABORTED` inside a regex literal, `AND`
 * in a comment. Stripping comments and strings with regexes is a losing game
 * without a parser, and a checker that cries wolf is one people switch off.
 *
 * Restricting it to names that `scripts/lib/*.mjs` actually exports removes
 * the guesswork: those are real bindings, they are the shape a refactor drops
 * an import for, and prose never collides with them. Narrow and silent beats
 * broad and noisy.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS = join(ROOT, 'template/scripts');
const LIB = join(SCRIPTS, 'lib');

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

/* Every name the shared libs expose, and which file exposes it. */
const exported = new Map();
for (const file of readdirSync(LIB).filter((f) => f.endsWith('.mjs'))) {
  const src = readFileSync(join(LIB, file), 'utf8');
  for (const m of src.matchAll(/^export\s+(?:const|let|function|class)\s+([A-Za-z_$][\w$]*)/gm)) {
    exported.set(m[1], `./lib/${file}`);
  }
}

const problems = [];

for (const file of readdirSync(SCRIPTS).filter((f) => f.endsWith('.mjs'))) {
  const path = join(SCRIPTS, file);
  const src = readFileSync(path, 'utf8');

  /* What this file imports, under whatever local name it binds them to. */
  const imported = new Set();
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop();
      if (name) imported.add(name);
    }
  }
  for (const m of src.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from/g)) imported.add(m[1]);

  /* Anything declared locally shadows the lib name legitimately. */
  const declared = new Set(
    [...src.matchAll(/(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]),
  );

  const missing = [];
  for (const [name, from] of exported) {
    if (imported.has(name) || declared.has(name)) continue;
    /* Used as a value: not preceded by a dot, not a property key. */
    const used = new RegExp(`(?<![.\\w$])${name}(?![\\w$]*\\s*:)\\b`).test(src);
    if (used) missing.push({ name, from });
  }

  if (missing.length) problems.push({ file: relative(ROOT, path), missing });
}

console.log(`${BOLD}── Lib exports used without an import ${'─'.repeat(21)}${RESET}`);
console.log(`  ${DIM}${exported.size} export(s) across scripts/lib/${RESET}`);

if (!problems.length) {
  console.log(`\n${GREEN}✓${RESET} every lib export a script uses is imported\n`);
  process.exit(0);
}

for (const p of problems) {
  console.log(`\n  ${RED}✗${RESET} ${p.file}`);
  for (const m of p.missing) {
    console.log(`      ${m.name} ${DIM}— used, but never imported from ${m.from}${RESET}`);
  }
}
console.log(
  `\n${RED}${problems.length} file(s) would throw ReferenceError at run time${RESET}\n` +
    `  ${DIM}node --check will not see this: an undefined identifier is valid syntax.${RESET}\n`,
);
process.exit(1);
