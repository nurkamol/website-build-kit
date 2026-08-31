# Changelog

## 2026-09-01i — the redirect map nothing had ever checked

Everything still open, closed. Four of the five are small; one is not.

### `npm run check:redirects`

`redirects.mjs` **proposes** a map from the old site's inventory. Nothing had ever checked the map
a human then edited — and the editing is where the mistakes are, because a redirect file is the one
migration artefact written by hand, in bulk, under time pressure, about URLs nobody can see any
more. 298 lines of generator, zero lines of validation.

⚠ **Every failure it catches is invisible at deploy.** The file parses, the site builds, the pages
are fine. What breaks is a URL that used to rank, weeks later, in somebody else's analytics.

| | |
| --- | --- |
| **Duplicate source** | Cloudflare takes the **first** match and ignores the rest, silently — so the later rule, usually the one somebody added deliberately to fix something, never fires, and the fix appears not to work for reasons nothing explains |
| **Self-redirect** | `/a → /a`, stopped by the browser after ~20 hops. The page is simply gone, and only in production |
| **Loop** | The same with a step to hide it — and detected **across trailing-slash forms**, which is the one nobody spots by eye |
| **Unsupported status** | `_redirects` accepts only 200/301/302/303/307/308 |
| **Chain** | A warning: a redundant round trip on every visit, and Cloudflare resolves one hop per request |

Two things that would have made it wrong:

- ⚠ **Split on runs of whitespace, not a single space.** Columns in a hand-edited file are aligned
  with spaces, and a naive split reports every aligned rule as malformed — on a real migration,
  *all of them*.
- ⚠ **Walk the whole path before deciding what it is.** The first version announced a loop as a
  chain *and then* as a loop — two messages, the wrong one first. There is a case pinning that it
  no longer does.

Validated against the four shipped sites that have a map — 18, 21, 48 and 34 rules — **no false
positives**, and the fifth correctly reports having no map at all.

### The rest

**`check:drift` now runs in `build:production`.** It existed but only ran when somebody thought to
run it, which is the exact failure it was built for. It exits 0 whatever it finds.

**Reusable components in the CMS recipe**, because ⚠ every copy of a repeated schema is another
place to forget a key — and a forgotten key is deleted on the client's first save. One definition
cannot disagree with itself.

**Per-page SEO fields**, with the two dangerous ones held back: ⚠ `noindex` and a canonical
override can **delist a site silently** — pages render, build passes, traffic goes to zero over
weeks. Never beside ordinary copy where somebody can toggle one while editing a paragraph.

**And the sentence the README section was missing:** *Neither was found by looking. Both were found
by accident, months later.* The instinct on reading that section is *I would have noticed*. Nobody
did, on a site being actively worked on.

**149 cases across 22 gates, 86 proving a refusal.**

## 2026-09-01h — 0.1.17, navigation becomes a CMS field, because the build can now check it

`stacks.md` said *"keep nav, redirects and structured data OUT of the CMS"*, for a good reason: a
typo'd path gives a menu item that renders perfectly and 404s only for a visitor.

⚠ **The result was navigation missing from all five audited sites.** Every client had to ask for a
menu change — the second most common request after changing text. That is not a rule being
respected; it is a gap the rule creates.

**The answer is not to forbid the field, it is to verify it.** `check:cms` now resolves every
internal path in CMS-managed data against the routes in `src/pages` — before the build, while
somebody is still looking at the config — so a bad value fails rather than publishing. The property
the rule protected is kept; the gap it caused is not.

**Not `dist/`, and not the sitemap.** `check:cms` runs before the build, so `routesFromPages()`
reads the page tree directly. Failing while the config is open beats failing after a deploy.

⚠ **A DYNAMIC ROUTE IS A PATTERN, NOT A ROUTE.** `[slug].astro` serves every legal page, so
treating routes as literal strings reports most of a real site as broken — the failure that gets a
check switched off within a day. **Verified against five live sites carrying up to twelve dynamic
patterns each: zero false positives**, and it still fires on a genuinely unreachable path.

⚠ **My own first test case asserted the wrong thing** and failed: it claimed `/prices/` was broken
in a fixture that had a `[slug]` catch-all, which would have been asserting the check is *wrong*.
The corrected case uses a two-segment path the catch-all cannot serve. A test that has to be
loosened to pass is usually telling you something.

**External links, `mailto:` and `tel:` are left alone.** `verify` checks those against the deployed
site, where they can actually be resolved; guessing here is exactly the false-positive machine this
was trying to avoid.

**Redirects stay out**, unchanged and for the sharper reason: a client toggling one off is silent
traffic loss with no visible symptom anywhere, and there is no equivalent way to make that
unrepresentable.

**140 cases across 21 gates, 81 proving a refusal.**

## 2026-09-01g — 0.1.16, something that speaks to the sites already shipped

Every gate in this changelog protects the next project. ⚠ **The template is copied, not linked, so
a delivered site receives none of them** — and there are delivered sites. That is what these three
are for.

### `npm run check:drift`

Ten rows, **reported and never fixed**, exit 0 whatever it finds: drift is a decision waiting to be
made, not an error, and a tool that edits before you have read its findings is a surprise rather
than a tool. `--json` for several sites at once.

⚠ **It does not re-implement the other checks.** Where the kit ships one, drift means *not having
it*, so it looks for the file. Copying the logic in would leave two implementations free to
disagree — the failure this entire round was about. It analyses only what nothing else covers:
AVIF, HEIC, silent skips, binary source files, hardcoded images.

Run against two live sites it separates them properly — **4 of 10 behind** on one that has had work
this week, **8 of 10** on one that has not.

⚠ **Two false results, caught before shipping, both of the kind the source document warns about:**

- it reported the kit's own template as behind the kit, because the template carries no stamp — the
  scaffolder writes one into the *copy*. A false positive on the first run is how a report teaches
  people to ignore it
- `avif` matched a **comment**. A pipeline with AVIF turned off still documents how to turn it on
  (`Set FORMATS to ['webp'] to turn AVIF off`), so a bare string search reports the opposite of the
  truth on exactly the sites this exists for. It reads the `FORMATS` declaration, and both
  directions are pinned by cases

### Hardcoded images, in `check:cms` and in the drift report

A sentence in a config saying *"photographs are chosen in code"* covered the fields that existed
and excused the eight that did not. **The client opened the page, saw a photograph, and had no way
to change it.** Nothing was broken; the only symptom was somebody looking for a field that was
never there.

⚠ **The naive version returns form fields, icon names and `<meta name="viewport">`** — fifteen hits
where the truth is zero, and a check that cries wolf on a form field is switched off before it
finds a photograph. `name=` counts only on an image component; expressions never match, which is
the point. Verified against exactly those four false positives, and it finds **0 on one live site
and 4 on another**.

The scan is a lib, and so is the binary-file detection, because `check:binary` and `check:drift`
both need them and two copies would drift.

### `/media-audit`

Detect → report → ask → fix, and ⚠ **never a menu before there are findings**. *"Shall I fix your
images?"* is not a decision anybody can make; *"your pipeline emits WebP only and your 94 images
are 19% larger than they need to be"* is. Four routes with a recommendation, and the reminder that
fixing everything a report listed is how a working site breaks.

**136 cases across 21 gates, 80 proving a refusal.**

## 2026-09-01f — the failure no accessibility runner can see, and the README that never mentioned drift

### `npm run check:contrast`

⚠ **axe and pa11y report a flat ~1.01:1 for text on a photograph**, because neither composites a
transparent element over the pixels behind it. So the failure is invisible to `a11y`, invisible to
the build, and invisible to the client who swapped the photo — which is what forces the bad choice
between letting them change a header image and refusing to let them choose at all.

It composites the scrim in code over the generated image and takes **per-channel extremes, not the
average** — an average hides exactly the highlight that breaks a word. Both extremes, because light
text fails against a bright pixel and dark text against a dark one, and a check that knows only one
is half a check.

**The interesting result was the opposite of the fear.** Reproduced here on a hostile near-white
frame:

| | |
| --- | --- |
| 82% scrim, white text | **11.43:1** — cannot fail |
| the same frame, scrim weakened to 20% | **1.62:1** ✗ rejected |

⚠ **The danger is never the photograph. It is a weakened scrim.** On the site this came from, two
of three regions could not fail at any photograph; the single exposure was a scrim lightened from
92% to 62% so a client's photography could show its colour. **This check is what makes weakening
one safe to do.**

**The regions are declared, never detected.** A region is a box, a scrim strength and a text
colour — all design, and ⚠ *this template has no design*. So the kit ships the measurement and the
format, and exits 0 saying so when a project declares none.

⚠ **The first version imported `toImageKey` from `src/lib/image-key.ts`, which a `.mjs` script
cannot load** — `ERR_MODULE_NOT_FOUND`, found by running it. Copying the function in would have
left two implementations of one mapping free to drift, which is the failure this entire round was
about. It asks for a manifest key instead and says so when handed a picker path.

Production only: it measures generated images, and staging is often built before `npm run media`
has caught up.

### The README never told anyone that fixes do not reach them

Verified before writing: no mention of drift, "already built" or "existing project" anywhere —
only one clause buried in a bullet about a script. So a reader learned the kit has gates, traps and
a pipeline, and never learned **none of them reach a site already built**.

There is now a section that says it, names the cost in the two concrete forms it has taken —
images 19% larger for weeks, and a source file that `git diff` shows only as `Binary files differ`
— explains where the version stamp lives, and gives the honest answer about what to do today: copy
the checks in and run them, expecting them to fail. **Five audited sites, five failures.**

**130 cases across 20 gates, 80 proving a refusal.**

## 2026-09-01e — the provenance gate had a hole in itself

Three from the backport's round 3, and the first one is about this repository.

### `npm run check:binary` — the file the gate cannot see

⚠ **`CLAUDE.md` already records that a literal NUL makes a source file binary and therefore
invisible to `grep -I` — and the provenance sweep is written with `grep -I`.** The one file that
defeats the gate is the one file the gate cannot see. It carried a client's entire brand, both
typefaces and a base64 palette, for two commits.

The round-1 fix was to *that file*. Nothing was added that would catch the next one.

What makes it worth a check is that the tools fail **quietly**: `grep` returns nothing and exits 1,
exactly as it does for no-match; `git diff` says only `Binary files differ`, so changes never
appear in review.

⚠ **And the obvious implementation is a check that always passes.**
`git grep -I --files-without-match ''` reads like the answer and prints nothing either way. Asking
git for its tracked files, asking again for the ones it can read as text, and taking the difference
is what actually works — with one correction the source doc did not have: **`git grep ''` matches
LINES, so a zero-byte file has none and is reported as binary.** Excluded by size.

Verified in both directions before being trusted, and in CI from now on. Four cases, including one
that refuses to pass when git reports no files at all.

### The client guide that starts lying

A guide written when the CMS had six entries had thirteen by the time anyone looked. That is the
mild half. The serious half is that it still said the address and phone number *"are not editable"*
— which stopped being true the day those moved into the CMS. **A client reading that either asks
you to do something she can do herself, or assumes her address updates everywhere on its own,
because the document told her the site owned it.**

`check:cms` now warns when a CMS section is never named in `docs/handover.md`. A warning, because
what the guide says is a judgement and an omission can be deliberate.

⚠ **Writing it turned up something worse than the check catches:** none of the audited shipped
sites has a `docs/handover.md` at all. The one document the kit writes for the client is not
reaching clients.

### `md-to-pdf` assumed a dependency it never declared

It said Chrome "comes from puppeteer, which arrives as part of pa11y-ci — already a
devDependency". True only while that is so. Run pa11y as `npx --yes pa11y-ci` — which a project
reasonably might — and puppeteer is never installed. A fork that did exactly that hunted for one in
`~/.npm/_npx`, found a stale copy whose Chrome would not launch, and timed out after thirty seconds
with nothing pointing at the cause.

It now imports puppeteer dynamically and says what is wrong and how to fix it. **A script whose
dependency is a side effect of how you happened to run a different script is a script that breaks
later, on someone else's machine, for reasons that look unrelated.**

**126 cases across 19 gates, 78 proving a refusal.**

## 2026-09-01d — a site can finally say which kit it came from

⚠ **The template is copied, not linked.** Nothing the kit fixes afterwards reaches a site already
built — not a trap, not a gate, not a pipeline change. Every gate in this changelog protects new
projects and **no existing one**, and until now nothing anywhere said so.

The cost is already paid: a shipped site sat **19% behind on every image for weeks** after AVIF
landed, and it surfaced only because somebody happened to read both trees for an unrelated reason.

The scaffolder now stamps the new site's `package.json`:

```json
"name": "mysite",
"version": "1.0.0",
"websiteBuildKit": { "version": "0.1.15", "scaffolded": "2026-08-31" },
```

Three decisions inside that, each of which could have gone the other way:

- **`package.json`**, not a dotfile or `BUILD-STATE.md` — it is the file a developer opens first
  and the one nobody deletes. Placed straight after `version` so it is visible without scrolling
  past the dependency list.
- **The version, not the commit.** Every release is tagged, so this resolves to a commit in one
  lookup — and embedding a commit would let the packer's git state decide what ships, which is the
  same class of problem `prepack` was just fixed for.
- **Never updated after scaffold.** It records where the site came *from*. A stamp that tracked
  something else would be describing a link that does not exist.

Verified from a packed tarball rather than the repo — `create/template` only exists between
`prepack` and `postpack`, so running the CLI in place fails by design. The scaffolded
`package.json` gained exactly one key, lost none, and its scripts and dependencies are
byte-identical to the template's.

**This is half of roadmap item 1.** The other half — a `kit:check` diffing a project against its
stamped version's tag — is only now worth building, because there is finally something to diff
against.

## 2026-09-01c — 0.1.15, the tolerant reader, and the check it made necessary

Round 2 of the media backport, and it corrects something **I shipped two days ago**.

⚠ **`<Img>` accepting both a manifest key and a picker path is necessary — and it is the
dangerous half.** `type: image` is built around the PATH: the picker returns one, the thumbnail
loads one, the repo link resolves one. Convert a field to `type: image` without migrating its
stored values and the site is unaffected, because the reader is tolerant.

On a real build that meant **eighteen grey squares in the editor** and a repo link 404ing, while
the build was green, `astro check` clean, pa11y clean, and the rendered HTML **byte-identical**.
Every automated check said the site was fine. *The CMS is not a page, so nothing that renders the
site can see it.*

> **A reader that accepts two formats cannot tell you which one you stored.**

**`check:cms` now validates the stored value against the declared field type** — every
`type: image` value must be a path under that media source's `output`. It is the only check that
looks at the *editing* surface rather than the rendered one. Against the five audited sites it
found key-form values sitting in image fields on getmiohome (`heroes/home.jpg`,
`services/landscaping.webp`) that nothing else could see.

⚠ **And it was too noisy at first** — 78 problems for three fields, because a collection of thirty
items reported the same bad field thirty times. A gate that floods is a gate that gets switched
off, and the fix is one edit for the whole field either way. Now one problem per field with sample
values: **78 → 12**.

⚠ **The check itself shipped a `ReferenceError` for exactly one run.** `const mediaByName` was
declared below its first use — a temporal dead zone error that `node --check` passes, which is the
class already documented in `CLAUDE.md` from `recon`. Caught by running it, not by reading it.

### Also from the round

**Every image on a page is a field, or a stated exception.** A sentence in the config saying
"photographs are chosen in code" covered the five fields that existed and quietly excused the eight
that did not — a header band, four class tiles and a gift-card picture, all string literals in
`.astro`. The client opened the page, saw a photograph, and had no way to change it.

**Alt text defaults from the shared data.** A required `alt` prop means every page passes one,
which on one site was the same sentence hardcoded twenty-one times: a correction meant twenty-one
edits, and any missed one was an inconsistency only a screen-reader user would meet.

**120 cases across 18 gates, 76 proving a refusal.** Documented failures: **37** — the landing page
and both share cards regenerated to match.

### Deliberately deferred

**A composite-contrast check** (`check-contrast.mjs`) is the most interesting thing in the round —
axe reports a flat 1.01:1 for text over photographs because no runner composites a transparent
element over an image, and measuring it off rendered pixels turns "do not let clients choose
photographs" into a checkable guarantee. It needs a rendering pipeline and is its own piece of
work, not a line in a release.

**Drift detection**, which the round argues is worth more than everything in it: a project forked
from this kit sat **19% behind on every image for weeks** and nothing surfaced it. A version stamp
in scaffolded sites is the cheap first half, and it is next.

## 2026-09-01b — the two things that made every CMS build diverge

