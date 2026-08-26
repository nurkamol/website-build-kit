# website-build-kit

A method and a starter for shipping production marketing sites: discovery → stack and
provider decisions → build → verify against the deployed thing → hand over.

Not a theme. The value is the accumulated set of decisions and the list of things that fail
**silently** — clean build, clean types, clean deploy, wrong result.

```bash
git clone https://github.com/nurkamol/website-build-kit.git
cd website-build-kit && ./install.sh
```

Then, in any project, **just ask**:

```
Rebuild https://acmeplumbing.com on Astro and Cloudflare.
We're migrating off Elementor — here's the site: https://example.com
Build a marketing site for a dental practice. Nothing exists yet.
```

The skill matches on description, so there is no command to remember. `/website-build <url>`
works too if you want to be explicit.

**→ [docs/walkthrough.md](docs/walkthrough.md)** — a worked example as a session, start to launch

**→ [docs/how-to-start.md](docs/how-to-start.md)** — the three entry points, what to have
ready before you begin, and what the first ten minutes should look like.

## What's in it

| | |
| --- | --- |
| `skills/website-build/` | The Claude Code skill. `SKILL.md` plus eight references |
| `commands/website-build.md` | Slash-command entry point |
| `template/` | Astro + Cloudflare starter that builds from a clean clone |
| `docs/` | How to use it, and how to extend it |
| `install.sh` | Symlinks skills and commands into `~/.claude` |
| `create/` | The `npm create website-build-kit` scaffolder. Packs `template/` at publish time |
| `CLAUDE.md` | Applies when working **on the kit** — house style, where things go |
| `template/CLAUDE.md` | Ships with each new site — that site's conventions |

## The references

The skill loads these as needed rather than all at once.

| Reference | Contains |
| --- | --- |
| `kickoff.md` | Source import, three discovery rounds, feature catalogue, design token spec, mobile decisions |
| `stacks.md` | Migration playbook per source builder; the integration inventory; every provider decision and its default |
| `archetypes.md` | Page shape per site type — section order, proof model, where conversion sits, and the failure mode |
| `features.md` | The features that need a decision rather than a checkbox — 404, search, light/dark/auto, i18n, shortcuts |
| `design.md` | Full redesign — reference-gathering, comping two directions on staging, and the tells of a templated site |
| `build.md` | Standing instructions, phases with gates, definition of done |
| `compliance.md` | Which accessibility law binds this client — WCAG, ADA, EAA, Section 508, AODA — and what to build, test and publish |
| `traps.md` | Silent failures, with the symptom and the fix |

`traps.md` is the one that earns its keep. Everything in it cost real debugging time.

## Defaults

```
Astro static → Cloudflare Workers → worker assets (R2 past ~15 MB)
→ PagesCMS → Brevo → KV → GA4 or Cloudflare Web Analytics → Turnstile
```

Chosen because they are light, cheap at this scale, and compose without glue. Every one has
alternatives in `stacks.md` with the specific condition that would justify switching.

## The template

**It arrives with no palette, no typeface and no home page.** That is the design, not an
omission: a starter that ships a look gives every site built from it the same one. What it
does ship is the skeleton of the parts that take longest to get right:

- **Media pipeline** — `npm run media`: `sharp` → responsive AVIF and WebP, dimensions manifest
  so nothing shifts, favicons rendered from the vector, JPEG social twins only for images used
  as `og:image`. AVIF is 26% smaller at better quality, measured rather than asserted
- **Design tokens** — colour, fluid type scale, spacing, radii, tinted shadows, motion; plus
  a semantic layer so `.on-dark` inverts a whole section by redefining six variables. The
  brand ramp is a grey placeholder behind an `--unset` marker; you decide it
- **`npm run tells`** — the checkable half of `design.md` §3 against your own work: measure,
  section rhythm, the three-card grid, face pairing, headline size, motion duration, focus
  ring, raw hex in components. No browser, so it runs in CI. `build:production` refuses while
  anything is left undecided
