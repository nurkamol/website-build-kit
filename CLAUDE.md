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
number and a contact email were committed to this public repo and published that way. No
pattern above looks where they landed.

```bash
git ls-files template/ | grep -E '^template/(recon|shots)/' | head   # must print nothing
git status --porcelain --ignored template/ | grep -E 'recon|shots'   # ignored, not tracked
```

The lesson is the method, not the list: **a denylist tests for the mistakes you already made.**
Ask instead what shape a client's data takes — a colour, a face, a place, a number, a claim, a
clock — and grep for the shape.

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

**If you add a gate, add its refusal case.** A gate with only a passing test is the
state this catches. `verify`, `recon`, `shots`, `console`, `reflow` and `dns` are
deliberately not covered — they need a deployed site, and a stub convincing enough to
exercise them would need more maintenance than the scripts do.

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

## After changing any documentation

```bash
npm run audit:docs
```

Resolves every `§` reference, every `npm run`, every quoted path and every `business.`/`site.`
field across every markdown file, and fails on drift. It found a reference to a table that no
longer existed, a section number that had moved, and a pointer to `prompts/website-build.md`
from a kit structure that has not existed for months — all of which read as correct.

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

## After changing the landing page

`site/` is hand-written, self-contained HTML, and **not** built with the template. The template
targets Cloudflare Workers — KV bindings, `_headers`, `_redirects`, an SSR adapter — none of
which GitHub Pages serves, so dogfooding it there would mean fighting the adapter to publish one
static page.

It is still held to the kit's own bar, and `.github/workflows/pages.yml` gates on both before
deploying: **pa11y-ci at WCAG 2.2 AA**, and **no second scroll axis at 320px**. Two things that
got through review and were caught only by running those:

- a decorative glyph in an `aria-hidden` `<span>` made axe report `color-contrast` as *needing
  review* on every row. The fix was to stop making a decorative marker a DOM text node at all
- `minmax(21rem, 1fr)` in a `repeat(auto-fit, …)` track is wider than a 320px viewport, so the
  page gained a second scroll axis. `minmax(min(21rem, 100%), 1fr)` is the form that shrinks
- a muted grey passed contrast locally and failed in CI, because local Chrome was in **dark**
  mode and the runner was in light: 4.83:1 dark, **3.91:1 light**. A palette with two schemes
  has two sets of contrast pairs, and testing one proves nothing about the other. The workflow
  now runs pa11y twice with `--force-prefers-color-scheme`

The copy buttons follow the same two rules the template does. They are **created by the
script**, never present in the markup and revealed by CSS — a control that looks live with
JavaScript off is worse than no control. And the live region they announce into is **in the DOM
from first paint**, because a region injected at announce time is not observed and announces
nothing (`traps.md` has the entry).

And one that only **looking** caught, after both gates were green: `display: grid` on a list
item makes every inline child its own grid item, so an `<em>` mid-sentence is torn out of the
text flow and the words render overlapping.

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
