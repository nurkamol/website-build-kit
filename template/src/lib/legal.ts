import { getCollection, type CollectionEntry } from 'astro:content';

import { business } from '../data/business';
import type { NavItem } from '../data/nav';

export type LegalPage = CollectionEntry<'legal'>;

/*
 * ⚠ Does the collection have anything in it? Resolved by Vite at build time,
 * so this costs nothing at runtime.
 *
 * `getCollection` on an EMPTY collection logs "The collection \"legal\" does not
 * exist or is empty" — and the footer runs on every page, so a fresh template
 * printed that line once per route on every build. Nothing was wrong; an empty
 * legal collection is the normal state of a site nobody has written a privacy
 * policy for yet. A starter that shouts at you about the correct state is a
 * starter people stop reading the output of.
 */
const HAS_PAGES = Object.keys(import.meta.glob('../content/legal/**/*.md')).length > 0;

/**
 * Legal and policy pages, in footer order.
 *
 * Empty in a fresh template, and that is the point: nothing is emitted and
 * nothing is linked until a page is actually written.
 */
export async function getLegalPages(): Promise<LegalPage[]> {
  if (!HAS_PAGES) return [];
  const pages = await getCollection('legal');
  return pages.sort(
    (a, b) => a.data.order - b.data.order || a.data.title.localeCompare(b.data.title),
  );
}

/**
 * The same pages as footer links.
 *
 * `nav.ts` explains why privacy and terms were never listed there by hand: a
 * footer link to a page nobody has written yet is a 404 on EVERY page of the
 * site, and nothing reports it. Deriving the links from the pages themselves
 * removes that — the link cannot exist without the page.
 *
 * A `noindex` page is still linked. It has to be reachable to be enforceable;
 * not being indexed is a separate decision from not being findable.
 */
export async function getLegalLinks(): Promise<NavItem[]> {
  const pages = await getLegalPages();
  return pages.map((page) => ({
    label: page.data.navLabel ?? page.data.title,
    href: `/${page.id}/`,
  }));
}

/**
 * ⚠ PINNED TO UTC, AND THAT IS THE WHOLE FUNCTION.
 *
 * An effective date is a calendar date, not an instant. `2026-08-21` parsed as
 * a Date is midnight *Z*, and rendering that in the build machine's zone gives
 * 20 August anywhere west of Greenwich — measured: US Pacific and US Eastern
 * shift it, London and Tokyo do not. On a legal page that is the date the terms
 * took effect being wrong by a day, on a page written precisely so a date can
 * be relied on, with a clean build and nothing to report it.
 *
 * The schema keeps these as strings for the same reason. This builds the
 * instant explicitly from the parts and formats it in the zone it was built in.
 */
export function formatLegalDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(business.locale, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
