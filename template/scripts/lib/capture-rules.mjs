/**
 * What a browser capture of a site that is not ours must refuse, and where the
 * menu usually is — shared by `design` and `match`.
 *
 * Both open the OLD site in a browser and interact with it: `design` opens the
 * menu to record how it behaves, `match` opens it to compare it with the
 * rebuild's. Two copies of these lists drift — one learns a builder's toggle,
 * the other keeps reporting "no menu" on that builder — so they live here.
 */

/* Collectors, not tag scripts: the tag may draw something; the beacon only counts a visit. */
export const COLLECTORS =
  /google-analytics\.com|analytics\.google\.com|\/g\/collect|googletagmanager\.com\/gtag\/js|facebook\.com\/tr|connect\.facebook\.net|doubleclick\.net|clarity\.ms|hotjar\.(?:com|io)|stats\.wp\.com|plausible\.io\/api|\/wp-json\/.*\/(?:track|log)/i;

/* Menu toggles, most specific first: a builder's own class before the generic
   aria pattern, because an accordion lower down also carries aria-expanded. */
export const TOGGLES = [
  '.slide-out-widget-area-toggle a', // Salient
  '.slide-out-widget-area-toggle',
  '#mobile-toggle',
  '.wp-block-navigation__responsive-container-open', // block themes
  '.elementor-menu-toggle', // Elementor
  '.bricks-mobile-menu-toggle', // Bricks
  'button.brxe-toggle[aria-expanded]',
  '.et_mobile_nav_menu .mobile_menu_bar', // Divi
  '.mobile_menu_bar_toggle',
  '.ast-mobile-menu-trigger-minimal', // Astra
  '.menu-toggle',
  '.mobile-menu-toggle',
  'button[aria-controls][aria-expanded]',
  '[aria-controls][aria-expanded]',
  '.hamburger, [class*="hamburger"]',
  '[class*="burger"]',
  'a[aria-label*="menu" i], button[aria-label*="menu" i]',
];

export const HEADER_SEL =
  '#header-outer, header, .site-header, #masthead, #main-header, #brx-header, .elementor-location-header, [role=banner]';
