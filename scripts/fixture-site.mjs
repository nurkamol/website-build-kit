/**
 * A deliberately faulty website, served on localhost, so the scripts that
 * "need a deployed site" can be tested without one.
 *
 *   node scripts/fixture-site.mjs --port 8123
 *   node scripts/fixture-site.mjs --port 8123 --faults dup-title,canonical-elsewhere
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * `verify.mjs` is 1,069 lines deciding go-live across eleven sections, with
 * three `exit(1)` paths and, until this file, not one case proving any of them
 * still refuses. It was excused as "needs a deployed site" — but it needs a
 * URL, which is not the same thing, and the excuse was inherited rather than
 * re-examined.
 *
 * ⚠ THE COST OF NOT HAVING THIS IS ALREADY PAID. 0.1.11 shipped a redirect cap
 *   of 5 where fetch allows 20, so a live page behind a longer chain came back
 *   as 302 rather than 200 and a migration inventory recorded a page as a
 *   redirect. Every gate was green. It was found by reading a diff, and
 *   confirmed in minutes by a throwaway server exactly like this one. Keeping
 *   the server is the difference between finding that twice and finding it
 *   once.
 *
 * ── HOW IT IS USED ─────────────────────────────────────────────────────────
 * `test-gates.mjs` spawns it as a SEPARATE PROCESS. It cannot be an in-process
 * server: the harness drives scripts with `spawnSync`, which blocks the event
 * loop, so a listener in the same process would never accept the connection.
 *
 * Every fault is opt-in by name, and the default site is meant to pass the
 * check each fault breaks. A case that only ever sees a broken site cannot
 * tell "this check works" from "this check always fires".
 */

import { createServer } from 'node:http';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};

const PORT = Number(arg('port', 8123));
/* Echoed by /__ready, so the harness knows it reached THIS process and not
   another fixture already on the port — see startFixture in test-gates. */
const TOKEN = arg('token', 'ready');
const FAULTS = new Set((arg('faults', '') || '').split(',').filter(Boolean));

const KNOWN_FAULTS = [
  'dup-title', // two pages sharing a title
  'canonical-elsewhere', // a canonical pointing at another host
  'two-h1', // a second <h1> on a page
  'route-404', // a route in src/pages that the site does not serve
  'no-sitemap-in-robots', // robots.txt naming no sitemap
  'preserved-to-home', // an old URL that 301s to / instead of its equivalent
  'spam-converts', // the honeypot redirect carrying ?sent=, inflating conversions
  'accepts-empty', // an empty submission accepted instead of 422
  'allows-cross-origin', // a submission from another origin accepted instead of 403
  'coerces-malformed', // a non-string field coerced into a lead instead of refused
  'turnstile-widget', // /about/ carries a Cloudflare Turnstile widget (markup only — no script is loaded)
  'turnstile-enforced', // the endpoint refuses a submission without a Turnstile token, 403, BEFORE field validation
  'lastmod-same', // every sitemap URL carries the same lastmod — a build stamp, no signal
  'lastmod-partial', // the first two sitemap URLs share a lastmod and the rest carry none (pair with orphan-route for a third)
  'redirect-blocked', // a page that 302s somewhere recon must refuse to follow
  'vendor-words', // vendor NAMES as ordinary words and a WordPress style preset — no vendor loaded
  'vendor-real', // a vendor actually loaded: Crisp chat's script
  'platform-wp', // a WordPress + Elementor site with Yoast, Contact Form 7 and one plugin the kit does not know, as rendered

  /* ── Faults only a browser can see ───────────────────────────────────────
   * Everything above is visible to `fetch`. These five are not: the response
   * is 200, the HTML is correct, and the failure happens after it arrives —
   * which is the whole reason check-console, check-reflow and check-a11y
   * drive Chrome instead of reading markup. */
  'console-error', // a script that throws once the page is parsed
  'asset-404', // a referenced asset the server does not have
  'overflow-320', // a fixed-width element wider than a 320px viewport
  'dark-only-contrast', // AA contrast that passes in light and fails in dark
  'no-stylesheet', // a page that arrives with no CSS at all
  'orphan-route', // a page in the sitemap that no other page links to
  /* A stale page cache: the page names a minified stylesheet the server has
     already deleted, answered with an HTML 404 page. The page still renders —
     only worse — which is why it reads as the old site's design. */
  'own-css-404',
  /* What that does to a page builder's full-height rows: a page 120,000px tall.
     A full-page capture of it is what took Chrome down. */
  'runaway-height',

  /* ── An old site that keeps changing, for `changes` ──────────────────────
   * `wp-api` serves WordPress's public REST API — types, pages, posts and the
   * media library — and puts a <nav> on every page. `wp-edited` is the SAME
   * site a few weeks later: one page edited, one post moved to a new address,
   * one post deleted, one page added, one image added and one replaced, and a
   * menu link added. `changes` run against the first and then the second must
   * name every one of them, and nothing else. */
  'wp-api',
  'wp-edited',
  /* The new site after launch, with its 404 watcher holding counts: an old
     URL the redirect map missed, a broken internal link, a rule already in
     _redirects that does not match, and the bot probes and personal-looking
     paths that must never be listed. GET /api/missed/ with the token below. */
  'misses',

  /* ── Faults only a comparison can see ────────────────────────────────────
   * `match` reads two sites, so these run as the NEW side against a clean
   * fixture as the OLD side. Each page is still a valid page on its own; the
   * fault is only visible against what it replaced. */
  'section-drift', // the second section changes colour and grows taller
  'drop-paragraph', // a paragraph of the second section is gone
  'rename-heading', // the third section's heading is reworded
  'sr-copy', // the third section's sentence carried in a visually hidden copy, the visible one aria-hidden
  'sr-ui-label', // a WordPress-style screen-reader label inside the content — UI, not copy
  'renderer-hang', // the home page locks its main thread after load, so the browser stops answering
  'insert-section', // a new section added before the second one
  'flat-text', // no sections at all: one wrapper of headings and paragraphs
  'filename-alt', // an image whose alt text the CMS wrote from its filename
  /* Not faults: MOTION, for match's freeze. A section that moves the way
     builder sites move — a CSS marquee, a parallax layer whose inline
     transform a script rewrites, an AOS-style element hidden until a script
     reveals it, and an endless element.animate(). `motion-phase` is the SAME
     page caught at a different moment: the marquee and the animation further
     along, the layer elsewhere, the reveal not yet fired. Two captures of it
     must still measure ~0%, or the freeze is not doing its job. */
  'motion',
  'motion-phase',
  /* With `motion`, on the NEW side: the tall parallax layer (taller than the
     band that clips it, like a Salient `.row-bg`) rebuilt another way.
     `parallax-split` centres it in CSS and transforms only the offset — the
     same picture at every scroll position, a different transform at rest.
     `parallax-misplaced` really is 60px off wherever the band is. */
  'parallax-split',
  'parallax-misplaced',
  'no-menu', // with `branded`: no menu toggle and no submenu — the rebuild lost both interactions
  'mega-changed', // with `branded`: the mega-menu panel lost its Featured column — only an OPENED panel shows it
  /* ── Not a fault: a site WITH a design, for `npm run design` ─────────────
   * The default fixture is deliberately unstyled, which gives a design capture
   * nothing to find — and a capture that finds nothing on a site with nothing
   * passes for the wrong reason. This one has known faces, a known palette,
   * known sizes at known breakpoints, a menu toggle with an off-canvas panel
   * (one submenu shown, one an accordion), a desktop nav with a dropdown, a
   * third-level flyout and a three-column mega menu, a transparent fixed
   * header that turns solid, shrinks and swaps its logo on scroll, a hero
   * with an overlay and rotating words, section padding that steps at 768
   * and 1200, a parallax layer, AOS-style reveals, a timed carousel with
   * arrows and dots, a marquee at a known speed, and a three-column footer
   * with a third-party script — so the cases can assert each one by value. */
  'branded',
];
for (const f of FAULTS) {
  if (!KNOWN_FAULTS.includes(f)) {
    console.error(`fixture-site: unknown fault ${JSON.stringify(f)}\n  known: ${KNOWN_FAULTS.join(', ')}`);
    process.exit(1);
  }
}

