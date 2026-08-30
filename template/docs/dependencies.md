# Why `npm audit` reports a high, and why it is not fixed

Run `npm audit` on this site and it reports **high-severity findings that nothing can fix
today**. That is expected, it is documented here rather than left to be rediscovered, and the
answer to give a client who asks is at the bottom.

Check it yourself before reading further:

```bash
npm audit --omit=dev     # production dependencies only
npm audit                # everything, including build tooling
```

## The short version

| | |
| --- | --- |
| Production dependencies | **0 findings** — nothing that reaches a built page is affected |
| Development tooling | 1 advisory, reported by `npm audit` as several rows |
| Advisory | [GHSA-jmr9-qjv8-65gv] — `extract-zip` unvalidated symlink path traversal, CVSS **8.1** |
| Patched version | **none exists** |
| Reachable from the site | **no** — nothing under `src/` imports it |

⚠ **`npm audit` and GitHub disagree on the count, and both are right.** `npm audit` prints one
row per affected package in the chain; GitHub's Dependabot prints one per *advisory*. Six rows,
one problem. Do not read the larger number as six separate holes.

## Where it comes from

Accessibility testing is the whole chain. Each step declares the next:

```
pa11y-ci  →  pa11y ^9.1.1  →  puppeteer ^24.37.5  →  @puppeteer/browsers 2.13.2  →  extract-zip ^2.0.1
```

`extract-zip` is what unpacks the Chrome build that puppeteer downloads the first time you run
`npm run a11y`.

## Why it cannot be fixed here

Three reasons, each checkable:

1. **There is no patched release.** The advisory's `first_patched_version` is empty. Nothing to
   upgrade *to* — this is not a version we have neglected to take.
2. **`npm audit fix` changes nothing.** It reports `+0 ~0 -0 packages`. Confirm with
   `npm audit fix --dry-run`.
3. **`puppeteer` pins `@puppeteer/browsers` at an exact `2.13.2`**, not a range. Even forcing a
   resolution cannot move it without replacing puppeteer itself, and `pa11y-ci` is already at
   its latest release.

The fix has to come from upstream. Until it does, the honest position is a documented known,
not a silent one.

## Why the exposure is not what the score suggests

**CVSS 8.1 describes the vulnerability, not our exposure to it.** Exploiting it means feeding
the extractor a malicious archive — in practice, a compromised Chrome download. That requires
an attacker who already controls the archive puppeteer fetches, and the vector is marked as
requiring user interaction.

More to the point:

- It is a **development** dependency. It is not bundled, imported, or served.
- **Nothing under `src/` references pa11y or puppeteer.** Only three scripts do —
  `check-a11y.mjs`, `a11y-evidence.mjs` and `md-to-pdf.mjs` — and none of them run in a
  deploy.
- A production install (`npm ci --omit=dev`) does not install it at all.

⚠ **This is a reason it is low risk, not a reason it is fine.** If you ever start running the
a11y scripts on untrusted input, or in CI with credentials worth stealing, re-evaluate rather
than re-reading this paragraph.

## What to tell a client who asks

> The audit finding is in accessibility *testing* tooling, not in the website. It is not part
> of what gets deployed, and the live site does not contain it. There is currently no fixed
> version published by its maintainers; when there is, it will be picked up on the next
> dependency update. The site's production dependencies report no findings.

Every clause there is checkable with the two commands at the top. Do not soften it further, and
do not claim the site is "not affected by any vulnerabilities" — that is a bigger claim than the
evidence supports, and it is the kind of sentence that gets quoted back.

## When this changes

Re-check whenever `pa11y-ci` releases, and whenever an audit shows a *different* advisory —
this note covers exactly one, and a second finding is a new decision, not this one repeating.

```bash
npm audit --omit=dev            # must stay at 0. If it is not, that is a real problem
npm outdated pa11y-ci           # the chain moves when this does
```

If a patched `extract-zip` ships and the chain picks it up, delete this file. A note describing
a problem that no longer exists is worse than no note.

[GHSA-jmr9-qjv8-65gv]: https://github.com/advisories/GHSA-jmr9-qjv8-65gv
