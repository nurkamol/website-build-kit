# Traps

Failures that were **silent** — clean build, clean types, clean deploy, wrong result. Read this
before debugging anything strange.

The first section ships with the template and describes traps in *this* code. **The second is
yours to fill in during the build** — it is the highest-value page in the repo six months later.

---

## In this codebase

### Astro scoped styles do not reach a class passed *into* a component

A class handed to `<Icon class="menu__arrow" />` is not written in the parent's own template,
so Astro never stamps its scoping attribute on it and the parent's `.menu__arrow { … }` rule
matches nothing. Same for elements JavaScript creates at runtime.

*Symptom:* a rule that is definitely in the CSS bundle and has no effect — a toggle rendering
both icon states at once.

*Fix:* `:global()` — `.menu__list :global(.menu__arrow) { … }`, or put it in `global.css`.
Several already-correct uses are commented as such; do not "tidy" them away.

### Component scripts do not re-run after a client-side navigation

With the view-transitions router a module script runs on first load only.

*Fix:* initialise from the router's page-load event, not at module scope.

### …and a persisted element's handlers outlive the elements they captured

`transition:persist` on the header keeps its handlers alive forever — still referencing DOM
that page-load replaced. The mobile menu lives *outside* the persisted header, so it is a new
element every navigation and the old handler keeps mutating the previous page's detached one.

*Symptom:* works on first load, silently dead after one navigation, no error.

*Fix:* never capture a non-persisted element in a long-lived closure. Look it up at call time.

### `trailingSlash: 'always'` breaks form POSTs

`POST /api/contact` 308-redirects to `/api/contact/` and the redirected request loses its body
on the Workers runtime. The endpoint looks broken while being fine.

*Fix:* the form posts to `/api/contact/`, slash included. That slash in `ContactForm.astro`'s
`action` is load-bearing.

### Astro's CSRF protection rejects `Origin`-less POSTs with 403

It applies to form content types but **not** `application/json` — so the enhanced path tests
fine while the no-JS path looks broken.

*Fix:* send `-H "Origin: https://<host>"` when testing with curl. Browsers always do.

### The Cloudflare adapter adds a `SESSION` KV binding with no id

Left unconfigured, `@astrojs/cloudflare` writes `{"binding": "SESSION"}` with no id into the
generated `dist/server/wrangler.json`, and wrangler *creates* that namespace on deploy. Works
exactly once: the namespace outlives the worker, so recreating the deployment fails on a name
the previous incarnation left behind.

*Fix:* `session: { driver: sessionDrivers.null() }` in `astro.config.mjs`.

*Verify after any adapter upgrade* — every binding must have an `id`:

```bash
node -e "console.log(JSON.parse(require('fs').readFileSync('dist/server/wrangler.json','utf8')).kv_namespaces)"
```

### `overflow-x: hidden` on `body` breaks viewport IntersectionObservers

It makes body a scroll container, so a viewport-rooted observer never fires and scroll reveals
never run. *Fix:* `overflow-x: clip`.

### `justify-content: center` clips overflowing content unreachably

Centred flex content taller than its container overflows in *both* directions and the top
cannot be scrolled to — exactly what a landscape phone produces.

*Fix:* `margin: auto` on the child. Auto margins collapse to zero once content exceeds the box.

### `100vh` is taller than the visible area on mobile

It excludes collapsing browser chrome, so a full-height panel hides its own bottom CTA.
*Fix:* `100dvh`.

### A fixed header covers a full-screen panel

*Fix:* hide the header while the panel is open and give the panel its own close control — and
make that control sticky, because `position: absolute` inside a scrolling panel scrolls away.

### An mtime "skip if unchanged" guard must skip the work, not the bookkeeping

`optimize-media.mjs` returns early on a warm rebuild. If it returns *before* recording output
in the manifest, pages ship with no `og:image` and the error surfaces nowhere near the cause.

### Analytics IDs copied from another project

`src/data/site.ts` emits nothing unless both IDs are set, precisely so an unset ID cannot fall
back to someone else's container. A copied GTM ID sends a real business's traffic to a
different property, builds green, deploys clean, and reports nothing wrong.

### `aria-hidden` on a wrapper that still contains focusable children

Keyboard focus lands on controls the screen reader has been told do not exist. Visually
correct, so nothing flags it. *Fix:* `inert`, which removes both.

