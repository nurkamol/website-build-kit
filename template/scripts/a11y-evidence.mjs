/**
 * Write the accessibility evidence pack.
 *
 *   npm run a11y:evidence                          # against .pa11yci.json (wrangler dev)
 *   npm run a11y:evidence -- https://example.com   # against a deployed host
 *
 * Writes docs/a11y-evidence/<date>.md and leaves it for you to commit.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * `build.md` phase 9 requires an evidence pack and `compliance.md` §7 defines
 * what counts. Nothing produced it: `npm run a11y` printed to a terminal and
 * the output died with the scrollback. So the artefact that has value if anyone
 * ever asks was the one artefact never written down.
 *
 * `compliance.md` §7, verbatim: *"Hand over the evidence, not the assertion.
 * Dated tool output, which pages were tested manually and how, known gaps with
 * an owner."* Three of those four are things a script cannot know.
 *
 * ── IT MUST NOT LOOK COMPLETE ──────────────────────────────────────────────
 * Automated tooling catches roughly a third of issues, and about 42% of WCAG
 * criteria cannot be machine-checked at all. A pack that listed a clean axe run
 * and stopped would be worse than no pack: it reads as a finished audit, and it
 * is the floor.
 *
 * So the manual layers are written in as UNCHECKED every time, with the date
 * they were last done left blank for a human. The file is deliberately not
 * signable until someone fills those in.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const RESET = '[0m';
const RED = '[31m';
const GREEN = '[32m';
const YELLOW = '[33m';
const DIM = '[2m';
const BOLD = '[1m';

const host = process.argv.slice(2).find((a) => a.startsWith('http'))?.replace(/\/$/, '');
const OUT_DIR = 'docs/a11y-evidence';

/*
 * LOCAL date, not `toISOString()`.
 *
 * This is a record a person attests to having made, so it has to carry the date
 * that person would write on it. `toISOString()` is UTC: on a machine at UTC+5
 * it dates the pack YESTERDAY for the first five hours of every day, and on a
 * machine behind UTC it dates it tomorrow for the last few. Either way the file
 * is named a day off, the staleness comparison drifts with it, and the error is
 * invisible because the date it prints is always plausible.
 */
const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

const version = (pkg) => {
  try {
    return require(`${pkg}/package.json`).version;
  } catch {
    return 'unknown';
  }
};

/* ── 1. Automated sweep ──────────────────────────────────────────────────── */

console.log(`${BOLD}── pa11y-ci · WCAG2AA ${'─'.repeat(38)}${RESET}`);

const config = JSON.parse(readFileSync('.pa11yci.json', 'utf8'));
const standard = config.defaults?.standard ?? 'WCAG2AA';
const runners = config.defaults?.runners ?? ['htmlcs'];

const args = host
  ? ['pa11y-ci', '--sitemap', `${host}/sitemap-index.xml`, '--standard', standard, '--json']
  : ['pa11y-ci', '--config', '.pa11yci.json', '--json'];

let report;
try {
  /* pa11y-ci exits non-zero when it finds errors, and still prints the JSON.
     A non-zero exit here is a RESULT, not a failure to run. */
  const out = execFileSync('npx', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  report = JSON.parse(out);
} catch (error) {
  const out = error.stdout?.toString() ?? '';
  try {
    report = JSON.parse(out);
  } catch {
    console.error(
      `${RED}✗${RESET} pa11y-ci could not run.\n` +
        `  ${DIM}Start the site first: npm run build:staging && npx wrangler dev${RESET}\n` +
        `  ${(error.stderr?.toString() ?? '').slice(0, 400)}`,
    );
    process.exit(1);
  }
}

const rows = Object.entries(report.results).map(([url, issues]) => ({
  url,
  errors: issues.filter((i) => i.type === 'error'),
  warnings: issues.filter((i) => i.type === 'warning'),
  notices: issues.filter((i) => i.type === 'notice'),
}));

for (const r of rows) {
  const mark = r.errors.length ? `${RED}✗${RESET}` : `${GREEN}✓${RESET}`;
  const path = new URL(r.url).pathname;
  console.log(
    `  ${mark} ${path.padEnd(28)} ${String(r.errors.length).padStart(2)} error(s)   ` +
      `${DIM}${r.warnings.length} warning(s)${RESET}`,
  );
}

/* ── 2. Reflow, which pa11y does not cover ───────────────────────────────── */

console.log(`\n${BOLD}── reflow · 320px + 200% ${'─'.repeat(35)}${RESET}`);

let reflowOut = '';
let reflowOk = false;
try {
  reflowOut = execFileSync('node', ['scripts/check-reflow.mjs', ...(host ? [host] : [])], {
    encoding: 'utf8',
  });
  reflowOk = true;
} catch (error) {
  reflowOut = (error.stdout?.toString() ?? '') + (error.stderr?.toString() ?? '');
}
const reflowSummary = reflowOut.trim().split('\n').filter(Boolean).slice(-1)[0] ?? 'did not run';
console.log(`  ${reflowOk ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`} ${reflowSummary.replace(/\[[0-9;]*m/g, '')}`);

/* ── 3. Is the published statement still telling the truth? ──────────────── */

const statement = existsSync('src/pages/accessibility.astro')
  ? readFileSync('src/pages/accessibility.astro', 'utf8')
  : '';
const reviewed = /const reviewed = '([^']+)'/.exec(statement)?.[1] ?? null;

let staleWarning = null;
if (reviewed) {
  const parsed = new Date(reviewed);
  if (!Number.isNaN(parsed.valueOf())) {
    const days = Math.round((Date.now() - parsed.valueOf()) / 86400000);
    if (days > 0) {
      staleWarning =
        `/accessibility says it was last reviewed ${reviewed} — ${days} day(s) ago.\n` +
        `  This run is newer. Update \`reviewed\` in src/pages/accessibility.astro, or the\n` +
        `  published page is making a testing claim about a site that has moved on.`;
    }
  }
}

