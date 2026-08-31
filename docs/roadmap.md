# Roadmap

Candidate additions, ranked, with the reason each exists. Work down it one at a time.

**The bar is in [`adding-to-the-kit.md`](adding-to-the-kit.md)** and nothing here is exempt from
it: *would you write this from scratch on the next project, and would you get it wrong the
first time?* An item that cannot answer both is in **Rejected** below rather than deleted,
because the difference between a decision and an oversight is whether it was written down.

**Rank by what it prevents, not by what it adds.** Every entry names the failure it catches.
If it does not catch a failure, it is a preference.

---

## Open

Both deferred from the media backport of 31 August 2026, and both named in `CHANGELOG.md` before
they were written down here — which is the oversight side of this file's own line.

### 1. Drift detection — a project cannot tell it is behind the kit

**Catches:** a fix that never reaches the sites already built. The template is **copied, not
linked**, so nothing propagates. A shipped site sat **19% behind on every image for weeks** after
the kit added AVIF, and it surfaced only because somebody happened to read both trees for an
unrelated reason. The same silence covers every trap fixed since: `check:form`, `check:cms`, the
media pipeline, the honeypot collision.

⚠ **This is ranked first because it is the only item that changes what all the others are worth.**
Every gate in the Done table below protects new projects and no existing one.

**Half of this has shipped.** The scaffolder stamps `websiteBuildKit.version` into the new site's
`package.json`, straight after `version` so it is visible without scrolling past the dependency
list. The open question is settled: `package.json` is the file a developer opens first and nobody
deletes. The version rather than the commit, because every release is tagged — so it resolves to a
commit in one lookup, and embedding a commit would let the packer's git state decide what ships.

**What remains** is a `kit:check` command — named here without the `npm run` form on purpose,
because `audit:docs` resolves those against `package.json` and this one does not exist yet —
diffing the local `scripts/` and `src/lib/` against the stamped version's tag and reporting what
moved upstream. Only now worth building, because there is finally something to diff against.

### 2. A composite-contrast check for text over photographs

**Catches:** unreadable copy over an image, which **no current tool can see**. axe reports a flat
**1.01:1** for every one of these, because no runner composites a transparent element over the
pixels behind it. So the choice has looked binary — forbid clients from choosing photographs, or
let them break the navigation.

It is not binary. Measuring the composite off the **rendered** pixels — per-channel maxima, every
format served — makes a photograph that breaks the nav a red build, and the last good deploy stays
live.

**What made this worth ranking** is what happened when the check was fed a hostile frame on a real
site:

| | | |
| --- | --- | --- |
| band, 82% ink scrim | near-white photo | **9.66:1** — cannot fail |
| tile label, 72% ink | near-white photo | **6.76:1** — cannot fail |
| script line, 62% ink | near-black photo | **2.86:1** ✗ rejected |

⚠ **For two of the three the fear was unfounded** — those scrims are strong enough that no
photograph gets through them. The kit's "guarantee the ground instead of hoping for it" pattern had
already solved the problem and everyone was still behaving as though it had not. **The danger is
not the photograph, it is a weakened scrim** — the one real failure was a scrim lightened from 92%
to 62% so a client's new photography could show its colour. The check is what makes weakening one
safe to do.

**Cost, corrected.** This entry previously said it needs a rendering pipeline and a real browser,
and ranked it second for that reason. ⚠ **That was wrong.** The reference implementation is 175
lines importing `sharp` and `node:fs` and nothing else — it composites the scrim in code over the
generated image and never renders a page. `sharp` is already a template dependency, so it runs
offline beside the other gates rather than with the browser-dependent ones.

**The real cost is elsewhere, and it is a design question rather than a coding one.** The
measurement is portable; *what to measure* is not. The reference reads three project-specific data
files and two palette constants, because a region is a box, a scrim strength and a text colour —
all of which belong to a project's design, and ⚠ **the template has no design.** So the kit can
ship the measurement and a way to declare regions; it cannot ship the regions. Getting that
declaration right is the work, and getting it wrong ships a design decision in a starter that is
supposed to have none.
---

The bar is what keeps this section near-empty rather than full of preferences: *would you write
this from scratch on the next project, and would you get it wrong the first time?* When the next
build produces something that answers both, it goes here first and gets built second.


---

## Rejected, and why

Kept so they are not re-proposed as new ideas.

