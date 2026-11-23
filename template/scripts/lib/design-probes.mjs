/**
 * The in-page half of `npm run design`'s blueprint: functions that run INSIDE
 * the old site's page, serialised by puppeteer.
 *
 * ⚠ EVERY FUNCTION HERE IS SERIALISED, so none may use anything from this
 *   module's scope — not a constant, not a helper, not an import. They share
 *   code through `window.__wbk`, which HELPERS() installs once per page load.
 *   A probe that referenced a module-level name would pass `node --check` and
 *   throw a ReferenceError inside the page, where `.catch()` turns it into
 *   "nothing found" — the silent shape this kit keeps finding.
 *
 * Kept out of design.mjs so the measuring can be read apart from the
 * orchestration (pool, budget, cache, reports).
 */

/* ── Shared helpers, installed as window.__wbk ─────────────────────────── */

export function HELPERS() {
  const H = {};
  const round = (n) => Math.round(n);
  H.round = round;
  H.paint = (c) => !!c && c !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(c) && !/\/\s*0\)$/.test(c);
  H.alpha = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c || '');
    if (!m) return c === 'transparent' ? 0 : 1;
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    return parts.length >= 4 ? parseFloat(parts[3]) : 1;
  };
  H.describe = (el) => {
    if (!el || !el.tagName) return '?';
    const id = el.id ? `#${el.id}` : '';
    const cls = (typeof el.className === 'string' ? el.className : el.getAttribute('class') ?? '')
      .split(/\s+/)
      .filter((c) => c && !c.startsWith('data-wbk'))
      .slice(0, 3)
      .map((c) => `.${c}`)
      .join('');
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  };
  H.text = (el, n = 80) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
  H.ownText = (el) => Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
  H.shown = (el) => {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
  };
  /* Visible all the way up: an ancestor at opacity 0 hides a child that computes visible. */
  H.reallyShown = (el) => {
    if (!H.shown(el)) return false;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (Number(cs.opacity) <= 0.05 || cs.visibility === 'hidden' || cs.display === 'none') return false;
    }
    return true;
  };
  H.rect = (el, rel) => {
    const r = el.getBoundingClientRect();
    const o = rel ? rel.getBoundingClientRect() : { left: 0, top: 0 };
    return { x: round(r.left - o.left), y: round(r.top - o.top), width: round(r.width), height: round(r.height) };
  };
  H.docRect = (el) => {
    const r = el.getBoundingClientRect();
    return { x: round(r.left + scrollX), y: round(r.top + scrollY), width: round(r.width), height: round(r.height) };
  };
  H.type = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      text: H.text(el, 60),
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      lineHeight: cs.lineHeight,
      letterSpacing: cs.letterSpacing,
      textTransform: cs.textTransform,
      color: cs.color,
      textAlign: cs.textAlign,
      width: round(el.getBoundingClientRect().width),
    };
  };
  /* `transition` as one valid shorthand: computed style lists each part
     separately ("a, b 0.2s, 0.3s ease, ease"), which is not CSS anybody can paste. */
  H.transition = (cs) => {
    if (!cs || cs.transitionDuration.split(',').every((d) => parseFloat(d) === 0)) return null;
    const list = (v) => v.split(/,(?![^(]*\))/).map((x) => x.trim());
    const props = list(cs.transitionProperty);
    const durs = list(cs.transitionDuration);
    const delays = list(cs.transitionDelay);
    const fns = list(cs.transitionTimingFunction);
    return props
      .map((prop, i) => {
        const d = durs[i % durs.length];
        const delay = delays[i % delays.length];
        return parseFloat(d) === 0 && parseFloat(delay) === 0 ? null : `${prop} ${d} ${fns[i % fns.length]}${parseFloat(delay) ? ` ${delay}` : ''}`;
      })
      .filter(Boolean)
      .join(', ') || null;
  };
  H.button = (el) => {
    const cs = getComputedStyle(el);
    const pseudo = ['::before', '::after'].map((p) => getComputedStyle(el, p)).find((p) => p.content !== 'none' && H.paint(p.backgroundColor));
    const filled = H.paint(cs.backgroundColor) || !!pseudo;
    const bordered = parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none';
    if (!filled && !bordered) return null;
    return {
      text: (el.innerText || el.value || '').trim().slice(0, 40),
      background: H.paint(cs.backgroundColor) ? cs.backgroundColor : pseudo?.backgroundColor ?? cs.backgroundColor,
      paintedBy: H.paint(cs.backgroundColor) ? 'element' : pseudo ? 'pseudo-element' : 'border',
      color: cs.color,
      borderRadius: pseudo && cs.borderRadius === '0px' ? pseudo.borderRadius : cs.borderRadius,
      border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
      padding: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`,
      height: round(el.getBoundingClientRect().height),
      width: round(el.getBoundingClientRect().width),
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      letterSpacing: cs.letterSpacing,
      textTransform: cs.textTransform,
      boxShadow: cs.boxShadow,
      transition: H.transition(cs),
    };
  };
  H.buttonsIn = (root, n = 4) => {
    const out = [];
    const seen = new Set();
    for (const el of Array.from(root.querySelectorAll('a, button, input[type=submit]'))) {
      if (!H.shown(el)) continue;
      /* A menu toggle or a carousel arrow is a control, not a call to action. */
      if (el.matches('[aria-expanded], [aria-controls]') || /toggle|burger|prev|next|arrow|close/i.test(`${el.getAttribute('class') ?? ''} ${el.getAttribute('aria-label') ?? ''}`)) continue;
      const b = H.button(el);
      if (!b) continue;
      const sig = `${b.background}|${b.color}|${b.borderRadius}|${b.border}|${b.text}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      out.push(b);
      if (out.length >= n) break;
    }
    return out;
  };
  H.urlOf = (bg) => /url\(["']?([^"')]+)/.exec(bg || '')?.[1] ?? null;
  H.short = (u) => {
    if (!u) return u;
    try {
      const x = new URL(u, location.href);
      return (x.origin === location.origin ? x.pathname : `${x.host}${x.pathname}`).slice(0, 160);
    } catch {
      return String(u).slice(0, 160);
    }
  };
  H.covers = (el, root, share = 0.85) => {
    const a = el.getBoundingClientRect();
    const b = root.getBoundingClientRect();
    if (!b.width || !b.height) return false;
    const w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return (w * h) / (b.width * b.height) >= share;
  };
  H.CAROUSEL = '.swiper, .swiper-container, .slick-slider, .splide, .flickity-enabled, .owl-carousel, .glide, rs-module, .rev_slider, .n2-section-smartslider, .elementor-slides, .et_pb_slider, .brxe-slider, .nectar-slider-wrap, .nectar-flickity, .carousel';

  /**
   * What paints behind a block: video, slider, photograph, gradient or colour —
   * on the block itself or on a layer covering it (Salient .row-bg, Elementor
   * background overlay, a cover block's <img>) — and the overlay above it,
   * from ::before/::after or an empty covering element.
   */
  H.background = (root) => {
    const out = { kind: 'none', colour: null, image: null, gradient: null, size: null, position: null, attachment: null, layer: null, overlay: null };
    const cs = getComputedStyle(root);
    const video = Array.from(root.querySelectorAll('video')).find((v) => H.covers(v, root, 0.5));
    const embed = Array.from(root.querySelectorAll('iframe')).find((f) => H.covers(f, root, 0.5) && /youtube|vimeo|wistia/i.test(f.src));
    const slider = Array.from(root.querySelectorAll(H.CAROUSEL)).find((s) => H.covers(s, root, 0.6));
    const layers = [root, ...Array.from(root.querySelectorAll('*')).slice(0, 400).filter((el) => {
      const s = getComputedStyle(el);
      return (s.position === 'absolute' || s.position === 'fixed' || el.tagName === 'IMG' || el.tagName === 'PICTURE') && H.covers(el, root, 0.8) && !H.text(el);
    })];
    let imageLayer = null;
    let gradient = null;
    let colour = null;
    for (const el of layers) {
      const s = getComputedStyle(el);
      if (!imageLayer && el.tagName === 'IMG' && el.offsetWidth) imageLayer = { el, src: el.currentSrc || el.src, size: s.objectFit, position: s.objectPosition };
      const url = H.urlOf(s.backgroundImage);
      if (!imageLayer && url) imageLayer = { el, src: url, size: s.backgroundSize, position: s.backgroundPosition, attachment: s.backgroundAttachment };
      if (!gradient && /gradient\(/.test(s.backgroundImage)) gradient = { el, value: s.backgroundImage.slice(0, 300) };
      if (!colour && H.paint(s.backgroundColor) && el === root) colour = s.backgroundColor;
    }
    if (!colour) {
      const painted = layers.find((el) => H.paint(getComputedStyle(el).backgroundColor) && el !== imageLayer?.el);
      if (painted && painted !== root && !getComputedStyle(painted).backgroundImage.includes('url(')) {
        /* A covering colour layer above a photo is an overlay, not the ground. */
        if (!imageLayer) colour = getComputedStyle(painted).backgroundColor;
      }
    }
    out.colour = colour;
    if (video) Object.assign(out, { kind: 'video', image: H.short(video.currentSrc || video.querySelector('source')?.src || ''), layer: H.describe(video) });
    else if (embed) Object.assign(out, { kind: 'video-embed', image: H.short(embed.src), layer: H.describe(embed) });
    else if (slider) Object.assign(out, { kind: 'slider', layer: H.describe(slider) });
    else if (imageLayer) Object.assign(out, { kind: 'image', image: H.short(imageLayer.src), size: imageLayer.size, position: imageLayer.position, attachment: imageLayer.attachment ?? null, layer: imageLayer.el === root ? 'self' : H.describe(imageLayer.el) });
    else if (gradient) Object.assign(out, { kind: 'gradient', layer: gradient.el === root ? 'self' : H.describe(gradient.el) });
    else if (colour) out.kind = 'colour';
    if (gradient) out.gradient = gradient.value;
    if (out.kind === 'none') {
      for (let p = root.parentElement; p; p = p.parentElement) {
        const c = getComputedStyle(p).backgroundColor;
        if (H.paint(c)) {
          out.kind = 'inherited';
          out.colour = c;
          break;
        }
      }
    }
    /* The overlay: a pseudo-element or an empty covering element, painted, over the image layer. */
    const overlayFrom = (el, via) => {
      const s = via ? getComputedStyle(el, via) : getComputedStyle(el);
      if (via && (s.content === 'none' || s.content === 'normal')) return null;
      if (via && !['absolute', 'fixed'].includes(s.position)) return null;
      const paintBg = H.paint(s.backgroundColor);
      const grad = /gradient\(/.test(s.backgroundImage);
      if (!paintBg && !grad) return null;
      const opacity = Math.round(H.alpha(s.backgroundColor) * Number(s.opacity) * 100) / 100;
      return { colour: paintBg ? s.backgroundColor : null, gradient: grad ? s.backgroundImage.slice(0, 200) : null, opacity, blend: s.mixBlendMode !== 'normal' ? s.mixBlendMode : null, via: via ? `${H.describe(el)}${via}` : H.describe(el) };
    };
    if (out.kind !== 'colour' && out.kind !== 'inherited' && out.kind !== 'none') {
      const candidates = [];
      for (const el of [root, imageLayer?.el].filter(Boolean)) for (const via of ['::before', '::after']) candidates.push(overlayFrom(el, via));
      for (const el of layers) if (el !== root && el !== imageLayer?.el && !el.querySelector('img, video')) candidates.push(overlayFrom(el, null));
      out.overlay = candidates.find(Boolean) ?? null;
    }
    if (imageLayer && Number(getComputedStyle(imageLayer.el).opacity) < 1) out.imageOpacity = Number(getComputedStyle(imageLayer.el).opacity);
    return out;
  };

  /* A stable path from `root` to `el` by child index, so the same container can be found at another width. */
  H.path = (el, root) => {
    const parts = [];
    for (let e = el; e && e !== root; e = e.parentElement) parts.unshift(Array.prototype.indexOf.call(e.parentElement?.children ?? [], e));
    return parts.join('.');
  };

  /**
   * The row of columns in a block: the descendant whose visible children sit
   * side by side over the most width. A block with none is one column.
   */
  H.layout = (root, exclude = null) => {
    const rootR = root.getBoundingClientRect();
    const kids = (el) => Array.from(el.children).filter((c) => {
      if (['SCRIPT', 'STYLE', 'LINK', 'NOSCRIPT', 'TEMPLATE', 'BR'].includes(c.tagName)) return false;
      const s = getComputedStyle(c);
      return H.shown(c) && s.position !== 'absolute' && s.position !== 'fixed';
    });
    const containers = [];
    let best = null;
    const queue = [[root, 0]];
    const SLIDING = `${H.CAROUSEL}, [class*="swiper"], [class*="slick"], [class*="carousel"], [class*="marquee"], [class*="ticker"]`;
    while (queue.length) {
      const [el, depth] = queue.shift();
      /* A carousel's slides sit side by side off-screen; they are not columns. */
      if (el !== root && (el.matches(SLIDING) || (exclude && (el === exclude || exclude.contains(el))))) continue;
      const ch = kids(el).filter((c) => c.getBoundingClientRect().left < rootR.right - 1 && c.getBoundingClientRect().right > rootR.left + 1);
      if (ch.length >= 2) {
        const rs = ch.map((c) => c.getBoundingClientRect());
        const top0 = Math.min(...rs.map((r) => r.top));
        const row = ch.map((c, i) => ({ c, r: rs[i], i })).filter((x) => Math.abs(x.r.top - top0) < 6 || (x.r.top < top0 + 40 && x.r.left > rs[0].right - 4));
        const sideBySide = row.length >= 2 && new Set(row.map((x) => Math.round(x.r.left))).size === row.length;
        const span = sideBySide ? Math.max(...row.map((x) => x.r.right)) - Math.min(...row.map((x) => x.r.left)) : 0;
        const big = rs.every((r) => r.width >= rootR.width * 0.12);
        if (big && containers.length < 8) {
          const visual = ch.map((c, i) => ({ i, r: rs[i] })).sort((a, b) => (Math.abs(a.r.top - b.r.top) < 6 ? a.r.left - b.r.left : a.r.top - b.r.top)).map((x) => x.i);
          containers.push({ path: H.path(el, root), n: ch.length, dir: sideBySide && row.length === ch.length ? 'row' : sideBySide ? 'wrap' : 'stack', order: visual });
        }
        if (sideBySide && span >= rootR.width * 0.45 && row.every((x) => x.r.width >= 40)) {
          const score = row.length * 10000 + span - depth;
          if (!best || score > best.score) best = { el, row, span, score };
        }
      }
      if (depth < 6) for (const c of ch.slice(0, 24)) queue.push([c, depth + 1]);
    }
    if (!best) return { columns: 1, containers };
    const rowEls = best.row.sort((a, b) => a.r.left - b.r.left);
    const widths = rowEls.map((x) => Math.round(x.r.width));
    const total = widths.reduce((n, w) => n + w, 0);
    const gaps = rowEls.slice(1).map((x, i) => Math.round(x.r.left - rowEls[i].r.right)).filter((g) => g >= 0);
    const cs = getComputedStyle(best.el);
    return {
      columns: rowEls.length,
      widths,
      fractions: widths.map((w) => Math.round((w / total) * 100) / 100),
      gap: gaps.length ? gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : 0,
      display: cs.display,
      gridTemplate: cs.display.includes('grid') ? cs.gridTemplateColumns : null,
      alignItems: cs.alignItems,
      justifyContent: cs.justifyContent,
      flexDirection: cs.display.includes('flex') ? cs.flexDirection : null,
      rowPath: H.path(best.el, root),
      row: H.describe(best.el),
      visualOrder: rowEls.map((x) => x.i),
      reversed: rowEls.some((x, k) => k > 0 && x.i < rowEls[k - 1].i),
      containers,
    };
  };

  H.media = (root, n = 8) => {
    const out = [];
    const rootR = root.getBoundingClientRect();
    const els = Array.from(root.querySelectorAll('img, video, iframe, picture, [style*="background-image"], .row-bg, .column-image-bg, [class*="bg-image"], [class*="image"]'));
    const seen = new Set();
    for (const el of els) {
      if (out.length >= n) break;
      if (el.tagName === 'PICTURE' || seen.has(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 80 || r.height < 80 || !H.shown(el)) continue;
      const s = getComputedStyle(el);
      const bgUrl = H.urlOf(s.backgroundImage);
      if (!['IMG', 'VIDEO', 'IFRAME'].includes(el.tagName) && !bgUrl) continue;
      if (H.covers(el, root, 0.8)) continue; /* the block's own background, reported there */
      seen.add(el);
      /* Relative to the nearest ancestor at least a bit wider than it — its column. */
      let col = el.parentElement;
      while (col && col !== root && col.getBoundingClientRect().width <= r.width + 1) col = col.parentElement;
      const colW = (col ?? root).getBoundingClientRect().width || rootR.width;
      let radius = parseFloat(s.borderTopLeftRadius) || 0;
      for (let up = el.parentElement, i = 0; i < 3 && up && !radius; i++, up = up.parentElement) {
        const u = getComputedStyle(up);
        if (u.overflow !== 'visible') radius = parseFloat(u.borderTopLeftRadius) || 0;
      }
      out.push({
        kind: el.tagName === 'IMG' ? 'img' : el.tagName === 'VIDEO' ? 'video' : el.tagName === 'IFRAME' ? 'iframe' : 'background-image',
        src: H.short(el.tagName === 'IMG' ? el.currentSrc || el.src : el.tagName === 'VIDEO' ? el.currentSrc : el.tagName === 'IFRAME' ? el.src : bgUrl),
        width: Math.round(r.width),
        height: Math.round(r.height),
        aspect: Math.round((r.width / r.height) * 100) / 100,
        ofColumn: Math.round((r.width / colW) * 100) / 100,
        objectFit: el.tagName === 'IMG' || el.tagName === 'VIDEO' ? s.objectFit : s.backgroundSize,
        objectPosition: el.tagName === 'IMG' || el.tagName === 'VIDEO' ? s.objectPosition : s.backgroundPosition,
        radius: Math.round(radius),
      });
    }
    return out;
  };

  /* Shapes, dividers and ornaments: positioned, textless, not a photo, not the background. */
  H.decor = (root, n = 8) => {
    const out = [];
    for (const via of ['::before', '::after']) {
      const s = getComputedStyle(root, via);
      if (s.content !== 'none' && s.content !== 'normal' && !['absolute', 'fixed'].includes(s.position) && (H.paint(s.backgroundColor) || s.backgroundImage !== 'none')) {
        out.push({ kind: 'pseudo', selector: `${H.describe(root)}${via}`, width: s.width, height: s.height });
      }
    }
    for (const el of Array.from(root.querySelectorAll('*')).slice(0, 600)) {
      if (out.length >= n) break;
      const s = getComputedStyle(el);
      if (!['absolute', 'fixed'].includes(s.position) || !H.shown(el) || H.text(el) || H.covers(el, root, 0.8)) continue;
      if (el.closest('a, button')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 4) continue;
      const shape = el.tagName === 'svg' || el.querySelector('svg') || /shape|divider|separator|wave|ornament|decor|blob/i.test(el.getAttribute('class') ?? '');
      if (!shape && !H.paint(s.backgroundColor) && s.backgroundImage === 'none' && !el.matches('img')) continue;
      out.push({ kind: shape ? 'shape' : el.matches('img') ? 'image' : 'box', selector: H.describe(el), width: Math.round(r.width), height: Math.round(r.height), at: H.rect(el, root) });
    }
    return out;
  };

  /* ⚠ A CSS transition's timing function lives on its KEYFRAMES; the effect's own
     easing reads "linear" for every one of them. */
  H.easing = (a) => {
    const e = String(a?.effect?.getTiming().easing ?? 'linear');
    if (e !== 'linear') return e;
    const k = a?.effect?.getKeyframes?.() ?? [];
    return k.find((x) => x.easing && x.easing !== 'linear')?.easing ?? 'linear';
  };
  H.anims = (scope) =>
    document
      .getAnimations()
      .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity && a.effect?.target && (!scope || scope.contains(a.effect.target)))
      .map((a) => {
        const timing = a.effect.getComputedTiming();
        return {
          target: H.describe(a.effect.target),
          kind: a.transitionProperty ? 'transition' : a.animationName ? 'animation' : 'other',
          property: a.transitionProperty ?? a.animationName ?? '',
          durationMs: Math.round(Number(timing.duration) || 0),
          delayMs: Math.round(Number(timing.delay) || 0),
          easing: H.easing(a),
        };
      })
      .filter((a) => a.durationMs > 0)
      .slice(0, 16);

  /** The page cut into header, top-level sections and footer — copied from match.mjs sectionsInPage(). */
  H.cut = () => {
    const HEADER = 'header, [role=banner], #header-outer, #masthead, .site-header, #brx-header, .elementor-location-header, #main-header, .et-l--header';
    const FOOTER = 'footer, [role=contentinfo], #footer-outer, #colophon, .site-footer, #brx-footer, .elementor-location-footer, #main-footer, .et-l--footer';
    const BUILDERS = [
      '.wpb_row',
      '.et_pb_section',
      '.elementor-top-section, .e-con.e-parent',
      '#brx-content > [class*="brxe-"]',
      '.entry-content > .alignfull, .entry-content > .wp-block-group, .entry-content > .wp-block-cover',
    ];
    const shown = (el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && r.height >= 8 && r.width > 0;
    };
    const inContent = (el) => !!el.parentElement?.closest('main, article');
    const all = [...document.querySelectorAll(HEADER)].filter((el) => shown(el) && !inContent(el));
    const header = all.find((el) => !all.some((o) => o !== el && o.contains(el))) ?? null;
    const footers = [...document.querySelectorAll(FOOTER)].filter((el) => shown(el) && !inContent(el));
    const footer = footers.filter((el) => !footers.some((o) => o !== el && o.contains(el))).pop() ?? null;
    const chrome = (el) => (header && (el === header || header.contains(el))) || (footer && (el === footer || footer.contains(el)));
    const root = document.querySelector('main, [role=main]') ?? document.body;
    const rootHeight = root.getBoundingClientRect().height || 1;
    let method = 'builder';
    /* Builder rows nested inside a builder row are columns' content, not sections. */
    let content = BUILDERS.flatMap((sel) => [...document.querySelectorAll(sel)]).filter((el) => shown(el) && !chrome(el));
    content = content.filter((el) => !content.some((o) => o !== el && o.contains(el)));
    const covered = content.reduce((n, el) => n + el.getBoundingClientRect().height, 0);
    if (!content.length || covered < rootHeight * 0.6) {
      method = 'generic';
      const SKIP = new Set(['SCRIPT', 'STYLE', 'LINK', 'NOSCRIPT', 'TEMPLATE', 'META']);
      const expand = (el) =>
        [...el.children].flatMap((c) => {
          if (SKIP.has(c.tagName) || !shown(c)) return [];
          if (c === header || c === footer) return [];
          if ((header && c.contains(header)) || (footer && c.contains(footer))) return expand(c);
          return [c];
        });
      let level = expand(root);
      let container = root;
      while (level.length === 1 && level[0].children.length > 1) {
        const inner = expand(level[0]);
        if (!inner.length) break;
        container = level[0];
        level = inner;
      }
      const TEXT = /^(P|H[1-6]|UL|OL|LI|DL|BLOCKQUOTE|TABLE|PRE|FIGURE|IMG|PICTURE|A|SPAN|BR|HR|STRONG|EM|B|I|ADDRESS)$/;
      if (level.length > 2 && level.filter((el) => TEXT.test(el.tagName)).length >= level.length * 0.6) level = [container];
      content = level.filter((el) => getComputedStyle(el).position !== 'fixed');
    }
    content.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    return { header, footer, sections: content, method };
  };

  window.__wbk = H;
  return true;
}

/* ── Watching: carousels, marquees and rotating hero text ──────────────── */

/**
 * Watch the page at rest. A library signature finds a stopped slider; watching
 * finds the hand-rolled marquee no library named, the autoplay interval, and a
 * hero headline that swaps its words. Watches `baseMs`, and longer — up to
 * `maxMs` — only while a carousel or a rotating word has not yet changed often
 * enough to time.
 */
export function WATCH({ baseMs = 1500, maxMs = 12000 } = {}) {
  const H = window.__wbk;
  const SIGNATURES = [
    ['swiper', '.swiper, .swiper-container'],
    ['slick', '.slick-slider'],
    ['splide', '.splide'],
    ['flickity', '.flickity-enabled'],
    ['owl', '.owl-carousel'],
    ['glide', '.glide'],
    ['slider-revolution', 'rs-module, .rev_slider'],
    ['smart-slider', '.n2-section-smartslider'],
    ['elementor', '.elementor-slides, .elementor-image-carousel, .elementor-widget-image-carousel'],
    ['divi', '.et_pb_slider'],
    ['bricks', '.brxe-slider, .brxe-carousel, .brxe-slider-nested'],
    ['salient', '.nectar-slider-wrap, .nectar-flickity, .nectar-carousel'],
    ['wpbakery', '.vc_images_carousel, .wpb_gallery_slides'],
    ['jetpack', '.wp-block-jetpack-slideshow'],
    ['bootstrap', '.carousel'],
    ['generic', '[aria-roledescription="carousel"], [data-carousel], [class*="carousel"], [class*="slider"]'],
  ];
  const MARQUEE = 'marquee, [class*="marquee"], [class*="ticker"], .nectar-scrolling-text, [class*="scrolling-text"]';
  const SLIDE = '.swiper-slide, .slick-slide:not(.slick-cloned), .splide__slide, .carousel-item, .owl-item:not(.cloned), .glide__slide, .flickity-cell, [aria-roledescription="slide"], [class*="slide"]:not([class*="slider"])';
  const describe = H.describe;
  const t0 = performance.now();

  const watch = Array.from(document.querySelectorAll('body *')).filter((e) => e.offsetWidth > 0 && e.offsetHeight > 0).slice(0, 5000);
  const before = new Map(watch.map((e) => [e, e.getBoundingClientRect()]));

  /* Carousels by signature, found now so their changes can be timed from the start. */
  const carousels = [];
  const claimed = new Set();
  for (const [library, sel] of SIGNATURES) {
    for (const el of Array.from(document.querySelectorAll(sel))) {
      if (!el.offsetWidth || [...claimed].some((c) => c.contains(el) || el.contains(c))) continue;
      if (el.matches(MARQUEE)) continue;
      const slides = el.querySelectorAll(SLIDE).length;
      if (library === 'generic' && slides < 2) continue;
      claimed.add(el);
      const entry = { el, library, slides, bursts: [], lastAt: -1e9, indexes: [], xs: [] };
      const trackEl = el.querySelector('.swiper-wrapper, .slick-track, .splide__list, .flickity-slider, .owl-stage, .glide__slides, .carousel-inner') ?? el.firstElementChild ?? el;
      /* Where the track is headed: the inline transform a script just wrote. */
      const trackX = () => {
        const t = trackEl.style.transform || '';
        const m = /translate(?:3d|X)?\(\s*(-?[\d.]+)(px|%)?/.exec(t) || /matrix\([^,]+,[^,]+,[^,]+,[^,]+,\s*(-?[\d.]+)/.exec(t);
        return m ? Number(m[1]) : null;
      };
      const activeIndex = () => {
        const all = Array.from(el.querySelectorAll(SLIDE));
        const i = all.findIndex((s) => /\b(active|is-active|is-selected|swiper-slide-active|slick-current|current)\b/.test(s.getAttribute('class') ?? '') || s.getAttribute('aria-current') === 'true');
        return i;
      };
      entry.activeIndex = activeIndex;
      entry.observer = new MutationObserver(() => {
        const now = performance.now() - t0;
        /* A burst is one change: a transition writes many frames. */
        if (now - entry.lastAt > 200) {
          entry.bursts.push(Math.round(now));
          entry.indexes.push(activeIndex());
          setTimeout(() => entry.xs.push(trackX()), 30);
        }
        entry.lastAt = now;
      });
      entry.observer.observe(el, { attributes: true, subtree: true, attributeFilter: ['class', 'style', 'aria-hidden', 'aria-current'] });
      carousels.push(entry);
    }
  }

  /* Marquee candidates we can time now: by name, and by an infinite animation that translates. */
  const infinite = document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations === Infinity && a.effect?.target);
  const keyframesOf = (t) => infinite.filter((a) => a.effect.target === t).flatMap((a) => a.effect.getKeyframes());
  const marqueeEls = new Set([
    ...Array.from(document.querySelectorAll(MARQUEE)).filter((e) => e.offsetWidth > 0),
    ...infinite.map((a) => a.effect.target).filter((t) => t.textContent.trim() && /translate|matrix/.test(JSON.stringify(keyframesOf(t)))),
  ]);
  const tracks = new Map();
  for (const el of marqueeEls) {
    const moving = infinite.find((a) => el === a.effect.target || el.contains(a.effect.target))?.effect.target ?? el.firstElementChild ?? el;
    tracks.set(el, { track: moving, samples: [] });
  }

  /* Rotating or typed words in the hero headline. */
  const cut = H.cut();
  const hero = cut.sections[0] ?? null;
  const changes = [];
  let heroObserver = null;
  if (hero) {
    heroObserver = new MutationObserver((records) => {
      const now = Math.round(performance.now() - t0);
      for (const r of records) {
        const el = r.type === 'characterData' ? r.target.parentElement : r.target;
        if (!el || el.nodeType !== 1) continue;
        /* A slider's captions change too; that is the carousel, timed above. */
        if (carousels.some((c) => c.el.contains(el))) continue;
        if (r.type === 'attributes') {
          /* Stacked words, one shown at a time by a class: the parent holds the word list. */
          const parent = el.parentElement;
          const sibs = parent ? Array.from(parent.children).filter((c) => H.text(c) && H.text(c).length <= 40) : [];
          if (sibs.length >= 2 && sibs.includes(el)) {
            const active = sibs.find((c) => Number(getComputedStyle(c).opacity) > 0.5 && getComputedStyle(c).visibility !== 'hidden' && /\b(active|is-visible|visible|current|in|show)\b/.test(c.getAttribute('class') ?? ''))
              ?? sibs.find((c) => Number(getComputedStyle(c).opacity) > 0.5 && getComputedStyle(c).visibility !== 'hidden');
            changes.push({ t: now, el: parent, kind: 'class', text: active ? H.text(active, 40) : null, words: sibs.map((c) => H.text(c, 40)) });
          }
          continue;
        }
        changes.push({ t: now, el, kind: 'text', text: H.text(el, 60) });
      }
    });
    heroObserver.observe(hero, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class'] });
  }

  const enough = () => {
    const elapsed = performance.now() - t0;
    if (elapsed < baseMs) return false;
    if (elapsed >= maxMs) return true;
    const carouselsDone = carousels.every((c) => c.bursts.length >= 4 || (c.bursts.length === 0 && elapsed > 7000));
    const rotatingDone = changes.length === 0 || new Set(changes.map((c) => c.text)).size >= 3 && changes.length >= 4 || elapsed > 8000;
    return carouselsDone && rotatingDone;
  };

  return new Promise((resolve) => {
    const tick = () => {
      const now = performance.now() - t0;
      for (const m of tracks.values()) m.samples.push([now, m.track.getBoundingClientRect().left]);
      if (!enough()) return setTimeout(tick, 50);
      for (const c of carousels) c.observer.disconnect();
      heroObserver?.disconnect();
      const watchedMs = Math.round(performance.now() - t0);

      const moved = new Set();
      for (const [el, a] of before) {
        const b = el.getBoundingClientRect();
        if (Math.abs(b.left - a.left) > 2 && Math.abs(b.top - a.top) < 2) moved.add(el);
      }
      const movers = [...moved].filter((el) => !moved.has(el.parentElement));
      const median = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);

      const found = [];
      for (const c of carousels) {
        const el = c.el;
        const track = el.querySelector('.swiper-wrapper, .slick-track, .splide__list, .flickity-slider, .owl-stage, .glide__slides, .carousel-inner') ?? el;
        const t = getComputedStyle(track);
        const intervals = c.bursts.slice(1).map((b, i) => b - c.bursts[i]);
        const isMoving = movers.some((m) => el.contains(m)) || c.bursts.length > 0;
        const clones = el.querySelectorAll('.slick-cloned, .swiper-slide-duplicate, .cloned, [class*="clone"]').length;
        /* Back to the start after moving one way: by the active slide's index, or by the track's position. */
        const xs = c.xs.filter((x) => x !== null);
        const dir = xs.length > 1 ? Math.sign(xs[1] - xs[0]) : 0;
        const wrapped = c.indexes.some((ix, i) => i > 0 && ix >= 0 && c.indexes[i - 1] > ix) || (dir !== 0 && xs.some((x, i) => i > 0 && Math.sign(x - xs[i - 1]) === -dir));
        const elR = el.getBoundingClientRect();
        const arrows = Array.from(el.parentElement?.querySelectorAll('button, a, [role=button], div, span') ?? [])
          .filter((a) => /prev|next|arrow/i.test(`${a.getAttribute('class') ?? ''} ${a.getAttribute('aria-label') ?? ''}`) && H.shown(a) && a.getBoundingClientRect().width < 160)
          .filter((a, i, all) => !all.some((o) => o !== a && o.contains(a)))
          .slice(0, 2);
        const dots = Array.from(el.parentElement?.querySelectorAll('.swiper-pagination-bullet, .slick-dots li, .flickity-page-dot, .splide__pagination__page, .owl-dot, .glide__bullet, [class*="dot"]:not([class*="dots"]), [role=tab]') ?? [])
          .filter((d) => H.shown(d) && d.getBoundingClientRect().width < 60);
        const activeDot = dots.find((d) => /active|current|selected/.test(d.getAttribute('class') ?? '') || d.getAttribute('aria-selected') === 'true' || d.getAttribute('aria-current') === 'true');
        const plainDot = dots.find((d) => d !== activeDot);
        const dotStyle = (d) => {
          if (!d) return null;
          const s = getComputedStyle(d);
          const r = d.getBoundingClientRect();
          return { width: Math.round(r.width), height: Math.round(r.height), background: s.backgroundColor, border: `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`, radius: s.borderTopLeftRadius, opacity: Number(s.opacity) };
        };
        found.push({
          kind: 'carousel',
          library: c.library,
          selector: describe(el),
          slides: c.slides,
          autoplay: isMoving,
          intervalMs: intervals.length ? Math.round(median(intervals) / 50) * 50 : null,
          changesSeen: c.bursts.length,
          loop: clones > 0 || wrapped ? true : c.bursts.length >= c.slides && (c.indexes.some((i) => i >= 0) || xs.length > 1) ? false : null,
          loopKind: clones > 0 ? 'infinite (cloned slides)' : wrapped ? 'rewinds to the first slide' : null,
          transition: H.transition(t),
          arrows: arrows.length
            ? arrows.map((a) => {
                const s = getComputedStyle(a);
                const r = a.getBoundingClientRect();
                const outside = r.right <= elR.left + 2 || r.left >= elR.right - 2;
                return { selector: describe(a), width: Math.round(r.width), height: Math.round(r.height), background: s.backgroundColor, color: s.color, radius: s.borderTopLeftRadius, position: outside ? 'outside' : 'over the slides', label: a.getAttribute('aria-label') ?? '' };
              })
            : [],
          dots: dots.length ? { count: dots.length, dot: dotStyle(plainDot), active: dotStyle(activeDot), gap: dots.length > 1 ? Math.round(dots[1].getBoundingClientRect().left - dots[0].getBoundingClientRect().right) : null } : null,
          rect: H.docRect(el),
        });
      }

      const claimedEls = [...claimed];
      const marquees = new Set([...marqueeEls, ...movers.filter((m) => !claimedEls.some((c) => c.contains(m)) && m.textContent.trim())]);
      const kept = [...marquees].filter((el) => ![...marquees].some((o) => o !== el && o.contains(el)) && !claimedEls.some((c) => c.contains(el)));
      for (const el of kept) {
        const anim = infinite.find((a) => el === a.effect.target || el.contains(a.effect.target));
        const timing = anim?.effect.getComputedTiming();
        /* Speed from the samples: the median step, skipping the jump where a loop restarts. */
        const tr = tracks.get(el) ?? [...tracks.entries()].find(([k]) => k.contains(el) || el.contains(k))?.[1];
        let speed = null;
        if (tr && tr.samples.length > 4) {
          const v = tr.samples.slice(1).map(([t, x], i) => ((x - tr.samples[i][1]) / (t - tr.samples[i][0])) * 1000).filter((s) => Number.isFinite(s));
          const med = median(v);
          const steady = v.filter((s) => Math.sign(s) === Math.sign(med) && Math.abs(s) < Math.abs(med) * 3);
          speed = steady.length ? steady.reduce((n, s) => n + s, 0) / steady.length : med;
        } else if (moved.has(el) || movers.includes(el)) {
          const a = before.get(el);
          const b = el.getBoundingClientRect();
          if (a) speed = ((b.left - a.left) / watchedMs) * 1000;
        }
        const track = tr?.track ?? el;
        found.push({
          kind: 'marquee',
          library: el.tagName === 'MARQUEE' ? '<marquee>' : anim ? 'css-animation' : moved.has(el) ? 'script' : 'class-name',
          selector: describe(el),
          text: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 60),
          moving: movers.some((m) => m === el || el.contains(m) || m.contains(el)) || (speed !== null && Math.abs(speed) > 1),
          durationMs: timing ? Math.round(timing.duration) : null,
          easing: anim ? H.easing(anim) : null,
          speedPxPerS: speed === null ? null : Math.round(Math.abs(speed)),
          direction: speed === null || Math.abs(speed) < 1 ? null : speed < 0 ? 'left' : 'right',
          trackWidth: Math.round(track.getBoundingClientRect().width),
          pausesOnHover: null,
          rect: H.docRect(el),
        });
      }

      /* Rotating text: the element that changed, its words, how often. */
      const rotating = [];
      const byEl = new Map();
      for (const c of changes) {
        const k = byEl.get(c.el) ?? [];
        k.push(c);
        byEl.set(c.el, k);
      }
      for (const [el, list] of byEl) {
        const texts = list.map((c) => c.text).filter((t) => t !== null);
        const distinct = [...new Set(texts)];
        if (distinct.length < 2) continue;
        let effect = list[0].kind === 'class' ? 'class-toggle' : 'swap';
        let words = list[0].kind === 'class' ? list[0].words : distinct;
        let times = [];
        /* Typed: each value is the previous plus or minus a character. */
        const typedSteps = texts.slice(1).filter((t, i) => Math.abs(t.length - texts[i].length) === 1 && (t.startsWith(texts[i]) || texts[i].startsWith(t))).length;
        if (texts.length > 4 && typedSteps >= (texts.length - 1) * 0.7) {
          effect = 'typed';
          /* A full word is a value no longer value extends. */
          words = distinct.filter((w) => w && !distinct.some((o) => o.length > w.length && o.startsWith(w)));
          times = list.filter((c, i) => words.includes(c.text) && list[i - 1]?.text !== c.text).map((c) => c.t);
        } else {
          times = list.filter((c, i) => i === 0 || c.text !== list[i - 1].text).map((c) => c.t);
        }
        const intervals = times.slice(1).map((t, i) => t - times[i]).filter((d) => d > 80);
        const cs = getComputedStyle(el);
        rotating.push({
          selector: describe(el),
          inHeading: !!el.closest('h1, h2, h3'),
          effect,
          words: words.slice(0, 12),
          intervalMs: intervals.length ? Math.round(median(intervals) / 50) * 50 : null,
          changesSeen: times.length,
          transition: H.transition(cs),
          animation: cs.animationName !== 'none' ? `${cs.animationName} ${cs.animationDuration} ${cs.animationTimingFunction}` : null,
          colour: cs.color,
        });
      }
      resolve({ found: found.slice(0, 20), rotating: rotating.slice(0, 4), watchedMs });
    };
    tick();
  });
}

/* ── Scroll-driven motion: reveal-on-scroll and parallax ───────────────── */

/**
 * Scroll the page in steps and watch what the scroll does. Replaces the old
 * settle() walk — it loads the same lazy images on the way — and comes back to
 * the top. Reveal: elements below the fold that start hidden or displaced and
 * change when they arrive. Parallax: elements whose page position or
 * background position moves in proportion to the scroll.
 */
export function SCROLL_MOTION({ stepShare = 0.4, waitMs = 90, maxSteps = 60 } = {}) {
  const H = window.__wbk;
  const vh = innerHeight;
  const scrollTo0 = (y) => window.scrollTo({ top: y, left: 0, behavior: 'instant' });
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const has = (sel) => {
    try {
      return !!document.querySelector(sel);
    } catch {
      return false;
    }
  };
  const libraries = [
    (window.AOS || has('[data-aos]')) && 'AOS',
    window.ScrollTrigger && 'GSAP ScrollTrigger',
    window.gsap && !window.ScrollTrigger && 'GSAP',
    (window.WOW || has('.wow')) && 'WOW.js',
    (window.ScrollReveal || has('[data-sr-id]')) && 'ScrollReveal',
    has('.elementor-invisible, .elementor-element[data-settings*="_animation"], .animated') && 'Elementor motion effects',
    has('[data-animation], .has-animation, .nectar-animated, [data-nectar-animate]') && 'Salient data-animation',
    has('.et_animated, .et-waypoint') && 'Divi animation',
    has('[data-interactions], .brx-animated') && 'Bricks interactions',
    has('.animate__animated') && 'Animate.css',
    (window.Rellax || has('[data-rellax-speed]')) && 'Rellax',
    (window.jarallax || has('.jarallax')) && 'Jarallax',
    has('[data-stellar-ratio], [data-stellar-background-ratio]') && 'Stellar',
    has('[data-parallax], [class*="parallax"]') && 'parallax (by name)',
    [...document.styleSheets].some((s) => {
      try {
        return [...s.cssRules].some((r) => /animation-timeline/.test(r.cssText));
      } catch {
        return false;
      }
    }) && 'CSS scroll-driven animations',
  ].filter(Boolean);

  const all = Array.from(document.querySelectorAll('body *')).slice(0, 6000);
  const fixedRoots = all.filter((el) => ['fixed', 'sticky'].includes(getComputedStyle(el).position));
  const fixedish = (el) => fixedRoots.some((f) => f === el || f.contains(el));
  const SIGNED = '[data-aos], .wow, .elementor-invisible, [data-animation], .has-animation, .nectar-animated, [data-sr-id], .et_animated, [data-interactions], .animate__animated, [class*="reveal"], [class*="fade-in"]';
  const matrix = (t) => {
    if (!t || t === 'none') return { tx: 0, ty: 0, scale: 1 };
    const m = /matrix\(([^)]+)\)/.exec(t);
    if (m) {
      const [a, b, , , e, f] = m[1].split(',').map(Number);
      return { tx: e, ty: f, scale: Math.round(Math.hypot(a, b) * 100) / 100 };
    }
    const m3 = /matrix3d\(([^)]+)\)/.exec(t);
    if (m3) {
      const v = m3[1].split(',').map(Number);
      return { tx: v[12], ty: v[13], scale: Math.round(Math.hypot(v[0], v[1]) * 100) / 100 };
    }
    return { tx: 0, ty: 0, scale: 1 };
  };
  const stateOf = (el) => {
    const s = getComputedStyle(el);
    return { opacity: Number(s.opacity), visibility: s.visibility, ...matrix(s.transform), clip: s.clipPath !== 'none' ? s.clipPath : null, filter: s.filter !== 'none' ? s.filter : null };
  };

  /* Reveal candidates: below the fold at load, and hidden, displaced, or carrying a reveal signature. */
  let reveal = all.filter((el) => {
    if (!el.offsetWidth || !el.offsetHeight || fixedish(el)) return false;
    const r = el.getBoundingClientRect();
    if (r.top < vh * 0.9) return false;
    const st = stateOf(el);
    const hidden = st.opacity < 0.1 || st.visibility === 'hidden' || Math.abs(st.ty) >= 8 || Math.abs(st.tx) >= 8 || (st.scale !== 1 && st.scale > 0) || !!st.clip;
    return hidden || el.matches(SIGNED);
  });
  /* Not a reveal: anything inside a carousel or marquee, or anything with a looping animation — those move at rest. */
  const MOVERS = `${H.CAROUSEL}, [class*="slider"], [class*="carousel"], [class*="marquee"], [class*="ticker"], marquee`;
  const looping = new Set(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations === Infinity).map((a) => a.effect?.target).filter(Boolean));
  reveal = reveal.filter((el) => !el.closest(MOVERS) && ![...looping].some((t) => t === el || el.contains(t) || t.contains(el)));
  reveal = reveal.filter((el) => !reveal.some((o) => o !== el && o.contains(el))).slice(0, 300);
  const revealSet = new Set(reveal);
  const initial = new Map(reveal.map((el) => [el, stateOf(el)]));
  const firstMutation = new Map();
  const t0 = performance.now();
  const mo = new MutationObserver((records) => {
    for (const r of records) {
      const el = r.target;
      if (!revealSet.has(el) || firstMutation.has(el)) continue;
      firstMutation.set(el, { t: performance.now() - t0, top: el.getBoundingClientRect().top, scrollY });
    }
  });
  for (const el of reveal) mo.observe(el, { attributes: true, attributeFilter: ['class', 'style', 'data-aos', 'data-animated'] });

  /* Parallax candidates: anything sizeable that is not fixed and not a reveal candidate. */
  const explicit = Array.from(document.querySelectorAll('[data-parallax], [class*="parallax"], [data-speed], [data-rellax-speed], .jarallax, [data-stellar-ratio], [data-stellar-background-ratio]'));
  const para = [...new Set([...explicit, ...all.filter((el) => el.offsetWidth >= 100 && el.offsetHeight >= 60)])]
    .filter((el) => !fixedish(el) && !reveal.some((r) => r === el || r.contains(el)))
    .slice(0, 1500);
  const samples = new Map(para.map((el) => [el, []]));
  const bgPx = (s) => {
    const v = s.backgroundPositionY;
    return /^-?[\d.]+px$/.test(v) ? parseFloat(v) : null;
  };

  const maxY = Math.max(0, Math.min(document.documentElement.scrollHeight - vh, 30000));
  const step = Math.max(120, Math.floor(vh * stepShare));
  const ys = [];
  for (let y = 0; y <= maxY && ys.length < maxSteps; y += step) ys.push(y);
  if (ys[ys.length - 1] !== maxY && ys.length < maxSteps + 1) ys.push(maxY);

  const revealedAt = new Map();
  const running = new Map();
  const checkReveals = () => {
    for (const el of reveal) {
      if (revealedAt.has(el)) continue;
      const a = el.getAnimations?.().find((x) => x.effect?.getComputedTiming().iterations !== Infinity);
      if (a && !running.has(el)) {
        const timing = a.effect.getComputedTiming();
        running.set(el, { property: a.transitionProperty ?? a.animationName ?? '', durationMs: Math.round(Number(timing.duration) || 0), delayMs: Math.round(Number(timing.delay) || 0), easing: H.easing(a) });
      }
      const st = stateOf(el);
      const init = initial.get(el);
      const changed = Math.abs(st.opacity - init.opacity) > 0.3 || Math.abs(st.ty - init.ty) > 4 || Math.abs(st.tx - init.tx) > 4 || Math.abs(st.scale - init.scale) > 0.02 || st.visibility !== init.visibility || st.clip !== init.clip;
      if (changed) revealedAt.set(el, { t: performance.now() - t0, top: el.getBoundingClientRect().top });
    }
  };

  return (async () => {
    await wait(250);
    for (const el of [...reveal]) {
      const a = initial.get(el);
      const b = stateOf(el);
      if (Math.abs(a.opacity - b.opacity) > 0.05 || Math.abs(a.tx - b.tx) > 1 || Math.abs(a.ty - b.ty) > 1) {
        reveal.splice(reveal.indexOf(el), 1);
        revealSet.delete(el);
      }
    }
    for (const y of ys) {
      scrollTo0(y);
      await frame();
      await wait(waitMs);
      for (const el of para) {
        const r = el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh) continue;
        samples.get(el).push([scrollY, r.top + scrollY, bgPx(getComputedStyle(el))]);
      }
      checkReveals();
    }
    await wait(900);
    checkReveals();
    mo.disconnect();

    /* ── Reveals, grouped by how they move ── */
    const records = [];
    for (const el of reveal) {
      const init = initial.get(el);
      const fin = stateOf(el);
      const done = revealedAt.has(el) || firstMutation.has(el);
      if (!done) continue;
      const s = getComputedStyle(el);
      let timing = running.get(el) ?? null;
      if (!timing) {
        if (s.animationName !== 'none') timing = { property: s.animationName, durationMs: parseFloat(s.animationDuration) * (s.animationDuration.endsWith('ms') ? 1 : 1000), delayMs: parseFloat(s.animationDelay) * (s.animationDelay.endsWith('ms') ? 1 : 1000), easing: s.animationTimingFunction };
        else if (s.transitionDuration !== '0s') {
          const props = s.transitionProperty.split(',').map((x) => x.trim());
          const i = Math.max(0, props.findIndex((p) => ['opacity', 'transform', 'all', 'translate'].includes(p)));
          const pick = (list) => list.split(',').map((x) => x.trim())[i] ?? list.split(',')[0].trim();
          const ms = (v) => parseFloat(v) * (v.endsWith('ms') ? 1 : 1000);
          timing = { property: props[i], durationMs: ms(pick(s.transitionDuration)), delayMs: ms(pick(s.transitionDelay)), easing: pick(s.transitionTimingFunction) };
        }
      } else if (timing.delayMs === 0 && s.transitionDelay !== '0s') {
        const ms = (v) => parseFloat(v) * (v.endsWith('ms') ? 1 : 1000);
        timing.delayMs = ms(s.transitionDelay.split(',')[0].trim());
      }
      const effect = [];
      if (init.opacity < 0.1 && fin.opacity > 0.5) effect.push('fade');
      if (Math.abs(init.ty - fin.ty) >= 4) effect.push(init.ty > fin.ty ? `slide-up ${Math.round(init.ty - fin.ty)}px` : `slide-down ${Math.round(fin.ty - init.ty)}px`);
      if (Math.abs(init.tx - fin.tx) >= 4) effect.push(init.tx > fin.tx ? `slide-left ${Math.round(init.tx - fin.tx)}px` : `slide-right ${Math.round(fin.tx - init.tx)}px`);
      if (Math.abs(init.scale - fin.scale) > 0.02) effect.push(`scale ${init.scale} → ${fin.scale}`);
      if (init.clip && init.clip !== fin.clip) effect.push('clip-path');
      if (init.filter && init.filter !== fin.filter) effect.push(`filter ${init.filter}`);
      if (init.visibility === 'hidden' && fin.visibility !== 'hidden' && !effect.length) effect.push(s.animationName !== 'none' ? s.animationName : 'appear');
      const lib =
        el.matches('[data-aos]') ? 'AOS'
          : el.matches('.wow') ? 'WOW.js'
            : el.matches('.elementor-invisible, .animated, .elementor-element') ? 'Elementor'
              : el.matches('[data-animation], .has-animation, .nectar-animated') ? 'Salient'
                : el.matches('[data-sr-id]') ? 'ScrollReveal'
                  : el.matches('.et_animated') ? 'Divi'
                    : el.matches('[data-interactions]') ? 'Bricks'
                      : el.style.transform || el.style.opacity ? 'script (inline style)'
                        : 'class toggle';
      const mut = firstMutation.get(el);
      records.push({
        el,
        library: lib,
        effect: effect.join(' + ') || 'unknown',
        durationMs: timing ? Math.round(timing.durationMs) : null,
        delayMs: timing ? Math.round(timing.delayMs) : 0,
        easing: timing?.easing ?? null,
        triggerOffsetPx: mut ? Math.round(vh - mut.top) : null,
        attr: el.getAttribute('data-aos') ?? el.getAttribute('data-animation') ?? null,
      });
    }
    const groups = new Map();
    for (const r of records) {
      const key = `${r.library}|${r.effect}|${r.durationMs}|${r.easing}`;
      const g = groups.get(key) ?? { library: r.library, effect: r.effect, durationMs: r.durationMs, easing: r.easing, attr: r.attr, count: 0, delays: [], offsets: [], examples: [], els: [] };
      g.count++;
      g.delays.push(r.delayMs);
      if (r.triggerOffsetPx !== null) g.offsets.push(r.triggerOffsetPx);
      if (g.examples.length < 3) g.examples.push(H.describe(r.el));
      g.els.push(r);
      groups.set(key, g);
    }
    const median = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);
    const reveals = [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 20).map((g) => {
      /* Stagger: siblings revealed together whose delays step by a constant. */
      const byParent = new Map();
      for (const r of g.els) {
        const k = byParent.get(r.el.parentElement) ?? [];
        k.push(r);
        byParent.set(r.el.parentElement, k);
      }
      const steps = [];
      for (const list of byParent.values()) {
        if (list.length < 2) continue;
        const delays = list.map((r) => r.delayMs);
        for (let i = 1; i < delays.length; i++) if (delays[i] - delays[i - 1] > 0) steps.push(delays[i] - delays[i - 1]);
      }
      return {
        library: g.library,
        effect: g.effect,
        durationMs: g.durationMs,
        easing: g.easing,
        delayMs: median(g.delays),
        delays: [...new Set(g.delays)].sort((a, b) => a - b).slice(0, 8),
        staggerMs: steps.length ? median(steps) : null,
        triggerOffsetPx: median(g.offsets),
        attr: g.attr,
        count: g.count,
        examples: g.examples,
        y: Math.min(...g.els.map((r) => H.docRect(r.el).y)),
      };
    });

    /* ── Parallax: page position (or background position) linear in scroll ── */
    const fit = (pts) => {
      const n = pts.length;
      const mx = pts.reduce((s, p) => s + p[0], 0) / n;
      const my = pts.reduce((s, p) => s + p[1], 0) / n;
      let sxy = 0;
      let sxx = 0;
      let syy = 0;
      for (const [x, y] of pts) {
        sxy += (x - mx) * (y - my);
        sxx += (x - mx) ** 2;
        syy += (y - my) ** 2;
      }
      if (!sxx) return { slope: 0, r2: 0 };
      const slope = sxy / sxx;
      const r2 = syy ? (sxy * sxy) / (sxx * syy) : 0;
      return { slope, r2 };
    };
    const flagged = [];
    for (const [el, pts] of samples) {
      if (pts.length < 3 || pts[pts.length - 1][0] - pts[0][0] < 200) continue;
      const pos = fit(pts.map((p) => [p[0], p[1]]));
      const bgPts = pts.filter((p) => p[2] !== null);
      const bg = bgPts.length >= 3 ? fit(bgPts.map((p) => [p[0], p[2]])) : { slope: 0, r2: 0 };
      if (Math.abs(pos.slope) >= 0.04 && pos.r2 >= 0.9) flagged.push({ el, kind: 'transform', rate: pos.slope });
      else if (Math.abs(bg.slope) >= 0.04 && bg.r2 >= 0.9) flagged.push({ el, kind: 'background-position', rate: bg.slope });
    }
    for (const el of para) {
      const s = getComputedStyle(el);
      if (s.backgroundAttachment === 'fixed' && H.urlOf(s.backgroundImage)) flagged.push({ el, kind: 'fixed-background', rate: 1 });
    }
    const kept = flagged.filter((f) => !flagged.some((o) => o !== f && o.el.contains(f.el) && Math.abs(o.rate - f.rate) < 0.05));
    const parallax = kept.slice(0, 20).map((f) => {
      const s = getComputedStyle(f.el);
      return {
        kind: f.kind,
        selector: H.describe(f.el),
        rate: Math.round(f.rate * 100) / 100,
        image: H.short(H.urlOf(s.backgroundImage) ?? (f.el.tagName === 'IMG' ? f.el.currentSrc : null)),
        /* Where it sits at scroll 0. Read now, the layer still carries the offset
           of wherever the walk stopped, so take that back out by its own rate. */
        ...(() => {
          const r = H.docRect(f.el);
          const y = Math.round(r.y - (f.kind === 'transform' ? f.rate * scrollY : 0));
          /* The layer usually starts above its section, oversized to cover the travel: place it by its middle. */
          return { y, height: Math.round(r.height), centreY: Math.round(y + r.height / 2) };
        })(),
      };
    });

    scrollTo0(0);
    await frame();
    await document.fonts?.ready;
    return {
      libraries,
      reveals,
      parallax,
      revealCandidates: reveal.length,
      steps: ys.length,
      note: 'rate = page-position change per px scrolled: 0 scrolls with the page, 0.3 lags it (moves 0.3px down per px), 1 stays put on screen',
    };
  })();
}