### A skip link that scrolls but does not move focus

`href="#main"` moves the scroll position without moving focus unless the target carries
`tabindex="-1"`. The page jumps, so it looks like it worked; the next Tab returns to the nav.

*Fix:* `tabindex="-1"` on the target, and test by Tabbing *after* activating it.

### A live region injected at announce time announces nothing

`role="status"` must be in the DOM *before* its content changes. `ContactForm.astro` renders
the empty region on load and writes into it — that ordering is deliberate.

### DNS negative caching outlives the fix

A newly pointed subdomain serves 200 with a valid certificate while your own machine reports
"could not resolve host" — the OS cached the NXDOMAIN from before the record existed.

*Diagnosis:* if `dig` succeeds while `getaddrinfo` fails, it is your cache, not the origin.

### `fetch()` to object storage fails CORS even when assets serve perfectly

Buckets send no `Access-Control-Allow-Origin` by default; `<img>` does not care. Test with an
image tag, not `fetch`.

---

## Found on this build

> Add every non-obvious failure here as it happens, in this shape. The bar is that it was
> **silent** — if a compiler, linter or obvious error message caught it, leave it out.
>
> ```markdown
> ### One-line statement of the failure
>
> What happened, in the words you used while confused by it.
>
> *Symptom:* what you actually observe. This is what makes it findable later.
>
> *Fix:* the change, and why it is the right one rather than a workaround.
> ```

<!-- entries go here -->


### A scoped selector never matches an attribute on `<html>`

`[data-reveal-ready] .thing { … }` inside a component's `<style>` compiles to
`[data-astro-cid-…][data-reveal-ready] .thing[data-astro-cid-…]`. Astro adds the
scope id to **every compound selector**, and `<html>` has no component scope, so
the rule ships and matches nothing.

**Symptom:** the animation simply does not happen. Clean build, correct CSS in
the bundle, no error. Fixing only half the selectors is worse — the hidden state
applies and the reveal never does, so the element stays permanently invisible.

**Fix:** `:global([data-reveal-ready]) .thing`.

This is the fifth variant of the same trap in this build: a scoped style never
reaches a class passed *into* a component, never reaches a child rendered by
another component, `> *` never matches such a child, `> :global(*)` compiles to
the same broken thing, and now this.

### A reveal safety net that cancels every reveal

The scroll-reveal guard revealed **everything** after 2.5s so nothing could be
stranded invisible. That included content far below the fold — so anyone who
took longer than 2.5s to scroll, which is anyone reading, arrived to find the
animation had already played.

**Symptom:** "the animations don't work", while every animation is working
perfectly, on time, to an empty room.

**Fix:** rescue only what is currently in the viewport, and fall back to
revealing everything only if the observer never fired at all — which is the
failure the guard actually exists for.

### A the booking vendor plugin that renders nothing because of a missing attribute

`/schedule/` was blank. The embed had been carried over from the WordPress site
before the booking vendor's snippet gained `locale="en"`. Without it the plugin loads,
fetches its configuration, fetches the sessions — and renders nothing into its
container.

**Symptom:** no console error, no failed request, a populated network tab and
an empty div.

**Fix:** diff the embed against a freshly generated snippet from the the booking vendor
dashboard rather than debugging the plugin. Any third-party embed carried
across a migration deserves the same check.

### A third-party widget that changes your own CSS

Enabling the the booking vendor webchat took three pages from 0 accessibility errors to
failing. It injects a stylesheet into the page. Separately, its fixed overlay
makes axe report colour-contrast violations on elements it covers, which look
identical to real failures — `htmlcs` reported nothing and the computed colours
were 17:1.

**Fix:** a `.btn.btn` specificity guard for the CSS, and measure before
believing a contrast failure that only one runner reports.

### A component's inline `style` beating the stylesheet — and looking responsive

`Wordmark.astro` sized itself with `style="inline-size:14rem"`, because an SVG
with a viewBox and no width has no useful intrinsic size and a stylesheet that
fails to load would otherwise leave it at the 300px default. `BandHeader` then
set `inline-size: min(16rem, 42vw)` on the class it passes in. The inline
attribute wins, so that rule never did anything.