Both root causes, both documentation, **no runtime change to anything a deployed site does**.

**1. The kit gave nobody a starting `.pages.yml`.** Zero references mentioned the file. So five
shipped sites meant five people writing a config from a blank page — and all five diverged, and
all five failed `check:cms`. `stacks.md` §4 now carries a worked one: a `file` entry declaring
every key including nested, a collection with an image field and its alt text beside it, media
pointed at the pipeline's input with `extensions` set, and grouping by what the business
recognises rather than by `src/content` and `src/data`.

It is a shape to start from, not a config to copy — the content model has to follow the actual
site, and an empty section reads as broken.

**2. `handover.md` mentioned a CMS zero times.** The client received a site with a content editor
and no instructions for it, which is most of what "confusing" meant. It now has an **Editing it
yourself** subsection, written for the business owner rather than a developer: where to sign in,
what each section changes, that a change is live in minutes and how to confirm it in a private
window, how to upload a photograph and why the description beside it matters.

⚠ **Including the sentence that actually reduces support calls:** *you cannot break the website
from here.* A bad change means the previous version stays live and the new one does not appear —
not that the site goes down. An editor who does not know that treats every uncertainty as a
reason to call, or worse, not to touch the site at all.

Every field in it is a ⚠ placeholder, because a blank left in reads as a completed answer.

### Deliberately not taken

⚠ **§4's "refactor `business.ts` into a CMS-fed adapter" is the one to refuse.** It is the single
most load-bearing file in every site built from this kit — the header, the footer, every
call-to-action, the notification emails and the JSON-LD all read it. Rewiring it to a CMS is a
breaking change to every project for a benefit that a `.json`/`.ts` split already delivers.

Nav and redirect managers, the page builder, and the Keystatic/Sanity/Payload implementations
remain out for the reasons already recorded.

## 2026-09-01a — what a client may edit, and what they must never see

Took the rest of the usable half of the CMS proposal. Doc-only except two new **warnings** in
`check:cms`, both of which found real things on shipped sites.

**A five-way classification, and one question that decides it.** Editorial content · editorial
configuration · design · technical configuration · **secrets**. The question is not technical:

> Would a reasonable non-technical owner expect to update this after handover?

⚠ **And if a value that fails that test lives in the same FILE as one that passes, the file is the
problem.** getmiohome.com had `analytics` sitting in the same `site.json` as the business name —
the client never had to touch it for it to be deleted.

⚠ **Never expose `robots.txt` or a raw redirects file to a client.** A CMS can edit any file in
the repo, which makes this easy to do and impossible to notice: a client who blocks the site sees
no error, no broken page and no failed build. Traffic simply stops, and the cause is a file nobody
re-reads.

**Fields are part of the deliverable.** Label in the client's language; constrain rather than
describe, because a failure a field cannot represent cannot happen; describe only where genuinely
ambiguous, since noise trains people to skip the descriptions that matter. And ⚠ **never derive
alt text from a filename** — `DSC_0481` and `hero-final-v3-USE-THIS` are what filenames actually
look like, and a plausible wrong alt is worse than none because a reviewer scrolls past it.

### Two warnings, because the complaint was real

**Content no CMS entry points at.** *"Whole sections are missing"* was the report from delivered
sites, and it is checkable. On the five audited, **navigation was absent from all five** and
testimonials from four; one had an **entire `src/content/services` collection the client could not
edit**. A warning, never a failure — what belongs in a CMS is a judgement, and a gate that insists
otherwise gets switched off.

**Fields shaped like technical configuration.** It found `gtmId` exposed as an editable field on a
live site: a client can change it, nothing validates it, and the failure is silent.

⚠ **The generated-file exclusion started as a two-name list and immediately produced a false
positive** on a project's `media-manifest.json`. That is the denylist problem in miniature, in a
repo whose own `CLAUDE.md` warns about it — now matched by shape, `*manifest.json`.

**118 cases across 18 gates, 75 proving a refusal.**

**Still not taken, and why:** the nav and redirect managers (`stacks.md` forbids both — a bad
redirect should fail the build, not publish), the page builder (its blocks map to Astro components
the template deliberately does not ship), and the Keystatic/Sanity/Payload implementations (not
deployed on a real project). The nav rule is worth revisiting on the evidence — 5/5 is a gap, not
a rule being respected — but overturning it is a decision, not a cleanup.

## 2026-08-31a — the CMS was quietly deleting client content, on live sites

Audited the `.pages.yml` of **five shipped sites. All five failed.**

| | |
| --- | --- |
| getmiohome.com | `site.json` — **every analytics ID**, `openingHours`, `businessType`, `socials.google` |
| nag-global.com | homepage images in **three languages** — `cta.image.*`, `quote.image.*` |
| arnicadentalclinic.com | `lang` on every news post |
| inner vision pilates | uploads pointed at `public/img` **×2** |
| implantwide.com | uploads pointed at `public/img`, no `extensions` |

⚠ **Read the first row again.** The moment that client opened Site Settings and pressed save,
every analytics ID was deleted. Tracking stops, opening hours vanish from the JSON-LD, and
nothing reports it — in the diff it is an ordinary content commit. **27 keys were at risk.**

A CMS rewrites the whole file from its schema, so anything the schema does not declare is absent
from what it writes back. Every one of those configs was **valid YAML with paths that all
resolved**. That is the difficulty: the config is not wrong, it is *incomplete*, and nothing in a
build can see the difference.

**`npm run check:cms`** refuses a config that does not declare every key in the files it edits —
nested keys included, because `analytics` being declared while `analytics.gtmId` is not is exactly
the shape that cost getmiohome its tracking. It runs before the build in both environments and is
a no-op with no `.pages.yml`. Nine cases; mutation-tested four ways.

**And uploads were pointed the wrong way round.** `optimize-media.mjs` **reads** `media/source/`
and **writes** `public/img/`. Two sites uploaded into the output, where a file is servable but has
no variants, no width/height and no manifest entry — so `<Img>` throws and *the client's own edit
turns the build red*. The gate refuses it and explains the direction.

### The media pipeline, from a second backport

- **HEIC is accepted.** libvips in the sharp this kit already ships reads it; our own regex was
  discarding the single likeliest wrong format — a photo straight off an iPhone — with no output,
  no warning and no manifest entry.
- **Nothing is dropped in silence.** The run now names every file that produced no image. A `.txt`
  or a comp PDF in `media/source/` is legitimate, so it is a report, not an error.
- **One bad file no longer aborts the run.** There was no try/catch, so a corrupt upload threw
  midway — after outputs were written and the manifest was partly updated, leaving the manifest
  describing a state on disk that no longer matched it.
- **Oversized sources are flagged**, saying explicitly that the *site* is unaffected and the cost
  is the repository — otherwise someone fixes a page-speed problem that does not exist.

**`toImageKey()` makes a CMS image field a real picker.** A picker returns
`/img/photos/hero-1200.webp`, never `photos/hero`, so every image field had to be a free-text box
asking a non-technical editor to type a manifest key from memory — a quiz, not a field. The
mapping back is exact because the pipeline writes exactly one shape. Which variant the editor
clicks does not matter, and a key ending in a digit survives.

⚠ **`optimize-media.mjs` resolved paths from the SCRIPT's location**, alone among the template
scripts. Identical in every supported flow, and it meant the script read its own `media/source/`
wherever it was pointed — so the run that added a non-zero exit had nothing able to prove the exit
fires. Now the cwd, like everything else. **The mechanical coverage ledger caught this**, not me:
it noticed a script had gained an `exit(1)` with no case behind it.

⚠ **A thrown error string must be pure ASCII.** The Cloudflare adapter puts a prerender failure
into the `x-astro-prerender-error` **HTTP header**; non-ASCII warns about a browser `TypeError`
and arrives mangled — an em dash came back as `â`, in the one message whose entire job is telling
somebody what to do. Recorded on the existing error-string trap rather than as a new entry, so the
documented-failure count stays honest at 36.

**116 cases across 18 gates, 75 proving a refusal** — from 105/16/67.

## 2026-08-30n — 0.1.14, "needs a deployed site" was the wrong reason, on every entry

**And cutting this release caught a packing bug that had nothing to do with it.** The file count
moved 97 → 98, and the extra file was `template/docs/handover.pdf` — generated by
`npm run handover`, ignored by `template/.gitignore`, and copied into the package anyway, because
that ignore file is renamed to `gitignore` for publishing and npm then stops honouring it.

`prepack` was filtering with a hand-maintained denylist, which had never heard of it. This one was
the placeholder document, so nothing leaked. **The same path ships a real client's rendered
handover from any machine that has run the command.** `prepack` now copies what `git ls-files`
reports: if the repo does not track it, it is not part of the template, and a published package
should never depend on which commands happen to have been run on the packer's laptop.

`verify.mjs` is **1,069 lines deciding go-live** across eleven sections, with three `exit(1)`
paths and **not one case proving any of them still fired.** It sat in the `UNCOVERED` ledger
behind the reason *"needs a deployed site or a live zone"* — which had been copied from the first
script it was written for and never re-examined.

Sorted honestly, that reason was wrong for every entry:

| | Actual blocker |
| --- | --- |
| `shots`, `check-console`, `check-reflow`, `check-a11y`, `a11y-evidence`, `md-to-pdf` | a **browser**, which can point at localhost perfectly well |
| `dns-snapshot` | genuinely a live zone |
| `indexnow` | submits to real search engines |
| **`verify`** | **neither — it takes a URL** |

⚠ **A wrong reason in a ledger is worse than a missing entry, because it reads as a decision
somebody made.** Nobody revisits a line that looks considered.

**`scripts/fixture-site.mjs`** serves a deliberately faulty site on localhost. The clean fixture
passes **all 32 checks and exits 0**, and every fault is paired against it — a suite that only
ever sees a broken site cannot tell *"this check works"* from *"this check always fires"*.

**Three of my own expectations were wrong, and the harness said so rather than being loosened
until it agreed.** A second `h1` is a **warning**, not a failure. A preserved path landing on the
homepage warns, and the exit code comes from the redirect rule. And a canonical pointing at
another host **correctly passes**, because verify deliberately relaxes canonicals against a
localhost origin — *"expected on a local preview of a remote build"*. That check therefore
**cannot** be covered from here, and the gate block says so rather than letting a green tick imply
otherwise.

**It also closed recon's last untested path** — the redirect refusal, which needs a real server
issuing a 302. Finding somewhere to put it was the lesson: the preserved-path checks and the
sitemap probes all pass `redirect: 'manual'`, so the hop loop never runs there, and sitemap URLs
are written to `urls.txt` without being fetched at all. **Three plausible-looking places exercise
nothing.**

⚠ **And writing that case found a dead hint still in the code.** The refusal note ended *"Re-run
with `--allow-internal` if that host is yours"* — on a `file:` redirect, which that flag can never
excuse. The startup message had been fixed for exactly this a release earlier; the note had not.
It now only offers the flag for a host refusal.

**105 cases across 16 gates, 67 proving a refusal** — from 91/15/57. Mutation-tested four ways:
making the route, empty-submission and cross-origin checks always pass, and silencing recon's
refusal, each fails the one case meant to catch it.

## 2026-08-30m — 0.1.13, Actions get version updates, npm does not

**Version updates is not one decision — it is two ecosystems, and they are nothing alike.**

| | | |
| --- | --- | --- |
| `github-actions` | 5 actions, all first-party `actions/*`, all pinned to a major tag | **on** |
| `npm` | 593 packages, and the lockfile is a *shipped artefact* | **off** |

Five actions on major tags means a PR only ever appears on a **major** bump — roughly five a
year, each tested by `kit.yml` on ubuntu and windows before anyone looks. 593 npm packages, in a
lockfile copied into every site built from the kit, is a change to what users *receive*; that
needs a judgement and the full gate suite, not a queue.

**The failure it prevents:** GitHub has forcibly retired action runtimes before — the Node 12 and
Node 16 deprecations. CI is this repo's entire quality signal, and finding out it has gone stale
from a red build during a release is the wrong moment.

⚠ **npm SECURITY updates stay on.** They live in repo settings, not in `dependabot.yml`, and this
file does not disable them. What is declined is routine churn, never the vulnerability signal —
a distinction worth stating, because a reader seeing "npm absent" will assume otherwise.

**And the unfixable advisory is now proven unfixable, not asserted.** `template/docs/dependencies.md`
said "no patched version" on the advisory's authority. Checked against the registry instead:

```
npm view extract-zip versions   →  … 2.0.1        ← the newest release IS the vulnerable one
last published                  →  2023-03-04     ← unmaintained for ~3.5 years
```

That matters because `overrides` in `package.json` is the usual escape hatch for a transitive
pin — and it is only useless here because **there is no version to point it at.** "No patch
available" and "we checked every version ever published" are different claims, and only the
second one closes the question.

## 2026-08-30l — the audit finding every site inherits, answered once

Dependency graph, Dependabot **alerts** and Dependabot **security updates** are on. Version
updates deliberately are **not**: 590 packages would be constant churn, and here the lockfile is
a *shipped artefact* — every bump needs the full gate suite before it is safe.

**The reason this matters for a kit rather than an app.** `template/package-lock.json` is copied
into every site scaffolded from it. A future CVE in `astro`, `wrangler` or `sharp` lands in every
site built after that day, and until now **nothing would have told anybody.** That is the kit's
own silent-failure shape, pointed at the kit.

`kit.yml` already declares `permissions: contents: read` and uses no secrets — exactly what a
Dependabot PR is given — so its PRs get properly tested rather than failing on missing
credentials.

**And there is one finding that cannot be fixed, so it is documented instead.**
`template/docs/dependencies.md` covers [GHSA-jmr9-qjv8-65gv] — `extract-zip`, CVSS 8.1, reached
through `pa11y-ci → pa11y → puppeteer → @puppeteer/browsers`. Three checkable reasons it stays:
its `first_patched_version` is **empty**, `npm audit fix` reports `+0 ~0 -0`, and `puppeteer`
pins `@puppeteer/browsers` at an **exact** `2.13.2` rather than a range.

Production dependencies report **zero**, nothing under `src/` imports it, and a production
install does not pull it — which makes it low risk, *not* fine, and the note says so in those
words.

⚠ **`npm audit` and Dependabot disagree on the count and both are right.** npm prints one row per
affected package in the chain (six); GitHub prints one per advisory (one). A reader who assumes
six separate holes will escalate something that is not there.

The note ends with the wording to give a client, every clause of it checkable by two commands —
and an instruction to **delete the file** when a patch ships, because a note describing a problem
that no longer exists is worse than no note.

[GHSA-jmr9-qjv8-65gv]: https://github.com/advisories/GHSA-jmr9-qjv8-65gv

## 2026-08-30k — 0.1.12, the hop cap was not a security property

Following redirects by hand is what lets every hop be checked. **The hop LIMIT is not part of
that**, and 0.1.11 shipped one of 5 where `fetch` itself allows 20.

Measured against a server issuing a seven-hop chain:

| | old | 0.1.11 |
| --- | --- | --- |
| 1 hop | 200 | 200 |
| **7 hops** | **200** | **302** |
| no redirect | 200 | 200 |

So a live page behind a long chain was recorded as a **redirect rather than a page**. In a
migration inventory — the document every later routing decision reads — that is the kind of wrong
that reads as fine. Nothing errors, nothing is empty, the number is simply not the truth.

Raised to 20. Parity restored on every case, and the crawl output is identical to 0.1.10 again.

⚠ **The lesson is the shape.** A security change arrived bundled with a tuning constant, the
security part was scrutinised, and the constant rode along unexamined because it sat inside the
same block. Ask of any borrowed limit: *is this the property I want, or a number that came with it?*

## 2026-08-30j — 0.1.11, recon refuses to crawl inward, and says so

The kit's first outside contribution ([#1], by [anupamme]), and the reason it is worth
reading twice.

**The hole was real.** `recon` crawls a site we do not control, and it followed redirects. A
302 the old site issues could therefore steer the crawler at whatever is reachable from the
operator's machine — a dev server on `127.0.0.1`, something on the office `10.` range, the
cloud metadata endpoint at `169.254.169.254`. The guard blocks loopback, RFC1918, link-local
and `localhost`, on the target **and on every redirect hop**.

⚠ **A REFUSAL MUST NOT LOOK LIKE A NETWORK ERROR.** The original guard threw inside `req()`'s
existing `try`, and that `catch` returns `null` — which every caller reads as *"the old site did
not answer"*. A refused crawl would have been reported as an unreachable site: thin inventory,
exit 0, nobody learns pages were skipped on purpose. Refusals now print and land in the
end-of-run notes, deduplicated by reason. *The security fix was right and would have been
invisible.*

