# Stacks and providers

Every decision that has a default, what the default is, and the specific reason you would
deviate. Read alongside `kickoff.md` (discovery) and `website-build.md` (how to build).

**The house default, in one line:** Astro static → Cloudflare Workers → assets on the worker
(R2 past ~15 MB) → PagesCMS → Brevo → KV → GA4 + Cloudflare Web Analytics → Turnstile.

Deviate on evidence, not preference. Every row below says what that evidence looks like.

---

## 1. Migrating from — extraction playbook

**Universal rule: capture the rendered HTML.** Page-builder output in the database is
shortcode soup or serialised JSON; the rendered page is clean semantic markup. Crawl the
sitemap, save each page, extract from that.

```bash
curl -s https://old-site.com/sitemap_index.xml           # or /sitemap.xml, /wp-sitemap.xml
# then fetch each <loc>, saving rendered HTML per URL
```

### WordPress

| Builder | How to tell | What to do |
| --- | --- | --- |
| **Classic / Gutenberg** | `wp-block-*` classes | The one case where the API is fine: `/wp-json/wp/v2/posts?per_page=100&_embed`. Block markup converts to markdown cleanly |
| **Elementor** | `elementor-widget-*`, `/wp-content/uploads/elementor/css/post-N.css` | Rendered HTML only. `post-5.css` is the global kit (brand colours, fonts); `post-N.css` is per page — mine both for exact design values |
| **WPBakery** | `[vc_row]` in raw content, `vc_` classes | Rendered HTML only. Shortcodes are unrecoverable without the plugin |
| **Divi** | `[et_pb_section]`, `et_pb_` classes | Rendered HTML only. Divi also injects a large dynamic CSS file worth reading for tokens |
| **Bricks** | `brxe-*` classes | Content lives as JSON in `_bricks_page_content_2` postmeta — readable if you have DB access, but rendered HTML is still faster and safer |
| **Oxygen** | `ct-section`, `oxy-` classes | JSON in postmeta. Rendered HTML |
| **Beaver Builder** | `fl-builder-content`, `fl-node-*` | Rendered HTML |

**Always also pull:**
- **SEO plugin export** — Rank Math, Yoast or AIOSEO. Contains per-URL titles and
  descriptions (your parity baseline), the **redirect table with hit counts**, and the
  business facts: NAP, hours, price range, social profiles, logo, default OG image
- **Theme customiser values** — Astra, GeneratePress, Kadence and Blocksy all expose global
  colours as CSS custom properties in the rendered `<head>`. Exact brand hexes, free
- **Media library originals** — strip WordPress's `-300x200` size suffixes and Elementor's
  `/uploads/elementor/thumbs/` crops; you want the source file
- **`/feed/`, `/wp-json/`, category and author URLs** — all need redirect decisions

**Strip on the way in:** lazy-load placeholders (`data-src`, base64 blur), tracking
wrappers, `wp-block-*` and builder classes, hand-rolled tables of contents whose anchors you
will regenerate, and `<img>` `srcset` pointing at generated sizes.

### Other sources

| From | Approach |
| --- | --- |
| **Webflow** | Export gives static HTML/CSS — usable for design reference. CMS collections via the Data API. Watch for Webflow-specific classes and their interactions |
| **Squarespace** | No usable export. Crawl. `/sitemap.xml` exists. Their WordPress export is lossy — do not trust it |
| **Wix** | Markup is JS-rendered — `curl` returns an empty shell. Drive a real browser (§1c); the rendered DOM is the only extractable copy. The worst migration of the set; budget extra |
| **Shopify** | Storefront API for products. Only migrate the *marketing* pages; leave commerce on Shopify unless there is a strong reason |
| **Ghost** | Clean JSON export via admin, or Content API. Easiest migration you will get |
| **Drupal / Joomla** | JSON:API or the database. Taxonomy usually needs remapping |
| **HubSpot CMS** | HubDB and the CMS API. Check what marketing automation is load-bearing before unplugging anything |
| **Jekyll / Hugo / 11ty** | Already markdown. Convert frontmatter keys, keep the content |
| **Framer** | Crawl with a real browser (§1c) — JS-rendered, no meaningful export |

### Before you touch anything

**Capture everything you could lose, before you touch any of it.** Three commands, all
writing to `recon/`, all worth committing — together they are the rollback artefact:

```bash
npm run recon -- https://old-site.com     # URLs, preserved paths, integrations
npm run dns   -- old-site.com             # the zone: MX, SPF/DKIM/DMARC, CAA, verification TXT
npm run seo   -- https://old-site.com --json recon/seo-before.json --fail-on never
```

**The DNS one is the most consequential and the kit went months without it.** A rebuild moves
the apex; every other record in that zone belongs to somebody else's service. Losing **MX**
kills the client's email, and it fails silently — the bounces go to the sender, so the people
who find out cannot tell the client. `traps.md` has the entry.

**The SEO capture is a baseline, not a report.** Titles, descriptions and structured data on
the old site are the thing a migration quietly loses, and `--baseline` turns that into a
diff after cutover rather than an argument. Optional — see §7.

`npm run recon` writes `recon/urls.txt` (the inventory every later step reads),
`recon/preserved.md` and `recon/integrations.md`. It resolves which sitemap filename is canonical, pulls URLs the
current sitemap has forgotten out of the Wayback Machine, and detects the analytics IDs and
vendors in §1b below. **It never reports a failed archive lookup as "no archived URLs"** —
that distinction is the whole point of consulting it.

Then take the rest of the inventory by hand: template families, forms, media assets, and
anything a crawl cannot see. Then check the client's folders for **finished work never shipped** — drafted posts, a
content plan, unpublished pages. On the last build there were seven completed articles
sitting in a folder.

---

## 1b. What is bolted on — the integration inventory

The builder decides how you extract. **The integrations decide what you must not break**, and
they are where migrations actually go wrong: nobody mentions the booking widget until the week
after launch, when the calendar stops filling.

**Detect first, ask second.** Most of it is visible in the markup you already crawled.