const BASE = `http://127.0.0.1:${PORT}`;

/** A 1x1 PNG, served as both the page's image and its favicon. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/*
 * ── THE STYLESHEET IS LOAD-BEARING, AND IT IS THE SMALLEST ONE POSSIBLE ────
 *
 * ⚠ The clean fixture has to PASS check-reflow, and an `<img width="800">`
 *   with no CSS at all renders 800px wide — so the default site failed the
 *   320px case before this existed, and every reflow assertion would have been
 *   "the fixture is broken" wearing the costume of "the gate works".
 *
 * Three rules, no layout: images shrink, the body has a margin, and the body
 * declares a background. Nothing here caps a width — a `max-width` in rem plus
 * content-box padding overflows at 200% text, which is the OTHER case
 * check-reflow measures, and it would have failed the clean run in exactly the
 * same invisible way.
 *
 * ⚠ The background is not decoration either. `shots` refuses to file a capture
 *   whose body computes to `rgba(0, 0, 0, 0)`, because an unstyled screenshot
 *   filed as evidence turns a harness problem into a design problem — and a
 *   body with no background rule computes to exactly that. The `no-stylesheet`
 *   fault removes the whole element to exercise that refusal.
 *
 * The greys below are greyscale `rgb()` on purpose, not a brand hex. See the
 * provenance sweep in CLAUDE.md: this file is inside the kit's own `scripts/`,
 * and a `#rrggbb` here reads as a client colour to the grep that looks for one.
 */
const STYLE = `
img { max-width: 100%; height: auto; }
body { margin: 1rem; background: rgb(255, 255, 255); color: rgb(24, 24, 24); }
.ok { color: rgb(60, 60, 60); }
${
  FAULTS.has('dark-only-contrast')
    ? /* 3.41:1 on the dark background it sets, measured by htmlcs — an AA
         failure for normal text, in one scheme
         only, which is the shape of the bug the kit's own landing page
         shipped: 4.83:1 in dark, 3.91:1 in light, green locally and red in
         CI. It is invisible to a run that does not FORCE the scheme. */
      `@media (prefers-color-scheme: dark) {
  body { background: rgb(18, 18, 18); color: rgb(240, 240, 240); }
  a { color: rgb(150, 190, 255); }
  .ok { color: rgb(105, 105, 105); }
}`
    : ''
}${
  FAULTS.has('motion')
    ? `
.marquee { overflow: hidden; white-space: nowrap; font-size: 40px; background: rgb(40, 40, 40); color: rgb(255, 255, 255); }
.marquee-track { display: inline-block; animation: marquee-slide 6s linear infinite; }
@keyframes marquee-slide { from { transform: translateX(0); } to { transform: translateX(-50%); } }
.parallax-band { position: relative; height: 220px; overflow: hidden; background: rgb(220, 220, 220); }
.parallax-layer { position: absolute; left: 0; top: 0; width: 70%; height: 140px; background: rgb(60, 60, 60); color: rgb(255, 255, 255); font-size: 32px; }
[data-aos] { opacity: 0; transform: translateY(60px); transition: opacity 600ms ease, transform 600ms ease;
  height: 120px; background: rgb(90, 90, 90); color: rgb(255, 255, 255); font-size: 32px; }
[data-aos].aos-animate { opacity: 1; transform: none; }
.pulse { width: 120px; height: 80px; background: rgb(30, 30, 30); }
/* Salient's scrolling text: centred by a transform, faded in by an opacity-only transition. The
   transform is layout, not the reveal — a freeze that clears it moves the text by half its height. */
.fade-band { position: relative; height: 200px; background: rgb(70, 70, 70); }
.fade-centre { position: absolute; left: 0; top: 50%; transform: translateY(-50%); opacity: 0; transition: opacity 600ms;
  font-size: 60px; line-height: 1; color: rgb(255, 255, 255); }
.fade-centre.in { opacity: 1; }
/* A parallax layer taller than the band that clips it, striped so any shift shows. */
.tall-band { position: relative; height: 300px; overflow: hidden; }
.tall-layer { position: absolute; left: 0; right: 0; top: ${FAULTS.has('parallax-split') ? -90 : 0}px; height: 480px;
  background: repeating-linear-gradient(rgb(40, 40, 40) 0 60px, rgb(200, 200, 200) 60px 120px); }`
    : ''
}`;

/* `motion`: the section that moves, and the scripts that move it. Under
   `motion-phase` every one of them starts somewhere else. */
