# Making it look expensive

For the **full redesign** path, where nothing is being matched and the result has to stand
against work someone paid a studio for.

[`kickoff.md`](kickoff.md) §3 has the token spec and the six premium levers in order of effect.
This file is the part that is harder: the **process** that produces a good design, and the
specific tells that separate a considered site from a templated one.

Set the price yourself. What this file is about is the visual bar.

---

## 1. The process is the problem, not the vocabulary

Most sites that miss "premium" miss it because the design was agreed **in adjectives**. The
client says "clean, modern, premium", everyone nods, and three different pictures stay in three
heads until the first screen appears and the brief moves.

Three fixes, in order of how much they help.

### Gather references before offering directions ✅

Ask for **three to five sites they admire** — explicitly *not* competitors, and not necessarily
in their industry. Then do the work the client cannot: say **why** each one works, in specific
terms.

> *"All three of yours share the same three things: a serif display face against a neutral sans,
> section padding roughly double what your current site uses, and photography with one
> consistent colour treatment. None of them use a gradient or a drop shadow. That is the
> direction — shall I build it?"*

That sentence is worth more than any moodboard. It converts taste into decisions, and it gives
you something to be held to.

Also ask for **one site they dislike**, and why. It is usually more informative.

### Show a real comp, do not describe one ✅

**Build the hero and one content section in two or three directions, with the client's real copy
and real photography, and deploy them to staging.** Let them choose from something on a screen.

This is the single biggest process improvement available, and it is cheap here in a way it is
not elsewhere: the token layer means a direction is a `tokens.css` variant, not a rebuild. Two
directions is an afternoon. It replaces the entire "faithful rebuild becomes full redesign three
weeks in" cycle that the kit already warns about.

Rules that make it work:

- **Real content.** Lorem ipsum and stock photos test nothing. A hero with the actual headline
  at the actual length is the whole point
- **Two or three, never five.** More options produce averaging, and averaged design is the
  thing you are trying to avoid
- **Make them genuinely distinct.** Two variations on the same idea is one option shown twice
- **On staging, on their phone.** Not a screenshot in a chat window at 40% zoom

### Then lock it, in writing

Once chosen, the direction goes into `BUILD-STATE.md` under `Locked`. Not to prevent change —
briefs move and that is fine — but so that a change is a *decision* someone makes, rather than a
drift nobody noticed.

---

## 2. What actually separates expensive from templated

Ranked by how much each moves the result. The first three are most of it.

### Typography — more than any other single choice

- **A serif display against a neutral sans** is the reliable premium signal. Every competitor
  in most trades runs Poppins or Montserrat; not doing that is most of the differentiation
- **Restrain the top of the scale.** A pure modular ratio puts a hero past 100px, which reads as
  a magazine cover rather than a business people trust with money. Cap the top three steps
- **Tighten tracking as size increases.** Display type set at body tracking looks amateur, and
  it is one line of CSS. Negative tracking on headlines, normal on body, slightly positive on
  small caps and eyebrows
- **Use the optical-size axis** if the display face has one. It is what makes a variable serif
  look drawn for that size rather than scaled to it
- **Two families. A third is almost always a mistake.** Weights, not families, carry hierarchy
- **Buy a typeface when the budget allows.** A licensed face nobody else in the sector uses is
  the cheapest genuine differentiation on this list. Otherwise use variable fonts that are not
  the obvious ones

### Space — the most common tell

**Cramped is what cheap looks like.** More than colour, more than motion.

- **Section padding people find uncomfortable at first is usually about right.** The instinct to
  fill the viewport is what produces a dense, catalogue-like page
- **One spacing scale, used everywhere.** Arbitrary margins are visible even when nobody can
  name what is wrong
- **Fluid section rhythm via `clamp()`**, so the generosity survives at every viewport rather
  than collapsing on mobile where it matters most
- **`--measure: ~68ch`.** Full-width body text is the most common reason a page feels like a
  document rather than a designed thing

### Photography — the largest single determinant, and the one people underfund

- **One consistent treatment across every image.** Mixed colour temperature and mixed grading
  make a grid look half-built even when each photo is fine alone
- **Real photography of the real business** beats any stock. For a local services client, a
  half-day shoot changes the result more than anything else in this file
- **If stock is unavoidable, pay for it and pick narrowly** — one photographer, one series.
  Free stock is recognisable, and being recognised as free stock is the problem
- **Never mix AI illustration with photography.** It reads as unfinished immediately
- **Art-direct the crop.** A hero cropped to fit is different from a hero composed for the
  space, with room where the headline sits

### Restraint

- **One accent colour, used sparingly.** One call to action per viewport
- **Fewer components, used consistently**, beats more components used once
- **No gradient, no drop shadow, no glass** unless the direction is genuinely built on it.
  These are the default settings of a builder, and they read that way
- **Tint shadows with the brand hue.** Neutral grey shadows read as dirt on a warm palette

### Layout that is not a centred stack of cards

The template-y look is: full-width band, centred heading, three equal cards, repeat. Breaking
that is mostly free.

- **Asymmetry.** A 7/5 split reads as designed; 6/6 reads as default
- **Let something break the container** — an image bleeding to the viewport edge, a figure
  overlapping two sections
