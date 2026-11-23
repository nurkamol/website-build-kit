/**
 * The Node half of `npm run design`'s blueprint: pure functions, no browser.
 * `design-probes.mjs` measures each page at 390, 820 and 1440px; this merges
 * the three widths, fits each measured size to a fluid value, and writes
 * recon/sections.json, recon/blueprint.md and recon/blueprint.proposed.css.
 *
 * ── A PROPOSAL, NEVER APPLIED ──────────────────────────────────────────────
 * Nothing reads blueprint.proposed.css. It is a measured starting point for a
 * component — the class names are placeholders — and the template still has
 * no design of its own.
 *
 * ── THE FIT ────────────────────────────────────────────────────────────────
 * clamp(min, a + b·vw, max) is the least-squares line through the three
 * measurements, bounded by the smallest and largest of them. Three points
 * that do not sit on a line mean a breakpoint, not a slope — the fit says so
 * (`nonLinear`) instead of hiding it inside a clamp.
 */

const r3 = (n) => Math.round(n * 1000) / 1000;
const px = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};
const rem = (p) => `${r3(p / 16)}rem`;

/** Fit `[[viewportWidth, valuePx], …]` to a clamp(). */
export function fitClamp(points) {
  const pts = points.filter(([w, v]) => Number.isFinite(w) && Number.isFinite(v));
  if (!pts.length) return null;
  const values = pts.map((p) => p[1]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (pts.length === 1 || max - min < 0.5) return { css: rem(max), min, max, slope: 0, intercept: max, nonLinear: false, points: pts };
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p[0], 0) / n;
  const my = pts.reduce((s, p) => s + p[1], 0) / n;
  const sxx = pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
  const slope = sxx ? pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / sxx : 0;
  const intercept = my - slope * mx;
  const residual = Math.max(...pts.map(([w, v]) => Math.abs(intercept + slope * w - v)));
  const nonLinear = residual > Math.max(4, (max - min) * 0.25);
  /* A step is not a slope: draw it from the narrowest measurement to the widest instead. */
  const [a, b] = [pts[0], pts[pts.length - 1]];
  const m = nonLinear && b[0] !== a[0] ? (b[1] - a[1]) / (b[0] - a[0]) : slope;
  const c = nonLinear && b[0] !== a[0] ? a[1] - m * a[0] : intercept;
  const sign = c < 0 ? '-' : '+';
  const css = Math.abs(m) < 1e-6 ? rem(c) : `clamp(${rem(min)}, ${r3(m * 100)}vw ${sign} ${rem(Math.abs(c))}, ${rem(max)})`;
  return { css, min, max, slope: m, intercept: c, nonLinear, points: pts };
}

/** `[0.33, 0.67]` → `1fr 2fr`. */
export function fractionsToTemplate(fractions) {
  if (!fractions?.length) return '1fr';
  const lo = Math.min(...fractions);
  return fractions.map((f) => `${Math.round((f / lo) * 4) / 4}fr`).join(' ');
}

export const slugOf = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'item';
export const pageSlug = (path) => (path === '/' ? 'home' : slugOf(path));

/**
 * One row per section, across the widths. The widest measurement is the
 * spine; a narrower width's section is paired by title, else by position.
 */
export function mergeSections(byVp) {
  const names = Object.keys(byVp).filter((v) => byVp[v]?.sections?.length);
  if (!names.length) return [];
  const spine = names.includes('desktop') ? 'desktop' : names[names.length - 1];
  const rows = byVp[spine].sections.map((s) => ({ key: s.key, title: s.title, vp: { [spine]: s } }));
  for (const v of names.filter((n) => n !== spine)) {
    const used = new Set();
    for (const row of rows) {
      const list = byVp[v].sections;
      const byTitle = row.title ? list.find((s) => s.title === row.title && !used.has(s)) : null;
      const byIndex = list[row.vp[spine].index];
      const pick = byTitle ?? (byIndex && !used.has(byIndex) && (!row.title || !byIndex.title || byIndex.title === row.title) ? byIndex : null);
      if (pick) {
        used.add(pick);
        row.vp[v] = pick;
      }
    }
  }
  return rows;
}

