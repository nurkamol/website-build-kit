/// <reference types="@cloudflare/workers-types" />

/**
 * Cloudflare's runtime types — `KVNamespace`, `cloudflare:workers`, and the rest
 * of what src/lib/runtime.ts touches.
 *
 * Without this, `astro check` cannot see the Workers globals, so the one file in
 * the project that talks to a real binding is the one file TypeScript checks
 * least. It reports `Cannot find name 'KVNamespace'` and then infers `any`
 * through everything downstream, including the lead export.
 *
 * A triple-slash reference rather than `compilerOptions.types`, because setting
 * that key switches OFF automatic @types inclusion for everything else.
 *
 * For types that know your actual binding NAMES rather than the generic shapes,
 * run `npx wrangler types` and reference the file it generates instead. That
 * has to be re-run whenever wrangler.jsonc changes, which is the trade.
 */

interface ImportMetaEnv {
  /** Set by the build script. Never read directly — go through src/data/site.ts. */
  readonly PUBLIC_SITE_ENV?: 'development' | 'staging' | 'production';
  readonly PUBLIC_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
