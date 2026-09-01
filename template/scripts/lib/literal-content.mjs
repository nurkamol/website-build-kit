/**
 * Page copy declared inline in a page, which no editor can reach.
 *
 * ── THE FAILURE THIS FINDS ─────────────────────────────────────────────────
 * A client-facing page whose content is a `const` array in the page's own
 * frontmatter. It renders correctly, it types correctly, and there is no field
 * for any of it anywhere in the CMS.
 *
 * Measured across seven delivered sites with a CMS: one page carried seven
 * pieces of equipment with patient-facing copy — 58 sentence-length strings —
 * another carried two "about us" bands with their photographs, and a third
 * carried a PRICE. Every one of those sites had a working CMS the client was
 * already using. **The failure is not a missing CMS; it is a CMS that stops
 * short of the page.**
 *
 * ⚠ THIS IS A WARNING AND MUST STAY ONE. An inline list is sometimes right — a
 *   legal notice, layout labels, a table nobody will reword. The rule is the
 *   same as for images: a decision somebody made, not an oversight nobody
 *   noticed.
 *
 * ── EXCLUDED BY SHAPE, NEVER BY NAME ───────────────────────────────────────
 * ⚠ STRUCTURED DATA IS THE ENTIRE FALSE-POSITIVE CLASS. On the seven sites it
 *   was a third of every hit, and on one site it was ALL of them — three
 *   blocks, three schemas, zero real findings. A JSON-LD graph is developer
 *   territory and belongs nowhere near a client.
 *
 * Two shapes exclude it, and neither is the variable's name:
 *
 *   1. `@type` / `@context` in the block — what makes a literal JSON-LD
 *   2. the array's DIRECT elements are not object literals — which is how
 *      `[breadcrumbSchema([…])]` gets out, since a helper call is not content
 *
 * A denylist of names tests for the spelling somebody used last time. Both of
 * these were written as name tests first, and both let a schema through.
 *
 * ── WHY A SCANNER AND NOT A REGEX ──────────────────────────────────────────
 * ⚠ THE REGEX VERSION MERGED ADJACENT BLOCKS. `const crumbs = [{ … }];` closes
 *   on its own line, so a pattern ending at `\n];` ran straight past it and
 *   swallowed the next declaration — reporting one item as sixteen, under the
 *   wrong variable name, on a real site. Bracket depth has to be counted, and
 *   counting it means knowing when you are inside a string.
 *
 * ── WHY A LIB AND NOT A SCRIPT ─────────────────────────────────────────────
 * Two callers, as with `literal-images.mjs`: `check-cms.mjs` in a project that
 * has a CMS, and `check-drift.mjs` in a delivered site that may have neither.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DECL = /(?:^|\n)[ \t]*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]*)?=\s*\[/g;

/*
 * A string long enough to be a sentence rather than a label. 25 characters was
 * chosen against real trees: at 15 it returned CSS class lists and ARIA labels,
 * and at 40 it missed "Starting at $10." — a price living in a page's source,
 * which is the most expensive thing on this list to leave unreachable.
 */
const MIN_PROSE = 25;

/** JSON-LD, by the keys that define it rather than by what it is called. */
const STRUCTURED_DATA = /['"]@(type|context|id|graph)['"]/;

/**
 * Read a bracketed region starting at `open`, returning its inner text and the
 * index just past the closing bracket. Strings and comments are skipped so a
 * `]` inside either does not close the region early.
 *
 * Template literals are scanned to their closing backtick without interpreting
 * `${…}`. A backtick inside a template expression would end it early; that has
 * not occurred in any tree this has been run against, and the cost is one
 * missed block rather than a wrong one.
 */
function readBracketed(src, open) {
  const CLOSES = { '[': ']', '{': '}', '(': ')' };
  const stack = [CLOSES[src[open]]];
  let i = open + 1;

  while (i < src.length) {
    const c = src[i];

    if (c === '/' && src[i + 1] === '/') {
      i = src.indexOf('\n', i);
      if (i === -1) return null;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end === -1) return null;
      i = end + 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      i++;
      while (i < src.length && src[i] !== c) i += src[i] === '\\' ? 2 : 1;
      i++;
      continue;
    }
    if (c === '[' || c === '{' || c === '(') {
      stack.push(CLOSES[c]);
      i++;
      continue;
    }
    if (c === ']' || c === '}' || c === ')') {
      if (c !== stack.pop()) return null; // unbalanced — not something to reason about
      if (!stack.length) return { body: src.slice(open + 1, i), end: i + 1 };
      i++;
      continue;
    }
    i++;
  }
  return null;
}