- **Form endpoint** — server-side validation with field errors, honeypot, KV written
  **before** the email provider is called, and a no-JavaScript path that still works
- **Token-protected CSV export** of leads
- **Environment derivation** — one build variable decides noindex, analytics, canonical host,
  which store leads land in, and who gets notified
- **Build guard** that refuses *any* build without an environment, because a bare build
  publishes `localhost` canonical tags cleanly and with no error. It keys on the command, not
  on `CI` — `npm run build` is the most reflexive command in npm, and that is exactly where the
  hole was
- **SEO** — canonical, OG, JSON-LD built from the same data file the UI reads
- **Header, footer, contact form, page opening, CTA** — structure and behaviour, not styling:
  a mobile menu that replaces the header rather than layering under it, a focus trap, a sticky
  close control, and every interactive state a control needs
- **Accessibility statement page** — a required published artefact under the EAA and PSBAR —
  plus `npm run a11y` over one URL per template family
- **`npm run reflow`** — WCAG 1.4.10 and 1.4.4 against the **deployed** site: 320px wide and
  text at 200%, naming the widest offending element rather than reporting the page as broken.
  It is what keeps the testing claim on `/accessibility` honest — on one build that sentence was
  true when written and false a day later, because a redesign rebuilt every route
- **`npm run a11y:evidence`** — the dated evidence pack, written to a file instead of dying with
  the terminal scrollback. It writes the manual layers in as **unchecked** every time, because
  automated tooling catches roughly a third of issues and a pack that listed a clean run and
  stopped would read as a finished audit
- **`npm run recon`** — inventory the OLD site before designing routes: URLs from the sitemap
  plus the ones only the Wayback Machine remembers, which sitemap filename is canonical,
  preserved paths, and the integrations in the markup
- **`npm run extract`** — turns the captured HTML into clean markdown, one file per page, with
  frontmatter and portable image paths. It uses a real HTML-to-markdown converter rather than
  stripping tags, because `html.replace(/<[^>]+>/g, '')` glues a heading to its paragraph
  wherever the source was minified — right on the pretty-printed pages, wrong on the rest. It
  also flags what needs a person: heading levels the page builder used as type styles, alt text
  generated from the filename, and pages thin enough to suspect the capture
- **`npm run redirects`** — proposes a redirect map from the old inventory against the new
  routes, and **never writes `public/_redirects`**. Slug similarity is a guess, and a wrong 301
  is worse than a 404: the 404 turns up in the log and gets fixed, the wrong redirect looks
  like it works
- **`npm run verify`** — the runbook's verification matrix as a gate that exits non-zero, run
  against the **deployed** site. Routes, a real 404, every redirect rule and whether its target
  resolves, security headers, the form submissions the API is meant to refuse, plus page weight
  and render-blocking counts — bytes and counts, never a timing, because a hand-rolled number
  from one machine disagrees with Lighthouse and nothing tells you it is wrong
- **`npm run shots`** — before/after screenshots of a migration at a mobile and a desktop width,
  paired into one page. Both sides read the same URL inventory, so a page that did not survive
  shows as a 404 beside its old screenshot. Take the before pass while the old site is still up;
  once DNS moves it is gone
- **Legal pages as content** — `src/content/legal/*.md` served through one route, with the
  footer links derived from the collection itself. A footer link to a page nobody has written
  yet is a 404 on every page of the site, and nothing reports it
- **`npm run console`** — console errors and failed requests on the deployed site, in a real
  browser. `verify` uses only `fetch` and so can never see this: the page returns 200, the HTML
  is correct, and something inside it failed after the response was complete. A blocked
  third-party script, a CSP violation or a 404 asset is invisible to a status-code sweep
- **Build guards** — `check-env` refuses a build whose environment disagrees with the routes in
  `wrangler.jsonc`; `check-sitemap` fails a production build when a URL is both in the sitemap
  and `noindex`
- **`npm run dns`** — snapshot the zone before you move the apex, and diff it after. Moving a
  domain without carrying **MX kills the client's email**, and it fails silently: the bounces
  go to the sender, so the people who find out cannot tell the client
