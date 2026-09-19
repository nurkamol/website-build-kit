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
  'redirect-blocked', // a page that 302s somewhere recon must refuse to follow

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
}`;

/** A page that passes every per-page check verify makes, unless a fault says otherwise. */
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
</head>
<body>
<main>
<h1>${h1}</h1>
${FAULTS.has('two-h1') && path === '/about/' ? '<h1>A second heading</h1>' : ''}
<p class="ok">Body copy long enough to be substantial, so the page is not treated as empty
by anything measuring content length. It links onward to <a href="/about/">about</a>
and back to <a href="/">home</a>.</p>
<img src="/hero.png" width="800" height="600" alt="A hero image">
${FAULTS.has('asset-404') ? '<img src="/gone.png" width="80" height="60" alt="An asset the server does not have">' : ''}
${FAULTS.has('overflow-320') ? '<div style="width: 480px">Wider than a 320px viewport.</div>' : ''}
</main>
${FAULTS.has('console-error') ? '<script>notAFunctionAnywhere();</script>' : ''}
</body>
</html>`;
}

const HOME_TITLE = 'Fixture home — a deliberately simple page';
const ABOUT_TITLE = FAULTS.has('dup-title') ? HOME_TITLE : 'About the fixture site';
const ABOUT_CANONICAL = FAULTS.has('canonical-elsewhere') ? 'https://example.com/about/' : `${BASE}/about/`;

const ROUTES = {
  '/': page({
    path: '/',
    title: HOME_TITLE,
    description: 'The home page of a fixture site used to prove the go-live checks still refuse.',
  }),
  '/about/': page({
    path: '/about/',
    title: ABOUT_TITLE,
    description: 'An about page, present so that cross-page checks have two pages to compare.',
    canonical: ABOUT_CANONICAL,
  }),
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
    .map((p, i) => `<url><loc>${BASE}${p}</loc><lastmod>2026-0${i + 1}-15</lastmod></url>`)
    .join('') +
  `</urlset>`;

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

  if (path === '/__ready') return send(200, 'text/plain', 'ready');
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
  if (path === '/hero.png') {
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
      if (!fields.name && !FAULTS.has('accepts-empty')) {
        res.writeHead(422, { 'content-type': 'application/json' });
        return res.end('{"error":"missing fields"}');
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    });
    return;
  }

  const body = ROUTES[path];
  if (body) return send(200, 'text/html', body);

  send(404, 'text/html', '<!doctype html><html lang="en"><head><title>Not found</title></head><body><h1>Not found</h1></body></html>');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`fixture-site listening on ${BASE}${FAULTS.size ? ` — faults: ${[...FAULTS].join(', ')}` : ''}`);
});
