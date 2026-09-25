/**
 * Refuse to ship a build where the number a visitor TAPS is not the number they READ.
 *
 *   npm run check:contact
 *
 * Runs before the build, in both environments, alongside `check-form` and
 * `check-cms` — it is a source bug, it is invisible in a built page, and it
 * costs nothing to check.
 *
 * ── THE FAILURE THIS EXISTS FOR ────────────────────────────────────────────
 * A client rings to say their number has changed. You update the number on the
 * site — the one you can SEE, `business.phone.display` — and the `tel:` link
 * keeps dialling the old one.
 *
 * Nothing catches it. The page is correct in every screenshot and every review,
 * `astro check` is clean, axe is clean, `verify` skips `tel:` because it is a
 * protocol handler and not a page. The only symptom is a call that rings
 * somewhere else, and **the person who notices is the customer**, who cannot
 * tell you because the number they dialled did not answer.
 *
 * ⚠ THE TEMPLATE ITSELF USED TO INVITE THIS. `business.phone` carried four
 *   fields for one fact — `display`, `e164`, `href` and `sms` — and `email`
 *   carried two. `href` and `sms` are now BUILT from `e164`, so three of those
 *   copies cannot disagree any more. That is the real fix; this is the check for
 *   what is left.
 *
 * ── WHAT IS LEFT, AND WHY IT CANNOT BE DERIVED ─────────────────────────────
 * `display` is locale formatting — `(415) 555-0100`, `020 7946 0018`,
 * `+49 30 901820`. `e164` is `+` and digits, country code included, because
 * schema.org and `tel:` require it. Neither can be computed from the other
 * without a full phone-number library and a region, so both have to exist, so
 * they can disagree. That is the pair this compares.
 *
 * ⚠ THE NUMBERS IN THIS FILE ARE RESERVED FICTIONAL RANGES, and they are here so
 *   the provenance sweep in CLAUDE.md can be answered without looking them up:
 *   `555-01xx` is reserved for fiction across the NANP, and `020 7946 xxxx` is
 *   Ofcom's drama range. Neither can belong to a client. That sweep greps
 *   `scripts` for anything phone-shaped and is meant to produce false positives
 *   a person reads — this note is the reading.
 *
 * ⚠ A TRUNK ZERO IS NOT A MISMATCH. A UK number displays as `020 7946 0018`
 *   and dials as `+442079460018` — the leading 0 is a domestic prefix that E.164
 *   drops. Comparing the digits naively reports every British site as broken,
 *   which is how a check earns its way into someone's ignore list.
 */

import { existsSync, readFileSync } from 'node:fs';

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

const FILE = 'src/data/business.ts';

if (!existsSync(FILE)) {
  console.error(`${RED}✗${RESET} ${FILE} not found — run this from the project root.\n`);
  process.exit(1);
}

const src = readFileSync(FILE, 'utf8');

/**
 * The body of an object literal `key: { … }`, by brace matching.
 *
 * A regex cannot do this: `phone` and `email` both hold a `display`, and a
 * pattern loose enough to find one finds the other. Matching braces is the only
 * way to say "the display INSIDE this block".
 */
function blockOf(key) {
  const open = new RegExp(`\\b${key}\\s*:\\s*\\{`).exec(src);
  if (!open) return null;
  let depth = 0;
  for (let i = open.index + open[0].length - 1; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) {
      return src.slice(open.index + open[0].length, i);
    }
  }
  return null;
}

/**
 * The string assigned to `key`, following ONE level of indirection.
 *
 * ⚠ THIS CHECK'S FIRST VERSION READ ONLY QUOTED LITERALS, and so it reported the
 *   template's own `e164` as MISSING the moment that field became
 *   `e164: PHONE_E164` — which is the fix this check was written to encourage.
 *   A checker that only understands the shape it is trying to eliminate fails on
 *   every site that took its advice.
 */
function field(body, key) {
  const m = new RegExp(`\\b${key}\\s*:\\s*(?:['"\`]([^'"\`$]*)['"\`]|([A-Za-z_$][\\w$]*))`).exec(body ?? '');
  if (!m) return null;
  if (m[1] !== undefined) return m[1];
  const c = new RegExp(`\\bconst\\s+${m[2]}\\s*=\\s*['"\`]([^'"\`]*)['"\`]`).exec(src);
  return c ? c[1] : null;
}

const digits = (s) => (s ?? '').replace(/\D/g, '');

/**
 * Does `e164` dial the number `display` shows?
 *
 * `endsWith` rather than equality, because E.164 carries a country code that a
 * local display format does not. The second form drops a domestic trunk zero.
 */
