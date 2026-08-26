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
  BREVO_API_KEY?: string;
  LEADS_EXPORT_TOKEN?: string;
};

export function bindings(): Bindings {
  return env as unknown as Bindings;
}

export function kv(name: 'LEADS' | 'LEADS_STAGING'): KVNamespace | undefined {
  return bindings()[name];
}

export function secret(name: 'BREVO_API_KEY' | 'LEADS_EXPORT_TOKEN'): string | undefined {
  const value = bindings()[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
