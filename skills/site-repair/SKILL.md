---
name: site-repair
description: Check and repair a marketing site that has already been delivered — a client who cannot change a photograph or a section on their own site, content that disappeared after they saved in the CMS, uploads that vanish or turn the build red, or a site built from an older version of this kit whose state is unknown. Use when someone reports that a delivered site cannot be edited, when content went missing without an obvious commit, or before handing a site back after a gap. Audits read-only first and changes nothing until the findings have been read.
---

# Repairing a delivered site

The template is **copied, not linked**. Nothing the kit fixes afterwards reaches a site
already built, so a delivered site drifts and nothing reports it.

> **A green build proves the pages render. It proves nothing about the CMS** — the CMS is not
> a page, and the build never renders it.

Audited across twelve delivered projects: seven had a CMS and **six of the seven failed
`check:cms`**, two of them deleting client data on the next save. Every one had a green build,
clean types and a passing accessibility suite.

## Detect, report, ask, act — never reordered

⚠ **Change nothing before the findings have been read.** *"Shall I fix your images?"* is not a
decision anybody can make. *"Your pipeline emits WebP only, and this page holds 58 sentences
the client cannot edit"* is.

### 1. Audit, read-only

Every check resolves paths from the working directory, so the current kit audits a site in
place — including one built before these checks existed, with **no files copied in**:

```bash
cd /path/to/the-site
node <kit>/template/scripts/check-drift.mjs     # what it is behind on, exit 0 always
node <kit>/template/scripts/check-cms.mjs       # what the CMS destroys or cannot reach
```

Find `<kit>` with `readlink -f "$(dirname <this file>)"/../..` — this skill is symlinked from
the kit repository. The kit's own `template/` needs `npm install` run once, because Node
resolves `yaml` from beside the script rather than from the site.

If the site has the scripts itself, prefer `npm run check:drift` and `npm run check:cms` —
but say which vintage ran, because a copied check drifts too.

### 2. Report every row, including the clean ones

"Not applicable" is a finding. A report that says what was checked and found fine is trusted;
one listing only problems reads as a pitch.

⚠ **`check:cms` exits 1 when it finds something. That is the finding, not a broken command.**

⚠ **Keep problems and warnings apart.** A problem is unambiguous. A warning is a judgement the
check refuses to make — whether a data file is deliberately developer-controlled or a gap the
client is reporting as *"whole sections are missing"*. Present a warning as a question.

⚠ **No `.pages.yml` means no CMS**, which is not the same as a CMS with nothing wrong. Ask
whether one was in scope before treating it as a defect.

### 3. Ask for a scope

Offer the smallest useful one first — usually *"only what the client can see"*: empty pickers,
image values that are not paths, hardcoded photographs. Most visible benefit, regenerates
nothing. If a client is actively editing, take that scope.

### 4. Repair, in this order

1. **Anything that deletes content.** Undeclared keys, before the client next opens the CMS
2. **Anything an ordinary client action turns red.** Uploads pointed at the pipeline's output,
   and an image slot the CMS filled in partially — a picture left empty is written as a present
   object missing its required strings, and the next build after that save fails
3. **Anything they can see and cannot change.** Pickers, image values, hardcoded photographs
4. **Coverage.** Sections the CMS never exposed — and ⚠ **never wire a data module nothing
   imports into the CMS**; a form editing a file nothing reads invites a wasted afternoon
5. **Regenerating images. Its own commit** — it rewrites every file in the image directory

`check-cms.mjs --fix` prints the field declarations to paste for step 1, typed from the values
actually stored. It **prints and never writes**: for a key that looks like technical
configuration, moving it *out* of the CMS is usually the better answer, and a tool that chose
would choose wrong exactly where being wrong is silent.

The full procedure — every finding with the symptom the client reports, and how to prove the
deploy changed only what you intended — is `docs/auditing-a-shipped-site.md` in the kit.

### 5. Prove you changed only what you meant to

```bash
git stash && npm run build && mv dist ../before
git stash pop && npm run build
diff -rq ../before dist
```

`npm run build`, **not** `build:production` — the "before" tree still fails the gates, so that
build never finishes and there is no baseline. Most of this work is byte-identical output.

### 6. Deploy, then open the CMS and click through it

Not automatable and not optional. On the site these findings came from, every image picker was
broken while the build was green, the types checked, and the rendered HTML was byte-for-byte
identical to the previous deploy.

Then `npm run handover` — the client's guide is almost certainly describing a CMS that no
longer exists.

## What this does not decide

Which block of copy becomes a field, how a CMS is grouped so a non-developer can navigate it,
and whether a data file is deliberately developer-controlled. Those are questions, and the
long-form judgement for them lives in
[site-runbooks](https://github.com/nurkamol/site-runbooks).

For **building** a site rather than repairing one, use the `website-build` skill instead.
