# Runbook

Setup, verification, go-live and what to watch afterwards. Everything here runs against a
**deployed** site — a green build proves the bundler ran, nothing more.

Replace `example.com` / `new.example.com` throughout, or export them once:

```bash
export PROD=example.com
export STAGING=new.example.com
```

---

## 1. First-time setup

Node **22.12+** is required (`.node-version` pins the version this was built against).

```bash
npm install
```

**On a migration, capture the old site before you change anything.** All three write to
`recon/` and all three are worth committing — together they are what you diff against after
cutover, and what you restore from if it goes wrong:

```bash
npm run recon -- https://old-site.com     # URLs, preserved paths, integrations
npm run dns   -- old-site.com             # MX, SPF/DKIM/DMARC, CAA, verification TXT
npm run seo   -- https://old-site.com --json recon/seo-before.json --fail-on never
```

The DNS one matters most and is the least obvious: moving the apex without carrying MX kills
the client's email, silently. See `docs/traps.md`.

**Create the KV namespaces and paste the real ids into `wrangler.jsonc`.** An undeclared
binding gets auto-created on deploy, which works exactly once — recreating the worker then
fails on a name the previous incarnation left behind.

```bash
npx wrangler kv namespace create "<site>-leads"
npx wrangler kv namespace create "<site>-leads-staging"
npx wrangler kv namespace list        # confirm both exist with ids
```

**Secrets.** Never in the repo, never in chat.

```bash
npx wrangler secret put BREVO_API_KEY
npx wrangler secret put LEADS_EXPORT_TOKEN     # openssl rand -base64 32
cp .dev.vars.example .dev.vars                 # local only, gitignored
```

**Fill in, in this order** — each one is read by everything after it:

1. `src/data/business.ts` — every fact the site states about the business
2. `src/data/nav.ts` — the real routes, and the one action that counts as a win
3. `src/data/services.ts`, `areas.ts`, `categories.ts`
4. `src/data/site.ts` — `PRODUCTION_HOSTS`, and the client's **own** analytics IDs
5. `package.json` — staging and production URLs in the build scripts
6. `wrangler.jsonc` — worker name, routes, KV ids
7. Brand assets into `media/source/brand/`, then `npm run media`

**Then the design, which is a separate job and a larger one.** The template ships undecided:
a grey placeholder ramp, the system font stack for both faces, no typefaces in `public/fonts/`
and a scaffold home page. Nothing here is a default you can leave — a starter that arrived
with a palette would give every site built from it the same one.

```bash
npm run tells      # what is still undecided, and the design.md §3 tells
```

1. `src/styles/tokens.css` — the real brand ramp and accent, then delete the `--unset` line
2. `public/fonts/` + the `@font-face` block in `src/styles/global.css` + `src/data/fonts.ts` —
   two faces, display and body, self-hosted and subset
3. `src/pages/index.astro` — replace it. Section order comes from the archetype
4. `<meta name="theme-color">` in `src/layouts/Base.astro` and `public/site.webmanifest` —
   keep the two in step, or an installed icon's splash screen is the wrong colour

`npm run build:production` refuses while any of that is half-done: a project with a brand
colour and no typeface is a project that stopped in the middle.

```bash
npm run dev                                  # layout work only — no bindings
npm run build:staging && npx wrangler dev    # real KV, real secrets, real redirects
```

### Keeping staging out of the index

The template ships three things, and **only the first is protection**. The others reduce the
damage when the first is missing.

| | What it does | What it does not do |
| --- | --- | --- |
| **Cloudflare Access** ✅ | Nothing reaches staging without logging in | — |
| `noindex` + `X-Robots-Tag` | Asks a crawler not to index what it fetched | Nothing, if the crawler never fetched |
| `Disallow: /` | Stops the fetch — **and therefore stops the two above being read** | Does not prevent indexing |
| The badge | Tells *you* | Nothing to a crawler |

**Set up Access. It is five minutes and it ends the question.**

Cloudflare dashboard → Zero Trust → Access → Applications → Add → Self-hosted. Application
domain is the staging hostname. Policy: Allow, with `Emails ending in @yourdomain` plus the
client's addresses. One-time PIN needs no account on their side.

Everything else on this page becomes belt and braces the moment that exists.

#### How staging gets found without anyone linking it

This is the part people miss, and it is why "nobody knows the URL" is not a plan.

