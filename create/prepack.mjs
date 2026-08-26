/**
 * Copy ../template into ./template so `npm pack` can include it.
 *
 * The template is NOT duplicated in the repository — this runs at pack time and
 * `postpack` deletes it again. A committed second copy is a second thing to
 * keep in step, and it is the copy that goes stale silently.
 *
 * ── npm STRIPS .gitignore FROM PUBLISHED PACKAGES ──────────────────────────
 * Long-standing, documented npm behaviour and the reason every scaffolding tool
 * carries this workaround. It is not cosmetic here: the template's .gitignore
 * is what keeps `.dev.vars` — the file holding BREVO_API_KEY and the leads
 * export token — out of the repository. A scaffolded site without it invites
 * the first `git add -A` to commit live secrets, and nothing would report it.
 *
 * So it ships renamed, and index.mjs renames it back on the way out.
 */

import { cpSync, existsSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', 'template');
const dest = join(here, 'template');

if (!existsSync(src)) {
  console.error(`prepack: ${src} not found — run this from the kit repo.`);
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, {
  recursive: true,
  filter: (path) =>
    !/(^|\/)(node_modules|dist|\.astro|\.wrangler|recon|shots|\.dev\.vars)($|\/)/.test(path),
});

/* See the note above. `.npmrc` would be stripped too; the template has none. */
for (const [from, to] of [['.gitignore', 'gitignore']]) {
  const f = join(dest, from);
  if (existsSync(f)) renameSync(f, join(dest, to));
}

/* A committed .dev.vars would be a live secret in a public package. The filter
   above excludes it; assert rather than trust, because the cost is unbounded. */
for (const forbidden of ['.dev.vars', 'node_modules', 'dist']) {
  if (existsSync(join(dest, forbidden))) {
    console.error(`prepack: ${forbidden} reached the package. Refusing to pack.`);
    process.exit(1);
  }
}

console.log('prepack: template staged for packing');
