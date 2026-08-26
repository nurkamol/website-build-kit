/**
 * Snapshot a domain's public DNS, before you touch it — and compare after.
 *
 *   npm run dns -- example.com                 # capture → recon/dns.md
 *   npm run dns -- example.com --compare       # what changed since the capture
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * A rebuild moves the apex. Everything else in the zone is somebody else's
 * service, and the kit had **no mention of MX anywhere** before this file.
 *
 * **Breaking MX kills the client's email.** That is worse than any failure this
 * kit documents: a dead site is visible in minutes and someone shouts, while
 * dead email is silent. Senders get bounces the client never sees, they assume
 * a quiet week, and it surfaces days later when an invoice did not arrive.
 *
 * The same logic as `stacks.md` §1d — paths other systems point at — one layer
 * down. These are records other systems depend on, and losing one is silent.
 *
 * ── IT RECORDS AND WARNS. IT NEVER FAILS THE RUN ───────────────────────────
 * DNS lives outside the repo, a project can legitimately have no MX, and a
 * check nobody can make green is a check everybody learns to ignore.
 *
 * ── WHAT IT CANNOT SEE ─────────────────────────────────────────────────────
 * It reads PUBLIC DNS: what the world resolves, not what sits in the
 * registrar's panel. A record that exists but is not published is invisible
 * here, and so is anything proxied behind a provider that answers differently
 * per network. Treat it as a verification tool, never as the source of truth
 * for the zone.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { Resolver } from 'node:dns/promises';

const RESET = '[0m';
const RED = '[31m';
const GREEN = '[32m';
const YELLOW = '[33m';
const DIM = '[2m';
const BOLD = '[1m';

const args = process.argv.slice(2);
const compare = args.includes('--compare');
const domain = args.find((a) => !a.startsWith('--'))?.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

if (!domain) {
  console.error('usage: npm run dns -- example.com [--compare]');
  process.exit(1);
}

const OUT = 'recon/dns.md';
const SNAP = 'recon/dns.json';

/*
 * A public resolver rather than the system one. The machine running this may
 * sit behind a split-horizon or corporate resolver that answers differently
 * from the internet, and the whole point is to see what the world sees.
 */
const resolver = new Resolver({ timeout: 5000, tries: 2 });
resolver.setServers(['1.1.1.1', '8.8.8.8']);

const ask = async (name, fn) => {
  try {
    return await fn();
  } catch (e) {
    if (['ENODATA', 'ENOTFOUND', 'ESERVFAIL'].includes(e.code)) return [];
    return [];
  }
};

const zone = {
  domain,
  capturedAt: new Date().toISOString(),
  ns: await ask('NS', () => resolver.resolveNs(domain)),
  a: await ask('A', () => resolver.resolve4(domain, { ttl: true })),
  aaaa: await ask('AAAA', () => resolver.resolve6(domain, { ttl: true })),
  mx: await ask('MX', () => resolver.resolveMx(domain)),
  txt: (await ask('TXT', () => resolver.resolveTxt(domain))).map((r) => r.join('')),
  caa: await ask('CAA', () => resolver.resolveCaa(domain)),
  wwwCname: await ask('CNAME', () => resolver.resolveCname(`www.${domain}`)),
  /* Selectors are per-provider and unguessable in general; these three cover
     Google Workspace, Microsoft 365 and most ESPs. A miss here is not a
     finding — it is a limit, and the report says so. */
  dkim: {},
  dmarc: (await ask('DMARC', () => resolver.resolveTxt(`_dmarc.${domain}`))).map((r) => r.join('')),
};

for (const selector of ['google', 'selector1', 'selector2', 'k1', 'default']) {
  const rec = await ask('DKIM', () => resolver.resolveTxt(`${selector}._domainkey.${domain}`));
  if (rec.length) zone.dkim[selector] = rec.map((r) => r.join(''));
}

/* ── Read the zone ─────────────────────────────────────────────────────── */

const spf = zone.txt.filter((t) => /^v=spf1/i.test(t));
const verifications = zone.txt.filter((t) =>
  /google-site-verification|MS=|facebook-domain-verification|apple-domain-verification|_?bing|stripe-verification|atlassian|docusign|adobe-idp/i.test(t),
);

/*
 * Cloudflare issues certificates through Google Trust Services, Let's Encrypt
 * and SSL.com. A CAA record that names none of them blocks issuance — the
 * deploy succeeds, DNS cuts over, and the site serves a TLS error nothing in
 * the repo can fix. It is the classic launch-day emergency and it is invisible
 * until the moment it is not.
 */
