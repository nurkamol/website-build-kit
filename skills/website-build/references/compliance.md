# Compliance

Which laws bind this client, what they demand, what you have to build, and what you hand over
as evidence. **Accessibility is §1–§9** — it is the bulk of it and the part that changes the
markup. **§10 is everything else the sector and the location pull in**, offered as a choice
rather than assumed.

**Verify the dates in §1 before quoting them to a client.** Two US deadlines moved by a full
year during 2026. Everything here was checked in August 2026; treat it as the shape of the
answer, not the current answer.

**You are not their lawyer.** This file decides what to *build*. Where money or a live claim
is involved, the client's counsel decides what they *owe*.

---

## 1. Which law applies

Driven by who the client is and where their customers are — not where the server is.

| Client | Standard it names | In force |
| --- | --- | --- |
| **US private business** (ADA Title III) | None named in the regulation. DOJ settlements and courts have converged on **WCAG 2.1 AA** | Now. Litigation-driven, not deadline-driven |
| **US state or local government** (ADA Title II) | **WCAG 2.1 AA** — DOJ final rule, 2024 | 26 Apr **2027** (population ≥ 50k) · 26 Apr **2028** (smaller, and special districts). Both extended a year on 17 Apr 2026 |
| **US healthcare taking HHS funds** (Section 504) | **WCAG 2.1 AA** | 11 May **2027** (≥ 15 employees) · 10 May **2028** (fewer). Extended a year on 7 May 2026 |
| **US federal agency, or a vendor selling to one** (Section 508) | **WCAG 2.0 AA** — Revised 508 Standards, 2017. No refresh scheduled | Now |
| **EU B2C** in e-commerce, banking, telecoms, transport, e-books, AV media (EAA) | **EN 301 549** → WCAG 2.1 AA. v4.1.1 moves it to 2.2 | Since 28 Jun 2025 |
| **EU public sector** (Web Accessibility Directive) | EN 301 549 + a published statement | Now |
| **UK public sector** (PSBAR) | **WCAG 2.2 AA** + a published statement | Now |
| **UK private** (Equality Act 2010) | None named — "reasonable adjustments" | Always |
| **Ontario** — public sector, or 50+ employees (AODA / IASR) | **WCAG 2.0 AA**, less live captions and audio description | Since 1 Jan 2021 |
| **Canada federal** (Accessible Canada Act) | EN 301 549 via CAN/ASC-EN 301 549 | Phased |
| **Australia** (DDA 1992) | None named; government policy uses WCAG 2.1 AA | Always |

Also worth knowing by name, because clients ask: **France** RGAA (Article 47 carries fines and
a mandatory public conformance declaration), **Germany** BFSG (the national EAA transposition —
this is the one German clients will have heard of), **Italy** Stanca Act / AgID, **Israel** IS
5568 (WCAG 2.0 AA, unusually aggressive private-sector enforcement).

### The EAA trips people up in one specific way

It does **not** apply to every website. It applies to the listed B2C service categories. A
plumber's brochure site in Munich is outside it; that same plumber taking bookings and payment
online is arguably inside it, because e-commerce is a covered service.

**Microenterprise exemption:** fewer than 10 employees **and** turnover or balance-sheet total
at or under €2m. Services only — never products. And an EAA exemption is not an exemption from
national disability discrimination law, which has no size threshold.

---

## 2. Pick one target: WCAG 2.2 AA ✅

Not because every client is bound by 2.2. Because **2.2 AA is a superset of 2.1 AA, which is a
superset of 2.0 AA** — one target satisfies every row in §1 at once, and you never rebuild when
a client expands into a new market or the standard steps forward.

Nine success criteria separate 2.2 from 2.1. On a marketing site, most are already satisfied by
building properly: focus not obscured by a sticky header, 24×24 targets, no drag-only
interaction, no cognitive tests in a form. 2.2 also *removed* 4.1.1 Parsing — validator noise
about duplicate IDs is no longer a conformance failure, though it is still a bug.

**AAA is not the target.** It is not achievable site-wide by design, and W3C says so. Cherry-pick
individual AAA criteria where they are cheap — 1.4.6 contrast on body text, 2.4.9 link purpose
from the text alone — and never claim AAA conformance.

