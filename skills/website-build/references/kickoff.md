# Kickoff — discovery, features and design direction

The interactive front end to [`build.md`](build.md). Run this **before** writing any code.

Invoke with `/website-build`, or paste this file followed by: *"Run the discovery in §1, then
build to `build.md`."*

---

## 1. Discovery

**One question first** (Round 0), then **three batched rounds**. Do not drip-feed one question
at a time after that, and do not ask
what the answer to a previous question already settles. Skip anything you can determine
yourself from a supplied URL or repo — then state what you assumed.

### Round 0 — Is there anything to import?

**Ask this before anything else, on its own.** It forks every question that follows, and it is
the one clients forget to volunteer — "we have an old site nobody updates" surfaces three
rounds in, after you have designed routes that ignore its URLs.

| Offer | What it turns this into |
| --- | --- |
| **A live URL** | Migration. Crawl it now — URLs, template families, forms, redirects, accessibility baseline |
| **A repo, export or database dump** | Migration, but check `stacks.md` §1 first — for any page builder the answer is rendered HTML, never the database |
| **Designs** (Figma, PDF, screenshots) | Greenfield to a fixed target. Ask for the design tokens, not just the frames |
| **A copy doc** | Greenfield; content exists, structure does not |
| **An old site that is down or you have lost access to** | Try the Wayback Machine before writing it off — `web.archive.org/cdx/search/cdx?url=site.com/*&output=text&fl=original&collapse=urlkey` gives you the URL inventory to preserve, even when the origin is gone |
| **Nothing** | Greenfield, you write the copy. Say so explicitly — it is a different scope conversation |

Also ask for: an SEO plugin export (worth its weight — carries titles, redirects with hit
counts, business facts), brand assets, and analytics access if it exists. And check the source
folders for finished work never published; on the last build seven articles were sitting in a
drafts folder.

**Then: what is it built on, and what is bolted onto it?** Detect both before asking — the
builder from its class-name tell, the integrations by grepping the crawled HTML for tracking
IDs, third-party origins and form actions. [`stacks.md`](stacks.md) §1 has the tells and §1b
has the grep commands and what each integration forces you to preserve.

Present it back as a list to confirm, not a question to answer:

> *"Elementor on WordPress. I can see GA4 `G-XXXX`, GTM, a Calendly embed, Mailchimp signup,
> reCAPTCHA v3 and a Trustpilot widget. Which of these still need to work, and who owns the
> accounts?"*

That question — **who owns the account** — is the one that blocks go-live. An unreachable
previous agency holding the GA4 property or the DNS is not a launch-day problem; it is a
this-week problem. Ask it in the same breath as domain access.

If a live site was given, **crawl it before Round 1** and arrive with the inventory already
done — `npm run recon -- https://old-site.com` does the mechanical half in a minute.

"I found 15 URLs, 5 template families, a contact form posting to Brevo, and 3 of 5 template
families failing contrast — confirm?" beats twenty questions.

### Round 1 — The business and the win

| Ask | Why it changes the build |
| --- | --- |
| Business name, production URL, staging host | Staging must be a real host from day one |
| Business type | Picks the archetype — [`archetypes.md`](archetypes.md) has the page shape, proof model and failure mode for each |
| **The one action that counts as a win** | Phone call, form, booking, demo, purchase. Name *one*. It settles every later layout argument — what the hero CTA is, what the sticky mobile bar does, what "above the fold" must contain. It also picks the archetype in [`archetypes.md`](archetypes.md), which is the page shape you build to |
| Existing site, designs, copy doc, or nothing | Decides whether this is migration or greenfield |
| Who edits it after launch, and how | Files vs git-CMS vs headless. Files unless a non-technical editor must publish without a deploy |
| Deadline and any hard constraints | Scope conversation, not an afterthought |

### Round 2 — Scope, content and integrations