/* ── The blueprint: header, hero, sections, footer at this width ───────── */

export function BLUEPRINT() {
  const H = window.__wbk;
  const vw = innerWidth;
  const vh = innerHeight;
  const cut = H.cut();
  const firstContent = (root) => {
    /* Text, media and controls: what a padding is measured to. */
    const els = Array.from(root.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, img, video, iframe, a, button, blockquote, figure, svg')).filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' && !H.covers(e, root, 0.8);
    });
    if (!els.length) return null;
    const rs = els.map((e) => e.getBoundingClientRect());
    return { top: Math.min(...rs.map((r) => r.top)), bottom: Math.max(...rs.map((r) => r.bottom)), left: Math.min(...rs.map((r) => r.left)), right: Math.max(...rs.map((r) => r.right)) };
  };
  const firstOf = (root, sel, pred = () => true) => Array.from(root.querySelectorAll(sel)).find((e) => H.shown(e) && H.text(e) && pred(e)) ?? null;

  const section = (el, i) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const box = firstContent(el);
    const heading = firstOf(el, 'h1, h2, h3, h4, h5, h6');
    const body = firstOf(el, 'p, li', (e) => H.text(e, 400).length >= 40);
    let eyebrow = null;
    if (heading) {
      const prev = heading.previousElementSibling;
      const hs = parseFloat(getComputedStyle(heading).fontSize);
      const candidate = prev && H.shown(prev) && H.text(prev) && H.text(prev).length <= 60 && parseFloat(getComputedStyle(prev).fontSize) < hs ? prev
        : firstOf(el, '[class*="eyebrow"], [class*="kicker"], [class*="overline"], [class*="subtitle"], [class*="pre-title"], [class*="tagline"]', (e) => e.getBoundingClientRect().top <= heading.getBoundingClientRect().top);
      eyebrow = candidate ? H.type(candidate) : null;
    }
    return {
      key: `s${i + 1}`,
      index: i,
      title: heading ? H.text(heading, 48) : '',
      selector: H.describe(el),
      y: Math.round(r.top + scrollY),
      height: Math.round(r.height),
      width: Math.round(r.width),
      padding: { top: parseFloat(cs.paddingTop), bottom: parseFloat(cs.paddingBottom), left: parseFloat(cs.paddingLeft), right: parseFloat(cs.paddingRight) },
      inset: box ? { top: Math.round(box.top - r.top), bottom: Math.round(r.bottom - box.bottom), left: Math.round(box.left - r.left), right: Math.round(r.right - box.right), contentWidth: Math.round(box.right - box.left) } : null,
      minHeight: cs.minHeight,
      background: H.background(el),
      layout: H.layout(el),
      heading: H.type(heading),
      headingTag: heading?.tagName.toLowerCase() ?? null,
      eyebrow,
      body: H.type(body),
      buttons: H.buttonsIn(el, 3),
      media: H.media(el),
      decor: H.decor(el),
    };
  };

  const sections = cut.sections.slice(0, 40).map(section);

  /* ── Hero: the first section, with what only a hero has ── */
  let hero = null;
  const heroEl = cut.sections[0];
  if (heroEl && sections[0]) {
    const s = sections[0];
    const r = heroEl.getBoundingClientRect();
    const h1 = firstOf(heroEl, 'h1') ?? firstOf(heroEl, 'h2, h3');
    let content = null;
    if (h1) {
      const btn = Array.from(heroEl.querySelectorAll('a, button')).find((b) => H.shown(b) && H.button(b));
      let box = h1.parentElement;
      while (box && box !== heroEl && btn && !box.contains(btn)) box = box.parentElement;
      box ??= h1.parentElement;
      /* The content box is the tightest box around heading and buttons, not the full-width wrapper. */
      const parts = [h1, btn, s.eyebrow && h1.previousElementSibling].filter(Boolean);
      /* The TEXT's extent, not the block's: a left-aligned h1 is as wide as its container. */
      const extent = (el) => {
        if (el.matches('a, button')) return el.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(el);
        const rr = range.getBoundingClientRect();
        return rr.width ? rr : el.getBoundingClientRect();
      };
      const rs = parts.map(extent);
      const left = Math.min(...rs.map((x) => x.left));
      const right = Math.max(...rs.map((x) => x.right));
      const top = Math.min(...rs.map((x) => x.top));
      const bottom = Math.max(...rs.map((x) => x.bottom));
      const cx = (left + right) / 2 - r.left;
      const gapTop = top - r.top;
      const gapBottom = r.bottom - bottom;
      content = {
        container: H.describe(box),
        rect: { x: Math.round(left - r.left), y: Math.round(top - r.top), width: Math.round(right - left), height: Math.round(bottom - top) },
        maxWidth: getComputedStyle(box).maxWidth,
        textAlign: getComputedStyle(h1).textAlign,
        horizontal: Math.abs(cx - r.width / 2) < r.width * 0.06 ? 'centre' : cx < r.width / 2 ? 'left' : 'right',
        vertical: Math.abs(gapTop - gapBottom) < r.height * 0.12 ? 'middle' : gapTop < gapBottom ? 'top' : 'bottom',
      };
    }
    const sub = h1 ? Array.from(heroEl.querySelectorAll('p')).find((p) => H.shown(p) && H.text(p) && p.getBoundingClientRect().top >= h1.getBoundingClientRect().bottom - 2) : null;
    const indicator = Array.from(heroEl.querySelectorAll('a, button, span, div, i, svg')).find((e) => {
      if (!H.shown(e)) return false;
      const er = e.getBoundingClientRect();
      if (er.width > 140 || er.height > 140 || er.top < r.top + r.height * 0.7) return false;
      const name = `${e.getAttribute('class') ?? ''} ${e.getAttribute('aria-label') ?? ''} ${e.getAttribute('href') ?? ''}`;
      return /scroll|arrow-down|down-arrow|chevron|mouse|next-section/i.test(name) || (e.tagName === 'A' && /^#./.test(e.getAttribute('href') ?? '') && !H.button(e));
    });
    hero = {
      ...s,
      heightPx: Math.round(r.height),
      heightVh: Math.round((r.height / vh) * 1000) / 10,
      minHeightPx: parseFloat(getComputedStyle(heroEl).minHeight) || 0,
      minHeightVh: parseFloat(getComputedStyle(heroEl).minHeight) ? Math.round((parseFloat(getComputedStyle(heroEl).minHeight) / vh) * 1000) / 10 : null,
      underHeader: !!(cut.header && ['fixed', 'absolute'].includes(getComputedStyle(cut.header).position) && r.top < cut.header.getBoundingClientRect().bottom),
      headline: H.type(h1),
      subheading: H.type(sub),
      content,
      scrollIndicator: indicator ? { selector: H.describe(indicator), rect: H.rect(indicator, heroEl), animation: getComputedStyle(indicator).animationName !== 'none' ? `${getComputedStyle(indicator).animationName} ${getComputedStyle(indicator).animationDuration}` : null } : null,
    };
  }

  /* ── Footer ── */
  let footer = null;
  const f = cut.footer;
  if (f) {
    const heads = Array.from(f.querySelectorAll('h1, h2, h3, h4, h5, h6, .widget-title, .widgettitle, [class*="widget-title"], [class*="footer-title"]')).filter((e) => H.shown(e) && H.text(e));
    const fr = f.getBoundingClientRect();
    /* The bottom bar: the last block with a copyright line, or the last short full-width row. */
    const blocks = Array.from(f.querySelectorAll('div, section, p, aside')).filter((e) => H.shown(e) && e.getBoundingClientRect().width >= fr.width * 0.6);
    const bars = blocks.filter((e) => /©|copyright|all rights/i.test(H.text(e, 400)) && e.getBoundingClientRect().height < 160);
    const bar = bars.find((e) => !bars.some((o) => o !== e && o.contains(e))) ?? null;
    const lay = H.layout(f, bar);
    const linksIn = (root) => Array.from(root.querySelectorAll('a')).filter((a) => H.shown(a) && H.text(a));
    const firstLink = linksIn(f).find((a) => !bar || !bar.contains(a));
    const social = Array.from(f.querySelectorAll('a[href]')).map((a) => {
      const href = a.getAttribute('href') ?? '';
      const m = /(facebook|instagram|linkedin|twitter|x\.com|youtube|tiktok|pinterest|yelp|threads|whatsapp|google\.com\/maps|goo\.gl\/maps|g\.page)/i.exec(href);
      return m ? m[1].toLowerCase().replace('x.com', 'x') : null;
    }).filter(Boolean);
    const scriptHost = (src) => {
      try {
        return new URL(src, location.href).host;
      } catch {
        return '';
      }
    };
    footer = {
      selector: H.describe(f),
      height: Math.round(fr.height),
      background: H.background(f),
      color: getComputedStyle(f).color,
      padding: { top: parseFloat(getComputedStyle(f).paddingTop), bottom: parseFloat(getComputedStyle(f).paddingBottom) },
      layout: lay,
      headings: heads.slice(0, 8).map((h) => H.text(h, 40)),
      headingStyle: H.type(heads[0]),
      linkStyle: H.type(firstLink),
      links: linksIn(f).length,
      bottomBar: bar
        ? { height: Math.round(bar.getBoundingClientRect().height), background: H.background(bar).colour, text: H.text(bar, 140), links: linksIn(bar).map((a) => H.text(a, 30)).slice(0, 8), style: H.type(Array.from(bar.querySelectorAll('*')).find((e) => H.ownText(e)) ?? bar) }
        : null,
      widgets: {
        iframes: Array.from(f.querySelectorAll('iframe')).map((x) => ({ host: scriptHost(x.src), kind: /maps|goo\.gl/i.test(x.src) ? 'map' : /youtube|vimeo/i.test(x.src) ? 'video' : 'embed', width: x.offsetWidth, height: x.offsetHeight })).slice(0, 6),
        forms: Array.from(f.querySelectorAll('form')).map((x) => ({ fields: x.querySelectorAll('input:not([type=hidden]), textarea, select').length, action: H.short(x.getAttribute('action') ?? '') })).slice(0, 4),
        social: [...new Set(social)],
        images: Array.from(f.querySelectorAll('img')).filter((x) => H.shown(x)).map((x) => ({ src: H.short(x.currentSrc || x.src), width: x.offsetWidth, height: x.offsetHeight })).slice(0, 8),
        scripts: Array.from(f.querySelectorAll('script[src]')).map((x) => x.src).slice(0, 12),
        inlineScripts: f.querySelectorAll('script:not([src])').length,
      },
    };
  }

  /* Every third-party script on the page: the builder needs to know a widget exists. */
  const thirdParty = Array.from(document.querySelectorAll('script[src]'))
    .map((x) => x.src)
    .filter((src) => {
      try {
        return new URL(src).host !== location.host;
      } catch {
        return false;
      }
    })
    .slice(0, 30);

  return { method: cut.method, viewport: { width: vw, height: vh }, sections, hero, footer, thirdPartyScripts: thirdParty, pageHeight: document.documentElement.scrollHeight };
}