**Do not promise "fully compliant".** Conformance is per-page, per-state, at a point in time, and
one client edit can break it. Promise a target, a testing method, and a fix commitment. That is
also what the statement in §5 says.

---

## 3. Ask this in discovery, and default it

Fold into Round 2 alongside the other legal questions. Three answers decide everything above.

| Ask | Default if they do not know |
| --- | --- |
| Where are your customers — country, and any state or province that matters? | Their own market only |
| Public sector, government contract, healthcare taking federal funds, or education? | No — and if yes, the target is not negotiable |
| Any complaint, demand letter or legal threat about accessibility already? | No. **If yes, stop and route to their counsel before scoping** |

Then state the conclusion in the spec block rather than the input: *"US private, no public
contracts → no deadline binds you; building to WCAG 2.2 AA because retrofitting later costs
several times what doing it now costs."*

**Do not sell compliance work that is not owed.** Most local-services clients have no statutory
deadline at all. The honest pitch is that accessible markup is nearly free at build time and
expensive as a retrofit — and that roughly a fifth of their market is affected either way.

---

## 4. Audit the existing site first

On a migration this is the highest-value thing you can hand over in the first hour, and you are
crawling the site for the URL inventory anyway.

```bash
npx pa11y-ci --sitemap https://site.com/sitemap.xml --standard WCAG2AA
```

Report it as a count, per template family, not per URL — *"every one of the 8 service pages fails
contrast on the CTA, one token fixes all 8"*. That is a scope statement. A 900-row CSV is not.

Two things this gives you beyond a to-do list: it prices the accessibility line item honestly,
and it establishes a before/after you can put in the handover.

---

## 5. What a marketing site actually gets wrong

The full 2.2 checklist is not the useful artefact. These are the criteria that fail on real
marketing builds, with where the fix belongs.

| Fails | SC | Fix, and where it lives |
| --- | --- | --- |
| Text or CTA on a hero image | 1.4.3 | Check contrast **at the token level** against the darkest and lightest the overlay reaches, not one screenshot |
| Brand accent as the only link indicator | 1.4.1 | Underline in body copy, or a non-colour cue. Brand accents rarely clear 4.5:1 |
| Placeholder used as the label | 3.3.2, 1.3.1 | Real `<label for>`. Placeholder is a hint, never a name |
| Error shown in red text only | 3.3.1 | Text + `aria-describedby` + `aria-invalid`, and move focus to the first bad field |
| Icon-only buttons | 4.1.2 | Accessible name on the control; `aria-hidden` on the glyph |
| Decorative image with a filename as alt | 1.1.1 | `alt=""`. An empty alt is correct far more often than people expect |
| Sticky header covering the focused element | **2.4.11** (new in 2.2) | `scroll-margin-top` on focus targets equal to header height |
| Tap targets under 24×24 | **2.5.8** (new in 2.2) | Already covered if you hold the 44px mobile rule in `kickoff.md` §4 |
| Carousel or slider with no pause | 2.2.2 | Pause control, or do not auto-advance. Usually: do not auto-advance |
| Video with no captions | 1.2.2 | Budget captions with the video, or do not embed it |
| Reflow breaks at 320px | 1.4.10 | Test at 320px wide, and at 400% zoom — the same failure surfaces twice |
| `h4` chosen because it looked right | 1.3.1 | Heading level is structure; size is a token. Never couple them |
| Skip link missing or broken | 2.4.1 | See §8 — this one usually looks like it works |
| Motion with no `prefers-reduced-motion` | 2.3.3 | Already a standing instruction. It is also a conformance criterion |

Everything in `build.md` §2 that reads as craft — semantic landmarks, labelled controls, visible
focus, progressive enhancement — is also conformance. Building the way this kit already says to
build gets most of the way there. §8 is where it silently does not.

---

## 6. The accessibility statement

A **required published artefact** under the EAA, PSBAR and the Web Accessibility Directive. In
the US it is not required, and it is still worth publishing: it is dated evidence of a
deliberate process, which is what a demand letter is fishing for the absence of.

Lives at `/accessibility`, linked from the footer on **every** page, in the same treatment as
the privacy policy. Not in a burger menu, not only on the contact page.

