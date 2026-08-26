# A worked example

The method as a session, start to launch.

> **This is an illustration, not a transcript.** It was written to show the *shape* of a run —
> nothing here was captured from a real client build, and the business is invented. Every format
> shown (the spec block, `BUILD-STATE.md`, the gates, the cutover) is the real one, lifted from
> the references. Judge an actual run by whether it produces these shapes.

A local services business — the most common brief, and the one that exercises the most
machinery.

---

## Starting

In a **fresh folder**, never the kit repo. That one is for maintaining the kit, and its
`CLAUDE.md` will tell the agent so.

```console
$ mkdir ~/coding/example-plumbing && cd ~/coding/example-plumbing
$ claude
```

```
> /website-build https://example.com
```

Describing it works too — *"rebuild example.com off Elementor onto Astro"* triggers the same skill.

---

## Round 0 — asked alone, before anything else

```
● I can see a live site at example.com and I'll crawl it now. One thing first:

  Is there anything else to import?

  ▸ An SEO plugin export (Rank Math / Yoast / AIOSEO)
    Titles, the redirect table with hit counts, and the business facts.
    Worth more than anything else you can send me.
  ▸ Brand assets — logo light AND dark, a vector favicon, brand hexes
  ▸ A copy doc, or designs
  ▸ Analytics access
  ▸ Nothing — I'll work from the live site alone

> we have a rank math export, I'll drop it in. logos are in /brand
```

Asked on its own because the answer forks every question after it, and because clients forget
to mention a site they already have — which surfaces three rounds later, after you have designed
routes that ignore its URLs.

---

## Recon — it goes and looks

```
● Bash(npx degit nurkamol/website-build-kit/template . && npm install)
  ⎿  installed

● Bash(npm run recon -- https://example.com)
  ⎿  ── Sitemap ────────────────────────────────────
     ✓ robots.txt declares: /sitemap_index.xml
     ✓ /sitemap_index.xml   200
     · /sitemap.xml         301 → /sitemap_index.xml   ← an alias, not a second sitemap

       The new build must answer on /sitemap_index.xml  (declared in robots.txt)

     ── URLs ───────────────────────────────────────
     47 from the sitemap · 12 more from the Wayback Machine
     ✓ 59 paths → recon/urls.txt
     ! 9 already 404 on the old site — these still hold backlinks

     ── Integrations ───────────────────────────────
     G-XXXXXXXXXX · GTM-XXXXXXX
     calendly · mailchimp · trustpilot · recaptcha
     ✓ recon/integrations.md

● Bash(for p in ads.txt BingSiteAuth.xml feed/ sitemap_index.xml; do …)
  ⎿  ads.txt            404
     BingSiteAuth.xml   404
     feed/              200
     sitemap_index.xml  200

● Bash(npx pa11y-ci --sitemap https://example.com/sitemap.xml --standard WCAG2AA)
  ⎿  47 URLs · 312 errors

● navigate(https://example.com/services/duct-cleaning/)
  ⎿  loaded

● read_page()
  ⎿  computed styles: --brand #1b7f4f · Poppins 600 / Open Sans 400
     hero CTA #7fb89a on #e8f2ec — 2.1:1

● read_console_messages()
  ⎿  2 errors: Failed to load resource 404 /wp-content/…/slider.js
```

The browser is doing three things `curl` cannot: it renders JavaScript, it reports the
**computed** style rather than which rule might have won, and it surfaces console errors the
old site has been throwing at every visitor.

Then it comes back with **three things, not a list of questions**:

```
● Recon done. Here's what's there.

  1 · INVENTORY
      47 URLs · 6 template families
      WordPress + Elementor (elementor-widget-* classes; post-5.css is the
      global kit — I'll mine it for the exact brand values)
      home · 8 services · 6 areas · 22 posts · about · contact
      7 finished posts sitting unpublished in drafts

  2 · BOLTED ON
      GA4         G-XXXXXXXXXX
      GTM         GTM-XXXXXXX
      Calendly    embed on /contact/
      Mailchimp   signup — audience id is server-side, not in the markup
      reCAPTCHA   v3 — keys are domain-bound, cannot be copied across
      Trustpilot  widget

  3 · MUST NOT CHANGE
      /sitemap_index.xml    Yoast naming. @astrojs/sitemap emits
                            sitemap-index.xml — the underscore becomes a
                            hyphen. Reads identical; 404s the entry Search
                            Console has stored, and tells you by email days
                            later. I'll emit at the old path.
      google7f3a….html      HTML-file verification. Breaks the moment the
                            file stops resolving, and losing verification
                            loses the property's history.
      /feed/                Subscribers and aggregators.

  4 · ACCESSIBILITY BASELINE          (per template family, not per URL)
      CTA contrast          fails on all 8 service pages → one token fixes all 8
      placeholder as label  contact only
      no skip link          every family

  Two things I need from you rather than the markup:

  Which of these still need to work, and WHO OWNS EACH ACCOUNT?
```