```bash
# over the saved rendered HTML
grep -rhoE 'G-[A-Z0-9]{8,}|GTM-[A-Z0-9]{6,}|AW-[0-9]{9,}|UA-[0-9]{4,}-[0-9]' . | sort -u
grep -rhoiE '(calendly|cal\.com|hubspot|klaviyo|mailchimp|intercom|crisp|tawk|drift|zendesk|trustpilot|birdeye|yotpo|stripe|recaptcha|hotjar|clarity|typeform|jotform|acuity|housecallpro|jobber|servicetitan)[a-z0-9.-]*' . | sort -u
grep -rhoE '<form[^>]+action="[^"]+"' . | sort -u        # where forms actually post
grep -rhoE 'src="https?://(?!…)[^"/]+' . | sort -u        # every third-party origin
curl -sI https://old-site.com | grep -iE 'server|x-powered-by|cf-|x-pingback'
```

Then ask the client only for what markup cannot show you: **who owns each account, and is
anyone still using the data in it.**

| Bolted on | What it forces | Default |
| --- | --- | --- |
| **GA4 / GTM / Ads / Meta pixel** | IDs must carry over *exactly*, or reporting breaks at the join. Conversion goals are usually configured against the **old URLs and old form selectors** — both change | Port the IDs, re-point the goals, production-only. Confirm who has admin before launch day |
| **CRM or booking** — HubSpot, Jobber, Housecall Pro, ServiceTitan, Calendly, Cal.com, Acuity | The form is not the deliverable; the **record in their system** is. Field names and hidden source fields must match or leads land unattributed | Keep their tool, re-point the form. Never migrate a CRM as part of a website rebuild |
| **Email marketing** — Mailchimp, Klaviyo, Brevo lists | List subscription is a *different* integration from transactional mail, and clients conflate them. Double opt-in flows have their own hosted pages and URLs | Keep the provider, port the signup form. Transactional stays separate — see §5 |
| **Payments** — Stripe, PayPal, WooCommerce | If money moves, this is no longer a marketing-site brief. Read the note in §1 on Shopify | Leave commerce where it is. Marketing pages migrate; checkout does not |
| **Membership / gated content** — MemberPress, WooCommerce Memberships | Authentication and per-user state. Out of scope for this kit, and it will not shrink | Say so before quoting, not after |
| **Live chat** — Intercom, Crisp, Tawk, Drift | Costs LCP on every page and usually nobody is answering it | Ask for 30 days of response-time data. If replies take hours, a phone number outperforms it |
| **Reviews** — Trustpilot, Birdeye, Yotpo widgets | Page weight, and the schema often duplicates yours | Static hand-picked quotes + `Review` schema, unless the live badge is contractual |
| **Spam** — reCAPTCHA v2/v3 | Google's key does not move to a new domain automatically, and v3 scores need tuning per site | Honeypot + server validation; Turnstile when spam appears |
| **Consent banner** — CookieYes, Cookiebot, Complianz | Usually configured for cookies the new site will not set. Porting it wholesale describes tracking that no longer happens | Re-derive from what the new site actually sets. Often: nothing needed |
| **Search / heatmaps** — Hotjar, Clarity, Algolia | Rarely load-bearing, frequently forgotten in the bill | Ask whether anyone opened it this quarter |
| **Custom plugin behaviour** — quote calculators, availability lookups, price tables | The one category with no drop-in replacement. It is bespoke work and needs its own estimate | Inventory it explicitly and price it separately, before agreeing a scope |

**Three questions per integration**, and none of them is "do you use it":

1. **Who owns the account** — the client, a previous agency, or someone unreachable? An
   unreachable owner on a GA4 property or a domain registrar blocks go-live, not launch day.
2. **Does it need to keep working on the new site**, or was it inherited and forgotten?
3. **Where does its data live**, and does anything need exporting before the old site dies?

Write the answers into the handover. The list of what was *deliberately dropped* matters as
much as what was carried — it is the difference between a decision and an omission.

### Every integration becomes a roadmap line

Detection produces a **checklist**, not prose. It goes into `BUILD-STATE.md` (see
[`build.md`](build.md) §3) and each line ships and gets ticked individually, because
"integrations" as a single task is the one that silently ships at 80%.

```
## Integrations
- [x] GA4 · G-XXXXXXXXXX · ported · prod-only · verified in Realtime
- [x] Calendly · embed on /contact · test booking landed
- [ ] Mailchimp · audience 3a7f9c · signup form not wired      ← next
- [ ] Meta Pixel · ⚠ NO ID FOUND — requested from client 2 Aug
- [x] Trustpilot · dropped, agreed 1 Aug — page weight, not contractual
- [ ] reCAPTCHA v3 · replacing with Turnstile · key not yet issued
```

**Every line ends in a verified state or an explicit drop with a date.** No third state. A blank
line item at go-live is how a conversion goal stops recording for a month before anyone notices.

### When you cannot find the ID

Common — the markup shows the vendor but the credential is server-side, the tag fired through
GTM, or the account belongs to someone who left. **Do not guess and do not silently skip it.**
Give the client one message with exactly what to fetch, where to click, and the official doc.