- **Certificate Transparency logs.** Every TLS certificate issued for `new.example.com` is
  published to public, searchable logs within minutes. Bots monitor them specifically to find
  new staging hosts. You cannot opt out of CT — it is how the web verifies certificates.
- **Chat and email unfurls.** Slack, WhatsApp, Teams and Gmail fetch a URL to build the
  preview card. That fetch is a real request from an infrastructure you do not control.
- **Guessable hostnames.** `staging.`, `dev.`, `test.` and `new.` are the first four things any
  subdomain scanner tries.
- **Referrer leakage.** Someone clicks an outbound link from staging and the destination's logs
  now contain the staging URL.

A wildcard certificate on the zone hides the subdomain from CT, and an unguessable hostname
raises the bar — but neither is protection, and Access is. **Assume the URL is public the
moment the certificate is issued, and put a login in front of it.**

#### After Access is on, `npm run verify` needs a way in

`verify` makes plain unauthenticated requests, so it will get the Access login page for every
route and report the site as broken. Either run it before enabling Access, or add a **service
token** (Zero Trust → Access → Service Auth) and an Access policy accepting it, then pass the
headers. It is the same problem the client's own preview link has, and worth solving once.

Every non-production build also carries a **standing badge** in the corner — see below.

**Use `wrangler dev` for anything touching `/api/*`, redirects or status codes.** The Astro
dev server models none of them, and they are exactly where things break.

### `npm install` reports high-severity vulnerabilities. Read this before acting.

They are **dev tooling, and none of it ships**. Every one traces to `extract-zip`, which
puppeteer uses to unpack Chrome for the accessibility suite:

```
extract-zip → @puppeteer/browsers → puppeteer → pa11y / pa11y-ci
```

The deployed Worker contains none of it. Confirm that yourself rather than taking it on trust:

```bash
npm audit --omit=dev        # what could actually ship. Should be: found 0 vulnerabilities
```

**Do not run `npm audit fix --force` here.** Its "fix" is downgrading `pa11y-ci` to v3 — a major
version back, which takes axe-core with it. Trading current accessibility tooling for a symlink
issue in a zip extractor that only ever unpacks Chrome from Google is the wrong way round.

`npm audit fix` without `--force` is safe and worth running: it moves patch versions inside the
existing ranges and touches nothing in `package.json`. That is what cleared the `undici`
advisories that came in through wrangler.

The kit's CI gates on `npm audit --omit=dev --audit-level=high`, not the full tree — a check
nobody can make green is a check everyone learns to ignore.

### Optional tooling — not npm packages

Nothing below is needed to build, deploy or run the site. Each is required by one script,
which checks for it and names it rather than failing with a stack trace.

| Needed by | Requires | Install |
| --- | --- | --- |
| `npm run cards` | ImageMagick, librsvg, python3 + fontTools + brotli | `brew install imagemagick librsvg` then `python3 -m pip install fonttools brotli` |

`npm run a11y`, `npm run reflow` and `scripts/md-to-pdf.mjs` need Chrome, which arrives with
`pa11y-ci` as a devDependency — `npm install` is the whole setup. The binary itself goes to a
shared `~/.cache/puppeteer`, not into `node_modules`.

`npm run cards` additionally refuses until `scripts/og-cards.config.mjs` is filled in, which
cannot happen before the design exists: it needs the real ramp, the two faces in
`public/fonts/` and a wordmark. That is deliberate — the kit ships the card *machinery* and
none of the look, so two sites built from it cannot unfurl the same card.

---

### The staging badge

Every non-production build shows a fixed badge. It is driven by `site.indexable`, so it cannot
be left on in production and cannot be turned on by hand.

**It reads the live DOM rather than printing the build variable.** A badge saying "STAGING ·
NOINDEX" from a constant only repeats what you already know; this one checks the actual
`<meta name="robots">` and the actual analytics tags, and goes to a pulsing alarm reading
**`NOT NOINDEX`** or **`ANALYTICS LIVE`** when the page disagrees with the environment. That is
the failure worth catching: a staging site quietly indexable, competing with production, with
nothing on the page looking wrong.

- It can never intercept a click — `pointer-events: none`
- Hidden from print, so a PDF of a staging page does not carry it
- `?nobadge=1` hides it for the session, for clean screenshots — `npm run shots -- --after`
  appends it for you. Deliberately **not** a persistent dismissal: a badge you dismissed on
  Tuesday is not there to warn you on Friday

