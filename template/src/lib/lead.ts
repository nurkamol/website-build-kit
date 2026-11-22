/**
 * Lead validation and shape, driven by `src/data/forms.ts` — the API and the form component read
 * the same definitions, so the two cannot drift.
 */
import type { FieldDef, FormDef } from '../data/forms';

export type LeadRecord = {
  id: string;
  receivedAt: string;
  env: 'live' | 'test';
  /** Which definition in `src/data/forms.ts` this came through. */
  form: string;
  /** Display name, built from the form's `nameFields`. May be empty. */
  name: string;
  /** Reply-to. Empty when the form has no `email` field. */
  email: string;
  /** Every field of the form by name, in the form's order. Checkbox choices joined with "; ". */
  fields: Record<string, string>;
  page: string;
  userAgent: string;
  country: string;
  ip: string;
};

/** What a submission looks like once read: one string per field, a list for a checkbox group. */
export type LeadInput = Record<string, string | string[] | null | undefined>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const digits = (value: string) => value.replace(/\D/g, '');

/** Longest accepted value per type — enough for anything real, short of a pasted document. */
const MAX: Record<FieldDef['type'], number> = {
  text: 200,
  email: 200,
  tel: 40,
  date: 10,
  textarea: 4000,
  checkboxes: 2000,
  radio: 200,
  select: 200,
};

const list = (raw: LeadInput[string]) =>
  (Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : []).map((v) => v.trim()).filter(Boolean);

/**
 * Which fields of `form` apply to this submission. A field with `showWhen` applies only while its
 * controlling field applies AND has one of the listed values — so a chain of conditions collapses
 * correctly when an early answer changes. A rule naming a field that does not exist never matches
 * (`check:form` refuses that at build time), and a cycle is treated as hidden rather than looping.
 */
export function visibleFields(form: FormDef, input: LeadInput): Set<string> {
  const byName = new Map(form.fields.map((f) => [f.name, f]));
  const memo = new Map<string, boolean>();
  const visible = (field: FieldDef, trail: Set<string>): boolean => {
    if (!field.showWhen) return true;
    if (memo.has(field.name)) return memo.get(field.name)!;
    if (trail.has(field.name)) return false;
    const rule = field.showWhen;
    const controller = byName.get(rule.field);
    const shown =
      !!controller &&
      visible(controller, new Set([...trail, field.name])) &&
      list(input[controller.name]).some((v) => rule.anyOf.includes(v));
    memo.set(field.name, shown);
    return shown;
  };
  return new Set(form.fields.filter((f) => visible(f, new Set())).map((f) => f.name));
}

export function validateLead(
  form: FormDef,
  input: LeadInput,
): { ok: boolean; errors: Record<string, string>; values: Record<string, string> } {
  const errors: Record<string, string> = {};
  const values: Record<string, string> = {};
  const shown = visibleFields(form, input);
  const missing = (field: FieldDef) => field.ask ?? `Please fill in ${field.label.toLowerCase()}.`;

  for (const field of form.fields) {
    /* Conditional logic, applied here too: a field the visitor could not see is never required,
       and whatever reached it (a no-JavaScript visitor, a stale value) is not stored. */
    if (!shown.has(field.name)) {
      values[field.name] = '';
      continue;
    }

    if (field.type === 'checkboxes') {
      const chosen = [...new Set(list(input[field.name]))];
      values[field.name] = chosen.join('; ');
      if (chosen.some((v) => !field.options?.includes(v))) errors[field.name] = 'Please choose from the options listed.';
      else if (field.required && !chosen.length)
        errors[field.name] = field.ask ?? `Please choose at least one ${field.label.toLowerCase()}.`;
      else if (values[field.name].length > MAX.checkboxes) errors[field.name] = 'That is more than we can accept here.';
      continue;
    }

    const raw = input[field.name];
    /* The API lets a list through only for a checkbox group, so a string is all that reaches here. */
    const value = (typeof raw === 'string' ? raw : '').trim();
    values[field.name] = value;

    if (!value) {
      if (field.required) errors[field.name] = missing(field);
      continue;
    }
    if (value.length > MAX[field.type]) {
      errors[field.name] =
        field.type === 'textarea' ? `Please keep this under ${MAX.textarea} characters.` : 'That is longer than we can accept here.';
      continue;
    }
    if (field.minLength && value.length < field.minLength) {
      errors[field.name] = missing(field);
      continue;
    }
    if ((field.type === 'radio' || field.type === 'select') && !field.options?.includes(value)) {
      errors[field.name] = 'Please choose from the options listed.';
    }
    if (field.type === 'email' && !EMAIL.test(value)) errors[field.name] = 'That email address does not look right.';
    /*
     * Country-agnostic on purpose. E.164 caps a number at 15 digits including the country code,
     * and 7 is about the shortest real national number, so anything in that band is plausible
     * somewhere. A 10-digit rule is a US rule, and it silently rejects every UK, Irish and
     * Australian visitor on a kit whose own compliance reference covers the EAA and AODA.
     *
     * ⚠ Tighten this per project if you serve one country. Do not tighten it in the template.
     */
    if (field.type === 'tel') {
      const d = digits(value);
      if (d.length < 7 || d.length > 15) errors[field.name] = 'That phone number does not look right.';
    }
    if (field.type === 'date') {
      const real = DATE.test(value) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
      if (!real) errors[field.name] = 'Please choose a date.';
    }
  }

  return { ok: Object.keys(errors).length === 0, errors, values };
}

export const displayName = (form: FormDef, values: Record<string, string>) =>
  form.nameFields.map((n) => values[n] ?? '').filter(Boolean).join(' ');

/**
 * The fields to highlight on the no-JavaScript path, for THIS form. The API carries the form id
 * back with the failing names, so a page with two forms highlights only the one that was sent.
 */
export function invalidFieldsFor(url: URL, form: FormDef): string[] {
  const posted = url.searchParams.get('form');
  if (posted && posted !== form.id) return [];
  return (url.searchParams.get('invalid') ?? '').split(',').filter(Boolean);
}

/**
 * Key format sorts chronologically in a KV list, so the CSV export comes out
 * newest-last without a sort step and pagination is stable.
 */
export const leadKey = (receivedAt: string, id: string) => `lead:${receivedAt}:${id}`;