| | Why not |
| --- | --- |
| **Visual regression / screenshot diffing** | Notoriously noisy on marketing sites — a rotating testimonial or a lazy-loaded image fails the diff. High upkeep, low signal |
| **Uptime monitoring** | A third-party service, not a script. The runbook already says to point one at a real page *and* the form endpoint |
| **Lead-delivery alerting** | Ops, not a build kit. KV-before-provider already means an outage costs a notification and never a lead |
| **CrUX field-data fetch** | `cfBeaconToken` gives real-user Core Web Vitals from the first visitor, months before CrUX covers a new domain. Already solved |
| **Anything SEO-analytical** | Separate skills exist. This kit builds the site; it does not audit rankings |
| **A CMS in the template** | `stacks.md` §4 picks one per project. Shipping one decides it for every site |
| **A component library** | The reason the template has no design. See `CLAUDE.md` |
| **Style-preset skills** (`taste-skill` and similar) | They ship named looks — minimal, brutalist, soft. `design.md` explains why something reads as expensive and **never prescribes a look**; adopting presets would put two philosophies in one build. Not a criticism of those projects, which solve a different problem |
| **Animation skills as a kit recommendation** | Genuinely good, and the author uses several. But nothing here has shipped a build with them, and "we already use it" is not the bar the provider rule sets. Revisit with build evidence |
| **Fleet tooling for 100+ client sites** | Asked on Reddit, not by a build. Seven shipped sites is not a fleet, and the audit that found 27 keys of silent data loss across five of them was a `for` loop in one command — at this scale that *is* the tool. ⚠ **It stops being true somewhere around fifty**, where you would also want to invert the kit's core trade and make the shared parts a versioned dependency rather than a copy. The version stamp is the primitive that would make a fleet query possible; build the query when there is a fleet to query |
| **Structured-data validation** | Ranked, then rejected on its own note. Offline JSON-LD validation is awkward and the useful check is Google's own Rich Results Test, which needs the live URL and a browser. It is a runbook link, not a script — and `verify` already catches the failure that is mechanical (a `logo` or `og:image` pointing at a 404) |

---

## Done

Kept short — `CHANGELOG.md` carries the detail.

| | Catches |
| --- | --- |
| `npm run check:form` | A real field colliding with the honeypot — the trap is named `company`, so a B2B site adding one loses every enquiry from a company that fills it in, with a 200 and a thank-you page |
| `PageHero` rhythm + shorthand | A 160px hole between the lede and the body on every page using it, and a hero sitting behind the fixed nav — a shorthand out-specifying the utility beside it |
| `npm run check:copy` | A note to yourself shipped as body copy — a real build put "⚠ CONFIRM: does the 9am class continue?" on a service page, past clean types, clean axe and clean tells |
| Overshoot easing · side accent bar | Two generated-UI tells `tells` lacked, found by running an external detector over a real build — and the template was failing the first one with a token nothing used |
| Regulated data in the message box | A site that holds PHI or GDPR special categories because a visitor typed them into free text — the form asked for none of it, every gate passed, and the exposure surfaces in an audit |
| Retention needs an enforcer | A privacy notice stating a period nothing enforces — KV expires itself, R2 keeps uploaded files forever unless a dashboard lifecycle rule exists, and no gate can see account config |
| Generated-site tells | A site that clears every templated-look row and is still recognisable in three seconds as LLM output — glass, giant radii, glow, badge decoration. Three are machine-checked |
| `scripts/fixture-site.mjs` | A network-facing script silently changing what it *reports* — 0.1.11 shipped a redirect cap that turned a live page into a 302 in the inventory, with every gate green. `verify` is 1,069 lines deciding go-live and had no case proving any of its three `exit(1)` paths still fired |
| `npm run test:gates` | A gate that stopped gating — `check-env` matched nothing for a whole project and passed every deploy; `tells` counted `dist` CSS so a threshold could never trip. 29 cases, 15 proving a refusal, and it asserts what a gate *wrote* where the exit code cannot see the bug |
| `npm run check:secrets` | A deploy that captures leads and silently cannot email them — `secret()` returns `undefined`, the form returns 200, nobody is notified |
| Inverse check in `audit:docs` | A feature that ships and is documented nowhere — the audit was green through two README drifts because it only checked that references *resolve* |
| Legal content collection | Three near-identical page files, and an editor who cannot change an effective date without a developer |
| Weight + blocking in `verify` | `build.md` §2 said measure and named no tool, so nobody did until a client asked |
| `npm run shots` | A page that came out *worse* in a rebuild, and nobody put the two side by side |
| Photography in discovery | Finding out at phase 5 that no usable photos exist |
| `BUILD-STATE.md` stub | A blank page at the moment a build starts |
| `X-Robots-Tag` on staging | Non-HTML — a PDF has no `<head>` for a meta tag |
| Staging badge | A staging build quietly indexable, competing with production |
| `npm run dns` | A migration taking the client's email with it — silently |
| SEO baseline diff | Metadata parity lost in a rebuild, argued about instead of diffed |
| `npm run console` | Console errors and failed requests — the done-row nothing could check |
| Preserved paths in `verify` | recon found them on the old site; nothing confirmed they survived |
| Shared-card detection | Pages left on the fallback og:image, which "all cards unique" passes |
| `npm run audit:docs` | Doc rot — dead section refs, moved numbers, paths from an old structure |
| `npm run redirects` | A migration's highest-traffic-risk step, done by hand and late |
| Meta sweep in `verify` | Duplicate titles/descriptions, missing ones, a canonical pointing elsewhere |
| AVIF + WebP | 26% off every photograph, at better quality. Measured, not asserted |
| `npm run recon` | The URL inventory every later step reads, which nothing produced |
| `npm run verify` | The deployed site, as a gate. Includes the internal link crawl |
| `npm run a11y:evidence` | The dated evidence pack `build.md` phase 9 requires |
| `npm run handover` | The one document written for the client |
| `check-env` · `check-sitemap` | Environment/route mismatch; a URL both listed and `noindex` |
| Build guard on the command | `npm run build` emitting localhost canonicals in silence |
| Lead retention | KV holding personal data forever |
| Neutral locale defaults | A US-only phone rule and `en-US` hardcoded in five files |
