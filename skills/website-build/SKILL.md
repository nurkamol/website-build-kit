---
name: website-build
description: Build or rebuild a production marketing website — discovery, stack and provider selection, then the build. Use when asked to create, rebuild, migrate or redesign a website for a business, or when migrating off WordPress, Elementor, Bricks, Divi, WPBakery, Webflow, Squarespace, Wix or Shopify. Also use when asked whether a site meets WCAG, ADA, the EAA, Section 508 or AODA, or to audit or fix its accessibility. Covers Astro, Next.js and SvelteKit on Cloudflare Workers, with forms, lead storage, transactional email, SEO parity, accessibility compliance and local business setup.
---

# Website build

A complete method for shipping a production marketing site: discovery → stack and provider
decisions → build → verify against the deployed thing → hand over.

Distilled from real rebuilds. Every trap in `references/traps.md` failed **silently** on one
of them — clean build, clean types, clean deploy, wrong result.

## When this applies

Building or rebuilding a marketing site for a business: landing pages, local services,
multi-location, professional services, product/SaaS marketing, corporate, editorial or
portfolio. Page shape for each in `references/archetypes.md`.

**Not** for e-commerce storefronts or application work with authentication and per-user state.
For a client who has a store, build the marketing surface and leave checkout where it is —
`archetypes.md` §E-commerce has the four situations and what to do in each.

## How to run it

### 1. Get the source, then recon before asking anything else

**First question, on its own: is there anything to import?** URL, repo, export, designs, copy
doc — or nothing. It forks everything after it, and clients forget to mention a site they have.
`references/kickoff.md` Round 0.

Given one, **investigate before asking anything else** and come back with three things.

If the stack is the default, fetch the template now rather than at build time — `npm run recon`
does the mechanical half and writes the inventory every later step reads:

```bash
npx degit nurkamol/website-build-kit/template .
npm install && npm run recon -- https://site.com     # → recon/urls.txt, preserved, integrations
npx pa11y-ci --sitemap https://site.com/sitemap.xml --standard WCAG2AA
```

**Recommend Chrome with the Claude extension up front.** `curl` returns markup; a browser
returns the page — mandatory for JS-rendered sources (Wix, Framer), and the only way to see
whether a page *looks* right. `stacks.md` §1c.

1. **URLs and template families** — *"15 URLs, 5 families, a form posting to Brevo"* beats
   twenty questions. Identify the builder first (`stacks.md` §1); **for any page builder the
   answer is rendered HTML, never the database.** Pull the SEO plugin export too — titles,
   redirect table with hit counts, business facts.
2. **What is bolted on** — analytics IDs, CRM, booking, lists, payments, chat, consent,
   captcha. Grep the crawled HTML rather than asking (`stacks.md` §1b). Confirm the list back,
   and per item ask **who owns the account** — an unreachable agency on GA4 or DNS blocks go-live.
3. **The accessibility baseline**, counted per template family (`compliance.md` §4). It prices
   that line item honestly and gives you a before/after for the handover.

### 2. Discovery — three batched rounds

Follow `references/kickoff.md` §1. Use `AskUserQuestion` with concrete options; never ask
open-ended "what look do you want?".

- **Round 1** — business, and *the one action that counts as a win*. Name one. It settles
  every later layout argument.
- **Round 2** — scope, content, integrations, and the provider decisions (each has a default,
  so ask only where the default may not hold). **Two rows have no default and are always asked:
  who edits the site after launch, and who holds DNS.** Neither is inferable from a crawl, and
  skipping the first ships markdown-in-git to a client who cannot use it.
- **Round 3** — design direction and mobile. This is the round that decides whether the
  result looks premium. Offer named directions and specific font pairings.

Three Round 2 legal answers decide which law binds them — customer geography, public
sector/funded healthcare, any existing complaint. `references/compliance.md` §1 maps them.

Skip anything recon already answered, and say what you assumed.

### 3. Restate the spec, get confirmation

Output the summary block in `references/kickoff.md` §5 before writing code.

### 4. Build

Work the phases in `references/build.md` §3, gate by gate.

If the stack is the default one, start from the template. **It does not ship with this skill**
— fetch it into the project directory:

```bash
npx degit nurkamol/website-build-kit/template .     # empty dir; use my-site to make one
```

Then follow `docs/runbook.md` §1 inside it — Node 22.12+, KV namespaces, secrets, and the
fill-in order. Never copy a previous project's `src/data/` across; that is how another
client's analytics IDs travel.

**The template arrives with no palette, no typeface and no home page.** That is the design,
not an omission — a starter that ships a look gives every site built from it the same one.
Clearing it is phase 3, and `npm run tells` fails a production build until you have.

