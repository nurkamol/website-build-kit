/**
 * Check the kit's own documentation against the kit.
 *
 *   node scripts/audit-docs.mjs        # or: npm run audit:docs
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * Documentation rots silently and nothing tests it. Run by hand twice, this
 * found: a reference to a table that no longer existed anywhere, a section
 * number that had moved (`§6 stack profile` when it is `build.md` §4), a gate
 * table written backwards, and a load-order comment contradicting the actual
 * `@import`s. Every one of them read as correct.
 *
 * The kit's whole thesis is that a claim nobody checks drifts. That applies to
 * the kit.
 *
 * ── IT MUST NOT CRY WOLF ───────────────────────────────────────────────────
 * A checker with false positives gets ignored, and then it is worse than
 * nothing because its silence means "not looked at" rather than "fine". Every
 * rule below is deliberately narrow, and the exclusions are documented where
 * they are, not in a config nobody reads.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const RESET = '[0m';
const RED = '[31m';
const GREEN = '[32m';
const DIM = '[2m';
const BOLD = '[1m';

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    /* `recon/` is a migration's captured output, not this kit's documentation.
       Running recon+extract inside template/ while developing the kit put 18
       extracted pages into the audit and took it from 26 files to 44. */
    if (['node_modules', 'dist', '.astro', '.git', 'recon', 'shots'].includes(e.name)) return [];
    const full = join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });

const docs = walk(ROOT).filter((f) => f.endsWith('.md'));
const problems = [];
let countedFailures = 0;
const fail = (file, msg) => problems.push({ file: relative(ROOT, file), msg });

