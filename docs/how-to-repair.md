# How to repair a site you already shipped

The build side of this starts at [how-to-start.md](how-to-start.md). This page is the other
end: a site that went live months ago, a client who says something cannot be edited, and no
memory of which version of the kit it came from.

[auditing-a-shipped-site.md](auditing-a-shipped-site.md) is the reference — every finding,
what it means, the order to repair them in. **This page is how to begin**, and it assumes you
have never run any of it.

---

## Why a delivered site drifts at all

⚠ **The template is copied, not linked.** Nothing the kit fixes afterwards reaches a site
already built. That is a deliberate trade — the client owns a self-contained repository that
will still build in five years — and its cost is invisible, because nothing reports it.

> **A green build proves the pages render. It proves nothing about the CMS** — the CMS is not
> a page, and the build never renders it.

Audited across twelve delivered projects: seven had a CMS and **six of the seven failed**, two
of them deleting client data on the next save. All twelve built green.

---

## Three ways in

Same checks underneath. Pick by how much you want to type.

**Just say it.** The `site-repair` skill matches on the situation — no command to remember.

```
The client says she can't change the photo on her homepage.
This site went live in March and I don't know what it's missing.
They saved something in the CMS and a whole section vanished.
```

**The slash command**, when you want a report and nothing else. `/media-audit` runs the
checks, reports every row, and stops before offering to change anything.

**Run them yourself**, when you would rather read raw output — see below. Every check is a
plain script that reads and never writes.

---

## Setup, once, about five minutes

```bash
git clone git@github.com:nurkamol/website-build-kit.git ~/coding/website-build-kit
cd ~/coding/website-build-kit && ./install.sh
cd template && npm install
```

⚠ **That last line is not optional and it is the one people skip.** Node resolves a bare
import from the *script's* directory upward, never from the site being audited, so
`check-cms.mjs` looks for `yaml` beside itself. Without it you get
`ERR_MODULE_NOT_FOUND: Cannot find package 'yaml'` and no findings at all.

⚠ **`./install.sh` links each skill directory and each command file individually.** A new one
needs it re-run once — edits inside an already-linked skill never do. This is how `/media-audit`
sat uninstalled for two weeks on the machine it was written on.

---

## Session one — pick one site and only look

**Pick the site whose owner is in the CMS this week**, not the biggest one. Fast feedback on
whether the CMS makes sense to someone who is not a developer is worth more than coverage.

```bash
cd /path/to/the-site
node ~/coding/website-build-kit/template/scripts/check-drift.mjs
node ~/coding/website-build-kit/template/scripts/check-cms.mjs
```

Nothing is copied into the site and nothing is written. Verified against a delivered site
carrying **none** of these scripts: all of them ran, and `git status` reported **0 changed
files**. That matters twice — you are not committing tooling to a client's repository to read
it, and you are running the **current** checks rather than a copy that has itself gone stale.

### What comes back, and how to read it

**`check-drift`** — up to eleven rows, exit 0 whatever it finds. It answers *"what is this
site missing?"*

```
  ! CMS cannot delete undeclared keys
      ⚠ no check-cms.mjs. A CMS rewrites the whole file from its schema…
  ✓ Source files readable as text
  · CMS image fields are pickers — no .pages.yml, this site has no CMS
```

⚠ **Read `·` rows as findings too.** "Not applicable" tells you something: a site with no
`.pages.yml` has **no CMS**, which is not the same as a CMS with nothing wrong. Whether one
was in scope is a commercial question no checker can answer.

**`check-cms`** — exits 1 when it finds something. **That is the finding, not a broken
command.** It separates two kinds of claim, and they are not the same job:

| | |
| --- | --- |
| **Problems** | unambiguous. Content will be destroyed, or the client cannot reach it |
| **Warnings** | judgements it refuses to make for you. Present each as a question |

---

## The four decisions you will hit

**"Keys the schema does not declare."** Declare them, or move them out of a CMS-managed file.
`--fix` prints the declarations to paste, typed from the values actually stored:

```bash
node ~/coding/website-build-kit/template/scripts/check-cms.mjs --fix
```

⚠ For an analytics ID, **moving it out is the right answer** — a client cannot diagnose what
breaks when one changes, and the failure is silent. `--fix` marks those and leaves the choice,
which is why it prints and never writes.

**"Uploads into generated output."** Always a fix, never a question. Repoint `media.input` at
the pipeline's source directory and move any files already sitting in the output.

**"Content no CMS entry points at."** Deliberately developer-controlled, or a gap? *"Whole
sections are missing"* is how a client reports the gap.

**"Page copy declared inline."** A field, or written down as deliberately fixed. Measured
across seven sites: nine such blocks, the largest a twelve-item FAQ on post-operative
instructions — which a practice will certainly want to edit.

---

## Making the first change

Repair in this order. **The first item is the only urgent one.**

1. anything that deletes content
2. anything an ordinary client action turns red
3. anything they can see and cannot change
4. coverage
5. regenerating images — **its own commit**, it rewrites every image file

Then prove you changed only what you meant to:

```bash
git stash && npm run build && mv dist ../before
git stash pop && npm run build
diff -rq ../before dist
```

⚠ **`npm run build`, not `build:production`.** The "before" tree still fails the gates, so
that build never finishes and you get no baseline. Most of this work is byte-identical output;
if a page changed and you did not intend it to, stop and find out why.

Deploy, then **open the CMS and click through every group.** On the site these findings came
from, every image picker was broken while the build was green, the types checked, and the HTML
was byte-for-byte identical to the previous deploy. Then `npm run handover` — the client's
guide is almost certainly describing a CMS that no longer exists.

---

## Then the second site

⚠ **Take one site end to end before starting a second.** Resist auditing all of them at once.
The first is where you learn what these checks get wrong about *your* stack — two false
positives were found and fixed that way on the day this was written, and the remaining sites
then went quickly.

**Fix the upstream template first** if the sites share one, or every project you repair drifts
again the next time you scaffold.

Across a portfolio, keep one file with a row per site, the findings verbatim, and a
`Record: ___ commit: ___` line. Some of this work is a client unable to edit their own
photographs and some is invisible to visitors; they are not the same job and a list is what
stops them being treated as one.

---

## Where the deeper work lives

Restructuring a CMS so a non-developer can navigate it, deciding what belongs in one at all,
and migrating stored values in bulk across a collection are judgement rather than detection.
They live in [site-runbooks](https://github.com/nurkamol/site-runbooks), which calls these same
scripts rather than restating them.