/** Attach reveals and parallax layers to the section whose band they sit in. */
export function motionFor(section, scroll) {
  if (!section || !scroll) return { reveals: [], parallax: [] };
  const inside = (y) => y >= section.y - 2 && y < section.y + section.height;
  return {
    reveals: (scroll.reveals ?? []).filter((r) => inside(r.y)),
    parallax: (scroll.parallax ?? []).filter((p) => inside(p.centreY ?? p.y)),
  };
}

/** The site breakpoint where a change seen between two measured widths most likely sits. */
function breakpointBetween(lo, hi, siteBreakpoints) {
  const inRange = (siteBreakpoints ?? []).filter((b) => b > lo && b <= hi);
  return inRange.length ? { width: Math.max(...inRange), why: `site CSS breaks at ${inRange.join(', ')}px` } : { width: hi, why: `changes somewhere in ${lo + 1}–${hi}px; no site breakpoint there` };
}

const typeLine = (t) => (t ? `${t.fontSize}/${t.fontWeight}${t.lineHeight && t.lineHeight !== 'normal' ? ` lh ${t.lineHeight}` : ''}${t.letterSpacing && t.letterSpacing !== 'normal' ? ` tr ${t.letterSpacing}` : ''}${t.textTransform && t.textTransform !== 'none' ? ` ${t.textTransform}` : ''} ${t.color}` : '—');
const bgLine = (b) => {
  if (!b) return '—';
  const base =
    b.kind === 'image' ? `image ${b.image}${b.size ? ` (${b.size})` : ''}${b.attachment === 'fixed' ? ' fixed' : ''}`
      : b.kind === 'gradient' ? `gradient ${String(b.gradient).slice(0, 60)}`
        : b.kind === 'video' || b.kind === 'video-embed' ? `${b.kind} ${b.image}`
          : b.kind === 'slider' ? `slider ${b.layer}`
            : b.kind === 'colour' || b.kind === 'inherited' ? `${b.kind === 'inherited' ? 'page ' : ''}${b.colour}`
              : 'none';
  const over = b.overlay ? ` + overlay ${b.overlay.colour ?? 'gradient'} @${b.overlay.opacity}` : '';
  return `${base}${b.kind === 'image' && b.colour ? ` on ${b.colour}` : ''}${over}`;
};
const layoutLine = (l) => (!l ? '—' : l.columns <= 1 ? '1 column' : `${l.columns} cols ${fractionsToTemplate(l.fractions)} gap ${l.gap}px${l.reversed ? ' ⚠ order flipped' : ''}`);
const mediaLine = (m) => (m?.length ? m.slice(0, 3).map((x) => `${x.kind} ${x.aspect}:1, ${Math.round(x.ofColumn * 100)}% of col${x.objectFit && x.objectFit !== 'fill' ? `, ${x.objectFit}` : ''}${x.radius ? `, r${x.radius}` : ''}`).join('; ') + (m.length > 3 ? ` (+${m.length - 3})` : '') : '—');
const pad = (s, vpw) => (s ? `${s.padding.top}/${s.padding.bottom} · inline ${s.padding.left || s.inset?.left || 0}px (${r3(((s.padding.left || s.inset?.left || 0) / vpw) * 100)}vw)` : '—');
const revealLine = (r) => `${r.effect} ${r.durationMs ?? '?'}ms${r.delayMs ? ` +${r.delayMs}ms` : ''} ${r.easing ?? ''} ×${r.count}${r.staggerMs ? `, stagger ${r.staggerMs}ms` : ''} (${r.library})`;

function table(L, vps, rows) {
  L(`| | ${vps.map((v) => `${v.name} ${v.width}`).join(' | ')} |`);
  L(`| --- | ${vps.map(() => '---').join(' | ')} |`);
  for (const [label, fn] of rows) {
    const cells = vps.map((v) => {
      const x = fn(v);
      return x === undefined || x === null || x === '' || x === 0 || x === false ? '—' : String(x).replace(/\|/g, '\\|').replace(/\n/g, ' ');
    });
    if (cells.every((c) => c === '—')) continue;
    L(`| ${label} | ${cells.join(' | ')} |`);
  }
  L();
}