**What hid it:** the reset's `max-width: 100%`. The mark ran to its 14rem and
was then clamped by whatever space the layout had left, so it *did* shrink on a
phone — it looked responsive while actually being squeezed. Nothing measured
what the author wrote: at 390px the mark was 171px, which is neither `16rem`
nor `42vw` nor `14rem`.

**Fix:** `inline-size: var(--wordmark-size, 14rem)` in the inline style. The
default survives a missing stylesheet, and a caller can now set the size from
CSS — where it can be media-queried — by setting the custom property on a
wrapper it owns. No `:global()` needed either, because custom properties
inherit.

**Rule of thumb:** if a component writes an inline `style`, every property in
it is unoverridable from CSS. Make each one a custom property with the current
value as the fallback.

### Grid rows stretch, so a second row does not sit under the first

Converting the band header from flex to grid moved `BOOK NOW` from just under
the nav to the vertical middle of the photograph. `align-items: start` was
already set and was not enough: it aligns each item within *its* row, while the
auto-sized rows themselves still stretch to fill a container taller than their
content.

**Symptom:** an element that looks correctly aligned within its own row, in the
wrong place on the page. No overflow, no error.

**Fix:** `align-content: start` on the grid container.

### `margin: 0` on a `.container` un-centres it

`.container` centres itself with `margin-inline: auto`. A `<ul>` or `<ol>` that
is also the container needs its browser default margin cleared — and
`margin: 0` clears the auto margins with it. The block then sits hard against
the left edge while every other section on the page stays centred, which reads
as a broken grid rather than as a margin bug. `padding: 0` does the same thing
to the container's gutter.

**Symptom:** correct at narrow widths, where the container is full-bleed
anyway, and visibly wrong past `--width-max`. Nobody sees it on a laptop.

**Fix:** `margin-block: 0` and `padding-block: 0`. Zero the axis you meant.

**Twice now** — the homepage path cards and the What We Offer tiles.

### A progressive-enhancement hook applied too late is a layout shift

The header band's phone menu is gated on `[data-band-js]`, set by script, so
that with JavaScript off nothing collapses and the full nav stays reachable.
Correct — but the attribute was set from `astro:page-load`, in a bundled module.

Measured on a phone against the deployed site: the band rendered in its
no-JavaScript state — five nav labels wrapped under the wordmark, no menu
button — and collapsed **2.1 seconds later**. Layout shift 0.183, against a
0.1 Core Web Vitals budget. What a visitor saw was the desktop layout
rearranging itself under their thumb.

**Symptom:** nothing is wrong in any screenshot, because every screenshot is
taken after the script has run. It only exists between first paint and the
bundle executing, which is exactly the window automated checks skip.

**Fix:** `<script is:inline>` placed after the markup it configures, so it runs
while the parser is still on the element and the state is there at first paint.
Keep element-level listeners on the element (they die with it) and register
document-level ones once behind a `window` flag, or a client-side navigation
adds a fresh set every time.

**The general rule:** if a class or attribute changes layout, it has to be
applied before first paint. `astro:page-load` is for behaviour, not for layout.

### `grid-template-rows: 0fr` animates only a container with ONE child

The open/close animation on a collapsible section needs a container whose
single child occupies the row being animated. Put it on a `<ul>` whose `<li>`s
are the grid items and each one auto-places into its own IMPLICIT row —
implicit rows are not the track in `grid-template-rows`, so the transition runs
against nothing and the panel snaps open.

**Fix:** wrap the list in one element, animate the wrapper, and give the child
`min-block-size: 0; overflow: clip`. `clip`, not `hidden` — `hidden` makes it a
scroll container mid-animation.

**Why this technique at all:** it is the only height animation that works in
every engine this site ships to. `interpolate-size: allow-keywords` with
`height: auto` is Chromium-only; `::details-content` has no Firefox; a
JS-measured pixel height works but re-measures on every rotation and font-size
change and gets the first frame wrong if a webfont lands mid-animation.

**Verified, not assumed** — driven in WebKit and Firefox as well as Chromium,
checking that the height passes through intermediate values rather than
jumping. A jump and an animation end at the same number; only the frames
between them tell you which you have.

### `<ClientRouter>` does not re-run `is:inline` scripts after a swap

