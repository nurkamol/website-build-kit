/**
 * Every form on the site, defined once.
 *
 * `LeadForm.astro` renders from this, `api/contact.ts` validates against it, the lead record
 * stores these field names, the notification email prints these labels in this order, and the
 * CSV export has a column for every field of every form. A field added here appears everywhere at
 * once; a field removed here cannot linger in one of them.
 *
 * The template ships ONE form, `contact`, equivalent to the single contact form it always had.
 * Ask for what you will act on and nothing a regulator says you may not hold
 * (compliance.md §10): every field is personal data, kept for `site.leadRetentionDays`.
 *
 * Migrating a WordPress form? `npm run forms:import -- <export file>` reads a Fluent Forms,
 * Contact Form 7 or Gravity Forms export and writes the definition here, between markers.
 *
 * ⚠ THREE NAMES ARE TAKEN. `company` is the honeypot — a real field with that name throws away
 *   every enquiry that fills it in, with a 200 and a thank-you page. `form` and `page` are posted
 *   by the component itself. Name a real company field `companyName`. `npm run check:form` reads
 *   this file and refuses all three, a duplicate name, and a `showWhen` pointing at nothing.
 */
import { services } from './services';

export type FieldType = 'text' | 'email' | 'tel' | 'date' | 'textarea' | 'checkboxes' | 'radio' | 'select';

export interface FieldDef {
  /** The posted key, the lead record's key and the CSV column. Never `company`, `form` or `page`. */
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  autocomplete?: string;
  placeholder?: string;
  /** Choices for `checkboxes`, `radio` and `select`. A submitted value outside this list is refused. */
  options?: readonly string[];
  /** Span both columns of the form grid. Textareas and groups always do. */
  full?: boolean;
  /** Shown under the label, always — with or without JavaScript. */
  hint?: string;
  /** The "required" error, when "Please fill in <label>" reads badly. */
  ask?: string;
  /** Shortest accepted value, for the rare field where one character is not an answer. */
  minLength?: number;
  /**
   * Conditional logic: the field exists only while the named field has any of these values (for a
   * checkbox group: any of them ticked). While hidden it is never required and its value is
   * dropped — on the server too. Without JavaScript every field shows, with a note saying when it
   * applies, and the server ignores the ones that do not.
   */
  showWhen?: { field: string; anyOf: readonly string[] };
}

export interface FormDef {
  id: string;
  /** The page the form lives on — where the no-JavaScript path returns. */
  page: string;
  /** The element on that page the no-JavaScript path scrolls back to. */
  anchor: string;
  submitLabel: string;
  /** Shown in place after a successful submission. */
  success: string;
  /** The notification email's heading and subject line. */
  subject: string;
  /** A field whose answer is appended to the subject in brackets, e.g. which service. */
  subjectField?: string;
  /** Which fields make up the sender's display name in the email and the CSV. */
  nameFields: string[];
  fields: FieldDef[];
}

/**
 * The service dropdown. Built from `services.ts`, so a service added there is offered here — these
 * strings land in the lead record and the notification, and a value that matches no real service
 * makes the enquiry harder to route. The final catch-all is deliberate; keep one.
 */
export const SERVICE_OPTIONS: readonly string[] = [...services.map((s) => s.title), 'Something else'];

/** The form a submission without a `form` field belongs to. */
export const DEFAULT_FORM = 'contact';

export const forms: Record<string, FormDef> = {
  contact: {
    id: 'contact',
    page: '/contact/',
    anchor: '#quote',
    submitLabel: 'Send',
    success: 'Thank you — your message is in. We will come back to you shortly.',
    subject: 'New quote request',
    subjectField: 'service',
    nameFields: ['name'],
    fields: [
      { name: 'name', label: 'Your name', type: 'text', required: true, autocomplete: 'name', minLength: 2, ask: 'Please tell us your name.' },
      { name: 'phone', label: 'Phone', type: 'tel', required: true, autocomplete: 'tel', ask: 'A phone number lets us confirm your appointment.' },
      { name: 'email', label: 'Email', type: 'email', required: true, autocomplete: 'email', full: true, ask: 'We need an email to send your quote to.' },
      { name: 'service', label: 'What do you need?', type: 'select', options: SERVICE_OPTIONS, full: true },
      { name: 'message', label: 'Message', type: 'textarea' },
    ],
  },
  // forms:import — imported forms are inserted above this line. Keep it.
};

export const formById = (id: string): FormDef | undefined =>
  Object.prototype.hasOwnProperty.call(forms, id) ? forms[id] : undefined;