const PHASE = FAULTS.has('motion-phase');
const MOTION_SECTION = `<section>
<h2>Moving parts</h2>
<div class="marquee"><span class="marquee-track" style="animation-delay: ${PHASE ? '-3.7s' : '0s'}">Words along a moving line · Words along a moving line · Words along a moving line · </span></div>
<div class="parallax-band"><div class="parallax-layer" data-parallax="0.4" style="transform: translate3d(0px, ${PHASE ? 70 : 0}px, 0px)">A drifting layer</div></div>
<div data-aos="fade-up">Revealed on scroll</div>
<div class="pulse"></div>
<div class="fade-band"><div class="fade-centre">Centred and faded in</div></div>
<div class="tall-band"><div class="tall-layer" data-parallax="0.6"></div></div>
</section>`;
const MOTION_SCRIPT = `<script>
(() => {
  const offset = ${PHASE ? 40 : 0};
  const layer = document.querySelector('.parallax-layer');
  const move = () => { layer.style.transform = 'translate3d(0px, ' + ((scrollY * 0.4 + offset + Date.now() / 20) % 80).toFixed(1) + 'px, 0px)'; };
  addEventListener('scroll', move, { passive: true });
  setInterval(move, 50);
  /* The tall layer slides 180px as its band crosses the viewport: -90px, its centre, when the
     band is centred. The old side does it all in the transform; parallax-split moves 90px of it
     into CSS, so its transform differs at every scroll position and the picture at none. */
  const tall = document.querySelector('.tall-layer');
  const place = () => {
    const r = tall.parentElement.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (innerHeight - r.top) / (innerHeight + r.height)));
    tall.style.transform = 'translate3d(0px, ' + (-180 * p + ${FAULTS.has('parallax-split') ? 90 : 0} + ${FAULTS.has('parallax-misplaced') ? 60 : 0}).toFixed(1) + 'px, 0px)';
  };
  addEventListener('scroll', place, { passive: true });
  place();
  ${PHASE ? '/* the reveals have not fired yet */' : "document.querySelector('[data-aos]').classList.add('aos-animate'); document.querySelector('.fade-centre').classList.add('in');"}
  const a = document.querySelector('.pulse').animate([{ transform: 'translateX(0)' }, { transform: 'translateX(240px)' }], { duration: 2000, iterations: Infinity });
  a.currentTime = ${PHASE ? 1300 : 0};
})();
</script>`;

/**
 * A page that passes every per-page check verify makes, unless a fault says otherwise.
 *
 * Three <section>s inside <main>, so `match` has sections to pair. They carry no
 * colour of their own unless a fault gives them one: every other gate's clean
 * run reads this same page, and a styled band would be a contrast case nobody
 * asked for.
 */
/* `flat-text`: the same content with no sections — one wrapper of headings and
   paragraphs, the shape of a builder's legal page. */
const content = (html) =>
  FAULTS.has('flat-text') ? `<div class="entry">${html.replace(/<\/?section[^>]*>/g, '')}</div>` : html;

function page({ path, title, description, h1 = 'Heading', canonical = `${BASE}${path}` }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${canonical}">
${FAULTS.has('no-stylesheet') ? '' : `<style>${STYLE}</style>`}
${FAULTS.has('own-css-404') ? '<link rel="stylesheet" href="/wp-content/cache/min/1/site.min.css?ver=3">' : ''}
${FAULTS.has('vendor-words') ? '<style id="global-styles-inline-css">:root{--wp--preset--shadow--crisp: 6px 6px 0 #000;}</style>' : ''}
${FAULTS.has('vendor-real') ? '<script src="https://client.crisp.chat/l.js" async></script>' : ''}
${FAULTS.has('platform-wp') ? '<meta name="generator" content="WordPress 6.6.2"><!-- This site is optimized with the Yoast SEO plugin v23.1 -->' : ''}
</head>
<body>
${FAULTS.has('wp-api') ? `<nav><a href="/">Home</a> <a href="/about/">About us</a>${FAULTS.has('wp-edited') ? ' <a href="/pricing/">Pricing</a>' : ''}</nav>` : ''}
<main>
${content(`<section>
<h1>${h1}</h1>
${FAULTS.has('two-h1') && path === '/about/' ? '<h1>A second heading</h1>' : ''}
<p class="ok">Body copy long enough to be substantial, so the page is not treated as empty
by anything measuring content length. It links onward to <a href="/about/">about</a>
and back to <a href="/">home</a>.</p>
<img src="/hero.png" width="800" height="600" alt="A hero image">
${FAULTS.has('vendor-words') ? '<p>We drift downriver, stripe the lawn and value clarity over noise.</p>' : ''}
${FAULTS.has('platform-wp') ? '<div class="elementor-element elementor-widget-text-editor"><p>Built with a page builder.</p></div><div class="wpcf7 js"><p>A contact form.</p></div><img src="/wp-content/plugins/acme-booking-widget/badge.png" width="1" height="1" alt="">' : ''}
${FAULTS.has('asset-404') ? '<img src="/gone.png" width="80" height="60" alt="An asset the server does not have">' : ''}
${FAULTS.has('overflow-320') ? '<div style="width: 480px">Wider than a 320px viewport.</div>' : ''}
${FAULTS.has('turnstile-widget') && path === '/about/' ? '<form method="post" action="/api/contact/"><div class="cf-turnstile" data-sitekey="1x00000000000000000000AA"></div></form>' : ''}
${FAULTS.has('runaway-height') ? '<div style="height: 120000px">A full-height row with nothing left to bound it.</div>' : ''}
</section>
${FAULTS.has('insert-section') ? '<section><h2>A section the rebuild added</h2><p>Opening hours are posted by the door.</p></section>' : ''}
<section${FAULTS.has('section-drift') ? ' style="background: rgb(200, 200, 200); padding: 6rem 0"' : ''}>
<h2>Second section</h2>
<p>The quarterly ledger reconciles itself overnight, and nobody has to stay late for it.</p>
${FAULTS.has('drop-paragraph') ? '' : '<p>Our couriers deliver parcels before breakfast on weekdays.</p>'}
</section>
<section>
<h2>${FAULTS.has('rename-heading') ? 'A renamed section' : 'Third section'}</h2>
${
  FAULTS.has('sr-copy')
    ? /* The accessible shape of a decorative marquee: the words once for
         assistive tech, the moving copy hidden from it. Real copy, not chrome. */
      '<p class="visually-hidden">Questions go to the front desk, which answers them in the order they arrive.</p>' +
      '<p aria-hidden="true" data-t="Questions go to the front desk"></p>'
    : '<p>Questions go to the front desk, which answers them in the order they arrive.</p>'
}
${FAULTS.has('filename-alt') ? '<img src="/hero.png" width="80" height="60" alt="IMG 20231028 133434">' : ''}
${FAULTS.has('sr-ui-label') ? '<label><span class="screen-reader-text">Search for:</span><input type="search" name="s"></label>' : ''}
</section>
${FAULTS.has('motion') ? MOTION_SECTION : ''}`)}
</main>
${FAULTS.has('motion') ? MOTION_SCRIPT : ''}
${FAULTS.has('console-error') ? '<script>notAFunctionAnywhere();</script>' : ''}
${
  FAULTS.has('renderer-hang') && path === '/'
    ? /* After load, so the response and network idle both look healthy — the
         browser only stops answering once something asks it to do work. */
      "<script>addEventListener('load', () => setTimeout(() => { for (;;) {} }, 50));</script>"
    : ''
}
</body>
</html>`;
}

/*
 * ── THE BRANDED SITE ────────────────────────────────────────────────────────
 * Every value here is synthetic and asserted on by name in test-gates.mjs:
 * the two faces, ground rgb(250, 248, 244), ink rgb(34, 34, 34), brand
 * rgb(20, 90, 140), accent rgb(200, 80, 40), h1 40px → 64px at 1024px, a
 * 1200px container with 24px padding (1152px of content), 12px photo corners
 * and an 80px header. The faces are never loaded — computed font-family is
 * what the capture reads, and a font request would make the case depend on a
 * file this server does not have.
 *
 * Channels, not hex, for the same provenance-sweep reason as STYLE above.
 */
const BRANDED_STYLE = `
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; background: rgb(250, 248, 244); color: rgb(34, 34, 34);
  font-family: "Fixture Sans", Arial, sans-serif; font-size: 18px; line-height: 1.6; }
