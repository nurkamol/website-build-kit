/**
 * Refuse a client's name, domain or email in this public repository — and in
 * the commit message, which no other check here reads.
 *
 *   npm run check:privacy                         every tracked file + HEAD's message
 *   node scripts/check-privacy.mjs --staged       what is staged (the pre-commit hook)
 *   node scripts/check-privacy.mjs --message F    a commit message being written (commit-msg hook)
 *   node scripts/check-privacy.mjs --require-patterns   CI on push: zero patterns is a failure
 *
 * Exit 0 clean · 1 a match, or a pattern file that would itself be committed.
 *
 * ── THE PATTERNS ARE NEVER IN THE REPO ─────────────────────────────────────
 * A denylist of past clients, committed to a public repo, is the leak it is
 * meant to prevent. So the names come from two places git never sees:
 *
 *   .privacy-patterns   untracked, ignored, one regular expression per line,
 *                       `#` comments. Read from the MAIN checkout, so every
 *                       worktree is covered by the one file.
 *   PRIVACY_PATTERNS    newline-separated, the same format. In CI it is the
 *                       repository secret of the same name.
 *
 * Plus one rule that needs no list: an email address outside the placeholder
 * domains (example.com, .test, …). A real address in a public repo is wrong
 * whoever it belongs to.
 *
 * ── WHAT IT PRINTS ─────────────────────────────────────────────────────────
 * The file, the line and WHICH pattern (by number) — never the matched text.
 * A CI log is public on a public repo; echoing the name to say it was found
 * would publish it there instead.
 *
 * ── WHAT IT IS NOT ─────────────────────────────────────────────────────────
 * The provenance sweep in CLAUDE.md is still the method. A denylist tests for
 * the mistakes you already made; the sweep greps for the SHAPE client data
 * takes — a hex, a face, a town, a phone number, a clock — and catches the
 * next client, who is on nobody's list yet. This is the floor under it: cheap
 * enough to run on every commit, and the only thing that reads the message.
 * The two builds the kit was extracted from are named on purpose (CLAUDE.md's
 * Provenance section, the changelog, the references); a pattern for either
 * fires on all of those lines, which is the check working — list the clients
 * who are NOT meant to be named.
 *
 * A file git calls binary is skipped here as it is by `grep -I` —
 * `npm run check:binary` is what makes sure no source file is one.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';

const argv = process.argv.slice(2);
const staged = argv.includes('--staged');
const messageAt = argv.indexOf('--message');
const messageFile = messageAt === -1 ? null : argv[messageAt + 1];
const requirePatterns = argv.includes('--require-patterns');

if (messageAt !== -1 && !messageFile) {
  console.error('usage: check-privacy.mjs [--staged | --message <file>] [--require-patterns]');
  process.exit(1);
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

let top;
let mainRoot;
try {
  top = git('rev-parse', '--show-toplevel').trim();
  /* A worktree's common dir is the main checkout's .git — the patterns file
     lives beside that, once, rather than in every worktree. */
  mainRoot = dirname(resolve(top, git('rev-parse', '--git-common-dir').trim()));
} catch (err) {
  console.error(`${RED}✗ check:privacy could not ask git${RESET}\n  ${err.message}`);
  process.exit(1);
}

/* ── The pattern file must not be the leak ────────────────────────────────
   Checked first: a tracked or un-ignored .privacy-patterns is the whole list
   on its way into the public history, and `git add .` is all it takes. */
const PATTERN_FILE = '.privacy-patterns';
const problems = [];
if (git('ls-files', '--', PATTERN_FILE).trim()) {
  problems.push(`${PATTERN_FILE} is TRACKED — that publishes the list. git rm --cached ${PATTERN_FILE}`);
}
for (const root of new Set([top, mainRoot])) {
  if (!existsSync(join(root, PATTERN_FILE))) continue;
  try {
    execFileSync('git', ['-C', root, 'check-ignore', '-q', PATTERN_FILE]);
  } catch {
    problems.push(`${PATTERN_FILE} exists in ${root === top ? 'this checkout' : 'the main checkout'} and is NOT gitignored — \`git add .\` would publish it`);
  }
}

/* ── The rules ───────────────────────────────────────────────────────────── */
const sources = [
  ...[...new Set([top, mainRoot])].flatMap((root) =>
    existsSync(join(root, PATTERN_FILE)) ? readFileSync(join(root, PATTERN_FILE), 'utf8').split(/\r?\n/) : [],
  ),
  ...(process.env.PRIVACY_PATTERNS ?? '').split(/\r?\n/),
];
const rules = [];
for (const line of sources) {
  const t = line.trim();
  if (!t || t.startsWith('#') || rules.some((r) => r.source === t)) continue;
  try {
    rules.push({ source: t, re: new RegExp(t, 'i'), label: `private pattern #${rules.length + 1}` });
  } catch {
    problems.push(`private pattern #${rules.length + 1} is not a valid regular expression`);
  }
}

