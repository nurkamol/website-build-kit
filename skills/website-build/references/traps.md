# Traps

Every one of these failed **silently** during the build — clean build, clean types, clean
deploy, wrong result. Check this list before debugging anything strange.

---

### Astro's scoped styles do not reach a class you pass into a component

**Hit three times.** A class handed to `<Icon class="menu__arrow" />` is not written in the
parent's own template, so Astro never stamps its scoping attribute on it, and the parent's
`.menu__arrow { … }` rule matches nothing.

*Symptom:* a rule that is definitely in the CSS bundle and has no effect. The mobile menu
button rendered **both** the hamburger and the close icon at once, because
`.header__toggle-close { display: none }` never matched.

*Fix:* `:global()` — `.menu__list :global(.menu__arrow) { … }`. Or put it in `global.css`.

*Catch it early:*

```bash
node -e "
const fs=require('fs'),path=require('path');
function walk(d){return fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)])}
for(const f of walk('src').filter(f=>f.endsWith('.astro'))){
  const s=fs.readFileSync(f,'utf8');
  for(const m of s.matchAll(/<([A-Z]\w*)\b[^>]*?\bclass=[\"{]([^\"}]+)[\"}]/gs))
    for(const c of m[2].split(/\s+/)){
      if(!c||/[{}\`\$]/.test(c)) continue;
      const styled=new RegExp('\\\\.'+c.replace(/-/g,'\\\\-')+'\\\\b');
      if(!s.includes('<style')||!styled.test(s.split('<style')[1]||'')) continue;
      if(!new RegExp(':global\\\\([^)]*\\\\.'+c.replace(/-/g,'\\\\-')+'\\\\b').test(s))
        console.log('SCOPED-LEAK',f,'<'+m[1]+'> class='+c);
    }
}"
```

---

### `Astro.locals.runtime.env` was removed in Astro v6

Reading it throws at request time while the build, the types and the deploy all stay green.
The only signal is an actual request. Every API route returned an empty 500.

*Fix:* `import { env } from 'cloudflare:workers'`. Wrapped in `src/lib/runtime.ts` so there
is one place to change if it moves again. `env` is a lazy proxy — importing it at module
scope is safe, reading a property outside a request is not.

---

### `trailingSlash: 'always'` breaks form POSTs

`POST /api/contact` 308-redirects to `/api/contact/`, and the redirected request loses its
body on the Workers runtime. The endpoint looks broken while being perfectly fine.

*Fix:* the form posts to `/api/contact/` with the slash. The trailing slash in
`ContactForm.astro`'s `action` is load-bearing — do not "tidy" it away.

---

### A redirect target that exists only inside a string

The form endpoint 303'd the no-JavaScript path to `/contact-us/` and `/thank-you/` — route
names carried over from the previous project, neither of which existed. Everything downstream
was clean: the build passed, types passed, the enhanced path worked perfectly because it never
follows the redirect, and the lead was still stored and emailed. Only a visitor with
JavaScript off saw it, and what they saw was a 404 after a successful submission.

A route written in a redirect string is invisible to every check that walks links or pages.

*Fix:* declare the targets once as constants at the top of the endpoint, point them at real
routes, and test the native POST with `curl -H 'accept: text/html' -H 'origin: …'` — following
the `Location` to a 200, not just reading the 303.

---

### A phone number inside a JavaScript error string

`"Something went wrong. Please call us at (000) 000-0000."` sat in the form's catch block and
in the API's 502 body. It survived two projects: the string only renders when the submission
has already failed, so nobody sees it during a normal build, a normal test or a normal demo.
The first person to see the previous client's number is a real visitor whose enquiry just
failed — the worst possible moment.

Business facts in a component's *markup* get caught, because you look at the page. Facts in a
string that only a failure path renders do not.

*Fix:* the error path reads `business.phone.display` too. Grep for a literal phone pattern
before handover — `grep -rnE '\(?[0-9]{3}\)? ?[0-9]{3}-[0-9]{4}' src/` — and treat a hit
inside `src/lib` or `src/pages/api` as a bug regardless of which client it belongs to.

---

### Astro's CSRF protection rejects `Origin`-less POSTs with 403

A `curl` test without an `Origin` header returns 403 and looks like a broken endpoint.
It applies to form content types (`multipart/form-data`,
`application/x-www-form-urlencoded`) but **not** to `application/json`, which is why the
JSON path tested fine and the no-JS path appeared broken.

*Fix:* send `-H "Origin: https://<host>"` when testing. Real browsers always do.

---

### The Cloudflare adapter silently adds a `SESSION` KV binding with no id

