# Editing content

Everything here is a file in the repo. A bad edit **fails the build** rather than the page —
that is deliberate, and it means a broken page can never reach visitors.

---

## Where things live

| Change | File |
| --- | --- |
| Phone, address, hours, service areas, credentials | `src/data/business.ts` |
| What you sell | `src/data/services.ts` |
| Service-area pages | `src/data/areas.ts` |
| Blog categories | `src/data/categories.ts` |
| A blog post | `src/content/blog/<slug>.md` |
| Privacy, terms, house rules | `src/content/legal/<slug>.md` |
| Form fields — a new question, a new form | `src/data/forms.ts` |
| Images | `media/source/…`, then `npm run media` |
| Colours, fonts, spacing | `src/styles/tokens.css` |

**`business.ts` is the single source.** The header, footer, every call to action, the
notification emails and the structured data all read from it. Change the phone number there and
it changes everywhere — including what Google reads. Never type a phone number into a page.

**Legal pages write themselves into the footer.** A file at
`src/content/legal/privacy.md` is served at `/privacy/` and linked in the footer automatically —
add the file and the link appears; delete it and the link goes. There is no list to keep in
step, which is the point: a footer link to a page nobody wrote yet is a 404 on *every* page of
the site and nothing reports it.

Each one needs `title`, `description` and `effective` (the date the terms took effect, as
`YYYY-MM-DD`). Add `updated` only when it has genuinely changed, `navLabel` when the title is
too long for a footer, and `order` to move it in the row. Changing an effective date is editing
one line of frontmatter — no developer.

---

## Writing a post

Create `src/content/blog/my-post.md`. The filename is the URL.

```markdown
---
title: 'What a pre-purchase survey actually covers'
description: 'One sentence that would make sense as a search result. ~155 characters.'
pubDate: 2026-08-02
category: 'Tips'
image: 'blog/example-post'          # a manifest key, never a URL or a path
imageAlt: 'A surveyor recording a reading'
draft: false
---

Body in markdown. Start with the answer, then explain it.

## Real headings, in order

Never skip a level to get a size — heading level is structure, size is a token. `h4` because
it "looked right" breaks the document outline for anyone using a screen reader.
```

**The frontmatter is typed and validated at build time** (`src/content.config.ts`). A missing
`title`, a malformed date or a category that does not exist in `categories.ts` fails the build
with the file and field named. That is the system working.

- `draft: true` keeps it out of production entirely
- `category` must match a `name` in `categories.ts` exactly
- `image` is a manifest key — see below

---

## Images

```bash
cp ~/Desktop/new-photo.jpg media/source/blog/example-post.jpg
npm run media
```

Then reference the **key**, not a path: `image: 'blog/example-post'`.

The pipeline emits a modern format at several widths, plus a JPEG social twin for anything used
as an `og:image`, plus a dimensions manifest so every `<img>` carries `width` and `height` and
nothing shifts as the page loads.

- **Never reference an external URL.** Hotlinked stock images rot — two Pexels URLs referenced
  by articles had already 404'd at source on the last migration
- **Brand assets copy byte-for-byte.** Do not run logos through the photo pipeline
- **Cap source images at ~2400px.** True camera originals belong outside version control
- **Write real alt text**, or `alt=""` if the image is decorative. An empty alt is correct far
  more often than people expect; a filename never is
- **Check for duplicate covers.** Ten of seventeen posts sharing one photo reads as a broken
  page, and nobody notices while writing

---

## Adding a service or a service area

Both are template + data: add an entry, the page generates.

**A service area is different.** Only add a place you can describe **distinctly** — which
authority issues the permit, what the housing stock is, what actually drives demand there.
Pages differing by nothing but the town name are doorway pages and can be penalised. A place
you cannot write about distinctly still belongs in `business.serviceAreas`; it just does not
get a page.

---

## Adding a form field, or a form

Every form is a definition in `src/data/forms.ts`. The page, the server's checks, the notification
email and the leads export all read it, so **a field added there appears in all four** — there is
nothing else to edit.

**A field** is one line in that form's `fields` list:

```ts
{ name: 'budget', label: 'Rough budget', type: 'select', options: ['Under 5k', '5–15k', 'Over 15k'] },
```

| Key | What it does |
| --- | --- |
| `name` | The key stored and exported. Letters and digits, unique within the form. **Never `company`** — that is the spam trap, and a real field with that name throws enquiries away. Use `companyName` |
| `label` | What the visitor reads, and what the notification email prints |
| `type` | `text`, `email`, `tel`, `date`, `textarea`, `checkboxes`, `radio` or `select` |
| `options` | The choices for `checkboxes`, `radio` and `select`. An answer outside the list is refused |
| `required`, `ask` | Must be answered; `ask` is the message when it is not |
| `hint` | A line under the label, always shown |
| `full` | Span the whole row (textareas and choice groups always do) |
| `showWhen` | Only ask when another answer is given: `showWhen: { field: 'budget', anyOf: ['Over 15k'] }` |

A `showWhen` field is hidden until the answer appears; without JavaScript it shows with a note saying
when it applies, and the server ignores it if it does not. **The values in `anyOf` must be typed
exactly as in the other field's `options`** — `npm run check:form` fails the build if one is not,
because that field could otherwise never appear.

Ask for nothing you will not act on: every answer is personal data, kept for the retention period
in the privacy notice.

**A second form** is a second entry in `forms`, with its own `id`, the `page` it lives on and the
`anchor` on that page to return to. Render it on that page with
`<LeadForm form={forms.<id>} invalidFields={invalidFieldsFor(Astro.url, forms.<id>)} />` inside an
element whose `id` matches `anchor`, and make the page `export const prerender = false` so a
no-JavaScript submission can come back with its errors. Migrating from WordPress?
`npm run forms:import -- <export file>` writes the entry for you from a Fluent Forms, Gravity Forms
or Contact Form 7 export.

---

## Accessibility, when writing

The build cannot check these. They are the ones that matter and the ones that slip.

- **Headings in order.** Structure, not size
- **Link text that makes sense alone.** "Read more" is meaningless in a screen reader's link
  list; "read the compliance guide" is not
- **Alt text that says what the image conveys**, not what it depicts. If it conveys nothing,
  `alt=""`
- **Do not describe by position or colour.** "The button on the right", "the green box"
- **Expand an abbreviation on first use.** Assume no prior knowledge
- **Update `/accessibility`** — the statement is dated, and an undated statement reads as
  abandoned. If you know of a gap, name it there. A documented gap is worth more than a clean
  claim

---

## Publishing

```bash
git add . && git commit -m "Add post: what a pre-purchase survey covers"
git push
```

Deployment is a push to the tracked branch. To preview first:

```bash
npm run build:staging && npx wrangler dev     # localhost:8788
```

If the build fails, **read the error** — it names the file and the field. It has caught a real
mistake, not invented one.