---

## 1b. What actually changes between staging and production

**One switch decides all of it.** `PUBLIC_SITE_ENV` is set by the build script, `src/data/site.ts`
derives everything from it, and nothing below is toggled by hand. There is no second flag, and
adding one is the mistake this design exists to prevent.

Every row was measured from a real build of each environment, not recalled:

| | Staging | Production |
| --- | --- | --- |
| `<meta name="robots">` | `noindex, nofollow` | `index, follow, max-snippet:-1, …` |
| `X-Robots-Tag` header | `noindex, nofollow, noarchive` on **every** response | absent |
| `robots.txt` | `Disallow: /` | `Allow: /`, `Disallow: /api/`, plus the `Sitemap:` line |
| Sitemap files | none emitted | `sitemap-index.xml` + `sitemap-0.xml` |
| `lastmod` in the sitemap | — | from `src/data/lastmod.json` |
| Canonical host | `https://new.example.com` | `https://example.com` |
| Analytics (GA4/GTM) | **zero references in the HTML** | emitted only if both IDs are set |
| Cloudflare beacon | none | emitted only if the token is set |
| Environment badge | shown, fixed, bottom-left | **not in the markup at all** |
| Lead storage | `LEADS_STAGING` binding | `LEADS` binding |
| Lead tag on each record | `test` | `live` |
| Lead retention | 30 days | 180 days |
| Enquiry notification goes to | `email.notifyTest` — the developer | `email.notify` — the client |
| Build gates that run | `check-env`, `staging-headers` | `tells`, `astro check`, `check-env`, `check-sitemap` |

Two consequences worth stating plainly, because they surprise people:

- **Staging analytics is not "disabled", it is absent.** There is no snippet with a flag turned
  off — the HTML contains no tag at all. A staging visit cannot pollute the client's data even
  if someone pastes a container ID in by mistake, because the block that would render it never
  runs.
- **Staging never emails the client.** Submissions store and notify, but to the developer
  address. That is what makes it safe to test the form end to end without warning anyone.

### Going live: what you change, and what changes itself

You change **two things**. Everything in the table above follows.

1. `wrangler.jsonc` — add the production routes
2. The Cloudflare Workers Builds command — `npm run build:staging` → `npm run build:production`

`check-env` compares those two and **fails the build if they disagree**, which is the guard
against the one-sided change: routes moved to production while the build command still says
staging ships a live site that is `noindex`, canonicalised to the staging host, writing leads
to the wrong namespace and emitting no analytics. It looks perfect and is invisible to Google.

Then confirm the switch actually happened, against the deployed site:

```bash
curl -sI "https://$PROD/" | grep -i x-robots-tag     # must return NOTHING
curl -s  "https://$PROD/" | grep -c env-badge        # must be 0
curl -s  "https://$PROD/robots.txt" | grep -i sitemap
npm run verify -- "https://$PROD"
```

**The badge is the fastest of these.** If you can see it on the live domain, the production
build never shipped — and that is a thirty-second check anyone on the team can do from a phone.

## 2. Verification matrix

```bash
npm run verify -- https://new.example.com      # after every staging deploy
npm run verify -- https://example.com          # again after cutover
npm run console -- https://new.example.com     # console errors + failed requests
```

**Most of this section is now that script**, and it exits non-zero. Routes, the 404, every
literal rule in `_redirects` plus whether its target actually resolves, **every URL the old site
served**, the security headers,
the staging noindex/analytics split, sitemap `lastmod` variance, every internal link and
`og:image`, the title/description/canonical sweep, page weight and render-blocking counts, and
the three form submissions the API is supposed to refuse — including that caught spam does not
land on the conversion URL.

It reads `public/_redirects` and the deployed sitemap rather than a list inside the script, so
it cannot drift from the site the way this document did: **the honeypot row below tested
`website=filled` while the code checked `company`, so for a long time it posted a complete
valid lead, stored it, emailed it, and reported success.** That is what a hand-run checklist
degrades into. Run the script; keep the commands below for when you need to see one by hand.

**What the script cannot see**, and you must still do:

