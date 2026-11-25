/**
 * Drive the template's photo viewer (Lightbox.astro + LightboxPhoto.astro) in a
 * real browser, against a BUILT copy of the template.
 *
 * Not run directly: `test-gates.mjs` copies the template to a temp directory,
 * adds the two fixture pages, builds it, copies this file in beside the build
 * (so `puppeteer` and `sharp` resolve from the template's node_modules) and
 * runs it there. It prints one JSON array of { label, ok, detail } on its last
 * line, and the harness reports each entry as a case.
 *
 * ⚠ THE LAST ENTRY IS THE REFUSAL, AND IT IS THE ONE THAT MAKES THE REST MEAN
 *   SOMETHING. The fixture carries one viewer link WITHOUT `data-astro-reload`.
 *   The ClientRouter must take that click to the bare image file — if it does
 *   not, the router is not in play on this page and every "the viewer opened"
 *   above proves nothing about the trap the component exists to avoid.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import puppeteer from 'puppeteer';
import sharp from 'sharp';

const ROOT = join(process.cwd(), 'dist', 'client');

/* The photos the manifest names. Generated here rather than committed: a
   binary in the kit repo is invisible to the provenance sweep. */
mkdirSync(join(ROOT, 'img', 'gallery'), { recursive: true });
for (const [i, name] of ['a', 'b', 'c'].entries()) {
  for (const w of [480, 1200]) {
    await sharp({ create: { width: w, height: Math.round((w * 2) / 3), channels: 3, background: { r: 60 * i, g: 90, b: 120 } } })
      .webp()
      .toFile(join(ROOT, 'img', 'gallery', `${name}-${w}.webp`));
  }
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => {
  let p = join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!existsSync(p)) {
    res.writeHead(404);
    return res.end('not found');
  }
  res.writeHead(200, { 'content-type': TYPES[extname(p)] ?? 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const out = [];
const check = (label, ok, detail = '') => out.push({ label, ok: !!ok, detail: ok ? '' : String(detail) });

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  /* KIT_SLOW=6 runs the page six times slower — script AND animations, view transitions
     included — which is a busy CI runner, on demand. A case that only fails on CI is a timing
     assumption, and this is how to see it locally: the navigate-and-back case failed under
     KIT_SLOW=6 every time while it waited a fixed 300ms. CPU throttling alone does not show it;
     a view transition runs on the compositor's clock, not the main thread's. */
  const slow = Number(process.env.KIT_SLOW ?? 1);
  if (slow > 1) {
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: slow });
    await cdp.send('Animation.enable');
    await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 / slow });
  }
  await page.goto(`${origin}/lightbox-fixture/`, { waitUntil: 'networkidle0' });
  /* Survives a client-side navigation, not a page load — proof the router ran. */
  await page.evaluate(() => {
    window.__sameDocument = true;
  });

  const settle = () => new Promise((r) => setTimeout(r, 300));
  /* Polled by hand: waitForFunction never resolved across a ClientRouter swap here. */
  const until = async (fn, what) => {
    for (let i = 0; i < 50; i++) {
      if (await page.evaluate(fn).catch(() => false)) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`timed out waiting for ${what}`);
  };
  const state = () =>
    page.evaluate(() => {
      const d = document.querySelector('[data-lightbox]');
      const img = d?.querySelector('[data-lightbox-img]');
      return {
        open: !!d?.open,
        count: d?.querySelector('[data-lightbox-count]')?.textContent ?? '',
        alt: img?.alt ?? '',
        path: location.pathname,
        active: document.activeElement?.getAttribute('data-alt') ?? document.activeElement?.tagName,
        onClose: !!document.activeElement?.matches('[data-lightbox-close]'),
        same: window.__sameDocument === true,
        prevHidden: d?.querySelector('[data-lightbox-prev]')?.hidden,
        fullHidden: d?.querySelector('[data-lightbox-fullscreen]')?.hidden,
        fsEnabled: document.fullscreenEnabled,
        w: img?.getBoundingClientRect().width ?? 0,
        nw: img?.naturalWidth ?? 0,
        zoom: d?.querySelector('[data-lightbox-zoom]')?.getAttribute('aria-pressed'),
      };
    });

  const items = await page.$$('a[data-lightbox-item][data-astro-reload]');
  await items[1].click();
  await settle();
  let s = await state();
  check('a click opens the viewer instead of following the link', s.open && s.path === '/lightbox-fixture/', JSON.stringify(s));
  check('focus starts on Close', s.onClose, JSON.stringify(s));
  check('the counter reads within the group: 2 / 3', s.count === '2 / 3', s.count);
  check('the viewer image carries the thumbnail alt text', s.alt === 'second', s.alt);
  check('the full-screen control is hidden exactly when full screen is unavailable', s.fullHidden === !s.fsEnabled, JSON.stringify(s));
  check('fitted to the screen, in pixels', s.w > 0 && s.w <= 1280, JSON.stringify(s));

  await page.keyboard.press('ArrowRight');
  await settle();
  s = await state();
  check('ArrowRight moves on: 3 / 3', s.count === '3 / 3', s.count);
  await page.keyboard.press('ArrowRight');
  await settle();
  s = await state();
  check('and wraps: 1 / 3', s.count === '1 / 3', s.count);

  const mid = await page.evaluate(() => {
    const r = document.querySelector('[data-lightbox-stage]').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.touchscreen.touchStart(mid.x + 120, mid.y);
  await page.touchscreen.touchMove(mid.x, mid.y);
  await page.touchscreen.touchMove(mid.x - 120, mid.y);
  await page.touchscreen.touchEnd();
  await settle();
  s = await state();
  check('a swipe to the left moves on: 2 / 3', s.count === '2 / 3', s.count);

  await page.click('[data-lightbox-zoom]');
  await settle();
  s = await state();
  check('zoom shows the photo at its own size or larger', s.zoom === 'true' && s.w >= s.nw, JSON.stringify(s));

  await page.keyboard.press('Escape');
  await settle();
  s = await state();
  check('Escape closes, and focus returns to the photo that opened it', !s.open && s.active === 'second', JSON.stringify(s));

  await items[3].click();
  await settle();
  s = await state();
  check('a group of one: 1 / 1, no previous / next', s.count === '1 / 1' && s.prevHidden === true, JSON.stringify(s));
  const corner = await page.evaluate(() => {
    const r = document.querySelector('[data-lightbox-stage]').getBoundingClientRect();
    return { x: r.left + 8, y: r.top + 8 };
  });
  await page.mouse.click(corner.x, corner.y);
  await settle();
  s = await state();
  check('a click on the dark area around the photo closes it', !s.open, JSON.stringify(s));

  /* Away and back through the router. A real mouse click while the view
     transition's overlay is up lands on the overlay, not the link — so the
     navigation clicks are dispatched. */
  await page.evaluate(() => document.querySelector('#away').click());
  await until(() => location.pathname === '/lightbox-other/', 'the other page');
  await settle();
  await page.evaluate(() => document.querySelector('#back').click());
  await until(() => location.pathname === '/lightbox-fixture/' && !!document.querySelector('[data-lightbox]'), 'the gallery page again');
  /* ⚠ ARRIVED IS NOT CLICKABLE. The page is swapped in while the view transition still runs, and
     until it ends every point hit-tests to its overlay (<html>), so a real click is lost: the
     viewer stays shut, the link is not followed, focus sits on <body>. A 300ms pause outlasted the
     transition on a Mac and not on a busy CI runner — this case failed there with exactly that
     state. Wait for the condition, not a duration. */
  await until(() => {
    if (document.getAnimations().some((a) => String(a.effect?.pseudoElement ?? '').startsWith('::view-transition'))) return false;
    const link = document.querySelector('a[data-lightbox-item][data-astro-reload]');
    const r = link?.getBoundingClientRect();
    const hit = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (hit === link || link.contains(hit));
  }, 'the view transition to end and the photo link to take a click');
  s = await state();
  check('the navigation was client-side, so the case exercises the router', s.same, JSON.stringify(s));
  await (await page.$$('a[data-lightbox-item][data-astro-reload]'))[0].click();
  await settle();
  s = await state();
  check('after a client-side navigation and back, the viewer still opens on the live page', s.open && s.count === '1 / 3' && s.path === '/lightbox-fixture/', JSON.stringify(s));
  await page.keyboard.press('Escape');
  await settle();

  await page.click('#unguarded');
  await until(() => location.pathname !== '/lightbox-fixture/' || !!document.querySelector('[data-lightbox]')?.open, 'either outcome');
  await settle();
  s = await page.evaluate(() => ({ path: location.pathname, open: !!document.querySelector('[data-lightbox]')?.open }));
  check(
    'refusal: the same link WITHOUT data-astro-reload is taken by the router to the bare image file',
    s.path.endsWith('.webp') && !s.open,
    JSON.stringify(s),
  );
} catch (err) {
  check('the driver ran to the end', false, err.stack);
} finally {
  await browser.close();
  server.close();
}
console.log(JSON.stringify(out));
