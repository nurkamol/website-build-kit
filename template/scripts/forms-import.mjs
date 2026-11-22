/**
 * Turn a WordPress form plugin's export into a definition in src/data/forms.ts.
 *
 *   npm run forms:import -- <export file>                  write into src/data/forms.ts
 *   npm run forms:import -- <export file> --print          print the snippet, write nothing
 *   npm run forms:import -- <export file> --form 3         one form of several (its id or title)
 *   npm run forms:import -- <export file> --as quote       the key it gets in forms.ts
 *   npm run forms:import -- <export file> --page /quote/   the page it will live on (default /contact/)
 *
 * Reads, by shape rather than by file name:
 *
 *   Fluent Forms     Fluent Forms → Tools → Export Forms (.json)
 *   Gravity Forms    Forms → Import/Export → Export Forms (.json)
 *   Contact Form 7   Tools → Export → Contact Forms (.xml, WordPress WXR), or the form
 *                    template itself pasted into a .txt — with Conditional Fields for CF7
 *                    groups when the export carries them
 *
 * ── THE FAILURE THIS EXISTS FOR ────────────────────────────────────────────
 * Retyping a form by hand loses the parts nobody looks at: the option a rule
 * keys on is typed "Other " with a space, the rule that hid a question is
 * forgotten so it is now required of everybody, and a field that only showed
 * for one answer is silently missing from the rebuild. Each of those is a
 * working form that collects the wrong thing.
 *
 * ── CONDITIONAL LOGIC: CARRIED EXACTLY, OR REPORTED ────────────────────────
 * A definition understands one kind of rule — `showWhen: { field, anyOf }`,
 * "show this while that field has any of these answers". A plugin's rule is
 * converted only when the result is EXACTLY equivalent:
 *
 *   show when X is A [or is B]                      → anyOf [A, B]
 *   show when X is A and … (one value)              → anyOf [A]
 *   hide when X is not A [and is not B]             → anyOf [A, B]
 *   show when X contains A, X a choice field and A
 *     exactly one of its options (no other option
 *     contains it)                                  → anyOf [A]
 *
 * Anything else — several fields, "is not" that shows, ">" and the rest, a
 * value that is not one of the options — is NOT CARRIED: the field is kept,
 * always shown, and a note says what the rule was. A field that was required
 * only while shown becomes optional, because "required of everybody" is the
 * wrong half of the guess. Nothing is ever dropped without a line saying so.
 *
 * Notification recipients and the confirmation message are PRINTED as
 * suggestions. Recipients belong in business.ts and are never written by this.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { loadForms, RESERVED_NAMES, FORMS_FILE } from './lib/forms-source.mjs';

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

const MARKER = '// forms:import — imported forms are inserted above this line.';

function fail(message) {
  console.error(`${RED}✗${RESET} forms:import: ${message}`);
  process.exit(1);
}

/* ── Arguments ────────────────────────────────────────────────────────── */

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  if (i === -1) return undefined;
  const value = argv[i + 1];
  if (!value || value.startsWith('--')) fail(`${name} needs a value`);
  argv.splice(i, 2);
  return value;
};
const PRINT = argv.includes('--print');
if (PRINT) argv.splice(argv.indexOf('--print'), 1);
const pick = flag('--form');
const as = flag('--as');
const page = flag('--page') ?? '/contact/';
const file = argv.find((a) => !a.startsWith('--'));
const unknownFlag = argv.find((a) => a.startsWith('--'));

if (unknownFlag) fail(`unknown option ${unknownFlag}`);
if (!file) {
  fail(
    'usage: npm run forms:import -- <export file> [--form <id or title>] [--as <key>] [--page /path/] [--print]\n' +
      '  reads a Fluent Forms or Gravity Forms .json export, or a Contact Form 7 .xml export / template .txt',
  );
}
if (!existsSync(file)) fail(`no such file: ${file}`);
if (as && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(as)) fail(`--as "${as}" must be an identifier (letters, digits, _), e.g. quoteRequest`);
if (!/^\/([\w-]+\/)*$/.test(page)) fail(`--page "${page}" must be a site path with a trailing slash, e.g. /contact/`);

/* ── Small helpers ────────────────────────────────────────────────────── */

