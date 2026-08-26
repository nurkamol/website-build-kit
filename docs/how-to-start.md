# How to start

Installing the kit is in [getting-started.md](getting-started.md). This page is the **real
project**: an actual client site, from the first message to a month after it is live.

---

## Three ways in

They run the same method. Pick by how much you want to type.

**Just ask.** The skill matches on description — no command to remember.

```
Rebuild https://acmeplumbing.com on Astro and Cloudflare.
We're migrating off Elementor — here's the site: https://example.com
Build a marketing site for a dental practice in Leeds. Nothing exists yet.
Does our site meet WCAG? We had a letter about accessibility.
```

**The slash command**, when you want to be sure the method runs rather than something improvised.

```
/website-build https://acmeplumbing.com     # migration
/website-build "Acme Plumbing"              # greenfield
/website-build                              # it will ask
```

**Any other assistant.** The references are plain markdown. Paste `kickoff.md`, then
`build.md` plus the one matching section of `archetypes.md`, and keep `traps.md` to hand. You
lose the automatic recon, so run it yourself — `npm run recon -- https://old-site.com` from the
template does the mechanical half, and the rest is in `stacks.md` §1, §1c and §1d.

---

## Install these first

| | Why |
| --- | --- |
| **Node 22.12+** | The template requires it. `.node-version` pins what it was built against |
| **Google Chrome + the Claude extension** | **Recommended.** `curl` returns markup; a browser returns the page. Required for JS-rendered sources (Wix, Framer), and the only way to check that a page *looks* right, read its console, or capture before/after screenshots. It uses your existing Chrome session, so it can also read Search Console, GA4 and the old WordPress admin |
| **A Cloudflare account, and `wrangler login`** | Everything else assumes you are authenticated. `npx wrangler whoami` should name you |
| **`git` and a repo** | Deployment is a push. The repo is also the content backup |

`degit`, `pa11y-ci` and `lighthouse` all run through `npx` — nothing to install.

## Start these early — they have lead time

The items that turn into launch-day emergencies when left late.

| | Lead time |
| --- | --- |
| **Domain + DNS access, tested by logging in** | Days, if the owner is a previous agency. This blocks go-live more than anything technical |
| **SPF, DKIM and DMARC for the sending domain** | Hours to propagate, and deliverability fails *silently* — mail is accepted and never arrives. Get the verified sender set up in week one, not launch week |
| **Search Console + Bing verification** | Move to DNS TXT before cutover. File-based verification breaks the moment the file stops resolving, and losing verification loses the property's history |
| **DNS TTL lowered to 300s** | 24h before cutover, so a mistake costs five minutes rather than a day |
| **Credentials for anything bolted on** | However long the client takes to find them. Ask in week one — see `stacks.md` §1b |

## Have these ready

Missing them is what stalls a build on day one.

| | Why |
| --- | --- |
| **Domain + DNS access, tested** | Blocks go-live more than anything technical. *Log in and confirm* — "the client has it" is not access |
| **The old site URL** | Even if it is terrible. It holds the URL inventory, the copy and the integrations |
| **SEO plugin export** | Rank Math / Yoast / AIOSEO. Titles, descriptions, redirect table **with hit counts**, business facts |
| **Who owns each account** | GA4, Search Console, the registrar, the booking tool. An unreachable previous agency is a this-week problem, not a launch-day one |
| **Brand assets** | Logo light *and* dark, a vector favicon, brand hexes. Look at them — supplied "favicons" are frequently a different logo entirely |
| **Business facts** | Name, phone, address, hours, service areas, credentials, founding year |
| **Who answers enquiries** | The inbox that gets form notifications, and who is accountable if one is lost |
| **What counts as a win** | Phone call, form, booking, demo. **One.** It settles every layout argument later, and picks the archetype |
| **Where their customers are** | Country, and any state or province. Decides which accessibility and privacy law binds them |

Nice to have, not blocking: analytics access, Google Business Profile login, any CRM the form
should feed.

---

See [walkthrough.md](walkthrough.md) for the whole thing as a session — recon, the
rounds, the spec, the gates, cutover and the first week.

## What a good start looks like

1. **"Is there anything to import?"** — asked first, on its own
2. **Recon** — it reads the old site and comes back with three things: the URL and
   template-family inventory, the integrations found in the markup, and an accessibility baseline
3. **Round 1** — the business, and the one action that counts as a win
4. **Round 2** — scope, content, integrations, providers, and which laws apply. Mostly confirmation
5. **Round 3** — design direction and mobile. Named options, not "what look do you want?"
6. **Spec** — restated in a short block for you to confirm
7. Only then does it write code

**If it starts writing code before step 6, stop it.** Building the wrong thing quickly is the
failure this method exists to prevent.

---

## The arc of a real project

Ten phases, each with a gate. `BUILD-STATE.md` in the project root carries what is settled and
what is blocking, so a context reset or a week away does not lose it.

| Phase | Done when |
| --- | --- |
| 0 · Recon | URLs, template families and integrations inventoried; accessibility baseline counted |
| 1 · Extraction | Content opens in a plain editor with no vendor markup |
| 2 · Content model | Every page family maps to exactly one template |
| 3 · Design system | Changing one token visibly moves the whole site; contrast clears at token level |
| 4 · Build | Every inventoried URL resolves; keyboard and axe pass per family |
| 5 · Media | Payload measured before and after; every image has intrinsic dimensions |
| 6 · Integrations | A real submission produces a stored record **and** a delivered email |
| 7 · SEO parity | Parity table with a reason for every change; preserved paths still resolve |
| 8 · Deploy and go live | Cutover in order; staging route removed; one real lead delivered |
| 8b · First week | Submissions arriving, redirects holding, indexing steady |
| 9 · Handover | Someone else can operate it |

The parts that actually go wrong on real projects, in order of how often:

1. **DNS access.** Ask on day one, and log in to prove it
2. **An integration nobody mentioned.** The booking widget surfaces the week after launch
3. **A redirect that 301s to a 404.** Invisible until traffic drops
4. **A changed sitemap filename.** Search Console reports it days later, by email
5. **Analytics that records nothing.** Identical to a quiet week in the dashboard

Every one is silent. That is why the gates exist.

---

## Going live

The full cutover is `references/build.md` §3 phase 8, and the template ships it as
`docs/runbook.md` with the commands filled in. The order that matters:

```
TTL to 300s (24h ahead) → prove DNS access → move GSC verification to DNS TXT
  → npm run verify (staging) → deploy production → cut DNS → remove staging route
  → npm run verify (production) → submit sitemap → one real enquiry → restore TTL
```

Then watch the first week. `runbook.md` §4 has the table.

---

## Starting from the template directly

If you already know every answer and just want the skeleton:

```bash
npx degit nurkamol/website-build-kit/template my-site
cd my-site && npm install && npm run dev
```

Node **22.12+**. Fill in `src/data/business.ts` first — the header, footer, every CTA, the
emails and the structured data all read from it. Full checklist in
[the-template.md](the-template.md); setup commands in `docs/runbook.md` inside the template.

---

## Working on the kit itself

Open the kit in Claude Code and its `CLAUDE.md` applies — house style, where things go, and the
bar for adding a trap, a provider, an archetype or a compliance entry. See
[adding-to-the-kit.md](adding-to-the-kit.md).