Reported per family because *"one token fixes all eight"* is a scope statement. A 900-row CSV is
not.

**Ownership is the question that blocks go-live** — an unreachable previous agency on the GA4
property or the registrar is a this-week problem, not a launch-day one.

---

## Three batched rounds

```
● Round 1 — the business, and the win.

  What is the ONE action that counts as a win?
  ▸ The phone rings                              ▸ A form is submitted
  ▸ A booking is made                            ▸ A quote is requested

  Name one. It settles the hero, the sticky mobile bar, and what has to be
  above the fold — every layout argument later resolves against it.

> the phone rings. that's the business.
```

```
● Round 2 — scope, providers, integrations, law.

  Providers all have a default, so this is mostly confirmation:
    Astro · Cloudflare Workers · KV · Brevo · Turnstile if spam appears

  Where are your customers — country, and any state that matters?
  Public sector, government contract, or federally funded healthcare?
  Any accessibility complaint or demand letter already?

> california, residential. none of the above, no letters.
```

```
● Then no statutory deadline binds you.

  I'm still building to WCAG 2.2 AA — it's hours now against a rewrite later,
  and roughly a fifth of your market is affected either way. I'm not going to
  sell you a compliance project you don't owe.

  Two things usually DO apply to a California contractor. Which are you
  handling already?
  ▸ CCPA — notice at collection, opt-out route if ad tech is present
  ▸ Contractor licence number displayed, in the required format
  ▸ Neither — flag them for my lawyer

> licence number yes, put it in the footer. CCPA I'll ask about.
```

```
● Round 3 — design direction and mobile.

  Direction:
  ▸ Editorial   Considered, expensive   Serif display + neutral sans
  ▸ Technical   Precise, engineered     Neo-grotesque + mono accents
  ▸ Warm        Human, local            Humanist sans, generous
  ▸ Bold        Confident, high-energy  Heavy geometric display

  Every competitor in this trade runs Poppins or Montserrat. Not doing that
  is most of the differentiation. If you want Editorial I'd pair Fraunces
  with Inter.

  Mobile — a sticky call bar is the highest-impact feature for a phone-call
  business, and the most annoying done badly. Yes?
```

Nothing already answered by recon gets asked, and it says what it assumed.

---

## The spec — before any code

```
● Confirm this and I'll start building.

  Project      Example Plumbing · local services · win = phone call
  Archetype    local services
  Stack        Astro static · Cloudflare Workers · KV · Brevo
  Routes       47 across 6 families
  Features     form + KV + CSV export · areas · blog · sticky call bar
  Design       Editorial · Fraunces + Inter · restrained motion
  Mobile       full-screen overlay · sticky call bar · offer + CTA above fold
  Compliance   WCAG 2.2 AA · no statutory deadline · CCPA · licence in footer
  Environments new.example.com → example.com, from PUBLIC_SITE_ENV
  Open         ! Mailchimp audience id — requested
               ! GA4 property owner unknown
```

**If it starts writing pages before you confirm this, stop it.** Building the wrong thing
quickly is the failure the method exists to prevent.

---

## Build

```
● Bash(npx degit nurkamol/website-build-kit/template .)
  ⎿  cloned nurkamol/website-build-kit#HEAD

● Write(BUILD-STATE.md)
● Phase 0 gate passed. Starting extraction.
```

`BUILD-STATE.md` is updated **at each gate**, not continuously — a file edited every few minutes
is noise nobody reads.

```markdown
## Phase 4 · Build          [in progress]

Gates passed   0 recon ✅  1 extract ✅  2 model ✅  3 tokens ✅
Locked         Astro/CF · Brevo · KV · Editorial · Fraunces+Inter · restrained
Archetype      local services
Compliance     WCAG 2.2 AA · no deadline · CCPA · licence in footer
Open           ! GA4 property owner unknown — blocks go-live
               ? area page 6 has nothing distinct to say — cut it?
Next           /services/* (6 of 8 done)

## Integrations
- [x] GA4 · G-XXXXXXXXXX · prod-only · verified in Realtime
- [x] Calendly · embed on /contact · test booking landed
- [ ] Mailchimp · ⚠ NO ID FOUND — requested from client 2 Aug
- [ ] reCAPTCHA → replacing with Turnstile · key not yet issued
- [x] Trustpilot · dropped, agreed 1 Aug — page weight, not contractual

## Preserve
- [x] /sitemap_index.xml → 301 → /sitemap-index.xml
- [x] google7f3a….html carried over byte-for-byte
- [ ] /feed/ → /rss.xml
```