h1, h2, h3 { font-family: "Fixture Display", Georgia, serif; line-height: 1.1; margin: 0 0 0.5em; }
h1 { font-size: 40px; font-weight: 700; letter-spacing: -0.02em; }
h2 { font-size: 28px; font-weight: 700; }
h3 { font-size: 22px; font-weight: 600; }
@media (min-width: 1024px) { h1 { font-size: 64px; } h2 { font-size: 40px; } h3 { font-size: 28px; } }
p { margin: 0 0 1.25em; }
a { color: rgb(20, 90, 140); }
.wrap { max-width: 1200px; margin: 0 auto; padding: 0 24px; }
.site-header { position: fixed; top: 0; left: 0; right: 0; height: 80px; z-index: 10;
  display: flex; align-items: center; justify-content: space-between; padding: 0 24px;
  background: rgba(0, 0, 0, 0); transition: background-color 200ms ease-out, height 200ms ease-out, box-shadow 200ms ease-out; }
.site-header.scrolled { background: rgb(255, 255, 255); height: 64px; box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12); }
.site-header a { color: rgb(255, 255, 255); }
.site-header.scrolled a { color: rgb(34, 34, 34); }
.logo img { display: block; width: 120px; height: 32px; }
.logo .logo-dark, .scrolled .logo .logo-light { display: none; }
.scrolled .logo .logo-dark { display: block; }
.menu-toggle, .submenu-toggle { display: none; }
#site-menu ul { list-style: none; margin: 0; padding: 0; display: flex; gap: 24px; }
#site-menu li { position: relative; }
#site-menu .sub-menu { position: absolute; top: 100%; left: 0; display: block; background: rgb(255, 255, 255);
  padding: 12px; opacity: 0; visibility: hidden; transition: opacity 150ms ease-in; }
#site-menu .sub-menu .sub-menu { top: 0; left: 100%; }
#site-menu .sub-menu a { color: rgb(34, 34, 34); }
#site-menu li:hover > .sub-menu, #site-menu li:focus-within > .sub-menu { opacity: 1; visibility: visible; }
#site-menu li.has-mega { position: static; }
#site-menu .mega-panel { position: absolute; top: 100%; left: calc(50% - 480px); width: 960px;
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 32px; padding: 32px 40px;
  background: rgb(255, 255, 255); box-shadow: 0 12px 24px rgba(0, 0, 0, 0.15); border-radius: 0 0 8px 8px;
  opacity: 0; visibility: hidden; transform: translateY(8px);
  transition: opacity 200ms ease 50ms, transform 200ms ease 50ms, visibility 0s linear 250ms; }
#site-menu li.has-mega:hover > .mega-panel, #site-menu li.has-mega:focus-within > .mega-panel {
  opacity: 1; visibility: visible; transform: none; transition: opacity 200ms ease 50ms, transform 200ms ease 50ms; }
#site-menu .mega-panel ul { display: block; }
#site-menu .mega-panel a { color: rgb(34, 34, 34); }
#site-menu .mega-panel h4 { margin: 0 0 8px; font-size: 20px; text-transform: uppercase; letter-spacing: 0.08em; }
#site-menu .mega-panel img { display: block; width: 240px; height: 140px; }
.header-cta { padding: 10px 20px; }
@media (max-width: 899px) {
  .menu-toggle { display: block; font: inherit; padding: 8px 12px; }
  .site-header .header-cta { display: none; }
  #site-menu { position: fixed; top: 0; right: 0; height: 100vh; width: 80vw; background: rgb(255, 255, 255);
    padding: 96px 24px 24px; transform: translateX(100%); visibility: hidden;
    transition: transform 300ms cubic-bezier(0.22, 1, 0.36, 1), visibility 0s linear 300ms; }
  #site-menu.is-open { transform: translateX(0); visibility: visible; transition: transform 300ms cubic-bezier(0.22, 1, 0.36, 1); }
  #site-menu ul { display: block; }
  #site-menu a { color: rgb(34, 34, 34); }
  #site-menu .sub-menu { position: static; opacity: 1; visibility: inherit; padding: 0 0 0 16px; }
  #site-menu .submenu-toggle { display: inline-block; font: inherit; margin-left: 8px; }
  #site-menu .mega-panel { position: static; display: none; width: auto; padding: 0 0 0 16px; box-shadow: none;
    opacity: 1; visibility: inherit; transform: none; transition: none; }
  #site-menu li.has-mega.is-expanded > .mega-panel { display: block; }
}
.hero { position: relative; isolation: isolate; min-height: 70vh; color: rgb(255, 255, 255); padding: 140px 0 64px;
  background: rgb(20, 90, 140) url(/hero.png) center / cover no-repeat; }