/* ── The header, at one moment ─────────────────────────────────────────── */

export function HEADER_STATE(sel) {
  const H = window.__wbk;
  const header = Array.from(document.querySelectorAll(sel)).find((e) => e.offsetHeight > 0);
  if (!header) return null;
  const cs = getComputedStyle(header);
  const r = header.getBoundingClientRect();
  const visibleImg = (i) => i.getBoundingClientRect().width > 0 && getComputedStyle(i).opacity !== '0' && getComputedStyle(i).visibility !== 'hidden' && H.reallyShown(i);
  const logoLink = header.querySelector('a[href="/"], a[href="./"], a[rel=home], .logo a, a.logo, [class*="logo"] a, a[class*="logo"]') ?? null;
  const logoImgs = Array.from((logoLink ?? header).querySelectorAll('img, svg'));
  const logo = logoImgs.find(visibleImg) ?? Array.from(header.querySelectorAll('img, svg')).find(visibleImg) ?? null;
  const next = header.nextElementSibling;
  /* Paint may sit on a full-width inner bar rather than on <header> itself. */
  const paintEl = H.paint(cs.backgroundColor) ? header : Array.from(header.querySelectorAll('*')).find((e) => H.covers(e, header, 0.9) && H.paint(getComputedStyle(e).backgroundColor)) ?? header;
  const ps = getComputedStyle(paintEl);

  /* The main row: descend through single wrappers; a short first row above a taller one is a top bar. */
  let row = header;
  for (let i = 0; i < 4; i++) {
    const kids = Array.from(row.children).filter((c) => H.shown(c) && getComputedStyle(c).position !== 'fixed');
    if (kids.length === 1) row = kids[0];
    else break;
  }
  let topBar = null;
  const stacked = Array.from(row.children).filter((c) => H.shown(c) && c.getBoundingClientRect().width >= r.width * 0.8);
  if (stacked.length >= 2 && stacked[1].getBoundingClientRect().top >= stacked[0].getBoundingClientRect().bottom - 2) {
    const first = stacked[0];
    const tallest = stacked.slice(1).sort((a, b) => b.offsetHeight - a.offsetHeight)[0];
    if (first.offsetHeight < 60 && first.offsetHeight < tallest.offsetHeight) {
      topBar = { selector: H.describe(first), height: first.offsetHeight, background: getComputedStyle(first).backgroundColor, text: H.text(first, 120), links: first.querySelectorAll('a').length, style: H.type(Array.from(first.querySelectorAll('*')).find((e) => H.ownText(e)) ?? first) };
      row = tallest;
      for (let i = 0; i < 3; i++) {
        const kids = Array.from(row.children).filter((c) => H.shown(c));
        if (kids.length === 1) row = kids[0];
        else break;
      }
    }
  }
  if (!topBar) {
    const before = header.previousElementSibling;
    if (before && H.shown(before) && before.offsetHeight < 60 && before.getBoundingClientRect().bottom <= r.top + 2 && /top|utility|announce|secondary/i.test(before.getAttribute('class') ?? before.id)) {
      topBar = { selector: H.describe(before), height: before.offsetHeight, background: getComputedStyle(before).backgroundColor, text: H.text(before, 120), links: before.querySelectorAll('a').length, style: null };
    }
  }
  const kindOf = (el) => {
    if (logo && (el === logo || el.contains(logo)) || el === logoLink || el.contains?.(logoLink)) return 'logo';
    const label = `${el.getAttribute('class') ?? ''} ${el.getAttribute('aria-label') ?? ''}`;
    if (/burger|menu-toggle|nav-toggle|mobile-toggle|slide-out-widget-area-toggle/i.test(label) || el.matches('button[aria-expanded], [aria-controls][aria-expanded]')) return 'toggle';
    if (el.querySelectorAll('a').length >= 3 || el.matches('nav') || el.querySelector('nav')) return 'nav';
    if (/search/i.test(label) || el.querySelector('input[type=search]')) return 'search';
    if (el.matches('a, button') && H.button(el)) return 'cta';
    const btn = Array.from(el.querySelectorAll('a, button')).find((b) => H.shown(b) && H.button(b));
    if (btn && el.querySelectorAll('a').length <= 2) return 'cta';
    if (/social|facebook|instagram/i.test(el.innerHTML.slice(0, 2000))) return 'social';
    return 'other';
  };
  const elements = Array.from(row.children)
    .filter((c) => H.shown(c) && getComputedStyle(c).position !== 'fixed')
    .slice(0, 10)
    .map((c) => {
      const cr = c.getBoundingClientRect();
      const mid = (cr.left + cr.right) / 2 - r.left;
      return { kind: kindOf(c), selector: H.describe(c), x: Math.round(cr.left - r.left), width: Math.round(cr.width), group: mid < r.width / 3 ? 'left' : mid > (r.width * 2) / 3 ? 'right' : 'centre' };
    });
  return {
    top: Math.round(r.top),
    bottom: Math.round(r.bottom),
    height: Math.round(r.height),
    position: cs.position,
    background: ps.backgroundColor,
    paintedOn: paintEl === header ? 'header' : H.describe(paintEl),
    backgroundImage: ps.backgroundImage !== 'none' ? ps.backgroundImage.slice(0, 160) : null,
    backdrop: (ps.backdropFilter && ps.backdropFilter !== 'none' ? ps.backdropFilter : null) ?? (cs.backdropFilter && cs.backdropFilter !== 'none' ? cs.backdropFilter : null),
    borderBottom: parseFloat(ps.borderBottomWidth) > 0 ? `${ps.borderBottomWidth} ${ps.borderBottomStyle} ${ps.borderBottomColor}` : null,
    boxShadow: ps.boxShadow !== 'none' ? ps.boxShadow : cs.boxShadow,
    transform: cs.transform,
    transition: H.transition(cs) ?? H.transition(ps),
    color: getComputedStyle(header.querySelector('nav a, a') ?? header).color,
    logoHeight: logo ? Math.round(logo.getBoundingClientRect().height) : null,
    logo: logo
      ? { kind: logo.tagName.toLowerCase() === 'svg' ? 'svg' : 'img', src: logo.tagName === 'IMG' ? H.short(logo.currentSrc || logo.src) : null, width: Math.round(logo.getBoundingClientRect().width), height: Math.round(logo.getBoundingClientRect().height), alt: logo.getAttribute('alt') ?? null }
      : logoLink && H.text(logoLink)
        ? { kind: 'text', text: H.text(logoLink, 40), style: H.type(logoLink) }
        : null,
    elements,
    order: elements.map((e) => e.kind).join(' · '),
    ctas: H.buttonsIn(header, 3),
    topBar,
    contentStartsUnder: next ? Math.round(next.getBoundingClientRect().top + scrollY) < Math.round(r.height) - 4 : false,
  };
}