An inline script placed after its markup runs while the parser is on the
element — which is exactly why it is inline, and it removes the flash of an
unenhanced layout on first paint. It runs **once**. The router replaces the
body on every client-side navigation and does not execute it again, so every
page reached by clicking a link keeps the un-enhanced markup.

**Symptom, and why it is worse than it looks:** it presents as "sometimes the
wrong layout flashes". It is not a flash. On a hard refresh the page is right;
on any navigation it is permanently wrong until the next refresh. Here the
phone menu stayed expanded across the band with its button still `hidden` —
no way to navigate at all on a phone.

**Fix:** name the setup function, call it immediately AND from
`astro:page-load`, and guard it with an attribute on the element so it is
idempotent. Register that listener on `document`, which the router does not
replace, behind a `window` flag so repeat executions cannot stack it.

**And do not use `document.currentScript` to find the element.** It is null on
every run except the first, so `currentScript.previousElementSibling` throws
precisely in the case you added the second run to fix. Look the element up.

### A header that clips or sits under the page, and only on some pages

Two separate faults, one symptom — a dropdown that opens and shows some of its
items.

`overflow: hidden` on the band clipped the panel to the band's own height. The
interior band is 11rem and the widest menu is seven items: the band ended at
176px, the panel at 434px, and six of the seven links were cut off and
unclickable. **The homepage was fine**, because its band is tall enough to
contain a panel — which is exactly why it survived review.

Removing the clip exposed the second: both the band and sections like
`.rd-tile` and `.about__wall` are positioned, so with no `z-index` anywhere,
SOURCE ORDER decided who painted on top and the later element won. Five of
seven links reachable on /about-us/ and /classes/, all seven on pages whose
first section happens not to be positioned.

**Fix:** no clip on the header, and give it `z-index: var(--z-header)`. A
header must paint above the page; leaving it to source order makes correctness
depend on what the page below happens to contain.

**Test for it like this:** count links whose centre point actually hits the
panel via `document.elementFromPoint`. Checking that the panel is "visible", or
that the links exist, finds neither fault — the panel was visible and the links
were in the DOM.

### `align-content: start` makes an auto margin do nothing

Three cards over a photograph on the homepage, each with a title, a body and a
"→" link. The grid stretched all three to a common height, so the CARDS were
level — but each card's own link sat directly under its own copy, and the three
arrows landed at three different heights.

The obvious fix, `margin-block-start: auto` on the link, does nothing at all.
The card was `display: grid` with `align-content: start`: its rows are sized to
their content and packed against the top, so the link's own grid area has no
spare height in it. An auto margin can only absorb slack that exists inside the
item's area, and there is none — all the leftover space is below the last row,
outside every area.

**Fix:** give the card an explicit `grid-template-rows: auto 1fr auto` and put
`align-self: start` on the middle item. The `1fr` row takes the slack, the
last row is pushed to the floor, and the arrows line up whatever the copy does.

Same shape of mistake as `justify-content: center` on an overflowing box: the
declaration is about distributing free space in the CONTAINER, and the thing
you actually want is to give one CHILD the space.

### A traced icon fills in solid, and the artwork looks nothing like the file

Four hand-drawn brush marks were traced from PNG. Three came out perfectly; the
spiral rendered as a solid black disc.

potrace expresses the gaps between the spiral's rings as inner contours with
opposite winding. SVG's default `fill-rule` is `nonzero`, under which those
contours fill rather than cut. **Set `fill-rule="evenodd"` on the path.**

The same job carried a second trap. One of the four source PNGs was CREAM, cut
for use on a dark photograph. Traced by luminance it
returns an empty path; used as an image it renders as a pale ghost on the cream
ground, which is what the client saw and reported as "not all showing up
correctly". **Trace the ALPHA channel, not the luminance**: that takes the
shape and discards the colour, so the mark inherits `currentColor` like every
other icon.

### Verifying a build with `python -m http.server` invents bugs

Screenshots of the built site showed the nav dropdowns hanging open over the
hero, images missing, and — intermittently, about one load in four — the
desktop two-column layout collapsing to one column at 1100px while
`matchMedia('(min-width: 60rem)')` still reported true.

None of it was real. `http.server` is single-threaded and drops connections
under a browser's parallel fetches; `requestfailed` fired on
`_astro/index.*.css` and the page rendered with a stylesheet missing. The
"missing images" were the same thing plus `full_page` screenshots re-rendering
after a viewport resize and catching lazy images mid-flight.

