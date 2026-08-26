/**
 * Environment behaviour, derived once from the build variable.
 *
 * Nothing here is a hand-flipped switch. `PUBLIC_SITE_ENV` is set by the build
 * script (`build:staging` / `build:production`); everything else follows from
 * it, so there is nothing a human has to remember to change at go-live.
 */

import { business } from './business';

export type SiteEnv = 'development' | 'staging' | 'production';

export const SITE_ENV = (import.meta.env.PUBLIC_SITE_ENV ?? 'development') as SiteEnv;

/**
 * Exact hostname allowlist. A suffix match would treat
 * `new.example.com` as production, which is precisely the bug.
 */
export const PRODUCTION_HOSTS = ['example.com', 'www.example.com'] as const;

export const isProduction = SITE_ENV === 'production';
export const isStaging = SITE_ENV === 'staging';

/**
 * The client's own analytics IDs. Both must be set or nothing is emitted.
 *
 * ── FILL IN OR LEAVE EMPTY. Never inherit an ID from another project. ───────
 * A copied container sends a real business's traffic to someone else's
 * property, builds green, deploys clean, and reports nothing wrong.
 */
const ANALYTICS = {
  gtmId: '', // GTM-XXXXXXX
  ga4Id: '', // G-XXXXXXXXXX
} as const;

/**
 * Cloudflare Web Analytics. Independent of the Google tags above — set either,
 * both or neither.
 *
 * Worth having on every site for two reasons that have nothing to do with
 * duplicating GA4:
 *
 *  1. **Real-user Core Web Vitals from the first visitor.** CrUX needs months
 *     of traffic before it reports on a new domain, so field data is otherwise
 *     unavailable for exactly the period after launch when you need it.
 *  2. **A control group for ad blockers.** It is cookieless and first-party, so
 *     the gap between this and GA4 measures what the Google tags are losing
 *     rather than leaving you to guess.
 *
 * Dashboard → Web Analytics → the site → the token in the beacon snippet.
 */
const CF_BEACON_TOKEN = ''; // 32-char hex

/** True only on a real production host. Used by the worker as a runtime guard. */
export function isProductionHost(hostname: string): boolean {
  return (PRODUCTION_HOSTS as readonly string[]).includes(hostname.toLowerCase());
}

export const site = {
  env: SITE_ENV,
  url: import.meta.env.SITE ?? 'http://localhost:4321',

  /** Search engines only ever see production. */
  indexable: isProduction,

  /**
   * Analytics only ever fire on production. Staging HTML contains zero references.
   *
   * Leave these empty and no tag is emitted at all — an unset ID must never fall
   * back to *someone else's* container. Fill both in from the client's own
   * property (Admin → Data streams for GA4; the workspace header for GTM), or
   * delete the block if they are not using Google analytics.
   */
  analytics: isProduction && ANALYTICS.ga4Id && ANALYTICS.gtmId ? ANALYTICS : null,

  /** Cloudflare Web Analytics. Production only, and only if a token is set. */
  cfBeaconToken: isProduction && CF_BEACON_TOKEN ? CF_BEACON_TOKEN : null,

  /** Leads submitted off production are tagged and written to a separate namespace. */
  leadsBinding: isProduction ? ('LEADS' as const) : ('LEADS_STAGING' as const),
  leadTag: isProduction ? ('live' as const) : ('test' as const),

  /**
   * How long a stored lead survives, in days. Written as a KV `expirationTtl`,
   * so expiry is enforced by the store rather than by anyone remembering.
   *
   * ── THIS IS A COMPLIANCE DECISION, NOT A STORAGE ONE ──────────────────────
   * A lead is personal data. The UK GDPR and the GDPR both require a defined
   * retention period and neither accepts "indefinitely" — and KV keeps a value
   * forever unless it is told otherwise, so the default without this line is
   * exactly the thing that cannot be justified.
   *
   * 180 days is the kit's default because this store is a SAFETY NET, not the
   * system of record: the notification email is the delivery, and KV exists so
   * that a provider outage costs a notification rather than the lead. Six
   * months is long enough to recover from an outage nobody noticed and to run
   * an export, and short enough to state plainly in a privacy notice.
   *
   * ⚠ Raise it only with a reason you would give a regulator, and make sure the
   * privacy notice says the same number. Staging is deliberately shorter — test
   * submissions are not records of anything.
   */
  leadRetentionDays: isProduction ? 180 : 30,

  /**
   * Who gets the new-lead notification. Off production it goes to the
   * developer, not the client — a verification run should never land in the
   * inbox someone answers real enquiries from.
   */
  leadNotifyTo: isProduction ? business.email.notify : business.email.notifyTest,
} as const;

/**
 * Icons that actually exist in public/. Nothing is advertised until it does.
 *
 * ⚠ SET THESE once the brand assets land — `npm run media` puts them in
 * public/img/brand/.
 *
 * The template used to declare all four unconditionally, so a fresh build made
 * three failed requests on EVERY page: /favicon.ico, /img/brand/favicon.svg and
 * the manifest's /icon-192.png. `npm run console` was the first thing to notice,
 * which is the point of it.
 *
 * Declared rather than detected with `fs`, because Base.astro also renders
 * server-side for the contact page and there is no filesystem in the Workers
 * runtime. Same reason the analytics IDs and `business.logoPath` are declared.
 */
export const icons = {
  ico: null as string | null, // '/favicon.ico'
  svg: null as string | null, // '/img/brand/favicon.svg'
  appleTouch: null as string | null, // '/apple-touch-icon.png'
  /** The manifest lists its own icons — ship it only once those exist. */
  manifest: false,
};

export const defaultSocialImage = '/img/social/og-default.jpg';