| Check | Why it stays manual |
| --- | --- |
| One pageview per visit | Only visible in analytics Realtime |
| A valid submission stores **and** emails | Sending one creates a real lead and a real notification |
| The analytics container is the client's own | Fetch `gtm.js` and read it — see `analytics.md` |
| A redirect lands on the **right** page | The script proves it resolves, not that it is correct |
| It looks right on a phone | — |
| Console errors and failed requests | `npm run console` — a real browser, because a blocked script or a 404 asset is invisible to a status check |
| How fast it **feels** | `verify` reports weight and blocking counts, which are the inputs. Lighthouse on the deployed URL — mobile, simulated throttling, two samples per variant — is the number |
| Whether a page came out *worse* | `npm run shots` puts the pairs side by side; only a person can say which is better |

Run against staging first, then again against production after cutover. Every row, every time
— the rows people skip are the rows that fail.

### Routes and redirects

`npm run redirects` proposes a map from `recon/urls.txt` against the new routes and writes
`recon/redirects.proposed`. It **never** touches `public/_redirects` — slug similarity is a
guess, and a wrong 301 is worse than a 404: the 404 shows up in the log and gets fixed, the
wrong redirect looks like it works. Paste the lines you agree with, then let `npm run verify`
confirm each one returns its declared status *and* that its target resolves.

```bash
# every URL from the inventory returns 200. `npm run recon -- https://old-site.com`
# writes recon/urls.txt; `npm run verify` checks the live routes automatically.
while read -r u; do
  case "$u" in \#*|'') continue;; esac
  printf '%-60s %s\n' "$u" "$(curl -s -o /dev/null -w '%{http_code}' "https://$STAGING$u")"
done < recon/urls.txt

# unknown paths must return a real 404, not a 200 with a pretty page
curl -s -o /dev/null -w '%{http_code}\n' "https://$STAGING/definitely-not-a-page"

# each legacy URL 301s to its SPECIFIC equivalent and that lands 200
curl -sIL "https://$STAGING/old-path/" | grep -E '^(HTTP|location)'
```

| Check | Passing |
| --- | --- |
| Routes | Every inventoried URL returns 200 |
| Redirects | 301 to the specific equivalent, which itself returns 200. Never to the homepage |
| 404 | A real 404 status, not 200 |
| Canonicals | Point at the host actually being served |
| Trailing slashes | Consistent, and form actions include the slash — a 308 drops the POST body |

### Preserved paths

Other systems point at these. Changing them breaks the link silently.

```bash
for p in robots.txt sitemap-index.xml sitemap_index.xml ads.txt BingSiteAuth.xml feed/ rss.xml; do
  printf '%-22s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' "https://$PROD/$p")"
done
curl -s "https://$PROD/robots.txt" | grep -i sitemap
```

The old sitemap filename must resolve 200 or 301-to-200 — Search Console stores the URL that
was submitted, and reports a broken one days later in an email nobody opens.

### Staging guards

```bash
curl -s "https://$STAGING/" | grep -ciE 'googletagmanager|gtag|G-[A-Z0-9]{9}'   # must be 0
curl -s "https://$STAGING/" | grep -i 'noindex'                                 # must match
curl -s "https://$STAGING/robots.txt"                                           # disallow all
curl -s "https://$STAGING/" | grep -c "$PROD"                                   # must be 0
```

Zero analytics references, `noindex`, disallow-all robots, no production URLs, and
notifications routed to the developer rather than the client.

### Forms

```bash
H="-H Origin:\ https://$STAGING"

# valid → 200, a stored record AND a delivered email
curl -s -X POST "https://$STAGING/api/contact/" -H "Origin: https://$STAGING" \
  -d 'name=Test&phone=5550000000&email=you@example.com&service=Something else&message=runbook test'

# empty → 422 with field errors
curl -s -X POST "https://$STAGING/api/contact/" -H "Origin: https://$STAGING" -d ''

# honeypot → silent accept, no lead stored, and NOT the conversion URL
#
# ⚠ THE FIELD NAME MUST MATCH src/pages/api/contact.ts. This row read
# `website=filled` while the code checked `company` — so it posted a complete,
# valid lead with an unrecognised extra field, stored it, sent the notification,
# and reported success. A verification row that quietly does the opposite of
# what it claims is worse than an unchecked box. Grep the code, do not trust
# this line.
curl -s -o /dev/null -D- -X POST "https://$STAGING/api/contact/" -H "Origin: https://$STAGING" \
  -H "Accept: text/html" \
  -d 'name=Bot&phone=5550000000&email=b@example.com&message=x&company=filled' | grep -i '^location'