/* ── Desktop navigation: every parent item, hovered ────────────────────── */

/** Mark the top-level items that have a submenu; return the tree. */
export function NAV_TREE(sel) {
  const H = window.__wbk;
  const header = Array.from(document.querySelectorAll(sel)).find((e) => e.offsetHeight > 0);
  const scope = header?.querySelector('nav') ?? document.querySelector('nav') ?? header;
  if (!scope) return null;
  const SUB = ':scope > ul, :scope > .sub-menu, :scope > [class*="dropdown"], :scope > [class*="mega"], :scope > [class*="submenu"], :scope > .e-n-menu-content, :scope > div';
  const subOf = (li) => Array.from(li.querySelectorAll(SUB)).find((s) => s.querySelector('a')) ?? null;
  /* The top level: the list items of the first list that is not inside a list item. */
  const lists = Array.from(scope.querySelectorAll('ul, ol')).filter((u) => !u.parentElement.closest('li') && u.offsetWidth > 0);
  const topList = lists.sort((a, b) => b.querySelectorAll(':scope > li').length - a.querySelectorAll(':scope > li').length)[0];
  if (!topList) return null;
  const tree = (li, depth) => {
    const a = li.querySelector(':scope > a, :scope > * > a');
    const sub = subOf(li);
    const kids = sub ? Array.from(sub.querySelectorAll('li')).filter((k) => k.parentElement.closest('li') === li) : [];
    return { text: H.text(a, 60), href: a?.getAttribute('href') ?? '', depth, children: depth < 3 ? kids.slice(0, 40).map((k) => tree(k, depth + 1)) : [] };
  };
  const items = Array.from(topList.querySelectorAll(':scope > li')).filter((li) => H.shown(li));
  const parents = [];
  items.forEach((li, i) => {
    li.setAttribute('data-wbk-nav-li', String(i));
    const a = li.querySelector(':scope > a, :scope > * > a');
    a?.setAttribute('data-wbk-nav', String(i));
    const sub = subOf(li);
    if (sub && a) {
      sub.setAttribute('data-wbk-nav-sub', String(i));
      parents.push({ index: i, text: H.text(a, 60), hasToggle: !!li.querySelector(':scope > button, :scope > [aria-expanded]:not(a)'), href: a.getAttribute('href') ?? '' });
    }
  });
  return { tree: items.map((li) => tree(li, 0)), parents, scope: H.describe(scope) };
}