/** recon/blueprint.md — per page: header, hero, sections, footer. */
export function blueprintMd(bp) {
  const lines = [];
  const L = (s = '') => lines.push(s);
  const vps = bp.viewports;
  L(`# Blueprint — ${bp.origin}`);
  L();
  L(`Measured ${bp.capturedAt.slice(0, 10)} by \`npm run design\` at ${vps.map((v) => `${v.width}px`).join(' / ')}. Values a builder implements directly; \`recon/blueprint.proposed.css\` has them as fluid CSS, \`recon/sections.json\` has everything.`);
  if (bp.partial) L(`\n⚠ **Partial** — ${bp.partial}`);
  L();

  if (bp.header?.length) {
    L('## Header');
    L();
    const h = (v) => bp.header.find((x) => x.viewport === v.name && x.found);
    table(L, vps, [
      ['height top → scrolled', (v) => h(v) && `${h(v).top.height} → ${h(v).scrolledDown.height}px`],
      ['position', (v) => h(v)?.top.position],
      ['behaviour', (v) => h(v) && Object.entries(h(v).behaviour).filter(([, on]) => on === true).map(([k]) => k).join(', ')],
      ['background top → scrolled', (v) => h(v) && `${h(v).top.background} → ${h(v).scrolledDown.background}`],
      ['blur / border / shadow (scrolled)', (v) => h(v) && [h(v).scrolledDown.backdrop, h(v).scrolledDown.borderBottom, h(v).scrolledDown.boxShadow !== 'none' ? h(v).scrolledDown.boxShadow : null].filter(Boolean).join(' · ')],
      ['logo top → scrolled', (v) => h(v) && `${h(v).top.logo?.src ?? h(v).top.logo?.kind ?? '—'} ${h(v).top.logo?.width ?? ''}×${h(v).top.logo?.height ?? ''} → ${h(v).scrolledDown.logo?.src ?? h(v).scrolledDown.logo?.kind ?? '—'} ${h(v).scrolledDown.logo?.width ?? ''}×${h(v).scrolledDown.logo?.height ?? ''}`],
      ['order (left → right)', (v) => h(v) && h(v).top.elements.map((e) => `${e.kind}@${e.group}`).join(' · ')],
      ['CTA', (v) => h(v)?.top.ctas?.[0] && `"${h(v).top.ctas[0].text}" ${h(v).top.ctas[0].background} r${h(v).top.ctas[0].borderRadius} ${h(v).top.ctas[0].padding}`],
      ['top bar', (v) => h(v)?.top.topBar && `${h(v).top.topBar.height}px ${h(v).top.topBar.background} "${h(v).top.topBar.text.slice(0, 50)}"`],
      ['transition', (v) => h(v)?.top.transition],
    ]);
  }

  const panels = bp.nav?.desktop?.panels ?? [];
  if (panels.length || bp.nav?.submenus?.length) {
    L('## Navigation');
    L();
    if (panels.length) {
      L('| item | trigger | type | geometry vs header | look | columns | animation | shot |');
      L('| --- | --- | --- | --- | --- | --- | --- | --- |');
      for (const p of panels) {
        const g = p.geometry;
        const anim = (p.animations ?? []).slice(0, 3).map((a) => `${a.property} ${a.durationMs}ms${a.delayMs ? ` +${a.delayMs}` : ''} ${a.easing}`).join('; ');
        L(`| ${p.item} | ${p.trigger}${p.opensOnFocus ? ' (+focus)' : ' (⚠ not on focus)'} | ${p.open ? p.type : 'did not open'} | ${g ? `${g.x},${g.y} ${g.width}×${g.height}` : '—'} | ${p.open ? `${p.background} · r ${p.radius} · pad ${p.padding}${p.shadow && p.shadow !== 'none' ? ' · shadow' : ''}` : '—'} | ${p.open ? `${p.columns}${p.columns > 1 ? ` (${p.columnWidths.join('/')}px, gap ${p.columnGap})` : ''}${p.headings?.length ? ` — ${p.headings.join(', ')}` : ''}${p.images?.length ? ` · ${p.images.length} img` : ''}` : '—'} | ${anim || '—'} | ${p.file ? `\`${p.file}\`` : '—'} |`);
      }
      L();
      for (const p of panels.filter((x) => x.nested)) L(`- ${p.item}: third level ${p.nested.direction ?? (p.nested.opens === false ? 'did not open on hover' : '?')}`);
    }
    for (const s of bp.nav?.submenus ?? []) L(`- ${s.viewport}: submenus in the open menu — **${s.behaviour}**${s.item ? ` (opened "${s.item}" via \`${s.toggle}\`)` : ''}${s.reason ? ` — ${s.reason}` : ''}${s.animations?.length ? `; ${s.animations.slice(0, 2).map((a) => `${a.property} ${a.durationMs}ms ${a.easing}`).join('; ')}` : ''}`);
    L();
  }

  for (const page of bp.pages) {
    L(`## \`${page.path}\` — ${page.family}`);
    L();
    const hero = (v) => page.hero?.[v.name];
    if (vps.some((v) => hero(v))) {
      L('### Hero');
      L();
      table(L, vps, [
        ['background', (v) => hero(v) && bgLine(hero(v).background)],
        ['height', (v) => hero(v) && `${hero(v).heightPx}px = ${hero(v).heightVh}vh${hero(v).minHeightVh ? ` (min ${hero(v).minHeightVh}vh)` : ''}${hero(v).underHeader ? ', under the header' : ''}`],
        ['content box', (v) => hero(v)?.content && `${hero(v).content.horizontal}/${hero(v).content.vertical}, ${hero(v).content.rect.width}px wide at ${hero(v).content.rect.x},${hero(v).content.rect.y}, text ${hero(v).content.textAlign}`],
        ['eyebrow', (v) => hero(v)?.eyebrow && typeLine(hero(v).eyebrow)],
        ['headline', (v) => hero(v)?.headline && typeLine(hero(v).headline)],
        ['subheading', (v) => hero(v)?.subheading && typeLine(hero(v).subheading)],
        ['buttons', (v) => hero(v)?.buttons?.length && hero(v).buttons.map((b) => `"${b.text}" ${b.background} r${b.borderRadius}`).join('; ')],
        ['scroll indicator', (v) => hero(v)?.scrollIndicator && `${hero(v).scrollIndicator.selector}${hero(v).scrollIndicator.animation ? ` (${hero(v).scrollIndicator.animation})` : ''}`],
        ['rotating text', (v) => page.rotating?.[v.name]?.length && page.rotating[v.name].map((r) => `${r.effect}: ${r.words.join(' / ')}${r.intervalMs ? ` every ${r.intervalMs}ms` : ''}`).join('; ')],
        ['parallax', (v) => hero(v) && motionFor(hero(v), page.scroll?.[v.name]).parallax.map((p) => `${p.kind} rate ${p.rate}`).join('; ')],
      ]);
    }
    for (const row of page.sections.slice(page.hero ? 1 : 0)) {
      L(`### ${row.key}${row.title ? ` "${row.title}"` : ''}`);
      L();
      const s = (v) => row.vp[v.name];
      table(L, vps, [
        ['height', (v) => s(v) && `${s(v).height}px`],
        ['padding t/b · inline', (v) => s(v) && pad(s(v), v.width)],
        ['background', (v) => s(v) && bgLine(s(v).background)],
        ['layout', (v) => s(v) && layoutLine(s(v).layout)],
        ['heading', (v) => s(v)?.heading && `${s(v).headingTag} ${typeLine(s(v).heading)}`],
        ['body', (v) => s(v)?.body && typeLine(s(v).body)],
        ['media', (v) => s(v) && mediaLine(s(v).media)],
        ['decor', (v) => s(v)?.decor?.length && s(v).decor.map((d) => `${d.kind} ${d.width}×${d.height}`).join('; ')],
        ['reveal', (v) => s(v) && motionFor(s(v), page.scroll?.[v.name]).reveals.map(revealLine).join('; ')],
        ['parallax', (v) => s(v) && motionFor(s(v), page.scroll?.[v.name]).parallax.map((p) => `${p.kind} rate ${p.rate}`).join('; ')],
      ]);
    }
    const foot = (v) => page.footer?.[v.name];
    if (page.path === bp.pages[0].path && vps.some((v) => foot(v))) {
      L('### Footer');
      L();
      table(L, vps, [
        ['height · background', (v) => foot(v) && `${foot(v).height}px · ${bgLine(foot(v).background)}`],
        ['columns', (v) => foot(v) && layoutLine(foot(v).layout)],
        ['headings', (v) => foot(v)?.headingStyle && `${foot(v).headings.join(', ')} — ${typeLine(foot(v).headingStyle)}`],
        ['links', (v) => foot(v)?.linkStyle && `${foot(v).links} — ${typeLine(foot(v).linkStyle)}`],
        ['bottom bar', (v) => foot(v)?.bottomBar && `${foot(v).bottomBar.height}px ${foot(v).bottomBar.background ?? ''} "${foot(v).bottomBar.text.slice(0, 60)}"`],
      ]);
      const f = page.footer.desktop ?? Object.values(page.footer).find(Boolean);
      const w = f?.widgets;
      if (w) {
        if (w.social?.length) L(`- Social: ${w.social.join(', ')}`);
        if (w.iframes?.length) L(`- Embeds: ${w.iframes.map((x) => `${x.kind} from ${x.host} (${x.width}×${x.height})`).join('; ')}`);
        if (w.forms?.length) L(`- Forms: ${w.forms.map((x) => `${x.fields} field(s)`).join('; ')}`);
        if (w.scripts?.length) L(`- ⚠ Third-party script(s) in the footer — a widget to rebuild or re-embed: ${w.scripts.map((x) => `\`${x}\``).join(', ')}`);
        L();
      }
    }
    if (page.thirdPartyScripts?.length) {
      L(`Third-party scripts on this page: ${page.thirdPartyScripts.slice(0, 12).map((x) => `\`${x}\``).join(', ')}`);
      L();
    }
    const libs = page.scroll?.desktop?.libraries;
    if (libs?.length) {
      L(`Scroll motion libraries seen: ${libs.join(', ')}.`);
      L();
    }
  }
  return lines.join('\n');
}

/** recon/blueprint.proposed.css — one commented block per section, fluid values. */
export function blueprintCss(bp) {
  const vps = bp.viewports;
  const out = [];
  const W = (s = '') => out.push(s);
  const fit = (fn) => fitClamp(vps.map((v) => [v.width, px(fn(v))]).filter(([, x]) => x !== null));
  const pts = (f) => (f ? f.points.map(([w, v]) => `${w}: ${Math.round(v)}px`).join(' · ') : '');
  const decl = (name, f, extra = '') => (f ? `  ${name}: ${f.css};${f.nonLinear ? ` /* ⚠ a step, not a slope (${pts(f)}): drawn end to end; a site breakpoint between the widths is where it really changes */` : f.points.length > 1 && f.max !== f.min ? ` /* ${pts(f)} */` : ''}${extra}` : null);

  W(`/* PROPOSED — not applied. Blueprint of ${bp.origin}, measured by \`npm run design\` on ${bp.capturedAt.slice(0, 10)}.`);
  W(`   Every clamp() is the straight line through the ${vps.map((v) => v.width).join(' / ')}px measurements,`);
  W('   bounded by the smallest and largest of them. Class names are placeholders: rename them to');
  W('   the component that takes the values. Nothing reads this file. */');
  W();

  const head = (v) => bp.header?.find((x) => x.viewport === v.name && x.found);
  if (bp.header?.some((h) => h.found)) {
    const d = head({ name: 'desktop' }) ?? bp.header.find((h) => h.found);
    W(`/* ── Header ── ${Object.entries(d.behaviour).filter(([, on]) => on === true).map(([k]) => k).join(', ') || 'static'} */`);
    W('.bp-header {');
    for (const line of [
      decl('--bp-h', fit((v) => head(v)?.top.height)),
      decl('--bp-h-scrolled', fit((v) => head(v)?.scrolledDown.height)),
      `  --bp-bg: ${d.top.background};`,
      `  --bp-bg-scrolled: ${d.scrolledDown.background};`,
      d.scrolledDown.boxShadow && d.scrolledDown.boxShadow !== 'none' ? `  --bp-shadow-scrolled: ${d.scrolledDown.boxShadow};` : null,
      d.scrolledDown.backdrop ? `  --bp-blur-scrolled: ${d.scrolledDown.backdrop};` : null,
      d.top.logo?.height ? decl('--bp-logo-h', fit((v) => head(v)?.top.logo?.height)) : null,
      `  position: ${['fixed', 'sticky'].includes(d.top.position) ? d.top.position : 'relative'}; inset-block-start: 0;`,
      '  block-size: var(--bp-h); background: var(--bp-bg);',
      d.top.transition ? `  transition: ${d.top.transition};` : null,
    ].filter(Boolean)) W(line);
    W('}');
    W('.bp-header.is-scrolled { block-size: var(--bp-h-scrolled); background: var(--bp-bg-scrolled);' + (d.scrolledDown.boxShadow && d.scrolledDown.boxShadow !== 'none' ? ' box-shadow: var(--bp-shadow-scrolled);' : '') + (d.scrolledDown.backdrop ? ' backdrop-filter: var(--bp-blur-scrolled);' : '') + ' }');
    W();
  }

  for (const page of bp.pages) {
    const ps = pageSlug(page.path);
    const hero = (v) => page.hero?.[v.name];
    if (vps.some(hero)) {
      const d = hero({ name: 'desktop' }) ?? vps.map(hero).find(Boolean);
      const cls = `.bp-${ps}-hero`;
      W(`/* ── ${page.path} · hero ── ${bgLine(d.background)}; content ${d.content ? `${d.content.horizontal}/${d.content.vertical}` : '?'} */`);
      W(`${cls} {`);
      for (const line of [
        d.minHeightVh ? `  --bp-min-h: ${d.minHeightVh}vh;` : `  --bp-min-h: ${d.heightVh}vh; /* measured height; the site set no min-height */`,
        decl('--bp-pad-top', fit((v) => hero(v)?.padding.top)),
        decl('--bp-pad-bottom', fit((v) => hero(v)?.padding.bottom)),
        decl('--bp-heading-size', fit((v) => hero(v)?.headline?.fontSize)),
        d.headline ? `  --bp-heading-weight: ${d.headline.fontWeight};` : null,
        d.headline && d.headline.letterSpacing !== 'normal' ? `  --bp-heading-track: ${d.headline.letterSpacing};` : null,
        decl('--bp-sub-size', fit((v) => hero(v)?.subheading?.fontSize)),
        decl('--bp-content-w', fit((v) => hero(v)?.content?.rect.width)),
        d.background.colour ? `  --bp-bg: ${d.background.colour};` : null,
        d.background.kind === 'image' ? `  --bp-bg-image: url("${d.background.image}");` : null,
        d.background.overlay?.colour ? `  --bp-overlay: ${d.background.overlay.colour};` : null,
        '  position: relative; isolation: isolate;',
        '  min-block-size: var(--bp-min-h);',
        '  padding-block: var(--bp-pad-top, 0) var(--bp-pad-bottom, 0);',
        `  background: ${d.background.kind === 'image' ? `var(--bp-bg-image) ${d.background.position ?? 'center'} / ${d.background.size ?? 'cover'} no-repeat${d.background.colour ? ', var(--bp-bg)' : ''}` : d.background.colour ? 'var(--bp-bg)' : 'none'};`,
        d.content ? `  display: grid; align-content: ${{ top: 'start', middle: 'center', bottom: 'end' }[d.content.vertical]}; justify-items: ${{ left: 'start', centre: 'center', right: 'end' }[d.content.horizontal]};` : null,
      ].filter(Boolean)) W(line);
      W('}');
      if (d.background.overlay?.colour) W(`${cls}::before { content: ""; position: absolute; inset: 0; z-index: -1; background: var(--bp-overlay); } /* from ${d.background.overlay.via} */`);
      if (d.headline) W(`${cls} h1 { font-size: var(--bp-heading-size); font-weight: var(--bp-heading-weight); line-height: ${d.headline.lineHeight}; letter-spacing: var(--bp-heading-track, normal); }`);
      if (d.content) W(`${cls} > * { max-inline-size: var(--bp-content-w); }`);
      for (const r of page.rotating?.desktop ?? []) W(`/* rotating text: ${r.effect}, "${r.words.join('", "')}"${r.intervalMs ? `, every ${r.intervalMs}ms` : ''} — honour prefers-reduced-motion */`);
      W();
    }

    for (const row of page.sections.slice(page.hero ? 1 : 0)) {
      const s = (v) => row.vp[v.name];
      const d = s({ name: 'desktop' }) ?? vps.map(s).find(Boolean);
      const cls = `.bp-${ps}-${row.key}`;
      const inline = (v) => (s(v) ? s(v).padding.left || s(v).inset?.left || 0 : null);
      W(`/* ── ${page.path} · ${row.key}${row.title ? ` "${row.title}"` : ''} ── ${vps.map((v) => (s(v) ? `${v.width}: ${s(v).height}px tall, ${layoutLine(s(v).layout)}` : `${v.width}: —`)).join(' · ')}`);
      W(`   background: ${bgLine(d.background)} */`);
      W(`${cls} {`);
      const ownPad = vps.some((v) => s(v)?.padding.top || s(v)?.padding.bottom);
      const firstCols = vps.map(s).find(Boolean)?.layout;
      for (const line of [
        decl('--bp-pad-top', fit((v) => (ownPad ? s(v)?.padding.top : s(v)?.inset?.top)), ownPad ? '' : ' /* inset to first content: the builder pads an inner wrapper */'),
        decl('--bp-pad-bottom', fit((v) => (ownPad ? s(v)?.padding.bottom : s(v)?.inset?.bottom))),
        decl('--bp-pad-inline', fit(inline), vps.some((v) => s(v) && !s(v).padding.left) ? ' /* content inset — at wide widths this includes container centring */' : ''),
        d.inset?.contentWidth ? `  --bp-content-w: ${d.inset.contentWidth}px;` : null,
        decl('--bp-gap', fit((v) => (s(v)?.layout?.columns > 1 ? s(v).layout.gap : null))),
        `  --bp-cols: ${firstCols?.columns > 1 ? fractionsToTemplate(firstCols.fractions) : '1fr'};`,
        decl('--bp-heading-size', fit((v) => s(v)?.heading?.fontSize)),
        decl('--bp-body-size', fit((v) => s(v)?.body?.fontSize)),
        d.background.colour ? `  --bp-bg: ${d.background.colour};` : null,
        d.background.kind === 'image' ? `  --bp-bg-image: url("${d.background.image}");` : null,
        d.media?.[0] ? `  --bp-media-aspect: ${d.media[0].aspect};` : null,
        '  padding: var(--bp-pad-top) var(--bp-pad-inline) var(--bp-pad-bottom);',
        d.background.kind === 'image' ? `  background: var(--bp-bg-image) center / ${d.background.size ?? 'cover'}${d.background.colour ? ', var(--bp-bg)' : ''};` : d.background.colour && d.background.kind !== 'inherited' ? '  background: var(--bp-bg);' : null,
      ].filter(Boolean)) W(line);
      W('}');
      if (vps.some((v) => s(v)?.layout?.columns > 1)) W(`${cls} .bp-row { display: grid; grid-template-columns: var(--bp-cols); gap: var(--bp-gap, 0); align-items: ${d.layout?.alignItems && d.layout.alignItems !== 'normal' ? d.layout.alignItems : 'start'}; }`);
      if (d.heading) W(`${cls} ${d.headingTag ?? 'h2'} { font-size: var(--bp-heading-size); font-weight: ${d.heading.fontWeight}; line-height: ${d.heading.lineHeight}; text-align: ${d.heading.textAlign}; }`);
      if (d.media?.[0]) W(`${cls} .bp-media { aspect-ratio: var(--bp-media-aspect); object-fit: ${d.media[0].objectFit || 'cover'}; border-radius: ${d.media[0].radius}px; }`);
      /* Where the column count or order changes between measured widths. */
      for (let i = 1; i < vps.length; i++) {
        const a = s(vps[i - 1])?.layout;
        const b = s(vps[i])?.layout;
        if (!a || !b) continue;
        const ta = a.columns > 1 ? fractionsToTemplate(a.fractions) : '1fr';
        const tb = b.columns > 1 ? fractionsToTemplate(b.fractions) : '1fr';
        if (ta === tb && !!a.reversed === !!b.reversed) continue;
        const bpw = breakpointBetween(vps[i - 1].width, vps[i].width, bp.siteBreakpoints);
        W(`@media (min-width: ${bpw.width}px) { ${cls} { --bp-cols: ${tb}; } } /* ${ta} → ${tb}; ${bpw.why} */`);
      }
      for (const r of motionFor(d, page.scroll?.desktop).reveals) W(`/* reveal: ${revealLine(r)}${r.triggerOffsetPx ? `, fires ~${r.triggerOffsetPx}px into the viewport` : ''} */`);
      for (const p of motionFor(d, page.scroll?.desktop).parallax) W(`/* parallax: ${p.selector} ${p.kind} rate ${p.rate} — translateY(scroll × ${p.rate}) */`);
      W();
    }

    const foot = (v) => page.footer?.[v.name];
    if (page === bp.pages[0] && vps.some(foot)) {
      const d = foot({ name: 'desktop' }) ?? vps.map(foot).find(Boolean);
      W(`/* ── footer ── ${layoutLine(d.layout)}; bottom bar ${d.bottomBar ? `${d.bottomBar.height}px` : 'none found'} */`);
      W('.bp-footer {');
      for (const line of [
        decl('--bp-pad-top', fit((v) => foot(v)?.padding.top)),
        decl('--bp-pad-bottom', fit((v) => foot(v)?.padding.bottom)),
        decl('--bp-gap', fit((v) => (foot(v)?.layout?.columns > 1 ? foot(v).layout.gap : null))),
        `  --bp-cols: ${d.layout?.columns > 1 ? fractionsToTemplate(d.layout.fractions) : '1fr'};`,
        d.background.colour ? `  --bp-bg: ${d.background.colour};` : null,
        `  color: ${d.color};`,
        d.background.colour ? '  background: var(--bp-bg);' : null,
        '  padding-block: var(--bp-pad-top, 0) var(--bp-pad-bottom, 0);',
      ].filter(Boolean)) W(line);
      W('}');
      W('.bp-footer .bp-row { display: grid; grid-template-columns: var(--bp-cols); gap: var(--bp-gap, 0); }');
      const mob = foot({ name: 'mobile' })?.layout;
      if (mob && d.layout && mob.columns !== d.layout.columns) W(`@media (max-width: ${breakpointBetween(390, 1440, bp.siteBreakpoints).width - 1}px) { .bp-footer { --bp-cols: ${mob.columns > 1 ? fractionsToTemplate(mob.fractions) : '1fr'}; } }`);
      if (d.headingStyle) W(`.bp-footer h2, .bp-footer h3, .bp-footer h4 { font-size: ${d.headingStyle.fontSize}; font-weight: ${d.headingStyle.fontWeight}; text-transform: ${d.headingStyle.textTransform}; letter-spacing: ${d.headingStyle.letterSpacing}; }`);
      for (const src of d.widgets?.scripts ?? []) W(`/* third-party widget script: ${src} */`);
      W();
    }
  }
  return out.join('\n');
}
