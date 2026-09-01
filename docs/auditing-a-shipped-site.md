# Auditing a site that is already live

For a site that shipped, has a client editing it, and was built before the checks in this
kit existed. It covers the two things that go wrong after handover and never show up in a
build: **the CMS deleting content the client cannot see it delete**, and **the media
pipeline pointed the wrong way**.

> **A green build proves the pages render. It proves nothing about the CMS** — the CMS is
> not a page, and the build never renders it.

Audited across five shipped sites, **all five failed `npm run check:cms`**. Two were losing
data on the client's first save: 27 keys at risk, including every analytics ID on one site
and the CTA and quote images on all three homepages of another. Two more declared their
upload directory as the pipeline's *output*, so any photo the client uploaded was servable,
had no variants, no width or height and no manifest entry — and turned the next build red.

Every one of those was invisible to `astro check`, to the build, to the accessibility suite,
and to a reviewer reading the config. The config is *valid*. It just describes less than the
file contains.

---

## 0. What the four checks need

Nothing here needs the site to be deployed, and nothing needs a browser.

| Check | Reads | Needs | Exits 1? |
| --- | --- | --- | --- |
| `npm run check:drift` | the whole project | `git`, and `yaml` for two rows | never — it reports |
| `npm run check:cms` | `.pages.yml` + the files it points at | `yaml` | ✅ yes |
| `npm run check:redirects` | `public/_redirects` | nothing | ✅ yes |
| `npm run check:contrast` | generated images + `src/data/contrast.json` | `sharp`, and `npm run media` already run | ✅ yes |

Start with `check:drift`. It is the only one that answers *"what is this site missing?"*
rather than *"is this specific thing wrong?"*.

---

## 1. Point the current kit at the old site — copy nothing in

Every script resolves the project from **the working directory**, not from its own location.
So a clone of the kit audits any site in place:

```bash
cd ~/coding/website-build-kit/template && npm install   # once, ever
cd /path/to/the-shipped-site
node ~/coding/website-build-kit/template/scripts/check-drift.mjs
node ~/coding/website-build-kit/template/scripts/check-cms.mjs
```

The site needs none of those files, none of their dependencies, and no change to its
`package.json`. Verified on a site carrying not one of the scripts: all of them ran, and
`git status` reported **zero changed files**.

⚠ **The `npm install` in the kit's `template/` is not optional.** Node resolves a bare
import from the *script's* directory upward, never from the working directory, so
`check-cms.mjs` looks for `yaml` beside itself. Without it you get
`ERR_MODULE_NOT_FOUND: Cannot find package 'yaml'` and no findings at all. It is a loud
failure rather than a quiet pass, which is the right way round, but it will stop you.

Worth an alias while you work through several sites:

```bash
kit() { node ~/coding/website-build-kit/template/scripts/"$1".mjs "${@:2}"; }
kit check-drift ; kit check-cms
```

### Or copy the scripts in

Only worth doing once you intend the site to keep them — see §7. `check-cms.mjs` needs
`scripts/lib/literal-images.mjs` and `scripts/lib/routes.mjs` beside it; `check-drift.mjs`
needs `scripts/lib/binary-files.mjs` and `scripts/lib/literal-images.mjs`. Copy the whole
`scripts/lib/` directory rather than picking files, and add `yaml` to the site's
devDependencies.

---

## 2. Read the drift report before anything else

```bash
kit check-drift            # or: node scripts/check-drift.mjs --json
```

Read-only, exit 0 whatever it finds, up to ten rows, `--json` when you are surveying several sites
at once. Report **every row to whoever asked, including the clean ones** — a report that says
what was checked and found fine gets trusted; one listing only problems reads as a pitch.

Two rows need reading carefully when you run it from a kit clone:

- **"CMS cannot delete undeclared keys"** reports drift because *the site* has no
  `check-cms.mjs`, not because you have not run one. That is the correct finding — the site
  is undefended between your visits — but do not read it as "the check has not run".
- **"Kit version recorded"** reports no stamp on anything scaffolded before the stamp
  existed. Absence dates the site rather than diagnosing it.

---

## 3. What each CMS finding means

`check:cms` separates **problems**, which exit 1 and are unambiguous, from **warnings**,
which are judgements it refuses to make for you.

### Problems — fix these

| Finding | What the client experiences | Fix |
| --- | --- | --- |
| keys the schema does not declare | opens a screen, saves, and unrelated content is gone from the repo | declare every key, or move it out of the CMS-managed file |
| uploads into `public/img/`, which is generated output | uploads a photo; it appears once, then the build goes red | point `input` at `media/source/…` and `output` at the served path |
| `type: image` values not under the media `output` | the picker shows nothing and the stored value looks fine in the JSON | migrate the values to picker paths, in the file, not in the config |
| `options.path` at a folder that does not exist | the media browser opens on an empty folder | fix the path, or drop `options.path` |
| a `path` that does not exist | the entry 404s inside the CMS | fix or remove the entry |
| internal links pointing at pages the site does not serve | clicks a nav item and gets the 404 page | fix the value; the check validates against `src/pages` |
| `.pages.yml` does not parse | the whole CMS fails to load | the parser names the line |

### Warnings — decide, then write the decision down

| Finding | Why it is a judgement |
| --- | --- |
| content no CMS entry points at | it is either deliberately developer-controlled or a gap. **"Whole sections are missing" is how a client reports the gap** |
| images hardcoded in pages | a fixed logo is right; a fixed header photograph is an oversight. Both look identical in the source |
| fields that look like technical configuration | an analytics ID in a CMS is a secret the client can silently break, and cannot diagnose |
| CMS sections the client guide never mentions | a section the guide omits is one they will not know they have |
| a media source with no `extensions` | a bad format is accepted in the UI and fails the build twenty minutes later |