/** Is item i's panel open, and if so, everything about it. */
export function NAV_PANEL({ index, sel }) {
  const H = window.__wbk;
  const header = Array.from(document.querySelectorAll(sel)).find((e) => e.offsetHeight > 0);
  const sub = document.querySelector(`[data-wbk-nav-sub="${index}"]`);
  const li = document.querySelector(`[data-wbk-nav-li="${index}"]`);
  if (!sub || !li) return { open: false };
  /* A wrapper may be zero-sized while its painted child is the panel. */
  const visibleBox = [sub, ...Array.from(sub.children)].find((e) => H.reallyShown(e) && e.querySelector?.('a, img') !== null) ?? null;
  const open = !!visibleBox && Array.from(sub.querySelectorAll('a')).some((a) => H.reallyShown(a));
  if (!open) return { open: false };
  const painted = [sub, ...Array.from(sub.querySelectorAll('*')).slice(0, 200)].find((e) => {
    const s = getComputedStyle(e);
    return (H.paint(s.backgroundColor) || s.boxShadow !== 'none') && H.covers(e, sub, 0.7) && H.shown(e);
  }) ?? sub;
  const ps = getComputedStyle(painted);
  const base = header ?? document.body;
  const pr = painted.getBoundingClientRect();
  const vw = innerWidth;
  const lay = H.layout(painted);
  const links = Array.from(sub.querySelectorAll('a')).filter((a) => H.reallyShown(a) && H.text(a));
  const headingEls = Array.from(sub.querySelectorAll('h1, h2, h3, h4, h5, h6, [class*="title"], [class*="heading"], .mega-menu-column-title')).filter((e) => H.shown(e) && H.text(e));
  /* In a mega menu the column's first link, if it has children of its own, acts as its heading. */
  const columnHeads = lay.columns >= 2 ? Array.from(sub.querySelectorAll(':scope > li > a, :scope > * > li > a')).filter((a) => a.parentElement.querySelector('ul')) : [];
  const type = lay.columns >= 2 || pr.width >= vw * 0.5 ? (pr.width >= vw * 0.9 ? 'full-width' : 'mega') : 'dropdown';
  const depthOf = (a) => {
    let d = 0;
    for (let p = a.parentElement; p && p !== sub; p = p.parentElement) if (p.tagName === 'UL' || p.tagName === 'OL') d++;
    return d;
  };
  return {
    open: true,
    type,
    selector: H.describe(sub),
    paintedOn: painted === sub ? 'panel' : H.describe(painted),
    geometry: H.rect(painted, base),
    relativeTo: header ? 'header' : 'page',
    fromItem: { x: Math.round(pr.left - li.getBoundingClientRect().left) },
    background: ps.backgroundColor,
    backgroundImage: ps.backgroundImage !== 'none' ? ps.backgroundImage.slice(0, 160) : null,
    shadow: ps.boxShadow,
    radius: ps.borderRadius,
    border: parseFloat(ps.borderTopWidth) > 0 ? `${ps.borderTopWidth} ${ps.borderTopStyle} ${ps.borderTopColor}` : null,
    padding: `${ps.paddingTop} ${ps.paddingRight} ${ps.paddingBottom} ${ps.paddingLeft}`,
    zIndex: getComputedStyle(sub).zIndex,
    columns: lay.columns,
    columnWidths: lay.widths ?? [Math.round(pr.width)],
    columnGap: lay.gap ?? 0,
    itemStyle: H.type(links.find((a) => !columnHeads.includes(a)) ?? links[0]),
    itemPadding: links[0] ? `${getComputedStyle(links[0]).paddingTop} ${getComputedStyle(links[0]).paddingRight} ${getComputedStyle(links[0]).paddingBottom} ${getComputedStyle(links[0]).paddingLeft}` : null,
    headings: [...headingEls, ...columnHeads].slice(0, 8).map((h) => H.text(h, 40)),
    headingStyle: H.type(headingEls[0] ?? columnHeads[0]),
    images: Array.from(sub.querySelectorAll('img')).filter((x) => H.reallyShown(x)).map((x) => ({ src: H.short(x.currentSrc || x.src), width: Math.round(x.getBoundingClientRect().width), height: Math.round(x.getBoundingClientRect().height) })).slice(0, 6),
    icons: Array.from(sub.querySelectorAll('svg, i[class*="icon"], i[class*="fa-"], [class*="icon"]:not(a)')).filter((x) => H.shown(x)).length,
    items: links.slice(0, 60).map((a) => ({ text: H.text(a, 60), href: a.getAttribute('href') ?? '', depth: Math.max(0, depthOf(a) - 1) })),
    transition: (() => {
      const s = getComputedStyle(sub);
      return H.transition(s);
    })(),
    unionWithHeader: (() => {
      const hr = (header ?? sub).getBoundingClientRect();
      return { x: Math.max(0, Math.floor(Math.min(hr.left, pr.left))), y: Math.max(0, Math.floor(Math.min(hr.top, pr.top))), right: Math.ceil(Math.max(hr.right, pr.right)), bottom: Math.ceil(Math.max(hr.bottom, pr.bottom)) };
    })(),
  };
}