function dials(e164, display) {
  const dialled = digits(e164);
  const shown = digits(display);
  return dialled.endsWith(shown) || dialled.endsWith(shown.replace(/^0/, ''));
}

const problems = [];
const notes = [];

console.log(`${BOLD}── Contact details ${'─'.repeat(41)}${RESET}`);

/* ── 1. the pair that cannot be derived ──────────────────────────────────── */

const phone = blockOf('phone');
if (!phone) {
  /* Not a failure: a product or SaaS site legitimately has no phone number.
     Said out loud rather than skipped in silence, because a renamed field and a
     deliberate omission look identical from here. */
  notes.push(`no \`phone\` block in ${FILE} — nothing to compare`);
} else {
  const display = field(phone, 'display');
  const e164 = field(phone, 'e164');

  if (!display || !e164) {
    problems.push(
      `\`phone\` is missing ${!display ? '`display`' : '`e164`'}.\n` +
        '      Both are required: the visible number and the one every `tel:` link is built from.',
    );
  } else if (digits(display).length < 6) {
    notes.push(`\`phone.display\` carries no number to compare (${JSON.stringify(display)})`);
  } else if (!dials(e164, display)) {
    problems.push(
      `\`phone.display\` and \`phone.e164\` are different numbers.\n` +
        `      reads:  ${display}   ${DIM}(${digits(display)})${RESET}\n` +
        `      dials:  ${e164}   ${DIM}(${digits(e164)})${RESET}\n` +
        '      Every `tel:` and `sms:` link on the site is built from `e164`, so the\n' +
        '      site shows one number and dials another. Fix whichever is stale.',
    );
  } else {
    console.log(`  ${GREEN}✓${RESET} ${display} dials ${e164}`);
  }
}

/* ── 2. a second copy, typed by hand ─────────────────────────────────────── */

/*
 * ⚠ A LITERAL, NOT A TEMPLATE. `tel:${PHONE_E164}` is the correct form and
 *   carries no digits to check, so it cannot appear here. Anything that DOES
 *   carry digits was typed out, which is the shape that drifts — and it is what
 *   this file looked like before the links were derived.
 */
for (const m of src.matchAll(/['"`](tel:|sms:)([+0-9()\s.-]{6,})['"`]/g)) {
  const typed = `${m[1]}${m[2].trim()}`;
  /*
   * ⚠ NO BRANCH ON WHETHER IT IS CORRECT, and an earlier draft had one. It
   *   reported a hand-typed link that MATCHED differently from one that did not
   *   — which meant a site with a second, legitimate number was told off for
   *   having it. The finding is the hand-typing, whatever the digits say: one
   *   number, one constant, links built from it. That advice is the same for a
   *   site with one number and a site with five.
   */
  problems.push(
    `\`${typed}\` is a dial link typed out by hand.\n` +
      '      Give the number a constant and build the link from it, the way `phone.href`\n' +
      '      is built — a typed copy is the one nobody updates. If the site has a second\n' +
      '      number, it gets its own constant and its own `display`.',
  );
}

/* ── 3. a mailto nobody can read ─────────────────────────────────────────── */

const shownAddresses = new Set(
  [...src.matchAll(/\bdisplay\s*:\s*['"`]([^'"`]*@[^'"`]*)['"`]/g)].map((m) => m[1].toLowerCase()),
);
for (const m of src.matchAll(/['"`]mailto:([^'"`]+)['"`]/g)) {
  /* A built link — `mailto:${EMAIL}` — carries no address to compare, which is
     the point of building it. Only a typed one has something to be wrong. */
  if (m[1].includes('${')) continue;
  if (!shownAddresses.has(m[1].toLowerCase())) {
    problems.push(
      `\`mailto:${m[1]}\` is an address no \`display\` field shows.\n` +
        '      Either it is stale, or the site mails somewhere it never admits to. Build the\n' +
        '      link from the address it displays.',
    );
  }
}

/* ── report ──────────────────────────────────────────────────────────────── */

for (const n of notes) console.log(`  ${DIM}· ${n}${RESET}`);

if (problems.length) {
  console.error(`\n${RED}✗ ${problems.length} problem(s) in ${FILE}${RESET}\n`);
  for (const p of problems) console.error(`  ${RED}✗${RESET} ${p}\n`);
  console.error(
    `  ${DIM}Nothing in a built page can show you this. The number renders, the link\n` +
      `  works, and it rings somewhere else.${RESET}\n`,
  );
  process.exit(1);
}

console.log(`${GREEN}✓${RESET} what the site shows is what it dials\n`);
