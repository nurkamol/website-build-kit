# Working on this repo

This is the **kit itself** — a method for building marketing sites, not a site. If you are
building a site, you want the `website-build` skill; this file is about maintaining it.

## What lives where

```
skills/website-build/SKILL.md         short. what to do, in order
skills/website-build/references/      the detail, loaded only when needed
  kickoff.md    source import, discovery rounds, feature catalogue, design tokens, mobile
  stacks.md     migration playbook per builder; integration inventory; every provider + default
  archetypes.md page shape per site type — section order, proof model, failure mode
  features.md   404, search, light/dark/auto, i18n, shortcuts — decisions with a shape
  design.md     full redesign — the comp process, expensive vs templated, the tells
  build.md      standing instructions, phases with gates, definition of done
  compliance.md which accessibility law binds this client; what to build, test, publish
  traps.md      silent failures, with symptom and fix
commands/       slash-command entry point
template/       Astro + Cloudflare starter — must build green from a clean clone
docs/           for humans using or extending the kit
```

`SKILL.md` stays short. Detail goes in a reference — the point of the split is that the
model loads what it needs, not everything.

## The bar for each kind of change

**A trap** — it failed **silently** on a real build. Clean build, clean types, clean deploy,
wrong result. Not "this is good practice". If a compiler, linter or obvious error message
would have caught it, it does not belong.

**A provider or stack** — needs three things: when you would pick it, what picking it costs,
and how it compares to the default. Do not add something you have not shipped.

**An archetype** — section order, proof model, where conversion sits, and the failure mode. All
four, or it is a description rather than a decision. It describes **structure, never
appearance** — the moment it specifies how something looks, it belongs in the design direction
in `kickoff.md`, and the template stops being a skeleton.

**A design entry** — process only if it changes the outcome; tells only if they are checkable
by looking at a page. It explains why something reads as expensive and never prescribes a look —
name a hex and it has become a design system.

**A feature entry** — only where the *yes* has a shape: a decision that costs a rebuild if
taken wrongly. Needs the default, the condition that changes it, and the specific failure.
Nothing in `features.md` ships in the template, for the same reason the template has no design.

**A compliance entry** — `compliance.md` §1 dates and thresholds need a source link and a checked-on date, or
they do not go in. This is the only file that goes stale without anyone touching it; two US
deadlines moved a full year in 2026. `compliance.md` §5 and §8 take entries on the same terms as a trap: it
failed on a real build. Do not transcribe the WCAG spec — it exists and it is better.

**A template addition** — would you write this from scratch next project, and would you get
it wrong the first time? Media pipeline yes. Hero layout no.

The template is a skeleton, not a theme. If it accumulates opinions about how a page should
*look*, every site built from it starts looking the same. Two hard tests before anything
lands in `template/`:

- **Could the template render a page that looks finished?** If yes, it has a design and the
  next project inherits it. It ships with a grey placeholder ramp, no typeface, no home page
  and no hero treatment; `npm run tells` enforces that they are cleared together
- **Is the entry structure, behaviour or plumbing?** A focus trap, a `dvh` panel, a busy state,
  the KV-before-provider ordering — those are things you would get wrong. A card style, a
  gradient, a nav hover, an icon depicting the trade — those are things you would *choose*

`global.css` carries interactive **states**, never a look. `.btn` exists so nobody ships a
control missing `:disabled`; the moment it grows a pill radius and a hover lift, it is a theme.

**Provenance stays out of `template/`.** No colour sampled from a specific client's old theme,
no client's typeface, no trade-specific icon set, no storage key or phone number from a real
build — including inside a JavaScript error string, which is where one hid for two projects.
Name the build a *lesson* came from in the skill references; never leave its artefacts in the
starter.

## After changing the template

```bash
cd template && rm -rf node_modules dist .astro && npm install && CI=true npm run build:staging
PUBLIC_SITE_ENV=staging npm run check             # 0 errors
npm run tells                                     # "fresh template", tells under three
npm run check:sitemap                             # no-op on staging, must still exit 0
```

Must build green with **no content, no images and no secrets**. That is the promise; a
starter that needs setup before it compiles is not a starter.

