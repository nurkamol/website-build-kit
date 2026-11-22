/**
 * Brevo transactional email.
 *
 * Deliberately thin: one fetch, no SDK. The API is three fields and a bearer
 * header — a dependency here would be a liability with no upside.
 */

import type { LeadRecord } from './lead';
import type { FormDef } from '../data/forms';
import { business } from '../data/business';
import { site } from '../data/site';

const ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

type SendResult = { ok: true; messageId?: string } | { ok: false; error: string };

async function send(
  apiKey: string,
  payload: Record<string, unknown>,
  timeoutMs = 8000,
): Promise<SendResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return { ok: false, error: `Brevo ${response.status}: ${body.slice(0, 300)}` };
    }

    const data = (await response.json().catch(() => ({}))) as { messageId?: string };
    return { ok: true, messageId: data.messageId };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const row = (label: string, value: string) =>
  value
    ? `<tr><td style="padding:8px 16px 8px 0;color:#5b656e;font-size:14px;white-space:nowrap;vertical-align:top">${label}</td><td style="padding:8px 0;color:#14171a;font-size:14px"><strong>${escapeHtml(value)}</strong></td></tr>`
    : '';

/**
 * Internal new-lead notification.
 *
 * The rows are the form's OWN fields, in the form's order, from
 * `src/data/forms.ts` — short answers in the table, long ones (textareas) below
 * it. A field the visitor did not answer, or that its condition hid, prints
 * nothing rather than an empty row.
 */
export function notifyTeam(apiKey: string, lead: LeadRecord, form: FormDef) {
  const subjectTag = lead.env === 'test' ? '[TEST] ' : '';
  const who = lead.name || lead.email || 'website visitor';
  const about = form.subjectField ? lead.fields[form.subjectField] : '';
  const when = `${new Date(lead.receivedAt).toLocaleString(business.locale, { timeZone: business.address.timeZone, dateStyle: 'full', timeStyle: 'short' })} ${business.address.timeZoneLabel}`;
  const short = form.fields.filter((f) => f.type !== 'textarea');
  const long = form.fields.filter((f) => f.type === 'textarea' && lead.fields[f.name]);
  return send(apiKey, {
    sender: { name: business.email.senderName, email: business.email.sender },
    to: [{ email: site.leadNotifyTo, name: business.name }],
    ...(lead.email ? { replyTo: { email: lead.email, ...(lead.name ? { name: lead.name } : {}) } } : {}),
    subject: `${subjectTag}${form.subject} — ${who}${about ? ` (${about})` : ''}`,
    htmlContent: `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f6f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;border:1px solid #e3e8eb">
  ${lead.env === 'test' ? '<p style="margin:0 0 16px;padding:8px 12px;background:#fdf6e3;border-radius:8px;color:#7a5c00;font-size:13px">Submitted from staging — this is a test lead.</p>' : ''}
  <h1 style="margin:0 0 4px;font-size:20px;color:#14171a">${escapeHtml(form.subject)}</h1>
  <p style="margin:0 0 20px;color:#5b656e;font-size:14px">${when}</p>
  <table style="width:100%;border-collapse:collapse">
    ${short.map((f) => row(escapeHtml(f.label), lead.fields[f.name] ?? '')).join('')}
    ${row('Page', lead.page)}
  </table>
  ${long.map((f) => `<div style="margin-top:20px;padding-top:20px;border-top:1px solid #e3e8eb"><p style="margin:0 0 6px;color:#5b656e;font-size:13px">${escapeHtml(f.label)}</p><p style="margin:0;color:#14171a;font-size:15px;line-height:1.6;white-space:pre-wrap">${escapeHtml(lead.fields[f.name])}</p></div>`).join('')}
  <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e3e8eb;color:#78838c;font-size:12px">Lead ${lead.id} · ${escapeHtml(form.id)} form${lead.email ? ` · reply directly to reach ${escapeHtml(who)}` : ''}</p>
</div></body></html>`,
    textContent: [
      lead.env === 'test' ? '[TEST LEAD — submitted from staging]' : '',
      form.subject,
      when,
      '',
      ...short.filter((f) => lead.fields[f.name]).map((f) => `${f.label}: ${lead.fields[f.name]}`),
      `Page: ${lead.page}`,
      ...long.flatMap((f) => ['', `${f.label}:`, lead.fields[f.name]]),
      '',
      `Lead ${lead.id} · ${form.id} form · ${lead.receivedAt}`,
    ]
      /* Drop empty lines, except one between blocks. */
      .filter((line, i, all) => line !== '' || (i > 0 && all[i - 1] !== ''))
      .join('\n'),
  });
}