/* Placeholder domains (RFC 2606 / 6761) and the addresses git itself writes — plus
   support@github.com, which Dependabot puts in a Signed-off-by trailer and a squash merge
   copies into the message on master. Merging Dependabot #14 turned master red on it. */
const ALLOWED_EMAIL =
  /^(?:[^@]+@(?:[\w-]+\.)*(?:example\.(?:com|org|net)|example|test|invalid|localhost)|git@github\.com|support@github\.com|[^@]+@users\.noreply\.github\.com|noreply@anthropic\.com)$/i;
const EMAIL = /[\w.+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b/gi;

/** Lockfiles carry package authors' addresses; they are the registry's data, not ours. */
const SKIP = /(?:^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/;
const BINARY = /\.(?:png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|zip|gz|tgz|pdf|mp4|webm|wasm|heic)$/i;

const hits = [];
function scan(name, text) {
  for (const r of rules) if (r.re.test(name)) hits.push(`${name}: file name — ${r.label}`);
  if (text.includes('\0')) return;
  text.split('\n').forEach((line, i) => {
    for (const r of rules) if (r.re.test(line)) hits.push(`${name}:${i + 1} — ${r.label}`);
    for (const m of line.matchAll(EMAIL)) {
      /* `pkg@1.2.3` and `@scope/pkg@4` are versions, not addresses. */
      if (/@v?\d/.test(m[0]) || /@[\w-]+\.(?:m?js|ts|css|json|png|svg|webp|jpe?g)$/i.test(m[0])) continue;
      if (!ALLOWED_EMAIL.test(m[0])) hits.push(`${name}:${i + 1} — an email address outside the placeholder domains`);
    }
  });
}

let scanned = 0;
if (messageFile) {
  /* Git's own comment lines (the status summary under the message) are not
     part of the commit. */
  const message = readFileSync(messageFile, 'utf8').split('\n').filter((l) => !l.startsWith('#')).join('\n');
  scan('commit message', message);
  scanned = 1;
} else {
  const files = (staged ? git('diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z') : git('ls-files', '-z'))
    .split('\0')
    .filter((f) => f && !SKIP.test(f));
  for (const f of files) {
    if (BINARY.test(f)) {
      for (const r of rules) if (r.re.test(f)) hits.push(`${f}: file name — ${r.label}`);
      continue;
    }
    let text;
    try {
      text = staged ? git('show', `:${f}`) : readFileSync(join(top, f), 'utf8');
    } catch {
      continue; // deleted in the working tree, or a submodule
    }
    scan(f, text);
    scanned++;
  }
  /* CI checks out one commit, so its message is the one thing to read. */
  if (!staged) {
    try {
      scan('HEAD commit message', git('log', '-1', '--format=%B'));
    } catch {
      /* no commits yet */
    }
  }
}

if (requirePatterns && !rules.length) {
  problems.push(
    'no private patterns loaded and --require-patterns was given. Set the PRIVACY_PATTERNS secret ' +
      '(Settings → Secrets and variables → Actions) — without it only the email rule runs, and a clean ' +
      'result would mean nothing was looked for',
  );
}

const unique = [...new Set(hits)];
if (problems.length || unique.length) {
  console.error(`\n${RED}✗ check:privacy — this repository is public${RESET}\n`);
  for (const p of problems) console.error(`    ${p}`);
  for (const h of unique.slice(0, 100)) console.error(`    ${h}`);
  if (unique.length > 100) console.error(`    … and ${unique.length - 100} more`);
  if (unique.length) {
    console.error(
      `\n  ${DIM}The matched text is not printed, on purpose: a CI log on a public repo is public.\n` +
        `  Replace it with example.com / Example Studio style data. For a commit message,\n` +
        `  \`git commit --amend\` before pushing; once pushed, it is in the history.${RESET}\n`,
    );
  }
  process.exit(1);
}

const what = messageFile ? 'the commit message' : `${scanned} ${staged ? 'staged ' : ''}file(s)${staged ? '' : ' and HEAD’s message'}`;
if (!rules.length) {
  console.log(
    `${YELLOW}!${RESET} check:privacy: ${what} — no private patterns loaded, so only the email rule ran.\n` +
      `  ${DIM}Put client names and domains in ${PATTERN_FILE} (one regular expression per line; it is gitignored).${RESET}`,
  );
} else {
  console.log(`${GREEN}✓${RESET} check:privacy: ${what} clean against ${rules.length} private pattern(s) and the email rule`);
}