`npm run tells` on a clean clone must report **"fresh template"** — all placeholders present,
none cleared. A half-cleared state means something ships a design decision it should not.

### Then the provenance sweep

**First, make sure every file is actually readable by the sweep.** `grep -I` skips binary
files, and a single NUL byte makes a source file binary. One script used NUL as a string
sentinel and was therefore invisible to this check while containing a client's entire brand —
palette, both typefaces, base64-encoded. It sat there for two commits.

```bash
file scripts/*.mjs scripts/lib/*.mjs | grep -v 'text'      # must print nothing
```

**Then sweep by category, not by name.** A denylist of past clients cannot catch the next one.
These are the shapes client data actually takes; expect false positives and read them.

```bash
grep -rnoE '#[0-9a-fA-F]{6}' scripts src | grep -v 'tokens.css'   # a brand hex outside tokens
grep -rniE "font-family:[^;]*'[A-Z]" src scripts                  # a named typeface
grep -rnE '[A-Z][a-z]+, ?[A-Z]{2}\b' src scripts                  # Town, ST
grep -rnE '\(?[0-9]{3}\)? ?[0-9]{3}-[0-9]{4}' src scripts         # a phone number
grep -rnoE "'[A-Z][A-Za-z]+(Business|Service|Store|Practice)'" src  # an industry schema type
grep -rnoE "'[A-Za-z]+/[A-Za-z_]+'" src/lib src/data              # a hardcoded IANA timezone
```

**Every one of those has caught something real, and the first and last caught it *after* the
name-based grep had been passing for months.** `HVACBusiness` was hardcoded in the
organisation schema for two projects, so every site built from the template declared itself a
heating company to Google. The lead-notification email carried a green palette and
`America/Los_Angeles` — so every enquiry was stamped in a previous client's timezone, which is
a plausible wrong time nobody re-reads.

**Then check for a client's data as a *directory*, not a string.** Every grep above reads
`src` and `scripts`. Testing `recon` or `shots` means running them, and both write a real
client's material into `template/` — 18 crawled pages carrying a postal address, a phone
number and a contact email were committed to this public repo and published that way. `recon`
now also creates `client-files/`, where an owner's whole backup is meant to land. No pattern
above looks where any of them landed.

```bash
git ls-files template/ | grep -E '^template/(recon|shots|client-files)/' | head   # must print nothing
git status --porcelain --ignored template/ | grep -E 'recon|shots|client-files'   # ignored, not tracked
```

The lesson is the method, not the list: **a denylist tests for the mistakes you already made.**
Ask instead what shape a client's data takes — a colour, a face, a place, a number, a claim, a
clock — and grep for the shape.

**And the names, by machine, on every commit — including the message.**

```bash
git config core.hooksPath .githooks     # once per clone: pre-commit + commit-msg
npm run check:privacy                   # every tracked file + HEAD's message, as CI runs it
```

`scripts/check-privacy.mjs` reads the clients' names and domains from **`.privacy-patterns`** —
untracked and gitignored, one regular expression per line, in the main checkout so every worktree
shares it — and from the **`PRIVACY_PATTERNS`** environment variable, which `kit.yml` fills from
the repository secret of the same name (and on a push refuses to run with none, because a clean
result from zero patterns means nothing was looked for). It also refuses any email address
outside the placeholder domains, and a `.privacy-patterns` that is tracked or not ignored. It
prints the file, the line and the pattern's **number**, never the matched text — a CI log on a
public repo is public.

It is the floor, not the method. It is exactly the denylist the paragraph above warns about, and
it is here for the two things the shape sweep cannot do: run unattended on every commit, and read
the **commit message**, which is published too and which no grep over `src` and `scripts` ever
sees. Never commit a real pattern, including into a test — the cases in `test:gates` use
synthetic names.

**A hardcoded route list is provenance too.** `check-reflow.mjs` carried one studio's routes
and passed happily while testing pages that did not exist. Scripts discover routes through
`scripts/lib/routes.mjs`; if you add one that needs a route list, use that.

## After changing a script

```bash
npm run check:refs
npm run test:gates
```

