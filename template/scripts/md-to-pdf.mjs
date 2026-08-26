/**
 * Render a markdown document to a PDF in the project's own type and palette.
 *
 *   node scripts/md-to-pdf.mjs docs/client-note.md
 *   node scripts/md-to-pdf.mjs docs/client-note.md out/note.pdf
 *
 * For client-facing documents — proposals, estimates, handover notes. Point it
 * at the site's own typefaces (see PROJECT CONFIG below) and a PDF you send
 * looks like the site you built, rather than a text file someone printed. It
 * runs on a fresh template too, in the system stack.
 *
 * ── WHY A HAND-ROLLED CONVERTER ────────────────────────────────────────────
 * There is no pandoc, python-markdown or weasyprint on this machine, and
 * adding a markdown library to a static marketing site's dependencies to
 * format the occasional proposal is a poor trade. This handles the subset our
 * docs actually use: headings, tables, lists, bold, italic, links, code, rules
 * and paragraphs. It is not a spec-compliant parser and does not pretend to be
 * — if a document stops rendering correctly, the document is using something
 * this does not support, and the fix is either to add it here or to simplify
 * the document.
 *
 * Chrome comes from puppeteer, which arrives as part of pa11y-ci — already a
 * devDependency for the accessibility suite, so this adds nothing. The Chrome
 * binary itself lives in a shared ~/.cache/puppeteer, not in node_modules.
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, basename, resolve } from 'node:path';

import puppeteer from 'puppeteer';

const [, , input, outputArg] = process.argv;
if (!input) {
  console.error('usage: node scripts/md-to-pdf.mjs <file.md> [out.pdf]');
  process.exit(1);
}
const output = outputArg ?? input.replace(/\.md$/, '.pdf');

/* ── Markdown → HTML ───────────────────────────────────────────────────── */

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Inline formatting. Order matters: code first, so its contents are literal. */
function inline(text) {
  const codes = [];
  let s = text.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = esc(s);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[Number(i)])}</code>`);
  return s;
}

const splitRow = (line) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());

function toHtml(md) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;
  let list = null;

  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*$/.test(line)) {
      closeList();
      i++;
      continue;
    }

    if (/^---+\s*$/.test(line)) {
      closeList();
      out.push('<hr>');
      i++;
      continue;
    }

    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      closeList();
      out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
      i++;
      continue;
    }

    // Table: a header row followed by a |---|---| separator.
    if (line.includes('|') && /^\s*\|?[\s:-]*-[\s:|-]*\|/.test(lines[i + 1] ?? '')) {
      closeList();
      const head = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      out.push('<table><thead><tr>');
      head.forEach((c) => out.push(`<th>${inline(c)}</th>`));
      out.push('</tr></thead><tbody>');
      rows.forEach((r) => {
        out.push('<tr>');
        r.forEach((c) => out.push(`<td>${inline(c)}</td>`));
        out.push('</tr>');
      });
      out.push('</tbody></table>');
      continue;
    }

    const li = /^\s*([-*]|\d+\.)\s+(.*)$/.exec(line);
    if (li) {
      const want = /^\d/.test(li[1]) ? 'ol' : 'ul';
      if (list !== want) {
        closeList();
        out.push(`<${want}>`);
        list = want;
      }
      // Continuation lines are indented under the marker.
      let body = li[2];
      while (/^\s{2,}\S/.test(lines[i + 1] ?? '') && !/^\s*([-*]|\d+\.)\s/.test(lines[i + 1])) {
        body += ' ' + lines[++i].trim();
      }
      out.push(`<li>${inline(body)}</li>`);
      i++;
      continue;
    }

    /* Consecutive `>` lines are ONE blockquote. Emitting one per line gives
       each its own border and margin, so a five-line note renders as five
       stacked quotes with gaps through it — which is what a long callout in a
       handover document looks like if you do not do this. A blank `>` line
       starts a new paragraph inside the same quote. */
    if (/^>\s?/.test(line)) {
      closeList();
      const quoted = [];
      while (i < lines.length && /^>/.test(lines[i])) {
        quoted.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      const paras = quoted
        .join('\n')
        .split(/\n\s*\n/)
        .map((p) => p.trim().replace(/\n/g, ' '))
        .filter(Boolean);
      out.push(`<blockquote>${paras.map((p) => `<p>${inline(p)}</p>`).join('')}</blockquote>`);
      continue;
    }

    // Paragraph: gather until a blank line or a block-level marker.
    closeList();
    let para = line;
    while (
      i + 1 < lines.length &&
      lines[i + 1].trim() &&
      !/^(#{1,6}\s|---+\s*$|>\s?|\s*([-*]|\d+\.)\s)/.test(lines[i + 1]) &&
      !lines[i + 1].includes('|')
    ) {
      para += ' ' + lines[++i].trim();
    }
    out.push(`<p>${inline(para)}</p>`);
    i++;
  }
  closeList();
  return out.join('\n');
}

/* ── Page ──────────────────────────────────────────────────────────────── */

const md = readFileSync(input, 'utf8');
const title = (/^#\s+(.*)$/m.exec(md)?.[1] ?? basename(input, '.md')).trim();

/*
 * ⚠ PROJECT CONFIG — the type and the palette.
 *
 * Defaults are the system stack and a neutral ink ramp, so this runs on a fresh
 * template and produces a plain, readable document. Point BODY_FONT and
 * DISPLAY_FONT at the project's own woff2 in public/fonts/ and the PDF starts
 * looking like the site — which is the whole reason to send one.
 *
 * Mirror the colours from src/styles/tokens.css. Do not invent values here.
 *
 * A missing font file is not an error: the document falls back to the system
 * stack and says so, rather than refusing to render a proposal because a
 * typeface moved.
 */
const BODY_FONT = null; // e.g. 'display.woff2'
const DISPLAY_FONT = null; // e.g. 'script.woff2', for the H1 only
const PALETTE = { ink: '#14171a', muted: '#5b656e', accent: '#454e56', line: '#c7ced4' };

const fontDir = resolve('public/fonts');
const face = (family, file, weight) => {
  if (!file) return '';
  try {
    const b64 = readFileSync(resolve(fontDir, file)).toString('base64');
    return `@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${b64}) format('woff2');${weight}}`;
  } catch {
    console.warn(`md-to-pdf: ${file} not found in public/fonts — falling back to the system stack.`);
    return '';
  }
};

const bodyStack = `${BODY_FONT ? "'DocBody', " : ''}system-ui, sans-serif`;
const displayStack = `${DISPLAY_FONT ? "'DocDisplay', " : ''}${bodyStack}`;

const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  ${face('DocBody', BODY_FONT, 'font-weight:100 900;')}
  ${face('DocDisplay', DISPLAY_FONT, '')}
  @page { size: A4; margin: 18mm 16mm 20mm; }

  :root {
    --ink: ${PALETTE.ink};
    --muted: ${PALETTE.muted};
    --accent: ${PALETTE.accent};
    --line: ${PALETTE.line};
  }

  body {
    font-family: ${bodyStack};
    color: var(--ink);
    font-size: 10.5pt;
    line-height: 1.55;
    margin: 0;
  }

  h1 {
    font-family: ${displayStack};
    font-size: 30pt;
    font-weight: 400;
    line-height: 1.1;
    margin: 0 0 4mm;
  }
  h2 {
    font-size: 15pt;
    font-weight: 600;
    margin: 9mm 0 3mm;
    /* A heading stranded at the foot of a page is the classic PDF tell. */
    break-after: avoid;
  }
  h3 { font-size: 12pt; font-weight: 600; margin: 6mm 0 2mm; break-after: avoid; }

  p { margin: 0 0 3.5mm; }
  strong { font-weight: 600; }
  em { font-style: italic; color: var(--muted); }
  a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
  code {
    font-family: ui-monospace, monospace;
    font-size: 9.5pt;
    background: color-mix(in srgb, var(--line) 35%, white);
    padding: 0 2px;
    border-radius: 2px;
  }

  hr { border: 0; border-block-start: 1px solid var(--line); margin: 7mm 0; }

  ul, ol { margin: 0 0 4mm; padding-inline-start: 6mm; }
  li { margin-block-end: 1.5mm; }

  table {
    inline-size: 100%;
    border-collapse: collapse;
    margin: 0 0 5mm;
    font-size: 10pt;
    /* Keep a table whole where it fits — a two-row orphan reads as an error. */
    break-inside: avoid;
  }
  th, td {
    text-align: start;
    padding: 2mm 3mm 2mm 0;
    border-block-end: 1px solid var(--line);
    vertical-align: top;
  }
  th { font-weight: 600; border-block-end-color: var(--ink); }

  blockquote p:last-child { margin-bottom: 0; }
  blockquote {
    margin: 0 0 4mm;
    padding-inline-start: 4mm;
    border-inline-start: 2px solid var(--accent);
    color: var(--muted);
  }

  /* The closing note, set quieter than the body. */
  body > p:last-of-type em { font-size: 9pt; }
</style></head><body>
${toHtml(md)}
</body></html>`;

/*
 * Both temp files carry the PID. Two concurrent runs otherwise write and then
 * delete each other's files, and the failure reads as a corrupt document rather
 * than a collision.
 */
const tmp = `.md-pdf.${process.pid}.html`;
writeFileSync(tmp, html);

/*
 * puppeteer is a devDependency (it arrives with pa11y-ci), so a bare import
 * resolves normally.
 *
 * This used to locate Chrome by searching $HOME/.npm/_npx for whatever
 * puppeteer an `npx --yes pa11y-ci` had left behind, then write a runner script
 * INSIDE that directory so a bare import would resolve — because NODE_PATH is a
 * CommonJS mechanism that ESM ignores. It worked, took the first of however
 * many cached copies existed, and broke whenever the cache was cleared.
 * Declaring the dependency deleted all of it.
 */
mkdirSync(dirname(resolve(output)), { recursive: true });

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.goto(`file://${resolve(tmp)}`, { waitUntil: 'networkidle0' });
  await page.pdf({ path: resolve(output), format: 'A4', printBackground: true });
} finally {
  await browser.close();
  rmSync(tmp, { force: true });
}

console.log(`${output}`);