# Location must NOT contain sent= — that URL is the conversion

# cross-origin → 403
curl -s -o /dev/null -w '%{http_code}\n' -X POST "https://$STAGING/api/contact/" \
  -H "Origin: https://evil.example" -d 'name=x'
```

Then **confirm both ends**, not the 200:

```bash
npx wrangler kv key list --binding LEADS_STAGING | tail -5
curl -s -H "Authorization: Bearer $LEADS_EXPORT_TOKEN" "https://$STAGING/api/leads.csv" | tail -3
```

…and that the email actually arrived, in the provider's dashboard. A 200 from a transactional
API means accepted for delivery, not delivered.

**Then with JavaScript off** — the native POST must still store, still notify, and land on a
human-readable page.

### Accessibility

```bash
npm run a11y          # one URL per template family, listed in .pa11yci.json

# against production, where a sitemap exists (staging emits none, deliberately)
npx pa11y-ci --sitemap "https://$PROD/sitemap-index.xml" --standard WCAG2AA
```

**Add a URL to `.pa11yci.json` for every template family you create.** A homepage-only pass
misses everything the blog does differently.

Plus, by hand, on **one page per template family** — not every URL, and never only the
homepage:

- **Keyboard**: Tab through everything. Focus visible, order matches the visual order, menus
  escapable, and the skip link *moves focus* (Tab after activating it — if you land back in
  the nav, the target is missing `tabindex="-1"`)
- **Zoom**: 200% and 400%, plus a 320px viewport. No horizontal scroll, nothing clipped
- **Screen reader**: VoiceOver/Safari or NVDA/Firefox. Does the page make sense, not merely
  does it speak
- **Forms**: submit empty and check the error is announced and focus moves to the first bad field

### Visual, console and network

Automated checks confirm a page *responds*. They say nothing about whether it *renders*. Open
one page per template family in a browser — Chrome with the Claude extension does this and can
capture the screenshots for the handover.

- **Look at it** at a mobile and a desktop width. A broken layout returns 200 like any other
- **Console: zero errors.** A blocked third-party script or a CSP violation shows up nowhere else
- **Network: zero failed requests.** A 404 asset is invisible to a status-code sweep
- **Before/after screenshots** on a migration — `npm run shots`, below. Hard to defend a
  rebuild when someone misremembers the old site

Still not a substitute for a real device — emulated widths do not model browser chrome or touch
latency.

### The visual record

```bash
npm run extract                                      # captured HTML → markdown, once
npm run shots -- --before https://old-site.com       # BEFORE you switch DNS
npm run shots -- --after  https://new.example.com    # staging, then again after cutover
```

Full-page captures at 390px and 1440px, then `shots/index.html` puts the pairs side by side.
**Take the before pass while the old site is still up** — once DNS moves, it is gone, and the
Wayback Machine will not have every page.

Both sides read `recon/urls.txt`, so the sets cannot drift: a page that existed and no longer
does appears in the sheet as a 404 next to its old screenshot, which is the row worth looking
at. A path that 301s is followed and still filed under the old path, so the pair lines up.

The sheet and its PNGs go **with the handover**, not into the repo — `shots/` is gitignored,
and it is regenerable right up until the old site goes away.

### Media and SEO

| Check | Passing |
| --- | --- |
| Images | Every one resolves and carries `width`/`height` |
| `og:image` | A format scrapers render — JPEG, not WebP |
| Duplicate covers | No two posts sharing a photo |
| Structured data | Validates, and states the same facts as the visible page |
| Titles/descriptions | Diffed against the old site, every difference deliberate |

### Performance

Measured on the deployed site, mobile profile, **at least two runs per variant** — single runs
swing by a second on Speed Index.

```bash
npx lighthouse "https://$PROD/" --preset=perf --form-factor=mobile --output=json --quiet \
  --output-path=./lh-1.json