.hero::before { content: ""; position: absolute; inset: 0; z-index: -1; background: rgba(0, 0, 0, 0.4); }
.hero h1 { color: rgb(255, 255, 255); }
.hero .eyebrow { font-size: 14px; text-transform: uppercase; letter-spacing: 0.1em; margin: 0 0 12px; }
.scroll-down { position: absolute; left: calc(50% - 20px); bottom: 24px; width: 40px; height: 40px; color: rgb(255, 255, 255); text-decoration: none; text-align: center; }
.btn { display: inline-block; background: rgb(200, 80, 40); color: rgb(255, 255, 255); border-radius: 6px;
  padding: 14px 28px; text-decoration: none; font-weight: 600; }
.site-header .btn { color: rgb(255, 255, 255); }
section { padding: 48px 0; }
@media (min-width: 768px) { section { padding: 72px 0; } }
@media (min-width: 1200px) { section { padding: 96px 0; } }
.band { background: rgb(20, 90, 140); color: rgb(255, 255, 255); }
.band a { color: rgb(255, 255, 255); }
.media { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
@media (max-width: 599px) { .media { grid-template-columns: 1fr; } }
.media img { width: 100%; height: 240px; border-radius: 12px; display: block; object-fit: cover; }
.swiper { overflow: hidden; position: relative; }
.swiper-wrapper { display: flex; transition: transform 400ms ease; }
.swiper-slide { flex: 0 0 100%; height: 160px; background: rgb(230, 230, 230); }
.swiper-button-prev, .swiper-button-next { position: absolute; top: 60px; width: 40px; height: 40px; border: 0; border-radius: 50%; background: rgb(255, 255, 255); }
.swiper-button-prev { left: 8px; }
.swiper-button-next { right: 8px; }
.swiper-pagination { position: absolute; bottom: 8px; left: 0; right: 0; display: flex; justify-content: center; gap: 8px; }
.swiper-pagination-bullet { display: block; width: 10px; height: 10px; border-radius: 50%; background: rgb(200, 200, 200); }
.swiper-pagination-bullet-active { background: rgb(34, 34, 34); }
.marquee { overflow: hidden; white-space: nowrap; }
.marquee-track { display: inline-block; width: 2000px; animation: marquee 8s linear infinite; }
@keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
.parallax { position: relative; isolation: isolate; overflow: hidden; min-height: 320px; color: rgb(255, 255, 255); }
.parallax-bg { position: absolute; left: 0; right: 0; top: -120px; height: 560px; z-index: -1;
  background: rgb(60, 60, 60) url(/hero.png) center / cover; }
.card-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
@media (max-width: 599px) { .card-row { grid-template-columns: 1fr; } }
[data-aos] { opacity: 0; transform: translateY(40px);
  transition: opacity 600ms cubic-bezier(0.25, 0.1, 0.25, 1), transform 600ms cubic-bezier(0.25, 0.1, 0.25, 1); }
[data-aos-delay="100"] { transition-delay: 100ms; }
[data-aos-delay="200"] { transition-delay: 200ms; }
[data-aos].aos-animate { opacity: 1; transform: none; }
footer { background: rgb(24, 24, 24); color: rgb(240, 240, 240); padding: 48px 0; }
footer a { color: rgb(240, 240, 240); }
footer h4 { margin: 0 0 12px; font-size: 20px; text-transform: uppercase; letter-spacing: 0.08em; }
footer ul { list-style: none; margin: 0; padding: 0; }
.footer-cols { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 32px; }
@media (max-width: 599px) { .footer-cols { grid-template-columns: 1fr; } }
.footer-bottom { margin-top: 32px; padding-top: 16px; border-top: 1px solid rgb(80, 80, 80); display: flex; justify-content: space-between; font-size: 14px; }
.footer-bottom p { margin: 0; }
`;

/*
 * Behaviour the capture has to find by WATCHING, each with a known value:
 * the header turns solid and shrinks past 10px of scroll, the hero's word
 * changes every 1000ms, the carousel advances every 1000ms (short, so the
 * case stays fast) and rewinds to the first slide, the parallax layer moves
 * at 0.3 of the scroll, and the cards reveal 120px into the viewport — fade
 * and 40px up over 600ms, 100ms apart — the way AOS does it.
 */
const BRANDED_SCRIPT = `
const header = document.querySelector('.site-header');
addEventListener('scroll', () => header.classList.toggle('scrolled', scrollY > 10), { passive: true });
const toggle = document.querySelector('.menu-toggle');
const menu = document.getElementById('site-menu');
const set = (open) => { menu.classList.toggle('is-open', open); toggle.setAttribute('aria-expanded', String(open)); };
toggle?.addEventListener('click', () => set(toggle.getAttribute('aria-expanded') !== 'true'));
addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
for (const b of document.querySelectorAll('.submenu-toggle')) {
  b.addEventListener('click', () => {
    const li = b.closest('li');
    const open = !li.classList.contains('is-expanded');
    li.classList.toggle('is-expanded', open);
    b.setAttribute('aria-expanded', String(open));
  });
}
const track = document.querySelector('.swiper-wrapper');
if (track) {
  const slides = document.querySelectorAll('.swiper-slide');
  const bullets = document.querySelectorAll('.swiper-pagination-bullet');
  let slide = 0;
  setInterval(() => {
    slide = (slide + 1) % slides.length;
    track.style.transform = 'translateX(' + (-100 * slide) + '%)';
    slides.forEach((s, i) => s.classList.toggle('swiper-slide-active', i === slide));
    bullets.forEach((b, i) => b.classList.toggle('swiper-pagination-bullet-active', i === slide));
  }, 1000);
}
const rotate = document.querySelector('.rotate');
if (rotate) {
  const words = ['fixture', 'sample', 'example'];
  let w = 0;
  setInterval(() => { w = (w + 1) % words.length; rotate.textContent = words[w]; }, 1000);
}
const layer = document.querySelector('.parallax-bg');
if (layer) {
  const move = () => { layer.style.transform = 'translateY(' + (scrollY * 0.3) + 'px)'; };
  addEventListener('scroll', move, { passive: true });
  move();
}
const reveal = document.querySelectorAll('[data-aos]');
reveal.forEach((el) => el.classList.add('aos-init'));
const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) e.target.classList.add('aos-animate');
}, { rootMargin: '0px 0px -120px 0px' });
reveal.forEach((el) => io.observe(el));
`;

function brandedPage({ path, title, description }) {
  const para = 'Body copy long enough to be measured as a paragraph, set in the body face at the body size, with a link to <a href="/about/">about</a> in the brand colour.';
  const short = 'A card with a short paragraph, revealed as it scrolls into view.';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${BASE}${path}">
<style>${BRANDED_STYLE}</style>
</head>
<body>
<header class="site-header">
  <a href="/" class="logo"><img class="logo-light" src="/logo-light.png" width="120" height="32" alt="Fixture"><img class="logo-dark" src="/logo-dark.png" width="120" height="32" alt="Fixture"></a>
  ${FAULTS.has('no-menu') ? '' : '<button class="menu-toggle" aria-controls="site-menu" aria-expanded="false" aria-label="Menu">Menu</button>'}
  <nav id="site-menu" aria-label="Primary">
    <ul>
      <li><a href="/about/">About</a></li>
      <li><a href="/services/">Services</a>${FAULTS.has('no-menu') ? '' : `
        <ul class="sub-menu">
          <li><a href="/services/one/">Service one</a></li>
          <li><a href="/services/two/">Service two</a>
            <ul class="sub-menu"><li><a href="/services/two/detail/">Service two detail</a></li></ul>
          </li>
        </ul>`}
      </li>
      ${FAULTS.has('no-menu') ? '<li><a href="/programs/">Programs</a>' : `<li class="has-mega"><a href="/programs/">Programs</a><button class="submenu-toggle" aria-expanded="false" aria-label="Open the Programs menu">+</button>
        <div class="mega-panel">
          <div class="mega-col"><h4>Column one</h4><ul><li><a href="/programs/a/">Program A</a></li><li><a href="/programs/b/">Program B</a></li></ul></div>
          <div class="mega-col"><h4>Column two</h4><ul><li><a href="/programs/c/">Program C</a></li><li><a href="/programs/d/">Program D</a></li></ul></div>
          ${FAULTS.has('mega-changed') ? '' : '<div class="mega-col"><h4>Featured</h4><img src="/hero.png" width="240" height="140" alt="A featured program"><a href="/programs/featured/">Featured program</a></div>'}
        </div>`}
      </li>
      <li><a href="/work/">Work</a></li>
      <li><a href="/contact/">Contact</a></li>
    </ul>
  </nav>
  <a class="btn header-cta" href="/contact/">Book now</a>
</header>
<main>
<section class="hero"><div class="wrap">
  <p class="eyebrow">Fixture studio</p>
  <h1>A branded <span class="rotate">fixture</span> page</h1>
  <p>${para}</p>
  <a class="btn" href="/contact/">Get in touch</a>
</div><a class="scroll-down" href="#first" aria-label="Scroll to the content">↓</a></section>
<section id="first"><div class="wrap">
  <h2>Section heading</h2>
  <p>${para}</p>
  <p>${para}</p>
  <p>${para}</p>
  <h3>Smaller heading</h3>
  <p>${para}</p>
  <div class="media">
    <img src="/hero.png" width="800" height="600" alt="A first photograph">
    <img src="/hero.png" width="800" height="600" alt="A second photograph">
  </div>
</div></section>
<section class="band"><div class="wrap">
  <h2>A band in the brand colour</h2>
  <p>${para}</p>
  <div class="swiper"><div class="swiper-wrapper">
    <div class="swiper-slide swiper-slide-active">Slide one</div><div class="swiper-slide">Slide two</div><div class="swiper-slide">Slide three</div>
  </div>
  <button class="swiper-button-prev" aria-label="Previous slide"></button><button class="swiper-button-next" aria-label="Next slide"></button>
  <div class="swiper-pagination"><span class="swiper-pagination-bullet swiper-pagination-bullet-active"></span><span class="swiper-pagination-bullet"></span><span class="swiper-pagination-bullet"></span></div>
  </div>
</div></section>
<section><div class="wrap">
  <div class="marquee"><span class="marquee-track">Moving fixture text · Moving fixture text · Moving fixture text · Moving fixture text · </span></div>
  <h3>Another smaller heading</h3>
  <p>${para}</p>
  <p>${para}</p>
</div></section>
<section class="parallax"><div class="parallax-bg"></div><div class="wrap">
  <h2>A parallax band</h2>
</div></section>
<section class="cards"><div class="wrap">
  <h2>Three cards</h2>
  <div class="card-row">
    <div class="card" data-aos="fade-up" data-aos-delay="0"><h3>Card one</h3><p>${short}</p></div>
    <div class="card" data-aos="fade-up" data-aos-delay="100"><h3>Card two</h3><p>${short}</p></div>
    <div class="card" data-aos="fade-up" data-aos-delay="200"><h3>Card three</h3><p>${short}</p></div>
  </div>
</div></section>
<div style="height: 1200px"></div>
</main>
<footer><div class="wrap">
  <div class="footer-cols">
    <div><h4>About</h4><p>Fixture footer, with a link to <a href="/">home</a>.</p></div>
    <div><h4>Links</h4><ul><li><a href="/about/">About</a></li><li><a href="/work/">Work</a></li><li><a href="/contact/">Contact</a></li></ul></div>
    <div><h4>Follow</h4><ul><li><a href="https://www.instagram.com/example">Instagram</a></li><li><a href="https://www.facebook.com/example">Facebook</a></li></ul>
      <div id="fixture-widget"></div><script src="https://widget.example.invalid/embed.js" async></script></div>
  </div>
  <div class="footer-bottom"><p>© 2026 Fixture. All rights reserved.</p><a href="/about/">About this site</a></div>
</div></footer>
<script>${BRANDED_SCRIPT}</script>
</body>
</html>`;
}