- **Staging is marked and blocked** — a standing badge on every non-production build that reads
  the live DOM and alarms when the page disagrees with its environment, plus `X-Robots-Tag` on
  every response, which is the only one of the three controls that covers a PDF
- **`npm run cards`** — one 1200×630 JPEG Open Graph card per page, picked up automatically
  from the canonical path. JPEG because Facebook and LinkedIn still fail to render a WebP
  `og:image` and no scraper accepts SVG — a shared post would unfurl with no picture at all.
  The generator ships; the card design is a stub, so it renders nothing until you decide it
- **`npm run lastmod`** — per-route content dates for the sitemap, computed by a human with a
  full clone and **committed as data**. The first version read `git log` during the build and
  emitted nothing in production, because Cloudflare shallow-clones and `git log` returns one
  grafted commit for every file
- **`npm run indexnow`** — submit changed URLs to Bing, Yandex, Seznam and Naver. It prints on
  every run that **Google does not participate**, because reading a green result as "submitted
  to search engines" is how a site goes weeks with nobody asking why Google has not picked
  something up
- **`npm run seo`** *(optional)* — [full-site SEO audit](https://github.com/nurkamol/seo-audit),
  most useful as a **baseline**: capture the old site before migrating, then fail only on
  findings new since. Metadata parity is what a rebuild loses quietly
- **Lead retention** — a KV `expirationTtl` from one number in `site.ts`, because "indefinitely"
  is not a retention period
- **`docs/`** — runbook (verification matrix, go-live order, first-week watch), content guide,
  analytics (the rules whose failure looks like success), a traps file seeded with this
  codebase's silent failures, and `handover.md` — the one document written for the client
  rather than a developer, rendered to PDF by `npm run handover`

```bash
npm create website-build-kit@latest my-site
```

It checks your Node version before writing anything, restores the `.gitignore` npm strips from
published packages, names the project after the directory, and installs. `npx degit
nurkamol/website-build-kit/template my-site` still works if you would rather not run a
scaffolder.

Node 22.12+. It builds green with no content, no images and no secrets. Fill in
`src/data/business.ts` first — everything else reads from it. Then `npm run tells` will tell
you what is still undecided.

## The two CLAUDE.md files

They do different jobs and neither replaces the skill.

| File | Applies when | Says |
| --- | --- | --- |
| `CLAUDE.md` | You open **the kit** in Claude Code | House style, where things go, the bar for adding a trap |
| `template/CLAUDE.md` | You open **a site built from it** | Tokens not hex, `business.ts` is the single source, use `wrangler dev` for API routes, read `docs/traps.md` first |

The skill is what teaches the *method*. These are what stop a future session breaking the
conventions once the method has been applied.

## Growing it

New prompts, skills and template pieces are meant to accumulate. See
[docs/adding-to-the-kit.md](docs/adding-to-the-kit.md) for the bar, and
[docs/roadmap.md](docs/roadmap.md) for what is queued — including what was
**deliberately rejected**, so it does not come back as a new idea.

The bar for adding a trap: **it failed silently on a real build.** Not "this is good
practice" — something that looked fine and was not.

## Licence

[MIT](LICENSE). Use it, fork it, build client sites with it, sell the result.

**Sites built from it carry no obligation.** The `template/` contents are meant to be copied
into client projects, and MIT does not follow them there in any way that matters: no
attribution in the finished website, no restriction on the deliverable. A licence on the
toolchain that encumbered client work would make the toolchain unusable for the work it exists
for.

The one thing worth asking: if the method here is useful, say where it came from. That is a
request, not a term.

## Provenance

Sharpened on getmiohome.com and expressducttest.com, both WordPress rebuilds onto Astro +
Cloudflare Workers. Client names and project detail in this repository are shared in
confidence; contact details, credentials and analytics IDs are not permitted here at all —
`CLAUDE.md` carries the sweep that enforces it.
