# Website Build Prompt

A reusable brief for building or rebuilding a production marketing site with an AI coding
agent. Field-agnostic — the same shape works for a trades business, a clinic, a law firm, a
studio or a SaaS marketing site; §1 is where the differences get named.

Distilled from three rebuilds: getmiohome.com (WordPress → Astro + Workers + R2),
expressducttest.com (WordPress/Elementor → Astro 7 + Workers, no object storage), and the
earlier work both drew on. Every trap in §6 cost real debugging time on one of them.

**How to use:** run **`/website-build`** in this repo — it reads `kickoff.md` for discovery
(questions, feature catalogue, design system spec, mobile decisions) and this file for how to
actually build it.

Without the slash command: copy both files into the new project, fill in §1, delete what does
not apply, and paste them as the opening message. §2–§8 are meant to be handed over verbatim.

| File | Contains |
| --- | --- |
| `.claude/commands/website-build.md` | The `/website-build` entry point |
| `prompts/kickoff.md` | Discovery rounds, feature catalogue, design tokens, mobile decisions |
| `prompts/stacks.md` | Migration playbook per source builder; every provider decision and its default |
| `prompts/compliance.md` | Which accessibility law binds this client; what to build, test, publish |
| `prompts/website-build.md` | Standing instructions, phases, stack, traps, definition of done |

---

## 1. The brief — fill this in

```
Project          <name>
Production       <https://example.com>
Staging          <https://new.example.com>          # a real host, not localhost
Repo             <owner/repo>  (private?)

Business type    [ ] local services — one location, defined service area
                 [ ] multi-location — branches with their own pages
                 [ ] professional services — credentials and trust do the selling
                 [ ] product / SaaS — the site sells a thing you can try
                 [ ] editorial / portfolio — the work is the product
                 [ ] e-commerce — catalogue, cart, payments

What a win looks like   <phone rings / form submitted / booking made / demo requested>
                        Name ONE. It decides every layout argument later.

Source material  [ ] existing live site: <url>      # migration
                 [ ] designs: <figma/pdf>           # greenfield
                 [ ] copy doc: <url>
                 [ ] SEO plugin export: <path>      # worth its weight — see §8
                 [ ] brand assets: <folder>         # logos, marks, credential badges
                 [ ] nothing — you write the copy

Scale            ~<N> pages. Repeating families: <e.g. 6 location pages, 8 services>

Who edits it     <client, non-technical / developers only>
How              <git-based CMS / markdown PRs / nobody after launch>

Forms            <quote + contact> → <email> and <storage>
Email provider   <Brevo / Resend / Postmark>        # transactional, not marketing blast
Analytics        <GA4 / GTM / Plausible / none>
Business facts   name, phone (display + E.164), address, hours, socials, service areas,
                 credentials/accreditations, founding year
Regulatory       Accessibility  target WCAG 2.2 AA; binding law <none / ADA Title II /
                                EAA / Section 508 / AODA …>; deadline <date or none>
                 Privacy        <GDPR / CCPA / none>
                 Industry       <HIPAA, FCA, SRA, none…>
Customers in     <countries, and any state or province that matters>   # decides the above

Constraints      <budget, deadline, must-keep integrations>
```

**Ask before writing code.** Four questions decide the architecture, and guessing wrong
costs a rewrite. Batch them into one round rather than drip-feeding.

1. **Design fidelity** — pixel-perfect clone, faithful rebuild, or redesign? Ask this
   *first*; it changes the most and it is the one people revise. Expect "faithful rebuild"
   to become "actually, redesign it" once they see the first screen. Build so that is cheap:
   tokens, not hard-coded values.
2. **Content model** — files in the repo, or a headless CMS? Files unless a non-technical
   editor must publish without a deploy.
3. **Forms** — where do submissions actually go, and who is accountable when one is lost?
4. **Staging** — a real subdomain, the platform's preview host, or straight to production?

Ask anything else only if two readings produce materially different work.

### What changes by business type

| Type | The thing that matters most |
| --- | --- |
| Landing | One offer, one CTA, no navigation; proof beside the claim above the fold |
| Local services | Phone number reachable from every viewport; service-area pages; LocalBusiness schema |
| Multi-location | One location template + data; distinct NAP per branch; no duplicate boilerplate |
| Professional services | Credentials, registrations and named people; trust before persuasion |
| Product / SaaS | Time-to-value on the page; pricing legible without a sales call |
| Corporate | Audience split in the navigation, never in the hero; careers is a real template |
| Editorial / portfolio | Image fidelity and typography; the work must not be compressed to mush |
| E-commerce | This brief is the wrong shape — you need a storefront, not a marketing site |

