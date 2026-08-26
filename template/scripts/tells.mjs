#!/usr/bin/env node
/**
 * The tells of a templated site, checked mechanically.
 *
 * Two sections, and they answer different questions.
 *
 *   UNDECIDED  Has anyone made a design decision at all? The template ships
 *              with placeholder tokens, no typeface and a scaffold home page.
 *              All markers present = a fresh clone, fine. None present = a
 *              real project, fine. SOME present = someone set a colour and
 *              left the typeface, which is the state this exists to catch.
 *
 *   TELLS      The checkable half of references/design.md §3. Each one is a
 *              thing you can see on a page and measure in the source. Three
 *              or more and the page is not ready to show anyone.
 *
 * Deliberately no browser and no dependency: it reads src/ and, if present,
 * dist/. That keeps it runnable in CI and on a machine that has never
 * installed Chromium. The cost is that the tells needing a rendered page —
 * photography treatment, crop, whether the thing actually looks good — are
 * listed at the end as the part you still have to do with your eyes.
 *
 *   npm run tells              everything, exits 1 on a failure
 *   npm run tells -- --undecided-only    the gate build:production uses
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const root = process.cwd();
const undecidedOnly = process.argv.includes('--undecided-only');

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';

/** Every file under `dir` whose extension is in `exts`. */
function walk(dir, exts, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, exts, out);
    else if (exts.includes(extname(path))) out.push(path);
  }
  return out;
}

const read = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : '');
const rel = (path) => path.replace(root + '/', '');

const styleFiles = walk(join(root, 'src/styles'), ['.css']);
const componentFiles = walk(join(root, 'src'), ['.astro']);
const distHtml = walk(join(root, 'dist'), ['.html']);
const distCss = walk(join(root, 'dist'), ['.css']);

const tokens = read(join(root, 'src/styles/tokens.css'));
const allCss = [...styleFiles, ...distCss].map(read).join('\n');
/** Component CSS lives inside <style> blocks in .astro files. */
const componentCss = componentFiles
  .map(read)
  .flatMap((source) => [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]))
  .join('\n');
const everyCss = allCss + '\n' + componentCss;
/**
 * Raw component source, not just its <style> blocks. Inline `style=`
 * attributes are exactly where a card grid gets written when someone is
 * filling a page in quickly, so a check that only reads <style> misses the
 * thing it exists to find.
 */
const componentSource = componentFiles.map(read).join('\n');
/** Pages and components only — a rhythm defined in global.css but never
 *  applied is not a rhythm the site uses. */
const appliedCss = componentSource + '\n' + distHtml.map(read).join('\n');

/* ── UNDECIDED ─────────────────────────────────────────────────────────── */

