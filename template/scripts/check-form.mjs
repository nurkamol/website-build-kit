/**
 * Refuse a build where two form controls share a `name`.
 *
 *   npm run check:form
 *
 * Runs inside `build:staging` and `build:production`. This is a correctness
 * bug, not a note, so it fails in both — a duplicate `name` is never something
 * anyone meant.
 *
 * ── THE FAILURE THIS EXISTS FOR ────────────────────────────────────────────
 * ⚠ THE HONEYPOT IS CALLED `company`, AND THAT IS THE FIELD A B2B SITE ADDS.
 *
 * `ContactForm.astro` hides a trap field named `company`, and `api/contact.ts`
 * discards any submission that fills it in — **silently and with a 200**, so a
 * bot learns nothing:
 *
 *   if (input.company) return seeOther(FORM_PAGE)   // or { ok: true }
 *
 * Add a real "Company" field to that form, as any business site eventually
 * does, and every enquiry from a company that types its name is thrown away.
 * The form returns 200, the thank-you page renders, nothing is stored, nothing
 * is logged. It is `check-secrets` all over again — leads vanishing while the
 * site looks like it is working — except this one arrives as an ordinary client
 * request rather than a mistake.
 *
 * It has already happened on a shipped build. The fix there was to name the
 * real field `companyName`, which is right and is what this check tells you.
 *
 * ── WHY THE SOURCE AND NOT dist/ ───────────────────────────────────────────
 * The contact route is `prerender = false`, so the form is not in the build
 * output to inspect. Reading the component catches it before a deploy rather
 * than after, which for a lead-loss bug is the difference that matters.
 *
 * ── WHY NOT JUST RENAME THE HONEYPOT ───────────────────────────────────────
 * It has to look plausible to a bot, and every plausible name — `company`,
 * `website`, `fax`, `url` — is a field some real form wants. Moving the trap
 * moves the landmine. A check is the answer that does not depend on guessing
 * which name nobody will need.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';

const SRC = 'src';
if (!existsSync(SRC)) {
  console.error('check-form: no src/ — run from the project root.');
  process.exit(1);
}

const walk = (dir) =>
  readdirSync(dir).flatMap((e) => {
    const full = join(dir, e);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

/*
 * A control is an input, select or textarea. `name` on anything else — a
 * <meta>, an <a>, a slot — is not a form field and must not be counted.
 *
 * Only QUOTED values are captured, which is also how an expression-built name
 * is skipped: Astro writes those unquoted — name={`f-${i}`} — so they never
 * match, and there is nothing to compare anyway.
 *
 * ⚠ There was a guard here testing the captured name for `{` and `$`. It could
 *   never fire, because a captured name is quoted by definition — and it would
 *   have wrongly skipped a real literal like name="f-{i}". Found by mutation:
 *   deleting it changed no test, which is what an unreachable line looks like.
 */
const CONTROL = /<(input|select|textarea)\b[^>]*?\bname=["']([^"']+)["'][^>]*>/gis;

/** The trap is marked by its wrapper class, so it can be named in the message. */
const isHoneypot = (html, index) => html.lastIndexOf('form__trap', index) > html.lastIndexOf('</div>', index);

const problems = [];

for (const file of walk(SRC).filter((f) => f.endsWith('.astro'))) {
  const html = readFileSync(file, 'utf8');
  if (!/<form\b/i.test(html) && !/form__trap/.test(html)) continue;

  const seen = new Map();
  for (const m of html.matchAll(CONTROL)) {
    const name = m[2];
    const at = seen.get(name);
    if (at === undefined) {
      seen.set(name, m.index);
      continue;
    }
    problems.push({
      file: relative(process.cwd(), file).split(sep).join('/'),
      name,
      honeypot: isHoneypot(html, at) || isHoneypot(html, m.index),
    });
  }
}

if (!problems.length) {
  console.log(`${GREEN}✓${RESET} no duplicate form field names`);
  process.exit(0);
}

console.error(`\n${RED}✗ ${problems.length} duplicate form field name(s)${RESET}\n`);
for (const p of problems) {
  console.error(`    ${p.file}  →  name="${p.name}"`);
  if (p.honeypot) {
    console.error(
      `      ${DIM}This is the HONEYPOT name. api/contact.ts discards any submission\n` +
        `      that fills it in, silently and with a 200 — so every enquiry from a\n` +
        `      company that types its name would be thrown away, with a thank-you\n` +
        `      page and nothing stored.\n\n` +
        `      Rename the REAL field — companyName, organisation — and leave the\n` +
        `      trap alone.${RESET}`,
    );
  } else {
    console.error(
      `      ${DIM}Two controls posting the same key: the second overwrites the first\n` +
        `      in formData, so one of them is silently discarded.${RESET}`,
    );
  }
}
console.error('');
process.exit(1);
