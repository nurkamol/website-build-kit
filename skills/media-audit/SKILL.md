---
name: media-audit
description: Audit and remediate a site that was built from an older version of this kit. Use when a delivered or live site is missing later fixes — images larger than they should be, a client who cannot change a photograph, a CMS that deletes fields on save, a pipeline that drops files silently — or when asked what a shipped project is behind on, whether it needs updating, or to bring it up to date with the current kit.
---

# Media audit

A site built from this kit is a **copy, not a link**. Nothing fixed here afterwards reaches it —
not a trap, not a gate, not a pipeline improvement. This is the only procedure that speaks to a
site already shipped.

⚠ **The cost is not hypothetical.** A delivered site served every image about 19% larger than
intended for weeks after the pipeline gained AVIF, and it surfaced only because somebody happened
to read two trees side by side for an unrelated reason.

## Three phases, and do not reorder them

### 1. Detect. Change nothing.

```bash
npm run check:drift          # or: node scripts/check-drift.mjs --json
```

If the project predates the script, copy `scripts/check-drift.mjs` and `scripts/lib/` in from the
current template and run it there. It reads only.

**Run the other checks too if the project has them** — `check:cms`, `check:form`, `check:copy`,
`tells`. If it does not have them, that absence *is* a finding and `check:drift` reports it.

⚠ **Record every row, including the clean ones.** "Not applicable" is a finding: a report that
says which things were checked and found fine is trusted, and one that lists only problems reads
as a sales pitch.

### 2. Report what you actually found. Then ask.

⚠ **NEVER PRESENT A MENU BEFORE THERE ARE FINDINGS.** *"Shall I fix your images?"* is not a
decision anybody can make. *"Your pipeline emits WebP only and your 94 images are 19% larger than
they need to be"* is.

**Measure before quoting.** The AVIF saving depends entirely on the photography — quoting a number
from another project is how you lose the reader. Convert a handful and compare like for like.

Then offer four routes, and **recommend one with a reason**:

| Route | When it is right |
| --- | --- |
| Everything | The site is between client engagements and nobody is editing it |
| **Only what the client can see** | ✅ Usually. Smallest change, most visible benefit — a client who can finally swap a photograph |
| Only the invisible correctness fixes | A live site mid-campaign: no regenerated assets, no visual risk |
| Report only | They want to decide later, or budget it |

On a site with a client actively editing, *"only what the client can see"* is usually right.

### 3. Fix the chosen way, verifying each step.

Port from the current template; **never copy a whole file over a live site**, which overwrites the
design that makes it that client's site. After each change, run the check that found it and see it
go green.

## What each finding actually means

| Finding | Why it matters | The fix |
| --- | --- | --- |
| No AVIF | Every image larger than it needs to be, on every page, for every visitor | `FORMATS = ['avif', 'webp']` — measure the saving before reporting it |
| Pipeline drops files silently | A `.heic` produced no output, no warning, no manifest entry; a corrupt file aborted the run and desynced the manifest | Port the skip report and the per-file catch |
| Hardcoded images | The client opens the page, sees a photograph, and has no way to change it. Nothing is broken — the only symptom is somebody looking for a field that was never there | Make it a field, **or write down why it is fixed** |
| No `check:cms` | A CMS rewrites the whole file from its schema, so any key it does not declare is **deleted on the client's first save**. Five audited sites, five failures, two losing live data | Copy the check in and run it before anything else |
| Binary source file | Invisible to `git diff`, to `grep`, and to the provenance sweep, which is written with `grep -I` | Find the literal NUL and replace it with an escape |
| No contrast check | axe and pa11y report a flat ~1.01:1 for text on a photograph, so an unreadable header passes every gate | Declare the regions; the danger is a weakened scrim, never the photograph |
| No client guide | The client has a CMS and no instructions for it | `docs/handover.md`, and cross-check it against the config |

## The judgement this needs

**Not every finding is worth fixing on every site.** A brochure site nobody edits does not need a
CMS check. A site with no text over photographs does not need contrast regions. ⚠ **Fixing
everything on a live site because a report listed it is how a working site breaks** — the report
is input to a decision, not the decision.

**Order by who is hurt.** A client unable to edit their own photographs, or a CMS quietly deleting
their opening hours, outranks an image that is 19% too large. Visitors never notice the third one;
the owner notices the first two the moment they try to work.