`Locked` is what stops a mid-project pivot becoming a rewrite. `!` blocks, `?` asks.

The gates are real stops:

```
● Phase 3 gate — FAILED.

  One token moves the whole site ✅
  Contrast: --text-muted on --bg-subtle is 3.9:1, needs 4.5:1.
  It passes on light sections and fails inside every .on-dark band, which
  is exactly where this always breaks.

  Darkening --text-muted one step fixes it everywhere. Doing that now.
```

```
● Phase 6 gate — a 200 isn't the gate.

  Bash(curl -X POST …/api/contact/ -H "Origin: …")            → 200
  Bash(npx wrangler kv key list --binding LEADS_STAGING)      → lead:2026-08-02T…
  Brevo dashboard                                              → delivered 14:22
  With JavaScript off, native POST                             → stored + notified

  Passed. Empty → 422 with field errors, honeypot → silent accept,
  cross-origin → 403.
```

---

## Go live

Order matters, and the first three need lead time.

```console
$ # 24h ahead
$ # TTL → 300s, log in to DNS yourself, move GSC verification to DNS TXT

$ npm run verify -- https://new.example.com
  ⎿  ✓ 14 checks passed, 2 warnings          ← staging, before touching DNS

$ npm run deploy:production
  ⎿  Bindings: LEADS (kv, id 3f9a…)   ← read this. It's the only visible signal
                                          that the right environment was built

$ dig +short example.com www.example.com
$ npm run verify -- https://example.com
  ⎿  ✓ 14 checks passed                      ← routes, redirects, headers, the form
     · What this cannot see: one pageview per visit, a valid submission
       storing AND emailing, whether the container is the client's own
```

The last three lines are the point. Do those by hand — a check that stays quiet about its
blind spots reads as "everything is fine" when it means "everything I looked at".

```
● Cutover checklist

  [x] staging route removed        (or staging is an indexable duplicate)
  [x] robots.txt now allows, noindex now absent
  [x] /sitemap_index.xml → 200     (kept the filename — nothing to resubmit)
  [x] one real enquiry sent, client confirmed receipt
  [x] TTL restored, uptime monitor on a real page AND the form endpoint
```

---

## The first week

The build is not finished at cutover. This is when the expensive failures surface, and every one
of them is silent.

| When | Watch | Because |
| --- | --- | --- |
| Day 1 | Submissions in storage **and** the client's inbox | Silence looks identical to a quiet week. Check before they do |
| Day 1 | The ten highest-traffic legacy URLs, by hand | A 301 landing on a 404 is invisible until traffic drops |
| Day 2–3 | Search Console → Pages, and → Sitemaps | "Not indexed" is a canonical fault; "couldn't fetch" is a changed filename |
| Week 1 | Is analytics recording anything at all | A missing tag and a quiet week look the same in the dashboard |
| Week 1 | The 404 log | Real 404s are URLs the inventory missed. They become redirects |
| Week 4 | Core Web Vitals **field** data | Lab numbers are a proxy. This is the real one |

---

## Handover

```console
$ # fill in every ⚠ in docs/handover.md first — a blank left in reads as an answer
$ npm run handover
  ⎿  docs/handover.pdf
```

It is the only document written for the **client** rather than a developer: what they own and
where — named to a person, because "the agency" stops being an answer once the agency has moved
on — what it costs to run, what breaks first if a payment fails, how long enquiry data is kept,
and **what you deliberately did not build**.

That last section is the one people skip and the one that pays. The difference between a
decision and an oversight is whether it was written down.

`BUILD-STATE.md` folds into it and is deleted. It was a working file, not a deliverable.

---

## How to tell it is working

**Going well**

- Arrives with an inventory instead of a questionnaire
- Asks who *owns* an account before asking for the credential
- Says which law does **not** apply, rather than selling compliance work
- Refuses a gate and names the row that failed
- Reports a measurement that undercuts its own recommendation

**Going wrong — stop it**

- Pages written before you confirmed the spec block
- "Integrations done" without a verified state per line
- A legacy URL redirected to the homepage because no equivalent was obvious
- "Fully compliant", or an accessibility overlay proposed
- Work called done that was built but never checked against the deployed site

That last one is the whole difference. **A green build proves the bundler ran.**