/** The array's direct elements, split on commas at depth zero. */
function directElements(body) {
  const out = [];
  let depth = 0;
  let start = 0;
  let i = 0;

  while (i < body.length) {
    const c = body[i];
    if (c === "'" || c === '"' || c === '`') {
      i++;
      while (i < body.length && body[i] !== c) i += body[i] === '\\' ? 2 : 1;
      i++;
      continue;
    }
    if (c === '[' || c === '{' || c === '(') depth++;
    else if (c === ']' || c === '}' || c === ')') depth--;
    else if (c === ',' && depth === 0) {
      out.push(body.slice(start, i));
      start = i + 1;
    }
    i++;
  }
  out.push(body.slice(start));
  return out.map((s) => s.trim()).filter(Boolean);
}

/** Every string literal in `body` at least `MIN_PROSE` characters long. */
function proseStrings(body) {
  const out = [];
  let i = 0;
  while (i < body.length) {
    const c = body[i];
    if (c === "'" || c === '"' || c === '`') {
      const start = ++i;
      while (i < body.length && body[i] !== c) i += body[i] === '\\' ? 2 : 1;
      const value = body.slice(start, i);
      /* ⚠ AN INTERPOLATED TEMPLATE IS NOT PROSE. `/problems-we-solve/#${p.id}`
         is 26 characters of URL, and it was two of the strings that put a
         search page's route table into the findings on a real site. */
      if (value.length >= MIN_PROSE && !value.includes('${')) out.push(value);
      i++;
      continue;
    }
    i++;
  }
  return out;
}

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

/**
 * Every inline content block under `root`.
 *
 * Returns `[{ file, name, items, strings, sample }]`, largest first, with paths
 * in forward slashes so a Windows run reports what a Linux one does.
 */
export function literalContent(root = 'src/pages') {
  const out = [];

  let files;
  try {
    files = walk(root).filter((f) => f.endsWith('.astro'));
  } catch {
    return out; // no pages directory is not this check's problem
  }

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const fm = /^---\n([\s\S]*?)\n---/.exec(source);
    if (!fm) continue;

    const frontmatter = fm[1];
    const rel = relative(process.cwd(), file).split(sep).join('/');

    DECL.lastIndex = 0;
    for (const match of frontmatter.matchAll(DECL)) {
      const open = match.index + match[0].length - 1;
      const region = readBracketed(frontmatter, open);
      if (!region) continue;

      const { body } = region;
      if (STRUCTURED_DATA.test(body)) continue;

      /*
       * Every direct element must be an object literal. `[helper([…])]` is a
       * call, and a call is not content however much prose it encloses — that
       * is what lets a breadcrumb schema built by a helper out.
       *
       * ⚠ REQUIRING *EVERY* ELEMENT ALSO DROPS A LIST THAT SPREADS IN SHARED
       *   ITEMS, and that is deliberate. On a real site `[…, ...navSections,
       *   …]` was a sitemap page assembled from navigation data — structure,
       *   not copy. This under-reports rather than over-reports, which is the
       *   only safe direction for a warning: one that cries wolf gets switched
       *   off, and then its silence means "not looked at" rather than "fine".
       */
      const elements = directElements(body);
      const objects = elements.filter((e) => e.startsWith('{'));
      if (!objects.length || objects.length < elements.length) continue;

      const strings = proseStrings(body);
      if (strings.length < 2) continue;

      out.push({
        file: rel,
        name: match[1],
        items: objects.length,
        strings: strings.length,
        sample: strings[0].slice(0, 60),
      });
    }
  }

  return out.sort((a, b) => b.strings - a.strings || a.file.localeCompare(b.file));
}