| Must contain | Not |
| --- | --- |
| The target — "WCAG 2.2 Level AA" | "This site is fully accessible" |
| Conformance state — fully / partially, and **what specifically is not**, by name | Silence about known gaps |
| How it was tested: tools, manual passes, assistive tech, dates | "Tested for accessibility" |
| A contact route **that works** — email or form, plus phone if they have one | A generic info@ nobody reads |
| A response commitment with a number in it — five working days is a normal one | "We will respond as soon as possible" |
| The enforcement route for their jurisdiction (EU/UK statements require this) | — |
| Date prepared and date last reviewed | An undated statement, which reads as abandoned |

Generate it from the same business data file the footer and JSON-LD read, so the contact route
cannot drift out of sync. Naming a real gap costs nothing and is worth more than a clean claim —
it is the difference between a documented backlog and an undiscovered failure.

---

## 7. Testing — what counts as evidence

**Automated tooling is necessary and nowhere near sufficient.** Published coverage ranges from
roughly a third of issues (axe-core alone) to about 57% by volume in Deque's own study, and
around 42% of WCAG criteria cannot be machine-checked at all. A clean axe run is the floor.

| Layer | Tool | Catches |
| --- | --- | --- |
| Per-page, during build ✅ | axe DevTools | Contrast, names, roles, structure |
| CI, whole site ✅ | `pa11y-ci` against the sitemap | Regressions on pages nobody re-opened |
| Keyboard ✅ | Tab, Shift-Tab, Enter, Space, Escape — hands off the mouse | Focus order, traps, invisible focus, unreachable controls |
| Zoom and reflow ✅ | 200% and 400%; 320px viewport | Clipped content, horizontal scroll, lost controls |
| Screen reader ✅ | VoiceOver on Safari, or NVDA on Firefox | Whether the page *makes sense*, which nothing else tests |
| Forms ✅ | Submit empty, submit bad, submit with JS off | Error association, focus movement, announcements |
| Independent audit | A specialist firm | Only when there is a contract, a deadline or a live claim |

One full pass on **one page per template family**, not every URL. A per-page pass on the
homepage misses everything the blog does differently.

**Hand over the evidence, not the assertion.** Dated tool output, which pages were tested
manually and how, known gaps with an owner, and the statement from §6. This is a handover
section in `build.md` §3 phase 9, and it is the thing that has value if anyone ever asks.

`npm run a11y:evidence` in the template writes the machine half — standard, tool versions,
per-family results, the reflow pass — and leaves the three rows above it **blank**, because a
script cannot know who ran a screen reader or on what day. It also warns when the published
statement's `reviewed` date is older than the run, which is how a legal page ends up making a
testing claim about a site that has since been rebuilt.

---

## 8. Fails silently

Clean build, clean axe run, looks right. Same bar as `traps.md`.

**`aria-hidden="true"` on a wrapper that still contains focusable children.** Keyboard focus
lands on controls the screen reader has been told do not exist. Nothing warns you, because
visually it is correct. *Fix:* `inert` — it removes both, or hide the children too.

**A skip link that goes nowhere.** `href="#main"` moves the *scroll position* to a `<main>`
without `tabindex="-1"`, but not the focus — so the next Tab returns to the top of the nav.
Sighted testing shows the page jump and looks like it worked. *Fix:* `tabindex="-1"` on the
target, and test by Tabbing *after* activating it.

