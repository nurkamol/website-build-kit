# Adding to the kit

Queued candidates, ranked, are in [roadmap.md](roadmap.md). Everything there is subject to the
bar below.

The kit is meant to accumulate. Four things grow: traps, provider knowledge, template pieces,
and the compliance map.

## Adding a trap

`skills/website-build/references/traps.md`.

**The bar: it failed silently on a real build.** Clean build, clean types, clean deploy,
wrong result. Not "this is good practice" — something that looked fine and was not. If a
compiler, a linter or an obvious error message would have caught it, it does not belong.

Write it as:

```markdown
### One-line statement of the failure

What happened, in the words someone would use while confused by it.

*Symptom:* what you actually observe — this is what makes it findable later.

*Fix:* the change, and why that is the right one rather than a workaround.
```

Include a detection command where one exists. Future-you will not remember the regex.

## Adding a provider or stack

`skills/website-build/references/stacks.md`.

Every entry needs three things: **when you would pick it**, **what picking it costs**, and
**how it compares to the default**. An option with no stated cost is marketing copy.

Do not add something you have not shipped. The kit's value is that its recommendations have
been through a real deploy.

## Adding an archetype

`skills/website-build/references/archetypes.md`.

Four things or it does not go in: **section order**, **proof model**, **where conversion sits**,
and **the failure mode**. Three of the four is a description of a website, not a decision anyone
can act on.

The hard line: **archetypes describe structure, never appearance.** Section order is structure.
"Serif display against a neutral sans" is appearance and belongs in `kickoff.md` Round 3. The
moment this file starts specifying how things look, every site built from the kit converges on
one design — the same reason the template is a skeleton and not a theme.

Add one when you have shipped it. A shape nobody has built is a guess with a diagram.

## Adding to the design reference

`skills/website-build/references/design.md`.

It carries two kinds of thing, and both have a bar.

**Process** — only what changes the outcome. "Comp two directions on staging" earns its place
because it replaces a three-week revision cycle. "Make a moodboard" does not, because the
moodboard is not what was missing.

**Tells** — a specific, checkable observation, not a preference. "Cramped is the tell of a cheap
site" is one; "use good spacing" is not. If it cannot go on the checklist as something you
could look at a page and answer yes or no to, it is not a tell. See `design.md` §3.

This file describes *why* something reads as expensive. It never prescribes a look — the moment
it names the hex, it has become a design system, and every site built from the kit converges.

## Adding a feature entry

`skills/website-build/references/features.md`.

Only for features where **the yes has a shape** — where choosing to build it opens a decision
that costs a rebuild if taken wrongly. Search is here because page-versus-instant are different
builds. Reading time is not, because there is nothing to get wrong.

Each entry needs the default marked, the condition that changes it, and the specific thing that
goes wrong. "Consider dark mode" is not an entry; "it is three states, not two, and the flash on
load is a blocking inline script" is.

Nothing here ships in the template. A template that shipped these would be deciding them for
every site built from it, which is the same reason it has no design.

## Updating the compliance map

`skills/website-build/references/compliance.md`.

**This is the one part of the kit that goes stale on its own.** Everything else is only wrong
if you wrote it wrong; `compliance.md` §1 becomes wrong because a regulator moved a date. Two US deadlines
shifted by a full year during 2026 alone.

- **`compliance.md` §1 dates and thresholds carry a source link and a checked-on date.** No exceptions — an
  unsourced date in a compliance table is worse than no date, because it gets quoted to a client
- **Re-verify `compliance.md` §1 before quoting it**, and update the checked-on line when you do
- **The target in `compliance.md` §2 does not move.** WCAG 2.2 AA is a superset of everything in `compliance.md` §1; a new
  jurisdiction is a new row, not a new target
- **`compliance.md` §5 earns entries the same way traps do** — a criterion that failed on a real build, with
  where the fix belongs. Not a transcription of the WCAG spec, which already exists and is better
- **`compliance.md` §8 is `traps.md`'s bar applied to accessibility**: clean build, clean axe run, still broken

Do not add a jurisdiction speculatively. A row nobody has had to satisfy is a row nobody has
checked.

## Adding to the template

Only if it is genuinely reusable and hard to get right. The test: *would you write this from
scratch on the next project, and would you get it wrong the first time?*

- **Yes** — media pipeline, form endpoint, environment derivation, token system
- **No** — a hero layout, a testimonials section, anything design-shaped

The template is a skeleton, not a theme. Design belongs to each project; if it accumulates
opinions about how a page should look, every site built from it starts looking the same.

After any template change:

```bash
cd template && rm -rf node_modules dist .astro && npm install && CI=true npm run build:staging
PUBLIC_SITE_ENV=staging npm run check      # 0 errors
npm run tells                              # must say "fresh template"
cd .. && npm run test:gates                # every gate still refuses bad input
```

**A new gate ships with its refusal case.** `test:gates` runs each one against a fixture
carrying the failure and asserts it exits 1 — not only that clean input exits 0. A gate
proven to pass and never proven to fail is indistinguishable from one that cannot fail,
which is what `check-env.mjs` was for a whole client project.

It must build green from a clean clone with no content, no images and no secrets.

**Then the provenance sweep in `CLAUDE.md`, which is the authority — run it, do not
approximate it.** It checks first that every file is *readable* by the sweep (a single NUL byte
makes a source file binary, and `grep -I` skips those — that is how a script full of a client's
brand stayed invisible for two commits), then greps for the shapes client data takes rather
than for a list of names. A denylist only tests for the mistakes you already made.

## Adding a new skill

```
skills/<name>/
├── SKILL.md          # frontmatter: name + description. Keep it short.
└── references/       # detail, loaded only when needed
```

The `description` is what makes it trigger — write it as the situations it applies to, not
as a summary of its contents. Then `./install.sh` and it is live.

Split a skill out when it stands alone. `website-build` covers building a site; something
like `seo-audit` or `local-listings` would be its own skill that the build can reference.

## House style

Written to be read by someone tired and mid-problem.

- Say the thing, then the reason. Never the reason first.
- Prefer a table to a list when there is a repeated shape.
- Mark defaults explicitly (✅) so scanning works.
- No hedging. "Use Turnstile" beats "you may want to consider Turnstile".
- Every claim that could be measured, should be. "It costs ~160ms of LCP" beats "it is slow".