const markers = [
  {
    name: '--unset in tokens.css',
    present: /--unset:/.test(tokens),
    fix: 'set the brand ramp and the two faces, then delete the --unset line',
  },
  {
    name: 'no @font-face anywhere',
    present: !/@font-face/.test(everyCss.replace(/\/\*[\s\S]*?\*\//g, '')),
    fix: 'add the display and body faces to global.css and src/data/fonts.ts',
  },
  {
    name: 'scaffold home page',
    present: /const unbuilt = true/.test(read(join(root, 'src/pages/index.astro'))),
    fix: 'replace src/pages/index.astro with the real page',
  },
];

const set = markers.filter((m) => m.present);
let failed = false;

console.log(`\n${DIM}── undecided ─────────────────────────────────────────${RESET}`);
if (set.length === markers.length) {
  console.log(`${YELLOW}○${RESET} fresh template — no design decisions made yet`);
  for (const m of markers) console.log(`  ${DIM}${m.fix}${RESET}`);
} else if (set.length === 0) {
  console.log(`${GREEN}✓${RESET} brand, type and home page are all real`);
} else {
  failed = true;
  console.log(`${RED}✗${RESET} half-decided — ${set.length} of ${markers.length} placeholders left:`);
  for (const m of set) console.log(`  ${RED}·${RESET} ${m.name} — ${m.fix}`);
  console.log(
    `  ${DIM}A project with a brand colour and no typeface is the state this catches.${RESET}`,
  );
}

if (undecidedOnly) process.exit(failed ? 1 : 0);

/* ── TELLS ─────────────────────────────────────────────────────────────── */

const tells = [];
const tell = (name, hit, detail) => tells.push({ name, hit, detail });

// design.md §3 — "body text runs the full container width"
tell(
  'body text runs the full container width',
  !/var\(--measure(-narrow)?\)/.test(componentCss + allCss.replace(tokens, '')),
  '--measure is never applied. Long-form text at container width reads as a document.',
);

// "section padding is the same everywhere"
{
  const rhythms = new Set();
  if (/\bsection--tight\b|--section-y-tight\b/.test(appliedCss)) rhythms.add('tight');
  if (/\bsection--loose\b|--section-y-loose\b/.test(appliedCss)) rhythms.add('loose');
  // `section` as a standalone class token, not `section--tight`.
  if (/\bsection\b(?!--)/.test(appliedCss.replace(/<\/?section\b/g, ''))) rhythms.add('base');
  tell(
    'every section shares one padding',
    rhythms.size <= 1,
    `${rhythms.size} of 3 section rhythms applied. Varying them is what gives a page a structure the eye can navigate; identical bands do not.`,
  );
}

// "three equal cards, centred, more than twice on one page"
{
  const grids = [
    ...(everyCss + componentSource).matchAll(/repeat\(\s*auto-(fill|fit)\s*,\s*minmax/g),
  ].length;
  tell(
    'the auto-fill card grid, more than twice',
    grids > 2,
    `${grids} auto-fill/auto-fit minmax grids. The full-width band → centred heading → three equal cards loop is the templated look.`,
  );
}

// "the display and body faces are both sans-serif" — and the weaker case,
// both being literally the same stack.
{
  const display = (tokens.match(/--font-display:\s*([^;]+);/) ?? [])[1] ?? '';
  const body = (tokens.match(/--font-body:\s*([^;]+);/) ?? [])[1] ?? '';
  tell(
    'display and body are the same face',
    display.trim() === body.trim(),
    'Two families, display and body. Weights do not carry hierarchy on their own.',
  );
}

// "the hero headline is over ~72px at desktop"
{
  const top = (tokens.match(/--step-6:[^;]*?,\s*([\d.]+)rem\s*\)/) ?? [])[1];
  const px = top ? Number(top) * 16 : 0;
  tell(
    'hero headline over ~72px at desktop',
    px > 72,
    `--step-6 tops out at ${Math.round(px)}px. Past ~72 it reads as a magazine cover rather than a business people trust with money.`,
  );
}

// "headline tracking is the same as body tracking"
tell(
  'headlines are not tracked in',
  !/letter-spacing:\s*var\(--tracking-tight/.test(everyCss),
  'Display type set at body tracking is one line of CSS away from being right.',
);

// "any animation runs longer than ~400ms"
{
  const slow = [...everyCss.matchAll(/(?:transition|animation)(?:-duration)?:[^;]*?(\d{3,4})ms/g)]
    .map((m) => Number(m[1]))
    .filter((ms) => ms > 400);
  tell(
    'motion longer than 400ms',
    slow.length > 0,
    `${slow.length} declaration(s) over 400ms (longest ${Math.max(0, ...slow)}ms). A visitor made to wait for decoration is the most common way a good site starts feeling cheap.`,
  );
}

// "focus rings are the browser default, or removed"
{
  const stripped = [...everyCss.matchAll(/outline:\s*(none|0)\b/g)].length;
  const restored = /:focus-visible[^{]*\{[^}]*outline:/.test(everyCss);
  tell(
    'focus ring removed and not replaced',
    stripped > 0 && !restored,
    'outline:none with no :focus-visible replacement strands every keyboard user.',
  );
}

// Token discipline — a raw hex in a component is how a mid-project pivot
// becomes a rewrite instead of an afternoon.
{
  const offenders = componentFiles
    .map((path) => {
      const css = [...read(path).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
        .map((m) => m[1])
        .join('\n');
      const hexes = [...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].length;
      return hexes ? `${rel(path)} (${hexes})` : null;
    })
    .filter(Boolean);
  tell(
    'raw hex colours inside components',
    offenders.length > 0,
    `${offenders.join(', ')}. Tokens before components — no hard-coded hex or px in a component, ever.`,
  );
}

// "the 404, the empty state or the form's invalid state was never designed"
tell(
  'no invalid / busy form state',
  !(/\[data-invalid\]/.test(everyCss) && /\[data-busy\]|:disabled/.test(everyCss)),
  'Form states — hover, focus, invalid, disabled, submitting, succeeded — are where "considered" comes from.',
);

const hits = tells.filter((t) => t.hit);

console.log(`\n${DIM}── tells (design.md §3) ──────────────────────────────${RESET}`);
for (const t of tells) {
  if (t.hit) console.log(`${RED}✗${RESET} ${t.name}\n  ${DIM}${t.detail}${RESET}`);
  else console.log(`${GREEN}✓${RESET} ${DIM}${t.name}${RESET}`);
}

if (!distHtml.length) {
  console.log(
    `\n${DIM}dist/ not found — ran against src/ only. Build first to include the emitted CSS.${RESET}`,
  );
}

console.log(`\n${DIM}── still needs your eyes ────────────────────────────${RESET}`);
for (const line of [
  'Photography: one consistent colour treatment, and not visibly free stock',
  'Layout: something breaking the container; a 7/5 split rather than 6/6',
  'Copy density: short and confident, not a business explaining itself',
  'Then look at it on a phone, and beside the three reference sites',
]) {
  console.log(`${DIM}·${RESET} ${line}`);
}

if (hits.length >= 3) {
  failed = true;
  console.log(`\n${RED}${hits.length} tells — design.md §3 says three or more is not ready.${RESET}`);
} else if (hits.length) {
  console.log(`\n${YELLOW}${hits.length} tell(s). Under the line, but each one is cheap to fix.${RESET}`);
} else {
  console.log(`\n${GREEN}No mechanical tells.${RESET}`);
}

process.exit(failed ? 1 : 0);
