/**
 * Blog categories.
 *
 * On a migration, **slugs must match the source CMS term slugs exactly** so
 * every /category/<slug>/ URL that exists today keeps working. Take them from
 * the export rather than re-slugging the display names \u2014 a name containing "&"
 * or an accent does not slug identically everywhere, and a changed category URL
 * is lost traffic with no error anywhere to tell you.
 *
 * Archive pages generate only where posts exist, so an unused entry costs
 * nothing \u2014 but delete it anyway.
 */

export const categories = [
  { name: 'General', slug: 'general', description: 'Everything that does not fit a narrower category.' },
  { name: 'Tips', slug: 'tips', description: 'Practical advice, field-tested.' },
] as const;

export type Category = (typeof categories)[number];

/* Keyed by `string`, not by the literal union `categories` infers from `as
   const`. Left inferred, the Map only accepts the two slugs that exist today,
   so `categoryBySlug(someSlugFromTheURL)` is a type error rather than the
   lookup-that-may-miss it is meant to be. */
const bySlug = new Map<string, Category>(categories.map((c) => [c.slug, c]));
const byName = new Map<string, Category>(categories.map((c) => [c.name, c]));

export const categoryBySlug = (slug: string) => bySlug.get(slug);
export const categoryByName = (name: string) => byName.get(name);

/** Turn a category display name into its URL. Unknown names slug themselves. */
export function categoryHref(name: string): string {
  const slug =
    byName.get(name)?.slug ??
    name.toLowerCase().replace(/&/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `/category/${slug}/`;
}