**A live region injected at announce time is not announced.** `role="status"` must be in the DOM
*before* its content changes, or the screen reader has nothing to observe. Building the element
and its text together announces nothing. *Fix:* render the empty region on load and write into it.
(The template's `ContactForm.astro` already does this — do not "simplify" it.)

**`outline: none` plus a `box-shadow` focus ring disappears in forced-colors mode.** Windows
High Contrast drops shadows. Focus becomes genuinely invisible for the users most likely to be
in that mode. *Fix:* `:focus-visible { outline: 3px solid }` — the template does this — and check
`forced-colors: active` before replacing it with anything prettier.

**CSS reordering breaks focus order without breaking anything visible.** `order`, `row-reverse`
or explicit `grid-area` make the tab sequence disagree with the visual sequence. It reads
correctly and tabs backwards. *Fix:* source order matches visual order; reorder markup, not CSS.

**200% zoom triggers the mobile breakpoint.** Zoom scales the CSS viewport, so a desktop user at
200% gets the burger menu — fine, if the burger menu was tested at that size. It usually was not,
because it was only ever opened on a phone.

**A `<div>` with a click handler is invisible to the keyboard.** No focus, no Enter, no Space, no
role. Every automated tool flags this — but only if the handler is in the markup. Attached later
by JavaScript, nothing sees it.

**An `aria-label` overrides the visible text for voice control.** A button reading "Get a quote"
labelled `aria-label="Contact form submit"` cannot be activated by someone saying "click get a
quote". *Fix:* the accessible name contains the visible text (2.5.3), or add no label at all.

---

## 9. Overlays: no

Do not install AccessiBe, UserWay auto-fix, or any widget promising compliance from one script
tag. If a client asks, or already has one, this is the answer:

- **They do not prevent lawsuits.** In the first half of 2025, 456 US web accessibility suits —
  22.6% of all filings — targeted sites that had an overlay installed.
- **Vendors have been penalised for the claim itself.** The FTC fined accessiBe $1m in January
  2025 over deceptive compliance marketing.
- **They do not fix the markup.** They patch the DOM at runtime, so the underlying failure
  remains, the fix is invisible to a code audit, and it breaks again on the next deploy.
- **They cost LCP** — a render-blocking third-party script on every page, for a fix a token
  change would have made permanently.
- **Users of assistive technology consistently ask sites to remove them**, because they conflict
  with the screen reader the person already configured.

The instinct behind the ask is right: the client wants this handled without a project. Name the
instinct, then offer the cheaper real route — the §5 fixes are mostly token-level and cost hours,
not a subscription.

---

## 10. Beyond accessibility — what the sector and location pull in

**Offer these as a choice, do not assume them.** Business field plus customer location narrows
it to two or three candidates; present those with `AskUserQuestion` and let the client confirm,
because they know their obligations and you are guessing from the outside.

The framing that works: *"Given you are a dental practice with patients in California, three
things usually apply — HIPAA on anything that touches patient data, CCPA on the analytics, and
your state board's rules on advertising claims. Which of these are you already handling?"*

That question surfaces the constraint **before** you build a form that collects the wrong field.

### By what the site does

| If the site… | Pulls in | Changes the build |
| --- | --- | --- |
| Takes card payments | **PCI DSS** (SAQ A if fully hosted) | Never touch card data. Hosted fields or a redirect — the moment card data crosses your origin, the scope explodes |
| Collects any health information | **HIPAA** (US) | A normal form endpoint is not compliant. Signed BAA with every processor in the chain — including the email provider and the host. Usually: do not collect it, link to their portal |
| Collects EU or UK personal data | **GDPR / UK GDPR** | Lawful basis, a real privacy notice, data-subject requests, processor agreements, retention limits on the lead store |
| Collects Californian personal data | **CCPA/CPRA** | Notice at collection, a "Do Not Sell or Share" route if any ad tech is present, opt-out honoured |
| Sets non-essential cookies or similar storage | **ePrivacy** (EU/UK cookie rules) | Prior consent, genuinely refusable. Cookieless analytics avoids the banner entirely — see `stacks.md` §9 |
| Sends marketing email | **CAN-SPAM** (US) · **CASL** (Canada) · GDPR (EU) | Consent model differs by market. CASL is opt-in and strict; get it right at the signup form, not later |
| Handles children's data | **COPPA** (US) · age-appropriate design codes (UK/EU) | If under-13s are a real audience, this changes the whole data model |
| Serves consumer financial products | **GLBA**, **Reg Z/E** (US) · **FCA financial promotions** (UK) | Advertised rates and terms carry mandated disclosures. Copy needs sign-off, and the site cannot be the source of truth for a rate |
| Is a school or handles student records | **FERPA** (US) | Directory information rules affect what can appear on a public staff or student page |

### By profession — what they may *say*

The commonly missed one. These constrain **copy**, not code, and the client rarely raises them.

| Field | Constraint |
| --- | --- |
| **Legal** | Bar advertising rules per state or jurisdiction. "Specialist" and "expert" are restricted terms in several; results and testimonials often need a disclaimer |
| **Medical, dental, clinical** | Board advertising rules; before/after imagery is restricted or banned in some jurisdictions; efficacy claims need substantiation |
| **Financial advice** | Registration disclosures, risk warnings, and past-performance wording are mandated, not optional |
| **Real estate** | Fair-housing language (US); licence numbers displayed; equal-opportunity marks |
| **Trades** | Licence and insurance numbers displayed, often with a required format |
| **Supplements, cosmetics, wellness** | Health claims are the most enforced category in advertising standards. "Treats" and "cures" are the words that draw letters |

**Do not write the disclaimer yourself.** Ask what their regulator requires, build the slot for
it, and record in the handover that the wording came from the client. Where nothing is supplied,
say so in `BUILD-STATE.md` as an `!` rather than inventing text that reads as legal advice.

### What this actually adds to the build

Most of it is not code. What is:

- **A privacy notice describing what the site genuinely does** — not a template describing
  tracking you did not implement. `stacks.md` §9 makes this point already; it matters more once
  a named regime applies
- **Retention on the lead store.** KV entries are forever by default. GDPR storage limitation
  means a TTL or a scheduled purge, and it is a two-line change now versus a data audit later.
  The template does this through `site.leadRetentionDays` → a KV `expirationTtl`; **keep that
  number and the published privacy notice in step**, because the published one is the promise
  you are judged against. This paragraph predates the implementation by months — the
  requirement was written down here and the template held leads forever anyway, which is worth
  remembering the next time a reference says "should"
- **Keep personal data out of KV metadata.** `list()` returns metadata without reading values,
  so anything there is available through the cheaper call for no benefit
- ⚠ **THE MESSAGE BOX IS WHERE REGULATED DATA ACTUALLY ARRIVES, AND NOT ASKING IS NOT A CONTROL.**
  You can design a form that requests nothing regulated and still receive *"my son is 7, diagnosed
  with X, currently on Y"* in the free-text field. At that moment it is in KV, in the notification
  email, and in the CSV export — for a client whose position assumes it is not.

  It is silent in the worst way: the form works, the lead arrives, nothing errors, and every gate
  in this kit passes. The exposure surfaces in an audit or a breach.

  **Drop it server-side, in the handler, before storage and before any third-party call.** Not
  `maxlength`, not a warning label above the textarea, not "we did not ask for it". A control that
  lives in markup is one the sender can ignore.

  **Then try to defeat it.** Craft a submission containing exactly what must not be kept — a name,
  an age, a diagnosis, a card number, whichever applies — send it, and read the stored record back.
  A control nobody has attacked is an assumption. On the build this came from that test is a row in
  the verification table, and it is the only reason the claim "PHI not collected" is worth anything.

  Not only healthcare: GDPR special categories, payment details pasted into a message, immigration
  status — anything §10 above says the client may not hold.
- **A data-subject request route** that reaches a human
- **A consent mechanism only if you set something that needs one.** Cookieless analytics means
  no banner, which is both cheaper and better
- **Named disclosure slots in the templates**, driven from the business data file so the
  licence number cannot drift between the footer and the service page

**Say plainly what you are not.** You are building to constraints they confirm; their counsel
confirms the constraints. That sentence belongs in the handover.

---

## Sources

Checked August 2026. Re-verify §1 before quoting a date.

- [ADA Title II — deadlines extended April 2026](https://www.jacksonlewis.com/insights/doj-extends-public-entities-compliance-deadline-ada-related-website-accessibility-hhss-may-2026-deadline-still-looms)
- [HHS Section 504 — deadline extended May 2026](https://www.hhs.gov/press-room/hhs-extends-mobile-and-web-accessibility-deadline.html)
- [Revised Section 508 Standards](https://www.access-board.gov/ict/)
- [European Accessibility Act — European Commission](https://commission.europa.eu/strategy-and-policy/policies/justice-and-fundamental-rights/disability/european-accessibility-act-eaa_en)
- [EAA scope: products and services](https://accessible.org/eaa-scope-products-services/)
- [AODA / IASR web requirements](https://www.levelaccess.com/compliance-overview/accessibility-for-ontarians-with-disabilities-act-aoda-compliance/)
- [UK PSBAR and Equality Act](https://www.audioeye.com/post/uk-website-accessibility-law/)
- [Deque — automated testing covers 57% of issues by volume](https://www.deque.com/blog/automated-testing-study-identifies-57-percent-of-digital-accessibility-issues/)
- [Overlay-equipped sites in 2025 lawsuit filings](https://www.accessibility.works/blog/accessibility-overlay-widgets-attract-lawsuits/)