Left unconfigured, `@astrojs/cloudflare` enables KV-backed sessions and writes
`{"binding": "SESSION"}` — **with no id** — into the generated `dist/server/wrangler.json`.
Wrangler then *creates* that namespace on deploy. That works exactly once: the namespace
outlives the worker, so deleting the deployment and recreating it from git fails on a name
the previous incarnation left behind.

*Fix:* `session: { driver: sessionDrivers.null() }` in `astro.config.mjs`. This site has no
sessions.

*Verify after any adapter upgrade:*

```bash
node -e "console.log(JSON.parse(require('fs').readFileSync('dist/server/wrangler.json','utf8')).kv_namespaces)"
```

Every binding must have an `id`.

---

### `wrangler.jsonc` must not declare `main`

The Cloudflare Vite plugin resolves `main` at config time, before Astro has produced the
worker, and fails with *"main field doesn't point to an existing file"*. The adapter writes
its own `wrangler.json` into `dist/server/` with `main` set correctly.

*Fix:* omit `main` from the root config entirely.

---

### Cloudflare `_redirects` only accepts 200/301/302/303/307/308

A `404` status in a rule is rejected — the whole rule is dropped with a warning that scrolls
past in the deploy output. Paths that should 404 need no rule at all; the worker returns a
real 404 for them because `not_found_handling` is `"none"`.

---

### Astro strips the whitespace before an element on the next line

```astro
<p>
  call or text us at
  <a href="tel:…">(000) 000-0000</a>.
</p>
```

renders as `…call or text us at(000) 000-0000.` — no space.

*Fix:* explicit `{' '}` at the end of the text line.

---

### Rank Math only appends the sitename when a post has no custom SEO title

The template is `%title% %sep% %sitename%`, but a hand-written `seo_title` is used verbatim.
Appending it unconditionally pushed the five newest posts from ~56 to ~76 characters, past
where Google truncates.

*Fix:* `post.data.seoTitle ?? \`${title} - ${business.name}\`` in `[slug].astro`.

---

### The optimizer's mtime skip must not skip the manifest entry

`emitSocialCard()` returned early when the output was newer than the source — which also
skipped writing its manifest entry. On a warm rebuild every page shipped with **no
`og:image` at all**, and the build failed with `Cannot read properties of undefined`.

*Fix:* skip the encode, never the manifest write. Same pattern applies to any future
`newerThan` guard.

---

### `overflow-x: hidden` on `<body>` kills viewport IntersectionObservers

It makes `<body>` a scroll container, so a viewport-rooted observer never fires and every
scroll reveal silently stops working.

*Fix:* `overflow-x: clip` — already set in `global.css`. Do not change it back.

---

### Component scripts do not re-run after a client-side navigation

With `<ClientRouter />` a module script runs on first load only. Bind once and the mobile
menu is dead after the first navigation.

*Fix:* everything stateful initialises from `astro:page-load`. Because the header is
`transition:persist`, it also has to guard against re-binding on every navigation —
`header.dataset.bound === '1'`.

**And the sting in the tail:** that guard means the handlers bound on the *first* page keep
running forever — still holding references to elements that page-load replaced. The mobile
menu lives outside the persisted header, so it is a fresh element every navigation. Clicking
the hamburger on any page after the first updated the previous page's **detached** menu:
`aria-expanded` flipped, the header hid, and nothing opened.

*Symptom:* works on first load, silently dead after one client-side navigation. No error.

*Fix:* a handler bound once must not capture a non-persisted element. Look it up at call
time (`const menuEl = () => document.querySelector('[data-menu-panel]')`) and delegate
clicks from `document` rather than binding to the menu itself.

---

### A supplied `favicon.svg` was a different logo entirely

The first `/logo/favicon.svg` was a blue stopwatch, nothing to do with the brand. Browsers
prefer an SVG icon over the `.ico` when both are declared, so the tab showed the stopwatch
while the `.ico` and every PNG were perfectly correct — and it looked like a caching problem
rather than a wrong file.

*Fix:* render every icon and look at it. Cheap check:

```bash
# serve dist, then open a page with all of them side by side at real sizes
printf '<img src="/img/brand/favicon.svg" width=160><img src="/favicon.ico" width=16>' > dist/client/_fav.html
```

Favicons are now rendered from `media/source/brand/favicon.svg` when it exists, so the SVG,
the `.ico` and the PNGs cannot disagree — one source, four outputs.

---

### The supplied credential logos are white

CHEERS measures 252,252,252; CalCERTS and RESNET are close behind. They are transparent PNGs
drawn for a dark backdrop and are invisible on a light one.

*Fix:* the credential strip is a dark band. Do not "brighten" it to match the sections
around it without re-checking the logos.