const CF_ISSUERS = ['pki.goog', 'letsencrypt.org', 'ssl.com', 'digicert.com', 'comodoca.com'];
const caaIssuers = zone.caa.map((r) => r.issue ?? r.issuewild).filter(Boolean);
const caaBlocks =
  caaIssuers.length > 0 && !caaIssuers.some((i) => CF_ISSUERS.some((ok) => String(i).includes(ok)));

/* ── Report ────────────────────────────────────────────────────────────── */

console.log(`${BOLD}── ${domain} ${'─'.repeat(Math.max(0, 50 - domain.length))}${RESET}`);

const line = (mark, label, value) => console.log(`  ${mark} ${label.padEnd(26)} ${value}`);

line(zone.ns.length ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`, 'nameservers', zone.ns.join(', ') || '—');
line(zone.a.length ? `${GREEN}✓${RESET}` : `${DIM}·${RESET}`, 'A',
  zone.a.map((r) => `${r.address} (ttl ${r.ttl}s)`).join(', ') || '—');
line(zone.wwwCname.length ? `${GREEN}✓${RESET}` : `${DIM}·${RESET}`, 'www', zone.wwwCname.join(', ') || '—');

if (zone.mx.length) {
  line(`${YELLOW}!${RESET}`, 'MX — EMAIL LIVES HERE',
    zone.mx.map((m) => `${m.exchange} (${m.priority})`).join(', '));
  console.log(
    `      ${DIM}Carry these across before you move the apex. Losing MX kills the\n` +
      `      client's email, and it fails silently — the bounces go to senders.${RESET}`,
  );
} else {
  line(`${DIM}·${RESET}`, 'MX', 'none — email is not on this domain');
}

line(spf.length ? `${GREEN}✓${RESET}` : `${DIM}·${RESET}`, 'SPF', spf[0] ?? '—');
line(zone.dmarc.length ? `${GREEN}✓${RESET}` : `${DIM}·${RESET}`, 'DMARC', zone.dmarc[0] ?? '—');
line(Object.keys(zone.dkim).length ? `${GREEN}✓${RESET}` : `${DIM}·${RESET}`, 'DKIM selectors',
  Object.keys(zone.dkim).join(', ') || 'none found at common selectors');

if (caaBlocks) {
  line(`${RED}✗${RESET}`, 'CAA', caaIssuers.join(', '));
  console.log(
    `      ${DIM}None of these is a CA Cloudflare issues through. Certificate\n` +
      `      issuance will FAIL after cutover and the site will serve a TLS\n` +
      `      error nothing in the repo can fix. Add one before you cut over.${RESET}`,
  );
} else {
  line(zone.caa.length ? `${GREEN}✓${RESET}` : `${DIM}·${RESET}`, 'CAA',
    caaIssuers.join(', ') || 'none — any CA may issue');
}

if (verifications.length) {
  line(`${YELLOW}!${RESET}`, 'verification TXT', `${verifications.length} record(s)`);
  for (const v of verifications) console.log(`      ${DIM}${v.slice(0, 78)}${RESET}`);
  console.log(`      ${DIM}Each one belongs to a service that will silently lose access.${RESET}`);
}

const lowestTtl = Math.min(...zone.a.map((r) => r.ttl), Infinity);
if (Number.isFinite(lowestTtl)) {
  const ready = lowestTtl <= 600;
  line(ready ? `${GREEN}✓${RESET}` : `${YELLOW}!${RESET}`, 'TTL on A',
    `${lowestTtl}s${ready ? '' : ' — lower to 300s at least 24h before cutover'}`);
}

/* ── Compare, or capture ───────────────────────────────────────────────── */

mkdirSync('recon', { recursive: true });