`check:refs` proves an identifier is imported. `test:gates` proves the check still
**does** something — it runs each gate against a fixture carrying the failure and
asserts it exits 1, not just that a clean fixture exits 0.

That second half is the point. `check-env.mjs` passed every deploy on a client project
while matching nothing, and `tells.mjs` counted `dist` CSS as well as source, so one
rule counted three times and a `> 2` threshold could never be cleared. Both were valid,
importable, working-looking code, and both read as checks that ran.

**A case that fails only on CI is a timing assumption — find it, never retry it away.** Two did in
November 2026, and neither was a slow runner being slow. `match` read a headline that rewrites its
own words at whatever second each side finished, so a Windows runner compared two different words;
the lightbox driver clicked 300ms after a client-side navigation, and on a busy Ubuntu runner the view
transition's overlay was still up and swallowed the click. `test:gates` now prints the lines a script
flagged when a case exits wrong, which is what found the first; `KIT_SLOW=6` slows the lightbox
driver's page — script and animations, view transitions included — which reproduced the second
every time. CPU throttling alone did not: a view transition runs on the compositor's clock.

**If you add a gate, add its refusal case.** A gate with only a passing test is the
state this catches — and `test:gates` now *enforces* it: it enumerates every template script
that can exit 1, subtracts the ones it covers, and fails if what remains is not listed in its
`UNCOVERED` map with a reason. It also fails on a stale entry — one naming a script that no
longer exists, or one that is now covered.

That ledger is mechanical because the prose version was wrong twice: first excusing everything
as "needs a deployed site" when `staging-headers.mjs` was entirely offline, then still omitting
`redirects.mjs` and `extract.mjs`. A sentence cannot be checked.

⚠ **And "needs a deployed site" was itself wrong for a third time — as the ledger's own reason
string, on every entry.** It had been copied from the first script it was written for. Sorted
honestly: six of them need a **browser** (which can point at localhost perfectly well), `dns`
needs a live zone, `indexnow` submits to real search engines, and **`verify` needed neither — it
takes a URL**, which is not the same thing as needing a deployment. `verify.mjs` is 1,069 lines
deciding go-live and it had no case proving any of its three `exit(1)` paths still fired.

`scripts/fixture-site.mjs` serves a deliberately faulty site on localhost so it can. **A wrong
reason in a ledger is worse than a missing entry, because it reads as a decision someone made.**
When adding an entry, name the *actual* blocker.

⚠ **Then "needs a browser" turned out to be a reason too, and it cost the most so far.** A
browser points at localhost, so all six are now covered against the same fixture — and two of
them, `md-to-pdf` and the usage paths of `shots`, never needed a server at all. Writing those
cases found `check-a11y` forcing the colour scheme with **`--force-prefers-color-scheme`, which
is not a Chrome switch**. Chrome ignores flags it does not know in silence, so both passes
measured whatever scheme the machine was in — light twice on a CI runner — while printing
*"clean in light and dark"*, and `a11y:evidence` wrote that sentence into a dated compliance
pack. **The dark palette of every site built from this kit was unmeasured by the gate that
reported measuring it**, and by the pack a client would be handed.

Two things follow from that, and both are now rules here:

- **A flag is not a mechanism.** `--blink-settings=preferredColorScheme=<ordinal>` replaces it,
  and `assertForced()` reads the media query back out of a real page before either script
  measures anything. An ordinal can go quiet exactly the way a flag name did; the assertion is
  what makes it safe, not the switch.
- **A fix that cannot reach a delivered site is half a fix.** The template is copied, not
  linked, so `check:drift` gained **D9** — a site carrying the dead flag reports drift, and the
  state it names is *present and inert*, which is worse than missing because nobody re-checks a
  tick.

A script can use a name nothing imported and still pass `node --check` — an
undefined identifier is valid syntax. `npm run recon` shipped that way and threw
`ReferenceError: PRESERVED is not defined` on line 302, after the whole crawl,
on a user's first command. `astro check` does not read `.mjs`, and CI cannot run
`recon` because it needs a live site.

**Windows is a supported target and is easy to break from a Mac.** `execFileSync`
cannot resolve `npx` there — it is `npx.cmd` — so anything spawning it needs
`shell: process.platform === 'win32'`, and a `brew install` hint is a dead end
rather than a hint. Both shipped and both are fixed; the pattern is what to
watch for.

