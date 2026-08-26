/**
 * Service-area landing pages: one template, one entry each.
 *
 * ── ONLY add a place you can describe distinctly. ──────────────────────────
 * Pages that differ by nothing but the town name are doorway pages and can be
 * penalised. Each needs something genuinely local: which authority issues the
 * permit, what the housing stock is, what actually drives demand there.
 *
 * A place you cannot write about distinctly still belongs in
 * business.serviceAreas — it just does not get a page.
 *
 * Leave this array empty if the business is not service-area based.
 */

export type Area = {
  slug: string;
  city: string;
  category?: string; // matches a blog category, so the page can pull its own articles
  county: string;
  permitAuthority: string; // or whatever the local gatekeeper is in your field
  title: string;
  description: string;
  intro: string;
  localFactors: { heading: string; body: string }[]; // three, no filler
  commonWork: string[];
  image: string; // manifest key
};

export const areas: Area[] = [];

export const areaBySlug = (slug: string) => areas.find((area) => area.slug === slug);