```

Any deliberate delay — splash, overlay, gate — costed in LCP and reported, including when the
number undercuts the argument for it.

---

## 3. Go-live

In this order. Steps 1–3 happen days ahead, not on launch day.

1. **Lower the DNS TTL to 300s** at least 24h before cutover, so a mistake is 5 minutes rather
   than a day.
2. **Confirm domain and DNS access works** — actually log in. This blocks go-live more often
   than anything technical.
3. **Move Search Console verification to DNS TXT** if it currently relies on an HTML file, and
   confirm it still shows verified. File-based verification breaks the moment the file stops
   resolving, and losing verification loses the property's history.
4. **Name what enforces every retention period the privacy notice states.** KV is done for you —
   `leadRetentionDays` becomes an `expirationTtl` and the store enforces it. **Anything else is
   not.** R2 keeps uploaded files forever unless the bucket has a **lifecycle rule**, and that
   rule lives in the Cloudflare dashboard, so nothing in the repo and no gate here can see it.
   D1 needs a scheduled delete you wrote.

   ⚠ A notice claiming a period nothing enforces is a false statement, and it fails silently:
   clean build, clean deploy, correct-looking policy, data still there a year later. Caught on a
   real build where résumés went to R2 while the retention value drove only the KV record and the
   page copy. If you cannot name the mechanism, build it or change the notice —
   `stacks.md` §6.
5. **Full verification matrix against staging.** Every row.
6. **Deploy production** — `npm run deploy:production`. Read the bindings table in the output;
   it is the only visible signal that the right environment was built.
7. **Cut DNS over.** Watch, do not assume:
   ```bash
   dig +short $PROD; dig +short www.$PROD
   curl -sI "https://$PROD/" | head -3
   ```
8. **Remove the staging route** from the worker, or staging becomes an indexable duplicate.
9. **Re-run the matrix against production**, including `robots.txt` (must now allow) and
   `noindex` (must now be absent).

   ```bash
   npm run verify -- "https://$PROD"
   npm run check:sitemap          # after a production build: nothing listed AND noindex
   npm run check:secrets          # the production worker holds every declared secret
   ```

   `check:secrets` already ran as part of `deploy:production`. Run it again here because
   go-live is when it is most likely to fail: a secret set on the staging worker is not
   automatically on this one, and the failure is silent — leads store, nothing emails.
10. **Submit the sitemap** in [Search Console](https://search.google.com/search-console) and
   [Bing Webmaster Tools](https://www.bing.com/webmasters). If you kept the old filename, the
   existing entry keeps working and there is nothing to resubmit.

   Optionally nudge the rest:

   ```bash
   export INDEXNOW_KEY=…            # 8–128 hex, saved as public/<key>.txt and DEPLOYED
   PUBLIC_SITE_URL="https://$PROD" npm run indexnow
   ```

   **Run it after the deploy, never before** — IndexNow fetches the key file at the moment of
   submission and rejects the whole batch with a 403 if it is not live yet. And it is Bing,
   Yandex, Seznam and Naver: **Google does not participate**, so this is never the reason a
   page is or is not in Google. The script prints both of those on every run.
11. **Diff the zone against the capture.** The one step that catches a launch taking the
    client's email with it:

    ```bash
    npm run dns -- "$PROD" --compare       # anything LOST since recon/dns.json
    ```

    MX, SPF, DMARC, verification TXT and nameservers, compared against what was published
    before you touched anything. A dead site gets a phone call; dead email is silent.

12. **Send one real enquiry through the live form** and confirm the client received it in the
    inbox they actually read.
13. **Restore the DNS TTL** to something sane (3600s).
14. **Point the uptime monitor at a real page and the form endpoint** — not just the homepage.
    The endpoint is what breaks.

---

## 3a. www → apex redirect

**Symptom:** `curl -sI https://www.example.com/some-page/` returns **200** instead
of a 301. Every page exists on two hostnames.

It is not an emergency — each www page emits a canonical pointing at the apex, so Google
consolidates. But a canonical is a *hint* and a 301 is an *instruction*: until this exists,
every crawler counts the site twice, and any backlink built to the www form consolidates
weakly.

### Why it cannot be fixed in this repo

Both hostnames are routed to the same worker in `wrangler.jsonc`, so a request to www is
byte-identical to one to the apex by the time our code sees it.

- **`public/_redirects` cannot do it.** Matching there is path-only. Pages supports absolute-URL
  sources (`https://www.example.com/* → https://example.com/:splat`); **Workers Static Assets
  does not.** Tested on 2026-08-15 against `wrangler dev` with a spoofed `Host` header: the
  absolute rule returned 200 while a path rule on the same file returned its 301 correctly. Do
  not re-try this — it looks like it should work and silently does nothing.
