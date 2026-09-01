---
description: Report what a site built from this kit is behind on, and where to go to fix it
---

Run the kit's drift detection in this project and report what it found.

`$ARGUMENTS` — a path means audit that project. Nothing means the current directory.

```bash
npm run check:drift                 # read-only, exit 0 whatever it finds
npm run check:cms                   # only if the project has a .pages.yml
```

⚠ **Run `check:cms` too, and do not stop at the drift row that mentions it.** Drift reports
whether the site *has* that check; it never runs it, because it re-implements nothing. On a
delivered site those are different answers, and the second one is the one with the findings —
six of seven audited sites failed it while their drift rows looked ordinary.

⚠ **`check:cms` exits 1 when it finds something. That is the finding, not a broken command.**
Report what it printed. An audit that reports "the check failed" has told the reader nothing.

If the project predates either script, run them from a current kit without copying anything in —
every check resolves paths from the working directory:

```bash
node path/to/website-build-kit/template/scripts/check-drift.mjs
node path/to/website-build-kit/template/scripts/check-cms.mjs
```

That needs `npm install` to have been run once in the kit's own `template/`, because Node
resolves `yaml` from beside the script rather than from the site.

⚠ **Report every row, including the clean ones.** "Not applicable" is a finding: a report that says
what was checked and found fine is trusted, and one listing only problems reads as a pitch. A site
with no `.pages.yml` has **no CMS**, which is not the same as a CMS with nothing wrong.

⚠ **Offer `--fix` when undeclared keys are among the findings.** `npm run check:cms -- --fix`
prints the field declarations to paste, typed from the stored values. It prints and never
writes — and for a key that looks like technical configuration it says so, because moving that
one OUT of the CMS is usually the better answer.

⚠ **Keep `check:cms` problems and warnings apart.** A problem is unambiguous and exits 1. A warning
is a judgement the check refuses to make for you — whether a data file is deliberately
developer-controlled or a gap the client is reporting as "whole sections are missing". Present a
warning as a question, never as a defect.

⚠ **Do not offer a menu before there are findings.** *"Shall I fix your images?"* is not a decision
anybody can make. *"Your pipeline emits WebP only and your 94 images are 19% larger than they need
to be"* is. And measure that saving here — it depends entirely on the photography, and quoting
another project's number is how you lose the reader.

**Then stop.** Fixing is a separate job with its own judgement — what to repair first, what to
leave on a live site, what to ask the client — and it lives in
[site-runbooks](https://github.com/nurkamol/site-runbooks), which calls these scripts rather than
restating them.

The kit's own companion is `docs/auditing-a-shipped-site.md` — the order to repair findings in on a
site with a client already editing it, and how to prove the deploy changed only what you intended.

This command deliberately does **not** describe the individual checks. `check-drift.mjs` and
`check-cms.mjs` are the one place each is written down; a second description here is how the two
drift apart while nothing says so, which is the failure the scripts exist to catch.
