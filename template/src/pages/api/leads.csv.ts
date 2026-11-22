import type { APIRoute } from 'astro';
import type { LeadRecord } from '../../lib/lead';
import { site } from '../../data/site';
import { forms, DEFAULT_FORM } from '../../data/forms';
import { kv, secret } from '../../lib/runtime';

export const prerender = false;

/**
 * Base columns, then one column per field of every form in `src/data/forms.ts`
 * (a name two forms share is one column), then the request details.
 *
 * ⚠ LEADS STORED BEFORE FORMS WERE DATA-DRIVEN still export: they kept
 *   `phone`, `service` and `message` at the top level rather than under
 *   `fields`, so a field column falls back to the top-level key. Without that,
 *   every lead from before the upgrade exports with those columns blank — and
 *   the retention period means some are still in the store.
 */
const BASE = ['receivedAt', 'form', 'name', 'email'] as const;
const TAIL = ['page', 'country', 'env', 'id'] as const;
const reserved = new Set<string>([...BASE, ...TAIL]);
const FIELD_COLUMNS = [
  ...new Set(Object.values(forms).flatMap((f) => f.fields.map((field) => field.name))),
].filter((name) => !reserved.has(name));
const COLUMNS = [...BASE, ...FIELD_COLUMNS, ...TAIL];

type StoredLead = Partial<LeadRecord> & Record<string, unknown>;
const value = (lead: StoredLead, column: string) =>
  (BASE as readonly string[]).includes(column) || (TAIL as readonly string[]).includes(column)
    ? (lead[column] ?? (column === 'form' ? DEFAULT_FORM : ''))
    : (lead.fields?.[column] ?? lead[column] ?? '');

/** RFC 4180: quote everything, double internal quotes. Excel-safe. */
const cell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

/**
 * Every lead as a CSV, newest last (KV lists keys in lexicographic order and
 * the key is `lead:<iso-timestamp>:<uuid>`).
 *
 *   curl -H "Authorization: Bearer $LEADS_EXPORT_TOKEN" \
 *        https://example.com/api/leads.csv -o leads.csv
 */
export const GET: APIRoute = async ({ request }) => {
  const expected = secret('LEADS_EXPORT_TOKEN');

  if (!expected) {
    return new Response('Export is not configured.\n', { status: 503 });
  }

  const url = new URL(request.url);
  const presented =
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? url.searchParams.get('token') ?? '';

  // Constant-time-ish: compare full length, never short-circuit on first byte.
  const ok =
    presented.length === expected.length &&
    presented.split('').reduce((acc, char, i) => acc | (char.charCodeAt(0) ^ expected.charCodeAt(i)), 0) === 0;

  if (!ok) {
    return new Response('Unauthorized\n', {
      status: 401,
      headers: { 'www-authenticate': 'Bearer realm="leads"' },
    });
  }

  const store = kv(site.leadsBinding);
  if (!store) return new Response('Lead storage is not bound.\n', { status: 503 });

  const rows: string[] = [COLUMNS.join(',')];
  let cursor: string | undefined;

  do {
    const page = await store.list({ prefix: 'lead:', cursor, limit: 1000 });
    const values = await Promise.all(
      page.keys.map((key) => store.get(key.name, 'json') as Promise<StoredLead | null>),
    );
    for (const lead of values) {
      if (!lead) continue;
      rows.push(COLUMNS.map((column) => cell(value(lead, column))).join(','));
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  const stamp = new Date().toISOString().slice(0, 10);
  // BOM so Excel opens UTF-8 accents correctly instead of mojibake.
  return new Response('﻿' + rows.join('\r\n') + '\r\n', {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="leads-${stamp}.csv"`,
      'cache-control': 'no-store',
    },
  });
};