/** Inside an open panel, mark the first item with a further level, for the flyout probe. */
export function NAV_NESTED(index) {
  const H = window.__wbk;
  const sub = document.querySelector(`[data-wbk-nav-sub="${index}"]`);
  if (!sub) return null;
  const li = Array.from(sub.querySelectorAll('li')).find((x) => {
    const s = x.querySelector(':scope > ul, :scope > .sub-menu, :scope > div');
    return s && s.querySelector('a') && H.shown(x);
  });
  if (!li) return null;
  const s = li.querySelector(':scope > ul, :scope > .sub-menu, :scope > div');
  const shownAlready = H.reallyShown(s) && Array.from(s.querySelectorAll('a')).some((a) => H.reallyShown(a));
  li.querySelector('a')?.setAttribute('data-wbk-nested', '1');
  s.setAttribute('data-wbk-nested-sub', '1');
  return { text: H.text(li.querySelector('a'), 40), alwaysShown: shownAlready };
}

export function NAV_NESTED_DIR() {
  const H = window.__wbk;
  const s = document.querySelector('[data-wbk-nested-sub]');
  const a = document.querySelector('[data-wbk-nested]');
  if (!s || !a) return null;
  if (!(H.reallyShown(s) && Array.from(s.querySelectorAll('a')).some((x) => H.reallyShown(x)))) return { opens: false };
  const li = a.closest('li');
  const lr = li.getBoundingClientRect();
  const sr = s.getBoundingClientRect();
  const dir = sr.left >= lr.right - 4 ? 'right' : sr.right <= lr.left + 4 ? 'left' : sr.top >= lr.bottom - 4 ? 'below (inline)' : 'overlapping';
  return { opens: true, direction: dir, offset: { x: Math.round(sr.left - lr.left), y: Math.round(sr.top - lr.top) }, width: Math.round(sr.width) };
}