**Check the harness before believing the symptom.** Log `requestfailed` and
`response.status >= 400`, and assert something cheap that proves the CSS
arrived — `getComputedStyle(document.body).backgroundColor` is not
`rgba(0, 0, 0, 0)` — before trusting any measurement. For screenshots, freeze
transitions and await `img.decode()`. Better still, verify against the deployed
site, which is what `docs/runbook.md` asks for.

### "It's inside a cross-origin iframe" is not the same as "it cannot be changed"

The client asked twice for the the booking vendor booking panel's white ground to match
the cream page. The white comes from `html, body, #root { background-color:
#ffffff }` inside vendor.com's own document — cross-origin, unreachable, and
that was reported back as "the only lever is the booking vendor's branding settings."

Wrong conclusion from a correct fact. **We cannot edit what the frame draws;
we can change how it composites onto the page.**

```css
.vendor iframe {
  background: var(--white);   /* multiply's identity — NOT cream */
  mix-blend-mode: multiply;
}
```

Multiply against the cream backdrop turns the frame's white to exactly
`--cream` and leaves dark text, borders and grey panels alone, because
`white × anything = anything`. Colours inside shift by the backdrop's tint —
here a 3% cut in blue, invisible on a white/grey/near-black widget.

Three conditions, all of which fail silently:

- **The backdrop must be light.** Multiply darkens. Inside `.on-dark` or
  `.on-accent` the whole widget goes black.
- **The element's own background must be WHITE**, not the target colour. It is
  what paints before the frame loads, and cream multiplied by cream lands a
  shade dark.
- **Opt out under `forced-colors: active`.** High-contrast mode replaces
  colours wholesale and a blend on top of that gives mud.

Test in WebKit specifically — blend modes on iframes have a history of being
unreliable there. Chromium, WebKit and Firefox were all checked here before it
shipped, and all three agreed.

Related: the same page's *class timetable* needed none of this. That the booking vendor
product renders into our own DOM rather than a frame, so it already inherited
the page background. Check which kind of embed you have before reaching for
anything.

### `overflow: hidden` on a dialog silently eats the last thing in it

The "New Here?" pop-up carries a heading and three offers. On a 375x667 phone
the panel is 724px of content in a 635px dialog — and `.promo` had
`overflow: hidden`, put there to clip the photograph to the rounded corners.

The third offer was not scrolled past. It was **gone**, with nothing on screen
to suggest it existed. Measured clipped on iPhone SE, 360x640 and 390x600 —
which is a real share of phones, and the offer being lost was the $85 private
session.

**Fix:** `overflow: auto` plus `overscroll-behavior: contain`. `auto` still
clips to the border radius, so the reason `hidden` was there is unaffected, and
the overflow becomes reachable instead of deleted.

This is the same shape as the `justify-content: center` entry above: a
declaration chosen for appearance quietly deciding what a visitor can reach.
Both are invisible on a desktop and both need a short viewport to show up.

