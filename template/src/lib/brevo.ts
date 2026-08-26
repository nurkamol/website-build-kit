/**
 * Brevo transactional email.
 *
 * Deliberately thin: one fetch, no SDK. The API is three fields and a bearer
 * header — a dependency here would be a liability with no upside.
 */

import type { LeadRecord } from './lead';
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

/** Internal new-lead notification. */
export function notifyTeam(apiKey: string, lead: LeadRecord) {
  const subjectTag = lead.env === 'test' ? '[TEST] ' : '';
  return send(apiKey, {
    sender: { name: business.email.senderName, email: business.email.sender },
    to: [{ email: site.leadNotifyTo, name: business.name }],
    replyTo: { email: lead.email, name: lead.name },
    subject: `${subjectTag}New quote request — ${lead.name}${lead.service ? ` (${lead.service})` : ''}`,
    htmlContent: `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f6f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;border:1px solid #e3e8eb">
  ${lead.env === 'test' ? '<p style="margin:0 0 16px;padding:8px 12px;background:#fdf6e3;border-radius:8px;color:#7a5c00;font-size:13px">Submitted from staging — this is a test lead.</p>' : ''}
  <h1 style="margin:0 0 4px;font-size:20px;color:#14171a">New quote request</h1>
  <p style="margin:0 0 20px;color:#5b656e;font-size:14px">${new Date(lead.receivedAt).toLocaleString(business.locale, { timeZone: business.address.timeZone, dateStyle: 'full', timeStyle: 'short' })} ${business.address.timeZoneLabel}</p>
  <table style="width:100%;border-collapse:collapse">
    ${row('Name', lead.name)}
    ${row('Email', lead.email)}
    ${row('Phone', lead.phone)}
    ${row('Service', lead.service)}
    ${row('Page', lead.page)}
  </table>
  ${lead.message ? `<div style="margin-top:20px;padding-top:20px;border-top:1px solid #e3e8eb"><p style="margin:0 0 6px;color:#5b656e;font-size:13px">Message</p><p style="margin:0;color:#14171a;font-size:15px;line-height:1.6;white-space:pre-wrap">${escapeHtml(lead.message)}</p></div>` : ''}
  <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e3e8eb;color:#78838c;font-size:12px">Lead ${lead.id} · reply directly to reach ${escapeHtml(lead.name)}</p>
</div></body></html>`,
    textContent: [
      lead.env === 'test' ? '[TEST LEAD — submitted from staging]' : '',
      'New quote request',
      `Name:    ${lead.name}`,
      `Email:   ${lead.email}`,
      `Phone:   ${lead.phone}`,
      `Service: ${lead.service}`,
      `Page:    ${lead.page}`,
      '',
      lead.message,
      '',
      `Lead ${lead.id} · ${lead.receivedAt}`,
    ]
      .filter(Boolean)
      .join('\n'),
  });
}
