# Handover — Business Name

⚠ **THIS IS A TEMPLATE. Fill it in and delete this block before sending.**
>
> This is the only document in the repo written for the **client**, not for whoever maintains
> the code. `runbook.md`, `content.md` and `traps.md` are for a developer; this one is for the
> person who owns the business and will be asked, in two years, who hosts their website.
>
> Render it with `npm run handover`, which writes `docs/handover.pdf` beside it. Send the PDF;
> keep the markdown in the repo so the next change updates the same document instead of
> starting a new one.
>
> Every ⚠ below marks something you must supply. A blank left in is worse than the section
> being absent, because it reads as a completed answer.
>
> Cross-check against `BUILD-STATE.md` before deleting that file — its **Integrations** and
> **Preserve** lines are the source for §3 and the "deliberately not built" list in §4.

**Prepared:** ⚠ date · **By:** ⚠ name · **Site:** ⚠ https://example.com

---

## 1. What you own, and where

You own all of it. Nothing here is held in anyone else's name, and you can move any of it
without our involvement.

| Thing | Where it lives | Who has admin |
| --- | --- | --- |
| Domain name | ⚠ registrar | ⚠ |
| Website hosting | ⚠ Cloudflare account | ⚠ |
| The site's code | ⚠ repository URL | ⚠ |
| Email sending | ⚠ provider | ⚠ |
| Analytics | ⚠ Google account | ⚠ |

⚠ **Attach `recon/dns.md`** if this was a migration. It is the record of what the domain
published before the move — the thing to compare against if mail or a verification ever stops
working, and the thing a future supplier will ask for first.

⚠ **Name a real person against each row, not a company.** "The agency" is not an answer when
the agency has moved on. If any row is owned by someone unreachable, say so here in plain
words — it is the single thing most likely to block an urgent change.

**Your domain is the one that matters.** As long as you control the domain registration, you
can move the site anywhere. Keep the registrar login somewhere you will still have it in five
years, and turn on auto-renew.

---

## 2. What it costs to run

⚠ Fill in real figures. A client who does not know the running cost assumes it is zero and is
alarmed by the first invoice.

| Service | What it does | Cost |
| --- | --- | --- |
| Domain renewal | Your address on the internet | ⚠ /year |
| Hosting | Serves every page | ⚠ /month |
| Email sending | Enquiry notifications | ⚠ /month |
| ⚠ | ⚠ | ⚠ |

**What happens if a payment fails**, in order of how bad it is:

1. **Domain lapses** — the site goes dark and email may stop. Recoverable for a short grace
   period, then someone else can buy your address. This is the one to protect.
2. **Hosting lapses** — the site goes dark, but nothing is lost. Restored by paying.
3. **Email sending lapses** — the site keeps working and enquiries are still *saved*, but
   nobody gets notified. See §5: this is why they are stored before the email is sent.

---

## 3. What is connected

⚠ One row per integration, from `recon/integrations.md` and the `Integrations` lines in
`BUILD-STATE.md`. Include the ones you did not build, and say so.

| Connected | What it does | Whose account |
| --- | --- | --- |
| ⚠ | ⚠ | ⚠ |

⚠ **Flag anything inherited.** A tag or booking widget set up by a previous supplier, in an
account nobody at the business can log into, keeps running and cannot be changed or switched
off. It is better to say this now than to discover it during an urgent request.

---

## 4. What we deliberately did not build

⚠ List it. This section matters as much as everything above.

The difference between a decision and an oversight is whether it was written down. If a
feature was discussed and dropped — for cost, for speed, because it duplicated something you
already have — it belongs here with the reason.

| Not built | Why | What to do if you want it |
| --- | --- | --- |
| ⚠ | ⚠ | ⚠ |

---

## 5. Your data, and how long it is kept

**Enquiries from the website are saved before the notification email is sent.** If the email
provider has an outage you lose a notification, never the enquiry itself.

- **Where:** stored with the hosting, in your own account
- **How long:** ⚠ days, then automatically deleted — see `leadRetentionDays` in
  `src/data/site.ts`
- **How to get it out:** ⚠ the export URL and where the token is kept

⚠ **Keep this number and your privacy notice in step.** If the privacy notice says one
retention period and the site enforces another, the published one is the promise you are
judged against.

If someone asks you to delete their data, they are entitled to that. ⚠ Name who does it and
how.

---

## 6. Making changes

| Change | Who can do it |
| --- | --- |
| ⚠ Text on an existing page | ⚠ |
| ⚠ Adding a blog post | ⚠ |
| ⚠ Prices, opening hours, phone number | ⚠ |
| A new page or section | A developer |
| Anything about how it looks | A developer |

**Opening hours, address and phone number live in one place** and update the whole site at
once — the header, the footer, every button, the notification emails, and what Google reads.
Ask for them to be changed in that one file rather than page by page, or they will drift.

---

## 7. Accessibility

⚠ Do not describe the site as "fully accessible" or "fully compliant". Nobody can claim that
honestly, and the claim is what gets challenged.

- **Published statement:** ⚠ https://example.com/accessibility
- **Standard targeted:** WCAG 2.2 AA
- **Last tested:** ⚠ date · **Tested how:** ⚠ automated tool + which pages by hand
- **Evidence:** ⚠ attach the newest pack from `docs/a11y-evidence/`
- **Known gaps:** ⚠ list them, with who owns each

**This needs re-testing whenever the site's layout changes**, not on a calendar. The published
statement carries a date and a claim; a redesign that leaves the date alone turns it into a
false statement about a site that no longer exists.

⚠ Run `npm run a11y:evidence` after any layout change — it runs the automated sweep and the
reflow pass, writes a dated pack, and tells you when the statement's date has fallen behind.
Update the statement when you do.

---

## 8. If something looks wrong

In order — the first two resolve most of it:

1. **Hard-refresh the page.** Browsers hold on to old copies. `Cmd+Shift+R` or `Ctrl+F5`.
2. **Try it on a phone and on another network.** If it works there, it is your connection or
   your browser, not the site.
3. **Check the enquiry form** by sending yourself one. It should arrive within a minute.
4. ⚠ **Contact:** name, email, and what response time to expect.

⚠ Tell them what is *not* an emergency. A page that looks slightly different in one browser is
not the same as the site being down, and knowing the difference saves a weekend call.

---

## 9. Current state

⚠ What is actually live, and what is outstanding, on the day you send this. Be specific and
dated. This section is why the document is trusted in six months.

**Live:** ⚠

**Outstanding:** ⚠ with an owner and a date against each

**Watch in the first month:** ⚠ e.g. enquiries arriving, search rankings settling after the
address change, the 404 log for URLs the migration missed