**Test for it like this:** compare the last child's `getBoundingClientRect()
.bottom` against the container's, at 667px tall and below. Checking that the
element "renders" or is "visible" finds nothing — it is in the DOM, it has
layout, and it is painted; it is just outside the box that clips it.

### Working CSS that quietly stopped running, and nothing said so

`global.css` carried a complete page transition — 180ms fade-and-lift out,
320ms fade-and-rise in, a reduced-motion opt-out, a named header held still.
It had not run for weeks.

It was written for `<ClientRouter />`, which swaps the document without a page
load. The swap was later switched off from a completely different layer:
`Base.astro` stamps `data-astro-reload` on every internal link, because the
the booking vendor embeds do not re-initialise after a swap. Correct fix, and it silently
orphaned a block of CSS two files away.

**Nothing catches this.** The build is clean, the rules are valid, the selectors
are real, the file is imported, and the page looks right — because the missing
thing is an animation nobody sees the absence of. It does not even show up as
dead code: `::view-transition-old(root)` is a legitimate selector that a
browser will happily match, one day, if anything ever triggers a transition.

**Turning it back on was one line** — `@view-transition { navigation: auto }`,
the native cross-document API, which animates real navigations and therefore
does not reintroduce the embed bug.

Two rules inside the block had also gone stale without complaint: a named
`site-header` that no element carries any more (the redesign replaced that
header with one that is deliberately new on every navigation), and Astro's
SPA-fallback selectors.

**The general shape:** when you disable a feature, grep for what else assumed
it. A behaviour switched off in JavaScript leaves its CSS looking alive. The
tell is a commit that fixes something in one file and makes another file
meaningless without touching it.

### An absolutely-positioned icon inside a WRAPPING flex container

The magnifying glass on `/search/` and on the 404 sat below and to the left of
its input on a phone, beside the Search button, instead of inside the field.

```css
.search__form { position: relative; display: flex; flex-wrap: wrap; }
.search__form input { flex: 1 1 16rem; }
.search__icon { position: absolute; inset-block-start: 50%; translate: 0 -50%; }
```

Every line is reasonable. The fault is that the icon's containing block is the
FORM. Below about 430px the input's `16rem` basis leaves no room for the button,
which wraps to a second row — and **50% of a two-row form is the gap between the
two rows**, which is precisely where the icon went.

**It is correct at every width where the button still fits beside the input**,
which is every width anyone had looked at. Nothing fails, nothing overflows, no
test notices; the icon is simply somewhere else.

**Fix:** give the icon a containing block that can only ever be one row. Wrap
the icon and the input together in a span that carries the `position: relative`
and the flex basis, and let the input be `flex: 1; min-inline-size: 0` inside
it. Now 50% is the middle of the input whatever the button does.

**Better still, do what `SearchDialog.astro` already does** and make the icon a
flex SIBLING of the input — `display: grid; flex: none` — inside a non-wrapping
row. No absolute positioning, so there is no containing block to get wrong. That
component has the same three elements and has never broken.

**The general shape:** `position: absolute` with a percentage offset is a bet on
the height of an ancestor. If that ancestor can reflow — a wrapping flex row, a
grid that changes track count — the bet is only good at some widths. Check what
the containing block actually is, and whether it can grow a row.

### One generator silently deleting another's manifest entries

Every page shipped with the same Open Graph card for three days, including
through go-live. The 21 unique per-page cards were still sitting in
`public/img/social/`; nothing referenced them.

`scripts/og-cards.mjs` writes 23 `social/og-<slug>` entries into
`src/data/image-manifest.json`. `scripts/optimize-media.mjs` — `npm run media`
— rebuilt that same file from `const manifest = {}` plus whatever it found in
`media/source/`. The cards are not in `media/source/`, so every run wiped them.

**Running `npm run media` to add one unrelated photograph deleted all 23.** The
files stayed on disk, the manifest stayed valid, `Seo.astro`'s lookup returned
undefined and quietly fell back to `og-default.jpg`, and the build stayed green.
Nothing anywhere compares the file listing to the manifest.

**Fix:** `optimize-media.mjs` now reads the existing manifest and carries over
`social/og-*` keys it does not own, so the two scripts can run in either order.

**The general shape:** when two generators write to one file, the one that
rebuilds from scratch silently owns it. Either it preserves what it does not
manage, or they must run in a fixed order that nothing enforces. A shared
artefact with two authors and no merge is a data-loss bug waiting for someone
to run the wrong command.

**Test for it like this:** compare the directory listing to the manifest keys.
`ls public/img/social | wc -l` against the count of `social/` keys — 24 files,
1 key was the whole story and takes a second to check.

### A hand-made fallback goes stale, and nothing regenerates it

`og-default.jpg` was a JPEG in `media/source/brand/`, passed through by
`optimize-media.mjs`. Every other social card was *generated* by
`og-cards.mjs`. The redesign landed on 13 August; the fallback had been made on
the 11th. It kept the old wordmark and the old tagline, and went on serving
them from a live site.

Nothing could have caught it. The file existed, the manifest entry was valid,
the build was green, and the only page using it — `/sitemap/` — was one nobody
opens. It surfaced when a share-preview tool was pointed at that URL by hand.

**The rule: if it can go stale, generate it.** A fallback is the *least*
visited asset and therefore the last one anyone checks, which is exactly why it
must not depend on someone remembering. `og-cards.mjs` now emits `og-default`
alongside the other 23, from the same type and ink, so changing the brand
changes the fallback.

**And the check that missed it:** the SEO audit two hours earlier had verified
"23 unique cards, one per page." It tested for *duplicates*. Since only one page
used the fallback, that page was unique and passed. A verification shaped around
the failure you expect will not find the one you did not.

---

### `_redirects` cannot match on hostname in Workers Static Assets

`www.example.com` served a full 200 copy of every page because both
hostnames route to the same worker. The obvious fix looks like the Pages syntax:

```
https://www.example.com/*  https://example.com/:splat  301
```

**It does nothing.** Absolute-URL sources are a Cloudflare *Pages* feature;
Workers Static Assets matches on path only. Tested against `wrangler dev` with a
spoofed `Host` header — the absolute rule returned 200 while a path rule in the
same file returned its 301 correctly. No error, no warning, no log line.

Middleware does not help either: static assets are served *without* invoking the
worker, which is why www serves a perfect copy in the first place. Catching it
would mean `run_worker_first`, routing every request through a worker to fix a
handful.

Host-level redirects are a **Cloudflare Single Redirect**, which runs in the
dynamic-redirect phase before Worker routes. See `docs/runbook.md` §3a.

---

### CI shallow-clones, so anything read from git history is empty in production

Sitemap `lastmod` was first computed at build time with `git log` per file. It
produced correct, varied dates locally and **nothing at all** in production:
Cloudflare Workers Builds shallow-clones, so `git log` returns the single
grafted commit for every file.

The module's own guard caught it — a shallow repo means every page would claim
the same date, which is the failure the feature exists to avoid, so it emitted
no `lastmod` rather than a plausible lie. That was the right call and it still
left a feature that silently did nothing in production. Confirmed by diffing the
deployed sitemap against the local build: 0 `lastmod` elements versus 23.

**The rule: a build must not depend on repository history it may not be given.**
The dates are now computed by `npm run lastmod` and committed as data, like
every other fact in this project.

Two related judgements worth keeping:

- **Never stamp the build time.** It claims every page changed on every deploy.
  Google uses `lastmod` where a site's values are consistently accurate and
  discounts them where they are not, so a plausible wrong date does not buy a
  faster re-crawl — it spends the credibility that would have earned one.
- **Layout and nav changes must not move a page's date.** Treating
  `Base.astro` and `nav.ts` as sources for every route is literally true — a
  footer link does change all 23 documents — but it collapsed every date to the
  same day, which is indistinguishable from the build-stamp failure and carries
  no prioritisation signal. Google asks for the last *significant content*
  change and says explicitly not to bump for boilerplate.

### A `> img` selector stops matching once an image gains a `<picture>`

**Symptom:** an image loses its styling — sizing, `object-fit`, a border radius —
on the commit that turned AVIF on. Nothing errors, the image still loads, and
the CSS rule looks correct in the stylesheet.

`<Img />` wraps its `<img>` in `<picture>` whenever the manifest carries an
`avifSrcset`. Any selector written as a direct child of the layout parent —
`.gallery > img`, `.card > img:first-child` — now has a `<picture>` in between
and matches nothing.

`picture { display: contents }` is set in `Img.astro`, which fixes **layout** —
without it a grid or flex parent starts laying out the wrapper instead of the
image, and `aspect-ratio` and `height: 100%` quietly stop applying. It does not
fix **selectors**: `display: contents` removes the box, not the element.

**Fix:** drop the `>` — `.gallery img` — or target a class on the image itself.
Search for it before turning AVIF on:

```bash
grep -rnE '>\s*img|>\s*\.?[a-z-]*img' src/styles src/components src/pages
```

### A failed optional dependency does not fail the install

**Symptom:** `astro build` dies with **"Unable to load your Astro config"** and a
stack trace ending in `workerd/lib/main.js`. The config is fine. The same
commit built cleanly an hour ago and builds cleanly on a retry.

The real message is a few lines further down: *the package
`@cloudflare/workerd-linux-64` could not be found, and is needed by workerd*.
workerd ships its ~127 MB binary as a **per-platform `optionalDependency`**, and
a failed optional dependency **does not fail `npm install` or `npm ci`** — that
is what optional means. npm reports success, with the full package count and no
warning, and the gap only surfaces when something tries to use it.

So the install says 587 packages added, and the build fails on a config file
nobody touched.

**Fix:** re-run — it is usually transient. To stop it being mysterious, assert
the binary right after install rather than letting the build discover it:

```bash
node -e 'require.resolve("@cloudflare/workerd-linux-64/bin/workerd")'
```

The kit's own CI does this (`.github/workflows/kit.yml`), because a check that
fails at the step that caused it is worth more than one that fails twenty lines
into an unrelated tool.

**If it repeats rather than passing on retry**, the lockfile genuinely lacks that
platform: run `npm install` on the target platform and commit the result. Verify
with `npm ci --os=linux --cpu=x64` on any machine — npm 10+ can resolve another
platform's tree without being on it.

### Moving the apex takes the client's email with it

**Symptom:** none, for days. The site launches, everything looks right, and the
client says nothing because from where they sit nothing happened. Then someone
mentions an invoice that never arrived.

A rebuild moves the apex — or the nameservers — to the new host. Every other
record in that zone belongs to somebody else's service, and **MX is the one that
takes the business down with it.** Mail to the domain starts bouncing at the
sender's end, so the people who find out are the ones trying to reach the
client, and none of them can tell the client.

A dead website gets a phone call in minutes. Dead email is silent, and the
silence looks like a quiet week.

**Fix:** capture the zone before touching it, and diff it after.

```bash
npm run dns -- example.com              # before. commit recon/dns.json
npm run dns -- example.com --compare    # after cutover: what stopped resolving
```

The same applies to SPF, DKIM and DMARC, with a slower symptom: losing those
does not bounce mail, it degrades deliverability, so it surfaces weeks later as
"our emails started going to spam".

**And check CAA before the cutover, not during.** A CAA record that names no CA
your host issues through blocks certificate issuance — the deploy succeeds, DNS
cuts over, and the site serves a TLS error that nothing in the repo can fix.

### `Disallow: /` and `noindex` cancel each other out

**Symptom:** a staging URL appears in Google — no snippet, just the URL and
often "No information is available for this page". The page has carried
`<meta name="robots" content="noindex">` since the day it was built.

The two controls do different jobs and the combination is self-defeating:

- `robots.txt` `Disallow: /` stops the crawler **fetching** the page
- `noindex` stops it **indexing** the page — but only if it fetches it and reads
  the tag

Block crawling and Googlebot never sees the noindex. It can still index the URL
from a link elsewhere: a client sharing the staging link in a chat that unfurls,
a Search Console submission, one backlink. What gets indexed is a bare URL that
competes with production for the client's own name.

**Fix, in order of how well it works:**

1. **Put staging behind Cloudflare Access.** Nothing crawls what it cannot
   reach, the question stops existing, and it is free at this scale on a stack
   you are already using. This is the answer.
2. If it must be public: **allow crawling and serve `noindex`.** Counter-
   intuitive and correct — the tag only works when it is read.
3. Add `X-Robots-Tag: noindex` as well, which is the only one of the three that
   covers **non-HTML**. A PDF has no `<meta>`; a staging PDF is indexable no
   matter what the pages around it say.

**Never rely on `Disallow` alone to keep something out of the index.** It is a
crawling instruction, not an indexing one, and Google's own documentation says
so plainly.

### A duplicate path in `_headers` replaces the earlier block, it does not merge

**Symptom:** security headers stop being sent. The file still contains them, the
build still reports the same number of parsed rules, and nothing anywhere says a
rule was dropped.

Adding a second `/*` block to add one header removed `Referrer-Policy`,
`Permissions-Policy` and the CSP from every response. The later block wins
outright — `_headers` matches a path to **one** rule set, not to all that match.

```
/*
  X-Robots-Tag: noindex        ← this block

/*
  Referrer-Policy: …           ← silently replaces the one above
```

**Fix:** merge into the existing block for that path, never append a second one.

The related one, same file: **an inline `#` is not a comment.** Only a line that
*starts* with `#` is. A trailing note goes out as part of the header value —
`X-Robots-Tag: noindex, nofollow, noarchive   # staging only` was sent verbatim
to every crawler, and reading the file is exactly how you fail to notice.

Both are invisible in the repo and visible in one command:

```bash
curl -sI https://example.com/ | grep -iE 'referrer|permissions|content-security|x-robots'
```

`npm run verify` checks the three security headers for this reason.

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