const o = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const arr = (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : []);
const str = (v) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : undefined);
const truthy = (v) => v === true || v === 1 || v === '1' || v === 'true' || v === 'yes';
const decode = (s) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#x27;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&amp;/g, '&');
const stripHtml = (s) => decode(String(s ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const emails = (s) => [...new Set(String(s ?? '').split(/[\s,;]+/).filter((x) => EMAIL.test(x)))];

/** A plugin's field name → a posted key: camelCase, letters and digits, CF7's `your-` dropped. */
const toName = (raw, fallback = 'field') => {
  const words = String(raw ?? '')
    .replace(/^your[-_]/i, '')
    .replace(/\[\]$/, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  if (!words.length) return fallback;
  const name = words.map((w, i) => (i === 0 ? w[0].toLowerCase() + w.slice(1) : w[0].toUpperCase() + w.slice(1))).join('');
  return /^[0-9]/.test(name) ? `field${name}` : name;
};

/* ── PHP unserialize — just enough for WXR post meta ──────────────────── */

/** Lengths in PHP serialisation are BYTES, so this walks a UTF-8 buffer, not a string. */
function phpUnserialize(text) {
  const buf = Buffer.from(text, 'utf8');
  let i = 0;
  const until = (ch) => {
    const end = buf.indexOf(ch, i);
    if (end === -1) throw new Error('truncated');
    const out = buf.subarray(i, end).toString('utf8');
    i = end + 1;
    return out;
  };
  const value = () => {
    const type = String.fromCharCode(buf[i]);
    i += 2; // "x:"
    if (type === 'N') return null;
    if (type === 'b') return until(';') === '1';
    if (type === 'i' || type === 'd') return Number(until(';'));
    if (type === 's') {
      const len = Number(until(':'));
      const out = buf.subarray(i + 1, i + 1 + len).toString('utf8');
      i += len + 3; // quote, bytes, quote, semicolon
      return out;
    }
    if (type === 'a') {
      const count = Number(until(':'));
      i += 1; // {
      const out = {};
      for (let n = 0; n < count; n++) {
        const key = value();
        out[key] = value();
      }
      i += 1; // }
      return out;
    }
    throw new Error(`unsupported type "${type}"`);
  };
  return value();
}

/* ── The shared model ─────────────────────────────────────────────────── */

/**
 * One imported form, before rules are resolved. Fields carry a private `ref`
 * (the plugin's id or name for it) and `values` (the plugin's option value →
 * the label a visitor sees, which is what the rebuilt form posts).
 */
const newForm = (plugin, sourceId, title) => ({
  plugin,
  sourceId: String(sourceId),
  title: title || '',
  fields: [],
  pending: [],
  carried: [],
  notCarried: [],
  notImported: [],
  changed: [],
  recipients: [],
  suggestions: [],
  submitLabel: undefined,
  success: undefined,
});

function addField(form, field) {
  const taken = new Set(form.fields.map((f) => f.name));
  let name = field.name;
  if (Object.hasOwn(RESERVED_NAMES, name)) {
    const renamed = name === 'company' ? 'companyName' : `${name}Field`;
    form.changed.push(
      `“${field.label}”: renamed ${name} → ${renamed} — ${name} is ${RESERVED_NAMES[name]}` +
        (name === 'company' ? ', and a real field with that name would discard every enquiry that fills it in' : ''),
    );
    name = renamed;
  }
  let n = 2;
  const base = name;
  while (taken.has(name)) name = `${base}${n++}`;
  if (name !== base) form.changed.push(`“${field.label}”: named ${name}, because ${base} was already used in this form`);
  const out = { ...field, name };
  if (!out.autocomplete) {
    const ac = { email: 'email', name: 'name', fullName: 'name', firstName: 'given-name', lastName: 'family-name', phone: 'tel' }[name];
    if (ac) out.autocomplete = ac;
    else if (out.type === 'email') out.autocomplete = 'email';
    else if (out.type === 'tel') out.autocomplete = 'tel';
  }
  form.fields.push(out);
  return out;
}

/** Options as labels, remembering the plugin's value for each so rules can be translated. */
function choices(list) {
  const values = new Map();
  const options = [];
  for (const c of list) {
    const label = stripHtml(c.label ?? c.value ?? '');
    if (!label) continue;
    options.push(label);
    values.set(String(c.value ?? label), label);
    values.set(label, label);
  }
  return { options: [...new Set(options)], values };
}

const IS = /^(=|==|===|is|equal|equals|is_equal_to|eq)$/i;
const IS_NOT = /^(!=|!==|<>|isnot|is not|is_not|not equals|not_equal|notequal|doNotEqual|neq)$/i;
const CONTAINS = /^(contains|like|includes)$/i;
const CHOICE = new Set(['checkboxes', 'radio', 'select']);
/* A one-box group's default error ("choose at least one consent") reads like a bug. */
const CONSENT_ASK = 'Please tick the box to continue.';

/**
 * A plugin's rule set → `showWhen`, or a note saying why not. `rules` name the
 * controlling field by the plugin's reference; `lookup` resolves that to an
 * imported field.
 */
function carry(form, field, rules, match, action, lookup) {
  if (!rules.length) return;
  const controllers = rules.map((r) => lookup(r.ref));
  const label = (c, r) => (c ? `“${c.label}”` : `field ${r.ref}`);
  const describe = rules.map((r, i) => `${label(controllers[i], r)} ${r.op} “${r.value}”`).join(match === 'all' ? ' and ' : ' or ');
  const notCarried = (why) => {
    const wasRequired = field.required;
    if (wasRequired) delete field.required;
    form.notCarried.push(
      `“${field.label}”: ${action} when ${describe} — ${why}. The field is always shown` +
        (wasRequired ? ', and is now OPTIONAL: it was required only while shown.' : '.'),
    );
  };

  if (controllers.some((c) => !c)) return notCarried('it depends on a field that was not imported');
  if (new Set(controllers).size > 1) return notCarried('it depends on more than one field; showWhen reads one');
  const controller = controllers[0];
  if (controller === field) return notCarried('it depends on itself');

  const values = [];
  const ops = [];
  for (const r of rules) {
    const raw = String(r.value ?? '');
    const value = controller.values?.get(raw) ?? controller.values?.get(raw.trim()) ?? raw.trim();
    let op = IS.test(r.op.trim()) ? 'is' : IS_NOT.test(r.op.trim()) ? 'not' : 'other';
    if (op === 'other' && CONTAINS.test(r.op.trim()) && CHOICE.has(controller.type)) {
      /* "contains A" is "is A" only when A is an option and no OTHER option contains it too. */
      const hits = controller.options.filter((x) => x.toLowerCase().includes(raw.trim().toLowerCase()));
      if (hits.length === 1 && hits[0] === value) op = 'is';
    }
    if (op === 'other') return notCarried(`the operator “${r.op}” has no exact equivalent`);
    if (CHOICE.has(controller.type) && !controller.options?.includes(value)) {
      return notCarried(`“${raw}” is not one of ${label(controller)}'s options`);
    }
    ops.push(op);
    values.push(value);
  }
  if (new Set(ops).size > 1) return notCarried('it mixes “is” and “is not”');
  const op = ops[0];
  const distinct = [...new Set(values)];
  const single = distinct.length === 1;

  if (action === 'show' && op === 'is') {
    if (match === 'any' || single) return accept(distinct);
    return notCarried('it needs several answers at once; showWhen matches any one');
  }
  if (action === 'hide' && op === 'not') {
    /* hide when ≠A and ≠B  ⇔  show when A or B */
    if (match === 'all' || single) return accept(distinct);
    return notCarried('“hide when not A or not B” has no exact equivalent');
  }
  return notCarried(
    action === 'show' ? 'it shows the field when an answer is NOT given, which showWhen cannot express' : 'it hides the field when an answer IS given, which showWhen cannot express',
  );

  function accept(anyOf) {
    field.showWhen = { field: controller.name, anyOf };
    form.carried.push(`“${field.label}” shows when “${controller.label}” is ${anyOf.map((v) => `“${v}”`).join(' or ')}`);
  }
}

function resolveRules(form, lookup) {
  for (const p of form.pending) carry(form, p.field, p.rules, p.match, p.action, lookup);
  form.pending = [];
}

/* ── Fluent Forms ─────────────────────────────────────────────────────── */

const FLUENT_TYPE = {
  input_text: 'text',
  input_email: 'email',
  phone: 'tel',
  input_phone: 'tel',
  input_date: 'date',
  textarea: 'textarea',
  select: 'select',
  input_radio: 'radio',
  input_checkbox: 'checkboxes',
  input_number: 'text',
  input_url: 'text',
};

function parseFluent(list) {
  return list.map((raw, index) => {
    const f = o(raw);
    let schema = f.form_fields;
    if (typeof schema === 'string') {
      try {
        schema = JSON.parse(schema);
      } catch {
        fail(`Fluent Forms form ${str(f.id) ?? index + 1}: form_fields is not valid JSON`);
      }
    }
    if (!Array.isArray(o(schema).fields)) fail(`Fluent Forms form ${str(f.id) ?? index + 1}: form_fields has no fields list`);
    const form = newForm('Fluent Forms', str(f.id) ?? index + 1, stripHtml(str(f.title) ?? ''));
    const byRef = new Map();

    const visit = (x, inColumns) => {
      const el = str(x.element) ?? '';
      const s = o(x.settings);
      const a = o(x.attributes);
      if (el === 'container') {
        const cols = arr(x.columns);
        for (const c of cols) for (const child of arr(o(c).fields)) visit(o(child), cols.length > 1);
        return;
      }
      if (el === 'input_name') {
        for (const [key, sub] of Object.entries(o(x.fields))) {
          const ss = o(o(sub).settings);
          if (ss.visible === false) continue;
          const label = stripHtml(str(ss.label) ?? key);
          const added = addFluent({ ...o(sub), element: 'input_text' }, toName(key), label, true);
          if (added) byRef.set(`${str(a.name) ?? 'names'}[${key}]`, added);
        }
        return;
      }
      if (el === 'custom_submit_button') {
        form.submitLabel = str(o(s.button_ui).text) ?? form.submitLabel;
        return;
      }
      if (['recaptcha', 'hcaptcha', 'turnstile'].includes(el)) {
        form.changed.push(`${el}: not imported — the rebuilt form has a honeypot, and Turnstile when PUBLIC_TURNSTILE_SITE_KEY is set`);
        return;
      }
      if (['custom_html', 'section_break', 'shortcode', 'form_step'].includes(el)) {
        const text = stripHtml(str(s.html_codes) ?? str(s.label) ?? str(s.description) ?? '');
        form.notImported.push(`${el}${text ? ` (“${text.slice(0, 60)}${text.length > 60 ? '…' : ''}”)` : ''}: page content, not a field — write it into the page by hand`);
        return;
      }
      if (el === 'gdpr_agreement' || el === 'terms_and_condition') {
        const text = stripHtml(str(s.tnc_html) ?? str(s.label) ?? 'I agree');
        const added = addField(form, {
          name: toName(str(a.name) ?? el),
          label: stripHtml(str(s.admin_field_label) ?? '') || (el === 'gdpr_agreement' ? 'Consent' : 'Terms and conditions'),
          type: 'checkboxes',
          options: [text],
          required: true,
          ask: CONSENT_ASK,
        });
        form.changed.push(`“${added.label}”: a consent box, imported as a one-choice checkbox group (required). Its link to the terms is not carried — add it to the hint`);
        byRef.set(str(a.name) ?? el, added);
        rulesOf(x, added);
        return;
      }
      const type = FLUENT_TYPE[el];
      if (!type) {
        form.notImported.push(`“${stripHtml(str(s.label) ?? str(a.name) ?? el)}” (${el}): no equivalent field type — rebuild it by hand or leave it out`);
        return;
      }
      const label = stripHtml(str(s.label) ?? '') || stripHtml(str(a.placeholder) ?? '') || str(a.name) || el;
      const added = addFluent(x, toName(str(a.name) ?? label), label, inColumns);
      if (added) {
        byRef.set(str(a.name) ?? added.name, added);
        if (el === 'input_number' || el === 'input_url') form.changed.push(`“${label}”: ${el} imported as text — the answer is kept, its format is not checked`);
      }
    };

    const addFluent = (x, name, label, inColumns) => {
      const el = str(x.element) ?? '';
      const s = o(x.settings);
      const a = o(x.attributes);
      let type = FLUENT_TYPE[el];
      const required = o(o(s.validation_rules).required);
      const def = { name, label, type, full: !inColumns || undefined };
      if (truthy(required.value)) {
        def.required = true;
        const message = stripHtml(str(required.message) ?? '');
        if (message && !/^this field is required\.?$/i.test(message)) def.ask = message;
      }
      const placeholder = str(a.placeholder) ?? (type === 'select' ? str(s.placeholder) : undefined);
      if (placeholder) def.placeholder = stripHtml(placeholder);
      const hint = stripHtml(str(s.help_message) ?? '');
      if (hint) def.hint = hint;
      if (CHOICE.has(type)) {
        const source = Array.isArray(s.advanced_options)
          ? s.advanced_options.map((c) => ({ label: str(o(c).label), value: str(o(c).value) }))
          : Object.entries(o(x.options)).map(([value, l]) => ({ value, label: str(l) }));
        const { options, values } = choices(source);
        if (!options.length) {
          form.notImported.push(`“${label}” (${el}): no options in the export — rebuild it by hand`);
          return null;
        }
        if (type === 'select' && truthy(a.multiple)) {
          type = def.type = 'checkboxes';
          form.changed.push(`“${label}”: a multi-select, imported as a checkbox group`);
        }
        def.options = options;
        def.values = values;
      }
      if (type === 'textarea' || type === 'checkboxes' || type === 'radio') delete def.full;
      const added = addField(form, def);
      rulesOf(x, added);
      return added;
    };

    const rulesOf = (x, added) => {
      const logic = o(o(x.settings).conditional_logics);
      if (!truthy(logic.status)) return;
      const rules = arr(logic.conditions)
        .map(o)
        .filter((c) => str(c.field))
        .map((c) => ({ ref: str(c.field), op: str(c.operator) ?? '=', value: str(c.value) ?? '' }));
      if (rules.length) form.pending.push({ field: added, rules, match: str(logic.type) === 'all' ? 'all' : 'any', action: 'show' });
    };

    for (const x of schema.fields) visit(o(x), false);
    form.submitLabel ??= str(o(o(o(schema.submitButton).settings).button_ui).text) ?? str(o(o(schema.submitButton).settings).btn_text);
    resolveRules(form, (ref) => byRef.get(ref));

    for (const meta of arr(f.metas).map(o)) {
      const key = str(meta.meta_key);
      let value = meta.value;
      if (typeof value === 'string') {
        try {
          value = JSON.parse(value);
        } catch {
          /* a plain string meta — not one this reads */
        }
      }
      if (key === 'formSettings') {
        const c = o(o(value).confirmation);
        if (str(c.messageToShow)) form.success = stripHtml(c.messageToShow);
        if (str(c.redirectTo) && c.redirectTo !== 'samePage') {
          form.suggestions.push(`the form redirected to ${str(c.customUrl) || str(c.customPage) || c.redirectTo} after submission — the rebuilt form shows its success message in place`);
        }
      }
      if (key === 'notifications') {
        const n = o(value);
        if (n.enabled === false) continue;
        const to = o(n.sendTo);
        if (str(to.type) === 'field') form.suggestions.push(`a notification went to the address typed into “${str(to.field)}” — the rebuilt form notifies business.email.notify only`);
        else if (str(to.type) === 'routing') form.suggestions.push('a notification used conditional routing — the rebuilt form notifies one address');
        form.recipients.push(...emails(str(to.email)));
        if (/\{wp\.admin_email\}|\{admin_email\}/.test(str(to.email) ?? '')) form.suggestions.push("a notification went to the WordPress admin email — find out whose inbox that was");
      }
    }
    return form;
  });
}

/* ── Gravity Forms ────────────────────────────────────────────────────── */

const GRAVITY_TYPE = {
  text: 'text',
  email: 'email',
  phone: 'tel',
  date: 'date',
  textarea: 'textarea',
  select: 'select',
  radio: 'radio',
  checkbox: 'checkboxes',
  multiselect: 'checkboxes',
  number: 'text',
  website: 'text',
};

function parseGravity(list) {
  return list.map((raw, index) => {
    const f = o(raw);
    if (!Array.isArray(f.fields)) fail(`Gravity Forms form ${str(f.id) ?? index + 1}: no fields list`);
    const form = newForm('Gravity Forms', str(f.id) ?? index + 1, stripHtml(str(f.title) ?? ''));
    const byRef = new Map();

    for (const x of f.fields.map(o)) {
      const t = str(x.inputType) && str(x.type) === 'post_custom_field' ? str(x.inputType) : (str(x.type) ?? '');
      const label = stripHtml(str(x.label) ?? '') || `Field ${str(x.id)}`;
      const id = str(x.id) ?? '';
      const half = Number(x.layoutGridColumnSpan) > 0 && Number(x.layoutGridColumnSpan) < 12;
      const common = () => {
        const def = { label, full: !half || undefined };
        if (truthy(x.isRequired)) {
          def.required = true;
          const message = stripHtml(str(x.errorMessage) ?? '');
          if (message) def.ask = message;
        }
        if (str(x.placeholder)) def.placeholder = stripHtml(x.placeholder);
        if (stripHtml(str(x.description) ?? '')) def.hint = stripHtml(x.description);
        return def;
      };
      const logic = o(x.conditionalLogic);
      const pend = (added) => {
        const rules = arr(logic.rules)
          .map(o)
          .map((r) => ({ ref: str(r.fieldId) ?? '', op: str(r.operator) ?? 'is', value: str(r.value) ?? '' }));
        if (rules.length) form.pending.push({ field: added, rules, match: str(logic.logicType) === 'all' ? 'all' : 'any', action: str(logic.actionType) === 'hide' ? 'hide' : 'show' });
      };

      if (t === 'name' && Array.isArray(x.inputs)) {
        for (const sub of x.inputs.map(o)) {
          if (truthy(sub.isHidden)) continue;
          const l = stripHtml(str(sub.customLabel) ?? str(sub.label) ?? '');
          const n = /first/i.test(l) ? 'firstName' : /last/i.test(l) ? 'lastName' : /prefix/i.test(l) ? 'namePrefix' : /suffix/i.test(l) ? 'nameSuffix' : toName(l);
          const added = addField(form, { ...common(), name: n, label: l || n, type: 'text', full: undefined, ...(n === 'namePrefix' || n === 'nameSuffix' ? { required: undefined } : {}) });
          byRef.set(str(sub.id) ?? '', added);
          pend(added);
        }
        continue;
      }
      if (t === 'consent') {
        const def = { ...common(), name: toName(str(x.adminLabel) || label), type: 'checkboxes', options: [stripHtml(str(x.checkboxLabel) ?? 'I agree')], full: undefined };
        if (def.required) def.ask ??= CONSENT_ASK;
        const added = addField(form, def);
        form.changed.push(`“${label}”: a consent box, imported as a one-choice checkbox group`);
        byRef.set(id, added);
        pend(added);
        continue;
      }
      if (t === 'page' || t === 'section' || t === 'html') {
        form.notImported.push(`${t} (“${label}”): page structure, not a field — ${t === 'page' ? 'the rebuilt form is one step' : 'write it into the page by hand'}`);
        continue;
      }
      if (t === 'captcha') {
        form.changed.push('captcha: not imported — the rebuilt form has a honeypot, and Turnstile when PUBLIC_TURNSTILE_SITE_KEY is set');
        continue;
      }
      const type = GRAVITY_TYPE[t];
      if (!type) {
        form.notImported.push(`“${label}” (${t || 'unknown type'}): no equivalent field type — rebuild it by hand or leave it out`);
        continue;
      }
      const name = toName(str(x.adminLabel) || str(x.inputName) || (t === 'email' ? 'email' : t === 'phone' ? 'phone' : label), `field${id}`);
      const def = { ...common(), name, type };
      if (CHOICE.has(type)) {
        const { options, values } = choices(arr(x.choices).map((c) => ({ label: str(o(c).text), value: str(o(c).value) })));
        if (!options.length) {
          form.notImported.push(`“${label}” (${t}): no choices in the export — rebuild it by hand`);
          continue;
        }
        def.options = options;
        def.values = values;
        if (t === 'multiselect') form.changed.push(`“${label}”: a multi-select, imported as a checkbox group`);
        if (truthy(x.enableOtherChoice)) form.changed.push(`“${label}”: its free-text “Other” choice is not carried`);
      }
      if (type === 'textarea' || type === 'checkboxes' || type === 'radio') delete def.full;
      if (t === 'number' || t === 'website') form.changed.push(`“${label}”: ${t} imported as text — the answer is kept, its format is not checked`);
      const added = addField(form, def);
      byRef.set(id, added);
      pend(added);
    }
    form.submitLabel = str(o(f.button).text);
    resolveRules(form, (ref) => byRef.get(ref) ?? byRef.get(ref.split('.')[0]));

    const confirmations = arr(f.confirmations).map(o);
    const confirmation = confirmations.find((c) => truthy(c.isDefault)) ?? confirmations[0];
    if (confirmation) {
      if (str(confirmation.type) && confirmation.type !== 'message') {
        form.suggestions.push(`the confirmation was a ${confirmation.type} (${str(confirmation.url) || str(confirmation.pageId) || 'elsewhere'}) — the rebuilt form shows its success message in place`);
      } else if (str(confirmation.message)) {
        form.success = stripHtml(confirmation.message);
        if (/\{[^}]+\}/.test(form.success)) form.suggestions.push('the confirmation message uses merge tags ({…}) — rewrite it as plain text');
      }
    }
    for (const n of arr(f.notifications).map(o)) {
      if (n.isActive === false || n.isActive === '0') continue;
      if (str(n.toType) === 'field') form.suggestions.push('a notification went to an address the visitor typed — the rebuilt form notifies business.email.notify only');
      if (str(n.toType) === 'routing') form.suggestions.push('a notification used conditional routing — the rebuilt form notifies one address');
      form.recipients.push(...emails(str(n.to)));
      if (/\{admin_email\}/.test(str(n.to) ?? '')) form.suggestions.push('a notification went to {admin_email} — find out whose inbox that was');
    }
    return form;
  });
}

/* ── Contact Form 7 ───────────────────────────────────────────────────── */

const CF7_TYPE = {
  text: 'text',
  email: 'email',
  tel: 'tel',
  date: 'date',
  textarea: 'textarea',
  select: 'select',
  checkbox: 'checkboxes',
  radio: 'radio',
  acceptance: 'checkboxes',
  number: 'text',
  url: 'text',
};

/** `[type* name opt opt "A" "B"]` → tokens, respecting quotes. */
const tokens = (rest) => [...String(rest ?? '').matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => (m[3] !== undefined ? { bare: m[3] } : { quoted: m[1] ?? m[2] }));

/** CF7 Conditional Fields: { group: [ [rule, rule…], … ] } — entries are OR, rules inside one are AND. */
function cf7ConditionsFromText(text) {
  const out = {};
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const show = /^\s*show\s+\[([\w-]+)\]\s+if\s+\[([\w-]+)\]\s+(.+?)\s+"([^"]*)"\s*$/i.exec(line);
    const and = /^\s*and\s+if\s+\[([\w-]+)\]\s+(.+?)\s+"([^"]*)"\s*$/i.exec(line);
    if (show) {
      current = [{ ref: show[2], op: show[3], value: show[4] }];
      (out[show[1]] ??= []).push(current);
    } else if (and && current) {
      current.push({ ref: and[1], op: and[2], value: and[3] });
    }
  }
  return out;
}