/* Section headings per file — `## 3.` and `### 1b.` both count. */
const sections = new Map();
for (const d of docs) {
  const body = readFileSync(d, 'utf8');
  const nums = new Set([...body.matchAll(/^#{2,4}\s+(\d+[a-z]?)\./gm)].map((m) => m[1]));
  /* ⚠ basename(), not split('/'). On Windows `walk` returns
     `skills\\website-build\\SKILL.md`, so splitting on a forward slash returns the
     WHOLE PATH as the key. Every later lookup by bare filename then missed and
     the audit reported 79 phantom problems — on its first Windows run. */
  sections.set(basename(d), nums);
}

/*
 * Both package.json files. The kit has its own scripts (`audit:docs`) and the
 * template has the site's — a doc may legitimately name either, and checking
 * only one reported the kit's own command as missing.
 */
const scripts = new Set(
  ['package.json', 'template/package.json'].flatMap((f) =>
    Object.keys(JSON.parse(readFileSync(join(ROOT, f), 'utf8')).scripts ?? {}),
  ),
);

/*
 * CHANGELOG.md is history. Its entries describe the kit as it was on a date,
 * so a reference that no longer resolves is a correct record, not a defect.
 */
const isHistory = (f) => f.endsWith('CHANGELOG.md');

for (const file of docs) {
  const body = readFileSync(file, 'utf8');
  const self = basename(file);

  /* ── 1. Section references ──────────────────────────────────────────────
   * `stacks.md §1d` must exist in stacks.md; a bare `§4` must exist here.
   * WCAG success criteria (§1.4.10) are not document sections — the decimal
   * is what distinguishes them.
   */
  if (!isHistory(file)) {
    for (const m of body.matchAll(/(?:([a-z-]+\.md)`?\s*)?§\s*(\d+[a-z]?)(\.\d)?/g)) {
      if (m[3]) continue; // §1.4.10 — a WCAG criterion
      const before = body.slice(Math.max(0, m.index - 90), m.index);
      const named = m[1] ?? [...before.matchAll(/([a-z-]+\.md)/g)].pop()?.[1] ?? self;
      const known = sections.get(named);
      if (!known) fail(file, `§${m[2]} refers to ${named}, which is not a doc in this kit`);
      else if (!known.has(m[2])) fail(file, `${named} §${m[2]} does not exist`);
    }
  }

  /* ── 2. npm scripts ─────────────────────────────────────────────────────
   * The character class includes digits so `a11y` is one token, not `a`.
   */
  for (const m of body.matchAll(/npm run ([a-z0-9:]+)/g)) {
    if (!scripts.has(m[1])) fail(file, `npm run ${m[1]} is not a script in either package.json`);
  }

  /* ── 3. Paths in backticks ──────────────────────────────────────────────
   * Only paths rooted at a directory the kit actually has, so prose like
   * `src/content/blog/my-post.md` in an editing guide — an example filename,
   * not a file — is skipped by requiring the parent directory to exist too.
   */
  for (const m of body.matchAll(/`((?:src|scripts|docs|public|skills|commands|template)\/[A-Za-z0-9_./-]+)`/g)) {
    const p = m[1];
    if (p.includes('*') || p.endsWith('/')) continue;
    const candidates = [join(ROOT, p), join(ROOT, 'template', p)];
    if (candidates.some(existsSync)) continue;
    /* An example filename inside a directory that exists is a placeholder, not
       a broken reference. A path whose PARENT is missing is a real mistake. */
    if (candidates.some((c) => existsSync(dirname(c)))) continue;
    fail(file, `${p} does not exist`);
  }

  /* ── 4. Data fields ─────────────────────────────────────────────────────
   * `business.phone.e164` must be reachable in business.ts. Skip file
   * extensions — `business.ts` is a filename, not a field.
   */
  for (const m of body.matchAll(/`(business|site)\.([A-Za-z][A-Za-z0-9]*)/g)) {
    const [, obj, field] = m;
    if (['ts', 'js', 'mjs', 'json'].includes(field)) continue;
    /* `site.es` in the i18n table is a ccTLD example, not a field. No real
       field on these objects is under three characters. */
    if (field.length < 3) continue;
    const src = readFileSync(join(ROOT, `template/src/data/${obj}.ts`), 'utf8');
    if (!new RegExp(`\\b${field}\\b`).test(src)) fail(file, `${obj}.${field} is not in ${obj}.ts`);
  }
}

/* ── 5. Every source file must be readable by a text grep ─────────────────
 *
 * A single NUL byte makes a file binary, `grep -I` skips it, and the kit's
 * provenance sweep uses -I. One script full of a client's brand stayed
 * invisible to that check for two commits.
 */
for (const f of walk(join(ROOT, 'template/scripts')).concat(walk(join(ROOT, 'template/src')))) {
  if (!/\.(mjs|js|ts|astro|css|json)$/.test(f)) continue;
  if (readFileSync(f).includes(0)) fail(f, 'contains a NUL byte — invisible to `grep -I`');
}

/* ── 6. A script documented NOWHERE ────────────────────────────────────────
 *
 * Checks 1–4 verify that references RESOLVE. Nothing verified the inverse —
 * that a feature is described anywhere at all — and that is the gap the audit
 * was green through twice: `npm run dns` and the staging badge both shipped,
 * were documented in docs/the-template.md, and were absent from the README for
 * a week. This does not catch that one (see the information block below, which
 * cannot be a gate) but it does catch the harder version: a script that ships
 * and is named in no builder-facing document at all.
 *
 * CHANGELOG and roadmap do not count as documentation. The changelog is a
 * record of what happened on a date and the roadmap's Done table is a list of
 * titles — a feature named only there has still not been explained to anybody.
 */
const isRecord = (f) => f.endsWith('CHANGELOG.md') || f.endsWith('roadmap.md');
const proseDocs = docs.filter((f) => !isRecord(f));
const prose = proseDocs.map((f) => readFileSync(f, 'utf8')).join('\n');

/* ── 4b. The failure count claimed in prose must be the real one ──────────
 *
 * The landing page, its meta description, its JSON-LD and the repository
 * description all quote a number of documented silent failures. That number was
 * written once, by hand, and was never computed from anything — reconstructing
 * it later from the files it supposedly counted produced 30, 35, 49 and 57, but
 * never the number on the page.
 *
 * ⚠ NOTHING GOES STALE AS QUIETLY AS A NUMBER. It stays plausible forever, it
 *   is quoted back by anyone who reads it, and no reader can tell. Every entry
 *   added to traps.md since made the claim more wrong.
 *
 * THE DEFINITION, so the count is reproducible rather than a judgement:
 *
 *   traps.md `###` entries          — the file whose bar IS "it failed silently"
 * + compliance.md §8 entries        — CLAUDE.md: §8 takes entries on trap terms
 *
 * `build.md` §6 is deliberately NOT counted. It restates the same failures in
 * framework-neutral language — "enforced trailing slashes break form POSTs" is
 * traps.md's "`trailingSlash: 'always'` breaks form POSTs" — so adding it would
 * count most of them twice. `compliance.md` §5 is not counted either: those are
 * criteria that fail LOUDLY and get fixed, and §5 says so itself.
 */
{
  const traps = readFileSync(join(ROOT, 'skills/website-build/references/traps.md'), 'utf8');
  const compliance = readFileSync(join(ROOT, 'skills/website-build/references/compliance.md'), 'utf8');
  const section8 = compliance.slice(compliance.indexOf('\n## 8.'), compliance.indexOf('\n## 9.'));

  const actual =
    (traps.match(/^### /gm) ?? []).length + (section8.match(/^\*\*/gm) ?? []).length;

  /* Checked in the landing page too, not only markdown — that is where most of
     the copies live, and it is the one file a reader sees. */
  const claimants = [...proseDocs, join(ROOT, 'site/index.html')].filter(existsSync);

  for (const file of claimants) {
    const body = readFileSync(file, 'utf8');
    for (const m of body.matchAll(/\b(\d{2,3})\s+(?:documented\s+)?(?:silent\s+)?failures?\b/g)) {
      if (Number(m[1]) !== actual) {
        fail(file, `claims ${m[1]} failures; traps.md + compliance.md §8 hold ${actual}`);
      }
    }
  }
  countedFailures = actual;
}


/* `build`, `dev` and `preview` are npm conventions rather than this kit's
   inventions, and `preview` is deliberately undocumented — it is an alias for
   `wrangler dev`, which the docs name directly, and a second name for one
   command is how two names drift. */
const CONVENTIONAL = new Set([
  'dev', 'build', 'preview', 'check', 'astro',
  /* Deploy plumbing: named in the quickstart block and in runbook.md §go-live
     as commands to run, not as capabilities to explain. */
  'build:staging', 'build:production', 'deploy:staging', 'deploy:production',
]);

const templateEntries = Object.entries(
  JSON.parse(readFileSync(join(ROOT, 'template/package.json'), 'utf8')).scripts ?? {},
);
const templateScripts = templateEntries.map(([name]) => name);

/*
 * A doc may name the SCRIPT rather than the command — the README explains
 * `check-sitemap` by filename, which is a perfectly good description of the
 * feature and would otherwise read as undocumented. Accept either form.
 *
 * ⚠ ANCHORED, NOT A SUBSTRING. The first version matched the bare filename
 * anywhere in the prose, which made the check silently useless: a script named
 * `orphan` counted as documented because traps.md contains the word
 * "orphaned". `console` would have matched every `console.log` in a code
 * fence, and `media` every mention of social media. A check that always passes
 * is worse than no check, because its silence reads as "looked at".
 */
const mentions = (body, name, command) => {
  if (body.includes(`npm run ${name}`)) return true;
  const file = /scripts\/([a-z0-9-]+)\.mjs/.exec(command)?.[1];
  if (!file) return false;
  /* The two forms a doc actually uses: the path, or the name in backticks. */
  return body.includes(`scripts/${file}.mjs`) || body.includes(`\`${file}\``);
};

const undocumented = templateEntries
  .filter(([name, command]) => !CONVENTIONAL.has(name) && !mentions(prose, name, command))
  .map(([name]) => name);
for (const name of undocumented) {
  fail(join(ROOT, 'README.md'), `npm run ${name} ships and is documented in no builder-facing doc`);
}

/* Same inverse, for the skill: a reference file nothing points at is a file the
   model will never load, which makes it invisible rather than merely untidy. */
const skillBody = readFileSync(join(ROOT, 'skills/website-build/SKILL.md'), 'utf8');
for (const ref of readdirSync(join(ROOT, 'skills/website-build/references'))) {
  if (!ref.endsWith('.md')) continue;
  if (!skillBody.includes(ref)) {
    fail(join(ROOT, 'skills/website-build/SKILL.md'), `references/${ref} exists but SKILL.md never points at it`);
  }
}

/* ── What this cannot check ───────────────────────────────────────────────
 *
 * Printed, never failed. The README is a curated account of what the kit
 * ships, not an index of its scripts — `cards`, `lastmod` and `indexnow` are
 * deliberately absent because they are occasional. So "is the README complete"
 * is a judgement, and a gate that goes red on a judgement is a gate somebody
 * deletes rather than argues with.
 *
 * It is still the file most people read first, and it has now fallen behind
 * twice for the same reason. So this refuses to be silent about it without
 * pretending to know the answer.
 */
const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
const notInReadme = templateEntries
  .filter(([name, command]) => !CONVENTIONAL.has(name) && !mentions(readme, name, command))
  .map(([name]) => name);

/* ── Report ─────────────────────────────────────────────────────────────── */

console.log(`${BOLD}── Documentation audit ${'─'.repeat(36)}${RESET}`);
console.log(
  `  ${DIM}${docs.length} markdown file(s) · ${sections.size} with numbered sections · ` +
    `${scripts.size} npm scripts${RESET}\n`,
);

const advisory = () => {
  if (!notInReadme.length) return;
  const covered = templateScripts.filter((n) => !CONVENTIONAL.has(n)).length - notInReadme.length;
  const total = templateScripts.filter((n) => !CONVENTIONAL.has(n)).length;
  console.log(`  ${DIM}Not checked — README.md names ${covered} of ${total} template capabilities. ` +
    `Absent, which may be correct:${RESET}`);
  console.log(`      ${DIM}${notInReadme.join(', ')}${RESET}`);
  console.log(`  ${DIM}It is the file most people read first, and it has fallen behind twice.${RESET}\n`);
};

if (!problems.length) {
  console.log(`${GREEN}✓${RESET} every section reference, script, path and data field resolves\n`);
  advisory();
  process.exit(0);
}

const byFile = new Map();
for (const p of problems) {
  if (!byFile.has(p.file)) byFile.set(p.file, new Set());
  byFile.get(p.file).add(p.msg);
}
for (const [file, msgs] of byFile) {
  console.log(`  ${RED}✗${RESET} ${file}`);
  for (const m of msgs) console.log(`      ${m}`);
}
console.log(`\n${RED}${[...byFile.values()].reduce((n, s) => n + s.size, 0)} problem(s)${RESET}\n`);
advisory();
process.exit(1);
