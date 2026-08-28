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

Nothing. Every ranked item has shipped — see **Done** below, and `CHANGELOG.md` for the detail.

The bar is what keeps this section empty rather than full of preferences: *would you write this
from scratch on the next project, and would you get it wrong the first time?* When the next
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
| **Structured-data validation** | Ranked, then rejected on its own note. Offline JSON-LD validation is awkward and the useful check is Google's own Rich Results Test, which needs the live URL and a browser. It is a runbook link, not a script — and `verify` already catches the failure that is mechanical (a `logo` or `og:image` pointing at a 404) |

---

## Done

Kept short — `CHANGELOG.md` carries the detail.

| | Catches |
| --- | --- |
| Regulated data in the message box | A site that holds PHI or GDPR special categories because a visitor typed them into free text — the form asked for none of it, every gate passed, and the exposure surfaces in an audit |
| Retention needs an enforcer | A privacy notice stating a period nothing enforces — KV expires itself, R2 keeps uploaded files forever unless a dashboard lifecycle rule exists, and no gate can see account config |
| Generated-site tells | A site that clears every templated-look row and is still recognisable in three seconds as LLM output — glass, giant radii, glow, badge decoration. Three are machine-checked |
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