**A third shipped and was found by reading, not by running.** `build:staging` and
`build:production` set their environment with POSIX inline assignment —
`PUBLIC_SITE_ENV=staging astro build`. npm on Windows runs scripts through
**cmd.exe**, where that is a command name rather than an assignment, so the two most
important commands in the kit did not work at all on a platform the README claims to
support. Every CI job ran on ubuntu.

⚠ **Never put an environment variable inline in an npm script.** `scripts/build.mjs`
takes the environment as an argument and sets it once — which also removed the
four-way repetition of `PUBLIC_SITE_ENV=production` in one line, where missing one
copy silently mixes environments. **`kit.yml` now runs on `windows-latest` as well**,
because this class has shipped three times and reading for it has not worked.

## After changing any documentation

```bash
npm run audit:docs
```

Resolves every `§` reference, every `npm run`, every quoted path and every `business.`/`site.`
field across every markdown file, and fails on drift. It found a reference to a table that no
longer existed, a section number that had moved, and a pointer to `prompts/website-build.md`
from a kit structure that has not existed for months — all of which read as correct.

⚠ **It resolves paths against the WORKING TREE, so a generated directory can make a bad reference
pass locally and fail in CI.** A trap entry quoting a path under the generated image directory
passed here and failed on both runners: the rule allows a path whose *parent* exists, and this
machine had that directory left behind, untracked and empty, by a `npm run media` test. Same
commit, opposite verdicts. **I then made the identical mistake writing this warning**, by quoting
the offending path inside it. If the
audit disagrees with CI, clone into a temp directory and run it there before believing your own
tree — and remember an empty directory is invisible to `git status`.

It also checks the **inverse**: a script that ships and is named in no builder-facing doc, and a
`references/*.md` that `SKILL.md` never points at — a reference nothing points at is one the
model never loads, which makes it invisible rather than untidy. `CHANGELOG.md` and `roadmap.md`
do not count as documentation; a feature named only there has not been explained to anybody.

**Whether the README is *complete* is a judgement and is printed, never failed.** It currently
names every template script, so the block is silent; it reappears the moment one ships without
a mention. It stays advisory rather than a gate because what belongs in the README is a
judgement — a bullet that cannot say what failure the script prevents is padding, and a gate
would demand it anyway. If it fires, either write the bullet or decide the omission is right.

## After changing the template, if you are publishing the scaffolder

`create/` has no committed copy of `template/` — `prepack` copies it in and `postpack` deletes
it again, so the package cannot ship a stale duplicate. Publishing is therefore always from a
clean tree:

```bash
cd create && npm publish        # prepack copies template/, postpack removes it
```

**npm strips `.gitignore` from published packages.** It ships as `gitignore` and the CLI renames
it back. That is not cosmetic: the template's `.gitignore` is what keeps `.dev.vars` — holding
`BREVO_API_KEY` and the leads export token — out of the repository. `prepack` refuses to pack if
`.dev.vars`, `node_modules` or `dist` reach the staging copy, and the CLI exits rather than leave
a scaffolded site without a `.gitignore`.

⚠ **`prepack` copies what `git ls-files` reports, never the working tree.** It used to use a
denylist — `node_modules|dist|.astro|.wrangler|recon|shots|.dev.vars` — and `template/docs/handover.pdf`
walked straight past it into a pack. That file is *ignored* by `template/.gitignore`, but the
ignore file is renamed to `gitignore` for publishing, so npm stops honouring it. The PDF was the
placeholder, so nothing leaked; the same path ships a **real client's rendered handover** from any
machine that has run `npm run handover`. A denylist tests for the mistakes you already made — git
already keeps the correct list, so ask git.

## Publishing to npm

Releases go out through `.github/workflows/publish.yml` on a published GitHub release, using
**npm trusted publishing** — OIDC, no token. That is not a preference: the first publish failed
with `E404 Not Found - PUT`, which is npm's disguise for "not authenticated" (it returns 404
rather than 401 so publish cannot probe which names exist), and the cause was an expired token
in `~/.npmrc` that nothing had reported.

