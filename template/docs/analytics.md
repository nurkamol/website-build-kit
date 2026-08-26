# Analytics

What is already measured, what is genuinely missing, and the rules whose failure
looks like success.

All IDs live in `src/data/site.ts`. They are **the client's own or empty** — an unset ID must
never fall back to another project's container. Nothing is emitted off production, so staging
HTML contains zero references rather than a disabled snippet.

---

## 1. What is already captured — do not rebuild it

GA4's **enhanced measurement** is on by default and covers more than people expect. Building
a custom event for any of these produces two numbers that disagree:

| Already captured | Event |
| --- | --- |
| Outbound link clicks | `click` (with `outbound: true`) |
| Site search | `view_search_results` |
| Scroll depth (90%) | `scroll` |
| File downloads (pdf, doc, xlsx, zip…) | `file_download` |
| Video engagement (embedded YouTube) | `video_start`, `video_progress`, `video_complete` |
| Page views, including history-API routes | `page_view` |

Check Admin → Data streams → the stream → Enhanced measurement before writing any tag.

## 2. What is genuinely missing

**`tel:` and `mailto:` clicks are not captured.** They are not outbound links in GA4's sense
and no enhanced-measurement category covers them. For a business whose phone number sits in
every header and footer, that is a primary conversion going unmeasured.

If you add it, the announcer belongs next to the one in `ContactForm.astro` — one function,
both pipes — and the same no-double-count rule applies.

## 3. The rules whose failure looks like success

**Never add a GA4 configuration tag inside Tag Manager alongside a direct `gtag.js`.**
Both fire `page_view`. Sessions halve, bounce rate collapses, and the numbers look *better*,
which is why it survives review. `Base.astro` loads `gtag.js` directly and GTM as a
container — do not add a GA4 Configuration tag inside the container.

**Never send the same conversion down both pipes.** `announceLead()` in `ContactForm.astro`
pushes to `dataLayer` *and* calls `gtag`. If the container also has a trigger creating a GA4
event from `lead_submitted`, every lead counts twice.

**Never trigger a conversion on "URL contains `sent=1`".** It is the obvious implementation
and it is wrong: the enhanced path intercepts the submit and never changes the URL, so the
trigger only catches visitors without JavaScript. It fires correctly when you test by hand and
then under-reports for the life of the site. See the long comment in `ContactForm.astro`.

**Verify the container is the client's own.** Fetch it and read it — do not reason about it:

```bash
curl -s https://example.com/ | grep -o 'GTM-[A-Z0-9]*' | sort -u
curl -s "https://www.googletagmanager.com/gtm.js?id=GTM-XXXX" | grep -oE 'G-[A-Z0-9]{8,}' | sort -u
```

A site shipped once with a container inherited from the *previous* site's Google account:
invisible, un-editable and un-revokable by the client, executing on every page. It was empty.
Reading it is what found it.

**Confirm one pageview per visit in Realtime.** Nothing in a build catches a double-count.

## 4. Cloudflare Web Analytics

Set `CF_BEACON_TOKEN` in `src/data/site.ts`. Independent of the Google tags — set either,
both or neither. Worth having on every site:

- **Real-user Core Web Vitals from the first visitor.** CrUX needs months of traffic before it
  reports on a new domain, so field data is otherwise unavailable for exactly the period after
  launch when it matters.
- **A control group for ad blockers.** Cookieless and first-party, so the gap between it and
  GA4 measures what the Google tags are losing instead of leaving you to guess.

Cookieless also means it raises no consent-banner obligation of its own — see `compliance.md`
before assuming the same of anything else.

## 5. Before go-live

- [ ] Both IDs are the client's own, from their own property
- [ ] No GA4 Configuration tag inside the GTM container
- [ ] No conversion trigger on `sent=1`
- [ ] One submission produces exactly one `generate_lead` in Realtime
- [ ] Staging HTML contains zero analytics references (`curl -s https://new.example.com/ | grep -c gtag` → 0)