const HOME_TITLE = 'Fixture home — a deliberately simple page';
const ABOUT_TITLE = FAULTS.has('dup-title') ? HOME_TITLE : 'About the fixture site';
const ABOUT_CANONICAL = FAULTS.has('canonical-elsewhere') ? 'https://example.com/about/' : `${BASE}/about/`;

const render = FAULTS.has('branded') ? brandedPage : page;

const ROUTES = {
  '/': render({
    path: '/',
    title: HOME_TITLE,
    description: 'The home page of a fixture site used to prove the go-live checks still refuse.',
  }),
  '/about/': render({
    path: '/about/',
    title: ABOUT_TITLE,
    description: 'An about page, present so that cross-page checks have two pages to compare.',
    canonical: ABOUT_CANONICAL,
  }),

  /*
   * ⚠ ONLY UNDER THE FAULT, and that is the point rather than tidiness. It is
   *   served, it is in the sitemap, it returns 200 and no page links to it — so
   *   adding it to the default site would make the CLEAN run report an orphan,
   *   and the control every other verify case is measured against would be
   *   carrying the defect it exists to disprove.
   *
   * The page itself links OUT, like any real page. Nothing links IN.
   */
  ...(FAULTS.has('orphan-route')
    ? {
        '/pricing/': page({
          path: '/pricing/',
          title: 'Pricing, reachable only by typing the URL',
          description: 'A page in the sitemap that no other page links to — the shape a rewritten nav leaves behind.',
        }),
      }
    : {}),
};

