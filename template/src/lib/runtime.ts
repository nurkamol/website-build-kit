/**
 * Access to Cloudflare bindings.
 *
 * `Astro.locals.runtime.env` was removed in Astro v6 — reading it throws at
 * request time while the build, the types and the deploy all stay green. The
 * only signal is an actual request. Everything that touches a binding goes
 * through here so there is one place to change if it moves again.
 *
 * `env` from `cloudflare:workers` is a lazy proxy: importing it at module scope
 * is safe, but touching a property outside a request context is not. Only read
 * it inside a handler.
 */
import { env } from 'cloudflare:workers';

type Bindings = {
  LEADS?: KVNamespace;
  LEADS_STAGING?: KVNamespace;
  /** The 404 watcher's counts — optional. Absent, src/pages/api/missed.ts records nothing. */
  MISSES?: KVNamespace;
  BREVO_API_KEY?: string;
  LEADS_EXPORT_TOKEN?: string;
  /** Cloudflare Turnstile secret. The form checks a token only when this is set AND the build had
      PUBLIC_TURNSTILE_SITE_KEY — see src/pages/api/contact.ts. */
  TURNSTILE_SECRET?: string;
};

export function bindings(): Bindings {
  return env as unknown as Bindings;
}

export function kv(name: 'LEADS' | 'LEADS_STAGING' | 'MISSES'): KVNamespace | undefined {
  return bindings()[name];
}

export function secret(name: 'BREVO_API_KEY' | 'LEADS_EXPORT_TOKEN' | 'TURNSTILE_SECRET'): string | undefined {
  const value = bindings()[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
