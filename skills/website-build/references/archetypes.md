# Archetypes — page shape by site type

The archetype decides **section order, proof model and where conversion sits**. It does not
decide how the site looks — that is the visual direction in [`kickoff.md`](kickoff.md) Round 3,
and the two are independent. An editorial-looking SaaS site and a bold-looking one have the
same page shape.

Pick from the win, not the industry. A clinic running one campaign is a **landing page**; the
same clinic's main site is **professional services**. Ask *"what is the one action that counts
as a win"* and the shape follows.

| Archetype | The win | Conversion sits |
| --- | --- | --- |
| [Landing](#landing) | One action, usually now | Everywhere. One CTA, repeated |
| [Local services](#local-services) | The phone rings | Every viewport, plus a sticky mobile bar |
| [Multi-location](#multi-location) | Phone or booking, at the right branch | The branch page, never the hub |
| [Professional services](#professional-services) | A consultation booked | After trust is established, not before |
| [Product / SaaS](#product--saas) | Signup or demo | Hero and pricing. Two paths, both open |
| [Corporate](#corporate) | Depends on the audience | Per audience route, not on the homepage |
| [Editorial / portfolio](#editorial--portfolio) | The work gets seen; an enquiry follows | Quiet, after the work |
| [E-commerce](#e-commerce) | — | Not this kit. See below |

---

## Landing

One offer, one audience, one action. Usually campaign traffic, so the visitor arrived with
intent and no context about the brand.

```
hero — offer + the proof, together
  ↓  social proof strip
  ↓  mechanism: how it works, three steps
  ↓  objection handling (FAQ, framed as objections)
  ↓  risk reversal — guarantee, free trial, no-obligation quote
  ↓  CTA
```

- **No navigation.** Every nav link is an exit from a page with one job. Logo, and the CTA.
- **Proof above the fold, beside the offer.** A claim alone reads as an ad. A claim with a
  number, a name or a logo beside it reads as a fact.
- **One CTA, repeated verbatim.** Different wording for the same action reads as two choices
  and halves both.
- **Sticky CTA on mobile** once the hero leaves the viewport — this is long-scroll by design.

**Failure mode:** adding the main site's nav "so people can explore". They do, and they don't
come back. Second most common: a long page with the only CTA at the bottom.

**Measurement is unusually clean here** — one page, one action. Scroll depth against CTA clicks
tells you which section is losing people, which is a rewrite instruction, not a design opinion.

**If the offer is urgent** — burst pipe, locksmith, breakdown recovery — this shape stays but
the proof model changes. The visitor is stressed and on a phone, and is assessing *are you real
and will you answer*, not whether the site is considered. A licence number, a stated response
time and a photo of a van with a name on it outperform anything on the premium levers list.
See [`design.md`](design.md) §4: this is a case where designing for expensive misses.

---

## Local services

The kit's most common brief. Someone has a problem now and is choosing between three local
firms on their phone.

```
hero — what you do, where, and the CTA
  ↓  trust strip: credentials, years, insurance, accreditations
  ↓  services grid → service detail pages
  ↓  service area — named places, with something true about each
  ↓  proof: reviews, real photos of real jobs
  ↓  process: what happens after they call
  ↓  FAQ
  ↓  CTA band
```

- **The phone number is reachable from every viewport**, tap-to-call, plus a sticky mobile bar.
  This is the single highest-impact mobile feature for this archetype.
- **Process beats persuasion.** "What happens after you call" removes more friction than another
  adjective, because the hesitation is usually about the unknown, not the price.
- **Real photos of real jobs.** Stock photography of a stranger's kitchen is the loudest tell of
  a cheap site, and this audience is specifically checking whether you are real.
- `LocalBusiness` JSON-LD from the same data file the footer reads.

**Failure mode:** service-area pages that differ only by town name. Those are doorway pages and
can be penalised — the rule in [`build.md`](build.md) §2 is that if an entry cannot be written
distinctly, the page should not exist. Something genuinely local per page: which authority
issues the permit, what the housing stock is, what actually drives demand there.

### Gate every business fact nobody has confirmed

Opening hours, coordinates, service areas and credentials arrive inherited from the old site,
a directory listing, or the client's memory — and they are wrong often enough that a rebuild is
the moment to re-check them, not to copy them faster.

**Emit nothing that is unconfirmed.** Wrong hours in `LocalBusiness` schema are worse than
absent hours: Google may surface them, and someone drives to a locked door. Absent hours cost
a little visibility; wrong hours cost a customer and a review.

Carry a **boolean per fact**, not a comment saying "check this" — `hours.confirmed`,
`geoConfirmed`. A flag is readable by the template, so the schema block and the footer both
skip the fact automatically. A comment is readable only by whoever opens the file.

Keep the unverified values **visible rather than deleted**, in their own file: you can then see
what the old listing claimed next to a flag saying nobody has checked it, which is what makes
the confirming conversation short.

**The gate is necessary, not sufficient.** Withholding hours buys nothing while an old domain
or a stale directory publishes the wrong ones for the same business — pair it with the listings
sweep in [`stacks.md`](stacks.md) §8.

---

## Multi-location

Local services with a branch dimension. One template plus data — the entire archetype is a
content-model decision.

```
hub: locations index — map or list, no marketing copy
  ↓  branch page (template × N) — own NAP, own hours, own team, own proof
```

- **The hub does not convert; the branch does.** Its job is routing, so make it fast to scan
  and never bury the branch behind a form.
- **NAP is per branch and must match character for character** across the page, the JSON-LD and
  every directory listing. Take all three from one data file so they cannot drift.
- **One `LocalBusiness` entity per branch**, each with its own `@id` — not one entity with
  several addresses.
- Branch pages need their own proof: reviews mentioning *that* location, the team who work
  there. Shared corporate testimonials undercut the whole point of having branch pages.

**Failure mode:** boilerplate with the town swapped in — the same doorway-page problem as above,
multiplied by the branch count and easier to fall into because the template makes it cheap.

---

## Professional services

Law, accountancy, clinics, consulting, agencies. **Trust before persuasion** — this audience is
assessing risk, not comparing features, and they are often spending someone else's money.

```
hero — frame the client's problem, not the firm's history
  ↓  credentials: regulator registration, memberships, insurance, years
  ↓  practice areas / services
  ↓  the people — named, with real credentials and real photos
  ↓  outcomes: cases, results, named client logos
  ↓  process, and what it costs
  ↓  FAQ
  ↓  contact — with a human route, not only a form
```

- **Name the people.** "Our team of experts" converts worse than one named person with a
  registration number. This is the archetype where a leadership page earns its place.
- **Anonymous testimonials are worth close to nothing here** and can actively hurt. Attributable
  or omit — and `Review` schema only if attributable.
- **Say something about cost.** Not necessarily a price: a range, a model, a "first consultation
  is free". Total silence reads as expensive, and the enquiry never happens.
- **Check what they are allowed to claim.** Bar associations, medical advertising rules and
  financial-promotion rules all constrain wording, and the client may not volunteer it. This
  belongs in the same discovery round as the accessibility and privacy questions.

**Failure mode:** stock handshake photography and "we" with no names behind it. It signals the
opposite of what the archetype needs.

---

## Product / SaaS

Marketing surface for a product that can be tried. **Time-to-value on the page** — the visitor
should understand what it does before they scroll.

```
hero — what it does in one sentence + a real product visual
  ↓  customer logos or a usage number
  ↓  the problem, then the solution
  ↓  capability by job-to-be-done, not by feature name
  ↓  pricing — legible without a sales call
  ↓  objection FAQ: security, migration, lock-in, support
  ↓  CTA — both paths open
```

- **A real screenshot of the real UI**, not an abstract illustration. Abstract product art means
  either there is nothing to show or you are hiding it, and both read the same way.
- **Two paths, both open.** Self-serve signup *and* talk-to-sales. Forcing everyone through a
  demo form loses the segment that would have paid without speaking to anyone.
- **Pricing on a page, not behind a form.** If it is genuinely bespoke, publish the model and a
  starting figure — "from £X, priced on seats" beats "contact us".
- **Group by job, not by feature.** "Close the month in two days" outperforms "automated
  reconciliation" for the same capability.
- Docs, changelog and integrations pages are the durable SEO surface for this archetype and are
  usually the last thing anyone builds. Decide early whether they live in this site or another.

**Failure mode:** a feature list where an outcome should be, and pricing gated behind a form.

---

## Corporate

Multi-stakeholder: customers, investors, press, candidates, partners. **The hero cannot serve
four audiences** — so it does not try.

```
hero — what the company is, in one line
  ↓  what we do — the businesses or divisions
  ↓  proof at scale: numbers, footprint, tenure
  ↓  audience routes ← the actual navigation decision
       ├── customers  → the product or divisional sites
       ├── careers    → usually the highest-traffic section
       ├── newsroom   → press, releases, media kit
       ├── investors  → results, reports, governance
       └── ESG / responsibility
```

- **Split the audience in the navigation, not in the hero.** Four value propositions stacked in
  one hero means none of them lands.
- **Careers is usually the highest-traffic section and always the worst-maintained.** Treat it
  as a first-class template, not a link to a bare ATS listing page — candidates judge the
  company by it, and it is frequently the only page they see.
- **Investor relations has disclosure obligations.** Publication timing, archival requirements
  and fair-disclosure rules are real constraints. Ask who signs off before building the section,
  and never let a build variable decide whether a results page is live.
- **The leadership page goes stale silently.** Someone leaves, the page does not change, and it
  is a press story. Drive it from data and put it in the handover as a maintenance item.

**Failure mode:** one homepage trying to speak to everyone, and a careers section that is a
redirect.

---

## Editorial / portfolio

The work is the product. **Image fidelity and typography carry the entire archetype**, and
compression is the failure mode people ship without noticing.

```
work index — a grid with real hierarchy, not a uniform wall
  ↓  case study — outcome first, then process, then craft
  ↓  about — the person or studio
  ↓  contact — quiet, and easy to find
```

- **Outcome first in a case study.** Process is interesting to you and not to the person
  deciding whether to hire you. Lead with what changed, then show how.
- **Raise the media quality ceiling for this archetype.** The default pipeline in
  [`build.md`](build.md) §3 phase 5 is tuned for marketing photography; portfolio work needs a
  higher quality floor and wider max widths. Measure the payload after raising it — this is the
  one archetype where the trade is genuinely worth making, and it should still be a decision
  with a number attached.
- **Hierarchy in the grid.** A uniform grid of equal tiles has no entry point and flattens the
  best work down to the level of the filler.
- Every project needs context — client, problem, role, year. A lightbox of pretty images with no
  captions is a gallery, not a portfolio.

**Failure mode:** the work compressed to mush by a pipeline nobody re-checked, and an infinite
uniform grid with no way in.

---

## E-commerce

**This kit is the wrong shape for a storefront** and adding one would not make it right.
Catalogue, cart, checkout, tax, inventory, fulfilment and payment compliance are a platform's
job, and a static marketing build has none of it.

What to do instead:

| Situation | Do |
| --- | --- |
| They have a store and want a better *site* | Build the marketing surface — home, about, services, editorial, landing pages — and leave checkout where it is. This is a normal brief for this kit |
| Migrating off WordPress **with** WooCommerce | Migrate the marketing pages. Move commerce to a storefront platform as a separate project, with its own scope and its own person |
| Selling a handful of items, no catalogue | Stripe Payment Links or Checkout from a static page. No platform, no cart. This stays inside the kit |
| A real catalogue | A storefront platform. Say so before quoting, not after |

The honest version of the conversation: the marketing site and the store are two systems that
share a domain and a design system. This kit builds one of them well.

---

## Hybrids

Most real briefs are a primary archetype plus one section borrowed from another — a
professional-services firm with a campaign landing page, a SaaS company with a corporate
newsroom.

**Build the primary archetype's shape, and let the borrowed section keep its own rules.** A
landing page inside a services site still drops the nav. A newsroom inside a SaaS site still
gets a real template. The mistake is averaging the two into a shape that serves neither.

If two archetypes genuinely compete for the homepage, that is usually two sites, or a corporate
shell with routes to each — and it is a conversation to have during discovery, not after.