Build to the archetype the **win** implies (`references/archetypes.md`) — it fixes section
order and proof model, not appearance; Round 3's visual direction is independent of it.

Write `BUILD-STATE.md` at each gate: gates passed, decisions locked, open blockers, next up.
A build outlives a context window, and a decision that lives only in chat gets reversed. At
handover it folds into `docs/handover.md` — the one document the **client** reads — and is
deleted.

## Defaults

Astro static → Cloudflare Workers → assets on the worker (R2 past ~15 MB) → PagesCMS →
Brevo → KV → GA4 or Cloudflare Web Analytics → Turnstile.

Deviate on evidence. `references/stacks.md` gives every alternative and the specific
condition that justifies it.

## Non-negotiables

These are not style preferences. Each prevents a specific, expensive failure.

- **Ask design fidelity first.** It moves the most and it is the one people revise.
- **Preserve every URL.** Inventory before designing routes. Never redirect a legacy URL to
  the homepage when a specific equivalent exists — that reads as a soft 404. `npm run verify`
  checks the inventory against the deployed site and fails on a page that did not survive.
- **Tokens before components.** No hard-coded hex or px in a component, ever. This is what
  makes a mid-project pivot an afternoon instead of a rewrite.
- **Two sites from this kit must not look alike.** The archetype fixes section order, the
  direction fixes appearance, and neither ships in the template. Run `npm run tells` before
  showing anyone a page — `design.md` §3, checked mechanically.
- **One place per concern.** Business facts in one file, read by both the UI and the
  structured data, so the page and the schema cannot disagree.
- **Environment derived from one build variable** — noindex, analytics, canonical host, which
  store leads land in, who gets notified. Nothing toggled by hand at go-live. Detect
  production by an exact hostname allowlist; `new.example.com` ends with `example.com`.
- **Make the wrong build impossible.** A bare CI build with no environment set publishes
  `localhost` canonicals, cleanly and with no error. Throw at config time.
- **Durable storage before any third-party call** on form submissions. A provider outage
  should cost a notification, not a lead.
- **Progressive enhancement.** The page renders and the form submits with JavaScript off.
  Anything that hides an element must be the same thing that reveals it.
- **Build to WCAG 2.2 AA regardless of what binds them.** Superset of 2.1 and 2.0, so one
  target covers every jurisdiction. Nearly free at build time, several times the cost as a
  retrofit. Never claim "fully compliant" — state the target, the testing method and the known
  gaps. Never install an accessibility overlay.
- **Repetition becomes template + data** — and if an entry cannot be written distinctly, that
  page should not exist. Location pages differing only by town name are doorway pages.
- **Verify against the deployed site, and look at it.** A page can build clean, return 200
  and render broken. A green build proves the bundler ran. `npm run verify -- https://…` is
  the mechanical half and exits non-zero; it also prints what it cannot see, which is the part
  you still have to look at.
- **Personal data needs a retention period.** A lead store with no expiry holds it forever, and
  "indefinitely" is not an answer. One number in `site.ts`, matching the privacy notice.
- **Measure rather than assert** on anything performance-related, and report the number even
  when it undercuts your own recommendation.
- **Secrets never enter the repo or the chat.** If a key arrives in plain text, use it, say
  once that it must be rotated, then stop raising it.

## Before debugging anything strange

Read `references/traps.md`. Entries that recur across projects:

- Scoped styles do not reach a class passed *into* a component
- A persisted element's handlers outlive the elements they captured — anything the router
  replaces goes stale, silently, after one client-side navigation
- The bindings API changes between major versions; only a real request reveals it
- Adapters auto-provision bindings with no id, which works exactly once
- `justify-content: center` makes overflowing content unreachable; use `margin: auto`
- `100vh` is taller than the visible area on mobile; use `100dvh`
- DNS negative caching outlives the fix — if `dig` and `getaddrinfo` disagree, it is your cache
- A skip link scrolls without moving focus unless the target carries `tabindex="-1"`; the
  page jumps, so it looks like it worked. More of these in `references/compliance.md` §8

## References

| File | Contains |
| --- | --- |
| `references/kickoff.md` | Source import, discovery rounds, feature catalogue, design system spec, mobile |
| `references/stacks.md` | Migration playbook per source builder; integration inventory; every provider default |
| `references/archetypes.md` | Page shape per site type — section order, proof model, where conversion sits |
| `references/features.md` | 404, search, light/dark/auto, i18n, shortcuts, dynamic routes — the features with a shape |
| `references/design.md` | Full redesign — the comp process, and what separates expensive from templated |
| `references/build.md` | Standing instructions, phases, stack profile, definition of done |
| `references/compliance.md` | Which accessibility law binds this client; what to build, test, publish |
| `references/traps.md` | Silent failures, with symptom and fix |
