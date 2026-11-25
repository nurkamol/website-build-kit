/**
 * What the old site is built on, and what to ask its owner for because of it.
 *
 * Detect first, ask second — kickoff.md Round 0. The detection reads markup
 * and response headers `recon` already has; nothing here makes a request.
 * Every verdict carries the evidence that produced it, because the answer is
 * presented back to the client to CONFIRM, and "WordPress" with no reason is
 * a claim nobody can check.
 *
 * The asks are all optional. The crawl is the source of truth for pages
 * (stacks.md §1: rendered HTML, never the database). A backup or an export is
 * for what a crawl cannot see — drafts, original media, form history, the
 * redirect table — and for the day the old host lapses before cutover.
 */

/** [id, name, tests]. A test is [regex over markup | header name, label]. */
const PLATFORMS = [
  ['wordpress', 'WordPress', [
    [/<meta[^>]+name=["']generator["'][^>]+content=["']WordPress/i, 'generator meta names WordPress'],
    [/\/wp-content\/|\/wp-includes\//i, 'assets under /wp-content/ or /wp-includes/'],
    [/rel=["']https:\/\/api\.w\.org\/["']/i, 'REST API link (api.w.org)'],
    [/--wp--preset--/i, 'block-theme style presets (--wp--preset--)'],
    ['x-pingback', 'x-pingback header'],
  ]],
  ['squarespace', 'Squarespace', [
    [/static1\.squarespace\.com|squarespace-cdn\.com/i, 'assets on Squarespace\'s CDN'],
    [/<!-- This is Squarespace\. -->/i, 'Squarespace page comment'],
  ]],
  ['wix', 'Wix', [
    [/static\.wixstatic\.com|static\.parastorage\.com/i, 'assets on Wix\'s CDN'],
    [/<meta[^>]+name=["']generator["'][^>]+content=["']Wix/i, 'generator meta names Wix'],
    ['x-wix-request-id', 'x-wix-request-id header'],
  ]],
  ['webflow', 'Webflow', [
    [/data-wf-site=|data-wf-page=/i, 'data-wf-site attributes'],
    [/<meta[^>]+name=["']generator["'][^>]+content=["']Webflow/i, 'generator meta names Webflow'],
  ]],
  ['shopify', 'Shopify', [
    [/cdn\.shopify\.com|Shopify\.theme/i, 'Shopify CDN or theme object'],
  ]],
  ['ghost', 'Ghost', [
    [/<meta[^>]+name=["']generator["'][^>]+content=["']Ghost/i, 'generator meta names Ghost'],
  ]],
  ['drupal', 'Drupal', [
    [/<meta[^>]+name=["']generator["'][^>]+content=["']Drupal/i, 'generator meta names Drupal'],
    [/\/sites\/default\/files\//i, 'files under /sites/default/files/'],
    ['x-drupal-cache', 'x-drupal-cache header'],
  ]],
  ['joomla', 'Joomla', [
    [/<meta[^>]+name=["']generator["'][^>]+content=["']Joomla/i, 'generator meta names Joomla'],
  ]],
  ['framer', 'Framer', [
    [/framerusercontent\.com|<meta[^>]+name=["']generator["'][^>]+content=["']Framer/i, 'Framer assets or generator'],
  ]],
];

/** WordPress page builders — stacks.md §1, same tells. */
const BUILDERS = [
  ['Elementor', /elementor-widget-|\/uploads\/elementor\//i],
  ['WPBakery', /\bvc_row\b|\bwpb_/i],
  ['Divi', /\bet_pb_/i],
  ['Bricks', /\bbrxe-/i],
  ['Oxygen', /\boxy-|\bct-section\b/i],
  ['Beaver Builder', /fl-builder-content|\bfl-node-/i],
  ['Gutenberg', /\bwp-block-/i],
];

/**
 * @param {string} html     the sampled pages, concatenated
 * @param {Headers|Record<string,string>|null} headers  the home page's response headers
 */
export function detectPlatform(html, headers) {
  const get = (h) => (headers?.get ? headers.get(h) : headers?.[h]) ?? null;
  for (const [id, name, tests] of PLATFORMS) {
    const evidence = tests
      .filter(([t]) => (typeof t === 'string' ? get(t) : t.test(html)))
      .map(([, label]) => label);
    if (!evidence.length) continue;
    const builder = id === 'wordpress' ? BUILDERS.find(([, re]) => re.test(html))?.[0] ?? null : null;
    return { id, name, builder, evidence };
  }
  return { id: 'unknown', name: null, builder: null, evidence: [] };
}

/*
 * One row per ask: what to ask for, what it gives you that the crawl cannot,
 * and where the client finds it. `sensitive` marks the asks that carry
 * credentials or other people's personal data — they get the handling rules.
 */
const ASKS = {
  wordpress: [
    { ask: 'A full site backup', sensitive: true,
      unlocks: 'Drafts, private and scheduled posts a crawl never sees; media originals at full resolution; form entry history; and a copy that survives the old host lapsing before cutover',
      where: 'Whatever already makes their backups — UpdraftPlus, All-in-One WP Migration, Jetpack, or the host\'s own snapshot. The newest one; do not ask them to install anything' },
    { ask: 'A WordPress export (WXR)', sensitive: false,
      unlocks: 'Every post and page with its dates, author, categories, tags and drafts — the content without the passwords. The fallback when a backup is a no',
      where: 'wp-admin → Tools → Export → All content' },
  ],
  squarespace: [
    { ask: 'The URL Mappings list', sensitive: false,
      unlocks: 'Every redirect they set up — Squarespace keeps them in one text box',
      where: 'Settings → Developer tools → URL mappings (copy the text)' },
    { ask: 'Original images and brand files', sensitive: false,
      unlocks: 'Full-resolution sources — Squarespace serves resized copies, and there is no usable export to get them back',
      where: 'Their own folders, the photographer, or whoever designed the logo' },
  ],
  wix: [
    { ask: 'The 301 redirect list', sensitive: false,
      unlocks: 'Redirects set up in Wix, which a crawl cannot list',
      where: 'Wix\'s URL Redirect Manager, in the SEO tools' },
    { ask: 'Form submissions as CSV, if they want the history', sensitive: true,
      unlocks: 'The enquiry history, for the client\'s own records — never imported into the new site',
      where: 'Wix\'s form submissions table — it exports to CSV' },
    { ask: 'Original images and brand files', sensitive: false,
      unlocks: 'Full-resolution sources — Wix has no site export',
      where: 'Their own folders, the photographer, or whoever designed the logo' },
  ],
  webflow: [
    { ask: 'CMS collection exports (CSV)', sensitive: false,
      unlocks: 'Every collection item with its fields, including drafts and unpublished items',
      where: 'Designer → CMS → each collection → Export' },
    { ask: 'The 301 redirect list', sensitive: false,
      unlocks: 'Redirects set up in Webflow hosting',
      where: 'Site settings → Publishing → 301 redirects' },
  ],
  shopify: [
    { ask: 'The URL redirects export', sensitive: false,
      unlocks: 'Every redirect the store carries — products and collections renamed over the years',
      where: 'Shopify admin → URL redirects — it exports to CSV' },
  ],
  ghost: [
    { ask: 'The content export (JSON)', sensitive: false,
      unlocks: 'Every post with dates, tags, authors and drafts — the cleanest export of any platform',
      where: 'Settings → Advanced → Import/Export → Export content' },
    { ask: 'The images folder', sensitive: false,
      unlocks: 'Originals — the JSON export references images but does not contain them',
      where: 'The host, or Ghost(Pro) support' },
  ],
  drupal: [
    { ask: 'A database dump and the files directory', sensitive: true,
      unlocks: 'Content, taxonomy and unpublished nodes; media originals',
      where: 'Whoever hosts it — a developer or the host\'s backup tool' },
  ],
  joomla: [
    { ask: 'A site backup', sensitive: true,
      unlocks: 'Unpublished articles, media originals, and a copy that survives the host',
      where: 'Akeeba Backup, or the host\'s snapshot' },
  ],
  framer: [
    { ask: 'Original images and brand files', sensitive: false,
      unlocks: 'Full-resolution sources — Framer has no meaningful export',
      where: 'Their own folders, or the designer' },
  ],
  unknown: [
    { ask: 'Any backup the host keeps', sensitive: true,
      unlocks: 'Whatever a crawl cannot see, and a copy that survives the host',
      where: 'The host\'s control panel, or whoever built the site' },
    { ask: 'Original images and brand files', sensitive: false,
      unlocks: 'Full-resolution sources, not the copies the site serves',
      where: 'Their own folders, the photographer, or the designer' },
  ],
};

/*
 * WordPress plugins, from the marks they leave in rendered HTML: an asset path under
 * /wp-content/plugins/<slug>/, a signature comment, or a class the plugin always emits.
 * The plugin list is the best map of what a WordPress site actually DOES — and each one
 * holds data the crawl cannot reach. Not every plugin leaves a mark (most snippet managers
 * do not), which is why the recent-work questions in ask-client.md exist.
 *
 * [slug, name, extra markup signature | null, what it holds, the ask]
 */
const PLUGINS = [
  ['wordpress-seo', 'Yoast SEO', /This site is optimized with the Yoast SEO/i, 'Per-URL titles and descriptions, redirects (Premium), schema settings, the business facts', 'Yoast → Tools → Import and Export → Export settings, plus the redirects if Premium'],
  ['seo-by-rank-math', 'Rank Math', /Search Engine Optimization by Rank Math/i, 'Per-URL titles and descriptions, the redirect table with hit counts, schema, local-business facts', 'Rank Math → Status & Tools → Import & Export → Settings and Redirections'],
  ['all-in-one-seo-pack', 'All in One SEO', /All in One SEO/i, 'Per-URL titles and descriptions, redirects, local-business facts', 'All in One SEO → Tools → Import/Export'],
  ['redirection', 'Redirection', null, 'Hand-made redirects with hit counts — the ones still carrying traffic', 'Redirection → Import/Export → export everything as CSV'],
  ['contact-form-7', 'Contact Form 7', /class=["'][^"']*\bwpcf7\b/i, 'Form fields, required flags, the mail template — entries are not stored unless Flamingo is installed', 'The form definitions (`npm run forms:import` reads them), and whether Flamingo holds past entries'],
  ['gravityforms', 'Gravity Forms', /class=["'][^"']*\bgform_wrapper\b/i, 'Forms with conditional logic, notifications, and every entry ever submitted', 'Forms → Import/Export → Export Forms (`npm run forms:import` reads it). Entries only if the client wants the history'],
  ['fluentform', 'Fluent Forms', /class=["'][^"']*\bfluentform\b/i, 'Forms with conditional logic, and every entry', 'Fluent Forms → Tools → Export Forms (`npm run forms:import` reads it)'],
  ['wpforms-lite', 'WPForms', /class=["'][^"']*\bwpforms-form\b/i, 'Forms and notifications; entries in the paid version', 'WPForms → Tools → Export → the form exports'],
  ['ninja-forms', 'Ninja Forms', /class=["'][^"']*\bnf-form-cont\b/i, 'Forms and submissions', 'Ninja Forms → Import/Export'],
  ['insert-headers-and-footers', 'WPCode (headers & footers)', null, 'Code pasted into the head and footer — tracking tags, verification meta, schema, chat widgets. Often the only record of who added what', 'WPCode → Tools → Export, or a copy of each snippet'],
  ['code-snippets', 'Code Snippets', null, 'PHP that runs on every request — redirects, shortcodes, tweaks to the output nobody remembers writing', 'Snippets → select all → Export'],
  ['header-footer-code-manager', 'Header Footer Code Manager', null, 'Tracking and verification code in the head and footer', 'A copy of each snippet'],
  ['advanced-custom-fields', 'Advanced Custom Fields', null, 'The content model: which fields each page type has', 'ACF → Tools → Export field groups (JSON)'],
  ['custom-post-type-ui', 'Custom Post Type UI', null, 'The custom content types and taxonomies', 'CPT UI → Tools → export the post types and taxonomies'],
  ['sitepress-multilingual-cms', 'WPML', /<meta[^>]+name=["']generator["'][^>]+content=["']WPML/i, 'Translations — every page exists once per language', 'Which languages stay. A scope question before an export question (features.md has i18n)'],
  ['polylang', 'Polylang', null, 'Translations — every page exists once per language', 'Which languages stay. A scope question before an export question (features.md has i18n)'],
  ['complianz-gdpr', 'Complianz', null, 'The cookie banner\'s categories and the consent records', 'Which scripts it was blocking — that list is the consent setup the new site needs'],
  ['wp-rocket', 'WP Rocket', /<!-- This website is like a Rocket/i, 'Nothing to migrate — but a page cache can serve a page that names files it has deleted', 'Nothing. recon already checks the old site\'s own files for exactly this'],
  ['litespeed-cache', 'LiteSpeed Cache', null, 'Nothing to migrate — a page cache', 'Nothing'],
  ['woocommerce', 'WooCommerce', null, 'A shop: products, orders, customers', 'Whether the shop moves at all. stacks.md §1 migrates marketing pages; commerce is its own decision'],
];
const ALIASES = { wpforms: 'wpforms-lite' };

/** The WordPress plugins visible in the markup — known ones described, unknown ones listed to ask about. */
export function detectPlugins(html) {
  const slugs = new Set([...html.matchAll(/\/wp-content\/plugins\/([a-z0-9][a-z0-9_-]*)\//gi)].map((m) => ALIASES[m[1].toLowerCase()] ?? m[1].toLowerCase()));
  const known = PLUGINS.filter(([slug, , sig]) => slugs.has(slug) || (sig && sig.test(html)))
    .map(([slug, name, , holds, ask]) => ({ slug, name, holds, ask }));
  const unknown = [...slugs].filter((s) => !PLUGINS.some(([slug]) => slug === s)).sort();
  return { known, unknown };
}

function pluginSection({ known, unknown }) {
  if (!known.length && !unknown.length) {
    return `## Plugins

None visible in the markup. That is not the same as none installed — ask for the list
(wp-admin → Plugins; a screenshot is enough).

`;
  }
  return `## Plugins seen in the markup — each holds data the crawl cannot reach

| | Plugin | What it holds | The ask |
| --- | --- | --- | --- |
${[...known.map((p) => `| [ ] | ${p.name} | ${p.holds} | ${p.ask} |`), ...unknown.map((slug) => `| [ ] | \`${slug}\` | Not one the kit knows | What does it do, and does it still need to? |`)].join('\n')}

The markup only shows plugins that load something on the front end. Ask for the full list too
(wp-admin → Plugins; a screenshot is enough) — the ones that leave no mark are usually the ones
nobody remembers installing.

`;
}

/** Where the owner's files go. Ignored by the template's .gitignore; recon checks before creating it. */
export const CLIENT_DIR = 'client-files';

/** The README recon puts inside client-files/ — it is never committed, so it speaks to whoever opens the folder. */
export const CLIENT_DIR_README = `# client-files/

What the old site's owner handed over — a backup, exports, original images.
Ignored by git: nothing in here is ever committed.

- One subfolder per delivery is easiest to reason about later: backup/, exports/, images/
- Read what the build needs; never open the users table, never paste any of it into a chat
- Delete this folder's contents at handover, and say so in docs/handover.md

recon/ask-client.md lists what was asked for, and why.
`;

/**
 * The markdown recon writes as recon/ask-client.md.
 * @param {{ ignored: boolean }} folder  whether client-files/ is ignored by git here
 */
export function askClientMarkdown(platform, origin, folder = { ignored: true }, plugins = { known: [], unknown: [] }) {
  const asks = ASKS[platform.id] ?? ASKS.unknown;
  const sensitive = asks.some((a) => a.sensitive);
  const head = platform.id === 'unknown'
    ? `Platform **not identified** from markup or headers — ask what it is built on.`
    : `Detected **${platform.name}${platform.builder ? ` + ${platform.builder}` : ''}** — confirm with the client:\n\n` +
      platform.evidence.map((e) => `- ${e}`).join('\n');

  return `# Ask the client — ${origin}

${head}

${folder.ignored
    ? `**Where it goes: \`${CLIENT_DIR}/\`** in this project — ignored by git, so a backup in it is never
committed, and readable from here, so nothing has to be emailed around. Tell the client: a
download link to a zip is fine; whoever receives it unpacks it into \`${CLIENT_DIR}/\`.`
    : `⚠ **\`${CLIENT_DIR}/\` IS NOT IGNORED BY GIT IN THIS PROJECT**, so recon did not create it. A backup
put there would be committed with the next \`git add -A\` — database password, users table and all.
Add \`${CLIENT_DIR}/\` to \`.gitignore\` first (the kit's template has it; this site predates it), then
run recon again.`}

**Every ask below is optional.** The crawl in \`recon/\` is the source of truth for pages — for a
page builder the database is never the answer (stacks.md §1). These are for what a crawl cannot
see, and for the day the old host lapses before cutover. One message, all at once, each with its
reason — a client says yes to "so your unpublished drafts are not lost", not to "send me a backup".

| | Ask | What it gives you that the crawl cannot | Where they find it |
| --- | --- | --- | --- |
${asks.map((a) => `| [ ] | ${a.ask}${a.sensitive ? ' ⚠' : ''} | ${a.unlocks} | ${a.where} |`).join('\n')}

${platform.id === 'wordpress' ? pluginSection(plugins) : ''}## Ask what changed recently — markup cannot show it

The crawl sees the site as it is today, not what somebody is halfway through. One question each:

- **Forms** — any edited, added or retired in the last few months? Where do entries go now — the
  plugin, an email inbox, a CRM?
- **SEO** — titles, redirects or schema changed recently, or an agency working on it right now?
- **Custom code** — tracking, a chat widget, a verification tag or a snippet added for a campaign?
  Who added it, and does it still need to run?${platform.id === 'wordpress' ? ' Snippet plugins rarely show in the markup' : ''}
- **Content in flight** — drafts, scheduled posts, a page waiting for sign-off?
- **Anything added for one purpose** — a landing page, an event, a promotion that has ended?

\`npm run changes\` records what moves on the live site from here on; these questions cover what
happened before it started watching.

Plus, whatever the platform: **domain and DNS access** (kickoff.md Round 2 — it blocks go-live
more than anything technical), analytics access, and finished work never published.

**Never ask for their admin password.** Not in chat, not by email. If an export truly needs a
login, ask them to create a separate editor account they delete after launch.
${sensitive ? `
## ⚠ Handling a backup or a dump

It is not "the content". It is the whole site, including the parts nobody would hand over on
their own:

| Inside it | Why it matters |
| --- | --- |
| The config file — \`wp-config.php\`, \`settings.php\`, \`configuration.php\` | The database password and the auth secrets that sign every login cookie |
| The users table | Every account's email and password hash |
| Form entries, orders, comments | Other people's personal data — the client's customers, not the client |

- **Only in \`${CLIENT_DIR}/\`.** Never in \`recon/\` — it is meant to be committed — and never anywhere
  else a \`git add -A\` would reach. \`git check-ignore ${CLIENT_DIR}/x\` must print the path before
  anything goes in
- **Take what you need, then leave the rest alone.** Media originals, drafts, the redirect table, a
  count of form entries. Do not open the users table; do not paste any of it into a chat
- **Delete it at handover** and say so in \`docs/handover.md\` — the client's own backup is theirs to
  keep; the copy in this project is a liability with a date on it
` : ''}`;
}