---

### Two Pexels images referenced by an article 404 at source

`pexels-photo-1104994` and `pexels-photo-8486944` return 404 from Pexels — they are already
broken on the live WordPress site. Substituted at import time in `dump/tomd.mjs`.

---

### A hand-rolled performance measurement will disagree with Lighthouse

Measuring LCP with your own `PerformanceObserver` against a local dev server produces a
number. It is just not the number that matters, and nothing tells you so.

*What happened:* an overlay was measured at "+628ms LCP, +160ms once tuned" using a
`PerformanceObserver` on localhost. Lighthouse, mobile profile with simulated throttling,
put the real cost at ~0.3s of Speed Index and **no measurable LCP impact at all** — the
recommendation built on the first number was wrong.

*Why they diverge:* localhost has no network latency to model, cache state varies between
runs, and the LCP element itself can change from load to load. Lighthouse simulates
throttling and computes metrics the way Chrome's field data does.

*Fix:* measure with Lighthouse, mobile form factor, simulated throttling. **Take at least two
samples of each variant** — single runs swing by a full second on Speed Index. Do the
with/without comparison on the same server, back to back.

```bash
npx lighthouse@12 <url> --form-factor=mobile --screenEmulation.mobile \
  --throttling-method=simulate --only-categories=performance --quiet \
  --chrome-flags="--headless=new" --output=json --output-path=/tmp/a.json
```

*And:* report the result even when it undercuts the position you argued for. That is the
entire point of measuring.

---

### DNS negative caching

A newly pointed subdomain can look broken locally long after it works — and this one bit us
for real. `new.expressducttest.com` served HTTP 200 with a valid certificate while the same
machine's browser and `curl` both reported *"could not resolve host"*: macOS had cached the
NXDOMAIN from a lookup made **before** the custom domain existed, and kept serving it.

*Diagnosis:* `dig` queries a resolver directly and succeeds, while `getaddrinfo` (what curl
and browsers use) fails. If those two disagree, it is your cache, not the origin.

```bash
dig +short <host> @1.1.1.1                      # authoritative truth
python3 -c "import socket;print(socket.getaddrinfo('<host>',443)[0][4][0])"   # your resolver
curl --resolve <host>:443:<ip> https://<host>/  # bypass the cache entirely
```

*Fix:* `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder`. Chrome keeps its own
cache too — `chrome://net-internals/#dns` → Clear host cache.

*Also worth checking:* query a hostname you know does not exist. If it resolves, you are
looking at a wildcard record rather than the one you just created.

### A frontmatter date renders one day early, west of Greenwich

**Symptom:** a post dated `2026-08-21` in frontmatter displays as **20 August
2026** on the built site. Clean build, clean types, correct in the markdown,
correct on the developer's machine in London, wrong on the one in Los Angeles.
Nothing anywhere reports it, and the same commit renders differently depending
on who ran the build.

Two steps, each reasonable:

1. Astro's frontmatter parser turns an unquoted `2026-08-21` into a **Date**,
   not a string — `2026-08-21T00:00:00.000Z`, midnight **UTC**.
2. `toLocaleDateString(locale, { … })` with no `timeZone` formats that instant
   in the **build machine's** zone. Anywhere with a negative UTC offset, midnight
   UTC is still the previous evening.

Measured: US Pacific and US Eastern both shift it, London and Tokyo do not. This
kit's provenance is US local-business rebuilds, so the wrong half is the common
half — and CI runners are frequently US-based regardless of where the client is.

**Fix:** pin the zone at the format, `timeZone: 'UTC'`. The locale still decides
the order and the wording; only the zone is pinned.

```js
date.toLocaleDateString(business.locale, {
  month: 'long', day: 'numeric', year: 'numeric',
  timeZone: 'UTC',              // ← without this, the build machine decides
});
```

Better still where the value is a **calendar date** rather than an instant —
an effective date, a published date — keep it a string end to end and never let
a `Date` into the middle. `src/content.config.ts` does this for the legal
collection: it normalises whatever the parser produced back to `YYYY-MM-DD` at
the schema boundary, which removes the class rather than handling it.

Found while building the legal collection, in this template's own
`formatDate` — so every site built from it that ran a build in a US timezone
published every blog date a day early.

### Extracted text runs together where the source HTML had no whitespace

**Symptom:** on a migrated page, a heading and the paragraph under it are glued
into one word — `AreasWe cover Irvine.` — or a sentence runs straight into its
link text or a URL: `Call ustoday`, `see the guidehttps://…`. Build clean, types
clean, page renders. It reads correctly until you actually read it, and it
happens on **some** paragraphs and not others, which is what makes it look like
a content problem rather than a converter one.

