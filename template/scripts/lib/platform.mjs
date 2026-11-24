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
    { ask: 'The SEO plugin\'s export', sensitive: false,
      unlocks: 'Per-URL titles and descriptions (the parity baseline) and the redirect table with hit counts',
      where: 'Yoast, Rank Math or AIOSEO → Tools → Export / Import' },
    { ask: 'The redirect plugin\'s export, if there is one', sensitive: false,
      unlocks: 'Redirects someone added by hand, with hit counts — the ones that still carry traffic',
      where: 'Redirection → Import/Export, or the SEO plugin\'s redirect manager' },
    { ask: 'The form plugin\'s form export', sensitive: false,
      unlocks: 'Field names, required flags and conditional rules — `npm run forms:import` reads it',
      where: 'Gravity Forms, Fluent Forms or Contact Form 7 → Import/Export (the form, not its entries)' },
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

/** The markdown recon writes as recon/ask-client.md. */
export function askClientMarkdown(platform, origin) {
  const asks = ASKS[platform.id] ?? ASKS.unknown;
  const sensitive = asks.some((a) => a.sensitive);
  const head = platform.id === 'unknown'
    ? `Platform **not identified** from markup or headers — ask what it is built on.`
    : `Detected **${platform.name}${platform.builder ? ` + ${platform.builder}` : ''}** — confirm with the client:\n\n` +
      platform.evidence.map((e) => `- ${e}`).join('\n');

  return `# Ask the client — ${origin}

${head}

**Every ask below is optional.** The crawl in \`recon/\` is the source of truth for pages — for a
page builder the database is never the answer (stacks.md §1). These are for what a crawl cannot
see, and for the day the old host lapses before cutover. One message, all at once, each with its
reason — a client says yes to "so your unpublished drafts are not lost", not to "send me a backup".

| | Ask | What it gives you that the crawl cannot | Where they find it |
| --- | --- | --- | --- |
${asks.map((a) => `| [ ] | ${a.ask}${a.sensitive ? ' ⚠' : ''} | ${a.unlocks} | ${a.where} |`).join('\n')}

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

- **Never inside the project.** Not in \`recon/\` — it is meant to be committed — and not anywhere a
  \`git add -A\` would reach. Keep it in a folder outside the repository
- **Take what you need, then delete it.** Media originals, drafts, the redirect table, a count of
  form entries. Do not open the users table; do not paste any of it into a chat
- **Delete your copy at handover** and say so in \`docs/handover.md\` — the client's own backup is
  theirs to keep; yours is a liability with a date on it
` : ''}`;
}
