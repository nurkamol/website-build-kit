/**
 * Turn a design capture of the OLD site into token values — and write them.
 *
 * Pure functions, no browser: `design.mjs` does the measuring, this decides
 * what the measurements mean for `src/styles/tokens.css`. Kept apart so the
 * decisions can be read without wading through puppeteer.
 *
 * ── SAMPLED, NOT APPROXIMATED ──────────────────────────────────────────────
 * tokens.css asks for the ramp "sampled from the brand — not approximated by
 * eye". So the sampled colour itself sits in the ramp, unchanged, at the step
 * whose lightness it is nearest; only the steps around it are derived (OKLCH,
 * same hue, chroma eased toward the ends). A ramp regenerated around a colour
 * that is no longer in it is a ramp nobody can trace back to the old site.
 *
 * ── THE RESTRAINT RULE HOLDS BY DEFAULT ────────────────────────────────────
 * tokens.css caps the top three steps and says to raise --step-6 "knowingly
 * rather than by swapping in a bigger ratio". A measured 88px hero headline is
 * therefore capped and the measurement recorded next to it; `--uncapped` keeps
 * it, which is the knowing raise. A faithful migration of a brand whose hero IS
 * the giant headline will want the flag; a redesign will not.
 */

/* ── Colour ────────────────────────────────────────────────────────────── */

/** `rgb(…)`, `rgba(…)` or `color(srgb …)` → {r,g,b,a} in 0–255 (a in 0–1), else null. */
export function parseColor(input) {
  const s = String(input ?? '').trim();
  let m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(s);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: +m[1], g: +m[2], b: +m[3], a };
  }
  m = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)$/i.exec(s);
  if (m) return { r: +m[1] * 255, g: +m[2] * 255, b: +m[3] * 255, a: m[4] === undefined ? 1 : +m[4] };
  m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) {
    const n = parseInt(m[1], 16);
    return { r: n >> 16, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  return null;
}

const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));
export const toHex = ({ r, g, b }) =>
  '#' + [r, g, b].map((v) => clamp255(v).toString(16).padStart(2, '0')).join('');

const lin = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const unlin = (v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

export function toOklch({ r, g, b }) {
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(A, Bb), H: (Math.atan2(Bb, A) * 180) / Math.PI };
}

