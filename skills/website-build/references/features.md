# Features that need a decision, not a checkbox

The catalogue in [`kickoff.md`](kickoff.md) §2 is a checklist — most items are a yes or a no.
These are the ones where the *yes* has a shape, and where getting the shape wrong costs a
rebuild rather than an afternoon.

None of them ship in the template. Each is a project decision, and a template that shipped them
would be making that decision for every site built from it.

---

## 1. The 404

**Always. Non-negotiable.** ✅

The failure is not that it looks plain — it is that **it returns 200**. A "pretty 404" served
with a 200 status is a soft 404: search engines index it, every broken link becomes a duplicate
thin page, and nothing anywhere reports a problem.

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://site.com/definitely-not-a-page   # must be 404
```

What it must do, in order of value:

1. **Return a real 404 status.** Test it on the deployed site; frameworks and hosts both get
   this wrong, and a local dev server usually models it differently
2. **Offer specific routes onward**, not a link to the homepage. Someone who hit a dead service
   URL wants the services page
3. **Carry the primary conversion.** For a phone-call business the number belongs here — this
   visitor was looking for you and found nothing
4. **Be `noindex`**

**Watch the 404 log in week one.** Real 404s are URLs the migration inventory missed, and each
one is a redirect you owe. This is the single cheapest source of recovered traffic after a
rebuild.

---

## 2. Search

**Default: none, under ~50 pages.** ✅ Below that it is furniture — the navigation is the
search, and an empty results page is worse than no box.

Above it, decide **page or instant** first; they are different builds.

| | When | Cost |
| --- | --- | --- |
| **Results page** at `/search?q=` ✅ | Almost always. Linkable, shareable, indexable, works with JS off, and you can see what people searched for | A page and a query param |
| **Instant / overlay** | Documentation, large catalogues, or when search *is* the navigation | Client JS on every page, a focus-management problem, and a keyboard trap waiting to happen |

**Static-first default: Pagefind.** ✅ It indexes the built output at the end of the build, ships
a fragmented index the browser fetches on demand, and needs no service, no key and no monthly
cost. It suits the kit's stack because it operates on `dist/`, not on a database.

| Alternative | When |
| --- | --- |
| **Fuse.js over a generated JSON index** | Under ~200 pages and you want full control. You are hand-rolling ranking, which is more work than it sounds |
| **Algolia / Typesense** | Genuine scale, typo tolerance and analytics matter, and someone will pay monthly |
| **Cloudflare AI Search / Vectorize** | Semantic "what do I do about X" queries rather than keyword matching. Real cost, real latency — justify it |

Whatever you pick: **the input is a `<label>`ed form**, the results page is reachable and
indexable, and it announces its result count to a live region. A search box that only works with
JavaScript is a dead end for whoever needs it most.

---

## 3. Light / dark / auto

**Ask before building it.** Dark mode is not free and not universally wanted — for many local
services and professional-services sites there is no audience for it, and the cost is real:

- **Every colour decision doubles.** Contrast must clear 4.5:1 in *both* themes, and the
  brand-tinted shadows, borders and overlays that make a light palette feel considered often
  read as muddy inverted
- **Every image with baked-in background** needs a second treatment. Credential badges are the
  usual casualty — near-white artwork on a now-white surface
- **Screenshots and social cards** are produced in one theme and look wrong in the other

Say yes when the audience is developer-adjacent, the site is read at length, or the brand is
already dark. Say no when it is a five-page brochure.

### If yes: three states, not two

`system` (default) · `light` · `dark`. **A two-state toggle is a bug** — once someone clicks it
they can never get back to following their OS, which is what most people actually want.

### The trap: a flash of the wrong theme

Rendering light and correcting to dark after hydration produces a white flash on every load for
exactly the users who chose dark. It is the reason most implementations feel cheap.

**The fix must be a blocking inline script in `<head>`, before any stylesheet paints.** Not a
module, not deferred, not in a component that hydrates.

```html
<!-- in <head>, before styles. Blocking on purpose — this is the one script that must be. -->
<script is:inline>
  const stored = localStorage.getItem('theme');           // 'light' | 'dark' | null
  const dark = stored === 'dark' ||
    (!stored && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
</script>
```

`color-scheme` is the part people miss: it is what makes form controls, scrollbars and the
browser's own UI match. Without it the page is dark and the select dropdown is white.

### Wire it to the tokens, never to components

The template's semantic layer already does the work — `--bg`, `--text`, `--border`, `--surface`.
A theme redefines those and every component inverts without knowing it did.

```css
:root { --bg: #fff; --text: #111; }

/* Follow the OS when nothing is stored. */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) { --bg: #0f1211; --text: #e8e8e6; }
}
/* An explicit choice always wins. */
:root[data-theme='dark'] { --bg: #0f1211; --text: #e8e8e6; }
```

Note the `:not([data-theme='light'])` — without it, choosing light on a dark-set OS does nothing,
which is the second most common bug after the flash.

**The control itself:** a real `<button>` that reports state (`aria-pressed`, or a three-way
group with `aria-checked`), never a bare icon with no accessible name. With JavaScript off it
should not render at all — a control that does nothing is worse than an absent one, and the page
still follows the OS correctly without it.

**`.on-dark` sections are a separate thing** and keep working. A dark band inside a light page is
a layout device; the theme is a user preference. Do not collapse them.

---

## 4. Multilingual

**Decide before building routes, never after.** ✅ Retrofitting i18n means re-planning every URL,
and on a migration it means re-planning every redirect too. This is the single most expensive
"we'll add it later" in the catalogue.

### URL strategy — pick one, up front

| | Use when | Note |
| --- | --- | --- |
| **Subdirectory** `/es/` ✅ | Almost always | One domain, one certificate, authority stays in one place. The default unless something forces otherwise |
| **Subdomain** `es.site.com` | Separate teams or infrastructure per language | Splits authority; more DNS and certificate work |
| **ccTLD** `site.es` | Genuinely separate legal entities or markets | Most expensive by far. A real business reason, not a preference |

**Decide the default locale's prefix too.** `/` and `/en/` both work; serving the same content at
both is a duplicate-content bug. Pick one and redirect the other.

### hreflang, and the two mistakes

Every page links to **every** translation of itself, **including itself**, and the set must be
reciprocal — if `/es/precios/` points at `/pricing/`, `/pricing/` must point back.

```html
<link rel="alternate" hreflang="en" href="https://site.com/pricing/" />
<link rel="alternate" hreflang="es" href="https://site.com/es/precios/" />
<link rel="alternate" hreflang="x-default" href="https://site.com/pricing/" />
```

1. **Missing `x-default`** — it tells search engines what to serve for an unmatched language.
   Omit it and the choice is made for you
2. **Non-reciprocal tags** — Search Console reports these, eventually, in a report nobody opens.
   Generate them from one data structure so they cannot disagree

### The rest

- **Translated slugs, not just translated content.** `/es/pricing/` is a missed keyword and reads
  as unfinished to a Spanish speaker
- **Never machine-translate and publish unreviewed.** It is worse than not offering the language,
  because it makes the business look careless in a market it is trying to enter
- **The content model carries the locale**, so a missing translation is a build error or an
  explicit fallback — never a silently English page under a Spanish URL
- **Language switching is a link, not JavaScript**, and it goes to the *equivalent page*, not the
  homepage of the other language
- **Do not auto-redirect by IP or `Accept-Language`.** It traps anyone whose location and
  language differ, and search crawlers see one version. Offer, do not decide
- **Everything else multiplies**: the sitemap, the business facts, the structured data, the
  transactional email templates, and the accessibility statement

---

## 5. Keyboard shortcuts and command palettes

**Default: no.** ✅ A command palette is application furniture. On a marketing site nobody
presses `⌘K`, and it costs JavaScript, a focus trap and a keyboard-accessibility surface for a
feature almost nobody discovers.

What is genuinely worth having, and is not optional:

| | Why |
| --- | --- |
| **A skip link** ✅ | WCAG 2.4.1. Must move *focus*, not just scroll — see `compliance.md` §8 |
| **`Escape` closes** any overlay, menu or dialog ✅ | Expected behaviour; its absence is a trap |
| **Focus returns** to the control that opened the thing ✅ | Otherwise focus lands at the top of the document |
| **`/` focuses search** | Only if search exists and is prominent. Must not fire while typing in another field — check `event.target` |

If a client asks for `⌘K` anyway: name the instinct — they want the site to feel fast and
considered — and point at what actually delivers that, which is `archetypes.md` and the premium
levers in `kickoff.md` §3. Then build it if reaffirmed, and make it properly accessible.

---

## 6. First-visit brand overlay

**Default: no.** It costs LCP on the visit that matters most, and it is the one feature where
"it looked nice in the comp" and "it made the site slower" are the same decision.

Say yes only when the brand mark is doing real work — a studio, a practice, something where
the name is the product — and the client has asked for it knowingly, with the number in front
of them.

### The number

Measured on `expressducttest.com`, same LCP element, same connection:

| Overlay timing | LCP cost |
| --- | --- |
| 720ms delay + 420ms fade | **+628ms** |
| 260ms delay + 300ms fade | **+160ms** |

Covering the page delays when Chrome considers content painted, so the overlay's total
duration is roughly the LCP cost. There is no clever way around that — it is what covering the
page means. Quote the number before agreeing to it, and re-measure if the timings move.

### If yes, four rules

- **The page renders underneath it.** Decoration over painted content, never a gate in front
  of an empty document
- **CSS dismisses it, not JavaScript.** A keyframe with a fixed delay and `fill-mode: forwards`
  clears on its own even if every script fails. JS may only bring the dismissal *forward*. A
  JS-driven overlay that never gets its hide call leaves a blank white screen over a working
  site — the worst failure this component could have, and it fails silently
- **Once per session**, flagged by an inline `<head>` script before first paint, so a repeat
  visit never flashes it. Namespace the storage key to the project — a shared key like
  `edt-preloaded` is another client's name in this client's browser
- **A floor as well as a ceiling.** Without a minimum on-screen time it is dismissed the
  instant the DOM is ready, which on a warm load is a few dozen milliseconds — a flash that
  reads as a rendering glitch rather than branding. Either it is on screen long enough to
  register, or it should not be there

### Give it a preview URL

Anything that shows once and then hides itself — this overlay, a promo pop-up, a cookie
banner, a first-run tip — becomes **unreviewable the moment it works**. The client asks to see
it, you send a link, and they see nothing, because they already dismissed it last week.

Ship a `?popup=1` (or `?overlay=1`) parameter that forces it on, bypassing both the delay timer
and the dismissal flag. One condition in the same check that reads the storage key.

It costs a line and it replaces the alternative, which is talking a non-technical client
through clearing site data in a browser you cannot see. Same reason the parameter is worth
having in review as in handover: you will change the timings four times.

Keep it read-only — forcing it on must not *write* the dismissal flag, or previewing it
consumes the visitor's one showing.

Not in the template, for the same reason nothing else in this file is.

---

## 7. Adjacent, and quickly

| | Default |
| --- | --- |
| **Print styles** | ✅ Worth the twenty minutes on anything with pricing, an address or a quote. Hide nav, footer chrome and CTAs; show link URLs; do not print a dark theme. The template's `no-print` class is the hook |
| **RSS** | ✅ If there is a blog. Preserve the old feed path with a redirect — see `stacks.md` §1d |
| **PWA / installability** | Only if there is a genuine repeat-use case. A manifest and an icon set is not a reason |
| **Breadcrumbs** | ✅ On anything more than two levels deep, with `BreadcrumbList` schema |
| **Reading time, table of contents** | ✅ On long-form. Generate the TOC from real headings, never hand-maintained |
| **Related posts** | ✅ By shared taxonomy weight. Better than "latest three" |
| **Newsletter signup** | Fine inline; never a modal on first paint. See the "deliberately not offered" list in `kickoff.md` §2 |