**It only sees literal addresses, and the comment now says so.** A hostname that *resolves* to
loopback walks straight through — `localtest.me` is a public name pointing at `::1` today.
Closing that needs resolution-before-connect with a pinned socket, which `fetch` does not
expose. Defence in depth, not a barrier; a comment implying otherwise is worse than none.

Two holes closed while writing that sentence down:

| Was allowed | Why it looked handled |
| --- | --- |
| `::ffff:127.0.0.1` | Node canonicalises IPv4-mapped IPv6 to **hex** — `[::ffff:7f00:1]` — so a blocklist in dotted quad never matches. Stripping the literal `::ffff:` prefix looks like it works |
| `file:///etc/passwd` | `target.startsWith('http')` turned it into `https://file:///etc/passwd`, which parses with hostname `file`, so the protocol check could never fire on a target the user typed |

That second fix also repairs a **latent crash**: `npm run recon -- httpbin.org` threw an
uncaught `TypeError`, because the string starts with `http` and is not a URL. Same family as the
`PRESERVED is not defined` that shipped — valid syntax, wrong at runtime, only on real input.

**`--allow-internal`** covers the real case of an old site on a VPN. It excuses a **host**, never
a **protocol**: offering it for a `file:` URL would be advice that cannot work.

**recon leaves the `UNCOVERED` ledger.** Its refusals happen before the first fetch, so every
path it can exit 1 on now runs offline — usage, a blocked host, a blocked protocol. 14 cases,
covering each encoding Node folds (`127.1`, `2130706433`, `0177.0.0.1`, `[0:0:0:0:0:0:0:1]`) and
both sides of the RFC1918 boundary, where `172.15` is public and `172.16` is not. Mutation-tested
four ways.

⚠ **The redirect refusal is still uncovered and cannot be tested offline** — it needs a real
server issuing a 302 inward. It does not exit 1, so the ledger does not demand it, and the gate
block says so rather than letting a green tick imply otherwise.

Verified against a live crawl: **byte-for-byte identical output** to the previous code, and
nothing in `recon` reads `res.url` or `res.redirected`, so swapping fetch's `follow` for a manual
loop changes nothing observable. **91 cases across 15 gates, 57 proving a refusal.**

[#1]: https://github.com/nurkamol/website-build-kit/pull/1
[anupamme]: https://github.com/anupamme

## 2026-08-30i — 0.1.10, the honeypot is called `company`

From the one shipped site whose lessons live in code comments rather than a trap file:

> ⚠️ `companyName`, NOT `company`. `company` is the HONEYPOT

⚠ **THE KIT'S OWN TRAP FIELD IS NAMED `company`,** and `api/contact.ts` discards any submission
that fills it in — **silently, with a 200**, so a bot learns nothing:

```ts
if (input.company) return wantsHtml(request) ? seeOther(FORM_PAGE) : json({ ok: true }, 200);
```

Add a real "Company" field to that form — which a B2B site eventually asks for — and **every
enquiry from a company that types its name is thrown away.** Thank-you page renders, nothing
stored, nothing logged. It is `check-secrets` again: leads vanishing while the site looks like it
is working. Except this one arrives as an ordinary client request rather than a mistake.

**`npm run check:form`** fails the build when two controls share a `name`, and says which case it
is: the honeypot collision, or a plain duplicate where the second value overwrites the first in
`formData`. It runs **before** the build, in both environments — nobody ever meant two fields to
share a name.

**It reads the source, not `dist/`.** The contact route is `prerender = false`, so the form is not
in the build output at all. Reading the component catches it before a deploy, which for a lead-loss
bug is the difference that matters.

**The honeypot keeps its name.** It has to look plausible to a bot, and every plausible name —
`company`, `website`, `fax`, `url` — is a field some real form wants. Moving the trap moves the
landmine; the check does not depend on guessing which name nobody will need.

⚠ **AND MUTATION FOUND A DEAD LINE IN THE CHECK ITSELF.** It carried a guard skipping names
containing `{` or `$`, for expression-built fields. Deleting it changed no test — because the regex
only captures **quoted** values and Astro writes expressions unquoted, so the guard could never
fire. Worse, it would have wrongly skipped a real literal like `name="f-{i}"`. Removed, with the
reasoning moved to the regex. *A test that passes for the wrong reason is the thing mutation
testing is for.*

Six cases, four of them exclusions. **77 across 14 gates, 43 proving a refusal.**

## 2026-08-30h — 0.1.9, one layout change and three things written down

**Exactly one functional change reaches the package.** `PageHero` no longer carries
`.section--tight` and sets `padding-block-end: 0`. The other four touched files —
`Header.astro`, `tokens.css`, `global.css`, `wrangler.jsonc` — are comments.

`.section--tight` is a **shorthand**, setting `padding-block` at both ends, and every page opens
its next section with a rhythm class of its own — so two stacked. **160px measured on the kit's own
`/contact/`**, 176px across four pages of a client build, up to 232px where the next section is
`.section`. The same shorthand out-specified `.under-header` and put a hero **behind the fixed
nav** — the failure `global.css` warns about in as many words.

**Written down rather than gated:** what `--header-h` holds up (four offsets, and a logo sized by
width shortens all four silently); that the Cloudflare adapter ignores `--config` exactly as it
ignores `--env`; and that on an element carrying `.under-header` you write the longhand, never the
shorthand.

⚠ **A LAYOUT CHANGE, NOT AN ADDITION.** A project whose hero is followed by a section with no
rhythm class now gets no space there. Neither template page is shaped that way — measured
`/contact/` after the change: reserve 136px, hero-end 0, next-start 80px — and it is the correct
behaviour, but it is a change.

**No existing site can be affected.** `create/` scaffolds once and has no update path; it warns
that scaffolding over an existing project is unrecoverable without git. Only new projects get this.

## 2026-08-30g — working through the rest of the shipped sites' traps

Checked the remaining candidates from two projects' trap files against **current** `master`, not
against whatever kit version those sites were built on. That distinction did the work: most were
already fixed.

**Already in the kit, verified individually:**

| A project recorded | Where the kit already has it |
| --- | --- |
| `security.checkOrigin` covers form posts but not JSON | the existing CSRF trap says exactly that, and explains why the JSON path tested fine while the no-JS path looked broken |
| `curl` without `Origin` looks like a broken no-JS path | same entry |
| `getStaticPaths` cannot see frontmatter above it | commented in `[slug].astro` at the declaration |
| `ClientRouter` and scripts not re-running | existing trap, plus a note in `Header.astro` |
| CI shallow-clones, so git history is empty | `lastmod.mjs` refuses on a shallow clone |

*A keyword sweep called `shallow` ABSENT and it was not — the helper was wrong. Every result above
was then re-checked by opening the file. A grep that answers the wrong question confidently is
worse than no grep.*

**Two were real, and both are on paths the kit sends you down.**

⚠ **`wrangler r2 object put` WRITES TO LOCAL STORAGE BY DEFAULT.** Twelve videos uploaded, every
one reporting "Upload complete", `r2 object get` reading them back at correct byte counts, and the
bucket empty the whole time. Everything agrees with itself and everything is wrong: the `r2.dev`
URL 404s (reads as a subdomain problem), the deployed worker's `bucket.get()` returns null (reads
as a binding problem). **The tell is in the dashboard: Class A operations: 0.** `--remote` on every
command meant to touch the real bucket. `stacks.md` §3 makes R2 the default past ~15 MB, so this is
squarely on the recommended path.

⚠ **Astro's `paginate()` DOES NOT EMIT WORDPRESS'S PAGINATION URLS.** It produces `/blog/2/`;
WordPress produced `/blog/page/2/`. The rebuilt page also declared a canonical pointing at the
WordPress shape — so page two existed at one URL, claimed to live at another, and the URL holding
the traffic 404'd. Clean build, no symptom, invisible unless someone requests it. Now a row in
`stacks.md` §1d beside the sitemap filename and the verification files, because **when a preserved
URL has a shape, assert the shape.**

Count moved 34 → 36; site, both cards and the repository description updated.

## 2026-08-30f — scanned five shipped sites, and mostly found the loop working

Read the trap files and components of five live builds — inner vision pilates, nag-global,
implantwide, arnicadentalclinic, getmiohome — looking for lessons the kit has not absorbed. Two
projects keep their own `traps.md`: **39 and 37 entries against the kit's 26.**

**The components had nothing to give.** Across seven projects only one component recurs that the
kit does not ship — `ServiceIcon` — and that is subject-matter art, which `Icon.astro` says
explicitly belongs to the project. Convergence there is the rule working, not a gap.

**And three of four spot-checked traps had already fed back:**

| A project recorded | The kit |
| --- | --- |
| One generator silently deleting another's manifest entries — every page shipped the same OG card for three days | `optimize-media.mjs` already carries over keys it does not own, and states the general rule |
| `_redirects` cannot match on hostname in Workers Static Assets | `runbook.md` §3a already has it, **in more detail** — with the test date, the spoofed `Host` header, and "do not re-try this" |
| Stripping JSONC comments with `//.*$` mangles every URL | `check-env.mjs`'s stripper already guards with `[^:"']`; verified it parses a config containing `https://` |

That is the answer to "what can we harvest": mostly nothing, because it was harvested already. Worth
knowing, and worth the hour to establish rather than assume.

**One real gap.** `wrangler.jsonc` warns that the adapter *"silently ignores `deploy --env`"* — and
says nothing about `--config`, which is the next flag anyone reaches for. `@astrojs/cloudflare`
builds `dist/server/wrangler.json` from the **default config path only**, so
`wrangler deploy --config wrangler.production.jsonc` either fails with *"Cannot use assets with a
binding in an assets-only Worker"* or, worked around, ships with whatever name and routes the
default file held — regardless of what was built. Found on a shipped site that needed two configs.

**The guard that project wrote was deliberately NOT taken.** It rewrites the generated config
between build and deploy, which solves a problem the kit does not have: one worker, one config, the
environment decided by the build. Importing the script would import the problem. The warning now
names `--config` beside `--env`, and says what a project that grows a second config must do.

## 2026-08-30e — what --header-h actually holds up

Swept the template for the same shorthand-versus-utility class and for anything else shipping
wrong. Two of the three candidates turned out to be nothing, and saying so is the point:

- **`404.astro` carries `class="section under-header"`** — both global, equal specificity, so
  source order decides. `.under-header` is defined *after* `.section`, so it wins. Measured at
  1440, 768 and 375px: reserve holds at 136px, the heading clears the 73px bar at every width.
  **No bug.** Checked before touching working code.
- **`CtaBand`, `Icon` and `Img` are imported nowhere.** Expected — the template ships no design
  and no images, and `astro check` type-checks them regardless.

**The real finding is what depends on `--header-h`.** Four things read it: the header's own
`min-block-size`, `.under-header`'s reserve, and `scroll-padding-top` / `scroll-margin-top` —
the last two being what stop an anchor target landing underneath the fixed nav.

⚠ **A HEADER TALLER THAN ITS TOKEN LEAVES ALL FOUR SHORT BY THE SAME AMOUNT, AND NOTHING REPORTS
IT.** On a real build a 520×227 logo sized with `inline-size: 12rem; block-size: auto` computed to
87px tall in an 88px bar — so the **logo** was setting the header's height instead of the token,
and every offset derived from it was 16px short. The hero looked fine; an anchor link landing
slightly under the nav is not something anyone files a bug about.

The template renders text, not a logo, with a comment saying to swap in an `<img>` "once the
artwork is in place" — which is exactly the moment the mistake gets made. That comment now says to
size by height and stay under the token, and gives the clamp. `tokens.css` lists what breaks if
you do not.

Guidance at the point of the mistake, not a gate: there is nothing to check until a project adds a
logo, and by then it is that project's CSS.

## 2026-08-30d — a shorthand out-specifying the utility beside it

`PageHero` carried `class:list={['hero', 'under-header', 'section--tight']}`. `.section--tight`
is a **shorthand** — it sets `padding-block` at both ends — and that produced two separate silent
failures on every project built from the kit.

**A hole under the lede.** Every page opens its following section with a rhythm class of its own,
so two stacked. **Measured 160px on the kit's own `/contact/`**, 176px on all four `PageHero` pages
of a client build, and up to 232px where the next section is `.section`.

⚠ **AND THE HERO SAT BEHIND THE NAV.** `.under-header` reserves the fixed header's height on
`padding-block-start`, and `global.css` warns in as many words that *"a scoped component style
would out-specify"* it. A shorthand from this component is exactly such a style —
`.hero[data-astro-cid-…]` at (0,2,0) against a bare class at (0,1,0) — so the reserve was
discarded. **The comment predicted the failure and the component committed it anyway.**

Build green, types green, axe green, `tells` green in both cases. A page sitting under its own nav
is visible only by looking at it.

`PageHero` now sets `padding-block-end: 0` and drops the rhythm class: the offset stays with
`.under-header`, the rhythm stays with whatever section comes next. 160px → 80px, header offset
intact at 136px.

**Not moved to `main`,** which would have been un-overridable and wrong for a different reason:
the header's background is opaque `var(--bg)`, so padding there leaves a strip of body colour
behind it wherever a first section has a background of its own. The per-section reserve is
deliberate; the shorthand was the bug.

⚠ **NO GATE FOR THIS, AND THAT IS A DECISION.** Catching it generally means analysing the cascade
— which utility class lands on which element, at which specificity — and that is a CSS analyser,
not a grep. A check that guessed would produce exactly the false positives this kit keeps refusing
to ship. It is in `traps.md`, with a grep that narrows the search rather than pretending to decide.

*And adding that entry moved the failure count, which the `audit:docs` check caught immediately:
33 → 34, updated across the six claims in `site/index.html`, both share cards and the repository
description. Built two days ago for exactly this.*

## 2026-08-30c — 0.1.8, and one outside tool earns a recommendation

**Shipping in the package:**

| | |
| --- | --- |
| `scripts/check-copy.mjs` *(new)* | author notes in rendered copy — `TODO`, `⚠ CONFIRM:`, `Lorem ipsum`, an unrendered `{{ placeholder }}` |
| `scripts/build.mjs` | runs it — warns on staging, **refuses on production** |
| `scripts/tells.mjs` | two rows: overshoot easing, a thick accent bar down one side |
| `src/styles/tokens.css` | **`--ease-spring` removed** — an overshoot curve is a look, and nothing referenced it |

⚠ **`check-copy` CAN FAIL A PRODUCTION BUILD THAT PREVIOUSLY PASSED.** That is the point, and it
is a behaviour change rather than an addition. Staging only warns, so it surfaces well before
go-live rather than at it.