/* ── Mobile: how a submenu opens inside the open menu panel ────────────── */

/** Find, inside the open panel, the first parent item whose submenu is closed, and mark its toggle. */
export function SUBMENU_FIND() {
  const H = window.__wbk;
  const panel = document.querySelector('[data-wbk-panel]');
  if (!panel) return { found: false, reason: 'no open panel' };
  const parents = Array.from(panel.querySelectorAll('li')).filter((li) => li.querySelector(':scope > ul, :scope > .sub-menu, :scope > div, :scope > [class*="mega"]'));
  if (!parents.length) return { found: false, behaviour: 'no submenus' };
  const subOf = (li) => li.querySelector(':scope > ul, :scope > .sub-menu, :scope > [class*="mega"], :scope > div');
  const closed = parents.find((li) => {
    const s = subOf(li);
    return H.shown(li) && !(H.reallyShown(s) && Array.from(s.querySelectorAll('a')).some((a) => H.reallyShown(a)));
  });
  if (!closed) return { found: false, behaviour: 'always-expanded' };
  const link = closed.querySelector(':scope > a, :scope > * > a');
  const toggle =
    Array.from(closed.querySelectorAll(':scope > button, :scope > [aria-expanded], :scope > span, :scope > i, :scope > a + *, :scope > * > button'))
      .find((t) => t !== link && H.shown(t) && (t.matches('button, [aria-expanded], [role=button]') || /toggle|arrow|caret|expand|dropdown|sub-arrow|ocm-dropdown|chevron|plus/i.test(t.getAttribute('class') ?? '')))
    ?? (['#', '', 'javascript:void(0)', 'javascript:;'].includes(link?.getAttribute('href') ?? '') ? link : null);
  if (!toggle) return { found: false, behaviour: 'unknown', reason: 'no separate toggle, and tapping the link would navigate' };
  toggle.setAttribute('data-wbk-subtoggle', '1');
  closed.setAttribute('data-wbk-subparent', '1');
  return { found: true, item: H.text(link, 40), toggle: H.describe(toggle), toggleIsButton: toggle.matches('button, [role=button]'), ariaExpanded: toggle.getAttribute('aria-expanded'), panelTop: Math.round(panel.getBoundingClientRect().top), linkRect: link ? H.rect(link) : null };
}