The gates run **before** the publish step in that workflow, because a published version cannot
be replaced — `npm unpublish` is refused after 72 hours and the same version number can never
be reused.

To publish by hand instead, the tree must be clean: `prepack` copies `template/` in and
`postpack` removes it, so a dirty tree ships whatever is on disk at that moment.

### ⚠ Then update the Agensi listing, by hand, from the tag

The skill is also listed on [Agensi](https://agensi.io/), and **a listing is an upload rather than
a link to this repo** — confirmed by them: the file structure has to be standard for their MCP
server to read it, and there is no API for updating a listing. So it is a COPY, of exactly the kind
`check:drift` exists because of.

That makes it a release step, not a one-off:

- upload from the **tag**, never from `master`, or the listing is a version that exists nowhere
- put the version in the listing text, so a reader can tell what they have
- a stale copy of this skill is worse than no copy — its value is that the traps and gates are
  current, and an old one gives specific, confident advice about failures that have since been
  fixed, with nothing to say so

The one thing that needs no watching: they use the skill's `description` **verbatim**, because
trigger behaviour depends on it. That string is the whole trigger, so a rewritten one would change
when the skill fires rather than just how it reads.

⚠ Like the GitHub social preview, this has no API and is therefore the step that gets forgotten.

## The audit runs on a schedule, not only on push

`.github/workflows/audit.yml` asks `npm audit --omit=dev` every Monday, against
`template/package-lock.json` with `--package-lock-only` — no install, seconds to run.

⚠ **It exists because `kit.yml` only asks when somebody commits.** Three times in six weeks that
step went red for a reason that had nothing to do with the commit under it: a critical Astro RCE
through AVIF, ten `undici` advisories through `wrangler → miniflare`, and `sharp` <0.35.5. Each one
read as a broken build and was not. **A red audit step is not evidence that the last commit did
something** — ask first whether the advisory is newer than the code. On a schedule the two are
separable: a failure there is the world moving, a failure in `kit.yml` is this repository moving.

**The lockfile is the thing that ships.** `prepack` packs `template/package-lock.json`, so a new
site inherits those exact versions — a site scaffolded from 0.1.21 reported a **high** before
anybody had written a line of code. That is why the schedule audits the lockfile rather than an
install.

A failing scheduled run emails the repository owner, which is all it does on purpose: opening an
issue needs write permission and a bot identity, and an inbox on a Monday is enough.

## After changing the landing page

```bash
cd site && npm ci && npm run build   # hex palette → client build → SSR build → prerender
npm run audit:docs                   # includes the failure count claimed on the page
npm run cards:brand                  # regenerate both share cards if that count moved
```

**The number in the headline is not decorative.** The page claims a count of documented silent
failures in five places — meta description, `og:description`, `twitter:description` and the
JSON-LD in `site/index.html`, and the body copy in `site/src/App.jsx` — and both share cards bake
it into pixels. It is defined as **`traps.md` entries + `compliance.md` §8 entries**, `audit:docs`
fails when any of them disagrees, and `cards:brand` reads the same two files rather than
restating the number.

That definition exists because the previous number, 46, could not be reproduced from anything:
the plausible sources gave 30, 35, 49 and 57 at the commit that introduced it. Nothing goes stale
as quietly as a number — it stays plausible forever and no reader can tell.

⚠ **GitHub's social preview has no API.** `cards:brand` writes the file; uploading it is
Settings → General → Social preview, by hand.

`site/` is **React and Cloudflare's Kumo, prerendered at build** — every word is in
`dist/index.html`, so crawlers read it and it works with JavaScript off; React hydrates the same
markup. It is not built with the template, which targets Cloudflare Workers — KV bindings,
`_headers`, `_redirects`, an SSR adapter — none of which GitHub Pages serves. The showcase
screenshots in `site/public/showcase/` are the build console running against an **invented**
demo site; a screenshot of a real client's build would publish their state, so retake them the
same way. `site/brand/` stays where it is rather than in `public/`: the README packaged with every
published npm version loads the logo from that path on `master`, and those READMEs cannot be
edited.

It is held to the kit's own bar, and `.github/workflows/pages.yml` gates on all of it before
deploying: **pa11y-ci at WCAG 2.2 AA in both palettes**, **no second scroll axis at 320px**, every
asset the `<head>` promises resolving, and page text present in the built HTML. Things that got
through review and were caught only by running those:

- **92 "errors" per palette that were not contrast failures** — and two behind them that were.
  Chrome reports a neutral oklch colour as `oklch(0.97 0 none)`; axe cannot read the `none` hue,
  files every text element as *needs further review*, and pa11y counts that as an error. White on
  black at ~18:1, failing. `site/scripts/hex-palette.mjs` rewrites Kumo's and Tailwind's palette as
  hex on every build — same colours, readable by every checker. Switching the check off would have
  hidden what it then found: **Kumo's subtle grey at 4.27:1 on its own light surfaces** (the
  inactive labels of its `Tabs` among them), now one step darker in light mode only, and a
  headline sitting on a gradient, which no checker can measure — the glow moved behind the
  screenshot, where no text sits