- **Vary section rhythm.** Alternating dark and light bands creates a structure the eye can
  navigate; six identical white sections do not
- **Anchor the grid to type**, not to round numbers

### Craft on the small things

This is where "considered" comes from, and where almost nobody looks.

Focus rings that match the design. Form states — hover, focus, invalid, disabled, submitting,
succeeded. The empty state. The 404. Transition timing that is consistent across every
interactive element. Selection colour. The scrollbar in dark mode.

**Motion felt, not watched:** ~200ms, not 800ms. A slow animation is the most common way an
otherwise good site starts to feel cheap, because the visitor is made to wait for decoration.

**The social card is the first thing anyone sees, and it is usually the last thing anyone
makes.** Every link shared in a message, a group chat or a feed renders the card before the
site — for a lot of visitors it is the only design of yours they will ever judge. A default
grey rectangle with a truncated title undoes the rest of this page.

It is a design deliverable, not a build step, and it comes *after* the direction is locked
because it needs the real ramp and both faces. `npm run cards` in the template generates one
per route and measures text contrast over the photograph on every one — but it refuses to run
until you have filled in the palette, the faces and the card list, which is deliberate: a
generator that shipped with a look would give every site built from the kit the same card.

**Generate the fallback too.** A hand-made `og-default.jpg` is the least-visited asset on the
site and therefore the last one anyone checks — on one build it went on serving a wordmark the
rebrand had replaced two days earlier, from a live site, with a valid manifest entry and a
green build. If it can go stale, generate it.

### Copy density

Short and confident reads expensive. Long paragraphs read like a business explaining itself.
If the copy is yours to write, cut every sentence by a third and see what breaks — usually
nothing.

### Speed, because it is a luxury signal

An instant page feels expensive in a way people do not consciously attribute to performance.
Jank, layout shift and a slow LCP undo typography. This is already covered by the kit's
standing instructions; it belongs on this list because it is a *design* property.

---

## 3. Run this against your own work before showing it

The tells of a templated site. If three or more are true, it is not ready.

**Ten of these are checked by `npm run tells` in the template.** Run it on every build —
migration, faithful rebuild, redesign, all of them. It reads `src/` and `dist/` with no browser,
so it works in CI. The rows it can check are marked ⚙; the rest need your eyes, and it says so
at the end of its own output.

**Know which invocation gates what**, because they are not the same check:

| | Gates on | Where it runs |
| --- | --- | --- |
| `npm run tells` | **three or more tells** → exit 1 | CI, and whenever you run it |
| `npm run tells -- --undecided-only` | the **placeholders**, half-cleared → exit 1 | inside `build:production` |

`--undecided-only` returns before the tells are even counted. So a production build refuses a
half-decided *design system* — a brand colour with no typeface — and does **not** refuse a page
with four tells on it. Those are different failures and only the first is unambiguous enough to
block a deploy automatically.

A ⚙ means *something* on that row is machine-checkable, not that the whole row is. Two are
deliberately weaker than they read:

- **The two faces** — it flags them being the *identical* family. Two different sans-serifs pass
  the check and still fail the row; that judgement is yours.
- **The undesigned states** — it flags a missing invalid/busy state on the form. The 404 and the
  empty state are not checked at all.

- [ ] ⚙ Body text runs the full container width
- [ ] ⚙ Section padding is the same everywhere and roughly one viewport-tenth
- [ ] ⚙ Three equal cards, centred, more than twice on one page
- [ ] ⚙ The display and body faces are both sans-serif *(⚙ catches only the identical case)*
- [ ] A gradient or drop shadow appears without the direction calling for it
- [ ] Photography is mixed in colour treatment, or is visibly free stock
- [ ] More than one accent colour is doing work
- [ ] ⚙ The hero headline is over ~72px at desktop
- [ ] ⚙ Headline tracking is the same as body tracking
- [ ] ⚙ Any animation runs longer than ~400ms
- [ ] ⚙ The 404, the empty state or the form's invalid state was never designed *(⚙ checks the form only)*
- [ ] ⚙ Focus rings are the browser default, or removed
- [ ] ⚙ A raw hex sits inside a component instead of in `tokens.css`

**Then look at it properly:** on a real screen at 100%, on a phone, and beside the three
reference sites. Three hours of staring at a page makes it invisible — the comparison is what
restores judgement.

---

## 4. When premium is the wrong goal

Say this out loud when it applies, rather than building something that misses.

- **An emergency trade** — burst pipe, locksmith, breakdown recovery. The visitor is stressed
  and on a phone. Legibility, a huge phone number and speed beat everything on this page.
  Build it as a landing page ([`archetypes.md`](archetypes.md) §Landing) where the proof model
  is *you are real and you will answer* — a licence number, a response time, a photo of a van
  with a name on it. Craft is not what is being assessed
- **Price-led positioning.** A site that looks expensive undermines "we are the cheapest"
- **A brand that is genuinely mid-market.** Aspirational design that outruns the actual service
  produces a bounce at first contact, which is worse than a plain site that told the truth
- **No photography budget and no real photos.** Restraint and typography can carry a site a long
  way, but if the brief needs imagery and there is none, say so before agreeing the direction —
  not after

The honest framing: *"premium" is typography, space and photography.* Buy those three and the
rest is detail. Skip them and no amount of motion, gradient or component library compensates.