| Integration | What you need | Where they click | Docs |
| --- | --- | --- | --- |
| **GA4** | Measurement ID `G-XXXXXXXXXX` | Admin → Data streams → the web stream | [Find your ID](https://support.google.com/analytics/answer/9539598) |
| **Google Tag Manager** | Container ID `GTM-XXXXXXX` | Workspace header, beside the container name | [Tag Manager help](https://support.google.com/tagmanager) |
| **Google Ads** | Conversion ID `AW-…` + label | Goals → Conversions → the action → Tag setup | [Google Ads help](https://support.google.com/google-ads) |
| **Search Console** | Verification method already in use, and *ownership* | Settings → Ownership verification | [Verify your site](https://support.google.com/webmasters/answer/9008080) |
| **Meta Pixel** | Pixel ID (15–16 digits) | Events Manager → Data sources → the pixel | [Meta Pixel docs](https://developers.facebook.com/docs/meta-pixel) |
| **Brevo** | API v3 key + a **verified** sender address | Profile → SMTP & API → API keys | [Brevo developers](https://developers.brevo.com/) |
| **Mailchimp** | API key + audience ID | Account → Extras → API keys; Audience → Settings | [Mailchimp developer](https://mailchimp.com/developer/) |
| **Klaviyo** | Public API key (site ID) + list ID | Settings → API keys | [Klaviyo developers](https://developers.klaviyo.com/) |
| **HubSpot** | Portal ID + form GUID | Settings → Account; Marketing → Forms → Embed | [HubSpot developers](https://developers.hubspot.com/) |
| **Calendly** | Event type URL, or a token for the API | The event type → Share | [Calendly developer](https://developer.calendly.com/) · [Help](https://calendly.com/help) |
| **Stripe** | Publishable + secret key, **live not test** | Developers → API keys | [Stripe API keys](https://docs.stripe.com/keys) |
| **reCAPTCHA** | Site key + secret, **registered for the new domain** | admin.google.com/recaptcha → the site | [reCAPTCHA docs](https://developers.google.com/recaptcha) |
| **Turnstile** ✅ | Site key + secret | Dashboard → Turnstile → Add site | [Turnstile docs](https://developers.cloudflare.com/turnstile/) |
| **Cloudflare Web Analytics** ✅ | Site token | Dashboard → Analytics → Web Analytics | [Web Analytics docs](https://developers.cloudflare.com/web-analytics/) |

Three things to say in that message, because they are the ones that come back a week later:

- **Which environment.** Live keys, not test. A Stripe test key works perfectly and moves no money.
- **Domain-bound credentials must be re-registered**, not copied. reCAPTCHA keys are tied to a
  domain list; so are some pixel and Maps keys. Copying them across produces a silent failure on
  the new host.
- **Never in chat or the repo.** Platform secret store only. If a key does arrive in plain text,
  use it, say once that it must be rotated, then stop raising it.

Until it arrives, the roadmap line stays `⚠ NO ID FOUND` with the date requested. Visible and
blocking beats quietly omitted.

### Write down where the boundary is

The inventory above records *what* each integration is and whether it works. Also record, in
one short document, **which surfaces belong to the vendor and which belong to you** — what is
embedded, what is linked out to, and why.

Without it, someone rebuilds a flow that already exists. If the booking system owns scheduling,
payment and class times, then a "book now" button that links out is the correct answer and a
hand-built booking form is weeks of work plus a second source of truth for prices. That is not
obvious from the markup six months later, and it is exactly the kind of thing a new person
"improves".

Three lines per integration is enough: what it owns, where the seam is, and what you
deliberately did *not* build. Note anything the vendor renders that you cannot restyle from
your own stylesheet, because that is the constraint people forget when a redesign starts.

Chat, booking and review widgets are the heaviest thing on most marketing sites and the least
urgent. One measured **105 KiB against 44 KiB for all of the site's own HTML and CSS**. It was
not render-blocking — Total Blocking Time was 10ms — but `async` scripts are requested at
**high priority** and compete for bandwidth on a slow connection, which is where it hurts.

Load on **first interaction (pointer, key, touch, scroll) OR a few seconds after `load`,
whichever comes first**. Interaction-first matters: someone who came to use the chat should not
be made to wait out a timer, and a timer alone punishes exactly the visitor who wants it.

Two things that cost real time:

- **Set every attribute before `src`.** Assigning `src` can begin the fetch, and vendor plugins
  read their configuration from attributes at execution — set them after and the widget loads
  unconfigured, which usually renders nothing and reports no error.
- **A framework may strip the custom attributes that ARE the configuration.** If a vendor embed
  renders blank, check the served HTML for the attributes before debugging the vendor.

Measure it honestly — see `build.md` §2 on applied versus simulated throttling.

---

## 1c. Use a real browser — Claude in Chrome

**Recommend the user install Google Chrome with the Claude extension before recon.** `curl`
returns markup; a browser returns *the page*. Three things need the second, and the kit has no
substitute for any of them.

| Need | Why `curl` cannot | What the browser gives |
| --- | --- | --- |
| **JS-rendered sources** — Wix, Framer, some Squarespace and headless setups | The response is an empty shell; the content arrives from JavaScript | The rendered DOM, which is the only extractable copy that exists |
| **Design extraction** | Stylesheets do not tell you which rule won | Computed styles — the actual hex, the actual font stack, the actual spacing |
| **Visual verification** | A 200 says nothing about whether the page *looks* right | Screenshots at real viewports, plus console errors and failed network requests |

It runs in the user's **existing Chrome session**, which is the underrated part: it can read
authenticated dashboards nothing else in this kit can reach — Search Console coverage, GA4
property settings, the Cloudflare dashboard, the old site's WordPress admin. That is often
faster than asking the client to export something and wait.

**Use it for:**

- **Recon on anything JS-rendered.** Otherwise you are extracting from an empty shell and will
  not notice until the content is missing
- **Sampling one page per template family visually**, so a layout that builds cleanly and looks
  broken gets caught at phase 4 rather than by the client
- **Reading console and network on the deployed site** — a failed third-party request, a CSP
  block or a 404 asset is invisible to a status-code check
- **Before/after screenshots** for the handover — `npm run shots -- --before <old site>` while
  it is still up, `-- --after` once the new one is deployed. Both sides read `recon/urls.txt`,
  so the pairs cannot drift and a page that did not survive shows as a 404 beside its old
  screenshot. A migration with no visual record is hard to defend when someone misremembers
  the old site
- **Checking focus visibility and the keyboard path** in situ, which no automated tool reports

**What it does not replace:**

- **A real device.** Emulated widths do not model browser chrome, touch latency or how fast the
  thing actually feels. `kickoff.md` §4 stands
- **Lighthouse on the deployed URL** for performance numbers
- **A screen-reader pass.** Rendering correctly and being announced correctly are different questions

Avoid clicking anything that triggers a JavaScript `alert`, `confirm` or a browser modal — a
blocking dialog freezes the automation until someone dismisses it by hand.

---

## 1d. Paths and identifiers you must not change

Search Console, Bing, ad platforms and verification services all point at **specific URLs on the
old site**. A rebuild that changes those paths breaks the link silently — the console reports it
days later, in an email nobody opens.

**Record the exact paths at recon, before designing routes.**

```bash
curl -s https://old-site.com/robots.txt                   # the sitemap line is the source of truth
curl -sI https://old-site.com/sitemap_index.xml           # which of the four naming conventions
curl -s https://old-site.com/ | grep -oE 'name="(google-site-verification|msvalidate\.01|facebook-domain-verification)"[^>]*'
for p in ads.txt BingSiteAuth.xml sitemap.xml sitemap_index.xml wp-sitemap.xml feed/ rss.xml; do
  printf '%-22s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' "https://old-site.com/$p")"
done
```

| Old path | Why it matters | Do |
| --- | --- | --- |
| **The sitemap filename** | GSC and Bing store the submitted URL. Change it and the stored entry 404s — the property keeps the old one and reports "Couldn't fetch" | **Emit at the old path.** See below |
| `robots.txt` `Sitemap:` line | The discovery route for every other crawler | Point it at the same path you emitted |
| `google<hash>.html` | HTML-file verification drops the moment the file stops resolving, and losing verification loses the property's data access | Carry the file over byte-for-byte, or switch to DNS TXT first and confirm before launch |
| `BingSiteAuth.xml`, `msvalidate.01` meta | Same for Bing | Same |
| `facebook-domain-verification` meta | Ad account domain verification | Carry the meta tag |
| **Paginated archives** — `/blog/page/2/`, `/category/x/page/3/` | WordPress's shape, and Astro's `paginate()` emits `/blog/2/` instead. Page two then exists at one URL and the old one 404s — invisible unless someone requests it | Build the paths by hand with the literal `page/N` in the rest param. `traps.md` has the entry |
| `/feed/`, `/comments/feed/` | Subscribers, aggregators and syndication partners | 301 to the new feed path — do not just drop it |
| `ads.txt`, `app-ads.txt` | Programmatic revenue stops without it, with no error anywhere | Copy verbatim |
| `/.well-known/*` | Domain association files for payments, apps, single sign-on | Copy the directory wholesale |

**The sitemap one specifically, because the naming is a trap.** WordPress emits
`/sitemap_index.xml` (Yoast, Rank Math) or `/wp-sitemap.xml` (core). `@astrojs/sitemap` emits
`/sitemap-index.xml` — **underscore becomes a hyphen**, which reads as identical and is not.

```js
// astro.config.mjs — match the old filename so the GSC entry keeps resolving
sitemap({ customPages: [...] })   // emits /sitemap-index.xml
```

```
# public/_redirects — belt and braces
/sitemap_index.xml   /sitemap-index.xml   301
/wp-sitemap.xml      /sitemap-index.xml   301
```

A 301 is followed and works. Serving at the original path is still better: the console shows a
clean 200 against the URL it has stored, and nobody has to re-submit anything. **Re-submitting is
not hard — remembering that it needs doing, six weeks later, is.**

Then verify against the deployed site: fetch the old sitemap URL and confirm it resolves 200 or
301s to a 200, and re-check the property in [Search Console](https://support.google.com/webmasters/answer/7451001)
and [Bing Webmaster Tools](https://www.bing.com/webmasters/help/help-center-661b2d18) after go-live.

**`npm run redirects` proposes the map** from `recon/urls.txt` against the new site's routes,
and writes `recon/redirects.proposed` — never `public/_redirects`. It refuses to propose the
homepage for a specific page, holds admin paths back as must-404, and holds machine-readable
paths back per the rule below.

### Regenerate what systems parse; redirect what people visit

A 301 is the right answer for a page a human opens. It is the **wrong** answer for a file
another system fetches and parses, because the consumer expects a data format and a redirect
hands it HTML.

One old site's local sitemap referenced a `.kml` file. It is regenerated from the business data
at the original path, not redirected — a directory that fetches and parses KML gets KML. The
same reasoning covers `ads.txt`, `.well-known/*` and any feed a partner ingests: **serve the
format at the path, do not point somewhere else and hope the client follows.**

**And name the exceptions in `_redirects` as a habit.** The paths you deliberately did *not*
redirect are invisible otherwise, and the next person re-adds them:

```
# Not redirected on purpose:
#   /wp-admin/*, /wp-login.php — must return a real 404. A 301 from an admin
#   path tells a scanner the site MOVED rather than that the path is gone,
#   which is free reconnaissance and invites the follow-up scan.
#   /old-gallery/*.jpg — the specific image no longer exists; a 301 to a page
#   is a soft 404 for an asset request.
```

---

## 2. Choosing the target stack

### Default: Astro

Static output, zero JavaScript unless a component asks for it, first-class Cloudflare
adapter, content collections with schema validation, islands when you need interactivity.
For a marketing site this is the right answer often enough that deviation needs a reason.

### When to pick something else

| Stack | Pick it when | Cost of picking it |
| --- | --- | --- |
| **Next.js** | Real application surface — auth, dashboards, per-user data, heavy React ecosystem dependency | Ships a React runtime. On Cloudflare needs OpenNext; more moving parts than Astro's adapter |
| **SvelteKit** | Team writes Svelte; want small bundles with app-like interactivity | Smaller ecosystem. Excellent Cloudflare adapter |
| **Nuxt** | Team writes Vue | Similar trade to Next: framework runtime you may not need |
| **Remix / React Router** | Data-heavy, form-heavy, progressive enhancement as a first principle | React runtime; overkill for content |
| **11ty** | Pure content, no interactivity at all, want zero framework | No component model to speak of; islands are manual |
| **Hand-written HTML** | Under ~10 pages, no content model, no repetition | Everything is manual, forever |

**The question that decides it:** is this a *site* or an *app*? A site whose most complex
interaction is a contact form is Astro. A site with logged-in state, per-user data or a
dashboard is Next/Remix/SvelteKit — and probably two projects, not one.

**Do not** pick a React framework because the client's next project might need one.

### Hosting

| Option | When |
| --- | --- |
| **Cloudflare Workers** ✅ default | Static assets + a runtime where needed, KV/R2/D1 in the same place, no cold starts, no egress fees |
| Cloudflare Pages | Legacy path; Workers with static assets is where Cloudflare is investing. New projects go to Workers |
| Vercel | Next.js with ISR and edge middleware you actually use. Watch bandwidth pricing |
| Netlify | Existing team familiarity, Netlify-specific integrations |
| Static bucket + CDN | No runtime at all. Cheapest, but you lose form handling and redirects-with-logic |

---

## 3. Media and CDN

| Option | When | Notes |
| --- | --- | --- |
| **Assets on the worker** ✅ default under ~15 MB | Marketing site with a normal image count | Simplest possible thing. Versioned with the deploy, no second system, no CORS |
| **Cloudflare R2** ✅ default past that | Image-heavy, video, or media that changes independently of deploys | Zero egress. Put it behind a CDN subdomain. Buckets send no CORS headers by default — `<img>` does not care, `fetch()` does |
| **Cloudflare Images** | You want on-the-fly transforms and variants without a build step | Per-image and per-delivery pricing; check the maths against your library size |
| **Bunny.net** | Cost-sensitive and image-heavy; Bunny Optimizer gives transforms cheaply | Genuinely inexpensive, good global POPs. A second vendor to manage |
| **ImageKit / Cloudinary** | Transformation-first workflows, DAM features, client uploads arbitrary sizes | Most capable, most expensive. Easy to over-buy for a marketing site |
| **S3 + CloudFront** | Already deep in AWS | Egress costs; more configuration than the alternatives |

⚠ **R2 HOLDING FILES PEOPLE UPLOAD IS A DIFFERENT DECISION FROM R2 HOLDING YOUR PHOTOGRAPHS.**
The row above is about a media library — your images, your risk, keep them forever. The moment a
résumé, an attachment or an ID document lands in a bucket, it is personal data in a store **with
no expiry of any kind**. See §6 for what has to be true before you publish a retention period.

**Whichever you choose, the rule holds:** content stores a *portable reference*
(`services/roofing.jpg`), never a CDN URL. Changing provider is then one change to the
generator, not a content migration.

**Build-time optimisation beats runtime transformation** for a site whose images change
weekly. `sharp` in a build step gives responsive images, a dimensions manifest and no per-image
cost. Reach for a transformation service when users upload images you cannot pre-process.

### Which formats to emit ✅ AVIF + WebP

**Not a discovery question.** A client cannot answer it and it is not a business decision —
it is a default with a condition, which is what this file is for.

| Format | Emit | Why |
| --- | --- | --- |
| **AVIF** ✅ | Every responsive photo, as a `<picture>` source | Measured below |
| **WebP** ✅ | Always, as the `<img>` fallback | Never replaced by AVIF. It is the floor every browser reads |
| **JPEG** | Social cards only | Facebook and LinkedIn still will not render a WebP `og:image` |
| **JPEG XL** ❌ | Never | Chrome removed support; Safari-only is a dead branch |

Measured on a 4096×2160 photograph through the template's own pipeline, AVIF quality chosen by
RMSE parity against `webp q78` rather than by eye:

| Width | WebP q78 | AVIF q55 | |
| --- | --- | --- | --- |
| 768 | 37.9 KB | 28.1 KB | −26%, and slightly *better* quality |
| 1200 | 81.8 KB | 60.7 KB | −26% |
| 1800 | 154.2 KB | 114.8 KB | −26% |

**q55 rather than q50.** q50 is −38% but marginally worse than the WebP it replaces, and
photography is the largest single determinant of whether a site reads as expensive
(`design.md` §2). q55 improves both axes; take q50 only when bytes genuinely outrank the last
of the quality.

**Do not raise `effort`.** At 1800px q55: effort 3 → 115.8 KB in 269ms, effort 6 → 112.2 KB in
2292ms, effort 9 → **114.4 KB in 8155ms** — thirty times the time and *larger* than effort 6.
Encoding is incremental, so it is a one-time cost per image either way.

**The cost that is not bytes:** `<Img />` becomes a `<picture>`, and a `.parent > img` selector
stops matching. See `traps.md`. Turn AVIF off for a project with `FORMATS = ['webp']` in
`optimize-media.mjs`; nothing else changes.

---

## 4. Git-based CMS

Only if a non-technical person must publish without a deploy. If developers are the only
editors, markdown in the repo is faster and has no failure mode.

| Option | When | Notes |
| --- | --- | --- |
| **PagesCMS** ✅ default on GitHub | Astro/11ty/Hugo content, GitHub-hosted | Free, hosted, YAML config in the repo, GitHub OAuth. No build step, no self-hosting |
| **Keystatic** | Astro or Next, want types and local editing | Thinkmill. First-class Astro integration, edits locally against the filesystem or via GitHub. Excellent for typed collections |
| **Sveltia CMS** | You want Decap's config with a modern UI | Drop-in Decap replacement, much faster, better media handling |
| **Decap CMS** | Legacy projects already using it | Mature but ageing; auth needs its own backend outside Netlify |
| **TinaCMS** | Client wants visual, in-context editing | Git-backed with a cloud tier for auth. Heavier setup |
| **CloudCannon** | Agency handing over to a non-technical client who needs real support | Commercial, polished, visual editing |

**Headless (not git-based) — when the content genuinely needs a database:** Sanity for
structured content and real-time collaboration; Storyblok for marketer-friendly visual
editing; Payload or Directus when you want to self-host; Contentful for enterprise
procurement. All add a network dependency to your build and a second place content can be
wrong.

**Rule:** git-based unless the client publishes several times a week, needs draft
collaboration, or has more than a handful of editors.

### What the CMS may edit, and what it must never see

**Content the client changes goes in `.json`; the reasoning and the types stay in `.ts`
beside it.** A CMS can structure-edit JSON and cannot edit TypeScript — so a data file that
mixes the two either loses its types or loses its editability. Split them: `services.json`
holds the rows, `services.ts` holds the type, the derivations and the comments explaining why
a field exists.

**Keep nav, redirects and structured data OUT of the CMS.** They look like content and they
are not: a bad value in a redirect map or a JSON-LD block should fail the build, not publish.
Anything whose failure mode is "the site is silently wrong for search engines" belongs in
code, where a type error stops it.

> ⚠ **A CMS rewrites the whole file from its schema, so any key the schema does not declare is
> dropped on first save.** Not flagged, not merged, not warned about — the editor opens a
> service, changes the price, hits save, and every field the config forgot is gone from the
> repo. It looks like a normal content commit in the diff.
>
> So: the schema must declare **every** key in the file, including ones the client will never
> touch, and adding a field to the data means adding it to the schema in the same commit.
> Review the first save from each collection as a diff before trusting it.
>
> **`npm run check:cms` enforces this.** It was written after auditing five shipped sites, where
> **all five failed** — 27 keys were at risk, including every analytics ID and the opening hours
> on one site, and the homepage images of another in three languages.

### Media, and the direction that breaks it

⚠ **Point a CMS media source at the pipeline's INPUT, never its output.** `optimize-media.mjs`
**reads** `media/source/` and **writes** `public/img/`. Two of the five audited sites uploaded
into `public/img`, where a file is servable but has no responsive variants, no width/height and
no manifest entry — so `<Img>` throws and the client's own edit turns the build red.

```yaml
media:
  - name: uploads
    label: New photographs
    input: media/source/uploads     # what `npm run media` READS
    output: /img/uploads            # what it will WRITE, once processed
    extensions: [jpg, jpeg, png, heic, heif, tif, tiff]
```

**Declare `extensions` on every media source.** It is the only layer that refuses a bad format
*in the UI*, instead of failing a build twenty minutes later.

**An image field can be a real picker.** A picker returns a public path
(`/img/photos/hero-1200.webp`), never a manifest key — so without help every image field has to be
a free-text box asking a non-technical editor to type a key from memory, which is a quiz rather
than a field. `<Img>` runs the path back through `toImageKey()`; the mapping is exact because the
pipeline writes exactly one shape, `/img/` + key + `-<width>.<ext>`. Which variant the editor
clicks does not matter, and a key ending in a digit survives.

**If uploads must work without a developer**, the build has to run `npm run media` first — the
manifest is generated, not committed by the CMS. Two things to get right:

- ⚠ **The deploy must not fire on the CMS's own commit.** That commit contains a source image and
  no manifest entry, so the build throws. Optimise first, deploy from the result.
- ⚠ **`og-cards.mjs` needs ImageMagick, which a Cloudflare build image does not have.** Not fatal —
  cards only regenerate when a card's photo changes and their output is committed — but a project
  running media in CI has to know before it finds out.

⚠ **A project forked before a pipeline change keeps the old pipeline, silently.** One shipped site
was still emitting WebP only, months after the kit added AVIF — every image on it about **26%
larger** than intended, with nothing anywhere reporting the drift. When the kit's media pipeline
changes, existing projects do not get it; say so in the handover or check it at the next visit.

---

## 5. Email

**Two different jobs. Do not confuse them.**

### Transactional — form notifications, receipts, confirmations

| Option | When | Notes |
| --- | --- | --- |
| **Brevo** ✅ default | Small business, generous free tier, marketing email in the same account later | Simple REST API, one `fetch`, good deliverability |
| **Resend** | Developer-first, want React Email templates | Clean API and DX. Newer, smaller free tier |
| **Postmark** | Deliverability is critical and you will pay for it | Best-in-class transactional reputation, separate streams |
| **AWS SES** | High volume, already on AWS | Cheapest at scale. Needs warm-up and reputation management |
| **Mailgun / SendGrid** | Existing account or specific integration | Fine; nothing they do the above do not |
| **Cloudflare Email** | Inbound routing is free and excellent. Sending is newer — check maturity before depending on it | MailChannels' free Workers relay is gone; do not follow old tutorials |

**Google Workspace is not a transactional provider.** It gives the business real mailboxes at
their domain — get it for that. Sending app notifications through Workspace SMTP hits
per-day limits and puts your form traffic on the same reputation as the owner's personal
mail. Use a transactional API.

**Non-negotiables whichever you pick:** a verified sender on the client's own domain, SPF +
DKIM + DMARC configured, key in the platform secret store, and the recipient
**environment-derived** so staging never emails the client.

### Marketing — newsletters, campaigns

Brevo (same account as transactional), Mailchimp (ubiquitous, expensive at scale), Klaviyo
(e-commerce), ConvertKit or Buttondown (writers). Keep marketing consent separate from a
contact form submission — a quote request is not a newsletter opt-in, and treating it as one
is both bad practice and, in the EU, unlawful.

---

## 6. Forms, spam and lead storage

**Storage** — write it down before calling anyone else's API:

| Option | When |
| --- | --- |
| **Cloudflare KV** ✅ default | Append-only lead log. Key `lead:<iso>:<uuid>` sorts chronologically |
| **Cloudflare D1** | You need to query, filter or report on submissions |
| **Airtable / Google Sheets** | The client wants to live in a spreadsheet. Adds an OAuth dependency |
| **CRM direct** (HubSpot, Pipedrive) | Sales team already works there — but *still* write locally first |

### A retention period must name the thing that enforces it

The template sets `leadRetentionDays` and writes it as a KV `expirationTtl`, so **the store
enforces it** and nobody has to remember. That is the standard every other store has to be held
to, and most of them fail it:

| Store | What enforces the period | Where it lives |
| --- | --- | --- |
| **Workers KV** ✅ | `expirationTtl` on the write | Your code. Reviewed, deployed, visible in the diff |
| **R2** | A **bucket lifecycle rule** | The Cloudflare dashboard — **not in the repo** |
| **D1** | A scheduled delete you write | A cron trigger you have to build |
| **A spreadsheet or CRM** | A human, on a calendar reminder | Nowhere |

⚠ **A PRIVACY NOTICE STATING A PERIOD NOTHING ENFORCES IS A FALSE STATEMENT, AND IT IS SILENT.**
The build is clean, the deploy is clean, the policy reads correctly, and the data is still there
a year later. Nothing errors, nothing logs, and the only person who ever finds out is a lawyer
reading a document that turned out not to be true.

**The R2 case is the one that catches people**, because it looks solved. A real build stored
résumés in R2 with an `applicationRetentionDays` that drove the KV record *and* the careers-page
copy — both correct, both visible in the diff — while the files themselves had no expiry at all.
It was caught by someone thinking it through, not by anything in the repo, because **a bucket
lifecycle rule is account configuration and no gate can see it**.

So: before the privacy notice goes live, name the enforcing mechanism for every store the site
writes to. If you cannot name one, either build it or change the notice. `runbook.md` §3 has it
as a go-live line.

**Reading them back** — storage is only half of it. The template ships a token-protected CSV at
`/api/leads.csv`, which is the right minimum: one route, no UI, no dependency. It is enough when
the client only ever receives the notification email and nobody needs to look at the archive.

It stops being enough the moment somebody does, and the reason is specific:

| | Template's built-in ✅ default | [`@nurkamol/leads-kit`](https://www.npmjs.com/package/@nurkamol/leads-kit) |
| --- | --- | --- |
| Auth | A bearer token **in the query string** | Cloudflare Access — verifies the assertion rather than trusting a header |
| Reading | Download a CSV and open it | Filterable list, status, summary, in the browser |
| Delete | Not offered | Audited |
| Export | CSV | CSV / JSON / XML / Mailchimp / Klaviyo, consent-aware |

⚠ **The token is in a URL, and URLs leak.** They land in server logs, browser history, `Referer`
headers and anything that proxies the request. That is an acceptable trade for a route the
developer curls once a month, and a bad one for a link the client keeps in a bookmark or pastes
into a chat. If a non-developer is going to read leads, move the auth.

`npx leads-kit init` reads the framework and KV binding out of the config already in the project,
writes the context module and routes, and **never overwrites** — an existing file is reported and
skipped, so a second run is not an error. It touches no configuration at all: bindings, secrets
and Access are decisions or live-account operations, and `--dry-run` prints the plan. Zero
dependencies, framework-free, so it runs on Workers unchanged. Then `npx leads-kit doctor --url
https://yoursite.com`.

**When not to.** If nobody will ever open it, the built-in CSV is one route and this is a second
surface to keep working. Cloudflare Access also has to be set up, which is a real-account
operation, not a build step. Offer it at discovery — [`kickoff.md`](kickoff.md) §2 — rather than
retrofitting it in week three.

**Spam, in order of preference:**
1. **Honeypot** — always, free, catches most bots. Accept silently when it trips
2. **Cloudflare Turnstile** ✅ — free, privacy-preserving, usually invisible, no puzzle
3. **Rate limiting** at the edge on the endpoint
4. hCaptcha / reCAPTCHA — only if something above proved insufficient

A quote form on a small business site does not need a CAPTCHA on day one. Honeypot plus
server validation handles the overwhelming majority; add Turnstile if real spam appears.

---

## 7. Analytics and search

### Full-site SEO audit — optional, and most useful as a baseline

**Not a required step, and not a ranking tool.** It crawls the sitemap and checks every page
for the metadata and structured-data problems a single-page grader misses — which is a
different job from `npm run verify`, and complementary to it: `verify` proves the site is
*correct* (routes resolve, links work, canonicals are self-referential), this reads what a
crawler would *make of it* across every page at once.

```bash
npm run seo -- https://example.com                    # one-off look
npm run seo -- https://old-site.com --json recon/seo-before.json --fail-on never
npm run seo -- https://new.example.com --baseline recon/seo-before.json --fail-on new
```

**The middle line is the one that earns its place on a migration.** Metadata parity is what a
rebuild loses quietly — a template that forgets to override a description, a title pattern that
changed, structured data that stopped emitting. Capturing the old site first turns that into a
diff, and `--fail-on new` means the backlog the client already had does not block your launch
while a regression you introduced does.

| Flag | Why it matters here |
| --- | --- |
| `--baseline` | Only findings new since the capture. The old site's existing problems are not yours |
| `--fail-on new` | A gate you can actually make green, so nobody learns to ignore it |
| `--settle <s>` | Waits for a deploy to reach every edge. Auditing mid-rollout gives a snapshot that is wrong in a confusing way |
| `--psi` | PageSpeed on named pages. Slow (~12s each) and sampled — the report says how many it skipped, so a sample never reads as a clean bill of health |

Zero dependencies and `npx`-able, so it adds nothing to the project's tree — `npm run seo` is a
one-line alias for it.

**Take it from the registry, not from GitHub.** Both routes are the same bytes; `npx
github:nurkamol/seo-audit` clones ~16 MB of application sources and tests to reach a 115 kB
crawler, and — unless you remember the `@v1` — it takes whatever is on the default branch **at
the moment you run it**. A reporting tool that changes its output mid-project, with no version
recorded anywhere, is a slow way to lose trust in your own baseline. The template pins the major:

```bash
npx --yes @nurkamol/seo-audit@1 https://example.com
```

In CI it is also a published action — `uses: nurkamol/seo-audit@v1` with `url:` — which is worth
it once the baseline diff is something you want on every deploy rather than once.

`build.md` §3 phase 8b is where it fits after go-live.

**Where it does not belong:** as a required gate before launch. It reports on things a client
may have decided deliberately, and a check that fails on someone else's decision is the kind
people switch off.

### Analytics

| Option | When | Cookie banner? |
| --- | --- | --- |
| **GA4 + GTM** ✅ when the client asks for it | They already use it, or an agency reports from it | Yes |
| **Cloudflare Web Analytics** ✅ good default | Free, no cookies, already on the platform | No |
| **Plausible / Fathom / Umami** | Privacy-first, want a clean dashboard the client understands | No |
| **Microsoft Clarity** | Free session recordings and heatmaps — genuinely useful for a first redesign | Yes |
| **PostHog** | Product analytics, funnels, feature flags | Depends on config |

**The banner is the real trade.** Cookieless analytics needs no consent dialog under GDPR,
and a consent dialog costs measurable conversions. Many small businesses want GA4 out of
habit and never open it — worth asking what report they actually read.

Whatever you pick: **production only**. Staging HTML contains zero references, not a disabled
snippet.

### Search engines and webmaster tools

- **Google Search Console** — required. Verify, submit the sitemap, watch 404s after launch
- **Bing Webmaster Tools** — takes two minutes, and Bing's index feeds Copilot and ChatGPT
  search. Under-rated in 2026
- **Yandex / Naver / Baidu** — only if the audience is there
- **IndexNow** — Bing and Yandex support instant submission; cheap to wire up

---

## 8. Local presence — for anything with a service area

For a local business this moves more revenue than most on-site work. It belongs in the
handover checklist even though it is not code.

| Listing | Why |
| --- | --- |
| **Google Business Profile** | The single highest-impact item. Categories, service areas, hours, photos, Q&A, reviews |
| **Bing Places** | Feeds Bing Maps and Copilot. Can import from Google |
| **Apple Business Connect** | Apple Maps and Siri. Free, still under-used, matters on iPhone-heavy markets |
| **Facebook Page** | Often the second thing people check |
| **Yelp** | Matters more in the US, and in some trades a lot |
| **Nextdoor** | Genuinely effective for residential home services |
| **Industry directories** | Trades: Angi, Houzz, Thumbtack, Porch. Clinics: Healthgrades, Zocdoc. Legal: Avvo, Justia |
| **Data aggregators** | Foursquare and Data Axle feed dozens of smaller directories |

**NAP consistency is the whole game.** Name, address and phone must match *character for
character* everywhere, and match the `LocalBusiness` JSON-LD on the site. Take them from the
one data file the site already reads, so they cannot drift.

Also: **reviews are the strongest local ranking factor you can influence.** A follow-up email
asking for one, sent after the job, outperforms most on-page work. That is a process
recommendation, not a code one — say so anyway.

---

## 9. Everything else worth deciding early

| Concern | Default | Alternatives |
| --- | --- | --- |
| **Booking** | Cal.com (open source, self-hostable) | Calendly, Acuity. Trades: Housecall Pro, Jobber, ServiceTitan — check what they already run |
| **Reviews on-site** | Static, hand-picked, with `Review` schema only if attributable | Trustpilot, Birdeye widgets — both cost page weight |
| **Live chat** | None by default | Crisp, Tawk. All of them cost LCP; a phone number usually outperforms |
| **Error monitoring** | Cloudflare Workers observability (built in) | Sentry when there is real application logic |
| **Uptime** | Better Stack or Cronitor, checking a real page and the form endpoint | Not just the homepage — the endpoint is what breaks |
| **Accessibility testing** | axe DevTools per template family + a keyboard pass by hand + `pa11y-ci` over the sitemap in CI | A specialist audit firm when there is a contract, a deadline or a live claim. **Never an overlay widget** — see [`compliance.md`](compliance.md) §9 |
| **Accessibility target** | WCAG 2.2 AA, whatever binds them — it is a superset of 2.1 and 2.0 | None. Lowering it saves nothing; §1 of `compliance.md` decides the *testing* effort, not the target |
| **Performance** | PageSpeed Insights on the deployed URL, mobile profile | WebPageTest for waterfalls; CrUX for field data |
| **Legal pages** | Privacy policy describing what the site *actually* does | Terms and cookie policy where applicable. Do not paste a generic template that describes tracking you do not do |
| **Cookie consent** | None needed if analytics is cookieless | Only when you genuinely set non-essential cookies |
| **Backups** | The repo is the backup for content and code | Leads live in KV/D1 — export on a schedule, or they are the one thing not in git |

---

## 10. The default stack, assembled

For a local services business — the most common brief:

```
Source        WordPress + Elementor  → crawl rendered HTML, mine SEO plugin export
Framework     Astro 7, output: static
Host          Cloudflare Workers, single worker, build variable decides environment
Media         Build-time sharp → WebP + manifest, served from worker assets
CMS           None, or PagesCMS if the client publishes
Forms         Astro API route, prerender = false
Storage       Cloudflare KV, lead:<iso>:<uuid>, written before any third-party call
Email         Brevo transactional, verified sender, recipient env-derived
Spam          Honeypot + server validation; Turnstile if spam appears
Analytics     GA4 + GTM if asked, else Cloudflare Web Analytics. Production only
Search        Search Console + Bing Webmaster
Local         GBP + Bing Places + Apple Business Connect, NAP from the site's data file
Secrets       wrangler secret put — never the repo, never chat
```

Total runtime cost for a site at this scale is typically zero to a few dollars a month. If a
proposed addition changes that materially, it should earn it.

### What it actually costs

⚠ **Check these before quoting — providers move them.** Checked 15 August 2026.

| | Free tier | What exceeds it | Then |
| --- | --- | --- | --- |
| **Domain** | — | — | £10–15/yr, and the only bill that must never fail |
| **Cloudflare Workers** | 100k requests/day | ~3k visits/day at ~1 request each, since assets are served without invoking the worker | $5/mo for 10M |
| **Workers KV** | 1k writes, 100k reads/day | Writes are one per enquiry. A marketing site does not approach this | $0.50/M reads |
| **Workers Builds** | 3k build minutes/mo | A ~1-minute build, so effectively never | — |
| **Brevo** | 300 emails/day | One per enquiry plus autoresponder | ~£15/mo |
| **Cloudflare Web Analytics** | Unlimited | — | Free, permanently |
| **GA4 + GTM** | 10M events/mo | — | Free at this scale |
| **Turnstile** | 1M challenges/mo | — | Free |

**A typical local-services site runs at the domain fee and nothing else.** Say that number out
loud in the proposal — a client who has been paying £40/month for managed WordPress hosting
will not believe it, and it is one of the few claims in a rebuild you can prove within a month.

Three costs that are easy to forget and land later:

- **A paid Cloudflare zone is not needed** for any of the above. If someone proposes Pro for
  "better performance", ask which specific feature — image resizing and WAF rules are the two
  that ever genuinely apply.
- **Email deliverability is the real spend.** The free tier covers the volume; what costs money
  is a dedicated IP or a deliverability service, and neither is worth it below a few thousand
  sends a month.
- **A CMS seat is per-editor** on the commercial options. Free below the threshold, then
  per-person — which is a different shape of bill from everything else here and surprises people.

Put the finished numbers in the handover, §2 — see `build.md` phase 9.

---

## 11. Questions to add to discovery

Fold these into `kickoff.md` Round 2 once the business type is known:

- Which CDN or media host, if the image library is large? *(default: worker assets, R2 past ~15 MB)*
- Does anyone non-technical need to publish? *(decides CMS at all)*
- Which email provider, and is there a verified sender on the domain already?
- Do they have Google Workspace for mailboxes? *(separate question from transactional)*
- Which analytics do they actually read? *(not: which do they have)*
- Is Google Business Profile claimed and verified? Bing? Apple?
- Any existing CRM or booking tool the form must feed?
- Who owns the domain and DNS, and do we have access? *(this blocks go-live more often than anything technical)*
- Is there an existing email/SPF setup that a new sending domain could break?