| Ask | Why |
| --- | --- |
| Page count and repeating families | "8 services, 6 locations" → template + data, not 14 pages |
| **Photography — does it exist, is a shoot budgeted, and who owns the rights?** | The largest single determinant of whether the result reads as expensive ([`design.md`](design.md) §2), and the one people underfund. Ask it here, not at phase 5, when the only options left are stock or a delay. Rights matter on a migration: photos on the old site may be the previous agency's or a stock licence that does not transfer |
| Where form submissions go, and who is accountable if one is lost | Durable storage before any third-party call |
| Email provider, and the verified sender address | Transactional, not marketing blast |
| Analytics — GA4, GTM, Plausible, none | Production-only, always |
| Business facts | Name, phone (display + E.164), address, hours, service areas, credentials, founding year. One data file, read by both UI and structured data |
| **Where their customers are** — country, and any state or province that matters | Decides which accessibility law binds them. [`compliance.md`](compliance.md) §1 maps it |
| **Public sector, government contract, federally funded healthcare, or education?** | If yes, the accessibility target is a deadline, not a preference |
| **Any accessibility complaint or demand letter already?** | If yes, **stop and route to their counsel before scoping**. Default assumption: no |

**Then offer the wider compliance set, do not assume it.** Business field plus customer location
narrows it to two or three candidates. Put *those* in an `AskUserQuestion` as a multi-select and
let the client confirm — they know their obligations, you are inferring from outside.

> *"You're a dental practice with patients in California. Three usually apply: HIPAA on anything
> touching patient data, CCPA on the analytics, and your state board's rules on advertising
> claims and before/after imagery. Which are you already handling?"*

