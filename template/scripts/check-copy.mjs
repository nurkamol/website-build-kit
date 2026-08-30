/**
 * Refuse to ship a build whose visible copy still talks to the author.
 *
 *   node scripts/check-copy.mjs            # warn
 *   node scripts/check-copy.mjs --strict   # exit 1 on any marker
 *
 * `build:production` runs it strict; `build:staging` runs it as a warning,
 * because a note in the copy is normal WHILE building and unacceptable at
 * go-live. Same split as `tells --undecided-only`.
 *
 * ── THE FAILURE THIS EXISTS FOR ────────────────────────────────────────────
 * A real build shipped this, on a service page, as body text a parent would
 * read:
 *
 *   "⚠ CONFIRM: the old site advertised classes every Saturday at 9am. Does
 *    this continue under the concierge model? Emitting a class time nobody is
 *    running is a locked door."
 *
 * It was written inline in the content file while drafting, and every gate
 * passed over it: `astro check` clean, axe clean, `tells` clean, links fine.
 * Nothing in a build can tell a sentence meant for the client from a sentence
 * meant for the reader — except a list of the markers people actually use.
 *
 * ⚠ THE QUESTION IS USUALLY REAL. The fix is not to delete the note, it is to
 *   move it to `BUILD-STATE.md` where the other open questions live. A build
 *   record is read before go-live; a paragraph on a service page is read by a
 *   customer.
 *
 * ── WHY THIS LOOKS AT RENDERED TEXT, NOT THE FILE ──────────────────────────
 * Searching source would flag every code comment that mentions TODO, and
 * searching raw HTML would flag markers inside `<script>` and inside HTML
 * comments — which are invisible to a reader and often deliberate. The check
 * runs on the text a browser would show, plus JSON-LD, because a placeholder in
 * structured data is quoted straight back by Google.
 *
 * `check-sitemap.mjs` carries the same lesson in the opposite direction: match
 * the thing, not the word, or you train people to ignore the check.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';

const strict = process.argv.includes('--strict');

const root = ['dist/client', 'dist'].find((d) => existsSync(d));
if (!root) {
  console.error('check-copy: no dist/ — run a build first.');
  process.exit(1);
}

/*
 * ⚠ EVERY PATTERN HERE IS DELIBERATELY NARROW.
 *
 * `TODO` in caps is never ordinary prose. Lowercase "todo" is a Spanish word
 * and an English noun. `CONFIRM` needs its colon or its warning sign, because
 * "confirm your email address" is a real sentence a form says. Bare `TK` is
 * excluded entirely — two capitals appear inside acronyms and product names,
 * and a check that fires on those is a check people switch off.
 */
const MARKERS = [
  { name: 'TODO', re: /\bTODO\b/ },
  { name: 'FIXME', re: /\bFIXME\b/ },
  { name: 'XXX', re: /\bXXX\b/ },
  { name: 'TKTK', re: /\bTKTK\b/ },
  { name: 'CONFIRM:', re: /(?:⚠\s*)?\bCONFIRM\s*:/ },
  { name: 'placeholder text', re: /\bLorem ipsum\b/i },
  { name: 'unresolved template', re: /\{\{\s*[\w.]+\s*\}\}/ },
];

const walk = (dir) =>
  readdirSync(dir).flatMap((e) => {
    const full = join(dir, e);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

/** What a reader actually sees, plus structured data. Never script or comments. */
function visibleText(html) {
  const jsonLd = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => m[1])
    .join('\n');

  const body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');

  return `${body}\n${jsonLd}`;
}

const hits = [];

for (const file of walk(root).filter((f) => f.endsWith('.html'))) {
  const text = visibleText(readFileSync(file, 'utf8'));
  for (const { name, re } of MARKERS) {
    if (!re.test(text)) continue;
    /* Show the sentence, so the reader can judge it without opening the file. */
    const at = text.search(re);
    const context = text
      .slice(Math.max(0, at - 60), at + 120)
      .replace(/\s+/g, ' ')
      .trim();
    hits.push({
      route: '/' + relative(root, file).split(sep).join('/').replace(/index\.html$/, ''),
      name,
      context,
    });
  }
}

if (!hits.length) {
  console.log(`${GREEN}✓${RESET} no author notes in the rendered copy`);
  process.exit(0);
}

const label = strict ? `${RED}✗${RESET}` : `${YELLOW}!${RESET}`;
console[strict ? 'error' : 'log'](
  `\n${label} ${hits.length} author marker(s) in text a reader would see\n`,
);
for (const h of hits) {
  console[strict ? 'error' : 'log'](`    ${h.route}  ${DIM}[${h.name}]${RESET}\n      …${h.context}…`);
}

console[strict ? 'error' : 'log'](
  `\n  ${DIM}The question is usually real. Move it to BUILD-STATE.md, where the other\n` +
    `  open questions live and someone reads it before go-live — do not just delete it.${RESET}\n`,
);

process.exit(strict ? 1 : 0);