The cause is one line that appears in every hand-rolled extractor:

```js
html.replace(/<[^>]+>/g, '')          // strips tags, joins the text either side
```

Whether it breaks depends entirely on whether the ORIGINAL markup happened to
have a newline between the tags — and page builders emit minified HTML, so
often it does not:

```
<p>Book a survey</p>\n<p>Call us</p>     → "Book a survey\nCall us"     ✓ fine
<h2>Areas</h2><p>We cover Irvine.</p>    → "AreasWe cover Irvine."      ✗ glued
```

So the same extractor is correct on the pages whose source was pretty-printed
and wrong on the pages whose source was not. Collapsing whitespace afterwards
(`\s+ → ' '`) hides the good case and leaves the bad one untouched.

**Fix:** turn block-level *closing* tags into breaks **before** stripping
anything, and give inline elements a space:

```js
text = html
  .replace(/<\/(p|h[1-6]|li|tr|div|section|article|blockquote)>/gi, '\n\n')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/(a|strong|em|span|b|i)>/gi, '$& ')   // inline: keep a boundary
  .replace(/<[^>]+>/g, '')
  .replace(/[ \t]+/g, ' ')
  .replace(/\n{3,}/g, '\n\n')
  .trim();
```

Better still, do not hand-roll it: a real HTML-to-markdown converter gets the
whitespace rules right, and this is the only part of extraction where writing
your own reliably costs a day of proofreading.

**How to catch it after the fact**, since it is invisible to every build gate —
grep the extracted content for a lower-case letter followed immediately by a
capital or a scheme:

```bash
grep -rnE '[a-z](https?://|[A-Z][a-z])' src/content/ | grep -vE 'iPhone|YouTube|JavaScript|WordPress'
```

Expect a few false positives from camelCase and brand names; read them.

### The accessibility gate fails on a random URL, and it is not accessibility

**Symptom:** `npm run a11y` reports `Failed to run` against one URL, a different
one each time, with `Error: Protocol error (Target.closeTarget): No target with
given id found`. It reads as an accessibility failure on that page. The page is
fine, and a re-run usually blames a different page — or passes.

It is Chrome tearing down browser targets while another is still closing, and it
is driven entirely by pa11y's `concurrency`. Measured on this template, five runs
at each setting:

| `concurrency` | Runs that failed |
| --- | --- |
| 4 | **4 / 5** |
| 2 | **5 / 5** |
| 1 | **0 / 5** |

Note that 2 was no better than 4 — this is a race in target teardown, not a
resource limit, so lowering the number without going to 1 buys nothing.

**Fix:** `"concurrency": 1` in `.pa11yci.json`. Four URLs sequentially is a few
seconds; a gate that is wrong four times in five is a gate the team learns to
ignore, and then it is worse than no gate because its silence means nothing.

Worth knowing before you go hunting: this got *more* visible when the run started
covering both colour schemes, because that doubles the number of Chrome sessions
and so doubles the chances of hitting the race. The change that surfaced it was
not the change that caused it.

### A script throws `ReferenceError` for something nothing ever imported

**Symptom:** `npm run recon` runs the whole crawl, prints its sitemap and URL
sections, and then dies at the last one:

```
const PRESERVE = PRESERVED;
                 ^
ReferenceError: PRESERVED is not defined
```

The file imports two things and uses a third. It shipped in a published package
and a user hit it on a real migration, on Windows, on the first command the
documentation tells you to run.

**Why nothing caught it.** This is the important part, because the instinct is
that surely *something* would have:

| | |
| --- | --- |
| `node --check` | Parses. An undefined identifier is **valid syntax** |
| `astro check` | Types `.astro` and `.ts`. The scripts are standalone `.mjs` |
| CI | Runs the build. `recon` needs a live site, so CI never runs it |
| Smoke-running it | The throw is on line 302, reached only after the crawl — tested, and a `--help` load-check passes the broken file |

**Fix:** import it. The real fix is the gate — `npm run check:refs` cross-checks
every name `scripts/lib/*.mjs` exports against every script that uses one, and
fails when a use has no import.

**The first version of that gate was worse than none.** It flagged every
SCREAMING_CASE identifier that was never bound, and produced seven false
positives on a clean tree: `WCAG` and `CAA` in prose, `ERR_ABORTED` inside a
regex literal, `AND` in a comment. Stripping comments and strings with regexes
is a losing game without a parser. Narrowing it to names the libs actually
export removed the guesswork — prose never collides with a real export.

**A checker with false positives gets switched off, and then its silence means
"nobody looked" rather than "nothing wrong".**