`archetypes.md` has the full page shape for each: section order, proof model, failure mode, and
what to do instead for e-commerce. Pick from the **win**, not the industry — a clinic running one
campaign is a landing page; the same clinic's main site is professional services.

---

## 2. Standing instructions

These are not style preferences. Each one prevents a specific, expensive failure.

**Preserve every URL.** On a migration, inventory the old site's URLs *before* designing
routes, and keep them. Where a URL must change, add a 301. Pull redirect hit counts from the
old SEO plugin and put them in a comment next to each rule — they are the difference between
"cleanup" and "deleting traffic." Never point a legacy URL at the homepage when a specific
equivalent exists; search engines read that as a soft 404. If posts lived at the site root,
they stay at the site root.

**Content stores portable references, never infrastructure URLs.** An image field holds
`services/roofing.jpg`, not `https://cdn.example.com/i/services/roofing.jpg`. Changing where
media is served from must be one change to the generator, not a content migration.

**Repetition becomes template + data.** If the source has 31 near-identical pages, ship one
template and 31 data files. Judge the content model by how much work a design change costs:
one edit, or thirty-one. The corollary matters more: **if an entry cannot be written
distinctly, that page should not exist.** Six location pages differing only by the town name
are doorway pages and can be penalised. Each needs something genuinely local — which
authority issues the permit, what the housing stock is, what actually drives demand there.

**One place per concern.** Design tokens in one stylesheet `:root`. Business facts in one
data file, consumed by both the UI and the structured data. Motion in one module. Two
sources of truth for the same fact is a bug that has not surfaced yet.

**Progressive enhancement is not optional.** The page must render complete and readable with
JavaScript disabled, and the form must still submit, store and notify. Elements may only be
hidden *by the animation library itself*, never by CSS that JS is expected to undo — that
pattern shows a blank page whenever the script fails. Honour `prefers-reduced-motion`.

**Environment behaviour is derived, never toggled by hand.** Staging must be non-indexable,
with analytics off, test-tagged submissions, and notifications routed to the developer
rather than the client's inbox — all from a single build variable. Anything a human must
remember to switch at go-live will eventually ship wrong. Detect production by an **exact
hostname allowlist**, never a suffix match — `new.example.com` ends with `example.com`.

**Make the wrong build impossible, not merely documented.** A CI job that runs a bare build
with no environment set will publish `http://localhost` canonical tags — cleanly, with no
error. Throw at config time when `CI` is set and the environment is not.

**Secrets never enter the repo or the chat.** Use the platform's secret store. If a key
arrives in plain text, use it, then say plainly, once, that it must be rotated and treat it
as compromised. Do not keep raising it.

**Justify every dependency.** A framework-native API beats a library that does the same
thing. Reach for the heavy option when the task needs it, and say so out loud when you
decline one — the client may know something you do not.

**Measure before you defend a design opinion** — and measure the right way. "A preloader
hurts LCP" is a claim. A with/without Lighthouse comparison is a decision the client can
make.

Use Lighthouse, mobile form factor, simulated throttling, **at least two samples per
variant** — single runs swing by a second on Speed Index. Do not hand-roll a
`PerformanceObserver` against localhost; it produces a confident number that disagrees with
Lighthouse, and there is nothing to tell you it is wrong.

`npm run verify` reports the half that is *not* a timing — page weight, render-blocking
stylesheets and head scripts, and whether the first substantial image is lazy-loaded. Bytes and
counts are identical on every machine and every connection, so they can be gated; a millisecond
from one laptop cannot. Use them to find what to fix and Lighthouse to prove it moved.

**Applied throttling is not simulated throttling, and a local harness can show nothing while
the change is real.** Deferring a 105 KiB chat widget measured no improvement at an applied
1.6 Mbps locally — I said so rather than claim a win. PageSpeed, which simulates a harsher
network, moved the same build FCP 6.2s → **1.7s**. Both numbers were correct; they answer
different questions. Quote the one whose network resembles the visitor's, and say which it is.

Then report the result even when it undercuts the position you argued for. On the last build
the measurement reversed the recommendation, which is exactly when it was worth having.

**Accessibility is a build constraint, not a QA pass.** Target WCAG 2.2 AA whatever the client
is bound by — it is a superset of 2.1 and 2.0, so one target covers every jurisdiction, and the
cost is entirely in *when* you do it. Contrast is a token decision, focus order is a markup
decision, and both are hours at build time and a rewrite afterwards. Never claim "fully
compliant"; state the target, how it was tested, and what is known to fail. See
`compliance.md`.

