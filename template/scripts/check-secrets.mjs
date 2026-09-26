/**
 * Refuse to call a deploy finished when the worker is missing a secret.
 *
 *   npm run check:secrets
 *
 * Runs at the end of `deploy:staging` and `deploy:production`, after the deploy
 * rather than before it — a worker that does not exist yet cannot be missing
 * anything, and the first deploy is exactly when a secret has never been set.
 *
 * ── THE FAILURE THIS EXISTS FOR ────────────────────────────────────────────
 * `secret()` in src/lib/runtime.ts returns `undefined` for a binding that was
 * never set. Nothing throws. The contact form still validates, still stores the
 * lead in KV, still returns 200, and still shows the visitor a thank-you.
 *
 * The API says `{"stored":true,"emailed":false}` and nobody reads API responses.
 *
 * So the site captures enquiries and notifies no one. There is no error, no
 * failed request, no console warning, and nothing in the deploy log. It is found
 * weeks later, by someone asking why the phone stopped ringing — and the leads
 * are all still sitting in KV, which is the only reason this is recoverable.
 *
 * ⚠ THIS IS NOT HYPOTHETICAL. It shipped that way on the ochome build: deployed,
 *   verified green by `npm run verify`, storing leads, emailing nothing.
 *   `verify` lists it under "what this cannot see", which is honest and did not
 *   help — a note in a report nobody re-reads is not a gate.
 *
 * ── WHAT IT COMPARES ───────────────────────────────────────────────────────
 * `.dev.vars.example` is the declared contract: every secret the code expects,
 * committed, with placeholder values. `wrangler secret list` is what the
 * deployed worker actually holds. The two disagreeing is the bug.
 *
 * Using the example file rather than a list hardcoded here means adding a
 * secret to the code and to the example — which you must do anyway, or local
 * `wrangler dev` breaks — extends this check for free. A hardcoded list would
 * go stale silently, the way `check-env.mjs` did.
 */

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';
const YELLOW = '\x1b[33m';

/* `npx` is `npx.cmd` on Windows and execFileSync cannot resolve it without a
   shell. Windows is a supported target and this is the second script to need
   the line. */
const WIN = process.platform === 'win32';

/** Every NAME= in .dev.vars.example, which is the list the code expects. */
function declaredSecrets() {
  let raw;
  try {
    raw = readFileSync('.dev.vars.example', 'utf8');
  } catch {
    console.error(
      `\n${RED}✗ .dev.vars.example not found${RESET}\n\n` +
        '  It is the declared list of secrets this site needs, and this check\n' +
        '  has nothing to compare against without it. Run from the project root.\n',
    );
    process.exit(1);
  }
  return [...raw.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=/gm)].map((m) => m[1]);
}

/**
 * Secrets on the deployed worker.
 *
 * Returns null — not an empty list — when the worker does not exist yet, so a
 * pre-deploy state is never reported as "every secret is missing".
 */