[`compliance.md`](compliance.md) §10 has the full map — by what the site *does* (payments,
health data, EU/UK data, marketing email, children's data) and by profession, which is the
commonly missed one because it constrains **copy** rather than code. Ask before building a form
that collects a field they are not allowed to hold.
| Anything already written but unpublished | Check the source folders. Finished work sitting in a drafts folder is free content |

**Then the provider decisions** — every one has a default, so ask only where the default may
not hold. Full reasoning and alternatives in [`stacks.md`](stacks.md):

| Ask | Default | Ask properly when |
| --- | --- | --- |
| Target framework | Astro | There is a real application surface, not just a site |
| Host | Cloudflare Workers | They are already committed elsewhere |
| Media / CDN | Worker assets, R2 past ~15 MB | Image-heavy, video, or client-uploaded media |
| CMS | None; PagesCMS if needed | Someone non-technical must publish without a deploy |
| Transactional email | Brevo | Deliverability is critical, or they have a provider |
| Mailboxes | Google Workspace — **separate question** | Never send app mail through Workspace SMTP |
| Analytics | GA4 if asked, else Cloudflare Web Analytics | Ask which report they actually read |
| Spam | Honeypot; Turnstile if spam appears | Known abuse history |
| Booking / CRM | None | They already run Jobber, Housecall, HubSpot… |
| Local listings | GBP + Bing + Apple | Not a service-area business |
| Accessibility target | WCAG 2.2 AA | Never lower it. Raise the *testing* effort when §1 of `compliance.md` names a deadline |
| **Domain and DNS access** | — | **Always ask. This blocks go-live more than anything technical** |

### Round 3 — Design direction and mobile

This is the round that decides whether the result looks premium or generic. Offer concrete
options, not "what look do you want?"

**Fidelity** — pixel-perfect clone / faithful rebuild / full redesign. Ask first; it moves
the most. Expect "faithful" to become "redesign" once they see a screen.

**On a full redesign, do two things before offering directions** — both in
[`design.md`](design.md) §1, and together they are worth more than the rest of this round:

1. **Ask for three to five sites they admire** (not competitors), plus one they dislike. Then
   say *why* each works in specific terms — face pairing, section padding, photo treatment.
   That converts taste into decisions
2. **Build the hero and one section in two or three directions with their real copy and photos,
   and deploy them to staging.** Let them choose from something on a screen rather than from
   adjectives. Tokens make a direction a variable set, not a rebuild — two directions is an
   afternoon, and it replaces the whole "actually, redesign it" cycle three weeks in

**Visual direction** — offer four, each with a one-line consequence:

| Direction | Reads as | Typography | Colour |
| --- | --- | --- | --- |
| **Editorial** | Considered, expensive, magazine-adjacent | Serif display + neutral sans | Restrained; one accent |
| **Technical** | Precise, engineered, trustworthy | Neo-grotesque + mono accents | Cool neutrals, high contrast |
| **Warm** | Human, local, approachable | Humanist sans, generous | Earthy, mid-saturation |
| **Bold** | Confident, young, high-energy | Heavy geometric display | Saturated, large blocks |

**Typography** — the reliable premium lever is a **serif display against a neutral sans**.
Almost every trades and services competitor runs Poppins or Montserrat; not doing that is
most of the differentiation. Name specific pairings rather than asking them to imagine one.

**Motion level** — none / restrained (CSS reveals, page transitions) / expressive (GSAP,
pinning, scrubbed timelines). Restrained is right for most; expressive costs ~70 KB and only
earns it with real choreography.

**Mobile** — ask these explicitly, they are usually skipped until they break:

- **Menu pattern** — full-screen overlay / slide-in sheet / bottom sheet / inline accordion
- **Persistent mobile CTA?** — a sticky call or book bar is the single highest-impact mobile
  feature for a services business, and the single most annoying if done badly
- **What must be visible without scrolling on a phone** — usually the offer and the CTA
- **Light / dark / auto?** — real cost, real audience for some sectors, none for others. If yes it is
  **three** states, not two, and the flash on load is the thing to get right: [`features.md`](features.md) §3

**Also settle:** logo files (light and dark variants), favicon source (a vector, ideally),
brand colours as hex, and whether credential badges exist. Look at them before designing
around them — badges are frequently white artwork that vanishes on a pale section.

---

## 2. Feature catalogue

Offer as a checklist. Everything here is implementable inside the stack profile in
[`build.md`](build.md) §4; the notes are what each actually costs.

### Core — assume unless told otherwise
- Contact/quote form with server-side validation and field-level errors
- Durable lead storage written **before** the email provider is called
- Transactional notification email, with the recipient env-derived so staging never mails
  the client
- Token-protected CSV export of leads — enough while a developer is the only one fetching it.
  If the **client** will read leads, offer a console behind Cloudflare Access instead: a token in
  a URL is one paste away from being permanent. [`stacks.md`](stacks.md) §6
- Honeypot spam trap, silently accepted
- Click-to-call and click-to-email everywhere the number appears
- 404 that returns a real 404 and offers **specific** routes onward — see [`features.md`](features.md) §1
- Accessibility statement at `/accessibility`, footer-linked from every page, generated from
  the business data file — **required** under the EAA and PSBAR, worth publishing everywhere
  else. See [`compliance.md`](compliance.md) §6

### Content
- Blog with typed frontmatter, validated at build
- Categories/tags with archive pages — generate only where posts exist
- RSS
- Related posts by shared taxonomy weight
- Auto table of contents from real headings
- Reading time
- Author profiles *(only if more than one person writes)*

### Local and service-area
- Service-area landing pages — one template + one data entry each. **Only for places you can
  describe distinctly**; otherwise they are doorway pages
- LocalBusiness / Organization JSON-LD from the same data file the UI reads
- Opening hours, with an open-now indicator if hours vary
- Map embed, lazy-loaded
- Multi-location NAP handling

### Trust and conversion
- Credential / accreditation strip
- Testimonials, with Review schema only if they are real and attributable
- Case studies or project gallery
- FAQ with FAQPage schema
- Pricing or package tables
- Booking embed (Calendly, Cal.com) — check the payload before committing
- Multi-step form *(only if the field count genuinely justifies it)*
- Sticky mobile CTA bar

### Technical
- View-transition page navigation
- Scroll reveal (IntersectionObserver, not a library)
- Responsive image pipeline with a dimensions manifest
- Sitemap, robots, canonicals — all env-derived
- Social cards, JPEG, generated only for images used as `og:image`
- PWA manifest and installability
- First-visit brand overlay — **cost it in LCP before shipping**; see §3
- Search *(over ~50 pages; below that it is furniture)* — page vs instant, and which engine: [`features.md`](features.md) §2
- i18n *(decide before building routes, never after)* — URL strategy and hreflang: [`features.md`](features.md) §4

### Deliberately not offered
Exit-intent popups, auto-playing audio, scroll-jacking, cookie walls beyond legal minimum,
newsletter modals on first paint. Say why if asked: each one trades a measurable amount of
trust for a marginal capture rate.

---

## 3. Design system spec

Write these as tokens **before** the first component. The test of the system is that changing
one value visibly moves the whole site.

### Type
- Two families. Display and body. A third is almost always a mistake.
- **Fluid scale with a restrained top.** A pure 1.33 ratio puts a hero headline past 100px at
  desktop — magazine cover, not a business people trust with money. Cap the top three steps.
- Variable fonts, self-hosted, subset to the scripts you need, `font-display: swap`.
  Same-origin means a preload is the whole story — no DNS, no third-party round trip.
- Use the optical-size axis if the display face has one.
- `--measure: ~68ch` for long-form. Headlines `text-wrap: balance`, body `text-wrap: pretty`.

### Colour
- Brand ramp (50→900) + **one** accent, used sparingly. One call to action per viewport.
- A semantic layer on top — `--bg`, `--text`, `--border`, `--surface` — so a `.on-dark`
  section can invert by redefining six variables and every component inside just works.
- Check contrast at the token level, not per component. Every text/background pair in the
  semantic layer clears 4.5:1, and each `.on-dark` inversion is checked separately — that is
  where it usually breaks. Brand accents rarely clear it, so an accent is never the only cue.

### Space, radii, elevation
- One spacing scale, used everywhere. Fluid section rhythm via `clamp()`.
- **Tint shadows with the brand hue.** Neutral grey shadows read as dirt on a warm palette.

### Motion
- Durations and easings as tokens. Fast ~120ms, base ~220ms, slow ~420ms.
- One easing for entrances, one for exits, one spring for anything playful.
- Everything honours `prefers-reduced-motion`.
- **Anything that hides an element must be the same thing that reveals it.** CSS that JS is
  expected to undo shows a blank page whenever the script fails.

### The premium levers, in order of effect

Depth on each — and the checklist to run against your own work — in [`design.md`](design.md) §2.
1. **Typography pairing and restraint** — more than any other single choice
2. **Generous, consistent spacing** — cramped is the most common tell of a cheap site
3. **Real photography, consistently treated** — one bad or mismatched image undoes a lot
4. **Considered dark sections** — a dark band between light ones creates rhythm
5. **Motion that is felt, not watched** — 200ms, not 800ms
6. **Detail on the small things** — focus rings, form states, empty states, the 404

---

## 4. Mobile — decide these up front

Most of the expensive mobile bugs come from treating mobile as a resize of desktop.

- **The menu replaces the header; it does not layer under it.** A fixed bar over a panel
  covers the first nav item. Hide the bar and give the panel its own close control.
- **That close control must be sticky.** `position: absolute` inside a scrolling panel
  scrolls away with the content and strands the user.
- **`100dvh`, never `100vh`.** `vh` excludes collapsing browser chrome, so a full-height
  panel hides its own bottom CTA.
- **Centre with `margin: auto`, not `justify-content: center`.** Centred flex content taller
  than its box overflows both ways and the top cannot be scrolled to — which is exactly what
  a landscape phone produces.
- **44px minimum tap targets**, and put primary actions in the lower half of the screen where
  a thumb reaches.
- **Test a short viewport**, not just a narrow one. 740×420 catches what 390×844 hides.
- **Test on a real device before believing any of it.** Emulated widths do not model browser
  chrome, touch latency, or how fast the thing actually feels.

---

## 5. Output of discovery

Before writing code, restate as a short spec and get confirmation:

```
Project      <name> · <type> · win = <one action>
Archetype    <landing / local / multi-location / professional / SaaS / corporate / editorial>
Stack        <framework + host + storage + email>
Routes       <count> across <families>
Features     <the checked list>
Design       <direction> · <display font> + <body font> · <motion level>
Mobile       <menu pattern> · <sticky CTA y/n> · <above-fold requirement>
Compliance   WCAG 2.2 AA · binding law: <none / Title II / EAA / …> · deadline <date or none>
Environments <staging host> → <production host>, derived from <build variable>
Open         <anything still unanswered>
```

Then build to [`build.md`](build.md) — phases, traps, definition of done.