**Verify against the deployed thing.** A green build proves the bundler ran. It does not
prove a route works. See §7.

---

## 3. Phases

Work in this order. Each phase has a gate; do not start the next until it passes.

### Keep the state in the repo, not in the conversation

Write `BUILD-STATE.md` at the project root after every gate — the template ships a stub. **A build spans more sessions than
a context window holds**, and a decision that only exists in chat history is a decision that
gets re-litigated or silently reversed — usually the design one, three days after it was
settled.

```
## Phase 4 · Build          [in progress]

Gates passed   0 recon ✅  1 extract ✅  2 model ✅  3 tokens ✅
Locked         Astro/CF · Brevo · KV · Editorial · Fraunces+Inter · restrained motion
Archetype      local services (+ landing page for the spring campaign)
Compliance     WCAG 2.2 AA · US private · no statutory deadline · GDPR (EU visitors)
Open           ! DNS owner unknown — blocks go-live
               ? location page 6 has no distinct content — cut it?
Next           /services/* (6 of 8 done)

## Integrations                              ← one line each, ships and ticks individually
- [x] GA4 · G-XXXXXXXXXX · prod-only · verified in Realtime
- [x] Calendly · embed on /contact · test booking landed
- [ ] Mailchimp · audience 3a7f9c · signup not wired          ← next
- [ ] Meta Pixel · ⚠ NO ID FOUND — requested from client 2 Aug
- [x] Trustpilot · dropped, agreed 1 Aug — page weight, not contractual

## Preserve                                  ← paths other systems point at. stacks.md §1d
- [x] /sitemap_index.xml → 301 to /sitemap-index.xml, GSC entry still resolves
- [x] google7f3a….html carried over byte-for-byte
- [ ] /feed/ → /rss.xml redirect
```

Four rules make it worth keeping:

- **Update it at the gate, not continuously.** A file edited every few minutes is noise, and
  nobody reads it.
- **`Locked` means settled — do not reopen without saying so.** This is the row that stops a
  pivot from quietly becoming a rewrite.
- **`Open` carries `!` for blocking and `?` for a question.** A blocking item that is not
  visible on every read is a blocking item you discover at go-live; DNS access is the usual one.
- **Every integration and preserved path is its own line**, ending in a verified state or an
  explicit dated drop. No third state. "Integrations" as one task is the item that silently
  ships at 80%, and a missing conversion tag is invisible for a month.
- **Delete it at handover**, folding what survived into the handover docs in phase 9. It is a
  working file, not a deliverable.

It is also the answer to "where did we get to?" after a week away, which is otherwise a
re-read of the whole repo.

### 0 · Recon
```bash
npm run recon -- https://old-site.com     # → recon/urls.txt, preserved.md, integrations.md
npm run dns   -- old-site.com             # → recon/dns.md + dns.json. THE ROLLBACK ARTEFACT
npm run seo   -- https://old-site.com --json recon/seo-before.json --fail-on never
```

Commit all three. `dns.json` is what tells you after cutover whether the launch took the
client's email with it, and `seo-before.json` is what turns "did we lose metadata" from an
argument into a diff.
Inventory the source: every URL, template family, form, integration, redirect, and media
asset, plus an accessibility baseline (`pa11y-ci` over the sitemap, reported per template
family — see `compliance.md` §4). On a migration, capture the **rendered HTML** — page-builder
shortcodes (WPBakery, Elementor, Divi) make a database export unusable, while rendered output
is clean semantic markup. Grab the theme's design export; it gives exact brand values. Pull the
SEO plugin's settings and per-URL export — it holds the business facts, the redirect table and
the title/description baseline you will be diffed against.

Check the source folders for work already done and never shipped: drafted posts, unpublished
pages, a content plan. On the last build, seven finished articles were sitting unpublished.

*Gate: a written inventory of URLs and template families, and the accessibility baseline
counted per family.*

### 1 · Extraction
Pull copy, media and metadata into structured files. Normalise as you go — heading levels,
image paths, link targets. Do not carry over lazy-load placeholders, tracking wrappers,
builder markup, or hand-rolled tables of contents whose anchors you will regenerate.

`npm run extract` does the mechanical half: every file in `recon/html/` becomes a markdown file
with frontmatter and portable image paths, in `recon/extracted/`. It deliberately does **not**
write into `src/content/` — what the collections are is §2's decision, and project-shaped.

Read what it flags. `headings` is the one that matters most: page builders use heading tags as
type styles, so a captured page routinely runs `h1 → h5 → h6` with no `h2` at all, and that
hierarchy is both an accessibility failure and the outline Google reads.