function deployedSecrets() {
  let out;
  try {
    out = execFileSync(WIN ? 'npx.cmd' : 'npx', ['wrangler', 'secret', 'list', '--format', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: WIN,
    });
  } catch (err) {
    const text = `${err.stdout ?? ''}${err.stderr ?? ''}`;
    /* A worker that has never been deployed, versus a real problem — being
       logged out, or offline. Only the first is not a failure. */
    if (/script_not_found|workers\.api\.error\.script_not_found|10007|not found/i.test(text)) {
      return null;
    }
    /*
     * ⚠ NAME THE ACTUAL BLOCKER. This said "Usually `wrangler login`" for every
     *   failure, and then `--format json` was added — so a wrangler too old to
     *   know that flag would print its usage and be told to log in, which it
     *   already was. A hint that is wrong is worse than no hint: it sends the
     *   next person somewhere the fault is not.
     */
    const tooOld = /unknown (argument|option)|not enough non-option arguments|--format/i.test(text);
    console.error(
      `\n${RED}✗ could not read the worker's secrets${RESET}\n\n` +
        `${text.trim().split('\n').slice(-6).map((l) => `  ${l}`).join('\n')}\n\n` +
        (tooOld
          ? '  That reads like a wrangler that does not know `--format json`, which this\n' +
            '  check passes explicitly rather than trusting the default. Upgrade wrangler,\n' +
            '  or drop the flag here and accept whatever format it chooses.\n'
          : '  Usually `wrangler login`. This check cannot pass without an answer —\n' +
            '  it refuses rather than assume the secrets are fine.\n'),
    );
    process.exit(1);
  }
  /*
   * wrangler prints a banner before the JSON. Take the array, not the noise.
   *
   * ⚠ `--format json` IS PASSED EXPLICITLY, and it used not to be. JSON is the
   *   current default — `wrangler secret list --help` says
   *   `[choices: "json", "pretty"] [default: "json"]` — and a default that is
   *   now a documented CHOICE is a default that can be changed under us. This
   *   script is the only thing standing between a deploy and a site that
   *   captures leads and silently cannot email them; it should not rest on
   *   somebody else's default.
   *
   * ⚠ AND BOTH FALLBACKS USED TO `return []`, WHICH IS A LIE WITH A MEANING.
   *   An empty array is a real answer — a deployed worker holding no secrets —
   *   so returning it for output we could not parse said "this worker has no
   *   secrets" when the truth was "I cannot tell". The report that follows then
   *   names every declared secret as missing, which is the right alarm for the
   *   wrong reason: someone goes hunting for secrets that are all present.
   *
   *   Parsed-and-empty still returns `[]`, because that IS the answer.
   */
  const match = out.match(/\[[\s\S]*\]/);
  let parsed = null;
  if (match) {
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      parsed = null;
    }
  }
  if (!Array.isArray(parsed)) {
    console.error(
      `\n${RED}✗ could not read wrangler's answer${RESET}\n\n` +
        '  `wrangler secret list --format json` did not return a JSON array, so this\n' +
        '  check cannot say whether the worker has its secrets. It refuses rather than\n' +
        '  report them all as missing, which is what it used to do.\n\n' +
        `${out.trim().split('\n').slice(-8).map((l) => `  ${DIM}${l}${RESET}`).join('\n')}\n\n` +
        '  If wrangler has changed its output, this script needs updating — not the\n' +
        '  secrets.\n',
    );
    process.exit(1);
  }
  return parsed.map((entry) => entry?.name).filter(Boolean);
}

const declared = declaredSecrets();
if (!declared.length) {
  console.log(`${DIM}· .dev.vars.example declares no secrets — nothing to check${RESET}`);
  process.exit(0);
}

const deployed = deployedSecrets();

if (deployed === null) {
  console.log(
    `${DIM}· worker not deployed yet — nothing to check${RESET}\n` +
      `${DIM}  ${declared.length} secret(s) will be required once it is: ${declared.join(', ')}${RESET}`,
  );
  process.exit(0);
}

const missing = declared.filter((name) => !deployed.includes(name));
const extra = deployed.filter((name) => !declared.includes(name));

if (missing.length) {
  console.error(`\n${RED}✗ the deployed worker is missing ${missing.length} secret(s)${RESET}\n`);
  for (const name of missing) {
    console.error(`    ${name}`);
  }
  console.error(
    `\n  The deploy succeeded. The site is live and INCOMPLETE — whatever reads\n` +
      `  these gets \`undefined\` and carries on silently. If BREVO_API_KEY is in\n` +
      `  the list, the form is storing leads and emailing nobody.\n\n` +
      `  Set them, then deploy again:\n\n` +
      missing.map((n) => `    npx wrangler secret put ${n}`).join('\n') +
      '\n',
  );
  process.exit(1);
}

if (extra.length) {
  /* Not a failure — a secret the code no longer reads is dead weight, not a
     broken site. Worth saying once, because it is usually a rename that only
     got done on one side. */
  console.log(
    `${YELLOW}!${RESET} on the worker but not in .dev.vars.example: ${extra.join(', ')}\n` +
      `${DIM}  either the code stopped reading it, or the example was never updated${RESET}`,
  );
}

console.log(`${GREEN}✓${RESET} every declared secret is set: ${declared.join(', ')}`);
