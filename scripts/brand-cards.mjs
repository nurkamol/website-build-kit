/**
 * Render the two share cards for the landing page.
 *
 *   npm run cards:brand
 *
 *   site/brand/og.jpg             1200×630  — og:image and twitter:image
 *   site/brand/github-social.jpg  1280×640  — GitHub's repository social preview
 *
 * ── WHY TWO, AND NOT ONE SCALED ────────────────────────────────────────────
 * They are different aspect ratios: 1.905:1 and 2:1. Scaling one to the other
 * either letterboxes the accent bar or crops it, and that bar is the only
 * element still legible at thumbnail size. So both are laid out at their own
 * size from the same source.
 *
 * ── WHY THIS IS A SCRIPT AND NOT A ONE-OFF ─────────────────────────────────
 * The headline count — "33 failures" — is checked against traps.md and
 * compliance.md §8 by `npm run audit:docs`. When a trap is added the number
 * moves, the audit fails, and both cards are then wrong in a way no gate can
 * see, because they are pixels. Regenerating has to be one command or it will
 * not happen.
 *
 * The count is read from the same files the audit reads. Nothing here restates
 * it, so the cards cannot disagree with the documentation.
 *
 * ⚠ GITHUB'S SOCIAL PREVIEW CANNOT BE SET FROM A SCRIPT. There is no REST
 *   endpoint and no `gh` flag; it is Settings → General → Social preview, by
 *   hand. This writes the file and prints the reminder.
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

/* puppeteer is a template dependency, not a kit one — the kit itself has no
   node_modules. Resolve it from there rather than adding a second copy. */
const require = createRequire(join(ROOT, 'template', 'package.json'));

/** The same definition audit:docs uses. Duplicating the NUMBER is the bug; duplicating the RULE is not. */
function failureCount() {
  const traps = readFileSync(join(ROOT, 'skills/website-build/references/traps.md'), 'utf8');
  const compliance = readFileSync(join(ROOT, 'skills/website-build/references/compliance.md'), 'utf8');
  const s8 = compliance.slice(compliance.indexOf('\n## 8.'), compliance.indexOf('\n## 9.'));
  return (traps.match(/^### /gm) ?? []).length + (s8.match(/^\*\*/gm) ?? []).length;
}

const COUNT = failureCount();

/* Palette lifted from site/index.html so the cards cannot drift from the page. */
const css = readFileSync(join(ROOT, 'site/index.html'), 'utf8');
const token = (name, fallback) => (css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})`)) ?? [, fallback])[1];

const BG = token('bg', '#fbfaf8');
const INK = token('ink', '#171614');
const ACCENT = token('accent', '#8a3324');

/**
 * One layout, two sizes. Every measurement scales from the width, so the 1200
 * and the 1280 are the same design rather than two designs that resemble each
 * other.
 */
const page = (w, h) => {
  const k = w / 1280;
  const px = (n) => `${(n * k).toFixed(1)}px`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${w}px;height:${h}px}
  body{background:${BG};color:${INK};position:relative;-webkit-font-smoothing:antialiased;
    font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Inter,sans-serif;
    display:flex;flex-direction:column;padding:${px(72)} ${px(86)} 0}
  .brand{display:flex;align-items:center;gap:${px(18)}}
  .brand svg{width:${px(52)};height:${px(52)};display:block}
  .brand span{font-size:${px(30)};font-weight:700;letter-spacing:-0.015em}
  h1{margin-top:${px(62)};font-size:${px(92)};line-height:1.06;font-weight:800;
     letter-spacing:-0.035em;max-width:${px(1010)}}
  h1 em{font-style:normal;color:${ACCENT}}
  p.sub{margin-top:${px(34)};font-size:${px(29)};line-height:1.42;color:#5f5b55;
        max-width:${px(790)};letter-spacing:-0.005em}
  footer{position:absolute;left:${px(86)};right:${px(86)};bottom:${px(62)};display:flex;
         justify-content:space-between;align-items:baseline;font-size:${px(21)};
         color:#5f5b55;letter-spacing:-0.005em}
  footer b{color:${INK};font-weight:700}
  .bar{position:absolute;left:0;right:0;bottom:0;height:${px(16)};background:${ACCENT}}
  </style></head><body>
  <div class="brand">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true">
      <g fill="none" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 13 L11 13 L11 51 L22 51" stroke="${INK}"/>
        <path d="M42 13 L53 13 L53 51 L42 51" stroke="${INK}"/>
        <path d="M22.5 33.5 L29.5 40.5 L43 25" stroke="${ACCENT}"/>
      </g>
    </svg>
    <span>website-build-kit</span>
  </div>
  <h1>Your build was green. The site was <em>wrong</em>.</h1>
  <p class="sub">${COUNT} failures that passed every check on the way out — and the method that catches them.</p>
  <footer><span><b>Astro</b> · Cloudflare Workers · Claude Code</span><span>MIT</span></footer>
  <div class="bar"></div>
  </body></html>`;
};

const TARGETS = [
  { file: 'site/brand/og.jpg', w: 1200, h: 630, note: 'og:image / twitter:image' },
  { file: 'site/brand/github-social.jpg', w: 1280, h: 640, note: 'GitHub social preview' },
];

const { default: puppeteer } = await import(require.resolve('puppeteer'));
const browser = await puppeteer.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
const tmp = mkdtempSync(join(tmpdir(), 'brand-cards-'));

try {
  for (const t of TARGETS) {
    const html = join(tmp, `${t.w}.html`);
    writeFileSync(html, page(t.w, t.h));
    const pg = await browser.newPage();
    /* Rendered at 2× and downsampled — at 1× the display type picks up visible
       stair-stepping on the diagonal of the check mark. */
    await pg.setViewport({ width: t.w, height: t.h, deviceScaleFactor: 2 });
    await pg.goto(`file://${html}`, { waitUntil: 'networkidle0' });
    const png = join(tmp, `${t.w}.png`);
    await pg.screenshot({ path: png, clip: { x: 0, y: 0, width: t.w, height: t.h } });
    await pg.close();

    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '92', '-Z', String(t.w), png, '--out', join(ROOT, t.file)], { stdio: 'ignore' });
    const kb = Math.round(readFileSync(join(ROOT, t.file)).length / 1024);
    console.log(`${GREEN}✓${RESET} ${t.file}  ${t.w}×${t.h}  ${kb} kB  ${DIM}${t.note}${RESET}`);
  }
} finally {
  await browser.close();
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`${DIM}  headline count: ${COUNT}, read from traps.md + compliance.md §8${RESET}`);
console.log(`${DIM}  GitHub's social preview has no API — upload github-social.jpg by hand:${RESET}`);
console.log(`${DIM}  Settings → General → Social preview${RESET}`);