**Use a real HTML-to-markdown converter; do not hand-roll the tag stripping.** A bare
`html.replace(/<[^>]+>/g, '')` glues the text either side of every tag it removes, so a heading
runs into its paragraph (`AreasWe cover Irvine.`) and a sentence runs into its link text
(`Call ustoday`). It only breaks where the source markup had no newline between tags — which is
every page builder's minified output — so it is wrong on *some* pages and right on others, and
it reads as a content problem rather than a converter one. `traps.md` has the mechanism and the
grep that finds it after the fact.

*Gate: content opens cleanly in a plain editor with no vendor markup, and a spot-read of two
pages finds no run-together words.*

### 2 · Content model
Typed schemas, validated at build time, so a bad edit fails the build rather than the page.
Collapse repeating families into template + data.

*Gate: schemas typed; every page family maps to exactly one template.*

### 3 · Design system
Tokens first — colour, type scale, spacing, radii, shadows, motion, layout widths. Source
real values from the original brand rather than approximating. Build components against
tokens only; no hard-coded hex or px in components.

**The template arrives undecided and it is your job to decide.** `tokens.css` ships a grey
placeholder ramp, the system font stack for both faces and a `--unset` marker; there are no
typefaces in `public/fonts/` and no home page. That is deliberate — a starter that arrives
with a palette hands every project the same one. `npm run tells` fails while `--unset` sits
alongside real values, because a project with a brand colour and no typeface is a project that
stopped halfway.

Restrain the top of the type scale. A pure modular ratio puts a hero headline past 100px at
desktop, which reads as a magazine cover rather than a business people trust with money.

If asked for "premium", the reliable lever is a serif display face against a neutral sans,
not a bigger typeface. Every competitor in most trades is running Poppins or Montserrat.

**On a full redesign, comp before you commit.** Build the hero and one content section in two
or three genuinely distinct directions, with the client's real copy and real photography, and
put them on staging. Choosing from a screen instead of from adjectives is what stops a direction
changing after twenty pages exist. `design.md` §1.

*Gate: on a redesign, a direction chosen from a deployed comp and recorded under `Locked`.
On every build: `npm run tells` clears the undecided section, changing one token visibly moves
the whole site, and every text/background pair in the semantic layer clears 4.5:1 — including
each `.on-dark` inversion, which is where it breaks.*

### 4 · Build
Pages and components. Static by default; opt individual routes into a runtime only when they
genuinely need one. Semantic HTML, real landmarks, labelled controls, visible focus.

Build to the archetype's section order, not to whatever the last project's pages looked like.
The template has no page shapes for the same reason it has no palette.

*Gate: every inventoried URL resolves, one page per template family passes a keyboard pass and
a clean axe run, and `npm run tells` reports fewer than three tells.* Per family, not per URL —
a homepage pass misses everything the blog does differently.

`npm run tells` is the mechanical half of `design.md` §3 — measure, section rhythm, the
auto-fill card grid, face pairing, headline size, tracking, motion duration, focus ring, raw
hex in components, form states. It runs on **every** build, not only on a redesign: a faithful
rebuild that quietly reproduces the last client's page shape is the failure this catches. It
prints the tells it cannot check at the end; those still need your eyes.

### 5 · Media
AVIF + WebP through `npm run media`, per `stacks.md` §3. Encoding is incremental, so the
AVIF cost is one-time per image and not per run.
```
source/     semantic folders (brand, heroes, services, gallery, team, blog, archive)
   ↓ optimize
dist/       modern format at responsive widths + social cards + a dimensions manifest
   ↓ deploy or sync
static assets / object storage
```
Photos convert to a modern format at several widths; **brand assets copy byte-for-byte**;
unused originals live in an `archive/` folder that never uploads. Emit width and height for
every image to prevent layout shift.

Three exceptions worth stating up front:

- **Favicons stay PNG/ICO.** Generate them from the vector when one exists — rendering each
  size natively is visibly sharper at 16px than downscaling one big raster.
- **Social cards stay JPEG.** Facebook and LinkedIn still fail to render a WebP `og:image`,
  so a shared post unfurls with no picture. Generate these only for images actually used as
  an `og:image`; twinning every inline image is dead weight no browser ever requests.
- **Cap source images** in the repo at ~2400px if the originals are camera-sized. The true
  originals belong outside version control.

Look at the brand assets before designing around them. Credential and accreditation badges
are frequently near-white transparent PNGs drawn for a dark backdrop; they vanish on a pale
section. Measure the mean pixel value rather than assuming.