const robots = () =>
  FAULTS.has('no-sitemap-in-robots')
    ? 'User-agent: *\nAllow: /\n'
    : `User-agent: *\nAllow: /\nSitemap: ${BASE}/sitemap-index.xml\n`;

/*
 * ⚠ THE FILENAMES MATTER. `routesFromSitemap` asks for `/sitemap-index.xml`
 *   and falls back to `/sitemap-0.xml` — what `@astrojs/sitemap` emits — and
 *   it never looks at `/sitemap.xml`. Serving the wrong name here produced
 *   "routes discovered ✗" and skipped every per-page check silently, which is
 *   the same class of bug this fixture exists to catch.
 */
const sitemapIndex = () =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
  `<sitemap><loc>${BASE}/sitemap-0.xml</loc></sitemap></sitemapindex>`;

const sitemap = () =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
  [...Object.keys(ROUTES), ...([])]
    .map((p, i) => {
      const date = FAULTS.has('lastmod-same') || FAULTS.has('lastmod-partial') ? '2026-01-15' : `2026-0${i + 1}-15`;
      const dated = !FAULTS.has('lastmod-partial') || i < 2;
      return `<url><loc>${BASE}${p}</loc>${dated ? `<lastmod>${date}</lastmod>` : ''}</url>`;
    })
    .join('') +
  `</urlset>`;

/* WordPress's REST API, as a public site serves it to anyone. Two states of
   the same site: the baseline, and `wp-edited` weeks later. */
const LATER = FAULTS.has('wp-edited');
const wpItem = (id, path, title, modified) => ({ id, link: `${BASE}${path}`, modified_gmt: modified, status: 'publish', title: { rendered: title } });
function wpRest(path) {
  if (path === '/wp-json/wp/v2/types') {
    return {
      page: { slug: 'page', rest_base: 'pages', rest_namespace: 'wp/v2' },
      post: { slug: 'post', rest_base: 'posts', rest_namespace: 'wp/v2' },
      attachment: { slug: 'attachment', rest_base: 'media', rest_namespace: 'wp/v2' },
      wp_block: { slug: 'wp_block', rest_base: 'blocks', rest_namespace: 'wp/v2' },
    };
  }
  if (path === '/wp-json/wp/v2/pages') {
    return [
      wpItem(2, '/', 'Home', '2026-01-10T09:00:00'),
      wpItem(5, '/about/', 'About us', LATER ? '2026-03-02T14:30:00' : '2026-01-12T09:00:00'),
      ...(LATER ? [wpItem(9, '/pricing/', 'Pricing', '2026-03-01T10:00:00')] : []),
    ];
  }
  if (path === '/wp-json/wp/v2/posts') {
    return [
      wpItem(11, LATER ? '/news/opening-hours/' : '/2026/01/opening-hours/', 'Opening hours', '2026-01-20T09:00:00'),
      ...(LATER ? [] : [wpItem(12, '/2026/01/winter-closure/', 'Winter closure', '2026-01-21T09:00:00')]),
    ];
  }
  if (path === '/wp-json/wp/v2/media') {
    return [
      { id: 30, source_url: `${BASE}/wp-content/uploads/2026/01/front.jpg`, modified_gmt: '2026-01-05T09:00:00' },
      { id: 31, source_url: `${BASE}/wp-content/uploads/2026/01/team.jpg`, modified_gmt: LATER ? '2026-03-03T09:00:00' : '2026-01-05T09:00:00' },
      ...(LATER ? [{ id: 32, source_url: `${BASE}/wp-content/uploads/2026/03/price-list.jpg`, modified_gmt: '2026-03-01T09:00:00' }] : []),
    ];
  }
  return null;
}