export function SUBMENU_READ(before) {
  const H = window.__wbk;
  const panel = document.querySelector('[data-wbk-panel]');
  const li = document.querySelector('[data-wbk-subparent]');
  const toggle = document.querySelector('[data-wbk-subtoggle]');
  if (!panel || !li) return { behaviour: 'unknown' };
  const sub = li.querySelector(':scope > ul, :scope > .sub-menu, :scope > [class*="mega"], :scope > div');
  const subOpen = sub && H.reallyShown(sub) && Array.from(sub.querySelectorAll('a')).some((a) => H.reallyShown(a));
  const link = li.querySelector(':scope > a, :scope > * > a');
  const pr = panel.getBoundingClientRect();
  const linkStill = link && H.reallyShown(link) && link.getBoundingClientRect().right > pr.left && link.getBoundingClientRect().left < pr.right;
  const back = Array.from(panel.querySelectorAll('a, button, span, li')).find((e) => H.shown(e) && /^(back|‹|←|<)/i.test(H.text(e, 20)) || /\bback\b/i.test(e.getAttribute('class') ?? ''));
  let behaviour = 'unknown';
  if (subOpen) {
    const sr = sub.getBoundingClientRect();
    if (linkStill && sr.top >= link.getBoundingClientRect().bottom - 4) behaviour = 'accordion';
    else if (!linkStill || back || sr.top <= (before?.panelTop ?? pr.top) + 140) behaviour = 'drill-down';
  }
  return {
    behaviour,
    opened: !!subOpen,
    ariaExpandedAfter: toggle?.getAttribute('aria-expanded') ?? null,
    backButton: back ? H.text(back, 20) : null,
    indent: subOpen && link ? Math.round(sub.querySelector('a').getBoundingClientRect().left - link.getBoundingClientRect().left) : null,
    subItemStyle: subOpen ? H.type(Array.from(sub.querySelectorAll('a')).find((a) => H.reallyShown(a))) : null,
    animations: H.anims(li.closest('[data-wbk-panel]')),
  };
}