- **The palette is chosen by URL, not by forcing the system scheme.** The page is dark first, so
  the system scheme never reaches the light palette; forcing it would measure dark twice. The gate
  loads `?mode=light` and `?mode=dark`. ⚠ Forcing the scheme had already failed once: for a year
  the old page's workflow passed `--force-prefers-color-scheme`, which is not a Chrome switch —
  Chrome ignores unknown flags in silence, so both runs measured the runner's own scheme while
  the step said it measured two. A URL has no flag to go quiet
- a muted grey passed contrast locally and failed in CI, because local Chrome was in dark mode
  and the runner in light: 4.83:1 dark, **3.91:1 light**. A palette with two schemes has two sets
  of contrast pairs, and testing one proves nothing about the other
- **a flex item's minimum width is its content's.** Kumo's copy-to-clipboard field truncates its
  text, but the text is a flex item, so truncation never engaged and a 768px page scrolled to
  870px. The commands now wrap — a truncated install command hides the part you need to read
- `minmax(21rem, 1fr)` in a `repeat(auto-fit, …)` track is wider than a 320px viewport;
  `minmax(min(21rem, 100%), 1fr)` is the form that shrinks
- a decorative glyph in an `aria-hidden` `<span>` made axe report `color-contrast` as *needing
  review* on every row. The fix was to stop making a decorative marker a DOM text node at all

**No control that looks live with JavaScript off.** Prerendering puts the server's markup on
screen before — and without — React, so the copy buttons, the mode toggle and the showcase tabs
render only once hydrated; until then a command is plain text and the showcase shows its first
picture. The same rule the template follows, for the same reason: a control that does nothing is
worse than no control.

And one that only **looking** caught, on the old page, after both gates were green: `display:
grid` on a list item makes every inline child its own grid item, so an `<em>` mid-sentence is
torn out of the text flow and the words render overlapping.

## After changing a skill

`./install.sh` symlinks by default, so edits are live immediately — no reinstall. Check the
`description` still reads as *the situations this applies to*, not a summary of contents.
That string is the whole trigger.

## House style

Written for someone tired and mid-problem.

- Say the thing, then the reason. Never the reason first.
- A table beats a list when there is a repeated shape.
- Mark defaults explicitly (✅) so scanning works.
- No hedging. "Use Turnstile" beats "you may want to consider Turnstile".
- Anything measurable gets measured. "Costs ~160ms of LCP" beats "it is slow".
- British spelling in prose; code and identifiers stay as the ecosystem writes them.

## What not to do

- Do not add a design system, component library or page layouts to the template
- Do not add a provider recommendation you have not used on a real deploy
- Do not soften a trap into general advice — the specific symptom is what makes it findable
- Do not put an unsourced legal date in `compliance.md`, and do not add a jurisdiction nobody
  has had to satisfy — an unchecked row gets quoted to a client as fact
- Do not let `SKILL.md` grow. Move detail into a reference
- Do not commit `node_modules`, `dist`, `.astro` or `.dev.vars`

## Provenance

Extracted from getmiohome.com and expressducttest.com, both WordPress rebuilds onto Astro +
Cloudflare Workers. When adding something, name the build it came from — it is what
separates this from a listicle.