const server = createServer((req, res) => {
  const path = req.url.split('?')[0];
  const send = (code, type, body) => {
    res.writeHead(code, {
      'content-type': type,
      'x-fixture': 'yes',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'permissions-policy': 'geolocation=(), camera=(), microphone=()',
      /* ⚠ THE SAME FOUR DIRECTIVES THE TEMPLATE SHIPS, and no more. This was
         `default-src 'self'`, which no real site here serves — and under it
         Chrome refused the page's own inline <style>, so the CLEAN run of
         check-console reported a console error on every route. A fixture that
         is stricter than the thing it stands in for does not test harder; it
         tests something else. verify checks this header is present, never what
         it says, so the faithful value costs nothing. */
      'content-security-policy':
        "frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'",
      'strict-transport-security': 'max-age=31536000; includeSubDomains',
      'x-content-type-options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  };

  if (path === '/__ready') return send(200, 'text/plain', TOKEN);
  /*
   * A page that redirects somewhere the crawler must refuse to follow — the
   * SSRF shape recon's guard exists for. The old site is not ours, and a 302
   * it issues must not steer the crawler wherever it likes.
   *
   * ⚠ IT REDIRECTS TO file:, NOT TO 169.254.169.254, AND THAT IS FORCED.
   *   A fixture necessarily lives on 127.0.0.1, so recon needs
   *   `--allow-internal` just to crawl it at all — and that flag relaxes the
   *   HOST check on redirect hops too. It never relaxes the PROTOCOL check.
   *   So `file:` is the one refusal reachable from a local fixture, and it
   *   exercises the same `refuse()` path on the same hop.
   *
   * It sits on ROBOTS.TXT because that is one of the few reads recon actually
   * follows. The preserved-path checks and the sitemap probes all pass
   * `redirect: 'manual'`, so the hop loop never runs there — they report the
   * raw 302 instead — and sitemap URLs are written to urls.txt without being
   * fetched at all. Three plausible-looking places to put this exercise
   * nothing, which is worth knowing before adding a case that proves nothing.
   *
   *   What is therefore still NOT covered is a hop refused for its HOST while
   *   the flag is off. That needs a crawler pointed at a public origin, which
   *   is a real deployment.
   */
  if (path === '/robots.txt' && FAULTS.has('redirect-blocked')) {
    res.writeHead(302, { location: 'file:///etc/passwd' });
    return res.end();
  }

  if (path === '/robots.txt') return send(200, 'text/plain', robots());
  if (path === '/sitemap-index.xml') return send(200, 'application/xml', sitemapIndex());
  if (path === '/sitemap-0.xml') return send(200, 'application/xml', sitemap());

  /* An old URL the inventory says must survive. Correctly it goes to its own
     equivalent; the fault sends it to the homepage, which is the migration
     mistake that looks like a working redirect. */
  if (path === '/legacy-about.html') {
    const to = FAULTS.has('preserved-to-home') ? '/' : '/about/';
    res.writeHead(301, { location: `${BASE}${to}` });
    return res.end();
  }

  if (path === '/about/' && FAULTS.has('route-404')) return send(404, 'text/html', '<h1>Not found</h1>');


  /* A 1x1 PNG, so the internal-link check has a real asset to resolve. */
  if (path === '/hero.png' || path === '/logo-light.png' || path === '/logo-dark.png') {
    res.writeHead(200, { 'content-type': 'image/png' });
    return res.end(PIXEL);
  }

  /*
   * ⚠ NO MARKUP ASKS FOR THIS ONE, AND IT STILL HAS TO EXIST. A browser
   *   requests /favicon.ico by itself when a page declares no icon, so
   *   serving 404 here puts a failed request on EVERY route — and the clean
   *   run of check-console, the control every fault case is measured against,
   *   would report two failures and prove nothing. check-console carries a
   *   hint about this exact request because it has confused someone before.
   */
  if (path === '/favicon.ico') {
    res.writeHead(200, { 'content-type': 'image/x-icon' });
    return res.end(PIXEL);
  }

  /*
   * The contact endpoint, behaving as api/contact.ts does. verify asks it three
   * questions and each has a fault that inverts the answer:
   *
   *   honeypot filled  → a redirect WITHOUT `sent=`   (spam-converts breaks it)
   *   empty body       → 422                          (accepts-empty breaks it)
   *   foreign origin   → 403                          (allows-cross-origin breaks it)
   *
   * ⚠ THE ORIGIN CHECK RUNS FIRST, as it does in the template. Ordered after
   *   validation it would only ever fire on submissions that were being
   *   rejected anyway, which looks identical in a passing test.
   */
  if (path === '/api/contact/' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const json = (raw) => {
        try {
          return JSON.parse(raw);
        } catch {
          return {};
        }
      };
      const reqOrigin = req.headers.origin ?? '';
      if (reqOrigin && reqOrigin !== BASE && !FAULTS.has('allows-cross-origin')) {
        res.writeHead(403, { 'content-type': 'application/json' });
        return res.end('{"error":"cross-origin"}');
      }
      const form = (req.headers['content-type'] ?? '').includes('form-urlencoded');
      const fields = form ? Object.fromEntries(new URLSearchParams(body)) : json(body);

      if (fields.company) {
        res.writeHead(303, {
          location: FAULTS.has('spam-converts') ? `${BASE}/?sent=1` : `${BASE}/contact/`,
        });
        return res.end();
      }
      /* Turnstile verified before the fields, the order a site may choose: no token, no validation. */
      if (FAULTS.has('turnstile-enforced') && !fields['cf-turnstile-response']) {
        res.writeHead(403, { 'content-type': 'application/json' });
        return res.end('{"ok":false,"error":"The spam check did not pass. Please try again."}');
      }
      /*
       * ⚠ THE FAULT HERE IS ACCEPTANCE, NOT A CRASH. The template's own bug was
       *   a 500 — `(input.name ?? '').trim()` on an object — but the tempting
       *   FIX is `String(value)`, which turns `{"name":{"a":1}}` into
       *   `"[object Object]"`, passes the length rule, and stores a lead with a
       *   nonsense name. A fixture that only modelled the 500 would pass a site
       *   that had quietly adopted the worse answer.
       */
      const nonString = Object.entries(fields).find(
        ([, v]) => v !== null && v !== undefined && typeof v !== 'string',
      );
      if (nonString && !FAULTS.has('coerces-malformed')) {
        res.writeHead(400, { 'content-type': 'application/json' });
        return res.end('{"error":"not a string"}');
      }

      if (!fields.name && !FAULTS.has('accepts-empty')) {
        res.writeHead(422, { 'content-type': 'application/json' });
        return res.end('{"error":"missing fields"}');
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    });
    return;
  }

  if (FAULTS.has('wp-api') && path.startsWith('/wp-json/')) {
    const data = wpRest(path);
    if (data) {
      res.writeHead(200, { 'content-type': 'application/json', 'x-wp-total': String(data.length ?? 0), 'x-wp-totalpages': '1' });
      return res.end(JSON.stringify(data));
    }
    return send(404, 'application/json', '{"code":"rest_no_route"}');
  }

  if (path === '/api/missed/' && FAULTS.has('misses')) {
    if (req.headers.authorization !== 'Bearer fixture-export-token') return send(401, 'text/plain', 'Unauthorized\n');
    return send(
      200,
      'application/json',
      JSON.stringify({
        retentionDays: 90,
        misses: [
          { path: '/about-us/', hits: 9, last: '2026-03-04', from: { 'news.example.org': 3 } },
          { path: '/about-us', hits: 2, last: '2026-03-01', from: {} },
          { path: '/wp-login.php', hits: 50, last: '2026-03-04', from: {} },
          { path: '/contact/jane@example.com/', hits: 4, last: '2026-03-02', from: {} },
          { path: '/abuot/', hits: 2, last: '2026-03-03', from: { '127.0.0.1': 2 } },
          { path: '/legacy-about.html', hits: 3, last: '2026-03-03', from: {} },
        ],
      }),
    );
  }

  const body = ROUTES[path];
  if (body) return send(200, 'text/html', body);

  send(404, 'text/html', '<!doctype html><html lang="en"><head><title>Not found</title></head><body><h1>Not found</h1></body></html>');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`fixture-site listening on ${BASE}${FAULTS.size ? ` — faults: ${[...FAULTS].join(', ')}` : ''}`);
});
