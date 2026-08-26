import type { APIRoute } from 'astro';
import { validateLead, leadKey, type LeadRecord } from '../../lib/lead';
import { notifyTeam } from '../../lib/brevo';
import { site } from '../../data/site';
import { kv, secret } from '../../lib/runtime';
import { business } from '../../data/business';

/**
 * Where the no-JavaScript path lands. One place, because these are routes and
 * a route that only exists in a redirect string is a route nobody notices has
 * gone — the first version of this file pointed at /contact-us/ and /thank-you/
 * from a different project, and both were 404s in a fresh build.
 */
const FORM_PAGE = '/contact/';
const FORM_ANCHOR = '#quote';
const SUCCESS = `${FORM_PAGE}?sent=1${FORM_ANCHOR}`;

// This is the one route that needs a runtime. Everything else is static.
export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

/**
 * A native form POST — no JavaScript — must not land on a page of raw JSON.
 * The enhanced path sends `accept: application/json`; anything else is a
 * browser submitting the form directly and gets a redirect it can follow.
 */
const wantsHtml = (request: Request) => {
  const accept = request.headers.get('accept') ?? '';
  return accept.includes('text/html') && !accept.includes('application/json');
};

const seeOther = (location: string) =>
  new Response(null, { status: 303, headers: { location, 'cache-control': 'no-store' } });

/**
 * Refuse a POST that came from someone else's page.
 *
 * A browser always sends `Origin` on a cross-origin POST, so comparing it to
 * our own host blocks the case this is for: another site putting a form in
 * front of visitors that writes into this site's lead store.
 *
 * ⚠ WHAT IT DOES NOT STOP, so nobody reads more into it than it does: a script
 * posting directly can simply omit the header, and `Origin` is absent on a
 * same-origin form post from some privacy tooling — so absent has to be
 * allowed, or the no-JavaScript path breaks for real people. Spam is the
 * honeypot's job, not this.
 *
 * This check must run BEFORE validation. Ordering it after means a
 * cross-origin post with a well-formed body is processed and stored, and the
 * refusal only ever fires for submissions that were going to be rejected
 * anyway — which looks identical in a status-code test.
 */
const sameOrigin = (request: Request) => {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
};

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!sameOrigin(request)) {
    return json({ ok: false, error: 'Cross-origin submissions are not accepted.' }, 403);
  }

  const contentType = request.headers.get('content-type') ?? '';
  let input: Record<string, string>;

  try {
    if (contentType.includes('application/json')) {
      input = (await request.json()) as Record<string, string>;
    } else {
      const form = await request.formData();
      input = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
    }
  } catch {
    return json({ ok: false, error: 'Could not read the submission.' }, 400);
  }

  /*
   * Honeypot. Accept silently — telling a bot it was caught just teaches it to
   * try again without the field.
   *
   * ⚠ IT MUST NOT LAND ON `SUCCESS`. That URL is the conversion: the form page
   * fires `generate_lead` on `?sent=1` for the no-JavaScript path. Sending
   * caught spam there lets any bot that runs JavaScript inflate the only
   * conversion the website owns — silently, in a shape that looks like the site
   * performing unusually well, which nobody investigates.
   *
   * It goes to the plain form page instead: same 303, no error, nothing a bot
   * can read as detection.
   */
  if (input.company) {
    return wantsHtml(request) ? seeOther(FORM_PAGE) : json({ ok: true, id: 'accepted' }, 200);
  }

  const { ok, errors, values } = validateLead(input);
  if (!ok) {
    if (wantsHtml(request)) {
      // Carry the failing field names back in the query string so the form can
      // highlight them without JavaScript having to re-post anything.
      return seeOther(`${FORM_PAGE}?invalid=${encodeURIComponent(Object.keys(errors).join(','))}${FORM_ANCHOR}`);
    }
    return json({ ok: false, errors }, 422);
  }

  const receivedAt = new Date().toISOString();
  const id = crypto.randomUUID();
  const lead: LeadRecord = {
    id,
    receivedAt,
    env: site.leadTag,
    ...values,
    page: (input.page ?? '').slice(0, 300),
    userAgent: (request.headers.get('user-agent') ?? '').slice(0, 300),
    country: request.headers.get('cf-ipcountry') ?? '',
    ip: clientAddress ?? '',
  };

  // ── Durable first, third party second ──────────────────────────────────
  // The KV write happens BEFORE the Brevo call, so a provider outage costs a
  // notification rather than a lead. If KV itself fails we still try to send,
  // because an email in an inbox beats losing the enquiry entirely.
  const store = kv(site.leadsBinding);

  let stored = false;
  if (store) {
    try {
      /*
       * `expirationTtl` is the retention policy, enforced by the store. See
       * site.leadRetentionDays — without it KV keeps a lead forever, which is
       * not a defensible answer to "how long do you hold this data".
       *
       * Metadata carries NO personal data. It used to duplicate name and email
       * here, which put them in `list()` — an operation that returns metadata
       * without reading values, so the PII was available through the cheaper
       * call. Nothing consumed it: the CSV export does a `get()` per key and
       * reads the full record. Duplicated personal data with no reader is all
       * cost and no benefit.
       */
      await store.put(leadKey(receivedAt, id), JSON.stringify(lead), {
        expirationTtl: site.leadRetentionDays * 24 * 60 * 60,
        metadata: { env: lead.env },
      });
      stored = true;
    } catch (error) {
      console.error('lead kv write failed', { id, error: String(error) });
    }
  } else {
    console.error('lead kv binding missing', { binding: site.leadsBinding });
  }

  let emailed = false;
  const apiKey = secret('BREVO_API_KEY');
  if (apiKey) {
    const result = await notifyTeam(apiKey, lead);
    emailed = result.ok;
    if (!result.ok) console.error('lead email failed', { id, error: result.error });
  } else {
    console.error('BREVO_API_KEY not set');
  }

  // Only a total loss is reported as failure to the visitor. If either channel
  // captured it, the enquiry reached us and the visitor should not retry.
  if (!stored && !emailed) {
    if (wantsHtml(request)) return seeOther(`${FORM_PAGE}?failed=1${FORM_ANCHOR}`);
    return json(
      {
        ok: false,
        // From business.ts. A phone number written into an error string is the
        // last place anyone looks, and the first place a previous client's
        // number survives a copy-paste.
        error: `We could not record your request. Please call us at ${business.phone.display}.`,
      },
      502,
    );
  }

  if (wantsHtml(request)) return seeOther(SUCCESS);
  return json({ ok: true, id, stored, emailed }, 200);
};

/** A GET here is almost always a person pasting the URL. Send them to the form. */
export const GET: APIRoute = () => new Response(null, { status: 303, headers: { location: FORM_PAGE } });