*Gate: payload measured before and after; every referenced asset resolves; every image has
intrinsic dimensions.*

### 6 · Integrations
Forms, email, storage, spam protection, analytics. Write submissions to durable storage
**before** calling any third-party API, so a provider outage costs a notification rather
than a lead. Validate server-side and return field-level errors. Add a honeypot; accept
silently when it trips rather than revealing the check. Give the client a way to get the
data out — a token-protected CSV export costs twenty lines and saves a support request a
month.

*Gate: a real submission produces a stored record **and** a delivered email — verified in
the provider's own dashboard or API, not merely a 200 response.*

### 7 · SEO parity
Titles, descriptions, canonicals, Open Graph, sitemap, robots. Structured data driven by the
same data file the UI uses. On a migration, diff every title and description against the old
site and justify each difference. Watch for plugin behaviour that is not obvious from the
settings: most only append the site name when a page has *no* custom SEO title.

**Keep the sitemap at the filename the old site used.** Search Console and Bing store the URL
that was submitted; change it and the stored entry 404s, reported days later in an email nobody
opens. WordPress emits `/sitemap_index.xml` or `/wp-sitemap.xml`; `@astrojs/sitemap` emits
`/sitemap-index.xml` — **the underscore becomes a hyphen**, which reads as identical and is not.
Same for verification files, `ads.txt`, `/feed/` and `/.well-known/`. `stacks.md` §1d has the
detection commands and the full list.

*Gate: parity table with a reason for every intentional change, and every preserved path
returning 200 or 301-to-200 on the deployed site.*

### 8 · Deploy and go live
Staging first, on a real host. Then the §7 verification matrix, then cutover **in this order**
— the first three happen days ahead, not on launch day.

1. **Lower the DNS TTL to 300s**, at least 24h before. A mistake then costs five minutes, not a day.
2. **Actually log in to the domain registrar and DNS.** Not "the client says they have it".
3. **Move Search Console verification to DNS TXT** if it currently relies on an HTML file, and
   confirm it still reads as verified. File verification breaks the moment the file stops
   resolving, and losing verification loses the property's history.
4. Full verification matrix against staging.
5. Deploy production. **Read the bindings table in the deploy output** — it is the only visible
   signal that the intended environment was built.
6. Cut DNS over, and watch it rather than assuming: `dig +short` both apex and `www`.
7. **Remove the staging route**, or staging becomes an indexable duplicate.
8. Re-run the matrix against production — `robots.txt` must now allow, `noindex` must be gone.
9. Submit the sitemap to Search Console and Bing. If you kept the old filename there is
   nothing to resubmit, which is the point of `stacks.md` §1d.
10. **Send one real enquiry through the live form** and confirm the client received it in the
    inbox they actually read.
11. Restore the DNS TTL, and point an uptime monitor at a real page **and the form endpoint**.

*Gate: production verified, staging route removed, one real lead delivered end to end.*

### 8b · First week
The build is not finished at cutover — this is when the expensive failures surface, and all of
them are silent.

| When | Watch | Because |
| --- | --- | --- |
| Day 1 | Submissions arriving in storage **and** the client's inbox | Silence looks identical to a quiet week. Check before they do |
| Day 1 | The ten highest-traffic legacy URLs, by hand | A 301 that lands on a 404 is invisible until traffic drops |
| Day 2–3 | Search Console → Pages, and → Sitemaps | A "not indexed" spike is a canonical or redirect fault; "couldn't fetch" is a changed sitemap filename |
| Week 1 | Is analytics recording anything at all | A missing tag and a quiet week look the same in the dashboard |
| Week 1 | The 404 log | Real 404s are URLs the inventory missed. They become redirects |
| Week 2–4 | Search Performance versus the old site | Some movement is normal; a sustained drop is a redirect problem |
| Week 4 | Core Web Vitals **field** data | Lab numbers are a proxy. This is the real one |

**Schedule the lead export.** The repo backs up content and code; leads in KV or D1 are the one
thing not in git.

### 8c · Diff against the capture
Once DNS has propagated:

```bash
npm run dns -- example.com --compare                              # MX, SPF, DMARC, TXT, NS
npm run seo -- https://example.com --baseline recon/seo-before.json --fail-on new
```

The first catches a launch that silently broke email. The second separates regressions you
introduced from a backlog the client already had — optional, and `stacks.md` §7 says when it
is worth running.

*Gate: nothing lost from the zone, and no SEO finding that is new since the old site.*

### 9 · Handover
Docs that let someone else — or you in six months — operate this. The template ships
`docs/runbook.md`, `docs/content.md` and `docs/traps.md` as the skeleton of exactly this; fill
them in rather than starting a new set.

