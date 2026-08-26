/**
 * Navigation and the primary call to action.
 *
 * One place, read by the header, the mobile menu, the footer columns and the
 * 404's onward links — so a route added here appears everywhere it should and
 * the 404 can never offer a page that no longer exists.
 *
 * The list below is the minimum that resolves in a fresh template. Replace it
 * with the real information architecture; the route inventory from recon is
 * what decides it, not this file.
 */

export interface NavItem {
  label: string;
  href: string;
  /** Show in the footer's link column. Defaults to true. */
  footer?: boolean;
}

export const nav: NavItem[] = [
  { label: 'Home', href: '/' },
  { label: 'Contact', href: '/contact/' },
];

/**
 * The one action that counts as a win, as a link.
 *
 * Discovery names exactly one — call, form, booking, demo. This is it, and it
 * is what the header CTA, the mobile menu and any conversion band point at.
 * Two competing calls to action is the same as none.
 */
export const primaryAction = {
  label: 'Get in touch',
  href: '/contact/',
} as const;

/**
 * Legal and required links, in the footer on every page.
 *
 * `/accessibility` is required under the EAA and the UK PSBAR — do not remove
 * it. It is hand-written, so it lives here.
 *
 * Privacy, terms and the cookie notice do NOT go here. They are markdown in
 * `src/content/legal/`, and the footer reads that collection directly — a
 * footer link to a page that does not exist yet is a 404 on every page of the
 * site and nothing will report it, so the link is derived from the page rather
 * than typed alongside it. Add the file; the link appears.
 */
export const legalNav: NavItem[] = [{ label: 'Accessibility', href: '/accessibility/' }];