function cf7ConditionsFromMeta(serialised) {
  const out = {};
  let data;
  try {
    data = phpUnserialize(serialised);
  } catch (error) {
    fail(`Contact Form 7: the Conditional Fields settings could not be read (${error.message})`);
  }
  for (const entry of arr(data).map(o)) {
    const group = str(entry.then_field);
    if (!group) continue;
    const rules = entry.and_rules
      ? arr(entry.and_rules).map(o).map((r) => ({ ref: str(r.if_field) ?? '', op: str(r.operator) ?? 'equals', value: str(r.if_value) ?? '' }))
      : [{ ref: str(entry.if_field) ?? '', op: str(entry.operator) ?? 'equals', value: str(entry.if_value) ?? '' }];
    (out[group] ??= []).push(rules);
  }
  return out;
}

function parseCf7Template(template, { id, title, conditions = {}, mail, messages }) {
  const form = newForm('Contact Form 7', id, title);
  const byRef = new Map();
  const groupOf = new Map(); // field → stack of enclosing groups
  const stack = [];
  const TAG = /\[(\/?)([a-z_]+)(\*?)(?:\s+([^\]]*))?\]/gi;
  const textConditions = cf7ConditionsFromText(template);
  for (const [g, entries] of Object.entries(textConditions)) (conditions[g] ??= []).push(...entries);
  const body = template.replace(/^\s*(show\s+\[[\w-]+\]\s+if|and\s+if)\s.*$/gim, '');
  let last = 0;

  for (let m = TAG.exec(body); m; m = TAG.exec(body)) {
    const [whole, closing, rawType, star, rest] = m;
    const type = rawType.toLowerCase();
    const before = stripHtml(body.slice(last, m.index).split(/<\/label>|<br\s*\/?>|<\/p>|\n\s*\n/i).pop() ?? '');
    last = m.index + whole.length;
    if (type === 'group') {
      if (closing) stack.pop();
      else stack.push(tokens(rest).find((t) => t.bare)?.bare ?? '');
      continue;
    }
    if (closing) continue;
    const toks = tokens(rest);
    if (type === 'submit') {
      form.submitLabel = toks.find((t) => t.quoted !== undefined)?.quoted;
      continue;
    }
    const rawName = toks[0]?.bare;
    if (['recaptcha', 'quiz', 'hidden', 'response', 'multistep', 'step'].includes(type)) {
      if (type === 'quiz' || type === 'recaptcha') form.changed.push(`[${type}]: not imported — the rebuilt form has a honeypot, and Turnstile when PUBLIC_TURNSTILE_SITE_KEY is set`);
      else if (type === 'multistep' || type === 'step') form.notImported.push(`[${type}]: the rebuilt form is one step`);
      else if (type === 'hidden') form.notImported.push(`[hidden ${rawName ?? ''}]: a hidden value — add it to the page as a hidden input if something downstream needs it`);
      continue;
    }
    const kind = CF7_TYPE[type];
    if (!kind || !rawName) {
      if (rawName || kind) form.notImported.push(`[${type}${star} ${rawName ?? ''}]: no equivalent field type — rebuild it by hand or leave it out`);
      continue;
    }
    const opts = toks.slice(1).filter((t) => t.bare).map((t) => t.bare);
    let quoted = toks.filter((t) => t.quoted !== undefined).map((t) => t.quoted);
    const def = { name: toName(rawName), label: before || rawName.replace(/^your-/, '').replace(/-/g, ' '), type: kind, full: true };
    if (star || (type === 'acceptance' && !opts.includes('optional'))) def.required = true;

    if (type === 'acceptance') {
      const text = stripHtml(new RegExp(`\\[acceptance[^\\]]*\\b${rawName}\\b[^\\]]*\\]([\\s\\S]*?)\\[/acceptance\\]`, 'i').exec(body)?.[1] ?? '') || 'I agree';
      def.options = [text];
      def.label = before || 'Consent';
      if (def.required) def.ask = CONSENT_ASK;
      delete def.full;
      form.changed.push(`“${def.label}”: an acceptance box, imported as a one-choice checkbox group${def.required ? ' (required)' : ''}`);
    } else if (CHOICE.has(kind)) {
      if (opts.includes('first_as_label') && quoted.length) {
        def.placeholder = quoted[0];
        quoted = quoted.slice(1);
      }
      if (quoted.some((q) => q.includes('|'))) form.changed.push(`“${def.label}”: CF7 pipes (“label|value”) — the visible label is kept, the mail-only value is not`);
      const { options, values } = choices(quoted.map((q) => ({ label: q.split('|')[0], value: q.split('|')[0] })));
      if (!options.length) {
        form.notImported.push(`[${type} ${rawName}]: no options in the template — rebuild it by hand`);
        continue;
      }
      def.options = options;
      def.values = values;
      if (type === 'select' && opts.includes('multiple')) {
        def.type = 'checkboxes';
        form.changed.push(`“${def.label}”: a multi-select, imported as a checkbox group`);
      }
      if (type === 'checkbox' && opts.includes('exclusive')) {
        def.type = 'radio';
        form.changed.push(`“${def.label}”: an exclusive checkbox group, imported as radio buttons`);
      }
      if (opts.includes('free_text')) form.changed.push(`“${def.label}”: its free-text last option is not carried`);
      if (def.type !== 'select') delete def.full;
    } else {
      /* A quoted value is a placeholder only with the flag; without it, it is a default answer, which is not carried. */
      if (opts.some((x) => /^(placeholder|watermark)$/.test(x)) && quoted[0]) def.placeholder = quoted[0];
      else if (quoted[0]) form.changed.push(`“${def.label}”: its default value “${quoted[0]}” is not carried`);
      if (type === 'textarea') delete def.full;
      if (type === 'number' || type === 'url') form.changed.push(`“${def.label}”: [${type}] imported as text — the answer is kept, its format is not checked`);
    }
    const added = addField(form, def);
    byRef.set(rawName, added);
    groupOf.set(added, [...stack]);
  }

  /* Conditional groups: a field takes its group's rule. Nested conditional groups would need both. */
  for (const [field, groups] of groupOf) {
    const ruled = groups.filter((g) => conditions[g]?.length);
    const unruled = groups.filter((g) => !conditions[g]?.length);
    if (unruled.length && !ruled.length) {
      form.notCarried.push(`“${field.label}”: inside [group ${unruled[0]}], which no condition in the export shows (Conditional Fields keeps such a group hidden). The field is always shown.`);
      continue;
    }
    if (!ruled.length) continue;
    if (ruled.length > 1) {
      const wasRequired = field.required;
      if (wasRequired) delete field.required;
      form.notCarried.push(`“${field.label}”: inside nested conditional groups (${ruled.join(' → ')}) — showWhen reads one rule. The field is always shown${wasRequired ? ', and is now OPTIONAL: it was required only while shown' : ''}.`);
      continue;
    }
    const entries = conditions[ruled[0]];
    let rules;
    let match;
    if (entries.every((e) => e.length === 1)) [rules, match] = [entries.flat(), 'any'];
    else if (entries.length === 1) [rules, match] = [entries[0], 'all'];
    else {
      const wasRequired = field.required;
      if (wasRequired) delete field.required;
      form.notCarried.push(`“${field.label}”: [group ${ruled[0]}] has several conditions with several rules each — no exact equivalent. The field is always shown${wasRequired ? ', and is now OPTIONAL' : ''}.`);
      continue;
    }
    form.pending.push({ field, rules: rules.map((r) => ({ ...r, op: cf7Op(r.op) })), match, action: 'show' });
  }
  resolveRules(form, (ref) => byRef.get(ref));

  if (mail) {
    const recipient = str(o(mail).recipient) ?? '';
    form.recipients.push(...emails(recipient));
    if (/\[_site_admin_email\]/.test(recipient)) form.suggestions.push('mail went to [_site_admin_email] — find out whose inbox that was');
    if (/\[[\w-]+\]/.test(recipient.replace(/\[_site_admin_email\]/g, ''))) form.suggestions.push('mail went to an address taken from a field — the rebuilt form notifies business.email.notify only');
  }
  const ok = str(o(messages).mail_sent_ok);
  if (ok) form.success = stripHtml(ok);
  return form;
}

