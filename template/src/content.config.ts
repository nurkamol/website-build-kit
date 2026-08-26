import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Blog posts. The schema is strict on purpose: a bad edit fails the build
 * rather than shipping a page with a missing title or a broken date.
 */
const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string().min(1).max(120),
    /** Overrides <title>; falls back to `title` when absent. */
    seoTitle: z.string().max(120).optional(),
    description: z.string().min(50).max(200),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date().optional(),
    /** Portable reference into public/img — never an absolute CDN URL. */
    image: z.string().optional(),
    imageAlt: z.string().optional(),
    categories: z.array(z.string()).min(1),
    focusKeyword: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

/**
 * Legal and policy pages — privacy, terms, house rules, cookie notice.
 *
 * One markdown file each, rendered through one route, so three near-identical
 * page files never get written and an editor can change an effective date
 * without a developer. Empty in a fresh template: it emits no routes until
 * somebody adds a file, which is why shipping it costs the template no pages.
 *
 * ── DATES ARE STRINGS HERE, DELIBERATELY ───────────────────────────────────
 * `z.coerce.date()` turns `2026-08-21` into 2026-08-21T00:00:00**Z**, and
 * formatting that instant anywhere west of Greenwich renders **20 August** —
 * measured: US Pacific and US Eastern both shift it, London and Tokyo do not.
 * So a legal page's effective date is correct on a European laptop and a day
 * early off a US CI runner, with nothing anywhere to report it.
 *
 * An effective date is a CALENDAR DATE, not an instant. Keeping it a string
 * removes the class of bug rather than handling it. `formatLegalDate` in
 * lib/legal.ts renders it, pinned to UTC.
 */
const isoDate = z
  .preprocess(
    /*
     * ⚠ ASTRO'S FRONTMATTER PARSER RETURNS A **Date** FOR AN UNQUOTED
     * `2026-08-21`, not a string — which is where this whole class of bug
     * starts, and it is invisible until something formats it. Editors write
     * dates unquoted because that is the natural thing to write, so accept
     * both and normalise to the UTC calendar date immediately. After this
     * point the value is a plain string and cannot drift again.
     */
    (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : value),
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD')
      /* The regex accepts 2026-13-45. Confirm it is a date that exists. */
      .refine((v) => new Date(`${v}T00:00:00Z`).toISOString().startsWith(v), 'not a real date'),
  );

const legal = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/legal' }),
  schema: z.object({
    title: z.string().min(1).max(120),
    description: z.string().min(50).max(200),
    /** The date the terms took effect. Shown on the page. */
    effective: isoDate,
    /** Only when it has genuinely changed since. Omit otherwise. */
    updated: isoDate.optional(),
    /** Footer link text, when the title is too long for it. */
    navLabel: z.string().max(40).optional(),
    /** Footer ordering, low first. Ties fall back to the title. */
    order: z.number().default(50),
    /** A page that must exist and must not be indexed — rare, but real. */
    noindex: z.boolean().default(false),
  }),
});

export const collections = { blog, legal };
