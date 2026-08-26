/**
 * Lead validation and shape. Shared by the API route and (for the field names)
 * the form component, so the two cannot drift.
 */

export type LeadField = 'name' | 'email' | 'phone' | 'service' | 'message';

export type LeadInput = Record<LeadField, string> & {
  /** Honeypot. Real users never fill this. */
  company?: string;
  page?: string;
};

export type LeadRecord = {
  id: string;
  receivedAt: string;
  env: 'live' | 'test';
  name: string;
  email: string;
  phone: string;
  service: string;
  message: string;
  page: string;
  userAgent: string;
  country: string;
  ip: string;
};

/**
 * The form's service dropdown. Keep in step with `src/data/services.ts` — these
 * strings land in the lead record and the notification email, so a value that
 * does not match a real service makes the enquiry harder to route, not easier.
 * Always keep a final catch-all option.
 */
export const SERVICE_OPTIONS = [
  'Service one',
  'Service two',
  'Something else',
] as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/** Digits only, 10 or 11 (with a leading 1). Formatting is the user's business. */
const digits = (value: string) => value.replace(/\D/g, '');

export function validateLead(input: Partial<LeadInput>): {
  ok: boolean;
  errors: Partial<Record<LeadField, string>>;
  values: Record<LeadField, string>;
} {
  const values = {
    name: (input.name ?? '').trim(),
    email: (input.email ?? '').trim(),
    phone: (input.phone ?? '').trim(),
    service: (input.service ?? '').trim(),
    message: (input.message ?? '').trim(),
  };

  const errors: Partial<Record<LeadField, string>> = {};

  if (values.name.length < 2) errors.name = 'Please tell us your name.';
  else if (values.name.length > 100) errors.name = 'That name is too long.';

  if (!values.email) errors.email = 'We need an email to send your quote to.';
  else if (!EMAIL.test(values.email) || values.email.length > 200)
    errors.email = 'That email address does not look right.';

  /*
   * Country-agnostic on purpose. E.164 caps a number at 15 digits including the
   * country code, and 7 is about the shortest real national number, so anything
   * in that band is plausible somewhere. A 10-digit rule is a US rule, and it
   * silently rejects every UK, Irish and Australian visitor on a kit whose own
   * compliance reference covers the EAA and AODA.
   *
   * ⚠ Tighten this per project if you serve one country. Do not tighten it in
   * the template.
   */
  const phoneDigits = digits(values.phone);
  if (!values.phone) errors.phone = 'A phone number lets us confirm your appointment.';
  else if (phoneDigits.length < 7 || phoneDigits.length > 15)
    errors.phone = 'That phone number does not look right.';

  if (values.message.length > 4000) errors.message = 'Please keep your message under 4000 characters.';

  return { ok: Object.keys(errors).length === 0, errors, values };
}

/**
 * Key format sorts chronologically in a KV list, so the CSV export comes out
 * newest-last without a sort step and pagination is stable.
 */
export const leadKey = (receivedAt: string, id: string) => `lead:${receivedAt}:${id}`;
