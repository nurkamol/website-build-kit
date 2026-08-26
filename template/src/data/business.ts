/**
 * The one place business facts live.
 *
 * Both the visible UI and the JSON-LD structured data read from here, so the
 * page and the schema can never drift apart. Change a phone number here and it
 * updates the header, footer, every call-to-action, the notification emails and
 * what Google reads.
 *
 * ── FILL THIS IN FIRST. Everything else depends on it. ─────────────────────
 */

export const business = {
  name: 'Business Name',

  /**
   * BCP 47 language tag. Drives `<html lang>`, `inLanguage` in structured data,
   * and how dates are formatted in the lead notification.
   *
   * ⚠ SET THIS. The template shipped `en-US` hardcoded in five files while its
   * own compliance reference covered the EAA, UK GDPR and AODA — so a British
   * or Canadian build announced itself as American to every screen reader and
   * every crawler, and printed dates in the wrong order.
   */
  locale: 'en',
  legalName: 'Business Name Ltd',
  tagline: 'What you do, in six words',
  description:
    'One or two sentences that would make sense read aloud on the phone. This becomes the ' +
    'default meta description and the Organization description in structured data.',
  foundedYear: 2010,

  phone: {
    display: '(000) 000-0000', // what a visitor reads, in local convention
    e164: '+00000000000', // E.164 WITH the country code — schema.org and tel: need it
    href: 'tel:+00000000000',
    sms: 'sms:+00000000000',
  },

  email: {
    display: 'hello@example.com', // shown on the site
    href: 'mailto:hello@example.com',
    sender: 'hello@example.com', // must be a VERIFIED sender at your email provider
    senderName: 'Business Name',
    notify: 'owner@example.com', // where live enquiries land
    notifyTest: 'dev@example.com', // where staging enquiries land — never the client
  },

  address: {
    street: '1 Example Street',
    locality: 'Town',
    region: 'ST',
    regionName: 'State',
    /**
     * IANA timezone, used to stamp lead notifications in the business's own
     * local time. A hardcoded zone in the email template is a previous
     * client's clock: every enquiry then carries a plausible timestamp that is
     * silently hours out, and nobody checks a date they can read.
     */
    timeZone: 'UTC',
    /** Short label printed after the time. Keep it in step with `timeZone`. */
    timeZoneLabel: 'UTC',
    postalCode: '00000',
    country: 'US',
    mapUrl: 'https://maps.google.com/?q=...',
  },

  /** Used by LocalBusiness JSON-LD. Get them from Google Maps. */
  geo: { latitude: 0, longitude: 0 },

  hours: {
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    opens: '09:00',
    closes: '17:00',
    display: 'Mon – Fri · 9am – 5pm',
  },

  priceRange: '$$',

  /**
   * schema.org types for the organisation node, most general first.
   *
   * ⚠ SET THE SUBTYPE FOR THIS BUSINESS, or leave the two generic ones. The
   * template shipped `HVACBusiness` hardcoded for two projects, so every site
   * built from it silently declared itself a heating and ventilation company
   * to Google — valid markup, clean build, wrong business.
   *
   * A wrong subtype is worse than no subtype: it is a specific claim, and rich
   * results and local classification act on it. Pick from the LocalBusiness
   * subtypes at https://schema.org/LocalBusiness — e.g. `Dentist`, `Plumber`,
   * `HealthClub`, `LegalService`. If nothing fits exactly, leave it out.
   */
  schemaTypes: ['Organization', 'LocalBusiness'] as string[],

  /**
   * Logo path for structured data, relative to the site root, or null.
   *
   * Null by default because the template ships no brand assets, and a schema
   * `logo` pointing at a 404 is a warning in Search Console that nothing in a
   * build would surface. Set it after `npm run media` puts the real file in
   * public/img/brand/.
   */
  logoPath: null as string | null,

  /** Drives areaServed in structured data, and the footer list. */
  serviceAreas: ['Town', 'Neighbouring Town'],

  serviceAreaSummary: 'Serving Town and the surrounding area.',

  /**
   * Accreditations and credential badges. `image` is a manifest key, not a URL.
   * Check the artwork before designing the strip around it — badges are often
   * near-white PNGs drawn for a dark background.
   */
  credentials: [] as { name: string; image: string }[],

  socials: [] as { name: string; url: string }[],

  credit: { name: '', url: '' },
} as const;

export const addressOneLine = `${business.address.street}, ${business.address.locality}, ${business.address.region} ${business.address.postalCode}`;
