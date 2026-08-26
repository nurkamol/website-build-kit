import { existsSync, readdirSync, readFileSync } from 'node:fs';

const DIR = 'src/content/legal';

/**
 * Legal routes whose frontmatter says `noindex: true`.
 *
 * Read at CONFIG time, so `@astrojs/sitemap` can leave them out.
 *
 * `check-sitemap.mjs` explains why the sitemap's exclusion list is hand-kept in
 * general: inclusion is decided in astro.config.mjs, before any page renders,
 * so at that moment nothing knows which routes will emit the tag. Legal pages
 * are the exception — their `noindex` is frontmatter sitting on disk, readable
 * without rendering anything, so this one list can derive rather than drift.
 *
 * Deliberately a flat regex rather than a YAML parser: the config should not
 * pull in a second content pipeline to answer one boolean, and if the shape
 * ever stops matching, `npm run check:sitemap` fails the production build —
 * which is exactly the cross-check that exists for this.
 */
export function noindexLegalRoutes() {
  if (!existsSync(DIR)) return [];

  return readdirSync(DIR)
    .filter((file) => file.endsWith('.md'))
    .filter((file) => {
      const frontmatter = readFileSync(`${DIR}/${file}`, 'utf8').split(/^---\s*$/m)[1] ?? '';
      return /^\s*noindex:\s*true\s*$/m.test(frontmatter);
    })
    .map((file) => `/${file.replace(/\.md$/, '')}/`);
}