⚠ **Do not silence a warning with a sentence.** One project's config said photographs were
"chosen in code, not here". That was true of the five fields that existed and quietly
excused the eight that did not — a header band, four class tiles and a gift-card picture,
all string literals in `.astro` files. Nothing was broken. The only symptom was a person
looking for a field that was never there.

---

## 4. What each media finding means

| Symptom | Cause | Fix |
| --- | --- | --- |
| an uploaded photo renders once, then the build throws | uploads land in the pipeline's output; no manifest entry | repoint `media.input`, move the files to `media/source/`, run `npm run media` |
| an iPhone photo vanishes with no error | a pipeline predating HEIC support drops it silently, while the installed libvips reads it fine | take the current `optimize-media.mjs` |
| one corrupt file aborts the run midway | no per-file `try`/`catch`; the manifest now describes a state that no longer exists | take the current `optimize-media.mjs` |
| every image is larger than it needs to be | WebP only, no AVIF | add AVIF — **and measure the saving on this site's photography** |
| text over a photograph is unreadable | axe and pa11y report a flat ~1.01:1 for text on an image, so it passes every gate | declare the regions in `src/data/contrast.json` and run `npm run check:contrast` |

On the kit's own pipeline, AVIF at quality 55 measured **26% smaller than WebP q78 at
matched quality** on a 4096×2160 photograph, at both 1200px and 1800px. One delivered site
was serving images **19% larger** than intended for weeks. Both numbers are from specific
photographs — **measure it on the site in front of you before quoting either**, because the
saving depends entirely on the photography.

---

## 5. Fix in this order

1. **Anything that deletes content.** Undeclared keys, first, before the client next opens
   the CMS. Everything else can wait a week; this cannot.
2. **Anything that breaks the build from an ordinary client action.** Uploads pointed at the
   output. Their own edit turning the site red is the worst failure on this page, because
   they will not connect the two.
3. **Anything the client can see and cannot change.** Empty pickers, `type: image` values
   that are not paths, hardcoded photographs. Most visible benefit, regenerates nothing.
4. **Coverage.** Sections the CMS never exposed. Slow, and it is where you find dead files —
   ⚠ **do not wire a data module nothing imports into the CMS.** A form that edits a file
   nothing reads is worse than no form; it invites someone to spend an afternoon rewording a
   page that will never change. One project had four.
5. **Regenerating images. Its own commit.** Adding an output format rewrites every file in
   the image directory and roughly doubles what the repo carries. Never mixed into a CMS
   change, because you will not be able to read the diff of either.

---

## 6. Prove you changed only what you meant to

Most of this work is byte-identical in the output: declaring keys the file already has,
converting a field type, migrating a stored value. So diff the built site.

```bash
git stash && npm run build && mv dist ../before      # the site as it is deployed
git stash pop && npm run build                       # the site with your repairs
diff -rq ../before dist
```

If the repairs are already committed, build the deployed commit in a worktree instead —
`git worktree add ../before <the-deployed-sha>`, `npm install` and `npm run build` there.

⚠ **`npm run build`, not `build:production`, on both sides.** `build:production` runs the
gates, and the whole point of the "before" tree is that it still *fails* them — so that build
never finishes and you get no baseline. Plain `astro build` produces the pages without the
gates. Use the same command on both sides and the diff is valid.

⚠ **If a page changed and you did not intend it to, stop and find out why.** This is the
only step that catches a migration that rewrote a value slightly wrong — the CMS will accept
it, the build will pass, and the page will be different.

The exception is step 5: regenerating images changes every image file by design. Run the
diff *before* that commit, not after.

---

## 7. Leave the check behind

Fix the findings first, then add the check to the site — so it starts green and the client's
next deploy is not blocked by a finding you already know about.

```jsonc
"check:cms": "node scripts/check-cms.mjs",
"build:production": "node scripts/build.mjs production"   // runs it, among others
```

Without this you are the site's only defence, and you only look when someone complains. With
it, the failure that took 27 keys across two projects cannot reach a second deploy.

---

## 8. Then open the CMS and click through it

This is the step that is not automatable and not optional. On the site these findings came
from, **every image picker was broken while the build was green, the types checked, the
accessibility suite passed, and the rendered HTML was byte-for-byte identical to the previous
deploy.** The only surface where it was visible was the one nobody automates.

- open every group, and every entry inside it
- open every image field and confirm the browser shows files
- change one image, save, and confirm the page renders it
- confirm nothing you did not touch has disappeared from the JSON

Then re-render the client's own documentation, which is almost certainly describing a CMS
that no longer exists:

```bash
npm run handover
```

---

## 9. Across several live sites

**Fix the upstream template first.** Otherwise every project you repair drifts again the
next time you scaffold, and you do the work twice.

**Take one site end to end before starting a second.** Resist running detection across all of
them at once — the first site is where you learn what these checks get wrong about *your*
stack, and fixing that once makes the rest quick.

**Order by client activity, not by size.** The site whose owner is in the CMS this week gives
the fastest feedback on whether the grouping actually makes sense to someone who is not a
developer.

Per site: clean tree and everything pushed, audit read-only, read the findings before
choosing a scope, fix, diff the build, deploy, click through the CMS, re-render the guide.

---

## What this does not cover

This is the **detection** half: how to point the current checks at an old site, what each
finding means, and the order to repair them in. The deeper repair procedures — restructuring
a CMS so a non-developer can navigate it, deciding what belongs in a group, migrating stored
values in bulk — live in [site-runbooks](https://github.com/nurkamol/site-runbooks), which
calls these same scripts rather than restating them.

For building a CMS that does not develop these problems, read `stacks.md` §4 before wiring
one.