/** CF7 Conditional Fields operator words → the shared vocabulary. */
const cf7Op = (op) => ({ equals: '=', 'not equals': '!=' })[String(op).trim().toLowerCase()] ?? op;

function parseCf7Wxr(xml) {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map((m) => m[1])
    .filter((i) => /<wp:post_type>(?:<!\[CDATA\[)?wpcf7_contact_form/.test(i));
  if (!items.length) fail('Contact Form 7: the export holds no wpcf7_contact_form items');
  const cdata = (s) => s.replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '');
  const meta = (item, key) => {
    const re = new RegExp(`<wp:meta_key>(?:<!\\[CDATA\\[)?${key}(?:\\]\\]>)?</wp:meta_key>\\s*<wp:meta_value>([\\s\\S]*?)</wp:meta_value>`);
    const m = re.exec(item);
    return m ? cdata(m[1]) : undefined;
  };
  const unserial = (item, key) => {
    const raw = meta(item, key);
    if (!raw) return undefined;
    try {
      return phpUnserialize(raw);
    } catch (error) {
      fail(`Contact Form 7: post meta ${key} could not be read (${error.message})`);
    }
  };
  return items.map((item) => {
    const id = /<wp:post_id>(\d+)<\/wp:post_id>/.exec(item)?.[1] ?? '0';
    const title = stripHtml(cdata(/<title>([\s\S]*?)<\/title>/.exec(item)?.[1] ?? ''));
    const template = meta(item, '_form');
    if (template === undefined) fail(`Contact Form 7 form ${id}: no _form meta — the template is missing from the export`);
    const cfRaw = meta(item, '_wpcf7cf_options') ?? meta(item, 'wpcf7cf_options');
    return parseCf7Template(template, {
      id,
      title,
      conditions: cfRaw ? cf7ConditionsFromMeta(cfRaw) : {},
      mail: unserial(item, '_mail'),
      messages: unserial(item, '_messages'),
    });
  });
}

/* ── Which plugin is this? ────────────────────────────────────────────── */

const text = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
const trimmed = text.trim();
let parsed;

if (/^[[{]/.test(trimmed) || extname(file).toLowerCase() === '.json') {
  let data;
  try {
    data = JSON.parse(trimmed);
  } catch (error) {
    fail(`${file} is not valid JSON (${error.message}) — export it again rather than editing it`);
  }
  const list = Array.isArray(data)
    ? data
    : o(data).form_fields !== undefined || Array.isArray(o(data).fields)
      ? [data]
      : Object.entries(o(data))
          .filter(([k]) => /^\d+$/.test(k))
          .map(([, v]) => v);
  const forms = list.map(o);
  if (forms.length && forms.every((f) => f.form_fields !== undefined)) parsed = { plugin: 'Fluent Forms', forms: parseFluent(forms) };
  else if (forms.length && forms.every((f) => Array.isArray(f.fields))) parsed = { plugin: 'Gravity Forms', forms: parseGravity(forms) };
  else fail(`${file} is JSON, but not a Fluent Forms or Gravity Forms export (no form_fields, no fields list)`);
} else if (/wpcf7_contact_form/.test(text)) {
  parsed = { plugin: 'Contact Form 7', forms: parseCf7Wxr(text) };
} else if (/\[(text|email|tel|textarea|select|checkbox|radio|acceptance|date|number|url)\*?\s+[\w-]+/i.test(text)) {
  parsed = { plugin: 'Contact Form 7', forms: [parseCf7Template(text, { id: 'template', title: '' })] };
} else {
  fail(`${file} is not an export this reads — Fluent Forms or Gravity Forms .json, or Contact Form 7 .xml / template text`);
}

/* ── Choose, name, render ─────────────────────────────────────────────── */

let chosen = parsed.forms;
if (pick) {
  chosen = parsed.forms.filter((f) => f.sourceId === pick || f.title.toLowerCase() === pick.toLowerCase());
  if (!chosen.length) {
    fail(`no form "${pick}" in ${file}. It holds:\n${parsed.forms.map((f) => `    ${f.sourceId}  ${f.title}`).join('\n')}`);
  }
}
if (as && chosen.length > 1) fail(`--as names one form, and ${file} holds ${chosen.length} — choose one with --form`);

const keyFor = (form) => {
  if (as) return as;
  const k = toName(form.title || basename(file, extname(file)), `form${form.sourceId}`);
  return k === 'form' ? `form${form.sourceId}` : k;
};

const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ')}'`;
const FIELD_KEYS = ['name', 'label', 'type', 'required', 'autocomplete', 'placeholder', 'options', 'full', 'hint', 'ask', 'showWhen'];
const renderValue = (v) =>
  Array.isArray(v) ? `[${v.map(renderValue).join(', ')}]` : typeof v === 'object' ? `{ ${Object.entries(v).map(([k, x]) => `${k}: ${renderValue(x)}`).join(', ')} }` : typeof v === 'string' ? q(v) : String(v);

function render(form, key) {
  const anchor = page === '/contact/' ? '#quote' : '#form';
  const nameFields = form.fields.some((f) => f.name === 'name')
    ? ['name']
    : ['firstName', 'lastName'].filter((n) => form.fields.some((f) => f.name === n)).length
      ? ['firstName', 'lastName'].filter((n) => form.fields.some((f) => f.name === n))
      : form.fields.filter((f) => f.type === 'text' && /name/i.test(f.label)).slice(0, 1).map((f) => f.name);
  const lines = [
    `  // <forms:import key="${key}"> ${form.plugin} #${form.sourceId}${form.title ? ` “${form.title.replace(/\s+/g, ' ')}”` : ''}, from ${basename(file)}. Rerun to replace.`,
    `  ${key}: {`,
    `    id: ${q(key)},`,
    `    page: ${q(page)},`,
    `    anchor: ${q(anchor)},`,
    `    submitLabel: ${q(form.submitLabel?.trim() || 'Send')},`,
    `    success: ${q(form.success || 'Thank you — we will be in touch shortly.')},`,
    `    subject: ${q(`New submission: ${form.title || key}`)},`,
    `    nameFields: ${renderValue(nameFields)},`,
    '    fields: [',
    ...form.fields.map((f) => {
      const parts = FIELD_KEYS.filter((k) => f[k] !== undefined && f[k] !== false).map((k) => `${k}: ${renderValue(f[k])}`);
      return `      { ${parts.join(', ')} },`;
    }),
    '    ],',
    ...form.notCarried.map((n) => `    // not carried: ${n.replace(/\r?\n/g, ' ')}`),
    ...form.notImported.map((n) => `    // not imported: ${n.replace(/\r?\n/g, ' ')}`),
    '  },',
    `  // </forms:import key="${key}">`,
  ];
  return lines.join('\n');
}

/* ── Report ───────────────────────────────────────────────────────────── */

console.log(`\n${BOLD}── forms:import — ${parsed.plugin}, ${basename(file)} ──────────────${RESET}`);
const rendered = [];
let empty = 0;

for (const form of chosen) {
  const key = keyFor(form);
  console.log(`\n${BOLD}${form.plugin} #${form.sourceId}${form.title ? ` “${form.title}”` : ''}${RESET} → forms.${key} ${DIM}(${form.fields.length} field(s))${RESET}`);
  for (const c of form.carried) console.log(`  ${GREEN}✓${RESET} carried: ${c}`);
  for (const n of form.notCarried) console.log(`  ${YELLOW}✗${RESET} not carried: ${n}`);
  for (const n of form.notImported) console.log(`  ${YELLOW}✗${RESET} NOT IMPORTED: ${n}`);
  for (const n of form.changed) console.log(`  ${DIM}~${RESET} changed: ${n}`);
  const recipients = [...new Set(form.recipients)];
  if (recipients.length || form.success || form.suggestions.length) {
    console.log(`  ${DIM}Suggestions — printed only, written nowhere:${RESET}`);
    if (recipients.length) {
      console.log(`    notification recipient(s): ${recipients.join(', ')}`);
      console.log(`    ${DIM}→ business.email.notify in src/data/business.ts, if the owner confirms they still want them${RESET}`);
    }
    if (form.success) console.log(`    confirmation message (used as \`success\`): “${form.success}”`);
    for (const s of form.suggestions) console.log(`    ${s}`);
  }
  if (!form.fields.length) {
    empty++;
    console.error(`  ${RED}✗${RESET} no field of this form could be imported — nothing to write`);
    continue;
  }
  rendered.push({ key, snippet: render(form, key) });
}

if (empty && !rendered.length) process.exit(1);

if (PRINT) {
  console.log(`\n${DIM}── paste inside \`forms\` in ${FORMS_FILE} ──${RESET}\n`);
  console.log(rendered.map((r) => r.snippet).join('\n'));
  console.log(`\n${DIM}Nothing written (--print).${RESET}`);
  process.exit(empty ? 1 : 0);
}

/* ── Write into src/data/forms.ts ─────────────────────────────────────── */

if (!existsSync(FORMS_FILE)) fail(`no ${FORMS_FILE} here — run from the project root, or use --print`);
const original = readFileSync(FORMS_FILE, 'utf8');
let next = original;
const existing = await loadForms();
const handWritten = new Set((existing.forms ?? []).map((f) => f.key));

for (const { key, snippet } of rendered) {
  const block = new RegExp(`^[ \\t]*// <forms:import key="${key}">[\\s\\S]*?// </forms:import key="${key}">[^\\n]*\\n`, 'm');
  if (block.test(next)) {
    next = next.replace(block, () => `${snippet}\n`);
    console.log(`${GREEN}✓${RESET} replaced forms.${key} in ${FORMS_FILE}`);
    continue;
  }
  if (handWritten.has(key) || new RegExp(`^\\s*['"]?${key}['"]?\\s*:\\s*\\{`, 'm').test(next)) {
    fail(
      `forms.${key} already exists in ${FORMS_FILE} and was not written by this command, so it is not replaced.\n` +
        `  Choose another key with --as, or delete forms.${key} first if the import is meant to replace it.`,
    );
  }
  const at = next.indexOf(MARKER);
  if (at === -1) fail(`${FORMS_FILE} has no marker line — add "  ${MARKER} Keep it." inside \`forms\`, or use --print`);
  const lineStart = next.lastIndexOf('\n', at) + 1;
  next = `${next.slice(0, lineStart)}${snippet}\n${next.slice(lineStart)}`;
  console.log(`${GREEN}✓${RESET} added forms.${key} to ${FORMS_FILE}`);
}

writeFileSync(FORMS_FILE, next);

/* Prove the write parses and holds what it claims. A snippet that broke the
   file would fail the next build with an error about a line nobody wrote. */
const check = await loadForms();
const missing = rendered.filter((r) => !(check.forms ?? []).some((f) => f.key === r.key));
if (check.error || missing.length) {
  writeFileSync(FORMS_FILE, original);
  fail(`the result did not read back (${check.error ?? `missing ${missing.map((m) => m.key).join(', ')}`}) — ${FORMS_FILE} restored, nothing changed`);
}

console.log(`\n${DIM}Next:${RESET}`);
for (const { key } of rendered) {
  const anchor = page === '/contact/' ? 'quote' : 'form';
  console.log(`  render it on ${page}:  <div id="${anchor}"><LeadForm form={forms.${key}} invalidFields={invalidFieldsFor(Astro.url, forms.${key})} /></div>`);
}
console.log(`  then: npm run check:form   ${DIM}(names, reserved words, conditions)${RESET}`);
process.exit(empty ? 1 : 0);