- **Middleware cannot do it either**, unless you turn on `run_worker_first`. Static assets are
  served without invoking the worker, which is exactly why www serves a perfect copy. Turning
  that on to catch a redirect routes every request through a worker to fix a handful.
- **Do NOT delete the www route from `wrangler.jsonc`.** That leaves www resolving in DNS with
  nothing behind it — a hard failure for anyone who typed it, which is worse than a duplicate.

It has to be a zone-level rule, which runs in the dynamic-redirect phase *before* Worker routes.

### Doing it in the dashboard

Cloudflare → the `example.com` zone → **Rules** → **Redirect Rules** → **Create rule**
→ *Single Redirect*.

| Field | Value |
| --- | --- |
| Rule name | `www to apex` |
| If — custom filter expression | `(http.host eq "www.example.com")` |
| Then — Type | **Dynamic** (not Static) |
| Expression | `concat("https://example.com", http.request.uri.path)` |
| Status code | `301` |
| Preserve query string | **on** |

**Use Dynamic, not Static.** A static target sends every www URL to the homepage. Google reads
that as a soft 404 across every page at once — measurably worse than the duplicate being fixed.

### Doing it over the API

The wrangler OAuth token **cannot** do this: it carries `zone (read)` and rulesets need
`Zone → Zone WAF/Rulesets → Edit`. Mint a scoped token for that one zone, use it, delete it.

```bash
export CLOUDFLARE_API_TOKEN=…            # Zone WAF/Rulesets:Edit, this zone only
ZONE=$(curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones?name=example.com" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['result'][0]['id'])")

curl -s -X POST \
  "https://api.cloudflare.com/client/v4/zones/$ZONE/rulesets/phases/http_request_dynamic_redirect/entrypoint/rules" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "description": "www to apex",
    "expression": "(http.host eq \"www.example.com\")",
    "action": "redirect",
    "action_parameters": {
      "from_value": {
        "status_code": 301,
        "target_url": { "expression": "concat(\"https://example.com\", http.request.uri.path)" },
        "preserve_query_string": true
      }
    }
  }'
```

### Verify — against the live host, not the dashboard's confirmation

```bash
# must be 301, and Location must keep the path
curl -sI https://www.example.com/some-page/ | grep -iE '^HTTP|^location'

# the query string must survive
curl -sI "https://www.example.com/search/?q=test" | grep -i '^location'

# and the apex itself must NOT have started redirecting — that is an infinite loop
curl -so /dev/null -w '%{http_code}\n' https://example.com/some-page/
```

Expected: `301` + `Location: https://example.com/some-page/`, the query preserved,
and the apex still `200`. **If the apex returns 301, remove the rule immediately** — the
expression matched too broadly and the site is in a redirect loop.

---

## 4. First week

| When | Watch | Acting on it |
| --- | --- | --- |
| Day 1 | Form submissions arriving, in KV **and** the client's inbox | Silence here is the expensive failure. Check before they do |
| Day 1 | `curl` the ten highest-traffic legacy URLs | A redirect that 301s to a 404 is invisible until traffic drops |
| Day 2–3 | Search Console → Pages → "Not indexed" | A spike means a redirect or canonical is wrong |
| Day 2–3 | Search Console → Sitemaps | "Couldn't fetch" means the filename changed |
| Week 1 | Analytics: is anything recording at all? | A missing tag looks identical to a quiet week |
| Week 1 | 404 log | Real 404s are URLs you missed in the inventory. Add redirects |
| Week 2–4 | Search Console → Performance, versus the old site | Some ranking movement is normal. A sustained drop is a redirect problem |
| Week 4 | Core Web Vitals field data (CrUX) | Lab numbers are a proxy; this is the real one |

**Export the leads on a schedule.** The repo is the backup for content and code; leads in KV
are the one thing not in git.

```bash
curl -H "Authorization: Bearer $LEADS_EXPORT_TOKEN" "https://$PROD/api/leads.csv" -o leads.csv
```

---

## 5. Rebuild test

The real test of the configuration, and worth doing once before handover: **delete the
deployment target and recreate it from the repo.** If that needs undocumented dashboard clicks,
the setup is not reproducible — write down what is missing, here.