**And `design.md` now recommends [`pbakaus/impeccable`](https://github.com/pbakaus/impeccable)** —
as a second opinion, explicitly not as a gate. Yesterday the provider rule blocked it: *do not add
a recommendation you have not used on a real deploy.* Today it does not, because it was run
against one: 14 findings, **9 of them matches inside code comments**, and two signals worth
keeping. The entry carries that ratio, because a recommendation without its failure rate is an
advert.

**Two held back, in Rejected so they are not re-proposed.** Style-preset skills ship named looks,
and `design.md` never prescribes a look — adopting them would put two philosophies in one build.
Animation skills are good and the author already uses several, but nothing here has shipped a
build with them, and *"we already use it"* is not the bar the rule sets.

## 2026-08-30b — notes to yourself, shipped as body copy

A real build put this on a service page, as text a parent would read:

> *"⚠ CONFIRM: the old site advertised classes every Saturday at 9am. Does this continue under the
> concierge model? Emitting a class time nobody is running is a locked door."*

It was written inline in the content file while drafting. **Every gate passed over it** —
`astro check` clean, axe clean, `tells` clean, links fine. Nothing in a build can tell a sentence
meant for the client from one meant for the reader, except a list of the markers people actually
leave.

**`npm run check:copy`** looks for `TODO`, `FIXME`, `XXX`, `TKTK`, `⚠ CONFIRM:`, `Lorem ipsum` and
an unrendered `{{ placeholder }}`. It **warns on staging and refuses on production** — a note is
normal while building and unacceptable at go-live, the same split as `tells --undecided-only`.

⚠ **THE EXCLUSIONS ARE THE CHECK.** It reads the text a browser would show, never the source, so
a `TODO` in a code comment, an HTML comment or a `<script>` is invisible to it. `CONFIRM` needs its
colon, because *"please confirm your email address"* is a sentence real forms say. Bare `TK` is
excluded outright — it appears inside `ATKINS` and `TKR`, and a check that fires on those gets
switched off. Lowercase `todo` is a word in other languages. JSON-LD **is** scanned, because a
placeholder in structured data gets quoted straight back by Google.

**The question is usually real, and the fix is not deletion.** The script says so and so does
`CLAUDE.md`: move it to `BUILD-STATE.md`, where the other open client questions live and someone
reads them before go-live.

Thirteen cases, ten of them exclusions. Mutation-tested: searching raw HTML instead of rendered
text turns the comment and script cases red; loosening `CONFIRM:` to a bare word turns the email
sentence red. **71 cases across 13 gates, 40 proving a refusal.**

## 2026-08-30 — two rows borrowed from a detector, with the exclusions it lacks

Ran [pbakaus/impeccable](https://github.com/pbakaus/impeccable)'s deterministic detector over a
real build to see what `npm run tells` was missing. **14 findings, 9 of them matches inside code
comments** — including `// never reach a deploy as a silently broken <img>.`, flagged as a broken
image.

That is the bug class `check-sitemap.mjs` already carries a comment about: *"Match the META TAG,
not the word… a false positive that would train someone to ignore this check."* Same trap, and the
reason its detector is a second opinion here rather than a gate.

**Five findings were real, and two are worth having.** Both needed an exclusion the original does
not have, and in each case **the exclusion is the row**:

| Row | Fires on | Excluded |
| --- | --- | --- |
| Bounce or overshoot easing | a `cubic-bezier` leaving [0,1] on y | nothing — but it is a *tell*, because overshoot is right after a flick or a drag release |
| A thick accent bar down one side | `border-inline-start`/`left` ≥ 3px solid, more than once | **blockquotes** — a rule beside a quotation is a convention older than the web |

The blockquote case was a live false positive on the real build: `.prose blockquote` flagged
beside `.form__notice`, one a typographic convention and one an actual tell. Reporting both would
teach people to skim the row.

⚠ **AND THE TEMPLATE ITSELF FAILED THE FIRST ROW.** `tokens.css` shipped
`--ease-spring: cubic-bezier(0.34, 1.4, 0.64, 1)` — **referenced nowhere**, in the template or in
the client project that had inherited it. An overshoot curve is a look, and the template does not
ship looks. Removed, with a comment saying where a spring belongs: a gesture that carried
momentum, and nothing that merely appeared.

Six cases in `test:gates`, mutation-tested — dropping the blockquote exclusion, and an off-by-one
accepting `y == 1` as overshoot, each turn exactly one case red. **58 cases across 12 gates, 38
proving a refusal.**

**Not adopted:** the detector as a gate. A 64% false-positive rate on a codebase that documents
its decisions in prose is a check people learn to skip, which is how `check:refs` was written the
first time and had to be narrowed.

## 2026-08-28j — not asking for it is not a control

From a real build's locked decisions: **PHI — not collected. Enforced server-side in
`dropClinicalDetail`, not by markup.** And in its verification table: *a submission crafted with a
child's name, age and diagnosis stored none of it.*

The kit had one line on this, in `kickoff.md` Round 2 — *"ask before building a form that collects
a field they are not allowed to hold"* — which is about **which fields go on the form**. It said
nothing about the field that actually causes the problem.

⚠ **A MESSAGE BOX ACCEPTS ANYTHING.** You can design a form that requests nothing regulated and
still receive *"my son is 7, diagnosed with X, currently on Y"*. At that moment it is in KV, in
the notification email, and in the CSV export — for a client whose Section 504 or HIPAA position
assumes it is not.

It is silent in the worst way: the form works, the lead arrives, nothing errors, **every gate in
this kit passes**, and the exposure surfaces in an audit or a breach.

Now in `compliance.md` §10: drop it **server-side in the handler**, before storage and before any
third-party call — not `maxlength`, not a warning label, not "we did not ask for it", because a
control living in markup is one the sender can ignore. **Then try to defeat it**: craft a
submission containing exactly what must not be kept, send it, and read the stored record back. A
control nobody has attacked is an assumption — the same reason `test:gates` asserts refusals rather
than passes.

`build.md` phase 4's gate now requires it provably absent from a record that contained it, and
`runbook.md` §2 carries it as a manual row.

**It stays manual, and the row says why:** `verify` would need the export token and the record
schema to read storage back. Claiming automated coverage here would be worse than not having it.

Not only healthcare — GDPR special categories, payment details pasted into a message, immigration
status.

## 2026-08-28i — a retention period nothing enforces

From a real build's open blockers: résumés were being written to R2 while `applicationRetentionDays`
drove the KV record and the careers-page copy. Both of those were correct and visible in the diff.
**The files had no expiry at all.**

The kit was careful about this for KV and silent about it for R2. `contact.ts` says the principle
outright — `expirationTtl` is *"the retention policy, **enforced by the store**"* — and R2 has no
equivalent. It mentioned R2 in three places, none of them about retention: `stacks.md` §3 treated
it purely as a media CDN for large image libraries.

⚠ **R2 HOLDING FILES PEOPLE UPLOAD IS A DIFFERENT DECISION FROM R2 HOLDING YOUR PHOTOGRAPHS.**
Your images are your risk and can live forever. A résumé is personal data in a store with no
expiry, under a notice that states one.

**A privacy notice claiming a period nothing enforces is a false statement, and it is silent** —
clean build, clean deploy, correct-looking policy, data still there a year later. Nothing errors.
The only person who finds out is a lawyer reading a document that turned out not to be true.

`stacks.md` §6 now carries the enforcement table — KV `expirationTtl` (in the diff), R2 lifecycle
rule (**in the dashboard, not the repo**), D1 a scheduled delete you write, a spreadsheet a human
with a calendar reminder — and `runbook.md` §3 makes naming the mechanism a go-live step, before
the notice is published.

**It cannot be a gate**, and the entry says so: a bucket lifecycle rule is account configuration,
`verify` runs against a deployed site, and nothing in a repository can see it.

### The write-up broke the shipping boundary, and the audit passed it

The runbook line first cited `stacks.md` as a **relative link** into `skills/`. That resolves
perfectly here and **404s for every person who scaffolds a project** — the package ships
`index.mjs` and `template/`, nothing else. The template's own convention is a bare reference,
`` `stacks.md` §1d ``, precisely because the skill is loaded by the model rather than opened by
the reader.

`audit:docs` passed it, because the path was real *in this repository*. It now fails a link from
inside `template/` that resolves outside it. Verified in both directions: the bad link is caught,
in-package relative links still pass.

## 2026-08-28h — the CMS question was never being asked

Reported from a real migration: no CMS option was ever offered. Confirmed — the word "CMS"
appears nowhere in that project's build record, beside a discovery gate ticked complete.

⚠ **THE SKIP LOOKED LIKE A DECISION.** `kickoff.md` Round 2 listed *"CMS · default None · ask when
someone non-technical must publish without a deploy"*, and `SKILL.md` says to ask only where the
default may not hold. But **whether a non-technical person will publish is not something a default
can be tested against** — it is a fact about the client that no crawl reveals. So the condition
never tripped, the question never got asked, and every site shipped with markdown-in-git as an
unexamined default.

Compare the one row that always worked: **Domain and DNS access — no default, "always ask"**. Same
shape of unknowable fact, opposite outcome, because it was marked differently.

The CMS row is now **"Who edits the site after launch" · no default · always ask**, phrased by
consequence rather than product:

- *you or your developer* → markdown in the repo, nothing to maintain
- *someone in the business, occasionally* → a git-based CMS; a form that commits, content still in git
- *several times a week, with drafts* → price a headless CMS, and say out loud it adds a network
  dependency to every build

`stacks.md` §4 already had the full comparison — PagesCMS, Keystatic, Sveltia, Decap, Tina,
CloudCannon, and the headless options. **The knowledge was there; the question was not.** That is
its own kind of failure: a reference nobody reaches because nothing routes to it.

## 2026-08-28g — 0.1.7, the release that makes the kit usable on Windows

Everything through 0.1.6 was unusable there. `npm create website-build-kit@latest` scaffolded a
project whose build command failed on the first run:

```
'PUBLIC_SITE_ENV' is not recognized as an internal or external command
```

Shipping in this release:

| | |
| --- | --- |
| `scripts/build.mjs` | the environment is an argument, set once, instead of POSIX inline assignment npm runs through cmd.exe |
| `check-sitemap` | URL paths normalised — it was **passing** a site that listed a noindexed URL in its sitemap |
| `lib/routes.mjs` | same, and this is how every script discovers routes |

The first is why a Windows user could not build at all. **The second is worse in kind**: a gate
that reported success while checking nothing.

Not shipped in the package but part of the same work: the `audit:docs`, workerd-check and
`prepack` fixes, which affect people working **on** the kit rather than people building **with**
it, and `kit.yml` now running on `windows-latest`.

## 2026-08-28f — the kit did not build on Windows at all

⚠ **`build:staging` AND `build:production` USED POSIX INLINE ENV ASSIGNMENT.**
`PUBLIC_SITE_ENV=staging astro build` is shell syntax; **npm on Windows runs scripts through
cmd.exe**, where that is a command name, not an assignment:

```
'PUBLIC_SITE_ENV' is not recognized as an internal or external command
```

So the two most important commands in the kit **did not work at all** on a platform `CLAUDE.md`
calls supported — and every CI job ran on ubuntu, so nothing said so. Two Windows failures had
already shipped from this repo before this one.

`scripts/build.mjs` takes the environment as an argument and sets it **once**. That fixes a
second, quieter problem in the same line: `build:production` repeated `PUBLIC_SITE_ENV=production`
four times, and missing one copy runs that step as `development` while the others do not —
`astro check` typing a different environment than the one that gets built. **A mixed-environment
build is exactly what `check-env.mjs` exists to catch**, and it survives review because every
command looks right on its own.

**`kit.yml` now runs on `ubuntu-latest` and `windows-latest`**, `fail-fast: false` so a
Windows-only break still reports the Linux result. Step bodies are pinned to `bash`, which the
Windows runners ship — and that does not hide the bug, because npm picks **its own** shell for
`scripts` regardless of what invoked it.

Two cases added for the wrapper: no environment refuses, and a misspelled one refuses rather than
defaulting — asserting it never starts a build. The coverage ledger demanded them, which is what
it is for: **20 scripts can exit 1, 10 covered, 10 accounted for.** 52 cases, 32 proving a
refusal.

### And the Windows leg found a fourth one on its first run

⚠ **`audit:docs` was unusable on Windows.** It keyed its section map with `d.split('/').pop()` —
which returns the **whole path** when the separator is a backslash, so every later lookup by bare
filename missed and it reported **79 phantom problems** on a clean tree. `basename()` knows both
separators; `split('/')` knows one.

Confirmed with `path.win32.basename`, since `basename` on macOS uses POSIX rules and would have
made a misleading proof: it returns `SKILL.md` for `skills\website-build\SKILL.md` on Windows and
for a forward-slash path everywhere.

Swept for the same class across every script. Clean — the other four `split('/')` calls all
operate on a **URL or a route pattern** (`example.com/*`, an `og:image` src, a redirect path),
never a filesystem path.

### And a fifth, on the run after that — a gate silently passing

⚠ **`check-sitemap` DID NOT DETECT ITS OWN CONTRADICTION ON WINDOWS.** It builds URL paths from
file paths with `relative()`, which returns `about\index.html` there — so the route became
`/about\`, matched nothing in the sitemap, and a site listing a **noindexed URL in its sitemap**
passed the gate. Search Console reports that as an error counted against the whole submission.

The same line is in **`lib/routes.mjs`**, which is how every script discovers routes — so on
Windows `verify`, `redirects` and `shots` were all matching against paths that could not match.

Both normalised with `.split(sep).join('/')`. Confirmed under `path.win32` semantics:
`about\index.html` now maps to `/about/`, where before it produced `/about\`.

### And a sixth, in the diagnostic itself

The **"Platform binaries installed"** step resolved `<pkg>/bin/workerd` directly. On Windows the
file is `workerd.exe`, so the check reported the package missing **while its own directory listing
showed it installed**. It now resolves the package and accepts either binary name.

A diagnostic that cries wolf on one platform gets ignored on all of them, which is worse than not
having it — this step exists because npm reports success when an optional dependency fails, and it
only works if its verdict is trusted.

### And a seventh — where the safety net caught the filter

`prepack` copies `template/` into `create/` and excludes `node_modules`, `dist`, `.astro`,
`recon`, `shots` and `.dev.vars` with `/(^|\/)(…)($|\/)/`. **A forward-slash-only separator
class matches nothing on Windows**, so `template\node_modules` was copied wholesale — and the
belt-and-braces check refused the pack:

```
prepack: node_modules reached the package. Refusing to pack.
```

That refusal is why this surfaced as a failed build rather than a published package carrying
someone's `node_modules`. The class is `[\\/]` now. Verified that it still **keeps**
`src/pages/index.astro` while excluding the `.astro` cache directory — the `($|[\\/])` anchor is
what separates a file ending in `.astro` from a directory named it.

**Six of the seven Windows bugs in this repo were found by a user or by CI, not by reading.**
Every step of `kit.yml` had to be fixed to pass there, on a platform the README already claimed to
support.

## 2026-08-28e — 0.1.6, two silent bugs out of the scaffolder

0.1.5 ships both. A project scaffolded today gets them on its first run.

**`lastmod` dates the page you just edited wrongly.** The `git()` helper trimmed the whole
output, and `git status --porcelain` lines **begin with a significant space** — ` M path`. The
trim ate it on the first line only, `slice(3)` cut one character too far, and the path matched no
route. So the first uncommitted file was never treated as dirty and kept its **old commit date**,
while the script printed "1 uncommitted file(s) dated today". The sitemap then tells crawlers the
freshest page is the stale one.

**`og-cards` cannot say what is wrong with your config.** `preflight()` runs from `main()`, but
the image-manifest read sat at module scope and executed at import. A project without that file
got a raw ENOENT stack instead of "your config is still the stub" — the one message that would
have told them what to do.

Also in this release: `lastmod` creates `src/data/` before writing to it rather than throwing
ENOENT on a bare checkout.

Both were found by writing the tests, not by hitting the bugs — the two scripts had been excused
from `test:gates` on reasons that turned out to be softer than they sounded.

## 2026-08-28d — covering the last two gates found two real bugs

`lastmod` and `og-cards` were the last entries in the coverage ledger, excused as needing a git
history and external binaries. Both excuses were softer than they sounded: `GIT_COMMITTER_DATE`
pins a commit date exactly, and `og-cards`' config guard runs before any binary check. Covering
them surfaced two bugs that had shipped.

⚠ **`lastmod` NEVER SAW THE FIRST UNCOMMITTED FILE.** Its `git()` helper trimmed the whole
output, which is right for a scalar like `--format=%cI` and wrong for `--porcelain`, whose lines
**begin with a significant space**: ` M path`. Trimming ate the leading space of the first line
only, so `slice(3)` cut one character too far and produced `rc/pages/about.astro`. That matched
no route, so the file was never treated as dirty and kept its **old commit date** — while the
script still printed "1 uncommitted file(s) dated today".

Only the first entry, and only when it starts with a space, which is the ordinary case of having
edited a page and not committed it. **The page most worth recrawling is the one that silently
keeps a stale sitemap date**, and the output says the opposite.

⚠ **`og-cards`' preflight was unreachable.** `preflight()` is called from `main()`, but
`const manifest = JSON.parse(readFileSync('src/data/image-manifest.json'))` sat at module scope,
so it ran at import time — before it. Any project without an image manifest died on a raw ENOENT
stack instead of being told its config was still the stub. The preflight exists precisely to name
what is missing, and it lost the race to the most common way of missing something. The read is
lazy now.

`lastmod` also wrote `src/data/lastmod.json` without ensuring the directory existed — an ENOENT
stack rather than a diagnosis on a bare checkout.

Nine new cases. `lastmod`: a shallow clone refuses rather than dating everything identically; a
committed page takes its commit date; an edited page is dated today while its untouched sibling
keeps 2024-03-05. `og-cards`: the stub config refuses before generating anything. Both fixes
mutation-tested — restoring the trim, and restoring the eager read, each turn exactly one case red.

**50 cases across 11 gates, 30 proving a refusal. 19 scripts can exit 1: 9 covered, 10 accounted
for** — all ten genuinely needing a deployed site or a live zone.

## 2026-08-28c — the exclusion list is a ledger now, not a sentence

*CI caught what the local run could not: covering `extract.mjs` gave `test:gates` a dependency on
`turndown`, and the step ran **before** the template was installed. Three cases failed with a
module-not-found that read as three broken gates. It passed locally either way, because a
developer's `template/node_modules` is always there — the workflow step now runs after the
install, and says why.*


`test:gates` shipped with prose explaining what it did not cover. **That prose was wrong twice.**
First it justified every omission as *"needs a deployed site"*, which was untrue of
`staging-headers.mjs`. Fixed — and it was still wrong: it omitted `redirects.mjs` and
`extract.mjs`, both of which import nothing but `node:fs`, and named neither `indexnow` nor
`md-to-pdf`.

⚠ **AN EXCLUSION LIST THAT DOES NOT DESCRIBE WHAT IS EXCLUDED IS THE SAME FAILURE AS A GATE THAT
DOES NOT GATE.** Both read as coverage that is not there.

So it is a ledger. The suite enumerates every template script that can exit 1, subtracts what it
covers, and **fails if the remainder is not accounted for** with a reason — the same shape as
`audit:docs` failing on a script documented nowhere. It also fails on a stale entry: one naming a
file that no longer exists, or one now covered. Verified by all three mutations.

**19 scripts can exit 1: 7 covered, 12 accounted for.**

Two of the four genuinely-offline gaps are now covered rather than excused:

**`redirects.mjs`** — including the guarantee its own header calls the whole design: it **never
writes `public/_redirects`**. Slug similarity is a guess, and a wrong 301 is worse than a 404 —
the 404 turns up in the log and gets fixed, the wrong redirect looks like it works and sends
people to the wrong page for years. Nothing else checked that promise, and it is one refactor from
being lost. The case leaves a pre-existing live map in the fixture and asserts it comes back
byte-identical.

**`extract.mjs`** — refuses with no capture directory, refuses on a directory with no HTML, and
turns captured HTML into markdown with the body text intact and no tags surviving.

*One case failed on first run and the script was right: `/about-us/` and `/services/` existed as
new routes, so they correctly needed no redirect. The assertion now checks `/gone/` — the path
with no candidate, which is the one that loses traffic silently if nobody decides about it.*

## 2026-08-28b — the number was never counted

The landing page, its meta description, its `og:description`, its `twitter:description`, its
JSON-LD, both share cards and the repository description all claimed **46** documented silent
failures.

⚠ **THAT NUMBER CANNOT BE REPRODUCED FROM ANYTHING.** At the commit that introduced it, the
plausible sources gave 30 (`traps.md` + `compliance.md` §8), 35, 49 and 57 — never 46. It was
written by hand, never computed, and every trap added since made it drift further.

**Nothing goes stale as quietly as a number.** It stays plausible forever, it gets quoted back by
anyone who reads it, and no reader can tell.

**The count is now defined, and checked.** `audit:docs` fails when prose disagrees with the files:

```
traps.md ### entries          25   the file whose bar IS "it failed silently"
compliance.md §8 entries       8   CLAUDE.md: §8 takes entries on trap terms
                              ──
                              33
```

`build.md` §6 is deliberately excluded — it restates the same failures in framework-neutral
language ("enforced trailing slashes break form POSTs" *is* traps.md's "`trailingSlash: 'always'`
breaks form POSTs"), so counting it would count most of them twice. `compliance.md` §5 is excluded
too: those criteria fail **loudly** and get fixed, and §5 says so itself.

Verified in both directions — prose claiming 34 against 33 files fails, and adding one trap so the
files hold 34 against prose claiming 33 also fails.

**`npm run cards:brand`** regenerates both share cards — 1200×630 for `og:image`, 1280×640 for
GitHub's social preview. They are laid out separately rather than one scaled from the other: the
aspect ratios differ, and scaling either letterboxes or crops the accent bar, which is the only
element still legible at thumbnail size. The script reads the count from the same two files the
audit reads, so the cards cannot disagree with the documentation.

⚠ **GitHub's social preview has no API** — no `gh` flag, not on the repository object. The script
writes the file and says so; uploading is Settings → General → Social preview, by hand.

## 2026-08-28 — the tells of a generated site

`design.md` §3 caught the 2015 agency template: three equal cards, body text at container width,
a headline at 96px. It had no row for the closer failure — **the house style of the thing writing
the code.** A site can clear every existing row and still be recognisable in three seconds as LLM
output, because nobody chose any of it.

Eight new rows. Three are machine-checked in `npm run tells`, taking it from ten checks to
thirteen:

| Row | Threshold | Excluded, deliberately |
| --- | --- | --- |
| Frosted glass on more than one surface | `backdrop-filter` blur count > 1 | one translucent header is a decision |
| Border radii of 24px and up, repeatedly | count > 2, between 24px and 200px | `9999px`, `50%`, `100%` — pills and avatars |
| Glow shadows | zero offset, blur ≥ 16px | `0 0 0 3px` focus rings |

**The exclusions are the whole reason the rows are usable.** A pill radius and a focus ring are
correct design; a row that flagged them would be switched off within a day, which is how the first
`check:refs` shipped with seven false positives on a clean tree.

⚠ **ALL THREE REGEXES WERE WRONG ON FIRST WRITE, AND THE CLEAN TEMPLATE REPORTED ALL THREE AS
PASSING.** `[^;]*` is greedy, so one match ran across two declarations and counted them as one;
`[^;]+;` requires a terminator the last declaration in a block may legally omit. Only fixtures
asserting the row *fires* found either.

**Then two blind spots in those fixtures, found by mutation.** Restoring the semicolon-requiring
regex changed nothing, because `tells` concatenates stylesheets and the match ran past the `}` into
the next file to find a `;` there — the fixture's `tokens.css` now has none. And the pills
exclusion proved nothing while the fixture held a single `9999px`: removing the upper bound left
the count under the threshold either way. It now holds three.

Nine cases in `test:gates`, pinned by row rather than exit code — `tells` exits 1 on three or more
rows in total, and a bare fixture trips seven, so the exit code says nothing about which row fired.
**38 cases across 6 gates, 24 proving a refusal.**

**Two additions to `design.md` §1, from the same review.** What a reference gives you and what it
does not — composition, hierarchy, type scale, rhythm, density, grid, CTA placement are decisions;
copy, photography, illustration, icon sets, branding and a recognisable layout are somebody's work
and usually somebody's licence. And what to do when a **screenshot** arrives instead of a URL: a
still carries no behaviour, so scroll, reflow, hover and 320px are either asked about or decided
explicitly, never guessed from a JPEG.

**What was rejected**, from a proposed design-reference library: a `references/` tree at repo root
(collides with `skills/website-build/references/`, which `audit:docs` requires `SKILL.md` to point
at — an unpointed reference is one the model never loads), a curated gallery link list (*"name the
build it came from — it is what separates this from a listicle"*), per-style recipes (`design.md`
never prescribes a look), and Astro implementation rules already in `build.md` §2.

## 2026-08-27g — 0.1.5, so a scaffolded project gets the secrets gate

The scaffolder bundles `template/` at pack time, so template changes only travel with a release.
0.1.4's tarball was checked rather than assumed, and it was behind on exactly the two things a
new project needs first:

| | published 0.1.4 | this release |
| --- | --- | --- |
| `scripts/check-secrets.mjs` | **absent** | present |
| `seo` alias | `npx --yes github:nurkamol/seo-audit` | `npx --yes @nurkamol/seo-audit@1` |
| `deploy:staging` | `build:staging && wrangler deploy` | also runs `check-secrets` |

**The secrets gate matters most on a first deploy**, which is precisely what a scaffolded project
is about to do. Until now, `npm create website-build-kit@latest` handed someone a template that
would deploy a site capturing leads and silently emailing nobody.

Nothing in the skill needed this. `marketplace.json` points the plugin at the repo itself and
`install.sh` symlinks, so `features.md`, `stacks.md`, `kickoff.md` and `build.md` reach people the
moment they land on `master`. **Only `template/` is gated behind a publish** — worth knowing,
because it is the half that is easy to forget.

## 2026-08-27f — two tools offered at the moment they are decidable

**`npm run seo` now comes from the registry, pinned.** It ran `npx --yes
github:nurkamol/seo-audit` — the GitHub route, with no `@v1`. Two problems, and the package's own
README names the first: that route **clones ~16 MB of application sources and tests to reach a
115 kB crawler**. The second is worse. Unpinned, it fetches whatever is on the default branch *at
the moment you run it*, so the tool you baseline a migration with in week one is not necessarily
the tool you diff against in week six, and nothing anywhere records which one ran.

Now `npx --yes @nurkamol/seo-audit@1`. Verified: resolves to 1.33.1, runs, and `npm run seo --`
passes flags through.

**The dedicated SEO moment existed on one side only.** `stacks.md` §7 ended with *"see `build.md`
§3 phase 8b for where it fits after go-live"* — and **phase 8b never mentioned it**. The `§`
reference resolved, so `audit:docs` was green; the content it promised was not there. Phase 8b now
carries the baseline diff, with the reason it expires: once the old site is gone,
`seo-before.json` is the only record the metadata ever looked different.

Every flag in that command was checked against `--help` before it was written down —
`--baseline`, `--settle <seconds>`, and `--fail-on new`, which the help confirms requires
`--baseline`.

**[`@nurkamol/leads-kit`](https://www.npmjs.com/package/@nurkamol/leads-kit) is offered in
`stacks.md` §6 and at discovery in `kickoff.md` §2**, with the trade named rather than a
recommendation:

⚠ **The template's own export puts a bearer token in a URL query string.** That is an acceptable
trade for a route a developer curls once a month, and a bad one the moment a client bookmarks it
— URLs land in server logs, browser history, `Referer` headers and anything that proxies the
request. leads-kit puts Cloudflare Access in front of a real list instead, with an audited delete
and consent-aware exports.

**The default does not change.** The token-protected CSV stays: one route, no UI, no dependency,
and correct while the developer is the only reader. The catalogue entry asks the question that
decides it — *will the client read leads?* — because the honest answer costs nothing at discovery
and a retrofit in week three.

**No `leads` alias was added to the template.** `leads-kit init` writes source files; it is a
one-time fitting, not a repeatable command, and the template's script list is for things you run
again.

*(Written first as a sentence naming the alias, which `audit:docs` promptly failed — it resolves
every `npm run …` it finds, including one in prose saying the script does not exist. The audit
was right and the sentence was wrong.)*

## 2026-08-27e — staging-headers, and an exclusion list that lied

`test:gates` shipped with a "what this does not cover" list justifying every omission as
*needs a deployed site*. That was not true of `staging-headers.mjs`, which is entirely offline,
has three refusal paths, and had simply been missed. **An exclusion list that does not describe
what is actually excluded is the same failure as a gate that does not gate** — so the list now
says so, in the file.

Eight cases, and the harness gained a `then` hook because **two of this script's own shipped
bugs are invisible in an exit code**:

- **A duplicate path in `_headers` does not combine — the later block REPLACES the earlier.**
  Appending a second block with only `X-Robots-Tag` silently dropped Referrer-Policy,
  Permissions-Policy and the CSP from every response, while the build still reported "Parsed 5
  valid header rules" and the file still visibly contained all of them. The case asserts one
  block survives *and* all three headers are still there.
- **`_headers` does not strip an inline `#`,** so a trailing comment is sent as part of the
  header **value**. Crawlers received `noindex, nofollow, noarchive   # staging only …` for two
  builds — visible only by reading the response, never by reading the file.

It also asserts the production refusal writes **nothing**, not merely that it exits 1: writing
`noindex` into a production deploy is the most expensive mistake in the kit and it is silent.

Mutation-tested, all three reintroduced as they originally shipped — append-instead-of-merge,
inline comment, and dropping the production guard. Each turned red **exactly one case**, the one
written for it, rather than a scattering. Restored byte-clean.

**29 cases across 5 gates; 15 of them prove a refusal.**

## 2026-08-27d — proving the gates can still fail

**`npm run test:gates`.** The kit is gates: eighteen template scripts exit non-zero to stop a
bad build, and nothing checked that any of them still does. Three had already shipped broken.

| | what shipped | how it surfaced |
| --- | --- | --- |
| `recon.mjs` | `ReferenceError` on line 302, after the whole crawl | a user, on Windows |
| `check-env.mjs` | regex matched nothing, so it passed **every** deploy for a whole project | by accident, deploying a client site |
| `tells.mjs` | counted `dist` CSS as well as source, so one rule counted three times and `> 2` could never be cleared | by accident |

⚠ **A GATE THAT ALWAYS PASSES IS WORSE THAN NO GATE**, because it reads as a check that ran.
`check:refs` exists because of the first row, but it only proves an identifier is imported — not
that the check does anything.

So every case asserts **both directions**: clean input exits 0, and a fixture carrying the
failure exits 1. **The second half is the whole point.** 21 cases across `check-env`,
`check-secrets`, `check-sitemap` and `tells --undecided-only`; 12 of them prove a refusal.

**The suite was then mutation-tested, because a suite that passes on first run is the same
disease.** Reintroducing the exact `check-env` bug — a hostname constant that matches nothing —
turned 5 cases red. Replacing `check-sitemap`'s meta-tag regex with a bare `/noindex/i` turned
exactly one red: the case that exists because the accessibility page *explains* noindex in prose
and a substring search reports it as noindexed.

`check-secrets` gets a stubbed `npx` on `PATH`, so the comparison logic is tested with no
network, no account and no deployed worker — and the stub is skipped on Windows and **says it
skipped**, rather than counting as a pass.

Fixtures are written to a temp directory at run time, not committed: a tree of `site.ts`,
`wrangler.jsonc` and `dist/` files inside this repo is indistinguishable from real config to
every other sweep run over it.

**Deliberately not covered:** `verify`, `recon`, `shots`, `console`, `reflow`, `a11y` and `dns`
need a deployed site, and a stub convincing enough to exercise them would need more maintenance
than the scripts do. `audit:docs` and `check:refs` read the whole repository, so a fixture means
a fake repository — and they run on every commit, which is its own coverage. The script says all
of this in its own header.

## 2026-08-27c — dynamic routes, as a decision rather than a capability

**`features.md` §7.** "Can Astro do dynamic?" is the wrong question — the template already ships
three server-rendered routes. The real one is *which routes, and what each costs.*

**Default stays: every route static**, `prerender = false` per route. A route earns it when its
output genuinely differs per request — it reads a binding, reads the request, or writes. Not when
it merely feels live. An "open now" badge is client-side; server rendering it spends a worker
invocation on every visit to move one line of text, and the answer is the visitor's clock anyway.

⚠ **A forgotten `prerender = false` does not fail, it freezes** — the page renders once at build
and serves that snapshot for the life of the deploy. No error, no hint in the build output.

⚠ **`output: 'server'` is a one-line, whole-site regression.** It inverts the default, so a forty
page marketing site goes from edge-served to forty routes' worth of worker invocations, with no
error and no visible difference in staging where there is no traffic.

**Content that changes without a developer** is the part that costs a rebuild if taken wrongly:
rebuild-on-publish keeps the site static and makes content late by a build; fetching at request
time makes **the site's uptime the CMS's uptime** and puts its latency in your TTFB.

Two more, both measured rather than asserted. KV is eventually consistent to ~60s, so a
confirmation page that re-reads what it just wrote can legitimately show the old value. And the
caching exposure, from three real responses on a deployed site:

| | `cf-cache-status` | `cache-control` |
| --- | --- | --- |
| `/` prerendered | `HIT` | `public, max-age=0, must-revalidate` |
| `/_astro/*.css` | `HIT` | `public, max-age=31536000, immutable` |
| `/contact/` dynamic | **absent** | **absent** |

A dynamic response says nothing about caching, which is fine until a migrated site arrives with
the "Cache Everything" rule its WordPress host set — those survive a DNS move.

**Not added to `traps.md`,** and the note says so in the file. That list is for failures observed
on a real build; the frozen-page one has not bitten here yet. Writing it down where it belongs
beats borrowing provenance it does not have.

## 2026-08-27b — the secret nobody set

**`npm run check:secrets`** compares the secrets declared in `.dev.vars.example` against what
the deployed worker actually holds, and runs at the end of `deploy:staging` and
`deploy:production` — after the deploy, not before, because a worker that does not exist yet
cannot be missing anything and the first deploy is exactly when a secret has never been set.

⚠ **A MISSING SECRET NEVER THROWS.** `secret()` in `runtime.ts` returns `undefined`. The form
still validates, still writes the lead to KV, still returns 200, still thanks the visitor. The
API says `{"stored":true,"emailed":false}` and nobody reads API responses. So the site collects
enquiries and notifies no one — no error, no failed request, nothing in the deploy log. It is
found weeks later by someone asking why the phone stopped ringing.

It shipped exactly that way on the ochome build: deployed, `npm run verify` green, storing
leads, emailing nothing. `verify` lists it under *"what this cannot see"*, which was honest and
did not help. **A note in a report nobody re-reads is not a gate.**

The list comes from `.dev.vars.example` rather than being hardcoded in the script, so adding a
secret to the code extends the check for free — you have to add it there anyway or local
`wrangler dev` breaks. A hardcoded list would go stale in silence, which is precisely how
`check-env.mjs` spent a whole project matching nothing.

Verified against a live worker rather than a fixture: it caught ochome's genuinely-unset
`BREVO_API_KEY`, reported a never-deployed worker as nothing-to-check rather than
everything-missing, and passed when the declared list matched.

## 2026-08-27 — 0.1.4, because a rewritten history orphans an attestation

**npm showed a red banner on the package page:** *Unable to find the source commit for
create-website-build-kit@0.1.3.*

Nothing was wrong with the tarball. A published provenance attestation names the exact commit
it was built from, and 0.1.3's named `ce817e5` — a commit removed when this repository's
history was rewritten to purge a client's site crawl that had been committed by accident.
The repository was then deleted and recreated, so the SHA does not resolve at all.

⚠ **AN ATTESTATION CANNOT BE REPAIRED.** It is signed over the commit id. Rewriting history
after publishing orphans every attestation that points into the rewritten range, and the only
remedy is a new version built from a commit that still exists. `npm unpublish` is refused
after 72 hours, and a version number can never be reused.

The order matters and nearly went wrong here: the authorship rewrite — 20 commits carrying a
second GitHub account — was run **before** cutting 0.1.4 rather than after. Publishing first
would have orphaned the new attestation exactly like the old one.

0.1.4 is 0.1.3's content. The only change is a version number and a commit that will still be
there.

## 2026-08-26d — npm, the plugin, and a Node pin that had gone stale

**`npm create website-build-kit@latest my-site`** — published, and published through OIDC.

**`/plugin install website-build@website-build-kit`** — the skill installs in two lines instead
of a clone and a symlink script. Neither manifest names a path: `skills/` and `commands/` are
the auto-discovered defaults at plugin root and the repo already matches them. Declaring
`commands` would have been actively worse than redundant — a custom path **replaces** the
default scan rather than adding to it, which is a quiet way to lose the command later.

## The Node pin had gone stale, and npm noticed before we did

`.node-version` was on **24.2.0**, pinned in early August and untouched since. It went out of
date in a way nothing checks for: `npm install -g npm@latest` in the new publish workflow failed
with

```
npm error notsup Required: {"node":"^22.22.2 || ^24.15.0 || >=26.0.0"}
npm error notsup Actual:   {"npm":"11.3.0","node":"v24.2.0"}
```

npm 12 had raised its floor to 24.15 and the pin was below it. Pinned to `npm@11` for one
release to unblock, then the real fix: **24.19.0**, the active LTS (Krypton), which clears 24.15
and let the workaround come straight back out. Every gate was run on 24.19.0 *before* the pin
moved, not after.

The floor stays at **22.12** — that is Astro's requirement and a different claim from "the
version this is tested on". Only the tested version moved.

## The publish workflow, and why the gates go first

Releases go out on a published GitHub release through OIDC trusted publishing: npm trusts the
repository and the workflow filename, so there is no token to expire, leak or rotate. The first
manual publish had already failed with `E404 Not Found - PUT` — npm's disguise for "not
authenticated", returned instead of 401 so publish cannot be used to probe which package names
exist — caused by an expired token in `~/.npmrc` that nothing had reported.

**The gates run before the publish step**, and that ordering paid for itself immediately. The
EBADENGINE failure above landed on step 4 of 8 with `Publish` **skipped**: nothing reached the
registry and no version number was burned. A published version cannot be replaced — `npm
unpublish` is refused after 72 hours and a version number can never be reused — so this is the
one pipeline where the order is not a stylistic choice.

`0.1.1` carries a SLSA provenance attestation, which trusted publishing supplies for free and a
manual publish does not: the package is cryptographically tied to the commit and workflow run
that built it.

## npm strips `.gitignore` from published packages

Documented behaviour, and the reason every scaffolder carries the same workaround — but here it
was load-bearing. The template's `.gitignore` is what keeps `.dev.vars` out of the repository,
and `.dev.vars` holds `BREVO_API_KEY` and the leads export token. Without the workaround every
scaffolded site would have invited its first `git add -A` to commit live secrets, silently.

It ships renamed, the CLI restores it, and the CLI **exits** rather than leave a site without
one. CI packs the scaffolder and scaffolds from the tarball on every push, asserting the
`.gitignore` is restored and covers `.dev.vars` — the first command a new user runs, tested the
way they will run it.

## 2026-08-26c — public, MIT, and `npm create`

**The repository is public under MIT, published from a single clean commit.**

Not from a force-push. `master` was rewritten to one commit and verified clean, and the old
commits were **still retrievable through the GitHub API by SHA** — including the one holding a
client's phone number and the one holding live GA4 and GTM container ids. Both had been
deliberately redacted from the working tree months earlier, and publishing would have undone
both redactions. Force-pushing does not delete anything; it moves a ref.

So the repository was deleted and recreated. All five sensitive commits now return 404 from the
public API, verified after the fact rather than assumed. The 45 commits of development history
are kept locally on the `pre-public-history` tag — that is now the only copy.

`npx degit nurkamol/website-build-kit/template` has been in `README.md` and `SKILL.md` since the
first version and **had never worked**, because the repository was private the whole time. It
works now; it was run against the live public repo before this entry was written.

## `npm create website-build-kit`

`create/` — no dependencies, so `npm create` does not pay for a package tree before it can do
anything.

It refuses two things before writing a single file. **A Node older than 22.12**, because Astro's
own failure is a version notice buried in a build log, which is a confusing way to learn it —
and the directory is not created when it refuses. And **a non-empty directory**, because
scaffolding over an existing project cannot be undone without git.

**⚠ npm strips `.gitignore` from published packages.** Long-standing documented behaviour, and
the reason every scaffolder carries the same workaround — but here it is load-bearing rather
than cosmetic. The template's `.gitignore` is what keeps `.dev.vars` out of the repository, and
`.dev.vars` holds `BREVO_API_KEY` and the leads export token. Without the workaround every
scaffolded site would invite its first `git add -A` to commit live secrets, and nothing would
report it. It ships renamed, the CLI restores it, and the CLI **exits** rather than leave a site
without one. Tested by scaffolding from the packed tarball, writing a `.dev.vars`, and asserting
git ignores it.

**The template is not duplicated in the repository.** `prepack` copies it in, `postpack` deletes
it again, and `prepack` refuses to pack if `.dev.vars`, `node_modules` or `dist` reach the
staging copy. A committed second copy would be a second thing to keep in step, and it is the
copy that goes stale silently.

CI now packs the scaffolder and scaffolds from the tarball on every push, asserting the
`.gitignore` is restored and covers `.dev.vars` — the first command a new user runs, tested the
way they will run it.

## The pre-release audit

Ran every CI step locally, `npm ci` from the lockfile, and a standalone build of the template
with no parent repository. Three real fixes came out of it, all first-user breaks:

- `git clone git@github.com:…` used **SSH**, which fails for any visitor without GitHub keys
  configured — a broken first line in the README of a public repo
- the install snippet hardcoded a personal path
- `.claude/settings.local.json` was ignored only by the author's **global** gitignore, which a
  fresh clone does not inherit, so a contributor would have committed their local permissions

Also confirmed clean: no absolute paths, no real Cloudflare account or KV ids, no analytics ids,
no secrets, no TODO leftovers, and `npm audit --omit=dev` at zero.

## 2026-08-26b — something finally reads what recon captured

**`npm run extract`** — captured HTML in, clean markdown out, one file per page.

`recon` has captured rendered HTML since it was written and **nothing consumed it**.
`build.md` phase 1 said *"pull copy, media and metadata into structured files"* and named no
tool, so every migration hand-rolled an extractor at the point in a project where there is least
time to write one carefully. On one build that left 18 pages of captured HTML sitting in
`recon/html/` while the site shipped with a home page and nothing else.

It writes to `recon/extracted/`, **not** `src/content/`. What the collections are, which pages
collapse into template + data, and which of them should exist at all are phase-2 decisions and
project-shaped. This produces reviewable markdown; a person places it.

**It takes a dependency, deliberately.** `traps.md` gained the entry this morning:
`html.replace(/<[^>]+>/g, '')` glues the text either side of every tag it removes, so a heading
runs into its paragraph — but only where the source markup had no newline between tags, which is
every page builder's minified output. The hand-rolled version is therefore right on the
pretty-printed pages and wrong on the rest, which reads as a content problem rather than a
converter one. Whitespace, nesting and list indentation *are* the job, and turndown already does
them. Hand-rolling it here would have contradicted the trap in the same commit.

**What it flags is the point.** Run against a real 18-page capture it recovered 9,731 words and
22 images, and then said what needed a person:

- `headings` — **on all 18 pages.** The builder used heading tags as type styles: the lede
  paragraph is an `<h5>`, section titles are `<h6>`, and one page runs `h1 → h3 → h5 → h6` with
  **no `h2` at all**. It survives every automated check — `verify` counts h1s and there is
  exactly one — reads correctly to a sighted visitor, and is both an accessibility failure and
  the outline Google reads
- `alt-filename` — alt text the CMS generated from the filename (`"pic 11"`,
  `"service-maintenance-worker-repairing"`). Passes every automated check, reads as described,
  tells a screen-reader user nothing
- plus `thin`, `no-h1`, `region` (no `<main>`, so chrome may have survived) and `glued`

Lazy-load placeholders are resolved to the real file rather than migrated as a transparent gif,
`srcset` is dropped because it points at sizes the new site will not have, and image paths are
made portable — WordPress's `-300x200` derivatives and `-scaled`, and Elementor's thumbnail
crops, all resolve back to the original.

**MY OWN DETECTOR CRIED WOLF ON THE FIRST RUN.** Every one of the 18 pages reported `glued:2`,
which is exactly the uniformity that means a checker is broken rather than a site is. It was
matching inside URLs — `goo.gl/uQxkSHWN1XKNFz6y7` — because a link target is not prose. Link
targets and code spans are stripped before the scan now, and the real run came back clean.

Two smaller things. Flags are deduped with a count, so four images with filename alt text is one
line to read rather than four. And `audit:docs` now skips `recon/` and `shots/` — running the
new script inside `template/` while developing the kit put 18 extracted pages into the
documentation audit and took it from 26 files to 44.

## 2026-08-26 — the check that asks whether the migration finished

**`npm run verify` now compares `recon/urls.txt` against the deployed site, and fails on a page
that did not survive.**

`SKILL.md`'s first non-negotiable is *"Preserve every URL. Inventory before designing routes."*
`recon` built that inventory from the beginning. **Nothing ever compared it to what the new site
serves.** Every check in this kit asked whether what EXISTS resolves; none asked whether what
should exist is there.

Found on a real migration. recon had inventoried 18 URLs, the build had emitted 3, and `verify`
reported green — correctly, by its own rules, because all three of those returned 200. The
Routes section only sees routes the new site emits. Preserved paths is `/feed/`, `robots.txt`,
`ads.txt` and `/.well-known/*`, not pages. The only thing reading the inventory at all was
`redirects`, which proposes and never gates, and only if somebody runs it.

That is the same blind spot `audit:docs` had two entries ago — **the third time this shape has
turned up**: everything verified that references resolve, nothing verified that the thing was
there at all. It is worth treating as a standing question rather than a bug that keeps recurring.

A dropped page is unambiguous, so this fails rather than warns. The two things that would make
it cry wolf are handled. URLs that were **already 404 before the migration** are excluded —
`recon` computed that set from the start and only ever printed it, so it now tags them in the
file. And a path that **301s to a real page counts as kept**: redirects are followed rather than
any 3xx being accepted, because a 301 pointing at something that itself 404s is a loss wearing a
redirect's clothes. Landing on the **homepage** is a separate warning — it resolves, so the main
check passes it, which is exactly why `SKILL.md` calls it out as a soft 404.

**One parser for the inventory, because there were two and both were wrong.**

`redirects` kept every line that was not blank or a comment. `shots` kept every line starting
with `/`. Both are correct only while the file holds bare paths — and a real inventory turned up
holding **absolute URLs**, hand-made rather than written by `recon`. `redirects` then compared
`https://site.com/about/` against `/about/`, matched nothing, and proposed an empty map.
`shots` found zero paths and silently reported the migration as **greenfield with no before
side** — on exactly the migration it exists for. Neither said anything was wrong.

`scripts/lib/inventory.mjs` is now the only thing that parses that file, accepting both forms,
for the same reason `lib/routes.mjs` and `lib/preserved.mjs` exist.

## Extraction: the run-together text

**A new trap, from every migration this kit has done.** A heading glued to its paragraph
(`AreasWe cover Irvine.`) or a sentence glued to its link (`Call ustoday`), on some pages and
not others.

One line causes it — `html.replace(/<[^>]+>/g, '')` joins the text either side of every tag it
removes — and whether it shows depends on whether the source markup happened to have a newline
between the tags. Page builders emit minified HTML, so often it does not. The same extractor is
therefore right on the pretty-printed pages and wrong on the rest, which reads as a content
problem rather than a converter one. Collapsing whitespace afterwards hides the good case and
leaves the bad one.

`traps.md` carries the mechanism, the fix, and the grep that finds it after the fact.
`build.md` phase 1 now says plainly: use a real HTML-to-markdown converter, do not hand-roll the
tag stripping, and spot-read two pages before calling extraction done.

## 2026-08-21e — the README names everything now

**All 17 template scripts are in the README, and the audit's advisory block is silent.**

The entry below built that advisory on an argument: what belongs in the README is a judgement,
`cards` and `lastmod` and `indexnow` are occasional, and the list is there to be read rather
than driven to zero. It was driven to zero deliberately, which is a fair call — the counter-case
is that a reader cannot run a command nobody told them exists, and "occasional" is a reason to
put a script late in the list rather than to leave it out.

`redirects` and `console` went in first, as the two that were arguably gaps rather than
omissions: `redirects` is a migration's highest-traffic-risk step, and `console` is a
definition-of-done row that `verify` cannot cover, because `verify` uses only `fetch` by design.

Then the remaining six. Each one leads with the failure it prevents, because that is the only
thing that earns a line in that list — a bullet that cannot name a failure is padding:

| | |
| --- | --- |
| `reflow` | Keeps the testing claim on `/accessibility` honest. On one build that sentence was true when written and false a day later, because a redesign rebuilt every route |
| `a11y:evidence` | Writes the manual layers in as **unchecked** every time — a pack listing a clean automated run reads as a finished audit, and it is the floor |
| `cards` | JPEG, because Facebook and LinkedIn still fail to render a WebP `og:image` and no scraper accepts SVG. A shared post would unfurl with no picture at all |
| `lastmod` | Committed as data. The first version read `git log` during the build and emitted nothing in production, because Cloudflare shallow-clones |
| `indexnow` | Prints that **Google does not participate**, because reading a green result as "submitted to search engines" is how a site goes weeks with nobody asking why Google missed something |
| `media` | Extended the existing **Media pipeline** bullet rather than adding a second one — that bullet already described the feature and only failed to name the command |

**A correction this forced.** `CLAUDE.md` had just been written to say `cards`, `lastmod` and
`indexnow` were deliberately absent from the README, and that became false within the hour. It
now says why the check stays advisory rather than which scripts are exempt — a rule about the
*shape* of a decision does not go stale when the decision changes, and a list of exempt names
does.

**The check itself is unchanged and still advisory.** Not because the README happens to be
complete today, but because the reason was never about which scripts were missing: a gate on a
judgement demands a bullet even where there is nothing to say, and gets deleted rather than
argued with. Silence there is now a real signal — it fires again the moment a script ships
without a mention.

## 2026-08-21d — checking the inverse

**`npm run audit:docs` now checks that a feature is described, not only that its references
resolve.**

The audit has been green through two README drifts, and it was right to be: every rule in it
verifies that a `§`, a path, a script name or a data field *resolves*. Nothing asked the
opposite question — is this thing described anywhere at all? So `npm run dns` and the staging
badge both shipped, were documented in `docs/the-template.md`, and were absent from the file
most people read first, with a green audit either side of it.

Two new failures, both narrow: a template script named in no builder-facing doc, and a
`references/*.md` that `SKILL.md` never points at. The second matters more than it looks — a
reference nothing points at is one the model never loads, so it is invisible rather than untidy.
`CHANGELOG.md` and `roadmap.md` are excluded: a feature named only in a history file or a Done
table has not been explained to anybody.

**Whether the README is COMPLETE is printed and never failed.** It is a curated account of what
the kit ships, not an index — `cards`, `lastmod` and `indexnow` are deliberately absent because
they are occasional. A gate that goes red on a judgement is a gate somebody deletes rather than
argues with. But it is still the file people read first and it has now fallen behind twice, so
the audit refuses to be silent without pretending to know the answer. It prints the list; a
person decides. Modelled on `verify`'s "what this cannot see".

**THE FIRST VERSION SILENTLY PASSED EVERYTHING.**

A doc may reasonably name the script rather than the command — the README explains
`check-sitemap` by filename — so the matcher fell back to the bare filename. As a substring.
Which meant a script called `orphan` counted as documented because `traps.md` contains the word
"orphaned"; `console` would have matched every `console.log` in a code fence and `media` every
mention of social media. Caught by adding a deliberately undocumented script and watching the
audit pass. It is anchored now to the two forms docs actually use — `scripts/<file>.mjs`, or the
name in backticks — and both failures were re-tested by sabotage.

A check that always passes is worse than no check: its silence reads as "looked at".

Acting on what it printed, the README now carries `npm run shots`, the weight and blocking
counts in `verify`, and the legal collection.

## 2026-08-21c — legal pages as content, and a date that was wrong for half the world

**`src/content/legal/`** — privacy, terms and house rules as markdown through one route.

The last item on the roadmap, and the one the roadmap argued against: it is project-shaped, and
the template ships no page layouts by design. What tipped it is that a legal page is the one
page type with genuinely nothing to art-direct — a heading, a date and prose — so shipping the
route ships no design. The collection is empty in a fresh clone and emits nothing until somebody
writes a file, which is the same shape the blog collection already had.

**The footer derives its links from the collection.** `nav.ts` had carried a comment explaining
why privacy and terms were never listed there by hand: *a footer link to a page that does not
exist yet is a 404 on every page of the site, which nothing will report to you.* That is now
structural rather than a warning — add the file and the link appears, delete it and the link
goes, and the two cannot disagree because there is only one of them.

**The route sits at the root and guards itself.** `/privacy/` is the URL clients have and
migrations must preserve; `/legal/privacy/` would be a redirect to write and a link everyone
else has wrong. That makes it a catch-all, and Astro gives a static route precedence over a
dynamic one — so `src/content/legal/contact.md` would not break `/contact/`, it would silently
do nothing, leaving a page in the collection, a link in the footer, and the contact form served
at that URL. `getStaticPaths` now throws, naming both files. Verified by building the collision.

## The date bug this uncovered, which was already shipping

**A frontmatter date rendered one day early on any build machine west of Greenwich.**

Astro's frontmatter parser turns an unquoted `2026-08-21` into a **Date** — midnight *UTC* —
and `toLocaleDateString` with no `timeZone` formats that instant in the **build machine's**
zone. Measured: US Pacific and US Eastern both shift it to 20 August, London and Tokyo do not.

This was live in the template's own `src/lib/posts.ts`, so every site built from this kit that
ran its build in a US timezone published every blog date a day early — clean build, clean types,
correct markdown, and the same commit rendering differently depending on who deployed it. This
kit's provenance is US local-business rebuilds, so the wrong half was the common half.

`formatDate` now pins `timeZone: 'UTC'`; the locale still decides order and wording. The legal
schema goes further and keeps these as **strings** end to end, normalising whatever the parser
produced back to `YYYY-MM-DD` at the schema boundary — an effective date is a calendar date, not
an instant, and removing the class beats handling it. Both trap files carry the entry.

## Two smaller things, both found by running it

`getStaticPaths` is hoisted into its own scope, so the collision guard read as
`ReferenceError: RESERVED is not defined` at build time rather than a lint error. It is declared
inside the function now, with a note saying why.

`getCollection` on an **empty** collection logs *"The collection legal does not exist or is
empty"* — and the footer runs on every page, so a fresh template printed that line once per route
on every build. Nothing was wrong: an empty legal collection is the correct state of a site
nobody has written a privacy policy for yet. A build-time `import.meta.glob` check skips the call
when the directory is empty. A starter that shouts about the correct state is a starter whose
output people stop reading.

One integration worth naming: a legal page with `noindex: true` would otherwise sit in the
sitemap, which `npm run check:sitemap` correctly reports as an error. `check-sitemap.mjs`
explains why the sitemap's exclusion list is hand-kept in general — inclusion is decided in
`astro.config.mjs` before any page renders. Legal pages are the exception, because their
`noindex` is frontmatter on disk rather than a rendered tag, so that half derives now.
`src/lib/legal-routes.mjs` reads it at config time, alongside `lastmod.mjs` which already did.

**The roadmap's Open list is now empty.**

## 2026-08-21b — the half of performance a script can own

**Weight and render-blocking, inside `npm run verify`.**

`build.md` §2 has said *measure before you defend a design opinion* since the first version and
named no tool for it, so nobody measured until a client asked why the site felt slow.

**Nothing in it is a timing, deliberately.** The same section of build.md warns against
hand-rolling a `PerformanceObserver` against one machine: it produces a confident number that
disagrees with Lighthouse and there is nothing to tell you it is wrong. Bytes and counts do not
have that problem — they are identical on every machine and every connection, they are the
inputs a timing is made of, and they are the half a script can own honestly. Lighthouse on the
deployed URL, mobile, simulated throttling, two samples per variant, is still the number. The
blind-spot list at the end of `verify` now says so, so the two cannot get confused.

Four checks: page weight against a budget, render-blocking stylesheets, render-blocking
`<script src>` in `<head>`, and text assets served uncompressed. Plus the heaviest image on the
site, named — on a marketing site that is almost always the LCP element, and naming it is
actionable without claiming a millisecond.

Only the compression check fails the run. Text served uncompressed is a configuration error and
unambiguous. The rest warn: the right page weight is a design decision, a photography-led site is
legitimately heavier, and a consent script sometimes genuinely has to run first. A gate that goes
red on a judgement call is a gate somebody deletes rather than argues with.

It costs no extra page requests. The link crawl already pulls every page's HTML and the meta
sweep already rides along on it; this is one more pass over the same strings.

**TWO WRONG BUILDS BEFORE THE RIGHT ONE, BOTH FOUND BY RUNNING IT.**

The first version flagged *the heaviest image on the page* when it was `loading="lazy"`. That is
wrong in a way that would have got the check deleted in a week: on a page with a modest hero and
a large photograph near the bottom, the heaviest image is the gallery one and lazy is exactly
right there. It now takes the first **substantial** image in document order — document order
approximates above-the-fold, size does not — with a 20 KB floor so a logo cannot trip it. Both
cases were built as fixtures and checked: the hero page warns, the gallery page stays silent.

The second was worse because it would never have shown up locally. Sizes came from `HEAD` with
`accept-encoding: identity`, falling back to a full `GET` when there was no `content-length`.
Against `wrangler dev` that is fine. Against a real CDN, **`HEAD` returns no `content-length` at
all** — measured on two live hosts — so every run would have fallen through and downloaded every
image on the site, turning a twenty-second check into tens of megabytes. It now issues the `GET`,
reads the header and **cancels the body before it transfers**: 11ms for a 1.6 MB image instead of
the whole file. Range requests were the other candidate and are not reliable — the hosts tested
answered `200` with no `content-range` rather than `206`.

Where a size cannot be established at all, the run says the totals are floors rather than totals.
A weight report that silently omits what it could not measure reads as complete.

## 2026-08-21 — the record nobody kept

**`npm run shots`** — before/after screenshots of a migration, paired.

`runbook.md` §go-live and `stacks.md` §1d have both asked for a visual record since the first
version of this kit, and nothing produced one, so it was the step that depended on somebody
remembering to do it by hand on the one day it was still possible. Once DNS moves, the old site
is gone; the Wayback Machine has some of it, at some widths, on some dates.

Two failures, and the second is the expensive one. Six months later a client remembers the old
site as better than it was and there is nothing to put next to that. And — quieter — a page
comes out **worse** in the rebuild and nobody notices, because it builds clean, returns 200,
passes every gate in this repo, and no one ever put it beside what it replaced. Every automated
check here answers *does it work*. This is the only one that helps with *is it better*, and it
does that by refusing to answer: it lays the pair out and a person decides.

**Both sides read `recon/urls.txt`.** Capturing the new site from its own sitemap would have
been the obvious build and the wrong one — you would photograph the pages you built and never
the ones you dropped, which is precisely the case worth catching. A path that 301s is followed
and still filed under the old path, so the pair lines up; a path that 404s appears in the sheet
as a dead cell beside its old screenshot.

A 4xx is reported and never fails the run. `recon` deliberately lists paths that were *already*
dead on the old site, so failing on those would put a before-pass in the red on a migration
where nothing is wrong — and a check that goes red for a non-reason is a check that gets
switched off.

`docs/traps.md` already carried the reason this is harder than it looks: a screenshot run
against a flaky server invented dropped stylesheets, nav dropdowns hanging open and missing
images, none of it real and all of it worth an afternoon. So every capture proves the harness
before it believes the picture — failed requests recorded, transitions frozen, the page scrolled
to force lazy images, `img.decode()` awaited, and `getComputedStyle(document.body)` checked for
the transparent background that means the stylesheet never arrived. A shot that fails those is
named and **not written**, because a broken screenshot filed as evidence is worse than a gap.

One more that only shows up on a long page: Chrome cannot rasterise past ~16384 device pixels,
and a `fullPage` capture past it returns **cut off, with no error and a plausible file size**. A
tall page drops to 1x for that shot and the run says which ones did.

`shots/` is gitignored. The pairs belong with the handover deliverables, not in the site's
history, and they are regenerable right up until the old site goes away.

## 2026-08-18 — what a migration loses, and what staging leaks

**`npm run dns`** — the zone, captured before you touch it and diffed after.

MX appeared **nowhere in this kit** before this. Neither did CAA, and the go-live document
contained no DNS record types at all. That was the largest hole left, and it is not a website
problem: a rebuild moves the apex, every other record in that zone belongs to somebody else's
service, and **losing MX kills the client's email silently** — the bounce goes to the sender,
so the people who find out cannot tell the client. A dead site gets a phone call in minutes;
dead email looks like a quiet week until an invoice does not arrive.

CAA is the launch-day one: a record naming no CA your host issues through blocks certificate
issuance, so the deploy succeeds, DNS cuts over, and the site serves a TLS error nothing in the
repo can fix.

It records and warns and never fails — DNS lives outside the repo — and it says plainly that it
reads **public** DNS, so a record that exists but is not published is invisible to it.

**Staging is marked and actually blocked.** A standing badge on every non-production build,
driven by `site.indexable` so it cannot be left on in production. It **reads the live DOM
rather than printing the build variable**: a badge saying `STAGING · NOINDEX` from a constant
only repeats what you know, so this one checks the real `<meta robots>` and the real analytics
tags and alarms with `NOT NOINDEX` or `ANALYTICS LIVE` when the page disagrees with its
environment. `pointer-events: none`, so it can never intercept a click during a demo.

Underneath it, a correction: staging served `Disallow: /` **and** `noindex`, which cancel each
other out. A blocked crawler never fetches the page, so it never reads the noindex, and a linked
staging URL can still be indexed as a bare URL competing with production. **Cloudflare Access is
the answer** and is now the documented default — with the discovery vectors people miss, chiefly
**Certificate Transparency logs**, which publish every staging hostname within minutes of the
certificate being issued. "Nobody knows the URL" is not a plan.

`X-Robots-Tag: noindex` on every non-production response covers what the meta tag cannot: a PDF
has no `<head>`, nor does an image or a CSV export, so those were indexable while the pages
around them were not.

**`npm run seo`** *(optional)* wires in [seo-audit](https://github.com/nurkamol/seo-audit) —
`npx`-able with zero dependencies, so it adds nothing to the tree. Documented as a **baseline**
rather than a report: capture the old site before migrating, then run the new one with
`--fail-on new`, which separates regressions you introduced from a backlog the client already
had. Explicitly not a required gate.

**The pre-migration capture is now three commands** — `recon`, `dns`, `seo` — all writing to
`recon/`, all committed, together the rollback artefact.

**Also:** `npm audit fix` cleared five `undici` advisories that arrived through wrangler. Six
remain, all `extract-zip` under puppeteer, and they stay: npm's fix downgrades `pa11y-ci` a
major version and takes axe-core backwards. What matters is that none of it ships —
`npm audit --omit=dev` reports zero, and **that** is the CI gate, because a check nobody can
make green is a check everyone learns to ignore.

**Four traps, three of them from bugs in this week's own additions:** a second `/*` block in
`_headers` replacing rather than merging and silently dropping the CSP; an inline `#` in that
file going out as part of the header value; `Disallow` plus `noindex` cancelling out; and moving
an apex taking the email with it.

## 2026-08-16 — checks that check themselves

Thirteen commits, and the thread through them is that every new check found something the
moment it first ran. That is the argument for writing them: none of these were suspected.

**`npm run verify` grew three sections.** It crawls the **links inside pages** now — everything
before it checked URLs something *else* pointed at, so a nav change orphaning a page was
invisible. It sweeps **titles, descriptions and canonicals** for absence, duplication and
shape, comparing across pages because a template that forgets to override the default gives
twenty pages one description and each looks correct alone. And it re-checks the **preserved
paths** `recon` found on the old site — the inventory said `/feed/` had to keep working and
nothing confirmed it had.

**`npm run console`** closes the one definition-of-done row nothing could: *zero console errors
and zero failed requests*. The row states its own reason — a blocked script or a 404 asset is
invisible to a status-code check — and `verify` uses only `fetch`, so it never could. On its
first run a fresh template made **three failed requests on every page**: the layout advertised
a favicon, an SVG icon and an apple-touch icon it does not ship. Icons are declared in
`site.ts` now, the same rule already applied to analytics IDs, `logoPath` and `og:image`.

**`npm run redirects`** proposes a migration's redirect map from `recon/urls.txt` and **never
writes `public/_redirects`**. Slug similarity is a guess, and a wrong 301 is worse than a 404:
the 404 shows up in the log and gets fixed, the wrong redirect looks like it works. It refuses
the homepage as a target, holds admin paths back as must-404 and machine-readable paths back as
regenerate-in-place.

**`npm run audit:docs`** tests the kit's own documentation — every `§`, every `npm run`, every
quoted path and data field. Its first run found `kickoff.md`, the file discovery reads first,
pointing at `prompts/website-build.md`, from a structure that has not existed for months. Then
it caught itself twice, which is the useful proof.

**`npm run a11y:evidence`** writes the dated pack `build.md` phase 9 requires, and is built not
to look complete: the keyboard, screen-reader and forms passes are written in blank every time,
because automation catches roughly a third of issues and a pack that stopped at a clean axe run
would read as a finished audit.

**AVIF alongside WebP**, measured rather than asserted — 26% smaller at *better* quality than
`webp q78`, with quality picked by RMSE parity. `effort` stays at 4 because effort 9 costs
thirty times the time and produces a **larger** file than effort 6.

**`npm run build` was a footgun.** It produced a development build in silence — canonical
`http://localhost:4321/`, exit 0, deployable — while the README claimed a guard. The guard was
real and keyed on `CI`, so it covered the machine where nobody types anything and left the hole
open where muscle memory lives. It keys on the command now.

**Two more silent failures, both caught by the new checks.** A fresh template emitted an
`og:image` pointing at a file that does not exist until `npm run media` runs — a well-formed tag
pointing at nothing is worse than no tag, because scrapers cache the failure. And the kit's own
CI failed once with *"Unable to load your Astro config"*, which was not a config error: workerd
ships its binary as a per-platform **optional** dependency, and a failed optional dependency
does not fail `npm ci`. The retry passed with nothing changed. CI asserts the binary now.

**Also:** neutral locale defaults, because the template was US-locked in seven places while its
own compliance reference covers the EAA and AODA — a 10-digit phone rule silently rejected every
UK, Irish and Australian visitor. `design.md` now says which `tells` invocation gates what, and
which two of its ⚙ rows promise more than the code delivers. `docs/roadmap.md` carries what is
queued *and what was rejected*, with reasons. A `LICENSE` that reserves the kit and deliberately
does not follow the template into client work.

## 2026-08-15 — the gaps a backport exposed

A third site went to production and sent back a document of what to merge into the kit. Porting
it was an afternoon. What the port *exposed* took the rest of the week, because most of it was
in the kit already and had never been run.

**The two ends of the job were prose.** Every reference file named "the inventory" — the input
to the redirect map, the go-live route check and week-one 404 triage — and nothing produced it.
`runbook.md` §2 read a `urls.txt` that no command wrote. Eleven references named "the handover"
and no such document existed, while `md-to-pdf.mjs` sat in the repo as a renderer with nothing
to render.

**`npm run recon -- https://old-site.com`** writes the inventory: URLs from the sitemap plus the
ones only the Wayback Machine remembers, which sitemap filename is canonical, preserved paths,
and the integrations visible in the markup. It probes with `redirect: manual`, because following
redirects makes every alias report 200 and hides the one fact the step exists to establish. A
failed archive lookup is never reported as "0 archived URLs" — that reads as a finding when it
means the lookup did not happen.

**`npm run verify -- https://…`** is `runbook.md` §2 as a gate that exits non-zero: routes, a
real 404, every literal rule in `_redirects` *and* whether its target resolves, security
headers, the staging noindex/analytics split, sitemap `lastmod` variance, and the three form
submissions the API is meant to refuse. It reads `_redirects` and the deployed sitemap rather
than a list inside the script, so it cannot drift. It prints what it *cannot* see, because a
check silent about its blind spots reads as "everything is fine".

**`docs/handover.md`** is the only doc written for the client rather than a developer: what they
own and where — named to a real person, because "the agency" is not an answer once the agency
has moved on — what it costs, what breaks first if a payment fails, what was deliberately not
built, and how long enquiry data is kept.

**Writing the verifier found what the verifier was for.** There was **no cross-origin check at
all**, while `runbook.md` had asserted a 403 since the beginning. And that runbook's honeypot row
posted `website=filled` while the code checked `company` — so the documented spam test submitted
a complete, valid lead, stored it, emailed it, and reported success. A verification row that
quietly does the opposite of what it claims is worse than an unchecked box.

**The honeypot 303'd caught spam to `?sent=1`** — the conversion URL. Inert only because the
no-JavaScript conversion did not exist yet, which is precisely what the backport document told
you to add next. Fixed first, so the two land together.

**Leads never expired.** No `expirationTtl`, so KV held personal data forever, and
"indefinitely" is not a retention period any regulator accepts. `site.leadRetentionDays` is now
180 days on production, 30 on staging, enforced by the store. Name and email were also
duplicated into KV metadata, which `list()` returns without reading values — and nothing
consumed it.

**There was no `tsconfig.json`.** Every `interface Props` in the template was decorative:
`Astro.props` was `any`, so nothing was checked. `astro check` could not run at all — it
prompted to install itself and hung — so the project had never been type-checked. Adding both
surfaced `HVACBusiness` hardcoded in the organisation schema, a `schemaType` prop passed on
every page and read by nothing, and a `platformProxy` option the Cloudflare adapter had stopped
accepting and was dropping in silence.

**The provenance gate was a denylist of past client names, and it had been passing.** While it
passed, the template shipped a heating-company schema type, a green palette in the lead
notification email, `America/Los_Angeles` stamping every enquiry in a previous client's timezone
(11:30 AM for a 2:30 PM lead — a plausible wrong time nobody re-reads), one studio's routes
hardcoded inside `check-reflow.mjs`, and an entire script that a single NUL byte made binary and
therefore invisible to `grep -I`.

A denylist tests for the mistakes you already made. `CLAUDE.md` now checks first that every file
is *readable* by the sweep, then greps for the **shapes** client data takes: a colour, a face, a
place, a number, a claim, a clock.

**Also:** cache and security headers with `script-src` deliberately omitted and the reasoning
written down; per-route `lastmod` from committed git dates rather than build time; `check-env`
comparing `PUBLIC_SITE_ENV` against the routes in `wrangler.jsonc`; `check-sitemap` failing a
production build when a URL is both listed and `noindex`; IndexNow that verifies its key file is
reachable before posting and prints that Google does not participate; reflow testing at 320px
and 200%; `.github/workflows/gates.yml`; `pa11y-ci` and `@astrojs/check` declared instead of
`npx`-resolved; a `project.css` seam so cards and heroes stop landing in `global.css`; and an OG
card generator split so the machinery ships and the design does not.

**22 new traps**, and what the stack actually costs at the free-tier boundaries.

## 2026-08-05 — the template stops shipping a design

Two sites built from the kit came out looking like the site it was extracted from. The skill
was not the problem; the template was. `CLAUDE.md` had said it for months — *"the template is
a skeleton, not a theme; if it accumulates opinions about how a page should look, every site
built from it starts looking the same"* — and the template had been quietly breaking that rule
the whole time.

What it was actually shipping: a brand ramp commented *"the exact values from the old Astra
theme"*, two committed woff2 files hard-wired in `tokens.css`, a `global.css` full of `.btn`
/ `.card` / `.eyebrow` / `.post-card`, and an `index.astro` whose own comment said *"replace
the copy, keep the structure"* — dark hero, three-card services grid, dark why-us grid, CTA
band. That is the exact shape `design.md` §3 names as the templated look.

**The template now arrives undecided.** A grey placeholder ramp behind an `--unset` marker,
the system stack for both faces, no typefaces in `public/fonts/`, a scaffold home page that
says so and is `noindex` until replaced, and a `PageHero` that is breadcrumbs, an `h1` and a
slot. `global.css` keeps the interactive **states** — hover, focus-visible, disabled, busy,
invalid — and nothing that constitutes a look. `src/data/nav.ts` is new: routes and the one
action that counts as a win, read by the header, menu, footer and 404.

**`npm run tells`** — the mechanical half of `design.md` §3, no browser and no dependency, so
it runs in CI. Two sections. *Undecided* passes when the placeholders are all present (fresh
clone) or all gone (real project) and fails in between, because a project with a brand colour
and no typeface is one that stopped halfway; `build:production` runs it as a hard gate.
*Tells* checks measure, section rhythm, the auto-fill card grid, face pairing, headline size,
tracking, motion duration, focus ring, raw hex in components and form states — three and the
page is not ready. Run against the old template it reports three; the tells that need eyes are
printed at the end rather than quietly omitted. It is now a gate in phases 3 and 4 for
**every** build, not only a redesign — a faithful rebuild reproducing the last client's page
shape is the failure it exists to catch.

**Provenance leaks the strip turned up**, all of which had shipped: `(000) 000-0000` inside
the form's catch block *and* the API's 502 body; the no-JavaScript path 303ing to
`/contact-us/` and `/thank-you/`, neither of which existed in a fresh build; an `edt-`
sessionStorage key and plugin name; a duct-testing icon set; a footer linking every page to a
`/privacy-policy/` that was not there. Two new entries in `traps.md` — both failed silently,
both only on a path nobody looks at.

**Also:** the first-visit brand overlay moved out of the template into `features.md` §6 with
its measured LCP numbers (+628ms at the old timings, +160ms at the tuned ones). It was costing
every site that budget by default. `CLAUDE.md` gains the two tests a template addition must
pass and a provenance rule with a grep to check it.

## 2026-08-03 — the redesign path

Full redesign was already an option in Round 3. What stood behind it was four direction rows
and a six-item list, which is not enough to land a result that stands against studio work.

**New reference** — `design.md`. The weak point was the process, not the vocabulary: designs
get agreed **in adjectives**, and three different pictures stay in three heads until the first
screen appears. Two fixes, both now steps rather than advice.

**Gather references first.** Three to five sites they admire — not competitors — plus one they
dislike. Then say *why* each works in specific terms: face pairing, section padding, photo
treatment. That converts taste into decisions you can be held to.

**Comp before committing.** Build the hero and one section in two or three genuinely distinct
directions, with real copy and real photography, and deploy them to staging. Choosing from a
screen instead of from adjectives is what stops a direction changing after twenty pages exist —
and the token layer makes a direction a variable set rather than a rebuild, so it is an
afternoon. It is now part of the phase 3 gate, recorded under `Locked`.

Then depth on what actually separates expensive from templated, ranked — typography, space and
photography are most of it — plus a twelve-item checklist to run against your own work, and an
honest section on when premium is the wrong goal: emergency trades, price-led positioning, and
briefs that need photography nobody has budgeted.


## 2026-08-03 — features that need a decision

**New reference** — `features.md`. The catalogue in `kickoff.md` §2 carried these as one-line
checkboxes, which is right for most of it and wrong for the five where the *yes* has a shape.

- **404** — the failure is not that it looks plain, it is that it returns 200. A soft 404 gets
  indexed, and nothing reports it
- **Search** — page versus instant are different builds, decided first. Pagefind is the
  static-first default; it indexes `dist/` and needs no service or key
- **Light / dark / auto** — **three** states, not two: a two-state toggle strips the ability to
  follow the OS, which is what most people want. The flash of the wrong theme is a blocking
  inline script in `<head>`, `color-scheme` is the line people miss, and
  `:not([data-theme='light'])` is the second bug after the flash
- **Multilingual** — decided before routes, never after; on a migration it re-plans every
  redirect too. URL strategy, reciprocal hreflang, and `x-default`
- **Keyboard shortcuts** — default no. A command palette is application furniture. The skip
  link, Escape-closes and focus-return are the ones that are not optional

Nothing here ships in the template, and `CLAUDE.md` now says why: a template that shipped these
would decide them for every site built from it, which is the same reason it has no design.


## 2026-08-03 — a real browser, and the prerequisites nobody wrote down

**`stacks.md` §1c — use Chrome with the Claude extension.** The kit told you Wix needed "a
headless browser" and never said which, and every verification in it was curl and status codes:
**nothing visual was checked anywhere.** A page can build clean, return 200 and render broken,
and the kit had no step that would notice.

The browser covers three things curl cannot: JS-rendered sources where the response is an empty
shell, computed styles for design extraction, and whether the page actually looks right. It runs
in the user's existing Chrome session, so it also reaches authenticated dashboards — Search
Console, GA4, the old WordPress admin — that nothing else here can read. Stated limits too: not
a substitute for a real device, for Lighthouse, or for a screen-reader pass.

**Definition of done gains visual and console/network rows.** A blocked third-party script or a
404 asset is invisible to a status-code sweep.

**Prerequisites, which were never written down.** `wrangler login` was assumed by every command
in getting-started without being mentioned. Now split into what to install (Node 22.12+, Chrome
+ extension, a Cloudflare account, git) and what has **lead time** — DNS access proven by
logging in, SPF/DKIM/DMARC propagation, moving Search Console verification to DNS TXT, TTL
lowered 24h ahead. Those are the ones that become launch-day emergencies.


## 2026-08-02 — template data leak fixed, docs completed

**Fixed: the template shipped the previous client's data in 11 files**, including live GTM and
GA4 IDs in `src/data/site.ts`. Every site built from it would have sent a real business's
traffic to `expressducttest.com`'s properties — building green, deploying clean, reporting
nothing wrong. Also leaked: category taxonomy, footer and CTA copy, service options, the web
manifest, the CSV export filename, and structured-data catalogue naming.

`site.ts` now emits **no tag at all** unless both IDs are set, so an unset ID can never fall
back to someone else's container. Copy is driven from `business.ts` rather than replacing one
hardcoded string with another.

**Fixed: `template/CLAUDE.md` promised three docs that did not exist.** Now written —
`docs/runbook.md` (setup, verification matrix with real commands, go-live order, first-week
watch), `docs/content.md` (editing guide, including the accessibility rules a build cannot
check) and `docs/traps.md` (seeded with this codebase's silent failures, plus a section to add
the ones you hit). These are the handover, pre-written.

**Template gains** `src/pages/accessibility.astro` — the statement as a required published
artefact, footer-linked from every page, with the dates and known-gaps list a build cannot
fill in for you — plus `.pa11yci.json` and `npm run a11y` over one URL per template family
(via `npx`, not a dependency).

**Build phase 8 is now "deploy and go live"** with the cutover in order — TTL down 24h ahead,
prove DNS access, move Search Console verification to DNS TXT, verify staging, deploy, cut
over, remove the staging route, verify production, one real enquiry end to end — plus a new
**8b · First week**, because every post-launch failure is silent: a 301 landing on a 404, a
changed sitemap filename, analytics recording nothing.

**Docs deduplicated.** `getting-started.md` is install and mechanical setup; `how-to-start.md`
is the real project arc, day one to a month after launch, with what actually stalls builds
ranked by frequency.

## 2026-08-02 — compliance, source import, integration inventory

**New reference** — `compliance.md`. Which accessibility law binds a given client (ADA Title II
and III, Section 508, Section 504, EAA, the Web Accessibility Directive, PSBAR, AODA, and the
national ones clients name), the single target that satisfies all of them, what a marketing site
actually fails, the accessibility statement as a required published artefact, what counts as
evidence, and eight accessibility failures that survive a clean axe run.

Dates verified August 2026 and sourced inline — **two US deadlines moved a full year during
2026** (ADA Title II to April 2027/2028, HHS Section 504 to May 2027/2028), which is why §1
carries source links and a re-verify instruction.

**Target: WCAG 2.2 AA regardless of jurisdiction.** It is a superset of 2.1 and 2.0, so one
target covers every row and survives a client entering a new market. Overlays are a documented
no — 22.6% of US web accessibility filings in H1 2025 targeted sites that had one installed.

**Discovery gains a Round 0** — *is there anything to import?* Asked on its own, before
anything else, because the answer forks every question after it and clients forget to mention
a site they already have. Covers a lost origin via the Wayback CDX API.

**`stacks.md` §1b — the integration inventory.** The builder decides how you extract; the
integrations decide what you must not break. Grep commands to detect analytics IDs, third-party
origins and form actions from the crawled HTML, a table of what each integration forces you to
preserve, and the three questions per integration — starting with *who owns the account*, which
blocks go-live more often than anything technical.

**Recon now also produces an accessibility baseline**, reported per template family rather than
per URL, so it reads as a scope statement instead of a CSV.

**Credential retrieval.** When an integration is detected but its ID is not, `stacks.md` §1b
gives the client one message: what to fetch, the exact click path, and the official docs link —
with the three caveats that come back a week later (live keys not test, domain-bound
credentials must be re-registered rather than copied, never in chat or the repo).

**`stacks.md` §1c — paths you must not change.** Search Console stores the sitemap URL that was
submitted. WordPress emits `/sitemap_index.xml`; `@astrojs/sitemap` emits `/sitemap-index.xml` —
**the underscore becomes a hyphen**, which reads as identical and is not. Same for verification
files, `ads.txt`, `/feed/` and `/.well-known/`. Detection commands included.

**`compliance.md` §10 — beyond accessibility.** What the sector and location pull in (PCI, HIPAA,
GDPR/CCPA, ePrivacy, CAN-SPAM/CASL, COPPA, GLBA, FERPA) and, the commonly missed one, what a
profession may *say* — bar advertising rules, medical board rules, financial promotions.
**Offered as a choice, never assumed.**

**Definition of done** gains six rows: automated a11y, contrast at the token level, reflow at
320px and 400%, a screen-reader pass per template family, form error association, and the
published statement.

**New reference** — `archetypes.md`. Page shape for landing, local services, multi-location,
professional services, product/SaaS, corporate and editorial/portfolio: section order, proof
model, where conversion sits, and the failure mode for each. **Pick from the win, not the
industry** — a clinic running one campaign is a landing page; the same clinic's main site is
professional services.

It decides structure, never appearance — the visual direction stays independent in `kickoff.md`
Round 3, so the kit does not converge every site on one look. **E-commerce stays refused**, but
the refusal is now actionable: four situations and what to do in each, including the
Stripe-Payment-Links case that does stay inside the kit.

**`BUILD-STATE.md`** — written at every gate, holding gates passed, locked decisions, the
integration disposition, open items (`!` blocking, `?` question) and what is next. A build spans
more sessions than a context window holds, and a decision that exists only in chat history is one
that gets silently reversed. Deleted at handover; it is a working file, not a deliverable.

## 2026-08-01 — initial

Extracted from the expressducttest.com rebuild (WordPress/Elementor → Astro 7 + Cloudflare
Workers), itself building on getmiohome.com.

**Skill** — `website-build`, with four references: discovery, stacks and providers, build
method, traps.

**Template** — Astro + Cloudflare skeleton that builds green from a clean clone: media
pipeline with dimensions manifest, design tokens with a semantic dark layer, form endpoint
writing to KV before the email provider, token-protected CSV export, environment derivation
from one build variable, CI guard against environment-less builds, SEO and JSON-LD from a
single data file.

**Traps** — 20 entries. The ones most likely to recur:

- Scoped styles do not reach a class passed *into* a component
- A persisted element's handlers outlive the elements they captured, so anything the router
  replaces goes stale silently after one client-side navigation
- Adapters auto-provision bindings with no id, which works exactly once
- `justify-content: center` makes overflowing content unreachable
- DNS negative caching outlives the fix