**Those three are for a developer. `docs/handover.md` is the one the client reads** — what
they own and where, what it costs to run, what breaks if a payment fails, what is connected
and whose account it is in, what you deliberately did *not* build, how long enquiry data is
kept, and who to call. `npm run handover` renders it to PDF through the site's own type.
Fill in every ⚠ — a blank left in reads as a completed answer. Architecture and the
decisions behind it, configuration reference, content editing guide, deployment runbook, a
**current state** section naming what is actually deployed and what is outstanding, and a
**traps** section recording every non-obvious failure hit during the build. That last one is
the highest-value page in the repo.

Plus the **accessibility evidence pack** — `npm run a11y:evidence` writes
`docs/a11y-evidence/<date>.md`: the standard, tool versions, per-family results and the reflow
pass, with the manual layers listed **blank and unchecked** because no tool covers them.
Fill those in and commit it. Assertions are worth nothing here; dated evidence of a deliberate
process is the whole point, and the pack is deliberately not signable until a human has dated
the keyboard and screen-reader passes.

---

## 4. Stack profile — Astro + Cloudflare

The proven configuration. Swap components deliberately, not by default.

| Concern | Choice | Why |
| --- | --- | --- |
| Framework | Astro, `output: 'static'` | Marketing pages change weekly, not per-request. Zero JS by default |
| Runtime | Cloudflare Workers adapter, per-route `prerender = false` | One origin-free deploy; a runtime only where a route needs one |
| Media | Build step → static assets, or R2 behind a CDN subdomain at scale | Under ~10 MB, shipping with the worker beats a bucket |
| Storage | KV, keyed `lead:<iso-timestamp>:<uuid>` | Sorts chronologically; durable backup of every submission |
| Content | Collections + schema validation | Bad frontmatter fails the build |
| CMS | Git-based (PagesCMS or similar) | Non-technical editing without a database |
| Motion | CSS + IntersectionObserver; GSAP only for pinning or scrubbed timelines | 70 KB is a lot to spend on a fade |
| Email | Transactional API, key in the secret store | Never SMTP credentials in the repo |

**Single worker, not two.** One worker serves staging and production; the build variable
decides behaviour. A second environment means a second worker name and a second thing to
keep in sync — and most Git integrations build exactly one. Attach the staging route while
testing and remove it at go-live, or staging becomes an indexable duplicate.

**Prefer branch-derived environments over a dashboard setting.** If the CI build command is
what makes the site indexable, going live is a thing someone must remember. Deriving it from
the branch makes go-live a merge.

---

## 5. Working with the client

The last build changed direction six times mid-flight — faithful rebuild became full
redesign, fonts changed, the type scale was too big, a preloader was requested after being
argued against. None of that is a problem if you build for it.

- **Expect the brief to move.** Tokens, template+data and single-source facts are what make
  a mid-project pivot an afternoon rather than a rewrite.
- **Answer questions about your own work directly.** If you skipped something the brief
  asked for, name it and give the reason before it is discovered.
- **Flag a bad instruction once, with the reason. If it is reaffirmed, build it** — and
  build it well, not grudgingly. Then measure it and report honestly, including when the
  measurement undercuts your own position.
- **When a request has a good instinct behind a costly mechanism, name the instinct and
  offer the cheaper route.** "Show the logo on arrival" is reasonable; a blocking splash
  screen is one way to get it and not the only one.
- **A request to look at something is not a request to change it.** "Did you change the
  favicon?" is a question. Answer it, then ask.

---

## 6. Traps

Every one of these failed **silently** — clean build, clean types, clean deploy. Check this
list before debugging anything strange.

### Framework and runtime

**Scoped styles do not cross component boundaries.** A class passed *into* a child component
never matches the parent's scoped rule, because the framework stamps its scoping attribute
only on elements in that component's own template. Same for elements created at runtime by
JavaScript. *Symptom:* a rule definitely in the CSS bundle with no effect — an icon toggle
rendering both states at once. *Fix:* a global escape hatch. Worth a one-off script to scan
for it; it recurs.

**Component scripts do not re-run after client-side navigation.** With a view-transitions
router, a module script runs on first load only. *Fix:* initialise from the router's
page-load event.

**…and the sting in that tail: a persisted element's handlers outlive the elements they
captured.** Mark a header `transition:persist` and guard against double-binding, and the
handlers bound on the first page keep running forever — still referencing DOM that page-load
replaced. A mobile menu outside the persisted header is a *new element* every navigation, so
the handler goes on mutating the previous page's detached one. *Symptom:* works on first
load, silently dead after one navigation, no error. *Fix:* never capture a non-persisted
element in a long-lived closure; look it up at call time and delegate from `document`.

