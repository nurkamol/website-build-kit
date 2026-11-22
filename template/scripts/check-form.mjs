/**
 * Refuse a build where two form controls share a `name` — in the markup, or in
 * the definitions in `src/data/forms.ts` that `LeadForm.astro` renders.
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
 * `LeadForm.astro` hides a trap field named `company`, and `api/contact.ts`
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
 * ── SINCE FORMS BECAME DATA ────────────────────────────────────────────────
 * ⚠ THE LANDMINE MOVED, AND A MARKUP-ONLY CHECK WOULD HAVE KEPT PASSING.
 * `LeadForm.astro` writes `name={f.name}` — an expression, which the markup
 * scan below skips by design — so a `company` field added to `forms.ts` (or
 * imported from a WordPress form that had one, which most B2B forms do) was
 * invisible to this check. The definitions are therefore read as data
 * (`scripts/lib/forms-source.mjs`) and refused for:
 *
 *   a duplicate field name within one form       one answer overwrites the other
 *   a reserved name — company, form, page, …     the honeypot, the component's own
 *   a `showWhen` naming a field that is not there the field can never appear, so
 *                                                it is never required and its
 *                                                answer is DROPPED by the API
 *   a `showWhen` value no option can produce     the same, more quietly
 *   a choice field with no options               every answer is refused
 *   a key that is not the form's own `id`        the API looks forms up by id
 *
 * ── CHECKBOX GROUPS SHARE A NAME, AND THAT IS NOT A DUPLICATE ──────────────
 * Every box of one group posts under one name; that is how the API receives
 * several choices. Controls sharing a name pass when they are ALL checkboxes
 * or ALL radios. A checkbox and a text input sharing one still fail.
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
import { loadForms, isUnresolved, RESERVED_NAMES, FORMS_FILE } from './lib/forms-source.mjs';

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
const TYPE = /\btype=["']([^"']+)["']/i;

for (const file of walk(SRC).filter((f) => f.endsWith('.astro'))) {
  const html = readFileSync(file, 'utf8');
  if (!/<form\b/i.test(html) && !/form__trap/.test(html)) continue;

  const seen = new Map();
  for (const m of html.matchAll(CONTROL)) {
    const name = m[2];
    const type = (TYPE.exec(m[0])?.[1] ?? m[1]).toLowerCase();
    const at = seen.get(name);
    if (at === undefined) {
      seen.set(name, { index: m.index, type });
      continue;
    }
    /* A checkbox or radio group: every choice posts under the group's name. */
    if ((type === 'checkbox' || type === 'radio') && at.type === type) continue;
    problems.push({
      file: relative(process.cwd(), file).split(sep).join('/'),
      name,
      honeypot: isHoneypot(html, at.index) || isHoneypot(html, m.index),
    });
  }
}

/* ── The definitions in src/data/forms.ts ─────────────────────────────── */

const CHOICE = new Set(['checkboxes', 'radio', 'select']);
const definitions = await loadForms();
if (definitions.error) {
  problems.push({ file: FORMS_FILE, name: '', reason: definitions.error });
} else {
  for (const { key, def } of definitions.forms) {
    const where = `${FORMS_FILE} → forms.${key}`;
    const add = (name, reason, honeypot = false) => problems.push({ file: where, name, reason, honeypot });
    if (!def || typeof def !== 'object' || !Array.isArray(def.fields)) {
      add('', 'has no `fields` list');
      continue;
    }
    if (!isUnresolved(def.id) && def.id !== key) {
      add('', `its key is "${key}" but its id is "${def.id}" — the API looks a form up by id, so one of them is unreachable`);
    }
    const byName = new Map();
    for (const field of def.fields) {
      if (!field || isUnresolved(field) || isUnresolved(field.name)) continue;
      const name = field.name;
      if (Object.hasOwn(RESERVED_NAMES, name)) {
        add(name, `is reserved — ${RESERVED_NAMES[name]}`, name === 'company');
      }
      if (byName.has(name)) add(name, 'is used by two fields of this form: the second answer overwrites the first');
      else byName.set(name, field);
      if (CHOICE.has(field.type) && !isUnresolved(field.options) && !(Array.isArray(field.options) && field.options.length)) {
        add(name, `is a ${field.type} with no options, so every answer is refused`);
      }
    }
    for (const field of def.fields) {
      const rule = field?.showWhen;
      if (!rule || isUnresolved(rule) || isUnresolved(rule.field)) continue;
      const controller = byName.get(rule.field);
      if (!controller || rule.field === field.name) {
        add(
          field.name,
          `shows when "${rule.field}" answers — and this form has no such field. The field can never appear, ` +
            'so it is never required and the API DROPS its answer',
        );
        continue;
      }
      const options = controller.options;
      if (!Array.isArray(options) || isUnresolved(options) || options.some(isUnresolved) || isUnresolved(rule.anyOf)) continue;
      const impossible = (rule.anyOf ?? []).filter((v) => !isUnresolved(v) && !options.includes(v));
      if (impossible.length) {
        add(
          field.name,
          `shows when "${rule.field}" is ${impossible.map((v) => `"${v}"`).join(' or ')}, which is not one of its options — ` +
            (impossible.length === rule.anyOf.length ? 'the field can never appear and its answer is dropped' : 'that part of the rule can never match'),
        );
      }
    }
  }
}

if (!problems.length) {
  console.log(
    `${GREEN}✓${RESET} no duplicate form field names` +
      (definitions.forms?.length ? ` ${DIM}— markup, and ${definitions.forms.length} form definition(s) in ${FORMS_FILE}${RESET}` : ''),
  );
  process.exit(0);
}

console.error(`\n${RED}✗ ${problems.length} form field problem(s)${RESET}\n`);
for (const p of problems) {
  console.error(`    ${p.file}${p.name ? `  →  name="${p.name}"` : ''}`);
  if (p.reason) console.error(`      ${p.reason}`);
  if (p.honeypot) {
    console.error(
      `      ${DIM}This is the HONEYPOT name. api/contact.ts discards any submission\n` +
        `      that fills it in, silently and with a 200 — so every enquiry from a\n` +
        `      company that types its name would be thrown away, with a thank-you\n` +
        `      page and nothing stored.\n\n` +
        `      Rename the REAL field — companyName, organisation — and leave the\n` +
        `      trap alone.${RESET}`,
    );
  } else if (!p.reason) {
    console.error(
      `      ${DIM}Two controls posting the same key: the second overwrites the first\n` +
        `      in formData, so one of them is silently discarded.${RESET}`,
    );
  }
}
console.error('');
process.exit(1);
