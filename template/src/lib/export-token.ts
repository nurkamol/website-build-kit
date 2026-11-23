import { secret } from './runtime';

/**
 * The one check behind every owner-only read: `/api/leads.csv` and
 * `/api/missed/`. Returns a refusal to send back, or null when the request
 * carries LEADS_EXPORT_TOKEN.
 *
 * One function because two copies of an auth check drift the first time one
 * of them is fixed — and the copy nobody fixed is the one left open.
 *
 * 503 when the token is not set at all: "not configured" is a different fact
 * from "wrong token", and reporting it as 401 sends someone hunting for a typo.
 */
export function refuseWithoutToken(request: Request, realm: string): Response | null {
  const expected = secret('LEADS_EXPORT_TOKEN');
  if (!expected) return new Response('Export is not configured.\n', { status: 503 });

  const url = new URL(request.url);
  const presented =
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? url.searchParams.get('token') ?? '';

  // Constant-time-ish: compare full length, never short-circuit on first byte.
  const ok =
    presented.length === expected.length &&
    presented.split('').reduce((acc, char, i) => acc | (char.charCodeAt(0) ^ expected.charCodeAt(i)), 0) === 0;

  return ok
    ? null
    : new Response('Unauthorized\n', { status: 401, headers: { 'www-authenticate': `Bearer realm="${realm}"` } });
}