**The bindings API changes between major versions.** A route can build, type-check and deploy
clean while returning an empty 500 on every request. Only an actual request reveals it.
*Fix:* wrap binding access in one module.

**The adapter resolves the environment at build time.** `deploy --env <name>` is read too
late and ignored without error — a staging deploy can land on the production worker. *Fix:*
set the environment during the build. Read the bindings table in the deploy output; it is
the only visible signal.

**Runtime config shadows the build environment.** Platform `vars` get injected into the
build-time environment object and silently override the shell. *Fix:* build-time values live
only in the build environment; runtime values only in platform config. Never both.

**Auto-provisioned resources break rebuilds.** An undeclared binding gets *created* on
deploy — which works exactly once. Frameworks do this on your behalf: an adapter may add a
session-store binding with no id because you did not opt out. *Fix:* declare every binding
with its existing id, and inspect the **generated** config after every adapter upgrade.

**Enforced trailing slashes break form POSTs.** `POST /api/x` 308-redirects to `/api/x/` and
the redirected request loses its body. *Fix:* post to the canonical URL, slash included.

**Framework CSRF protection rejects `Origin`-less POSTs with 403.** Typically applies to form
content types but not JSON — so the enhanced path tests fine while the no-JS path looks
broken. Send the header when testing; browsers always do.

**Redirect files accept a narrow set of status codes.** A `404` in a `_redirects` rule is
dropped with a warning that scrolls past. Paths that should 404 usually need no rule.

**Templating strips the whitespace before an element on the next line.** A sentence ending a
line followed by a link renders as `call us at(000) 000-0000`. *Fix:* an explicit `{' '}`.

### Build tooling

**An mtime "skip if unchanged" guard must skip the work, not the bookkeeping.** A media
script that returns early on a warm rebuild — before recording its output in the manifest —
ships pages with no `og:image` and an error nowhere near the cause.

**A greedy pattern will eat base64 padding.** `sed 's/.*="//'` on `TOKEN="abc…="` matches
through the *last* `="` and returns nothing. Your auth then fails and you debug the endpoint
instead of the test.

**zsh does not word-split unquoted variables.** `curl $FLAGS` passes one argument in zsh and
several in bash. A test harness that works in one shell silently misfires in the other.

### CSS and layout

**`overflow-x: hidden` on `body` breaks viewport IntersectionObservers.** It makes body a
scroll container, so a viewport-rooted observer never fires. *Fix:* `overflow-x: clip`.

**`justify-content: center` clips overflowing content unreachably.** Centred flex content
taller than its container overflows in *both* directions, and the top cannot be scrolled to.
*Fix:* `margin: auto` on the child — auto margins collapse to zero once content exceeds the
box.

**`100vh` is taller than the visible area on mobile.** It excludes collapsing browser chrome,
so a full-height panel hides its own bottom call-to-action. *Fix:* `100dvh`.

**A fixed header will cover a full-screen panel.** Layering a menu under the bar puts the bar
over the first nav item. *Fix:* hide the header while the panel is open and give the panel
its own close control — and make that control sticky, because `position: absolute` inside a
scrolling panel scrolls away with the content.

### Assets and content

**A supplied `favicon.svg` may be a different logo entirely.** Browsers prefer an SVG icon
over the `.ico` when both are declared, so the wrong file wins and it looks like a caching
problem. *Fix:* render every icon and look at it. Generate them all from one source.

**Supplied brand assets may be built for the opposite background.** Credential logos are
frequently near-white transparent PNGs. Measure before designing around them.

**Hotlinked stock images rot.** Two Pexels URLs referenced by articles already 404'd at
source on the live site. Pull every asset local at import time.

**Duplicated cover images read as a broken page.** Ten of seventeen posts shared one photo.
Check for it explicitly; nobody notices while writing.

**Mixed illustration styles look unfinished.** AI-generated illustrations next to real
photography make a grid look half-built, even when each image is fine alone.

**SEO plugins only append the site name when a page has no custom SEO title.** Appending it
unconditionally pushes titles past truncation.

### Platform and network

**DNS negative caching outlives the fix.** A newly pointed subdomain serves 200 with a valid
certificate while your own machine reports "could not resolve host" — the OS cached the
NXDOMAIN from before the record existed. *Diagnosis:* `dig` succeeds while `getaddrinfo`
fails; if those disagree it is your cache, not the origin. Query a hostname you know does not
exist — if it resolves, you are looking at a wildcard.