if (compare) {
  if (!existsSync(SNAP)) {
    console.error(`\n${RED}✗${RESET} no ${SNAP} to compare against. Run without --compare first.`);
    process.exit(1);
  }
  const before = JSON.parse(readFileSync(SNAP, 'utf8'));
  console.log(`\n${BOLD}── Changed since ${before.capturedAt.slice(0, 10)} ${'─'.repeat(24)}${RESET}`);

  const sets = {
    MX: [before.mx.map((m) => m.exchange).sort(), zone.mx.map((m) => m.exchange).sort()],
    SPF: [before.txt.filter((t) => /^v=spf1/i.test(t)), spf],
    DMARC: [before.dmarc, zone.dmarc],
    'verification TXT': [
      before.txt.filter((t) => /verification|MS=/i.test(t)),
      verifications,
    ],
    CAA: [before.caa.map((r) => r.issue ?? r.issuewild), caaIssuers],
    nameservers: [before.ns.sort(), zone.ns.sort()],
  };

  let lost = 0;
  for (const [label, [was, now]] of Object.entries(sets)) {
    const gone = was.filter((v) => !now.includes(v));
    if (gone.length) {
      lost++;
      console.log(`  ${RED}✗${RESET} ${label} LOST: ${gone.join(', ')}`);
    } else if (JSON.stringify(was) !== JSON.stringify(now)) {
      console.log(`  ${YELLOW}!${RESET} ${label} changed (nothing lost)`);
    }
  }
  console.log(
    lost
      ? `\n${RED}${lost} record group(s) lost something that was there before cutover.${RESET}\n`
      : `\n${GREEN}✓ nothing that was published before the cutover has been lost.${RESET}\n`,
  );
} else {
  writeFileSync(SNAP, JSON.stringify(zone, null, 2) + '\n');
  writeFileSync(OUT, report());
  console.log(`\n${GREEN}✓${RESET} ${OUT} and ${SNAP}`);
  console.log(
    `${DIM}  Commit both. The JSON is the rollback artefact — after cutover run\n` +
      `  \`npm run dns -- ${domain} --compare\` and it will tell you what was lost.${RESET}`,
  );
}

console.log(
  `${DIM}\n  Reads PUBLIC DNS: what the world resolves, not what is in the registrar's\n` +
    `  panel. A record that exists but is not published is invisible here.${RESET}\n`,
);

function report() {
  const rows = (title, items) =>
    `### ${title}\n\n` + (items.length ? items.map((i) => `- \`${i}\``).join('\n') : '_none_') + '\n\n';

  return `# DNS — ${domain}

Captured ${zone.capturedAt}. **Public DNS only** — what the world resolves, not what is in
the registrar's panel.

⚠ **This is the rollback artefact for the cutover.** Commit it. After moving the apex, run
\`npm run dns -- ${domain} --compare\` to see what stopped resolving.

## The two that end launches

**MX — ${zone.mx.length ? `${zone.mx.length} record(s). EMAIL LIVES ON THIS DOMAIN.` : 'none. Email is not on this domain.'}**

${
  zone.mx.length
    ? zone.mx.map((m) => `- \`${m.exchange}\` priority ${m.priority}`).join('\n') +
      `\n\nCarry these before moving the apex. Losing MX kills the client's email and does it\nsilently — the bounce goes to the sender, not to them. A dead site gets a phone call in\nminutes; dead email gets noticed when an invoice does not arrive.\n\n`
    : 'Nothing to preserve. Confirm it with the client anyway — email on a subdomain or a\nseparate provider still breaks if the nameservers move.\n\n'
}**CAA — ${caaIssuers.length ? caaIssuers.join(', ') : 'none, any CA may issue'}**

${
  caaBlocks
    ? '⚠ **None of these is a CA Cloudflare issues through** (Google Trust Services, ' +
      "Let's Encrypt, SSL.com). Certificate issuance will fail after cutover and the site will\nserve a TLS error that nothing in the repo can fix. Fix this before the cutover, not during.\n\n"
    : 'No blocker. If a CAA record is added later it must include the host\'s CA.\n\n'
}## Records

${rows('Nameservers', zone.ns)}${rows('A', zone.a.map((r) => `${r.address}  ttl ${r.ttl}s`))}${rows('AAAA', zone.aaaa.map((r) => r.address))}${rows(`CNAME on www.${domain}`, zone.wwwCname)}
## Email authentication

Losing any of these does not bounce mail immediately — it degrades deliverability, so the
symptom is "our emails started going to spam" weeks later.

${rows('SPF', spf)}${rows('DMARC', zone.dmarc)}${rows('DKIM selectors found', Object.keys(zone.dkim))}
DKIM selectors are per-provider and cannot be enumerated. Only common ones were probed, so an
empty list here means *not found*, never *not present*.

## Verification records

${rows('Ownership / verification TXT', verifications)}
Each belongs to a service — Search Console, Bing, Meta, a payment provider — that loses access
silently when the record goes. Same rule as the file-based verification in \`stacks.md\` §1d.

## All TXT

${rows('TXT', zone.txt)}
`;
}
