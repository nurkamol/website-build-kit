/**
 * Service catalogue. One entry per service; the pages are generated from these.
 *
 * Content, not presentation. There is no `icon` or `number` field on purpose —
 * a data file that carries card decoration has decided what the page looks
 * like. Add whatever fields the chosen design genuinely needs, once it exists.
 */

export type Service = {
  slug: string;
  title: string;
  short: string; // one sentence a customer would recognise as their problem
  body: string; // the fuller explanation, for the service's own page
  featured: boolean; // surfaced in the footer and any short list
};

export const services: Service[] = [
  {
    slug: 'first-service',
    title: 'First Service',
    short: 'One sentence a customer would recognise as their problem.',
    body: 'The fuller explanation. Written for someone deciding whether to call, not for a search engine.',
    featured: true,
  },
];

/**
 * Why this business rather than another. Specific, not generic —
 * "same-day report" beats "great service".
 *
 * Where these appear, and whether they appear at all, is the archetype's
 * decision: see references/archetypes.md for the proof model each one needs.
 */
export const differentiators: { title: string; body: string }[] = [
  { title: 'Reason one', body: 'Specific, not generic.' },
];

/** Anything handled on the customer's behalf — paperwork, permits, filings. */
export const documentationHandled: string[] = [];
