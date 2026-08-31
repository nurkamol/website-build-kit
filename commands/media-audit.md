---
description: Report what a site built from this kit is behind on, and where to go to fix it
---

Run the kit's drift detection in this project and report what it found.

`$ARGUMENTS` — a path means audit that project. Nothing means the current directory.

```bash
npm run check:drift
```

If the project predates the script, copy `scripts/check-drift.mjs` and `scripts/lib/` in from a
current template first. It is read-only and exits 0 whatever it finds.

⚠ **Report every row, including the clean ones.** "Not applicable" is a finding: a report that says
what was checked and found fine is trusted, and one listing only problems reads as a pitch.

⚠ **Do not offer a menu before there are findings.** *"Shall I fix your images?"* is not a decision
anybody can make. *"Your pipeline emits WebP only and your 94 images are 19% larger than they need
to be"* is. And measure that saving here — it depends entirely on the photography, and quoting
another project's number is how you lose the reader.

**Then stop.** Fixing is a separate job with its own judgement — what to repair first, what to
leave on a live site, what to ask the client — and it lives in
[site-runbooks](https://github.com/nurkamol/site-runbooks), which calls this script rather than
restating it.

This command deliberately does **not** describe the individual checks. `check-drift.mjs` is the
one place they are written down; a second description here is how the two drift apart while
nothing says so, which is the failure the script exists to catch.