function oklchToRgbRaw({ L, C, H }) {
  const A = C * Math.cos((H * Math.PI) / 180);
  const B = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return {
    r: unlin(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: unlin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: unlin(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
}

/** OKLCH → sRGB, reducing chroma until it is inside the gamut rather than clipping the hue. */
export function fromOklch(lch) {
  let C = lch.C;
  for (let i = 0; i < 40; i++) {
    const c = oklchToRgbRaw({ ...lch, C });
    if ([c.r, c.g, c.b].every((v) => v >= -0.5 && v <= 255.5)) return c;
    C *= 0.92;
  }
  return oklchToRgbRaw({ ...lch, C: 0 });
}

const luminance = ({ r, g, b }) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
export function contrastRatio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Chromatic enough to be a brand colour rather than a tinted grey. */
export const isChromatic = (c) => toOklch(c).C > 0.045;

/**
 * A ramp with the sampled colour placed EXACTLY at its nearest step.
 * `targets` maps step → OKLCH lightness; `chroma` eases the sample's chroma
 * toward the light and dark ends, where full chroma falls out of gamut.
 */
export function rampAround(sample, targets, { maxChroma = Infinity } = {}) {
  const s = toOklch(sample);
  const steps = Object.keys(targets);
  const home = steps.reduce((best, k) => (Math.abs(targets[k] - s.L) < Math.abs(targets[best] - s.L) ? k : best), steps[0]);
  const out = {};
  for (const k of steps) {
    if (k === home) {
      out[k] = toHex(sample);
      continue;
    }
    const L = targets[k];
    const ease = Math.max(0.25, 1 - Math.abs(L - s.L) * 1.1);
    out[k] = toHex(fromOklch({ L, C: Math.min(s.C * ease, maxChroma), H: s.H }));
  }
  return { ramp: out, home };
}

const BRAND_L = { 50: 0.97, 100: 0.93, 300: 0.81, 400: 0.7, 500: 0.6, 600: 0.5, 700: 0.4 };
const INK_L = { 900: 0.18, 800: 0.25, 700: 0.33, 600: 0.43, 500: 0.53, 400: 0.63, 300: 0.75, 200: 0.85, 100: 0.92, 50: 0.97 };

/* ── Fonts ─────────────────────────────────────────────────────────────── */

const GENERIC = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-sans-serif', 'ui-serif',
  'ui-monospace', '-apple-system', 'blinkmacsystemfont', 'segoe ui', 'arial', 'helvetica', 'helvetica neue',
  'times', 'times new roman', 'georgia', 'verdana', 'tahoma', 'trebuchet ms', 'courier', 'courier new',
  'inherit', 'initial',
]);

/** First family in a computed `font-family` stack, unquoted. */
export const primaryFamily = (stack) => String(stack ?? '').split(',')[0].trim().replace(/^["']|["']$/g, '');
export const isSystemFamily = (family) => GENERIC.has(String(family).toLowerCase());
export const fontSlug = (family) => String(family).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** The fallback a face gets in tokens.css — serif or sans, from the stack the old site declared. */
function fallbackFor(stack) {
  const parts = String(stack).toLowerCase().split(',').map((p) => p.trim().replace(/["']/g, ''));
  const serif = parts.includes('serif') || parts.includes('georgia') || parts.includes('times');
  return serif ? 'ui-serif, Georgia, serif' : "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

const px = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};
const r2 = (n) => Math.round(n * 100) / 100;
const r3 = (n) => Math.round(n * 1000) / 1000;
export const mostCommonOf = (values) => {
  const tally = new Map();
  for (const v of values) if (v !== undefined && v !== null) tally.set(v, (tally.get(v) ?? 0) + 1);
  return [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
};

/* ── The type scale ────────────────────────────────────────────────────── */

const MOBILE_W = 390;
const DESKTOP_W = 1440;
const SCALE_MIN_W = 320;
const SCALE_MAX_W = 1440;

/** Which tag fixes which step. --step-5 has no tag; it is interpolated between --step-4 and --step-6. */
export const TAG_STEP = [
  ['small', '--step--1'],
  ['p', '--step-0'],
  ['h5', '--step-1'],
  ['h4', '--step-2'],
  ['h3', '--step-3'],
  ['h2', '--step-4'],
  ['h1', '--step-6'],
];
/** The caps tokens.css ships, in rem, on the max end. */
export const STEP_CAPS = { '--step-4': 2.7, '--step-5': 3.25, '--step-6': 3.9 };

/** clamp() through two points: `lo` px at 320 and `hi` px at 1440. */
export function fluid(lo, hi) {
  if (Math.abs(hi - lo) < 0.5) return `${r3(hi / 16)}rem`;
  const slope = (hi - lo) / (SCALE_MAX_W - SCALE_MIN_W);
  const intercept = lo - slope * SCALE_MIN_W;
  const [a, b] = [Math.min(lo, hi), Math.max(lo, hi)];
  const sign = intercept < 0 ? '-' : '+';
  return `clamp(${r3(a / 16)}rem, ${r3(slope * 100)}vw ${sign} ${r3(Math.abs(intercept) / 16)}rem, ${r3(b / 16)}rem)`;
}

/**
 * Fit the steps to measured sizes. `typo` is `{ mobile: {tag: rec}, desktop: {tag: rec} }`.
 * Returns `{ steps: {name: {lo, hi, value, why}}, warnings }`.
 */
export function fitScale(typo, { uncapped = false } = {}) {
  const warnings = [];
  const measured = [];
  for (const [tag, step] of TAG_STEP) {
    const pick = (vp) => typo[vp]?.[tag] ?? (tag === 'p' ? typo[vp]?.body : null);
    const m = px(pick('mobile')?.fontSize);
    const d = px(pick('desktop')?.fontSize);
    if (m === null && d === null) continue;
    const mob = m ?? d;
    const desk = d ?? m;
    /* The phone was measured at 390px; the scale's floor is 320px. Extend the
       line rather than pretending 390 is 320 — on a fluid site the difference
       is real, on a stepped one the slope is zero and nothing moves. */
    const slope = (desk - mob) / (DESKTOP_W - MOBILE_W);
    const lo = Math.max(10, mob - slope * (MOBILE_W - SCALE_MIN_W));
    measured.push({ tag, step, lo, hi: desk, mob, desk });
  }

  /* Page builders use heading tags as type styles, so an h3 bigger than its h2
     is ordinary. The scale must still ascend; sort and say so. */
  for (let i = 1; i < measured.length; i++) {
    if (measured[i].hi < measured[i - 1].hi) {
      warnings.push(
        `${measured[i].tag} (${measured[i].desk}px) is smaller than ${measured[i - 1].tag} (${measured[i - 1].desk}px) on desktop — ` +
          `the old site uses headings as type styles. Sizes sorted so the scale ascends; check the mapping by eye.`,
      );
    }
  }
  const los = measured.map((x) => x.lo).sort((a, b) => a - b);
  const his = measured.map((x) => x.hi).sort((a, b) => a - b);
  measured.forEach((x, i) => {
    x.lo = los[i];
    x.hi = his[i];
  });

  const steps = {};
  for (const x of measured) {
    let { lo, hi } = x;
    let why = `${x.tag}: ${r2(x.mob)}px at ${MOBILE_W}, ${r2(x.desk)}px at ${DESKTOP_W}`;
    const cap = STEP_CAPS[x.step];
    if (cap && hi > cap * 16) {
      if (uncapped) {
        warnings.push(`${x.step} keeps the measured ${r2(hi)}px, past the ${cap}rem restraint cap (--uncapped).`);
        why += ` — past the ${cap}rem cap, kept by --uncapped`;
      } else {
        warnings.push(
          `${x.tag} measures ${r2(hi)}px on desktop; ${x.step} capped at ${cap}rem by tokens.css's restraint rule. ` +
            `Re-run with --uncapped to keep the measured size (a faithful migration where the big headline IS the brand).`,
        );
        why += ` — capped at ${cap}rem (measured ${r2(hi)}px)`;
        hi = cap * 16;
        lo = Math.min(lo, hi);
      }
    }
    steps[x.step] = { lo, hi, value: fluid(lo, hi), why };
  }

  /* Steps with no tag on the old site — always --step-5, often h4/h5 — are
     filled geometrically between the measured steps either side, so the scale
     the site gets is one ascending scale rather than measured steps
     interleaved with the template's placeholders. */
  const ORDER = ['--step--1', '--step-0', '--step-1', '--step-2', '--step-3', '--step-4', '--step-5', '--step-6'];
  for (let i = 0; i < ORDER.length; i++) {
    if (steps[ORDER[i]]) continue;
    let a = i - 1;
    while (a >= 0 && (!steps[ORDER[a]] || steps[ORDER[a]].interpolated)) a--;
    let b = i + 1;
    while (b < ORDER.length && !steps[ORDER[b]]) b++;
    if (a < 0 || b >= ORDER.length) continue;
    const t = (i - a) / (b - a);
    const geo = (x, y) => x * (y / x) ** t;
    const lo = geo(steps[ORDER[a]].lo, steps[ORDER[b]].lo);
    let hi = geo(steps[ORDER[a]].hi, steps[ORDER[b]].hi);
    if (!uncapped && STEP_CAPS[ORDER[i]]) hi = Math.min(hi, STEP_CAPS[ORDER[i]] * 16);
    steps[ORDER[i]] = { lo, hi, value: fluid(Math.min(lo, hi), hi), why: `interpolated between ${ORDER[a]} and ${ORDER[b]}`, interpolated: true };
  }
  /* Below the body: no tag measured means a small-print step one template
     ratio under the body, so captions do not collapse onto body size. */
  if (!steps['--step--1'] && steps['--step-0']) {
    const { lo, hi } = steps['--step-0'];
    steps['--step--1'] = { lo: lo * 0.833, hi: hi * 0.833, value: fluid(lo * 0.833, hi * 0.833), why: 'one step under --step-0 (no small print measured)', interpolated: true };
  }
  return { steps, warnings };
}

/* Greyscale fallbacks, written as channels: a `#rrggbb` in scripts/ reads as a
   client colour to the provenance sweep. */
const WHITE = { r: 255, g: 255, b: 255 };
const FALLBACK_INK = { r: 31, g: 36, b: 41 };

/* ── The proposal ──────────────────────────────────────────────────────── */

/**
 * Decide token values from an aggregated capture. See design.mjs `aggregate()`
 * for the shape of `agg`. Returns:
 *
 *   vars      [{ name, value, why }]  — what --apply writes
 *   kept      [{ name, why }]         — tokens left at the template value, and why
 *   warnings  string[]
 *   palette   { ground, ink, brand, accent }  hex + where it came from
 *   fonts     { display, body }               family + source + suggestion
 */
export function proposeTokens(agg, { uncapped = false } = {}) {
  const vars = [];
  const kept = [];
  const warnings = [];
  const set = (name, value, why) => vars.push({ name, value, why });

  /* ── Palette ── */
  const colours = agg.colours; // [{ hex, text, background, border }]
  const score = (c) => c.text + c.background * 2 + c.border;
  const byHex = new Map(colours.map((c) => [c.hex, c]));

  const groundHex = agg.pageBackground ?? colours.filter((c) => c.background).sort((a, b) => b.background - a.background)[0]?.hex ?? toHex(WHITE);
  const ground = parseColor(groundHex);
  const inkHex =
    agg.bodyColour ?? colours.filter((c) => c.text).sort((a, b) => b.text - a.text)[0]?.hex ?? toHex(FALLBACK_INK);
  const ink = parseColor(inkHex);

  const chromatic = colours.filter((c) => isChromatic(parseColor(c.hex)));
  const buttonFills = agg.buttonFills.filter((h) => isChromatic(parseColor(h)));
  const accentHex = mostCommonOf(buttonFills) ?? (agg.linkColour && isChromatic(parseColor(agg.linkColour)) ? agg.linkColour : null) ?? chromatic.sort((a, b) => score(b) - score(a))[0]?.hex ?? null;
  const brandHex = chromatic.sort((a, b) => score(b) - score(a))[0]?.hex ?? accentHex;

  const palette = {
    ground: { hex: toHex(ground), why: agg.pageBackground ? 'the background the content sits on' : 'the most used background' },
    ink: { hex: toHex(ink), why: agg.bodyColour ? 'paragraph text' : 'the most used text colour' },
    brand: brandHex ? { hex: brandHex, why: `the most used chromatic colour (${describeUse(byHex.get(brandHex))})` } : null,
    accent: accentHex ? { hex: accentHex, why: buttonFills.length ? 'the fill of the call-to-action buttons' : 'link colour' } : null,
  };

  if (brandHex) {
    const { ramp, home } = rampAround(parseColor(brandHex), BRAND_L);
    for (const [k, v] of Object.entries(ramp)) {
      set(`--brand-${k}`, v, k === home ? `sampled — ${palette.brand.why}` : `derived from ${brandHex} (OKLCH, same hue)`);
    }
  } else {
    /* A monochrome site's brand IS its ink. Truthful, and said out loud. */
    const { ramp, home } = rampAround(ink, BRAND_L, { maxChroma: 0.03 });
    for (const [k, v] of Object.entries(ramp)) set(`--brand-${k}`, v, k === home ? 'sampled — ink; no chromatic colour found' : 'derived from the ink');
    warnings.push('No chromatic colour found on the old site — the brand ramp is built from the ink. If the brand has a colour, it lives in images; decide it by hand.');
  }

  if (accentHex) {
    const a = parseColor(accentHex);
    const lch = toOklch(a);
    set('--accent-500', toHex(a), `sampled — ${palette.accent.why}`);
    set('--accent-600', toHex(fromOklch({ ...lch, L: Math.max(0, lch.L - 0.08) })), `derived — ${accentHex} darkened for hover`);
    const onWhite = contrastRatio(a, WHITE);
    if (onWhite < 4.5) warnings.push(`White text on the accent ${accentHex} is ${r2(onWhite)}:1 — under 4.5:1. Check the button text colour before reusing it.`);
  } else {
    kept.push({ name: '--accent-500', why: 'no chromatic button fill or link colour found' });
  }

  const inkRamp = rampAround(ink, INK_L, { maxChroma: 0.025 });
  for (const [k, v] of Object.entries(inkRamp.ramp)) {
    set(`--ink-${k}`, v, k === inkRamp.home ? 'sampled — paragraph text' : `derived from ${toHex(ink)} (tinted neutral)`);
  }
  if (inkRamp.home !== '800') {
    set('--text', `var(--ink-${inkRamp.home})`, `paragraph text sampled at the ${inkRamp.home} step`);
  }
  const nearWhite = ground && Math.min(ground.r, ground.g, ground.b) >= 250;
  if (!nearWhite) set('--bg', toHex(ground), `sampled — ${palette.ground.why}`);
  if (toOklch(ground).L < 0.35) {
    warnings.push(`The page ground ${toHex(ground)} is dark. The semantic layer assumes light-on-white; invert --text/--border by hand and check every pair for 4.5:1.`);
  }
  const inkOnGround = contrastRatio(ink, ground);
  if (inkOnGround < 4.5) warnings.push(`Body text ${toHex(ink)} on ${toHex(ground)} is ${r2(inkOnGround)}:1 — the old site fails AA here. Do not carry it over.`);
  const deep = parseColor(inkRamp.ramp['900']);
  set('--shadow-rgb', `${clamp255(deep.r)} ${clamp255(deep.g)} ${clamp255(deep.b)}`, 'tinted with the ink');

  /* ── Faces ── */
  const fonts = {};
  for (const [role, stack, token] of [
    ['display', agg.displayStack, '--font-display'],
    ['body', agg.bodyStack, '--font-body'],
  ]) {
    const family = primaryFamily(stack);
    if (!family) {
      kept.push({ name: token, why: `no ${role} text measured` });
      continue;
    }
    const source = agg.fontSources?.[family.toLowerCase()] ?? { kind: 'unknown' };
    fonts[role] = { family, stack, source, slug: fontSlug(family), weights: agg.fontWeights?.[family.toLowerCase()] ?? [] };
    if (isSystemFamily(family)) {
      kept.push({ name: token, why: `${role} text is set in ${family}, a system face — the template's system stack already covers it` });
      continue;
    }
    set(token, `'${family}', ${fallbackFor(stack)}`, `${role} text — ${source.kind}${source.where ? ` (${source.where})` : ''}`);
  }
  if (fonts.display && fonts.body && fonts.display.family === fonts.body.family) {
    warnings.push(`Display and body are the same family (${fonts.body.family}). Faithful, and one file to self-host — but on a redesign it is the first lever to pull.`);
  }

  /* ── Type scale and leading ── */
  const scale = fitScale(agg.typography, { uncapped });
  for (const [name, s] of Object.entries(scale.steps)) set(name, s.value, s.why);
  warnings.push(...scale.warnings);
  for (const step of ['--step--1', '--step-0', '--step-1', '--step-2', '--step-3', '--step-4', '--step-5', '--step-6']) {
    if (!scale.steps[step]) kept.push({ name: step, why: 'nothing measured at or around that level' });
  }

  const ratio = (rec) => {
    const lh = px(rec?.lineHeight);
    const fs = px(rec?.fontSize);
    return lh && fs ? lh / fs : null;
  };
  const bodyLead = ratio(agg.typography.desktop?.p ?? agg.typography.desktop?.body);
  if (bodyLead && bodyLead >= 1.2 && bodyLead <= 2.2) set('--leading-normal', String(r2(bodyLead)), 'paragraph line-height, desktop');
  const headLead = ratio(agg.typography.desktop?.h1);
  if (headLead && headLead >= 0.85 && headLead <= 1.5) set('--leading-tight', String(r2(headLead)), 'h1 line-height, desktop');

  /* ── Layout ── */
  if (agg.containerWidth && agg.containerWidth >= 600 && agg.containerWidth <= 1900) {
    set('--width-max', `${agg.containerWidth}px`, agg.containerWhy);
  } else {
    kept.push({ name: '--width-max', why: 'no centred content container measured' });
  }
  if (agg.gutter?.mobile && agg.gutter.mobile >= 8 && agg.gutter.mobile <= 64) {
    const lo = agg.gutter.mobile;
    const hi = Math.max(lo, Math.min(agg.gutter.tablet ?? lo, 64));
    set('--gutter', lo === hi ? `${r3(lo / 16)}rem` : `clamp(${r3(lo / 16)}rem, 4vw, ${r3(hi / 16)}rem)`, `text edge: ${lo}px on a phone${agg.gutter.tablet ? `, ${agg.gutter.tablet}px on a tablet` : ''}`);
  } else {
    kept.push({ name: '--gutter', why: 'no consistent text edge on a phone' });
  }

  if (agg.radius !== null && agg.radius !== undefined) {
    const unit = r2(agg.radius.value / agg.radius.reference);
    set('--radius-unit', String(unit), `${agg.radius.why}: ${agg.radius.value}px against the template's ${agg.radius.reference}px`);
  } else {
    kept.push({ name: '--radius-unit', why: 'no photo or button corner measured' });
  }

  if (agg.headerHeight) {
    const rem = Math.ceil((agg.headerHeight / 16) * 4) / 4;
    set('--header-h', `${rem}rem`, `tallest header measured: ${agg.headerHeight}px (${agg.headerWhere})`);
  } else {
    kept.push({ name: '--header-h', why: 'no header found' });
  }

  return { vars, kept, warnings, palette, fonts };
}

function describeUse(c) {
  if (!c) return '';
  return ['text', 'background', 'border'].filter((k) => c[k]).map((k) => `${k} ×${c[k]}`).join(', ');
}

/* ── Writing tokens.css ────────────────────────────────────────────────── */

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Does this tokens.css still carry the Undecided marker? */
export const isUndecided = (css) => /^\s*--unset:/m.test(css);

/**
 * Write `vars` into a tokens.css source, value by value, keeping every comment
 * and the file's shape. Only the FIRST declaration of each name is touched —
 * that is the `:root` one; `.on-dark` redefines `--bg` and `--text` below it
 * and must keep inverting.
 *
 * With `decide`, the `══ Undecided` comment and the `--unset` line are replaced
 * by a note saying where the values came from.
 */
export function writeTokens(css, vars, { decide = false, note = '' } = {}) {
  let out = css;
  const applied = [];
  const missing = [];
  for (const { name, value, why } of vars) {
    const re = new RegExp(`^([ \\t]*)${escapeRe(name)}:[^;\\n]*;[^\\n]*$`, 'm');
    if (!re.test(out)) {
      missing.push(name);
      continue;
    }
    const comment = why ? ` /* ${why.replace(/\*\//g, '* /')} */` : '';
    out = out.replace(re, (_m, indent) => `${indent}${name}: ${value};${comment}`);
    applied.push(name);
  }
  if (decide) {
    /* \r?\n, not \n: a tokens.css checked out on Windows (or saved by an editor set to CRLF) never
       matched, so --apply removed the --unset line but wrote no note saying where the values came
       from. Caught by the Windows CI job. */
    const block = /([ \t]*)\/\* ══ Undecided[\s\S]*?\*\/[ \t]*\r?\n[ \t]*--unset:[^;\r\n]*;[^\r\n]*\r?\n/;
    const replacement = (indent) =>
      `${indent}/* ══ Decided ═════════════════════════════════════════════════════════════\n` +
      `${indent}   ${note}\n` +
      `${indent}   Every value written that way carries a comment saying what it was\n` +
      `${indent}   sampled from; recon/design.md has the evidence. */\n`;
    if (block.test(out)) out = out.replace(block, (_m, indent) => replacement(indent));
    else out = out.replace(/^[ \t]*--unset:[^;\n]*;[^\n]*\n/m, '');
  }
  return { css: out, applied, missing };
}

/* ── @font-face, suggested ─────────────────────────────────────────────── */

/** A snippet for global.css plus the fonts.ts lines, for the two faces. Never written anywhere by itself. */
export function fontFaceSnippet(fonts) {
  const blocks = [];
  const preload = [];
  for (const role of ['display', 'body']) {
    const f = fonts[role];
    if (!f || isSystemFamily(f.family)) continue;
    if (role === 'body' && fonts.display?.family === f.family) continue;
    const weights = [...new Set(f.weights)].map(Number).filter(Boolean).sort((a, b) => a - b);
    const range = weights.length > 1 ? `${weights[0]} ${weights[weights.length - 1]}` : String(weights[0] ?? 400);
    const file = `/fonts/${f.slug}.woff2`;
    preload.push(file);
    blocks.push(
      `/* ${role}: ${f.family} — weights used on the old site: ${weights.join(', ') || 'unknown'}.\n` +
        `   ${whereToGet(f)} */\n` +
        `@font-face {\n` +
        `  font-family: '${f.family}';\n` +
        `  src: url('${file}') format('woff2-variations');\n` +
        `  font-weight: ${range};\n` +
        `  font-style: normal;\n` +
        `  font-display: swap;\n` +
        `}`,
    );
  }
  return { css: blocks.join('\n\n'), preload };
}

/** Where a self-hostable copy of a face comes from, as honestly as the capture can say. */
export function whereToGet(f) {
  const npm = `@fontsource-variable/${f.slug} (or @fontsource/${f.slug} if it has no variable cut)`;
  switch (f.source?.kind) {
    case 'google-fonts':
      return `Served by Google Fonts on the old site. Self-host it: npm i ${npm}, copy the latin woff2 from node_modules into public/fonts/. Check it exists first: npm view @fontsource/${f.slug}.`;
    case 'self-hosted':
      return `Self-hosted by the old site (${f.source.where}). Find out what licence it was bought under before copying the file; if it is a Google font, ${npm} is the clean copy.`;
    case 'adobe-fonts':
      return `Adobe Fonts (Typekit) on the old site — licensed per domain, so it cannot be self-hosted. The client's own Adobe account must add the new domain, or choose a replacement.`;
    case 'other-cdn':
      return `Loaded from ${f.source.where}. Check the licence; if it is on Google Fonts, ${npm} is the self-hostable copy.`;
    default:
      return `Source not visible to the capture. If it is on Google Fonts: ${npm}. Otherwise ask the client for the licensed files.`;
  }
}