/* ── 4. The pack ─────────────────────────────────────────────────────────── */

const totalErrors = rows.reduce((n, r) => n + r.errors.length, 0);
const target = host ?? 'http://localhost:8788 (wrangler dev)';

const issueLines = rows
  .filter((r) => r.errors.length)
  .map(
    (r) =>
      `### ${new URL(r.url).pathname}\n\n` +
      r.errors
        .map(
          (e) =>
            `- **${e.code ?? 'unknown'}** — ${e.message}\n` +
            `  - selector: \`${e.selector || '—'}\`\n` +
            `  - runner: ${e.runner ?? '—'}\n` +
            `  - owner: ⚠ · fixed by: ⚠`,
        )
        .join('\n'),
  )
  .join('\n\n');

const pack = `# Accessibility evidence — ${today}

Target: \`${target}\`
Standard: **${standard}** · runners: ${runners.join(', ')}

| Tool | Version |
| --- | --- |
| pa11y-ci | ${version('pa11y-ci')} |
| pa11y | ${version('pa11y')} |
| axe-core | ${version('axe-core')} |

> **This is the floor, not an audit.** Automated tooling catches roughly a third of
> issues by count, and about 42% of WCAG success criteria cannot be machine-checked at
> all. The section below marked *not done by this run* is where the rest lives.

---

## 1. Automated — one URL per template family

| Page | Errors | Warnings | Notices |
| --- | --- | --- | --- |
${rows
  .map(
    (r) =>
      `| \`${new URL(r.url).pathname}\` | ${r.errors.length} | ${r.warnings.length} | ${r.notices.length} |`,
  )
  .join('\n')}

**${totalErrors} error(s) across ${rows.length} page(s).**

${issueLines || '_No errors at this standard._'}

## 2. Reflow and resize — WCAG 1.4.10 and 1.4.4

\`\`\`
${reflowOut.replace(/\[[0-9;]*m/g, '').trim() || 'did not run'}
\`\`\`

## 3. NOT done by this run — a human has to, and has to date it

⚠ **Fill these in or the pack is incomplete.** Each is a layer no tool covers, from
\`compliance.md\` §7. One full pass on one page per template family, not every URL.

| Layer | How | Done on | By |
| --- | --- | --- | --- |
| Keyboard | Tab, Shift-Tab, Enter, Space, Escape — hands off the mouse | ⚠ | ⚠ |
| Screen reader | VoiceOver + Safari, or NVDA + Firefox | ⚠ | ⚠ |
| Forms | Submit empty, submit bad, submit with JavaScript off | ⚠ | ⚠ |
| Zoom | 200% and 400% | ⚠ | ⚠ |
| Looked at it | On a real phone, at 100% | ⚠ | ⚠ |

## 4. Known gaps

⚠ **List them with an owner against each.** A documented gap is worth more than a clean
claim — and never write "fully compliant", which is the claim that gets challenged.

| Gap | Impact | Owner | Plan |
| --- | --- | --- | --- |
| ⚠ | ⚠ | ⚠ | ⚠ |

---

_Generated by \`npm run a11y:evidence\`. The published statement is at \`/accessibility\`;
keep its \`reviewed\` date in step with the newest pack in this directory._
`;

mkdirSync(OUT_DIR, { recursive: true });
const outPath = `${OUT_DIR}/${today}.md`;
writeFileSync(outPath, pack);

console.log(`\n${GREEN}✓${RESET} ${outPath}`);
console.log(
  `${DIM}  tool + version, date, per-family results, what was tested BY HAND (blank),\n` +
    `  and known gaps with an owner (blank). Fill in §3 and §4, then commit it.${RESET}`,
);

if (staleWarning) console.log(`\n${YELLOW}⚠${RESET} ${staleWarning}`);

/*
 * Exit 0 even with errors found. This writes a RECORD; it is not a gate — the
 * gate is `npm run a11y`, which fails the build. A generator that refused to
 * write the evidence whenever the evidence was bad would only ever document
 * sites that were already fine.
 */