**Shell `cd` persists between commands.** Prefer absolute paths.

**`fetch()` to object storage fails CORS even when assets serve perfectly.** Buckets send no
`Access-Control-Allow-Origin` by default; `<img>` does not care. Test with an image tag.

---

## 7. Definition of done

Not "the build passed." Every row verified against the **deployed** site.

| Check | Passing |
| --- | --- |
| Routes | Every inventoried URL returns 200 |
| Redirects | Each legacy URL 301s to its *specific* equivalent and lands 200 |
| 404 | Unknown paths return a real 404 status, not 200 |
| Staging guards | `noindex`, disallow-all robots, **zero** analytics references, zero production URLs, notifications routed away from the client |
| Canonicals | Point at the host actually being served |
| Coverage | Every URL in `recon/urls.txt` resolves on the new site — `npm run verify` fails otherwise. A build with three pages where the old site had eighteen passes every *other* check in this kit, because all three of them return 200 |
| Preserved paths | Old sitemap filename, verification files, `ads.txt`, `/feed/`, `/.well-known/*` all resolve 200 or 301-to-200 — `npm run verify` re-checks exactly what `recon` found on the old site; Search Console and Bing re-checked after go-live |
| Integrations | Every roadmap line verified in the provider's own dashboard, or explicitly dropped with a date. No blank lines |
| Forms | Valid → 200 + stored record + delivered email; empty → 422 with field errors; honeypot → silent accept; cross-origin → 403 |
| Forms, no JS | Native POST still stores, still notifies, lands on a human-readable page |
| Media | Every image resolves and carries intrinsic dimensions; `og:image` is a format scrapers render; no duplicate covers |
| Structured data | Validates, and reflects the same facts as the visible page |
| No-JS | Page renders complete with JavaScript disabled |
| Reduced motion | Animations respect the preference |
| Keyboard | Every interactive element reachable, focus visible, menus escapable, **and the skip link moves focus** — not just the scroll position |
| Automated a11y | Clean axe run on one page per template family; `pa11y-ci --standard WCAG2AA` green across the sitemap |
| Contrast | Every semantic token pair ≥ 4.5:1, each `.on-dark` inversion checked separately, text over hero imagery checked at its darkest and lightest |
| Reflow | 320px wide and 400% zoom: no horizontal scroll, no clipped content, no lost controls |
| Screen reader | One page per family read end to end — VoiceOver/Safari or NVDA/Firefox. Does it make sense, not merely does it speak |
| Forms, a11y | Errors associated via `aria-describedby` + `aria-invalid`, focus moves to the first bad field, result announced by a live region **that was already in the DOM** |
| Statement | `/accessibility` published, footer-linked from every page, dated, naming a working contact route and the actual known gaps |
| Design decided | `npm run tells` clears the undecided section — real brand ramp, two real faces, no scaffold page. `build:production` refuses otherwise |
| Tells | Fewer than three from `design.md` §3, and the ones needing eyes checked beside the reference sites |
| Visual | One page per template family **looked at** in a browser at mobile and desktop widths — a page can build clean, return 200 and render broken. `stacks.md` §1c |
| Console + network | Zero console errors and zero failed requests on the deployed site — `npm run console`. A blocked third-party script or a 404 asset is invisible to a status-code check |
| Visual record | On a migration: `npm run shots` on both sides, and the pairs in `shots/index.html` actually looked at. Nothing else catches a page that came out *worse* — it builds clean, returns 200 and nobody compares it to what it replaced |
| Mobile | Verified on a real device, not only emulated widths — including a short/landscape viewport |
| Performance | Measured on the deployed site. `npm run verify` reports page weight, render-blocking counts and whether the first substantial image is lazy — the inputs. Lighthouse supplies the timing. Any deliberate delay (splash, overlay, gate) costed in LCP and reported |
| Rebuild | Deleting and recreating the deployment target from the repo produces a working site |

That last row is the real test of the configuration. If recreating requires undocumented
dashboard clicks, the setup is not reproducible — write down what is missing.

---

## 8. Working agreement

- Report honestly. If a check fails, say so with the output. If something was skipped, say
  which and why. Do not describe unverified work as done.
- Finish the whole scope. If one part is blocked, complete everything else and state plainly
  what is outstanding.
- Flag a bad instruction once, with the reason. If it is reaffirmed, implement it properly.
- Prefer measurement to assertion on anything performance-related, and report the number
  even when it weakens your own argument.
- Commit in logical units. The message explains *why*, not what the diff already shows.
- Prefer the boring solution. A dependency is a liability; justify each one.
